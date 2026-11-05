import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, generateImage, hasImageKey, hasKey, isSecureUrl, scenePrompt, scenesFirst, scenesToPaint, readableOnScenes, withoutSampleWords, type AiSettings, type Provider } from "./ai";
import { makeItem, type Doc } from "./tokens";

const settings = (over: Partial<AiSettings> = {}): AiSettings =>
  ({ provider: "openai", baseUrl: "https://api.example.test", model: "test-model", key: "test-key", ...over });

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe("complete on the claude path", () => {
  it("posts to the messages endpoint with the anthropic headers and body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "hi" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const s = settings({ provider: "claude", baseUrl: "https://api.example.test/", key: "  test-key  " });
    await expect(complete(s, "sys prompt", "user prompt")).resolves.toBe("hi");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "test-model", max_tokens: 4096, system: "sys prompt", messages: [{ role: "user", content: "user prompt" }] });
  });

  it("joins only the text blocks of the reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      content: [{ type: "text", text: "a" }, { type: "tool_use", id: "t" }, { type: "text", text: "b" }],
    })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).resolves.toBe("ab");
  });

  it("returns an empty string for an empty content array instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [] })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).resolves.toBe("");
  });

  it("throws long when the reply stops at max_tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).rejects.toThrow("long");
  });

  it("throws refusal when the model refuses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ content: [], stop_reason: "refusal" })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).rejects.toThrow("refusal");
  });

  it("throws the status and provider detail on an http error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 529, statusText: "Overloaded" })));
    await expect(complete(settings({ provider: "claude" }), "s", "u")).rejects.toThrow("529 Overloaded: overloaded");
  });
});

describe("complete on the openai-compatible path", () => {
  it("sends bearer auth and omits max_tokens for the openai provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings(), "sys prompt", "user prompt")).resolves.toBe("ok");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer test-key" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "test-model", messages: [{ role: "system", content: "sys prompt" }, { role: "user", content: "user prompt" }] });
    expect(body).not.toHaveProperty("max_tokens");
  });

  it.each(["gemini", "deepseek"] as Provider[])("sends a max_tokens budget to %s", async (provider) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings({ provider }), "s", "u")).resolves.toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(4096);
  });

  it("calls a local endpoint without a key and without an authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "local" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const s = settings({ baseUrl: "http://localhost:11434/v1/", key: "" });
    await expect(complete(s, "s", "u")).resolves.toBe("local");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("joins array content parts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: [{ text: "a" }, {}, { text: "b" }] } }] })));
    await expect(complete(settings(), "s", "u")).resolves.toBe("ab");
  });

  it("throws long when finish_reason is length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "length", message: { content: "partial" } }] })));
    await expect(complete(settings(), "s", "u")).rejects.toThrow("long");
  });

  it("throws the status and provider detail on an http error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401, statusText: "Unauthorized" })));
    await expect(complete(settings(), "s", "u")).rejects.toThrow("401 Unauthorized: bad key");
  });

  it("throws empty when the reply has no content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [{ finish_reason: "stop", message: {} }] })));
    await expect(complete(settings(), "s", "u")).rejects.toThrow("empty");
  });
});

describe("complete input guards", () => {
  it.each([
    ["insecure", { baseUrl: "http://api.example.test" }],
    ["model", { model: "  " }],
  ])("rejects %s without calling fetch", async (message, over) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings(over), "s", "u")).rejects.toThrow(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hasKey and isSecureUrl", () => {
  it("requires a key for hosted endpoints but not for this machine", () => {
    expect(hasKey(settings())).toBe(true);
    expect(hasKey(settings({ key: "  " }))).toBe(false);
    expect(hasKey(settings({ key: "", baseUrl: "http://localhost:11434/v1" }))).toBe(true);
  });

  it("only allows https or an endpoint on this machine", () => {
    expect(isSecureUrl("https://api.example.test/v1")).toBe(true);
    expect(isSecureUrl("http://localhost:8080/v1")).toBe(true);
    expect(isSecureUrl("http://127.0.0.1:8080/v1")).toBe(true);
    expect(isSecureUrl("http://[::1]:8080/v1")).toBe(true);
    expect(isSecureUrl("http://api.example.test/v1")).toBe(false);
  });
});

describe("Sonnet 5.5 on Anthropic's own API", () => {
  const sonnet = { provider: "claude", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5-5", key: "k" } as AiSettings;
  afterEach(() => vi.unstubAllGlobals());
  const sent = async (s: AiSettings) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" })));
    vi.stubGlobal("fetch", fetchMock);
    await complete(s, "sys", "user", undefined, 12000);
    return { body: JSON.parse(fetchMock.mock.calls[0][1].body), headers: fetchMock.mock.calls[0][1].headers };
  };
  it("asks for the fallback, with room for a whole draft", async () => {
    const { body, headers } = await sent(sonnet);
    expect(body).toMatchObject({ fallbacks: "default", max_tokens: 12000 });
    expect(headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
  });
  it("sends no fallback to another model or another address, which would refuse it", async () => {
    for (const other of [{ ...sonnet, model: "claude-sonnet-5" }, { ...sonnet, baseUrl: "https://proxy.example.com" }]) {
      const { body, headers } = await sent(other);
      expect(body).not.toHaveProperty("fallbacks");
      expect(headers).not.toHaveProperty("anthropic-beta");
    }
  });
});

describe("withoutSampleWords", () => {
  const doc = (props: Record<string, unknown>, slug = "item") => ({ groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem(slug), id: "i", props }] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" }) as Doc;
  const read = (d: Doc, key: string) => d.groups[0].items[0].props?.[key];
  it("leaves empty what the model left out, and keeps what it wrote", () => {
    const out = withoutSampleWords(doc({ items: [{ label: "拿铁" }], trailing: "icon" }));
    expect(read(out, "description")).toBe("");
    expect(read(out, "items")).toEqual([{ label: "拿铁" }]);
    expect(read(withoutSampleWords(doc({ description: "每行一样" })), "description")).toBe("每行一样");
  });
  it("leaves a default that is a setting, not words", () => {
    expect(read(withoutSampleWords(doc({}, "web-view")), "address")).toBeUndefined();
    expect(read(withoutSampleWords(doc({}, "item-cell")), "rarityColor")).toBeUndefined();
  });
});

describe("generateImage", () => {
  const base = { provider: "claude", baseUrl: "https://api.anthropic.com", model: "m", key: "writing-key" } as AiSettings;
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it("asks OpenAI for a small tall JPEG and hands back a picture", async () => {
    const fetchMock = answer({ data: [{ b64_json: "/9j/AAAA" }] });
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateImage({ ...base, imageKey: "img-key" }, "a forest", { w: 412, h: 892 });
    expect(out).toBe("data:image/jpeg;base64,/9j/AAAA");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(init.headers.authorization).toBe("Bearer img-key");
    expect(JSON.parse(init.body)).toEqual({ model: "gpt-image-2.6-sunburst", prompt: "a forest", n: 1, size: "1024x1536", quality: "medium", output_format: "jpeg" });
  });

  it("asks for a GIF with its frames, smaller, and hands back a GIF", async () => {
    const fetchMock = answer({ data: [{ b64_json: "R0lGODlh" }] });
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateImage({ ...base, imageKey: "k" }, "rain", { w: 412, h: 892 }, undefined, { frames: 12, ms: 150 });
    expect(out).toBe("data:image/gif;base64,R0lGODlh");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ model: "gpt-image-2.6-sunburst", prompt: "rain", n: 1, size: "512x768", quality: "medium", output_format: "gif", frame_count: 12, frame_duration_ms: 150 });
  });

  it("paints a still with a model that cannot animate", async () => {
    const fetchMock = answer({ data: [{ b64_json: "iVBORw" }] });
    vi.stubGlobal("fetch", fetchMock);
    await generateImage({ ...base, imageProvider: "gemini", imageKey: "g" }, "rain", { w: 412, h: 892 }, undefined, { frames: 9, ms: 200 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.size).toBe("1024x1536");
    expect(body).not.toHaveProperty("frame_count");
  });

  it("asks Gemini the way its OpenAI-style route needs", async () => {
    const fetchMock = answer({ data: [{ b64_json: "iVBORw" }] });
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateImage({ ...base, imageProvider: "gemini", imageKey: "g" }, "a sea", { w: 1280, h: 800 });
    expect(out.startsWith("data:image/png;base64,")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/images/generations");
    expect(JSON.parse(init.body)).toEqual({ model: "gemini-2.5-flash-image", prompt: "a sea", n: 1, size: "1536x1024", response_format: "b64_json" });
  });

  it("says what went wrong, and refuses to send a key over plain http", async () => {
    vi.stubGlobal("fetch", answer({ error: { message: "no credit" } }, 402));
    await expect(generateImage({ ...base, imageKey: "k" }, "x", { w: 1, h: 1 })).rejects.toThrow("no credit");
    vi.stubGlobal("fetch", answer({ data: [] }));
    await expect(generateImage({ ...base, imageKey: "k" }, "x", { w: 1, h: 1 })).rejects.toThrow("empty");
    await expect(generateImage({ ...base, imageKey: "k", imageBaseUrl: "http://example.com/v1" }, "x", { w: 1, h: 1 })).rejects.toThrow("insecure");
  });

  it("shares a key only with the same provider: a Claude key opens nothing at OpenAI", () => {
    expect(hasImageKey(base)).toBe(false);
    expect(hasImageKey({ ...base, provider: "openai" })).toBe(true);
    expect(hasImageKey({ ...base, imageKey: "k" })).toBe(true);
  });
});

describe("scenes in a draft", () => {
  const scene = { ...makeItem("scene"), id: "s", props: { prompt: "a forest" } };
  const doc = { groups: [{ id: "bar", x: 0, y: 0, axis: "x", items: [{ ...makeItem("stat-bar"), id: "b" }] }, { id: "g", x: 0, y: 0, axis: "x", items: [scene] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as Doc;
  it("puts a scene behind what stands on it", () => {
    expect(scenesFirst(doc).groups.map((g) => g.id)).toEqual(["g", "bar"]);
  });
  it("paints only what has words and no picture", () => {
    expect(scenesToPaint(doc.groups).map((i) => i.id)).toEqual(["s"]);
    expect(scenesToPaint([{ ...doc.groups[1], items: [{ ...scene, props: { prompt: "x", image: "data:image/png;base64,a" } }] }])).toEqual([]);
    expect(scenesToPaint([{ ...doc.groups[1], items: [{ ...scene, props: { prompt: " " } }] }])).toEqual([]);
  });
  it("asks an animation for a loop that holds its view", () => {
    expect(scenePrompt("rain", "ink", true)).toContain("seamless loop");
    expect(scenePrompt("rain", "ink")).not.toContain("loop");
  });
  it("asks for the style, the words, and no interface in the picture", () => {
    const words = scenePrompt("a forest at dawn.", "watercolour");
    expect(words).toContain("watercolour. a forest at dawn.");
    expect(words).toContain("No text");
    expect(words).not.toContain("..");
  });
});

describe("readableOnScenes", () => {
  const part = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}, extra = {}) => ({ id, x, y, axis: "x", items: [{ ...makeItem(slug), id, props, ...extra }] });
  const doc = (groups: unknown[]) => ({ groups, frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" }) as Doc;
  const item = (d: Doc, id: string) => d.groups.find((g) => g.id === id)!.items[0];

  it("draws bare words light, and darkens a picture that had no darkening", () => {
    const out = readableOnScenes(doc([part("s", "scene", 0, 0), part("hp", "stat-bar", 16, 40)]));
    expect(item(out, "hp").textColor).toBe("inverseOnSurface");
    expect(item(out, "s").props?.scrim).toBe("full");
  });
  it("keeps the darkening and the colour already chosen", () => {
    const out = readableOnScenes(doc([part("s", "scene", 0, 0, { scrim: "top" }), part("hp", "stat-bar", 16, 40, {}, { textColor: "primary" })]));
    expect(item(out, "hp").textColor).toBe("primary");
    expect(item(out, "s").props?.scrim).toBe("top");
  });
  it("leaves parts with their own surface, and parts on another screen, alone", () => {
    const out = readableOnScenes(doc([part("s", "scene", 0, 0), part("say", "dialogue-box", 16, 600), part("far", "text", 600, 40)]));
    expect(item(out, "say").textColor).toBeUndefined();
    expect(item(out, "far").textColor).toBeUndefined();
    expect(item(out, "s").props?.scrim).toBeUndefined();
  });
  it("changes nothing on a document with no scene", () => {
    const d = doc([part("t", "text", 16, 40)]);
    expect(readableOnScenes(d)).toBe(d);
  });
});
