/* Photographs the kit's gallery (the H5 build in dist/h5) beside the editor's own gallery, part by part, under the styles
 * the kit is checked in, and lays each pair side by side on one sheet per style.
 *
 *   npm run build:h5 && node scripts/shots.cjs --web http://localhost:3000 --out shots [--port 4880] [--parts button,switch]
 *
 * The editor must be running (`bun run dev` in the repo root); this script serves dist/h5 itself. Playwright comes from
 * wherever `require` finds it (NODE_PATH or PLAYWRIGHT_PATH). Each sheet is shots/compare-<style>.png, the editor's cell
 * on the left and the mini-program kit's on the right, both at one CSS pixel per pixel. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const WEB = arg("web", "http://localhost:3000");
const OUT = path.resolve(arg("out", "shots"));
const PORT = Number(arg("port", "4880"));
const DIST = path.resolve(__dirname, "..", "dist", "h5");
/* the editor's gallery calls Material "android" and leaves the key out */
const STYLES = [
  ["material", ""],
  ["ios", "ios"],
  ["wechat", "wechat"],
  ["spotify", "spotify"],
];
const PARTS = arg(
  "parts",
  "box,text,icon,svg,image,separator,button,icon-button,input,textarea,switch,checkbox,radio,slider,chip,badge,avatar,progress,circular-progress,spinner,dot,label,toggle,skeleton,kbd,shape,rating,link,page-dots,loading-indicator,typing-indicator,app-bar,mini-program-header,navigation-bar,item,card,text-field,search,tabs,dialog,alert-dialog,sheet,action-sheet,sonner,fab,toggle-group,dropdown-menu,select,date-picker,time-picker,alert,radio-group,file-upload",
);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
function serve() {
  return http
    .createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(DIST, url);
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    })
    .listen(PORT, "127.0.0.1");
}

(async () => {
  if (!fs.existsSync(path.join(DIST, "index.html"))) throw new Error("no dist/h5: run npm run build:h5 first");
  const server = serve();
  const browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, key] of STYLES) {
    const webDir = path.join(OUT, name, "web");
    const kitDir = path.join(OUT, name, "miniapp");
    fs.mkdirSync(webDir, { recursive: true });
    fs.mkdirSync(kitDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${WEB}/gallery?part=${PARTS}&lang=en${key ? `&style=${key}` : ""}`);
    await page.waitForSelector("[data-gallery-settled]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    const web = {};
    for (const el of await page.$$("[data-gallery-part]")) {
      const slug = await el.getAttribute("data-gallery-part");
      if (web[slug]) continue;
      const fig = (await el.evaluateHandle((n) => n.closest("figure") || n)).asElement();
      const file = path.join(webDir, `${slug}.png`);
      await fig.screenshot({ path: file }).catch(() => {});
      if (fs.existsSync(file)) web[slug] = file;
    }
    await page.close();
    /* the kit at a phone's width, as a mini-program draws it */
    const kit = await browser.newPage({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 1 });
    await kit.goto(`http://127.0.0.1:${PORT}/#/pages/gallery/index?style=${name}&part=${PARTS}`);
    await kit.waitForSelector("[data-cell]", { timeout: 90000 });
    await kit.waitForTimeout(2000);
    const mini = {};
    for (const el of await kit.$$("[data-cell]")) {
      const slug = await el.getAttribute("data-cell");
      const file = path.join(kitDir, `${slug}.png`);
      await el.screenshot({ path: file }).catch(() => {});
      if (fs.existsSync(file)) mini[slug] = file;
    }
    /* one sheet: the editor's cell on the left, the kit's on the right */
    const rows = Object.keys(mini)
      .map((id) => `<tr><td class="id">${id}</td><td>${web[id] ? `<img src="file://${web[id]}">` : "—"}</td><td><img src="file://${mini[id]}"></td></tr>`)
      .join("");
    const sheet = path.join(OUT, `compare-${name}.html`);
    fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>body{font:12px system-ui;margin:16px}td{vertical-align:top;padding:6px;border-bottom:1px solid #ddd}.id{font-family:monospace;width:150px}th{text-align:left}img{max-width:560px}</style><h3>${name}: editor (left) · mini-program kit, H5 (right)</h3><table><tr><th>part</th><th>editor</th><th>miniapp</th></tr>${rows}</table>`);
    const out = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await out.goto(`file://${sheet}`);
    await out.waitForTimeout(500);
    await out.screenshot({ path: path.join(OUT, `compare-${name}.png`), fullPage: true });
    await out.close();
    await kit.close();
    console.log(`${name}: ${Object.keys(mini).length} kit cells, ${Object.keys(web).length} editor cells`);
  }
  await browser.close();
  server.close();
})();
