/* The bundled icon sets when a shard does not come (report UI-3): every Material Rounded shard refused while the editor
 * opens, so the parts' icons are blank; then the network back, and the icons arrive on the page as it is, with no reload.
 * Chromium keeps a failed module import for its address, so the shard is asked for again at an address of its own. */

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
];
