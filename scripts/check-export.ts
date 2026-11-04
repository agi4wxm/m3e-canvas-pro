// bun scripts/check-export.ts <empty work folder>
//
// The proof an exported project runs. Generates real projects, writes each zip to the work folder,
// unpacks it, installs it, typechecks and builds it, serves the build and taps through it in headless
// Edge: the shop flow, a form with a condition, a counter, inputs, a dock, bars, a long screen, under the
// build and under the dev server, whose React reports what a build keeps quiet. Not part of `bun run test`
// since it installs everything from the network. Exits non-zero on any failure.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { allPartsDoc } from "../lib/codegen.fixture";
import { COUNTER, proofDoc, sweepDoc } from "../lib/exportProject.fixture";
import { buildProject, zipProject, type ExportOptions } from "../lib/exportProject";
import { setGlobalLang } from "../lib/i18n";
import { makeItem, type Doc } from "../lib/tokens";
import { partBySlug } from "../parts/registry";

const WORK = process.argv[2];
const ONLY = process.argv[3];
if (!WORK) throw new Error("usage: bun scripts/check-export.ts <empty work folder> [proof|one|parts|sweep|<a saved .zip>]");
mkdirSync(WORK, { recursive: true });
const fs0 = statfsSync(WORK);
if ((fs0.bavail * fs0.bsize) / 2 ** 30 < 2) throw new Error("under 2GB free: stopping");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failures: string[] = [];
let passes = 0;
function ok(condition: unknown, label: string) {
  if (condition) passes++;
  else failures.push(label);
  console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
}

setGlobalLang("en");
const options: ExportOptions = { read: (p) => readFile(join(ROOT, p), "utf8"), lang: "en" };

function run(cmd: string, args: string[], cwd: string, log: string) {
  console.log(`\n$ ${cmd} ${args.join(" ")}  (in ${cwd})`);
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, CI: "1" }, maxBuffer: 1 << 28 });
  writeFileSync(join(WORK, log), `${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  console.log(`  exit ${r.status}, ${Math.round((Date.now() - started) / 1000)}s, log ${log}`);
  if (r.status !== 0) console.log(`${r.stdout ?? ""}\n${r.stderr ?? ""}`.split("\n").slice(0, 60).join("\n"));
  return r.status === 0;
}

/** the project of a document, written out as a zip */
async function assemble(name: string, doc: Doc, widths: Record<string, number>, extra: ExportOptions = {}): Promise<string | null> {
  const dir = join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const project = await buildProject(doc, widths, { ...options, ...extra });
  ok(!project.warnings.length, `${name}: nothing missing (${project.warnings.join("; ")})`);
  const zip = zipProject(project.files);
  writeFileSync(join(WORK, `${name}.zip`), zip);
  console.log(`\n${name}.zip: ${(zip.length / 1024).toFixed(0)} KB, ${Object.keys(project.files).length} files`);
  return installAndBuild(name, dir, zip);
}

/** a zip unpacked and built the way its README says */
function installAndBuild(name: string, dir: string, zip: Uint8Array): string | null {
  for (const [path, bytes] of Object.entries(unzipSync(zip))) {
    const file = join(dir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  if (!run("bun", ["install"], dir, `export-${name}-install.log`)) return ok(false, `${name}: installs`), null;
  ok(true, `${name}: installs`);
  const typed = run("bun", ["run", "typecheck"], dir, `export-${name}-tsc.log`);
  ok(typed, `${name}: typechecks`);
  const built = run("bun", ["run", "build"], dir, `export-${name}-build.log`);
  ok(built, `${name}: builds`);
  return built ? join(dir, "dist") : null;
}

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function serve(root: string, port: number) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    let file = join(root, path);
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      file = join(root, "index.html");
      data = await readFile(file);
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
  return new Promise<typeof server>((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

type Page = Awaited<ReturnType<typeof edgeAt>>;

/** headless Edge over CDP, with real mouse and keys: its profile stays in the work folder and goes with it */
async function edgeAt(name: string, url: string) {
  const root = join(WORK, `edge-${name}`);
  const tmp = join(root, "tmp");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const port = 9350 + Math.floor(Math.random() * 200);
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--disable-extensions", "--disable-component-update", "--disable-background-networking", "--window-size=1200,1000", `--user-data-dir=${join(root, "profile")}`, `--remote-debugging-port=${port}`, "--no-first-run", "about:blank"], { stdio: "ignore", env: { ...process.env, TEMP: tmp, TMP: tmp } });
  let wsUrl: string | undefined;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      wsUrl = ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[]).find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error("Edge did not start");
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map<number, (d: { error?: { message: string }; result?: unknown }) => void>();
  const errors: string[] = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)!(d);
      pending.delete(d.id);
    }
    if (d.method === "Runtime.exceptionThrown") errors.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 500));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(" ").slice(0, 800));
    if (d.method === "Network.responseReceived" && d.params.response.status >= 400 && !/googleapis|gstatic|iconify/.test(d.params.response.url)) errors.push(`${d.params.response.status} ${d.params.response.url}`);
  };
  const send = <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}) =>
    new Promise<T>((res, rej) => {
      const id = ++seq;
      const timer = setTimeout(() => rej(new Error(`CDP timed out: ${method}`)), 25000);
      pending.set(id, (d) => {
        clearTimeout(timer);
        if (d.error) rej(new Error(d.error.message));
        else res(d.result as T);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async <T = unknown>(expr: string): Promise<T> => {
    const r = await send<{ exceptionDetails?: { exception?: { description?: string } }; result: { value: T } }>("Runtime.evaluate", { expression: `(()=>{${expr}})()`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description} in: ${expr.slice(0, 160)}`);
    return r.result.value;
  };
  const waitFor = async (expr: string, label: string) => {
    for (let i = 0; i < 40; i++) {
      if ((await ev(`return !!(${expr})`)) === true) return true;
      await sleep(125);
    }
    return false;
  };
  const mouse = (type: string, x: number, y: number, buttons = 1) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left", buttons, clickCount: type === "mouseMoved" ? 0 : 1 });
  const clickAt = async (x: number, y: number) => {
    await mouse("mouseMoved", x, y, 0);
    await mouse("mousePressed", x, y);
    await sleep(30);
    await mouse("mouseReleased", x, y, 0);
    await sleep(60);
  };
  /* what a person could press: on the screen, not under anything inert */
  const FIND = `const live=(s)=>[...document.querySelectorAll(s)].filter(e=>!e.closest('[inert]')&&e.getBoundingClientRect().width>0);
    const withText=(t)=>live('button,[role=button],[role=menuitem],[role=option],[role=radio],[role=checkbox],[role=switch],a,label,span,div,p').filter(e=>e.textContent.trim()===t).sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0];`;
  const centerOf = (find: string) => ev<{ x: number; y: number } | null>(`${FIND}const e=${find};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}`);
  const pressOn = async (find: string, label: string) => {
    const at = await centerOf(find);
    if (!at) {
      ok(false, `found ${label}`);
      return false;
    }
    await clickAt(at.x, at.y);
    return true;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  const page = {
    errors,
    send,
    ev,
    waitFor,
    clickAt,
    /** the screen on show, settled */
    screen: () => ev<string>(`return document.querySelector('[data-screen]')?.getAttribute('data-screen')??''`),
    at: async (screen: string) => {
      if (!(await waitFor(`document.querySelector('[data-screen="${screen}"]')`, screen))) return false;
      /* a spring overshoots: a tap has to land on where things come to rest */
      let last = "";
      for (let i = 0, still = 0; i < 40 && still < 3; i++) {
        const now = await ev<string>(`return [...document.querySelectorAll('[data-screen] > *')].map(e=>{const r=e.getBoundingClientRect();return r.left+","+r.top+","+getComputedStyle(e).opacity}).join(";")`);
        still = now === last ? still + 1 : 0;
        last = now;
        await sleep(70);
      }
      return true;
    },
    tap: (text: string) => pressOn(`withText(${JSON.stringify(text)})`, `"${text}"`),
    tapOn: (selector: string, i = 0) => pressOn(`live(${JSON.stringify(selector)})[${i}]`, selector),
    sees: (text: string) => ev<boolean>(`${FIND}return !!withText(${JSON.stringify(text)})`),
    read: (selector: string, code: string) => ev<unknown>(`${FIND}const e=live(${JSON.stringify(selector)})[0];return e?(${code}):null`),
    typeText: (text: string) => send("Input.insertText", { text }),
    key: async (key: string, code: string, vk: number) => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
    },
    reload: async () => {
      await send("Page.navigate", { url });
      await waitFor(`document.querySelector('[data-screen]')`, "the app");
      await sleep(400);
    },
    shot: async (file: string) => writeFileSync(join(WORK, file), Buffer.from((await send<{ data: string }>("Page.captureScreenshot", { format: "png" })).data, "base64")),
    close: async () => {
      try {
        await send("Browser.close");
      } catch {
        // already going
      }
      ws.close();
      edge.kill();
      await sleep(1200);
      rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 });
    },
  };
  return page;
}

/* ---------- tapping through it ---------- */

async function shopFlow(p: Page) {
  await p.reload();
  ok((await p.screen()) === "menu", "starts on the first screen");
  await p.tap("Shop");
  ok(await p.at("products"), "shop: a tap goes to the products");
  await p.shot("export-shot-products.png");
  /* a chip row and a destination bar with no action of their own still light up */
  ok(await p.tap("Bags"), "shop: chip found");
  await sleep(150);
  ok((await p.read('[data-tap="tab:1"][data-slot="chip"], button[data-tap="tab:1"]', `e.getAttribute('aria-pressed')==='true'||e.hasAttribute('data-pressed')`)) === true, "shop: a chip takes the tap");
  /* a slot inside a widget */
  await p.tapOn('[data-tap="open"]');
  ok(await p.at("product"), "shop: a product card's picture opens the product");
  await p.tapOn('button[aria-label="Navigate"]');
  ok(await p.at("products"), "shop: the app bar goes back");
  await p.tapOn('[data-tap="open"]', 1);
  ok(await p.at("product"), "shop: another card opens it too");
  await p.tapOn('[data-tap="action"]');
  ok(await p.at("cart"), "shop: the checkout bar goes to the cart");
  await p.shot("export-shot-cart.png");
  await p.tap("Checkout (4)");
  ok(await p.at("checkout"), "shop: the cart goes to checkout");
  /* a form control on the way: picking the other payment */
  await p.tap("Bank transfer");
  await sleep(100);
  ok((await p.read('[role="radio"][aria-checked="true"]', `e.closest('label')?.textContent?.trim()`)) === "Bank transfer", "shop: a radio takes the tap");
  await p.tap("Place order");
  ok(await p.at("orderPlaced"), "shop: placing the order goes to the confirmation");
  await p.shot("export-shot-success.png");
  await p.tap("Continue shopping");
  ok(await p.at("products"), "shop: and back round to the products, with a fade");
  ok((await p.read('[data-tap="open"]', "true")) === true, "shop: the products are drawn again");
}

async function formFlow(p: Page) {
  await p.reload();
  await p.tap("Form");
  ok(await p.at("form"), "form: reached, sliding up");
  ok(!(await p.sees("We will write to you")), "form: a condition starts unmet");
  await p.tap("Continue");
  await sleep(250);
  ok(await p.sees("Accept the terms first"), "form: else branch: the snackbar stands");
  ok((await p.screen()) === "form", "form: else branch: it stays put");
  await p.shot("export-shot-form.png");
  await p.tapOn('input[type="text"], input:not([type])');
  await p.typeText("a@b.c");
  await sleep(150);
  ok(await p.sees("We will write to you"), "form: typing meets the condition on a bound input");
  await p.tapOn('[role="checkbox"]');
  await sleep(150);
  ok((await p.read('[role="checkbox"]', `e.getAttribute('aria-checked')`)) === "true", "form: the checkbox ticks");
  await p.tap("Continue");
  ok(await p.at("welcome"), "form: when branch: goes on, with the box ticked");
  ok(await p.sees("a@b.c"), "form: a value bound to the variable reads what was typed");
  await p.tap("Back to form");
  ok(await p.at("form"), "form: back");
  ok((await p.read("input", "e.value")) === "a@b.c", "form: what was typed outlives the screen");
  ok((await p.read('[role="checkbox"]', `e.getAttribute('aria-checked')`)) === "true", "form: so does the tick");
}

async function counterFlow(p: Page) {
  await p.reload();
  await p.tap("Counter");
  ok(await p.at("counter"), "counter: reached, with a fade");
  ok(await p.sees("0"), "counter: starts at its variable's value");
  ok(!(await p.sees("Three!")), "counter: its condition starts unmet");
  for (let i = 0; i < 3; i++) await p.tap("Add");
  await sleep(100);
  ok(await p.sees("3"), "counter: addVar counts");
  ok(await p.sees("Three!"), "counter: a part shows while its condition holds");
  await p.tap("Reset");
  await sleep(100);
  ok(await p.sees("0"), "counter: setVar sets");
  ok(!(await p.sees("Three!")), "counter: and the part goes with it");
  ok(!(await p.sees("A secret")), "hidden part: starts off the screen");
  await p.tap("Reveal");
  await sleep(100);
  ok(await p.sees("A secret"), "hidden part: toggle shows it");
  await p.tap("Reveal");
  await sleep(100);
  ok(!(await p.sees("A secret")), "hidden part: toggle hides it");
  ok(await p.sees("Old title"), "setProp: starts at the part's own value");
  await p.tap("Retitle");
  await sleep(100);
  ok(await p.sees("New title"), "setProp: changes it");
  ok((await p.read('[role="switch"]', `e.getAttribute('aria-checked')`)) === "false", "switch: reads its variable");
  await p.tap("Flip");
  await sleep(150);
  ok((await p.read('[role="switch"]', `e.getAttribute('aria-checked')`)) === "true", "toggleVar: flips what a switch shows");
  ok(await p.sees("Flag is on"), "toggleVar: and what follows the variable");
  await p.tapOn('[role="switch"]');
  await sleep(150);
  ok(!(await p.sees("Flag is on")), "switch: writes back to the variable");
  ok((await p.read('img[alt="Picked"]', "e.complete&&e.naturalWidth>0&&new URL(e.src).pathname.startsWith('/images/')")) === true, "picked image: a real file at a real path");
  /* an overlay opened by an effect, its button a slot with an action of its own */
  ok(!(await p.ev(`return !!document.querySelector('[role="dialog"]')`)), "dialog: starts closed");
  await p.tap("Ask");
  ok(await p.waitFor(`document.querySelector('[role="dialog"]')`, "dialog"), "open: opens the dialog");
  await sleep(350);
  await p.shot("export-shot-dialog.png");
  const inside = await p.ev<boolean>(`const d=document.querySelector('[role="dialog"]').getBoundingClientRect(),s=document.querySelector('[data-screen]').getBoundingClientRect();return d.left>=s.left-1&&d.right<=s.right+1`);
  ok(inside, "dialog: stands inside the screen");
  await p.tap("Cancel");
  ok(await p.waitFor(`!document.querySelector('[role="dialog"]')`, "closed"), "close: its dismiss button closes it");
  ok(await p.sees("0"), "dialog: dismiss changes nothing");
  await p.tap("Ask");
  await p.waitFor(`document.querySelector('[role="dialog"]')`, "dialog");
  await sleep(350);
  await p.tap("Accept");
  ok(await p.waitFor(`!document.querySelector('[role="dialog"]')`, "closed"), "dialog: its confirm button closes it");
  ok(await p.sees("100"), "dialog: and runs the action on that slot, through the portal");
  /* a menu's items in a portal: slots by delegation */
  await p.tap("More");
  await sleep(350);
  await p.tap("Set to 7");
  await sleep(350);
  ok(await p.sees("7"), "menu: an item's slot runs");
  await p.tap("More");
  await sleep(350);
  await p.tap("Say hi");
  await sleep(250);
  ok(await p.sees("Hi"), "snackbar: says it");
  await sleep(4300);
  ok(!(await p.sees("Hi")), "snackbar: goes by itself");
}

async function inputsFlow(p: Page) {
  await p.reload();
  await p.tap("Inputs");
  ok(await p.at("inputs"), "inputs: reached, expanding");
  ok(await p.sees("Apple"), "select: starts at its variable");
  await p.tapOn('[data-slot="select-trigger"]');
  await sleep(350);
  await p.tapOn('[role="option"]', 1);
  await sleep(350);
  ok((await p.ev(`return [...document.querySelectorAll('[data-slot="text"]')].some(e=>e.textContent==='Banana')`)) === true, "select: a choice writes the variable");
  ok((await p.read("[data-slot=select-value]", "e.textContent.trim()")) === "Banana", "select: and shows");
  ok(await p.sees("40"), "slider: starts at its variable");
  const thumb = await p.ev<boolean>(`const i=document.querySelector('input[type="range"]');if(!i)return false;i.focus();return document.activeElement===i`);
  ok(thumb, "slider: takes the keyboard");
  await p.key("ArrowRight", "ArrowRight", 39);
  await sleep(150);
  ok(await p.sees("41"), "slider: writes the variable");
  ok((await p.read('[role="radio"][aria-checked="true"]', `e.closest('label')?.textContent?.trim()`)) === "Small", "radio: starts on its own value");
  await p.tap("Pick large");
  await sleep(150);
  ok((await p.read('[role="radio"][aria-checked="true"]', `e.closest('label')?.textContent?.trim()`)) === "Large", "setProp: reaches an input");
  await p.tap("Small");
  await sleep(150);
  ok((await p.read('[role="radio"][aria-checked="true"]', `e.closest('label')?.textContent?.trim()`)) === "Small", "radio: still takes a tap of its own");
  ok((await p.read('input[placeholder="City"]', "e.value")) === "Oslo", "input: starts at its variable");
  await p.tapOn('input[placeholder="City"]');
  await p.typeText("!");
  await sleep(120);
  ok(await p.sees("Oslo!"), "input: writes back to it");
  ok(!(await p.sees("Noted")), "filled: an empty field holds nothing");
  await p.tapOn("textarea");
  await p.typeText("Remember");
  await sleep(150);
  ok(await p.sees("Noted"), "filled: a field with something in it does");
}

async function barsFlow(p: Page) {
  const active = (i: number) => p.read(`[data-tap="tab:${i}"]`, "e.hasAttribute('data-active')||e.getAttribute('aria-current')==='page'");
  await p.reload();
  await p.tap("Bars");
  ok(await p.at("bars"), "bars: reached");
  ok((await active(0)) === true, "bar: starts on what the screen says");
  await p.tapOn('[data-tap="tab:2"]', 1);
  await sleep(120);
  /* the tabs are the first row of `tab:` places on this screen, the bar the second */
  ok((await p.ev(`return document.querySelectorAll('[data-tap="tab:2"]')[1].hasAttribute('data-active')||document.querySelectorAll('[data-tap="tab:2"]')[1].getAttribute('aria-current')==='page'`)) === true, "bar: a destination with no action lights up");
  await p.tap("Green");
  await sleep(120);
  ok((await p.read('[role="tab"][aria-selected="true"]', "e.textContent.trim()")) === "Green", "tabs: take the tap, and stay controlled");
  await p.tapOn('[data-tap="tab:1"]', 1);
  ok(await p.at("barsTwo"), "bar: a destination with an action opens its screen");
  ok((await p.read('[data-tap="tab:1"]', "e.hasAttribute('data-active')||e.getAttribute('aria-current')==='page'")) === true, "bar: that screen's bar says what it says itself");
  await p.tap("Bars back");
  ok(await p.at("bars"), "bar: back");
  ok((await p.ev(`return document.querySelectorAll('[data-tap="tab:0"]')[1].hasAttribute('data-active')||document.querySelectorAll('[data-tap="tab:0"]')[1].getAttribute('aria-current')==='page'`)) === true, "bar: and this one what it says, not the last tap");
}

async function longFlow(p: Page) {
  await p.reload();
  await p.tap("Long");
  ok(await p.at("long"), "long: reached");
  const folded = () => p.ev<boolean>(`return !!document.querySelector("[data-collapsed]")`);
  ok(!(await folded()), "long: the FAB starts with its label");
  const bar = () => p.ev<number>(`return Math.round(document.querySelector('[data-tap="tab:0"]').getBoundingClientRect().bottom)`);
  const before = await bar();
  await p.ev(`document.querySelector('[role="region"]').scrollTop=600`);
  await sleep(500);
  ok((await bar()) === before, "long: what is pinned stays while the body scrolls");
  ok(await folded(), "long: the FAB folds on the way down");
  await p.tap("Below the fold");
  await sleep(200);
  ok(await p.sees("Reached"), "long: what was below the fold works");
  await p.ev(`document.querySelector('[role="region"]').scrollTop=0`);
  await sleep(500);
  ok(!(await folded()), "long: and unfolds on the way back");
}

async function dockFlow(p: Page) {
  await p.reload();
  await p.tap("Dock");
  ok(await p.at("dock"), "dock: reached, with no transition");
  await p.shot("export-shot-dock.png");
  ok((await p.sees("Content one")) && !(await p.sees("Content two")) && !(await p.sees("Content three")), "dock: shows the chosen tab's content only");
  await p.tap("Two");
  await sleep(150);
  ok(!(await p.sees("Content one")) && (await p.sees("Content two")), "dock: a tab brings its content up");
  ok((await p.read('[data-tap="tab:1"]', `e.getAttribute('data-active')`)) === "true", "dock: and lights up");
  await p.tap("Three");
  await sleep(150);
  await p.tap("Content three");
  await sleep(200);
  ok(await p.sees("Pressed three"), "dock: what stands on a tab works");
  ok(await p.sees("Three"), "dock: its bar stays");
}

/* ---------- the runs ---------- */

const FLOWS = [shopFlow, formFlow, counterFlow, inputsFlow, dockFlow, barsFlow, longFlow];

async function driveAll(page: Page, name: string) {
  for (const flow of FLOWS) {
    try {
      await flow(page);
    } catch (e) {
      ok(false, `${flow.name} threw: ${(e as Error).message}`);
    }
  }
  ok(!page.errors.length, `${name}: nothing went wrong on the page${page.errors.length ? `:\n  ${[...new Set(page.errors)].slice(0, 30).join("\n  ")}` : ""}`);
}

async function proof() {
  const { doc, widths } = proofDoc();
  const dist = await assemble("proof", doc, widths);
  if (!dist) return;
  const server = await serve(dist, 4190);
  const page = await edgeAt("proof", "http://127.0.0.1:4190/");
  try {
    await driveAll(page, "the build");
  } finally {
    await page.close();
    server.close();
  }
  /* the same taps under the dev server, whose React says what a production build keeps quiet about */
  await underDev(join(WORK, "proof"), 4193, "dev", (dev) => driveAll(dev, "the dev server"));
}

/** a page on the project's own dev server */
async function underDev(dir: string, port: number, name: string, drive: (page: Page) => Promise<void>) {
  const dev = spawn("bun", ["run", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: dir, shell: process.platform === "win32", stdio: "ignore", env: { ...process.env, CI: "1" } });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try {
        up = (await fetch(`http://127.0.0.1:${port}/`)).ok;
      } catch {
        // not yet
      }
      if (!up) await sleep(500);
    }
    ok(up, `${name}: the dev server comes up`);
    if (!up) return;
    const page = await edgeAt(name, `http://127.0.0.1:${port}/`);
    try {
      await drive(page);
    } finally {
      await page.close();
    }
  } finally {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"]);
    else dev.kill();
  }
}

/** one screen on its own: the taps that left it go nowhere, the rest still run */
async function oneScreen() {
  /* and the least there can be: one button that does nothing, so no variable and no part the runtime knows of */
  const bare: Doc = { groups: [{ id: "g", x: 16, y: 16, axis: "x", items: [{ ...makeItem("button"), id: "b", props: { label: "Nothing" } }] }], frames: [{ id: "f", name: "Only", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "Bare", brief: "" };
  await assemble("bare", bare, {});
  const { doc, widths } = proofDoc();
  const dist = await assemble("one", doc, widths, { onlyFrameId: COUNTER });
  if (!dist) return;
  const server = await serve(dist, 4191);
  const page = await edgeAt("one", "http://127.0.0.1:4191/");
  try {
    await page.reload();
    ok((await page.screen()) === "counter", "one screen: starts on it");
    await page.tap("Add");
    await sleep(100);
    ok(await page.sees("1"), "one screen: its taps run");
    ok(!page.errors.length, `one screen: nothing went wrong on the page${page.errors.length ? `:\n  ${[...new Set(page.errors)].join("\n  ")}` : ""}`);
  } finally {
    await page.close();
    server.close();
  }
}

/** every part there is, on one long screen: all of it has to compile and draw */
async function allParts() {
  const dist = await assemble("parts", allPartsDoc(), {});
  if (!dist) return;
  const server = await serve(dist, 4192);
  const page = await edgeAt("parts", "http://127.0.0.1:4192/");
  try {
    await page.reload();
    const drawn = await page.ev<number>(`return document.querySelectorAll('[data-screen] *').length`);
    ok(drawn > 2000, `all parts: drawn (${drawn} elements)`);
    await page.shot("export-shot-parts.png");
    ok(!page.errors.length, `all parts: nothing went wrong on the page${page.errors.length ? `:\n  ${[...new Set(page.errors)].slice(0, 20).join("\n  ")}` : ""}`);
  } finally {
    await page.close();
    server.close();
  }
}

/** every kind of part that a tap moves or an effect opens */
async function sweep() {
  const { doc, widths, pickers, overlays } = sweepDoc();
  const dist = await assemble("sweep", doc, widths);
  if (!dist) return;
  const dir = join(WORK, "sweep");
  const drive = async (page: Page) => {
    await page.reload();
    for (const slug of pickers) {
      const row = '[data-tap="tab:1"]';
      const there = await page.ev<boolean>(`return !!document.querySelector(${JSON.stringify(row)})`);
      if (there) {
        const was = await page.ev<string>(`return document.querySelector('[data-screen]').innerHTML`);
        await page.tapOn(row);
        await sleep(350);
        const now = await page.ev<string>(`return document.querySelector('[data-screen]').innerHTML`);
        ok(was !== now, `pick ${slug}: a tap moves it`);
      } else ok(false, `pick ${slug}: has a second row to tap`);
      await page.tap("Next");
      await sleep(250);
    }
    for (const slug of overlays) {
      const opened = `document.querySelector('[data-screen] [data-slot$="-content"],[data-screen] [data-slot$="-popup"],[data-screen] [role="dialog"],[data-screen] [role="alertdialog"],[data-screen] [data-slot$="-sheet"]')`;
      const shut = await page.ev<boolean>(`return !${opened}`);
      ok(shut, `overlay ${slug}: starts closed`);
      await page.tap("Open it");
      ok(await page.waitFor(opened, slug), `overlay ${slug}: an effect opens it`);
      await sleep(350);
      await page.shot(`export-shot-${slug}.png`);
      /* its own close button, where it has one; Escape is what the rest answer to */
      const closer = '[data-screen] [data-slot$="-close"]';
      if (await page.ev<boolean>(`return !!document.querySelector(${JSON.stringify(closer)})`)) await page.tapOn(closer);
      else await page.key("Escape", "Escape", 27);
      await sleep(450);
      /* a plain panel with no close button of its own stays up until the next screen, as in the preview */
      if (partBySlug(slug)?.open) ok(await page.ev<boolean>(`return !${opened}`), `overlay ${slug}: closes again`);
      await page.tap("Next");
      await sleep(250);
    }
  };
  const server = await serve(dist, 4194);
  const page = await edgeAt("sweep", "http://127.0.0.1:4194/");
  try {
    await drive(page);
    ok(!page.errors.length, `sweep, the build: nothing went wrong on the page${page.errors.length ? `:\n  ${[...new Set(page.errors)].slice(0, 30).join("\n  ")}` : ""}`);
  } finally {
    await page.close();
    server.close();
  }
  await underDev(dir, 4195, "sweep-dev", async (dev) => {
    await drive(dev);
    ok(!dev.errors.length, `sweep, the dev server: nothing went wrong on the page${dev.errors.length ? `:\n  ${[...new Set(dev.errors)].slice(0, 30).join("\n  ")}` : ""}`);
  });
}

/** a zip the editor's own button saved goes the same way as one made here */
async function savedZip(path: string) {
  const dir = join(WORK, "saved");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const dist = installAndBuild("saved", dir, new Uint8Array(await readFile(path)));
  if (!dist) return;
  const server = await serve(dist, 4196);
  const page = await edgeAt("saved", "http://127.0.0.1:4196/");
  try {
    await driveAll(page, "the zip from the editor");
  } finally {
    await page.close();
    server.close();
  }
}

if (ONLY?.endsWith(".zip")) await savedZip(ONLY);
if (ONLY === "sweep") await sweep();
if (!ONLY || ONLY === "proof") await proof();
if (!ONLY || ONLY === "one") await oneScreen();
if (!ONLY || ONLY === "parts") await allParts();
if (!ONLY) await sweep();

console.log(`\n${passes} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
