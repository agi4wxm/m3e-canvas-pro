/* The editor's own files as text, for a project to copy. Each is fetched only when an export asks for
 * it, so opening the editor pays for none of them; this module is itself loaded on the first export. */

const SOURCES = import.meta.glob(
  [
    "/components/m3e/*.{ts,tsx}",
    "/components/m3e/icon-sets/*.ts",
    "/lib/m3e/*.ts",
    "/hooks/*.ts",
    "/parts/widgets/*.{ts,tsx}",
    "/parts/icons.ts",
    "/parts/node.ts",
    "/parts/types.ts",
    "/parts/contained.tsx",
    "/styles/*.css",
    "/react-css.d.ts",
    "/package.json",
    "/LICENSE",
    "/NOTICE",
    "!**/*.test.*",
  ],
  { query: "?raw", import: "default" },
) as Record<string, () => Promise<string>>;

/** every file there is to read, by its path from the repo's root */
export const SOURCE_PATHS = Object.keys(SOURCES).map((p) => p.slice(1));

/** a file's text; throws on a path that is not one of them */
export async function readSource(path: string): Promise<string> {
  const load = SOURCES[`/${path}`];
  if (!load) throw new Error(`no such source: ${path}`);
  return load();
}
