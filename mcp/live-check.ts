/* A live check of the MCP server with a real model as its client's brain; not part of the test suite.
 *
 *   bun mcp/live-check.ts --mode file [--turns 4] [--out <dir>]
 *   bun mcp/live-check.ts --mode live --base http://127.0.0.1:4173 [--turns 4] [--out <dir>]
 *
 * It starts the built server (node mcp/dist/m3e-canvas-mcp.js, so Node's own path is the one checked) as Claude
 * Desktop or Codex would, over stdio, connects the SDK's client, and hands the server's tools to the provider layer's
 * agent loop (lib/llm `runAgent`) on the OpenAI Responses adapter. In live mode a headless editor tab (Playwright)
 * turns on "Connect to MCP" and types the pairing code first. Every picture a tool returns is saved in the out
 * folder, with the screen at the end. The key comes from OPENAI_API_KEY; where a proxy adds it on its way out, the
 * placeholder stands in. It is never printed. Bun's fetch goes through HTTPS_PROXY; the server, under Node, uses its
 * own proxy-aware fetch for the drawing it does. */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { openAiResponses, runAgent, type ToolDef, type UserPart } from "../lib/llm";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = flag("--mode") === "live" ? "live" : "file";
const turns = Number(flag("--turns") ?? 4);
const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const out = resolve(flag("--out") ?? join(root, "mcp", ".live", mode));
mkdirSync(out, { recursive: true });
const KEY = process.env.OPENAI_API_KEY || "proxy-injected";
const MODEL = process.env.LIVE_MODEL || "gpt-6.1-sol";
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

/* ---------- the server, started as a client starts it ---------- */

const work = mkdtempSync(join(tmpdir(), "m3e-live-"));
const file = join(work, "m3e-canvas Bean There.json");
const base = flag("--base");
if (mode === "live" && !base) throw new Error("--base <the editor's address> is needed in live mode");
const serverArgs = [join(root, "mcp", "dist", "m3e-canvas-mcp.js"), "--lang", "en", ...(mode === "file" ? ["--file", file] : ["--origin", base!])];
const transport = new StdioClientTransport({ command: "node", args: serverArgs, cwd: work, stderr: "inherit", env: { ...process.env, OPENAI_API_KEY: KEY } as Record<string, string> });
const client = new Client({ name: "live-check", title: "Live check", version: "1.0.0" });
await client.connect(transport);
const call = async (name: string, a: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: a })) as CallToolResult;
const textOf = (r: CallToolResult) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");

/* ---------- live: an editor tab that pairs ---------- */

type Pw = { chromium: { launch(): Promise<{ newContext(o: object): Promise<{ newPage(): Promise<PwPage>; addInitScript(f: (a: string) => void, a: string): Promise<void> }>; close(): Promise<void> }> } };
type PwPage = { goto(u: string): Promise<unknown>; waitForSelector(s: string, o?: object): Promise<unknown>; waitForTimeout(ms: number): Promise<void>; locator(s: string): { click(): Promise<void>; fill(v: string): Promise<void>; first(): { click(): Promise<void> } }; screenshot(o: { path: string }): Promise<unknown> };
let browser: Awaited<ReturnType<Pw["chromium"]["launch"]>> | undefined;
let page: PwPage | undefined;
if (mode === "live") {
  const require = createRequire(join(root, "package.json"));
  const pw = [process.env.PLAYWRIGHT_PATH, "playwright", ...(process.env.NODE_PATH ?? "").split(":").filter(Boolean).map((d) => join(d, "playwright"))].reduce<Pw | null>((found, p) => {
    if (found || !p) return found;
    try {
      return require(p) as Pw;
    } catch {
      return null;
    }
  }, null);
  if (!pw) throw new Error("Playwright is needed in live mode");
  browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((l) => localStorage.setItem("m3e:ui", JSON.stringify({ pickedLang: l })), "en");
  page = await ctx.newPage();
  await page.goto(`${base}/`);
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForTimeout(1200);
  await page.locator("[data-mcp-button] button").click();
  await page.locator("[data-mcp-panel] button[aria-pressed]").click();
  await page.waitForSelector('[data-mcp-ask="pair"]', { timeout: 20_000 });
  /* the code is the client's to give: typed in as the author would */
  const { pairingCode } = JSON.parse(textOf(await call("connection_status"))) as { pairingCode: string };
  await page.locator('[data-mcp-ask="pair"] [data-mcp-code-input]').fill(pairingCode);
  await page.screenshot({ path: join(out, "pairing.png") });
  await page.locator('[data-mcp-ask="pair"] button:has-text("Allow editing")').click();
  for (let i = 0; i < 100 && JSON.parse(textOf(await call("connection_status"))).editor !== "paired"; i++) await page.waitForTimeout(200);
  console.log(`[${since()}] the tab is paired`);
}

/* the screen the model works on */
const made = await call("add_screen", { id: "home", name: "Home" });
if (made.isError) throw new Error(textOf(made));

/* ---------- the brain ---------- */

const { tools: mcpTools } = await client.listTools();
const tools: ToolDef[] = mcpTools.map((t) => ({ name: t.name, description: t.description ?? "", parameters: t.inputSchema as Record<string, unknown> }));
console.log(`[${since()}] ${tools.length} tools, ${JSON.stringify(tools).length} bytes of tool definitions`);
const system = [client.getInstructions() ?? "", "", "You reach the document through an MCP server. Be efficient: you have at most " + turns + " turns in all."].join("\n");
const task = [
  "On the screen with id `home`, build a sign-in screen for a coffee-shop app called “Bean There”:",
  "a small coffee-cup logo at the top (draw it with generate_svg, route code, kind icon, 48×48), the app name as a headline, a one-line subtitle,",
  "email and password inputs, a primary “Sign in” button stretched across, and a “Create account” text button under it. Put everything in one column box with padding 24 and gap 16 that fills the screen's width.",
  "Build it with as few calls as you can (apply_ops for the parts), then take one screenshot of `home`, look at it, fix what looks wrong, and end with two sentences on what you made.",
].join(" ");

const adapter = openAiResponses({ baseUrl: "https://api.openai.com/v1", model: MODEL, key: KEY, effort: "medium", summary: "auto" });
let shots = 0;
const result = await runAgent({
  adapter,
  system,
  messages: [{ role: "user", content: task }],
  tools,
  maxSteps: turns,
  maxOutputTokens: 32_000,
  onEvent: (e) => {
    if (e.type === "step") console.log(`[${since()}] turn ${e.step}`);
    if (e.type === "tool_start") console.log(`[${since()}]   → ${e.call.name} ${e.call.argsText.slice(0, 160)}`);
    if (e.type === "tool_end") console.log(`[${since()}]   ← ${e.call.name} ${e.result.isError ? "ERROR " + JSON.stringify(e.result.content[0]).slice(0, 300) : "ok"} (${e.ms} ms)`);
    if (e.type === "done") console.log(`[${since()}]   usage: in ${e.usage.input} (cached ${e.usage.cachedInput}), out ${e.usage.output} (reasoning ${e.usage.reasoning}), stop ${e.stop}`);
    if (e.type === "error") console.log(`[${since()}]   error: ${e.error instanceof Error ? e.error.message : String(e.error)}`);
  },
  execute: async (c) => {
    const r = await call(c.name, c.args ?? {});
    const content: UserPart[] = r.content.flatMap((x): UserPart[] => {
      if (x.type === "text") return [{ type: "text", text: (x as { text: string }).text }];
      if (x.type === "image") {
        const img = x as { data: string; mimeType: string };
        writeFileSync(join(out, `shot-${++shots}.png`), Buffer.from(img.data, "base64"));
        return [{ type: "image", dataUrl: `data:${img.mimeType};base64,${img.data}`, detail: "high" }];
      }
      return [];
    });
    return { content, ...(r.isError ? { isError: true } : {}) };
  },
});

console.log(`\n[${since()}] stop: ${result.stop} after ${result.steps} turn(s)`);
console.log(`usage: input ${result.usage.input} (cached ${result.usage.cachedInput}), output ${result.usage.output} (reasoning ${result.usage.reasoning})`);
console.log(`answer: ${result.text}`);
if (result.error) console.log(`error: ${result.error instanceof Error ? result.error.message : String(result.error)}`);

/* the screen as it ended, through the server, and the editor as the author sees it */
const last = await call("screenshot", { id: "home" });
const img = last.content.find((c) => c.type === "image") as { data: string } | undefined;
if (img) writeFileSync(join(out, "final.png"), Buffer.from(img.data, "base64"));
writeFileSync(join(out, "outline.txt"), textOf(await call("get_outline", { screen: "home" })));
if (page) await page.screenshot({ path: join(out, "editor.png") });
console.log(`pictures in ${out}`);
await client.close();
await browser?.close();
process.exit(0);
