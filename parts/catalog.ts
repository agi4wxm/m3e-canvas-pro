import { choiceValueOf } from "./labels";
import { CATEGORY_TEXT, TIERS, TIER_TEXT, categoriesOf, OFFERED_PARTS, PARTS } from "./registry";
import type { PartDef, PropDef } from "./types";

/* Every part and what it takes, in words an AI agent can write a document from. public/agent.md holds
 * this between its markers (`bun run gen:agent` writes it, parts/catalog.test.ts keeps it in step), so
 * a new part reaches the agent the moment it is in PARTS. The parts come in their two tiers: atoms,
 * which a design composes in boxes, and composites, which are ready-made. */

function propOf(d: PropDef): string {
  switch (d.kind) {
    case "text":
      return `\`${d.key}\` text`;
    case "enum":
      return `\`${d.key}\` ${d.options.map(choiceValueOf).join(" / ")}`;
    case "bool":
      return `\`${d.key}\` true / false`;
    case "number":
      return `\`${d.key}\` ${d.min}–${d.max}`;
    case "icon":
      return `\`${d.key}\` icon`;
    case "image":
      return `\`${d.key}\` https address`;
    case "list":
      return `\`${d.key}\` rows of \`{ "label"${d.icons ? `, "icon"` : ""} }\``;
    case "table":
      return `\`${d.key}\` \`{ "columns": [${d.default.columns.map((c) => JSON.stringify(c)).join(", ")}], "rows": [[…]] }\``;
  }
}

/** what a part sends out besides taps, and what it only acts out in a prototype (docs/边界与契约.md) */
const outletsOf = (d: PartDef) =>
  [...(d.events ?? []).map((e) => ` *(event \`on:${e.name}\`${Object.keys(e.payload ?? {}).length ? `: ${Object.keys(e.payload!).map((k) => `event.${k}`).join(", ")}` : ""})*`), ...(d.families ?? []).map((f) => ` *(\`${f.prefix}:*\` for every entry: slot.index)*`), d.demo ? ` *(prototype demo until ${d.demo.takenOverBy.map((k) => `\`${k}\``).join(" or ")} is bound)*` : ""].join("");

/** what a tier is, in a line */
const TIER_NOTE = {
  atom: "They cannot be split. Compose them in `box`es to build anything the composites do not have.",
  composite: "Ready-made, each one part. The ones marked *(splits)* can be split into atoms in the editor.",
};

/** The retired parts, which an old design may still hold: not to be written, each with what to build instead
 *  (parts/defs/retired.ts). */
function retiredCatalog(): string {
  const rows = PARTS.filter((d) => d.retired).map((d) => `| \`${d.slug}\` | ${d.name} | ${d.retired!.use} |`);
  return [
    "#### Retired",
    "",
    "Old designs may still hold these parts; they draw as they did, but never write one. Build what each did from atoms and kits, its rows as data and its taps as actions, and a resizable's panes with a split-view. In the editor, `split_retired` turns an old design's into atoms, and a resizable into a split view.",
    "",
    "| component | what it was | build instead |",
    "|---|---|---|",
    ...rows,
  ].join("\n");
}

export function partCatalog(): string {
  const tiers = TIERS.map((tier) => {
    const sections = categoriesOf(tier).map((category) => {
      const rows = OFFERED_PARTS.filter((d) => d.category === category).map((d) => `| \`${d.slug}\` | ${d.name}${d.atoms ? " *(splits)*" : ""}${outletsOf(d)} | ${d.props.map(propOf).join("; ").replaceAll("|", "\\|")} |`);
      return [`##### ${CATEGORY_TEXT[category].en}`, "", "| component | what it is | props (all optional) |", "|---|---|---|", ...rows].join("\n");
    });
    return [`#### ${TIER_TEXT[tier].en}`, "", TIER_NOTE[tier], "", sections.join("\n\n")].join("\n");
  });
  return [...tiers, retiredCatalog()].join("\n\n");
}
