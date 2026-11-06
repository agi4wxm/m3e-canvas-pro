/* Laying parts out: a kit landing as atoms in nested auto layouts, a composite split into atoms; parts dropped into a
 * box's auto layout, moved along its run and carried out of it; Tidy and its undo, Tidy up, and suggested auto
 * layout. */

import { bySlug, center, check, clickAdd, drag, dragAdd, equal, groupOf, kidsOf, nodeBox, redo, savedDoc, screenBox, select, selectScreen, settle, undo, type E2ETest } from "./lib";

export const tests: E2ETest[] = [
  {
    name: "a kit lands as atoms, a composite splits into atoms",
    async run({ page }) {
      const sb = await screenBox(page, "seedF1");
      await dragAdd(page, "Labeled field", { x: sb.x + 160, y: sb.y + 500 });
      let doc = await savedDoc(page);
      const root = doc.groups.find((g) => g.kit?.slug);
      check(root, "the kit's outermost box, marked with its kit");
      check(kidsOf(doc, root.id).length >= 2, "the kit's atoms laid out by its box");
      check(bySlug(doc, "input").length === 1, "the field's input is an atom of its own");

      /* the app bar split: the same place, a tree of boxes, words and icons; one undo puts it back */
      await select(page, "seed1");
      await page.locator("[data-split-atoms]").first().click();
      await settle(page, 1200);
      doc = await savedDoc(page);
      equal(bySlug(doc, "app-bar").length, 0, "no app bar left after the split");
      const top = groupOf(doc, "seed1");
      check(top && top.items[0].component === "box", "the split's outermost box keeps the app bar's id");
      check(kidsOf(doc, top.id).length >= 2, "the app bar's atoms laid out in its box");
      check(bySlug(doc, "text").some((t) => t.props?.text === "Inbox"), "the title came along as a text atom");
      await undo(page);
      doc = await savedDoc(page);
      equal(bySlug(doc, "app-bar").length, 1, "the app bar back after an undo");
      await redo(page);
      equal(bySlug(await savedDoc(page), "app-bar").length, 0, "split again by a redo");
    },
  },
  {
    name: "auto layout: drop into a box, reorder in it, drag out of it",
    async run({ page }) {
      await clickAdd(page, "Box");
      let doc = await savedDoc(page);
      const box = bySlug(doc, "box")[0];
      check(box, "a box added");
      const host = groupOf(doc, box.id)!;
      await dragAdd(page, "Text", center(await nodeBox(page, box.id)));
      let bb = await nodeBox(page, box.id);
      await dragAdd(page, "Button", { x: bb.x + bb.width / 2, y: bb.y + bb.height - 6 });
      doc = await savedDoc(page);
      const kids = kidsOf(doc, host.id).map((g) => g.items[0].component);
      equal(kids, ["text", "button"], "the box's run after two drops");
      const [text, button] = kidsOf(doc, host.id).map((g) => g.items[0]);
      check(groupOf(doc, button.id)!.y > groupOf(doc, text.id)!.y, "the column stacks the button under the text");

      /* the button carried up above the text, inside the box */
      bb = await nodeBox(page, box.id);
      const btn = await nodeBox(page, button.id);
      await drag(page, center(btn), { x: center(btn).x, y: bb.y + 6 }, 16);
      doc = await savedDoc(page);
      equal(kidsOf(doc, host.id).map((g) => g.items[0].id), [button.id, text.id], "the run after the reorder");

      /* the text carried out, onto the empty part of the screen */
      const sb = await screenBox(page, "seedF1");
      await drag(page, center(await nodeBox(page, text.id)), { x: sb.x + 300, y: sb.y + 470 }, 18);
      doc = await savedDoc(page);
      equal(kidsOf(doc, host.id).map((g) => g.items[0].id), [button.id], "the run after the text left");
      equal(groupOf(doc, text.id)!.inFlow, undefined, "the text stands on its own");

      await undo(page);
      equal(kidsOf(await savedDoc(page), host.id).length, 2, "the text back in the box after an undo");
    },
  },
  {
    name: "tidy a screen and undo it, tidy up a selection, suggest auto layout",
    async run({ page }) {
      /* two rows pushed out of line */
      for (const id of ["seed4", "seed2"]) {
        const b = await nodeBox(page, id);
        await drag(page, center(b), { x: center(b).x + 23, y: center(b).y + 31 });
      }
      const scattered = await savedDoc(page);
      await selectScreen(page, "seedF1");
      await page.locator('button[title="Tidy"]').first().click();
      await settle(page, 1200);
      const tidied = await savedDoc(page);
      check(JSON.stringify(tidied.groups) !== JSON.stringify(scattered.groups), "tidy moved something");
      const xs = ["seed3", "seed4", "seed5"].map((id) => groupOf(tidied, id)!.x);
      equal(new Set(xs).size, 1, "the rows on one left edge after tidy");
      check(await page.locator('button[title="Undo tidy"]').first().isVisible(), "the tidy button offers its undo");
      await page.locator('button[title="Undo tidy"]').first().click();
      await settle(page, 1200);
      equal((await savedDoc(page)).groups, scattered.groups, "tidy's own undo puts everything back");

      /* tidied again, one row pushed aside and down a little; the three tidied up into one column with one gap */
      await page.locator('button[title="Tidy"]').first().click();
      await settle(page, 1200);
      await select(page, "seed4");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await settle(page);
      await select(page, "seed3");
      await select(page, "seed4", true);
      await select(page, "seed5", true, "end");
      await page.keyboard.press("Control+Alt+t");
      await settle(page, 1000);
      let doc = await savedDoc(page);
      const rows = ["seed3", "seed4", "seed5"].map((id) => groupOf(doc, id)!).sort((a, b) => a.y - b.y);
      equal(new Set(rows.map((g) => g.x)).size, 1, "the rows on one left edge after tidy up");
      check(rows[1].y - rows[0].y === rows[2].y - rows[1].y, `the rows evenly spaced after tidy up (${rows.map((g) => g.y).join(", ")})`);

      /* the same three as an auto layout */
      await page.keyboard.press("Shift+A");
      await settle(page, 1000);
      doc = await savedDoc(page);
      /* each row is in the new layout, directly or in a row or column inside it */
      const rootOf = (id: string) => {
        let g = groupOf(doc, id);
        while (g?.inFlow) g = doc.groups.find((x) => x.id === g!.inFlow);
        return g?.id;
      };
      check(groupOf(doc, "seed3")!.inFlow, "the rows went into an auto layout");
      equal(new Set(["seed3", "seed4", "seed5"].map(rootOf)).size, 1, "the three rows under one layout");
      check(kidsOf(doc, rootOf("seed3")!).length >= 1, "the layout lays them out");
      await undo(page);
      equal(groupOf(await savedDoc(page), "seed3")!.inFlow, undefined, "the auto layout undone");
    },
  },
];
