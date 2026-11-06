/* Streamable HTTP: a client with the token works; one without it, a request naming another host, and a page from
 * somewhere else are refused. */

import { request } from "node:http";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { setGlobalLang } from "../../lib/i18n";
import { serveHttp } from "./http";
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

async function start() {
  const path = join(scratchDir(), "p.json");
  writeProject(path);
  const { backend, registry } = await setup({ file: path, screenshots: false, env: {}, version: "test", log: silentLog });
  const http = await serveHttp({ port: 0, token: "s3cret-token", makeServer: () => createMcpServer({ backend, registry, version: "test", log: silentLog }), log: silentLog });
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
