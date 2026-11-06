/* Screens bound to the contract, in a real editor and preview, the API answered by a fake back end on the page
 * (e2e/fakeShop.ts): a list screen wired to its endpoint from the Data section and rows in the preview; a form that
 * refuses what its schema does not allow, then shows the server's error on its field, then submits; a 401 that sends
 * the app to the sign-in screen and back; a detail screen opened from a row with its params; the state switcher on a
 * region of the canvas. Then the API answered by the mock library, as the editor answers it: the list with its data,
 * empty and failing as the preview's scenario says, and signed out until the sign-in screen is filled in.
 * Screenshots go to e2e/.out (bindings-*.png). */

import { join } from "node:path";
import { setGlobalLang } from "../lib/i18n";
import { shopDoc } from "../lib/bindings/fixture";
import { defaultScenarios } from "../lib/mocks";
import type { Doc as FullDoc } from "../lib/tokens";
import { installFakeShop, type FakeShop } from "./fakeShop";
import { check, equal, savedDoc, screenBox, selectScreen, settle, undo, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

/** the editor opened on a document, the fake back end answering the preview, else the mock library */
async function openShop(page: Page, base: string, doc: FullDoc, fake?: FakeShop) {
  if (fake) await page.context().addInitScript(installFakeShop, fake);
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
  /* a document whose screens are still empty has no part to wait for: its screens are what arrives */
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector('[data-screen="products"]', { timeout: 30_000 });
  await settle(page, 1500);
}

/** the preview of a screen, opened from its bar */
async function preview(page: Page, screen: string) {
  await page.keyboard.press("Escape");
  await settle(page, 200);
  await selectScreen(page, screen);
  await page.keyboard.press("p");
  await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const shownScreen = (page: Page) => onShow(page).getAttribute("data-preview-screen");
/** the words the screen on show has, in its parts */
const words = async (page: Page) => (await onShow(page).textContent()) ?? "";
/** waits until the screen on show says something */
async function waitForWords(page: Page, text: string, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await words(page)).includes(text)) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`the screen on show never said ${JSON.stringify(text)}; it says ${JSON.stringify((await words(page)).slice(0, 300))}`);
}
/** waits until the preview shows a screen */
async function waitForScreen(page: Page, id: string, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await shownScreen(page)) === id) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`the preview never showed ${id}; it shows ${await shownScreen(page)}`);
}
/** waits until what the screen on show says passes a test */
async function waitUntil(page: Page, ok: (text: string) => boolean, what: string, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (ok(await words(page))) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`the screen on show never showed ${what}; it says ${JSON.stringify((await words(page)).slice(0, 300))}`);
}
/** a scenario of the mock library chosen in the preview's bar ("" for none) */
async function scenario(page: Page, id: string) {
  await page.locator("[data-preview-scenario-button]").first().click();
  await settle(page, 300);
  await page.locator(`[data-preview-scenario="${id}"]`).first().click();
  await settle(page, 300);
}
/** the calls the mock library answered, oldest first, from the preview's request log */
async function mockLog(page: Page): Promise<string[]> {
  const open = await page.locator("[data-preview-log]").count();
  if (!open) await page.locator("[data-preview-log-button]").first().click();
  await settle(page, 200);
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-preview-log-entry]")].map((e) => `${e.getAttribute("data-preview-log-entry")} ${e.getAttribute("data-status")}`));
  if (!open) await page.locator("[data-preview-log-button]").first().click();
  return rows.reverse();
}
const prices = (text: string) => (text.match(/\$\d/g) ?? []).length;

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: { op: string; path: string; query: Record<string, unknown> | null; auth: string | null; body: unknown }[] }).__calls);

/** an input of the preview by the field it fills */
function fieldInput(page: Page, doc: FullDoc, field: string, form: string) {
  const formGroup = doc.groups.find((g) => g.form?.operationId === form)!;
  const inside = new Set<string>([formGroup.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of doc.groups)
      if (g.inFlow && inside.has(g.inFlow) && !inside.has(g.id)) {
        inside.add(g.id);
        grew = true;
      }
  }
  const it = doc.groups.filter((g) => inside.has(g.id)).flatMap((g) => g.items).find((x) => x.field === field)!;
  return onShow(page).locator(`[data-part="${it.id}"] input`).first();
}

export const tests: E2ETest[] = [
  {
    name: "bindings: a list screen wired to its endpoint from the Data section, rows from the API in the preview",
    async run({ page, base, out }) {
      await openShop(page, base, shopDoc({ unwired: true }), { n: 30, delay: 2000 });
      await selectScreen(page, "products");
      await page.waitForSelector("[data-screen-data]");
      /* the endpoint is the first one, the list; a row opens the product screen */
      await page.locator('[data-wire] button[aria-haspopup="listbox"][aria-label="A row opens"]').first().click();
      await settle(page, 250);
      await page.locator('[role="listbox"] [role="option"]').filter({ hasText: "Product" }).first().click();
      await settle(page, 300);
      await page.locator("[data-wire-go]").first().click();
      await settle(page, 1500);
      const doc = (await savedDoc(page)) as unknown as FullDoc;
      const frame = doc.frames.find((f) => f.id === "products")!;
      equal(frame.data?.map((d) => [d.name, d.operationId, d.paging ?? null]), [["products", "listProducts", "scroll"]], "the screen loads the products, a page at a time");
      const region = doc.groups.find((g) => g.states);
      check(region?.repeat?.data === "data.products.items", "a region repeating a row per product");
      equal([...new Set(doc.groups.filter((g) => g.inFlow === region!.id && (g.pane ?? 0) > 0).map((g) => g.pane))].sort(), [1, 2, 3, 4], "with a design for loading, empty, error and no access");
      await page.screenshot({ path: join(out, "bindings-wired-canvas.png") });

      await preview(page, "products");
      await page.waitForTimeout(150);
      check(!(await words(page)).includes("Product 1"), "nothing yet while the call is under way");
      await page.screenshot({ path: join(out, "bindings-list-loading.png") });
      await waitForWords(page, "Product 1");
      const text = await words(page);
      check(text.includes("$10.00") && text.includes("Product 20") && !text.includes("Product 21"), "a page of rows, the price as money");
      await page.screenshot({ path: join(out, "bindings-list-rows.png") });
      equal((await calls(page)).map((c) => [c.op, c.query?.limit ?? null]), [["listProducts", 20]], "one call for the first page");
      /* the end of scrolling asks for the next page */
      await page.evaluate(() => {
        const el = document.querySelector("[data-preview-active] [data-scroll-body]");
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await waitForWords(page, "Product 30");
      equal((await calls(page)).map((c) => c.query?.cursor ?? null), [null, "20"], "the next page by its cursor");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "bindings: a form refuses what its schema does not allow, shows the server's error on its field, then submits",
    async run({ page, base, out }) {
      const doc = shopDoc();
      await openShop(page, base, doc, { n: 3, delay: 300 });
      await preview(page, "create");
      const submit = onShow(page).locator("[data-live-part]").filter({ hasText: "Add product" }).first();
      await submit.click();
      await settle(page, 500);
      check((await words(page)).split("Required").length - 1 >= 2, "the name and the price are required");
      equal(await calls(page), [], "nothing is sent while the form is wrong");
      await fieldInput(page, doc, "name", "createProduct").fill("A");
      await fieldInput(page, doc, "price", "createProduct").fill("-3");
      await settle(page, 300);
      await waitForWords(page, "At least 2 characters");
      check((await words(page)).includes("At least 0"), "the schema's minimum, as the field's error");
      await page.screenshot({ path: join(out, "bindings-form-invalid.png") });
      /* what the schema allows, but the server refuses: its pointer lands on the name */
      await fieldInput(page, doc, "name", "createProduct").fill("taken name");
      await fieldInput(page, doc, "price", "createProduct").fill("5");
      await submit.click();
      await waitForWords(page, "That name is taken");
      await page.screenshot({ path: join(out, "bindings-form-server-error.png") });
      await fieldInput(page, doc, "name", "createProduct").fill("Green tea");
      await submit.click();
      await waitForScreen(page, "products");
      await waitForWords(page, "Green tea");
      check(((await page.locator("[data-preview-snackbar]").first().textContent()) ?? "").includes("Added Green tea"), "the snackbar reads the answer");
      const sent = (await calls(page)).filter((c) => c.op === "createProduct").map((c) => c.body);
      equal(sent, [{ name: "taken name", price: 5 }, { name: "Green tea", price: 5 }], "the body as the schema types it");
      await page.screenshot({ path: join(out, "bindings-form-done.png") });
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "bindings: a 401 sends the app to the sign-in screen, and signing in comes back with the token",
    async run({ page, base, out }) {
      const doc = shopDoc();
      await openShop(page, base, doc, { n: 5, delay: 200, requireAuth: true });
      await preview(page, "products");
      await waitForScreen(page, "login");
      equal(await shownScreen(page), "login", "the refused list sends the app to sign in");
      await fieldInput(page, doc, "email", "login").fill("ann@example.com");
      await fieldInput(page, doc, "password", "login").fill("wrong password");
      await onShow(page).locator("[data-live-part]").filter({ hasText: "Sign in" }).last().click();
      await waitForWords(page, "That password is not right");
      await page.screenshot({ path: join(out, "bindings-login-wrong.png") });
      await fieldInput(page, doc, "password", "login").fill("correct horse");
      await onShow(page).locator("[data-live-part]").filter({ hasText: "Sign in" }).last().click();
      await waitForScreen(page, "products");
      await waitForWords(page, "Product 1");
      const list = (await calls(page)).filter((c) => c.op === "listProducts");
      equal(list.map((c) => c.auth), [null, "Bearer t1"], "the list again, with the session's token");
      await page.screenshot({ path: join(out, "bindings-login-back.png") });
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "bindings: a row opens the detail screen with its params, which loads that product",
    async run({ page, base, out }) {
      const doc = shopDoc();
      await openShop(page, base, doc, { n: 8, delay: 150 });
      await preview(page, "products");
      await waitForWords(page, "Product 3");
      await onShow(page).locator("[data-live-part]").filter({ hasText: /^Product 3$/ }).first().click();
      await waitForScreen(page, "detail");
      await waitForWords(page, "The 3th product");
      const text = await words(page);
      check(text.includes("Product 3") && text.includes("$12.00"), "the product's name and price");
      equal((await calls(page)).filter((c) => c.op === "getProduct").map((c) => c.path), ["/products/p3"], "the detail loads the product the row gave it");
      await page.screenshot({ path: join(out, "bindings-detail.png") });
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "bindings: the state switcher on a region shows each state's design on the canvas",
    async run({ page, base, out }) {
      const doc = shopDoc();
      await openShop(page, base, doc, { n: 3, delay: 100 });
      const region = doc.groups.find((g) => g.states && g.repeat)!;
      const row = doc.groups.find((g) => g.inFlow === region.id && !g.pane)!;
      const sb = await screenBox(page, "products");
      const rb = await page.locator(`[data-node="${row.items[0].id}"]`).first().boundingBox();
      check(rb, "the row on the canvas");
      await page.keyboard.down("Control");
      await page.mouse.click(rb.x + rb.width - 6, rb.y + 4);
      await page.keyboard.up("Control");
      await settle(page, 500);
      await page.waitForSelector(`[data-state-switcher="${region.id}"]`, { timeout: 5000 });
      await page.locator(`[data-state-switcher] [data-state="empty"]`).first().click();
      await settle(page, 900);
      equal(((await savedDoc(page)) as unknown as FullDoc).groups.find((g) => g.id === region.id)?.states?.show, "empty", "the region shows its empty design");
      const visible = await page.locator("[data-node]").filter({ hasText: "Nothing here yet" }).first().isVisible();
      check(visible, "the empty design is on the canvas");
      await page.screenshot({ path: join(out, "bindings-switcher-empty.png") });
      await page.locator(`[data-state-switcher] [data-state="error"]`).first().click();
      await settle(page, 900);
      check(await page.locator("[data-node]").filter({ hasText: "Couldn't load" }).first().isVisible(), "the error design");
      await page.screenshot({ path: join(out, "bindings-switcher-error.png") });
      await undo(page);
      equal(((await savedDoc(page)) as unknown as FullDoc).groups.find((g) => g.id === region.id)?.states?.show, "empty", "one undo goes back one state");
      check(sb.width > 0, "the screen is there");
    },
  },
  {
    name: "bindings: in the preview the mock library answers the list, empty and failing as the scenario says, and signed out until signed in",
    async run({ page, base, out }) {
      const doc: FullDoc = { ...shopDoc(), mocks: { seed: 1, locale: "en", scenarios: defaultScenarios("en") } };
      await openShop(page, base, doc);
      await preview(page, "products");
      /* the mocks' products, a page of them, each with its price */
      await waitUntil(page, (t) => prices(t) >= 5, "the mocks' products");
      check(!(await words(page)).includes("Nothing here yet"), "no empty design over the data");
      await page.screenshot({ path: join(out, "bindings-mock-data.png") });
      /* a new user has nothing yet: the empty design */
      await scenario(page, "new-user");
      await waitForWords(page, "Nothing here yet");
      equal(prices(await words(page)), 0, "no rows left from before");
      await page.screenshot({ path: join(out, "bindings-mock-empty.png") });
      /* the network down: the error design, saying why */
      await scenario(page, "network-error");
      await waitForWords(page, "Couldn't load");
      check((await words(page)).includes("Can't reach the server"), "the problem's words on the error design");
      await page.screenshot({ path: join(out, "bindings-mock-error.png") });
      /* signed out: the secured list is refused and the app goes to sign in, then back with the token */
      await scenario(page, "signed-out");
      await waitForScreen(page, "login");
      await fieldInput(page, doc, "email", "login").fill("ann@example.com");
      await fieldInput(page, doc, "password", "login").fill("long enough");
      await page.screenshot({ path: join(out, "bindings-mock-signed-out.png") });
      await onShow(page).locator("[data-live-part]").filter({ hasText: "Sign in" }).last().click();
      await waitForScreen(page, "products");
      await waitUntil(page, (t) => prices(t) >= 5, "the products once signed in");
      const log = await mockLog(page);
      equal(log.slice(-3), ["listProducts 401", "login 200", "listProducts 200"], "refused, signed in, answered");
      await page.screenshot({ path: join(out, "bindings-mock-signed-in.png") });
      /* back to the normal scenario: the data again */
      await scenario(page, "");
      await waitUntil(page, (t) => prices(t) >= 5, "the products in the normal scenario");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
];
