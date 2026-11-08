/* The live backend: an editor tab the author paired with this server. The server listens on a WebSocket at
 * 127.0.0.1 (lib/mcp/protocol.ts); only a page served as the editor may open it (its Origin, and a Host naming this
 * machine, against DNS rebinding). Another page served on one of those ports could open it too, so the pairing code
 * is never sent over it: the server prints it to its log and gives it to its MCP client, the author types it into the
 * tab, and only a tab that sent it is paired. After PAIRING_TRIES wrong codes the server takes none until it is
 * started again. From then on each tool call is sent to the tab, which runs it on its own store: the change appears
 * on the canvas as it happens and is one undo step there.
 *
 * One tab at a time. A tab that reloads comes back without asking again (the resume token it was given), until this
 * server stops. When the author approved with "remember this client", a later server for the same client proves it
 * holds the secret the tab gave (trust.ts), the tab proves it holds it too, and it is paired without the code.
 * Generative tools run in the tab too, but what they draw is drawn here, with this process's key, and only for a
 * generative call this server is waiting on. */

import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { BRIDGE_PORT, BRIDGE_PORTS, BRIDGE_PROTOCOL, CONFIRM_MS, PAIRING_TRIES, codeDigits, editorOrigin, loopbackHost, pairingCode, parseMsg, type Access, type ClientInfo, type DrawRequest, type DrawResult, type EditorMsg, type ServerMsg } from "../../lib/mcp/protocol";
import type { ToolError, ToolOutcome } from "../../lib/tools/types";
import { failure, listeners, type Backend, type CallContext, type CallOutcome } from "./backend";
import type { Log } from "./log";
import { editorProven, proofOf, type TrustStore } from "./trust";

export type LiveOptions = {
  /** the first port to try (BRIDGE_PORT), and how many after it */
  port?: number;
  ports?: number;
  /** origins the editor is served from, besides this machine's dev and preview ports */
  origins?: string[];
  /** what this server allows */
  access: Access;
  /** draws for a generative tool running in the tab; absent when this server has no key */
  draw?: (req: DrawRequest, signal: AbortSignal) => Promise<DrawResult>;
  /** the names of the tools whose calls may ask for a drawing */
  drawingTools?: readonly string[];
  confirmMs?: number;
  /** how long a call may take in the tab before it is given up */
  callMs?: number;
  /** how long a call waits for a tab that has connected and not been approved yet */
  pairWaitMs?: number;
  version: string;
  log: Log;
  /** where remembered pairings are kept; without it the tab is never offered to remember one */
  trust?: TrustStore;
  /** how long a pairing code holds (PAIRING_CODE_MS) */
  codeMs?: number;
  /** the time, for tests */
  now?: () => number;
};

/** How long a pairing code holds. A new one is made after that, and after one was used to pair: the code a client
 *  was told is good for a while and for one tab, not for as long as the server runs. Wrong tries still count across
 *  codes (PAIRING_TRIES for the server's whole run). */
export const PAIRING_CODE_MS = 10 * 60_000;

/** a time left, in the words a model passes on */
const timeLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 120 ? `${Math.floor(s / 60)} minutes` : s >= 60 ? `1 minute ${s - 60} s` : `${s} s`;
};

type Pending = { name: string; resolve: (o: ToolOutcome) => void; timer: ReturnType<typeof setTimeout>; draws: number; abort: AbortController };
/** `challenge` is what a tab remembering this client signs to be let in without the code */
type Conn = { ws: WebSocket; paired: boolean; access: Access; origin: string; alive: boolean; challenge: string; approving?: boolean };

const DRAWS_PER_CALL = 2;

export class LiveBackend implements Backend {
  readonly kind = "live" as const;
  readonly id: string;
  /** the pairing code now, and until when it holds */
  private pairCode: { code: string; until: number };
  private wss: WebSocketServer | null = null;
  private conn: Conn | null = null;
  private resume: { token: string; access: Access } | null = null;
  private client: ClientInfo | null = null;
  private calls = new Map<string, Pending>();
  private seq = 0;
  private readonly changes = listeners<["document" | "access"]>();
  private readonly pairing = listeners<[]>();
  private ping: ReturnType<typeof setInterval> | null = null;
  /** wrong codes typed so far; at PAIRING_TRIES the server takes no more */
  private wrongCodes = 0;
  port: number | null = null;

  constructor(private readonly o: LiveOptions) {
    this.pairCode = this.newCode();
    this.id = randomBytes(8).toString("hex");
  }

  private now = () => (this.o.now ?? Date.now)();
  private newCode = () => ({ code: pairingCode((n) => randomInt(n)), until: this.now() + (this.o.codeMs ?? PAIRING_CODE_MS) });

  /** The pairing code now: a new one once the last has run out (said in the log, where the author may read it). */
  get code(): string {
    if (this.now() >= this.pairCode.until) {
      this.pairCode = this.newCode();
      if (!this.locked()) this.o.log.notice(`The pairing code ran out; the new one is ${this.pairCode.code} (for ${timeLeft(this.codeLeft())}).`);
    }
    return this.pairCode.code;
  }

  /** how long the code holds still */
  codeLeft(): number {
    return Math.max(0, this.pairCode.until - this.now());
  }

  /** a code that paired a tab is spent: the next tab is given a new one */
  private spend() {
    this.pairCode = this.newCode();
  }

  /** Listens on the first free port of the range; the port, or a thrown error when none is free. */
  async start(): Promise<number> {
    const first = this.o.port ?? BRIDGE_PORT;
    const count = this.o.ports ?? BRIDGE_PORTS;
    let last: unknown;
    for (let port = first; port < first + Math.max(1, count); port++) {
      try {
        this.wss = await this.listen(port);
        /* port 0 (tests) is whichever one the system gave */
        const a = this.wss.address();
        this.port = typeof a === "object" && a ? a.port : port;
        break;
      } catch (e) {
        last = e;
        if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
      }
    }
    if (!this.wss || this.port === null) throw new Error(`No port is free for the live bridge (${first}–${first + count - 1}): ${last instanceof Error ? last.message : String(last)}`);
    this.ping = setInterval(() => this.heartbeat(), 15_000);
    this.ping.unref?.();
    this.o.log.notice(`Live bridge on ws://127.0.0.1:${this.port}. In M3E Canvas, turn on “Connect to MCP” and type pairing code ${this.code} (it holds for ${timeLeft(this.codeLeft())}, then a new one is given here).`);
    return this.port;
  }

  private listen(port: number): Promise<WebSocketServer> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({
        host: "127.0.0.1",
        port,
        maxPayload: 64 * 1024 * 1024,
        verifyClient: ({ origin, req }, done) => {
          const host = req.headers.host;
          if (!loopbackHost(host, this.port ?? port)) {
            this.o.log.warn(`Refused a bridge connection naming host ${JSON.stringify(host)}.`);
            return done(false, 403, "Forbidden host");
          }
          if (!editorOrigin(origin, this.o.origins)) {
            this.o.log.warn(`Refused a bridge connection from ${JSON.stringify(origin ?? "no origin")}: not the editor (add it with --origin).`);
            return done(false, 403, "Forbidden origin");
          }
          done(true);
        },
      });
      const fail = (e: Error) => {
        wss.close();
        reject(e);
      };
      wss.once("error", fail);
      wss.once("listening", () => {
        wss.off("error", fail);
        wss.on("error", (e) => this.o.log.warn(`bridge: ${e.message}`));
        wss.on("connection", (ws, req) => this.connected(ws, String(req.headers.origin ?? "")));
        resolve(wss);
      });
    });
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private connected(ws: WebSocket, origin: string) {
    const cur = this.conn;
    if (cur && cur.paired && cur.ws.readyState === cur.ws.OPEN) {
      this.send(ws, { t: "refused", reason: "busy" });
      ws.close(4001, "busy");
      return;
    }
    /* a tab still waiting for approval gives way to the one that came after it */
    if (cur) cur.ws.close(4002, "replaced");
    const conn: Conn = { ws, paired: false, access: this.o.access, origin, alive: true, challenge: randomBytes(16).toString("hex") };
    this.conn = conn;
    this.o.log.info(this.locked() ? `Editor tab connected from ${origin}; too many wrong pairing codes were typed, so this server pairs no more until it is started again.` : `Editor tab connected from ${origin}. Pairing code ${this.code} (for ${timeLeft(this.codeLeft())}): type it in the editor.`);
    void this.known(origin).then((known) => this.send(ws, { t: "hello", protocol: BRIDGE_PROTOCOL, server: { name: "m3e-canvas-mcp", version: this.o.version, id: this.id }, client: this.client, access: this.o.access, challenge: conn.challenge, generate: !!this.o.draw, confirmMs: this.o.confirmMs ?? CONFIRM_MS, ...(known ? { known } : {}) }));
    ws.on("pong", () => {
      conn.alive = true;
    });
    ws.on("message", (data) => this.received(conn, parseMsg<EditorMsg>(String(data))));
    ws.on("close", () => this.closed(conn));
    ws.on("error", () => {});
  }

  /** the remembered pairings a tab at `origin` may ask this server to prove, for the client it serves; undefined when
   *  nothing can be remembered here */
  private async known(origin: string): Promise<string[] | undefined> {
    if (!this.o.trust) return undefined;
    return this.o.trust.known(this.client?.name ?? "", origin).catch(() => []);
  }

  /** too many wrong codes were typed: this server pairs no more until it is started again */
  private locked = () => this.wrongCodes >= PAIRING_TRIES;

  /** A tab's approval: the code the author typed, or a remembered pairing the tab proves it holds (its HMAC of this
   *  connection's challenge). Anything else is a wrong try. */
  private async approval(conn: Conn, msg: Extract<EditorMsg, { t: "approve" }>) {
    const access: Access = msg.access === "read" ? "read" : "edit";
    if (this.locked()) return this.refuse(conn, "locked");
    const known = msg.known && typeof msg.known === "object" ? msg.known : undefined;
    if (known) {
      const r = this.o.trust && typeof known.id === "string" ? await this.o.trust.find(known.id, this.client?.name ?? "", conn.origin).catch(() => undefined) : undefined;
      if (this.conn !== conn || conn.paired) return;
      if (r && this.port !== null && editorProven(r.secret, conn.challenge, this.port, known.mac)) {
        void this.o.trust!.touch(r.id).catch(() => {});
        return this.pair(conn, access === "edit" && r.access === "edit" ? "edit" : "read");
      }
      return this.wrong(conn);
    }
    const typed = codeDigits(msg.code);
    if (!typed || typed !== codeDigits(this.code)) return this.wrong(conn);
    /* spent the moment it is taken: it pairs one tab */
    this.spend();
    return this.approved(conn, access, msg.remember);
  }

  /** a wrong code (or a proof that does not hold): the tab is told how many tries are left, or that there are none */
  private wrong(conn: Conn) {
    this.wrongCodes++;
    const left = PAIRING_TRIES - this.wrongCodes;
    if (left <= 0) {
      this.o.log.warn(`${PAIRING_TRIES} wrong pairing codes were typed (the last from ${conn.origin}): this server pairs no more until it is started again. If it was not you, a page on this machine tried to connect.`);
      return this.refuse(conn, "locked");
    }
    this.o.log.warn(`A wrong pairing code came from the tab at ${conn.origin}; ${left} ${left === 1 ? "try is" : "tries are"} left. The code is ${this.code}.`);
    this.send(conn.ws, { t: "wrong", left });
  }

  private refuse(conn: Conn, reason: Extract<ServerMsg, { t: "refused" }>["reason"]) {
    this.send(conn.ws, { t: "refused", reason });
    conn.ws.close(4005, reason);
  }

  /** an approval, kept for later servers of this client when the author asked for it */
  private async approved(conn: Conn, access: Access, remember?: { secret?: unknown }) {
    const secret = remember?.secret;
    let remembered: { id: string } | undefined;
    if (this.o.trust && typeof secret === "string" && /^[0-9a-f]{64}$/.test(secret)) {
      const given = this.o.access === "read" ? "read" : access;
      try {
        const r = await this.o.trust.add({ secret, client: this.client?.name ?? "", ...(this.client?.title ? { title: this.client.title } : {}), origin: conn.origin, access: given });
        remembered = { id: r.id };
      } catch (e) {
        this.o.log.warn(`Could not remember the pairing (${this.o.trust.path}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (this.conn !== conn || conn.paired) return;
    this.pair(conn, access, remembered);
  }

  /** a tab's challenge for a remembered pairing, answered when this server holds it for its client and the tab */
  private async prove(conn: Conn, id: unknown, nonce: unknown) {
    if (typeof id !== "string" || typeof nonce !== "string" || !/^[0-9a-f]{16,64}$/.test(nonce)) return;
    const r = this.o.trust && (await this.o.trust.find(id, this.client?.name ?? "", conn.origin).catch(() => undefined));
    if (this.conn !== conn) return;
    this.send(conn.ws, { t: "proof", id, nonce, mac: r && this.port !== null ? proofOf(r.secret, nonce, this.port) : null });
    if (r) void this.o.trust!.touch(r.id).catch(() => {});
  }

  private pair(conn: Conn, access: Access, remembered?: { id: string }) {
    conn.paired = true;
    conn.access = this.o.access === "read" ? "read" : access;
    const token = randomBytes(16).toString("hex");
    this.resume = { token, access: conn.access };
    this.send(conn.ws, { t: "paired", access: conn.access, resume: token, ...(remembered ? { remembered } : {}) });
    this.o.log.notice(`Paired with the editor tab at ${conn.origin} (${conn.access === "edit" ? "edit" : "read-only"}${remembered ? `; remembered for ${this.client?.title ?? this.client?.name ?? "this client"} in ${this.o.trust!.path}` : ""}).`);
    this.pairing.emit();
    this.changes.emit("access");
    this.changes.emit("document");
  }

  private received(conn: Conn, msg: EditorMsg | null) {
    if (!msg || this.conn !== conn) return;
    switch (msg.t) {
      case "hello":
        if (msg.protocol !== BRIDGE_PROTOCOL) {
          this.send(conn.ws, { t: "refused", reason: "protocol" });
          conn.ws.close(4003, "protocol");
          this.o.log.warn(`The editor speaks bridge protocol ${msg.protocol}; this server speaks ${BRIDGE_PROTOCOL}. Update the one that is older.`);
          return;
        }
        if (!conn.paired && this.resume && msg.resume === this.resume.token) this.pair(conn, this.resume.access);
        return;
      case "approve":
        if (!conn.paired && !conn.approving) {
          conn.approving = true;
          void this.approval(conn, msg).finally(() => {
            conn.approving = false;
          });
        }
        return;
      case "prove":
        void this.prove(conn, msg.id, msg.nonce);
        return;
      case "forget":
        if (this.o.trust && typeof msg.id === "string" && typeof msg.secret === "string")
          void this.o.trust.remove(msg.id, msg.secret).then(
            (gone) => gone && this.o.log.info("The author forgot a remembered pairing in the editor."),
            () => {},
          );
        return;
      case "deny":
        this.send(conn.ws, { t: "refused", reason: "denied" });
        conn.ws.close(4004, "denied");
        this.o.log.info("The author declined the pairing in the editor.");
        return;
      case "result": {
        const p = this.calls.get(msg.id);
        if (!p || !conn.paired) return;
        this.settle(msg.id, msg.outcome && typeof msg.outcome === "object" ? msg.outcome : { ok: false, error: { code: "failed", message: "The editor sent no result." } });
        return;
      }
      case "draw":
        void this.drawFor(conn, msg);
        return;
      case "changed":
        if (conn.paired) this.changes.emit("document");
        return;
    }
  }

  /** a drawing asked by the tab: only for a generative call this server sent and is still waiting on */
  private async drawFor(conn: Conn, msg: Extract<EditorMsg, { t: "draw" }>) {
    const reply = (m: { ok: true; value: DrawResult } | { ok: false; error: ToolError }) => this.send(conn.ws, { t: "drawn", id: msg.id, ...m } as ServerMsg);
    const p = this.calls.get(msg.call);
    if (!conn.paired || !p || !(this.o.drawingTools ?? []).includes(p.name)) return reply({ ok: false, error: { code: "refused", message: "A drawing is only made for a generative call the server is waiting on." } });
    if (!this.o.draw) return reply({ ok: false, error: { code: "unavailable", message: "This server has no OPENAI_API_KEY to draw with." } });
    if (++p.draws > DRAWS_PER_CALL) return reply({ ok: false, error: { code: "refused", message: "That call has had its drawings." } });
    try {
      reply({ ok: true, value: await this.o.draw({ what: msg.what, args: msg.args } as DrawRequest, p.abort.signal) });
    } catch (e) {
      const err = e as { code?: string; message?: string; hint?: string };
      reply({ ok: false, error: { code: (typeof err.code === "string" ? err.code : "failed") as ToolError["code"], message: err.message ?? String(e), ...(err.hint ? { hint: err.hint } : {}) } });
    }
  }

  private closed(conn: Conn) {
    if (this.conn !== conn) return;
    this.conn = null;
    if (conn.paired) {
      this.o.log.notice("The editor tab disconnected.");
      this.changes.emit("access");
    }
    for (const id of this.calls.keys()) this.settle(id, { ok: false, error: { code: "unavailable", message: "The editor tab disconnected before the call finished; it may have done part of its work.", hint: "Call connection_status, and read the outline again once the tab is back." } });
  }

  private settle(id: string, outcome: ToolOutcome) {
    const p = this.calls.get(id);
    if (!p) return;
    this.calls.delete(id);
    clearTimeout(p.timer);
    p.abort.abort();
    p.resolve(outcome);
  }

  private heartbeat() {
    const c = this.conn;
    if (!c) return;
    if (!c.alive) {
      c.ws.terminate();
      return;
    }
    c.alive = false;
    try {
      c.ws.ping();
    } catch {}
  }

  /** whether a tab is paired now */
  paired(): boolean {
    return !!this.conn?.paired && this.conn.ws.readyState === this.conn.ws.OPEN;
  }

  /** waits for a tab that connected to be approved; false when it was not within `ms` */
  private waitForPairing(ms: number, signal?: AbortSignal): Promise<boolean> {
    if (this.paired()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        off();
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        resolve(v);
      };
      const off = this.pairing.add(() => done(true));
      const timer = setTimeout(() => done(false), ms);
      const stop = () => done(false);
      signal?.addEventListener("abort", stop, { once: true });
    });
  }

  access(): Access {
    return this.paired() ? this.conn!.access : this.o.access;
  }

  setClient(client: ClientInfo | null) {
    this.client = client;
    const conn = this.conn;
    if (!conn) return;
    /* a tab waiting may now find a pairing it remembers for this client */
    void this.known(conn.origin).then((known) => this.send(conn.ws, { t: "client", client, ...(known ? { known } : {}) }));
  }

  onChange(fn: (what: "document" | "access") => void) {
    return this.changes.add(fn);
  }

  /** how the author connects a tab, in words a model can pass on */
  howToPair(): string {
    if (this.locked()) return "Too many wrong pairing codes were typed in the editor, so this server pairs no more. Ask the author to restart the MCP server (restart the client, or reload its MCP servers), then pair again with the new code.";
    return `Tell the author the pairing code ${this.code} (it holds for another ${timeLeft(this.codeLeft())}; after that, or once a tab has paired with it, call connection_status for the new one), and ask them to open M3E Canvas, click the plug icon (Connect to MCP) at the bottom of the left rail and type that code when the editor asks for it.`;
  }

  status() {
    const c = this.conn;
    return {
      mode: "live",
      editor: this.paired() ? "paired" : this.locked() ? "locked (too many wrong pairing codes)" : c ? "waiting for the author to type the code" : "not connected",
      ...(this.paired() ? { access: c!.access, origin: c!.origin } : this.locked() ? { howToConnect: this.howToPair() } : { pairingCode: this.code, pairingCodeExpiresInSeconds: Math.ceil(this.codeLeft() / 1000), howToConnect: this.howToPair() }),
      bridge: this.port !== null ? `ws://127.0.0.1:${this.port}` : "not listening",
      drawing: this.o.draw ? "on (OPENAI_API_KEY)" : "off",
    };
  }

  async call(name: string, args: unknown, ctx: CallContext): Promise<CallOutcome> {
    if (!this.paired()) {
      const waiting = !!this.conn && (await this.waitForPairing(this.o.pairWaitMs ?? 30_000, ctx.signal));
      if (!waiting) return failure("unavailable", this.locked() ? "This server pairs no more: too many wrong pairing codes were typed." : this.conn ? `The author has not typed the pairing code in the editor yet (code ${this.code}).` : "No editor tab is connected.", this.howToPair());
    }
    const conn = this.conn!;
    const id = `c${++this.seq}`;
    const generative = (this.o.drawingTools ?? []).includes(name);
    const ms = (this.o.callMs ?? 120_000) + (ctx.destructive ? (this.o.confirmMs ?? CONFIRM_MS) : 0) + (generative ? 180_000 : 0);
    return new Promise<CallOutcome>((resolve) => {
      const abort = new AbortController();
      const timer = setTimeout(() => {
        this.send(conn.ws, { t: "cancel", id });
        this.settle(id, { ok: false, error: { code: "aborted", message: `The editor did not finish ${name} within ${Math.round(ms / 1000)} s.`, hint: "Read the outline to see what it did, then try again." } });
      }, ms);
      this.calls.set(id, { name, resolve, timer, draws: 0, abort });
      ctx.signal?.addEventListener(
        "abort",
        () => {
          if (!this.calls.has(id)) return;
          this.send(conn.ws, { t: "cancel", id });
          this.settle(id, { ok: false, error: { code: "aborted", message: "Stopped by the client." } });
        },
        { once: true },
      );
      this.send(conn.ws, { t: "call", id, name, args: args ?? {}, client: ctx.client ?? this.client });
    });
  }

  async close() {
    if (this.ping) clearInterval(this.ping);
    for (const id of this.calls.keys()) this.settle(id, { ok: false, error: { code: "aborted", message: "The server is stopping." } });
    this.conn?.ws.close(1001, "server stopping");
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }
}
