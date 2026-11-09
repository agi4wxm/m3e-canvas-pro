/* A world's contract (docs/世界宿主契约.md): the input actions it takes, by name and type; its snapshot (`World.view()`)
 * and the payload of each of its events, as JSON Schema; its clock domain. It is data a world brings and M3E reads: the
 * design is held to it (a world view's `inputs` names its input actions, the editor checks the taps against them) and
 * exports generate types from it (TypeScript now, GDScript for an engine later), but M3E owns none of its rules: a game
 * loop authored elsewhere hands in a contract of the same shape (the plan's batch 7), and this file only says the shape
 * and holds M3E's example engine's. Plain data and no imports beyond types, so it goes into an exported app's runtime as
 * it is. */

import type { WorldInputDecl, WorldInputType } from "./types";

/** a JSON Schema (2020-12), as plain data */
export type WorldSchema = boolean | { [keyword: string]: unknown };

export type WorldContract = {
  /** the contract's own version: a world brings the one it was written for */
  version: 1;
  /** what the world is, in a sentence */
  summary?: string;
  /** the input actions it takes, by name: a direction or a button, each mapped later to a joystick, a key, a pad */
  inputs: Record<string, { type: WorldInputType; summary?: string }>;
  /** what `view()` gives: the small snapshot a HUD reads */
  snapshot: WorldSchema;
  /** the events it sends, by name, with the schema of what each carries */
  events: Record<string, { summary?: string; payload: WorldSchema }>;
  /** the world's time: ms of world time, which may stand still and run at a rate against the app's clock */
  clock: { unit: "ms"; pausable: boolean; rates: number[] };
};

const num = { type: "number" } as const;
const str = { type: "string" } as const;
const entity = { type: "object", properties: { id: str, kind: str, x: { type: "number", minimum: 0, maximum: 100 }, y: { type: "number", minimum: 0, maximum: 100 }, label: str }, required: ["id", "kind", "x", "y"], additionalProperties: false };

/** The contract of M3E's example engine (example.ts): what a world view's stand-in and its tests are written to. */
export const EXAMPLE_WORLD_CONTRACT: WorldContract = {
  version: 1,
  summary: "M3E's example engine: a player moved by a direction picks up coins and items and hits enemies near it.",
  inputs: {
    move: { type: "vec2", summary: "the way the player goes, x and y from -1 to 1" },
    attack: { type: "bool", summary: "held down: hits the enemies near the player" },
  },
  snapshot: {
    type: "object",
    properties: { entities: { type: "array", items: entity }, follow: str, score: { type: "number", minimum: 0 }, status: { type: "string", enum: ["running", "paused", "ended"] } },
    required: ["entities", "score", "status"],
    additionalProperties: false,
  },
  events: {
    hit: { summary: "something was hit", payload: { type: "object", properties: { id: str, by: str }, required: ["id", "by"], additionalProperties: false } },
    collected: { summary: "something was picked up", payload: { type: "object", properties: { id: str, kind: str }, required: ["id", "kind"], additionalProperties: false } },
    ended: { summary: "the round is over", payload: { type: "object", properties: { score: num }, required: ["score"], additionalProperties: false } },
  },
  clock: { unit: "ms", pausable: true, rates: [0.5, 1, 2] },
};

/** the input actions a contract declares, as a world view's `inputs` lists them */
export const contractInputs = (c: WorldContract): WorldInputDecl[] => Object.entries(c.inputs).map(([name, d]) => ({ name, type: d.type }));
