import { choiceValueOf } from "./labels";
import { CATEGORY_TEXT, TIERS, TIER_TEXT, categoriesOf, PARTS } from "./registry";
import type { PropDef } from "./types";

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

/** what a tier is, in a line */
const TIER_NOTE = {
  atom: "They cannot be split. Compose them in `box`es to build anything the composites do not have.",
  composite: "Ready-made, each one part. The ones marked *(splits)* can be split into atoms in the editor.",
};

export function partCatalog(): string {
  return TIERS.map((tier) => {
    const sections = categoriesOf(tier).map((category) => {
      const rows = PARTS.filter((d) => d.category === category).map((d) => `| \`${d.slug}\` | ${d.name}${d.atoms ? " *(splits)*" : ""} | ${d.props.map(propOf).join("; ").replaceAll("|", "\\|")} |`);
      return [`##### ${CATEGORY_TEXT[category].en}`, "", "| component | what it is | props (all optional) |", "|---|---|---|", ...rows].join("\n");
    });
    return [`#### ${TIER_TEXT[tier].en}`, "", TIER_NOTE[tier], "", sections.join("\n\n")].join("\n");
  }).join("\n\n");
}
