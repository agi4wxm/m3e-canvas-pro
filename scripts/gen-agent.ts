/* Writes the catalogs of parts, kits, screen templates and styles into public/agent.md, between their markers. Run with bun. */
import { readFileSync, writeFileSync } from "node:fs";
import { partCatalog } from "../parts/catalog";
import { kitCatalog } from "../parts/kits";
import { templateCatalog } from "../parts/templates";
import { styleCatalog } from "../lib/styles";

const file = new URL("../public/agent.md", import.meta.url);

function between(guide: string, name: string, body: string): string {
  const begin = `<!-- ${name}:begin -->`;
  const end = `<!-- ${name}:end -->`;
  const a = guide.indexOf(begin);
  const b = guide.indexOf(end);
  if (a < 0 || b < 0) throw new Error("public/agent.md has lost its markers");
  return `${guide.slice(0, a + begin.length)}\n\n${body}\n\n${guide.slice(b)}`;
}

const sections: [string, string][] = [
  ["parts", partCatalog()],
  ["kits", kitCatalog()],
  ["templates", templateCatalog()],
  ["styles", styleCatalog()],
];

writeFileSync(
  file,
  sections.reduce((guide, [name, body]) => between(guide, name, body), readFileSync(file, "utf8")),
);
