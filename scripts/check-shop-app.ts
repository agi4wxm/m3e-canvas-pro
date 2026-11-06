/* The exported shop's web app in Chromium (scripts/check-product.ts shop): the screens bound to the contract, driven as a
 * person would. On the mocks (the dev server, the transport, a scenario by ?scenario=): the list with its rows, its next
 * page on scroll and a pull that loads it again; its empty and error designs under the scenarios that make them; a
 * product's detail from a row and again from its address alone (a deep link); the form refusing what the schema does
 * not allow, then what the server refuses, on its field; a screen that needs a session sending the app to sign in and
 * back. On the real server (the built app, its /api proxied to the server the check started, two more handlers
 * written as an AI coding agent would): empty at first, signing in before adding a product, the server's refusal on the
 * name, the product listed and opened, a 401 sending the app to sign in and back, and the error design when the server
 * is gone. Screenshots of each go to the work folder. */

import { join } from "node:path";

type Locator = {
  first(): Locator;
  nth(i: number): Locator;
  click(): Promise<void>;
  fill(v: string): Promise<void>;
  count(): Promise<number>;
  innerText(): Promise<string>;
};
export type ShopPage = {
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  locator(s: string): Locator;
  evaluate<T>(fn: string): Promise<T>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(o: { path: string }): Promise<unknown>;
  on(event: "pageerror", fn: (e: Error) => void): void;
  close(): Promise<void>;
};
export type ShopBrowser = { newPage(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<ShopPage> };
type Ok = (condition: unknown, label: string) => void;

const VIEW = { viewport: { width: 412, height: 892 }, deviceScaleFactor: 1 };

/** the screen in use: not one on its way out (a transition keeps it on the page a moment), nor one under an overlay */
const ON = "[data-page][data-active]";

/** the words the screen on show has */
const words = async (page: ShopPage) => (await page.locator(ON).first().innerText().catch(() => "")).replace(/\s+/g, " ");
const pathOf = (page: ShopPage) => page.evaluate<string>("location.pathname");

/** whether something comes true within a while */
async function until(page: ShopPage, test: () => Promise<boolean>, ms = 10_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
const says = (page: ShopPage, text: string | RegExp, ms?: number) => until(page, async () => (typeof text === "string" ? (await words(page)).includes(text) : text.test(await words(page))), ms);
const at = (page: ShopPage, path: string | RegExp, ms?: number) => until(page, async () => (typeof path === "string" ? (await pathOf(page)) === path : path.test(await pathOf(page))), ms);

/** the rows of the product list: the parts a tap opens a product from */
const rows = (page: ShopPage) => page.locator(`${ON} [data-scroll-body] [role="button"]`);
const submit = (page: ShopPage) => page.locator(`${ON} button:has-text("Add a product")`).first();
const input = (page: ShopPage, i: number) => page.locator(`${ON} input`).nth(i);

async function pick(page: ShopPage, label: string, option: string) {
  await page.locator(`${ON} [data-slot="select-trigger"]:has-text("${label}")`).first().click();
  await page.locator(`[role="option"]:has-text("${option}")`).first().click();
}

/** fills the new product's form: a name, an amount, a currency and a category */
async function fillProduct(page: ShopPage, name: string, amount = "25") {
  await input(page, 0).fill(name);
  await input(page, 1).fill(amount);
  await pick(page, "Currency", "CNY");
  await pick(page, "Category", "bags");
}

/** signs in on the sign-in screen (any email and a password long enough) */
async function signIn(page: ShopPage) {
  await until(page, async () => (await page.locator(`${ON} button:has-text("Sign in")`).count()) > 0);
  await input(page, 0).fill("ada@example.com");
  await input(page, 1).fill("correct horse");
  await page.locator(`${ON} button:has-text("Sign in")`).first().click();
}

/** The app on the mocks: `base` is the dev server with VITE_API_MOCKS unset (the transport). */
export async function shopOnMocks(browser: ShopBrowser, base: string, out: string, ok: Ok) {
  const page = await browser.newPage(VIEW);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  /* a screen that came in by a transition has settled before it is shot */
  const shot = async (name: string) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `mocks-${name}.png`) });
  };

  await page.goto(`${base}/products`);
  ok(await until(page, async () => (await rows(page).count()) >= 10), "mocks: the product list draws a row for each product the mocks made");
  await shot("list");
  const first = await rows(page).count();
  await page.evaluate(`(() => { const el = document.querySelector("[data-scroll-body]"); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")) })()`);
  ok(await until(page, async () => (await rows(page).count()) > first), `mocks: scrolling to the end loads the next page (${first} rows, then more)`);
  /* at its end the last row scrolls clear of the buttons that stay at the screen's foot (lib/foot.ts) */
  for (let i = 0; i < 4; i++) {
    await page.evaluate(`(() => { const el = document.querySelector("${ON} [data-scroll-body]"); el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event("scroll")) })()`);
    await page.waitForTimeout(400);
  }
  const end = await page.evaluate<{ last: number; button: number; floats: boolean }>(
    /* what the body draws (the rows' own presses lay nothing out), the empty strip at its end left out */
    `(() => { const drawn = [...document.querySelectorAll("${ON} [data-scroll-body] *")].filter((e) => !e.closest("[aria-hidden]")).map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0); const add = [...document.querySelectorAll("${ON} button")].find((b) => b.textContent.trim() === "Add product"); return { last: Math.max(...drawn.map((r) => r.bottom)), button: add ? add.getBoundingClientRect().top : -1, floats: !!add && !add.closest("[data-scroll-body]") } })()`,
  );
  ok(end.floats && end.button > 0 && end.last <= end.button, `mocks: the buttons stay at the foot, and the end of the list scrolls clear of them (last row ends at ${Math.round(end.last)}, the buttons start at ${Math.round(end.button)})`);
  await shot("list-end");
  await page.evaluate(`document.querySelector("[data-scroll-body]").scrollTop = 0`);
  await page.waitForTimeout(200);
  /* a pull from the top (the wheel, past its threshold) loads the list again, a spinner showing meanwhile */
  await page.evaluate(`(() => { const el = document.querySelector("[data-scroll-body]"); for (let i = 0; i < 4; i++) el.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true })) })()`);
  ok(await until(page, () => page.evaluate<boolean>(`!!document.querySelector("[data-scroll-body][data-refreshing]")`), 3000), "mocks: a pull at the top of the list loads it again, with a spinner");

  const name = (await rows(page).first().innerText()).split("\n")[0].trim();
  await rows(page).first().click();
  ok(await at(page, /^\/product\/[0-9a-f-]{36}$/), `mocks: a tap on a row opens its product at an address with its id (${await pathOf(page)})`);
  ok(await says(page, name), `mocks: the detail shows the product tapped (${name})`);
  await shot("detail");
  const detail = await pathOf(page);
  const deep = await browser.newPage(VIEW);
  await deep.goto(`${base}${detail}`);
  ok(await says(deep, name), "mocks: the detail's address opened directly shows the same product (a deep link)");
  await deep.close();

  await page.goto(`${base}/products?scenario=new-user`);
  ok(await says(page, "Nothing here yet"), "mocks: the new-user scenario shows the list's empty design");
  await shot("empty");
  await page.goto(`${base}/products?scenario=network-error`);
  ok((await says(page, "Couldn't load")) && (await words(page)).includes("Can't reach the server"), "mocks: the network-error scenario shows the list's error design, with the problem's words");
  await shot("error");

  await page.goto(`${base}/new-product`);
  await page.waitForTimeout(500);
  await submit(page).click();
  ok(await says(page, /^Required .*Required/), "mocks: the form refuses a submit with its required fields empty, each saying so");
  await input(page, 1).fill("-5");
  ok(await says(page, "At least 0"), "mocks: an amount the schema does not allow says so as it is typed");
  await shot("form-errors");
  await page.goto(`${base}/new-product?scenario=name-taken`);
  await page.waitForTimeout(500);
  await fillProduct(page, "Taken lamp");
  await submit(page).click();
  ok((await says(page, "That name is taken")) && (await words(page)).includes("That name is taken."), "mocks: what the server refuses lands on the field its pointer names, and on the form");
  await shot("form-server-error");

  await page.goto(`${base}/new-product?scenario=signed-out`);
  ok(await at(page, "/sign-in"), "mocks: a screen that needs a session, signed out, opens the sign-in screen first");
  await shot("sign-in");
  await signIn(page);
  ok(await at(page, "/new-product"), "mocks: signing in goes on to the screen that needed it");
  await fillProduct(page, "Desk lamp");
  await submit(page).click();
  ok((await at(page, "/products")) && (await says(page, "Desk lamp")), "mocks: a product added is in the list the form goes back to");
  await shot("created");
  ok(!errors.length, `mocks: the app throws nothing (${errors.join("; ")})`);
  await page.close();
}

/** The built app on the real server: `base` is `vite preview` with /api proxied to it; `stop` takes the server away. */
export async function shopOnServer(browser: ShopBrowser, base: string, out: string, ok: Ok, o: { session: string; stop: () => void }) {
  const page = await browser.newPage(VIEW);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (name: string) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `server-${name}.png`) });
  };

  await page.goto(`${base}/products`);
  ok(await says(page, "Nothing here yet"), "server: the list is empty before anything is added: its empty design");
  await shot("empty");
  await page.goto(`${base}/new-product`);
  ok(await at(page, "/sign-in"), "server: adding a product needs a session: the sign-in screen first");
  await signIn(page);
  ok(await at(page, "/new-product"), "server: signed in with the token the server gave, on to the form");
  await submit(page).click();
  ok(await says(page, /^Required .*Required/), "server: the schema's errors show before anything is sent");
  await fillProduct(page, "Taken lamp");
  await submit(page).click();
  ok((await says(page, "That name is taken")) && (await words(page)).includes("That name is taken."), "server: the handler's 422 lands on the name, and on the form");
  await shot("form-server-error");
  await input(page, 0).fill("Desk lamp");
  await submit(page).click();
  ok((await at(page, "/products")) && (await says(page, "Desk lamp")), "server: the product is created (201) and listed");
  await shot("list");
  await rows(page).first().click();
  ok((await at(page, /^\/product\/[0-9a-f-]{36}$/)) && (await says(page, "Desk lamp")), "server: a tap on its row opens it, by its id");
  await shot("detail");
  await page.reload();
  ok(await says(page, "Desk lamp"), "server: the detail's address opened again loads it from the server (a deep link)");

  /* a token the server no longer takes: the 401 sends the app to sign in, and back once signed in */
  await page.evaluate(`sessionStorage.setItem(${JSON.stringify(o.session)}, JSON.stringify({ token: "expired" }))`);
  await page.goto(`${base}/new-product`);
  await page.waitForTimeout(500);
  await fillProduct(page, "Floor lamp");
  await submit(page).click();
  ok(await at(page, "/sign-in"), "server: a 401 (no refresh can mend it) sends the app to the sign-in screen");
  await signIn(page);
  ok(await at(page, "/new-product"), "server: signing in comes back to where the 401 left the app");
  await submit(page).click();
  ok((await at(page, "/products")) && (await says(page, "Floor lamp")), "server: and the form, sent again with the new token, adds the product");

  o.stop();
  await page.goto(`${base}/products`);
  ok(await says(page, "Couldn't load"), "server: with the server gone, the list shows its error design");
  await shot("error");
  ok(!errors.length, `server: the app throws nothing (${errors.join("; ")})`);
  await page.close();
}
