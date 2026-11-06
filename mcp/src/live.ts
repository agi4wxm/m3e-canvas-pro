/* The live backend: an editor tab the author paired with this server. The server listens on a WebSocket at
 * 127.0.0.1 (lib/mcp/protocol.ts); only a page served as the editor may open it (its Origin, and a Host naming this
 * machine, against DNS rebinding). The server says hello with the pairing code it printed to its log, the author
 * compares and approves in the tab, and from then on each tool call is sent to the tab, which runs it on its own store:
 * the change appears on the canvas as it happens and is one undo step there.
 *
 * One tab at a time. A tab that reloads comes back without asking again (the resume token it was given), until this
 * server stops. Generative tools run in the tab too, but what they draw is drawn here, with this process's key, and
 * only for a generative call this server is waiting on. */

import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { BRIDGE_PORT, BRIDGE_PORTS, BRIDGE_PROTOCOL, CONFIRM_MS, editorOrigin, loopbackHost, pairingCode, parseMsg, type Access, type ClientInfo, type DrawRequest, type DrawResult, type EditorMsg, type ServerMsg } from "../../lib/mcp/protocol";
import type { ToolError, ToolOutcome } from "../../lib/tools/types";
import { failure, listeners, type Backend, type CallContext, type CallOutcome } from "./backend";
import type { Log } from "./log";

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
};

type Pending = { name: string; resolve: (o: ToolOutcome) => void; timer: ReturnType<typeof setTimeout>; draws: number; abort: AbortController };
type Conn = { ws: WebSocket; paired: boolean; access: Access; origin: string; alive: boolean };

const DRAWS_PER_CALL = 2;

export class LiveBackend implements Backend {
  readonly kind = "live" as const;
  readonly code: string;
  readonly id: string;
  private wss: WebSocketServer | null = null;
  private conn: Conn | null = null;
  private resume: { token: string; access: Access } | null = null;
  private client: ClientInfo | null = null;
  private calls = new Map<string, Pending>();
  private seq = 0;
  private readonly changes = listeners<["document" | "access"]>();
  private readonly pairing = listeners<[]>();
  private ping: ReturnType<typeof setInterval> | null = null;
  port: number | null = null;

  constructor(private readonly o: LiveOptions) {
    this.code = pairingCode((n) => randomInt(n));
    this.id = randomBytes(8).toString("hex");
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
    this.o.log.notice(`Live bridge on ws://127.0.0.1:${this.port}. In M3E Canvas, turn on “Connect to MCP” and approve pairing code ${this.code}.`);
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
    const conn: Conn = { ws, paired: false, access: this.o.access, origin, alive: true };
    this.conn = conn;
    this.o.log.info(`Editor tab connected from ${origin}. Pairing code ${this.code}: approve it in the editor.`);
    this.send(ws, { t: "hello", protocol: BRIDGE_PROTOCOL, server: { name: "m3e-canvas-mcp", version: this.o.version, id: this.id }, client: this.client, access: this.o.access, code: this.code, generate: !!this.o.draw, confirmMs: this.o.confirmMs ?? CONFIRM_MS });
    ws.on("pong", () => {
      conn.alive = true;
    });
    ws.on("message", (data) => this.received(conn, parseMsg<EditorMsg>(String(data))));
    ws.on("close", () => this.closed(conn));
    ws.on("error", () => {});
  }

  private pair(conn: Conn, access: Access) {
    conn.paired = true;
    conn.access = this.o.access === "read" ? "read" : access;
    const token = randomBytes(16).toString("hex");
    this.resume = { token, access: conn.access };
    this.send(conn.ws, { t: "paired", access: conn.access, resume: token });
    this.o.log.notice(`Paired with the editor tab at ${conn.origin} (${conn.access === "edit" ? "edit" : "read-only"}).`);
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
        if (!conn.paired) this.pair(conn, msg.access === "read" ? "read" : "edit");
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
    if (this.conn) this.send(this.conn.ws, { t: "client", client });
  }

  onChange(fn: (what: "document" | "access") => void) {
    return this.changes.add(fn);
  }

  /** how the author connects a tab, in words a model can pass on */
  howToPair(): string {
    return `Ask the author to open M3E Canvas, click the plug icon (Connect to MCP) at the bottom of the left rail, and approve pairing code ${this.code}.`;
  }

  status() {
    const c = this.conn;
    return {
      mode: "live",
      editor: this.paired() ? "paired" : c ? "waiting for approval" : "not connected",
      ...(this.paired() ? { access: c!.access, origin: c!.origin } : { pairingCode: this.code, howToConnect: this.howToPair() }),
      bridge: this.port !== null ? `ws://127.0.0.1:${this.port}` : "not listening",
      drawing: this.o.draw ? "on (OPENAI_API_KEY)" : "off",
    };
  }

  async call(name: string, args: unknown, ctx: CallContext): Promise<CallOutcome> {
    if (!this.paired()) {
      const waiting = !!this.conn && (await this.waitForPairing(this.o.pairWaitMs ?? 30_000, ctx.signal));
      if (!waiting) return failure("unavailable", this.conn ? `The editor tab has not approved the pairing yet (code ${this.code}).` : "No editor tab is connected.", this.howToPair());
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
