/* The split view in a real editor and preview (report 4.3, 14.2's split row):
 *   - on the canvas, the dividers of the split views a selected part is in: focusable separators with their value and
 *     range, moved with the arrow keys, Home and End and by a drag, the parts in the panes following, one drag one undo
 *     step; a split view from the palette comes with its two panes
 *   - in the preview, at several window sizes (the screen drawn scaled): the library's separators, dragged with the
 *     pointer whatever the scale, moved with keys, folded with Enter, the panes' parts following, a swipe set on the
 *     screen not taking the drag, and the visitor's share gone when the preview opens again
 * Screenshots of failures go to e2e/.out. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc as saved, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, dragAdd, equal, groupOf, kidsOf, nodeBox, savedDoc, screenBox, settle, undo, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

/** A desktop screen with a split view (files | the rest), whose second pane holds one of its own (editor over terminal,
 *  the terminal folding away); a part in each pane, and a screen a swipe leads to. */
function splitDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Split", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "desk", name: "Desk", preset: "desktop" });
    tx.run(ops.addScreen, { id: "next", name: "Next", preset: "desktop" });
    tx.run(ops.patchScreen, { id: "desk", patch: { swipe: { left: "next", right: "next" } } });
    const outer = tx.run(ops.addPart, { slug: "split-view", id: "outer", screen: "desk", at: { x: 40, y: 40 }, props: { width: 1001, height: 601, split: 30, minFirst: 200, minSecond: 300 } });
    tx.run(ops.addPart, { slug: "text", id: "folders", into: { container: outer.panes!.first! }, props: { text: "Folders", style: "title" } });
    tx.run(ops.setProps, { id: outer.panes!.second!, props: { padX: 0, padY: 0 } });
    const inner = tx.run(ops.addPart, { slug: "split-view", id: "inner", into: { container: outer.panes!.second! }, props: { orientation: "vertical", split: 60, minFirst: 160, collapsible: "second", minSecond: 120 } });
    tx.run(ops.setItem, { id: "inner", patch: { flowSize: { w: "fill", h: "fill" } } });
    tx.run(ops.addPart, { slug: "button", id: "go", into: { container: inner.panes!.first! }, props: { label: "Run" } });
    tx.run(ops.addPart, { slug: "text", id: "term", into: { container: inner.panes!.second! }, props: { text: "Terminal" } });
  });
  return saved(store.get());
}

async function openDoc(page: Page, base: string, doc: Doc) {
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector('[data-screen="desk"]', { timeout: 30_000 });
  await settle(page, 1500);
}

type Sep = { id: string | null; now: number; min: number; max: number; orientation: string | null; x: number; y: number; w: number; h: number };
/** the separators on the page under `root`, with their value, range and place */
const separators = (page: Page, root: string) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} [role="separator"]`)].map((e) => {
        const r = e.getBoundingClientRect();
        const n = (a: string) => Number(e.getAttribute(a));
        return { id: e.getAttribute("data-split-handle"), now: n("aria-valuenow"), min: n("aria-valuemin"), max: n("aria-valuemax"), orientation: e.getAttribute("aria-orientation"), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }),
    root,
  ) as Promise<Sep[]>;

const near = (got: number, want: number, by: number, what: string) => check(Math.abs(got - want) <= by, `${what}: expected about ${want}, got ${got}`);

/** a drag along one axis in small steps */
async function pull(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + (dx * i) / 10, from.y + (dy * i) / 10);
  await page.mouse.up();
  await settle(page, 500);
}

const previewTest = (viewport: { width: number; height: number }): E2ETest => ({
  name: `split view in the preview at ${viewport.width}×${viewport.height}: dragged with the pointer however scaled, keys and Enter on the separator, the panes following, no swipe, nothing kept`,
  viewport,
  async run({ page, base }) {
    await openDoc(page, base, splitDoc());
    await page.keyboard.press("Escape");
    const b = await screenBox(page, "desk");
    await page.mouse.click(b.x + b.width / 2, b.y - 4);
    await settle(page, 350);
    await page.keyboard.press("p");
    await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
    await settle(page, 1500);
    const root = "[data-preview-active]";
    const shown = () => page.locator(root).first().getAttribute("data-preview-screen");
    const partAt = async (id: string) => (await page.locator(`${root} [data-part="${id}"]`).first().boundingBox())!;
    const scale = await page.evaluate((sel) => {
      const e = document.querySelector(sel) as HTMLElement;
      return e.getBoundingClientRect().width / e.offsetWidth;
    }, root);
    let seps = await separators(page, root);
    equal(seps.length, 2, "a separator for each split view");
    const [outer, inner] = seps;
    equal([outer.now, outer.orientation, inner.now, inner.orientation], [30, "vertical", 60, "horizontal"], "each starts at its design's share, across its axis");

    /* a drag of 90 screen pixels moves the divider 90 screen pixels whatever the preview's scale (react-resizable-panels
       4.16 and later read the scale), and what the panes hold follows */
    const goBefore = await partAt("go");
    await pull(page, outer, 90, 0);
    seps = await separators(page, root);
    near(seps[0].x - outer.x, 90, 2, `the divider follows the pointer at scale ${scale.toFixed(2)}`);
    near((await partAt("go")).x - goBefore.x, 90, 3, "the part in the other pane moves with it");
    near(seps[0].now, 30 + (90 / scale / (1001 - 1)) * 100, 0.6, "its value is the new share");
    /* dragged on past its limit, as far as a third of the screen: a swipe the screen has would have gone to "next" */
    await pull(page, seps[0], 420 * scale, 0);
    await settle(page, 600);
    seps = await separators(page, root);
    equal(seps[0].now, seps[0].max, "dragged past its limit, the divider stops at it");
    equal(await shown(), "desk", "the swipe set on the screen does not take the divider's drag");

    /* the keys on the inner divider: up by the library's step, Home and End to its limits, Enter folds the terminal */
    await page.locator(`${root} [role="separator"]`).nth(1).focus();
    await page.keyboard.press("ArrowUp");
    await settle(page, 300);
    check((await separators(page, root))[1].now < 60, "↑ moves the divider up");
    await page.keyboard.press("Home");
    await settle(page, 300);
    seps = await separators(page, root);
    equal(seps[1].now, seps[1].min, "Home: as small as the first pane may be");
    /* End takes the first pane as far as it goes, which folds the terminal away; Enter unfolds it and folds it again */
    await page.keyboard.press("End");
    await settle(page, 300);
    seps = await separators(page, root);
    equal(seps[1].now, seps[1].max, "End: as big as it may be, the terminal folded");
    await page.keyboard.press("Enter");
    await settle(page, 400);
    seps = await separators(page, root);
    check(seps[1].now < seps[1].max, `Enter unfolds the terminal (${seps[1].now})`);
    check((await partAt("term")).y > seps[1].y, "the terminal shows under the divider");
    await page.keyboard.press("Enter");
    await settle(page, 400);
    equal((await separators(page, root))[1].now, seps[1].max, "Enter folds it again");

    /* the share is the visitor's own: the preview opened again starts from the design */
    await page.keyboard.press("Escape");
    await settle(page, 600);
    await page.keyboard.press("p");
    await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
    await settle(page, 1200);
    seps = await separators(page, root);
    equal([seps[0].now, seps[1].now], [30, 60], "opened again, each divider is where the design has it");
    await page.keyboard.press("Escape");
    await settle(page, 600);
    /* and the design was never changed by it */
    const doc = await savedDoc(page);
    equal(groupOf(doc, "outer")!.items[0].props?.split, 30, "the design's share is as it was");
  },
});

export const tests: E2ETest[] = [
  {
    name: "split view on the canvas: the dividers of a selected part's split views, keys and a drag move them, the panes' parts follow, one undo step; from the palette with its panes",
    async run({ page, base }) {
      await openDoc(page, base, splitDoc());
      /* Ctrl: the part itself, deep in its panes */
      const go = await nodeBox(page, "go");
      await page.keyboard.down("Control");
      await page.mouse.click(go.x + go.width / 2, go.y + go.height / 2);
      await page.keyboard.up("Control");
      await settle(page, 500);
      const root = "[data-split-handles]";
      let seps = await separators(page, root);
      equal(
        seps.map((s) => [s.id, s.now, s.orientation]),
        [
          ["inner", 60, "horizontal"],
          ["outer", 30, "vertical"],
        ],
        "a divider for the split view the part is in and for the one that is in",
      );
      const outer = () => page.locator('[data-split-handle="outer"]');
      check((await outer().getAttribute("aria-label"))?.includes("Second pane"), "the divider is named after the panes it sits between");

      await outer().focus();
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
      await settle(page, 400);
      seps = await separators(page, root);
      equal(seps[1].now, 33, "→ three times: three percent");
      const z = (await nodeBox(page, "go")).x - go.x;
      check(z > 0, `the part in the second pane moved right with it (${z})`);
      await page.keyboard.press("Home");
      await settle(page, 300);
      seps = await separators(page, root);
      equal(seps[1].now, seps[1].min, "Home: the first pane as small as it may be");
      check(seps[1].min > 0 && seps[1].max < 100, `its range is the panes' limits (${seps[1].min}–${seps[1].max})`);
      await page.keyboard.press("End");
      await settle(page, 300);
      seps = await separators(page, root);
      equal(seps[1].now, seps[1].max, "End: as big as it may be");

      /* a drag is one step, the parts follow it; the document has what the canvas shows */
      const before = seps[1].now;
      const goBefore = await nodeBox(page, "go");
      await pull(page, seps[1], -120, 0);
      seps = await separators(page, root);
      check(seps[1].now < before - 5, `the drag moved it (${before} → ${seps[1].now})`);
      check((await nodeBox(page, "go")).x < goBefore.x - 40, "the part in the second pane moved left with it");
      await settle(page, 600);
      equal(groupOf(await savedDoc(page), "outer")!.items[0].props?.split, seps[1].now, "the document keeps the share the divider shows");
      await undo(page);
      equal(groupOf(await savedDoc(page), "outer")!.items[0].props?.split, before, "one undo puts the drag back");

      /* a split view added from the palette comes with its two panes */
      await page.keyboard.press("Escape");
      const desk = await screenBox(page, "next");
      await dragAdd(page, "Split view", { x: desk.x + desk.width / 3, y: desk.y + desk.height / 3 });
      await settle(page, 800);
      const doc = await savedDoc(page);
      const added = doc.groups.find((g) => g.items[0].component === "split-view" && !["outer", "inner"].includes(g.items[0].id))!;
      check(added, "the split view landed");
      equal(
        kidsOf(doc, added.id).map((g) => [g.items[0].component, (g as { splitPane?: string }).splitPane]),
        [
          ["box", "first"],
          ["box", "second"],
        ],
        "with its two panes",
      );
    },
  },
  previewTest({ width: 1000, height: 720 }),
  previewTest({ width: 1680, height: 1050 }),
];
