/* What a server is made of, from its options: the tools it offers (the registry, the generative ones only with a key,
 * the reading ones only in a read-only session) and the backend they run on. The command line (cli.ts) and the tests
 * both start from here. */

import { isLang, setGlobalLang, type Lang } from "../../lib/i18n";
import { CONFIRM_MS } from "../../lib/mcp/protocol";
import { createRegistry, type Registry } from "../../lib/tools";
import { GENERATE_TOOLS } from "../../lib/tools/generate";
import type { GenerateEnv } from "../../lib/tools/types";
import { AutoBackend } from "./auto";
import type { Backend } from "./backend";
import { FileBackend } from "./file";
import type { ProjectFormat } from "./fileStore";
import { drawerFor, generationFromEnv } from "./generate";
import { LiveBackend } from "./live";
import type { Log } from "./log";
import { findApp, findPlaywright, HeadlessRenderer } from "./render";
import { configDir, TrustStore } from "./trust";

export type SetupOptions = {
  /** a project file to work on headless */
  file?: string;
  /** listen for an editor tab (the default when no file is given) */
  live?: boolean;
  readOnly?: boolean;
  allowDestructive?: boolean;
  /** the live bridge's first port */
  port?: number;
  ports?: number;
  origins?: string[];
  lang?: Lang;
  /** the app build (a folder) or a running editor (an address) screenshots are drawn with in file mode */
  app?: string;
  /** origins whose pictures and pages file-mode screenshots may load besides the app's own ("*": any; render.ts) */
  allowOutside?: string[];
  /** false: no headless screenshots (tests) */
  screenshots?: boolean;
  confirmMs?: number;
  pairWaitMs?: number;
  /** how long a pairing code holds (live.ts PAIRING_CODE_MS; tests make it short) */
  pairCodeMs?: number;
  /** the environment generation reads OPENAI_API_KEY from */
  env?: Record<string, string | undefined>;
  /** what draws, instead of the environment's key (tests) */
  gen?: GenerateEnv;
  format?: ProjectFormat;
  /** the folder remembered pairings are kept in (trust.ts; the user's config folder by default), or false for none */
  trustDir?: string | false;
  version: string;
  log: Log;
};

/** the language new words are written in: the one given, else the system's, else English */
export function langOf(given: string | undefined, env: Record<string, string | undefined> = process.env): Lang {
  if (isLang(given)) return given;
  const sys = (env.LC_ALL || env.LC_MESSAGES || env.LANG || "").slice(0, 2).toLowerCase();
  return isLang(sys) ? sys : "en";
}

export async function setup(o: SetupOptions): Promise<{ backend: Backend; registry: Registry }> {
  const lang = o.lang ?? langOf(undefined, o.env);
  setGlobalLang(lang);
  const gen = o.readOnly ? undefined : (o.gen ?? generationFromEnv(o.env ?? process.env));
  const registry = createRegistry({ extra: gen ? GENERATE_TOOLS : [], readOnly: !!o.readOnly });
  const access = o.readOnly ? "read" : "edit";

  let file: FileBackend | undefined;
  if (o.file) {
    const renderer = o.screenshots === false ? undefined : new HeadlessRenderer(findApp(o.app), lang, o.log, findPlaywright, { outside: o.allowOutside });
    file = new FileBackend({
      path: o.file,
      registry,
      format: o.format,
      lang,
      readOnly: !!o.readOnly,
      allowDestructive: !!o.allowDestructive,
      gen,
      log: o.log,
      renderer: renderer ? (get) => renderer.forStore(get, (w) => file?.store.setWidths((cur) => ({ ...cur, ...w }))) : undefined,
    });
    await file.open();
  }
  let live: LiveBackend | undefined;
  if (o.live || !o.file) {
    live = new LiveBackend({
      port: o.port,
      ports: o.ports,
      origins: o.origins,
      access,
      draw: gen ? drawerFor(gen) : undefined,
      drawingTools: GENERATE_TOOLS.map((t) => t.name),
      confirmMs: o.confirmMs ?? CONFIRM_MS,
      pairWaitMs: o.pairWaitMs,
      codeMs: o.pairCodeMs,
      version: o.version,
      log: o.log,
      ...(o.trustDir === false ? {} : { trust: TrustStore.at(o.trustDir ?? configDir(o.env ?? process.env), (m) => o.log.warn(m)) }),
    });
    await live.start();
  }
  if (gen) o.log.info("Drawing is on: generate_svg and generate_image use OPENAI_API_KEY from this server's environment.");
  const backend: Backend = live && file ? new AutoBackend(live, file) : (live ?? file)!;
  return { backend, registry };
}
