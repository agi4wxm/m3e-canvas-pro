/* The retired whole-screen parts in a real editor: an old design that holds them opens as it was, a notice says what
 * they are, the palette offers none of them, and "Split into atoms" turns every one into atoms in one step that one
 * undo takes back. Each split stands where its part stood, as big (the canvas measures both), saying the same words in
 * the preview, where a list's rows are drawn again from the data collection they became. */

import { setGlobalLang } from "../lib/i18n";
import type { Doc, Group, Item } from "../lib/tokens";
import { bySlug, check, equal, nodeBox, savedDoc, screenBox, selectScreen, settle, tile, undo, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

const SLUGS = ["inventory", "task-row", "pull-to-refresh", "cart-list", "contact-list", "comment-list", "notification-list", "settings-group", "todo-list", "auth-form", "chat-composer"];
/** three columns down a desktop-sized screen, each part where the one above it ends, with room between */
const COLUMNS = [
  ["inventory", "task-row", "pull-to-refresh", "cart-list"],
  ["contact-list", "comment-list", "notification-list"],
  ["settings-group", "todo-list", "auth-form", "chat-composer"],
];
const TALL: Record<string, number> = { inventory: 340, "task-row": 72, "pull-to-refresh": 210, "cart-list": 420, "contact-list": 480, "comment-list": 420, "notification-list": 360, "settings-group": 340, "todo-list": 320, "auth-form": 520, "chat-composer": 64 };

function oldDesign(): Doc {
  const groups: Group[] = [];
  COLUMNS.forEach((col, c) => {
    let y = 24;
    for (const slug of col) {
      const it: Item = { id: slug, kind: "component", label: "", icon: null, variant: "filled", component: slug, props: {} };
      groups.push({ id: `g-${slug}`, x: 24 + c * 420, y, axis: "x", items: [it] });
      y += TALL[slug] + 40;
    }
  });
  return { groups, frames: [{ id: "old", name: "Old design", x: 0, y: 0, w: 1280, h: 1800 }], paletteKey: "purple", frame: "phone", title: "Old design", brief: "" };
}

async function openOld(page: Page, base: string) {
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(oldDesign()))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector('[data-screen="old"]', { timeout: 30_000 });
  await settle(page, 2000);
}

/** each part's size on the canvas, in the screen's own units */
async function sizes(page: Page): Promise<Record<string, { w: number; h: number }>> {
  const scale = (await screenBox(page, "old")).width / 1280;
  const out: Record<string, { w: number; h: number }> = {};
  for (const slug of SLUGS) {
    const b = await nodeBox(page, slug);
    out[slug] = { w: Math.round(b.width / scale), h: Math.round(b.height / scale) };
  }
  return out;
}

export const tests: E2ETest[] = [
  {
    name: "retired parts: an old design keeps them and is told; the palette offers none; split into atoms the same size, one undo back",
    async run({ page, base }) {
      await openOld(page, base);
      let doc = await savedDoc(page);
      for (const slug of SLUGS) equal(bySlug(doc, slug).length, 1, `the old design still holds its ${slug}`);
      /* each draws as it always did: its own widget */
      for (const slot of ["cart-list", "auth-form", "settings-group", "todo-list"]) check((await page.locator(`[data-node="${slot}"] [data-slot="${slot}"]`).count()) > 0, `${slot} drawn by its own component`);

      const banner = page.locator("[data-retired-banner]");
      equal(await banner.getAttribute("data-retired-banner"), "11", "the notice counts the retired parts");
      check(((await banner.textContent()) ?? "").includes("Shopping cart"), "the notice names them");

      /* the palette offers none of them, even when asked by name, while what replaces them is there */
      equal(await (await tile(page, "Shopping cart")).count(), 0, "no tile for the retired cart");
      equal(await page.locator('[data-tile="cart-list"]').count(), 0, "no tile for the retired cart by its id");
      check((await page.locator('[data-kit="cart-row"]').count()) > 0, "the search finds the cart-row kit that replaces it");
      await page.locator('input[aria-label="Search"]').first().fill("");
      await settle(page, 200);

      const before = await sizes(page);
      await page.locator("[data-retired-split]").click();
      await settle(page, 2500);
      doc = await savedDoc(page);
      for (const slug of SLUGS) {
        equal(bySlug(doc, slug).length, 0, `${slug} split`);
        check(doc.groups.some((g) => g.items[0]?.id === slug && g.items[0].component === "box"), `${slug}'s outermost box keeps its id`);
      }
      check((doc.collections ?? []).some((c) => c.name === "Shopping cart" && c.rows.length === 2), "the cart's rows are a data collection");
      equal(await banner.count(), 0, "the notice is gone with them");
      const after = await sizes(page);
      const report = SLUGS.map((s) => `${s} ${before[s].w}×${before[s].h} → ${after[s].w}×${after[s].h}`).join("; ");
      console.log(`  sizes: ${report}`);
      for (const slug of SLUGS) {
        check(Math.abs(after[slug].w - before[slug].w) <= 2, `${slug} as wide as it was (${report})`);
        check(Math.abs(after[slug].h - before[slug].h) <= 2, `${slug} as tall as it was (${report})`);
      }

      await undo(page);
      await settle(page, 800);
      doc = await savedDoc(page);
      for (const slug of SLUGS) equal(bySlug(doc, slug).length, 1, `${slug} back after one undo`);
      equal(doc.collections ?? [], [], "the collection goes with the undo");
      equal(await page.locator("[data-retired-banner]").getAttribute("data-retired-banner"), "11", "the notice is back");
      await page.locator("[data-retired-later]").click();
      await settle(page, 300);
      equal(await page.locator("[data-retired-banner]").count(), 0, "not now puts it away");
    },
  },
  {
    name: "retired parts: once split, the preview draws the same words, a cart's rows from its data",
    async run({ page, base }) {
      await openOld(page, base);
      await page.keyboard.press("Escape");
      await selectScreen(page, "old");
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
      await settle(page, 1200);
      const shown = async () => (await page.locator("[data-preview-active]").first().textContent()) ?? "";
      const old = await shown();
      await page.keyboard.press("Escape");
      await settle(page, 600);
      await page.locator("[data-retired-split]").click();
      await settle(page, 2500);
      await selectScreen(page, "old");
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
      await settle(page, 1200);
      const split = await shown();
      for (const words of ["Everyday canvas tote", "Ceramic mug", "Checkout (3)", "Welcome back", "Sign in", "Grace Hopper", "Order shipped", "Reply to Grace", "Pull down to refresh", "Daily login (1/1)", "Dark theme"]) {
        check(old.includes(words), `the old design says "${words}"`);
        check(split.includes(words), `the split says "${words}" too`);
      }
      check(!split.includes("{{"), "every field of a repeated row is filled in");
    },
  },
  {
    name: "retired parts: an old resizable is offered a split view, by the notice and by its old name in the palette; one undo back",
    async run({ page, base }) {
      const it: Item = { id: "rz", kind: "component", label: "", icon: null, variant: "filled", component: "resizable", props: { width: 600, height: 240, split: 40 } };
      const doc: Doc = { groups: [{ id: "g-rz", x: 40, y: 40, axis: "x", items: [it] }], frames: [{ id: "old", name: "Old design", x: 0, y: 0, w: 1280, h: 800 }], paletteKey: "purple", frame: "phone", title: "Old design", brief: "" };
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector('[data-screen="old"]', { timeout: 30_000 });
      await settle(page, 1500);
      const banner = page.locator("[data-retired-banner]");
      equal(await banner.getAttribute("data-retired-banner"), "1", "the notice counts the resizable");
      equal(((await page.locator("[data-retired-split]").textContent()) ?? "").trim(), "Convert to split view", "and offers to convert it");
      /* the palette offers the split view for its old name, never the resizable */
      equal(await (await tile(page, "Resizable")).count(), 0, "no tile for the retired resizable");
      check((await page.locator('[data-tile="split-view"]').count()) > 0, "the search for it finds the split view");
      await page.locator('input[aria-label="Search"]').first().fill("");
      await settle(page, 200);
      await page.locator("[data-retired-split]").click();
      await settle(page, 1500);
      let saved = await savedDoc(page);
      equal(bySlug(saved, "resizable").length, 0, "the resizable is converted");
      check(saved.groups.some((g) => g.items[0]?.id === "rz" && g.items[0].component === "split-view"), "into a split view that keeps its id");
      equal(await banner.count(), 0, "the notice is gone with it");
      await undo(page);
      await settle(page, 800);
      saved = await savedDoc(page);
      equal(bySlug(saved, "resizable").length, 1, "one undo puts the resizable back");
    },
  },
];
