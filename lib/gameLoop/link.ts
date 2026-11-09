/* Where a local game loop is, as the project keeps it (docs/玩法契约.md “本地 game-loop”): an address in the project's
 * configuration beside the paths of the outside modules' files (`Doc.external.gameLoop`), and whether the preview answers
 * from it rather than from the mock library. Only the address is kept, never a credential: an address with a user and
 * a password, a query or a fragment (where tokens ride) is no address here. And the game loop's hello, which says whose
 * contract it plays and at which version, so the preview can say plainly when it is not the one the document was
 * designed to. No DOM, no fetch: the checks take the platform's fetch as an argument. */

/** The project's link to a local game loop: where it is, and whether the preview answers from it. */
export type GameLoopLink = {
  /** an http(s) address, with no credentials, query or fragment: `http://localhost:8787` */
  url: string;
  /** the preview's calls, channels and world go to it, in place of the mock library */
  preview?: boolean;
};

/** the longest address kept */
const URL_MAX = 512;

/** what is wrong with an address, if anything: none given, not http(s), a user or password in it, a query or fragment */
export type GameLoopUrlProblem = "empty" | "invalid" | "scheme" | "credentials" | "query";

/** An address as the project keeps it: the origin and the path, without a slash at its end; or what is wrong with it. */
export function readGameLoopUrl(raw: unknown): { url: string } | { problem: GameLoopUrlProblem } {
  if (typeof raw !== "string" || !raw.trim()) return { problem: "empty" };
  const text = raw.trim();
  if (text.length > URL_MAX) return { problem: "invalid" };
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { problem: "invalid" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { problem: "scheme" };
  /* a credential is never part of the document: the places one rides in an address are refused, not cleaned away */
  if (u.username || u.password) return { problem: "credentials" };
  if (u.search || u.hash || text.includes("?") || text.includes("#")) return { problem: "query" };
  return { url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}

/** an address as the project keeps it, or undefined */
export const cleanGameLoopUrl = (raw: unknown): string | undefined => {
  const read = readGameLoopUrl(raw);
  return "url" in read ? read.url : undefined;
};

/** `Doc.external.gameLoop` as the format has it: a link with a good address, else none */
export function cleanGameLoopLink(raw: unknown): GameLoopLink | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  const url = cleanGameLoopUrl(v.url);
  if (!url) return undefined;
  return { url, ...(v.preview === true ? { preview: true } : {}) };
}

/** the document's link to a local game loop, if it has one */
export const gameLoopOf = (doc: { external?: { gameLoop?: unknown } } | null | undefined): GameLoopLink | undefined => cleanGameLoopLink(doc?.external?.gameLoop);

/* ---------- the hello ---------- */

/** where a game loop says who it is, under its address */
export const GAME_LOOP_HELLO = "/.well-known/m3e-game-loop";
/** where its realtime channels are, under its address, as the exported server has them by default (docs/后端.md) */
export const GAME_LOOP_REALTIME = "/realtime";
/** where its world's stream is, under the realtime prefix */
export const GAME_LOOP_WORLD = "/world";

/** What a game loop says of itself at `GAME_LOOP_HELLO`: whose contract it plays (its namespace) and at which version,
 *  its clock now, and where its channels and its world are when not where they are by default. */
export type GameLoopHello = {
  format: "m3e-game-loop";
  version: 1;
  namespace: string;
  contractVersion: string;
  /** the game's clock now, in ms: what the app reads as `now` and the world's time runs on */
  now?: number;
  /** the realtime prefix, a path under the address (`/realtime` by default) */
  realtime?: string;
  /** the world's stream, a path under the realtime prefix (`/world` by default) */
  world?: string;
};

const PATH = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,200}$/;

/** a hello as it must be, or undefined: a format and version this M3E reads, a namespace and a version */
export function readGameLoopHello(v: unknown): GameLoopHello | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (o.format !== "m3e-game-loop" || o.version !== 1) return undefined;
  if (typeof o.namespace !== "string" || !o.namespace || typeof o.contractVersion !== "string" || !o.contractVersion) return undefined;
  return {
    format: "m3e-game-loop",
    version: 1,
    namespace: o.namespace.slice(0, 64),
    contractVersion: o.contractVersion.slice(0, 64),
    ...(typeof o.now === "number" && Number.isFinite(o.now) ? { now: o.now } : {}),
    ...(typeof o.realtime === "string" && PATH.test(o.realtime) ? { realtime: o.realtime.replace(/\/+$/, "") } : {}),
    ...(typeof o.world === "string" && PATH.test(o.world) ? { world: o.world } : {}),
  };
}

/* ---------- reaching it ---------- */

/** How the preview's game loop is: being asked, answering as the document expects, or what is wrong. */
export type GameLoopStatus =
  | { state: "checking" }
  | { state: "ok"; hello: GameLoopHello }
  /** nothing answers at the address (not started, the wrong port) */
  | { state: "unreachable" }
  /** something answers, but the browser may not read it: the game loop does not allow this page's origin */
  | { state: "cors" }
  /** what answers is no game loop: no hello, or one this M3E does not read */
  | { state: "not-a-game-loop"; status?: number }
  /** a game loop of another contract (its namespace) */
  | { state: "namespace"; hello: GameLoopHello; expected: string }
  /** the document's contract at another version than the game loop's */
  | { state: "version"; hello: GameLoopHello; expected: string };

/** the little of fetch the check uses */
export type HelloFetch = (url: string, init?: { headers?: Record<string, string>; mode?: "cors" | "no-cors"; signal?: AbortSignal }) => Promise<{ status: number; ok?: boolean; json(): Promise<unknown> }>;

/** what the document expects of the game loop: its contract's namespace and version, when it links one */
export type ExpectedContract = { namespace: string; contractVersion: string } | undefined;

/** how long the check waits for an answer */
const HELLO_MS = 4000;

/** a fetch that gives up after a while: a host that never answers is unreachable, not a preview that hangs */
async function within<T>(ms: number, run: (signal: AbortSignal | undefined) => Promise<T>): Promise<T> {
  const Ctl = (globalThis as { AbortController?: typeof AbortController }).AbortController;
  const ctl = Ctl ? new Ctl() : undefined;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    return await run(ctl?.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the game loop at `url` who it is and compares it with what the document expects. A request the browser refuses
 *  to read (no CORS) and one nothing answers look the same to a page; an opaque request (`no-cors`) that still goes
 *  through tells them apart: something is there, it only does not let this page read it. `at` is when the hello was
 *  sent and answered, on the device's clock, for the clock's offset. */
export async function checkGameLoop(url: string, expected: ExpectedContract, fetchNow: HelloFetch, nowMs: () => number = () => Date.now()): Promise<{ status: GameLoopStatus; offset?: number }> {
  const at = `${url}${GAME_LOOP_HELLO}`;
  const sent = nowMs();
  let res: Awaited<ReturnType<HelloFetch>>;
  try {
    res = await within(HELLO_MS, (signal) => fetchNow(at, { headers: { accept: "application/json" }, mode: "cors", ...(signal ? { signal } : {}) }));
  } catch {
    try {
      await within(HELLO_MS, (signal) => fetchNow(at, { mode: "no-cors", ...(signal ? { signal } : {}) }));
      return { status: { state: "cors" } };
    } catch {
      return { status: { state: "unreachable" } };
    }
  }
  if (res.status < 200 || res.status > 299) return { status: { state: "not-a-game-loop", status: res.status } };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: { state: "not-a-game-loop", status: res.status } };
  }
  const hello = readGameLoopHello(body);
  if (!hello) return { status: { state: "not-a-game-loop", status: res.status } };
  const answered = nowMs();
  /* the game's clock, as of halfway between asking and hearing */
  const offset = hello.now !== undefined ? hello.now - (sent + answered) / 2 : undefined;
  const out = (status: GameLoopStatus) => ({ status, ...(offset !== undefined ? { offset } : {}) });
  if (expected && hello.namespace !== expected.namespace) return out({ state: "namespace", hello, expected: expected.namespace });
  if (expected && hello.contractVersion !== expected.contractVersion) return out({ state: "version", hello, expected: expected.contractVersion });
  return out({ state: "ok", hello });
}

/** an http(s) address as the WebSocket one of the same place */
export const socketUrlOf = (url: string): string => url.replace(/^http(s?):/i, (_all, s: string) => `ws${s}:`);
