import { describe, expect, it } from "vitest";
import { AiHttpError } from "../ai";
import { LlmHttpError, backoff, retryable, sleep, statusOfCode, withRetry } from "./http";
import { openAiResponses } from "./openai";
import { drain, fakeFetch, jsonResponse, sseResponse, sseText } from "./testkit";
import type { AdapterOptions, LlmEvent } from "./types";

const OPTS: AdapterOptions = { baseUrl: "https://api.example.test/v1", model: "m", key: "k" };

/** an attempt that yields what it is given, then throws or ends */
const attempt = (events: LlmEvent[], error?: unknown) =>
  async function* () {
    for (const e of events) yield e;
    if (error) throw error;
  };

const TEXT: LlmEvent = { type: "text", delta: "hi" };
const DONE: LlmEvent = { type: "done", stop: "end_turn", message: { role: "assistant", content: [] }, usage: { input: 1, output: 1, reasoning: 0, cachedInput: 0, cacheWrite: 0 } };

describe("withRetry", () => {
  it("tries again after a busy provider, waiting longer each time, and says so", async () => {
    const waits: number[] = [];
    const tries = [attempt([], new AiHttpError(429, "429: slow down")), attempt([], new AiHttpError(503, "503")), attempt([TEXT, DONE])];
    let n = 0;
    const events = await drain(withRetry(() => tries[n++](), { ...OPTS, sleep: async (ms) => void waits.push(ms) }));
    expect(waits).toEqual([1000, 2000]);
    expect(events.map((e) => e.type)).toEqual(["retry", "retry", "text", "done"]);
    expect(events[0]).toMatchObject({ attempt: 1, delayMs: 1000 });
  });

  it("waits as long as the provider asks, within the cap", async () => {
    expect(backoff(1, new LlmHttpError(429, "x", 4500), { attempts: 3, baseMs: 1000, maxMs: 20_000 })).toBe(4500);
    expect(backoff(1, new LlmHttpError(429, "x", 90_000), { attempts: 3, baseMs: 1000, maxMs: 20_000 })).toBe(20_000);
    expect(backoff(4, new AiHttpError(500, "x"), { attempts: 9, baseMs: 1000, maxMs: 5000 })).toBe(5000);
  });

  it("gives up after the last attempt with the provider's own error", async () => {
    let n = 0;
    const events = await drain(withRetry(() => (n++, attempt([], new AiHttpError(500, "500 boom"))()), { ...OPTS, retry: { attempts: 2, baseMs: 1, maxMs: 1 }, sleep: async () => {} }));
    expect(n).toBe(2);
    const last = events[events.length - 1];
    expect(last.type).toBe("error");
    expect((last as { error: AiHttpError }).error).toBeInstanceOf(AiHttpError);
    expect((last as { error: AiHttpError }).error.status).toBe(500);
  });

  it("never repeats an attempt that already showed something", async () => {
    let n = 0;
    const events = await drain(withRetry(() => (n++, attempt([TEXT], new AiHttpError(500, "500"))()), { ...OPTS, sleep: async () => {} }));
    expect(n).toBe(1);
    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
  });

  it("does not retry what waiting cannot fix", async () => {
    for (const e of [new AiHttpError(400, "400 bad"), new AiHttpError(401, "401"), new AiHttpError(404, "404"), new AiHttpError(429, "429: You exceeded your current quota"), new Error("insecure"), new TypeError("Failed to fetch")]) {
      let n = 0;
      const events = await drain(withRetry(() => (n++, attempt([], e)()), { ...OPTS, sleep: async () => {} }));
      expect(n).toBe(1);
      expect(events).toEqual([{ type: "error", error: e }]);
    }
    expect(retryable(new AiHttpError(529, "overloaded"))).toBe(true);
    expect(retryable(new AiHttpError(408, "timeout"))).toBe(true);
  });

  it("stops waiting when aborted, with the abort as the error", async () => {
    const ctl = new AbortController();
    const it = withRetry(attempt([], new AiHttpError(503, "503")), OPTS, ctl.signal);
    const first = await it.next();
    expect(first.value).toMatchObject({ type: "retry" });
    const next = it.next();
    ctl.abort();
    const v = (await next).value as { type: string; error: Error };
    expect(v.type).toBe("error");
    expect(v.error.name).toBe("AbortError");
  });
});

describe("sleep", () => {
  it("rejects at once on a signal that is already aborted", async () => {
    await expect(sleep(10, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("statusOfCode", () => {
  it("gives an error reported inside a stream the status it would have had", () => {
    expect(statusOfCode("rate_limit_exceeded")).toBe(429);
    expect(statusOfCode("overloaded_error")).toBe(529);
    expect(statusOfCode("server_error")).toBe(500);
    expect(statusOfCode("api_error")).toBe(500);
    expect(statusOfCode("authentication_error")).toBe(401);
    expect(statusOfCode("permission_error")).toBe(403);
    expect(statusOfCode("not_found_error")).toBe(404);
    expect(statusOfCode("request_too_large")).toBe(413);
    expect(statusOfCode(503)).toBe(503);
    expect(statusOfCode("invalid_prompt")).toBe(400);
    expect(statusOfCode(undefined)).toBe(400);
  });
});

describe("an adapter's requests", () => {
  it("retries an HTTP 429 with the delay from retry-after-ms, then streams", async () => {
    const ok = sseText([{ type: "response.output_text.delta", delta: "ok" }, { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 1, output_tokens: 1 } } }]);
    const f = fakeFetch(jsonResponse({ error: { message: "Rate limit reached" } }, 429, { "retry-after-ms": "1500" }), sseResponse(ok));
    const waits: number[] = [];
    const events = await drain(openAiResponses({ ...OPTS, fetch: f, sleep: async (ms) => void waits.push(ms) }).stream({ system: "", messages: [{ role: "user", content: "hi" }] }));
    expect(f.calls.length).toBe(2);
    expect(waits).toEqual([1500]);
    expect((events[0] as { error: AiHttpError }).error.message).toBe("429: Rate limit reached");
    expect(events.map((e) => e.type)).toEqual(["retry", "text", "usage", "done"]);
  });

  it("refuses to send a key over plain http to another machine", async () => {
    const f = fakeFetch(jsonResponse({}));
    const events = await drain(openAiResponses({ ...OPTS, baseUrl: "http://api.example.test/v1", fetch: f }).stream({ system: "", messages: [] }));
    expect(f.calls.length).toBe(0);
    expect((events[0] as { error: Error }).error.message).toBe("insecure");
  });
});
