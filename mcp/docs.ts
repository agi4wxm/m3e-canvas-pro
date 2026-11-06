/* Writes the tool list into docs/MCP.md from the registry: bun run mcp:docs (`--check` only says whether it is behind). */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setGlobalLang } from "../lib/i18n";
import { withTable } from "./src/toolTable";

setGlobalLang("en");
const path = fileURLToPath(new URL("../docs/MCP.md", import.meta.url));
const was = readFileSync(path, "utf8");
const next = withTable(was);
if (process.argv.includes("--check")) {
  if (next !== was) {
    console.error("docs/MCP.md is behind the registry: run bun run mcp:docs");
    process.exit(1);
  }
} else if (next !== was) {
  writeFileSync(path, next);
  console.log("wrote the tool list into docs/MCP.md");
} else console.log("docs/MCP.md is up to date");
