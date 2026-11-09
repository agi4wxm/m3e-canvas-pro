/* What every host's runner of the table shares: the back end a row's calls reach, and how what a host ended with is
 * held against what the row expects. Nothing but the table's types, so scripts/gen-rn.ts and scripts/gen-miniapp.ts
 * can write this file into the kits' test beds as it is. */

import type { Expect, HostName, Observed, Row, SeenCall, Step, TableWorld } from "./types";

type Held = { op: string; answer: (a: { status: number; body: unknown }) => void };

/** where the back end's clock starts: what `now` reads before any `wait` */
export const TABLE_CLOCK_START = Date.UTC(2026, 0, 15, 9, 0, 0);

/** a connection the app made to a realtime channel, as the back end keeps it: whether the app still holds it open */
type Connection = { address: string; onMessage: (m: { channel: string; message: string; payload: unknown; at: number }) => void; open: boolean };

/** an address as the back end reads it: its path, the query (a token) aside */
const pathOf = (address: string) => address.replace(/^[a-z]+:\/\/[^/]+/i, "").split(/[?#]/)[0];
/** the operation an invoke goes under where a test bed sends it over the row's transport (the kits' runners do) */
export const CAPABILITY_OP = "capability:";

/** what a capability came to at the back end: its result, or how it failed */
export type Invoked = { ok: true; result: unknown } | { ok: false; type: string };
type HeldInvoke = { op: string; answer: (a: Invoked) => void };

/** The back end of a row: every call is kept as it was received; those of the operations the row holds wait for an
 *  `answer` step, the rest are answered at once as the row says (200 and `{}` unless it says otherwise). */
export class Backend {
  readonly calls: SeenCall[] = [];
  /** the capabilities invoked, as the platform's adapters saw them */
  readonly invokes: SeenCall[] = [];
  private held: Held[] = [];
  private heldInvokes: HeldInvoke[] = [];
  /** every connection the app has made to a realtime channel, closed ones too */
  private connections: Connection[] = [];
  private clock = { at: TABLE_CLOCK_START, paused: false, rate: 1 };

  constructor(private readonly row: Pick<Row, "hold" | "answers" | "capabilities">) {}

  /** an invoke of a capability: its arguments; held when the row holds it, else answered as the row says */
  invoke(capability: string, args: Record<string, unknown>): Promise<Invoked> {
    this.invokes.push({ op: capability, in: args });
    if (this.row.hold?.includes(capability)) return new Promise((answer) => this.heldInvokes.push({ op: capability, answer }));
    const a = this.row.capabilities?.[capability];
    return Promise.resolve(a?.fail ? { ok: false, type: a.fail } : { ok: true, result: a?.result ?? {} });
  }

  /** A call: its operation, and what it was given (query and JSON body fields together). The kits' test beds send an
   *  invoke the same way, under `CAPABILITY_OP` and the capability's name, and read its answer back (`answerOfInvoke`). */
  receive(op: string, given: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
    if (op.startsWith(CAPABILITY_OP)) return this.invoke(op.slice(CAPABILITY_OP.length), given).then((a) => (a.ok ? { status: 200, body: a.result } : { status: 409, body: { type: a.type } }));
    this.calls.push({ op, in: given });
    if (this.row.hold?.includes(op)) return new Promise((answer) => this.held.push({ op, answer }));
    const a = this.row.answers?.[op];
    return Promise.resolve({ status: a?.status ?? 200, body: a?.body ?? {} });
  }

  /** the app connects to a realtime channel at this address; what it gives back is the app's end of it */
  connect(address: string, onMessage: Connection["onMessage"]): { send: (message: string, payload?: unknown) => void; close: () => void } {
    const c: Connection = { address: pathOf(address), onMessage, open: true };
    this.connections.push(c);
    return { send: () => {}, close: () => void (c.open = false) };
  }

  /** a message sent over every connection made to an address, closed ones too (see `Step` push) */
  push(step: Extract<Step, { push: string }>) {
    for (const c of this.connections.slice()) if (c.address === pathOf(step.push)) c.onMessage({ channel: "", message: step.message, payload: step.payload ?? {}, at: this.now() });
  }

  /** how many connections the app holds open, by address */
  opened(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.connections) out[c.address] = (out[c.address] ?? 0) + (c.open ? 1 : 0);
    return out;
  }

  /** the time on the back end's clock, ms */
  now(): number {
    return this.clock.at;
  }

  /** time passes: the clock moves on, `rate` times as far, unless it stands still */
  tick(ms: number) {
    if (!this.clock.paused) this.clock.at += ms * this.clock.rate;
  }

  setClock(c: { paused?: boolean; rate?: number }) {
    if (c.paused !== undefined) this.clock.paused = c.paused;
    if (c.rate !== undefined) this.clock.rate = c.rate;
  }

  /** answers a held call (or invoke); false when there was none to answer */
  release(step: Extract<Step, { answer: string }>): boolean {
    const invoked = this.heldInvokes.filter((h) => h.op === step.answer);
    const pick = step.which === "newest" ? invoked[invoked.length - 1] : invoked[0];
    if (pick) {
      this.heldInvokes = this.heldInvokes.filter((x) => x !== pick);
      pick.answer(step.fail ? { ok: false, type: step.fail } : { ok: true, result: step.body ?? {} });
      return true;
    }
    const mine = this.held.filter((h) => h.op === step.answer);
    const h = step.which === "newest" ? mine[mine.length - 1] : mine[0];
    if (!h) return false;
    this.held = this.held.filter((x) => x !== h);
    h.answer({ status: step.status ?? 200, body: step.body ?? {} });
    return true;
  }
}

/** what a request's query and JSON body give, as one object: what the table compares a call on */
export function givenOf(query: unknown, body: unknown): Record<string, unknown> {
  const plain = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  return { ...plain(query), ...plain(body) };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** where what a host ended with differs from what the row expects; nothing when it does as the row says */
export function differences(expect: Expect, seen: Observed): string[] {
  const out: string[] = [];
  for (const [id, v] of Object.entries(expect.vars ?? {})) if (!same(seen.vars[id], v)) out.push(`vars.${id}: expected ${JSON.stringify(v)}, got ${JSON.stringify(seen.vars[id])}`);
  for (const [words, on] of Object.entries(expect.shown ?? {})) if (seen.words.includes(words) !== on) out.push(`"${words}" ${on ? "should be on show" : "should not be on show"}`);
  if (expect.toast !== undefined && seen.toast !== expect.toast) out.push(`snackbar: expected ${JSON.stringify(expect.toast)}, got ${JSON.stringify(seen.toast)}`);
  if (expect.screen !== undefined && seen.screen !== expect.screen) out.push(`screen: expected ${expect.screen}, got ${seen.screen}`);
  const compare = (what: string, wanted: SeenCall[] | undefined, got: SeenCall[]) => {
    if (!wanted) return;
    const ops = (list: SeenCall[]) => list.map((c) => c.op).join(", ") || "none";
    if (wanted.length !== got.length || wanted.some((c, i) => c.op !== got[i].op)) out.push(`${what}s: expected ${ops(wanted)}, got ${ops(got)}`);
    else
      wanted.forEach((c, i) => {
        for (const [k, v] of Object.entries(c.in)) if (!same(got[i].in[k], v)) out.push(`${what} ${c.op}: ${k} expected ${JSON.stringify(v)}, got ${JSON.stringify(got[i].in[k])}`);
      });
  };
  if (expect.move && !same(seen.move, expect.move)) out.push(`move: expected ${JSON.stringify(expect.move)}, got ${JSON.stringify(seen.move)}`);
  for (const [address, n] of Object.entries(expect.open ?? {})) if ((seen.open?.[address] ?? 0) !== n) out.push(`open connections to ${address}: expected ${n}, got ${seen.open?.[address] ?? 0}`);
  compare("call", expect.calls, seen.calls);
  compare("invoke", expect.invokes, seen.invokes ?? []);
  return out;
}

/** What a host's runner gives the table: a visitor's hands on the host, and a look at what it ends with. */
export type Driver = {
  tap(words: string): void | Promise<void>;
  /** the pointer over the part; a host with no pointer leaves this out, and a hover is a tap there */
  hover?(words: string): void | Promise<void>;
  /** a tap on a place of the part, and an event the part sends: a host that runs neither yet leaves them out, and the
   *  step does nothing there */
  tapSlot?(words: string, slot: string): void | Promise<void>;
  emit?(words: string, event: string, payload?: Record<string, unknown>): void | Promise<void>;
  /** the platform's own back (the step `platformBack`), which the app's routes see and no tap asks for; every host of the
   *  table has one, a runner that drives only some rows may leave it out */
  platformBack?(): void | Promise<void>;
  type(words: string, value: string): void | Promise<void>;
  restart(): void | Promise<void>;
  /** The world the HUD reads is now this one (`tableWorld` makes it the World a host is handed), and a frame passes: the
   *  host's frame loop evaluates its props bound per frame (docs/数据绑定.md “每帧绑定”), and what they come to is on show
   *  (`observe` lists the words). A runner of a host with no frames leaves it out, and the step does nothing there. */
  world?(world: TableWorld): void | Promise<void>;
  /** lets what is under way settle: answers already given run, the host draws again */
  settle(): Promise<void>;
  observe(): Observed | Promise<Observed>;
};

/** A row's world as a host is handed one (a World's snapshot and clock, the `world` root of lib/world/root.ts reads). */
export function tableWorld(w: TableWorld): { view(): unknown; clock(): { now: number; paused: boolean; rate: number } } {
  return { view: () => w.view, clock: () => ({ now: w.clock?.now ?? 0, paused: w.clock?.paused ?? false, rate: w.clock?.rate ?? 1 }) };
}

/** a few turns of the event loop: what an answer starts gets to run */
export async function turns(n = 4) {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Runs a row's steps on a host and says where it ends up differing from what the row expects. */
export async function drive(row: Omit<Row, "design">, make: (backend: Backend) => Driver | Promise<Driver>): Promise<{ problems: string[]; seen: Observed }> {
  const backend = new Backend(row);
  const d = await make(backend);
  await d.settle();
  for (const step of row.steps) {
    if ("tap" in step) await d.tap(step.tap);
    else if ("type" in step) await d.type(step.type, step.value);
    else if ("answer" in step) {
      if (!backend.release(step)) {
        const seen = await d.observe();
        return { problems: [`no call of ${step.answer} was waiting for its answer`], seen };
      }
    } else if ("hover" in step) await (d.hover ? d.hover(step.hover) : d.tap(step.hover));
    else if ("wait" in step) {
      await new Promise((r) => setTimeout(r, step.wait));
      backend.tick(step.wait);
    } else if ("push" in step) backend.push(step);
    else if ("clock" in step) backend.setClock(step.clock);
    else if ("tapSlot" in step) await d.tapSlot?.(step.tapSlot, step.slot);
    else if ("emit" in step) await d.emit?.(step.emit, step.event, step.payload);
    else if ("platformBack" in step) await d.platformBack?.();
    else if ("world" in step) await d.world?.(step.world);
    else await d.restart();
    await d.settle();
  }
  const seen = await d.observe();
  /* what reached the platform is the back end's to say, whatever the host's runner shows */
  if (!seen.invokes) seen.invokes = backend.invokes;
  if (!seen.open) seen.open = backend.opened();
  return { problems: differences(row.expect, seen), seen };
}

/** What a run of a row on a host comes to: as the row says; a divergence the row records (expected); or a failure — it
 *  differs and the row does not say so, or it now does as the row says while the row still lists it. */
export type Verdict = { ok: true; known?: string } | { ok: false; why: string };

export function verdict(row: Omit<Row, "design">, host: HostName, problems: string[]): Verdict {
  const known = row.known?.[host];
  if (!problems.length) return known ? { ok: false, why: `${row.id} now passes on ${host}: take it out of the row's known divergences ("${known}")` } : { ok: true };
  if (known) return { ok: true, known };
  return { ok: false, why: `${row.id} (${row.title}) on ${host}:\n  ${problems.join("\n  ")}` };
}
