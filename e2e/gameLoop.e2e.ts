/* The preview answered by a local game loop (docs/玩法契约.md “本地 game-loop”), in a real editor and preview, against
 * the stand-in game loop of the tests (lib/gameLoop/fixtures/serve.ts, a Bun HTTP and WebSocket server on the loopback):
 * the preview bar switched from the mock library to the game loop's address (one with a secret in it refused), the
 * choice kept by the project; the summon's and the check-in's templates answered by the game loop, each refusal (not
 * enough gems, the summon over, checked in already) on its own notice; a realtime channel and a world view played by
 * it; what is wrong said in the bar (another version, CORS, nothing there); and the mocks back in one click.
 * Screenshots in e2e/.out (game-loop-*.png). */

import { join } from "node:path";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc as docOf, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc as FullDoc } from "../lib/tokens";
import { serveStandIn, type ServedStandIn } from "../lib/gameLoop/fixtures/serve";
import { check, equal, savedDoc, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

/** the summon and the check-in from their templates, and a screen with the game loop's ticker and its world */
function gameDoc(): FullDoc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("g"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the game", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Game loop" });
    tx.run(ops.addTemplate, { slug: "gacha-pull" });
    tx.run(ops.addTemplate, { slug: "daily-check-in" });
    tx.run(ops.addScreen, { id: "live", name: "Live" });
    tx.run(ops.addChannel, {
      id: "ticker",
      address: "/ticker",
      messages: [{ name: "tick", payload: { type: "object", properties: { n: { type: "number" } }, required: ["n"] } }],
      operations: [{ id: "onTick", action: "send" }],
    } as never);
    tx.run(ops.addPart, { slug: "text", id: "tick", screen: "live", at: { x: 16, y: 40 }, props: { text: "Tick {{data.ticker.value.n}}" } });
    tx.run(ops.setSubscription, { screen: "live", name: "ticker", channel: "ticker" } as never);
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: "live", at: { x: 16, y: 100 }, props: { label: "Arena", inputs: "move: vec2, attack: bool" } });
    tx.run(ops.setAction, { id: "world", slot: "on:hit", action: { to: "none", effects: [{ do: "snackbar", message: "Hit {{event.id}}" }] } as never });
    tx.run(ops.addPart, { slug: "skill-button", id: "attack", screen: "live", at: { x: 280, y: 400 }, props: { label: "Attack" } });
    tx.run(ops.setAction, { id: "attack", slot: "action", action: { to: "none", effects: [{ do: "press", part: "world", action: "attack" }, { do: "release", part: "world", action: "attack" }] } as never });
  });
  return docOf(store.get());
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const words = async (page: Page) => (await onShow(page).textContent()) ?? "";
const snack = async (page: Page) => ((await page.locator("[data-preview-snackbar]").count()) ? ((await page.locator("[data-preview-snackbar]").first().textContent()) ?? "") : "");
async function until(what: string, ok: () => Promise<boolean>, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never: ${what}`);
}
const tapPart = (page: Page, text: RegExp) => onShow(page).locator("[data-live-part]").filter({ hasText: text }).first().click();
const status = (page: Page) => page.locator("[data-preview-backend]").first().getAttribute("data-preview-backend-status");

/** opens the preview's screen of this name from its picker */
async function show(page: Page, name: string) {
  await page.locator('button[title="Choose screen"][aria-expanded]').last().click();
  await page.locator('[role="menuitemradio"]').filter({ hasText: name }).first().click();
  await settle(page, 500);
}

/** types an address into the bar's game loop field and connects */
async function connect(page: Page, url: string) {
  if (!(await page.locator("[data-preview-game-loop-url]").count())) await page.locator("[data-preview-backend]").first().click();
  await page.locator("[data-preview-game-loop-url]").first().fill(url);
  await page.locator("[data-preview-game-loop-connect]").first().click();
  await settle(page, 200);
}

type Saved = { external?: { gameLoop?: { url: string; preview?: boolean } } };
const keptLoop = async (page: Page) => ((await savedDoc(page)) as unknown as Saved).external?.gameLoop;

export const tests: E2ETest[] = [
  {
    name: "game loop: the summon and the check-in answered by a local game loop, each refusal on its own notice; its ticker and world; its errors in the bar",
    async run({ page, base, out }) {
      let loop: ServedStandIn | undefined;
      let gone: ServedStandIn | undefined;
      try {
        loop = serveStandIn({ tickMs: 150 });
        const s = loop.standIn;
        await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(gameDoc()))}`, { waitUntil: "load" });
        await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
        await page.waitForSelector("[data-screen]", { timeout: 30_000 });
        await settle(page, 1500);
        await page.keyboard.press("Escape");
        await page.keyboard.press("p");
        await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
        equal(await page.locator("[data-preview-backend]").first().getAttribute("data-preview-backend"), "mocks", "the mock library answers until the bar says otherwise");

        /* an address with a secret in it is refused: the document keeps the address, never a credential */
        await connect(page, `${loop.url}/?token=abc`);
        equal(await page.locator("[data-preview-game-loop-url-problem]").first().getAttribute("data-preview-game-loop-url-problem"), "query", "an address with a query is refused");
        check(!(await keptLoop(page)), "nothing is kept of it");

        await connect(page, loop.url);
        await until("the game loop answers", async () => (await status(page)) === "ok");
        await until("the project keeps the choice", async () => JSON.stringify(await keptLoop(page)) === JSON.stringify({ url: loop!.url, preview: true }));
        check(!(await page.locator("[data-preview-scenario-button]").count()), "the mocks' scenarios are set aside while the game loop answers");

        /* the summon: ten pulls the game loop draws, then not enough gems, then the summon over */
        await show(page, "Summon");
        await tapPart(page, /^10 pulls/);
        await until("the game loop's prize is shown", async () => (await snack(page)) === "Stand-in Knight");
        check(s.calls.some((c) => c.path === "/game/commands/pull" && JSON.stringify(c.body) === '{"count":10}'), `the pull went to the game loop: ${JSON.stringify(s.calls.slice(-3))}`);
        await tapPart(page, /^1 pull/);
        await until("not enough gems is shown", async () => (await words(page)).includes("Not enough gems"));
        await page.screenshot({ path: join(out, "game-loop-gems.png") });
        s.state.gems = 1000;
        s.state.poolOpen = false;
        await tapPart(page, /^1 pull/);
        await until("the summon over is shown", async () => (await words(page)).includes("This summon has ended"));
        check(!(await words(page)).includes("Not enough gems"), "each refusal on its own notice: the one before gives way");

        /* the check-in: the reward the game loop gives, then checked in already */
        await show(page, "Daily check-in");
        await tapPart(page, /^Check in today/);
        await until("the reward is shown", async () => (await snack(page)) === "Stand-in gems ×50");
        await tapPart(page, /^Check in today/);
        await until("checked in already is shown", async () => (await words(page)).includes("Checked in already today"));
        await page.screenshot({ path: join(out, "game-loop-cooldown.png") });

        /* the ticker on the game loop's realtime channel, and the world it plays */
        await show(page, "Live");
        await until("the ticker ticks", async () => Number(/Tick (\d+)/.exec(await words(page))?.[1] ?? 0) >= 2);
        const world = onShow(page).locator('[data-part="world"] [data-slot="world-view"]').first();
        await until("the world's snapshot is shown", async () => (await world.locator('[data-entity="hero"]').count()) > 0 && (await world.locator('[data-entity="coin1"]').count()) === 0);
        await onShow(page).locator('[data-part="attack"] button').first().click();
        await until("the world's event runs the design's action", async () => (await snack(page)) === "Hit slime");
        check(s.inputs.includes("attack true"), `the game loop heard the press: ${JSON.stringify(s.inputs)}`);
        await until("the world's score is the game loop's", async () => Number(await world.getAttribute("data-score")) >= 10);
        await page.screenshot({ path: join(out, "game-loop-live.png") });

        /* what is wrong, said in the bar: another version, CORS, nothing there */
        s.state.contractVersion = "2.0.0";
        await page.locator("[data-preview-backend]").first().click();
        await page.locator("[data-preview-game-loop-retry]").first().click();
        await until("another version is said", async () => (await status(page)) === "version");
        const said = (await page.locator("[data-preview-game-loop-problem]").first().textContent()) ?? "";
        check(said.includes("2.0.0") && said.includes("1.0.0"), `the bar says both versions: ${said}`);
        await page.screenshot({ path: join(out, "game-loop-version.png") });
        s.state.contractVersion = "1.0.0";
        s.state.cors = false;
        await page.locator("[data-preview-game-loop-retry]").first().click();
        await until("CORS is said", async () => (await status(page)) === "cors");
        s.state.cors = true;
        gone = serveStandIn();
        const nowhere = gone.url;
        gone.stop();
        gone = undefined;
        await connect(page, nowhere);
        await until("nothing there is said", async () => (await status(page)) === "unreachable");
        check(((await page.locator("[data-preview-game-loop-problem]").first().textContent()) ?? "").includes(nowhere), "the bar names the address nothing answers at");
        await page.screenshot({ path: join(out, "game-loop-unreachable.png") });

        /* the mocks again, in one click; the address stays for next time */
        await page.locator("[data-preview-use-mocks]").first().click();
        await settle(page, 300);
        equal(await page.locator("[data-preview-backend]").first().getAttribute("data-preview-backend"), "mocks", "the mocks answer again");
        check(await page.locator("[data-preview-scenario-button]").count(), "the mocks' scenarios are back");
        await until("the project keeps the address, not the choice", async () => JSON.stringify(await keptLoop(page)) === JSON.stringify({ url: nowhere }));
      } finally {
        gone?.stop();
        loop?.stop();
      }
    },
  },
];
