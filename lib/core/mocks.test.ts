/* The operations on the mock library, headless: each does what it says, refuses what would point at nothing (a model,
 * a field, an operation, a channel the API has not), is one undo step, and "fill the mocks" is one step for all of
 * it. The mock settings survive the project file (one line per entry, files beside a folder project) and come in
 * cleaned from a hostile one; through the tool registry the removals ask first. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { shopApi } from "../export/product.fixture";
import { openProject } from "../project";
import { CORE_REGISTRY, executeTool, isDestructiveCall } from "../tools";
import { takesOf } from "../tools/removals";
import { parseProject, serializeProject } from "./projectFile";
import { guessMeasurer, OpError } from "./op";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import * as ops from "./ops";
import type { Doc } from "../tokens";
import { dataUrl } from "../mocks/bytes";

beforeAll(() => setGlobalLang("en"));

const store = () => new DocStore(stateOf({ groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }], api: shopApi() }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "zh" });
const ai = { origin: "ai" as const };
const fails = (fn: () => unknown, code: string, words?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).code).toBe(code);
    if (words) expect((e as OpError).message).toMatch(words);
    return;
  }
  throw new Error("did not throw");
};

describe("filling the mocks", () => {
  it("writes hints, counts, scenarios and scripts in one undo step, in the editor's language", () => {
    const s = store();
    const out = s.run(ops.fillMocksOp, {}, ai) as { scenarios: string[]; hints: number };
    expect(out.scenarios).toEqual(["new-user", "lots", "network-error", "slow", "signed-out"]);
    expect(out.hints).toBeGreaterThan(20);
    const m = s.get().doc.mocks!;
    expect(m.locale).toBe("zh");
    expect(m.scenarios![0].name).toBe("新用户");
    expect(m.models!.find((x) => x.name === "User")!.hints!.email.kind).toBe("email");
    expect(m.models!.find((x) => x.name === "Product")!.count).toBe(24);
    expect(m.realtime!.length).toBeGreaterThan(0);
    s.undo();
    expect(s.get().doc.mocks).toBeUndefined();
    /* again over what is there: nothing new, and what the author set stays */
    s.redo();
    s.run(ops.setMockModel, { model: "User", hints: { email: { kind: "constant", value: "a@example.com" } } }, ai);
    fails(() => s.run(ops.fillMocksOp, { counts: 50 }, ai), "nothing_to_do");
    expect(s.get().doc.mocks!.models!.find((x) => x.name === "User")!.hints!.email.kind).toBe("constant");
  });

  it("refuses an empty API", () => {
    const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer });
    fails(() => s.run(ops.fillMocksOp, {}, ai), "refused", /API is empty/);
  });
});

describe("models", () => {
  it("sets a count and hints by field path, and refuses what is not there", () => {
    const s = store();
    s.run(ops.setMockModel, { model: "Product", count: 8, hints: { name: { kind: "productName" }, "price.amount": { kind: "price", min: 10, max: 20 } } }, ai);
    expect(s.get().doc.mocks!.models![0]).toMatchObject({ name: "Product", count: 8, hints: { name: { kind: "productName" }, "price.amount": { kind: "price", min: 10, max: 20 } } });
    s.run(ops.setMockModel, { model: "Product", hints: { name: null }, regenerate: true }, ai);
    expect(s.get().doc.mocks!.models![0].hints!.name).toBeUndefined();
    expect(s.get().doc.mocks!.models![0].seed).toBe(1);
    fails(() => s.run(ops.setMockModel, { model: "Nope", count: 3 }, ai), "not_found", /The models are/);
    fails(() => s.run(ops.setMockModel, { model: "Product", hints: { colour: { kind: "color" } } }, ai), "invalid_value", /not a field of Product/);
    fails(() => s.run(ops.setMockModel, { model: "Product", hints: { name: { kind: "sparkles" as "word" } } }, ai), "invalid_value", /kind one of/);
    fails(() => s.run(ops.setMockModel, { model: "Product", count: 8 }, ai), "nothing_to_do");
  });

  it("pins records, replacing one of the same id, and unpins them", () => {
    const s = store();
    const lamp = { id: "00000000-0000-4000-8000-000000000001", name: "Lamp" };
    s.run(ops.pinMockRecords, { model: "Product", records: [lamp, { id: "00000000-0000-4000-8000-000000000002", name: "Mug" }] }, ai);
    s.run(ops.pinMockRecords, { model: "Product", records: [{ ...lamp, name: "Desk lamp" }] }, ai);
    expect(s.get().doc.mocks!.models![0].fixtures!.map((r) => r.name)).toEqual(["Desk lamp", "Mug"]);
    expect(s.run(ops.unpinMockRecords, { model: "Product", ids: [lamp.id] }, ai)).toEqual({ model: "Product", unpinned: 1 });
    fails(() => s.run(ops.unpinMockRecords, { model: "Product", ids: ["nope"] }, ai), "not_found");
    s.run(ops.unpinMockRecords, { model: "Product", all: true }, ai);
    expect(s.get().doc.mocks).toBeUndefined();
  });
});

describe("scenarios", () => {
  it("adds, changes, chooses and removes a scenario; per-operation rules name real operations", () => {
    const s = store();
    expect(s.run(ops.addMockScenario, { name: "Payment fails", ops: { listOrders: { status: 503 } } }, ai)).toEqual({ id: "payment-fails" });
    fails(() => s.run(ops.addMockScenario, { name: "X", ops: { payNow: { status: 402 } } }, ai), "not_found", /no operation "payNow"/);
    s.run(ops.updateMockScenario, { id: "payment-fails", ops: { getMe: { sequence: [{ network: true }, {}] }, listOrders: null }, latency: { min: 100, max: 200 } }, ai);
    expect(s.get().doc.mocks!.scenarios![0]).toMatchObject({ id: "payment-fails", ops: { getMe: { sequence: [{ network: true }, {}] } }, latency: { min: 100, max: 200 } });
    s.run(ops.setMocks, { scenario: "payment-fails" }, ai);
    fails(() => s.run(ops.setMocks, { scenario: "nope" }, ai), "not_found");
    s.run(ops.updateMockScenario, { id: "payment-fails", rename: "pay" }, ai);
    expect(s.get().doc.mocks!.scenario).toBe("pay");
    s.run(ops.removeMockScenario, { id: "pay" }, ai);
    expect(s.get().doc.mocks).toBeUndefined();
  });
});

describe("files", () => {
  it("adds a file as a data URL, makes placeholders, renames, removes and unhooks it from hints", () => {
    const s = store();
    s.run(ops.addMockFile, { name: "Face.png", data: "data:image/png;base64,iVBORw0KGgo=", tags: ["avatar"] }, ai);
    fails(() => s.run(ops.addMockFile, { name: "x", data: "https://example.com/x.png" }, ai), "invalid_value", /data URL/);
    const made = s.run(ops.generateMockFiles, { kinds: ["image", "pdf", "audio", "video", "file"], title: "Spring" }, ai) as { ids: string[] };
    expect(made.ids).toHaveLength(5);
    const types = s.get().doc.mocks!.files!.map((f) => f.type);
    expect(types).toEqual(["image/png", "image/svg+xml", "application/pdf", "audio/wav", "video/mp4", "application/octet-stream"]);
    s.run(ops.setMockModel, { model: "User", hints: { avatar: { kind: "avatar", files: ["face"] } } }, ai);
    s.run(ops.updateMockFile, { id: "face", name: "me.png" }, ai);
    const out = s.run(ops.removeMockFile, { id: "face" }, ai) as { hints: string[] };
    expect(out.hints).toEqual(["User.avatar"]);
    expect(s.get().doc.mocks!.models![0].hints!.avatar.files).toBeUndefined();
  });
});

describe("realtime, sign-in, routes and clearing", () => {
  it("writes a script for a real channel and its messages", () => {
    const s = store();
    s.run(ops.setMockRealtime, { channel: "room", steps: [{ at: 500, message: "chatMessage", payload: { text: "Hi" } }], repeat: { every: 4000, times: 2 } }, ai);
    fails(() => s.run(ops.setMockRealtime, { channel: "nope", steps: [] }, ai), "not_found");
    fails(() => s.run(ops.setMockRealtime, { channel: "room", steps: [{ at: 0, message: "shout" }] }, ai), "invalid_value", /no message "shout"/);
    fails(() => s.run(ops.setMockRealtime, { channel: "room", trigger: { on: "call", operationId: "nope" }, steps: [] }, ai), "not_found");
    s.run(ops.removeMockRealtime, { id: "room-script" }, ai);
    /* an empty list says: no scripts, not the defaults */
    expect(s.get().doc.mocks?.realtime ?? []).toEqual([]);
  });

  it("sets sign-in and how an operation is answered, and clears everything", () => {
    const s = store();
    s.run(ops.setMockAuth, { signedIn: false, accept: [{ email: "demo@example.com", password: "demo12345" }], tokenTtl: 60 }, ai);
    s.run(ops.setMockRoute, { operationId: "getMe", kind: "singleton", model: "User" }, ai);
    fails(() => s.run(ops.setMockRoute, { operationId: "nope", kind: "list" }, ai), "not_found");
    expect(s.get().doc.mocks).toMatchObject({ auth: { signedIn: false, tokenTtl: 60 }, routes: [{ operationId: "getMe", kind: "singleton", model: "User" }] });
    s.run(ops.clearMocks, {}, ai);
    expect(s.get().doc.mocks).toBeUndefined();
    fails(() => s.run(ops.clearMocks, {}, ai), "nothing_to_do");
  });
});

describe("saved and opened", () => {
  const filled = () => {
    const s = store();
    s.run(ops.fillMocksOp, {}, ai);
    s.run(ops.generateMockFiles, { kinds: ["pdf", "image"], title: "Receipt" }, ai);
    s.run(ops.pinMockRecords, { model: "Product", records: [{ id: "00000000-0000-4000-8000-000000000001", name: "Lamp" }] }, ai);
    return savedDoc(s.get());
  };

  it("round-trips through the project file, one line per entry", () => {
    const doc = filled();
    const { text } = serializeProject(doc);
    const back = parseProject(text)!.doc;
    expect(back.mocks).toEqual(doc.mocks);
    expect(serializeProject(back).text).toBe(text);
    const lines = text.split("\n");
    const at = lines.findIndex((l) => l.trim() === '"scenarios": [');
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1].trim()).toMatch(/^\{"all":\{"empty":true\},"description":/);
  });

  it("keeps the library's files beside a folder project", () => {
    const doc = filled();
    const big = { ...doc, mocks: { ...doc.mocks!, files: doc.mocks!.files!.map((f) => (f.type === "application/pdf" ? { ...f, data: dataUrl("application/pdf", new Uint8Array(3000).fill(37)) } : f)) } } as Doc;
    const { text, files } = serializeProject(big, { assets: "files" });
    expect(files.some((f) => f.path.endsWith(".pdf") && f.mime === "application/pdf")).toBe(true);
    expect(text).toContain('"data":"m3e-file:m3e-assets/');
  });

  it("leaves a document without mocks as it was", () => {
    const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer });
    expect("mocks" in JSON.parse(JSON.stringify(savedDoc(s.get())))).toBe(false);
  });

  it("opens a hostile document's mocks cleaned and bounded", () => {
    const hostile = {
      format: "m3e-project",
      version: 2,
      document: {
        groups: [],
        frames: [],
        mocks: {
          seed: "x",
          locale: "fr",
          models: [{ name: "__proto__", count: 1e12 }, { name: "User", count: 1e12, hints: { email: { kind: "evil" }, name: { kind: "personName", nullRate: 9 } }, fixtures: [1, { a: 1 }] }],
          scenarios: [{ id: "a b", name: "bad" }, { id: "ok", name: "OK", ops: { x: { status: 9999, sequence: Array(100).fill({}) } } }],
          files: [{ id: "f", name: "../../x", data: "javascript:alert(1)" }, { id: "g", name: "a/b.png", data: "data:image/png;base64,AAAA" }],
          realtime: [{ id: "r", channel: "c", steps: [{ at: -5, message: "m" }, "junk"] }],
          auth: { tokenTtl: -1, accept: [{ email: 7 }] },
        },
      },
    };
    const doc = openProject(hostile)!;
    const m = doc.mocks!;
    expect(m.seed).toBeUndefined();
    expect(m.locale).toBeUndefined();
    expect(m.models).toEqual([{ name: "User", count: 5000, hints: { name: { kind: "personName", nullRate: 1 } }, fixtures: [{ a: 1 }] }]);
    expect(m.scenarios).toEqual([{ id: "ok", name: "OK", ops: { x: { status: 599, sequence: Array(20).fill({}) } } }]);
    expect(m.files).toEqual([{ id: "g", name: "a-b.png", type: "image/png", data: "data:image/png;base64,AAAA" }]);
    expect(m.realtime).toEqual([{ id: "r", channel: "c", steps: [{ at: 0, message: "m" }] }]);
    expect(m.auth).toEqual({ tokenTtl: 1 });
  });
});

describe("through the tools", () => {
  it("marks the removals, and sees pinned records going", async () => {
    const s = store();
    s.run(ops.fillMocksOp, {}, ai);
    s.run(ops.pinMockRecords, { model: "Product", records: [{ id: "00000000-0000-4000-8000-000000000001", name: "Lamp" }] }, ai);
    for (const name of ["remove_mock_scenario", "remove_mock_file", "unpin_mock_records", "remove_mock_realtime", "clear_mocks"]) expect(isDestructiveCall(name, {}), name).toBe(true);
    const takes = await takesOf(s, "pin_mock_records", { model: "Product", records: [], replace: true }, { registry: CORE_REGISTRY });
    expect(takes).toEqual([{ kind: "mockRecords", of: "Product", n: 1 }]);
  });

  it("reads the mocks, a model's records, and tries the API on a fresh session", async () => {
    const s = store();
    s.run(ops.fillMocksOp, {}, ai);
    const outline = await executeTool(s, "get_mocks", {}, { origin: "mcp" });
    expect(outline.ok && String(outline.result)).toContain("listProducts list Product paged by cursor");
    const recs = await executeTool(s, "list_mock_records", { model: "User", limit: 2 }, { origin: "mcp" });
    expect(recs.ok && (recs.result as { records: unknown[] }).records).toHaveLength(2);
    const tried = await executeTool(s, "try_mock", { calls: [{ operationId: "login", body: { email: "a@example.com", password: "password1" } }, { operationId: "getMe", headers: { Authorization: "Bearer {{0.accessToken}}" } }, { operationId: "listProducts", query: { limit: 2 } }] }, { origin: "mcp" });
    expect(tried.ok).toBe(true);
    const answers = (tried as { result: { status: number; body: { email?: string; items?: unknown[] } }[] }).result;
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200]);
    expect(answers[1].body.email).toBe("a@example.com");
    expect(answers[2].body.items).toHaveLength(2);
    const empty = await executeTool(s, "try_mock", { calls: [{ operationId: "listProducts" }], scenario: "new-user" }, { origin: "mcp" });
    expect((empty as { result: { body: { items: unknown[] } }[] }).result[0].body.items).toEqual([]);
  });
});
