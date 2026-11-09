/* Damage numbers spawned on a world's hits in the preview (docs/交互规则.md “按事件生成”), in a real editor: the design
 * makes a text a template (set_spawn: a second's life, four at once, floating up as it fades) spawned on the world
 * view's on:hit; the skill presses attack, M3E's example engine hits the slime near the hero, and a number reading the
 * event floats over the world and is gone a second later. Then the performance check: twenty spawns from one tap commit
 * no more to React than a tap that does nothing, and the frames an instance floats through commit nothing at all (the
 * DevTools hook, which production React calls, counts the commits, as scripts/bench-editor.ts does). Screenshots of
 * failures go to e2e/.out. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, equal, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

const SCREEN = "arena";

function spawnDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the battle", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Battle" });
    tx.run(ops.addScreen, { id: SCREEN, name: "Arena" });
    const entities = { columns: ["Id", "Kind", "X", "Y", "Label"], rows: [["hero", "player", "20", "40", "Hero"], ["slime", "enemy", "25", "52", "Slime"]] };
    tx.run(ops.addPart, { slug: "world-view", id: "world", screen: SCREEN, at: { x: 26, y: 80 }, props: { label: "Arena", entities, inputs: "move, attack" } });
    /* the damage number: the example engine's hit says what was hit, an engine of a game's own its amount too */
    tx.run(ops.addPart, { slug: "text", id: "dmg", screen: SCREEN, at: { x: 150, y: 160 }, props: { text: "-{{event.amount ?? 12}} {{event.id}}" } });
    tx.run(ops.setSpawn, { id: "dmg", spawn: { life: 1, max: 4, motion: "float", at: "event.id" }, on: { part: "world", event: "hit" } });
    tx.run(ops.addPart, { slug: "skill-button", id: "attack", screen: SCREEN, at: { x: 300, y: 400 }, props: { label: "Attack" } });
    tx.run(ops.setAction, { id: "attack", slot: "action", action: { to: "none", effects: [{ do: "press", part: "world", action: "attack" }, { do: "release", part: "world", action: "attack" }] } as never });
  });
  const doc = savedDoc(store.get());
  const template = doc.groups.find((g) => g.spawn)!.id;
  /* two taps to measure by: twenty spawns at once, and nothing at all */
  const store2 = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("m"), measurer: guessMeasurer, lang: () => "en" });
  store2.load(doc, true);
  store2.transact("Add the taps", "mcp", (tx) => {
    tx.run(ops.addPart, { slug: "button", id: "burst", screen: SCREEN, at: { x: 26, y: 500 }, props: { label: "Burst" } });
    tx.run(ops.setAction, { id: "burst", action: { to: "none", effects: Array.from({ length: 20 }, () => ({ do: "spawn", group: template })) } as never });
    tx.run(ops.addPart, { slug: "button", id: "idle", screen: SCREEN, at: { x: 200, y: 500 }, props: { label: "Idle" } });
    tx.run(ops.setAction, { id: "idle", action: { to: "none", effects: [] } as never });
  });
  return savedDoc(store2.get());
}

/** installed before the page's scripts: React reports each commit to the DevTools hook */
function countCommits() {
  const w = window as unknown as Record<string, unknown>;
  w.__commits = 0;
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: () => {
      w.__commits = (w.__commits as number) + 1;
    },
  };
}
const commits = (page: Page) => page.evaluate(() => (window as unknown as { __commits: number }).__commits);

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const part = (page: Page, id: string) => onShow(page).locator(`[data-part="${id}"]`).first();
/** the instances on show: the template's copies an instance is drawn in */
const instances = (page: Page) =>
  onShow(page).locator("[data-spawn-of]").evaluateAll((els) =>
    els
      .filter((e) => e.hasAttribute("data-spawn-serial") && getComputedStyle(e).visibility === "visible")
      .map((e) => ({ words: (e.textContent ?? "").trim(), at: e.getAttribute("data-spawn-at"), translate: (e as HTMLElement).style.translate })),
  );
async function until(what: string, ok: () => Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`never: ${what}`);
}

export const tests: E2ETest[] = [
  {
    name: "spawn: the world's hits spawn damage numbers that float and vanish, and spawning commits nothing to React",
    async run({ page, base }) {
      await page.context().addInitScript(countCommits, undefined);
      /* a page load of its own (another address, not only another hash), so the hook is there before React is */
      await page.goto(`${base}/?spawn#doc=${encodeURIComponent(JSON.stringify(spawnDoc()))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector(`[data-screen="${SCREEN}"]`, { timeout: 30_000 });
      await settle(page, 1500);
      await page.keyboard.press("Escape");
      await settle(page, 200);
      await selectScreen(page, SCREEN);
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
      await until("the world view is drawn", async () => (await part(page, "world").locator('[data-slot="world-view"]').count()) > 0);
      equal(await instances(page), [], "the preview starts with no instance of the template");
      equal(await onShow(page).locator("[data-spawn-of]").count(), 4, "the template is laid out as its pool of four");

      /* the skill presses attack: the engine hits the slime, and a damage number reading the hit floats over the world */
      await part(page, "attack").locator("button").first().click();
      await until("a damage number is spawned", async () => (await instances(page)).length === 1);
      const [first] = await instances(page);
      equal({ words: first.words, at: first.at }, { words: "-12 slime", at: "slime" }, "the instance reads the event it was spawned on");
      await until("it floats up", async () => /-\d/.test((await instances(page))[0]?.translate ?? ""));
      await until("it is gone after its second", async () => (await instances(page)).length === 0, 4000);

      /* Twenty spawns from one tap, and the frames the four the cap keeps float through: no more commits than a tap that
         does nothing over the same time (a button's own ripple commits alike after either) */
      await settle(page, 300);
      let at = await commits(page);
      check(at > 0, `React's commits are counted through the DevTools hook (${at})`);
      await part(page, "idle").locator("button").first().click();
      await settle(page, 700);
      const idle = (await commits(page)) - at;
      at = await commits(page);
      await part(page, "burst").locator("button").first().click();
      await until("the cap's four are on show", async () => (await instances(page)).length === 4, 2000);
      const rose = (await instances(page))[0]?.translate ?? "";
      await settle(page, 500);
      const burst = (await commits(page)) - at;
      check((await instances(page)).length === 4, "the four still float half a second on");
      check((await instances(page))[0]?.translate !== rose, "they move frame by frame");
      check(burst <= idle + 1, `twenty spawns and their frames committed ${burst} times to React, a tap that does nothing ${idle}`);
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
];
