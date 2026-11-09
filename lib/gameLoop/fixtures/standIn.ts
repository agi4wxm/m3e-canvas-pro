/* A tiny local game loop for the tests (docs/玩法契约.md “本地 game-loop”): it plays M3E's example gameplay contract
 * (lib/game/fixtures/example.m3e-game.json) as a game loop would, over the wire the preview's transport speaks — its
 * hello, the commands as `POST /game/commands/<command>` answering the contract's result or refusing with its problem
 * types, a ticker on a realtime channel, and a world on the world stream (snapshots, events, its clock, inputs). It
 * decides nothing a real game loop would decide for a product: the gems, the pulls and the days are a few lines of
 * counters, enough for each answer and each refusal to be asked for. No server here: `handle` answers a fetch Request
 * and `connect` a socket's peer, so unit tests drive it without a network and serve.ts puts it behind Bun.serve. */

import { EXAMPLE_GAME_CONTRACT, gameRefusals, type GameContract } from "../../game";
import { GAME_LOOP_HELLO, GAME_LOOP_REALTIME, GAME_LOOP_WORLD } from "../link";

export type StandInOptions = {
  /** the contract it plays: the example by default */
  contract?: GameContract;
  /** how often the ticker and the world move, in ms */
  tickMs?: number;
};

/** what it holds and how it answers, which a test changes between taps */
export type StandInState = {
  gems: number;
  /** the limited summon is still on */
  poolOpen: boolean;
  /** today's check-in is done */
  checkedIn: boolean;
  day: number;
  /** the version its hello says, which a test sets to another to see the preview say so */
  contractVersion: string;
  /** whether it lets other origins read it (CORS); off, the browser refuses the page its answers */
  cors: boolean;
};

/** one request as it came, for a test to read */
export type StandInCall = { method: string; path: string; body?: unknown };

/** the other end of a socket: what the stand-in sends, and how it closes it */
export type StandInPeer = { send(text: string): void; close(): void };
/** a socket the stand-in took: what the peer sent, and its end */
export type StandInSocket = { text(text: string): void; close(): void };

export const PULL_COST = 150;
/** what a pull draws, in turn */
const PRIZES = [
  { id: "knight", name: "Stand-in Knight", rarity: "epic" },
  { id: "archer", name: "Stand-in Archer", rarity: "rare" },
  { id: "slime", name: "Stand-in Slime", rarity: "common" },
] as const;

export type StandIn = {
  state: StandInState;
  calls: StandInCall[];
  /** what it says of each world input it heard, newest last: `attack true` */
  inputs: string[];
  /** answers an HTTP request */
  handle(req: Request): Promise<Response>;
  /** whether a request is for one of its sockets (the ticker, the world), by its path */
  socketPath(url: string): "ticker" | "world" | undefined;
  /** takes a socket on `url` */
  connect(url: string, peer: StandInPeer): StandInSocket | undefined;
  /** stops every timer and closes every socket */
  stop(): void;
};

const json = (status: number, body: unknown, headers: Record<string, string>, type = "application/json") => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": type } });

export function createStandIn(o: StandInOptions = {}): StandIn {
  const contract = o.contract ?? EXAMPLE_GAME_CONTRACT;
  const tickMs = o.tickMs ?? 150;
  const ns = contract.namespace;
  const state: StandInState = { gems: 1600, poolOpen: true, checkedIn: false, day: 11, contractVersion: contract.contractVersion, cors: true };
  const calls: StandInCall[] = [];
  const inputs: string[] = [];
  const timers = new Set<ReturnType<typeof setInterval>>();
  const peers = new Set<StandInPeer>();
  let drawn = 0;

  const cors = (): Record<string, string> =>
    state.cors
      ? {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "accept, content-type, authorization",
          /* a page on a public origin asks before it reaches a private one (Private Network Access) */
          "access-control-allow-private-network": "true",
        }
      : {};
  /** the problem the contract gives for one refusal of one command */
  const refuse = (command: string, code: string) => {
    const r = gameRefusals(contract).find((x) => x.command === command && x.code === code);
    if (!r) throw new Error(`the contract has no refusal ${code} of ${command}`);
    return json(r.status, { type: r.type, title: r.title, status: r.status, detail: r.summary ?? r.title }, cors(), "application/problem+json");
  };
  const bad = (detail: string) => json(400, { type: "about:blank", title: "Bad Request", status: 400, detail }, cors(), "application/problem+json");

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    let body: unknown;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const text = await req.text();
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        return bad("the body is no JSON");
      }
    }
    calls.push({ method: req.method, path, ...(body !== undefined ? { body } : {}) });
    if (req.method === "GET" && path === GAME_LOOP_HELLO) return json(200, { format: "m3e-game-loop", version: 1, namespace: ns, contractVersion: state.contractVersion, now: Date.now() }, cors());
    if (req.method === "POST" && path === `/${ns}/commands/pull`) {
      const count = (body as { count?: unknown } | undefined)?.count;
      if (count !== 1 && count !== 10) return bad("count is 1 or 10");
      if (!state.poolOpen) return refuse("pull", "pool-closed");
      if (state.gems < PULL_COST * count) return refuse("pull", "insufficient-resources");
      state.gems -= PULL_COST * count;
      const pulled = Array.from({ length: count }, () => {
        const p = PRIZES[drawn++ % PRIZES.length];
        return { id: `${p.id}-${drawn}`, name: p.name, rarity: p.rarity };
      });
      return json(200, { pulled, gems: state.gems }, cors());
    }
    if (req.method === "POST" && path === `/${ns}/commands/checkIn`) {
      if (state.checkedIn) return refuse("checkIn", "cooldown");
      state.checkedIn = true;
      state.day += 1;
      return json(200, { day: state.day, reward: { item: "Stand-in gems", count: 50 } }, cors());
    }
    return json(404, { type: "about:blank", title: "Not Found", status: 404 }, cors(), "application/problem+json");
  }

  const socketPath = (raw: string): "ticker" | "world" | undefined => {
    const path = new URL(raw, "http://stand-in").pathname;
    if (path === `${GAME_LOOP_REALTIME}/ticker`) return "ticker";
    if (path === `${GAME_LOOP_REALTIME}${GAME_LOOP_WORLD}`) return "world";
    return undefined;
  };

  function every(ms: number, fn: () => void): () => void {
    const t = setInterval(fn, ms);
    timers.add(t);
    return () => {
      clearInterval(t);
      timers.delete(t);
    };
  }

  /** the ticker: `{n}` on and on, counting up */
  function ticker(peer: StandInPeer): StandInSocket {
    let n = 0;
    const stop = every(tickMs, () => peer.send(JSON.stringify({ n: ++n })));
    return { text: () => {}, close: stop };
  }

  /** the world: a hero walking where `move` points, a slime hit while `attack` is held, the score counting the hits */
  function world(peer: StandInPeer): StandInSocket {
    const hero = { x: 20, y: 50 };
    let dir = { x: 0, y: 0 };
    let score = 0;
    let paused = false;
    let worldNow = 0;
    const snapshot = () => ({ snapshot: { entities: [{ id: "hero", kind: "player", x: Math.round(hero.x), y: Math.round(hero.y), label: "Hero" }, { id: "slime", kind: "enemy", x: 70, y: 50, label: "Slime" }], follow: "hero", score, status: paused ? "paused" : "running" } });
    const say = (v: unknown) => peer.send(JSON.stringify(v));
    say({ clock: { now: worldNow, paused, rate: 1 } });
    say(snapshot());
    const stop = every(tickMs, () => {
      if (paused) return;
      worldNow += tickMs;
      if (dir.x || dir.y) {
        hero.x = Math.min(100, Math.max(0, hero.x + dir.x * 4));
        hero.y = Math.min(100, Math.max(0, hero.y + dir.y * 4));
      }
      say(snapshot());
    });
    return {
      text(text) {
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return;
        }
        if (typeof m.input === "string") {
          inputs.push(`${m.input} ${JSON.stringify(m.value)}`);
          if (m.input === "move" && m.value && typeof m.value === "object") dir = m.value as { x: number; y: number };
          if (m.input === "attack" && m.value === true) {
            score += 10;
            say({ event: "hit", payload: { id: "slime", by: "hero" } });
            say(snapshot());
          }
        } else if (typeof m.pause === "boolean") {
          paused = m.pause;
          say({ pause: { accepted: true } });
          say({ clock: { now: worldNow, paused, rate: 1 } });
          say(snapshot());
        }
      },
      close: stop,
    };
  }

  return {
    state,
    calls,
    inputs,
    handle,
    socketPath,
    connect(url, peer) {
      const which = socketPath(url);
      if (!which) return undefined;
      peers.add(peer);
      const s = which === "ticker" ? ticker(peer) : world(peer);
      return {
        text: (t) => s.text(t),
        close: () => {
          peers.delete(peer);
          s.close();
        },
      };
    },
    stop() {
      for (const t of timers) clearInterval(t);
      timers.clear();
      for (const p of peers) p.close();
      peers.clear();
    },
  };
}
