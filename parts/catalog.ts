import { choiceValueOf } from "./labels";
import { CATEGORIES, PARTS } from "./registry";
import type { PropDef } from "./types";

/* Every part and what it takes, in words an AI agent can write a document from. public/agent.md holds
 * this between its markers (`bun run gen:agent` writes it, parts/catalog.test.ts keeps it in step), so
 * a new part reaches the agent the moment it is in PARTS. */

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

export function partCatalog(): string {
  return CATEGORIES.map((category) => {
    const rows = PARTS.filter((d) => d.category === category).map((d) => `| \`${d.slug}\` | ${d.name} | ${d.props.map(propOf).join("; ").replaceAll("|", "\\|")} |`);
    return [`#### ${category}`, "", "| component | what it is | props (all optional) |", "|---|---|---|", ...rows].join("\n");
  }).join("\n\n");
}
