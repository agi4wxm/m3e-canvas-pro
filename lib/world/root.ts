/* The `world` root of the expressions (docs/数据绑定.md “每帧绑定”, docs/世界宿主契约.md “HUD 读什么”): what a binding marked
 * per frame reads of the world a world view hosts. It is the world's snapshot (`World.view()`) as the world's contract
 * describes it (contract.ts: `world.score`, `world.entities[0].x`), and beside it two keys the host adds and no snapshot
 * may claim for itself:
 *
 *   world.clock      the world's own time (`World.clock()`): `now` (ms of world time), `paused`, `rate`; cooldowns and
 *                    countdowns of the world are read off it, never off the device's clock
 *   world.byId       the snapshot's entities by their id: `world.byId.slime.hp`, the same entity whatever its place in
 *                    the list (what an anchor to an entity names, too)
 *
 * The root is small on purpose: anything else a HUD shows comes from the snapshot the world says it gives. Plain
 * TypeScript and no imports beyond types, so it goes into an exported app's runtime as it is (src/engine/world). */

import type { WorldClock } from "./types";
import type { WorldSchema } from "./contract";

/** what a host reads a world through for the `world` root: its snapshot and its clock (a `World` is one) */
export type WorldSource = { view(): unknown; clock?(): WorldClock };

/** the keys the host adds beside the snapshot's own */
export const WORLD_ROOT_KEYS = ["clock", "byId"] as const;

/** the clock of a world that says none: standing still at its start */
const STILL: WorldClock = { now: 0, paused: true, rate: 1 };

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** the entities of a snapshot by their id: each one whose `id` is words, the first of an id kept */
function byIdOf(snapshot: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const list = snapshot.entities;
  if (!Array.isArray(list)) return out;
  for (const e of list) if (isPlain(e) && typeof e.id === "string" && e.id && !(e.id in out)) out[e.id] = e;
  return out;
}

/** The value of the `world` root for a snapshot and a clock: the snapshot's own keys, its entities by id (`byId`) and the
 *  clock. A snapshot that is no object reads as an empty one. */
export function worldRootOf(snapshot: unknown, clock: WorldClock = STILL): Record<string, unknown> {
  const own = isPlain(snapshot) ? snapshot : {};
  return { ...own, byId: byIdOf(own), clock: { now: Number.isFinite(clock.now) ? clock.now : 0, paused: !!clock.paused, rate: Number.isFinite(clock.rate) ? clock.rate : 1 } };
}

/** The `world` root as a source gives it now, or undefined when there is no world to read (no world view mounted one,
 *  or reading it failed: a world's own error never stops the screen). */
export function readWorld(source: WorldSource | undefined): Record<string, unknown> | undefined {
  if (!source) return undefined;
  try {
    return worldRootOf(source.view(), source.clock?.());
  } catch {
    return undefined;
  }
}

const CLOCK_SCHEMA = {
  type: "object",
  description: "the world's own time",
  properties: { now: { type: "number", description: "ms of world time" }, paused: { type: "boolean" }, rate: { type: "number", description: "how fast world time runs against the app's clock" } },
  required: ["now", "paused", "rate"],
};

/** The JSON Schema of the `world` root for a world's snapshot schema (its contract's `snapshot`): the snapshot's own
 *  properties, `clock`, and `byId` with each entity as the snapshot's `entities` items describe it. What the editor's
 *  checks and suggestions (lib/bindings/complete.ts) and an export's generated types read. */
export function worldRootSchema(snapshot: WorldSchema): Record<string, unknown> {
  const own = isPlain(snapshot) && isPlain(snapshot.properties) ? (snapshot.properties as Record<string, unknown>) : {};
  const entities = own.entities;
  const entity = isPlain(entities) && entities.type === "array" ? (entities.items ?? {}) : {};
  return {
    type: "object",
    description: "the world's snapshot (World.view()), its entities by id and its clock",
    properties: { ...own, byId: { type: "object", description: "the entities by their id", additionalProperties: entity }, clock: CLOCK_SCHEMA },
    required: ["byId", "clock"],
    additionalProperties: false,
  };
}
