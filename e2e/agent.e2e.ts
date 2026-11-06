/* The in-app agent with a stand-in for the model provider (page.route answers OpenAI's Responses API, so nothing
 * leaves the machine): a request runs tools that change the canvas and one undo takes the whole turn back; stopping a
 * turn while the model is still answering puts the canvas back as it was, with nothing left to redo; a provider's
 * error is said in words; a picture attached to a request goes to the model, which builds a tree of atoms from it;
 * a variable that drives the dark mode switches the preview's colors. */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { check, equal, leftTab, redoButton, reload, savedDoc, settle, Failure, type Page, type Route, type E2ETest } from "./lib";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

const sse = (events: Record<string, unknown>[]) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

/** a model turn that says a sentence and calls one tool */
function toolTurn(callId: string, name: string, args: unknown, text = "") {
  const call = { type: "function_call", id: `fc_${callId}`, call_id: callId, name, arguments: JSON.stringify(args), status: "completed" };
  const message = { type: "message", id: `msg_${callId}`, role: "assistant", status: "completed", content: [{ type: "output_text", text }] };
  const output = text ? [message, call] : [call];
  return sse([
    ...(text ? [{ type: "response.output_text.delta", item_id: message.id, delta: text }] : []),
    { type: "response.output_item.added", output_index: output.length - 1, item: { ...call, arguments: "" } },
    { type: "response.output_item.done", output_index: output.length - 1, item: call },
    { type: "response.completed", response: { output, usage: { input_tokens: 4200, output_tokens: 160, output_tokens_details: { reasoning_tokens: 40 } } } },
  ]);
}

/** a model turn that only answers */
const textTurn = (text: string) =>
  sse([
    { type: "response.output_text.delta", item_id: "msg_end", delta: text },
    { type: "response.completed", response: { output: [{ type: "message", id: "msg_end", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }], usage: { input_tokens: 5200, output_tokens: 30 } } },
  ]);

type Reply = string | { status: number; body: unknown } | "hang";

/** The editor with an OpenAI key, and the provider answering with `replies` in turn (the last one again after
 *  that). Returns what each request asked, and a way to let go of a request left hanging. */
async function withAgent(page: Page, replies: Reply[]) {
  await page.evaluate(() => localStorage.setItem("m3e:ai", JSON.stringify({ provider: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", key: "test-key" })));
  await reload(page);
  const asked: Record<string, unknown>[] = [];
  const hanging: (() => void)[] = [];
  await page.route("https://api.openai.com/v1/responses", async (route: Route, request) => {
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    asked.push(JSON.parse(request.postData() ?? "{}"));
    const r = replies[Math.min(asked.length - 1, replies.length - 1)];
    if (r === "hang") {
      await new Promise<void>((resolve) => hanging.push(resolve));
      await route.abort().catch(() => {});
      return;
    }
    if (typeof r === "string") return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/event-stream" }, body: r });
    return route.fulfill({ status: r.status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(r.body) });
  });
  await leftTab(page, "AI");
  return { asked, release: () => hanging.splice(0).forEach((f) => f()) };
}

async function until(page: Page, ok: () => Promise<boolean>, what: string, ms = 40_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await page.waitForTimeout(250);
  }
  throw new Failure(`timed out waiting for ${what}`);
}

async function ask(page: Page, words: string) {
  const box = page.locator("[data-agent-input]").first();
  await box.fill(words);
  await box.press("Enter");
}

const LOGIN = {
  label: "Login screen",
  ops: [
    { op: "add_screen", args: { id: "login", name: "Login" } },
    { op: "add_part", args: { slug: "box", id: "form", screen: "login", at: { x: 16, y: 160 }, props: { surface: "card", padX: 16, padY: 16, gap: 12 } } },
    { op: "add_part", args: { slug: "text", id: "welcome", into: { container: "form" }, props: { text: "Welcome back", style: "headline" } } },
    { op: "add_part", args: { slug: "button", id: "signin", into: { container: "form" }, props: { label: "Sign in" } } },
  ],
};

/** a small PNG of a chat screen: a dark bar over a light page */
function referencePng(): Buffer {
  const w = 206;
  const h = 446;
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = y < 28 ? [24, 28, 44] : y > 400 ? [236, 232, 250] : [250, 248, 244];
      raw.set(c, y * (w * 3 + 1) + 1 + x * 3);
    }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const CHAT_TREE = {
  label: "Chat screen",
  tree: {
    part: "box",
    id: "chat",
    name: "Chat",
    props: { layout: "column", gap: 12, padX: 16, padY: 16, width: 380, hugWidth: false, align: "stretch" },
    children: [
      { part: "box", id: "chat-head", props: { layout: "row", gap: 8, align: "center", surface: "bar", padX: 12, padY: 10 }, children: [{ part: "icon", props: { name: "menu" } }, { part: "text", id: "chat-title", props: { text: "Chats", style: "title" } }] },
      { part: "box", id: "chat-composer", props: { layout: "row", gap: 8, align: "center", surface: "field", padX: 12, padY: 8 }, children: [{ part: "input", props: { variant: "plain", placeholder: "Message" }, grow: true }, { part: "icon-button", id: "chat-send", props: { icon: "arrow_upward", label: "Send", variant: "filled" } }] },
    ],
  },
};

export const tests: E2ETest[] = [
  {
    name: "the agent builds on the canvas, and one undo takes its whole turn back",
    async run({ page }) {
      const { asked } = await withAgent(page, [toolTurn("call_1", "apply_ops", LOGIN, "I'll add a login screen."), textTurn("Added a login screen."), textTurn("It looks right.")]);
      const before = await savedDoc(page);
      await ask(page, "make a login screen");
      await until(page, async () => (await page.locator('[data-agent-turn="done"]').count()) > 0, "the turn to finish");
      await settle(page);
      const doc = await savedDoc(page);
      equal(doc.frames.map((f) => f.id), [...before.frames.map((f) => f.id), "login"], "a login screen was added");
      check(doc.groups.some((g) => g.items.some((it) => it.id === "signin")), "with its sign-in button");
      /* the model was given the tools and the document's outline, and was shown the screen it changed */
      check(Array.isArray(asked[0].tools) && (asked[0].tools as { name: string }[]).some((t) => t.name === "apply_ops"), "the tools were sent");
      check(JSON.stringify(asked[0].input).includes("<context>"), "the request carried the document's context");
      check(asked.length === 3 && JSON.stringify(asked[2].input).includes("input_image"), "the changed screen was shown to the model");
      check((await page.locator("[data-agent-shot]").count()) > 0, "the screenshot shows in the panel");
      check((await page.locator("[data-agent-usage]").first().textContent())?.includes("↑"), "what the turn spent is shown");
      /* one undo, from the panel, takes the whole turn back */
      await page.locator("[data-agent-undo]").first().click();
      await settle(page);
      const after = await savedDoc(page);
      equal(after.frames.map((f) => f.id), before.frames.map((f) => f.id), "the screens are as they were");
      equal(after.groups.length, before.groups.length, "the parts are as they were");
    },
  },
  {
    name: "the agent stopped mid-turn leaves the canvas as it was",
    async run({ page }) {
      const { release } = await withAgent(page, [toolTurn("call_1", "apply_ops", LOGIN, "I'll add a login screen."), "hang"]);
      const before = await savedDoc(page);
      await ask(page, "make a login screen");
      await until(page, async () => (await savedDoc(page)).frames.some((f) => f.id === "login"), "the first change to land");
      await page.locator("[data-agent-stop]").first().click();
      await until(page, async () => (await page.locator('[data-agent-turn="stopped"]').count()) > 0, "the turn to stop");
      release();
      await settle(page);
      const after = await savedDoc(page);
      equal(after.frames.map((f) => f.id), before.frames.map((f) => f.id), "the screen it added is gone");
      equal(after.groups.length, before.groups.length, "and its parts");
      check((await page.locator('[data-agent-turn="stopped"]').first().textContent())?.includes("as it was"), "the panel says the canvas is as it was");
    },
  },
  {
    name: "a stopped turn of the agent leaves nothing to redo",
    async run({ page }) {
      const { release } = await withAgent(page, [toolTurn("call_1", "apply_ops", LOGIN, "I'll add a login screen."), "hang"]);
      const before = await savedDoc(page);
      await ask(page, "make a login screen");
      await until(page, async () => (await savedDoc(page)).frames.some((f) => f.id === "login"), "the first change to land");
      await page.locator("[data-agent-stop]").first().click();
      await until(page, async () => (await page.locator('[data-agent-turn="stopped"]').count()) > 0, "the turn to stop");
      release();
      await settle(page);
      check(!(await redoButton(page).isEnabled()), "redo has nothing to bring back");
      await page.locator("[data-node]").first().click();
      await page.keyboard.press("Control+Shift+z");
      await settle(page);
      equal((await savedDoc(page)).frames.map((f) => f.id), before.frames.map((f) => f.id), "the stopped turn's screen stays gone after a redo");
    },
  },
  {
    name: "a picture attached to the agent is sent with the request, and the tree it builds is one undo step",
    async run({ page, out }) {
      const { asked } = await withAgent(page, [toolTurn("call_1", "add_tree", CHAT_TREE, "I'll rebuild the chat screen from atoms."), textTurn("Rebuilt the chat screen."), textTurn("It matches.")]);
      const before = await savedDoc(page);
      const file = join(out, "reference-chat.png");
      writeFileSync(file, referencePng());
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator("[data-agent-attach]").first().click()]);
      await chooser.setFiles(file);
      await until(page, async () => (await page.locator("[data-agent-pictures] img").count()) > 0, "the picture to be attached");
      await ask(page, "copy this chat screen");
      await until(page, async () => (await page.locator('[data-agent-turn="done"]').count()) > 0, "the turn to finish");
      await settle(page);
      const first = JSON.stringify(asked[0].input);
      check(first.includes("input_image") && first.includes("ref1"), "the picture went to the model with the request, named ref1");
      check((asked[0].tools as { name: string }[]).some((t) => t.name === "compare_to_reference"), "the tools that measure a reference were given");
      check((await page.locator("[data-agent-attached] img").count()) > 0, "the request shows the picture it carried");
      check((await page.locator('[data-agent-step][data-tool="add_tree"]').first().textContent())?.includes("Compose parts"), "the step reads as what it does");
      const doc = await savedDoc(page);
      const ids = new Set(doc.groups.flatMap((g) => g.items.map((it) => it.id)));
      for (const id of ["chat", "chat-head", "chat-title", "chat-composer", "chat-send"]) check(ids.has(id), `the tree holds ${id}`);
      const composer = doc.groups.find((g) => g.items[0].id === "chat-composer")!;
      check(doc.groups.find((g) => g.items[0].id === "chat-send")?.inFlow === composer.id, "the send button is inside the composer");
      await page.locator("[data-agent-undo]").first().click();
      await settle(page);
      const after = await savedDoc(page);
      equal(after.groups.length, before.groups.length, "one undo takes the whole tree back");
    },
  },
  {
    name: "a variable that drives the dark mode switches the preview's colors",
    async run({ page }) {
      const start = await savedDoc(page);
      const screen = start.frames[0].id;
      const TOGGLE = {
        label: "Dark mode toggle",
        ops: [
          { op: "add_var", args: { id: "dark", name: "Dark mode", type: "bool", value: false, drives: "dark" } },
          { op: "add_part", args: { slug: "switch", id: "dark-switch", screen, at: { x: 24, y: 640 }, props: { label: "Dark mode" } } },
          { op: "bind_prop", args: { id: "dark-switch", prop: "checked", var: "dark" } },
          { op: "add_part", args: { slug: "button", id: "dark-button", screen, at: { x: 24, y: 720 }, props: { label: "Toggle theme" } } },
          { op: "set_action", args: { id: "dark-button", action: { effects: [{ do: "toggleVar", var: "dark" }] } } },
        ],
      };
      await withAgent(page, [toolTurn("call_1", "apply_ops", TOGGLE, "I'll add a dark mode toggle."), textTurn("Added a dark mode toggle."), textTurn("Done.")]);
      await ask(page, "add a dark mode toggle");
      await until(page, async () => (await page.locator('[data-agent-turn="done"]').count()) > 0, "the turn to finish");
      await settle(page);
      const doc = await savedDoc(page);
      const button = doc.groups.find((g) => g.items.some((it) => it.id === "dark-button"));
      check(button, "the toggle is on the canvas");
      /* the chat box has the keyboard: let it go, then open the preview */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-dark]", { timeout: 10_000 });
      await settle(page, 1200);
      const mode = async () => (await page.evaluate(() => document.querySelector("[data-preview-dark]")?.getAttribute("data-preview-dark"))) ?? "";
      equal(await mode(), "off", "the preview opens light");
      await page.locator(`[data-preview-group="${button!.id}"] button`).first().click();
      await settle(page, 600);
      equal(await mode(), "on", "a tap on the toggle turns the preview dark");
      await page.locator("[data-preview-dark]").first().click();
      await settle(page, 600);
      equal(await mode(), "off", "the preview's own switch turns the variable back too");
    },
  },
  {
    name: "the agent says what went wrong with the provider",
    async run({ page }) {
      await withAgent(page, [{ status: 401, body: { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } } }]);
      const before = await savedDoc(page);
      await ask(page, "make a login screen");
      await until(page, async () => (await page.locator("[data-agent-error]").count()) > 0, "the error");
      const words = await page.locator("[data-agent-error]").first().textContent();
      check(words?.includes("refused the key"), `the error is said in words (${words})`);
      check(await page.locator("[data-agent-retry]").first().isVisible(), "the turn can be tried again");
      equal((await savedDoc(page)).frames.length, before.frames.length, "nothing changed");
    },
  },
  {
    name: "Ctrl+K asks the agent about the selection",
    async run({ page }) {
      const { asked } = await withAgent(page, [textTurn("This is the home screen.")]);
      await leftTab(page, "Parts");
      await page.locator('[data-node="seed3"]').first().click();
      await settle(page, 400);
      await page.keyboard.press("Control+k");
      await page.waitForSelector("[data-prompt-bar]", { timeout: 5000 });
      await page.locator("[data-prompt-input]").first().fill("what is this?");
      await page.locator("[data-prompt-input]").first().press("Enter");
      await until(page, async () => (await page.locator('[data-agent-turn="done"]').count()) > 0, "the answer");
      check(JSON.stringify(asked[0].input).includes("Selected: seed3"), "the model was told what is selected");
      check(await page.locator("[data-agent-panel]").first().isVisible(), "the AI tab opened to show the turn");
    },
  },
];
