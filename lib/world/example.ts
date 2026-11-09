/* M3E's example engine: the smallest world a world view can host, to show the contract working end to end and to give a
 * prototype something to play. It is not a game engine and decides nothing for a product: an exported app plugs its own
 * engine into the world view's slot (types.ts `World`). The player (the first entity of kind `player`, else the first)
 * moves the way the `move` input points; touching an entity of kind `item` or `coin` picks it up (`collected`) and, the
 * last one gone, ends the round (`ended`); pressing `attack` near an `enemy` hits it (`hit`). It keeps its own time:
 * whoever hosts it calls `step` (a requestAnimationFrame loop, a timer). No picture of its own: the host draws `view()`.
 * Plain TypeScript, so it goes into an exported app's runtime as it is. */

import type { Vec2, World, WorldChannel, WorldEntity, WorldEventName, WorldEvents, WorldInput, WorldState, WorldStatus } from "./types";
import { WORLD_EVENTS } from "./types";

/** how far the player goes in a second at full tilt, in hundredths of the view */
const SPEED = 50;
/** how near the player has to be to pick something up, and to hit something */
const REACH = { pick: 8, hit: 15 };
/** the most time one step may cover: a tab left in the background does not jump the player across the world */
const MAX_STEP_MS = 100;

/** what the example engine is, beside the contract: stepped by whoever hosts it */
export type ExampleWorld = World & {
  /** moves the world on by `ms` milliseconds */
  step(ms: number): void;
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const round = (n: number) => Math.round(n * 100) / 100;

/** the example engine, starting from the entities the design gives it */
export function createExampleWorld(start: WorldState = {}): ExampleWorld {
  let entities: WorldEntity[] = (start.entities ?? []).map((e) => ({ ...e }));
  let score = Number.isFinite(start.score) ? (start.score as number) : 0;
  let status: WorldStatus = start.status ?? "running";
  let paused = status === "paused";
  let time = 0;
  let heading: Vec2 = { x: 0, y: 0 };
  const changed = new Set<() => void>();
  const listeners: { [K in WorldEventName]: Set<(p: WorldEvents[K]) => void> } = { hit: new Set(), collected: new Set(), ended: new Set() };
  const tell = () => [...changed].forEach((fn) => fn());
  const send = <K extends WorldEventName>(name: K, payload: WorldEvents[K]) => [...listeners[name]].forEach((fn) => fn(payload));
  const player = () => entities.find((e) => e.kind === "player") ?? entities[0];
  const near = (a: WorldEntity, b: WorldEntity, d: number) => Math.hypot(a.x - b.x, a.y - b.y) <= d;
  const pickable = (e: WorldEntity) => e.kind === "item" || e.kind === "coin";

  const world: ExampleWorld = {
    mount: () => {},
    occlude: () => {},
    unmount: () => changed.clear(),
    pointer: () => {},
    input(action: string, value: WorldInput) {
      if (typeof value !== "boolean") {
        if (action === "move") heading = value;
        return;
      }
      const me = player();
      if (!value || action !== "attack" || !me || status !== "running") return;
      for (const e of entities) if (e !== me && e.kind === "enemy" && near(me, e, REACH.hit)) send("hit", { id: e.id, by: me.id });
    },
    step(ms: number) {
      const me = player();
      if (!me || status !== "running" || paused || (heading.x === 0 && heading.y === 0)) return;
      const dt = Math.min(MAX_STEP_MS, Math.max(0, ms)) / 1000;
      time += dt * 1000;
      const moved = { ...me, x: round(clamp(me.x + heading.x * SPEED * dt)), y: round(clamp(me.y + heading.y * SPEED * dt)) };
      const left = entities.filter((e) => pickable(e));
      const picked = left.filter((e) => near(moved, e, REACH.pick));
      entities = entities.flatMap((e) => (e === me ? [moved] : picked.includes(e) ? [] : [e]));
      tell();
      for (const e of picked) {
        score += 1;
        send("collected", { id: e.id, kind: e.kind });
      }
      if (picked.length && picked.length === left.length) {
        status = "ended";
        tell();
        send("ended", { score });
      }
    },
    view: () => ({ entities, score, status: paused && status === "running" ? "paused" : status, ...(start.follow ? { follow: start.follow } : {}) }),
    subscribe(fn: () => void) {
      changed.add(fn);
      return () => void changed.delete(fn);
    },
    on<K extends WorldEventName>(event: K, run: (payload: WorldEvents[K]) => void) {
      const set = listeners[event] as Set<(p: WorldEvents[K]) => void>;
      set.add(run);
      return () => void set.delete(run);
    },
    clock: () => ({ now: time, paused }),
    requestPause(on: boolean) {
      paused = on;
      tell();
      return Promise.resolve({ accepted: true });
    },
  };
  return world;
}

/** Connects a world to the channel its view's inputs come in on and to the design's events: what it holds now first,
 *  then each input as it comes; every event it sends goes to `emit`. Gives back how to undo it. Any engine that
 *  implements `World` connects the same way. */
export function connectWorld(world: World, channel: WorldChannel, emit?: <K extends WorldEventName>(name: K, payload: WorldEvents[K]) => void): () => void {
  for (const [action, value] of Object.entries(channel.held())) world.input(action, value, 0);
  const off = [channel.listen((action, value, at) => world.input(action, value, at)), ...(emit ? WORLD_EVENTS.map((name) => world.on(name, (payload) => emit(name, payload as never))) : [])];
  return () => off.forEach((fn) => fn());
}
