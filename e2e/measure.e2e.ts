/* The measuring layer reads only what changed (report ED-2): a selection, a tab, the pointer passing over parts read no
 * box at all; typing into a part's label reads that part; a face that loads reads every baseline again even where the
 * boxes kept their size; a box that changes size by itself is measured with no render to set it off. The boxes read are
 * counted by wrapping getBoundingClientRect, and the baselines by wrapping Range#getClientRects, inside the layer. */

import { deflateRawSync } from "node:zlib";
import { check, ready, settle, type E2ETest, type Page } from "./lib";

/** two screens of everyday parts, opened from a link */
function doc() {
  const kinds: [string, Record<string, unknown>][] = [
    ["button", { label: "Action", icon: "star", size: "sm" }],
    ["chip", { label: "Filter" }],
    ["switch", { label: "Option" }],
    ["checkbox", { label: "Agree" }],
    ["label", { text: "Caption" }],
  ];
  const groups: unknown[] = [];
  const frames: unknown[] = [];
  for (let s = 0; s < 2; s++) {
    frames.push({ id: `mf${s}`, name: `Screen ${s + 1}`, x: s * 520, y: 0 });
    for (let i = 0; i < 10; i++) {
      const [slug, props] = kinds[i % kinds.length];
      groups.push({ id: `mg${s}-${i}`, x: s * 520 + 16 + (i % 2) * 196, y: 96 + Math.floor(i / 2) * 64, axis: "x", items: [{ id: `mi${s}-${i}`, kind: "component", label: "", icon: null, variant: "filled", component: slug, props: { ...props, label: props.label ? `${props.label} ${s}${i}` : undefined } }] });
    }
  }
  return { title: "Measure", groups, frames };
}

/** counts what is read inside the measuring layer, from before the editor's first script */
function count() {
  const w = window as unknown as { __read: { boxes: number; lines: number } };
  w.__read = { boxes: 0, lines: 0 };
  const inLayer = (n: Node | null) => !!(n && (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest("[data-measure-layer]"));
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (inLayer(this)) w.__read.boxes++;
    return rect.call(this);
  };
  const lines = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function (this: Range) {
    if (inLayer(this.startContainer)) w.__read.lines++;
    return lines.call(this);
  };
}

const zero = (page: Page) => page.evaluate(() => Object.assign((window as unknown as { __read: object }).__read, { boxes: 0, lines: 0 }));
const read = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __read: { boxes: number; lines: number } }).__read }));

/** the page opened again on the two screens, counting (in the same tab: a second one could not edit) */
async function opened(page: Page): Promise<Page> {
  await page.context().addInitScript(count, undefined);
  const link = deflateRawSync(Buffer.from(JSON.stringify(doc()))).toString("base64url");
  await page.goto(`${new URL(page.url()).origin}/#docz=${link}`, { waitUntil: "load" });
  await ready(page);
  await page.waitForSelector('[data-node="mi1-9"]');
  await settle(page, 1500);
  return page;
}

async function press(page: Page, id: string) {
  const b = await page.locator(`[data-node="${id}"]`).first().boundingBox();
  check(b, `the part ${id} on the canvas`);
  await page.keyboard.down("Control");
  await page.mouse.click(b.x + Math.min(10, b.width / 2), b.y + Math.min(8, b.height / 2));
  await page.keyboard.up("Control");
  await settle(page, 400);
}

export const tests: E2ETest[] = [
  {
    name: "measure: a selection, a tab and the pointer read no box; typing into a label reads that part alone",
    async run({ page: first }) {
      const page = await opened(first);
      const parts = await page.evaluate(() => document.querySelectorAll("[data-measure-layer] > *").length);
      check(parts >= 20, `the measuring layer holds every part: ${parts}`);

      await zero(page);
      await press(page, "mi0-0");
      await press(page, "mi0-2");
      await page.locator('aside button[title="Layers"]').first().click();
      await settle(page, 400);
      await page.locator('aside button[title="Parts"]').first().click();
      await settle(page, 400);
      const a = await page.locator('[data-node="mi0-4"]').first().boundingBox();
      const b = await page.locator('[data-node="mi0-8"]').first().boundingBox();
      check(a && b, "two parts to pass over");
      await page.mouse.move(a.x + 4, a.y + 4);
      await page.mouse.move(b.x + 4, b.y + 4, { steps: 8 });
      await settle(page, 400);
      const idle = await read(page);
      check(idle.boxes === 0, `selecting, switching tabs and hovering read no box of the ${parts} parts: read ${idle.boxes}`);

      /* the selected button's label, typed into: that part measured, nothing else */
      await press(page, "mi0-0");
      await page.locator('input[aria-label="Label"]').first().click();
      await zero(page);
      await page.keyboard.press("x");
      await settle(page, 600);
      const typed = await read(page);
      check(typed.boxes >= 1 && typed.boxes <= 2, `typing into one part's label reads that part's box: read ${typed.boxes}`);
      const grown = await page.locator('[data-node="mi0-0"]').first().boundingBox();
      check(grown, "the button on the canvas");
    },
  },
  {
    name: "measure: a face that loaded reads every baseline again in boxes that kept their size",
    async run({ page: first }) {
      const page = await opened(first);
      const sizes = () => page.evaluate(() => [...document.querySelectorAll("[data-screen] [data-node]")].map((n) => `${n.getAttribute("data-node")}:${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`).join(" "));
      const before = await sizes();
      await zero(page);
      /* what the browser says when a web font arrives: the boxes may come out the same, the baselines need not */
      await page.evaluate(() => document.fonts.dispatchEvent(new Event("loadingdone")));
      await settle(page, 600);
      const after = await read(page);
      check(after.boxes >= 20, `every part measured again: ${after.boxes} boxes read`);
      check(after.lines >= 10, `the baselines read again although no box changed size: ${after.lines} lines read`);
      check((await sizes()) === before, "the parts kept their sizes");
    },
  },
  {
    name: "measure: a box that changes size by itself is measured with no render to set it off",
    async run({ page: first }) {
      const page = await opened(first);
      const width = () => page.evaluate(() => Math.round(document.querySelector('[data-screen] [data-node="mi0-1"]')!.getBoundingClientRect().width));
      const zoom = await page.evaluate(() => {
        const n = document.querySelector('[data-screen] [data-node="mi0-1"]') as HTMLElement;
        return n.getBoundingClientRect().width / n.offsetWidth;
      });
      const was = await width();
      /* the chip's box in the measuring layer grows by a stylesheet alone, as when a picture or a lazy component arrives */
      await page.evaluate(() => {
        const box = [...document.querySelectorAll<HTMLElement>("[data-measure-layer] > *")][1];
        box.setAttribute("data-grown", "");
        const style = document.createElement("style");
        style.textContent = "[data-measure-layer] > [data-grown] { padding-right: 80px }";
        document.head.append(style);
      });
      await settle(page, 500);
      const now = await width();
      check(Math.abs(now - was - 80 * zoom) <= 2 * Math.max(1, zoom), `the chip on the canvas took its new size: ${was} → ${now} at ${zoom.toFixed(2)}×`);
    },
  },
];
