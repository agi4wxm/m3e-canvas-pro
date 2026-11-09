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
import { DiskAssets } from "../mcp/src/assets";
import { diskContractIndex } from "../mcp/src/hub";
import { exportToFolder, FolderRefused, reportLines } from "../lib/export/nodeWriter";
import { differenceLines } from "../lib/export/differences";
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

const store = new ProjectFileStore(project);
const doc = await store.read();
if (!doc) {
  console.error(`${project} is not an M3E Canvas project`);
  process.exit(1);
}
try {
  /* the asset pipeline's manifest, where the project's configuration says (beside the project file by default) */
  const assets = await new DiskAssets().refresh(store.projectDir, doc);
  for (const p of assets.manifest ? assets.problems : []) console.warn(`asset manifest: ${p}`);
  /* the hub's contract index, where the project's configuration says (beside the project file by default) */
  const index = await diskContractIndex(store.projectDir, doc);
  if (index.status === "missing" || index.status === "invalid") console.warn(`contract index: ${index.path} ${index.status === "missing" ? "is not there" : `is no index (${index.problems.slice(0, 3).join("; ")})`}`);
  const product = await buildProduct(doc, {}, { lang, read: (path) => readFile(join(ROOT, path), "utf8"), assets: assets.manifest, contractIndex: index.status === "read" ? index.index : null });
  for (const w of product.warnings) console.warn(`warning: ${w}`);
  const done = await exportToFolder(out, product, { force: values.force });
  console.log(`${product.name} → ${done.dir}`);
  for (const line of reportLines(done)) console.log(line);
  for (const line of differenceLines(product.differences)) console.log(`differs: ${line}`);
} catch (e) {
  console.error(e instanceof FolderRefused ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
}
