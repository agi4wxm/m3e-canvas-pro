/* Where the input actions of a design (`move`, `press`, `release`, lib/actions) go: a channel for each world view, by its
 * item id, that its engine (or its stand-in) listens on. Each host of the design (the preview, the web app, the phone
 * app, the mini-program) keeps one and hands it the interpreter's `worldInput`; the channel delivers at once, through
 * no app state, which a world taking a joystick at sixty moves a second needs. A world mounted later reads what each
 * input holds now (`held`). Plain TypeScript and no imports beyond the types, so it goes into an exported app's runtime
 * as it is. */

import type { HostSignal, WorldChannel, WorldInput, WorldListener, WorldPointer, WorldRect } from "./types";

export type Worlds = {
  /** an input for the world view `part` */
  send(part: string, action: string, value: WorldInput): void;
  /** the channel the world view `part` listens on */
  channel(part: string): WorldChannel;
  /** Lets go of every input the world view `part` holds (docs/世界宿主契约.md “浮层”): each held direction goes back to the
   *  middle, each button held down is let go, sent as inputs are. What a host does as an overlay opens over the world. */
  release(part: string): void;
  /** Covers every world view, or uncovers them (docs/世界宿主契约.md “浮层”, lib/world/layers.ts `covers`): as a modal
   *  layer or an overlay part opens, every input each view holds is let go (`release`), and nothing more is sent to any
   *  until they are uncovered; then inputs go through again. */
  cover(on: boolean): void;
  /** whether the views are covered now */
  covered(): boolean;
  /** asks every world view's world to stand still or to go on (`World.requestPause`), as the layers say (`pausesWorld`) */
  pause(on: boolean): void;
  /** tells the world view `part` which of it the HUD covers, in its own pixels (`World.occlude`) */
  occlude(part: string, rects: WorldRect[]): void;
  /** a pointer that fell through every layer onto the world view `part` (`World.pointer`); none while covered */
  pointer(part: string, e: WorldPointer): void;
  /** forgets every input held (the app started over) */
  clear(): void;
};

/** a channel for each world view; `now` is the app's clock the inputs are timed by */
export function createWorlds(now: () => number = () => Date.now()): Worlds {
  const listeners = new Map<string, Set<WorldListener>>();
  const holding = new Map<string, Record<string, WorldInput>>();
  const channels = new Map<string, WorldChannel>();
  const watchers = new Map<string, Set<(s: HostSignal) => void>>();
  const occluded = new Map<string, WorldRect[]>();
  let isCovered = false;
  let paused = false;
  const deliver = (part: string, action: string, value: WorldInput) => {
    holding.set(part, { ...holding.get(part), [action]: value });
    const at = now();
    /* a listener that stops listening while it hears does not stop the others hearing */
    for (const fn of Array.from(listeners.get(part) ?? [])) fn(action, value, at);
  };
  const tell = (part: string, signal: HostSignal) => {
    for (const fn of Array.from(watchers.get(part) ?? [])) fn(signal);
  };
  const parts = () => new Set([...listeners.keys(), ...holding.keys(), ...watchers.keys()]);
  const letGo = (part: string) => {
    for (const [action, value] of Object.entries(holding.get(part) ?? {})) {
      if (value === true) deliver(part, action, false);
      else if (typeof value === "object" && (value.x !== 0 || value.y !== 0)) deliver(part, action, { x: 0, y: 0 });
    }
  };
  return {
    send(part, action, value) {
      /* covered by a dialog or an overlay: nothing reaches the world until it closes */
      if (isCovered) return;
      deliver(part, action, value);
    },
    channel(part) {
      const known = channels.get(part);
      if (known) return known;
      const made: WorldChannel = {
        listen(fn) {
          const set = listeners.get(part) ?? new Set<WorldListener>();
          listeners.set(part, set);
          set.add(fn);
          return () => void set.delete(fn);
        },
        held: () => ({ ...holding.get(part) }),
        watch(fn) {
          const set = watchers.get(part) ?? new Set<(s: HostSignal) => void>();
          watchers.set(part, set);
          set.add(fn);
          return () => void set.delete(fn);
        },
        hosted: () => ({ paused, occluded: [...(occluded.get(part) ?? [])] }),
      };
      channels.set(part, made);
      return made;
    },
    release: letGo,
    cover(on) {
      if (on === isCovered) return;
      if (on) for (const part of parts()) letGo(part);
      isCovered = on;
    },
    covered: () => isCovered,
    pause(on) {
      if (on === paused) return;
      paused = on;
      for (const part of parts()) tell(part, { pause: on });
    },
    occlude(part, rects) {
      occluded.set(part, rects);
      tell(part, { occlude: rects });
    },
    pointer(part, e) {
      if (!isCovered) tell(part, { pointer: e });
    },
    clear() {
      holding.clear();
    },
  };
}

/** a channel nothing is ever sent on: a world view drawn where no design's taps reach it (the canvas, a gallery) */
export const QUIET_CHANNEL: WorldChannel = { listen: () => () => {}, held: () => ({}) };

/** What a stand-in (and the table's runners) say of what the host told the world beside its inputs: `paused` when it is
 *  asked to stand still, `resumed` when to go on; nothing for what the HUD covers or a pointer. */
export function hostWords(signal: HostSignal): string | null {
  return "pause" in signal ? (signal.pause ? "paused" : "resumed") : null;
}

/** the log once the host said something to the world: its words, the newest last, as `inputLog` keeps inputs */
export function hostLog(log: readonly string[], signal: HostSignal): string[] {
  const line = hostWords(signal);
  return line ? [...log, line].slice(-INPUT_LOG_SIZE) : [...log];
}

const two = (n: number) => String(Math.round(n * 100) / 100 || 0);

/** An input as a stand-in says it: `move 0.5,-1` for a direction, `attack ↓` pressed and `attack ↑` let go. The same
 *  words on every host (the kits write them the same way), so what a design sent can be read off the screen. */
export function inputWords(action: string, value: WorldInput): string {
  return typeof value === "boolean" ? `${action} ${value ? "↓" : "↑"}` : `${action} ${two(value.x)},${two(value.y)}`;
}

/** how many inputs a stand-in lists */
export const INPUT_LOG_SIZE = 4;

/** The inputs a stand-in lists, the newest last: a direction takes the place of the one before it of the same input
 *  (a joystick sends many), a press or a let-go is a line of its own. */
export function inputLog(log: readonly string[], action: string, value: WorldInput): string[] {
  const line = inputWords(action, value);
  const last = log[log.length - 1];
  const same = typeof value !== "boolean" && last !== undefined && last.startsWith(`${action} `) && !/[↓↑]$/.test(last);
  return [...(same ? log.slice(0, -1) : log), line].slice(-INPUT_LOG_SIZE);
}
