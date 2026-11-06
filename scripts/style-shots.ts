/* Photographs the style gallery: one picture per style and section, and one of the whole page per style, so a style
 * can be looked at and fixed without clicking through the editor.
 *
 *   bun run dev -- --port 3105            (in another shell; this script starts nothing)
 *   bun scripts/style-shots.ts --base http://localhost:3105 --out shots [--style ios,wechat] [--dark] [--both]
 *                              [--category Navigation,Lists] [--lang zh] [--part app-bar,item] [--width 1280] [--tile 1400]
 *                              [--kits] [--chosen] [--splits]
 *
 * Without --style it takes every style and plain Material ("android"). --dark draws them in dark mode, --both in each
 * mode; without either a style is drawn in the mode it opens with. Pictures land in <out>/<style>[-dark]/<section>.png
 * and <out>/<style>[-dark].png. Playwright comes from wherever Node finds it (`require("playwright")`). */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { STYLE_PACKS } from "../lib/styles";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const list = (name: string) => option(name)?.split(",").map((s) => s.trim()).filter(Boolean);

const base = (option("base", "http://localhost:3105") ?? "").replace(/\/$/, "");
const out = option("out");
if (!out) {
  console.error("usage: bun scripts/style-shots.ts --base http://localhost:3105 --out <dir> [--style ios,wechat] [--dark|--both] [--category A,B] [--lang zh] [--part slug,slug]");
  process.exit(2);
}
const styles = list("style") ?? ["android", ...STYLE_PACKS.map((s) => s.key)];
const modes: (string | undefined)[] = flag("both") ? ["0", "1"] : flag("dark") ? ["1"] : [undefined];
const categories = list("category");
const lang = option("lang", "zh");
const part = option("part");
/* the kits alone (--kits), only the variant each style picks (--chosen), or each composite beside its atoms (--splits) */
const kitsOnly: Record<string, string> = { ...(flag("kits") || flag("chosen") ? { kits: "1" } : {}), ...(flag("chosen") ? { chosen: "1" } : {}), ...(flag("splits") ? { splits: "1" } : {}) };
const width = Number(option("width", "1280"));
/* a section taller than this is also cut into pieces of this height, <section>-1.png and on: an image much taller
   than it is wide is shrunk past reading when it is looked at whole. 0 keeps every section in one piece. */
const tile = Number(option("tile", "1400"));

const unknown = styles.filter((s) => s !== "android" && !STYLE_PACKS.some((p) => p.key === s));
if (unknown.length) {
  console.error(`no such style: ${unknown.join(", ")}`);
  process.exit(2);
}

/* the little of Playwright this uses: it is not a dependency of the project, so its types are not either */
type Box = { x: number; y: number; width: number; height: number };
type Shot = { path: string; fullPage?: boolean; clip?: Box };
type Handle = { getAttribute: (name: string) => Promise<string | null>; screenshot: (o: Shot) => Promise<unknown> };
type Page = {
  on: (event: "pageerror", f: (e: Error) => void) => void;
  goto: (url: string, o: { waitUntil: "networkidle" }) => Promise<unknown>;
  waitForSelector: (s: string, o: { timeout: number }) => Promise<unknown>;
  evaluate: <A, R>(f: (arg: A) => R, arg?: A) => Promise<R>;
  waitForTimeout: (ms: number) => Promise<void>;
  $$: (s: string) => Promise<Handle[]>;
  screenshot: (o: Shot) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
};
type Browser = { newPage: (o: { viewport: { width: number; height: number }; deviceScaleFactor: number }) => Promise<Page>; close: () => Promise<void> };

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as { chromium: { launch: () => Promise<Browser> } };

const safe = (s: string) => s.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.warn(`  page error: ${e.message}`));
  for (const style of styles)
    for (const dark of modes) {
      const query = new URLSearchParams({ ...(style === "android" ? {} : { style }), ...(dark ? { dark } : {}), lang: lang ?? "zh", ...(part ? { part } : {}), ...kitsOnly });
      const name = `${safe(style)}${dark === "1" ? "-dark" : dark === "0" ? "-light" : ""}`;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/gallery?${query}`, { waitUntil: "networkidle" });
      await page.waitForSelector("[data-gallery-settled]", { timeout: 30_000 });
      /* faces and icon sets arrive after the first draw; let them land and the parts draw again */
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      /* A menu below the fold flips above its trigger, out of its box, for want of room in the window: the window is
         made as tall as the page, and what floats is asked to place itself again. */
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.min(Math.max(900, tall), 30000) });
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(500);
      const dir = join(out, name);
      mkdirSync(dir, { recursive: true });
      const sections = await page.$$("[data-gallery-category]");
      let n = 0;
      for (const section of sections) {
        const category = (await section.getAttribute("data-gallery-category")) ?? "section";
        if (categories && !categories.includes(category)) continue;
        await section.screenshot({ path: join(dir, `${safe(category)}.png`) });
        /* where the section stands on the whole page, which a full-page clip counts from */
        const box = await page.evaluate((c: string) => {
          const r = document.querySelector(`[data-gallery-category="${c}"]`)?.getBoundingClientRect();
          return r ? { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height } : null;
        }, category);
        if (tile > 0 && box && box.height > tile)
          for (let i = 0, top = 0; top < box.height; i++, top += tile)
            await page.screenshot({ path: join(dir, `${safe(category)}-${i + 1}.png`), fullPage: true, clip: { x: box.x, y: box.y + top, width: box.width, height: Math.min(tile, box.height - top) } });
        n++;
      }
      await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
      console.log(`${name}: ${n} sections`);
    }
} finally {
  await browser.close();
}
