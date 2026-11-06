import { LlmHttpError, postSse, streamError, trimSlash, withRetry } from "./http";
import { sseJson } from "./sse";
import { emptyUsage, parseArgs, userParts, type Adapter, type AdapterOptions, type AssistantMessage, type AssistantPart, type LlmEvent, type LlmRequest, type Message, type StopReason, type ToolCall, type Usage, type UserPart } from "./types";

/* The OpenAI-compatible Chat Completions endpoint, streamed: Gemini and DeepSeek through their
 * compatible endpoints, and servers on this machine (Ollama, LM Studio, llama.cpp, vLLM).
 *
 * Each tool call streams as pieces under its index: the first piece names it, the rest add to its
 * arguments. Servers differ in the details (one sends a call whole, one leaves the index out, one
 * sends usage in its own last chunk), so the pieces are put together tolerantly. Two things a server
 * may want back on the next step are kept: DeepSeek's `reasoning_content` while it calls tools, and
 * Gemini's thought signature (`extra_content`) on each call. */

export type ChatOptions = AdapterOptions & {
  maxTokens?: number;
  /** what the server calls the output cap; null sends none and leaves it to the server */
  maxTokensParam?: "max_tokens" | "max_completion_tokens" | null;
  /** ask for token counts at the end of the stream (`stream_options.include_usage`) */
  includeUsage?: boolean;
  /** sent as `reasoning_effort` when set */
  reasoningEffort?: string;
};

type Wire = Record<string, unknown>;

const userContent = (parts: UserPart[]) =>
  parts.every((p) => p.type === "text") ? parts.map((p) => (p as { text: string }).text).join("\n") : parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: p.dataUrl, ...(p.detail ? { detail: p.detail } : {}) } }));

const textOfParts = (parts: UserPart[]) =>
  parts
    .filter((p): p is Extract<UserPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");

/** The conversation as chat messages. A tool message carries words only on most of these servers, so
 *  the pictures a tool returned follow all of that step's tool messages in one user message. */
export function toChatMessages(system: string, messages: Message[], model: string): Wire[] {
  const out: Wire[] = system ? [{ role: "system", content: system }] : [];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: userContent(userParts(m)) });
    else if (m.role === "assistant") {
      const own = m.kind === "chat" && m.model === model;
      const text = m.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { text: string }).text)
        .join("");
      const calls = m.content.filter((p): p is Extract<AssistantPart, { type: "tool_call" }> => p.type === "tool_call");
      const reasoning = own
        ? m.content
            .filter((p) => p.type === "reasoning")
            .map((p) => p.text)
            .join("")
        : "";
      out.push({
        role: "assistant",
        content: text,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: c.argsText || "{}" },
                ...(own && c.native && typeof c.native === "object" ? (c.native as Wire) : {}),
              })),
            }
          : {}),
        ...(reasoning ? { reasoning_content: reasoning } : {}),
      });
    } else {
      const pictures: UserPart[] = [];
      for (const r of m.results) {
        const words = textOfParts(r.content);
        const images = r.content.filter((p) => p.type === "image");
        const said = words || (images.length ? "" : "(no output)");
        const content = [r.isError ? `Error: ${said}` : said, images.length ? (images.length > 1 ? `(${images.length} images follow below)` : "(the image follows below)") : ""].filter(Boolean).join("\n");
        out.push({ role: "tool", tool_call_id: r.callId, content });
        if (images.length) pictures.push({ type: "text", text: `Image returned by ${r.name} (${r.callId}):` }, ...images);
      }
      if (pictures.length) out.push({ role: "user", content: userContent(pictures) });
    }
  }
  return out;
}

export function chatUsage(u: unknown): Usage {
  const x = (u ?? {}) as { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } };
  return {
    ...emptyUsage(),
    input: x.prompt_tokens ?? 0,
    output: x.completion_tokens ?? 0,
    reasoning: x.completion_tokens_details?.reasoning_tokens ?? 0,
    cachedInput: x.prompt_tokens_details?.cached_tokens ?? x.prompt_cache_hit_tokens ?? 0,
  };
}

function stopOf(finish: unknown, hasCalls: boolean): StopReason {
  if (finish === "length") return "max_tokens";
  if (finish === "content_filter") return "refusal";
  /* some servers end a turn of calls with "stop" */
  return hasCalls || finish === "tool_calls" || finish === "function_call" ? "tool_use" : "end_turn";
}

type Pending = { id: string; name: string; args: string; extra?: Wire; started: boolean };

export function chatCompletions(opts: ChatOptions): Adapter {
  const url = `${trimSlash(opts.baseUrl)}/chat/completions`;
  const model = opts.model.trim();

  const body = (req: LlmRequest) => {
    const tools = req.tools ?? [];
    const max = req.maxOutputTokens ?? opts.maxTokens;
    const param = opts.maxTokensParam === undefined ? "max_tokens" : opts.maxTokensParam;
    return {
      model,
      messages: toChatMessages(req.system, req.messages, model),
      ...(tools.length ? { tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: req.toolChoice ?? "auto" } : {}),
      ...(max && param ? { [param]: max } : {}),
      ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      stream: true,
      ...(opts.includeUsage === false ? {} : { stream_options: { include_usage: true } }),
    };
  };

  async function* attempt(req: LlmRequest, signal?: AbortSignal): AsyncGenerator<LlmEvent> {
    const headers: Record<string, string> = opts.key.trim() ? { authorization: `Bearer ${opts.key.trim()}` } : {};
    const events = await postSse(opts, url, headers, body(req), signal);
    let text = "";
    let reasoning = "";
    let finish: unknown;
    let usage = emptyUsage();
    let ended = false;
    const calls: Pending[] = [];
    const byIndex = new Map<number, Pending>();

    /** the call a piece belongs to: by its index, else by a new id, else the last one */
    const callFor = (d: Wire): Pending => {
      const id = typeof d.id === "string" && d.id ? d.id : undefined;
      if (typeof d.index === "number") {
        let c = byIndex.get(d.index);
        /* a server that numbers every call 0 still gives each a new id */
        if (c && id && c.id !== id && c.started) c = undefined;
        if (!c) {
          c = { id: id ?? `call_${calls.length}`, name: "", args: "", started: false };
          byIndex.set(d.index, c);
          calls.push(c);
        }
        return c;
      }
      const last = calls[calls.length - 1];
      if (last && (!id || id === last.id)) return last;
      const c = { id: id ?? `call_${calls.length}`, name: "", args: "", started: false };
      calls.push(c);
      return c;
    };

    for await (const sse of events) {
      if (sse.data.trim() === "[DONE]") {
        ended = true;
        break;
      }
      const e = sseJson(sse.data);
      if (!e) continue;
      if (e.error) {
        const err = e.error as { code?: unknown; status?: unknown; type?: unknown; message?: unknown };
        throw streamError(err.code ?? err.status ?? err.type ?? "server_error", err.message ?? JSON.stringify(err).slice(0, 300));
      }
      if (e.usage) usage = chatUsage(e.usage);
      const choice = ((e.choices as Wire[] | undefined) ?? [])[0];
      if (!choice) continue;
      const delta = (choice.delta ?? choice.message ?? {}) as Wire;
      const r = delta.reasoning_content ?? delta.reasoning;
      if (typeof r === "string" && r) {
        reasoning += r;
        yield { type: "reasoning", delta: r };
      }
      for (const key of ["content", "refusal"]) {
        const v = delta[key];
        if (typeof v === "string" && v) {
          text += v;
          yield { type: "text", delta: v };
        }
      }
      for (const d of (delta.tool_calls as Wire[] | undefined) ?? []) {
        const c = callFor(d);
        const fn = (d.function ?? {}) as { name?: string; arguments?: string };
        if (typeof d.id === "string" && d.id) c.id = d.id;
        if (fn.name) c.name = c.started ? c.name : c.name + fn.name;
        if (d.extra_content) c.extra = { extra_content: d.extra_content };
        if (!c.started && c.name) {
          c.started = true;
          yield { type: "tool_call_start", id: c.id, name: c.name };
        }
        if (fn.arguments) {
          c.args += fn.arguments;
          if (c.started) yield { type: "tool_call_delta", id: c.id, delta: fn.arguments };
        }
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    /* a stream that stops without saying how the turn ended was cut off */
    if (!ended && finish === undefined) throw new LlmHttpError(502, "502: the stream ended before the answer was complete");
    const content: AssistantPart[] = [];
    if (reasoning) content.push({ type: "reasoning", text: reasoning });
    if (text) content.push({ type: "text", text });
    for (const c of calls) {
      const call: ToolCall = { id: c.id, name: c.name, args: parseArgs(c.args).args, argsText: c.args };
      content.push({ type: "tool_call", ...call, ...(c.extra ? { native: c.extra } : {}) });
      yield { type: "tool_call", call };
    }
    const message: AssistantMessage = { role: "assistant", content, kind: "chat", model };
    yield { type: "usage", usage };
    yield { type: "done", stop: stopOf(finish, calls.length > 0), message, usage };
  }

  return {
    kind: "chat",
    model,
    stream: (req, signal) => withRetry(() => attempt(req, signal), opts, signal),
  };
}
