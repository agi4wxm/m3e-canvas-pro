/* A world played by a local game loop (docs/世界宿主契约.md, docs/玩法契约.md “本地 game-loop”): the `World` the host
 * talks to, over one realtime connection to the game loop's world stream, in the wire format of the exported server's
 * channels (lib/export/files/api/realtime.ts `withRealtime`): every frame one JSON payload, no envelope, which message
 * it is told by its field. The game loop sends `{snapshot}` (the small snapshot the HUD reads, as the contract's
 * snapshot schema says), `{event, payload}` (one of the contract's events), `{clock: {now, paused, rate}}` (the world's
 * time) and `{pause: {accepted, reason?}}` (its answer to a request to pause); the host sends `{input, value, at}`,
 * `{pointer}`, `{occlude}` and `{pause: true|false}`. Nothing of the rules is here: what moves, what is hit, the
 * score, all come from the game loop. Plain TypeScript, no DOM. */

import type { ChannelConnection, ChannelMessage } from "../api/transport";
import { withRealtime, type RealtimeChannel, type SocketLike } from "../export/files/api/realtime";
import { GAME_LOOP_WORLD, type GameLoopHello } from "./link";
import { realtimeUrlOf } from "./transport";
import type { World, WorldClock, WorldEntity, WorldEventName, WorldEvents, WorldState, WorldStatus } from "../world/types";

/** the world stream as a channel of the realtime client: its messages told apart by the field each one has */
export const WORLD_STREAM: RealtimeChannel = {
  id: "m3e-world",
  address: GAME_LOOP_WORLD,
  messages: [
    { name: "snapshot", required: ["snapshot"] },
    { name: "event", required: ["event"] },
    { name: "clock", required: ["clock"] },
    { name: "pause", required: ["pause"] },
  ],
};

const STATUSES: readonly WorldStatus[] = ["running", "paused", "ended"];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** a snapshot as the HUD reads one: what is not of its shape is left out, never mended into something else */
export function readSnapshot(v: unknown): WorldState | undefined {
  if (!isRecord(v)) return undefined;
  const out: WorldState = {};
  if (Array.isArray(v.entities)) {
    out.entities = v.entities
      .filter((e): e is Record<string, unknown> => isRecord(e) && typeof e.id === "string" && typeof e.kind === "string" && typeof e.x === "number" && typeof e.y === "number")
      .slice(0, 500)
      .map((e): WorldEntity => ({ id: String(e.id), kind: String(e.kind), x: Math.min(100, Math.max(0, Number(e.x))), y: Math.min(100, Math.max(0, Number(e.y))), ...(typeof e.label === "string" ? { label: e.label } : {}) }));
  }
  if (typeof v.follow === "string") out.follow = v.follow;
  if (typeof v.score === "number" && Number.isFinite(v.score)) out.score = v.score;
  if (typeof v.status === "string" && (STATUSES as readonly string[]).includes(v.status)) out.status = v.status as WorldStatus;
  return out;
}

export type GameLoopWorldOptions = {
  /** the game loop's address */
  url: string;
  /** what its hello said (where its realtime prefix and world stream are), read when the world is mounted */
  hello?: () => GameLoopHello | undefined;
  /** which world view this is, sent as `view` in the address so a game loop with several knows */
  view?: string;
  /** the app's clock (the game's, as the transport reads it) */
  now?: () => number;
  /** the platform's socket, the WebSocket by default */
  open?: (url: string) => SocketLike | undefined;
};

/** how long a request to pause waits for the game loop's answer */
const PAUSE_MS = 2000;

export function createGameLoopWorld(o: GameLoopWorldOptions): World {
  const now = o.now ?? (() => Date.now());
  let state: WorldState = {};
  let clock: { at: number; c: WorldClock } | undefined;
  let conn: ChannelConnection | undefined;
  let open = false;
  /** what was sent before the connection opened, sent once it has */
  let queue: unknown[] = [];
  const changed = new Set<() => void>();
  const heard = new Map<string, Set<(payload: never) => void>>();
  const pauses: ((r: { accepted: boolean; reason?: string }) => void)[] = [];

  const send = (payload: unknown) => {
    if (conn && open) conn.send("", payload);
    else if (queue.length < 200) queue.push(payload);
  };
  const hear = (m: ChannelMessage) => {
    const p = m.payload as Record<string, unknown>;
    if (m.message === "snapshot") {
      const next = readSnapshot(p.snapshot);
      if (!next) return;
      state = next;
      for (const fn of Array.from(changed)) fn();
    } else if (m.message === "event") {
      if (typeof p.event !== "string") return;
      for (const fn of Array.from(heard.get(p.event) ?? [])) fn((isRecord(p.payload) ? p.payload : {}) as never);
    } else if (m.message === "clock") {
      const c = p.clock;
      if (!isRecord(c) || typeof c.now !== "number") return;
      clock = { at: now(), c: { now: c.now, paused: c.paused === true, rate: typeof c.rate === "number" && c.rate > 0 ? c.rate : 1 } };
    } else if (m.message === "pause") {
      const a = p.pause;
      const r = isRecord(a) ? { accepted: a.accepted === true, ...(typeof a.reason === "string" ? { reason: a.reason } : {}) } : { accepted: a === true };
      pauses.shift()?.(r);
    }
  };

  return {
    mount() {
      if (conn) return;
      const hello = o.hello?.();
      const stream = { ...WORLD_STREAM, address: hello?.world ?? GAME_LOOP_WORLD };
      const rt = withRealtime({ request: () => Promise.reject(new Error("no requests on the world stream")), now }, { url: realtimeUrlOf(o.url, hello), channels: [stream], ...(o.open ? { open: o.open } : {}) });
      const address = `${stream.address}${o.view ? `?view=${encodeURIComponent(o.view)}` : ""}`;
      conn = rt.connect!(address, hear, {
        onStatus: (s) => {
          open = s === "open";
          if (!open) return;
          const was = queue;
          queue = [];
          for (const p of was) conn?.send("", p);
        },
      });
    },
    occlude(rects) {
      send({ occlude: rects });
    },
    input(action, value, at) {
      send({ input: action, value, at });
    },
    pointer(e) {
      send({ pointer: e });
    },
    view: () => state,
    subscribe(fn) {
      changed.add(fn);
      return () => void changed.delete(fn);
    },
    on<K extends WorldEventName>(event: K, run: (payload: WorldEvents[K]) => void) {
      const set = heard.get(event) ?? new Set();
      heard.set(event, set);
      set.add(run as (payload: never) => void);
      return () => void set.delete(run as (payload: never) => void);
    },
    clock() {
      /* the world's time as the game loop last said it, moved on by the app's clock at its rate since */
      if (!clock) return { now: now(), paused: false, rate: 1 };
      const { at, c } = clock;
      return { ...c, now: c.paused ? c.now : c.now + (now() - at) * c.rate };
    },
    requestPause(paused) {
      return new Promise((done) => {
        let settled = false;
        const answer = (r: { accepted: boolean; reason?: string }) => {
          if (settled) return;
          settled = true;
          done(r);
        };
        pauses.push(answer);
        send({ pause: paused });
        setTimeout(() => {
          const i = pauses.indexOf(answer);
          if (i >= 0) pauses.splice(i, 1);
          answer({ accepted: false, reason: "the game loop did not answer" });
        }, PAUSE_MS);
      });
    },
    unmount() {
      conn?.close();
      conn = undefined;
      open = false;
      queue = [];
    },
  };
}
