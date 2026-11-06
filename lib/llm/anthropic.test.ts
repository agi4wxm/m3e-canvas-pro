import { describe, expect, it } from "vitest";
import { AiHttpError } from "../ai";
import { anthropicMessages, toAnthropicMessages } from "./anthropic";
import { drain, fakeFetch, jagged, noSleep, sseResponse, sseText } from "./testkit";
import type { AssistantMessage, LlmEvent, Message } from "./types";

/* Anthropic keys cannot be used here, so the streams are written from the documented event format:
 * named events, a thinking block with its signature, text, and two parallel tool_use blocks whose
 * arguments arrive in pieces. */
const ev = (o: { type: string } & Record<string, unknown>): [string, object] => [o.type, o];
const STREAM = sseText([
  ev({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], usage: { input_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 300, output_tokens: 1 } } }),
  ev({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "I will look " } }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "both up." } }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "EqQBCkYI" } }),
  ev({ type: "content_block_stop", index: 0 }),
  ["ping", { type: "ping" }],
  ev({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
  ev({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Checking “both” ×2." } }),
  ev({ type: "content_block_stop", index: 1 }),
  ev({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_a", name: "lookup", input: {} } }),
  ev({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "" } }),
  ev({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"city": "Lu' } }),
  ev({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: 'men"}' } }),
  ev({ type: "content_block_stop", index: 2 }),
  ev({ type: "content_block_start", index: 3, content_block: { type: "tool_use", id: "toolu_b", name: "lookup", input: {} } }),
  ev({ type: "content_block_delta", index: 3, delta: { type: "input_json_delta", partial_json: '{"city":"Ostra"}' } }),
  ev({ type: "content_block_stop", index: 3 }),
  ev({ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 87 } }),
  ev({ type: "message_stop" }),
]);

const make = (f: typeof fetch, over = {}) => anthropicMessages({ baseUrl: "https://api.anthropic.com/", model: "claude-sonnet-5-5", key: "sk-ant-test", fetch: f, sleep: noSleep, ...over });
const ASK: Message[] = [{ role: "user", content: "Look up Lumen and Ostra" }];
const doneOf = (events: LlmEvent[]) => events.find((e): e is Extract<LlmEvent, { type: "done" }> => e.type === "done")!;
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("the Anthropic adapter", () => {
  it("streams thinking, text and parallel calls, cut anywhere", async () => {
    for (const sizes of [undefined, jagged(3), jagged(11, 5)]) {
      const events = await drain(make(fakeFetch(sseResponse(STREAM, { sizes }))).stream({ system: "s", messages: ASK }));
      expect(events.map((e) => e.type)).toEqual(["reasoning", "reasoning", "text", "tool_call_start", "tool_call_delta", "tool_call_delta", "tool_call", "tool_call_start", "tool_call_delta", "tool_call", "usage", "done"]);
      const calls = events.filter((e) => e.type === "tool_call").map((e) => (e as { call: unknown }).call);
      expect(calls).toEqual([
        { id: "toolu_a", name: "lookup", args: { city: "Lumen" }, argsText: '{"city": "Lumen"}' },
        { id: "toolu_b", name: "lookup", args: { city: "Ostra" }, argsText: '{"city":"Ostra"}' },
      ]);
      const done = doneOf(events);
      expect(done.stop).toBe("tool_use");
      /* input counts the cached part too; Anthropic reports it apart */
      expect(done.usage).toEqual({ input: 1320, output: 87, reasoning: 0, cachedInput: 1000, cacheWrite: 300 });
      expect(done.message.content[0]).toEqual({ type: "reasoning", text: "I will look both up.", native: { type: "thinking", thinking: "I will look both up.", signature: "EqQBCkYI" } });
      expect(done.message.content[1]).toMatchObject({ type: "text", text: "Checking “both” ×2." });
      expect(done.message.content[2]).toMatchObject({ type: "tool_call", id: "toolu_a", native: { type: "tool_use", id: "toolu_a", name: "lookup", input: { city: "Lumen" } } });
    }
  });

  it("asks with streaming, adaptive thinking shown as a summary, eager tool input, caching and the refusal fallback", async () => {
    const f = fakeFetch(sseResponse(STREAM));
    await drain(make(f, { effort: "high" }).stream({ system: "sys", messages: ASK, tools: [{ name: "lookup", description: "d", parameters: { type: "object" } }] }));
    const { url, init, body } = f.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true", "anthropic-beta": "server-side-fallback-2026-07-01" });
    expect(body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 32000,
      system: "sys",
      messages: [{ role: "user", content: [{ type: "text", text: "Look up Lumen and Ostra" }] }],
      tools: [{ name: "lookup", description: "d", input_schema: { type: "object" }, eager_input_streaming: true }],
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      cache_control: { type: "ephemeral" },
      fallbacks: "default",
      stream: true,
    });
  });

  it("keeps the extras off another endpoint, which may not know them", async () => {
    const f = fakeFetch(sseResponse(STREAM));
    await drain(make(f, { baseUrl: "https://gateway.example.test", model: "claude-haiku-4-5", thinking: "omit", maxTokens: 16000 }).stream({ system: "", messages: ASK, tools: [{ name: "t", description: "d", parameters: {} }], toolChoice: "none" }));
    const { url, init, body } = f.calls[0];
    expect(url).toBe("https://gateway.example.test/v1/messages");
    expect(init.headers).not.toHaveProperty("anthropic-beta");
    expect(body.max_tokens).toBe(16000);
    expect(body.tool_choice).toEqual({ type: "none" });
    for (const k of ["thinking", "cache_control", "fallbacks", "system", "output_config"]) expect(body).not.toHaveProperty(k);
    expect((body.tools as object[])[0]).not.toHaveProperty("eager_input_streaming");
  });

  it("replays its own blocks unchanged and in place, with tool results and pictures in one user turn", () => {
    const own: AssistantMessage = {
      role: "assistant",
      kind: "anthropic",
      model: "claude-sonnet-5-5",
      content: [
        { type: "reasoning", text: "x", native: { type: "thinking", thinking: "x", signature: "sig" } },
        { type: "reasoning", text: "", native: { type: "redacted_thinking", data: "opaque" } },
        { type: "tool_call", id: "toolu_a", name: "shot", args: {}, argsText: "", native: { type: "tool_use", id: "toolu_a", name: "shot", input: {} } },
      ],
    };
    const msgs: Message[] = [
      { role: "user", content: [{ type: "text", text: "look" }, { type: "image", dataUrl: PNG }] },
      own,
      { role: "tool", results: [{ callId: "toolu_a", name: "shot", content: [{ type: "text", text: "Canvas:" }, { type: "image", dataUrl: PNG }] }, { callId: "toolu_b", name: "x", content: [], isError: true }] },
      { role: "user", content: "and now?" },
    ];
    const image = { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } };
    expect(toAnthropicMessages(msgs)).toEqual([
      { role: "user", content: [{ type: "text", text: "look" }, image] },
      { role: "assistant", content: [{ type: "thinking", thinking: "x", signature: "sig" }, { type: "redacted_thinking", data: "opaque" }, { type: "tool_use", id: "toolu_a", name: "shot", input: {} }] },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolu_a", content: [{ type: "text", text: "Canvas:" }, image] },
          { type: "tool_result", tool_use_id: "toolu_b", content: [{ type: "text", text: "(no output)" }], is_error: true },
          { type: "text", text: "and now?" },
        ],
      },
    ]);
  });

  it("rebuilds another provider's answer without its reasoning, and drops a declined model's blocks before a fallback", () => {
    const foreign: AssistantMessage = { role: "assistant", kind: "openai-responses", model: "gpt", content: [{ type: "reasoning", text: "r", native: { type: "reasoning", encrypted_content: "e" } }, { type: "text", text: "ok", native: { type: "message" } }, { type: "tool_call", id: "c1", name: "t", args: null, argsText: "{bad", native: {} }] };
    expect(toAnthropicMessages([foreign])).toEqual([{ role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "c1", name: "t", input: {} }] }]);
    const switched: AssistantMessage = {
      role: "assistant",
      kind: "anthropic",
      content: [
        { type: "reasoning", text: "", native: { type: "thinking", thinking: "", signature: "a" } },
        { type: "text", text: "Part", native: { type: "text", text: "Part" } },
        { type: "reasoning", text: "", native: { type: "fallback", from: { model: "x" }, to: { model: "y" } } },
        { type: "reasoning", text: "", native: { type: "thinking", thinking: "", signature: "b" } },
        { type: "text", text: "rest", native: { type: "text", text: "rest" } },
      ],
    };
    expect(toAnthropicMessages([switched])[0].content.map((b) => b.signature ?? b.type)).toEqual(["text", "fallback", "b", "text"]);
  });

  it("maps how a turn ended", async () => {
    const end = (reason: string) => sseText([ev({ type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 1 } } }), ev({ type: "message_delta", delta: { stop_reason: reason }, usage: { output_tokens: 2 } }), ev({ type: "message_stop" })]);
    const stops: string[] = [];
    for (const r of ["end_turn", "stop_sequence", "max_tokens", "model_context_window_exceeded", "refusal", "tool_use"]) stops.push(doneOf(await drain(make(fakeFetch(sseResponse(end(r)))).stream({ system: "", messages: ASK }))).stop);
    expect(stops).toEqual(["end_turn", "end_turn", "max_tokens", "max_tokens", "refusal", "tool_use"]);
  });

  it("retries an overloaded stream that showed nothing, and reports one that failed midway", async () => {
    const overloaded = sseText([ev({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })]);
    const f = fakeFetch(sseResponse(overloaded), sseResponse(STREAM));
    const events = await drain(make(f).stream({ system: "", messages: ASK }));
    expect(f.calls.length).toBe(2);
    expect((events[0] as { error: AiHttpError }).error.status).toBe(529);
    expect(events[events.length - 1].type).toBe("done");

    const midway = STREAM.split("event: content_block_start")[0] + sseText([ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "Hi" } }), ev({ type: "error", error: { type: "api_error", message: "Internal" } })]);
    const g = fakeFetch(sseResponse(midway));
    const events2 = await drain(make(g).stream({ system: "", messages: ASK }));
    expect(g.calls.length).toBe(1);
    expect(events2.map((e) => e.type)).toEqual(["text", "error"]);
    expect((events2[1] as { error: AiHttpError }).error.status).toBe(500);
  });

  it("passes Anthropic's HTTP errors on in their status", async () => {
    const f = fakeFetch(new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401 }));
    const events = await drain(make(f).stream({ system: "", messages: ASK }));
    expect((events[0] as { error: AiHttpError }).error).toMatchObject({ status: 401, message: "401: invalid x-api-key" });
  });
});
