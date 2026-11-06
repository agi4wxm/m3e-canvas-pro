import { LlmHttpError, postSse, streamError, trimSlash, withRetry } from "./http";
import { sseJson } from "./sse";
import { emptyUsage, parseArgs, userParts, type Adapter, type AdapterOptions, type AssistantMessage, type AssistantPart, type LlmEvent, type LlmRequest, type Message, type StopReason, type ToolCall, type Usage, type UserPart } from "./types";

/* OpenAI's Responses API (POST /responses), streamed. The newest OpenAI models call tools only here.
 *
 * The conversation is replayed in full on every step and nothing is stored on OpenAI's side
 * (`store: false`), so a document's conversation lives with the document and no response id can go
 * stale. What the model reasoned is kept across tool steps the way the API asks for stateless use:
 * `include: ["reasoning.encrypted_content"]` makes every reasoning item carry its reasoning
 * encrypted, and the items come back on the next request exactly as they were sent, together with
 * the message and function_call items they belong to. Items are replayed only to the model that
 * wrote them; any other gets the calls and the text rebuilt plainly.
 *
 * Recorded against the live API (fixtures/responses-tools.sse): a commentary message item (`phase`)
 * before the calls, one function_call item per parallel call with its arguments in a single delta,
 * no "[DONE]" line, and usage with `cached_tokens` and `cache_write_tokens`. */

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type OpenAiResponsesOptions = AdapterOptions & {
  /** left out for a model that does not reason; the newest models default to medium */
  effort?: ReasoningEffort;
  /** a summary of the reasoning to show while the model thinks; null asks for none */
  summary?: "auto" | "concise" | "detailed" | null;
  maxOutputTokens?: number;
  /** groups requests that share a long prefix (system prompt, tools), so OpenAI's cache finds them */
  promptCacheKey?: string;
};

type Item = Record<string, unknown> & { type?: string; id?: string };

const imageInput = (p: Extract<UserPart, { type: "image" }>) => ({ type: "input_image", image_url: p.dataUrl, detail: p.detail ?? "auto" });

function userContent(parts: UserPart[]) {
  return parts.map((p) => (p.type === "text" ? { type: "input_text", text: p.text } : imageInput(p)));
}

/** a tool's answer as the function_call_output wants it: words alone as a string, pictures as parts */
function toolOutput(content: UserPart[], isError?: boolean): string | unknown[] {
  const parts = content.length ? content : [{ type: "text" as const, text: "(no output)" }];
  const marked = isError ? parts.map((p, i) => (i === 0 && p.type === "text" && !/^error\b/i.test(p.text) ? { ...p, text: `Error: ${p.text}` } : p)) : parts;
  if (marked.every((p) => p.type === "text")) return marked.map((p) => (p as { text: string }).text).join("\n");
  return userContent(isError && marked[0].type !== "text" ? [{ type: "text", text: "Error" }, ...marked] : marked);
}

/** the conversation as Responses input items */
export function toResponsesInput(messages: Message[], model: string): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: userContent(userParts(m)) });
    else if (m.role === "tool") for (const r of m.results) out.push({ type: "function_call_output", call_id: r.callId, output: toolOutput(r.content, r.isError) });
    else {
      const own = m.kind === "openai-responses" && m.model === model;
      for (const p of m.content) {
        if (own && p.native) out.push(p.native);
        else if (p.type === "text" && p.text) out.push({ role: "assistant", content: p.text });
        else if (p.type === "tool_call") out.push({ type: "function_call", call_id: p.id, name: p.name, arguments: p.argsText || "{}" });
        /* reasoning from another model is that model's own: it is not shown to this one */
      }
    }
  }
  return out;
}

export function responsesUsage(u: unknown): Usage {
  const x = (u ?? {}) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } };
  return {
    ...emptyUsage(),
    input: x.input_tokens ?? 0,
    output: x.output_tokens ?? 0,
    reasoning: x.output_tokens_details?.reasoning_tokens ?? 0,
    cachedInput: x.input_tokens_details?.cached_tokens ?? 0,
    cacheWrite: x.input_tokens_details?.cache_write_tokens ?? 0,
  };
}

const callOf = (item: Item): ToolCall => {
  const argsText = String(item.arguments ?? "");
  return { id: String(item.call_id ?? item.id ?? ""), name: String(item.name ?? ""), args: parseArgs(argsText).args, argsText };
};

/** an output item as a part of the transcript; null for an item this app has no use for */
function partOf(item: Item): AssistantPart | null {
  if (item.type === "message") {
    const content = (item.content ?? []) as { type: string; text?: string; refusal?: string }[];
    const text = content.map((c) => (c.type === "output_text" ? (c.text ?? "") : c.type === "refusal" ? (c.refusal ?? "") : "")).join("");
    return { type: "text", text, native: item };
  }
  if (item.type === "reasoning") {
    const summary = ((item.summary ?? []) as { text?: string }[]).map((s) => s.text ?? "").filter(Boolean);
    const content = ((item.content ?? []) as { text?: string }[]).map((s) => s.text ?? "").filter(Boolean);
    return { type: "reasoning", text: (summary.length ? summary : content).join("\n\n"), native: item };
  }
  if (item.type === "function_call") return { type: "tool_call", ...callOf(item), native: item };
  return null;
}

const hasRefusal = (item: Item) => item.type === "message" && ((item.content ?? []) as { type: string }[]).some((c) => c.type === "refusal");

export function openAiResponses(opts: OpenAiResponsesOptions): Adapter {
  const url = `${trimSlash(opts.baseUrl)}/responses`;
  const model = opts.model.trim();

  const body = (req: LlmRequest) => {
    const tools = req.tools ?? [];
    const reasoning = opts.effort || opts.summary ? { ...(opts.effort ? { effort: opts.effort } : {}), ...(opts.summary ? { summary: opts.summary } : {}) } : undefined;
    const max = req.maxOutputTokens ?? opts.maxOutputTokens;
    return {
      model,
      ...(req.system ? { instructions: req.system } : {}),
      input: toResponsesInput(req.messages, model),
      ...(tools.length
        ? {
            /* strict schemas would need every property required and closed; the tools here do not promise that */
            tools: tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false })),
            tool_choice: req.toolChoice ?? "auto",
            parallel_tool_calls: true,
          }
        : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(max ? { max_output_tokens: max } : {}),
      ...(opts.promptCacheKey ? { prompt_cache_key: opts.promptCacheKey } : {}),
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: true,
      /* the padding against size side channels costs bandwidth on every delta; the link is TLS to OpenAI itself */
      stream_options: { include_obfuscation: false },
    };
  };

  async function* attempt(req: LlmRequest, signal?: AbortSignal): AsyncGenerator<LlmEvent> {
    const headers: Record<string, string> = opts.key.trim() ? { authorization: `Bearer ${opts.key.trim()}` } : {};
    const events = await postSse(opts, url, headers, body(req), signal);
    /** finished items by their place in the output, and the call each streaming item belongs to */
    const items = new Map<number, Item>();
    const callIds = new Map<string, string>();
    let lastSummary = "";
    for await (const sse of events) {
      const e = sseJson(sse.data);
      if (!e) continue;
      const type = String(e.type ?? sse.event);
      switch (type) {
        case "response.output_text.delta":
        case "response.refusal.delta":
          if (e.delta) yield { type: "text", delta: String(e.delta) };
          break;
        case "response.reasoning_summary_text.delta":
        case "response.reasoning_text.delta": {
          /* a new summary part starts a new paragraph */
          const key = `${e.item_id}:${e.summary_index ?? e.content_index ?? 0}`;
          if (lastSummary && lastSummary !== key) yield { type: "reasoning", delta: "\n\n" };
          lastSummary = key;
          if (e.delta) yield { type: "reasoning", delta: String(e.delta) };
          break;
        }
        case "response.output_item.added": {
          const item = e.item as Item;
          if (item?.type === "function_call") {
            const call = callOf(item);
            callIds.set(String(item.id), call.id);
            yield { type: "tool_call_start", id: call.id, name: call.name };
          }
          break;
        }
        case "response.function_call_arguments.delta":
          if (e.delta) yield { type: "tool_call_delta", id: callIds.get(String(e.item_id)) ?? String(e.item_id), delta: String(e.delta) };
          break;
        case "response.output_item.done": {
          const item = e.item as Item;
          if (!item) break;
          items.set(Number(e.output_index ?? items.size), item);
          if (item.type === "function_call") yield { type: "tool_call", call: callOf(item) };
          break;
        }
        case "response.completed":
        case "response.incomplete": {
          const r = (e.response ?? {}) as { output?: Item[]; usage?: unknown; incomplete_details?: { reason?: string } | null };
          /* the finished response repeats every item whole; it is the record when it has them */
          const output = r.output?.length ? r.output : [...items.entries()].sort((a, b) => a[0] - b[0]).map(([, it]) => it);
          const content = output.map(partOf).filter((p): p is AssistantPart => p !== null);
          const usage = responsesUsage(r.usage);
          const reason = r.incomplete_details?.reason;
          const stop: StopReason =
            type === "response.incomplete"
              ? reason === "content_filter"
                ? "refusal"
                : "max_tokens"
              : output.some(hasRefusal)
                ? "refusal"
                : content.some((p) => p.type === "tool_call")
                  ? "tool_use"
                  : "end_turn";
          const message: AssistantMessage = { role: "assistant", content, kind: "openai-responses", model };
          yield { type: "usage", usage };
          yield { type: "done", stop, message, usage };
          return;
        }
        case "response.failed": {
          const err = ((e.response as { error?: { code?: string; message?: string } })?.error ?? {}) as { code?: string; message?: string };
          throw streamError(err.code ?? "server_error", err.message ?? "the response failed");
        }
        case "error":
          throw streamError(e.code ?? (e.error as { code?: string })?.code ?? "server_error", e.message ?? (e.error as { message?: string })?.message);
      }
    }
    throw new LlmHttpError(502, "502: the stream ended before the response was complete");
  }

  return {
    kind: "openai-responses",
    model,
    stream: (req, signal) => withRetry(() => attempt(req, signal), opts, signal),
  };
}
