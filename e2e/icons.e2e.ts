/* The bundled icon sets when a shard does not come (report UI-3): every Material Rounded shard refused while the editor
 * opens, so the parts' icons are blank; then the network back, and the icons arrive on the page as it is, with no reload.
 * Chromium keeps a failed module import for its address, so the shard is asked for again at an address of its own. And
 * the editor's own icons with their font (Google Fonts) out of reach: drawn from the same bundled glyphs. */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { check, equal, ready, type E2ETest, type Request } from "./lib";

const SHARD = /\/assets\/rounded-\d+-[^/?]+\.js(\?.*)?$/;

export const tests: E2ETest[] = [
  {
    name: "icons: a shard refused while the editor opens is fetched again, and its icons show without a reload",
    async run({ page: first, base, errors }) {
      /* a page of its own, so the shards are refused from the very start */
      const page = await first.context().newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      let offline = true;
      const asked: string[] = [];
      await page.route(SHARD, (route, request: Request) => {
        asked.push(`${offline ? "refused" : "served"} ${request.url().split("/").pop()}`);
        return offline ? route.abort() : route.continue();
      });
      /* nor Iconify, which is reached in some places (CI) and not in others: the shards are the subject here */
      await page.route(/api\.iconify\.design/, (route) => route.abort());
      await page.goto(base + "/", { waitUntil: "load" });
      await ready(page);
      /* the icons drawn on the starter sketch's screen (a glyph not there yet is an empty stand-in), against the
         editor the runner opened with nothing refused */
      const drawn = (p: typeof page) => p.evaluate(() => document.querySelectorAll("[data-screen] [data-node] svg.iconify").length);
      const all = await drawn(first);
      const before = await drawn(page);
      check(asked.some((a) => a.startsWith("refused")), "the shards were asked for and refused");
      check(before < all, `some icons are blank while their shards are refused: ${before} of ${all} drawn`);

      offline = false;
      let after = before;
      for (let i = 0; i < 60 && after < all; i++) {
        await page.waitForTimeout(1000);
        after = await drawn(page);
      }
      equal(after, all, `every icon is drawn once the shards come (${asked.join("; ")})`);
      check(asked.some((a) => a.startsWith("served") && /\?retry=\d+$/.test(a)), `asked again at an address of its own: ${asked.join("; ")}`);
      await page.close();
    },
  },
  {
    name: "icons: with the shards refused and Iconify answering, every icon is drawn, the app bar's menu too",
    async run({ page: first, base, errors }) {
      const page = await first.context().newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route(SHARD, (route) => route.abort());
      /* Iconify, answered from the bundled glyphs: the components carry only the menu's filled glyph (icon-data.ts),
         which once hid that its outlined one was never asked for */
      const glyphs: Record<string, unknown> = {};
      const data = join(process.cwd(), "components/m3e/icon-sets/data");
      for (const f of readdirSync(data).filter((f) => /^rounded-\d+\.json$/.test(f)))
        for (const s of (JSON.parse(readFileSync(join(data, f), "utf8")) as { sets: { prefix: string; icons: object }[] }).sets) if (s.prefix === "material-symbols") Object.assign(glyphs, s.icons);
      const asked: string[] = [];
      await page.route(/api\.iconify\.design/, (route, request: Request) => {
        const ids = (new URL(request.url()).searchParams.get("icons") ?? "").split(",");
        asked.push(...ids);
        const icons = Object.fromEntries(ids.filter((i) => glyphs[i]).map((i) => [i, glyphs[i]]));
        return route.fulfill({ headers: { "content-type": "application/json" }, body: JSON.stringify({ prefix: "material-symbols", width: 24, height: 24, icons }) });
      });
      await page.goto(base + "/", { waitUntil: "load" });
      await ready(page);
      const drawn = (p: typeof page) => p.evaluate(() => document.querySelectorAll("[data-screen] [data-node] svg.iconify").length);
      const all = await drawn(first);
      let now = await drawn(page);
      for (let i = 0; i < 20 && now < all; i++) {
        await page.waitForTimeout(500);
        now = await drawn(page);
      }
      equal(now, all, `every icon is drawn from Iconify while the shards are refused (asked for ${asked.join(", ")})`);
      check(asked.includes("menu-outline-rounded"), "the menu's outlined glyph was asked for");
      await page.close();
    },
  },
  {
    name: "icons: with the icon font out of reach, the editor's own icons are drawn from the bundled glyphs, not as clipped words",
    async run({ page: first, base, errors, out }) {
      const page = await first.context().newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
      await page.goto(base + "/", { waitUntil: "load" });
      await ready(page);
      await page.waitForTimeout(1500);
      const seen = await page.evaluate(() => ({
        ligatures: document.querySelectorAll(".msr").length,
        drawn: document.querySelectorAll("[data-icon-fallback] svg").length,
        undo: !!document.querySelector('button[title="Undo"] [data-icon-fallback="undo"] svg'),
      }));
      equal(seen.ligatures, 0, "no icon is left as a ligature of a font that is not there");
      check(seen.drawn > 50, `the editor's icons are drawn from the bundled glyphs: ${seen.drawn}`);
      check(seen.undo, "Undo shows its arrow");
      await page.screenshot({ path: join(out, "icons-offline-font.png") });
      await page.close();
    },
  },
];
