/* Where the author's keys are kept (report 13.3 AI-5): for this tab's session unless they choose to have them
 * remembered, never in what a document, a log or an error says. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, loadAiSettings, saveAiSettings, type AiSettings } from "./ai";
import { fakeFetch, jsonResponse, sseResponse } from "./llm/testkit";
import { openAiResponses } from "./llm";

/** a Storage held in memory */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789";
const settings = (over: Partial<AiSettings> = {}): AiSettings => ({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-test", key: KEY, imageKey: "img-key-0123456789", ...over });

afterEach(() => vi.unstubAllGlobals());

describe("the keys", () => {
  it("are kept for the session only by default, and gone in a new one", () => {
    const local = memory();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", memory());
    saveAiSettings(settings());
    expect(local.getItem("m3e:ai")).not.toContain(KEY);
    expect(local.getItem("m3e:ai")).not.toContain("img-key");
    expect(loadAiSettings()).toMatchObject({ key: KEY, imageKey: "img-key-0123456789", model: "gpt-test", rememberKey: false });
    /* a new session: the settings are there, the keys are not */
    vi.stubGlobal("sessionStorage", memory());
    expect(loadAiSettings()).toMatchObject({ key: "", model: "gpt-test", rememberKey: false });
  });

  it("are remembered when the author chooses, and taken out again when they stop", () => {
    const local = memory();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", memory());
    saveAiSettings(settings({ rememberKey: true }));
    vi.stubGlobal("sessionStorage", memory());
    expect(loadAiSettings()).toMatchObject({ key: KEY, rememberKey: true });
    saveAiSettings(settings({ rememberKey: false }));
    expect(local.getItem("m3e:ai")).not.toContain(KEY);
    vi.stubGlobal("sessionStorage", memory());
    expect(loadAiSettings().key).toBe("");
  });

  it("saved before there was a choice stay remembered", () => {
    const local = memory();
    local.setItem("m3e:ai", JSON.stringify({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-test", key: KEY }));
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", memory());
    expect(loadAiSettings()).toMatchObject({ key: KEY, rememberKey: true });
  });

  it("are cut out of what a provider's error says", async () => {
    const echo = { error: { message: `Incorrect API key provided: ${KEY}.` } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(echo), { status: 401 })));
    const e = (await complete(settings(), "s", "u").catch((x) => x)) as Error;
    expect(e.message).toContain("[key]");
    expect(e.message).not.toContain(KEY);
    const f = fakeFetch(jsonResponse(echo, 401), sseResponse(""));
    let said = "";
    for await (const ev of openAiResponses({ baseUrl: "https://api.openai.com/v1", model: "m", key: KEY, fetch: f }).stream({ system: "", messages: [] })) if (ev.type === "error") said = (ev.error as Error).message;
    expect(said).toContain("[key]");
    expect(said).not.toContain(KEY);
  });
});
