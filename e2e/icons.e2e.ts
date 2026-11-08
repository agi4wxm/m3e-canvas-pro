/* The bundled icon sets when a shard does not come (report UI-3): every Material Rounded shard refused while the editor
 * opens, so the parts' icons are blank; then the network back, and the icons arrive on the page as it is, with no reload.
 * Chromium keeps a failed module import for its address, so the shard is asked for again at an address of its own. And
 * the editor's own icons with their font (Google Fonts) out of reach: drawn from the same bundled glyphs. */

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
    name: "icons: with the icon font out of reach, the editor's own icons are drawn from the bundled glyphs, not as clipped words",
    async run({ page, base, out }) {
      /* the same tab opened again with the font refused: a second tab could look but not edit, and the panels are its */
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
      /* every icon the editor draws is bundled: none is left an empty box, on the toolbars and in the panels */
      const blank = () => page.evaluate(() => [...new Set([...document.querySelectorAll("[data-icon-fallback]")].filter((e) => !e.querySelector("svg")).map((e) => e.getAttribute("data-icon-fallback")))]);
      const empty: string[] = [];
      for (const tab of ["Parts", "Layers", "Style", "Colors"]) {
        await page.locator(`aside button[title="${tab}"]`).first().click();
        await page.waitForTimeout(1500);
        for (const n of (await blank()) as string[]) if (!empty.includes(n)) empty.push(n);
      }
      equal(empty, [], "no icon of the editor's left blank");
      await page.screenshot({ path: join(out, "icons-offline-font.png") });
    },
  },
];
