/* What the MCP tests share: a server and an SDK client joined in memory, and a project file in a folder of its own. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../../lib/core";
import { projectFile } from "../../lib/project";
import { silentLog } from "./log";
import { createMcpServer } from "./server";
import { setup, type SetupOptions } from "./setup";

/** a folder for one test */
export const scratchDir = () => mkdtempSync(join(tmpdir(), "m3e-mcp-"));

/** a project file with one screen holding a box with a text in it, written where it is asked */
export function writeProject(path: string) {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => "en" });
  store.transact("Start", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Shop" });
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addPart, { slug: "box", id: "card", screen: "home", at: { x: 16, y: 120 }, props: { surface: "card" } });
    tx.run(ops.addPart, { slug: "text", id: "hello", into: { container: "card" }, props: { text: "Hello" } });
  });
  const doc = savedDoc(store.get());
  writeFileSync(path, JSON.stringify(projectFile(doc), null, 2));
  return doc;
}

/** a server on the options given, and a client talking to it; `elicit` answers the server's confirmations */
export async function connect(o: Omit<SetupOptions, "version" | "log">, elicit?: (message: string) => boolean, clientName = "test-client") {
  const { backend, registry } = await setup({ screenshots: false, env: {}, trustDir: scratchDir(), ...o, version: "test", log: silentLog });
  const server = createMcpServer({ backend, registry, version: "test", log: silentLog });
  const client = new Client({ name: clientName, version: "1.0.0" }, { capabilities: elicit ? { elicitation: {} } : {} });
  if (elicit) client.setRequestHandler(ElicitRequestSchema, async (req) => ({ action: "accept", content: { allow: elicit(req.params.message) } }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as CallToolResult;
  const close = async () => {
    await client.close();
    await server.close();
    await backend.close();
  };
  return { client, server, backend, registry, call, close };
}

/** the words of a result */
export const textOf = (r: CallToolResult) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");

/** a result's error, parsed */
export const errorOf = (r: CallToolResult) => (r.isError ? (JSON.parse((r.content[0] as { text: string }).text) as { error: { code: string; message: string; hint?: string } }).error : null);
