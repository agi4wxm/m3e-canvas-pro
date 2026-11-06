// The mobile app's part of scripts/check-product.ts (the `shop` fixture): apps/mobile, installed with the rest of the
// monorepo, is bundled by Metro for Android (with none of the mocks in it), exported for the web twice (a development
// build, which answers from the mocks, and a production build that calls the exported server), and driven in
// Playwright's Chromium: the catalog with its data, empty and failing as the mocks' scenario says, a row opening its
// item by its id, a form refusing what its schema does not allow and showing the server's error on its field, and a
// screen that needs a session sending the app to sign in and back. The same against the real server, with handlers
// written into it as an AI coding agent would. Screenshots go to the work folder (mobile-*.png), beside the web export's
// of the same screens (mobile-compare-*.png).
import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { extname, join } from "node:path";
import { SHOP_SIGN_IN } from "../lib/export/product.fixture";

type Locator = { count(): Promise<number>; first(): Locator; nth(i: number): Locator; click(): Promise<void>; innerText(): Promise<string>; fill(v: string): Promise<void> };
type Page = {
  goto(url: string): Promise<unknown>;
  url(): string;
  waitForTimeout(ms: number): Promise<void>;
  waitForFunction(fn: string, arg?: unknown, o?: { timeout?: number }): Promise<unknown>;
  locator(selector: string): Locator;
  innerText(selector: string): Promise<string>;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
  setContent(html: string): Promise<void>;
  on(event: "pageerror", fn: (e: Error) => void): void;
  waitForEvent(event: "filechooser", o?: { timeout?: number }): Promise<{ setFiles(f: { name: string; mimeType: string; buffer: Buffer }): Promise<void> }>;
  close(): Promise<void>;
};
type Browser = { newPage(o?: { viewport?: { width: number; height: number }; deviceScaleFactor?: number }): Promise<Page>; close(): Promise<void> };

export type MobileCheck = {
  dir: string;
  work: string;
  ok: (condition: unknown, label: string) => void;
  run: (cmd: string, args: string[], log: string, env?: Record<string, string>, cwd?: string) => boolean;
  freePort: () => Promise<number>;
  browser: Browser | null;
  /** the token authenticate() takes in the server written by the check */
  token: string;
};

const TYPES: Record<string, string> = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

/** a static server of an exported web app: every address that is no file is the app's page (one page, its router) */
async function serveStatic(root: string, port: number): Promise<{ base: string; close: () => void }> {
  const server = createHttpServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** the handlers and the sign-in the real server gets, written as an AI coding agent would (Prettier formats them) */
const HANDLERS = (token: string): Record<string, string> => ({
  "server/src/handlers/login.ts": `import { HttpError } from "../generated/errors";
import type { Handler } from "../generated/handlers";

const login: Handler<"login"> = async (ctx) => {
  if (ctx.body.email !== ${JSON.stringify(SHOP_SIGN_IN.email)} || ctx.body.password !== ${JSON.stringify(SHOP_SIGN_IN.password)})
    throw new HttpError(401, "Wrong email or password", {
      errors: [{ pointer: "#/password", detail: "That password is not right", in: "body" }],
    });
  return { accessToken: ${JSON.stringify(token)}, refreshToken: "check-product-refresh", expiresIn: 3600 };
};

export default login;
`,
  "server/src/handlers/getProduct.ts": `import { notFound } from "../generated/errors";
import type { Handler } from "../generated/handlers";
import { products } from "./createProduct";

const getProduct: Handler<"getProduct"> = async (ctx) => {
  const product = products.get(ctx.params.productId);
  if (!product) throw notFound();
  return product;
};

export default getProduct;
`,
  "server/src/handlers/listOrders.ts": `import type { Handler } from "../generated/handlers";
import { products } from "./createProduct";

const listOrders: Handler<"listOrders"> = async (ctx) => {
  const orders = products.all().map((product, i) => ({
    id: product.id,
    status: i % 2 ? ("shipped" as const) : ("paid" as const),
    items: [{ product, quantity: 1 }],
    total: product.price,
    placedAt: product.createdAt,
  }));
  return ctx.paginate(orders);
};

export default listOrders;
`,
});

/** the built server on a port, open to the app's origin, once it answers its health */
async function startServer(dir: string, port: number): Promise<{ base: string; up: boolean; stop: () => void }> {
  const child: ChildProcess = spawn(process.execPath, ["dist/main.js"], { cwd: join(dir, "server"), env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", LOG_LEVEL: "warn", CORS_ORIGINS: "*" }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(`${base}/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  return { base, up, stop: () => child.kill() };
}

/** what the page says, its words only */
const words = (page: Page) => page.innerText("body").catch(() => "");

/** waits until the page says something; whether it did */
async function says(page: Page, test: (text: string) => boolean, ms = 15_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (test(await words(page))) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** waits until the page is at an address */
async function at(page: Page, path: RegExp, ms = 15_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (path.test(new URL(page.url()).pathname)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** what is in a bundle Metro wrote: every JavaScript (or Hermes) file under a folder */
function bundleText(folder: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (/\.(js|hbc)$/.test(e.name)) out.push(readFileSync(join(d, e.name), "latin1"));
    }
  };
  if (existsSync(folder)) walk(folder);
  return out.join("\n");
}

const MOCK_MARKS = ["m3e-mock-engine", "createMockTransport", "Scenario of the mocks"];

/** a 1 × 1 PNG, to upload */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

export async function checkMobile(c: MobileCheck): Promise<void> {
  const { dir, work, ok, run } = c;
  const app = join(dir, "apps/mobile");
  const shots = (name: string) => join(work, `mobile-${name}.png`);
  mkdirSync(work, { recursive: true });
  ok(existsSync(join(dir, "node_modules/expo-router/package.json")) || existsSync(join(app, "node_modules/expo-router/package.json")), "npm install at the root installs the mobile app's packages (Expo, Expo Router)");

  /* Metro: Android, and the web twice */
  const android = run("npx", ["expo", "export", "--platform", "android", "--clear", "--output-dir", "dist/android"], "mobile-export-android.log", {}, app);
  ok(android, "expo export --platform android bundles the app");
  if (android) {
    const text = bundleText(join(app, "dist/android"));
    ok(text.length > 100_000 && MOCK_MARKS.every((m) => !text.includes(m)), "the Android bundle has none of the mocks");
  }
  const devWeb = run("npx", ["expo", "export", "--platform", "web", "--dev", "--clear", "--output-dir", "dist/web-dev"], "mobile-export-web-dev.log", {}, app);
  ok(devWeb, "expo export --platform web (development, with the mocks) bundles the app");
  if (devWeb) ok(bundleText(join(app, "dist/web-dev")).includes("m3e-mock-engine"), "the development build carries the mocks");

  const page = c.browser ? await c.browser.newPage({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 1 }) : null;
  if (!page) return;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  /* ---------- (a) the mocks ---------- */
  if (devWeb) {
    const web = await serveStatic(join(app, "dist/web-dev"), await c.freePort());
    try {
      const open = async (path: string) => {
        await page.goto(`${web.base}${path}${path.includes("?") ? "&" : "?"}devmenu=off`);
        await page.waitForTimeout(500);
      };
      await open("/");
      ok(await at(page, /^\/menu$/), `the app opens on the design's first screen, at its route (${page.url()})`);

      await open("/catalog");
      ok(await says(page, (t) => t.split("\n").filter((l) => l.endsWith("ago")).length >= 5), "the catalog lists the mocks' products");
      await page.screenshot({ path: shots("catalog") });
      const first = (await words(page)).split("\n").find((l) => l.trim().length > 2 && !l.endsWith("ago")) ?? "";
      await page.locator(`text=${first}`).first().click();
      ok(await at(page, /^\/item\/[0-9a-f-]{8,}$/), `a row opens its item, its id in the route (${page.url()})`);
      ok(await says(page, (t) => t.includes(first) && t.includes("Category")), `the item loads by its id and shows it (${first})`);
      await page.screenshot({ path: shots("item") });

      /* an upload: a file picked, sent as multipart/form-data, then back with a snackbar */
      const item = new URL(page.url()).pathname;
      await page.locator("text=Add a photo").first().click();
      ok(await at(page, /^\/photo\/[0-9a-f-]{8,}$/), `a tap opens the photo screen with the item's id (${page.url()})`);
      await page.locator('[data-testid^="submit:"]').first().click();
      ok(await says(page, (t) => t.includes("Required")), "the upload wants its file");
      const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
      await page.locator("text=Choose files").first().click();
      await (await chooser).setFiles({ name: "lamp.png", mimeType: "image/png", buffer: PNG });
      ok(await says(page, (t) => t.includes("lamp.png")), "the file picked shows its name");
      await page.screenshot({ path: shots("photo") });
      await page.locator('[data-testid^="submit:"]').first().click();
      ok((await at(page, new RegExp(`^${item}$`))) && (await says(page, (t) => t.includes("Photo added"))), "the upload goes through the mocks and the app goes back with its snackbar");

      await open("/catalog?scenario=new-user");
      ok(await says(page, (t) => t.includes("Nothing here yet")), "the new-user scenario shows the empty state's design");
      await page.screenshot({ path: shots("catalog-empty") });
      await open("/catalog?scenario=network-error");
      ok(await says(page, (t) => t.includes("Couldn't load")), "the network-error scenario shows the error state's design");
      await page.screenshot({ path: shots("catalog-error") });

      /* a form: the schema's errors before anything is sent, then the server's on its field */
      await open("/sell");
      ok(await says(page, (t) => t.includes("At most 120 characters")), "the form draws its fields with their hints");
      await page.locator('[data-testid^="submit:"]').first().click();
      ok(await says(page, (t) => !t.includes("At most 120 characters") && t.split("Required").length > 2), "submitting it empty shows the schema's errors on the fields");
      await page.screenshot({ path: shots("sell-errors") });
      const fillSell = async (name: string) => {
        await page.locator('[data-testid="field:name"]').fill(name);
        await page.locator('[data-testid="field:price.amount"]').fill("25");
        await page.locator('[data-testid="field:category"]').click();
        await page.locator('[role="menuitem"]:has-text("bags")').first().click();
        await page.locator('[data-testid^="submit:"]').first().click();
      };
      await open("/sell?scenario=name-taken");
      await fillSell("Lamp");
      ok(await says(page, (t) => t.includes("That name is taken")), "the server's error lands on its field");
      await page.screenshot({ path: shots("sell-server-error") });
      await open("/sell");
      await fillSell("Lamp");
      ok((await at(page, /^\/catalog$/)) && (await says(page, (t) => t.includes("Added Lamp"))), "a form that goes through goes where the design says, with its snackbar");

      /* a screen that needs a session: to sign in and back */
      await open("/orders?scenario=signed-out");
      ok(await at(page, /^\/sign-in$/), `signed out, the orders send the app to sign in (${page.url()})`);
      await page.locator('[data-testid="field:email"]').fill(SHOP_SIGN_IN.email);
      await page.locator('[data-testid="field:password"]').fill("wrong password");
      await page.locator('[data-testid^="submit:"]').first().click();
      ok(await says(page, (t) => /wrong|incorrect|credentials/i.test(t)), "a wrong password is turned down, and the form says so");
      await page.screenshot({ path: shots("sign-in-error") });
      await page.locator('[data-testid="field:password"]').fill(SHOP_SIGN_IN.password);
      await page.locator('[data-testid^="submit:"]').first().click();
      ok((await at(page, /^\/orders$/)) && (await says(page, (t) => /paid|shipped|pending|cancelled/.test(t))), "signed in, the app comes back to the orders and loads them");
      await page.screenshot({ path: shots("orders") });
      ok(!errors.length, `the app throws nothing (${errors.join("; ")})`);
    } finally {
      web.close();
    }
  }

  /* ---------- (b) the real server ---------- */
  for (const [path, body] of Object.entries(HANDLERS(c.token))) writeFileSync(join(dir, path), body);
  run("npx", ["prettier", "--write", ...Object.keys(HANDLERS(c.token))], "mobile-handlers-prettier.log");
  const serverBuilt = run("npm", ["run", "build", "-w", "server"], "mobile-server-build.log");
  ok(serverBuilt && run("npm", ["run", "typecheck", "-w", "server"], "mobile-server-typecheck.log"), "the server builds with the sign-in, an item and the orders written");
  if (!serverBuilt) return;
  const port = await c.freePort();
  const prodWeb = run("npx", ["expo", "export", "--platform", "web", "--clear", "--output-dir", "dist/web"], "mobile-export-web.log", { EXPO_PUBLIC_API_BASE_URL: `http://127.0.0.1:${port}` }, app);
  ok(prodWeb, "expo export --platform web (production, calling the server) bundles the app");
  if (!prodWeb) return;
  ok(MOCK_MARKS.every((m) => !bundleText(join(app, "dist/web")).includes(m)), "the production web build has none of the mocks");
  const server = await startServer(dir, port);
  const web = await serveStatic(join(app, "dist/web"), await c.freePort());
  errors.length = 0;
  try {
    ok(server.up, "the server starts for the app");
    const open = async (path: string) => {
      await page.goto(`${web.base}${path}`);
      await page.waitForTimeout(500);
    };
    await open("/catalog");
    ok(await says(page, (t) => t.includes("Nothing here yet")), "against the server, an empty catalog shows the empty state");
    for (const name of ["Desk lamp", "Reading chair"]) {
      const made = await fetch(`${server.base}/products`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${c.token}` }, body: JSON.stringify({ name, price: { amount: 30, currency: "CNY" }, category: "bags", description: `A ${name.toLowerCase()}` }) });
      ok(made.status === 201, `the server makes ${name} (${made.status})`);
    }
    await open("/catalog");
    ok(await says(page, (t) => t.includes("Desk lamp") && t.includes("Reading chair")), "the catalog lists what the server holds");
    await page.screenshot({ path: shots("server-catalog") });
    await page.locator("text=Reading chair").first().click();
    ok((await at(page, /^\/item\//)) && (await says(page, (t) => t.includes("Reading chair") && t.includes("A reading chair"))), "a row opens its item, which the server answers by its id");

    await open("/orders");
    ok(await at(page, /^\/sign-in$/), "no session: the orders send the app to sign in");
    await page.locator('[data-testid="field:email"]').fill(SHOP_SIGN_IN.email);
    await page.locator('[data-testid="field:password"]').fill("not the password");
    await page.locator('[data-testid^="submit:"]').first().click();
    ok(await says(page, (t) => t.includes("That password is not right")), "the server's 401 lands on the password field");
    await page.screenshot({ path: shots("server-sign-in-error") });
    await page.locator('[data-testid="field:password"]').fill(SHOP_SIGN_IN.password);
    await page.locator('[data-testid^="submit:"]').first().click();
    ok((await at(page, /^\/orders$/)) && (await says(page, (t) => t.includes("paid") && t.includes("shipped"))), "signed in, back at the orders, which the server answers with the token");
    await page.screenshot({ path: shots("server-orders") });

    await open("/sell");
    await page.locator('[data-testid^="submit:"]').first().click();
    ok(await says(page, (t) => t.split("Required").length > 2), "the form checks its fields before it calls the server");
    await page.locator('[data-testid="field:name"]').fill("Floor lamp");
    await page.locator('[data-testid="field:price.amount"]').fill("49.5");
    await page.locator('[data-testid="field:category"]').click();
    await page.locator('[role="menuitem"]:has-text("shoes")').first().click();
    await page.locator('[data-testid^="submit:"]').first().click();
    ok((await at(page, /^\/catalog$/)) && (await says(page, (t) => t.includes("Added Floor lamp") && t.includes("Floor lamp"))), "a product sold from the form is on the server and in the catalog");
    const listed = (await fetch(`${server.base}/products?limit=10`).then((r) => r.json())) as { items?: { name: string; price: { amount: number } }[] };
    ok(listed.items?.some((p) => p.name === "Floor lamp" && p.price.amount === 49.5), "with the numbers the form typed as numbers");

    server.stop();
    await open("/catalog");
    ok(await says(page, (t) => t.includes("Couldn't load")), "with the server gone, the catalog shows the error state");
    ok(!errors.length, `the production app throws nothing (${errors.join("; ")})`);
  } finally {
    server.stop();
    web.close();
  }

  /* ---------- beside the web export of the same screens ---------- */
  const webDist = join(dir, "apps/web/dist");
  if (existsSync(join(webDist, "index.html"))) {
    const site = await serveStatic(webDist, await c.freePort());
    try {
      for (const [name, path] of [["catalog", "/catalog"], ["sell", "/sell"], ["sign-in", "/sign-in"], ["counter", "/counter"]]) {
        await page.goto(`${site.base}${path}`);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(work, `web-${name}.png`) });
      }
      for (const name of ["catalog", "sell-errors"]) {
        const img = (p: string) => (existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString("base64")}` : "");
        await page.setContent(`<body style="margin:0;display:flex;gap:8px;background:#888"><img src="${img(join(work, `web-${name === "sell-errors" ? "sell" : name}.png`))}"><img src="${img(shots(name))}"></body>`);
        await page.screenshot({ path: join(work, `mobile-compare-${name}.png`), fullPage: true });
      }
    } finally {
      site.close();
    }
  }
  await page.close();
}
