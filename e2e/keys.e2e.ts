/* The editor's keyboard where layers and controls meet the canvas (report ED-1, ED-3): a destructive confirmation
 * answers only through the button that has the focus, keeps Tab inside and gives the focus back; one Escape closes one
 * layer; a focused select or radio run keeps its arrows; Delete while a dialog asks something deletes nothing; a key in
 * the middle of an IME composition is not a shortcut. */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bySlug, check, clickAdd, equal, groupOf, itemsOf, leftTab, savedDoc, select, settle, type E2ETest, type Page } from "./lib";

/** what has the focus: a dialog's answer, or the title of a button */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute("data-dialog-answer") ?? document.activeElement?.getAttribute("title") ?? document.activeElement?.tagName ?? "");
const dialogs = (page: Page) => page.locator('[role="alertdialog"]').count();
/** the dialog gone, its fade out over */
const closed = async (page: Page) => {
  await page.waitForSelector('[role="alertdialog"]', { state: "detached", timeout: 3000 }).catch(() => {});
  return dialogs(page);
};
const partCount = async (page: Page) => itemsOf(await savedDoc(page)).length;

/** a key the page is handed while an IME composes, at what has the focus (a browser marks it so; Playwright cannot type one) */
const composingKey = (page: Page, key: string) =>
  page.evaluate((k: string) => {
    const at = document.activeElement ?? document.body;
    at.dispatchEvent(new KeyboardEvent("keydown", { key: k, isComposing: true, bubbles: true, cancelable: true }));
    at.dispatchEvent(new KeyboardEvent("keyup", { key: k, isComposing: true, bubbles: true, cancelable: true }));
  }, key);

export const tests: E2ETest[] = [
  {
    name: "keys: the clear-canvas confirmation answers only through the focused button, traps Tab and gives the focus back",
    async run({ page, out }) {
      const parts = await partCount(page);
      check(parts > 0, "the starter sketch has parts");
      const clear = page.locator('button[title="Clear canvas"]').first();

      /* Enter on Cancel, where the focus starts, cancels: the canvas is untouched */
      await clear.click();
      await settle(page, 400);
      equal(await dialogs(page), 1, "the dialog is up");
      equal(await focused(page), "cancel", "the focus starts on Cancel");
      check(await page.evaluate(() => (document.getElementById("root") as HTMLElement & { inert: boolean }).inert), "the editor behind is inert");
      await page.keyboard.press("Enter");
      await settle(page, 500);
      equal(await closed(page), 0, "Enter on Cancel closes it");
      equal(await partCount(page), parts, "and deletes nothing");
      equal(await focused(page), "Clear canvas", "the focus is back on the button that opened it");

      /* Tab and Shift+Tab go round inside; Tab back to Cancel and Enter still cancels */
      await clear.click();
      await settle(page, 400);
      await page.keyboard.press("Tab");
      equal(await focused(page), "confirm", "Tab reaches OK");
      await page.keyboard.press("Tab");
      equal(await focused(page), "cancel", "and goes round to Cancel, never out");
      await page.keyboard.press("Shift+Tab");
      equal(await focused(page), "confirm", "Shift+Tab goes round the other way");
      await page.keyboard.press("Shift+Tab");
      equal(await focused(page), "cancel", "back on Cancel");
      await page.keyboard.press("Enter");
      await settle(page, 500);
      equal(await partCount(page), parts, "Tab to Cancel and Enter deletes nothing");

      /* Escape cancels; an Enter that ends a composition, even on OK, presses nothing */
      await clear.click();
      await settle(page, 400);
      await page.keyboard.press("Tab");
      await composingKey(page, "Enter");
      await settle(page, 300);
      equal(await dialogs(page), 1, "an IME's Enter does not answer");
      await page.keyboard.press("Escape");
      await settle(page, 500);
      equal(await closed(page), 0, "Escape cancels");
      equal(await partCount(page), parts, "and deletes nothing");
      await page.screenshot({ path: join(out, "keys-1-cancelled.png") });

      /* held down on Cancel, Enter cancels once and never reaches OK */
      await clear.click();
      await settle(page, 400);
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter");
      await page.keyboard.down("Enter");
      await page.keyboard.up("Enter");
      await settle(page, 500);
      equal(await partCount(page), parts, "a held Enter deletes nothing");
      if (await dialogs(page)) await page.keyboard.press("Escape");
      await settle(page, 400);

      /* only OK clears */
      await clear.click();
      await settle(page, 400);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await settle(page, 600);
      equal(await partCount(page), 0, "Enter on OK clears the canvas");
      check(!(await page.evaluate(() => (document.getElementById("root") as HTMLElement & { inert: boolean }).inert)), "the editor is live again");
    },
  },
  {
    name: "keys: one Escape closes one layer, a focused select or radio run keeps its arrows, the canvas keeps the selection",
    async run({ page, out }) {
      await clickAdd(page, "Button");
      let doc = await savedDoc(page);
      const button = bySlug(doc, "button")[0];
      check(button, "a button is added");
      await select(page, button.id);
      const at = () => savedDoc(page).then((d) => ({ x: groupOf(d, button.id)!.x, y: groupOf(d, button.id)!.y }));
      const where = await at();

      /* the icon picker open in the panel, and the variant's list over it: two layers */
      await page.locator('aside button[aria-label="Icon"]').first().click();
      await settle(page, 400);
      check((await page.locator('aside input[aria-label="Search icons"]').count()) === 1, "the icon picker is open");
      await page.locator('aside button[aria-haspopup="listbox"][aria-label="Variant"]').first().click();
      await settle(page, 400);
      check((await page.locator('[role="listbox"]').count()) === 1, "the variant's list is open over it");
      await page.screenshot({ path: join(out, "keys-2-two-layers.png") });
      await page.keyboard.press("Escape");
      await settle(page, 400);
      equal(await page.locator('[role="listbox"]').count(), 0, "the first Escape closes the list");
      equal(await page.locator('aside input[aria-label="Search icons"]').count(), 1, "and only the list: the picker stays");
      await page.keyboard.press("Escape");
      await settle(page, 400);
      equal(await page.locator('aside input[aria-label="Search icons"]').count(), 0, "the second closes the picker");
      check((await page.locator('aside button[aria-label="Variant"]').count()) === 1, "the part is still selected: its panel is there");

      /* the arrow keys on a focused select and on a radio run are theirs, not a nudge */
      await page.locator('aside button[aria-haspopup="listbox"][aria-label="Variant"]').first().focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      await settle(page, 400);
      equal(await at(), where, "arrows on the select do not move the part");
      const shape = page.locator('aside [role="radiogroup"][aria-label="Shape"] [role="radio"][aria-checked="true"]').first();
      await shape.focus();
      await page.keyboard.press("ArrowRight");
      await settle(page, 500);
      doc = await savedDoc(page);
      equal(bySlug(doc, "button")[0].props?.shape, "square", "the arrow chose the next shape");
      equal(await at(), where, "and did not move the part");
      await page.keyboard.press("Delete");
      await settle(page, 400);
      equal(bySlug(await savedDoc(page), "button").length, 1, "Delete on a focused radio deletes nothing");

      /* on the canvas the keys are the canvas's again; a key in a composition is not */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("ArrowRight");
      await settle(page, 400);
      equal((await at()).x, where.x + 1, "with nothing focused, the arrow nudges the part");
      await composingKey(page, "Delete");
      await settle(page, 400);
      equal(bySlug(await savedDoc(page), "button").length, 1, "a Delete in a composition deletes nothing");
      await page.keyboard.press("Delete");
      await settle(page, 500);
      equal(bySlug(await savedDoc(page), "button").length, 0, "a real Delete still deletes it");
    },
  },
  {
    name: "keys: Delete while the mocks ask before deleting a scenario deletes neither the part nor the scenario",
    async run({ page, out }) {
      /* the shop's OpenAPI, its mocks filled in */
      await leftTab(page, "API");
      await page.waitForSelector("[data-api-panel]");
      await page.locator('[data-api-panel] [role="radio"]').nth(3).click();
      await settle(page, 300);
      const spec = join(out, "keys-shop.openapi.yaml");
      writeFileSync(spec, readFileSync(new URL("../lib/api/fixtures/shop.openapi.yaml", import.meta.url), "utf8"));
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-api-add="open-file"]').first().click()]);
      await chooser.setFiles(spec);
      await page.waitForSelector("[data-api-report]");
      await settle(page, 500);
      await leftTab(page, "Mocks");
      await page.waitForSelector("[data-mocks-panel]");
      await page.locator("[data-mocks-fill]").first().click();
      await settle(page, 600);
      const scenarios = async () => (((await savedDoc(page)) as unknown as { mocks?: { scenarios?: { id: string }[] } }).mocks?.scenarios ?? []).map((s) => s.id);
      check((await scenarios()).includes("new-user"), "the scenarios are there");

      /* a part selected on the canvas, then the scenario's delete asked for */
      const doc = await savedDoc(page);
      const part = itemsOf(doc)[0];
      await select(page, part.id);
      const parts = itemsOf(await savedDoc(page)).length;
      await page.locator('[data-mocks-scenario="new-user"] button').nth(1).click();
      await settle(page, 400);
      await page.locator("[data-mocks-delete-scenario]").first().click();
      await settle(page, 400);
      equal(await dialogs(page), 1, "the dialog asks");
      await page.keyboard.press("Delete");
      await page.keyboard.press("Backspace");
      await page.keyboard.press("Enter");
      await settle(page, 500);
      equal(itemsOf(await savedDoc(page)).length, parts, "Delete behind the dialog deletes no part");
      check((await scenarios()).includes("new-user"), "and Enter on Cancel deletes no scenario");

      /* through OK it goes */
      await page.locator("[data-mocks-delete-scenario]").first().click();
      await settle(page, 400);
      await page.locator('[data-dialog-answer="confirm"]').first().click();
      await settle(page, 600);
      check(!(await scenarios()).includes("new-user"), "OK deletes the scenario");
      equal(itemsOf(await savedDoc(page)).length, parts, "and nothing on the canvas");
    },
  },
];
