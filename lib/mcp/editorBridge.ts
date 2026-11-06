/* The editor's end of the live bridge (lib/mcp/protocol.ts): it looks for MCP servers on this machine while the author
 * has "Connect to MCP" on, asks the author to type the pairing code each one's MCP client shows them (the server never
 * sends it here, so a page that is not the author's cannot pair by itself), then runs the calls a paired server
 * sends on the editor's own store, through the same registry and checks as the in-app agent (`executeTool`, origin
 * `mcp`): every change appears on the canvas as it happens and is one undo step (a batch, `apply_ops`, is one step).
 * A destructive call waits for the author's click, and is refused when none comes in time. A client the author told
 * it to remember (lib/mcp/trusted.ts) is approved without asking once its server proves it holds the secret.
 *
 * Plain TypeScript with the WebSocket and the storage handed in, so it runs in tests as it does in the tab;
 * src/editor/useMcpBridge.ts puts it in the editor and components/McpPanel.tsx shows it. */

import type { ChangeEvent, DocStore } from "../core";
import { createRegistry, executeTool, isDestructiveCall, type Registry } from "../tools";
import { wrote } from "../tools/ops";
import { wouldTakeAway } from "../tools/removals";
import { GENERATE_TOOLS } from "../tools/generate";
import type { GenerateEnv, Renderer, ToolError, ToolOutcome } from "../tools/types";
import { DEFAULT_AI } from "../ai";
import { BRIDGE_PORT, BRIDGE_PORTS, BRIDGE_PROTOCOL, CONFIRM_MS, codeDigits, parseMsg, type Access, type ClientInfo, type DrawRequest, type DrawResult, type EditorMsg, type ServerMsg } from "./protocol";
import { canProve, editorProof, expectedProof, randomHex, type TrustedServer, type TrustedStore } from "./trusted";

type Hello = Extract<ServerMsg, { t: "hello" }>;

/** one connection to one server, as the panel shows it */
export type BridgeConn = {
  port: number;
  /** `pairing`: the author is asked; `refused`: the server or the author said no; `closed`: gone, looked for again */
  phase: "connecting" | "pairing" | "paired" | "refused" | "closed";
  server?: Hello["server"];
  client: ClientInfo | null;
  /** what the server offers, and once paired, what the author gave */
  offered?: Access;
  access?: Access;
  generate?: boolean;
  reason?: string;
  /** paired through a client the author told it to remember, without asking */
  remembered?: boolean;
};

/** a call in the activity log */
export type BridgeEntry = { id: string; port: number; at: number; client: string; name: string; summary: string; state: "asking" | "running" | "ok" | "error" | "denied"; error?: string; ms?: number };

/** what waits for the author: a pairing to approve, a destructive call to allow */
export type BridgeAsk =
  /** `left`: the last code typed was wrong, and this many tries are left */
  | { kind: "pair"; port: number; client: ClientInfo | null; offered: Access; server: Hello["server"]; canRemember: boolean; left?: number }
  | { kind: "confirm"; id: string; port: number; client: ClientInfo | null; name: string; summary: string; until: number };

/** a remembered client, as the panel lists it (never its secret) */
export type RememberedClient = Omit<TrustedServer, "secret" | "forgotten">;

export type BridgeView = { on: boolean; conns: BridgeConn[]; log: BridgeEntry[]; asks: BridgeAsk[]; remembered: RememberedClient[] };

/* the little of a WebSocket used here: the browser's, or a Node client in tests (its handlers take the events it gives) */
type Socket = { readyState: number; send(data: string): void; close(code?: number, reason?: string): void; onclose: ((e: never) => void) | null; onerror: ((e: never) => void) | null; onmessage: ((e: never) => void) | null };
type SocketCtor = new (url: string) => Socket;
type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type EditorBridgeOptions = {
  store: DocStore;
  /** the WebSocket to connect with (the browser's; a Node client in tests) */
  WebSocket: SocketCtor;
  ports?: number[];
  host?: string;
  /** draws screenshots of the canvas */
  renderer?: Renderer;
  /** where resume tokens are kept for the tab (sessionStorage) */
  storage?: KeyStore;
  /** waits for the canvas to measure and lay out what a call changed, before its result goes back */
  settle?: () => Promise<void>;
  /** how long until a server that was not there is looked for again */
  retryMs?: number;
  /** the time, for tests */
  now?: () => number;
  /** where remembered clients are kept (lib/mcp/trusted.ts); without it the author is never offered to remember one */
  trusted?: TrustedStore;
};

const LOG_MAX = 60;
const OPEN = 1;

/** a call's arguments in a few words, for the log and the confirmation */
export function summarize(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "apply_ops" && Array.isArray(a.ops)) {
    const names = (a.ops as { op?: string }[]).map((o) => String(o?.op ?? "?"));
    return `${names.length} operation${names.length === 1 ? "" : "s"}: ${names.slice(0, 6).join(", ")}${names.length > 6 ? "…" : ""}`;
  }
  const s = JSON.stringify(a);
  return !s || s === "{}" ? "" : s.length > 90 ? `${s.slice(0, 89)}…` : s;
}

type Conn = BridgeConn & {
  ws: Socket | null;
  retry: ReturnType<typeof setTimeout> | null;
  confirmMs: number;
  askTimer: ReturnType<typeof setTimeout> | null;
  /** the server can keep a remembered pairing (its hello says which it holds) */
  canRemember?: boolean;
  /** the secret given with an approval the author asked to remember, until the server says it kept it */
  giving?: string;
  /** the challenge sent for a remembered pairing, until its proof comes */
  challenge?: { nonce: string; rec: TrustedServer };
  /** the server's own challenge (its hello): what this tab signs to be let in through a remembered pairing */
  serverChallenge?: string;
};
type Running = { abort: AbortController; port: number; draws: Map<string, { resolve: (v: DrawResult) => void; reject: (e: ToolError) => void }> };

export class EditorBridge {
  private on = false;
  private conns = new Map<number, Conn>();
  private log: BridgeEntry[] = [];
  private asks: BridgeAsk[] = [];
  private running = new Map<string, Running>();
  private confirms = new Map<string, (allow: boolean) => void>();
  private listeners = new Set<() => void>();
  private current: BridgeView = { on: false, conns: [], log: [], asks: [], remembered: [] };
  private remembered: RememberedClient[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private offStore: (() => void) | null = null;
  private changedSoon: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly o: EditorBridgeOptions) {}

  /* ---------- what the panel reads ---------- */

  view = (): BridgeView => this.current;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private changed() {
    this.current = {
      on: this.on,
      conns: [...this.conns.values()].filter((c) => c.phase !== "closed" || c.server).map(({ ws: _ws, retry: _r, confirmMs: _c, askTimer: _a, canRemember: _m, giving: _g, challenge: _ch, serverChallenge: _sc, ...c }) => c),
      log: [...this.log],
      asks: [...this.asks],
      remembered: this.remembered,
    };
    for (const fn of this.listeners) fn();
  }
  private now = () => (this.o.now ?? Date.now)();

  /* ---------- on and off ---------- */

  start() {
    if (this.on) return;
    this.on = true;
    this.offStore = this.o.store.subscribe((e) => this.storeChanged(e));
    for (const port of this.o.ports ?? Array.from({ length: BRIDGE_PORTS }, (_, i) => BRIDGE_PORT + i)) this.connect(port);
    void this.readRemembered();
    this.changed();
  }

  /* ---------- remembered clients ---------- */

  /** the remembered clients the panel lists, read again */
  private async readRemembered() {
    const list = (await this.o.trusted?.list().catch(() => [])) ?? [];
    this.remembered = list.filter((r) => !r.forgotten).map(({ secret: _s, forgotten: _f, ...r }) => r);
    this.changed();
  }

  /** Forgets a remembered client: its server will ask again. The servers listening now forget their side too; when
   *  none is, the secret waits (marked forgotten) to tell the next one that holds it. */
  async forget(id: string) {
    const store = this.o.trusted;
    const rec = (await store?.list().catch(() => []))?.find((r) => r.id === id);
    if (!store || !rec) return;
    const told = [...this.conns.values()].filter((c) => c.server && c.ws?.readyState === OPEN);
    for (const c of told) this.send(c, { t: "forget", id, secret: rec.secret });
    if (told.length) await store.remove(id).catch(() => {});
    else await store.put({ ...rec, forgotten: true }).catch(() => {});
    await this.readRemembered();
  }

  /** what a server that says which pairings it holds is told or asked: pairings forgotten here are forgotten there
   *  too; one remembered here for its client is challenged, and the author is asked only if it cannot prove it */
  private async meet(c: Conn, known: string[], client: ClientInfo | null) {
    const store = this.o.trusted;
    if (!store) return false;
    const list = await store.list().catch(() => [] as TrustedServer[]);
    for (const r of list.filter((x) => x.forgotten && known.includes(x.id))) {
      this.send(c, { t: "forget", id: r.id, secret: r.secret });
      await store.remove(r.id).catch(() => {});
    }
    const rec = list.find((r) => !r.forgotten && known.includes(r.id) && r.client.name === (client?.name ?? ""));
    if (!rec || c.phase !== "pairing" || !canProve()) return false;
    const nonce = randomHex(16);
    c.challenge = { nonce, rec };
    this.send(c, { t: "prove", id: rec.id, nonce });
    return true;
  }

  /** a server's answer to the challenge: approved as the author approved it before, or the author is asked */
  private async proven(c: Conn, msg: Extract<ServerMsg, { t: "proof" }>) {
    const ch = c.challenge;
    if (!ch || msg.id !== ch.rec.id || msg.nonce !== ch.nonce) return;
    c.challenge = undefined;
    const ok = !!msg.mac && msg.mac === (await expectedProof(ch.rec.secret, ch.nonce, c.port).catch(() => ""));
    if (c.phase !== "pairing") return;
    if (!ok) {
      if (c.askTimer) clearTimeout(c.askTimer);
      this.askPairing(c);
      return;
    }
    if (c.askTimer) clearTimeout(c.askTimer);
    /* proven to this tab, the server is now proven to by it: the code is not needed */
    const mac = c.serverChallenge ? await editorProof(ch.rec.secret, c.serverChallenge, c.port).catch(() => "") : "";
    if (c.phase !== "pairing") return;
    if (!mac) {
      this.askPairing(c);
      return;
    }
    c.remembered = true;
    this.send(c, { t: "approve", access: c.offered === "read" ? "read" : ch.rec.access, known: { id: ch.rec.id, mac } });
    this.asks = this.asks.filter((a) => !(a.kind === "pair" && a.port === c.port));
    await this.o.trusted?.put({ ...ch.rec, client: c.client ?? ch.rec.client, used: this.now() }).catch(() => {});
    void this.readRemembered();
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    this.offStore?.();
    this.offStore = null;
    for (const c of this.conns.values()) {
      if (c.retry) clearTimeout(c.retry);
      if (c.askTimer) clearTimeout(c.askTimer);
      /* let go of the socket first: its closing is not a server lost, to be looked for again */
      const ws = c.ws;
      c.ws = null;
      ws?.close(1000, "off");
    }
    this.conns.clear();
    for (const r of this.running.values()) r.abort.abort();
    for (const e of this.log) if (e.state === "running" || e.state === "asking") e.state = "error";
    for (const [id, answer] of this.confirms) {
      answer(false);
      this.confirms.delete(id);
    }
    this.asks = [];
    this.changed();
  }

  /** ends one server's session; it is looked for again only when the bridge is turned on again */
  disconnect(port: number) {
    const c = this.conns.get(port);
    if (!c) return;
    if (c.retry) clearTimeout(c.retry);
    c.phase = "refused";
    c.reason = "disconnected";
    c.ws?.close(1000, "disconnected");
    c.ws = null;
    this.asks = this.asks.filter((a) => a.port !== port);
    this.changed();
  }

  /* ---------- connecting ---------- */

  private connect(port: number) {
    if (!this.on) return;
    const was = this.conns.get(port);
    const c: Conn = was ?? { port, phase: "connecting", client: null, ws: null, retry: null, confirmMs: CONFIRM_MS, askTimer: null };
    c.phase = was?.server ? "closed" : "connecting";
    c.retry = null;
    this.conns.set(port, c);
    let ws: Socket;
    try {
      ws = new this.o.WebSocket(`ws://${this.o.host ?? "127.0.0.1"}:${port}`);
    } catch {
      this.again(c);
      return;
    }
    c.ws = ws;
    ws.onmessage = (e: { data: unknown }) => this.received(c, ws, parseMsg<ServerMsg>(typeof e.data === "string" ? e.data : String(e.data)));
    ws.onerror = () => {};
    ws.onclose = () => {
      if (c.ws !== ws) return;
      c.ws = null;
      this.lost(c);
    };
  }

  /** the server went away (or was never there): what it was doing ends, and it is looked for again */
  private lost(c: Conn) {
    if (c.askTimer) clearTimeout(c.askTimer);
    this.asks = this.asks.filter((a) => a.port !== c.port);
    for (const r of this.running.values()) if (r.port === c.port) r.abort.abort();
    for (const e of this.log) if (e.port === c.port && (e.state === "running" || e.state === "asking")) e.state = "error";
    if (c.phase !== "refused") {
      c.phase = c.server ? "closed" : "connecting";
      this.again(c);
    }
    this.changed();
  }

  private again(c: Conn) {
    if (!this.on || c.phase === "refused") return;
    if (c.retry) clearTimeout(c.retry);
    c.retry = setTimeout(() => this.connect(c.port), this.o.retryMs ?? 4000);
  }

  private send(c: Conn, msg: EditorMsg) {
    if (c.ws && c.ws.readyState === OPEN) c.ws.send(JSON.stringify(msg));
  }

  private resumeKey = (serverId: string) => `m3e:mcp:resume:${serverId}`;

  private received(c: Conn, ws: Socket, msg: ServerMsg | null) {
    if (!msg || c.ws !== ws) return;
    switch (msg.t) {
      case "hello": {
        if (msg.protocol !== BRIDGE_PROTOCOL) {
          c.phase = "refused";
          c.reason = "protocol";
          ws.close(1000, "protocol");
          this.changed();
          return;
        }
        Object.assign(c, { server: msg.server, client: msg.client, offered: msg.access, serverChallenge: typeof msg.challenge === "string" ? msg.challenge : undefined, generate: msg.generate, confirmMs: msg.confirmMs, phase: "pairing" as const, reason: undefined, remembered: false, challenge: undefined, giving: undefined });
        c.canRemember = Array.isArray(msg.known) && !!this.o.trusted && canProve();
        const resume = this.o.storage?.getItem(this.resumeKey(msg.server.id)) ?? undefined;
        this.send(c, { t: "hello", protocol: BRIDGE_PROTOCOL, ...(resume ? { resume } : {}) });
        /* a tab that was paired with this very server comes back without asking, and one that remembers this client
           once its server proves it; if neither does, the author is asked */
        if (resume) c.askTimer = setTimeout(() => this.askPairing(c), 1200);
        void (async () => {
          const challenged = Array.isArray(msg.known) && (await this.meet(c, msg.known, msg.client));
          if (challenged && !resume) c.askTimer = setTimeout(() => this.askPairing(c), 2500);
          else if (!resume) this.askPairing(c);
        })();
        this.changed();
        return;
      }
      case "client":
        c.client = msg.client;
        this.asks = this.asks.map((a) => (a.port === c.port && a.kind === "pair" ? { ...a, client: msg.client } : a));
        /* the client named now may be one this tab remembers */
        if (Array.isArray(msg.known) && c.phase === "pairing" && !c.challenge) void this.meet(c, msg.known, msg.client);
        this.changed();
        return;
      case "paired": {
        if (c.askTimer) clearTimeout(c.askTimer);
        c.phase = "paired";
        c.access = msg.access;
        if (c.server) this.o.storage?.setItem(this.resumeKey(c.server.id), msg.resume);
        this.asks = this.asks.filter((a) => !(a.port === c.port && a.kind === "pair"));
        const secret = c.giving;
        c.giving = undefined;
        if (secret && msg.remembered && this.o.trusted) {
          c.remembered = true;
          const now = this.now();
          void this.o.trusted
            .put({ id: msg.remembered.id, secret, client: c.client ?? { name: "" }, access: msg.access, created: now, used: now })
            .catch(() => {})
            .then(() => this.readRemembered());
        }
        this.changed();
        return;
      }
      case "proof":
        void this.proven(c, msg);
        return;
      case "wrong":
        /* the code typed (or the remembered pairing offered) was not the server's: the author is asked again */
        if (c.phase !== "pairing") return;
        c.remembered = false;
        c.giving = undefined;
        this.asks = this.asks.filter((a) => !(a.kind === "pair" && a.port === c.port));
        this.askPairing(c, typeof msg.left === "number" ? msg.left : 0);
        return;
      case "refused":
        c.phase = "refused";
        c.reason = msg.reason;
        this.asks = this.asks.filter((a) => a.port !== c.port);
        this.changed();
        return;
      case "call":
        if (c.phase === "paired") void this.queue(() => this.run(c, msg));
        return;
      case "cancel": {
        this.running.get(`${c.port}:${msg.id}`)?.abort.abort();
        this.confirms.get(`${c.port}:${msg.id}`)?.(false);
        return;
      }
      case "drawn": {
        for (const r of this.running.values()) {
          const d = r.port === c.port ? r.draws.get(msg.id) : undefined;
          if (!d) continue;
          r.draws.delete(msg.id);
          if (msg.ok) d.resolve(msg.value);
          else d.reject(msg.error);
        }
        return;
      }
    }
  }

  private askPairing(c: Conn, left?: number) {
    if (c.phase !== "pairing" || !c.server) return;
    if (this.asks.some((a) => a.kind === "pair" && a.port === c.port)) return;
    this.asks = [...this.asks, { kind: "pair", port: c.port, client: c.client, offered: c.offered ?? "edit", server: c.server, canRemember: !!c.canRemember, ...(left !== undefined ? { left } : {}) }];
    this.changed();
  }

  /** The author typed the pairing code their MCP client shows, giving the server edit or read-only access; the server
   *  checks the code (a wrong one asks again). With `remember`, later servers of the same client are approved without
   *  the code, until the author forgets it. */
  approve(port: number, access: Access, o: { code: string; remember?: boolean }) {
    const c = this.conns.get(port);
    if (!c || c.phase !== "pairing") return;
    c.challenge = undefined;
    if (c.askTimer) clearTimeout(c.askTimer);
    const keep = !!o.remember && c.canRemember;
    c.giving = keep ? randomHex(32) : undefined;
    this.send(c, { t: "approve", access: c.offered === "read" ? "read" : access, code: codeDigits(o.code), ...(keep ? { remember: { secret: c.giving! } } : {}) });
    this.asks = this.asks.filter((a) => !(a.kind === "pair" && a.port === port));
    this.changed();
  }

  /** the author said no: the server is not looked for again until the bridge is turned on again */
  deny(port: number) {
    const c = this.conns.get(port);
    if (!c) return;
    this.send(c, { t: "deny" });
    c.phase = "refused";
    c.reason = "denied";
    this.asks = this.asks.filter((a) => a.port !== port);
    this.changed();
  }

  /** the author's answer to a destructive call */
  answer(id: string, allow: boolean) {
    this.confirms.get(id)?.(allow);
  }

  /* ---------- calls ---------- */

  /** calls run one after another, whichever server sent them: they change the same document */
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => {});
    return next;
  }

  private registryFor(c: Conn): Registry {
    return createRegistry({ extra: c.generate ? GENERATE_TOOLS : [], readOnly: c.access !== "edit" });
  }

  private entry(c: Conn, id: string, name: string, args: unknown): BridgeEntry {
    const e: BridgeEntry = { id, port: c.port, at: this.now(), client: c.client?.title ?? c.client?.name ?? "MCP", name, summary: summarize(name, args), state: "running" };
    this.log = [e, ...this.log].slice(0, LOG_MAX);
    return e;
  }

  /** asks the author whether a destructive call may go ahead; no answer in time is no */
  private confirm(c: Conn, key: string, e: BridgeEntry): Promise<"allow" | "deny" | "timeout"> {
    return new Promise((resolve) => {
      const until = this.now() + c.confirmMs;
      const finish = (answer: "allow" | "deny" | "timeout") => {
        clearTimeout(timer);
        this.confirms.delete(key);
        this.asks = this.asks.filter((a) => !(a.kind === "confirm" && a.id === key));
        this.changed();
        resolve(answer);
      };
      const done = (allow: boolean) => finish(allow ? "allow" : "deny");
      const timer = setTimeout(() => finish("timeout"), c.confirmMs);
      this.confirms.set(key, done);
      this.asks = [...this.asks, { kind: "confirm", id: key, port: c.port, client: c.client, name: e.name, summary: e.summary, until }];
      this.changed();
    });
  }

  /** what a generative tool draws with here: the server draws, with its key, and only the drawing comes back */
  private genFor(c: Conn, run: Running, callId: string): GenerateEnv {
    const ask = (req: DrawRequest, signal?: AbortSignal) =>
      new Promise<DrawResult>((resolve, reject) => {
        const id = `d${++this.seq}`;
        const stop = () => {
          run.draws.delete(id);
          reject(Object.assign(new Error("Stopped."), { name: "AbortError" }));
        };
        if (signal?.aborted) return stop();
        signal?.addEventListener("abort", stop, { once: true });
        run.draws.set(id, { resolve, reject: (e) => reject(Object.assign(new Error(e.message), { code: e.code, hint: e.hint })) });
        this.send(c, { t: "draw", id, call: callId, ...req } as EditorMsg);
      });
    return {
      settings: DEFAULT_AI,
      remote: {
        svg: async (args, signal) => {
          const r = await ask({ what: "svg", args }, signal);
          if (!("markup" in r)) throw new Error("The server sent no SVG.");
          return r;
        },
        image: async (args, signal) => {
          const r = await ask({ what: "image", args }, signal);
          if (!("picture" in r)) throw new Error("The server sent no picture.");
          return r.picture;
        },
      },
    };
  }

  private async run(c: Conn, msg: Extract<ServerMsg, { t: "call" }>) {
    const key = `${c.port}:${msg.id}`;
    if (msg.client) c.client = msg.client;
    const e = this.entry(c, key, msg.name, msg.args);
    const reply = (outcome: ToolOutcome) => {
      e.ms = this.now() - e.at;
      e.state = outcome.ok ? "ok" : e.state === "denied" ? "denied" : "error";
      if (!outcome.ok) e.error = outcome.error.message;
      this.send(c, { t: "result", id: msg.id, outcome });
      this.changed();
    };
    const registry = this.registryFor(c);
    const t = registry.byName(msg.name);
    if (!t) {
      /* a writing tool on a read-only session is refused, not unknown */
      const exists = this.registryFor({ ...c, access: "edit" }).byName(msg.name);
      return reply({ ok: false, error: exists ? { code: "refused", message: "The author gave this session read-only access.", hint: "Read and screenshot only, or ask the author for edit access." } : { code: "unknown_tool", message: `The editor has no tool "${msg.name}".`, hint: "The editor and the MCP server may be different versions." } });
    }
    /* a call that takes work away under a name that does not say so (rows rewritten, modes left out, a style replaced)
       is asked about as a destructive one is */
    const takes = await wouldTakeAway(this.o.store, msg.name, msg.args, { registry }).catch(() => []);
    if (takes.length) e.summary = `takes away ${takes.join("; ")}${e.summary ? ` (${e.summary})` : ""}`;
    if (isDestructiveCall(msg.name, msg.args) || takes.length) {
      e.state = "asking";
      this.changed();
      const answer = await this.confirm(c, key, e);
      if (answer !== "allow") {
        e.state = "denied";
        const why = answer === "timeout" ? `The author did not confirm ${msg.name} in the editor within ${Math.round(c.confirmMs / 1000)} s, so it was not done.` : `The author declined ${msg.name} in the editor.`;
        return reply({ ok: false, error: { code: "refused", message: why, hint: "Leave it as it is, or ask the author what to do instead, then try again while they watch the editor." } });
      }
      e.state = "running";
      this.changed();
    }
    const run: Running = { abort: new AbortController(), port: c.port, draws: new Map() };
    this.running.set(key, run);
    try {
      const prev = this.o.store.get();
      const outcome = await executeTool(this.o.store, msg.name, msg.args, { origin: "mcp", registry, renderer: this.o.renderer, signal: run.abort.signal, ...(c.generate ? { gen: this.genFor(c, run, msg.id) } : {}) });
      if (outcome.ok && wrote(prev, this.o.store.get())) await this.o.settle?.();
      reply(outcome);
    } finally {
      this.running.delete(key);
    }
  }

  /* ---------- telling the servers ---------- */

  private storeChanged(e: ChangeEvent) {
    if (e.kind === "session" || e.kind === "history" || e.state.doc === e.prev.doc) return;
    if (this.changedSoon) return;
    this.changedSoon = setTimeout(() => {
      this.changedSoon = null;
      for (const c of this.conns.values()) if (c.phase === "paired") this.send(c, { t: "changed" });
    }, 300);
  }
}
