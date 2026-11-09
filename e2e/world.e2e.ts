/* A world view hosting M3E's example engine in the preview (docs/组件规范.md “世界视口”, docs/交互规则.md “输入动作”),
 * in a real editor and preview: the design wires a joystick's pushes to the world as its `move` input and a skill to
 * press and let go of `attack`; the stand-in lists the inputs it hears; the example engine (the prototype's demo, as
 * nothing binds the world's state) moves the hero, hits the slime near it, picks up the coins, and the design's actions
 * run on the world's events: a snackbar for a hit and for each coin, the round over opening another screen. Then a mock
 * world with no engine (docs/模拟库.md “世界脚本”): the bar's world script picks the library's battle, whose twenty
 * slimes lose hit points and go as it plays, its hits run the design's action, the mocks' clock stopped stops it, and
 * its round over opens another screen. Screenshots of failures go to e2e/.out. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, equal, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

const SCREEN = "arena";

/** the document, wired through operations only, as the AI and MCP would wire it */
function worldDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the world", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "World" });
    tx.run(ops.addScreen, { id: SCREEN, name: "Arena" });
    tx.run(ops.addScreen, { id: "won", name: "Won" });
    const say = (message: string) => ({ to: "none", effects: [{ do: "snackbar", message }] }) as never;
    const entities = { columns: ["Id", "Kind", "X", "Y", "Label"], rows: [["hero", "player", "20", "40", "Hero"], ["coin1", "coin", "40", "40", ""], ["coin2", "coin", "60", "40", ""], ["slime", "enemy", "25", "52", "Slime"]] };
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: SCREEN, at: { x: 26, y: 80 }, props: { label: "Arena", entities, inputs: "move, attack" } });
    tx.run(ops.setAction, { id: "world", slot: "on:hit", action: say("Hit {{event.id}}") });
    tx.run(ops.setAction, { id: "world", slot: "on:collected", action: say("Got {{event.id}}") });
    tx.run(ops.setAction, { id: "world", slot: "on:ended", action: { to: "won" } as never });
    tx.run(ops.addPart, { slug: "joystick", id: "pad", screen: SCREEN, at: { x: 32, y: 380 }, props: { ariaLabel: "Move" } });
    tx.run(ops.setAction, { id: "pad", slot: "on:move", action: { to: "none", effects: [{ do: "move", part: "world", vector: "event" }] } as never });
    tx.run(ops.addPart, { slug: "skill-button", id: "attack", screen: SCREEN, at: { x: 300, y: 400 }, props: { label: "Attack" } });
    tx.run(ops.setAction, { id: "attack", slot: "action", action: { to: "none", effects: [{ do: "press", part: "world", action: "attack" }, { do: "release", part: "world", action: "attack" }] } as never });
    tx.run(ops.addPart, { slug: "text", id: "won-text", screen: "won", at: { x: 16, y: 120 }, props: { text: "You won" } });
  });
  return savedDoc(store.get());
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const part = (page: Page, id: string) => onShow(page).locator(`[data-part="${id}"]`).first();
const snack = async (page: Page) => ((await page.locator("[data-preview-snackbar]").count()) ? ((await page.locator("[data-preview-snackbar]").first().textContent()) ?? "") : null);
async function until(what: string, ok: () => Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never: ${what}`);
}
const heard = async (page: Page): Promise<string[]> => {
  const lines = part(page, "world").locator("[data-world-input]");
  const out: string[] = [];
  for (let i = 0; i < (await lines.count()); i++) out.push(((await lines.nth(i).textContent()) ?? "").trim());
  return out;
};
const heroX = async (page: Page) => Number(await part(page, "world").locator('[data-entity="hero"]').first().getAttribute("data-x"));
const view = (page: Page) => part(page, "world").locator('[data-slot="world-view"]').first();
const worldTime = async (page: Page) => Number(await view(page).getAttribute("data-world-time"));

/** a battle arena with no engine: the design's actions on the world's events, the mock library's battle to play */
function battleDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the battle", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Battle" });
    tx.run(ops.addScreen, { id: SCREEN, name: "Arena" });
    tx.run(ops.addScreen, { id: "won", name: "Won" });
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: SCREEN, at: { x: 26, y: 80 }, props: { label: "Arena", width: 360, height: 300 } });
    tx.run(ops.setAction, { id: "world", slot: "on:hit", action: { to: "none", effects: [{ do: "snackbar", message: "Hit {{event.id}}" }] } as never });
    tx.run(ops.setAction, { id: "world", slot: "on:ended", action: { to: "won" } as never });
    tx.run(ops.addPart, { slug: "text", id: "won-text", screen: "won", at: { x: 16, y: 120 }, props: { text: "Victory screen" } });
    tx.run(ops.setMockWorld, { from: "battle" });
  });
  return savedDoc(store.get());
}

async function openPreview(page: Page, base: string, doc: Doc) {
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector(`[data-screen="${SCREEN}"]`, { timeout: 30_000 });
  await settle(page, 1500);
  await page.keyboard.press("Escape");
  await settle(page, 200);
  await selectScreen(page, SCREEN);
  await page.keyboard.press("p");
  await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
}

export const tests: E2ETest[] = [
  {
    name: "world view: input actions reach the example engine, which moves the hero, and the design's actions run on its events",
    async run({ page, base }) {
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(worldDoc()))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector(`[data-screen="${SCREEN}"]`, { timeout: 30_000 });
      await settle(page, 1500);
      await page.keyboard.press("Escape");
      await settle(page, 200);
      await selectScreen(page, SCREEN);
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
      await until("the world view is drawn", async () => (await part(page, "world").locator('[data-slot="world-view"]').count()) > 0);
      equal(await heroX(page), 20, "the hero starts where the design puts it");

      /* the skill presses and lets go of attack: the stand-in lists both, and the engine hits the slime near the hero */
      await part(page, "attack").locator("button").first().click();
      await until("the slime is hit", async () => (await snack(page)) === "Hit slime");
      const pressed = await heard(page);
      check(pressed.includes("attack ↓") && pressed.includes("attack ↑"), `the world heard the press and the let-go: ${JSON.stringify(pressed)}`);

      /* the pad pushed right (an arrow key held on it, as a finger would hold it): the world hears the direction and
         the hero moves, picking up the coins on its way */
      await part(page, "pad").locator('[data-slot="joystick"]').focus();
      await page.keyboard.down("ArrowRight");
      await until("the world hears the direction", async () => (await heard(page)).includes("move 1,0"));
      await until("the hero moves", async () => (await heroX(page)) > 20);
      await until("a coin is picked up", async () => (await snack(page)) === "Got coin1");
      /* the last coin gone, the round is over: the design opens the next screen */
      await until("the round over opens the next screen", async () => ((await onShow(page).textContent()) ?? "").includes("You won"));
      await page.keyboard.up("ArrowRight");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "world view: a world script chosen in the preview's bar plays the battle, on the mocks' clock, and its events run the design's actions",
    async run({ page, base }) {
      await openPreview(page, base, battleDoc());
      await until("the world view is drawn", async () => (await view(page).count()) > 0);
      /* no script yet: the design's own state */
      equal(await view(page).getAttribute("data-world-script"), null, "no script plays before one is chosen");
      await page.locator("[data-preview-world-button]").first().click();
      await page.locator('[data-preview-world="battle"]').first().click();
      await until("the battle plays", async () => (await view(page).getAttribute("data-world-script")) === "battle");
      /* twenty enemies with hit points, under the scene's words and its picture */
      await until("twenty enemies stand there", async () => (await part(page, "world").locator('[data-kind="enemy"][data-hp]').count()) === 20);
      check((await part(page, "world").locator('[data-slot="world-picture"]').count()) === 1, "the scene has a picture");
      check(((await part(page, "world").locator('[data-slot="world-scene"]').textContent()) ?? "").includes("slimes"), "the scene says what it is in words");
      /* the scene changes as the script plays: hit points go down, and each hit runs the design's action */
      await until("a slime is defeated and goes", async () => (await part(page, "world").locator('[data-kind="enemy"]').count()) < 20, 15_000);
      await until("a hit runs the design's action", async () => (await snack(page))?.startsWith("Hit e") === true);
      check((await part(page, "world").locator("[data-world-event]").count()) > 0, "the stand-in lists the world's events");
      /* the mocks' clock stopped, the world stands still; going on, it goes on */
      await page.locator("[data-preview-clock-pause]").first().click();
      await settle(page, 300);
      const stood = await worldTime(page);
      await settle(page, 1200);
      equal(await worldTime(page), stood, "the world stands still while the mocks' clock does");
      await page.locator("[data-preview-clock-pause]").first().click();
      await until("the world goes on", async () => (await worldTime(page)) > stood);
      /* the round over (every slime down), the design opens the next screen */
      await until("the round over opens the next screen", async () => ((await onShow(page).textContent()) ?? "").includes("Victory screen"), 30_000);
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
];
