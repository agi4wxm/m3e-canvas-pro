import { LlmHttpError, postSse, streamError, trimSlash, withRetry } from "./http";
import { sseJson } from "./sse";
import { emptyUsage, parseArgs, splitDataUrl, userParts, type Adapter, type AdapterOptions, type AssistantMessage, type AssistantPart, type LlmEvent, type LlmRequest, type Message, type StopReason, type Usage, type UserPart } from "./types";

/* Anthropic's Messages API, streamed, straight from the browser (the header that allows it is the
 * one the one-shot calls in lib/ai.ts already send).
 *
 * Thinking blocks are signed, and the API wants them back unchanged, in their place, on every later
 * request of the same conversation; editing an earlier turn invalidates them. So every block of an
 * answer is kept as it came (`native`) and replayed as it came, and the conversation is only ever
 * appended to. Text written between tool calls arrives as short thinking blocks too, which is why
 * thinking is asked for as a summary: the author sees what the model is doing while it works. */

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AnthropicOptions = AdapterOptions & {
  /** a long draft needs room: thinking counts against this cap too */
  maxTokens?: number;
  /** left out to take the model's own default */
  effort?: AnthropicEffort;
  /** "adaptive" lets the model decide how long to think (the newest models accept nothing else);
   *  "omit" sends no thinking setting, for models that predate it */
  thinking?: "adaptive" | "omit";
  /** re-run a request a safety classifier declined on the model Anthropic recommends; on by default where the API offers it */
  fallback?: boolean;
  /** stream tool arguments as they are written instead of all at once at the end; the official endpoint only */
  eagerToolInput?: boolean;
  /** let the API cache the longest stable prefix (system prompt, tools, history) */
  cache?: boolean;
};

const OFFICIAL = "https://api.anthropic.com";
/** the models whose refusals the API can hand to another model by itself */
const FALLBACK_MODELS = /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/;

type Block = Record<string, unknown> & { type: string };

function imageBlock(p: Extract<UserPart, { type: "image" }>): Block {
  const d = splitDataUrl(p.dataUrl);
  return d ? { type: "image", source: { type: "base64", media_type: d.mediaType, data: d.data } } : { type: "image", source: { type: "url", url: p.dataUrl } };
}

const userBlocks = (parts: UserPart[]): Block[] => parts.filter((p) => p.type !== "text" || p.text).map((p) => (p.type === "text" ? { type: "text", text: p.text } : imageBlock(p)));

/** An answer's blocks as they go back. A block from Anthropic goes back as it came; after a refusal
 *  that a fallback model took over mid-answer, the declined model's thinking and calls before the
 *  last switch point stay out, as the API asks. */
function assistantBlocks(m: AssistantMessage): Block[] {
  const own = m.kind === "anthropic";
  const lastSwitch = own ? m.content.map((p) => (p.native as Block | undefined)?.type).lastIndexOf("fallback") : -1;
  const out: Block[] = [];
  m.content.forEach((p, i) => {
    const native = own ? (p.native as Block | undefined) : undefined;
    if (native) {
      if (i < lastSwitch && /^(thinking|redacted_thinking|tool_use)$/.test(native.type)) return;
      out.push(native);
    } else if (p.type === "text" && p.text) out.push({ type: "text", text: p.text });
    else if (p.type === "tool_call") out.push({ type: "tool_use", id: p.id, name: p.name, input: p.args ?? {} });
  });
  return out;
}

/** the conversation as Messages turns: tool results ride in a user turn, and turns of one role are joined */
export function toAnthropicMessages(messages: Message[]): { role: "user" | "assistant"; content: Block[] }[] {
  const out: { role: "user" | "assistant"; content: Block[] }[] = [];
  const push = (role: "user" | "assistant", content: Block[]) => {
    if (!content.length) return;
    const last = out[out.length - 1];
    if (last?.role === role) last.content.push(...content);
    else out.push({ role, content });
  };
  for (const m of messages) {
    if (m.role === "user") push("user", userBlocks(userParts(m)));
    else if (m.role === "assistant") push("assistant", assistantBlocks(m));
    else
      push(
        "user",
        m.results.map((r) => {
          const content = userBlocks(r.content);
          return { type: "tool_result", tool_use_id: r.callId, content: content.length ? content : [{ type: "text", text: "(no output)" }], ...(r.isError ? { is_error: true } : {}) };
        }),
      );
  }
  return out;
}

/** Anthropic counts cached input apart from `input_tokens`; here input is all of it */
export function anthropicUsage(u: unknown): Usage {
  const x = (u ?? {}) as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  const read = x.cache_read_input_tokens ?? 0;
  const write = x.cache_creation_input_tokens ?? 0;
  return { ...emptyUsage(), input: (x.input_tokens ?? 0) + read + write, output: x.output_tokens ?? 0, cachedInput: read, cacheWrite: write };
}

function stopOf(reason: unknown): StopReason {
  if (reason === "tool_use") return "tool_use";
  if (reason === "refusal") return "refusal";
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") return "max_tokens";
  /* end_turn, stop_sequence; pause_turn comes only from server-side tools, which this app does not declare */
  return "end_turn";
}

export function anthropicMessages(opts: AnthropicOptions): Adapter {
  const base = trimSlash(opts.baseUrl);
  const url = `${base}/v1/messages`;
  const model = opts.model.trim();
  const official = base === OFFICIAL;
  const fallback = opts.fallback ?? (official && FALLBACK_MODELS.test(model));
  const eager = opts.eagerToolInput ?? official;
  const cache = opts.cache ?? official;

  const body = (req: LlmRequest) => {
    const tools = req.tools ?? [];
    return {
      model,
      max_tokens: req.maxOutputTokens ?? opts.maxTokens ?? 32000,
      ...(req.system ? { system: req.system } : {}),
      messages: toAnthropicMessages(req.messages),
      ...(tools.length
        ? {
            tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, ...(eager ? { eager_input_streaming: true } : {}) })),
            tool_choice: { type: req.toolChoice ?? "auto" },
          }
        : {}),
      ...((opts.thinking ?? "adaptive") === "adaptive" ? { thinking: { type: "adaptive", display: "summarized" } } : {}),
      ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
      ...(cache ? { cache_control: { type: "ephemeral" } } : {}),
      ...(fallback ? { fallbacks: "default" } : {}),
      stream: true,
    };
  };

  async function* attempt(req: LlmRequest, signal?: AbortSignal): AsyncGenerator<LlmEvent> {
    const headers: Record<string, string> = {
      "x-api-key": opts.key.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(fallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
    };
    const events = await postSse(opts, url, headers, body(req), signal);
    /** the blocks of the answer by index, with the arguments of a call still being written */
    const blocks = new Map<number, Block>();
    const json = new Map<number, string>();
    let usage: Record<string, unknown> = {};
    let stop: unknown;
    let started = false;
    for await (const sse of events) {
      const e = sseJson(sse.data);
      if (!e) continue;
      switch (String(e.type ?? sse.event)) {
        case "message_start": {
          started = true;
          usage = { ...(e.message as { usage?: object })?.usage };
          break;
        }
        case "content_block_start": {
          const i = Number(e.index);
          const b = { ...(e.content_block as Block) };
          blocks.set(i, b);
          if (b.type === "tool_use") {
            json.set(i, "");
            yield { type: "tool_call_start", id: String(b.id), name: String(b.name) };
          } else if (b.type === "text" && b.text) yield { type: "text", delta: String(b.text) };
          break;
        }
        case "content_block_delta": {
          const i = Number(e.index);
          const b = blocks.get(i);
          const d = (e.delta ?? {}) as Record<string, string>;
          if (!b) break;
          if (d.type === "text_delta") {
            b.text = String(b.text ?? "") + d.text;
            yield { type: "text", delta: d.text };
          } else if (d.type === "thinking_delta") {
            b.thinking = String(b.thinking ?? "") + d.thinking;
            yield { type: "reasoning", delta: d.thinking };
          } else if (d.type === "signature_delta") b.signature = String(b.signature ?? "") + d.signature;
          else if (d.type === "input_json_delta") {
            json.set(i, (json.get(i) ?? "") + d.partial_json);
            if (d.partial_json) yield { type: "tool_call_delta", id: String(b.id), delta: d.partial_json };
          } else if (d.type === "citations_delta") b.citations = [...((b.citations as unknown[]) ?? []), (d as unknown as { citation: unknown }).citation];
          break;
        }
        case "content_block_stop": {
          const i = Number(e.index);
          const b = blocks.get(i);
          if (b?.type === "tool_use") {
            const argsText = json.get(i) ?? "";
            const { args } = parseArgs(argsText);
            /* what goes back is what was parsed; a call whose arguments did not parse still needs an input to replay */
            b.input = args ?? {};
            yield { type: "tool_call", call: { id: String(b.id), name: String(b.name), args, argsText } };
          }
          break;
        }
        case "message_delta": {
          const d = (e.delta ?? {}) as { stop_reason?: string };
          if (d.stop_reason) stop = d.stop_reason;
          /* the final counts are running totals; any field present replaces the one from the start */
          usage = { ...usage, ...(e.usage as object | undefined) };
          break;
        }
        case "message_stop": {
          const content = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([i, b]) => partOf(b, json.get(i)));
          const u = anthropicUsage(usage);
          const message: AssistantMessage = { role: "assistant", content, kind: "anthropic", model };
          yield { type: "usage", usage: u };
          yield { type: "done", stop: stopOf(stop), message, usage: u };
          return;
        }
        case "error": {
          const err = (e.error ?? {}) as { type?: string; message?: string };
          throw streamError(err.type ?? "api_error", err.message);
        }
      }
    }
    throw new LlmHttpError(502, started ? "502: the stream ended before the message was complete" : "502: the stream ended before the message started");
  }

  return {
    kind: "anthropic",
    model,
    stream: (req, signal) => withRetry(() => attempt(req, signal), opts, signal),
  };
}

/** a finished block as a part of the transcript; every block keeps itself for the replay */
function partOf(b: Block, argsText?: string): AssistantPart {
  if (b.type === "text") return { type: "text", text: String(b.text ?? ""), native: b };
  if (b.type === "tool_use") {
    const text = argsText ?? JSON.stringify(b.input ?? {});
    return { type: "tool_call", id: String(b.id), name: String(b.name), args: parseArgs(text).args, argsText: text, native: b };
  }
  /* thinking, redacted thinking, a fallback marker, or a block this app does not know: it shows only its summary, if any */
  return { type: "reasoning", text: b.type === "thinking" ? String(b.thinking ?? "") : "", native: b };
}
