/* Screenshots with no editor open: headless Chromium, through Playwright when it is installed, loads the app's render
 * page (src/editor/RenderPage.tsx) from the app build this process serves on 127.0.0.1, measures the parts the way
 * the canvas does, lays the document out with those sizes and draws the screen exactly as "export image" does.
 *
 * Playwright is not bundled (it brings its own browser): it is found wherever it is installed, and a screenshot
 * without it is a clear error saying how to install it. Chromium starts on the first screenshot and stays open.
 *
 * What the page may load is decided here, not by the document: the app's own build, what is inline (data:, blob:),
 * and the faces the app itself sets its theme in. A picture or a page at any other address is held back (the page
 * draws its placeholder, and the request is refused at the browser's edge too), unless the server was told to let
 * that origin load (`--allow-outside`): a document from elsewhere cannot make this machine fetch from its network.
 * One screenshot has one deadline for all of it, and stops when its caller stops; a page given up on is closed, and
 * the next screenshot opens a fresh one. */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { guessMeasurer, type CoreState } from "../../lib/core";
import { laidOut } from "../../lib/core/ops/common";
import type { Lang } from "../../lib/i18n";
import { ToolFailure, type Renderer } from "../../lib/tools/types";
import type { Log } from "./log";

/** where the render page comes from: an app build on disk, or an editor already being served */
export type AppSource = { dir: string } | { url: string };

/* the little of Playwright used here; it is not a dependency, so neither are its types */
type PwPage = {
  goto(url: string, o?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForFunction(f: string, arg?: unknown, o?: { timeout?: number }): Promise<unknown>;
  evaluate<R, A>(f: (a: A) => R | Promise<R>, arg: A): Promise<R>;
  isClosed(): boolean;
  close(): Promise<void>;
};
type PwRoute = { request(): { url(): string; resourceType(): string }; continue(): Promise<void>; abort(code?: string): Promise<void> };
type PwContext = { newPage(): Promise<PwPage>; route(url: string, handler: (route: PwRoute) => unknown): Promise<void>; close(): Promise<void> };
type PwBrowser = { newContext(o: { viewport: { width: number; height: number }; deviceScaleFactor: number; serviceWorkers?: "allow" | "block" }): Promise<PwContext>; close(): Promise<void>; isConnected(): boolean };
export type Playwright = { chromium: { launch(o?: { headless?: boolean }): Promise<PwBrowser> } };

export const INSTALL_PLAYWRIGHT = "Install it with: npm i -g playwright && npx playwright install chromium (or set PLAYWRIGHT_PATH to where it is installed), then restart the MCP server.";

/** Playwright from the first place it is installed, or null */
export function findPlaywright(): Playwright | null {
  const here = typeof __filename === "string" ? __filename : fileURLToPath(import.meta.url);
  const require = createRequire(here);
  const tries: (string | undefined)[] = [process.env.PLAYWRIGHT_PATH, "playwright", "playwright-core"];
  for (const dir of (process.env.NODE_PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean)) tries.push(join(dir, "playwright"));
  try {
    tries.push(join(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(), "playwright"));
  } catch {}
  for (const p of tries) {
    if (!p) continue;
    try {
      return require(p) as Playwright;
    } catch {}
  }
  return null;
}

/** The app build screenshots are drawn with: the one given, the copy beside this bundle (dist/app), or the
 *  repository's own build (dist/). */
export function findApp(given?: string): AppSource | null {
  if (given) return /^https?:\/\//i.test(given) ? { url: given.replace(/\/+$/, "") } : { dir: resolve(given) };
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [join(here, "app"), join(here, "..", "dist", "app"), join(here, "..", "..", "dist")]) if (existsSync(join(dir, "index.html"))) return { dir };
  return null;
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".md": "text/markdown" };

/** Serves an app build on 127.0.0.1, every path without a file falling back to the page (the router finds it). An
 *  address that is not a path (bad percent-encoding, a NUL) is a 400, one that leaves the build a 403. */
export function serveDir(dir: string): Promise<{ base: string; server: Server }> {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let path: string;
      try {
        path = decodeURIComponent((req.url ?? "/").split("?")[0].split("#")[0]);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (path.includes("\0")) {
        res.writeHead(400).end();
        return;
      }
      let file = normalize(join(root, path));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      const st = await stat(file).catch(() => null);
      if (!st || st.isDirectory()) file = join(root, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache", "x-content-type-options": "nosniff" }).end(body);
    } catch {
      if (!res.headersSent) res.writeHead(404).end();
      else res.end();
    }
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      ok({ base: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`, server });
    });
  });
}

/** how long one screenshot may take, all of it: Chromium started, the page loaded, the parts measured, the screen drawn */
export const SHOT_MS = 60_000;

/** the hosts the app itself fetches its theme's faces from (lib/theme.ts): the app's addresses, never the document's */
const APP_FONT_ORIGINS = new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
/** what a face is fetched as: its stylesheet, its files, and the copies the screenshot embeds */
const FONT_TYPES = new Set(["stylesheet", "font", "fetch", "xhr"]);

const originOf = (s: string) => {
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
};

/** Whether the screenshot page may load `url` (fetched as `type`): the app's own build at `app`, what is inline, the
 *  faces the app sets its theme in, and an outside origin only when it is among `outside` ("*" lets any web address
 *  load). */
export function mayLoad(url: string, type: string, app: string, outside: readonly string[] = []): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "data:" || u.protocol === "blob:") return true;
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.origin === originOf(app)) return true;
  if (APP_FONT_ORIGINS.has(u.origin) && FONT_TYPES.has(type)) return true;
  return outside.some((o) => o === "*" || originOf(o.trim()) === u.origin);
}

export type RenderOptions = {
  /** origins whose pictures and pages a screenshot may load besides the app's own ("*": any) */
  outside?: readonly string[];
  /** how long one screenshot may take (SHOT_MS) */
  deadlineMs?: number;
};

type Opened = { ctx: PwContext; page: PwPage };

export class HeadlessRenderer {
  private opening: Promise<Opened> | null = null;
  private browser: PwBrowser | null = null;
  private served: { base: string; server: Server } | null = null;
  /** the addresses the page asked for and was refused, for the screenshot being taken */
  private held: string[] = [];

  constructor(
    private readonly app: AppSource | null,
    private readonly lang: Lang,
    private readonly log: Log,
    private readonly playwright: () => Playwright | null = findPlaywright,
    private readonly o: RenderOptions = {},
  ) {}

  /** a renderer for the tools, drawing what `get` holds; `measured` is told the sizes the parts came out at */
  forStore(get: () => CoreState, measured?: (w: Record<string, number>) => void): Renderer & { close(): Promise<void> } {
    /* another version of the document (a screen with its mock data in) is drawn as it is: its sizes are not the store's */
    return { screenshot: (id, o) => this.shoot(o?.doc ? { ...get(), doc: o.doc as CoreState["doc"] } : get(), id, o?.scale ?? 1, o?.doc ? undefined : measured, o?.onSkipped, o?.signal), close: () => this.close() };
  }

  /** the app's address: the editor given, or its build served here */
  private async base(app: AppSource): Promise<string> {
    if ("url" in app) return app.url;
    this.served ??= await serveDir(app.dir);
    return this.served.base;
  }

  private async open(): Promise<Opened> {
    const pw = this.playwright();
    if (!pw) throw new ToolFailure("unavailable", "Screenshots in file mode need Playwright with Chromium, which is not installed where this server runs.", `${INSTALL_PLAYWRIGHT} Meanwhile, read the outline instead.`);
    if (!this.app) throw new ToolFailure("unavailable", "Screenshots need the editor's build, which this server cannot find.", "Build the app (bun run build, then bun run mcp:build), or start the server with --app <the dist folder or the address of a running editor>.");
    const base = await this.base(this.app);
    if (!this.browser?.isConnected()) {
      await this.browser?.close().catch(() => {});
      this.browser = null;
      try {
        this.browser = await pw.chromium.launch({ headless: true });
      } catch (e) {
        throw new ToolFailure("unavailable", `Chromium did not start: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, "Install Playwright's Chromium: npx playwright install chromium");
      }
    }
    const ctx = await this.browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: "block" });
    try {
      await ctx.route("**/*", (route) => {
        const r = route.request();
        if (mayLoad(r.url(), r.resourceType(), base, this.o.outside)) return route.continue().catch(() => {});
        this.held.push(r.url());
        this.log.debug(`Screenshot: held back ${r.url()} (only the app's own build loads; --allow-outside lets an origin load).`);
        return route.abort("blockedbyclient").catch(() => {});
      });
      const page = await ctx.newPage();
      await page.goto(`${base}/render`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForFunction("!!window.m3eRender", undefined, { timeout: 60_000 });
      this.log.info(`Screenshots: headless Chromium with the render page at ${base}/render.`);
      return { ctx, page };
    } catch (e) {
      await ctx.close().catch(() => {});
      throw e;
    }
  }

  /** the page, opened when there is none (or the one there was closed or its browser went away) */
  private async ready(): Promise<Opened> {
    if (this.opening) {
      const o = await this.opening.catch(() => null);
      if (o && !o.page.isClosed() && this.browser?.isConnected()) return o;
      this.recycle();
    }
    const p = this.open();
    this.opening = p;
    p.catch(() => {
      if (this.opening === p) this.opening = null;
    });
    return p;
  }

  /** Lets go of the page and its context (the browser stays): the next screenshot opens a fresh one. One still
   *  opening is closed once it is open. */
  private recycle() {
    const p = this.opening;
    this.opening = null;
    void p?.then(
      (o) => o.ctx.close().catch(() => {}),
      () => {},
    );
  }

  /** A screenshot of `id`, within the deadline and while `signal` lets it: given up on, it fails at once with why, and
   *  the page it was drawn on is let go. */
  async shoot(state: CoreState, id: string, scale: number, measured?: (w: Record<string, number>) => void, onSkipped?: (urls: string[]) => void, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new ToolFailure("aborted", "Stopped before the screenshot was taken.");
    const ms = this.o.deadlineMs ?? SHOT_MS;
    const stop = new AbortController();
    const end = (why: ToolFailure) => stop.abort(why);
    const timer = setTimeout(() => end(new ToolFailure("aborted", `The screenshot was not drawn within ${Math.round(ms / 1000)} s, so it was given up.`, "Try once more; a screen whose pictures do not load can take long: read the outline instead.")), ms);
    const cancelled = () => end(new ToolFailure("aborted", "Stopped by the client."));
    signal?.addEventListener("abort", cancelled, { once: true });
    const work = this.draw(state, id, scale, stop.signal, measured, onSkipped);
    /* when it is given up its own end is not waited for: the page it runs in is closed */
    work.catch(() => {});
    const givenUp = new Promise<never>((_, reject) => stop.signal.addEventListener("abort", () => reject(stop.signal.reason as ToolFailure), { once: true }));
    try {
      return await Promise.race([work, givenUp]);
    } catch (e) {
      /* given up, or the page failed: it may be drawing still, or broken */
      this.recycle();
      if (e instanceof ToolFailure) throw e;
      throw new ToolFailure("failed", `The screenshot was not drawn: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, "Try once more; read the outline if it fails again.");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
    }
  }

  private async draw(state: CoreState, id: string, scale: number, gone: AbortSignal, measured?: (w: Record<string, number>) => void, onSkipped?: (urls: string[]) => void): Promise<string> {
    const { page } = await this.ready();
    const lang = this.lang;
    /* the page holds outside pictures back itself unless some may load; the browser refuses the rest either way */
    const outside = (this.o.outside ?? []).length > 0;
    this.held = [];
    /* the parts measured as the canvas would, the containers laid out by those sizes, then the screen drawn */
    const sizes = await page.evaluate((job) => window.m3eMeasure!(job as never), { doc: state.doc, lang, outside });
    /* nothing of a screenshot given up reaches the store */
    if (gone.aborted) throw gone.reason;
    measured?.(sizes);
    let widths = { ...guessMeasurer.measure(state), ...sizes };
    let laid = laidOut({ ...state, session: { ...state.session, widths } }, widths);
    /* Another version of the document (a screen with its mock data in) was never laid out by these sizes the way the
       canvas lays out what it holds as it is measured: once more, from where the first pass put everything. */
    if (!measured) {
      const again = await page.evaluate((job) => window.m3eMeasure!(job as never), { doc: laid.doc, lang, outside });
      widths = { ...widths, ...again };
      laid = laidOut({ ...laid, session: { ...laid.session, widths } }, widths);
    }
    const out: { png: string; skipped: string[]; blocked?: string[] } | string = await page.evaluate((job) => window.m3eRender!(job as never), { doc: laid.doc, widths, id, scale, lang, outside });
    if (gone.aborted) throw gone.reason;
    /* a render page built before pictures were set aside hands back the PNG alone */
    if (typeof out === "string") return out;
    const skipped = [...new Set([...out.skipped, ...(out.blocked ?? []), ...this.held])];
    if (skipped.length) onSkipped?.(skipped);
    return out.png;
  }

  async close() {
    const b = this.browser;
    this.browser = null;
    this.opening = null;
    await b?.close().catch(() => {});
    this.served?.server.close();
    this.served = null;
  }
}
