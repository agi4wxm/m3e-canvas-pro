/* Bindings per frame in the preview (docs/数据绑定.md “每帧绑定”), in a real editor and preview: a HUD of twenty enemies'
 * health bars, their damage numbers and a skill's cooldown, each bound per frame to the world's snapshot, while the
 * world moves on every frame. The page hands the preview its world (`window.m3ePreviewWorld`, as it may hand in a
 * transport): every enemy's health and the cooldown change with time. The bars and the words follow frame by frame,
 * and React commits nothing meanwhile (counted through the DevTools hook production React reports its commits to, as
 * the editor's benchmark counts them). Screenshots of failures go to e2e/.out. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

const SCREEN = "hud";
const ENEMIES = 20;

/** the HUD, through operations only: a bar, a damage number for each enemy, and a cooldown (the editor's benchmark
 *  previews it too, scripts/bench-editor.ts) */
export function hudDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the HUD", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "HUD" });
    tx.run(ops.addScreen, { id: SCREEN, name: "HUD" });
    for (let i = 0; i < ENEMIES; i++) {
      const x = 8 + (i % 2) * 200;
      const y = 40 + Math.floor(i / 2) * 64;
      tx.run(ops.addPart, { slug: "stat-bar", id: `bar${i}`, screen: SCREEN, at: { x, y }, props: { label: `E${i}`, value: 100, max: 100, width: 180 } });
      tx.run(ops.addPart, { slug: "text", id: `dmg${i}`, screen: SCREEN, at: { x, y: y + 28 }, props: { text: "-" } });
      /* the world's contract here is the page's own, so the parts are bound past the example engine's schema */
      tx.run(ops.setItem, { id: `bar${i}`, patch: { frame: { value: `world.byId.e${i}.hp` } } });
      tx.run(ops.setItem, { id: `dmg${i}`, patch: { frame: { text: `'-' + world.byId.e${i}.dmg`, "@opacity": `world.byId.e${i}.fade` } } });
    }
    tx.run(ops.addPart, { slug: "text", id: "cooldown", screen: SCREEN, at: { x: 8, y: 700 }, props: { text: "ready" } });
    tx.run(ops.setItem, { id: "cooldown", patch: { frame: { text: "(world.byId.hero.readyAt - world.clock.now) % 5000" } } });
  });
  return savedDoc(store.get());
}

/** installed before the page's scripts: the world the preview reads, moving with time */
export function movingWorld(enemies: number) {
  const w = window as unknown as Record<string, unknown>;
  w.m3ePreviewWorld = {
    view: () => {
      const t = performance.now();
      const entities = Array.from({ length: enemies }, (_, i) => ({ id: `e${i}`, kind: "enemy", x: 50, y: 50, hp: Math.round(50 + 50 * Math.sin(t / 150 + i)), dmg: Math.round(t / 16) % 97, fade: Math.round(t / 10) % 100 }));
      return { entities: [...entities, { id: "hero", kind: "player", x: 10, y: 10, readyAt: 0 }] };
    },
    clock: () => ({ now: -Math.round(performance.now()), paused: false, rate: 1 }),
  };
}

/** installed before the page's scripts: the commit counter, on the DevTools hook (each is a script of its own: what the
 *  page runs is the function's text alone) */
function instrument() {
  const w = window as unknown as Record<string, unknown>;
  const counts = { commits: 0 };
  w.__counts = counts;
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: () => void counts.commits++,
  };
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const commits = (page: Page) => page.evaluate(() => (window as unknown as { __counts: { commits: number } }).__counts.commits);
/** the bars' fills and the words as drawn now */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-preview-active]");
    const fills = [...(root?.querySelectorAll('[data-slot="stat-bar-fill"]') ?? [])].map((el) => (el as HTMLElement).style.width);
    const words = [...(root?.querySelectorAll('[data-part^="dmg"] [data-slot="text"]') ?? [])].map((el) => el.textContent ?? "");
    const cooldown = root?.querySelector('[data-part="cooldown"] [data-slot="text"]')?.textContent ?? "";
    return { fills, words, cooldown };
  });

export const tests: E2ETest[] = [
  {
    name: "bindings per frame: twenty health bars, damage numbers and a cooldown follow the world on every frame, and React commits nothing",
    async run({ page, base }) {
      await page.context().addInitScript(instrument, undefined);
      await page.context().addInitScript(movingWorld, ENEMIES);
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(hudDoc()))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector(`[data-screen="${SCREEN}"]`, { timeout: 30_000 });
      await settle(page, 1500);
      await page.keyboard.press("Escape");
      await settle(page, 200);
      await selectScreen(page, SCREEN);
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
      await onShow(page).locator('[data-slot="stat-bar-fill"]').first().waitFor({ timeout: 10_000 });
      /* whatever the opening drew has landed */
      await settle(page, 1500);
      const before = await drawn(page);
      check(before.fills.length === ENEMIES, `twenty bars are drawn: ${before.fills.length}`);
      const from = await commits(page);
      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(100);
        seen.add(JSON.stringify(await drawn(page)));
      }
      const during = (await commits(page)) - from;
      const after = await drawn(page);
      check(seen.size >= 5, `the bars and words changed from frame to frame: ${seen.size} different pictures in a second`);
      check(after.fills.every((f) => /^\d+(\.\d+)?%$/.test(f)), `each bar is filled by its enemy's health: ${after.fills.join(" ")}`);
      check(after.fills.some((f, i) => f !== before.fills[i]), "a bar moved");
      check(after.words.filter((w) => w.startsWith("-") && w !== "-").length === ENEMIES, `each damage number reads the world: ${after.words.join(" | ")}`);
      check(/^\d+$/.test(after.cooldown) && after.cooldown !== before.cooldown, `the cooldown reads the world's clock: ${before.cooldown} then ${after.cooldown}`);
      check(during === 0, `React committed nothing while the world moved: ${during} commits in a second`);
      await page.keyboard.press("Escape");
      await settle(page, 400);
    },
  },
];
