/* Where the input actions of a design (`move`, `press`, `release`, lib/actions) go: a channel for each world view, by its
 * item id, that its engine (or its stand-in) listens on. Each host of the design (the preview, the web app, the phone
 * app, the mini-program) keeps one and hands it the interpreter's `worldInput`; the channel delivers at once, through
 * no app state, which a world taking a joystick at sixty moves a second needs. A world mounted later reads what each
 * input holds now (`held`). Plain TypeScript and no imports beyond the types, so it goes into an exported app's runtime
 * as it is. */

import type { WorldChannel, WorldClock, WorldInput, WorldListener } from "./types";

/** what the HUD reads a world through (lib/world/root.ts `WorldSource`): its snapshot and its clock; a `World` is one */
type Readable = { view(): unknown; clock?(): WorldClock };

export type Worlds = {
  /** an input for the world view `part` */
  send(part: string, action: string, value: WorldInput): void;
  /** the channel the world view `part` listens on */
  channel(part: string): WorldChannel;
  /** Lets go of every input the world view `part` holds (docs/世界宿主契约.md “浮层”): each held direction goes back to the
   *  middle, each button held down is let go, sent as inputs are. What a host does as an overlay opens over the world. */
  release(part: string): void;
  /** forgets every input held (the app started over) */
  clear(): void;
  /** The world the HUD reads (the `world` root of a binding per frame, lib/world/root.ts): the first world still
   *  connected to a view's channel (`connectWorld` connects it), else none. */
  attached(): Readable | undefined;
};

/** a channel for each world view; `now` is the app's clock the inputs are timed by */
export function createWorlds(now: () => number = () => Date.now()): Worlds {
  const listeners = new Map<string, Set<WorldListener>>();
  const holding = new Map<string, Record<string, WorldInput>>();
  const channels = new Map<string, WorldChannel>();
  /* the worlds connected to the views' channels, in the order they came */
  const mounted: { part: string; world: Readable }[] = [];
  return {
    send(part, action, value) {
      holding.set(part, { ...holding.get(part), [action]: value });
      const at = now();
      /* a listener that stops listening while it hears does not stop the others hearing */
      for (const fn of Array.from(listeners.get(part) ?? [])) fn(action, value, at);
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
        attach(world) {
          const entry = { part, world };
          mounted.push(entry);
          return () => {
            const at = mounted.indexOf(entry);
            if (at >= 0) mounted.splice(at, 1);
          };
        },
      };
      channels.set(part, made);
      return made;
    },
    release(part) {
      for (const [action, value] of Object.entries(holding.get(part) ?? {})) {
        if (value === true) this.send(part, action, false);
        else if (typeof value === "object" && (value.x !== 0 || value.y !== 0)) this.send(part, action, { x: 0, y: 0 });
      }
    },
    clear() {
      holding.clear();
    },
    attached: () => mounted[0]?.world,
  };
}

/** a channel nothing is ever sent on: a world view drawn where no design's taps reach it (the canvas, a gallery) */
export const QUIET_CHANNEL: WorldChannel = { listen: () => () => {}, held: () => ({}) };

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
