/* The Figma-like editing: the layers tree (a part dragged into a box) and the design panel's number fields (scrubbed by
 * their label, typed with arithmetic, stepped with the arrow keys). */

import { bySlug, check, clickAdd, equal, groupOf, kidsOf, leftTab, savedDoc, settle, undo, type E2ETest } from "./lib";

export const tests: E2ETest[] = [
  {
    name: "layers: drag a part's row into a box",
    async run({ page }) {
      await clickAdd(page, "Box");
      await clickAdd(page, "Chip");
      let doc = await savedDoc(page);
      const box = groupOf(doc, bySlug(doc, "box")[0].id)!;
      const chip = groupOf(doc, bySlug(doc, "chip")[0].id)!;
      check(!chip.inFlow, "the chip starts on its own");
      await leftTab(page, "Layers");
      const from = await page.locator(`[data-layer-row="${chip.id}"]`).first().boundingBox();
      const to = await page.locator(`[data-layer-row="${box.id}"]`).first().boundingBox();
      check(from && to, "both rows listed in the layers tree");
      /* pressed on the chip's row, carried onto the middle of the box's row and let go */
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y + to.height / 2 - (from.y + from.height / 2)) * i) / steps);
        await page.waitForTimeout(16);
      }
      check(await page.locator(`[data-layer-row="${box.id}"]`).first().isVisible(), "the box's row still there while dragging");
      await page.mouse.up();
      await settle(page);
      doc = await savedDoc(page);
      equal(groupOf(doc, bySlug(doc, "chip")[0].id)!.inFlow, box.id, "the chip went into the box's layout");
      equal(kidsOf(doc, box.id).map((g) => g.items[0].component), ["chip"], "the box's run");
      /* the tree shows it under the box */
      check(await page.locator(`[data-layer-row="${chip.id}"]`).first().isVisible(), "the chip's row shown under its box");
      await undo(page);
      check(!groupOf(await savedDoc(page), bySlug(doc, "chip")[0].id)!.inFlow, "one undo takes it back out");
    },
  },
  {
    name: "design panel: scrub a number field, type arithmetic, step with the arrows",
    async run({ page }) {
      await clickAdd(page, "Box");
      let doc = await savedDoc(page);
      const box = bySlug(doc, "box")[0];
      const before = Number(box.props?.width ?? 160);
      /* the box is selected after it is added: its W field's label is dragged 40px to the right */
      const label = page.locator('[data-number-field="width"] [data-scrub]').first();
      const b = await label.boundingBox();
      check(b, "the W field's label");
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(b.x + b.width / 2 + i * 4, b.y + b.height / 2);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await settle(page);
      doc = await savedDoc(page);
      equal(Number(bySlug(doc, "box")[0].props?.width), before + 40, "the width scrubbed by 40");

      /* typed as arithmetic */
      const input = page.locator('[data-number-field="width"] input').first();
      await input.click();
      await input.fill("100*2");
      await input.press("Enter");
      await settle(page);
      doc = await savedDoc(page);
      equal(Number(bySlug(doc, "box")[0].props?.width), 200, "100*2 typed into W");

      /* the arrow keys step it, ten at a time with Shift */
      await input.click();
      await input.press("Shift+ArrowUp");
      await input.press("ArrowDown");
      await input.press("Enter");
      await settle(page);
      doc = await savedDoc(page);
      equal(Number(bySlug(doc, "box")[0].props?.width), 209, "Shift+↑ then ↓");

      /* the scrub, the typing and the steps are each one undo step */
      await undo(page);
      equal(Number(bySlug(await savedDoc(page), "box")[0].props?.width), 200, "the steps undone");
    },
  },
];
