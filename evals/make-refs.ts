/* Renders the reference pictures the replication tasks attach: every evals/refs/*.html, drawn in headless Chromium at
 * 412×892 dp with two pixels per dp (a phone screenshot's density), saved beside it as a PNG. The mocks are made up
 * for the suite, so no one's screenshot is copied.
 *
 *   bun evals/make-refs.ts            (bun run eval:refs)
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { findPlaywright } from "../mcp/src/render";

type Page = { goto(url: string): Promise<unknown>; screenshot(o: { path: string }): Promise<unknown> };
type Browser = { newContext(o: object): Promise<{ newPage(): Promise<Page> }>; close(): Promise<void> };

const dir = join(new URL(".", import.meta.url).pathname, "refs");
const pw = findPlaywright() as unknown as { chromium: { launch(): Promise<Browser> } } | null;
if (!pw) {
  console.error("Playwright was not found (npm i -g playwright, or set PLAYWRIGHT_PATH).");
  process.exit(2);
}
const browser = await pw.chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    await page.goto(pathToFileURL(join(dir, f)).href);
    const out = join(dir, f.replace(/\.html$/, ".png"));
    await page.screenshot({ path: out });
    console.log(`wrote ${out}`);
  }
} finally {
  await browser.close();
}
