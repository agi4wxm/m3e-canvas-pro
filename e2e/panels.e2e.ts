/* The panels' fields hold what is typed (report 5.4, stage 0): a table's text keeps a cell with a comma in it as one
 * cell and a line just started, and a number keeps the decimals its step allows -- 4.5 in a number variable, a
 * rating of 4.5 on a step of 0.1. */

import { join } from "node:path";
import { bySlug, check, clickAdd, equal, leftTab, savedDoc, select, settle, tile, type E2ETest } from "./lib";

type Table = { columns: string[]; rows: string[][] };

export const tests: E2ETest[] = [
  {
    name: "panels: a table's text keeps \"$1,350.00\" in one cell and a new line as it is typed",
    async run({ page, out }) {
      /* added by hand: the table has a search box of its own, which the palette's helpers would take for the palette's */
      await (await tile(page, "Data table")).click();
      await settle(page);
      await page.locator('aside input[aria-label="Search"]').first().fill("");
      const table = bySlug(await savedDoc(page), "data-table")[0];
      check(table, "a data table is added");
      await select(page, table.id);
      const field = page.locator('aside textarea[aria-label="Rows"]').first();
      check((await field.inputValue()).includes('"$1,350.00"'), "the amount with a comma is shown in quotes");

      /* a new row typed at the end, a quoted amount with a comma in it */
      await field.click();
      await field.press("Control+End");
      const typed = '\nA-1008, Ada Lovelace, Paid, "$2,000.00"';
      await field.pressSequentially(typed, { delay: 15 });
      await settle(page, 600);
      check((await field.inputValue()).endsWith(typed), `the words stay as typed: ${JSON.stringify((await field.inputValue()).slice(-60))}`);
      const data = bySlug(await savedDoc(page), "data-table")[0].props?.data as Table;
      equal(data.rows.find((r) => r[0] === "A-1003"), ["A-1003", "Alan Turing", "Paid", "$1,350.00"], "the old amount is one cell still");
      equal(data.rows[data.rows.length - 1], ["A-1008", "Ada Lovelace", "Paid", "$2,000.00"], "the new row, its amount one cell");
      check(data.rows.every((r) => r.length === data.columns.length), "no row has grown a column");
      await page.screenshot({ path: join(out, "panels-1-table.png") });
    },
  },
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
