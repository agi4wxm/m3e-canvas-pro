/* The mock library's worlds (docs/模拟库.md “世界脚本”): its own scripts play as their contracts say (the battle's twenty
 * enemies with hit points and positions, the hero's cooldowns, the damage of the last second), a script that does not is
 * told where and why, its pictures (a mock file, a made picture, a made 3D model) become something a stand-in draws, and
 * a document's scripts survive being read in. */

import { describe, expect, it } from "vitest";
import { meshOfDataUrl } from "../../parts/widgets/mesh";
import { sceneAt, scriptLength, type WorldScript } from "../world/script";
import { cleanMocks } from "./clean";
import { BATTLE, BATTLE_WORLD_CONTRACT, battleScript, checkWorldScript, contractOf, findWorldScript, meadowScript, pictureUrl, resolveWorldScript, worldScriptsOf } from "./world";

type Foe = { id: string; kind: string; x: number; y: number; hp: number; maxHp: number };
const enemies = (s: WorldScript, t: number) => (sceneAt(s, t).snapshot.entities as Foe[]).filter((e) => e.kind === "enemy");

describe("the library's scripts", () => {
  it("play as their contracts say", () => {
    expect(checkWorldScript(battleScript())).toEqual([]);
    expect(checkWorldScript(meadowScript())).toEqual([]);
    expect(contractOf(battleScript())).toBe(BATTLE_WORLD_CONTRACT);
  });

  it("battle: twenty enemies with hit points and positions, cooldowns and damage numbers that change as it plays", () => {
    const b = battleScript();
    expect(battleScript()).toEqual(b);
    const start = enemies(b, 0);
    expect(start).toHaveLength(BATTLE.enemies);
    for (const e of start) expect(e.hp).toBe(e.maxHp);
    /* hit points go down, the slimes creep towards the hero, the defeated go */
    const later = enemies(b, 6000);
    expect(later.length).toBeLessThan(BATTLE.enemies);
    expect(later.some((e) => e.hp < e.maxHp)).toBe(true);
    expect(later.some((e) => start.find((s) => s.id === e.id)!.y !== e.y)).toBe(true);
    const mid = sceneAt(b, 6000).snapshot as { cooldowns: Record<string, { readyAt: number; total: number }>; hits: { at: number; amount: number }[] };
    expect(mid.cooldowns.skill1.total).toBe(BATTLE.skills.skill1);
    expect(mid.cooldowns.skill1.readyAt).toBeGreaterThan(6000 - BATTLE.skills.skill1);
    expect(mid.hits.length).toBeGreaterThan(0);
    for (const h of mid.hits) expect(h.at).toBeGreaterThan(5000);
    /* every one down before the round loops, the words and the picture say so */
    const end = sceneAt(b, BATTLE.roundMs - 1);
    expect(enemies(b, BATTLE.roundMs - 1)).toEqual([]);
    expect(end.snapshot.status).toBe("ended");
    expect(end.picture).toBe("model:gem");
    expect(scriptLength(b)).toBe(BATTLE.roundMs);
    /* the next round starts as the first */
    expect(enemies(b, BATTLE.roundMs + 1)).toEqual(start);
  });

  it("are offered beside a document's own, which take their place by id", () => {
    expect(worldScriptsOf(undefined).map((s) => s.id)).toEqual(["battle", "meadow"]);
    const mine: WorldScript = { id: "battle", name: "My battle", steps: [] };
    expect(worldScriptsOf({ worlds: [mine] }).map((s) => s.name)).toEqual(["My battle", "Meadow walk"]);
    expect(findWorldScript({ worlds: [mine] }, "battle")).toBe(mine);
    expect(findWorldScript(undefined, "meadow")?.id).toBe("meadow");
    expect(findWorldScript(undefined, "nope")).toBeUndefined();
  });
});

describe("checking a script", () => {
  it("says where a script breaks its contract, and why", () => {
    const bad: WorldScript = {
      id: "bad",
      name: "Bad",
      start: { entities: [{ id: "hero", kind: "player", x: 10, y: 10 }], score: 0, status: "running" },
      steps: [
        { at: 100, entities: [{ id: "ghost", gone: true }] },
        { at: 200, events: [{ name: "exploded" }, { name: "hit", payload: { id: 3, by: "hero" } }] },
        { at: 300, entities: [{ id: "hero", x: 150 }] },
        { at: 400, picture: "nothing-like-it" },
      ],
    };
    const problems = checkWorldScript(bad);
    expect(problems.map((p) => p.pointer)).toEqual(["#/steps/0/entities/0", "#/steps/1/events/0/name", "#/steps/1/events/1/payload/id", "#/steps/2", "#/steps/3/picture"]);
    expect(problems[3].detail).toContain("/entities/0/x");
    expect(checkWorldScript({ ...bad, contract: "chess" })[0]).toMatchObject({ pointer: "#/contract" });
    /* the battle's contract wants hit points of every entity */
    expect(checkWorldScript({ id: "b", name: "b", contract: "battle", start: { entities: [{ id: "e", kind: "enemy", x: 1, y: 1 }], score: 0, status: "running" }, steps: [] })[0].pointer).toBe("#/start");
  });
});

describe("a script's pictures", () => {
  it("are a mock file, an address, a made picture or a made 3D model, each something a stand-in draws", () => {
    const file = { id: "arena", name: "arena.png", type: "image/png", data: "data:image/png;base64,iVBORw0KGgo=" };
    expect(pictureUrl("arena", [file])).toBe(file.data);
    expect(pictureUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(pictureUrl("image:Battle arena")).toMatch(/^data:image\/svg\+xml;base64,/);
    const model = pictureUrl("model:gem")!;
    expect(model).toMatch(/^data:model\/gltf-binary;base64,/);
    expect(meshOfDataUrl(model)?.indices.length).toBeGreaterThan(0);
    expect(pictureUrl("not-there")).toBeUndefined();
    const resolved = resolveWorldScript({ id: "s", name: "s", picture: "arena", steps: [{ at: 1, picture: "model:box" }, { at: 2, picture: "" }] }, [file]);
    expect(resolved.picture).toBe(file.data);
    expect(resolved.steps[0].picture).toMatch(/^data:model\//);
    expect(resolved.steps[1].picture).toBe("");
  });
});

describe("a document's world scripts", () => {
  it("are kept as they are read in, within bounds, with the one the preview starts with", () => {
    const b = battleScript();
    const m = cleanMocks({ worlds: [b, { id: "bad id!", steps: [] }, { id: "x", steps: [{ at: -5, events: [{ name: "1bad" }, { name: "hit" }] }, "junk"], loop: 10 }], world: "battle" })!;
    expect(m.world).toBe("battle");
    expect(m.worlds?.map((s) => s.id)).toEqual(["battle", "x"]);
    expect(m.worlds![0]).toEqual(b);
    expect(m.worlds![1]).toEqual({ id: "x", name: "x", steps: [{ at: 0, events: [{ name: "hit" }] }], loop: 100 });
  });
});
