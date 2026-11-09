/* A mock world (docs/模拟库.md “世界脚本”): a World played from a script (script.ts), for a world view with no engine
 * behind it: the editor's preview with a world script chosen, a prototype, and a development build of an exported app
 * (the real engine takes its place in production). It is spoken to only through `World` (docs/世界宿主契约.md), like
 * any engine: `mount` starts its own loop, its time is world time run off the clock it is made with (the app's domain
 * clock: the mocks' in a preview, which may stand still or run faster) at its own rate, `requestPause` stops it. What it
 * shows at a time is the script's scene at that time (`sceneAt`), whatever steps its loop took to get there, and the
 * events of the steps it passed are sent in order: so the same script on a paused, a slow or a fast clock comes to the
 * same snapshots at the same world times and sends the same events. The inputs it is sent are heard, not obeyed: a
 * script is a recording, not a game. Beside `World` it says the words and the picture of its scene (`scene()`), and
 * sends every event of its script, by any name (`onAny`); `on` takes the names the world view declares.
 *
 * Plain TypeScript, no imports beyond its own folder, so it goes into an exported app's runtime as it is. */

import type { World, WorldClock, WorldEventName, WorldEvents, WorldState } from "./types";
import { applyStep, eventsBetween, orderedSteps, scriptLength, sceneAt, startScene, type WorldScene, type WorldScript, type WorldScriptFired, type WorldScriptStep } from "./script";

export type { WorldScene, WorldScript, WorldScriptFired };

/** How a mock world is made: the clock its world time runs off (the app's domain clock, ms; the device's when none is
 *  given), how often its loop runs, how fast its world time goes against the clock, the design's state it starts from
 *  under the script's own start. */
export type ScriptedWorldOptions = { now?: () => number; tickMs?: number; rate?: number; base?: WorldState | Record<string, unknown> };

export type ScriptedWorld = World & {
  readonly script: WorldScript;
  /** moves the world on by `ms` of world time, sending the events of the steps it passes (its tests do; a host never needs to) */
  step(ms: number): void;
  /** goes to a world time of the round at once, sending nothing: a screenshot's scene */
  seek(t: number): void;
  /** the words and the picture of the scene now */
  scene(): { scene?: string; picture?: string };
  /** hears every event the script sends, by any name; gives back how to stop */
  onAny(run: (name: string, payload: unknown, at: number) => void): () => void;
};

/* the timers every platform has, typed here: the app runtime's own types name no DOM */
const timers = globalThis as unknown as { setInterval(run: () => void, ms: number): unknown; clearInterval(id: unknown): void };

/** the most world time one turn of the loop covers: a tab left in the background does not play a minute at once */
const MAX_TURN_MS = 2000;
/** the shortest round a looping script has */
const MIN_LOOP_MS = 100;

/** a world played from a script, from the design's state `o.base` */
export function createScriptedWorld(script: WorldScript, o: ScriptedWorldOptions = {}): ScriptedWorld {
  const clockNow = () => {
    const n = o.now?.();
    return typeof n === "number" && Number.isFinite(n) ? n : Date.now();
  };
  const rate = typeof o.rate === "number" && o.rate > 0 ? o.rate : 1;
  const base = (o.base ?? {}) as Record<string, unknown>;
  const steps = orderedSteps(script);
  const loop = typeof script.loop === "number" && script.loop > 0 ? Math.max(MIN_LOOP_MS, script.loop) : 0;
  let scene: WorldScene = startScene(script, base);
  /* the next step to play, and the round's time */
  let next = 0;
  let time = 0;
  let paused = false;
  let loopId: unknown;
  let last = 0;
  let shown: WorldState = { ...scene.snapshot } as WorldState;
  const changed = new Set<() => void>();
  const named = new Map<string, Set<(payload: never) => void>>();
  const any = new Set<(name: string, payload: unknown, at: number) => void>();
  const tell = () => [...changed].forEach((fn) => fn());
  /* a listener that stops listening while it hears does not stop the others hearing */
  const send = (e: WorldScriptFired) => {
    for (const fn of Array.from(named.get(e.name) ?? [])) fn(e.payload as never);
    for (const fn of Array.from(any)) fn(e.name, e.payload, e.at);
  };
  const firedAt = (s: WorldScriptStep): WorldScriptFired[] => (Array.isArray(s.events) ? s.events : []).filter((e) => e && typeof e.name === "string").map((e) => ({ at: s.at, name: e.name, payload: JSON.parse(JSON.stringify(e.payload ?? {})) as unknown }));
  const refresh = () => {
    shown = { ...scene.snapshot } as WorldState;
  };
  /* the start of a round: its scene, and the events of the steps at 0 */
  const restart = (events: boolean) => {
    scene = startScene(script, base);
    next = 0;
    time = 0;
    playUntil(0, events, true);
  };
  /** plays the steps up to round time `t` (those at `t` included, or before it only with `before`) */
  function playUntil(t: number, events: boolean, inclusive: boolean) {
    let moved = false;
    while (next < steps.length && (inclusive ? steps[next].at <= t : steps[next].at < t)) {
      const s = steps[next++];
      applyStep(scene, s);
      moved = true;
      if (events) {
        refresh();
        tell();
        for (const e of firedAt(s)) send(e);
      }
    }
    if (moved) refresh();
    return moved;
  }

  const world: ScriptedWorld = {
    script,
    mount: () => {
      if (loopId !== undefined) return;
      last = clockNow();
      loopId = timers.setInterval(() => {
        const at = clockNow();
        const ms = Math.min(MAX_TURN_MS, Math.max(0, at - last) * rate);
        last = at;
        world.step(ms);
      }, Math.max(8, o.tickMs ?? 33));
    },
    occlude: () => {},
    pointer: () => {},
    input: () => {},
    unmount: () => {
      if (loopId !== undefined) timers.clearInterval(loopId);
      loopId = undefined;
      changed.clear();
    },
    step(ms: number) {
      if (paused) return;
      /* the events of the steps at 0, held from when it was made until something could hear them */
      for (const e of pending.splice(0)) send(e);
      if (!(ms > 0)) return;
      let left = ms;
      let moved = false;
      /* a round over goes on into the next, as many as the time covers (a loop is at least MIN_LOOP_MS) */
      for (let guard = 0; left > 0 && guard < 1000; guard++) {
        if (loop && time + left >= loop) {
          left -= loop - time;
          moved = playUntil(loop, true, false) || moved;
          restart(true);
          moved = true;
          continue;
        }
        time += left;
        left = 0;
        moved = playUntil(time, true, true) || moved;
      }
      if (moved) tell();
    },
    seek(t: number) {
      const at = Math.max(0, Number.isFinite(t) ? t : 0);
      const target = loop ? at % loop : at;
      const s = sceneAt(script, target, base);
      scene = s;
      next = steps.findIndex((x) => x.at > target);
      if (next < 0) next = steps.length;
      time = target;
      pending = [];
      refresh();
      tell();
    },
    view: () => (paused && (shown.status ?? "running") === "running" ? { ...shown, status: "paused" } : shown),
    scene: () => ({ ...(scene.scene !== undefined ? { scene: scene.scene } : {}), ...(scene.picture !== undefined ? { picture: scene.picture } : {}) }),
    subscribe(fn: () => void) {
      changed.add(fn);
      return () => void changed.delete(fn);
    },
    on<K extends WorldEventName>(event: K, run: (payload: WorldEvents[K]) => void) {
      const set = named.get(event) ?? new Set();
      named.set(event, set);
      set.add(run as (payload: never) => void);
      return () => void set.delete(run as (payload: never) => void);
    },
    onAny(run) {
      any.add(run);
      return () => void any.delete(run);
    },
    clock: (): WorldClock => ({ now: time, paused, rate }),
    requestPause(on: boolean) {
      paused = on;
      tell();
      return Promise.resolve({ accepted: true });
    },
  };
  /* the steps at 0 are the start's: played now, their events sent on the first turn, once something listens */
  let pending = eventsBetween(script, -1, 0);
  playUntil(0, false, true);
  return world;
}

/** how long one round of a script is, in ms of world time (0 for a script with no steps and no loop) */
export const roundLength = (script: WorldScript) => scriptLength(script);
