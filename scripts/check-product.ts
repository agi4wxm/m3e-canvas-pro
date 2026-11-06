// bun scripts/check-product.ts <empty work folder> [proof|systems|parts|shop]
//
// The proof a product export (the monorepo, lib/export) is what it claims to be. Exports a fixture product into the
// work folder the way scripts/export.ts does, then for real: npm install, npm run typecheck, npm run lint (ESLint with
// no warnings, Prettier), npm run build (the web app and the server), npm test (every workspace's tests). Then it
// starts the built server and runs the contract tests against it, checks the web build carries none of the mocks, and
// exports again over the folder: a seeded file someone edited is kept, a generated one is reported as a conflict with
// its .m3e-new beside it, a dependency someone added stays. In Playwright's Chromium it opens the built app (each
// screen at its own address, the browser's back, a deep link) and the dev server with the mocks on (the app draws,
// and with VITE_API_MOCKS=msw the service worker answers the API). Needs the network for npm install and Playwright
// installed (as for the e2e tests); not part of `bun run test`. Exits non-zero on any failure. `shop` exports a document
// whose contract is its own (Doc.api: the shop's OpenAPI and the chat's AsyncAPI, lib/api/fixtures), read by the export.
import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { allPartsDoc } from "../lib/codegen.fixture";
import { systemsDoc } from "../lib/exportProject.fixture";
import { exportToFolder, reportLines } from "../lib/export/nodeWriter";
import { buildProduct } from "../lib/export/product";
import { productDoc, shopProductDoc } from "../lib/export/product.fixture";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";

const WORK = process.argv[2];
const WHICH = process.argv[3] ?? "proof";
if (!WORK) throw new Error("usage: bun scripts/check-product.ts <empty work folder> [proof|systems|parts|shop]");
mkdirSync(WORK, { recursive: true });
const free = statfsSync(WORK);
if ((free.bavail * free.bsize) / 2 ** 30 < 2) throw new Error("under 2GB free: stopping");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = join(WORK, `product-${WHICH}`);
const failures: string[] = [];
function ok(condition: unknown, label: string) {
  if (!condition) failures.push(label);
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
}

/** a command in the product, its output kept in the work folder; whether it passed */
function run(cmd: string, args: string[], log: string, env: Record<string, string> = {}): boolean {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd: DIR, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, CI: "1", ...env }, maxBuffer: 1 << 28 });
  writeFileSync(join(WORK, log), `${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  console.log(`  exit ${r.status}, ${Math.round((Date.now() - started) / 1000)}s, log ${log}`);
  if (r.status !== 0) console.log(`${r.stdout ?? ""}\n${r.stderr ?? ""}`.split("\n").slice(-80).join("\n"));
  return r.status === 0;
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => resolve(typeof a === "object" && a ? a.port : 0));
    });
  });

type Page = {
  goto(url: string): Promise<unknown>;
  goBack(): Promise<unknown>;
  waitForFunction(fn: string, arg?: unknown, o?: { timeout?: number }): Promise<unknown>;
  evaluate<T>(fn: string): Promise<T>;
  click(selector: string): Promise<void>;
  on(event: "pageerror", fn: (e: Error) => void): void;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void> };

/** Playwright from the first place it is installed, as e2e/run.ts finds it: it is no dependency of the project */
function playwright(): { chromium: { launch(): Promise<Browser> } } | null {
  const require = createRequire(join(ROOT, "package.json"));
  const tries = [process.env.PLAYWRIGHT_PATH, "playwright", ...(process.env.NODE_PATH ?? "").split(":").filter(Boolean).map((d) => join(d, "playwright"))];
  try {
    tries.push(join(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], cwd: WORK }).trim(), "playwright"));
  } catch {
    // no npm
  }
  for (const p of tries) {
    if (!p) continue;
    try {
      return require(p) as { chromium: { launch(): Promise<Browser> } };
    } catch {
      // the next place
    }
  }
  return null;
}

/** a server of the web app (vite preview or dev) on a free port, once it answers */
async function serveWeb(mode: "preview" | "dev", env: Record<string, string> = {}): Promise<{ base: string; child: ChildProcess }> {
  const port = await freePort();
  const child = spawn(process.execPath, [join(DIR, "node_modules/vite/bin/vite.js"), mode, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: join(DIR, "apps/web"), env: { ...process.env, ...env }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { base, child };
}

setGlobalLang("en");
const read = (path: string) => readFile(join(ROOT, path), "utf8");
/* the shop's contract comes from the document itself (Doc.api), so no api is handed to the export */
const fixture: { doc: Doc; widths: Record<string, number>; api?: ReturnType<typeof productDoc>["api"] } =
  WHICH === "systems" ? { ...systemsDoc(), api: productDoc().api } : WHICH === "parts" ? { doc: allPartsDoc(), widths: {}, api: productDoc().api } : WHICH === "shop" ? shopProductDoc() : productDoc();
/* an operation that takes no parameters, to knock on, and the handler written for it */
const PROBE = WHICH === "shop" ? { path: "/products", handler: "listProducts", answer: '"items"' } : { path: "/health", handler: "getHealth", answer: '"ok"' };

rmSync(DIR, { recursive: true, force: true });
const product = await buildProduct(fixture.doc, fixture.widths, { lang: "en", read, api: fixture.api });
ok(!product.warnings.length, `nothing missing (${product.warnings.join("; ")})`);
const first = await exportToFolder(DIR, product);
console.log(reportLines(first).join("\n"));
ok(first.conflicts.length === 0 && first.unchanged.length === 0, "a first export writes every file");
console.log(`${Object.keys(product.files).length} files in ${DIR}`);

/* ---------- the real thing ---------- */

const installed = run("npm", ["install", "--no-audit", "--no-fund"], "product-install.log");
ok(installed, "npm install");
if (installed) {
  ok(run("npm", ["run", "typecheck"], "product-typecheck.log"), "npm run typecheck");
  ok(run("npm", ["run", "lint"], "product-lint.log"), "npm run lint (ESLint, no warnings; Prettier)");
  const built = run("npm", ["run", "build"], "product-build.log");
  ok(built, "npm run build (web and server)");
  ok(run("npm", ["test"], "product-test.log"), "npm test");

  if (built) {
    /* the web build: there, and with none of the mocks in it */
    const dist = join(DIR, "apps/web/dist");
    ok(existsSync(join(dist, "index.html")), "the web app is built");
    const assets = existsSync(join(dist, "assets")) ? readdirSync(join(dist, "assets")) : [];
    const js = assets.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(dist, "assets", f), "utf8")).join("\n");
    ok(js.length > 0 && !js.includes("createMockTransport") && !js.includes("Not mocked") && !js.includes("setupWorker"), "the web build has none of the mocks");
    ok(!existsSync(join(dist, "mockServiceWorker.js")), "nor the mocks' service worker");

    /* the built server, answering 501 until a handler is written, and the contract tests against it */
    ok(existsSync(join(DIR, "server/dist/main.js")), "the server is built");
    const port = await freePort();
    const server = spawn(process.execPath, ["dist/main.js"], { cwd: join(DIR, "server"), env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" }, stdio: "ignore" });
    try {
      let status = 0;
      for (let i = 0; i < 60 && !status; i++) {
        status = await fetch(`http://127.0.0.1:${port}${PROBE.path}`).then(
          (r) => r.status,
          () => 0,
        );
        if (!status) await new Promise((r) => setTimeout(r, 250));
      }
      ok(status === 501, `the built server answers an operation not written yet with 501 (got ${status})`);
      ok(run("npm", ["test", "-w", "contract-tests"], "product-contract.log", { CONTRACT_BASE_URL: `http://127.0.0.1:${port}` }), "the contract tests pass against the running server");
    } finally {
      server.kill();
    }
  }
}

/* ---------- in a browser ---------- */

const pw = installed ? playwright() : null;
ok(!installed || pw, "Playwright is installed (npm i -g playwright && npx playwright install chromium, or PLAYWRIGHT_PATH)");
if (pw && (WHICH === "proof" || WHICH === "shop")) {
  const browser = await pw.chromium.launch();
  const screenIs = (page: Page, key: string) => page.waitForFunction(`document.querySelector("[data-screen]")?.getAttribute("data-screen") === ${JSON.stringify(key)}`, undefined, { timeout: 10_000 }).then(() => true, () => false);
  const path = (page: Page) => page.evaluate<string>("location.pathname");
  try {
    const web = await serveWeb("preview");
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${web.base}/`);
      ok(await screenIs(page, "menu"), "the built app starts on its first screen");
      ok((await path(page)) === "/menu", `at that screen's address (${await path(page)})`);
      await page.click('[data-screen] button:has-text("Form")');
      ok((await screenIs(page, "form")) && (await path(page)) === "/form", "a tap opens the next screen at its own address");
      await page.goBack();
      ok((await screenIs(page, "menu")) && (await path(page)) === "/menu", "the browser's back goes back a screen");
      await page.goto(`${web.base}/counter`);
      ok(await screenIs(page, "counter"), "an address opened directly starts at its screen");
      ok(!errors.length, `the built app throws nothing (${errors.join("; ")})`);
    } finally {
      web.child.kill();
    }
    for (const mocks of ["transport", "msw"]) {
      const dev = await serveWeb("dev", { VITE_API_MOCKS: mocks });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`${dev.base}/`);
        ok(await screenIs(page, "menu"), `the dev server draws the app with the mocks on (${mocks})`);
        if (mocks === "msw") {
          await page.waitForFunction("!!navigator.serviceWorker.controller", undefined, { timeout: 10_000 }).catch(() => {});
          const answer = await page.evaluate<string>(`fetch("/api${PROBE.path}").then((r) => r.text())`);
          ok(answer.includes(PROBE.answer), `the mocks' service worker answers the API (${answer.slice(0, 80)})`);
        }
        ok(!errors.length, `the dev app throws nothing (${errors.join("; ")})`);
      } finally {
        dev.child.kill();
      }
    }
  } finally {
    await browser.close();
  }
}

/* ---------- exported again over it ---------- */

const again = await exportToFolder(DIR, product);
ok(again.writes.filter((w) => w.why !== "manifest").length === 0 && again.conflicts.length === 0, "the same export again writes nothing");

const seededPath = `server/src/handlers/${PROBE.handler}.ts`;
const generatedPath = "apps/web/src/generated/router.ts";
writeFileSync(join(DIR, seededPath), `${readFileSync(join(DIR, seededPath), "utf8")}// custom: implemented here\n`);
writeFileSync(join(DIR, generatedPath), `${readFileSync(join(DIR, generatedPath), "utf8")}// edited by hand\n`);
const pkgPath = join(DIR, "server/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies: Record<string, string> };
pkg.dependencies["left-pad"] = "1.3.0";
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
const edited = await buildProduct({ ...fixture.doc, title: fixture.doc.title }, fixture.widths, { lang: "en", read, api: fixture.api });
const third = await exportToFolder(DIR, edited);
console.log(reportLines(third).join("\n"));
ok(readFileSync(join(DIR, seededPath), "utf8").includes("// custom: implemented here"), "a seeded file someone edited is kept");
ok(third.kept.includes(seededPath), "and reported as kept");
ok(readFileSync(join(DIR, generatedPath), "utf8").includes("// edited by hand"), "a generated file someone edited is not overwritten");
ok(third.conflicts.some((c) => c.path === generatedPath) && existsSync(join(DIR, `${generatedPath}.m3e-new`)), "it is reported as a conflict, the new version in .m3e-new");
ok((JSON.parse(readFileSync(pkgPath, "utf8")) as { dependencies: Record<string, string> }).dependencies["left-pad"] === "1.3.0", "a dependency someone added to a generated package.json stays");

console.log(`\n${failures.length ? `${failures.length} FAILED:\n  ${failures.join("\n  ")}` : "all passed"}`);
process.exit(failures.length ? 1 : 0);
