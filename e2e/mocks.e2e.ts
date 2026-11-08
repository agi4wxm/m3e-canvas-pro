/* The Mocks tab and the preview's mocks, through the editor's own controls: a real OpenAPI file opened in the API tab,
 * the mocks filled from it in one step (one undo), a product's record edited and so pinned, a picture uploaded to the
 * library and chosen for the users' avatars (the records show it), and in the preview the same endpoint answered with
 * data, then empty in the new-user scenario, then not at all in the network-error one. Screenshots of each in
 * e2e/.out (mocks-*.png). */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { check, equal, leftTab, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

type Mocks = { scenarios?: { id: string; name: string }[]; models?: { name: string; fixtures?: Record<string, unknown>[]; hints?: Record<string, { kind: string; files?: string[] }> }[]; files?: { id: string; name: string; type: string; data: string }[] };
const mocksOf = async (page: Page) => ((await savedDoc(page)) as unknown as { mocks?: Mocks }).mocks;

/** one of the panel's selects, by its label and the words of the option, inside a part of the panel */
async function pickIn(page: Page, scope: string, label: string, option: string) {
  await page.locator(`${scope} button[aria-haspopup="listbox"][aria-label="${label}"]`).first().click();
  await settle(page, 250);
  /* the option whose words are exactly these, its icons aside (NewProduct is not Product) */
  await page.evaluate((want: string) => {
    const words = (o: Element) => {
      const c = o.cloneNode(true) as Element;
      c.querySelectorAll(".msr").forEach((x) => x.remove());
      return (c.textContent ?? "").trim();
    };
    const opts = [...document.querySelectorAll('[role="listbox"] [role="option"]')] as HTMLElement[];
    (opts.find((o) => words(o) === want) ?? opts.find((o) => words(o).includes(want)))?.click();
  }, option);
  await settle(page, 500);
}

/** a small PNG of one color, made here so the test needs no picture of its own */
function png(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** the preview log's entries, newest first: their status */
const statuses = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[data-preview-log-entry]")].map((e) => Number(e.getAttribute("data-status"))));

/** tries listProducts from the preview's log and waits for its answer */
async function tryList(page: Page): Promise<{ status: number; text: string }> {
  const before = (await statuses(page)).length;
  await page.locator("[data-preview-try]").first().click();
  for (let i = 0; i < 50 && (await statuses(page)).length <= before; i++) await settle(page, 200);
  await settle(page, 300);
  const text = await page.evaluate(() => (document.querySelector("[data-preview-log-entry]") as HTMLElement | null)?.innerText ?? "");
  return { status: (await statuses(page))[0], text };
}

async function scenario(page: Page, id: string) {
  await page.locator("[data-preview-scenario-button]").first().click();
  await settle(page, 300);
  await page.locator(`[data-preview-scenario="${id}"]`).first().click();
  await settle(page, 400);
}

export const tests: E2ETest[] = [
  {
    name: "mocks: filled from the API, a record edited and pinned, a mock file in an image field, the preview from data to empty to an error",
    async run({ page, out }) {
      /* the shop's OpenAPI, opened in the API tab */
      await leftTab(page, "API");
      await page.waitForSelector("[data-api-panel]");
      await page.locator('[data-api-panel] [role="radio"]').nth(3).click();
      await settle(page, 300);
      const spec = join(out, "shop.openapi.yaml");
      writeFileSync(spec, readFileSync(new URL("../lib/api/fixtures/shop.openapi.yaml", import.meta.url), "utf8"));
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-api-add="open-file"]').first().click()]);
      await chooser.setFiles(spec);
      await page.waitForSelector("[data-api-report]");
      await settle(page, 500);

      /* the Mocks tab: filled in one step, one undo */
      await leftTab(page, "Mocks");
      await page.waitForSelector("[data-mocks-panel]");
      await page.screenshot({ path: join(out, "mocks-1-empty.png") });
      await page.locator("[data-mocks-fill]").first().click();
      await settle(page, 600);
      let mocks = await mocksOf(page);
      equal(mocks?.scenarios?.map((s) => s.id), ["new-user", "lots", "network-error", "slow", "signed-out"], "the five scenarios are added");
      check(mocks?.models?.find((m) => m.name === "User")?.hints?.email?.kind === "email", "the hints are written down");
      await undo(page);
      equal(await mocksOf(page), undefined, "one undo takes all of it back");
      await page.locator("[data-mocks-fill]").first().click();
      await settle(page, 600);
      /* the preview starts in the new user's scenario; its settings open */
      await page.locator('[data-mocks-scenario="new-user"] button').nth(0).click();
      await settle(page, 400);
      await page.locator('[data-mocks-scenario="new-user"] button').nth(1).click();
      await settle(page, 400);
      equal(((await savedDoc(page)) as unknown as { mocks?: { scenario?: string } }).mocks?.scenario, "new-user", "the preview's scenario is chosen");
      await page.screenshot({ path: join(out, "mocks-2-scenarios.png") });

      /* the records of a model, one edited: it is pinned */
      await page.locator('[data-mocks-panel] [role="radio"]').nth(1).click();
      await settle(page, 400);
      await pickIn(page, "[data-mocks-panel]", "Model", "Product");
      await page.waitForSelector('[data-mocks-records="Product"]');
      await page.locator('[data-mocks-record-cell="0:name"]').first().click();
      const input = page.locator('[data-mocks-record-input="0:name"]').first();
      await input.fill("Desk lamp from the e2e");
      await input.press("Enter");
      await settle(page, 600);
      mocks = await mocksOf(page);
      equal(mocks?.models?.find((m) => m.name === "Product")?.fixtures?.map((r) => r.name), ["Desk lamp from the e2e"], "the edited record is pinned");
      check((await page.locator('[data-mocks-record="0"][data-pinned]').count()) === 1, "and shown pinned at the top");
      await page.screenshot({ path: join(out, "mocks-3-records.png") });

      /* a picture uploaded to the library */
      await page.locator('[data-mocks-panel] [role="radio"]').nth(2).click();
      await settle(page, 300);
      const picture = join(out, "face.png");
      writeFileSync(picture, png(48, 48, [64, 140, 220]));
      const [files] = await Promise.all([page.waitForEvent("filechooser"), page.locator("[data-mocks-upload]").first().click()]);
      await files.setFiles(picture);
      await page.waitForSelector('[data-mocks-file="face"]');
      await settle(page, 400);
      mocks = await mocksOf(page);
      const face = mocks?.files?.find((f) => f.id === "face");
      check(face && face.type === "image/png" && face.data.startsWith("data:image/png;base64,"), "the picture is kept in the mock library");
      await page.locator("[data-mocks-placeholders]").first().click();
      await settle(page, 500);
      equal((await mocksOf(page))?.files?.map((f) => f.type), ["image/png", "image/svg+xml", "application/pdf", "audio/wav", "video/mp4", "application/octet-stream"], "and placeholders of every kind");
      await page.screenshot({ path: join(out, "mocks-4-files.png") });

      /* files of other formats, made in the panel: Chromium decodes the pictures and plays the sounds, the previews
         show a table, a deck's words, an archive's files and a 3D model */
      const formats = ["xlsx", "pptx", "zip", "glb", "jpg", "webp", "gif", "avif", "ico", "bmp", "mp3", "ogg", "webm"];
      for (const ext of formats) {
        const before = (await mocksOf(page))?.files?.length ?? 0;
        await pickIn(page, "[data-mocks-panel]", "Make this format", `${ext.toUpperCase()} ·`);
        await page.locator("[data-mocks-make-format]").first().click();
        for (let i = 0; i < 40 && ((await mocksOf(page))?.files?.length ?? 0) <= before; i++) await settle(page, 150);
      }
      mocks = await mocksOf(page);
      const made = (mocks?.files ?? []).slice(-formats.length);
      equal(made.map((f) => f.name.split(".").pop()), formats, "a file of each format chosen");
      const idOf = (ext: string) => made.find((f) => f.name.endsWith(`.${ext}`))!.id;
      await page.waitForSelector(`[data-mocks-file="${idOf("xlsx")}"] [data-mocks-preview-table]`, { timeout: 15_000 });
      await settle(page, 1200);
      const decoded = await page.evaluate(
        (ids: string[]) =>
          ids.map((id) => {
            const img = document.querySelector(`[data-mocks-file="${id}"] img`) as HTMLImageElement | null;
            return img ? img.complete && img.naturalWidth > 0 : false;
          }),
        ["jpg", "webp", "gif", "avif", "ico", "bmp"].map(idOf),
      );
      equal(decoded, [true, true, true, true, true, true], "Chromium decodes the JPEG, WebP, GIF, AVIF, ICO and BMP");
      const played = await page.evaluate(
        async (srcs: string[]) =>
          Promise.all(
            srcs.map(
              (src) =>
                new Promise<number>((done) => {
                  const a = document.createElement("audio");
                  a.onloadedmetadata = () => done(a.duration);
                  a.onerror = () => done(-1);
                  a.src = src;
                }),
            ),
          ),
        ["mp3", "ogg", "webm"].map((ext) => made.find((f) => f.name.endsWith(`.${ext}`))!.data),
      );
      check(played.every((d) => d > 0.5), `Chromium plays the MP3, the Ogg and the WebM (${played.join(", ")})`);
      const meshInk = await page.evaluate((id: string) => {
        const c = document.querySelector(`[data-mocks-file="${id}"] [data-mocks-mesh-canvas]`) as HTMLCanvasElement | null;
        if (!c) return 0;
        const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        const bg = [d[0], d[1], d[2]];
        let ink = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) ink++;
        return ink / (c.width * c.height);
      }, idOf("glb"));
      check(meshInk > 0.05, `the 3D model is drawn (${(meshInk * 100).toFixed(1)}% of its preview)`);
      const facts = await page.evaluate((ids: string[]) => ids.map((id) => document.querySelector(`[data-mocks-file="${id}"] [data-mocks-file-facts]`)?.textContent ?? ""), [idOf("xlsx"), idOf("pptx"), idOf("zip"), idOf("glb")]);
      check(/rows/.test(facts[0]) && /slides/.test(facts[1]) && /4 files/.test(facts[2]) && /vertices/.test(facts[3]), `each card says what its file holds (${facts.join(" | ")})`);
      await page.evaluate((id: string) => document.querySelector(`[data-mocks-file="${id}"]`)?.scrollIntoView({ block: "start" }), idOf("xlsx"));
      await page.screenshot({ path: join(out, "mocks-4b-formats.png") });
      /* a file's preview, larger, in a dialog that Escape closes */
      await page.locator(`[data-mocks-file="${idOf("xlsx")}"] [data-mocks-file-thumb]`).first().click();
      await page.waitForSelector(`[data-mocks-preview="${idOf("xlsx")}"] [data-mocks-preview-table] tbody tr`);
      check((await page.locator(`[data-mocks-preview="${idOf("xlsx")}"] [data-mocks-preview-table] tbody tr`).count()) >= 2, "the preview shows the workbook's rows");
      await page.screenshot({ path: join(out, "mocks-4c-preview.png") });
      await page.keyboard.press("Escape");
      await settle(page, 300);
      check((await page.locator("[data-mocks-preview]").count()) === 0, "Escape closes the preview");
      await page.locator(`[data-mocks-file="${idOf("glb")}"] [data-mocks-file-thumb]`).first().click();
      await page.waitForSelector(`[data-mocks-preview="${idOf("glb")}"] [data-mocks-mesh-canvas]`);
      await settle(page, 400);
      await page.screenshot({ path: join(out, "mocks-4d-model.png") });
      await page.locator("[data-mocks-preview-close]").first().click();
      await settle(page, 300);

      /* the users' avatars drawn from it */
      await page.locator('[data-mocks-panel] [role="radio"]').nth(1).click();
      await settle(page, 300);
      await pickIn(page, "[data-mocks-panel]", "Model", "User");
      await page.locator("[data-mocks-panel] button[aria-expanded]").filter({ hasText: "How fields are made" }).first().click();
      await settle(page, 300);
      await pickIn(page, '[data-mocks-hint="avatar"]', "Files to use", "face.png");
      mocks = await mocksOf(page);
      equal(mocks?.models?.find((m) => m.name === "User")?.hints?.avatar?.files, ["face"], "the avatar field uses the file");
      const srcs = await page.evaluate(() => [...document.querySelectorAll('[data-mocks-records="User"] img[data-mocks-image]')].map((i) => (i as HTMLImageElement).src));
      check(srcs.length > 0 && srcs.every((s) => s === face!.data), `the records show the file in the image field (${srcs.length})`);
      await page.screenshot({ path: join(out, "mocks-5-avatar.png") });

      /* the preview: the same endpoint with data, then empty, then no answer */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("p");
      await page.waitForSelector("[data-preview-log-button]", { timeout: 15_000 });
      await settle(page, 800);
      equal(await page.locator("[data-preview-scenario-button]").first().getAttribute("data-preview-scenario-button"), "new-user", "the preview starts in the document's scenario");
      await scenario(page, "");
      await page.locator("[data-preview-log-button]").first().click();
      await settle(page, 300);
      await page.evaluate(() => {
        const s = document.querySelector("[data-preview-try-op]") as HTMLSelectElement;
        s.value = "listProducts";
        s.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await settle(page, 200);
      let answer = await tryList(page);
      equal(answer.status, 200, "listProducts answers");
      check(/items\[20\]/.test(answer.text) && /1–20 \/ 24/.test(answer.text), `with a page of the products (${answer.text})`);
      await page.screenshot({ path: join(out, "mocks-6-preview-data.png") });
      await scenario(page, "new-user");
      answer = await tryList(page);
      equal(answer.status, 200, "a new user's list answers");
      check(/items\[0\]/.test(answer.text), `empty (${answer.text})`);
      await page.screenshot({ path: join(out, "mocks-7-preview-empty.png") });
      await scenario(page, "network-error");
      answer = await tryList(page);
      equal(answer.status, 0, "the network error answers nothing");
      await page.screenshot({ path: join(out, "mocks-8-preview-error.png") });
      await page.keyboard.press("Escape");
      await settle(page, 600);
      await leftTab(page, "Parts");
    },
  },
];
