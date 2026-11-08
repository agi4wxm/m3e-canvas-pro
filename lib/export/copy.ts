/* The product's own runtime pieces that are the same in every export are real files of this repo: lib/export/files/ for
 * the packages and the web app, rn/src/app for the mobile app (typechecked and linted with the React Native kit, whose
 * packages it needs). They are typechecked, linted and tested as code, and copied into a product as they are, the way
 * packages/app-runtime copies lib/app. What a file says only to the editor is on its first lines, each starting with `//!`; an
 * export leaves those out. The product's packages are named `@m3e/api`, `@m3e/app-runtime`, `@m3e/mocks` there (the
 * editor's tsconfig.json and vitest.config.ts map them to lib/export/files/api and lib/export/files/appRuntime) and get
 * the product's scope when copied. A file that differs by what a document uses holds the differences as optional
 * regions (lib/export/regions.ts): filledFile keeps or drops them and fills in the document's values, so it is still one
 * real file (the web app's runtime, lib/export/files/web/runtime.tsx; the mobile app's root, routing, runtime, contract
 * and effects in rn/src/app). Everything else of a product is printed from the design (lib/export/targets). */

import { GENERATED } from "./code";
import { fillRegions, type Flags } from "./regions";

/** where the files are, from the repo's root */
export const FILES_DIR = "lib/export/files";

/** the packages of a product the files name, by their names in the files */
const PACKAGE_IMPORT = /^((?:import|export)\s[^;]*?\sfrom\s)"@m3e\/(api|app-runtime|mocks)((?:\/[\w./-]+)?)"$/gm;

/** a file without what it says only to the editor: its first lines that start with `//!` */
export function editorNotesOut(text: string): string {
  const lines = text.split("\n");
  let at = 0;
  while (at < lines.length && lines[at].startsWith("//!")) at++;
  return lines.slice(at).join("\n");
}

/** A file as a product has it: the editor's notes left out, the product's packages under its scope. Only the module of
 *  an import or export statement is changed, as the mini-program kit's are (lib/export/miniapp/kitFiles.ts). */
export function productFile(text: string, scope: string): string {
  return editorNotesOut(text).replace(PACKAGE_IMPORT, (_, head: string, pkg: string, sub: string) => `${head}${JSON.stringify(`${scope}/${pkg}${sub}`)}`);
}

/** where the mobile app's are, and its custom code's first version */
export const MOBILE_FILES_DIR = "rn/src/app";
export const MOBILE_CUSTOM_DIR = "rn/src/custom";

type CopyContext = { read: (path: string) => Promise<string>; scope: string };

/** a file by its path from the repo's root; under lib/export/files/ when it does not start with rn/ */
const sourceOf = (path: string) => (path.startsWith("rn/") ? path : `${FILES_DIR}/${path}`);

/** a file (see sourceOf) as an export writes it, under the generated header */
export async function copiedFile(ctx: CopyContext, path: string): Promise<string> {
  return `${GENERATED}\n${productFile(await ctx.read(sourceOf(path)), ctx.scope)}`;
}

/** A file with optional regions (lib/export/regions.ts) as an export writes it for a document, under the generated
 *  header: its regions kept or dropped by `flags`, its values the document's. `@@scope@@` is the product's scope. */
export async function filledFile(ctx: CopyContext, path: string, flags: Flags, values: Record<string, string> = {}): Promise<string> {
  return `${GENERATED}\n${fillRegions(productFile(await ctx.read(sourceOf(path)), ctx.scope), flags, { scope: ctx.scope, ...values }, path)}`;
}

/** a file of custom code the export writes once (no generated header), its `@@scope@@` the product's scope */
export async function seededFile(ctx: CopyContext, path: string): Promise<string> {
  return fillRegions(productFile(await ctx.read(sourceOf(path)), ctx.scope), {}, { scope: ctx.scope }, path);
}
