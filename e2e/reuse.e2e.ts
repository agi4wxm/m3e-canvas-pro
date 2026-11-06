/* Reuse and data: a component made of two rows, an instance of it, its definition edited and undone as one step,
 * detached; a collection repeated by a layout and played in the preview, where a tap on a row goes to another screen. */

import { check, clickAdd, dragAdd, equal, groupOf, kidsOf, leftTab, nodeBox, partTab, pick, redo, savedDoc, select, settle, undo, center, type E2ETest } from "./lib";

const description = (doc: Awaited<ReturnType<typeof savedDoc>>) =>
  (doc.components?.[0]?.groups ?? []).flatMap((g) => g.items).map((it) => (it.props as { description?: string } | undefined)?.description);

export const tests: E2ETest[] = [
  {
    name: "a component, an instance of it, its definition edited, detached",
    async run({ page }) {
      await select(page, "seed3");
      await select(page, "seed4", true);
      await page.locator("[data-make-component]").first().click();
      await settle(page);
      let doc = await savedDoc(page);
      equal(doc.components?.length, 1, "one definition");
      const def = doc.components![0];
      equal(def.groups.length, 2, "the definition holds the two rows");
      equal(doc.groups.filter((g) => g.instanceOf === def.id).length, 1, "an instance stands where they were");

      await leftTab(page, "Components");
      await page.locator(`[data-component-tile="${def.id}"]`).first().click();
      await settle(page);
      doc = await savedDoc(page);
      const instances = doc.groups.filter((g) => g.instanceOf === def.id);
      equal(instances.length, 2, "a second instance added from the tab");
      await leftTab(page, "Parts");

      /* the definition opened from an instance, one of its rows changed */
      const inst = instances[1].items[0].id;
      await page.locator(`[data-node="${inst}"]`).first().dblclick();
      await settle(page, 1500);
      check(await page.locator("[data-definition-bar]").first().isVisible(), "the definition is being edited");
      const rowId = def.groups[0].items[0].id;
      await select(page, rowId);
      await page.locator('aside input[aria-label="Supporting text"]').first().fill("Changed in the definition");
      await settle(page);
      await page.locator("[data-definition-done]").first().click();
      await settle(page, 1500);
      doc = await savedDoc(page);
      check(description(doc).includes("Changed in the definition"), "the definition changed");
      check(!(await page.locator("[data-definition-bar]").count()), "back on the document's screens");
      await undo(page);
      check(!description(await savedDoc(page)).includes("Changed in the definition"), "one undo takes the whole edit back");
      await redo(page);
      check(description(await savedDoc(page)).includes("Changed in the definition"), "and a redo brings it again");

      /* detached, the instance is plain parts */
      await select(page, inst);
      await page.locator("[data-instance-detach]").first().click();
      await settle(page);
      doc = await savedDoc(page);
      equal(doc.groups.filter((g) => g.instanceOf === def.id).length, 1, "one instance left after detaching the other");
      check(doc.groups.flatMap((g) => g.items).some((it) => (it.props as { description?: string } | undefined)?.description === "Changed in the definition"), "the detached rows show the definition's words");
    },
  },
  {
    name: "a collection repeated by a layout, and a tap on a row in the preview",
    async run({ page }) {
      await leftTab(page, "Data");
      await page.locator("[data-add-collection]").first().click();
      await settle(page);
      let doc = await savedDoc(page);
      equal(doc.collections?.length, 1, "a collection");
      equal(doc.collections![0].rows.length, 3, "its three starting rows");

      await clickAdd(page, "Box");
      doc = await savedDoc(page);
      const box = doc.groups.find((g) => g.items[0].component === "box")!;
      await dragAdd(page, "Text", center(await nodeBox(page, box.items[0].id)));
      doc = await savedDoc(page);
      const text = kidsOf(doc, box.id)[0]?.items[0];
      check(text, "a text in the box");
      await select(page, text.id);
      await page.locator('aside textarea[aria-label="Text"], aside input[aria-label="Text"]').first().fill("{{title}}");
      await settle(page);
      await pick(page, "Repeat", "Data 1");
      doc = await savedDoc(page);
      equal(groupOf(doc, box.items[0].id)!.repeat?.collection, doc.collections![0].id, "the box repeats the collection");

      /* a second screen for the rows to open */
      await page.locator('button[title="Add screen"]').first().click();
      await settle(page);
      await page.locator('button[title="Fit"]').first().click();
      await settle(page);
      await select(page, text.id);
      await partTab(page, "Trigger");
      await pick(page, "Tap action", "Screen 2");
      doc = await savedDoc(page);
      equal(doc.groups.flatMap((g) => g.items).find((it) => it.id === text.id)?.action?.to, doc.frames[1].id, "the row goes to the second screen");

      /* the preview draws a row for each of the data's rows; a tap on one goes to the second screen */
      await page.keyboard.press("Escape");
      await page.keyboard.press("p");
      await settle(page, 1800);
      for (const word of ["A", "B", "C"]) check(await page.locator(`[data-preview-group] :text-is("${word}")`).count(), `the preview shows the row ${word}`);
      await page.locator(`[data-preview-group] :text-is("B")`).first().click();
      await settle(page, 1500);
      equal(await page.locator(`[data-preview-group] :text-is("B")`).count(), 0, "the second screen shows after the tap");
      await page.keyboard.press("Escape");
      await settle(page, 1000);
      await undo(page);
      equal((await savedDoc(page)).groups.flatMap((g) => g.items).find((it) => it.id === text.id)?.action, undefined, "the tap undone");
    },
  },
];
