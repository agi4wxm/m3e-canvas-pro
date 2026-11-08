/* The panels' fields hold what is typed (report 5.4, stage 0): a number keeps the decimals its step allows -- 4.5 in a
 * number variable, a rating of 4.5 on a step of 0.1. */

import { bySlug, check, clickAdd, equal, leftTab, savedDoc, select, settle, type E2ETest } from "./lib";

export const tests: E2ETest[] = [
  {
    name: "panels: a number variable keeps 4.5, a rating on a step of 0.1 keeps 4.5",
    async run({ page }) {
      await leftTab(page, "Variables");
      await page.locator('[data-add-var="number"]').first().click();
      await settle(page);
      const value = page.locator('[data-variables-panel] [data-var-mode] input[type="number"]').first();
      await value.click();
      await value.fill("4.5");
      await value.press("Enter");
      await settle(page);
      const vars = ((await savedDoc(page)).vars ?? []) as { type: string; value: unknown }[];
      equal(vars.find((v) => v.type === "number")?.value, 4.5, "the variable holds 4.5");

      await leftTab(page, "Parts");
      await clickAdd(page, "Product card");
      const card = bySlug(await savedDoc(page), "product-card")[0];
      check(card, "a product card is added");
      await select(page, card.id);
      const rating = page.locator('aside input[type="number"][aria-label="Rating"]').first();
      await rating.click();
      await rating.fill("4.5");
      await rating.press("Enter");
      await settle(page);
      equal(bySlug(await savedDoc(page), "product-card")[0].props?.rating, 4.5, "the rating holds 4.5");
      await rating.click();
      await rating.fill("3.75");
      await rating.press("Enter");
      await settle(page);
      equal(bySlug(await savedDoc(page), "product-card")[0].props?.rating, 3.8, "to the step's one place");
    },
  },
];
