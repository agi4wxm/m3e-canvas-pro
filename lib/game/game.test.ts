/* lib/game on its own and in a document (docs/玩法契约.md): the game loop's contract file read strictly; its commands as
 * `game.*` operations with their refusals as problem types, its input commands, snapshot, events and clock as the
 * world's contract; its refusals as mock scenarios; the summon's and the check-in's templates answered by the mocks
 * made from it, each refusal landing on its own design; read-only in the tools; linked again with what changed and
 * what broke; read beside a folder project; kept by the project file. */

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { apiProblems, toOpenApi } from "../api";
import { createRuntime } from "../app/runtime";
import { outcomeOf } from "../app/actions";
import { DesignRuntime, authConfigOf, steadyTransport } from "../bindings/design";
import { endpointOf, paramsOf } from "../bindings/contract";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { Backend } from "../actions/consistency/check";
import { ReferenceHost } from "../actions/consistency/reference";
import { conditionHolds, run } from "../actions/run";
import type { Action } from "../actions/model";
import { worldContractModule } from "../export/appCapabilities";
import { setGlobalLang } from "../i18n";
import { createMockTransport } from "../mocks";
import { checkValue } from "../mocks/check";
import { openProject, projectFile } from "../project";
import { readFromDisk } from "../projects/fileLink";
import { serializeProject } from "../core/projectFile";
import { EXAMPLE_WORLD_CONTRACT } from "../world/contract";
import type { Doc, Item } from "../tokens";
import { executeTool, CORE_REGISTRY } from "../tools";
import {
  EXAMPLE_GAME_CONTRACT,
  GAME_CONTRACT_SCHEMA,
  gameEndpoints,
  gameGaps,
  gameHubGaps,
  gapWhere,
  gameRefusals,
  gameScenarios,
  linkGame,
  readGameContract,
  refreshGame,
  worldContractOf,
  type FolderLike,
  type GameContract,
} from ".";

beforeAll(() => setGlobalLang("en"));

const FILE = readFileSync(new URL("./fixtures/example.m3e-game.json", import.meta.url), "utf8");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const store = (doc: Partial<Doc> = {}) => new DocStore(stateOf({ groups: [], frames: [], ...doc }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const mcp = { origin: "mcp" as const };

describe("the contract file", () => {
  it("reads the example as the format's schema describes it, and as plain JSON", () => {
    expect(checkValue({}, GAME_CONTRACT_SCHEMA, JSON.parse(FILE), { locale: "en" })).toEqual([]);
    const read = readGameContract(FILE);
    expect(read.problems).toEqual([]);
    expect(read.contract).toEqual(JSON.parse(FILE));
    expect(EXAMPLE_GAME_CONTRACT).toEqual(read.contract);
  });

  it("refuses what is no contract, saying why, and takes nothing of it", () => {
    expect(readGameContract("{").problems).toEqual(["the file is not JSON"]);
    expect(readGameContract({ ...JSON.parse(FILE), format: "m3e-material" }).problems[0]).toMatch(/format should be "m3e-game"/);
    expect(readGameContract({ ...JSON.parse(FILE), version: 2 }).problems[0]).toMatch(/version 2 is not one this M3E reads/);
    const bad = clone(EXAMPLE_GAME_CONTRACT) as unknown as Record<string, Record<string, unknown>>;
    bad.commands["Jump-now"] = { via: "input", input: "vec3" };
    (bad.commands.pull as Record<string, unknown>).rejections = { "Not Enough": { title: "x" } };
    bad.commands.attack = { via: "input" };
    bad.extra = {};
    const read = readGameContract(bad);
    expect(read.contract).toBeNull();
    expect(read.problems).toEqual(
      expect.arrayContaining([
        '/commands: "Jump-now" cannot name a command (a small letter, then letters and digits)',
        '/commands/pull/rejections: "Not Enough" cannot be a code (small letters, digits and hyphens)',
        "/commands/attack/input: should be vec2 or bool",
        "/extra: is not a field of this request",
      ]),
    );
  });

  it("is the format the game loop writes: the schema file is a JSON Schema 2020-12 of version 1", () => {
    expect(GAME_CONTRACT_SCHEMA.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect((GAME_CONTRACT_SCHEMA.properties as Record<string, unknown>).version).toEqual({ const: 1 });
  });
});

describe("what a contract becomes", () => {
  it("makes each command sent as a call an operation game.<command>, its refusals problems by type, its mark x-m3e-game", () => {
    const eps = gameEndpoints(EXAMPLE_GAME_CONTRACT);
    expect(eps.map((e) => [e.operationId, e.method, e.path])).toEqual([
      ["game.pull", "post", "/game/commands/pull"],
      ["game.checkIn", "post", "/game/commands/checkIn"],
    ]);
    const pull = eps[0];
    expect(Object.keys(pull.responses)).toEqual(["200", "409", "default"]);
    expect((pull.responses["409"] as unknown as { content: Record<string, { schema: { properties: { type: unknown } } }> }).content["application/problem+json"].schema.properties.type).toEqual({ type: "string", enum: ["urn:game:problem:insufficient-resources", "urn:game:problem:pool-closed"] });
    expect(Object.keys(eps[1].responses)).toEqual(["200", "429", "default"]);
    expect(pull.extra).toEqual({ "x-m3e-game": { namespace: "game", contractVersion: "1.0.0", command: "pull" } });
    expect(gameRefusals(EXAMPLE_GAME_CONTRACT).map((r) => [r.operationId, r.code, r.status, r.condition])).toEqual([
      ["game.pull", "insufficient-resources", 409, "error.type == 'urn:game:problem:insufficient-resources'"],
      ["game.pull", "pool-closed", 409, "error.type == 'urn:game:problem:pool-closed'"],
      ["game.checkIn", "cooldown", 429, "error.type == 'urn:game:problem:cooldown'"],
    ]);
    /* a type of its own, or a base of the contract's */
    const own = clone(EXAMPLE_GAME_CONTRACT);
    own.problemBase = "https://game.example/problems/";
    (own.commands.checkIn as { rejections: Record<string, { type?: string }> }).rejections.cooldown.type = "tag:game.example,2026:cooldown";
    expect(gameRefusals(own).map((r) => r.type)).toEqual(["https://game.example/problems/insufficient-resources", "https://game.example/problems/pool-closed", "tag:game.example,2026:cooldown"]);
  });

  it("leaves a valid API, and writes the operations into the OpenAPI with their mark", () => {
    const { doc } = linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT);
    expect(apiProblems(doc.api)).toEqual([]);
    const yaml = toOpenApi({ api: doc.api });
    expect(yaml).toContain("operationId: game.pull");
    expect(yaml).toContain("x-m3e-game:");
    expect(yaml).toContain("urn:game:problem:cooldown");
  });

  it("is the world's contract: the example game loop's world is the example engine's (lib/world), and an export writes the linked one", () => {
    const { summary: _a, ...world } = worldContractOf(EXAMPLE_GAME_CONTRACT);
    const { summary: _b, ...engine } = EXAMPLE_WORLD_CONTRACT;
    expect(world).toEqual(engine);
    const other = clone(EXAMPLE_GAME_CONTRACT);
    other.commands = { ...other.commands, dash: { via: "input", input: "bool" } };
    other.events = { ...other.events, dodged: { payload: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } };
    const module = worldContractModule("@x", worldContractOf(other));
    expect(module).toContain("  dash: boolean");
    expect(module).toContain("  dodged: {");
    expect(worldContractModule("@x")).not.toContain("dash");
  });

  it("gives each refusal a scenario the mocks answer with its problem, and answers the command from its result otherwise", async () => {
    const { doc } = linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT);
    expect(doc.mocks?.scenarios?.map((s) => s.id)).toEqual(gameScenarios(EXAMPLE_GAME_CONTRACT).map((s) => s.id));
    const mock = createMockTransport({ api: doc.api, mocks: doc.mocks }, { latency: false });
    const ok = await mock.request({ operationId: "game.pull", method: "POST", path: "/game/commands/pull", body: { count: 10 } });
    expect(ok.status).toBe(200);
    expect(checkValue(doc.api!, EXAMPLE_GAME_CONTRACT.commands.pull.via === "api" ? EXAMPLE_GAME_CONTRACT.commands.pull.result : undefined, ok.body, { locale: "en", direction: "response" })).toEqual([]);
    /* what the contract does not take is refused as the API's problem, not the game's */
    expect((await mock.request({ operationId: "game.pull", method: "POST", path: "/game/commands/pull", body: { count: 3 } })).status).toBe(400);
    mock.setScenario("game.pull.insufficient-resources");
    const no = await mock.request({ operationId: "game.pull", method: "POST", path: "/game/commands/pull", body: { count: 10 } });
    expect(no).toMatchObject({ status: 409, headers: { "content-type": "application/problem+json" }, body: { type: "urn:game:problem:insufficient-resources", title: "Not enough gems", status: 409 } });
  });
});

/* ---------- the templates, answered by the mocks of the contract ---------- */

/** the document with a template added the way the editor and the tools add one */
function withTemplate(slug: string, doc: Partial<Doc> = {}): Doc {
  const s = store(doc);
  s.run(ops.addTemplate, { slug }, mcp);
  return savedDoc(s.get());
}

const itemsOf = (doc: Doc): Item[] => doc.groups.flatMap((g) => g.items);

/** the preview's way of running a tap: the reference host over the document, its calls through the preview's data
 *  engine against the mock library in a scenario (components/preview/host.ts does the same) */
function preview(doc: Doc, scenario?: string) {
  const mock = createMockTransport({ api: doc.api, mocks: doc.mocks }, { latency: false, ...(scenario ? { scenario } : {}) });
  const runtime = createRuntime({ transport: steadyTransport(() => mock), auth: authConfigOf(doc.api), lang: "en", now: () => 0 });
  const data = new DesignRuntime(runtime, () => doc);
  const host = new ReferenceHost(doc, new Backend({}));
  host.call = async (operationId, given) => {
    const ep = endpointOf(doc.api!, operationId);
    const takes = new Set(ep ? paramsOf(doc.api!, ep).map((p) => p.name) : []);
    const params: Record<string, unknown> = {};
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(given.args)) (takes.has(k) ? params : fields)[k] = v;
    return outcomeOf(await data.call(operationId, { params, body: given.body !== undefined ? given.body : Object.keys(fields).length ? fields : undefined }));
  };
  /** taps the part and says which of the notices shows after */
  const tap = async (part: Item) => {
    await run(part.action as Action, host, { screen: doc.frames[0].id, part: part.id });
    const notices = doc.groups.filter((g) => g.showWhen && "expr" in g.showWhen && /Issue/.test(g.showWhen.expr));
    return { shown: notices.filter((g) => conditionHolds(g.showWhen, host, { screen: doc.frames[0].id })).map((g) => (g.showWhen as { expr: string }).expr), toast: host.snack, log: mock.log };
  };
  return { tap, host };
}

describe("the summon and the check-in, answered by the game loop's contract", () => {
  it("bring the example contract where the document links none, and leave a linked one as it is", () => {
    const doc = withTemplate("gacha-pull");
    expect(doc.game).toMatchObject({ example: true, contract: { namespace: "game", contractVersion: "1.0.0" } });
    expect(doc.api?.endpoints?.map((e) => e.operationId)).toEqual(["game.pull", "game.checkIn"]);
    expect(doc.vars?.map((v) => v.name)).toEqual(["summonIssue"]);
    expect(gameGaps(doc)).toEqual([]);
    const theirs = linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT).doc;
    const again = withTemplate("daily-check-in", theirs);
    expect(again.game).toEqual(theirs.game);
  });

  it("show what the summon came to, and each refusal on its own design", async () => {
    const doc = withTemplate("gacha-pull");
    const [one, ten] = itemsOf(doc).filter((it) => it.component === "button" && it.action?.effects?.some((e) => e.do === "call"));
    expect(one.action?.effects?.[1]).toMatchObject({ do: "call", operationId: "game.pull", args: { count: "1" } });
    const done = await preview(doc).tap(ten);
    expect(done.log.at(-1)).toMatchObject({ operationId: "game.pull", status: 200 });
    expect(done.shown).toEqual([]);
    expect(done.toast).toBeTruthy();
    expect((await preview(doc, "game.pull.insufficient-resources").tap(one)).shown).toEqual(["vars.summonIssue == 'gems'"]);
    expect((await preview(doc, "game.pull.pool-closed").tap(one)).shown).toEqual(["vars.summonIssue == 'closed'"]);
    /* a refusal the contract does not name, a server down: the design for any other failure */
    const down = clone(doc);
    down.mocks!.scenarios!.push({ id: "down", name: "Down", all: { status: 503 } });
    expect((await preview(down, "down").tap(one)).shown).toEqual(["vars.summonIssue == 'failed'"]);
  });

  it("show the day the game loop counts, and a check-in already made today on its own design", async () => {
    const doc = withTemplate("daily-check-in");
    const button = itemsOf(doc).find((it) => it.action?.effects?.some((e) => e.do === "call"))!;
    const done = await preview(doc).tap(button);
    expect(done.shown).toEqual([]);
    expect(done.toast).toMatch(/×\d+/);
    expect((await preview(doc, "game.checkIn.cooldown").tap(button)).shown).toEqual(["vars.checkInIssue == 'cooldown'"]);
  });
});

/* ---------- read-only, linked again ---------- */

describe("the contract in the document", () => {
  it("is read-only to the tools: its operations are changed only by importing it again", () => {
    const s = store();
    s.run(ops.importGameContract, { text: FILE, path: "game-loop/contract.m3e-game.json" }, mcp);
    const refused = (fn: () => unknown, re: RegExp) => expect(fn).toThrow(re);
    refused(() => s.run(ops.updateEndpoint, { operationId: "game.pull", summary: "mine" }, mcp), /the game loop's/);
    refused(() => s.run(ops.removeEndpoint, { operationId: "game.checkIn" }, mcp), /the game loop's/);
    refused(() => s.run(ops.addEndpoint, { operationId: "game.cheat", method: "post", path: "/cheat" }, mcp), /namespace of the gameplay contract/);
    refused(() => s.run(ops.importGameContract, { text: "{}" }, mcp), /no gameplay contract this version reads/);
    refused(() => s.run(ops.importGameContract, { text: FILE, path: "../elsewhere.json" }, mcp), /no path inside the project's folder/);
    /* an OpenAPI file of the author's, even one replacing the whole HTTP half, leaves them as the game loop said */
    s.run(ops.importOpenApi, { text: "openapi: 3.1.0\ninfo: {title: Mine, version: '1'}\npaths:\n  /me:\n    get: {operationId: getMe, responses: {'200': {description: OK}}}\n", mode: "replace" }, mcp);
    expect(s.get().doc.api?.endpoints?.map((e) => e.operationId)).toEqual(["getMe", "game.pull", "game.checkIn"]);
    expect(s.get().doc.external).toEqual({ gameContract: "game-loop/contract.m3e-game.json" });
    s.run(ops.removeGameContract, {}, mcp);
    expect(s.get().doc.game).toBeUndefined();
    expect(s.get().doc.external).toBeUndefined();
    expect(s.get().doc.api?.endpoints?.map((e) => e.operationId)).toEqual(["getMe"]);
    expect(s.get().doc.mocks?.scenarios ?? []).toEqual([]);
  });

  it("linked again when it changed, replaces what it made and lists what in the design it broke", () => {
    const s = store();
    s.run(ops.addTemplate, { slug: "gacha-pull" }, mcp);
    s.run(ops.addTemplate, { slug: "daily-check-in" }, mcp);
    const next = clone(EXAMPLE_GAME_CONTRACT) as GameContract & { commands: Record<string, unknown> };
    next.contractVersion = "2.0.0";
    const pull = next.commands.pull as { params: { properties: Record<string, unknown>; required: string[] }; rejections: Record<string, unknown> };
    pull.params = { properties: { times: { type: "integer" } }, required: ["times"] } as never;
    delete pull.rejections["pool-closed"];
    delete next.commands.checkIn;
    delete next.commands.attack;
    const report = s.run(ops.importGameContract, { text: JSON.stringify(next) }, mcp);
    expect(report).toMatchObject({ contractVersion: "2.0.0", previousVersion: "1.0.0", same: false, operations: ["game.pull"], scenarios: ["game.pull.insufficient-resources"] });
    expect(report.changes.removed).toEqual(["command game.checkIn", "rejection game.pull pool-closed", "rejection game.checkIn cooldown", "input attack"]);
    expect(report.changes.changed).toEqual(["command game.pull"]);
    const gaps = report.gaps.map((g) => `${g.kind} ${g.ref}`);
    expect(gaps).toEqual(expect.arrayContaining(["param game.pull count", "param game.pull times", "rejection urn:game:problem:pool-closed", "command game.checkIn"]));
    expect(report.gaps.every((g) => g.where && g.detail)).toBe(true);
    const doc = s.get().doc;
    expect(doc.api?.endpoints?.filter((e) => e.operationId.startsWith("game.")).map((e) => e.operationId)).toEqual(["game.pull"]);
    expect(doc.mocks?.scenarios?.map((x) => x.id)).toEqual(["game.pull.insufficient-resources"]);
    /* the same file again changes nothing */
    expect(s.run(ops.importGameContract, { text: JSON.stringify(next) }, mcp)).toMatchObject({ same: true, changes: { added: [], removed: [], changed: [] } });
  });

  it("lists an input the world does not take, an event it does not send, a fact the app may not send", () => {
    const doc: Doc = {
      ...linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT).doc,
      frames: [{ id: "home", name: "Home", x: 0, y: 0 }],
      groups: [
        { id: "g1", x: 0, y: 0, axis: "x", items: [{ id: "w", kind: "component", component: "world-view", label: "", icon: null, variant: "", props: {}, actions: { "on:dodged": { to: "none" }, "on:hit": { to: "none" } } }] },
        {
          id: "g2", x: 10, y: 0, axis: "x",
          items: [{ id: "b", kind: "component", component: "button", label: "", icon: null, variant: "", props: {}, action: { to: "none", effects: [{ do: "press", part: "w", action: "jump" }, { do: "move", part: "w", action: "attack", vector: "event" }, { do: "call", operationId: "game.purchaseSettled" }] } }],
        },
      ],
    } as unknown as Doc;
    expect(gameGaps(doc).map((g) => `${g.kind} ${g.ref} ${g.reason} @ ${gapWhere(g.where)}`)).toEqual([
      "event event dodged missing @ screen Home, part w, on:dodged",
      "input input jump missing @ screen Home, part b, action",
      "input input attack wrong-type @ screen Home, part b, action",
      "fact game.purchaseSettled not-the-apps @ screen Home, part b, action",
    ]);
    /* in the gap file's format, for the export's report: module game-loop, every place it is leaned on */
    expect(gameHubGaps(doc).map((g) => [g.kind, g.module, g.ref, g.reason, g.where])).toEqual([
      ["game-event", "game-loop", "event dodged", "missing", [{ screen: "Home", part: "w", prop: "on:dodged" }]],
      ["game-input", "game-loop", "input jump", "missing", [{ screen: "Home", part: "b", prop: "action" }]],
      ["game-input", "game-loop", "input attack", "wrong-type", [{ screen: "Home", part: "b", prop: "action" }]],
      ["game-fact", "game-loop", "game.purchaseSettled", "not-the-apps", [{ screen: "Home", part: "b", prop: "action" }]],
    ]);
  });

  it("is read by get_game_contract as the calls and the conditions a catch branches on", async () => {
    const s = store();
    s.run(ops.importGameContract, { text: FILE }, mcp);
    const out = await executeTool(s, "get_game_contract", {}, { origin: "mcp", registry: CORE_REGISTRY });
    const text = String((out as { result: unknown }).result);
    expect(text).toContain("- game.pull: Summons once or ten times");
    expect(text).toContain("refuses insufficient-resources (409, Not enough gems): when error.type == 'urn:game:problem:insufficient-resources'");
    expect(text).toContain('its inputs prop: "move: vec2, attack: bool"');
    expect(text).toContain("purchaseSettled from payments");
    expect(text).toContain("Gaps: none");
  });
});

/* ---------- the project's setting, beside a folder ---------- */

/** a folder of files by path, as the File System Access API hands one over */
function folder(files: Record<string, string>, name = "proj"): FolderLike & { kind: "directory"; name: string; entries(): AsyncIterable<[string, unknown]> } {
  const at = (prefix: string): FolderLike & { kind: "directory"; name: string; entries(): AsyncIterable<[string, unknown]> } => ({
    kind: "directory",
    name,
    async getDirectoryHandle(step: string) {
      if (!Object.keys(files).some((p) => p.startsWith(`${prefix}${step}/`))) throw new DOMException("no", "NotFoundError");
      return at(`${prefix}${step}/`);
    },
    async getFileHandle(step: string) {
      const text = files[`${prefix}${step}`];
      if (text === undefined) throw new DOMException("no", "NotFoundError");
      return { kind: "file", getFile: async () => ({ text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer }) } as never;
    },
    async *entries() {
      for (const p of Object.keys(files)) if (p.startsWith(prefix) && !p.slice(prefix.length).includes("/")) yield [p.slice(prefix.length), { kind: "file" }];
    },
  });
  return at("");
}

describe("the contract's path, the project's setting for it", () => {
  const linked = (path?: string) => ({ ...linkGame({ groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }] } as unknown as Doc & Record<string, unknown>, EXAMPLE_GAME_CONTRACT).doc, ...(path ? { external: { gameContract: path } } : {}) });

  it("is read again beside a folder project as it is opened: the same, changed, gone or no contract", async () => {
    const doc = linked("game-loop/contract.m3e-game.json");
    const read = (files: Record<string, string>) => (p: string) => Promise.resolve(files[p] ?? null);
    expect((await refreshGame(doc, read({ "game-loop/contract.m3e-game.json": FILE }))).refresh).toEqual({ status: "same" });
    const v2 = { ...JSON.parse(FILE), contractVersion: "1.1.0" };
    const updated = await refreshGame(doc, read({ "game-loop/contract.m3e-game.json": JSON.stringify(v2) }));
    expect(updated.refresh).toMatchObject({ status: "updated", report: { contractVersion: "1.1.0", previousVersion: "1.0.0" } });
    expect(updated.doc.game).toMatchObject({ contract: { contractVersion: "1.1.0" } });
    expect(updated.doc.external).toEqual({ gameContract: "game-loop/contract.m3e-game.json" });
    /* with no path of its own the project reads it beside the project file; with no contract and no path, nothing */
    expect((await refreshGame(linked(), read({ "game-contract.m3e-game.json": JSON.stringify(v2) }))).refresh).toMatchObject({ status: "updated" });
    expect((await refreshGame({ groups: [], frames: [] }, read({ "game-contract.m3e-game.json": FILE }))).refresh).toEqual({ status: "none" });
    /* M3E's example gives way to the game loop's when the folder has it, and is kept quietly when it has not */
    const example = linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT, { example: true }).doc;
    expect((await refreshGame(example, read({}))).refresh).toEqual({ status: "none" });
    const real = await refreshGame(example, read({ "game-contract.m3e-game.json": JSON.stringify(v2) }));
    expect(real.doc.game?.example).toBeUndefined();
    expect((await refreshGame(doc, read({}))).refresh).toEqual({ status: "missing", path: "game-loop/contract.m3e-game.json" });
    expect((await refreshGame(doc, read({ "game-loop/contract.m3e-game.json": "{}" }))).refresh).toMatchObject({ status: "invalid" });
  });

  it("is followed when a folder is opened from disk", async () => {
    const v2 = { ...JSON.parse(FILE), contractVersion: "1.2.0" };
    const project = serializeProject(linked("game-loop/contract.m3e-game.json") as Doc).text;
    const dir = folder({ "m3e-project.json": project, "game-loop/contract.m3e-game.json": JSON.stringify(v2) });
    const out = await readFromDisk(dir as unknown as FileSystemHandle);
    expect(out.game).toMatchObject({ status: "updated", report: { contractVersion: "1.2.0" } });
    expect(out.doc?.game?.contract.contractVersion).toBe("1.2.0");
  });

  it("is kept by the project file with the contract; a tampered contract or a path out of the folder is not", () => {
    const doc = linked("game-loop/contract.m3e-game.json");
    const back = openProject(JSON.parse(JSON.stringify(projectFile(doc as Doc))))!;
    expect(back.game).toEqual(doc.game);
    const raw = JSON.parse(JSON.stringify(projectFile(doc as Doc)));
    expect(back.external).toEqual({ gameContract: "game-loop/contract.m3e-game.json" });
    raw.document.external.gameContract = "../../etc/passwd";
    expect(openProject(raw)!.external).toBeUndefined();
    raw.document.game.contract.commands.pull.via = "telepathy";
    expect(openProject(raw)!.game).toBeUndefined();
  });
});
