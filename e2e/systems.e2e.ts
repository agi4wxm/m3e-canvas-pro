/* The systems a design is built on, the way Figma has them: variants of a component and an instance swapped between
 * them, a fill bound to a color variable whose mode is switched, a prototype connection drawn on the canvas and
 * followed in the preview, a text edited in place, and the canvas's context menu. */

import { center, check, clickAdd, drag, equal, groupOf, leftTab, nodeBox, partTab, pick, savedDoc, screenBox, select, selectScreen, settle, undo, type E2ETest } from "./lib";

export const tests: E2ETest[] = [
  {
    name: "variants: a component made a set, an instance swapped between them and back to the main component",
    async run({ page }) {
      await select(page, "seed3");
      await select(page, "seed4", true);
      await page.locator("[data-make-component]").first().click();
      await settle(page);
      let doc = await savedDoc(page);
      const first = doc.components![0];
      const inst = doc.groups.find((g) => g.instanceOf === first.id)!;

      /* a second variant, from the Components tab */
      await leftTab(page, "Components");
      await page.locator(`[data-component="${first.id}"] button[title="Add variant"]`).first().click();
      await settle(page);
      doc = await savedDoc(page);
      equal(doc.components?.length, 2, "the component and its new variant");
      const second = doc.components![1] as { id: string; set?: string; variant?: Record<string, string> };
      check(second.set && (doc.components![0] as { set?: string }).set === second.set, "both are variants of one set");
      equal(second.variant, { "Property 1": "Variant 2" }, "the new variant's values");

      /* the instance picks the other variant from its panel */
      await leftTab(page, "Layers");
      await select(page, inst.items[0].id);
      await pick(page, "Property 1", "Variant 2");
      doc = await savedDoc(page);
      equal(groupOf(doc, inst.items[0].id)?.instanceOf, second.id, "the instance shows the second variant");
      await undo(page);
      equal(groupOf(await savedDoc(page), inst.items[0].id)?.instanceOf, first.id, "one undo swaps it back");

      /* to the main component and back to the instance */
      await select(page, inst.items[0].id);
      await page.locator("[data-go-to-main]").first().click();
      await settle(page, 1500);
      check(await page.locator("[data-definition-bar]").first().isVisible(), "the main component is open");
      await page.locator("[data-back-to-instance]").first().click();
      await settle(page, 1500);
      check(!(await page.locator("[data-definition-bar]").count()), "back on the document's screens");
      check(await page.locator(`[data-node="${inst.items[0].id}"]`).first().isVisible(), "the instance is on the canvas again");
      await leftTab(page, "Parts");
    },
  },
];

tests.push({
  name: "variables: a fill bound to a color variable, the mode switched, the preview showing it",
  async run({ page }) {
    await leftTab(page, "Variables");
    await page.locator('button[title="New collection"]').first().click();
    await settle(page);
    let doc = await savedDoc(page);
    const collections = (doc as { varCollections?: { id: string; modes: { id: string; name: string }[] }[] }).varCollections ?? [];
    const theme = collections[collections.length - 1];
    equal(theme?.modes.map((m) => m.name), ["Light", "Dark"], "a collection with a light and a dark mode");
    await page.locator('[data-add-var="color"]').first().click();
    await settle(page);
    /* the value in the dark mode, typed as a hex */
    await page.locator('[data-var-mode="Dark"] [data-color-pick] > button').first().click();
    await settle(page, 300);
    await page.locator('[data-var-mode="Dark"] [data-color-pick] input:not([type])').first().fill("#e91e63");
    await settle(page);
    doc = await savedDoc(page);
    const v = (doc.vars as { id: string; name: string; type: string; value: string; modes?: Record<string, string> }[]).find((x) => x.type === "color")!;
    equal(v.modes?.[theme.modes[1].id], "#e91e63", "the variable's dark value");

    /* a box, its fill bound to the variable */
    await clickAdd(page, "Box");
    doc = await savedDoc(page);
    const box = doc.groups.flatMap((g) => g.items).find((it) => it.component === "box")!;
    await page.locator('[data-bind-field="@fill"] button').first().click();
    await settle(page, 300);
    await page.locator(`[data-bind-to="${v.name}"]`).first().click();
    await settle(page);
    doc = await savedDoc(page);
    equal((doc.groups.flatMap((g) => g.items).find((it) => it.id === box.id) as { bind?: Record<string, string> }).bind, { "@fill": v.id }, "the fill is bound");

    /* the document shows the dark mode; the preview paints the box with the dark value */
    await leftTab(page, "Variables");
    await pick(page, "Variable modes of the document", "Dark");
    equal((await savedDoc(page) as { varModes?: Record<string, string> }).varModes, { [theme.id]: theme.modes[1].id }, "the document's mode");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");
    await settle(page, 1800);
    const paint = await page.locator(`[data-preview-group] [data-part="${box.id}"] [data-slot="box"]`).first().evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage));
    check(paint[0]?.includes("rgb(233, 30, 99)"), `the preview paints the box pink, it paints ${paint[0]}`);
    await page.keyboard.press("Escape");
    await settle(page, 800);
    await leftTab(page, "Parts");
  },
});

tests.push({
  name: "prototype: a connection dragged from a part to a screen, edited in place and followed in the preview",
  async run({ page }) {
    await page.locator('button[title="Add screen"]').first().click();
    await settle(page);
    await page.locator('button[title="Fit"]').first().click();
    await settle(page);
    let doc = await savedDoc(page);
    const [home, second] = doc.frames;
    await select(page, "seed3");
    await partTab(page, "Prototype");
    const handle = await page.locator("[data-connect-handle]").first().boundingBox();
    check(handle, "the handle that connects, on the selected part");
    const target = await screenBox(page, second.id);
    await drag(page, center(handle), { x: target.x + target.width / 2, y: target.y + target.height / 3 }, 18);
    doc = await savedDoc(page);
    const row = doc.groups.flatMap((g) => g.items).find((it) => it.id === "seed3")!;
    equal(row.action?.to, second.id, "the row goes to the second screen");

    /* the connection is edited where it is drawn */
    check(await page.locator("[data-connection-box]").first().isVisible(), "the box on the connection");
    await page.locator('[data-connection-box] button[aria-label="Animation"]').first().click();
    await settle(page, 250);
    await page.locator('[role="listbox"] [role="option"]').filter({ hasText: "Push" }).first().click();
    await settle(page);
    doc = await savedDoc(page);
    equal((doc.groups.flatMap((g) => g.items).find((it) => it.id === "seed3")!.action as { motion?: unknown }).motion, { kind: "push", dir: "left" }, "the connection pushes the screen in");

    /* followed in the preview */
    await page.keyboard.press("Escape");
    await selectScreen(page, home.id);
    await page.keyboard.press("p");
    await settle(page, 1800);
    await page.locator('[data-preview-active] [data-part="seed3"]').first().click();
    await settle(page, 1500);
    equal(await page.locator("[data-preview-active]").first().getAttribute("data-preview-screen"), second.id, "the preview went to the second screen");
    await page.keyboard.press("Escape");
    await settle(page, 1000);
  },
});

tests.push({
  name: "inline text: a text part's words edited where they stand, by a double-click",
  async run({ page }) {
    await clickAdd(page, "Text");
    let doc = await savedDoc(page);
    const text = doc.groups.flatMap((g) => g.items).find((it) => it.component === "text")!;
    const b = await nodeBox(page, text.id);
    await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
    await settle(page, 400);
    const field = page.locator(`[data-text-editor="${text.id}"]`).first();
    check(await field.isVisible(), "the field over the words");
    await field.fill("Written in place");
    await field.press("Enter");
    await settle(page);
    doc = await savedDoc(page);
    equal(doc.groups.flatMap((g) => g.items).find((it) => it.id === text.id)?.props?.text, "Written in place", "the words changed");
    check(!(await page.locator("[data-text-editor]").count()), "the field is gone");
    /* Escape lets the words go */
    await page.mouse.dblclick(b.x + 10, b.y + b.height / 2);
    await settle(page, 400);
    await page.locator(`[data-text-editor="${text.id}"]`).first().fill("Not kept");
    await page.keyboard.press("Escape");
    await settle(page);
    equal((await savedDoc(page)).groups.flatMap((g) => g.items).find((it) => it.id === text.id)?.props?.text, "Written in place", "Escape keeps the words as they were");
    await undo(page);
    check((await savedDoc(page)).groups.flatMap((g) => g.items).find((it) => it.id === text.id)?.props?.text !== "Written in place", "one undo takes the edit back");
  },
});

tests.push({
  name: "context menu: a right-click on a part, Duplicate",
  async run({ page }) {
    let doc = await savedDoc(page);
    const before = doc.groups.length;
    const b = await nodeBox(page, "seed3");
    await page.keyboard.down("Control");
    await page.mouse.click(b.x + 20, b.y + 14, { button: "right" });
    await page.keyboard.up("Control");
    await settle(page, 400);
    check(await page.locator('[data-context-menu="0"]').first().isVisible(), "the menu at the pointer");
    await page.locator('[data-menu-item="duplicate"]').first().click();
    await settle(page);
    doc = await savedDoc(page);
    equal(doc.groups.length, before + 1, "one more part on the canvas");
    check(!(await page.locator("[data-context-menu]").count()), "the menu closed");
  },
});
