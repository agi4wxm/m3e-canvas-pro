/* The MCP server and a real editor tab: the server started as a client starts it (stdio), the author turning on
 * "Connect to MCP" and approving the code the server gave, a tool call changing the canvas live, a screenshot drawn by
 * the tab, one undo taking the call back, and a destructive call the author declines; a client the author told the
 * editor to remember comes back after its server restarts without asking, until it is forgotten. */

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { check, equal, itemsOf, redo, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* remembered pairings go to a folder of the test's own, never the user's config folder */
const trustDir = mkdtempSync(join(tmpdir(), "m3e-mcp-trust-"));

async function startServer(base: string, more: string[] = [], configDir = trustDir) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, "mcp", "src", "cli.ts"), "--origin", base, "--quiet", "--confirm-timeout", "20", ...more], cwd: root, stderr: "pipe", env: { ...process.env, OPENAI_API_KEY: "", M3E_MCP_CONFIG_DIR: configDir } as Record<string, string> });
  const client = new Client({ name: "e2e-client", version: "1.0.0" });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { client, call };
}

const text = (r: CallToolResult) => r.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");

async function waitFor(what: string, ok: () => Promise<boolean>, ms = 20_000) {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** the size of a PNG, from its header */
const pngSize = (b64: string) => {
  const b = Buffer.from(b64, "base64");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

async function pair(page: Page, call: (name: string) => Promise<CallToolResult>, remember = false) {
  const status = JSON.parse(text(await call("connection_status"))) as { pairingCode: string; editor: string };
  check(status.editor === "not connected", "no editor yet");
  await page.locator('[data-mcp-button] button[aria-label="Connect to MCP"]').click();
  await settle(page, 300);
  await page.locator('[data-mcp-panel] button[aria-label="Connect to MCP"]').click();
  await page.waitForSelector('[data-mcp-ask="pair"]', { timeout: 20_000 });
  equal(await page.locator("[data-mcp-code]").first().textContent(), status.pairingCode, "the code the editor shows is the server's");
  check(((await page.locator('[data-mcp-ask="pair"]').first().textContent()) ?? "").includes("e2e-client"), "the ask names the client");
  if (remember) await page.locator("[data-mcp-remember] input").first().click();
  await page.locator('[data-mcp-ask="pair"] button').filter({ hasText: "Allow editing" }).first().click();
  await waitFor("paired", async () => JSON.parse(text(await call("connection_status"))).editor === "paired");
}

export const tests: E2ETest[] = [
  {
    name: "an MCP client pairs with the tab, changes the canvas live, and one undo takes it back",
    async run({ page, base }) {
      const { client, call } = await startServer(base);
      try {
        await pair(page, call);
        await waitFor("the panel shows the connection", async () => (await page.locator('[data-mcp-conn="paired"]').count()) > 0);

        const outline = text(await call("get_outline", { depth: 0 }));
        check(outline.includes('screen seedF1'), `the outline is the tab's document: ${outline.slice(0, 200)}`);

        const added = await call("apply_ops", { ops: [{ op: "add_part", args: { slug: "button", id: "mcpbtn", screen: "seedF1", at: { x: 40, y: 560 }, props: { label: "From MCP" } } }, { op: "set_title", args: { title: "MCP was here" } }] });
        check(!added.isError, `the batch ran: ${text(added)}`);
        await page.waitForSelector('[data-node="mcpbtn"]', { timeout: 10_000 });
        let doc = await savedDoc(page);
        check(itemsOf(doc).some((it) => it.id === "mcpbtn" && it.props?.label === "From MCP"), "the button saved in the tab");
        equal(doc.title, "MCP was here", "the title saved in the tab");

        const shot = await call("screenshot", { id: "seedF1" });
        const img = shot.content.find((c) => c.type === "image") as { data: string; mimeType: string } | undefined;
        check(img && img.mimeType === "image/png", `a picture came back: ${text(shot).slice(0, 200)}`);
        equal(pngSize(img.data), { w: 412, h: 892 }, "the screenshot is the screen at 1:1");

        /* the batch is one step: one undo takes both changes back */
        await undo(page);
        doc = await savedDoc(page);
        check(!itemsOf(doc).some((it) => it.id === "mcpbtn"), "the button undone");
        check(doc.title !== "MCP was here", "the title undone in the same step");
        check((await page.locator('[data-node="mcpbtn"]').count()) === 0, "the button gone from the canvas");

        /* a destructive call waits for the author, who declines it */
        const target = itemsOf(doc)[0].id;
        const pending = call("remove_nodes", { ids: [target] });
        await page.waitForSelector('[data-mcp-ask="confirm"]', { timeout: 10_000 });
        await page.locator('[data-mcp-ask="confirm"] button').filter({ hasText: "Decline" }).first().click();
        const declined = await pending;
        check(declined.isError && text(declined).includes("declined"), `the call was refused: ${text(declined)}`);
        doc = await savedDoc(page);
        check(itemsOf(doc).some((it) => it.id === target), "the part is still there");

        /* the activity log lists the calls (answering the asks left the panel open) */
        if (!(await page.locator("[data-mcp-panel]").count())) await page.locator('[data-mcp-button] button[aria-label="Connect to MCP"]').click();
        await settle(page, 300);
        check((await page.locator('[data-mcp-log="apply_ops"]').count()) > 0, "the batch is in the activity log");
      } finally {
        await client.close();
      }
    },
  },
  {
    name: "a client the author told the editor to remember pairs again after its server restarts, until it is forgotten",
    async run({ page, base }) {
      const dir = mkdtempSync(join(tmpdir(), "m3e-mcp-trust-"));
      const first = await startServer(base, [], dir);
      try {
        await pair(page, first.call, true);
        await waitFor("the server kept the pairing", async () => existsSync(join(dir, "trusted-editors.json")) && JSON.parse(readFileSync(join(dir, "trusted-editors.json"), "utf8")).editors.length === 1);
      } finally {
        await first.client.close();
      }
      /* the client starts the server again: a new process with a new code, approved by the tab by itself */
      const second = await startServer(base, [], dir);
      try {
        await waitFor("paired again without asking", async () => JSON.parse(text(await second.call("connection_status"))).editor === "paired", 30_000);
        equal(await page.locator('[data-mcp-ask="pair"]').count(), 0, "nothing was asked");
        check(!(await second.call("list_screens")).isError, "calls reach the tab");
        /* forgotten from the panel: the server lets its side go too */
        if (!(await page.locator("[data-mcp-panel]").count())) await page.locator('[data-mcp-button] button[aria-label="Connect to MCP"]').click();
        await page.waitForSelector("[data-mcp-remembered]", { timeout: 10_000 });
        await page.locator("[data-mcp-remembered] button").filter({ hasText: "Forget" }).first().click();
        await waitFor("the server forgot it", async () => JSON.parse(readFileSync(join(dir, "trusted-editors.json"), "utf8")).editors.length === 0);
        equal(await page.locator("[data-mcp-remembered]").count(), 0, "the panel lists it no more");
      } finally {
        await second.client.close();
      }
      /* the next server is asked about */
      const third = await startServer(base, [], dir);
      try {
        await page.waitForSelector('[data-mcp-ask="pair"]', { timeout: 30_000 });
      } finally {
        await third.client.close();
      }
    },
  },
  {
    name: "a drawing kept as a document icon draws wherever an icon name is taken, on the canvas and in the preview",
    async run({ page, base, out }) {
      const { client, call } = await startServer(base);
      try {
        await pair(page, call);
        const LEAF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 20C4 9 11 4 20 4c0 9-5 16-16 16z"/><path d="M4 20l9-9" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
        const made = await call("apply_ops", {
          ops: [
            { op: "set_icon", args: { id: "leaf", svg: LEAF } },
            { op: "add_part", args: { slug: "icon", id: "docicon", screen: "seedF1", at: { x: 40, y: 520 }, props: { name: "svg:leaf", size: 48 } } },
            { op: "add_part", args: { slug: "button", id: "docbtn", screen: "seedF1", at: { x: 120, y: 520 }, props: { label: "Plant", icon: "svg:leaf" } } },
            { op: "add_part", args: { slug: "navigation-bar", id: "docnav", screen: "seedF1", props: { items: [{ label: "Garden", icon: "svg:leaf" }, { label: "Home", icon: "home" }, { label: "Me", icon: "person" }] } } },
          ],
        });
        check(!made.isError, `the batch ran: ${text(made)}`);
        const drawn = async (id: string) => page.evaluate((n) => [...document.querySelectorAll(`[data-node="${n}"] svg path`)].some((p) => (p.getAttribute("d") ?? "").startsWith("M4 20C4 9")), id);
        await waitFor("the icon atom draws the leaf", () => drawn("docicon"), 10_000);
        check(await drawn("docbtn"), "the button draws the leaf");
        check(await drawn("docnav"), "the nav bar's first tab draws the leaf");
        const doc = await savedDoc(page);
        check(typeof (doc as { icons?: Record<string, string> }).icons?.leaf === "string", "the icon is saved with the document");
        await page.screenshot({ path: join(out, "doc-icons-canvas.png") });
        /* one undo takes the batch back, the icon with it; redo brings them back */
        await undo(page);
        check(!((await savedDoc(page)) as { icons?: unknown }).icons, "the icon undone with the batch");
        await redo(page);
        await waitFor("the leaf drawn again", () => drawn("docicon"), 10_000);
        /* the preview draws them too */
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press("p");
        await page.waitForSelector("[data-preview-dark]", { timeout: 10_000 });
        await settle(page, 1200);
        const inPreview = await page.evaluate(() => [...document.querySelectorAll("[data-preview-group] svg path")].filter((p) => (p.getAttribute("d") ?? "").startsWith("M4 20C4 9")).length);
        check(inPreview >= 3, `the preview draws the leaf three times (${inPreview})`);
        await page.screenshot({ path: join(out, "doc-icons-preview.png") });
      } finally {
        await client.close();
      }
    },
  },
  {
    name: "the render page the MCP server draws with loads none of the editor",
    async run({ page, base }) {
      const scripts: string[] = [];
      page.on("request", (r) => {
        if (/\.(?:js|tsx?)(?:\?|$)/.test(r.url())) scripts.push(r.url());
      });
      await page.goto(`${base}/render`);
      await page.waitForSelector('html[data-m3e-render="ready"]', { state: "attached", timeout: 30_000 });
      await settle(page, 800);
      const editor = scripts.filter((u) => /\/(?:Editor|AgentPanel|Inspector)[-.]/.test(u));
      check(editor.length === 0, `the render page loaded the editor: ${editor.join(", ")}`);
      check(scripts.length > 0, "the render page loaded its own code");
    },
  },
  {
    name: "an MCP client works on a project file headless, its screenshots drawn by the render page",
    async run({ base }) {
      const file = join(mkdtempSync(join(tmpdir(), "m3e-mcp-e2e-")), "m3e-canvas Shop.json");
      /* the app build the runner made, or the editor it is pointed at */
      const app = existsSync(join(root, "dist", "index.html")) ? join(root, "dist") : base;
      const { client, call } = await startServer(base, ["--file", file, "--app", app, "--lang", "en"]);
      try {
        const built = await call("apply_ops", {
          ops: [
            { op: "set_title", args: { title: "Shop" } },
            { op: "add_screen", args: { id: "home", name: "Home" } },
            { op: "add_kit", args: { slug: "search-bar", screen: "home" } },
            { op: "add_part", args: { slug: "box", id: "card", screen: "home", at: { x: 16, y: 96 }, props: { surface: "card", padX: 16, padY: 16 } } },
            { op: "add_part", args: { slug: "text", id: "title", into: { container: "card" }, props: { text: "Fresh fruit", style: "title" } } },
            { op: "add_part", args: { slug: "button", id: "buy", into: { container: "card" }, props: { label: "Buy now" } } },
          ],
        });
        check(!built.isError, `the batch ran: ${text(built)}`);
        const saved = JSON.parse(readFileSync(file, "utf8")) as { format: string; document: { frames: { id: string }[]; groups: { items: { id: string }[] }[] } };
        equal(saved.format, "m3e-project", "the file is a project");
        check(saved.document.groups.some((g) => g.items.some((it) => it.id === "buy")), "the button is in the file");

        const shot = await call("screenshot", { id: "home" });
        const img = shot.content.find((c) => c.type === "image") as { data: string } | undefined;
        check(img, `a picture came back: ${text(shot).slice(0, 300)}`);
        equal(pngSize(img.data), { w: 412, h: 892 }, "the screen at 1:1");
        check(Buffer.from(img.data, "base64").length > 4000, "the picture has something drawn in it");
        const part = await call("screenshot", { id: "card", scale: 2 });
        const pimg = part.content.find((c) => c.type === "image") as { data: string } | undefined;
        check(pimg && pngSize(pimg.data).w > 300, `the part cut out at twice the size: ${text(part).slice(0, 200)}`);
      } finally {
        await client.close();
      }
    },
  },
];
