/* A part's outlets and demos in the preview (docs/组件规范.md "组件的状态和出口", docs/边界与契约.md), each as a
 * behaviour in a real editor and preview, the back end answered on the page:
 *   - controlled value: a rating shows the variable it is bound to whenever that changes, and a pick writes it
 *   - UI draft: a number pad's digits are a draft the variable it is bound to follows, and setting the variable resets it
 *   - submit event: confirming the pad runs its on:submit action, which reads event.value
 *   - demo: a coupon nothing takes over acts out "claimed" in the prototype; one whose tap calls the API stays
 *     unclaimed when the call is refused (the same path a product takes: a product never runs a demo)
 *   - result from outside: a wheel whose result is bound waits for the answer, settles on it and sends on:settled
 *   - slot family: one tab:* action answers every row of a list, reading slot.index
 * Screenshots of failures go to e2e/.out. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, equal, selectScreen, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

const SCREEN = "outlets";

/** the document: every part on one screen, wired through operations only, as the AI and MCP would wire it */
function outletsDoc(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build the outlets", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Outlets" });
    tx.run(ops.addEndpoint, { operationId: "claimCoupon", method: "post", path: "/coupons/claim", returns: { type: "object", properties: { claimed: { type: "boolean" } } } });
    tx.run(ops.addEndpoint, { operationId: "draw", method: "post", path: "/draws", returns: { type: "object", properties: { index: { type: "integer" } }, required: ["index"] } });
    tx.run(ops.addScreen, { id: SCREEN, name: "Outlets", w: 412, h: 1600 });
    tx.run(ops.addVar, { id: "amount", name: "amount", type: "text", value: "" });
    tx.run(ops.addVar, { id: "score", name: "score", type: "number", value: 2 });
    tx.run(ops.addVar, { id: "won", name: "won", type: "number", value: -1 });
    const at = (y: number) => ({ x: 16, y });

    /* the rating, bound both ways, and what it says */
    tx.run(ops.addPart, { slug: "rating", id: "stars", screen: SCREEN, at: at(20) });
    tx.run(ops.bindProp, { id: "stars", prop: "value", var: "score" });
    tx.run(ops.addPart, { slug: "text", id: "score-shown", screen: SCREEN, at: at(60), props: { text: "-" } });
    tx.run(ops.bindProp, { id: "score-shown", prop: "text", var: "score" });
    tx.run(ops.addPart, { slug: "button", id: "set-three", screen: SCREEN, at: at(90), props: { label: "Three stars" } });
    tx.run(ops.setAction, { id: "set-three", action: { to: "none", transition: "none", effects: [{ do: "setVar", var: "score", value: 3 }] } as never });

    /* the pad: its draft in a variable, a reset, and its submit event */
    tx.run(ops.addPart, { slug: "number-pad", id: "pad", screen: SCREEN, at: at(150), props: { mode: "phone", action: "Confirm" } });
    tx.run(ops.bindProp, { id: "pad", prop: "value", var: "amount" });
    tx.run(ops.setAction, { id: "pad", slot: "on:submit", action: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Submitted {{event.value}}" }] } as never });
    tx.run(ops.addPart, { slug: "text", id: "amount-shown", screen: SCREEN, at: at(600), props: { text: "-" } });
    tx.run(ops.bindProp, { id: "amount-shown", prop: "text", var: "amount" });
    tx.run(ops.addPart, { slug: "button", id: "clear-pad", screen: SCREEN, at: at(630), props: { label: "Clear the pad" } });
    tx.run(ops.setAction, { id: "clear-pad", action: { to: "none", transition: "none", effects: [{ do: "setVar", var: "amount", value: "" }] } as never });

    /* two coupons: one nothing takes over, one whose tap asks the API */
    tx.run(ops.addPart, { slug: "coupon", id: "free-coupon", screen: SCREEN, at: at(690), props: { title: "Free coupon" } });
    tx.run(ops.addPart, { slug: "coupon", id: "asked-coupon", screen: SCREEN, at: at(800), props: { title: "Asked coupon" } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.setAction, { id: "asked-coupon", slot: "action", action: { to: "none", transition: "none", effects: [{ do: "call", operationId: "claimCoupon", then: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Claim accepted" }] }, catch: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Claim refused" }] } }] } as never });

    /* a wheel whose prize comes from the API */
    tx.run(ops.addPart, { slug: "prize-wheel", id: "wheel", screen: SCREEN, at: at(920) });
    tx.run(ops.bindProp, { id: "wheel", prop: "result", var: "won" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.setAction, { id: "wheel", action: { to: "none", transition: "none", effects: [{ do: "call", operationId: "draw", then: { to: "none", transition: "none", effects: [{ do: "setVar", var: "won", value: -1, expr: "response.index" }] } }] } as never });
    tx.run(ops.setAction, { id: "wheel", slot: "on:settled", action: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Won {{event.label}} at {{event.index}}" }] } as never });

    /* a list whose rows share one action */
    tx.run(ops.addPart, { slug: "item", id: "rows", screen: SCREEN, at: at(1200), props: { items: [{ label: "First" }, { label: "Second" }, { label: "Third" }] } });
    tx.run(ops.setAction, { id: "rows", slot: "tab:*", action: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "Row {{slot.index}}" }] } as never });
  });
  return savedDoc(store.get());
}

/** the back end on the page: a claim is refused, a draw answers the prize `drawn` once the test lets it */
function installBackEnd(drawn: number) {
  type Res = { status: number; headers: Record<string, string>; body?: unknown };
  const w = window as unknown as { __calls: string[]; __release: () => void; m3ePreviewTransport: unknown };
  w.__calls = [];
  let release: () => void = () => {};
  const waiting = new Promise<void>((done) => (release = done));
  w.__release = () => release();
  w.m3ePreviewTransport = {
    async request(req: { operationId?: string }): Promise<Res> {
      w.__calls.push(req.operationId ?? "");
      if (req.operationId === "claimCoupon") return { status: 409, headers: { "content-type": "application/problem+json" }, body: { type: "already-claimed", title: "Already claimed", status: 409 } };
      if (req.operationId === "draw") {
        await waiting;
        return { status: 200, headers: {}, body: { index: drawn } };
      }
      return { status: 404, headers: {}, body: { title: "No such route", status: 404 } };
    },
  };
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const part = (page: Page, id: string) => onShow(page).locator(`[data-part="${id}"]`).first();
const snack = async (page: Page) => ((await page.locator("[data-preview-snackbar]").count()) ? ((await page.locator("[data-preview-snackbar]").first().textContent()) ?? "") : null);
async function until(what: string, ok: () => Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`never: ${what}`);
}
const snackSays = (page: Page, text: string) => until(`the snackbar says ${JSON.stringify(text)}`, async () => (await snack(page)) === text);
const attr = (page: Page, id: string, slot: string, name: string) => part(page, id).locator(`[data-slot="${slot}"]`).first().getAttribute(name);
const textOf = async (page: Page, id: string) => ((await part(page, id).textContent()) ?? "").trim();

async function openPreview(page: Page, base: string) {
  await page.context().addInitScript(installBackEnd, 2);
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(outletsDoc()))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector(`[data-screen="${SCREEN}"]`, { timeout: 30_000 });
  await settle(page, 1500);
  await page.keyboard.press("Escape");
  await settle(page, 200);
  await selectScreen(page, SCREEN);
  await page.keyboard.press("p");
  await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });
  await settle(page, 800);
}

export const tests: E2ETest[] = [
  {
    name: "preview outlets: a rating follows its variable and writes it; a pad's draft resets with its variable and submits its value",
    async run({ page, base }) {
      await openPreview(page, base);
      /* controlled value: the variable reaches the stars whenever it changes */
      equal(await attr(page, "stars", "rating", "data-value"), "2", "the stars start at the variable");
      await part(page, "set-three").click();
      await until("the stars follow the variable", async () => (await attr(page, "stars", "rating", "data-value")) === "3");
      await part(page, "stars").locator('[data-slot="rating-star"]').nth(4).click();
      await until("a pick writes the variable", async () => (await textOf(page, "score-shown")) === "5");
      equal(await attr(page, "stars", "rating", "data-value"), "5", "and the stars show it");

      /* UI draft: keys type into the pad, the variable follows, setting the variable starts the draft over */
      for (const k of ["1", "2", "3"]) await part(page, "pad").locator(`[data-key="${k}"]`).click();
      await until("the draft reaches the variable", async () => (await textOf(page, "amount-shown")) === "123");
      equal(await attr(page, "pad", "number-pad", "data-entry"), "123", "the pad holds the draft");
      await part(page, "clear-pad").click();
      await until("the draft starts over", async () => (await attr(page, "pad", "number-pad", "data-entry")) === "");
      for (const k of ["4", "2"]) await part(page, "pad").locator(`[data-key="${k}"]`).click();
      await until("typing again", async () => (await textOf(page, "amount-shown")) === "42");

      /* submit event: on:submit reads the value; the pad says nothing of being sent itself (its demo is taken over
         by nothing here, so in the prototype it may, but the event carries the value either way) */
      await part(page, "pad").locator('[data-tap="confirm"]').click();
      await snackSays(page, "Submitted 42");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview outlets: a demo runs only where nothing takes it over; a refused claim stays unclaimed; a wheel waits for its result",
    async run({ page, base }) {
      await openPreview(page, base);
      /* the prototype's demo: a coupon nothing takes over claims itself */
      await part(page, "free-coupon").locator('[data-tap="action"]').click();
      await until("the free coupon acts out its claim", async () => (await attr(page, "free-coupon", "coupon", "data-claimed")) === "true");
      /* taken over by a call: the back end refuses, and the coupon never says it was claimed */
      await part(page, "asked-coupon").locator('[data-tap="action"]').click();
      await snackSays(page, "Claim refused");
      equal(await attr(page, "asked-coupon", "coupon", "data-claimed"), null, "a refused claim is not shown as claimed");
      const calls = await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
      check(calls.includes("claimCoupon"), "the claim went to the API");

      /* the wheel: a press asks, it waits with no prize of its own, then settles on the answer and says so */
      await part(page, "wheel").locator("button").first().click();
      await until("the wheel waits for the answer", async () => (await attr(page, "wheel", "wheel", "data-phase")) === "pending");
      await settle(page, 600);
      equal(await attr(page, "wheel", "wheel", "data-phase"), "pending", "no prize is drawn on the screen while the answer is out");
      await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
      await snackSays(page, "Won Second prize at 2");
      equal(await attr(page, "wheel", "wheel", "data-result"), "Second prize", "it settles on the prize the API gave");

      /* a slot family: one action, every row, reading which */
      await part(page, "rows").locator('[data-tap="tab:2"]').first().click();
      await snackSays(page, "Row 2");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
];
