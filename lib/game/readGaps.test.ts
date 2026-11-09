/* What a design reads of the world's snapshot and of an event's payload that the gameplay contract has no place for
 * (readGaps.ts, the plan's J7): found where the design reads it (a per-frame binding, a binding to an expression, the
 * words of a part, an action on a world's event), in the gap file's format with the rest of the contract's gaps. */

import { describe, expect, it } from "vitest";
import type { Doc, Item } from "../tokens";
import { EXAMPLE_GAME_CONTRACT, gameGaps, gameHubGaps, gapWhere, linkGame, readGaps, rootPathsIn, schemaReach, worldRootSchemaOf, type GameContract } from ".";

const part = (id: string, component: string, extra: Partial<Item> & Record<string, unknown> = {}): Item => ({ id, kind: "component", component, label: "", icon: null, variant: "", props: {}, ...extra }) as Item;

/** a document linked to a contract, one screen holding `items`, and a component holding `inComponent` */
function docWith(items: Item[], o: { contract?: GameContract; inComponent?: Item[] } = {}): Doc {
  return {
    ...linkGame({ groups: [], frames: [] }, o.contract ?? EXAMPLE_GAME_CONTRACT).doc,
    frames: [{ id: "battle", name: "Battle", x: 0, y: 0 }],
    groups: [{ id: "g1", x: 0, y: 0, axis: "y", items }],
    ...(o.inComponent ? { components: [{ id: "c1", name: "Hud", groups: [{ id: "cg", x: 0, y: 0, axis: "y", items: o.inComponent }] }] } : {}),
  } as unknown as Doc;
}

describe("the paths an expression reads of a root", () => {
  it("are read with the expression language where it reads them, and as words where it does not know the root yet", () => {
    /* `data` is a root the language reads: its own reader gives the paths */
    expect(rootPathsIn("data.shop.items[0].name + 1", "data")).toEqual([["shop", "items", "0", "name"]]);
    /* `world`, read the same whether the language knows it or not (lib/world/root.ts) */
    expect(rootPathsIn("world.byId.slime.hp / world.byId['slime'].max", "world")).toEqual([
      ["byId", "slime", "hp"],
      ["byId", "slime", "max"],
    ]);
    expect(rootPathsIn("world.entities[0].x", "world")).toEqual([["entities", "0", "x"]]);
    /* not a path of the root: another root's key, a quoted word */
    expect(rootPathsIn("data.world.x == 'world.y'", "world")).toEqual([]);
    expect(rootPathsIn("", "world")).toEqual([]);
  });
});

describe("a schema's places", () => {
  it("are followed through $ref, unions and arrays, and a place the schema leaves open is no gap", () => {
    const s = {
      $defs: { hp: { type: "object", properties: { now: { type: "number" }, max: { type: "number" } }, additionalProperties: false } },
      type: "object",
      properties: { hp: { $ref: "#/$defs/hp" }, team: { anyOf: [{ type: "object", properties: { a: { type: "number" } }, additionalProperties: false }, { type: "object", properties: { b: { type: "number" } }, additionalProperties: false }] }, free: { type: "object" }, list: { type: "array", items: { type: "string" } } },
      additionalProperties: false,
    };
    expect(schemaReach(s, ["hp", "now"]).reach).toBe(2);
    expect(schemaReach(s, ["hp", "min"])).toEqual({ reach: 1, names: ["now", "max"] });
    expect(schemaReach(s, ["team", "b"]).reach).toBe(2);
    expect(schemaReach(s, ["team", "c"]).reach).toBe(1);
    expect(schemaReach(s, ["free", "anything", "at", "all"]).reach).toBe(4);
    expect(schemaReach(s, ["list", "3", "length"]).reach).toBe(3);
    expect(schemaReach(s, ["list", "name"]).reach).toBe(1);
    expect(schemaReach(s, ["lives"])).toEqual({ reach: 0, names: ["hp", "team", "free", "list"] });
    expect(schemaReach({ $ref: "https://elsewhere/schema" }, ["x"]).reach).toBe(1);
    expect(schemaReach(true, ["x", "y"]).reach).toBe(2);
  });

  it("of the world root are the snapshot's own keys, its entities by id and its clock", () => {
    const root = worldRootSchemaOf(EXAMPLE_GAME_CONTRACT.snapshot as Record<string, unknown>);
    expect(schemaReach(root, ["score"]).reach).toBe(1);
    expect(schemaReach(root, ["byId", "slime", "x"]).reach).toBe(3);
    expect(schemaReach(root, ["byId", "slime", "hp"]).reach).toBe(2);
    expect(schemaReach(root, ["clock", "now"]).reach).toBe(2);
    expect(schemaReach(root, ["clock", "tick"]).reach).toBe(1);
    expect(schemaReach(root, ["lives"]).reach).toBe(0);
  });
});

describe("what a design reads that the contract has no place for", () => {
  it("is each path of the snapshot and each field of an event's payload, where it is read", () => {
    const doc = docWith(
      [
        part("world", "world-view", { actions: { "on:hit": { to: "none", effects: [{ do: "snackbar", message: "{{event.by}} hit {{event.damage}}" }] }, "on:ended": { to: "none", effects: [{ do: "setVar", var: "best", value: 0, expr: "event.score" }] } } }),
        part("hp", "progress", { label: "HP", frame: { value: "world.byId.hero.hp / 100", "@opacity": "world.clock.paused ? 0.5 : 1" } }),
        part("score", "text", { label: "Score", frame: { text: "world.score" }, bind: { label: "=world.lives" }, props: { text: "Round {{world.round}}" } }),
        part("x", "text", { label: "X", frame: { text: "world.entities[0].x + world.entities[0].z" } }),
      ],
      { inComponent: [part("combo", "text", { label: "Combo", frame: { text: "world.combo" } })] },
    );
    expect(readGaps(doc).map((g) => `${g.kind} ${g.ref} @ ${gapWhere(g.where)}`)).toEqual([
      "payload event hit.damage @ screen Battle, part world, on:hit",
      "snapshot world.byId.hero.hp @ screen Battle, part HP, frame value",
      "snapshot world.lives @ screen Battle, part Score, bind label",
      "snapshot world.round @ screen Battle, part Score, text",
      "snapshot world.entities[0].z @ screen Battle, part X, frame text",
      "snapshot world.combo @ component Hud, part Combo, frame text",
    ]);
    const [hp] = readGaps(doc).filter((g) => g.ref === "world.byId.hero.hp");
    expect(hp.detail).toBe("reads world.byId.hero.hp, which the game's snapshot has no place for (world.byId.hero has id, kind, x, y, label)");
    /* with the contract's other gaps, and in the gap file's format: module game-loop, one per thing missing */
    expect(gameGaps(doc).filter((g) => g.kind === "snapshot" || g.kind === "payload")).toHaveLength(6);
    expect(gameHubGaps(doc).map((g) => [g.kind, g.module, g.ref, g.reason])).toEqual([
      ["game-payload", "game-loop", "event hit.damage", "missing"],
      ["game-snapshot", "game-loop", "world.byId.hero.hp", "missing"],
      ["game-snapshot", "game-loop", "world.lives", "missing"],
      ["game-snapshot", "game-loop", "world.round", "missing"],
      ["game-snapshot", "game-loop", "world.entities[0].z", "missing"],
      ["game-snapshot", "game-loop", "world.combo", "missing"],
    ]);
  });

  it("is none for what the snapshot has, for a snapshot that leaves its keys open, and without a contract", () => {
    const reads = [part("hp", "text", { frame: { text: "world.score + world.byId.hero.x + world.clock.now" } }), part("w", "world-view", { actions: { "on:collected": { to: "none", effects: [{ do: "snackbar", message: "{{event.kind}}" }] } } })];
    expect(readGaps(docWith(reads))).toEqual([]);
    const open: GameContract = { ...EXAMPLE_GAME_CONTRACT, snapshot: { type: "object", properties: { score: { type: "number" } } } };
    expect(readGaps(docWith([part("t", "text", { frame: { text: "world.anything.at.all" } })], { contract: open }))).toEqual([]);
    const { game: _none, ...unlinked } = docWith([part("t", "text", { frame: { text: "world.lives" } })]) as Doc & { game?: unknown };
    expect(readGaps(unlinked as Doc)).toEqual([]);
  });
});
