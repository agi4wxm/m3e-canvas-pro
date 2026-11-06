/* The Figma-like editing: the layers tree (a part dragged into a box), the design panel's number fields (scrubbed by
 * their label, typed with arithmetic), selection that goes into and out of boxes, and a select laid out by its closed
 * size. */

import { bySlug, center, check, clickAdd, dragAdd, equal, groupOf, kidsOf, leftTab, nodeBox, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

/** the layers the tree shows selected, by their group ids */
const selectedRows = (page: Page) => page.locator('[data-layer-row][aria-selected="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-layer-row") ?? ""));

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
  {
    name: "selection: a press picks the outermost box, Enter and double-click go in, Shift+Enter and Escape come out",
    async run({ page }) {
      await clickAdd(page, "Labeled field");
      const doc = await savedDoc(page);
      const root = doc.groups.find((g) => g.kit && !g.inFlow);
      check(root, "the kit's outermost box");
      const input = bySlug(doc, "input")[0];
      check(input, "the field's input atom");
      const inputGroup = groupOf(doc, input.id)!;
      await leftTab(page, "Layers");
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await settle(page, 300);
      equal(await selectedRows(page), [], "nothing selected after Escape at the top");

      /* a press on the input picks the box it is in, the outermost layer */
      const ib = await nodeBox(page, input.id);
      await page.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2);
      await settle(page, 400);
      equal(await selectedRows(page), [root.id], "a press picks the kit's outermost box");

      /* Enter: its children */
      await page.keyboard.press("Enter");
      await settle(page, 400);
      const kids = await selectedRows(page);
      equal([...kids].sort(), kidsOf(doc, root.id).map((g) => g.id).sort(), "Enter selects the box's children");

      /* Shift+Enter: back to the box */
      await page.keyboard.press("Shift+Enter");
      await settle(page, 400);
      equal(await selectedRows(page), [root.id], "Shift+Enter goes back to the box");

      /* a double-click goes one level in, towards the input */
      await page.mouse.dblclick(ib.x + ib.width / 2, ib.y + ib.height / 2);
      await settle(page, 400);
      const inner = await selectedRows(page);
      equal(inner.length, 1, "a double-click selects one layer inside");
      check(inner[0] !== root.id, "the double-click went inside the box");
      const chain: string[] = [];
      for (let at = groupOf(doc, input.id); at; at = at.inFlow ? doc.groups.find((g) => g.id === at!.inFlow) : undefined) chain.push(at.id);
      check(chain.includes(inner[0]), "the layer the double-click selected holds the input");

      /* Escape: up to the parent again */
      await page.keyboard.press("Escape");
      await settle(page, 400);
      equal(await selectedRows(page), [doc.groups.find((g) => g.id === inner[0])!.inFlow!], "Escape selects the parent");

      /* Ctrl+click: the input itself, deep inside */
      await page.keyboard.down("Control");
      await page.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2);
      await page.keyboard.up("Control");
      await settle(page, 400);
      equal(await selectedRows(page), [inputGroup.id], "Ctrl+click selects the input itself");

      /* Tab: a sibling of it */
      const sibs = kidsOf(doc, inputGroup.inFlow!).map((g) => g.id);
      if (sibs.length > 1) {
        await page.keyboard.press("Tab");
        await settle(page, 400);
        const next = await selectedRows(page);
        check(next.length === 1 && next[0] !== inputGroup.id && sibs.includes(next[0]), `Tab selects a sibling (${next.join(", ")})`);
      }
    },
  },
  {
    name: "a select in an auto layout is laid out by its closed size, its menu hanging over what follows",
    async run({ page }) {
      await clickAdd(page, "Box");
      let doc = await savedDoc(page);
      const boxItem = bySlug(doc, "box")[0];
      const box = groupOf(doc, boxItem.id)!;
      await dragAdd(page, "Select", center(await nodeBox(page, boxItem.id)));
      const bb = await nodeBox(page, boxItem.id);
      await dragAdd(page, "Button", { x: bb.x + bb.width / 2, y: bb.y + bb.height - 4 });
      await settle(page, 1200);
      doc = await savedDoc(page);
      const kids = kidsOf(doc, box.id);
      equal(kids.map((g) => g.items[0].component), ["select", "button"], "the box's run");
      const [sel, btn] = kids;
      const step = btn.y - sel.y;
      /* closed, a select is a 56dp field; drawn open it was more than 200dp tall */
      check(step > 40 && step < 100, `the button follows the select's closed field (${step}dp apart)`);
      /* the open menu is still drawn on the canvas, hanging from the closed field */
      const node = page.locator(`[data-node="${sel.items[0].id}"]`).first();
      check((await node.locator("[data-overhang]").count()) > 0, "the open menu hangs from the closed field");
    },
  },
];
