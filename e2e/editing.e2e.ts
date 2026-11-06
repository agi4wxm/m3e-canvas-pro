/* Editing a document: a part carried in, its props edited, undone and redone, the project downloaded; what is saved
 * coming back on a reload; a saved file opened over the canvas and taken back with one undo. */

import { join } from "node:path";
import { bySlug, center, check, clickAdd, dragAdd, equal, groupOf, itemsOf, nodeBox, redo, redoButton, reload, savedDoc, screenBox, select, settle, undo, undoButton, type E2ETest } from "./lib";

export const tests: E2ETest[] = [
  {
    name: "drag in a part, edit its props, undo and redo, download the project",
    async run({ page }) {
      const start = await savedDoc(page);
      equal(start.groups.length, 7, "the starter sketch's parts");
      check(!(await undoButton(page).isEnabled()), "nothing to undo at the start");

      const sb = await screenBox(page, "seedF1");
      await dragAdd(page, "Button", { x: sb.x + 200, y: sb.y + 460 });
      let doc = await savedDoc(page);
      const buttons = bySlug(doc, "button");
      equal(buttons.length, 1, "buttons after the drop");
      const button = buttons[0];
      const g = groupOf(doc, button.id)!;
      check(g.x >= doc.frames[0].x && g.x < doc.frames[0].x + 412, "the button landed on the screen");
      check(g.y >= doc.frames[0].y && g.y < doc.frames[0].y + 892, "the button landed within the screen's height");

      /* its label, typed letter by letter: one undo step */
      await select(page, button.id);
      const label = page.locator('aside input[aria-label="Label"]').first();
      await label.click();
      await label.press("Control+a");
      await label.pressSequentially("Continue", { delay: 60 });
      await settle(page);
      doc = await savedDoc(page);
      equal(bySlug(doc, "button")[0].props?.label, "Continue", "the label typed");

      /* a fill role from the appearance section */
      await page.locator('aside button[title="Primary container"]').first().click();
      await settle(page);
      doc = await savedDoc(page);
      equal(bySlug(doc, "button")[0].fill, "primaryContainer", "the fill picked");

      await undo(page);
      doc = await savedDoc(page);
      equal(bySlug(doc, "button")[0].fill, undefined, "the fill undone");
      equal(bySlug(doc, "button")[0].props?.label, "Continue", "the label kept by that undo");
      await undo(page);
      doc = await savedDoc(page);
      check(bySlug(doc, "button")[0].props?.label !== "Continue", "the typing undone in one step");
      await undo(page);
      doc = await savedDoc(page);
      equal(bySlug(doc, "button").length, 0, "the drop undone");
      check(!(await undoButton(page).isEnabled()), "back at the start");
      await redo(page);
      await redo(page);
      await redo(page);
      doc = await savedDoc(page);
      equal(bySlug(doc, "button")[0].props?.label, "Continue", "the label redone");
      equal(bySlug(doc, "button")[0].fill, "primaryContainer", "the fill redone");
      check(!(await redoButton(page).isEnabled()), "nothing left to redo");

      /* moved by a drag, then nudged with the arrow keys in one step */
      const before = groupOf(doc, button.id)!;
      const b = await nodeBox(page, button.id);
      await page.mouse.move(center(b).x, center(b).y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(center(b).x - i * 4, center(b).y + i * 6);
      await page.mouse.up();
      await settle(page);
      doc = await savedDoc(page);
      const moved = doc.groups.find((x) => x.items.some((it) => it.id === button.id))!;
      check(moved.y > before.y, "the drag moved the button down");
      await select(page, button.id);
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
      await settle(page);
      doc = await savedDoc(page);
      equal(groupOf(doc, button.id)!.x, moved.x + 3, "three nudges");
      await undo(page);
      doc = await savedDoc(page);
      equal(groupOf(doc, button.id)!.x, moved.x, "the nudges undone in one step");

      /* the project, downloaded as a runnable zip */
      await page.locator("button").filter({ hasText: "Ask an AI" }).first().click();
      await settle(page, 500);
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator('button[title="Save a project you can install and run, as a zip"]').first().click()]);
      check(download.suggestedFilename().endsWith(".zip"), `a zip downloaded (${download.suggestedFilename()})`);
    },
  },
  {
    name: "reload brings back what was saved",
    async run({ page }) {
      await clickAdd(page, "Chip");
      await select(page, "seed1");
      const title = page.locator('aside input[aria-label="Title"]').first();
      await title.fill("Mail");
      await settle(page);
      const before = await savedDoc(page);
      equal(bySlug(before, "chip").length, 1, "a chip added");
      await reload(page);
      const after = await savedDoc(page);
      equal(after, before, "the document after a reload");
      check(await page.locator(`[data-node="${bySlug(after, "chip")[0].id}"]`).first().isVisible(), "the chip drawn again");
      check((await page.locator('[data-node="seed1"]').first().textContent())?.includes("Mail"), "the app bar's new title drawn");
    },
  },
  {
    name: "open a saved file over the canvas, and undo it",
    async run({ page, out }) {
      await clickAdd(page, "Switch");
      const saved = await savedDoc(page);
      await page.locator('button[title="Project"]').first().click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator('button[title="Save project"]').first().click()]);
      const file = join(out, "opened-project.json");
      await download.saveAs(file);
      await page.keyboard.press("Escape");
      await clickAdd(page, "Slider");
      await clickAdd(page, "Checkbox");
      const edited = await savedDoc(page);
      equal(itemsOf(edited).length, itemsOf(saved).length + 2, "two more parts since the save");

      await page.locator('button[title="Project"]').first().click();
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('button[title="Open project"]').first().click()]);
      await chooser.setFiles(file);
      await settle(page, 500);
      await page.locator('[role="dialog"] button, [role="alertdialog"] button').filter({ hasText: /Open|Replace|OK|Confirm/ }).last().click();
      await settle(page, 1500);
      equal(await savedDoc(page), saved, "the file's document on the canvas");
      await undo(page);
      await settle(page, 1000);
      equal(itemsOf(await savedDoc(page)).length, itemsOf(edited).length, "one undo brings back the document it replaced");
    },
  },
];
