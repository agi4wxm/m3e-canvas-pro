/* Screenshots with no editor open: headless Chromium, through Playwright when it is installed, loads the app's render
 * page (src/editor/RenderPage.tsx) from the app build this process serves on 127.0.0.1, measures the parts the way
 * the canvas does, lays the document out with those sizes and draws the screen exactly as "export image" does.
 *
 * Playwright is not bundled (it brings its own browser): it is found wherever it is installed, and a screenshot
 * without it is a clear error saying how to install it. Chromium starts on the first screenshot and stays open. */

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
type PwBrowser = { newContext(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<{ newPage(): Promise<PwPage> }>; close(): Promise<void>; isConnected(): boolean };
type Playwright = { chromium: { launch(o?: { headless?: boolean }): Promise<PwBrowser> } };

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

/** serves an app build on 127.0.0.1, every path without a file falling back to the page (the router finds it) */
function serveDir(dir: string): Promise<{ base: string; server: Server }> {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-cache" }).end(body);
    } catch {
      res.writeHead(404).end();
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

export class HeadlessRenderer {
  private page: Promise<PwPage> | null = null;
  private browser: PwBrowser | null = null;
  private server: Server | null = null;

  constructor(
    private readonly app: AppSource | null,
    private readonly lang: Lang,
    private readonly log: Log,
    private readonly playwright: () => Playwright | null = findPlaywright,
  ) {}

  /** a renderer for the tools, drawing what `get` holds; `measured` is told the sizes the parts came out at */
  forStore(get: () => CoreState, measured?: (w: Record<string, number>) => void): Renderer & { close(): Promise<void> } {
    return { screenshot: (id, o) => this.shoot(get(), id, o?.scale ?? 1, measured), close: () => this.close() };
  }

  private async open(): Promise<PwPage> {
    const pw = this.playwright();
    if (!pw) throw new ToolFailure("unavailable", "Screenshots in file mode need Playwright with Chromium, which is not installed where this server runs.", `${INSTALL_PLAYWRIGHT} Meanwhile, read the outline instead.`);
    if (!this.app) throw new ToolFailure("unavailable", "Screenshots need the editor's build, which this server cannot find.", "Build the app (bun run build, then bun run mcp:build), or start the server with --app <the dist folder or the address of a running editor>.");
    let base: string;
    if ("url" in this.app) base = this.app.url;
    else {
      const s = await serveDir(this.app.dir);
      this.server = s.server;
      base = s.base;
    }
    try {
      this.browser = await pw.chromium.launch({ headless: true });
    } catch (e) {
      throw new ToolFailure("unavailable", `Chromium did not start: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, "Install Playwright's Chromium: npx playwright install chromium");
    }
    const ctx = await this.browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${base}/render`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction("!!window.m3eRender", undefined, { timeout: 60_000 });
    this.log.info(`Screenshots: headless Chromium with the render page at ${base}/render.`);
    return page;
  }

  private async ready(): Promise<PwPage> {
    if (this.page) {
      const p = await this.page.catch(() => null);
      if (p && !p.isClosed() && this.browser?.isConnected()) return p;
      await this.close();
    }
    this.page = this.open();
    this.page.catch(() => {
      this.page = null;
    });
    return this.page;
  }

  async shoot(state: CoreState, id: string, scale: number, measured?: (w: Record<string, number>) => void): Promise<string> {
    const page = await this.ready();
    const lang = this.lang;
    try {
      /* the parts measured as the canvas would, the containers laid out by those sizes, then the screen drawn */
      const sizes = await page.evaluate((job) => window.m3eMeasure!(job as never), { doc: state.doc, lang });
      measured?.(sizes);
      const widths = { ...guessMeasurer.measure(state), ...sizes };
      const laid = laidOut({ ...state, session: { ...state.session, widths } }, widths);
      return await page.evaluate((job) => window.m3eRender!(job as never), { doc: laid.doc, widths, id, scale, lang });
    } catch (e) {
      throw new ToolFailure("failed", `The screenshot was not drawn: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, "Try once more; read the outline if it fails again.");
    }
  }

  async close() {
    const b = this.browser;
    this.browser = null;
    this.page = null;
    await b?.close().catch(() => {});
    this.server?.close();
    this.server = null;
  }
}
