/* The product's own runtime pieces that are the same in every export are real files of this repo: lib/export/files/ for
 * the packages and the web app, rn/src/app for the mobile app (typechecked and linted with the React Native kit, whose
 * packages it needs). They are typechecked, linted and tested as code, and copied into a product as they are, the way
 * packages/app-runtime copies lib/app. What a file says only to the editor is on its first lines, each starting with `//!`; an
 * export leaves those out. The product's packages are named `@m3e/api`, `@m3e/app-runtime`, `@m3e/mocks` there (the
 * editor's tsconfig.json and vitest.config.ts map them to lib/export/files/api and lib/export/files/appRuntime) and get
 * the product's scope when copied. Everything else of a product is printed from the design (lib/export/targets). */

import { GENERATED } from "./code";

/** where the files are, from the repo's root */
export const FILES_DIR = "lib/export/files";

/** the packages of a product the files name, by their names in the files */
const PACKAGE_IMPORT = /^((?:import|export)\s[^;]*?\sfrom\s)"@m3e\/(api|app-runtime|mocks)((?:\/[\w./-]+)?)"$/gm;

/** A file as a product has it: the editor's notes left out, the product's packages under its scope. Only the module of
 *  an import or export statement is changed, as the mini-program kit's are (lib/export/miniapp/kitFiles.ts). */
export function productFile(text: string, scope: string): string {
  const lines = text.split("\n");
  let at = 0;
  while (at < lines.length && lines[at].startsWith("//!")) at++;
  return lines
    .slice(at)
    .join("\n")
    .replace(PACKAGE_IMPORT, (_, head: string, pkg: string, sub: string) => `${head}${JSON.stringify(`${scope}/${pkg}${sub}`)}`);
}

/** where the mobile app's are */
export const MOBILE_FILES_DIR = "rn/src/app";

/** a file (by its path from the repo's root; under lib/export/files/ when it does not start with rn/src/app/) as an
 *  export writes it, under the generated header */
export async function copiedFile(ctx: { read: (path: string) => Promise<string>; scope: string }, path: string): Promise<string> {
  const at = path.startsWith(`${MOBILE_FILES_DIR}/`) ? path : `${FILES_DIR}/${path}`;
  return `${GENERATED}\n${productFile(await ctx.read(at), ctx.scope)}`;
}
