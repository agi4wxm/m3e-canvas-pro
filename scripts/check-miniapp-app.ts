/* The exported shop's mini-program (scripts/check-product.ts shop), as far as it can be run here. Its WeChat and Douyin
 * builds are read, not run (that takes the platforms' developer tools): a page for each screen, what the platforms do
 * not allow nowhere in them, none of the mocks. Its H5 build, the same pages for the web, is driven in Chromium as a
 * person would: on the mocks (the development server, a scenario by ?scenario=) the list with its rows and its next page
 * as the page reaches its end, its empty and error designs, a product's detail from a row (its id in the page's query)
 * and again from its address alone, a picture picked from the platform and uploaded from the product's photo form, the
 * form refusing what the schema does not allow and then what the server refuses, on its field, a page that needs a
 * session sending the app to sign in and back, and the orders once signed in. On the real server (the
 * production build, its /api passed on to the server the check started): empty at first, signing in before adding a
 * product, the server's refusal on the name, the product listed and opened, a 401 sending the app to sign in and
 * back, and the error design once the server is gone. Screenshots of each go to the work folder. */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";

type Locator = {
  first(): Locator;
  last(): Locator;
  nth(i: number): Locator;
  locator(s: string): Locator;
  click(o?: { force?: boolean }): Promise<void>;
  fill(v: string): Promise<void>;
  count(): Promise<number>;
  innerText(): Promise<string>;
};
export type MiniPage = {
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  locator(s: string): Locator;
  evaluate<T>(fn: string): Promise<T>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(o: { path: string }): Promise<unknown>;
  on(event: "pageerror", fn: (e: Error) => void): void;
  waitForEvent(event: "filechooser", o?: { timeout?: number }): Promise<{ setFiles(files: { name: string; mimeType: string; buffer: Buffer }): Promise<void> }>;
  close(): Promise<void>;
};
export type MiniBrowser = { newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<MiniPage> };
type Ok = (condition: unknown, label: string) => void;

const VIEW = { viewport: { width: 412, height: 892 }, deviceScaleFactor: 1 };

/* ---------- the WeChat, Douyin and H5 builds, read ---------- */

/** every file under a folder, by its path from there */
function filesOf(dir: string, at = ""): string[] {
  if (!existsSync(join(dir, at))) return [];
  return readdirSync(join(dir, at)).flatMap((n) => {
    const p = at ? `${at}/${n}` : n;
    return statSync(join(dir, p)).isDirectory() ? filesOf(dir, p) : [p];
  });
}

/* What a mini-program may not run (no eval, no Function made from words) and the web's own APIs it does not have.
   webpack's lookup of the global object (`this||new Function("return this")()`, tried inside a try) is the one
   Function the runtime holds; it is never reached on a platform with globalThis. */
const FORBIDDEN: [string, RegExp][] = [
  ["eval", /\beval\(/],
  ["new Function", /new Function\((?!"return this"\))/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["fetch", /(?<![.\w])fetch\(/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["document.cookie", /document\.cookie/],
];

/** What the mocks would leave in a build: their transport, the hook that starts another scenario, a scenario's id. */
const mocksIn = (text: string, scenarios: string[]) => /createMockTransport|m3eMocks/.test(text) || scenarios.some((s) => text.includes(JSON.stringify(s)));

/** Reads the builds `npm run build` made in apps/miniapp/dist: weapp and tt with a page for each screen (`pages`, as
 *  "pages/<key>/index") in app.json and the platform's files for each, the custom tab bar when the app has one,
 *  nothing a mini-program may not run and none of the mocks; h5 with its page and none of the mocks either. */
export function miniappBuilt(app: string, ok: Ok, o: { pages: string[]; tabBar: boolean; scenarios: string[] }) {
  for (const [platform, markup, style] of [
    ["weapp", "wxml", "wxss"],
    ["tt", "ttml", "ttss"],
  ] as const) {
    const dist = join(app, "dist", platform);
    const files = filesOf(dist);
    const manifest = existsSync(join(dist, "app.json")) ? (JSON.parse(readFileSync(join(dist, "app.json"), "utf8")) as { pages?: string[]; tabBar?: { custom?: boolean } }) : {};
    ok(JSON.stringify(manifest.pages) === JSON.stringify(o.pages), `${platform}: app.json lists a page for each screen (${(manifest.pages ?? []).join(", ")})`);
    const missing = o.pages.flatMap((p) => ["js", "json", markup].map((ext) => `${p}.${ext}`)).filter((f) => !files.includes(f));
    ok(!missing.length, `${platform}: each page has its script, its settings and its ${markup} (${missing.join(", ") || "all there"})`);
    ok(files.includes(`app.${style}`) && files.includes("app.js"), `${platform}: the app's script and its ${style}, the theme in it`);
    if (o.tabBar) ok(manifest.tabBar?.custom && files.some((f) => f.startsWith("custom-tab-bar/index.")), `${platform}: the tab bar is the app's own (custom-tab-bar)`);
    const scripts = files.filter((f) => f.endsWith(".js")).map((f) => [f, readFileSync(join(dist, f), "utf8")] as const);
    const found = FORBIDDEN.flatMap(([name, re]) => scripts.filter(([, text]) => re.test(text)).map(([f]) => `${name} in ${f}`));
    ok(!found.length, `${platform}: nothing a mini-program may not run (${found.join("; ") || "no eval, Function, XMLHttpRequest, fetch, web storage"})`);
    ok(!scripts.some(([, text]) => mocksIn(text, o.scenarios)), `${platform}: the production build carries none of the mocks`);
  }
  const h5 = join(app, "dist", "h5");
  const scripts = filesOf(h5).filter((f) => f.endsWith(".js"));
  ok(existsSync(join(h5, "index.html")) && scripts.length > 0, `h5: the web build has its page and scripts (${scripts.length})`);
  ok(!scripts.some((f) => mocksIn(readFileSync(join(h5, f), "utf8"), o.scenarios)), "h5: the production build carries none of the mocks");
}

/* ---------- the H5 build, served ---------- */

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };

/** Serves the production H5 build (`dist`) on a free port of 127.0.0.1, its /api passed on to `api`, as whatever serves
 *  the build in production would (the app calls /api on the web when TARO_APP_API_BASE_URL was not set). */
export async function serveMiniappH5(dist: string, api: string): Promise<{ base: string; close: () => void }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://here");
      if (url.pathname.startsWith("/api/")) {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([k, v]) => typeof v === "string" && !["host", "connection", "content-length"].includes(k))) as Record<string, string>;
        try {
          const out = await fetch(`${api}${url.pathname.slice(4)}${url.search}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
          res.writeHead(out.status, Object.fromEntries([...out.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k))));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch {
          res.writeHead(502).end();
        }
        return;
      }
      const path = join(dist, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
      const file = path.startsWith(dist) && existsSync(path) && statSync(path).isFile() ? path : join(dist, "index.html");
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/* ---------- the H5 build, driven ---------- */

/** the page on show (Taro's H5 router keeps the pages under it in the document, hidden) */
const ON = ".taro_page.taro_page_show";
const on = (page: MiniPage) => page.locator(ON).last();

/** the words the page on show has */
const words = async (page: MiniPage) => (await on(page).innerText().catch(() => "")).replace(/\s+/g, " ");
/** the page's address in the app: the hash route, "/pages/<key>/index?…" */
const route = (page: MiniPage) => page.evaluate<string>("decodeURIComponent(location.hash.slice(1))");

/** whether something comes true within a while */
async function until(page: MiniPage, test: () => Promise<boolean>, ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
const says = (page: MiniPage, text: string | RegExp, ms?: number) => until(page, async () => (typeof text === "string" ? (await words(page)).includes(text) : text.test(await words(page))), ms);
/** whether the app shows a page (its key), with a query matching `query` if given */
const at = (page: MiniPage, key: string, query?: RegExp, ms?: number) =>
  until(
    page,
    async () => {
      const r = await route(page);
      return r.split("?")[0] === `/pages/${key}/index` && (!query || query.test(r)) && (await on(page).locator(`[data-screen="${key}"]`).count()) > 0;
    },
    ms,
  );

/** the rows of the product list: the parts a tap opens a product from */
const rows = (page: MiniPage) => on(page).locator('[data-screen="products"] [data-part="row"][role="button"]');
const button = (page: MiniPage, label: string) => on(page).locator(`[role="button"]:has-text("${label}")`).first();
const input = (page: MiniPage, i: number) => on(page).locator('input:not([type="hidden"])').nth(i);

/** picks an option of a select: the platform's picker opened, the option tapped in its wheel, then 确定 (confirm) */
async function pick(page: MiniPage, label: string, option: string) {
  await on(page).locator(`[role="combobox"][aria-label="${label}"]`).first().click();
  await page.waitForTimeout(400);
  const sheet = page.locator('.weui-picker__overlay:not([style*="display: none"]) .weui-picker').last();
  await sheet.locator(`.weui-picker__item:text-is("${option}")`).first().click({ force: true });
  await page.waitForTimeout(300);
  await sheet.locator('.weui-picker__action:has-text("确定")').first().click();
  await page.waitForTimeout(400);
}

/** fills the new product's form: a name, an amount, a currency and a category */
async function fillProduct(page: MiniPage, name: string, amount = "25") {
  await input(page, 0).fill(name);
  await input(page, 1).fill(amount);
  await pick(page, "Currency", "CNY");
  await pick(page, "Category", "bags");
}

/** signs in on the sign-in page (any email and a password long enough) */
async function signIn(page: MiniPage) {
  await until(page, async () => (await button(page, "Sign in").count()) > 0);
  await input(page, 0).fill("ada@example.com");
  await input(page, 1).fill("correct horse");
  await button(page, "Sign in").click();
}

const PRODUCT = /productId=[0-9a-f-]{36}/;

/** a picture to upload: one pixel, a PNG */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** whether the platform's toast (outside the page) says something within a while */
const toasts = (page: MiniPage, text: string) => until(page, () => page.evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`), 5000);

/** The H5 app on the mocks: `base` is Taro's development server (the mocks on, a scenario by ?scenario=). */
export async function miniappOnMocks(browser: MiniBrowser, base: string, out: string, ok: Ok) {
  const page = await browser.newPage(VIEW);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name: string) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `miniapp-mocks-${name}.png`) });
  };
  const open = (path: string, scenario?: string) => page.goto(`${base}/${scenario !== undefined ? `?scenario=${scenario}` : ""}#${path}`);

  await open("/pages/products/index");
  ok(await until(page, async () => (await rows(page).count()) >= 10, 60_000), "miniapp mocks: the product list draws a row for each product the mocks made");
  await shot("list");
  const first = await rows(page).count();
  /* the page scrolls (Taro's H5 page, as a mini-program's page does), never a box inside it */
  await page.evaluate(`(() => { const pages = document.querySelectorAll("${ON}"); const el = pages[pages.length - 1]; el.scrollTop = el.scrollHeight })()`);
  ok(await until(page, async () => (await rows(page).count()) > first), `miniapp mocks: the page reaching its end loads the next page (onReachBottom: ${first} rows, then more)`);
  /* at its end the last row scrolls clear of the buttons that stay at the screen's foot (lib/foot.ts) */
  for (let i = 0; i < 4; i++) {
    await page.evaluate(`(() => { const pages = document.querySelectorAll("${ON}"); const el = pages[pages.length - 1]; el.scrollTop = el.scrollHeight })()`);
    await page.waitForTimeout(500);
  }
  const end = await page.evaluate<{ last: number; button: number }>(
    `(() => { const pages = document.querySelectorAll("${ON}"); const pg = pages[pages.length - 1]; const rows = [...pg.querySelectorAll('[data-screen="products"] [data-part="row"][role="button"]')]; const add = [...pg.querySelectorAll('[role="button"]')].find((b) => b.textContent.trim() === "Add product"); return { last: Math.max(...rows.map((r) => r.getBoundingClientRect().bottom)), button: add ? add.getBoundingClientRect().top : -1 } })()`,
  );
  ok(end.button > 0 && end.last <= end.button, `miniapp mocks: the buttons stay at the foot, and the end of the list scrolls clear of them (last row ends at ${Math.round(end.last)}, the buttons start at ${Math.round(end.button)})`);
  await shot("list-end");
  await page.evaluate(`(() => { const pages = document.querySelectorAll("${ON}"); pages[pages.length - 1].scrollTop = 0 })()`);

  const name = (await rows(page).first().innerText()).split("\n")[0].trim();
  await rows(page).first().click();
  ok(await at(page, "product", PRODUCT), `miniapp mocks: a tap on a row opens its product's page, its id in the page's query (${await route(page)})`);
  ok(await says(page, name), `miniapp mocks: the detail shows the product tapped (${name})`);
  await shot("detail");
  const detail = await route(page);
  const deep = await browser.newPage(VIEW);
  await deep.goto(`${base}/#${detail}`);
  ok(await says(deep, name), "miniapp mocks: the detail's address opened directly shows the same product (a deep link)");
  await deep.close();

  /* a picture of the product, picked from the platform (Taro.chooseImage: the browser's file chooser on H5) and sent as
     a multipart body (Taro.uploadFile; the mocks read it as a data URL); the form goes back to the product, a toast */
  await button(page, "Add a photo").click();
  ok(await at(page, "photo", PRODUCT), `miniapp mocks: the product's page opens the photo form, its id passed on (${await route(page)})`);
  await until(page, async () => (await button(page, "Choose files").count()) > 0);
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  await button(page, "Choose files").click();
  await (await chooser).setFiles({ name: "lamp.png", mimeType: "image/png", buffer: PNG });
  ok(await says(page, "lamp.png"), "miniapp mocks: the picture picked from the platform shows by its name");
  await shot("photo");
  await button(page, "Submit").click();
  ok((await toasts(page, "Photo added")) && (await at(page, "product", PRODUCT)), "miniapp mocks: the picture is uploaded and the form goes back to the product, with its toast");

  await open("/pages/products/index", "new-user");
  ok(await says(page, "Nothing here yet"), "miniapp mocks: the new-user scenario shows the list's empty design");
  await shot("empty");
  await open("/pages/products/index", "network-error");
  ok((await says(page, "Couldn't load")) && (await words(page)).includes("Can't reach the server"), "miniapp mocks: the network-error scenario shows the list's error design, with the problem's words");
  await shot("error");

  await open("/pages/newProduct/index", "");
  await until(page, async () => (await button(page, "Add a product").count()) > 0);
  const hint = await words(page);
  await button(page, "Add a product").click();
  ok(await until(page, async () => ((await words(page)).match(/Required/g) ?? []).length > (hint.match(/Required/g) ?? []).length), "miniapp mocks: the form refuses a submit with its required fields empty, each saying so");
  await input(page, 1).fill("-5");
  ok(await says(page, /At least 0|More than 0|greater than 0/i), "miniapp mocks: an amount the schema does not allow says so as it is typed");
  await shot("form-errors");
  await open("/pages/newProduct/index", "name-taken");
  await until(page, async () => (await button(page, "Add a product").count()) > 0);
  await fillProduct(page, "Taken lamp");
  await button(page, "Add a product").click();
  ok((await says(page, "That name is taken")) && (await words(page)).includes("That name is taken."), "miniapp mocks: what the server refuses lands on the field its pointer names, and on the form");
  await shot("form-server-error");

  await open("/pages/newProduct/index", "signed-out");
  ok(await at(page, "signIn"), "miniapp mocks: a page that needs a session, signed out, opens the sign-in page first");
  await shot("sign-in");
  await signIn(page);
  ok(await at(page, "newProduct"), "miniapp mocks: signing in goes on to the page that needed it");
  await fillProduct(page, "Desk lamp");
  await button(page, "Add a product").click();
  ok((await at(page, "products")) && (await says(page, "Desk lamp")), "miniapp mocks: a product added is in the list the form goes back to");
  await shot("created");
  await button(page, "Orders").click();
  ok((await at(page, "orders")) && (await until(page, async () => (await on(page).locator('[data-screen="orders"] [data-part^="row"]').count()) > 0)), "miniapp mocks: the orders (they need a session) open, signed in, and list the mocks' orders");
  await shot("orders");
  ok(!errors.length, `miniapp mocks: the app throws nothing (${errors.join("; ")})`);
  await page.close();
}

/** The production H5 build on the real server: `base` serves it with /api passed on to the server (serveMiniappH5);
 *  `session` is the key the session is kept by in Taro's storage; `stop` takes the server away. */
export async function miniappOnServer(browser: MiniBrowser, base: string, out: string, ok: Ok, o: { session: string; stop: () => void }) {
  const page = await browser.newPage(VIEW);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name: string) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `miniapp-server-${name}.png`) });
  };

  await page.goto(`${base}/#/pages/products/index`);
  ok(await says(page, "Nothing here yet", 30_000), "miniapp server: the list is empty before anything is added: its empty design");
  await shot("empty");
  await page.goto(`${base}/#/pages/newProduct/index`);
  ok(await at(page, "signIn"), "miniapp server: adding a product needs a session: the sign-in page first");
  await signIn(page);
  ok(await at(page, "newProduct"), "miniapp server: signed in with the token the server gave, on to the form");
  const hint = await words(page);
  await button(page, "Add a product").click();
  ok(await until(page, async () => ((await words(page)).match(/Required/g) ?? []).length > (hint.match(/Required/g) ?? []).length), "miniapp server: the schema's errors show before anything is sent");
  await fillProduct(page, "Taken lamp");
  await button(page, "Add a product").click();
  ok((await says(page, "That name is taken")) && (await words(page)).includes("That name is taken."), "miniapp server: the handler's 422 lands on the name, and on the form");
  await shot("form-server-error");
  await input(page, 0).fill("Desk lamp");
  await button(page, "Add a product").click();
  ok((await at(page, "products")) && (await says(page, "Desk lamp")), "miniapp server: the product is created (201) and listed");
  await shot("list");
  await rows(page).first().click();
  ok((await at(page, "product", PRODUCT)) && (await says(page, "Desk lamp")), "miniapp server: a tap on its row opens it, by its id");
  await shot("detail");
  await page.reload();
  ok(await says(page, "Desk lamp"), "miniapp server: the detail's address opened again loads it from the server (a deep link)");

  /* a token the server no longer takes (Taro keeps the session in localStorage on the web, wrapped as { data }): the
     401 sends the app to sign in, and back once signed in */
  const key = JSON.stringify(o.session);
  await page.evaluate(`(() => { const kept = JSON.parse(localStorage.getItem(${key})); const s = JSON.parse(kept.data); s.token = "expired"; kept.data = JSON.stringify(s); localStorage.setItem(${key}, JSON.stringify(kept)) })()`);
  await page.goto(`${base}/#/pages/newProduct/index`);
  await page.reload();
  await until(page, async () => (await button(page, "Add a product").count()) > 0);
  await fillProduct(page, "Floor lamp");
  await button(page, "Add a product").click();
  ok(await at(page, "signIn"), "miniapp server: a 401 (no refresh can mend it) sends the app to the sign-in page");
  await signIn(page);
  ok(await at(page, "newProduct"), "miniapp server: signing in comes back to where the 401 left the app");
  await button(page, "Add a product").click();
  ok((await at(page, "products")) && (await says(page, "Floor lamp")), "miniapp server: and the form, sent again with the new token, adds the product");

  o.stop();
  await page.goto(`${base}/#/pages/products/index`);
  await page.reload();
  ok(await says(page, "Couldn't load"), "miniapp server: with the server gone, the list shows its error design");
  await shot("error");
  ok(!errors.length, `miniapp server: the app throws nothing (${errors.join("; ")})`);
  await page.close();
}
