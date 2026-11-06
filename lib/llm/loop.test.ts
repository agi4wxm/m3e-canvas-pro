import { describe, expect, it } from "vitest";
import { AiHttpError, type AiSettings } from "../ai";
import { createAdapter } from "./index";
import { collectTurn, runAgent, type AgentEvent } from "./loop";
import { scriptedAdapter } from "./testkit";
import type { Message, ToolCall, ToolDef, ToolMessage } from "./types";

const TOOLS: ToolDef[] = ["lookup", "calc", "shot"].map((name) => ({ name, description: name, parameters: { type: "object" } }));
const ASK: Message[] = [{ role: "user", content: "go" }];
const call = (id: string, name: string, args: object | string = {}) => ({ id, name, argsText: typeof args === "string" ? args : JSON.stringify(args) });

describe("runAgent", () => {
  it("runs calls asked for together in the order written, feeds their results back and stops at the answer", async () => {
    const adapter = scriptedAdapter([
      { text: "Looking.", calls: [call("a", "lookup", { city: "Lumen" }), call("b", "lookup", { city: "Ostra" })], usage: { input: 100, output: 10, cachedInput: 50 } },
      { calls: [call("c", "calc", { e: "1+2" })], usage: { input: 120, output: 5, reasoning: 3 } },
      { text: "It is 3.", usage: { input: 130, output: 4 } },
    ]);
    const order: string[] = [];
    const events: AgentEvent[] = [];
    const r = await runAgent({
      adapter,
      system: "sys",
      messages: ASK,
      tools: TOOLS,
      onEvent: (e) => events.push(e),
      execute: async (c) => {
        order.push(c.id);
        await new Promise((res) => setTimeout(res, c.id === "a" ? 5 : 0));
        return c.name === "lookup" ? `pop of ${String(c.args?.city)}` : "3";
      },
    });
    expect(order).toEqual(["a", "b", "c"]);
    expect(r.stop).toBe("end_turn");
    expect(r.steps).toBe(3);
    expect(r.text).toBe("It is 3.");
    expect(r.usage).toEqual({ input: 350, output: 19, reasoning: 3, cachedInput: 50, cacheWrite: 0 });
    expect(r.messages.slice(0, 1)).toEqual(ASK);
    expect(r.added.map((m) => m.role)).toEqual(["assistant", "tool", "assistant", "tool", "assistant"]);
    expect((r.added[1] as ToolMessage).results).toEqual([
      { callId: "a", name: "lookup", content: [{ type: "text", text: "pop of Lumen" }] },
      { callId: "b", name: "lookup", content: [{ type: "text", text: "pop of Ostra" }] },
    ]);
    /* each step is asked with everything before it, the system prompt and the tools */
    expect(adapter.requests.map((q) => q.messages.length)).toEqual([1, 3, 5]);
    expect(adapter.requests[2].system).toBe("sys");
    expect(adapter.requests[2].tools).toEqual(TOOLS);
    expect(events.filter((e) => e.type === "step").map((e) => e.step)).toEqual([1, 2, 3]);
    expect(events.filter((e) => e.type === "tool_end").map((e) => (e as { call: ToolCall }).call.id)).toEqual(["a", "b", "c"]);
    expect(events.find((e) => e.type === "text")).toMatchObject({ step: 1, delta: "Looking." });
  });

  it("goes on from a conversation passed back in", async () => {
    const first = await runAgent({ adapter: scriptedAdapter([{ calls: [call("a", "calc")] }, { text: "one" }]), system: "", messages: ASK, tools: TOOLS, execute: () => "1" });
    const adapter = scriptedAdapter([{ text: "two" }]);
    const second = await runAgent({ adapter, system: "", messages: [...first.messages, { role: "user", content: "again" }], tools: TOOLS, execute: () => "x" });
    expect(adapter.requests[0].messages).toEqual([...first.messages, { role: "user", content: "again" }]);
    expect(second.messages.length).toBe(first.messages.length + 2);
    expect(second.added).toHaveLength(1);
    expect(second.text).toBe("two");
  });

  it("tells the model about a failing tool, an unknown one and arguments that are not JSON, and carries on", async () => {
    const adapter = scriptedAdapter([{ calls: [call("a", "calc", { e: "1/0" }), call("b", "nope"), call("c", "lookup", "{oops"), call("d", "shot")] }, { text: "done" }]);
    const ran: string[] = [];
    const r = await runAgent({
      adapter,
      system: "",
      messages: ASK,
      tools: TOOLS,
      execute: (c) => {
        ran.push(c.id);
        if (c.name === "calc") throw new Error("division by zero");
        return { content: [{ type: "image", dataUrl: "data:image/png;base64,AAAA" }] };
      },
    });
    expect(ran).toEqual(["a", "d"]);
    expect(r.stop).toBe("end_turn");
    const results = (r.added[1] as ToolMessage).results;
    expect(results[0]).toEqual({ callId: "a", name: "calc", content: [{ type: "text", text: "Error: division by zero" }], isError: true });
    expect(results[1].isError).toBe(true);
    expect((results[1].content[0] as { text: string }).text).toContain('Unknown tool "nope"');
    expect((results[2].content[0] as { text: string }).text).toContain("not a JSON object: {oops");
    expect(results[3]).toEqual({ callId: "d", name: "shot", content: [{ type: "image", dataUrl: "data:image/png;base64,AAAA" }] });
  });

  it("stops at the step cap with every call answered", async () => {
    const adapter = scriptedAdapter(Array.from({ length: 5 }, (_, i) => ({ calls: [call(`c${i}`, "calc")] })));
    const r = await runAgent({ adapter, system: "", messages: ASK, tools: TOOLS, execute: () => "ok", maxSteps: 2 });
    expect(r.stop).toBe("max_steps");
    expect(r.steps).toBe(2);
    expect(adapter.requests).toHaveLength(2);
    expect(r.messages[r.messages.length - 1].role).toBe("tool");
  });

  it("answers the calls it did not run when stopped during a tool", async () => {
    const ctl = new AbortController();
    const adapter = scriptedAdapter([{ calls: [call("a", "calc"), call("b", "calc"), call("c", "calc")] }, { text: "never" }]);
    const ran: string[] = [];
    const r = await runAgent({
      adapter,
      system: "",
      messages: ASK,
      tools: TOOLS,
      signal: ctl.signal,
      execute: (c) => {
        ran.push(c.id);
        if (c.id === "a") ctl.abort();
        return "ok";
      },
    });
    expect(ran).toEqual(["a"]);
    expect(r.stop).toBe("aborted");
    expect(adapter.requests).toHaveLength(1);
    expect((r.added[1] as ToolMessage).results.map((x) => x.isError ?? false)).toEqual([false, true, true]);
    expect((r.error as Error).name).toBe("AbortError");
  });

  it("keeps nothing of a turn stopped while it streamed", async () => {
    const ctl = new AbortController();
    const adapter = scriptedAdapter([[{ type: "text", delta: "Hal" }, { type: "text", delta: "f" }]]);
    const r = await runAgent({ adapter, system: "", messages: ASK, tools: TOOLS, execute: () => "", signal: ctl.signal, onEvent: (e) => e.type === "text" && ctl.abort() });
    expect(r.stop).toBe("aborted");
    expect(r.messages).toEqual(ASK);
    expect(r.added).toEqual([]);
  });

  it("returns the provider's error and the conversation as it was before the failed turn", async () => {
    const err = new AiHttpError(401, "401: bad key");
    const r = await runAgent({ adapter: scriptedAdapter([{ calls: [call("a", "calc")] }, { error: err }]), system: "", messages: ASK, tools: TOOLS, execute: () => "1" });
    expect(r.stop).toBe("error");
    expect(r.error).toBe(err);
    expect(r.added.map((m) => m.role)).toEqual(["assistant", "tool"]);
  });

  it("does not run calls cut off at the output limit, and does not keep a refusal", async () => {
    let ran = 0;
    const cut = await runAgent({ adapter: scriptedAdapter([{ calls: [call("a", "calc", '{"e":"1+')], stop: "max_tokens" }]), system: "", messages: ASK, tools: TOOLS, execute: () => String(++ran) });
    expect(ran).toBe(0);
    expect(cut.stop).toBe("max_tokens");
    expect((cut.added[1] as ToolMessage).results[0].isError).toBe(true);
    const long = await runAgent({ adapter: scriptedAdapter([{ text: "a long answer, cut", stop: "max_tokens" }]), system: "", messages: ASK, tools: TOOLS, execute: () => "" });
    expect(long.stop).toBe("max_tokens");
    expect(long.text).toBe("a long answer, cut");
    const refused = await runAgent({ adapter: scriptedAdapter([{ text: "I can't", stop: "refusal", usage: { input: 7 } }]), system: "", messages: ASK, tools: TOOLS, execute: () => "" });
    expect(refused.stop).toBe("refusal");
    expect(refused.added).toEqual([]);
    expect(refused.usage.input).toBe(7);
  });

  it("is not stopped by a listener that throws", async () => {
    const r = await runAgent({
      adapter: scriptedAdapter([{ text: "fine" }]),
      system: "",
      messages: ASK,
      tools: TOOLS,
      execute: () => "",
      onEvent: () => {
        throw new Error("ui bug");
      },
    });
    expect(r.stop).toBe("end_turn");
  });
});

describe("collectTurn", () => {
  it("reads one turn to its end, or throws its error", async () => {
    const t = await collectTurn(scriptedAdapter([{ text: "hi" }]), { system: "", messages: ASK });
    expect(t.stop).toBe("end_turn");
    expect(t.message.content).toEqual([{ type: "text", text: "hi" }]);
    await expect(collectTurn(scriptedAdapter([{ error: new Error("boom") }]), { system: "", messages: ASK })).rejects.toThrow("boom");
  });
});

describe("createAdapter", () => {
  it("speaks the protocol each provider calls tools through", () => {
    const s = (provider: AiSettings["provider"]): AiSettings => ({ provider, baseUrl: "https://x.test", model: "m", key: "k" });
    expect(createAdapter(s("openai")).kind).toBe("openai-responses");
    expect(createAdapter(s("claude")).kind).toBe("anthropic");
    expect(createAdapter(s("gemini")).kind).toBe("chat");
    expect(createAdapter(s("deepseek")).kind).toBe("chat");
  });
});
