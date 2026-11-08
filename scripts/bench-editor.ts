/* bun run bench:editor [--base http://127.0.0.1:4173] [--screens 40] [--reps 12] [--json out.json] [--breakdown]
 *
 * How much work the editor does per interaction on a large document, in headless Chromium (docs/编辑器性能.md). It builds
 * the app and serves it with `vp preview` unless given `--base`, opens a document of `--screens` phone screens (an app
 * bar and 24 everyday parts each: 1000 parts for 40) from a link, says what opening it cost, and for each interaction
 * reports:
 *   - commits:   React commits (counted through the DevTools hook, which production React also calls)
 *   - rendered:  components that rendered in those commits (fibers that did work, the way React DevTools tells)
 *   - measured:  getBoundingClientRect calls on the hidden measuring layer (one per part measured, and its overlay)
 *   - baselines: text line boxes read there (Range#getClientRects: a baseline worked out again)
 *   - next paint: from each input event to the frame after it was handled, median and worst, in ms
 *   - long tasks: the main thread's tasks over 50 ms during the interaction, summed
 * `--breakdown` also lists the components that rendered most, by name: against the dev server (`--base` of `vp dev`),
 * where names are kept. Numbers depend on the machine; compare runs made on the same one. Playwright comes from wherever
 * it is installed, as for the end-to-end tests (e2e/run.ts). */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import type { Browser, Page } from "../e2e/lib";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SCREENS = Number(option("screens") ?? 40);
const REPS = Number(option("reps") ?? 12);

function playwright(): { chromium: { launch(o?: { headless?: boolean }): Promise<Browser> } } {
  const require = createRequire(join(root, "package.json"));
  const tries = [process.env.PLAYWRIGHT_PATH, "playwright", ...(process.env.NODE_PATH ?? "").split(":").filter(Boolean).map((d) => join(d, "playwright"))];
  try {
    tries.push(join(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "playwright"));
  } catch {}
  tries.push("/opt/node-tools/node_modules/playwright", "/usr/local/lib/node_modules/playwright");
  for (const p of tries) {
    if (!p) continue;
    try {
      return require(p);
    } catch {}
  }
  console.error("Playwright was not found (see e2e/run.ts).");
  process.exit(2);
}

const freePort = () =>
  new Promise<number>((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => ok(port));
    });
  });

async function server(): Promise<{ base: string; stop: () => void }> {
  const given = option("base");
  if (given) return { base: given.replace(/\/$/, ""), stop: () => {} };
  execSync("bun run build", { cwd: root, stdio: "inherit" });
  const port = await freePort();
  const child: ChildProcess = spawn(join(root, "node_modules", ".bin", "vp"), ["preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(base + "/")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return { base, stop: () => child.kill() };
}

/* ---------- the document ---------- */

/** `screens` phone screens, each an app bar over two columns of twelve everyday parts: a document of the size a real
 *  multi-screen app comes to, with every part measured */
export function largeDoc(screens: number) {
  const kinds: [string, (n: number) => Record<string, unknown>][] = [
    ["button", (n) => ({ label: `Action ${n}`, icon: "star", size: "sm" })],
    ["chip", (n) => ({ label: `Filter ${n}` })],
    ["switch", (n) => ({ label: `Option ${n}` })],
    ["checkbox", (n) => ({ label: `Agree ${n}` })],
    ["badge", (n) => ({ label: `${n}` })],
    ["label", (n) => ({ text: `Caption ${n}` })],
  ];
  const groups: unknown[] = [];
  const frames: unknown[] = [];
  let n = 0;
  for (let s = 0; s < screens; s++) {
    const fx = s * 520;
    frames.push({ id: `bf${s}`, name: `Screen ${s + 1}`, x: fx, y: 0 });
    groups.push({ id: `bg${s}-bar`, x: fx, y: 0, axis: "x", items: [{ id: `bi${s}-bar`, kind: "component", label: "", icon: null, variant: "filled", component: "app-bar", props: { title: `Screen ${s + 1}`, width: 412 } }] });
    for (let i = 0; i < 24; i++) {
      const [slug, props] = kinds[i % kinds.length];
      const col = i % 2;
      const row = Math.floor(i / 2);
      n++;
      groups.push({ id: `bg${s}-${i}`, x: fx + 16 + col * 196, y: 96 + row * 64, axis: "x", items: [{ id: `bi${s}-${i}`, kind: "component", label: "", icon: null, variant: "filled", component: slug, props: props(n) }] });
    }
  }
  return { title: "Bench", groups, frames };
}

const linkOf = (doc: unknown) => `#docz=${deflateRawSync(Buffer.from(JSON.stringify(doc))).toString("base64url")}`;

/* ---------- what is counted in the page ---------- */

/** installed before the page's scripts: the counters, the DevTools hook React reports its commits to, and the clocks */
function instrument() {
  type Fiber = { tag: number; flags: number; type: unknown; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null };
  const b = {
    commits: 0,
    rendered: 0,
    measured: 0,
    baselines: 0,
    countRenders: true,
    longtask: 0,
    paints: [] as number[],
    /** components rendered, by name (with --breakdown, against the dev server, where names are kept) */
    names: {} as Record<string, number>,
  };
  (window as unknown as { __bench: typeof b }).__bench = b;
  /* function, class, forwardRef, memo and simple memo components */
  const COMPONENT = new Set([0, 1, 11, 14, 15]);
  const rendered = (f: Fiber): number => {
    let n = COMPONENT.has(f.tag) && f.flags & 1 ? 1 : 0;
    if (n) {
      const t = f.type as { displayName?: string; name?: string; type?: { displayName?: string; name?: string }; render?: { name?: string } } | null;
      const name = t?.displayName ?? t?.name ?? t?.type?.displayName ?? t?.type?.name ?? t?.render?.name ?? "?";
      b.names[name] = (b.names[name] ?? 0) + 1;
    }
    /* children not reconciled at all: the subtree is the one committed before */
    if (f.alternate && f.child === f.alternate.child) return n;
    for (let c = f.child; c; c = c.sibling) n += rendered(c);
    return n;
  };
  (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
      b.commits++;
      if (b.countRenders) b.rendered += rendered(root.current);
    },
  };
  const inLayer = (n: Node | null) => !!(n && (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest("[data-measure-layer]"));
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (inLayer(this)) b.measured++;
    return rect.call(this);
  };
  const lines = Range.prototype.getClientRects;
  Range.prototype.getClientRects = function (this: Range) {
    if (inLayer(this.startContainer)) b.baselines++;
    return lines.call(this);
  };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) b.longtask += e.duration;
  }).observe({ type: "longtask", buffered: false } as PerformanceObserverInit);
  /* an input event's time to the frame after the one it was handled in */
  for (const type of ["pointerdown", "pointerup", "pointermove", "keydown", "wheel", "input"])
    window.addEventListener(
      type,
      (e) => {
        const at = e.timeStamp;
        requestAnimationFrame(() => setTimeout(() => b.paints.push(performance.now() - at), 0));
      },
      { capture: true, passive: true },
    );
}

type Counts = { commits: number; rendered: number; measured: number; baselines: number; longtask: number; paints: number[]; names: Record<string, number> };

const reset = (page: Page, countRenders: boolean) =>
  page.evaluate((c: boolean) => {
    const b = (window as unknown as { __bench: Counts & { countRenders: boolean } }).__bench;
    Object.assign(b, { commits: 0, rendered: 0, measured: 0, baselines: 0, longtask: 0, paints: [], names: {}, countRenders: c });
  }, countRenders);
const read = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __bench: Counts }).__bench)) as Counts);
/** two frames and a moment: what the interaction set going (a measure, a layout pass) has landed */
const idle = (page: Page, ms = 250) => page.evaluate((w: number) => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, w)))), ms);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

type Row = { interaction: string; perRep: { commits: number; rendered: number; measured: number; baselines: number; longtaskMs: number }; paintMs: { median: number; worst: number } };

/** runs `act` `REPS` times, counting the work of each (the renders in a pass of their own: walking the tree costs) */
async function bench(page: Page, name: string, act: (i: number) => Promise<void>): Promise<Row> {
  await act(-1);
  await idle(page, 400);
  /* the counts */
  await reset(page, true);
  for (let i = 0; i < REPS; i++) {
    await act(i);
    await idle(page);
  }
  const counted = await read(page);
  if (args.includes("--breakdown"))
    console.log(
      `${name}: ${Object.entries(counted.names)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([k, v]) => `${k} ${Math.round(v / REPS)}`)
        .join(", ")}`,
    );
  /* the clocks, with nothing walking the tree */
  await reset(page, false);
  for (let i = 0; i < REPS; i++) {
    await act(i);
    await idle(page);
  }
  const timed = await read(page);
  const per = (n: number) => Math.round((n / REPS) * 10) / 10;
  return {
    interaction: name,
    perRep: { commits: per(counted.commits), rendered: per(counted.rendered), measured: per(counted.measured), baselines: per(counted.baselines), longtaskMs: per(timed.longtask) },
    paintMs: { median: Math.round(median(timed.paints) * 10) / 10, worst: Math.round(Math.max(0, ...timed.paints) * 10) / 10 },
  };
}

/* ---------- the run ---------- */

const { base, stop } = await server();
const browser = await playwright().chromium.launch();
const rows: Row[] = [];
let parts = 0;
let opening = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("m3e:ui")) localStorage.setItem("m3e:ui", JSON.stringify({ pickedLang: "en" }));
  }, undefined);
  await ctx.addInitScript(instrument, undefined);
  const page = await ctx.newPage();
  const doc = largeDoc(SCREENS);
  const t0 = Date.now();
  await page.goto(`${base}/${linkOf(doc)}`, { waitUntil: "load" });
  await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 120_000 });
  await page.waitForSelector(`[data-node="bi${SCREENS - 1}-23"]`, { timeout: 120_000 });
  const drawnIn = Date.now() - t0;
  await idle(page, 2500);
  parts = await page.evaluate(() => document.querySelectorAll("[data-measure-layer] > *").length);
  const opened = await read(page);
  opening = { drawnMs: drawnIn, commits: opened.commits, measured: opened.measured, longtaskMs: Math.round(opened.longtask) };
  console.log(`${SCREENS} screens, ${parts} parts; opening: on the canvas in ${(drawnIn / 1000).toFixed(1)}s, ${opened.commits} commits, ${opened.measured} boxes read, ${Math.round(opened.longtask)} ms of long tasks`);
  /* the first screen filling the view, so its parts can be pressed */
  await page.locator('button[title="Zoom in"]').first().click();
  await idle(page, 300);
  await page.locator('button[title="Zoom in"]').first().click();
  await idle(page, 800);
  /* the screen nearest the middle of the canvas: the parts pressed below are on it */
  const on = await page.evaluate(() => {
    let best = { id: "", d: Infinity };
    for (const el of document.querySelectorAll("[data-screen]")) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - innerWidth / 2);
      if (d < best.d) best = { id: el.getAttribute("data-screen") ?? "", d };
    }
    return best.id.replace(/^bf/, "");
  });
  const part = (i: number) => `bi${on}-${i}`;

  const box = async (id: string) => {
    const b = await page.locator(`[data-node="${id}"]`).first().boundingBox();
    if (!b) throw new Error(`no part ${id} on the canvas`);
    return b;
  };
  const press = async (id: string) => {
    const b = await box(id);
    await page.keyboard.down("Control");
    await page.mouse.click(b.x + Math.min(12, b.width / 2), b.y + Math.min(10, b.height / 2));
    await page.keyboard.up("Control");
  };

  rows.push(await bench(page, "select a part", (i) => press(i % 2 ? part(0) : part(2))));
  rows.push(await bench(page, "switch a left tab", (i) => page.locator(`aside button[title="${i % 2 ? "Parts" : "Layers"}"]`).first().click()));
  /* the canvas held still while the pointer passes over parts */
  rows.push(
    await bench(page, "hover over parts", async (i) => {
      const a = await box(part(4));
      const c = await box(part(10));
      const [from, to] = i % 2 ? [c, a] : [a, c];
      await page.mouse.move(from.x + 5, from.y + 5);
      await page.mouse.move(to.x + 5, to.y + 5, { steps: 6 });
    }),
  );
  rows.push(
    await bench(page, "pan the canvas (wheel)", async (i) => {
      const r = await box(part(6));
      await page.mouse.move(r.x, r.y);
      await page.evaluate((dy: number) => {
        const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        el?.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, deltaX: 0, bubbles: true, cancelable: true, clientX: innerWidth / 2, clientY: innerHeight / 2 }));
      }, i % 2 ? 60 : -60);
    }),
  );
  /* a word typed into the selected button's label: each key a change of that one part */
  await page.keyboard.press("Escape");
  await idle(page, 300);
  await press(part(0));
  await idle(page, 600);
  const field = page.locator('input[aria-label="Label"], textarea[aria-label="Label"]').first();
  rows.push(
    await bench(page, "type into a part's label", async (i) => {
      if (i < 0) await field.click().catch(async (e) => {
        await page.screenshot({ path: join(root, "e2e", ".out", "bench-label.png") });
        throw e;
      });
      await page.keyboard.press(i % 2 ? "Backspace" : "x");
    }),
  );
  await page.keyboard.press("Escape");
  rows.push(
    await bench(page, "drag a part (6 moves)", async (i) => {
      const b = await box(i % 2 ? part(9) : part(9));
      const from = { x: b.x + 6, y: b.y + 6 };
      const dx = i % 2 ? -30 : 30;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(from.x + (dx * k) / 6, from.y);
      await page.mouse.up();
    }),
  );
  await ctx.close();
} finally {
  await browser.close();
  stop();
}

console.log(`\n${"interaction".padEnd(26)} ${"commits".padStart(8)} ${"rendered".padStart(9)} ${"measured".padStart(9)} ${"baselines".padStart(10)} ${"paint med".padStart(10)} ${"worst".padStart(7)} ${"long".padStart(6)}`);
for (const r of rows)
  console.log(
    `${r.interaction.padEnd(26)} ${String(r.perRep.commits).padStart(8)} ${String(r.perRep.rendered).padStart(9)} ${String(r.perRep.measured).padStart(9)} ${String(r.perRep.baselines).padStart(10)} ${r.paintMs.median.toFixed(1).padStart(10)} ${r.paintMs.worst.toFixed(1).padStart(7)} ${r.perRep.longtaskMs.toFixed(0).padStart(6)}`,
  );
console.log("(per repetition; paint = input event to the next frame, ms; long = long-task ms per repetition)");
const out = option("json");
if (out) writeFileSync(out, JSON.stringify({ screens: SCREENS, parts, reps: REPS, opening, rows }, null, 2));
