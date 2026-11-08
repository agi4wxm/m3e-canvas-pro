/* The editor's own changes go through the document's operations, as the agent's and MCP's do (report ED-3, the
 * `store.update` calls of src/Editor.tsx): a style's layout setting is `set_style_layout`, one step with the layout
 * it brings, so one undo takes back both and not the layout alone. */

import { check, equal, leftTab, pick, savedDoc, settle, undo, type E2ETest } from "./lib";

const placeOf = (doc: unknown) => (doc as { theme?: { ux?: { place?: string } } }).theme?.ux?.place;
const where = (doc: Awaited<ReturnType<typeof savedDoc>>) => doc.groups.map((g) => `${g.id}:${Math.round(g.x)},${Math.round(g.y)}`).join(" ");

export const tests: E2ETest[] = [
  {
    name: "commands: a style's layout setting and the layout it brings are one undo step",
    async run({ page }) {
      const before = await savedDoc(page);
      await leftTab(page, "Style");
      await pick(page, "Where the body gathers", "In the middle");
      await settle(page, 1200);
      const moved = await savedDoc(page);
      equal(placeOf(moved), "center", "the setting is in the document");
      check(where(moved) !== where(before), "the screen's body gathered in the middle");
      await undo(page);
      await settle(page, 1200);
      const back = await savedDoc(page);
      equal(where(back), where(before), "one undo puts the parts back");
      check(placeOf(back) !== "center", `and the setting with them: ${placeOf(back)}`);
    },
  },
];
