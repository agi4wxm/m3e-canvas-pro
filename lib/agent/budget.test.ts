/* One budget for a turn, held by the app (report 13.3 AI-4): a stream that never ends, a stream that stalls, a flood
 * of tool calls, a provider that rate-limits, a stop during the wait before a retry, the tools' own model calls, and
 * pictures and answers too large. Each limit ends the turn with its reason; what it did so far stays. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { fakeFetch, jsonResponse, noSleep, scriptedAdapter, sseResponse, sseText } from "../llm/testkit";
import { AiHttpError, createAdapter, LimitReached, openAiResponses, type Adapter, type LlmEvent } from "../llm";
import { runTurn, type TurnEvent } from ".";

beforeAll(() => setGlobalLang("en"));

const store = () => {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "user" });
  return s;
};
const call = (id: string, name: string, args: unknown) => ({ id, name, argsText: JSON.stringify(args) });
const ADD = call("c1", "add_screen", { id: "a", name: "A" });
const OPENAI = { baseUrl: "https://api.openai.com/v1", model: "gpt-test", key: "sk-test-not-a-real-key" };
const answer = (text: string) => sseText([{ type: "response.output_text.delta", delta: text }, { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 5, output_tokens: 2 } } }]);

/** a model that makes one change, then talks for ever */
function chatterbox(): Adapter {
  const first = scriptedAdapter([{ calls: [ADD] }]);
  let n = 0;
  return {
    kind: "chat",
    model: "chatty",
    async *stream(req, signal) {
      if (n++ === 0) return yield* first.stream(req, signal);
      for (;;) {
        if (signal?.aborted) {
          yield { type: "error", error: signal.reason } as LlmEvent;
          return;
        }
        yield { type: "text", delta: "and " } as LlmEvent;
        await new Promise((r) => setTimeout(r, 5));
      }
    },
  };
}

describe("a turn's limits", () => {
  it("ends a stream that never ends at the deadline, keeping what was done", async () => {
    const s = store();
    const t0 = Date.now();
    const r = await runTurn({ store: s, adapter: chatterbox(), history: [], request: "x", lang: "en", limits: { deadlineMs: 120 } });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.stop).toBe("limit");
    expect(r.error).toBeInstanceOf(LimitReached);
    expect((r.error as LimitReached).limit).toBe("deadline");
    expect(r.rolledBack).toBe(false);
    expect(s.get().doc.frames.map((f) => f.id)).toEqual(["home", "a"]);
  });

  it("cuts off a stream that stalls, tries it again once, and then says why", async () => {
    const hang = (init: RequestInit) => sseResponse("", { hang: true, signal: init.signal as AbortSignal });
    const f = fakeFetch(hang, hang);
    const adapter = openAiResponses({ ...OPENAI, fetch: f, idleMs: 40, retry: { attempts: 2, baseMs: 1, maxMs: 1 }, sleep: noSleep });
    const r = await runTurn({ store: store(), adapter, history: [], request: "x", lang: "en" });
    expect(f.calls).toHaveLength(2);
    expect(r.stop).toBe("error");
    expect(r.error).toBeInstanceOf(AiHttpError);
    expect((r.error as AiHttpError).status).toBe(408);
  });

  it("does not replay a stream that stalled after it showed something", async () => {
    const half = sseText([{ type: "response.output_text.delta", delta: "Half an answer" }]);
    const f = fakeFetch((init) => sseResponse(half, { hang: true, signal: init.signal as AbortSignal }));
    const adapter = openAiResponses({ ...OPENAI, fetch: f, idleMs: 40, retry: { attempts: 3, baseMs: 1, maxMs: 1 }, sleep: noSleep });
    const r = await runTurn({ store: store(), adapter, history: [], request: "x", lang: "en" });
    expect(f.calls).toHaveLength(1);
    expect((r.error as AiHttpError).status).toBe(408);
  });

  it("runs no more tool calls than the turn may make, answering the rest", async () => {
    const flood = Array.from({ length: 200 }, (_, i) => call(`c${i}`, "get_outline", {}));
    const adapter = scriptedAdapter([{ calls: flood }, { text: "More." }]);
    const ends: Extract<TurnEvent, { type: "tool_end" }>[] = [];
    const r = await runTurn({ store: store(), adapter, history: [], request: "x", lang: "en", limits: { toolCalls: 20 }, onEvent: (e) => e.type === "tool_end" && ends.push(e) });
    expect(ends).toHaveLength(20);
    expect(r.stop).toBe("limit");
    expect((r.error as LimitReached).limit).toBe("tool_calls");
    const results = r.messages.find((m) => m.role === "tool") as { results: { content: { text: string }[] }[] };
    expect(results.results).toHaveLength(200);
    expect(results.results[199].content[0].text).toMatch(/Not run: the turn has made the 20 tool calls/);
    /* nothing more is asked of the model */
    expect(adapter.requests).toHaveLength(1);
  });

  it("waits out a provider that rate-limits, then goes on", async () => {
    const f = fakeFetch(jsonResponse({ error: { message: "Rate limit reached" } }, 429, { "retry-after-ms": "5" }), sseResponse(answer("Done.")));
    const adapter = openAiResponses({ ...OPENAI, fetch: f });
    const events: TurnEvent[] = [];
    const r = await runTurn({ store: store(), adapter, history: [], request: "x", lang: "en", onEvent: (e) => events.push(e) });
    expect(r.stop).toBe("end_turn");
    expect(r.text).toBe("Done.");
    expect(events.some((e) => e.type === "retry")).toBe(true);
  });

  it("stops at once when the author stops it while it waits to retry", async () => {
    const f = fakeFetch(jsonResponse({ error: { message: "Rate limit reached" } }, 429, { "retry-after": "60" }));
    const adapter = openAiResponses({ ...OPENAI, fetch: f, retry: { attempts: 3, baseMs: 1000, maxMs: 60_000 } });
    const ac = new AbortController();
    const t0 = Date.now();
    const r = await runTurn({ store: store(), adapter, history: [], request: "x", lang: "en", signal: ac.signal, onEvent: (e) => e.type === "retry" && ac.abort() });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.stop).toBe("aborted");
    expect(f.calls).toHaveLength(1);
  });

  it("counts the tools' own model calls in the turn's tokens, and holds each call to the output cap", async () => {
    const s = store();
    const writer = scriptedAdapter([{ text: JSON.stringify({ key: "custom:paper", name: "Paper", extends: "notion" }), usage: { input: 900, output: 100 } }]);
    const adapter = scriptedAdapter([{ calls: [call("c1", "generate_style", { description: "paper" })] }, { text: "Done." }]);
    const gen = { settings: { provider: "openai" as const, ...OPENAI }, adapter: writer };
    const r = await runTurn({ store: s, adapter, history: [], request: "generate a warm paper style", lang: "en", gen, limits: { tokens: 800, stepOutputTokens: 4000 } });
    expect(writer.requests[0].maxOutputTokens).toBe(4000);
    expect(r.spent.input).toBe(910);
    expect(r.stop).toBe("limit");
    expect((r.error as LimitReached).limit).toBe("tokens");
    /* the style the tool wrote stays */
    expect(s.get().doc.styles?.map((x) => x.key)).toEqual(["custom:paper"]);
  });

  it("leaves out pictures too large for one answer, and ends a turn whose tools hand back too much", async () => {
    const big = `data:image/png;base64,${"A".repeat(3000)}`;
    const renderer = { screenshot: async () => big };
    const adapter = scriptedAdapter([{ calls: [call("c1", "screenshot", { id: "home" }), call("c2", "screenshot", { id: "home" })] }, { text: "Looked." }]);
    const r = await runTurn({ store: store(), adapter, history: [], request: "x", lang: "en", renderer, limits: { toolResponseBytes: 1000, toolBytes: 300 } });
    const results = r.messages.find((m) => m.role === "tool") as { results: { content: { type: string; text?: string }[] }[] };
    expect(results.results[0].content.some((p) => p.type === "image")).toBe(false);
    expect(results.results[0].content.at(-1)?.text).toMatch(/1 picture left out/);
    expect(r.stop).toBe("limit");
    expect((r.error as LimitReached).limit).toBe("tool_bytes");
  });

  it("asks nothing when the pictures attached are too large to send", async () => {
    const adapter = scriptedAdapter([{ text: "Hi." }]);
    const r = await runTurn({ store: store(), adapter, history: [], request: "copy this", images: [{ id: "ref1", dataUrl: `data:image/png;base64,${"A".repeat(100)}` }], lang: "en", limits: { attachmentBytes: 50 } });
    expect(r.stop).toBe("limit");
    expect((r.error as LimitReached).limit).toBe("attachments");
    expect(adapter.requests).toHaveLength(0);
  });

  it("gives OpenAI's Responses API an output cap as the others have", async () => {
    const f = fakeFetch(sseResponse(answer("ok")));
    const adapter = createAdapter({ provider: "openai", ...OPENAI }, { fetch: f });
    for await (const e of adapter.stream({ system: "", messages: [{ role: "user", content: "hi" }] })) void e;
    expect(f.calls[0].body.max_output_tokens).toBe(32000);
  });
});
