import { describe, expect, it } from "vitest";
import { AiHttpError } from "../ai";
import { chatCompletions, toChatMessages } from "./chat";
import { drain, fakeFetch, jagged, noSleep, sseResponse, sseText } from "./testkit";
import type { LlmEvent, Message } from "./types";

const make = (f: typeof fetch, over = {}) => chatCompletions({ baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash", key: "k", maxTokens: 8192, fetch: f, sleep: noSleep, ...over });
const ASK: Message[] = [{ role: "user", content: "Look up Lumen and Ostra" }];
const doneOf = (events: LlmEvent[]) => events.find((e): e is Extract<LlmEvent, { type: "done" }> => e.type === "done")!;
const chunk = (delta: object, finish: string | null = null) => ({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] });

/* the OpenAI streaming shape: the first piece of each call names it, the rest add to its arguments */
const STREAM = sseText([
  chunk({ role: "assistant", content: null, reasoning_content: "Two lookups." }),
  chunk({ content: "Checking ×2. " }),
  chunk({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "lookup", arguments: "" } }] }),
  chunk({ tool_calls: [{ index: 0, function: { arguments: '{"city":' } }] }),
  chunk({ tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "lookup", arguments: '{"city":"Ostra"}' } }] }),
  chunk({ tool_calls: [{ index: 0, function: { arguments: '"Lumen"}' } }] }),
  chunk({}, "tool_calls"),
  { id: "c", choices: [], usage: { prompt_tokens: 100, completion_tokens: 40, prompt_cache_hit_tokens: 64, completion_tokens_details: { reasoning_tokens: 12 } } },
  "[DONE]",
]);

describe("the chat completions adapter", () => {
  it("puts streamed calls together by index, whatever the pieces", async () => {
    for (const sizes of [undefined, jagged(5), jagged(9, 3)]) {
      const events = await drain(make(fakeFetch(sseResponse(STREAM, { sizes }))).stream({ system: "sys", messages: ASK }));
      expect(events.map((e) => e.type)).toEqual(["reasoning", "text", "tool_call_start", "tool_call_delta", "tool_call_start", "tool_call_delta", "tool_call_delta", "tool_call", "tool_call", "usage", "done"]);
      const done = doneOf(events);
      expect(done.stop).toBe("tool_use");
      expect(done.usage).toEqual({ input: 100, output: 40, reasoning: 12, cachedInput: 64, cacheWrite: 0 });
      expect(done.message.content).toEqual([
        { type: "reasoning", text: "Two lookups." },
        { type: "text", text: "Checking ×2. " },
        { type: "tool_call", id: "call_a", name: "lookup", args: { city: "Lumen" }, argsText: '{"city":"Lumen"}' },
        { type: "tool_call", id: "call_b", name: "lookup", args: { city: "Ostra" }, argsText: '{"city":"Ostra"}' },
      ]);
    }
  });

  it("asks for a stream with usage, the tools and a capped answer", async () => {
    const f = fakeFetch(sseResponse(STREAM));
    await drain(make(f, { reasoningEffort: "high" }).stream({ system: "sys", messages: ASK, tools: [{ name: "lookup", description: "d", parameters: { type: "object" } }] }));
    expect(f.calls[0].url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(f.calls[0].body).toEqual({
      model: "deepseek-v4-flash",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "Look up Lumen and Ostra" },
      ],
      tools: [{ type: "function", function: { name: "lookup", description: "d", parameters: { type: "object" } } }],
      tool_choice: "auto",
      max_tokens: 8192,
      reasoning_effort: "high",
      stream: true,
      stream_options: { include_usage: true },
    });
    const g = fakeFetch(sseResponse(STREAM));
    await drain(make(g, { key: "", baseUrl: "http://localhost:11434/v1", maxTokensParam: null, includeUsage: false }).stream({ system: "", messages: ASK }));
    expect(g.calls[0].init.headers).not.toHaveProperty("authorization");
    for (const k of ["max_tokens", "stream_options", "tools"]) expect(g.calls[0].body).not.toHaveProperty(k);
  });

  it("tells calls apart when a server numbers them all 0 or not at all, and keeps Gemini's thought signatures", async () => {
    const sig = { google: { thought_signature: "sig-1" } };
    const gemini = sseText([
      chunk({ role: "assistant", tool_calls: [{ index: 0, id: "g1", type: "function", function: { name: "lookup", arguments: '{"city":"Lumen"}' }, extra_content: sig }] }),
      chunk({ tool_calls: [{ index: 0, id: "g2", type: "function", function: { name: "lookup", arguments: '{"city":"Ostra"}' } }] }),
      chunk({ tool_calls: [{ id: "g3", type: "function", function: { name: "calc", arguments: '{"e":"1"}' } }] }, "stop"),
      "[DONE]",
    ]);
    const done = doneOf(await drain(make(fakeFetch(sseResponse(gemini)), { model: "gemini-3.8-flash" }).stream({ system: "", messages: ASK })));
    expect(done.stop).toBe("tool_use");
    expect(done.message.content.map((p) => (p.type === "tool_call" ? `${p.id}:${p.argsText}` : p.type))).toEqual(['g1:{"city":"Lumen"}', 'g2:{"city":"Ostra"}', 'g3:{"e":"1"}']);
    expect(done.message.content[0]).toMatchObject({ native: { extra_content: sig } });
    /* the signature and DeepSeek's reasoning go back to the model that wrote them, and to no other */
    const replay = toChatMessages("", [{ ...done.message, content: [{ type: "reasoning", text: "why" }, ...done.message.content] }], "gemini-3.8-flash");
    expect(replay[0]).toMatchObject({ role: "assistant", content: "", reasoning_content: "why", tool_calls: [{ id: "g1", type: "function", function: { name: "lookup", arguments: '{"city":"Lumen"}' }, extra_content: sig }, { id: "g2" }, { id: "g3" }] });
    const other = toChatMessages("", [{ ...done.message, content: [{ type: "reasoning", text: "why" }, ...done.message.content] }], "deepseek-v4-flash");
    expect(other[0]).not.toHaveProperty("reasoning_content");
    expect((other[0].tool_calls as object[])[0]).not.toHaveProperty("extra_content");
  });

  it("sends pictures as image parts, and a tool's pictures in a user message after the tool messages", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const msgs = toChatMessages(
      "",
      [
        { role: "user", content: [{ type: "text", text: "look" }, { type: "image", dataUrl: png, detail: "low" }] },
        { role: "assistant", content: [{ type: "tool_call", id: "a", name: "shot", args: {}, argsText: "" }, { type: "tool_call", id: "b", name: "calc", args: {}, argsText: "{}" }] },
        { role: "tool", results: [{ callId: "a", name: "shot", content: [{ type: "image", dataUrl: png }] }, { callId: "b", name: "calc", content: [{ type: "text", text: "bad" }], isError: true }] },
      ],
      "m",
    );
    expect(msgs).toEqual([
      { role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: png, detail: "low" } }] },
      { role: "assistant", content: "", tool_calls: [{ id: "a", type: "function", function: { name: "shot", arguments: "{}" } }, { id: "b", type: "function", function: { name: "calc", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "a", content: "(the image follows below)" },
      { role: "tool", tool_call_id: "b", content: "Error: bad" },
      { role: "user", content: [{ type: "text", text: "Image returned by shot (a):" }, { type: "image_url", image_url: { url: png } }] },
    ]);
  });

  it("maps a cut-off answer, a filtered one, an error chunk and a stream that just stops", async () => {
    const run = async (text: string) => drain(make(fakeFetch(sseResponse(text))).stream({ system: "", messages: ASK }));
    expect(doneOf(await run(sseText([chunk({ content: "long" }, "length"), "[DONE]"]))).stop).toBe("max_tokens");
    expect(doneOf(await run(sseText([chunk({ content: "" }, "content_filter")]))).stop).toBe("refusal");
    expect(doneOf(await run(sseText([chunk({ content: "ok" }, "stop")]))).message.content).toEqual([{ type: "text", text: "ok" }]);
    const err = await run(sseText([chunk({ content: "Hal" }), { error: { code: 503, message: "The model is overloaded" } }]));
    expect(err.map((e) => e.type)).toEqual(["text", "error"]);
    expect((err[1] as { error: AiHttpError }).error.status).toBe(503);
    const cut = await run(sseText([chunk({ content: "Hal" })]));
    expect((cut[1] as { error: AiHttpError }).error.status).toBe(502);
  });
});
