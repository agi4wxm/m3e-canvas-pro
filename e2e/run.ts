/* Runs the end-to-end tests: a real editor in headless Chromium, driven through its own controls.
 *
 *   bun run test:e2e                        builds the app, serves it with `vp preview` on a free port, runs every e2e/*.e2e.ts
 *   bun run test:e2e -- --dev               runs against the dev server instead (a cold one fetches and reloads as it
 *                                           finds dependencies, which can upset a test: run it twice, or use the build)
 *   bun run test:e2e -- --base http://localhost:3000   runs against an editor already running
 *   bun run test:e2e -- split tidy          only the tests whose names contain one of these words
 *
 * Playwright is not a dependency of the project: it comes from wherever it is installed (`NODE_PATH`, the global
 * modules, or PLAYWRIGHT_PATH), with its Chromium. Nothing is fetched from the network. A failed test leaves a
 * screenshot in e2e/.out. */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, E2ETest } from "./lib";
import { Failure, open } from "./lib";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const words = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--base"));
const out = join(root, "e2e", ".out");
mkdirSync(out, { recursive: true });

/** Playwright from the first place it is installed */
function playwright(): { chromium: { launch(o?: { headless?: boolean }): Promise<Browser> } } {
  const require = createRequire(join(root, "package.json"));
  const tries = [process.env.PLAYWRIGHT_PATH, "playwright"];
  for (const dir of (process.env.NODE_PATH ?? "").split(":").filter(Boolean)) tries.push(join(dir, "playwright"));
  try {
    tries.push(join(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "playwright"));
  } catch {}
  tries.push("/opt/node-tools/node_modules/playwright", "/usr/local/lib/node_modules/playwright", "/usr/lib/node_modules/playwright");
  for (const p of tries) {
    if (!p) continue;
    try {
      return require(p);
    } catch {}
  }
  console.error("Playwright was not found. Install it (npm i -g playwright && npx playwright install chromium) or set PLAYWRIGHT_PATH.");
  process.exit(2);
}

const freePort = () =>
  new Promise<number>((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => ok(port));
    });
  });

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`nothing answered at ${url}`);
}

async function server(): Promise<{ base: string; stop: () => void }> {
  const given = option("base") ?? process.env.E2E_BASE;
  if (given) return { base: given.replace(/\/$/, ""), stop: () => {} };
  const port = await freePort();
  const vp = join(root, "node_modules", ".bin", "vp");
  const dev = args.includes("--dev");
  if (!dev) execSync("bun run build", { cwd: root, stdio: "inherit" });
  const child: ChildProcess = spawn(vp, [dev ? "dev" : "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base + "/", 120_000);
  return { base, stop: () => child.kill() };
}

const files = readdirSync(join(root, "e2e")).filter((f) => f.endsWith(".e2e.ts")).sort();
const tests: { file: string; test: E2ETest }[] = [];
for (const f of files) {
  const mod = (await import(join(root, "e2e", f))) as { tests: E2ETest[] };
  for (const test of mod.tests) if (!words.length || words.some((w) => test.name.includes(w))) tests.push({ file: f, test });
}
if (!tests.length) {
  console.error("no tests to run");
  process.exit(2);
}

const { base, stop } = await server();
const browser = await playwright().chromium.launch();
let failed = 0;
const started = Date.now();
try {
  for (const { file, test } of tests) {
    const t0 = Date.now();
    const { ctx, page, errors } = await open(browser, base, test.viewport);
    const safe = test.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    try {
      await Promise.race([
        test.run({ page, base, out, errors }),
        new Promise((_, fail) => setTimeout(() => fail(new Failure("timed out after 180s")), 180_000)),
      ]);
      if (errors.length) throw new Failure(`the page threw: ${errors.join("; ")}`);
      console.log(`  ok    ${test.name}  (${file}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      failed++;
      console.log(`  FAIL  ${test.name}  (${file})\n        ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      await page.screenshot({ path: join(out, `${safe}.png`) }).catch(() => {});
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  stop();
}
console.log(`${tests.length - failed} of ${tests.length} passed in ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
