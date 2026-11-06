import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiHttpError } from "../ai";
import { openAiResponses, toResponsesInput } from "./openai";
import { drain, fakeFetch, jagged, noSleep, sseResponse, sseText } from "./testkit";
import { textOf, type AssistantMessage, type LlmEvent, type Message } from "./types";

/* recorded from the live API: a commentary message, then two parallel lookups */
const RECORDED = readFileSync(new URL("./fixtures/responses-tools.sse", import.meta.url), "utf8");
/* recorded from the live API at medium effort (an SVG written as text), its runs of deltas merged and
   its encrypted reasoning shortened to keep the file small */
const REASONING = readFileSync(new URL("./fixtures/responses-reasoning.sse", import.meta.url), "utf8");

const adapter = (f: typeof fetch, over = {}) => openAiResponses({ baseUrl: "https://api.example.test/v1/", model: "gpt-6.1-sol", key: " sk-test ", effort: "medium", summary: "auto", fetch: f, sleep: noSleep, ...over });
const ASK: Message[] = [{ role: "user", content: "Look up Lumen and Ostra" }];
const doneOf = (events: LlmEvent[]) => events.find((e): e is Extract<LlmEvent, { type: "done" }> => e.type === "done")!;
const completed = (output: object[], usage = { input_tokens: 5, output_tokens: 2 }) => ({ type: "response.completed", response: { status: "completed", output, usage } });

describe("the Responses adapter", () => {
  it("streams a recorded answer with parallel calls, in pieces cut anywhere", async () => {
    for (const seed of [0, 7]) {
      const f = fakeFetch(sseResponse(RECORDED, { sizes: seed ? jagged(seed) : undefined }));
      const events = await drain(adapter(f).stream({ system: "sys", messages: ASK }));
      const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
      expect(text).toBe("I’ll look up both populations at once, then use the calculator to compute Lumen × 3 + Ostra.\n");
      expect(events.filter((e) => e.type !== "text").map((e) => e.type)).toEqual(["tool_call_start", "tool_call_delta", "tool_call", "tool_call_start", "tool_call_delta", "tool_call", "usage", "done"]);
      expect(events.find((e) => e.type === "tool_call_delta")).toEqual({ type: "tool_call_delta", id: "call_p3LVixJkTXkwuXos27HQ2BNL", delta: '{"city":"Lumen"}' });
      const done = doneOf(events);
      expect(done.stop).toBe("tool_use");
      expect(done.usage).toEqual({ input: 132, output: 79, reasoning: 0, cachedInput: 0, cacheWrite: 0 });
      expect(done.message.kind).toBe("openai-responses");
      expect(done.message.content.map((p) => p.type)).toEqual(["text", "tool_call", "tool_call"]);
      expect(done.message.content[2]).toMatchObject({ id: "call_j1rqDVNVDyoNiJ5heBlj1QIr", name: "lookup", args: { city: "Ostra" }, native: { type: "function_call", id: "fc_03aa5a66ce9cc158016aed43358fac87d292261b6954e19d79" } });
      expect((done.message.content[0].native as { phase: string }).phase).toBe("commentary");
    }
  });

  it("asks statelessly, with encrypted reasoning, a streamed answer and the tools", async () => {
    const f = fakeFetch(sseResponse(RECORDED));
    await drain(adapter(f, { maxOutputTokens: 9000, promptCacheKey: "doc-1" }).stream({ system: "sys", messages: ASK, tools: [{ name: "lookup", description: "d", parameters: { type: "object", properties: {} } }] }));
    const { url, init, body } = f.calls[0];
    expect(url).toBe("https://api.example.test/v1/responses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(body).toEqual({
      model: "gpt-6.1-sol",
      instructions: "sys",
      input: [{ role: "user", content: [{ type: "input_text", text: "Look up Lumen and Ostra" }] }],
      tools: [{ type: "function", name: "lookup", description: "d", parameters: { type: "object", properties: {} }, strict: false }],
      tool_choice: "auto",
      parallel_tool_calls: true,
      reasoning: { effort: "medium", summary: "auto" },
      max_output_tokens: 9000,
      prompt_cache_key: "doc-1",
      store: false,
      include: ["reasoning.encrypted_content"],
      stream: true,
      stream_options: { include_obfuscation: false },
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("previous_response_id");
  });

  it("leaves reasoning settings out for a model that does not reason", async () => {
    const f = fakeFetch(sseResponse(RECORDED));
    await drain(adapter(f, { effort: undefined, summary: undefined }).stream({ system: "", messages: ASK }));
    expect(f.calls[0].body).not.toHaveProperty("reasoning");
    expect(f.calls[0].body).not.toHaveProperty("instructions");
    expect(f.calls[0].body).not.toHaveProperty("tools");
  });

  it("streams a reasoning summary and keeps the encrypted item for the next step", async () => {
    const reasoning = { id: "rs_1", type: "reasoning", summary: [{ type: "summary_text", text: "Plan." }, { type: "summary_text", text: "Then act." }], encrypted_content: "gAAAA-secret" };
    const call = { id: "fc_1", type: "function_call", call_id: "call_1", name: "calc", arguments: '{"expression":"1+1"}', status: "completed" };
    const f = fakeFetch(
      sseResponse(
        sseText([
          { type: "response.output_item.added", output_index: 0, item: { id: "rs_1", type: "reasoning", summary: [] } },
          { type: "response.reasoning_summary_text.delta", item_id: "rs_1", summary_index: 0, delta: "Plan." },
          { type: "response.reasoning_summary_text.delta", item_id: "rs_1", summary_index: 1, delta: "Then act." },
          { type: "response.output_item.done", output_index: 0, item: reasoning },
          { type: "response.output_item.added", output_index: 1, item: { ...call, arguments: "", status: "in_progress" } },
          { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 1, delta: '{"expression":' },
          { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 1, delta: '"1+1"}' },
          { type: "response.output_item.done", output_index: 1, item: call },
          completed([reasoning, call], { input_tokens: 50, output_tokens: 30, input_tokens_details: { cached_tokens: 40, cache_write_tokens: 3 }, output_tokens_details: { reasoning_tokens: 20 } } as never),
        ]),
      ),
    );
    const events = await drain(adapter(f).stream({ system: "", messages: ASK }));
    expect(events.filter((e) => e.type === "reasoning").map((e) => (e as { delta: string }).delta)).toEqual(["Plan.", "\n\n", "Then act."]);
    expect(events.filter((e) => e.type === "tool_call_delta").map((e) => (e as { id: string }).id)).toEqual(["call_1", "call_1"]);
    const done = doneOf(events);
    expect(done.usage).toEqual({ input: 50, output: 30, reasoning: 20, cachedInput: 40, cacheWrite: 3 });
    expect(done.message.content[0]).toEqual({ type: "reasoning", text: "Plan.\n\nThen act.", native: reasoning });

    /* the next step replays the reasoning item and the call exactly, then the result */
    const next: Message[] = [...ASK, done.message, { role: "tool", results: [{ callId: "call_1", name: "calc", content: [{ type: "text", text: "2" }] }] }];
    expect(toResponsesInput(next, "gpt-6.1-sol")).toEqual([{ role: "user", content: [{ type: "input_text", text: "Look up Lumen and Ostra" }] }, reasoning, call, { type: "function_call_output", call_id: "call_1", output: "2" }]);
  });

  it("streams a recorded reasoning summary, paragraph by paragraph, and keeps the encrypted item", async () => {
    const events = await drain(adapter(fakeFetch(sseResponse(REASONING, { sizes: jagged(9, 64) }))).stream({ system: "", messages: ASK }));
    const reasoning = events.filter((e) => e.type === "reasoning").map((e) => (e as { delta: string }).delta).join("");
    expect(reasoning.startsWith("**Designing gear teeth outline**")).toBe(true);
    expect(reasoning).toContain("\n\n**Simulating coordinates for design**");
    const done = doneOf(events);
    expect(done.stop).toBe("end_turn");
    expect(done.usage).toEqual({ input: 293, output: 688, reasoning: 410, cachedInput: 0, cacheWrite: 0 });
    expect(done.message.content.map((p) => p.type)).toEqual(["reasoning", "text"]);
    expect(done.message.content[0]).toMatchObject({ text: reasoning });
    const item = done.message.content[0].native as { type: string; encrypted_content: string };
    expect(item.type).toBe("reasoning");
    expect(item.encrypted_content.length).toBeGreaterThan(10);
    expect(textOf(done.message)).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24">[\s\S]*<\/svg>$/);
    expect(toResponsesInput([done.message], "gpt-6.1-sol")[0]).toBe(item);
  });

  it("rebuilds another model's answer plainly and leaves its reasoning out", () => {
    const foreign: AssistantMessage = {
      role: "assistant",
      kind: "anthropic",
      model: "claude-x",
      content: [
        { type: "reasoning", text: "hmm", native: { type: "thinking", signature: "s" } },
        { type: "text", text: "Sure.", native: { type: "text", text: "Sure." } },
        { type: "tool_call", id: "toolu_1", name: "calc", args: { e: 1 }, argsText: '{"e":1}', native: { type: "tool_use" } },
      ],
    };
    expect(toResponsesInput([foreign], "gpt-6.1-sol")).toEqual([
      { role: "assistant", content: "Sure." },
      { type: "function_call", call_id: "toolu_1", name: "calc", arguments: '{"e":1}' },
    ]);
    /* the same provider but another model: its encrypted items stay out too */
    expect(toResponsesInput([{ ...foreign, kind: "openai-responses", model: "gpt-other" }], "gpt-6.1-sol")).toHaveLength(2);
  });

  it("maps pictures from the author and from tools, and marks a failed tool", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const input = toResponsesInput(
      [
        { role: "user", content: [{ type: "text", text: "look" }, { type: "image", dataUrl: png, detail: "high" }] },
        {
          role: "tool",
          results: [
            { callId: "c1", name: "screenshot", content: [{ type: "text", text: "Canvas:" }, { type: "image", dataUrl: png }] },
            { callId: "c2", name: "calc", content: [{ type: "text", text: "division by zero" }], isError: true },
            { callId: "c3", name: "noop", content: [] },
          ],
        },
      ],
      "m",
    );
    expect(input).toEqual([
      { role: "user", content: [{ type: "input_text", text: "look" }, { type: "input_image", image_url: png, detail: "high" }] },
      { type: "function_call_output", call_id: "c1", output: [{ type: "input_text", text: "Canvas:" }, { type: "input_image", image_url: png, detail: "auto" }] },
      { type: "function_call_output", call_id: "c2", output: "Error: division by zero" },
      { type: "function_call_output", call_id: "c3", output: "(no output)" },
    ]);
  });

  it("says how an unfinished answer ended", async () => {
    const msg = { type: "message", content: [{ type: "output_text", text: "part" }] };
    const run = async (events: object[]) => doneOf(await drain(adapter(fakeFetch(sseResponse(sseText(events)))).stream({ system: "", messages: ASK })));
    expect((await run([{ type: "response.incomplete", response: { output: [msg], incomplete_details: { reason: "max_output_tokens" }, usage: {} } }])).stop).toBe("max_tokens");
    expect((await run([{ type: "response.incomplete", response: { output: [], incomplete_details: { reason: "content_filter" }, usage: {} } }])).stop).toBe("refusal");
    const refused = await run([{ type: "response.refusal.delta", delta: "I can't" }, completed([{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }])]);
    expect(refused.stop).toBe("refusal");
    expect(refused.message.content[0]).toMatchObject({ type: "text", text: "I can't help with that." });
    /* items only seen one by one still make the answer when the final event repeats none */
    const fromItems = await run([{ type: "response.output_item.done", output_index: 0, item: msg }, { type: "response.completed", response: { usage: {} } }]);
    expect(fromItems.message.content).toMatchObject([{ type: "text", text: "part" }]);
    expect(fromItems.stop).toBe("end_turn");
  });

  it("retries a failed response that showed nothing, and maps stream errors to statuses", async () => {
    const failed = sseText([{ type: "response.created", response: {} }, { type: "response.failed", response: { error: { code: "server_error", message: "boom" } } }]);
    const ok = sseText([completed([{ type: "message", content: [{ type: "output_text", text: "fine" }] }])]);
    const f = fakeFetch(sseResponse(failed), sseResponse(ok));
    const events = await drain(adapter(f).stream({ system: "", messages: ASK }));
    expect(f.calls.length).toBe(2);
    expect(events.map((e) => e.type)).toEqual(["retry", "usage", "done"]);

    const midway = sseText([{ type: "response.output_text.delta", delta: "Hal" }, ["error", { type: "error", code: "rate_limit_exceeded", message: "Slow down" }]]);
    const g = fakeFetch(sseResponse(midway));
    const events2 = await drain(adapter(g).stream({ system: "", messages: ASK }));
    expect(g.calls.length).toBe(1);
    const err = (events2[events2.length - 1] as { error: AiHttpError }).error;
    expect(err).toBeInstanceOf(AiHttpError);
    expect(err.status).toBe(429);
    expect(err.message).toContain("Slow down");
  });

  it("treats a stream that stops before the end as a failure", async () => {
    const cut = sseText([{ type: "response.output_text.delta", delta: "Hal" }]);
    const events = await drain(adapter(fakeFetch(sseResponse(cut))).stream({ system: "", messages: ASK }));
    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
    expect((events[1] as { error: AiHttpError }).error.status).toBe(502);
  });

  it("maps a refused key without retrying", async () => {
    const f = fakeFetch(new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 }));
    const events = await drain(adapter(f).stream({ system: "", messages: ASK }));
    expect(f.calls.length).toBe(1);
    expect(events).toHaveLength(1);
    expect((events[0] as { error: AiHttpError }).error).toMatchObject({ status: 401, message: "401: Incorrect API key provided" });
  });

  it("stops at once when aborted mid-stream", async () => {
    const ctl = new AbortController();
    const f = fakeFetch((init) => sseResponse(sseText([{ type: "response.output_text.delta", delta: "Hal" }]), { signal: init.signal ?? undefined, hang: true }));
    const seen: LlmEvent[] = [];
    for await (const e of adapter(f).stream({ system: "", messages: ASK }, ctl.signal)) {
      seen.push(e);
      if (e.type === "text") ctl.abort();
    }
    expect(seen.map((e) => e.type)).toEqual(["text", "error"]);
    expect((seen[1] as { error: Error }).error.name).toBe("AbortError");
  });
});
