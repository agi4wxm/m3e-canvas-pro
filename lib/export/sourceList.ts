/* The editor's own files an export may copy, as patterns: the same list lib/exportSources.ts hands Vite's
 * import.meta.glob (which takes only a literal there; lib/export/sourceList.test.ts holds the two to each other). The
 * MCP server's bundle carries the files these name (mcp/build.ts), since it has no checkout to read them from. */

export const EXPORT_SOURCE_GLOBS = [
  "/components/m3e/*.{ts,tsx}",
  "/components/m3e/icon-sets/*.ts",
  "/lib/m3e/*.ts",
  "/lib/screenMotion.ts",
  "/lib/mocks/*.ts",
  "/lib/mocks/formats/*.ts",
  "/lib/bindings/{expr,format,messages,rules,sources,form}.ts",
  "/lib/app/*.ts",
  "/lib/api/types.ts",
  "/lib/api/schema.ts",
  "/lib/api/transport.ts",
  "/lib/api/body.ts",
  "/miniapp-kit/src/kit/*.{ts,tsx,css}",
  "/miniapp-kit/src/kit/app/*.{ts,tsx}",
  "/miniapp-kit/src/kit/atoms/*.tsx",
  "/miniapp-kit/src/kit/composites/*.tsx",
  "/hooks/*.ts",
  "/parts/widgets/*.{ts,tsx}",
  "/parts/icons.ts",
  "/parts/node.ts",
  "/parts/types.ts",
  "/parts/contained.tsx",
  "/rn/src/kit/*.{ts,tsx}",
  "/rn/src/kit/atoms/*.tsx",
  "/rn/src/kit/composites/*.tsx",
  "/rn/src/kit/icons/*.{ts,tsx}",
  "/rn/src/kit/theme/*.{ts,tsx}",
  "/styles/*.css",
  "/react-css.d.ts",
  "/package.json",
  "/LICENSE",
  "/NOTICE",
  "!**/*.test.*",
];

/** a pattern of the list as a regular expression: `*` is any name in one folder, `{a,b}` either */
const patternOf = (glob: string) =>
  new RegExp(
    `^${glob
      .replace(/^!/, "")
      .replace(/^\//, "")
      .replace(/[.+^$()|[\]\\]/g, "\\$&")
      .replace(/\*\*\//g, "\uE000")
      .replace(/\*/g, "[^/]*")
      .replace(/\uE000/g, "(?:.*/)?")
      .replace(/\{([^}]+)\}/g, (_, alts: string) => `(?:${alts.split(",").join("|")})`)}$`,
  );

const INCLUDE = EXPORT_SOURCE_GLOBS.filter((g) => !g.startsWith("!")).map(patternOf);
const EXCLUDE = EXPORT_SOURCE_GLOBS.filter((g) => g.startsWith("!")).map(patternOf);

/** whether a file, by its path from the repo's root, is one an export may copy */
export const isExportSource = (path: string) => INCLUDE.some((r) => r.test(path)) && !EXCLUDE.some((r) => r.test(path));

/** the folders the patterns reach, to look in */
export const EXPORT_SOURCE_DIRS = [...new Set(EXPORT_SOURCE_GLOBS.filter((g) => !g.startsWith("!")).map((g) => g.slice(1, g.lastIndexOf("/") + 1).replace(/\/$/, "")))];
