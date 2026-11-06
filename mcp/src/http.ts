/* Streamable HTTP, for clients that connect to a URL instead of starting the server themselves. It listens on
 * 127.0.0.1 only, at /mcp. Every request must carry the bearer token printed when the server started (or the one it
 * was given); one that names another host, or comes from a page that is not on this machine, is refused, so a web
 * page cannot reach it through DNS rebinding. Each MCP session gets its own `Server` over the shared backend. */

import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loopbackHost } from "../../lib/mcp/protocol";
import type { Log } from "./log";

export const HTTP_PORT = 47841;

export type HttpOptions = {
  port: number;
  token: string;
  /** origins a browser-based client may come from, besides pages on this machine */
  origins?: string[];
  makeServer: () => Server;
  log: Log;
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

/** reads a JSON body of at most 8 MB */
function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function serveHttp(o: HttpOptions): Promise<{ port: number; url: string; close: () => Promise<void> }> {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>();
  let port = o.port;
  const http: HttpServer = createServer(async (req, res) => {
    try {
      if (!loopbackHost(req.headers.host, port)) return deny(res, 403, "Forbidden: this server answers only to 127.0.0.1 and localhost.");
      const origin = req.headers.origin;
      if (origin && !allowedOrigin(origin, o.origins ?? [])) return deny(res, 403, "Forbidden origin.");
      if ((req.url ?? "").split("?")[0] !== "/mcp") return deny(res, 404, "Not found: the endpoint is /mcp.");
      const auth = String(req.headers.authorization ?? "");
      if (!auth.startsWith("Bearer ") || !same(auth.slice(7).trim(), o.token)) return deny(res, 401, "Unauthorized: send Authorization: Bearer <the token the server printed>.", { "www-authenticate": 'Bearer realm="m3e-canvas-mcp"' });
      const sid = req.headers["mcp-session-id"];
      const id = Array.isArray(sid) ? sid[0] : sid;
      let parsed: unknown;
      if (req.method === "POST") {
        try {
          parsed = await body(req);
        } catch {
          return deny(res, 400, "The body is not JSON.");
        }
      }
      if (id) {
        const s = sessions.get(id);
        if (!s) return deny(res, 404, "There is no such session (the server may have restarted): initialize again.");
        await s.transport.handleRequest(req, res, parsed);
        return;
      }
      if (req.method !== "POST" || !isInitializeRequest(parsed)) return deny(res, 400, "Start with an initialize request, without a session id.");
      const server = o.makeServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          sessions.set(sessionId, { transport, server });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, parsed);
    } catch (e) {
      o.log.warn(`http: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) deny(res, 500, "Internal error.");
    }
  });
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
    close: async () => {
      for (const s of sessions.values()) await s.server.close().catch(() => {});
      sessions.clear();
      const closing = new Promise<void>((ok) => http.close(() => ok()));
      /* a client's open event stream would otherwise hold the port */
      http.closeAllConnections();
      await closing;
    },
  };
}
