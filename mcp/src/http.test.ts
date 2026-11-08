/* Streamable HTTP: a client with the token works; one without it, a request naming another host, and a page from
 * somewhere else are refused. */

import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setGlobalLang } from "../../lib/i18n";
import { serveHttp, type HttpLimits } from "./http";
import { silentLog } from "./log";
import { createMcpServer } from "./server";
import { setup } from "./setup";
import { scratchDir, writeProject } from "./testkit";

beforeAll(() => setGlobalLang("en"));

let stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const s of stops) await s();
  stops = [];
});

async function start(limits?: Partial<HttpLimits>) {
  const path = join(scratchDir(), "p.json");
  writeProject(path);
  const { backend, registry } = await setup({ file: path, screenshots: false, env: {}, version: "test", log: silentLog });
  const http = await serveHttp({ port: 0, token: "s3cret-token", makeServer: () => createMcpServer({ backend, registry, version: "test", log: silentLog }), log: silentLog, limits });
  stops.push(async () => {
    await http.close();
    await backend.close();
  });
  return http;
}

/** a POST of an initialize request, with the headers given; its status */
const post = (port: number, headers: Record<string, string>) =>
  new Promise<number>((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } } });
    const req = request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "content-length": Buffer.byteLength(body), ...headers } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end(body);
  });

describe("Streamable HTTP", () => {
  it("serves a client that sends the token", async () => {
    const http = await start();
    const client = new Client({ name: "http-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(http.url), { requestInit: { headers: { Authorization: "Bearer s3cret-token" } } }));
    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === "get_outline")).toBe(true);
    const r = await client.callTool({ name: "list_screens", arguments: {} });
    expect(JSON.stringify(r.content)).toContain("home");
    await client.close();
  });

  it("refuses a request without the token, naming another host, or from a page elsewhere", async () => {
    const http = await start();
    expect(await post(http.port, {})).toBe(401);
    expect(await post(http.port, { authorization: "Bearer wrong" })).toBe(401);
    expect(await post(http.port, { authorization: "Bearer s3cret-token", host: `rebound.example:${http.port}` })).toBe(403);
    expect(await post(http.port, { authorization: "Bearer s3cret-token", origin: "https://evil.example" })).toBe(403);
    expect(await post(http.port, { authorization: "Bearer s3cret-token", origin: "http://localhost:6274" })).toBe(200);
    expect(await post(http.port, { authorization: "Bearer s3cret-token" })).toBe(200);
  });
});

const AUTH = { authorization: "Bearer s3cret-token", "content-type": "application/json", accept: "application/json, text/event-stream" };

/** a request of a JSON-RPC message, in a session or not: its status and the session id it was given */
const rpc = (port: number, msg: Record<string, unknown>, sid?: string) =>
  new Promise<{ status: number; sid?: string }>((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...msg });
    const req = request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers: { ...AUTH, "content-length": Buffer.byteLength(body), ...(sid ? { "mcp-session-id": sid } : {}) } }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, sid: res.headers["mcp-session-id"] as string | undefined }));
    });
    req.on("error", reject);
    req.end(body);
  });
const init = async (port: number) => {
  const r = await rpc(port, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } } });
  expect(r.status).toBe(200);
  expect(r.sid).toBeTruthy();
  await rpc(port, { method: "notifications/initialized" }, r.sid);
  return r.sid!;
};
const ping = async (port: number, sid: string) => (await rpc(port, { id: 2, method: "ping" }, sid)).status;

/** a session's event stream, held open until it is let go */
const stream = (port: number, sid: string) =>
  new Promise<{ status: number; close: () => void }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/mcp", method: "GET", headers: { authorization: AUTH.authorization, accept: "text/event-stream", "mcp-session-id": sid } }, (res) => {
      resolve({ status: res.statusCode ?? 0, close: () => req.destroy() });
    });
    req.on("error", () => {});
    req.on("error", reject);
    req.end();
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("what a client with the token can tie up", () => {
  it("is so many sessions: the one used longest ago, with nothing in flight, gives way", async () => {
    const http = await start({ sessions: 2 });
    const a = await init(http.port);
    const b = await init(http.port);
    expect(await ping(http.port, a)).toBe(200);
    const c = await init(http.port);
    expect(http.sessions()).toBe(2);
    expect(await ping(http.port, b)).toBe(404);
    expect(await ping(http.port, a)).toBe(200);
    expect(await ping(http.port, c)).toBe(200);
  });

  it("turns a new session away while every open one is busy", async () => {
    const http = await start({ sessions: 1 });
    const a = await init(http.port);
    const open = await stream(http.port, a);
    expect(open.status).toBe(200);
    expect((await rpc(http.port, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "1" } } })).status).toBe(503);
    open.close();
    await wait(100);
    await init(http.port);
    expect(await ping(http.port, a)).toBe(404);
  });

  it("closes a session nobody used for long", async () => {
    const http = await start({ idleMs: 150 });
    const a = await init(http.port);
    expect(await ping(http.port, a)).toBe(200);
    await wait(600);
    expect(await ping(http.port, a)).toBe(404);
    expect(http.sessions()).toBe(0);
  });

  it("is so many requests at once, in all and in one session", async () => {
    const all = await start({ inFlight: 1 });
    const a = await init(all.port);
    const open = await stream(all.port, a);
    expect(await ping(all.port, a)).toBe(503);
    open.close();
    await wait(100);
    expect(await ping(all.port, a)).toBe(200);

    const one = await start({ perSession: 1 });
    const b = await init(one.port);
    const held = await stream(one.port, b);
    expect(await ping(one.port, b)).toBe(429);
    const other = await init(one.port);
    expect(await ping(one.port, other)).toBe(200);
    held.close();
  });

  it("gives a body that does not arrive in time a 408", async () => {
    const http = await start({ bodyMs: 200 });
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port: http.port, path: "/mcp", method: "POST", headers: { ...AUTH, "content-length": 1000 } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", () => resolve(-1));
      req.write('{"jsonrpc":');
      setTimeout(() => reject(new Error("no answer in 3 s")), 3000);
    });
    expect(status).toBe(408);
  });
});
