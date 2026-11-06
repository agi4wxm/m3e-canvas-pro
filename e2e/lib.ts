/* What the end-to-end tests share: the little of Playwright they use (it is not a dependency of the project, so its
 * types are not either), a fresh editor in English, actions through the editor's own controls, and reading back the
 * document the editor saved in the browser. */

export type Box = { x: number; y: number; width: number; height: number };
export type Locator = {
  first(): Locator;
  last(): Locator;
  nth(i: number): Locator;
  filter(o: { hasText?: string | RegExp }): Locator;
  click(o?: { timeout?: number }): Promise<void>;
  dblclick(): Promise<void>;
  fill(v: string): Promise<void>;
  press(key: string): Promise<void>;
  pressSequentially(text: string, o?: { delay?: number }): Promise<void>;
  count(): Promise<number>;
  isEnabled(): Promise<boolean>;
  isVisible(): Promise<boolean>;
  boundingBox(): Promise<Box | null>;
  textContent(): Promise<string | null>;
  inputValue(): Promise<string>;
  waitFor(o?: { state?: "attached" | "detached" | "visible" | "hidden"; timeout?: number }): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  locator(s: string): Locator;
  evaluateAll<R>(f: (els: Element[]) => R): Promise<R>;
};
export type Route = { fulfill(o: { status?: number; headers?: Record<string, string>; body?: string }): Promise<void>; abort(code?: string): Promise<void> };
export type Request = { method(): string; url(): string; postData(): string | null };
export type Download = { suggestedFilename(): string; saveAs(path: string): Promise<void>; path(): Promise<string | null> };
export type FileChooser = { setFiles(path: string): Promise<void> };
export type Page = {
  goto(url: string, o?: { waitUntil?: "load" | "networkidle" }): Promise<unknown>;
  reload(o?: { waitUntil?: "load" | "networkidle" }): Promise<unknown>;
  waitForSelector(s: string, o?: { state?: "attached" | "detached" | "visible" | "hidden"; timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForEvent(name: "download"): Promise<Download>;
  waitForEvent(name: "filechooser"): Promise<FileChooser>;
  evaluate<R, A = undefined>(f: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  locator(s: string): Locator;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
  on(event: "pageerror", f: (e: Error) => void): void;
  on(event: "request", f: (r: Request) => void): void;
  /** answers the page's requests to a URL instead of the network: what a model provider says, in tests */
  route(url: string | RegExp, handler: (route: Route, request: Request) => void | Promise<void>): Promise<void>;
  context(): Context;
  url(): string;
  title(): Promise<string>;
  close(): Promise<void>;
  waitForURL(url: string | RegExp | ((url: URL) => boolean), o?: { timeout?: number }): Promise<void>;
  mouse: { move(x: number, y: number, o?: { steps?: number }): Promise<void>; down(): Promise<void>; up(): Promise<void>; click(x: number, y: number): Promise<void>; dblclick(x: number, y: number): Promise<void> };
  keyboard: { press(key: string): Promise<void>; down(key: string): Promise<void>; up(key: string): Promise<void> };
};
export type Context = { newPage(): Promise<Page>; addInitScript<A>(f: (arg: A) => void, arg: A): Promise<void>; close(): Promise<void> };
export type Browser = { newContext(o: { viewport: { width: number; height: number }; deviceScaleFactor: number; acceptDownloads?: boolean }): Promise<Context>; close(): Promise<void> };

/** one test: a name, and what it does with a fresh editor */
export type E2ETest = { name: string; run: (t: T) => Promise<void>; viewport?: { width: number; height: number } };

/** what a test is handed */
export type T = { page: Page; base: string; out: string; errors: string[] };

export class Failure extends Error {}

/** fails the test with what was expected */
export function check(ok: unknown, what: string): asserts ok {
  if (!ok) throw new Failure(what);
}
/** a value as JSON with every object's keys in order, so two equal values read the same */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
export function equal<V>(got: V, want: V, what: string) {
  if (canonical(got) !== canonical(want)) throw new Failure(`${what}: expected ${JSON.stringify(want)?.slice(0, 400)}, got ${JSON.stringify(got)?.slice(0, 400)}`);
}

/* ---------- the saved document ---------- */

export type Item = { id: string; component?: string; props?: Record<string, unknown>; fill?: string; look?: Record<string, unknown>; action?: { to: string } };
export type Group = { id: string; x: number; y: number; items: Item[]; inFlow?: string; instanceOf?: string; kit?: { slug: string }; repeat?: { collection: string }; free?: boolean };
export type Frame = { id: string; name: string; x: number; y: number };
export type Doc = { groups: Group[]; frames: Frame[]; title: string; theme?: { style?: string; strict?: boolean }; components?: { id: string; name: string; groups: Group[] }[]; collections?: { id: string; name: string; rows: string[][] }[]; vars?: unknown[]; styles?: { key: string; name: Record<string, string>; seed?: string }[] };

/** The document as the editor saved it in this browser: the project the page has open, from IndexedDB
 *  (lib/projects/db.ts), large pictures as references. A page with no project (storage blocked) reads the old place. */
export const savedDoc = async (page: Page): Promise<Doc> =>
  JSON.parse(
    await page.evaluate(async () => {
      const id = new URLSearchParams(location.search).get("project");
      if (!id) return localStorage.getItem("m3e:doc") ?? "null";
      const db = await new Promise<IDBDatabase>((ok, fail) => {
        const r = indexedDB.open("m3e-projects");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
      });
      try {
        return await new Promise<string>((ok) => {
          const r = db.transaction("docs").objectStore("docs").get(id);
          r.onsuccess = () => ok((r.result as { json?: string } | undefined)?.json ?? "null");
          r.onerror = () => ok("null");
        });
      } finally {
        db.close();
      }
    }),
  ) as Doc;

/** the project the page has open, by its address */
export const projectId = (page: Page): Promise<string | null> => page.evaluate(() => new URLSearchParams(location.search).get("project"));
export const itemsOf = (doc: Doc) => doc.groups.flatMap((g) => g.items.map((it) => ({ ...it, group: g })));
export const bySlug = (doc: Doc, slug: string) => itemsOf(doc).filter((it) => it.component === slug);
export const groupOf = (doc: Doc, itemId: string) => doc.groups.find((g) => g.items.some((it) => it.id === itemId));
/** the parts laid out by a container, in the order of its run */
export const kidsOf = (doc: Doc, groupId: string) => doc.groups.filter((g) => g.inFlow === groupId);

/* ---------- opening the editor ---------- */

/** a fresh editor in English, its first screen and parts drawn */
export async function open(browser: Browser, base: string, viewport = { width: 1440, height: 900 }): Promise<{ ctx: Context; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.addInitScript((lang: string) => {
    if (!localStorage.getItem("m3e:ui")) localStorage.setItem("m3e:ui", JSON.stringify({ pickedLang: lang }));
  }, "en");
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/", { waitUntil: "load" });
  await ready(page);
  return { ctx, page, errors };
}

/** the boot cover gone and the canvas measured */
export async function ready(page: Page) {
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
  await page.waitForSelector("[data-node]", { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

export async function reload(page: Page) {
  await page.reload({ waitUntil: "load" });
  await ready(page);
}

/** a moment for what was just done to settle: layouts, measuring, easing */
export const settle = (page: Page, ms = 900) => page.waitForTimeout(ms);

/* ---------- acting ---------- */

const UNDO = ["Undo", "撤销", "元に戻す", "실행 취소"].map((t) => `button[title="${t}"]`).join(", ");
const REDO = ["Redo", "重做", "やり直す", "다시 실행"].map((t) => `button[title="${t}"]`).join(", ");
export const undoButton = (page: Page) => page.locator(UNDO).first();
export const redoButton = (page: Page) => page.locator(REDO).first();
export async function undo(page: Page) {
  await undoButton(page).click();
  await settle(page, 600);
}
export async function redo(page: Page) {
  await redoButton(page).click();
  await settle(page, 600);
}

export async function leftTab(page: Page, title: string) {
  await page.locator(`aside button[title="${title}"]`).first().click();
  await settle(page, 300);
}

/** a palette tile, found by searching for its name */
export async function tile(page: Page, name: string): Promise<Locator> {
  await leftTab(page, "Parts");
  const box = page.locator('input[aria-label="Search"]').first();
  await box.fill(name);
  await settle(page, 250);
  return page.locator(`button.m3-tile-face[title="${name}"]`).first();
}
async function clearSearch(page: Page) {
  await page.locator('input[aria-label="Search"]').first().fill("");
  await settle(page, 150);
}

export const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** a drag along a straight line in small steps, the way a hand moves */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(120);
  await page.mouse.up();
  await settle(page);
}

/** a part added with a click on its tile: it lands where the view is looking */
export async function clickAdd(page: Page, name: string) {
  await (await tile(page, name)).click();
  await clearSearch(page);
  await settle(page);
}

/** a part or a kit carried from the palette and let go at a point */
export async function dragAdd(page: Page, name: string, to: { x: number; y: number }) {
  const b = await (await tile(page, name)).boundingBox();
  check(b, `the tile ${name}`);
  await drag(page, center(b), to, 20);
  await clearSearch(page);
}

export async function nodeBox(page: Page, id: string): Promise<Box> {
  const b = await page.locator(`[data-node="${id}"]`).first().boundingBox();
  check(b, `the part ${id} on the canvas`);
  return b;
}
export async function screenBox(page: Page, id: string): Promise<Box> {
  const b = await page.locator(`[data-screen="${id}"]`).first().boundingBox();
  check(b, `the screen ${id}`);
  return b;
}

/** selects a part with a click near its top left (or its bottom right, clear of a part over its top); with `add`,
 *  adds it to the selection. Ctrl is held, the editor's deep select: the part itself, even inside a box (a plain click
 *  picks the outermost layer it is in) */
export async function select(page: Page, id: string, add = false, at: "start" | "end" = "start") {
  const b = await nodeBox(page, id);
  if (add) await page.keyboard.down("Shift");
  await page.keyboard.down("Control");
  if (at === "end") await page.mouse.click(b.x + b.width - Math.min(20, b.width / 2), b.y + b.height - Math.min(8, b.height / 2));
  else await page.mouse.click(b.x + Math.min(20, b.width / 2), b.y + Math.min(14, b.height / 2));
  await page.keyboard.up("Control");
  if (add) await page.keyboard.up("Shift");
  await settle(page, 350);
}

/** the screen chosen by a press on its bezel */
export async function selectScreen(page: Page, id: string) {
  const b = await screenBox(page, id);
  await page.mouse.click(b.x + b.width / 2, b.y - 4);
  await settle(page, 350);
}

/** one of the panels' selects, by its label and the words of the option */
export async function pick(page: Page, label: string, option: string) {
  await page.locator(`button[aria-haspopup="listbox"][aria-label="${label}"]`).first().click();
  await settle(page, 250);
  await page.locator('[role="listbox"] [role="option"]').filter({ hasText: option }).first().click();
  await settle(page, 300);
}

/** the tab of a part's panel (Design, Trigger) */
export async function partTab(page: Page, label: string) {
  await page.locator('[role="tablist"] button, [role="tablist"] [role="tab"]').filter({ hasText: label }).first().click();
  await settle(page, 300);
}
