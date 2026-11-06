/* The kit's own files as text, for an export to copy into the app it writes (src/kit), and the configuration an Expo app
 * with NativeWind needs. Each is fetched only when an export asks, as lib/exportSources.ts does for the web's. The kit's
 * gallery, tests and the test bed's own app are not part of it. */

const KIT = import.meta.glob(["/rn/src/kit/**/*.{ts,tsx}", "!**/*.test.*"], { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const CONFIG = import.meta.glob(["/rn/babel.config.js", "/rn/metro.config.js", "/rn/tailwind.config.js", "/rn/global.css", "/rn/nativewind-env.d.ts", "/rn/tsconfig.json", "/rn/eslint.config.js"], { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const PREFIX = "/rn/src/kit/";

/** every file of the kit, by its path under src/kit */
export async function readKitSources(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [path, load] of Object.entries(KIT)) out[path.slice(PREFIX.length)] = await load();
  return out;
}

/** the configuration files of the kit's own app, by their name: the same an exported app is built with */
export async function readRnConfig(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [path, load] of Object.entries(CONFIG)) out[path.slice("/rn/".length)] = await load();
  return out;
}
