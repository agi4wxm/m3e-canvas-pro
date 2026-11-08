import { AiHttpError, isSecureUrl, readError } from "./errors";
import { readSse, type SseMessage } from "./sse";
import { DEFAULT_RETRY, type AdapterOptions, type LlmEvent, type RetryPolicy } from "./types";

/* What every adapter does the same way: post a request, read its answer as server-sent events, map a
 * failure to the status the editor already explains to the author, and try once or twice more when
 * the provider was only busy and nothing has been shown yet. */

/** a provider's failure with what retrying needs to know; still an AiHttpError, so it reads the same in the editor */
export class LlmHttpError extends AiHttpError {
  constructor(
    status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(status, message);
  }
}

export const trimSlash = (u: string) => u.trim().replace(/\/+$/, "");

/** the status an error reported inside a stream would have had as an answer of its own */
export function statusOfCode(code: unknown): number {
  const c = String(code ?? "").toLowerCase();
  if (/rate_limit|too_many|quota/.test(c)) return 429;
  if (/overloaded/.test(c)) return 529;
  if (/server_error|api_error|internal|unavailable|timeout/.test(c)) return 500;
  if (/authentication|invalid_api_key|unauthorized/.test(c)) return 401;
  if (/permission/.test(c)) return 403;
  if (/not_found/.test(c)) return 404;
  if (/too_large/.test(c)) return 413;
  if (/^\d{3}$/.test(c)) return Number(c);
  return 400;
}

export const streamError = (code: unknown, message: unknown) => {
  const status = statusOfCode(code);
  return new LlmHttpError(status, `${status}${code ? ` ${String(code)}` : ""}: ${String(message ?? "stream error").slice(0, 300)}`);
};

/** how long the provider asked to be left alone, in ms */
function retryAfter(h: Headers): number | undefined {
  const ms = Number(h.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = h.get("retry-after");
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s.trim())) return Number(s) * 1000;
  const at = Date.parse(s);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined;
}

/** how long a stream may send nothing at all (no event, no keep-alive) before it is given up as stalled */
export const IDLE_MS = 180_000;

/** POSTs a JSON body and hands back the event stream, or throws what the provider said. A provider that sends nothing
 *  for `idleMs` (the answer's headers included) is cut off with a 408, which is tried again like any busy provider
 *  while nothing has been shown. */
export async function postSse(opts: AdapterOptions, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<AsyncGenerator<SseMessage>> {
  if (!isSecureUrl(url)) throw new Error("insecure");
  const f = opts.fetch ?? globalThis.fetch;
  const idle = opts.idleMs ?? IDLE_MS;
  const ac = new AbortController();
  let stalled: LlmHttpError | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => ac.abort(signal?.reason);
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = new LlmHttpError(408, `408: the provider sent nothing for ${Math.round(idle / 1000)} s`);
      ac.abort(stalled);
    }, idle);
  };
  const done = () => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  };
  if (signal?.aborted) ac.abort(signal.reason);
  else signal?.addEventListener("abort", stop, { once: true });
  arm();
  let res: Response;
  try {
    res = await f(url, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream", ...headers }, body: JSON.stringify(body), signal: ac.signal });
    if (!res.ok) {
      const e = await readError(res, opts.key);
      throw new LlmHttpError(e.status, e.message, retryAfter(res.headers));
    }
    if (!res.body) throw new Error("empty");
  } catch (e) {
    done();
    throw stalled ?? e;
  }
  const events = readSse(res.body, arm);
  return (async function* () {
    try {
      yield* events;
    } catch (e) {
      throw stalled ?? e;
    } finally {
      done();
    }
  })();
}

export const isAbortError = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

/** the reason a signal gives, as an AbortError when it gives none */
export const abortReason = (signal: AbortSignal): unknown => signal.reason ?? new DOMException("The operation was aborted.", "AbortError");

/** busy or failing on the provider's side, and not a spent quota that waiting will not refill */
export function retryable(e: unknown): boolean {
  if (!(e instanceof AiHttpError)) return false;
  if (e.status === 429) return !/insufficient_quota|exceeded your current quota|billing/i.test(e.message);
  return e.status === 408 || e.status === 409 || e.status >= 500;
}

export const backoff = (attempt: number, e: unknown, p: RetryPolicy) => {
  const asked = e instanceof LlmHttpError ? e.retryAfterMs : undefined;
  return Math.min(p.maxMs, asked ?? p.baseMs * 2 ** (attempt - 1));
};

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const done = () => {
      signal?.removeEventListener("abort", stop);
      resolve();
    };
    const t = setTimeout(done, ms);
    const stop = () => {
      clearTimeout(t);
      reject(abortReason(signal!));
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

/** Runs one attempt after another until one gets through. An attempt is a generator that throws on
 *  failure; this turns its failure into the stream's last event. Once an attempt has shown anything
 *  (text, reasoning, a tool call), it is never repeated: the author would see it twice. */
export async function* withRetry(attempt: () => AsyncGenerator<LlmEvent>, opts: AdapterOptions, signal?: AbortSignal): AsyncGenerator<LlmEvent> {
  const policy = opts.retry ?? DEFAULT_RETRY;
  const wait = opts.sleep ?? sleep;
  for (let n = 1; ; n++) {
    let shown = false;
    try {
      for await (const e of attempt()) {
        if (e.type !== "usage") shown = true;
        yield e;
      }
      return;
    } catch (error) {
      if (signal?.aborted) {
        yield { type: "error", error: abortReason(signal) };
        return;
      }
      if (shown || n >= policy.attempts || !retryable(error)) {
        yield { type: "error", error };
        return;
      }
      const delayMs = backoff(n, error, policy);
      yield { type: "retry", attempt: n, delayMs, error };
      try {
        await wait(delayMs, signal);
      } catch (e) {
        yield { type: "error", error: e };
        return;
      }
    }
  }
}
