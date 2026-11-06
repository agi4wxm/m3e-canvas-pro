/* The editor's source files a product export copies (lib/export/sourceList.ts names them). Run from source
 * (`bun mcp/src/cli.ts`), they are read from the checkout; the bundle (mcp/build.ts) replaces this module with one
 * that carries them inside it, so the published server exports without a checkout. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExportSource } from "../../lib/export/sourceList";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** an editor source file's text by its path from the repo's root; only one an export may copy */
export async function readEditorSource(path: string): Promise<string> {
  if (!isExportSource(path)) throw new Error(`no such source: ${path}`);
  return readFile(join(ROOT, path), "utf8");
}
