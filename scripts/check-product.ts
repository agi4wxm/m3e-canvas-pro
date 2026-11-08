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
// whose contract is its own (Doc.api: the shop's OpenAPI and the chat's AsyncAPI, lib/api/fixtures), read by the export,
// and whose screens are bound to it (a paged product list, a detail by its id, a form that adds a product, a sign-in):
// its web app is driven in Chromium on the mocks and on the real server (scripts/check-shop-app.ts), and screenshots of
// its screens go to <work folder>/shots-shop. Its mobile app (apps/mobile) is bundled by Metro for Android and the web and
// driven the same way (scripts/check-mobile.ts), its screenshots beside the web app's. The mini-program (apps/miniapp,
// Taro) is built by `npm run build` for WeChat, Douyin and H5: the builds are read (a page for each screen, nothing a
// mini-program may not run, no mocks), and the shop's H5 build is driven the same way on the mocks and on the server
// (scripts/check-miniapp-app.ts).
import { execSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allPartsDoc } from "../lib/codegen.fixture";
import { systemsDoc } from "../lib/exportProject.fixture";
import { exportToFolder, reportLines } from "../lib/export/nodeWriter";
import { buildProduct } from "../lib/export/product";
import { boundShopDoc, productDoc, RECEIPT_ORDER } from "../lib/export/product.fixture";
import { fromBase64 } from "../lib/mocks/bytes";
import { createMockTransport } from "../lib/mocks/transport";
import { miniappBuilt, miniappOnMocks, miniappOnServer, serveMiniappH5, type MiniBrowser } from "./check-miniapp-app";
import { shopOnMocks, shopOnServer, type ShopBrowser } from "./check-shop-app";
import { checkMobile } from "./check-mobile";
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
/* the screenshots of the shop's web app, on the mocks and on the server */
const SHOTS = join(WORK, `shots-${WHICH}`);
mkdirSync(SHOTS, { recursive: true });
const failures: string[] = [];
function ok(condition: unknown, label: string) {
  if (!condition) failures.push(label);
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
}

/** a command in the product (or a folder of it), its output kept in the work folder; whether it passed */
function run(cmd: string, args: string[], log: string, env: Record<string, string> = {}, cwd = DIR): boolean {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, CI: "1", ...env }, maxBuffer: 1 << 28 });
  writeFileSync(join(WORK, log), `${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  console.log(`  exit ${r.status}, ${Math.round((Date.now() - started) / 1000)}s, log ${log}`);
  if (r.status !== 0) console.log(`${r.stdout ?? ""}\n${r.stderr ?? ""}`.split("\n").slice(-80).join("\n"));
  return r.status === 0;
}

/** a command in the product, its output kept in the work folder and given back */
function runOut(cmd: string, args: string[], log: string, env: Record<string, string> = {}): { ok: boolean; out: string } {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: DIR, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, CI: "1", ...env }, maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  writeFileSync(join(WORK, log), out);
  console.log(
    out
      .split("\n")
      .filter((l) => /^contract:|^ {2}(ok|pending|PENDING|FAIL)\b/.test(l))
      .join("\n"),
  );
  return { ok: r.status === 0, out };
}

/** the summary line of the contract tests */
const summaryOf = (out: string) => /contract: .*/.exec(out)?.[0] ?? "no summary";

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
type Browser = ShopBrowser & MiniBrowser & { newPage(o?: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Page & Awaited<ReturnType<ShopBrowser["newPage"]>>>; close(): Promise<void> };

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
  /* the web app's own vite: npm keeps it beside the app when another workspace (the mini-program's Taro) wants an older one */
  const vite = join(dirname(createRequire(join(DIR, "apps/web/package.json")).resolve("vite/package.json")), "bin/vite.js");
  const child = spawn(process.execPath, [vite, mode, "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: join(DIR, "apps/web"), env: { ...process.env, ...env }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { base, child };
}

/** the mini-program's H5 development server (the mocks on) on a free port, once it answers: Taro's CLI run with Node
 *  (its dev server cannot listen under bun) from the app's folder, so it can be stopped with its process */
async function serveMiniapp(): Promise<{ base: string; up: boolean; child: ChildProcess }> {
  const port = await freePort();
  const app = join(DIR, "apps/miniapp");
  const taro = createRequire(join(app, "package.json")).resolve("@tarojs/cli/bin/taro");
  const child = spawn("node", [taro, "build", "--type", "h5", "--watch"], { cwd: app, env: { ...process.env, H5_PORT: String(port) }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 720 && !up; i++) {
    up = await fetch(base).then(
      (r) => r.ok,
      () => false,
    );
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  return { base, up, child };
}

/** the built server on a free port, once it answers; the status it gave the probe. It runs in development (its docs,
 *  every answer checked against the contract) unless `production`: then NODE_ENV is left unset, as `npm start` has it */
async function startServer(o: { production?: boolean } = {}): Promise<{ base: string; status: number; stop: () => void }> {
  const port = await freePort();
  const env: Record<string, string | undefined> = { ...process.env, PORT: String(port), HOST: "127.0.0.1", LOG_LEVEL: "warn", NODE_ENV: o.production ? undefined : "development" };
  if (o.production) delete env.NODE_ENV;
  const child = spawn(process.execPath, ["dist/main.js"], { cwd: join(DIR, "server"), env, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  let status = 0;
  for (let i = 0; i < 60 && !status; i++) {
    status = await fetch(`${base}${PROBE.path}`).then(
      (r) => r.status,
      () => 0,
    );
    if (!status) await new Promise((r) => setTimeout(r, 250));
  }
  return { base, status, stop: () => child.kill() };
}

setGlobalLang("en");
const read = (path: string) => readFile(join(ROOT, path), "utf8");
/* the shop's contract comes from the document itself (Doc.api), so no api is handed to the export; its screens are
   bound to it */
const fixture: { doc: Doc; widths: Record<string, number>; api?: ReturnType<typeof productDoc>["api"] } =
  WHICH === "systems" ? { ...systemsDoc(), api: productDoc().api } : WHICH === "parts" ? { doc: allPartsDoc(), widths: {}, api: productDoc().api } : WHICH === "shop" ? boundShopDoc() : productDoc();
/* an operation that takes no parameters, to knock on, and the handler written for it */
const PROBE = WHICH === "shop" ? { path: "/products", handler: "listProducts", answer: '"items"' } : { path: "/health", handler: "getHealth", answer: '"status"' };
/* the shop's mocks answer with data made from its schemas (packages/mocks is the editor's own mock library) */
const madeUp = (text: string) => {
  try {
    const body = JSON.parse(text) as { items?: { id?: unknown; name?: unknown; price?: { amount?: unknown } }[]; status?: unknown };
    if (WHICH !== "shop") return typeof body.status === "string";
    return Array.isArray(body.items) && body.items.length > 1 && body.items.every((p) => typeof p.id === "string" && typeof p.name === "string" && typeof p.price?.amount === "number");
  } catch {
    return false;
  }
};
/* a request the contract turns down, and where */
const BAD: { method: string; path: string; body?: unknown; pointer: string } =
  WHICH === "shop" ? { method: "POST", path: "/auth/login", body: {}, pointer: "#/email" } : { method: "GET", path: "/products?page=many", pointer: "#/page" };
/* the token the authenticate() written below takes */
const TOKEN = "check-product-token";
/* authenticate() and the handlers of two operations, written into the shop as an AI coding agent would (in Prettier's
   style, as the product's lint asks of custom code) */
const IMPLEMENTED: Record<string, string> = {
  "server/src/custom/auth.ts": `import type { Credential } from "../generated/auth";

export type User = {
  id: string;
};

export async function authenticate(credential: Credential): Promise<User | null> {
  return credential.type === "bearer" && credential.token === "${TOKEN}"
    ? { id: "tester" }
    : null;
}
`,
  "server/src/handlers/createProduct.ts": `import { randomUUID } from "node:crypto";
import { table } from "../custom/db";
import { unprocessable } from "../generated/errors";
import type { Handler } from "../generated/handlers";
import type { Product } from "../generated/types";

export const products = table<Product>();

const createProduct: Handler<"createProduct"> = async (ctx) => {
  if (/taken/i.test(ctx.body.name)) {
    throw unprocessable("That name is taken.", [
      { pointer: "#/name", detail: "That name is taken" },
    ]);
  }
  return products.put({ ...ctx.body, id: randomUUID(), createdAt: new Date().toISOString() });
};

export default createProduct;
`,
  "server/src/handlers/listProducts.ts": `import type { Handler } from "../generated/handlers";
import { products } from "./createProduct";

const listProducts: Handler<"listProducts"> = async (ctx) => {
  const all = products
    .all()
    .filter((p) => !ctx.query.category || p.category === ctx.query.category);
  return ctx.paginate(all);
};

export default listProducts;
`,
};
/* the two more operations the shop's screens use, written later the same way: signing in, one product by its id */
const FOR_THE_SCREENS: Record<string, string> = {
  "server/src/handlers/login.ts": `import type { Handler } from "../generated/handlers";

const login: Handler<"login"> = async () => {
  return {
    accessToken: "${TOKEN}",
    refreshToken: "${TOKEN}-refresh",
    expiresIn: 3600,
  };
};

export default login;
`,
  "server/src/handlers/getProduct.ts": `import { notFound } from "../generated/errors";
import type { Handler } from "../generated/handlers";
import { products } from "./createProduct";

const getProduct: Handler<"getProduct"> = async (ctx) => {
  const found = products.get(ctx.params.productId);
  if (!found) throw notFound("There is no such product.");
  return found;
};

export default getProduct;
`,
};

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
    ok(js.length > 0 && !js.includes("createMockTransport") && !js.includes("Not mocked") && !js.includes("setupWorker") && !js.includes("m3e-mock-engine"), "the web build has none of the mocks");
    ok(!existsSync(join(dist, "mockServiceWorker.js")), "nor the mocks' service worker");

    /* the mini-program's builds (WeChat, Douyin, H5), read: a page for each screen, nothing a mini-program may not run,
       none of the mocks (scripts/check-miniapp-app.ts) */
    const config = product.files["apps/miniapp/src/app.config.ts"];
    if (config) {
      const pages = JSON.parse(/"pages": (\[[^\]]*\])/.exec(String(config.body))?.[1] ?? "[]") as string[];
      const scenarios = ["new-user", "network-error", ...(fixture.doc.mocks?.scenarios ?? []).map((s) => s.id)];
      miniappBuilt(join(DIR, "apps/miniapp"), ok, { pages, tabBar: "apps/miniapp/src/custom-tab-bar/index.tsx" in product.files, scenarios });
    }

    /* the built server, answering 501 until a handler is written, and the contract tests against it */
    ok(existsSync(join(DIR, "server/dist/main.js")), "the server is built");
    /* started as npm start starts it (no NODE_ENV), the built server is the production one: no docs, nosniff */
    const shipped = await startServer({ production: true });
    try {
      const docs = await fetch(`${shipped.base}/docs/json`).then(
        (r) => r.status,
        () => 0,
      );
      const sniff = await fetch(`${shipped.base}${PROBE.path}`).then(
        (r) => r.headers.get("x-content-type-options"),
        () => null,
      );
      ok(shipped.status === 501 && docs === 404 && sniff === "nosniff", `the built server runs as production unless NODE_ENV says otherwise: no /docs (${docs}), answers marked nosniff (${sniff})`);
    } finally {
      shipped.stop();
    }
    let server = await startServer();
    try {
      ok(server.status === 501, `the built server answers an operation not written yet with 501 (got ${server.status})`);
      const base = server.base;
      const stub = await fetch(`${base}${PROBE.path}`);
      ok(/application\/problem\+json/.test(stub.headers.get("content-type") ?? "") && ((await stub.json()) as { status?: number }).status === 501, "as problem details (application/problem+json)");
      const health = await fetch(`${base}${WHICH === "shop" ? "/health" : "/healthz"}`).then(
        (r) => r.status,
        () => 0,
      );
      ok(health === 200, `it answers its health (${health})`);
      const docs = (await fetch(`${base}/docs/json`).then(
        (r) => r.json(),
        () => ({}),
      )) as { openapi?: string };
      ok(docs.openapi === "3.1.0", "it serves the contract at /docs in development");
      const bad = await fetch(`${base}${BAD.path}`, { method: BAD.method, headers: { "content-type": "application/json" }, ...(BAD.body === undefined ? {} : { body: JSON.stringify(BAD.body) }) });
      const badBody = (await bad.json().catch(() => ({}))) as { errors?: { pointer: string }[] };
      ok(
        bad.status === 400 && /application\/problem\+json/.test(bad.headers.get("content-type") ?? "") && !!badBody.errors?.some((e) => e.pointer === BAD.pointer),
        `a request the contract turns down is 400 problem+json, with ${BAD.pointer} among its errors (${bad.status} ${JSON.stringify(badBody).slice(0, 160)})`,
      );
      if (WHICH === "shop") {
        const anonymous = await fetch(`${base}/products`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        ok(anonymous.status === 401 && /bearer/i.test(anonymous.headers.get("www-authenticate") ?? ""), `a secured operation without credentials is 401 with a Bearer challenge (${anonymous.status})`);
        const someone = await fetch(`${base}/products`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer someone" }, body: "{}" });
        ok(someone.status === 501, `with a credential, authenticate() not written yet answers 501 (${someone.status})`);
      }
      ok(run("npm", ["test", "-w", "contract-tests"], "product-contract.log", { CONTRACT_BASE_URL: base }), "the contract tests pass against the running server");
      const fresh = runOut("npm", ["run", "contract", "-w", "contract-tests", "--", "--base-url", base], "product-contract-cli.log");
      ok(fresh.ok && /0 implemented, \d+ pending, 0 failing/.test(fresh.out), `a fresh skeleton is green: every operation pending, none failing (${summaryOf(fresh.out)})`);
      ok(!runOut("npm", ["run", "contract", "-w", "contract-tests", "--", "--base-url", base, "--strict"], "product-contract-strict.log").ok, "--strict fails while operations are pending");

      if (WHICH === "shop") {
        /* the back end of two operations written as an AI coding agent would: in the handlers and custom/ only */
        for (const [path, body] of Object.entries(IMPLEMENTED)) writeFileSync(join(DIR, path), body);
        ok(run("npm", ["run", "typecheck", "-w", "server"], "product-impl-typecheck.log"), "handlers written against the generated types typecheck");
        ok(run("npx", ["eslint", "server", "--max-warnings=0"], "product-impl-eslint.log") && run("npx", ["prettier", "--check", "server"], "product-impl-prettier.log"), "and pass ESLint and Prettier");
        ok(run("npm", ["run", "build", "-w", "server"], "product-impl-build.log"), "the server builds with them");
        server.stop();
        server = await startServer();
        const two = runOut("npm", ["run", "contract", "-w", "contract-tests", "--", "--base-url", server.base, "--strict", "--only", "listProducts,createProduct"], "product-contract-implemented.log", { CONTRACT_TOKEN: TOKEN });
        ok(two.ok && /2 implemented, 0 pending, 0 failing/.test(two.out), `--strict passes for the two operations written (${summaryOf(two.out)})`);
        const created = await fetch(`${server.base}/products`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ name: "Lamp", price: { amount: 25, currency: "CNY" }, category: "bags" }) });
        const listed = (await fetch(`${server.base}/products?limit=5`).then((r) => r.json())) as { items?: { name: string }[]; nextCursor?: unknown };
        ok(created.status === 201 && !!listed.items?.some((p) => p.name === "Lamp") && "nextCursor" in listed, `what is created is listed, in the contract's page (${created.status}, ${JSON.stringify(listed).slice(0, 120)})`);
        const rest = runOut("npm", ["run", "contract", "-w", "contract-tests", "--", "--base-url", server.base], "product-contract-all.log", { CONTRACT_TOKEN: TOKEN });
        ok(rest.ok && /2 implemented, \d+ pending, 0 failing/.test(rest.out), `the rest stays pending (${summaryOf(rest.out)})`);

        /* the operations the screens need beside those, then the built web app on this server */
        for (const [path, body] of Object.entries(FOR_THE_SCREENS)) writeFileSync(join(DIR, path), body);
        ok(run("npm", ["run", "typecheck", "-w", "server"], "product-screens-typecheck.log") && run("npx", ["eslint", "server", "--max-warnings=0"], "product-screens-eslint.log") && run("npx", ["prettier", "--check", "server"], "product-screens-prettier.log"), "the screens' handlers typecheck and pass ESLint and Prettier");
        ok(run("npm", ["run", "build", "-w", "server"], "product-screens-build.log"), "the server builds with them");
        server.stop();
        server = await startServer();
        const pw = playwright();
        if (pw) {
          const browser = await pw.chromium.launch();
          const web = await serveWeb("preview", { API_TARGET: server.base });
          try {
            await shopOnServer(browser, web.base, SHOTS, ok, { session: `${product.name}:session`, stop: () => server.stop() });
          } finally {
            web.child.kill();
          }
          /* the mini-program's H5 build on a server of its own (what the web app added went with the last one), its
             /api passed on to it as a production host would */
          server = await startServer();
          const h5 = await serveMiniappH5(join(DIR, "apps/miniapp/dist/h5"), server.base);
          try {
            await miniappOnServer(browser, h5.base, SHOTS, ok, { session: `${product.name}:session`, stop: () => server.stop() });
          } finally {
            h5.close();
            await browser.close();
          }
        }
      }
    } finally {
      server.stop();
    }
  }
}

/* ---------- in a browser ---------- */

const pw = installed ? playwright() : null;
ok(!installed || pw, "Playwright is installed (npm i -g playwright && npx playwright install chromium, or PLAYWRIGHT_PATH)");
if (pw && WHICH === "shop") {
  const browser = await pw.chromium.launch();
  try {
    const dev = await serveWeb("dev");
    try {
      await shopOnMocks(browser, dev.base, SHOTS, ok);
    } finally {
      dev.child.kill();
    }
    const mini = await serveMiniapp();
    try {
      ok(mini.up, "the mini-program's H5 development server starts (taro build --type h5 --watch)");
      if (mini.up) await miniappOnMocks(browser, mini.base, SHOTS, ok);
    } finally {
      mini.child.kill();
    }
    const msw = await serveWeb("dev", { VITE_API_MOCKS: "msw" });
    try {
      const page = await browser.newPage();
      await page.goto(`${msw.base}/products`);
      await page.waitForFunction("!!navigator.serviceWorker.controller", undefined, { timeout: 10_000 }).catch(() => {});
      const answer = await page.evaluate<string>(`fetch("/api${PROBE.path}").then((r) => r.text())`);
      ok(answer.includes(PROBE.answer), `the mocks' service worker answers the API (${answer.slice(0, 80)})`);
      ok(madeUp(answer), "with data the mock library made from the contract's schemas");
      ok(await page.waitForFunction(`document.querySelectorAll('[data-screen] [data-scroll-body] [role="button"]').length > 3`, undefined, { timeout: 10_000 }).then(() => true, () => false), "and the list draws it, through the service worker");
      /* a download (an order's receipt, a PDF of the mocks' library): the service worker sends its bytes, and the app's
         own client (the fetch transport) gives them back whole, as the file the mocks answer with */
      const want = (await createMockTransport(fixture.doc, { latency: false }).request({ operationId: "getOrderReceipt", method: "GET", path: `/orders/${RECEIPT_ORDER}/receipt` })).body as { name: string; type: string; dataUrl: string; size: number };
      const wantSha = createHash("sha256").update(fromBase64(want.dataUrl.slice(want.dataUrl.indexOf(",") + 1))).digest("hex");
      const got = await page.evaluate<{ name?: string; type?: string; size?: number; sha?: string; raw?: string; error?: string }>(`(async () => {
        const sha = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("")
        const raw = new Uint8Array(await (await fetch("/api/orders/${RECEIPT_ORDER}/receipt")).arrayBuffer())
        const { api } = await import("/src/generated/api.ts")
        const file = await api.getOrderReceipt({ params: { orderId: "${RECEIPT_ORDER}" } })
        if (!file || typeof file.dataUrl !== "string") return { error: "not a file: " + JSON.stringify(file).slice(0, 80) }
        const bin = atob(file.dataUrl.slice(file.dataUrl.indexOf(",") + 1))
        return { name: file.name, type: file.type, size: file.size, sha: await sha(Uint8Array.from(bin, (c) => c.charCodeAt(0))), raw: await sha(raw) }
      })()`);
      ok(
        got.raw === wantSha && got.sha === wantSha && got.name === want.name && got.type === "application/pdf" && got.size === want.size,
        `a download (${want.name}, ${want.size} bytes) arrives whole through the service worker and the app's client (${JSON.stringify({ ...got, want: wantSha.slice(0, 12) })})`,
      );
    } finally {
      msw.child.kill();
    }
  } finally {
    await browser.close();
  }
}
if (pw && WHICH === "proof") {
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
          ok(madeUp(answer), "with data the mock library made from the contract's schemas");
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

/* ---------- the mobile app (apps/mobile): Metro, the mocks and the real server in a browser ---------- */

if (WHICH === "shop" && installed) {
  const browser = pw ? await pw.chromium.launch() : null;
  try {
    await checkMobile({ dir: DIR, work: WORK, shots: SHOTS, ok, run, freePort, browser: browser as never, token: TOKEN });
  } finally {
    await browser?.close();
  }
}

/* ---------- exported again over it ---------- */

const again = await exportToFolder(DIR, product);
ok(again.writes.filter((w) => w.why !== "manifest").length === 0 && again.conflicts.length === 0, "the same export again writes nothing");
if (WHICH === "shop" && installed)
  ok(
    Object.entries({ ...IMPLEMENTED, ...FOR_THE_SCREENS }).every(([path, body]) => readFileSync(join(DIR, path), "utf8") === body && again.kept.includes(path)),
    "the handlers and authenticate() written into it are kept byte for byte",
  );

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

/* ---------- the contract changes ---------- */

if (WHICH === "shop" && fixture.doc.api) {
  const api = fixture.doc.api;
  const reviews = {
    operationId: "listReviews",
    method: "get" as const,
    path: "/products/{productId}/reviews",
    summary: "The reviews of a product",
    security: [],
    parameters: [{ name: "productId", in: "path" as const, required: true, schema: { type: "string" as const, format: "uuid" } }],
    responses: { "200": { description: "Its reviews", content: { "application/json": { schema: { type: "array" as const, items: { type: "string" as const } } } } } },
  };
  const before = new Set(third.conflicts.map((c) => c.path));
  const custom = Object.fromEntries(["server/src/custom/auth.ts", "server/src/handlers/createProduct.ts", seededPath].map((path) => [path, readFileSync(join(DIR, path), "utf8")]));
  const grown = await exportToFolder(DIR, await buildProduct({ ...fixture.doc, api: { ...api, endpoints: [...(api.endpoints ?? []), reviews] } }, fixture.widths, { lang: "en", read }));
  console.log(reportLines(grown).join("\n"));
  const seeds = grown.writes.filter((w) => w.why === "seed").map((w) => w.path);
  ok(seeds.length === 1 && seeds[0] === "server/src/handlers/listReviews.ts", `a new operation seeds one new handler stub (${seeds.join(", ")})`);
  ok(grown.conflicts.every((c) => before.has(c.path)) && !grown.orphaned.length && !grown.customOrphans.length, "and reports nothing else: no new conflict, nothing left over");
  ok(Object.entries(custom).every(([path, body]) => readFileSync(join(DIR, path), "utf8") === body), "the custom code stays as it was");
  if (installed) ok(run("npm", ["run", "typecheck", "-w", "server"], "product-grown-typecheck.log"), "the server typechecks with the new stub");
  const shrunk = await exportToFolder(DIR, await buildProduct({ ...fixture.doc, api: { ...api, endpoints: (api.endpoints ?? []).filter((e) => e.operationId !== "createProduct") } }, fixture.widths, { lang: "en", read }));
  console.log(reportLines(shrunk).join("\n"));
  ok(readFileSync(join(DIR, "server/src/handlers/createProduct.ts"), "utf8") === custom["server/src/handlers/createProduct.ts"], "an operation taken out of the contract leaves its handler in place");
  ok(shrunk.customOrphans.includes("server/src/handlers/createProduct.ts") && shrunk.customOrphans.includes("server/src/handlers/listReviews.ts"), `and reports it as an orphan (${shrunk.customOrphans.join(", ")})`);
  if (installed) ok(run("npm", ["run", "typecheck", "-w", "server"], "product-shrunk-typecheck.log"), "the server still typechecks with the orphans in place");
}

console.log(`\n${failures.length ? `${failures.length} FAILED:\n  ${failures.join("\n  ")}` : "all passed"}`);
process.exit(failures.length ? 1 : 0);
