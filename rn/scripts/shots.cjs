/* Photographs the kit's gallery (the web build in dist/web) beside the editor's own gallery, part by part, under the styles
 * the kit is checked in, and lays each pair side by side on one sheet per style.
 *
 *   node scripts/shots.cjs --web http://localhost:3000 --out shots [--port 4870] [--parts button,switch]
 *
 * The editor must be running (`bun run dev` in the repo root); this script serves dist/web itself. Playwright comes from
 * wherever `require` finds it (NODE_PATH), as in the editor's own scripts. Each sheet is shots/compare-<style>.png. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const WEB = arg("web", "http://localhost:3000");
const OUT = path.resolve(arg("out", "shots"));
const PORT = Number(arg("port", "4870"));
const DIST = path.resolve(__dirname, "..", "dist", "web");
/* the editor's gallery calls Material "android" and leaves the key out */
const STYLES = [
  ["material", ""],
  ["ios", "ios"],
  ["wechat", "wechat"],
  ["spotify", "spotify"],
];
const PARTS = arg(
  "parts",
  "box,text,icon,svg,image,separator,spacer,button,icon-button,input,textarea,switch,checkbox,radio,slider,chip,badge,avatar,progress,circular-progress,spinner,dot,label,toggle,skeleton,kbd,shape,rating,link,page-dots,loading-indicator,typing-indicator,app-bar,navigation-bar,item,card,text-field,search,tabs,dialog,alert-dialog,sheet,action-sheet,sonner,fab,toggle-group,button-group,dropdown-menu,select,date-picker,time-picker,carousel,alert",
);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf" };
function serve() {
  return http
    .createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      let file = path.join(DIST, url);
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    })
    .listen(PORT);
}

(async () => {
  const server = serve();
  const browser = await chromium.launch();
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, key] of STYLES) {
    const webDir = path.join(OUT, name, "web");
    const rnDir = path.join(OUT, name, "rn");
    fs.mkdirSync(webDir, { recursive: true });
    fs.mkdirSync(rnDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${WEB}/gallery?part=${PARTS}&lang=en${key ? `&style=${key}` : ""}`);
    await page.waitForSelector("[data-gallery-settled]", { timeout: 90000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `web-${name}.png`), fullPage: true });
    const web = {};
    for (const el of await page.$$("[data-gallery-part]")) {
      const slug = await el.getAttribute("data-gallery-part");
      const sample = await el.getAttribute("data-gallery-sample");
      const id = `${slug}${sample ? `-${sample}` : ""}`;
      const fig = (await el.evaluateHandle((n) => n.closest("figure"))).asElement();
      const file = path.join(webDir, `${id}.png`);
      await fig.screenshot({ path: file }).catch(() => {});
      if (fs.existsSync(file)) web[id] = file;
    }
    await page.goto(`http://localhost:${PORT}/?style=${name}&part=${PARTS}&kits=0`);
    await page.waitForSelector('[data-testid="coverage"]', { timeout: 90000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `rn-${name}.png`), fullPage: true });
    const rn = {};
    for (const el of await page.$$('[data-testid^="cell-"]')) {
      const id = (await el.getAttribute("data-testid")).slice("cell-".length);
      const file = path.join(rnDir, `${id}.png`);
      await el.screenshot({ path: file }).catch(() => {});
      if (fs.existsSync(file)) rn[id] = file;
    }
    /* one sheet: the editor's cell on the left, the kit's on the right */
    const rows = Object.keys(web)
      .filter((id) => rn[id])
      .map((id) => `<tr><td class="id">${id}</td><td><img src="file://${web[id]}"></td><td><img src="file://${rn[id]}"></td></tr>`)
      .join("");
    const sheet = path.join(OUT, `compare-${name}.html`);
    fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>body{font:12px system-ui;margin:16px}td{vertical-align:top;padding:6px;border-bottom:1px solid #ddd}.id{font-family:monospace;width:150px}th{text-align:left}</style><h3>${name}: editor (left) · React Native kit (right)</h3><table><tr><th>part</th><th>web</th><th>rn</th></tr>${rows}</table>`);
    await page.goto(`file://${sheet}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `compare-${name}.png`), fullPage: true });
    await page.close();
    console.log(`${name}: ${Object.keys(rn).length} kit cells, ${Object.keys(web).length} editor cells`);
  }
  await browser.close();
  server.close();
})();
