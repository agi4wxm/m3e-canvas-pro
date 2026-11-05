/* Writes the catalogs of parts, screen templates and styles into public/agent.md, between their markers. Run with bun. */
import { readFileSync, writeFileSync } from "node:fs";
import { partCatalog } from "../parts/catalog";
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

writeFileSync(file, between(between(between(readFileSync(file, "utf8"), "parts", partCatalog()), "templates", templateCatalog()), "styles", styleCatalog()));
