/* The in-app agent with a stand-in for the model provider (page.route answers OpenAI's Responses API, so nothing
 * leaves the machine): a request runs tools that change the canvas and one undo takes the whole turn back; stopping a
 * turn while the model is still answering puts the canvas back as it was; a provider's error is said in words. */

import { check, equal, leftTab, reload, savedDoc, settle, Failure, type Page, type Route, type E2ETest } from "./lib";

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
