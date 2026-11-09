/* The game loop's fixtures (lib/game/fixture.ts, docs/玩法契约.md “fixture”): the file read strictly as its format says,
 * held to the contract the document links (refused with every reason, another version said), imported as a mock scene
 * (a world script with the snapshot as its start, a scenario the game.* calls answer in) that the preview starts in,
 * the screen drawn headless at it (its data, its calls and its world views in that state), imported again when it
 * changes, kept through a contract read again (what no longer matches is a gap), read again beside a folder project,
 * and kept by the project file. */

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { previewFixture, worldAt } from "../bindings/headless";
import { DocStore, counterIds, guessMeasurer, OpError, ops, savedDoc, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { createMockTransport } from "../mocks";
import { checkValue } from "../mocks/check";
import { checkWorldScript } from "../mocks/world";
import { openProject, projectFile } from "../project";
import type { Doc } from "../tokens";
import { executeTool, CORE_REGISTRY, type Renderer, type ShotOptions } from "../tools";
import {
  EXAMPLE_GAME_CONTRACT,
  EXAMPLE_GAME_FIXTURE,
  GAME_FIXTURE_SCHEMA,
  fixtureScenario,
  fixtureWorld,
  gameGaps,
  gameHubGaps,
  linkFixture,
  linkGame,
  matchFixture,
  readGameFixture,
  refreshGame,
  type GameFixture,
} from ".";

beforeAll(() => setGlobalLang("en"));

const CONTRACT = readFileSync(new URL("./fixtures/example.m3e-game.json", import.meta.url), "utf8");
const FILE = readFileSync(new URL("./fixtures/example.m3e-fixture.json", import.meta.url), "utf8");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const mcp = { origin: "mcp" as const };
const store = () => new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const fails = (fn: () => unknown, code: string, words: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).code).toBe(code);
    expect((e as OpError).message).toMatch(words);
    return;
  }
  throw new Error("did not throw");
};

/** a screen with a HUD over a world view and the day of the check-in loaded from game.checkIn: a design of the
 *  example contract, built with operations as the AI and MCP build one */
function hudStore() {
  const s = store();
  s.transact("HUD", "mcp", (tx) => {
    tx.run(ops.importGameContract, { text: CONTRACT });
    tx.run(ops.addScreen, { id: "arena", name: "Arena" });
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: "arena", at: { x: 16, y: 80 }, props: { label: "Arena", inputs: "move: vec2, attack: bool" } });
    tx.run(ops.addDataSource, { screen: "arena", operationId: "game.checkIn", name: "today" });
    tx.run(ops.addPart, { slug: "text", id: "day", screen: "arena", at: { x: 16, y: 40 } });
    tx.run(ops.bindExpression, { id: "day", prop: "text", expr: "data.today.error ? data.today.error.title : 'Day ' + data.today.value.day" });
  });
  return s;
}

describe("the fixture file", () => {
  it("reads the example as the format's schema describes it, and it matches the example contract", () => {
    expect(checkValue({}, GAME_FIXTURE_SCHEMA, JSON.parse(FILE), { locale: "en" })).toEqual([]);
    const read = readGameFixture(FILE);
    expect(read.problems).toEqual([]);
    expect(read.fixture).toEqual(JSON.parse(FILE));
    expect(EXAMPLE_GAME_FIXTURE).toEqual(read.fixture);
    expect(matchFixture(EXAMPLE_GAME_FIXTURE, EXAMPLE_GAME_CONTRACT)).toEqual({ problems: [] });
  });

  it("refuses what is no fixture this version reads, saying why", () => {
    expect(readGameFixture("{").problems).toEqual(["the file is not JSON"]);
    expect(readGameFixture({ ...JSON.parse(FILE), format: "m3e-game" }).problems[0]).toMatch(/format should be "m3e-game-fixture"/);
    expect(readGameFixture({ ...JSON.parse(FILE), version: 2 }).problems[0]).toMatch(/version 2 is not one this M3E reads \(it reads 1\)/);
    const bad = clone(JSON.parse(FILE));
    bad.id = "no spaces here";
    bad.answers = { pull: { result: {}, rejection: "pool-closed" }, "Check-In": { rejection: "cooldown" }, checkIn: { result: {}, detail: "x" } };
    delete bad.snapshot;
    const read = readGameFixture(bad);
    expect(read.fixture).toBeNull();
    expect(read.problems).toEqual(
      expect.arrayContaining([
        "/answers/pull: should give either its result or its rejection",
        '/answers: "Check-In" cannot name a command (a small letter, then letters and digits)',
        "/answers/checkIn/detail: only a rejection has a detail",
      ]),
    );
    expect(read.problems.some((p) => p.startsWith("/id:"))).toBe(true);
    expect(read.problems.some((p) => /snapshot/.test(p))).toBe(true);
  });

  it("is held to the contract: what the contract does not take is refused, another version is said", () => {
    const f = clone(EXAMPLE_GAME_FIXTURE) as GameFixture & { answers: Record<string, unknown> };
    (f.snapshot.entities as { x: number }[])[0].x = 500;
    f.snapshot.status = "dancing";
    f.answers = { pull: { result: { pulled: [{ id: "x", name: "X", rarity: "mythic" }] } }, checkIn: { rejection: "too-early" }, move: { result: {} }, trade: { result: {} } };
    const m = matchFixture({ ...f, contractVersion: "0.9.0" }, EXAMPLE_GAME_CONTRACT);
    expect(m.version).toEqual({ fixture: "0.9.0", contract: "1.0.0" });
    const words = m.problems.join("\n");
    expect(words).toMatch(/^\/snapshot\/entities\/0\/x: /m);
    expect(words).toMatch(/^\/snapshot\/status: /m);
    expect(words).toMatch(/^\/answers\/pull\/result\/pulled\/0\/rarity: /m);
    expect(words).toMatch(/^\/answers\/pull\/result\/gems: /m);
    expect(words).toContain("/answers/checkIn/rejection: checkIn does not refuse with too-early (it refuses with cooldown)");
    expect(words).toContain("/answers/move: move is sent as an input action to the world and never answered");
    expect(words).toContain("/answers/trade: the contract has no command trade (its calls are pull, checkIn)");
    expect(matchFixture({ ...EXAMPLE_GAME_FIXTURE, namespace: "rpg" }, EXAMPLE_GAME_CONTRACT).problems[0]).toMatch(/written for the contract "rpg"/);
    /* a version that differs alone: said, and what it holds still matches */
    expect(matchFixture({ ...EXAMPLE_GAME_FIXTURE, contractVersion: "1.0.1" }, EXAMPLE_GAME_CONTRACT)).toEqual({ problems: [], version: { fixture: "1.0.1", contract: "1.0.0" } });
  });
});

describe("the scene a fixture makes", () => {
  it("is a world script with the snapshot as its start and no steps, held to the world's contract, and a scenario of the game's answers", () => {
    const world = fixtureWorld(EXAMPLE_GAME_FIXTURE, EXAMPLE_GAME_CONTRACT);
    expect(world).toMatchObject({ id: "fixture.day-12", steps: [], start: EXAMPLE_GAME_FIXTURE.snapshot, scene: EXAMPLE_GAME_FIXTURE.name });
    expect(checkWorldScript(world)).toEqual([]);
    const scenario = fixtureScenario(EXAMPLE_GAME_FIXTURE, EXAMPLE_GAME_CONTRACT);
    expect(scenario.id).toBe("fixture.day-12");
    expect(scenario.ops).toEqual({
      "game.pull": { status: 200, body: EXAMPLE_GAME_FIXTURE.answers!.pull.result },
      "game.checkIn": { status: 429, body: { type: "urn:game:problem:cooldown", title: "Checked in already today", status: 429, detail: "Day 12 is claimed; day 13 opens at the game's midnight" } },
    });
  });

  it("is answered by the mock library as the fixture says, every time", async () => {
    const doc = savedDoc(hudStore().get());
    const s = new DocStore(stateOf(doc), { measurer: guessMeasurer, lang: () => "en" });
    s.run(ops.importGameFixture, { text: FILE }, mcp);
    const d = s.document();
    const mock = createMockTransport({ api: d.api, mocks: d.mocks }, { latency: false });
    expect(mock.scenario).toBe("fixture.day-12");
    for (let i = 0; i < 2; i++) {
      const pull = await mock.request({ operationId: "game.pull", method: "POST", path: "/game/commands/pull", body: { count: 1 } });
      expect(pull).toMatchObject({ status: 200, body: { gems: 1240, pulled: [{ name: "Aurora Knight" }] } });
    }
    const check = await mock.request({ operationId: "game.checkIn", method: "POST", path: "/game/commands/checkIn" });
    expect(check).toMatchObject({ status: 429, headers: { "content-type": "application/problem+json" }, body: { type: "urn:game:problem:cooldown" } });
  });

  it("is refused where the document links no contract, or the fixture does not match it", () => {
    fails(() => store().run(ops.importGameFixture, { text: FILE }, mcp), "refused", /links no gameplay contract/);
    const s = hudStore();
    fails(() => s.run(ops.importGameFixture, { text: "{}" }, mcp), "invalid_value", /no game fixture this version reads/);
    fails(() => s.run(ops.importGameFixture, { text: JSON.stringify({ ...JSON.parse(FILE), snapshot: { entities: [] } }) }, mcp), "invalid_value", /does not match the gameplay contract game 1\.0\.0: \/snapshot\/score: is required/);
    fails(() => s.run(ops.importGameFixture, { text: FILE, path: "../day.m3e-fixture.json" }, mcp), "invalid_value", /no path inside the project's folder/);
    expect(s.get().doc.game?.fixtures).toBeUndefined();
  });
});

describe("a fixture in the document", () => {
  it("is imported as the scene the preview starts in, says another contract version, and is taken away with its scene", () => {
    const s = hudStore();
    const report = s.run(ops.importGameFixture, { text: JSON.stringify({ ...JSON.parse(FILE), contractVersion: "0.9.0" }), path: "game-loop/fixtures/day-12.m3e-fixture.json" }, mcp);
    expect(report).toMatchObject({ id: "day-12", scene: "fixture.day-12", contractVersion: "1.0.0", versionMismatch: { fixture: "0.9.0", contract: "1.0.0" }, replaced: false, used: true, answers: ["game.pull", "game.checkIn"] });
    const doc = s.get().doc;
    expect(doc.mocks).toMatchObject({ scenario: "fixture.day-12", world: "fixture.day-12" });
    expect(doc.mocks?.scenarios?.map((x) => x.id)).toEqual(["game.pull.insufficient-resources", "game.pull.pool-closed", "game.checkIn.cooldown", "fixture.day-12"]);
    expect(doc.game?.fixtures?.[0]).toMatchObject({ path: "game-loop/fixtures/day-12.m3e-fixture.json", fixture: { id: "day-12" } });
    /* one undo takes the import back */
    s.undo();
    expect(s.get().doc.game?.fixtures).toBeUndefined();
    expect(s.get().doc.mocks?.scenario).toBeUndefined();
    s.redo();
    s.run(ops.removeGameFixture, { id: "day-12" }, mcp);
    expect(s.get().doc.game?.fixtures).toBeUndefined();
    expect(s.get().doc.mocks?.scenarios?.some((x) => x.id.startsWith("fixture."))).toBe(false);
    expect(s.get().doc.mocks?.world).toBeUndefined();
    fails(() => s.run(ops.removeGameFixture, { id: "day-12" }, mcp), "not_found", /no fixture "day-12"/);
  });

  it("imported again when it changed, updates its scene and says what changed", () => {
    const s = hudStore();
    s.run(ops.importGameFixture, { text: FILE, use: false }, mcp);
    expect(s.get().doc.mocks?.scenario).toBeUndefined();
    expect(s.run(ops.importGameFixture, { text: FILE, use: false }, mcp)).toMatchObject({ replaced: true, same: true, changed: [] });
    const next = clone(JSON.parse(FILE));
    next.snapshot.score = 9;
    next.answers.pull = { rejection: "insufficient-resources" };
    const report = s.run(ops.importGameFixture, { text: JSON.stringify(next) }, mcp);
    expect(report).toMatchObject({ replaced: true, same: false, changed: ["snapshot", "answer pull"] });
    const m = s.get().doc.mocks!;
    expect(m.worlds?.filter((w) => w.id === "fixture.day-12").map((w) => w.start?.score)).toEqual([9]);
    expect(m.scenarios?.find((x) => x.id === "fixture.day-12")?.ops?.["game.pull"]).toMatchObject({ status: 409, body: { type: "urn:game:problem:insufficient-resources" } });
    expect(s.get().doc.game?.fixtures).toHaveLength(1);
  });

  it("is kept through a contract read again: its scene made from the new one, and what no longer matches a gap", () => {
    const s = hudStore();
    s.run(ops.importGameFixture, { text: FILE }, mcp);
    const next = clone(EXAMPLE_GAME_CONTRACT) as unknown as Record<string, Record<string, unknown>>;
    next.contractVersion = "2.0.0" as never;
    delete next.commands.checkIn;
    (next.events as Record<string, unknown>).dodged = { payload: { type: "object" } };
    const report = s.run(ops.importGameContract, { text: JSON.stringify(next) }, mcp);
    const fixtureGaps = report.gaps.filter((g) => g.kind === "fixture");
    expect(fixtureGaps).toEqual([expect.objectContaining({ ref: "fixture day-12", reason: "mismatch", where: { prop: "fixture day-12" } })]);
    expect(fixtureGaps[0].detail).toContain("the contract has no command checkIn");
    const doc = s.get().doc;
    expect(doc.game?.fixtures?.[0].fixture.id).toBe("day-12");
    expect(doc.mocks?.scenario).toBe("fixture.day-12");
    const world = doc.mocks!.worlds!.find((w) => w.id === "fixture.day-12")!;
    expect((world.contract as { events: Record<string, unknown> }).events.dodged).toBeDefined();
    expect(doc.mocks?.scenarios?.find((x) => x.id === "fixture.day-12")?.ops).toEqual({ "game.pull": expect.anything() });
    expect(gameHubGaps(doc as Doc).find((g) => g.kind === "game-fixture")).toMatchObject({ module: "game-loop", ref: "fixture day-12" });
    /* the contract unlinked, its fixtures and their scenes go with it */
    s.run(ops.removeGameContract, {}, mcp);
    expect(s.get().doc.game).toBeUndefined();
    expect(s.get().doc.mocks?.worlds?.some((w) => w.id.startsWith("fixture."))).toBeFalsy();
    expect(s.get().doc.mocks?.world).toBeUndefined();
  });

  it("is kept by the project file; one that is no fixture any more is not", () => {
    const s = hudStore();
    s.run(ops.importGameFixture, { text: FILE, path: "day-12.m3e-fixture.json" }, mcp);
    const doc = savedDoc(s.get());
    const back = openProject(JSON.parse(JSON.stringify(projectFile(doc))))!;
    expect(back.game).toEqual(doc.game);
    expect(gameGaps(back)).toEqual([]);
    const raw = JSON.parse(JSON.stringify(projectFile(doc)));
    raw.document.game.fixtures[0].fixture.format = "something";
    expect(openProject(raw)!.game?.fixtures).toBeUndefined();
  });

  it("is read again beside a folder project when its file changed", async () => {
    const s = hudStore();
    s.run(ops.importGameFixture, { text: FILE, path: "fixtures/day-12.m3e-fixture.json", use: false }, mcp);
    const doc = savedDoc(s.get()) as Doc & Record<string, unknown>;
    const read = (files: Record<string, string>) => (p: string) => Promise.resolve(files[p] ?? null);
    const files = { "game-contract.m3e-game.json": CONTRACT };
    expect((await refreshGame(doc, read({ ...files, "fixtures/day-12.m3e-fixture.json": FILE }))).fixtures).toEqual([{ id: "day-12", path: "fixtures/day-12.m3e-fixture.json", status: "same" }]);
    const next = { ...JSON.parse(FILE), name: "Day 12, later" };
    const out = await refreshGame(doc, read({ ...files, "fixtures/day-12.m3e-fixture.json": JSON.stringify(next) }));
    expect(out.fixtures?.[0]).toMatchObject({ status: "updated", report: { changed: ["name"], used: false } });
    expect(out.doc.game?.fixtures?.[0].fixture.name).toBe("Day 12, later");
    expect(out.doc.mocks?.worlds?.find((w) => w.id === "fixture.day-12")?.scene).toBe("Day 12, later");
    expect((await refreshGame(doc, read(files))).fixtures).toEqual([{ id: "day-12", path: "fixtures/day-12.m3e-fixture.json", status: "missing" }]);
    const wrong = await refreshGame(doc, read({ ...files, "fixtures/day-12.m3e-fixture.json": JSON.stringify({ ...next, answers: { jump: { result: 1 } } }) }));
    expect(wrong.fixtures?.[0]).toMatchObject({ status: "invalid" });
    expect(wrong.doc.game?.fixtures?.[0].fixture.name).toBe(EXAMPLE_GAME_FIXTURE.name);
  });
});

describe("a screen at a fixture, headless", () => {
  it("shows the fixture's state: its data from the game's answers and its world views in the snapshot", async () => {
    const s = hudStore();
    s.run(ops.importGameFixture, { text: FILE, use: false }, mcp);
    const doc = savedDoc(s.get());
    const out = await previewFixture(doc, "arena", { fixture: "day-12", lang: "en", widths: {} });
    expect(out.fixture).toEqual({ id: "day-12", name: EXAMPLE_GAME_FIXTURE.name, scene: "fixture.day-12" });
    /* today's check-in is done in this state: the data source gets the game's refusal */
    expect(out.report).toMatchObject({ scenario: "fixture.day-12", sources: [{ name: "today", operationId: "game.checkIn", status: "error" }] });
    expect(out.report.sources[0].error).toMatch(/^429 Checked in already today/);
    const items = out.doc.groups.flatMap((g) => g.items);
    expect(items.find((it) => it.id === "day")?.props?.text).toBe("Checked in already today");
    const world = items.find((it) => it.id === "world")!;
    expect(world.props).toMatchObject({ score: 7, status: "paused", follow: "hero", scene: EXAMPLE_GAME_FIXTURE.name });
    expect((world.props!.entities as { rows: string[][] }).rows.map((r) => r[0])).toEqual(["hero", "coin2", "slime"]);
    expect(out.world).toMatchObject({ script: "fixture.day-12", at: 0, views: ["world"], events: [] });
    await expect(previewFixture(doc, "arena", { fixture: "night", lang: "en", widths: {} })).rejects.toThrow(/no fixture "night" \(the fixtures are day-12\)/);
    /* another state of the game, where the check-in is open: the same screen shows what the game loop says of it */
    const open = { ...clone(EXAMPLE_GAME_FIXTURE), id: "day-13", name: "Day 13", answers: { checkIn: { result: { day: 13, reward: { item: "Gems", count: 50 } } } } };
    s.run(ops.importGameFixture, { text: JSON.stringify(open) }, mcp);
    const at13 = await previewFixture(savedDoc(s.get()), "arena", { fixture: "day-13", lang: "en", widths: {} });
    expect(at13.report.sources[0].status).toBe("ready");
    expect(at13.doc.groups.flatMap((g) => g.items).find((it) => it.id === "day")?.props?.text).toBe("Day 13");
    /* the world script alone is a scene for worldAt too */
    expect((await worldAt(doc, { script: "fixture.day-12" })).moment.views).toEqual(["world"]);
  });

  it("is what the screenshot tool draws with fixture, and list_game_fixtures lists", async () => {
    const shots: { id: string; o?: ShotOptions }[] = [];
    const renderer: Renderer = {
      async screenshot(id, o) {
        shots.push({ id, o });
        return "data:image/png;base64,AAAA";
      },
    };
    const s = hudStore();
    await executeTool(s, "import_game_fixture", { text: FILE }, { origin: "mcp", registry: CORE_REGISTRY });
    const out = (await executeTool(s, "screenshot", { id: "arena", fixture: "day-12" }, { origin: "ai", renderer })) as { ok: boolean; result: { data: { fixture: unknown; world: { views: string[] }; sources: { status: string }[] } } };
    expect(out.ok).toBe(true);
    expect(out.result.data.fixture).toEqual({ id: "day-12", name: EXAMPLE_GAME_FIXTURE.name, scene: "fixture.day-12" });
    expect(out.result.data.world.views).toEqual(["world"]);
    expect(out.result.data.sources[0].status).toBe("error");
    const drawn = shots.at(-1)!.o!.doc!.groups.flatMap((g) => g.items);
    expect(drawn.find((it) => it.id === "day")?.props?.text).toBe("Checked in already today");
    expect(drawn.find((it) => it.id === "world")?.props?.score).toBe(7);
    /* a screen with no world view is the fixture's as well: its calls and data are */
    s.run(ops.addScreen, { id: "shop", name: "Shop" }, mcp);
    expect((await executeTool(s, "screenshot", { id: "shop", fixture: "day-12" }, { origin: "ai", renderer })).ok).toBe(true);
    const missing = await executeTool(s, "screenshot", { id: "arena", fixture: "night" }, { origin: "ai", renderer });
    expect(missing.ok).toBe(false);
    const listed = (await executeTool(s, "list_game_fixtures", {}, { origin: "mcp", registry: CORE_REGISTRY })) as { result: { fixtures: { id: string; answers: Record<string, string>; problems: string[] }[]; startsIn?: string } };
    expect(listed.result).toMatchObject({ startsIn: "fixture.day-12", fixtures: [{ id: "day-12", scene: "fixture.day-12", answers: { "game.pull": "answers its result", "game.checkIn": "refuses cooldown" }, problems: [] }] });
  });
});

describe("linkFixture on its own", () => {
  it("takes the scene's ids for the fixture: whatever had one is replaced", () => {
    const linked = linkGame({ groups: [], frames: [], mocks: { scenarios: [{ id: "fixture.day-12", name: "Mine" }] } } as unknown as Doc & Record<string, unknown>, EXAMPLE_GAME_CONTRACT).doc;
    const out = linkFixture(linked, EXAMPLE_GAME_FIXTURE);
    expect(out.doc?.mocks?.scenarios?.filter((x) => x.id === "fixture.day-12").map((x) => x.name)).toEqual([`Fixture: ${EXAMPLE_GAME_FIXTURE.name}`]);
    expect(out.doc?.mocks?.worlds?.map((w) => w.id)).toEqual(["fixture.day-12"]);
  });
});
