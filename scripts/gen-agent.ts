/* Writes the catalog of parts into public/agent.md, between its markers. Run with bun. */
import { readFileSync, writeFileSync } from "node:fs";
import { partCatalog } from "../parts/catalog";

const file = new URL("../public/agent.md", import.meta.url);
const guide = readFileSync(file, "utf8");
const begin = "<!-- parts:begin -->";
const end = "<!-- parts:end -->";
const a = guide.indexOf(begin);
const b = guide.indexOf(end);
if (a < 0 || b < 0) throw new Error("public/agent.md has lost its markers");
writeFileSync(file, `${guide.slice(0, a + begin.length)}\n\n${partCatalog()}\n\n${guide.slice(b)}`);
