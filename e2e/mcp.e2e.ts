/* The MCP server and a real editor tab: the server started as a client starts it (stdio), the author turning on
 * "Connect to MCP" and approving the code the server gave, a tool call changing the canvas live, a screenshot drawn by
 * the tab, one undo taking the call back, and a destructive call the author declines. */

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { check, equal, itemsOf, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

async function startServer(base: string) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, "mcp", "src", "cli.ts"), "--origin", base, "--quiet", "--confirm-timeout", "20"], cwd: root, stderr: "pipe", env: { ...process.env, OPENAI_API_KEY: "" } as Record<string, string> });
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

async function pair(page: Page, call: (name: string) => Promise<CallToolResult>) {
  const status = JSON.parse(text(await call("connection_status"))) as { pairingCode: string; editor: string };
  check(status.editor === "not connected", "no editor yet");
  await page.locator('[data-mcp-button] button[aria-label="Connect to MCP"]').click();
  await settle(page, 300);
  await page.locator('[data-mcp-panel] button[aria-label="Connect to MCP"]').click();
  await page.waitForSelector('[data-mcp-ask="pair"]', { timeout: 20_000 });
  equal(await page.locator("[data-mcp-code]").first().textContent(), status.pairingCode, "the code the editor shows is the server's");
  check(((await page.locator('[data-mcp-ask="pair"]').first().textContent()) ?? "").includes("e2e-client"), "the ask names the client");
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
];
