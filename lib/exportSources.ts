/* The editor's own files as text, for a project to copy. Each is fetched only when an export asks for
 * it, so opening the editor pays for none of them; this module is itself loaded on the first export. */

const SOURCES = import.meta.glob(
  [
    "/components/m3e/*.{ts,tsx}",
    "/components/m3e/icon-sets/*.ts",
    "/lib/m3e/*.ts",
    "/lib/screenMotion.ts",
    "/lib/mocks/*.ts",
    "/lib/mocks/formats/*.ts",
    "/lib/bindings/{expr,format,messages,rules,sources,form,channels,frame}.ts",
    "/lib/app/*.ts",
    "/lib/api/types.ts",
    "/lib/api/schema.ts",
    "/lib/api/transport.ts",
    "/lib/api/body.ts",
    "/lib/capabilities/{types,catalog,registry,mock}.ts",
    "/lib/actions/{model,host,run}.ts",
    "/lib/world/{types,contract,hostContract,channel,example,root,frameTargets}.ts",
    "/lib/export/files/api/*.ts",
    "/lib/export/files/appRuntime/*.ts",
    "/lib/export/files/web/*.{ts,tsx}",
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
    "/rn/src/app/*.{ts,tsx}",
    "/rn/src/custom/*.{ts,tsx}",
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
