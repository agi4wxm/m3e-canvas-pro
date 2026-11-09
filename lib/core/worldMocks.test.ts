/* The world scripts as the AI and MCP write them (docs/模拟库.md “世界脚本”): set_mock_world copies the library's battle
 * or writes one of its own, refuses a script that breaks its contract or names a world view that is not there, and
 * set_mocks {world} picks the one the preview starts with; a screenshot can draw a screen's world views at a moment of
 * a script (lib/bindings/headless.ts `worldAt`). */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { worldAt } from "../bindings/headless";
import { guessMeasurer, OpError } from "./op";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

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

function arena() {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.transact("Arena", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "arena", name: "Arena" });
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: "arena", at: { x: 16, y: 80 } });
  });
  return s;
}

describe("writing world scripts", () => {
  it("copies the library's battle, picks it for the preview, and removes it", () => {
    const s = arena();
    expect(s.run(ops.setMockWorld, { from: "battle", views: ["world"] }, ai)).toMatchObject({ id: "battle", contract: "battle" });
    const doc = s.get().doc;
    expect(doc.mocks?.worlds?.[0]).toMatchObject({ id: "battle", contract: "battle", views: ["world"], loop: 24_000 });
    s.run(ops.setMocks, { world: "battle" }, ai);
    expect(s.get().doc.mocks?.world).toBe("battle");
    fails(() => s.run(ops.setMocks, { world: "chess" }, ai), "not_found", /battle, meadow/);
    s.run(ops.removeMockWorld, { id: "battle" }, ai);
    expect(s.get().doc.mocks?.worlds).toBeUndefined();
    expect(s.get().doc.mocks?.world).toBeUndefined();
  });

  it("writes one of its own, held to its contract", () => {
    const s = arena();
    const start = { entities: [{ id: "hero", kind: "player", x: 10, y: 50 }], score: 0, status: "running" };
    s.run(ops.setMockWorld, { name: "Boss fight", start, steps: [{ at: 500, events: [{ name: "hit", payload: { id: "boss", by: "hero" } }] }] }, ai);
    expect(s.get().doc.mocks?.worlds?.[0].id).toBe("boss-fight");
    fails(() => s.run(ops.setMockWorld, { id: "bad", name: "Bad", start, steps: [{ at: 1, events: [{ name: "exploded" }] }] }, ai), "invalid_value", /#\/steps\/0\/events\/0\/name is no event of the contract/);
    fails(() => s.run(ops.setMockWorld, { id: "far", name: "Far", start, steps: [{ at: 1, entities: [{ id: "hero", x: 500 }] }] }, ai), "invalid_value", /snapshot the contract refuses/);
    fails(() => s.run(ops.setMockWorld, { from: "battle", views: ["nowhere"] }, ai), "not_found", /The world views are: world/);
    fails(() => s.run(ops.setMockWorld, { id: "empty", name: "Empty" }, ai), "invalid_value", /needs its steps/);
  });
});

describe("a screenshot of a scene", () => {
  it("draws the world views as the script shows them at a moment, with the events sent up to then", async () => {
    const s = arena();
    s.run(ops.setMockWorld, { from: "battle" }, ai);
    const doc = savedDoc(s.get());
    const { doc: drawn, moment } = await worldAt(doc, { script: "battle", at: 6000, screen: "arena" });
    const world = drawn.groups.flatMap((g) => g.items).find((it) => it.id === "world")!;
    const table = world.props!.entities as { columns: string[]; rows: string[][] };
    expect(table.columns).toEqual(["Id", "Kind", "X", "Y", "Label", "HP", "Max HP"]);
    expect(table.rows.length).toBeGreaterThan(1);
    expect(table.rows.some((r) => r[1] === "enemy" && Number(r[5]) < Number(r[6]))).toBe(true);
    expect(world.props!.picture).toMatch(/^data:image\/svg\+xml/);
    expect(moment).toMatchObject({ script: "battle", at: 6000, views: ["world"] });
    expect(moment.events.some((e) => / damaged /.test(e))).toBe(true);
    /* the moment comes round again when the script loops */
    expect((await worldAt(doc, { script: "battle", at: 30_000 })).moment.at).toBe(6000);
    await expect(worldAt(doc, {})).rejects.toThrow(/Name a world script/);
  });
});
