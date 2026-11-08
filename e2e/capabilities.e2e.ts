/* The payment flow in a real editor and preview (docs/平台能力.md): the shop flow's checkout places the order
 * (createOrder), hands it to the payment sheet (invoke payment.pay) and opens the result screen, which shows the
 * order's status as the mock back end has it. Each of its outcomes is a scenario of the preview's bar: submitting,
 * cancelled and not completed on the checkout, paid, processing and failed on the result screen; the request log lists
 * the invoke beside the requests, with how it came out. Screenshots of each in e2e/.out (capabilities-*.png). */

import { join } from "node:path";
import { counterIds, DocStore, guessMeasurer, opByName, savedDoc as docOf, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc as FullDoc } from "../lib/tokens";
import { check, equal, screenBox, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

/** a document with a template added (the shop flow brings its contract and payment scenarios with it) */
function withTemplate(slug: string): FullDoc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("e"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Template", "user", (tx) => {
    tx.run(opByName("set_title")! as never, { title: "Corner Shop" } as never);
    tx.run(opByName("add_template")! as never, { slug } as never);
  });
  return docOf(store.get());
}

/** the editor opened on a document, a screen of it drawn */
async function openDoc(page: Page, base: string, doc: FullDoc, screen: string) {
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector(`[data-screen="${screen}"]`, { timeout: 30_000 });
  await settle(page, 1500);
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const words = async (page: Page) => (await onShow(page).textContent()) ?? "";
async function waitForWords(page: Page, text: string, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await words(page)).includes(text)) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`the screen on show never said ${JSON.stringify(text)}; it says ${JSON.stringify((await words(page)).slice(0, 300))}`);
}

/** the preview of the checkout, in a scenario chosen in its bar */
async function checkoutIn(page: Page, checkout: string, scenario: string) {
  await page.keyboard.press("Escape");
  await settle(page, 300);
  if (await page.locator("[data-preview-active]").count()) {
    await page.keyboard.press("Escape");
    await settle(page, 300);
  }
  await selectScreen(page, checkout);
  await page.keyboard.press("p");
  await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
  await page.locator("[data-preview-scenario-button]").first().click();
  await settle(page, 300);
  await page.locator(`[data-preview-scenario="${scenario}"]`).first().click();
  await settle(page, 600);
  await waitForWords(page, "Place order");
}

/** taps the checkout's Place order */
const place = (page: Page) => onShow(page).locator("button").filter({ hasText: "Place order" }).first().click();

/** what the request log lists, newest first, read with the log open: the invokes (capability and outcome) and the
 *  requests (operation) */
async function logged(page: Page): Promise<{ invokes: string[]; requests: string[] }> {
  const open = await page.locator("[data-preview-log]").count();
  if (!open) await page.locator("[data-preview-log-button]").first().click();
  await settle(page, 200);
  const rows = await page.evaluate(() => ({
    invokes: [...document.querySelectorAll("[data-preview-log-invoke]")].map((e) => `${e.getAttribute("data-preview-log-invoke")} ${e.getAttribute("data-outcome")}`),
    requests: [...document.querySelectorAll("[data-preview-log-entry]")].map((e) => e.getAttribute("data-preview-log-entry") ?? ""),
  }));
  if (!open) await page.locator("[data-preview-log-button]").first().click();
  return rows;
}
const invokes = async (page: Page) => (await logged(page)).invokes;

export const tests: E2ETest[] = [
  {
    name: "capabilities: the shop's payment in every outcome the preview's scenarios give, the invokes in the request log",
    async run({ page, base, out }) {
      const doc = withTemplate("shop-flow");
      const checkout = doc.frames.find((f) => f.name === "Checkout")!.id;
      const result = doc.frames.find((f) => f.name === "Payment result")!.id;
      equal(
        doc.mocks?.scenarios?.map((s) => s.id),
        ["pay-success", "pay-processing", "pay-submitting", "pay-cancelled", "pay-declined", "pay-failed"],
        "the shop flow brings a scenario for each outcome of a payment",
      );
      await openDoc(page, base, doc, checkout);
      await screenBox(page, result);

      /* on the checkout: the sheet still open, closed, failing */
      await checkoutIn(page, checkout, "pay-submitting");
      /* the notices not on show leave no hole: the first panel stands right under the bar */
      const screenTop = (await onShow(page).boundingBox())!.y;
      const deliver = await onShow(page).locator("[data-slot='text']").filter({ hasText: "Deliver to" }).first().boundingBox();
      check(deliver!.y - screenTop < 140, `the first panel stands under the bar, not below a hole: ${Math.round(deliver!.y - screenTop)}px down`);
      await place(page);
      await waitForWords(page, "Submitting");
      await page.screenshot({ path: join(out, "capabilities-submitting.png") });
      check(!(await words(page)).includes("Payment received"), "nothing says paid while the sheet is open");

      await checkoutIn(page, checkout, "pay-cancelled");
      await place(page);
      await waitForWords(page, "Payment cancelled");
      check((await words(page)).includes("Place order"), "the button is back to Place order");
      await settle(page, 1500);
      await page.screenshot({ path: join(out, "capabilities-cancelled.png") });
      equal((await invokes(page))[0], "payment.pay cancelled", "the request log lists the invoke, cancelled");

      await checkoutIn(page, checkout, "pay-declined");
      await place(page);
      await waitForWords(page, "The payment did not go through");
      equal((await invokes(page))[0], "payment.pay failed", "the invoke failed");

      /* on the result screen: what the order's status says */
      for (const [scenario, says, shot] of [
        ["pay-success", "Payment received", "paid"],
        ["pay-processing", "Payment processing", "processing"],
        ["pay-failed", "Payment failed", "failed"],
      ] as const) {
        await checkoutIn(page, checkout, scenario);
        await place(page);
        await waitForWords(page, says);
        equal(await onShow(page).getAttribute("data-preview-screen"), result, `${scenario}: the result screen is on show`);
        for (const other of ["Payment received", "Payment processing", "Payment failed"].filter((x) => x !== says)) check(!(await words(page)).includes(other), `${scenario}: it does not say ${other}`);
        await settle(page, 1500);
        await page.screenshot({ path: join(out, `capabilities-${shot}.png`) });
        equal((await invokes(page))[0], "payment.pay ok", `${scenario}: the payment was submitted`);
      }
      const { requests } = await logged(page);
      check(requests.includes("createOrder") && requests.includes("getOrder"), `the requests are there too: ${requests.join(", ")}`);
    },
  },
  {
    name: "capabilities: the map route asks for the location, its refusal shown where the notice stands, no hole when hidden",
    async run({ page, base, out }) {
      const doc = withTemplate("map-route");
      const route = doc.frames.find((f) => f.name === "Route")!.id;
      /* the location refused in every scenario */
      doc.mocks = { capabilities: { "location.current": { fail: "denied" } } };
      await openDoc(page, base, doc, route);
      await selectScreen(page, route);
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
      await waitForWords(page, "Use my location");
      /* nothing between the location button and the travel modes while there is nothing to say */
      const gap = async () => {
        const button = await onShow(page).locator("button").filter({ hasText: "Use my location" }).first().boundingBox();
        const modes = await onShow(page).locator("button").filter({ hasText: "Transit" }).first().boundingBox();
        return modes!.y - (button!.y + button!.height);
      };
      const before = await gap();
      check(before < 40, `no hole where the notices stand while they are hidden: ${Math.round(before)}px`);
      await onShow(page).locator("button").filter({ hasText: "Use my location" }).first().click();
      await waitForWords(page, "Location is off for this app");
      await settle(page, 1200);
      check((await gap()) > before + 30, "the refusal's notice takes its place between them");
      check(!(await words(page)).includes("could not be found"), "only the refusal's notice");
      await page.screenshot({ path: join(out, "capabilities-location-denied.png") });
      equal((await invokes(page))[0], "location.current denied", "the request log lists the invoke, denied");
    },
  },
];
