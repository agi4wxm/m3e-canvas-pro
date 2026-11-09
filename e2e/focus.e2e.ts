/* The keyboard and the gamepad over a designed game's menus (docs/焦点与输入.md, 游戏阶段整改计划 第六批 H5): the game
 * menus flow (lobby, shop, bag, pause menu laid over the lobby) walked in the preview with the keyboard only. The arrows
 * move a ring over what does something, Enter runs it, Escape goes back where it came from with the focus where it was
 * left, Escape on the lobby runs its menu button, the pause menu holds the focus (round and round) until it closes, and
 * the hint words follow the device. Then a gamepad, through the Gamepad API, does the same. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, equal, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

/** the game menus flow added to an empty document, its four screens in order */
function menusDoc(): { doc: Doc; lobby: string; shop: string; bag: string; pause: string } {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Menus", "mcp", (tx) => tx.run(ops.addTemplate, { slug: "game-menu-flow" }));
  const doc = savedDoc(store.get());
  const [lobby, shop, bag, pause] = doc.frames.slice(-4).map((f) => f.id);
  return { doc, lobby, shop, bag, pause };
}

async function openDoc(page: Page, base: string, doc: Doc, first: string) {
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector(`[data-screen="${first}"]`, { timeout: 30_000 });
  await settle(page, 1500);
}

async function preview(page: Page, screen: string) {
  await page.keyboard.press("Escape");
  await settle(page, 200);
  await selectScreen(page, screen);
  await page.keyboard.press("p");
  await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
  await settle(page, 600);
}

const shownScreen = (page: Page) => page.locator("[data-preview-active]").first().getAttribute("data-preview-screen");
/** the words of what the focus is on, and whether the ring is drawn round it */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-focused]");
    const ring = document.querySelector<HTMLElement>("[data-focus-ring]");
    const words = (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const label = el?.getAttribute("aria-label") ?? el?.querySelector("[aria-label]")?.getAttribute("aria-label") ?? "";
    return { words: words || label, inOverlay: !!el?.closest("[data-preview-overlay]"), ring: !!ring && ring.style.display !== "none" };
  });

async function until(what: string, ok: () => Promise<boolean>, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never: ${what}`);
}
const onScreen = (page: Page, id: string) => until(`the preview shows ${id}`, async () => (await shownScreen(page)) === id);
const press = async (page: Page, key: string) => {
  await page.keyboard.press(key);
  await settle(page, 180);
};

/** Presses a key until the focus is on what has these words, at most `max` times: the way there is the layout's. */
async function walkTo(page: Page, key: string, words: string, max = 8) {
  for (let i = 0; i < max; i++) {
    if ((await focused(page)).words.includes(words)) return;
    await press(page, key);
  }
  const at = await focused(page);
  throw new Error(`${key} never reached ${JSON.stringify(words)}: the focus is on ${JSON.stringify(at.words)}`);
}

/** An arena: a world view (M3E's example engine plays it in the preview) taking `move` and `attack`, words showing the
 *  keys for each on the device in use, a menu button that lays a pause screen over it and is what cancel runs there. */
function arenaDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Arena", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "arena", name: "Arena" });
    tx.run(ops.addScreen, { id: "pause", name: "Pause" });
    const entities = { columns: ["Id", "Kind", "X", "Y", "Label"], rows: [["hero", "player", "20", "40", "Hero"], ["slime", "enemy", "80", "80", "Slime"]] };
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: "arena", at: { x: 26, y: 80 }, props: { label: "Arena", entities, inputs: "move, attack" } });
    tx.run(ops.addPart, { slug: "text", id: "hints", screen: "arena", at: { x: 26, y: 340 }, props: { text: "{{input.hint.move}} to move, {{input.hint.attack}} to attack" } });
    tx.run(ops.addPart, { slug: "button", id: "menu", screen: "arena", at: { x: 26, y: 400 }, props: { label: "Menu" } });
    tx.run(ops.setAction, { id: "menu", action: { to: "pause", overlay: true } as never });
    tx.run(ops.addPart, { slug: "button", id: "resume", screen: "pause", at: { x: 26, y: 120 }, props: { label: "Resume" } });
    tx.run(ops.setAction, { id: "resume", action: { to: "back" } as never });
    tx.run(ops.addPart, { slug: "button", id: "quit", screen: "pause", at: { x: 26, y: 200 }, props: { label: "Quit" } });
    tx.run(ops.setAction, { id: "quit", action: { to: "back" } as never });
    tx.run(ops.setFocus, { screen: "arena", cancel: "menu" });
  });
  return savedDoc(store.get());
}

const worldPart = (page: Page) => page.locator('[data-preview-active] [data-part="world"]').first();
/** the inputs a world view's stand-in lists, the newest last; `scope` picks the view under an overlay too */
const inputsListed = (page: Page, scope: string) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} [data-part="world"] [data-world-input]`)].map((el) => (el.textContent ?? "").trim()), scope);
const heardInputs = (page: Page) => inputsListed(page, "[data-preview-active]");
const heroAt = async (page: Page) => Number(await worldPart(page).locator('[data-entity="hero"]').first().getAttribute("data-x"));

export const tests: E2ETest[] = [
  {
    name: "focus: the keyboard alone walks the lobby, the shop, the bag and the pause menu",
    async run({ page, base, out }) {
      const m = menusDoc();
      await openDoc(page, base, m.doc, m.lobby);
      await preview(page, m.lobby);
      equal(await shownScreen(page), m.lobby, "the preview opens on the lobby");
      equal((await focused(page)).ring, false, "a pointer shows no ring");

      /* the first arrow shows the focus where the lobby starts it: on play */
      await press(page, "ArrowDown");
      let at = await focused(page);
      check(at.ring, "the ring is drawn");
      check(at.words.includes("Play"), `the focus starts on play (${at.words})`);
      await page.screenshot({ path: `${out}/focus-1-lobby.png` });

      /* down to the bar, left to its shop tab, Enter opens the shop */
      await press(page, "ArrowDown");
      await walkTo(page, "ArrowLeft", "Shop");
      await press(page, "Enter");
      await onScreen(page, m.shop);
      await settle(page, 500);
      at = await focused(page);
      check(at.ring && at.words !== "", `the shop's focus is on its first part (${at.words})`);
      /* its tabs pick themselves: down to them, along, Enter */
      await walkTo(page, "ArrowDown", "Featured");
      await press(page, "ArrowRight");
      check((await focused(page)).words.includes("Gems") || (await focused(page)).words.includes("Packs"), "right moves along the tabs");
      await press(page, "Enter");
      await page.screenshot({ path: `${out}/focus-2-shop.png` });

      /* Escape goes back, the focus on the shop tab it left from */
      await press(page, "Escape");
      await onScreen(page, m.lobby);
      await settle(page, 500);
      check((await focused(page)).words.includes("Shop"), `back on the lobby the focus is where it was left (${(await focused(page)).words})`);

      /* to the bag's shortcut and in; Escape out again */
      await walkTo(page, "ArrowUp", "Bag", 10);
      await press(page, "Enter");
      await onScreen(page, m.bag);
      await settle(page, 500);
      check((await focused(page)).ring, "the bag shows the focus");
      await press(page, "Escape");
      await onScreen(page, m.lobby);
      await settle(page, 500);
      check((await focused(page)).words.includes("Bag"), "back on the bag's shortcut");

      /* Escape on the lobby runs its menu button: the pause menu, laid over it, takes the focus on resume */
      await press(page, "Escape");
      await page.waitForSelector("[data-preview-overlay]", { timeout: 5000 });
      await settle(page, 500);
      at = await focused(page);
      check(at.inOverlay && at.words.includes("Resume"), `the pause menu has the focus on resume (${at.words})`);
      /* the hint words follow the keyboard */
      const hint = await page.locator("[data-preview-overlay]").textContent();
      check(!!hint?.includes("Enter Select") && hint.includes("Esc Back"), `the hints say the keyboard's keys (${hint})`);
      await page.screenshot({ path: `${out}/focus-3-pause.png` });
      /* it holds the focus: round its four buttons, and nothing under it is reached */
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        await press(page, "ArrowDown");
        const f = await focused(page);
        check(f.inOverlay, `the focus stays in the pause menu (${f.words})`);
        seen.push(f.words);
      }
      check(seen[3].includes("Resume"), `down from quit goes round to resume (${seen.join(" / ")})`);
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowUp"]) {
        await press(page, key);
        check((await focused(page)).inOverlay, `${key} keeps the focus in the pause menu`);
      }

      /* Escape closes it, and the focus is where it was when it opened; Enter on resume does the same */
      await press(page, "Escape");
      await until("the pause menu closes", async () => (await page.locator("[data-preview-overlay]").count()) === 0);
      await settle(page, 300);
      at = await focused(page);
      check(!at.inOverlay && at.words.includes("Bag"), `the focus is back where it was (${at.words})`);
      await press(page, "Escape");
      await page.waitForSelector("[data-preview-overlay]", { timeout: 5000 });
      await settle(page, 400);
      await press(page, "Enter");
      await until("resume closes it", async () => (await page.locator("[data-preview-overlay]").count()) === 0);
      await settle(page, 300);
      check((await focused(page)).words.includes("Bag"), "resume gives the focus back too");

      /* a pointer hides the ring again */
      await page.mouse.click(5, 5);
      await settle(page, 200);
      equal((await focused(page)).ring, false, "a click hides the ring");
    },
  },
  {
    name: "inputs: the keyboard drives a world's move and attack, the hints say its keys, and a pause laid over it takes the keys back and lets go",
    async run({ page, base, out }) {
      await openDoc(page, base, arenaDoc(), "arena");
      await preview(page, "arena");
      await until("the world view is drawn", async () => (await worldPart(page).locator('[data-slot="world-view"]').count()) > 0);
      equal(await heroAt(page), 20, "the hero starts where the design puts it");
      /* D held: the world hears move 1,0 and the example engine walks the hero right; let go, the direction goes back */
      await page.keyboard.down("d");
      await until("the world hears the direction", async () => (await heardInputs(page)).includes("move 1,0"));
      await until("the hero walks right", async () => (await heroAt(page)) > 24);
      await page.keyboard.up("d");
      await until("letting go stops it", async () => (await heardInputs(page)).at(-1) === "move 0,0");
      /* Space presses and lets go of attack */
      await page.keyboard.press(" ");
      await until("the world hears attack", async () => (await heardInputs(page)).includes("attack ↓") && (await heardInputs(page)).includes("attack ↑"));
      /* the words say the keyboard's keys now */
      const words = (await page.locator('[data-preview-active] [data-part="hints"]').textContent()) ?? "";
      check(words.includes("WASD to move") && words.includes("Space to attack"), `the hints say the keys (${words})`);
      await page.screenshot({ path: `${out}/inputs-1-arena.png` });

      /* W held, then Escape: cancel runs the menu button, the pause screen lies over the world, and what the world held is let go */
      await page.keyboard.down("w");
      await until("the world hears up", async () => (await heardInputs(page)).includes("move 0,-1"));
      await page.keyboard.press("Escape");
      await page.waitForSelector("[data-preview-overlay]", { timeout: 5000 });
      await page.keyboard.up("w");
      await settle(page, 400);
      const afterPause = await inputsListed(page, "[data-preview-screen]");
      equal(afterPause.at(-1), "move 0,0", "the overlay let go of the direction the world held");
      /* the arrows move the focus in the pause menu now, not the world */
      await press(page, "ArrowDown");
      await press(page, "ArrowDown");
      const f = await focused(page);
      check(f.inOverlay && f.words.includes("Quit"), `the arrows move the focus in the pause menu (${f.words})`);
      equal(await inputsListed(page, "[data-preview-screen]"), afterPause, "and the world hears nothing");
      /* closed, the keys are the world's again */
      await press(page, "Escape");
      await until("the pause closes", async () => (await page.locator("[data-preview-overlay]").count()) === 0);
      await page.keyboard.down("ArrowLeft");
      await until("the arrows drive the world again", async () => (await heardInputs(page)).includes("move -1,0"));
      await page.keyboard.up("ArrowLeft");
    },
  },
  {
    name: "focus: a gamepad's d-pad, A and B do what the keys do, and the hints say its buttons",
    async run({ page, base }) {
      const m = menusDoc();
      /* a pad the page polls: the test holds its buttons down and lets them go */
      await page.context().addInitScript(() => {
        const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
        const pad = { id: "Xbox Wireless Controller (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons, timestamp: 0 };
        Object.defineProperty(navigator, "getGamepads", { value: () => [pad], configurable: true });
        (window as unknown as { __pad: (i: number, on: boolean) => void }).__pad = (i, on) => {
          buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
        };
      }, undefined);
      await openDoc(page, base, m.doc, m.lobby);
      await preview(page, m.lobby);
      const tap = async (i: number) => {
        await page.evaluate((n) => (window as unknown as { __pad: (i: number, on: boolean) => void }).__pad(n, true), i);
        await settle(page, 120);
        await page.evaluate((n) => (window as unknown as { __pad: (i: number, on: boolean) => void }).__pad(n, false), i);
        await settle(page, 220);
      };
      /* the first press shows the focus on play */
      await tap(13);
      check((await focused(page)).words.includes("Play"), "the d-pad shows the focus on play");
      /* B on the lobby runs the menu button: the pause menu */
      await tap(1);
      await page.waitForSelector("[data-preview-overlay]", { timeout: 5000 });
      await settle(page, 500);
      check((await focused(page)).words.includes("Resume"), "the pause menu takes the focus");
      const hint = await page.locator("[data-preview-overlay]").textContent();
      check(!!hint?.includes("A Select") && hint.includes("B Back"), `the hints say the pad's buttons (${hint})`);
      await tap(13);
      check((await focused(page)).words.includes("Restart"), "down on the d-pad moves");
      /* A on resume closes it (its tap goes back) */
      await tap(12);
      await tap(0);
      await until("A on resume closes it", async () => (await page.locator("[data-preview-overlay]").count()) === 0);
      await settle(page, 300);
      check((await focused(page)).words.includes("Play"), "and the focus is back where it was");
    },
  },
];
