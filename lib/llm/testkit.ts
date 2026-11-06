import type { Adapter, AdapterKind, AssistantMessage, LlmEvent, LlmRequest, StopReason, ToolCall, Usage } from "./types";

/* Stand-ins for the network and for a model, for tests here and in the code built on this layer:
 * nothing in them reaches a provider. */

const enc = new TextEncoder();

/** SSE text from events: an object becomes a data line, a pair names its event */
export const sseText = (events: (object | [string, object] | string)[]) =>
  events.map((e) => (typeof e === "string" ? `data: ${e}\n\n` : Array.isArray(e) ? `event: ${e[0]}\ndata: ${JSON.stringify(e[1])}\n\n` : `data: ${JSON.stringify(e)}\n\n`)).join("");

/** A body that hands out the text's bytes in pieces of the sizes `sizes` picks (cutting through
 *  characters and line breaks alike); with a signal it fails the way fetch does when aborted. */
export function byteStream(text: string, sizes: (i: number) => number = () => Infinity, opts: { signal?: AbortSignal; hang?: boolean } = {}): ReadableStream<Uint8Array> {
  const bytes = enc.encode(text);
  let at = 0;
  let n = 0;
  return new ReadableStream<Uint8Array>({
    start(c) {
      opts.signal?.addEventListener("abort", () => c.error(opts.signal!.reason ?? new DOMException("aborted", "AbortError")), { once: true });
    },
    pull(c) {
      if (at >= bytes.length) {
        if (!opts.hang) c.close();
        return opts.hang ? new Promise<void>(() => {}) : undefined;
      }
      const size = Math.max(1, Math.min(bytes.length - at, sizes(n++)));
      c.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

/** a deterministic run of piece sizes from 1 to `max` */
export const jagged = (seed: number, max = 17) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return 1 + (s % max);
  };
};

export const sseResponse = (text: string, init: { status?: number; headers?: Record<string, string>; sizes?: (i: number) => number; signal?: AbortSignal; hang?: boolean } = {}) =>
  new Response(byteStream(text, init.sizes, { signal: init.signal, hang: init.hang }), { status: init.status ?? 200, headers: { "content-type": "text/event-stream", ...init.headers } });

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

type Reply = Response | Error | ((init: RequestInit) => Response | Promise<Response>);

/** a fetch that answers with the replies in turn and remembers what it was asked */
export function fakeFetch(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init, body: typeof init.body === "string" ? JSON.parse(init.body) : {} });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("aborted", "AbortError");
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(init) : r;
  }) as typeof fetch;
  return Object.assign(f, { calls });
}

export const noSleep = async (_ms: number, signal?: AbortSignal) => {
  if (signal?.aborted) throw signal.reason;
};

/** one scripted model turn: what it says, the calls it makes, how it ends */
export type ScriptedTurn = { text?: string; reasoning?: string; calls?: Omit<ToolCall, "args">[]; stop?: StopReason; usage?: Partial<Usage> } | { error: unknown } | LlmEvent[];

const usageOf = (u: Partial<Usage> = {}): Usage => ({ input: 10, output: 5, reasoning: 0, cachedInput: 0, cacheWrite: 0, ...u });

/** An adapter that plays turns in order and records every request (with the messages as they were
 *  then), standing in for a model in tests of what is built on top of it. */
export function scriptedAdapter(turns: (ScriptedTurn | ((req: LlmRequest) => ScriptedTurn))[], kind: AdapterKind = "chat", model = "scripted") {
  const requests: LlmRequest[] = [];
  const adapter: Adapter = {
    kind,
    model,
    async *stream(req, signal) {
      requests.push(structuredClone(req));
      const t0 = turns[requests.length - 1];
      const t = typeof t0 === "function" ? t0(req) : t0;
      if (!t) {
        yield { type: "error", error: new Error("no more turns") };
        return;
      }
      if (Array.isArray(t)) {
        for (const e of t) {
          if (signal?.aborted) {
            yield { type: "error", error: signal.reason };
            return;
          }
          yield e;
        }
        return;
      }
      if ("error" in t) {
        yield { type: "error", error: t.error };
        return;
      }
      const message: AssistantMessage = { role: "assistant", content: [], kind, model };
      if (t.reasoning) {
        yield { type: "reasoning", delta: t.reasoning };
        message.content.push({ type: "reasoning", text: t.reasoning });
      }
      if (t.text) {
        yield { type: "text", delta: t.text };
        message.content.push({ type: "text", text: t.text });
      }
      for (const c of t.calls ?? []) {
        let args: Record<string, unknown> | null = null;
        try {
          const v = JSON.parse(c.argsText || "{}");
          args = v && typeof v === "object" && !Array.isArray(v) ? v : null;
        } catch {}
        const call = { ...c, args };
        yield { type: "tool_call_start", id: c.id, name: c.name };
        yield { type: "tool_call", call };
        message.content.push({ type: "tool_call", ...call });
      }
      const usage = usageOf(t.usage);
      if (signal?.aborted) {
        yield { type: "error", error: signal.reason };
        return;
      }
      yield { type: "usage", usage };
      yield { type: "done", stop: t.stop ?? (t.calls?.length ? "tool_use" : "end_turn"), message, usage };
    },
  };
  return Object.assign(adapter, { requests });
}

/** every event of a stream, in order */
export async function drain(it: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const out: LlmEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}
