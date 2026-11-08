/* The preview's taps as behaviours, each a tap (or a key) → what it sets off → the state it leaves, in a real editor
 * and preview, the back end answered on the page (e2e/previewLab.ts) so a test answers a call when it chooses:
 *   - Backspace and ← in a field edit the field; elsewhere they go back
 *   - a form in an overlay submits the overlay's own params and fields
 *   - a search field the source's params read loads the list again as it is typed in
 *   - an answer after the scenario changed, after the visitor went back, or to a call made again since, runs nothing
 *   - `then` runs in the tap's screen (its params, its form) after the tap itself went on
 *   - a resizable starts and resets at the share it was set to, at several widths
 * They are written so the table they make can move into the hosts' consistency tests (report 6.3) once the preview
 * runs on the shared runtime. Screenshots of failures go to e2e/.out. */

import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";
import { check, equal, selectScreen, settle, type E2ETest, type Page } from "./lib";
import { installLab, labDoc, type Lab } from "./previewLab";

setGlobalLang("en");

/** the editor opened on a document, the lab's back end answering the preview */
async function openDoc(page: Page, base: string, doc: Doc, first: string, lab?: Lab) {
  if (lab) await page.context().addInitScript(installLab, lab);
  await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector(`[data-screen="${first}"]`, { timeout: 30_000 });
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
const words = async (page: Page) => (await onShow(page).textContent()) ?? "";
/** a part of the screen on show (the overlay, when one is up), by its id */
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
const onScreen = (page: Page, id: string) => until(`the preview shows ${id}`, async () => (await shownScreen(page)) === id);
const snackSays = (page: Page, text: string) => until(`the snackbar says ${JSON.stringify(text)}`, async () => (await snack(page)) === text);

type Call = { op: string; path: string; query: Record<string, unknown> | null; body: unknown };
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: Call[] }).__calls);
const held = (page: Page) => page.evaluate(() => (window as unknown as { __held: unknown[] }).__held.length);
const answer = (page: Page, i: number, status: number, body?: unknown) => page.evaluate(([n, s, b]) => (window as unknown as { __answer: (i: number, s: number, b: unknown) => void }).__answer(n as number, s as number, b), [i, status, body] as const);

/** the lab's preview on the screen opened with params (`cat` is "tea"), the calls named held for the test to answer */
async function onNotes(page: Page, base: string, hold: string[]) {
  const { doc } = labDoc();
  await openDoc(page, base, doc, "list", { hold });
  await preview(page, "list");
  await part(page, "to-notes").click();
  await onScreen(page, "notes");
  await settle(page, 400);
}

/** a desktop screen with three resizables, each as wide and split as given */
function splitsDoc(cases: { id: string; w: number; split: number }[]): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Splits", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "splits", name: "Splits", preset: "desktop" });
    cases.forEach((c, i) => tx.run(ops.addPart, { slug: "resizable", id: c.id, screen: "splits", at: { x: 16, y: 24 + i * 200 }, props: { width: c.w, height: 160, split: c.split } }));
  });
  return savedDoc(store.get());
}

export const tests: E2ETest[] = [
  {
    name: "preview keys: Backspace and ← in a field edit it and stay on the screen; elsewhere they go back",
    async run({ page, base }) {
      const { doc } = labDoc();
      await openDoc(page, base, doc, "list", { hold: [] });
      await preview(page, "list");
      await part(page, "to-keys").click();
      await onScreen(page, "keys");
      await settle(page, 500);
      const field = part(page, "typing").locator("input").first();
      await field.click();
      await field.pressSequentially("abc", { delay: 30 });
      await page.keyboard.press("Backspace");
      await settle(page, 300);
      equal(await field.inputValue(), "ab", "Backspace deleted one character");
      equal(await shownScreen(page), "keys", "and the preview stayed on the screen");
      /* ← moves the caret: what is typed next lands before the last character */
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("x");
      await settle(page, 300);
      equal(await field.inputValue(), "axb", "← moved the caret inside the field");
      equal(await shownScreen(page), "keys", "and did not go back");
      /* a key an input method is composing is its own, wherever the focus is */
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", keyCode: 229, isComposing: true, bubbles: true }));
      });
      await settle(page, 400);
      equal(await shownScreen(page), "keys", "a composing Backspace does not go back");
      /* out of the field, Backspace goes back */
      await page.keyboard.press("Backspace");
      await onScreen(page, "list");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview overlay: a form in an overlay submits the overlay's own params and fields",
    async run({ page, base }) {
      const { doc } = labDoc();
      await openDoc(page, base, doc, "list", { hold: [] });
      await preview(page, "list");
      await until("the products", async () => (await words(page)).includes("Coffee"));
      await part(page, "rename-p2").click();
      await page.waitForSelector('[data-preview-overlay="rename"]', { timeout: 5000 });
      await settle(page, 500);
      equal(await shownScreen(page), "rename", "the overlay is the screen taps land on");
      await onShow(page).locator("[data-live-part] input").first().fill("Jasmine tea");
      await settle(page, 300);
      await onShow(page).locator("[data-live-part]").filter({ hasText: "Save name" }).last().click();
      await snackSays(page, "Renamed p2 to Jasmine tea");
      const sent = (await calls(page)).filter((c) => c.op === "renameProduct");
      equal(sent.map((c) => [c.path, c.body]), [["/products/p2", { name: "Jasmine tea" }]], "the overlay's params in the path, its field in the body");
      await until("the overlay closes", async () => (await page.locator("[data-preview-overlay]").count()) === 0);
      equal(await shownScreen(page), "list", "back on the screen under it");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview data: typing in a search field the source's params read loads the list again",
    async run({ page, base }) {
      const { doc } = labDoc();
      await openDoc(page, base, doc, "list", { hold: [] });
      await preview(page, "list");
      await until("all the products", async () => (await words(page)).includes("Coffee"));
      const search = part(page, "search").locator("input").first();
      await search.click();
      await search.pressSequentially("tea", { delay: 40 });
      await until("only the teas", async () => {
        const t = await words(page);
        return !t.includes("Coffee") && !t.includes("Cocoa") && t.includes("Green tea") && t.includes("Mint tea");
      });
      const asked = (await calls(page)).filter((c) => c.op === "listProducts").map((c) => c.query?.q ?? null);
      equal(asked[0], null, "first with nothing typed");
      equal(asked.at(-1), "tea", "last with what was typed");
      equal(await search.inputValue(), "tea", "the field keeps what was typed while the list loads");
      await search.fill("");
      await until("all the products again", async () => (await words(page)).includes("Coffee"));
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview answers: one that comes after the scenario changed runs no catch",
    async run({ page, base }) {
      await onNotes(page, base, ["ping"]);
      await part(page, "ping").click();
      await until("the ping is out", async () => (await held(page)) === 1);
      /* another scenario starts the bindings over: the call still out answers into nothing */
      await page.locator("[data-preview-scenario-button]").first().click();
      await settle(page, 300);
      await page.locator('[data-preview-scenario="new-user"]').first().click();
      await settle(page, 300);
      await answer(page, 0, 500, { title: "Server error", status: 500 });
      await settle(page, 900);
      equal(await snack(page), null, "no catch ran for it");
      equal(await shownScreen(page), "notes", "and nothing moved");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview answers: one that comes after the visitor went back runs no then",
    async run({ page, base }) {
      await onNotes(page, base, ["ping"]);
      await part(page, "ping").click();
      await until("the ping is out", async () => (await held(page)) === 1);
      await page.locator('[aria-label="Back"]').first().click();
      await onScreen(page, "list");
      await answer(page, 0, 200, { n: 5 });
      await settle(page, 900);
      equal(await snack(page), null, "its then did not run where the visitor is now");
      equal(await shownScreen(page), "list", "and nothing moved");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview answers: of two calls from one button only the newer one's then runs",
    async run({ page, base }) {
      await onNotes(page, base, ["ping"]);
      await part(page, "ping").click();
      await settle(page, 150);
      await part(page, "ping").click();
      await until("both pings are out", async () => (await held(page)) === 2);
      await answer(page, 1, 200, { n: 2 });
      await snackSays(page, "Pong 2 tea");
      /* the older answer comes last: it gives way to the newer one */
      await answer(page, 0, 200, { n: 1 });
      await settle(page, 900);
      equal(await snack(page), "Pong 2 tea", "the older answer's then did not run");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview answers: then runs in the tap's screen, its params and its form, after the tap itself went on",
    async run({ page, base }) {
      await onNotes(page, base, ["ping", "saveNote"]);
      /* a call whose tap goes on at once: its answer reads the screen it was made on */
      await part(page, "ping-go").click();
      await onScreen(page, "done");
      await until("the ping is out", async () => (await held(page)) === 1);
      await answer(page, 0, 200, { n: 7 });
      await snackSays(page, "Pong 7 tea");
      equal(await shownScreen(page), "done", "the then stays where the tap went");
      /* a form submitted by a tap that goes on at once: its then reads the form as it was sent */
      await page.locator('[aria-label="Back"]').first().click();
      await onScreen(page, "notes");
      await settle(page, 400);
      await onShow(page).locator("[data-live-part] input").first().fill("hello");
      await settle(page, 300);
      await part(page, "save-go").click();
      await onScreen(page, "done");
      await until("the note is out", async () => (await held(page)) === 2);
      equal((await calls(page)).filter((c) => c.op === "saveNote").map((c) => c.body), [{ text: "hello" }], "the note sent");
      await answer(page, 1, 201, { n: 3 });
      await snackSays(page, "Saved 3: hello (tea)");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
  {
    name: "preview resizable: panels start and reset at the share they were set to, at several widths",
    async run({ page, base }) {
      const cases = [
        { id: "narrow", w: 240, split: 30 },
        { id: "middle", w: 600, split: 40 },
        { id: "wide", w: 1000, split: 70 },
      ];
      await openDoc(page, base, splitsDoc(cases), "splits");
      const shares = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-preview-active] [data-slot="resizable-panel-group"]')].map((g) => {
            const first = g.querySelector(':scope > [data-slot="resizable-panel"]') as HTMLElement;
            return Math.round((first.getBoundingClientRect().width / g.getBoundingClientRect().width) * 100);
          }),
        );
      const near = (got: number[], want: number[], what: string) => check(got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= 1), `${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      await preview(page, "splits");
      await settle(page, 1200);
      near(await shares(), [30, 40, 70], "the first panel's share as each starts");
      /* a drag moves one; a double-click on each handle puts it back at its share, not at that many pixels */
      const handles = onShow(page).locator('[data-slot="resizable-handle"]');
      const hb = await handles.nth(1).boundingBox();
      check(hb, "the middle one's handle");
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(hb.x + hb.width / 2 + i * 8, hb.y + hb.height / 2);
      await page.mouse.up();
      await settle(page, 300);
      check((await shares())[1] > 45, `the drag moved the middle one (${JSON.stringify(await shares())})`);
      for (let i = 0; i < cases.length; i++) {
        const b = await handles.nth(i).boundingBox();
        check(b, `handle ${i}`);
        await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
      }
      await settle(page, 300);
      near(await shares(), [30, 40, 70], "each back at its share after a double-click");
      await page.keyboard.press("Escape");
      await settle(page, 600);
    },
  },
];
