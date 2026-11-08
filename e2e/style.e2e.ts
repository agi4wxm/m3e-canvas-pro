/* The whole document's look and words: a style picked takes off what it rules out and offers its undo on the notice;
 * the editor's language changes the seed words, and an undo afterwards comes back in the new language. */

import { bySlug, check, clickAdd, dragAdd, equal, leftTab, redo, reload, savedDoc, screenBox, select, settle, undo, undoButton, type E2ETest } from "./lib";

export const tests: E2ETest[] = [
  {
    name: "a style picked strips looks, its notice undoes it, picked again and undone from the toolbar",
    async run({ page }) {
      await select(page, "seed2");
      await page.locator('aside button[title="Glass"]').first().click();
      await settle(page);
      const sb = await screenBox(page, "seedF1");
      await dragAdd(page, "Labeled field", { x: sb.x + 160, y: sb.y + 520 });
      const before = await savedDoc(page);
      check(bySlug(before, "button-group")[0].look, "the button pair wears a look");
      equal(before.theme?.style, undefined, "no style at first");

      await leftTab(page, "Style");
      await page.locator('[role="button"][aria-label="iOS"]').first().click();
      await settle(page, 1200);
      let doc = await savedDoc(page);
      equal(doc.theme?.style, "ios", "the style picked");
      equal(bySlug(doc, "button-group")[0].look, undefined, "the look the style rules out is gone");
      const notice = page.locator("[data-note-action], [data-toast-action]").first();
      check(await notice.count(), "the notice offers an undo");
      await notice.click();
      await settle(page, 2500);
      doc = await savedDoc(page);
      equal(doc.theme?.style, undefined, "the notice's undo took the style back");
      check(bySlug(doc, "button-group")[0].look, "and the look with it");

      await page.locator('[role="button"][aria-label="iOS"]').first().click();
      await settle(page, 6000);
      doc = await savedDoc(page);
      equal(doc.theme?.style, "ios", "picked again");
      const kit = doc.groups.find((g) => g.kit?.slug === "labeled-field");
      check(kit, "the kit is still marked as the kit it was added as");
      await undo(page);
      await settle(page, 2500);
      doc = await savedDoc(page);
      equal(doc.theme?.style, undefined, "the toolbar's undo took the style back");
      equal(JSON.stringify(doc.groups.map((g) => g.id)), JSON.stringify(before.groups.map((g) => g.id)), "the same parts as before the style");
      await redo(page);
      await settle(page, 2500);
      equal((await savedDoc(page)).theme?.style, "ios", "redone");
    },
  },
  {
    name: "the language changes the seed words, and undo after it",
    async run({ page }) {
      await clickAdd(page, "Button");
      let doc = await savedDoc(page);
      equal(doc.groups.length, 8, "a button added");
      equal(doc.frames[0].name, "Home", "the screen's default name in English");
      await page.locator('aside button[title="Language"]').first().click();
      await page.locator('[role="menuitemradio"]').filter({ hasText: "中文" }).first().click();
      await settle(page, 1200);
      doc = await savedDoc(page);
      equal(doc.frames[0].name, "首页", "the screen's default name in Chinese");
      equal((doc.groups[0].items[0].props as { title?: string }).title, "收件箱", "the app bar's seed title in Chinese");
      check(await undoButton(page).isEnabled(), "the add can still be undone");
      await undo(page);
      doc = await savedDoc(page);
      equal(doc.groups.length, 7, "the add undone");
      equal(doc.frames[0].name, "首页", "the step brought back is in Chinese too");
      equal((doc.groups[0].items[0].props as { title?: string }).title, "收件箱", "its seed words too");
      await redo(page);
      equal((await savedDoc(page)).groups.length, 8, "redone");
      await page.locator('aside button[title="语言"]').first().click();
      await page.locator('[role="menuitemradio"]').filter({ hasText: "English" }).first().click();
      await settle(page, 1200);
      doc = await savedDoc(page);
      equal(doc.frames[0].name, "Home", "back in English");
      equal((doc.groups[0].items[0].props as { title?: string }).title, "Inbox", "the seed title back in English");
    },
  },
  {
    name: "a style of the document's own: copied from the one worn, edited, undone, kept on reload",
    async run({ page }) {
      await leftTab(page, "Style");
      await page.locator('[role="button"][aria-label="iOS"]').first().click();
      await settle(page, 1200);
      await page.locator("[data-style-duplicate]").first().click();
      await settle(page, 1200);
      let doc = await savedDoc(page);
      const key = doc.theme?.style ?? "";
      check(key.startsWith("custom:"), `the copy is worn (${key})`);
      equal(doc.styles?.map((s) => s.key), [key], "and kept in the document");
      /* iOS's white on its blue is loud: the copy is a style all the same, and the accessibility check says it falls short */
      const editor = page.locator(`[data-custom-style-editor="${key}"]`).first();
      equal(await editor.locator("[data-style-access]").getAttribute("data-style-access"), "issues", "the colors do not pass the accessibility check");
      check(/fall short/.test(await editor.locator("[data-style-access]").innerText()), "and it says so, the style still usable");
      equal(await editor.locator('[data-style-role="primary"] [data-contrast]').first().getAttribute("data-contrast"), "low", "the button's words marked faint, loud as they are");

      /* two edits in a row, a moment apart: one step */
      await page.locator("[data-style-name]").first().fill("Mine");
      await page.locator("[data-style-seed]").first().fill("#b00020");
      await settle(page);
      doc = await savedDoc(page);
      equal(doc.styles?.[0].name.en, "Mine", "renamed in place");
      equal(doc.styles?.[0].seed, "#B00020", "its seed changed in place");
      equal(doc.theme?.style, key, "still the one worn");

      /* the edits to the style worn are one step, the copy another */
      await undo(page);
      await settle(page);
      doc = await savedDoc(page);
      check(doc.styles?.[0].name.en !== "Mine", "the edits undone together");
      equal(doc.theme?.style, key, "the copy still worn");
      await undo(page);
      await settle(page, 1200);
      doc = await savedDoc(page);
      equal(doc.theme?.style, "ios", "the copy undone: iOS again");
      equal(doc.styles, undefined, "and no style of the document's own");
      await redo(page);
      await redo(page);
      await settle(page, 1200);
      doc = await savedDoc(page);
      equal([doc.theme?.style, doc.styles?.[0].name.en], [key, "Mine"], "both redone");

      await reload(page);
      doc = await savedDoc(page);
      equal([doc.theme?.style, doc.styles?.[0].name.en], [key, "Mine"], "kept on reload");
      await leftTab(page, "Style");
      equal(await page.locator(`[data-custom-style-editor="${key}"] [data-style-name]`).first().inputValue(), "Mine", "the panel edits it again");
    },
  },
];
