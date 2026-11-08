/* Streamable HTTP, for clients that connect to a URL instead of starting the server themselves. It listens on
 * 127.0.0.1 only, at /mcp. Every request must carry the bearer token printed when the server started (or the one it
 * was given); one that names another host, or comes from a page that is not on this machine, is refused, so a web
 * page cannot reach it through DNS rebinding. Each MCP session gets its own `Server` over the shared backend.
 *
 * What a client holding the token can tie up is bounded: so many sessions (the one used longest ago, with nothing in
 * flight, gives way to a new one), a session nobody used for an hour is closed, so many requests at once (in all and
 * per session), and a request's body must arrive within half a minute. A client that is turned away is told why and
 * when to try again. */

import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loopbackHost } from "../../lib/mcp/protocol";
import type { Log } from "./log";

export const HTTP_PORT = 47841;

/** what one server takes from its clients at most */
export type HttpLimits = {
  /** sessions open at once */
  sessions: number;
  /** a session with nothing in flight is closed after this long unused */
  idleMs: number;
  /** requests in flight at once, in all (an open event stream is one) */
  inFlight: number;
  /** and in one session */
  perSession: number;
  /** how long a request's headers and body may take to arrive */
  bodyMs: number;
};

export const HTTP_LIMITS: HttpLimits = { sessions: 32, idleMs: 60 * 60_000, inFlight: 64, perSession: 16, bodyMs: 30_000 };

export type HttpOptions = {
  port: number;
  token: string;
  /** origins a browser-based client may come from, besides pages on this machine */
  origins?: string[];
  makeServer: () => Server;
  log: Log;
  limits?: Partial<HttpLimits>;
};

export const newToken = () => randomBytes(24).toString("base64url");

/** a page on this machine, or one of the origins given */
function allowedOrigin(origin: string, extra: readonly string[]): boolean {
  const o = origin.replace(/\/+$/, "").toLowerCase();
  if (extra.some((x) => x.replace(/\/+$/, "").toLowerCase() === o)) return true;
  try {
    const u = new URL(o);
    return (u.protocol === "http:" || u.protocol === "https:") && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const deny = (res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
};

class BodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** reads a JSON body of at most 8 MB, within `ms` */
function body(req: IncomingMessage, ms: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    /* turned away: answered (the connection closes after the answer), and what else comes is dropped */
    const refuse = (e: BodyError) => {
      clearTimeout(timer);
      req.removeAllListeners("data");
      req.resume();
      reject(e);
    };
    const timer = setTimeout(() => refuse(new BodyError(408, `The body did not arrive within ${Math.round(ms / 1000)} s.`)), ms);
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) refuse(new BodyError(413, "The body is larger than 8 MB."));
      else chunks.push(c);
    });
    req.on("end", () => {
      clearTimeout(timer);
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined);
      } catch {
        reject(new BodyError(400, "The body is not JSON."));
      }
    });
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

type Session = { transport: StreamableHTTPServerTransport; server: Server; last: number; busy: number };

export async function serveHttp(o: HttpOptions): Promise<{ port: number; url: string; close: () => Promise<void>; sessions: () => number }> {
  const limits: HttpLimits = { ...HTTP_LIMITS, ...o.limits };
  const sessions = new Map<string, Session>();
  /* sessions being made: counted against the limit before they have an id */
  let starting = 0;
  let inFlight = 0;
  let port = o.port;

  const end = async (id: string, why: string) => {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    o.log.info(`http: closed session ${id.slice(0, 8)}… (${why}).`);
    await s.server.close().catch(() => {});
  };

  /* sessions nobody used for long, with nothing in flight, are closed */
  const sweep = setInterval(
    () => {
      const now = Date.now();
      for (const [id, s] of sessions) if (s.busy === 0 && now - s.last > limits.idleMs) void end(id, "unused too long");
    },
    Math.max(50, Math.min(60_000, limits.idleMs / 4)),
  );
  sweep.unref?.();

  /** room for one more session: the one used longest ago, with nothing in flight, makes way; false when none can */
  const room = async () => {
    if (sessions.size + starting < limits.sessions) return true;
    let oldest: [string, Session] | null = null;
    for (const e of sessions) if (e[1].busy === 0 && (!oldest || e[1].last < oldest[1].last)) oldest = e;
    if (!oldest) return false;
    await end(oldest[0], "a new session needed its place");
    return true;
  };

  const http: HttpServer = createServer(async (req, res) => {
    let counted = false;
    let session: Session | undefined;
    const done = () => {
      if (!counted) return;
      counted = false;
      inFlight--;
      if (session) {
        session.busy--;
        session.last = Date.now();
      }
    };
    try {
      if (!loopbackHost(req.headers.host, port)) return deny(res, 403, "Forbidden: this server answers only to 127.0.0.1 and localhost.");
      const origin = req.headers.origin;
      if (origin && !allowedOrigin(origin, o.origins ?? [])) return deny(res, 403, "Forbidden origin.");
      if ((req.url ?? "").split("?")[0] !== "/mcp") return deny(res, 404, "Not found: the endpoint is /mcp.");
      const auth = String(req.headers.authorization ?? "");
      if (!auth.startsWith("Bearer ") || !same(auth.slice(7).trim(), o.token)) return deny(res, 401, "Unauthorized: send Authorization: Bearer <the token the server printed>.", { "www-authenticate": 'Bearer realm="m3e-canvas-mcp"' });
      const sid = req.headers["mcp-session-id"];
      const id = Array.isArray(sid) ? sid[0] : sid;
      session = id ? sessions.get(id) : undefined;
      if (id && !session) return deny(res, 404, "There is no such session (it was closed, or the server restarted): initialize again.");
      if (inFlight >= limits.inFlight) return deny(res, 503, `Busy: ${limits.inFlight} requests are in flight. Try again in a moment.`, { "retry-after": "1" });
      if (session && session.busy >= limits.perSession) return deny(res, 429, `This session has ${limits.perSession} requests in flight. Wait for one to finish.`, { "retry-after": "1" });
      /* counted from here until the response is over (an event stream until it closes) */
      counted = true;
      inFlight++;
      if (session) {
        session.busy++;
        session.last = Date.now();
      }
      res.once("close", done);
      let parsed: unknown;
      if (req.method === "POST") {
        try {
          parsed = await body(req, limits.bodyMs);
        } catch (e) {
          deny(res, e instanceof BodyError ? e.status : 400, e instanceof Error ? e.message : "The body could not be read.", { connection: "close" });
          res.once("finish", () => req.socket.destroy());
          return;
        }
      }
      if (session) {
        await session.transport.handleRequest(req, res, parsed);
        return;
      }
      if (req.method !== "POST" || !isInitializeRequest(parsed)) return deny(res, 400, "Start with an initialize request, without a session id.");
      if (!(await room())) return deny(res, 503, `${limits.sessions} sessions are open, each busy. Close one, or try again later.`, { "retry-after": "5" });
      starting++;
      let started = false;
      try {
        const server = o.makeServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            started = true;
            starting--;
            sessions.set(sessionId, { transport, server, last: Date.now(), busy: 0 });
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, parsed);
      } finally {
        if (!started) starting--;
      }
    } catch (e) {
      o.log.warn(`http: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) deny(res, 500, "Internal error.");
    }
  });
  /* the headers and the whole request (not the response, which may be a long event stream) arrive in time */
  http.headersTimeout = Math.min(limits.bodyMs, 10_000);
  http.requestTimeout = limits.bodyMs;
  await new Promise<void>((ok, fail) => {
    http.once("error", fail);
    http.listen(o.port, "127.0.0.1", () => {
      const a = http.address();
      port = typeof a === "object" && a ? a.port : o.port;
      ok();
    });
  });
  return {
    port,
    url: `http://127.0.0.1:${port}/mcp`,
    sessions: () => sessions.size,
    close: async () => {
      clearInterval(sweep);
      for (const s of sessions.values()) await s.server.close().catch(() => {});
      sessions.clear();
      const closing = new Promise<void>((ok) => http.close(() => ok()));
      /* a client's open event stream would otherwise hold the port */
      http.closeAllConnections();
      await closing;
    },
  };
}
