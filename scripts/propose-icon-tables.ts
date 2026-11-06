/* Proposes table entries for an icon family: for every Material name the generator bundles that the
 * family's table lacks, the first of its words (scripts/icon-words.ts) the family has a glyph for.
 * A proposal is a guess by name; look at it before putting it in scripts/icon-tables/<family>.ts.
 *
 *   bun scripts/propose-icon-tables.ts sf          print proposals for the names sf lacks
 *   bun scripts/propose-icon-tables.ts sf --all    print one for every name, kept or not
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAMILIES, TABLES, type TableFamily } from "./icon-tables";
import { WORDS } from "./icon-words";
import { bundledNames } from "./gen-icon-sets";

const root = fileURLToPath(new URL("..", import.meta.url));
const family = process.argv[2] as TableFamily;
const all = process.argv.includes("--all");
if (!FAMILIES[family]) {
  console.log(`families: ${Object.keys(FAMILIES).join(" ")}`);
  process.exit(1);
}
const spec = FAMILIES[family];
const set = JSON.parse(readFileSync(join(root, "node_modules/@iconify-json", spec.prefix, "icons.json"), "utf8")) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> };
const has = (n: string) => n in set.icons || n in (set.aliases ?? {});
/* a numbered cut stands in when the plain one is missing: Remix and MingCute number their variants */
const stems = (w: string) => [w, `${w}-1`, `${w}-2`, `${w}-3`];

const table = TABLES[family];
const lines: string[] = [];
for (const name of bundledNames(root)) {
  if (!all && name in table) continue;
  const words = [...(WORDS[name] ?? name).split(/\s+/), name];
  const found = words.flatMap(stems).find((w) => spec.outline(w).some(has));
  lines.push(found ? `  ${JSON.stringify(name)}: ${JSON.stringify(found)},` : `  // ${name}: no proposal (tried ${words.join(", ")})`);
}
console.log(lines.join("\n"));
