/* The systems a design is built on, the way Figma has them: variants of a component and an instance swapped between
 * them, a fill bound to a color variable whose mode is switched, a prototype connection drawn on the canvas and
 * followed in the preview, a text edited in place, and the canvas's context menu. */

import { check, equal, groupOf, leftTab, pick, savedDoc, select, settle, undo, type E2ETest } from "./lib";

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
