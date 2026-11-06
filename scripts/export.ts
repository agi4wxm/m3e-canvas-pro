// bun scripts/export.ts <project file or folder> <output folder> [--lang ja|en|zh|ko] [--force]
//
// Exports a project as a whole product (an npm workspaces monorepo, lib/export) into a folder, the way the editor's
// "完整产品（monorepo）" does. Exporting again into the same folder rewrites only the generated files nobody changed:
// custom code (server/src/handlers, the custom/ folders) is never touched, and a generated file someone edited is left
// as it is, with the new version beside it as <file>.m3e-new (listed below as a conflict). A folder that holds other
// things and no export (.m3e/manifest.json) is refused unless --force.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ProjectFileStore } from "../mcp/src/fileStore";
import { exportToFolder, FolderRefused, reportLines } from "../lib/export/nodeWriter";
import { buildProduct } from "../lib/export/product";
import { isLang, setGlobalLang } from "../lib/i18n";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const { values, positionals } = parseArgs({ args: process.argv.slice(2), options: { lang: { type: "string" }, force: { type: "boolean" } }, allowPositionals: true });
const [project, out] = positionals;
if (!project || !out) {
  console.error("usage: bun scripts/export.ts <project file or folder> <output folder> [--lang ja|en|zh|ko] [--force]");
  process.exit(2);
}
const lang = isLang(values.lang) ? values.lang : "en";
setGlobalLang(lang);

const doc = await new ProjectFileStore(project).read();
if (!doc) {
  console.error(`${project} is not an M3E Canvas project`);
  process.exit(1);
}
try {
  const product = await buildProduct(doc, {}, { lang, read: (path) => readFile(join(ROOT, path), "utf8") });
  for (const w of product.warnings) console.warn(`warning: ${w}`);
  const done = await exportToFolder(out, product, { force: values.force });
  console.log(`${product.name} → ${done.dir}`);
  for (const line of reportLines(done)) console.log(line);
} catch (e) {
  console.error(e instanceof FolderRefused ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
}
