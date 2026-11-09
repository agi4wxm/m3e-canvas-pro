/* The realtime channels in a real editor and preview (docs/数据绑定.md “订阅”, docs/模拟库.md “实时”): a screen
 * subscribes to the contract's ticker channel, its words read the latest message and how many came, and an action on
 * each message keeps the latest label in a variable. The mock library's realtime script plays the ticker; the preview's
 * clock controls stop it (nothing arrives, the time it tells stands still) and run it faster. Screenshots in e2e/.out
 * (realtime-*.png). */

import { join } from "node:path";
import { counterIds, DocStore, guessMeasurer, opByName, savedDoc as docOf, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc as FullDoc } from "../lib/tokens";
import { check, equal, settle, type E2ETest, type Page } from "./lib";

setGlobalLang("en");

/** a screen subscribed to a ticker the mocks play: a message every 400 ms of the mocks' clock, over and over */
function tickerDoc(): FullDoc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("e"), measurer: guessMeasurer, lang: () => "en" });
  const run = (name: string, args: Record<string, unknown>) => store.transact(name, "user", (tx) => void tx.run(opByName(name)! as never, args as never));
  run("set_title", { title: "Ticker" });
  run("add_screen", { id: "home", name: "Home" });
  run("add_channel", {
    id: "ticker",
    address: "/ticker",
    messages: [{ name: "price", payload: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] } }],
    operations: [{ id: "onPrice", action: "send" }],
  });
  run("set_mock_realtime", { channel: "ticker", steps: [{ at: 200, message: "price", payload: { label: "First", value: 101 } }, { at: 400, message: "price", payload: { label: "Again", value: 102 } }], repeat: { every: 400 } });
  run("add_var", { id: "v-last", name: "last", type: "text", value: "none" });
  run("add_part", { slug: "text", id: "price", screen: "home", at: { x: 16, y: 80 }, props: { text: "Price {{data.ticker.value.value}}" } });
  run("add_part", { slug: "text", id: "count", screen: "home", at: { x: 16, y: 140 }, props: { text: "Count {{data.ticker.count}}" } });
  run("add_part", { slug: "text", id: "last", screen: "home", at: { x: 16, y: 200 }, props: { text: "Last {{vars.last}}" } });
  run("set_subscription", { screen: "home", name: "ticker", channel: "ticker", actions: { "on:message": { to: "none", effects: [{ do: "setVar", var: "v-last", value: "", expr: "event.payload.label" }] } } });
  return docOf(store.get());
}

const onShow = (page: Page) => page.locator("[data-preview-active]").first();
const words = async (page: Page) => (await onShow(page).textContent()) ?? "";
async function waitForWords(page: Page, text: string | RegExp, ms = 10_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const w = await words(page);
    if (typeof text === "string" ? w.includes(text) : text.test(w)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`the screen on show never said ${String(text)}; it says ${JSON.stringify((await words(page)).slice(0, 300))}`);
}
/** how many messages the screen says came */
const count = async (page: Page) => Number(/Count (\d+)/.exec(await words(page))?.[1] ?? NaN);

export const tests: E2ETest[] = [
  {
    name: "realtime: a subscription to the mocks' ticker drives the preview, and the clock controls stop it and run it faster",
    async run({ page, base, out }) {
      const doc = tickerDoc();
      equal(doc.frames[0].subscriptions?.[0]?.channel, "ticker", "the screen subscribes to the ticker");
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector('[data-screen="home"]', { timeout: 30_000 });
      await settle(page, 1000);
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-active]", { timeout: 10_000 });

      /* the script plays: the latest payload, how many came, and the action on each message */
      await waitForWords(page, "Price 101");
      await waitForWords(page, "Last First");
      await waitForWords(page, "Price 102");
      await waitForWords(page, "Last Again");
      await waitForWords(page, /Count [3-9]/);
      await page.screenshot({ path: join(out, "realtime-playing.png") });

      /* the clock stopped: no message arrives */
      await page.locator("[data-preview-clock-pause]").first().click();
      await settle(page, 300);
      equal(await page.locator("[data-preview-clock-pause]").first().getAttribute("data-preview-clock-pause"), "paused", "the bar says the clock is paused");
      const stopped = await count(page);
      await page.waitForTimeout(1500);
      equal(await count(page), stopped, "nothing arrives while the clock stands still");
      await page.screenshot({ path: join(out, "realtime-paused.png") });

      /* on again, ten times as fast: the messages come again, sooner */
      await page.locator("[data-preview-clock-pause]").first().click();
      for (let i = 0; i < 3; i++) {
        await page.locator("[data-preview-clock-rate]").first().click();
        await settle(page, 100);
      }
      equal(await page.locator("[data-preview-clock-rate]").first().getAttribute("data-preview-clock-rate"), "10", "the clock runs ten times as fast");
      const before = await count(page);
      await page.waitForTimeout(800);
      const after = await count(page);
      /* at ten times, 800 ms are 8000 ms of the mocks' clock: twenty messages, at least ten of them kept on show */
      check(after - before >= 10, `the messages come ten times as fast: ${before} → ${after}`);
      await page.screenshot({ path: join(out, "realtime-fast.png") });
    },
  },
];
