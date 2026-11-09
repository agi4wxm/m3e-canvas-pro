/* A Material Pro pack (docs/m3e-material.md) in the editor: a hostile pack refused with nothing kept, a sample pack
 * added to the library from the project menu, a part's fill turned into its material as it is and tinted by a role,
 * drawn on the canvas from the page's one sheet of pictures, and the import one undo step. */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { check, equal, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

/** a small seamless tile as a PNG data URL: rows of bricks, or their relief in grey */
function tile(relief: boolean): string {
  const S = 32;
  const raw = Buffer.alloc(S * (S * 3 + 1));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const mortar = y % 8 < 1 || (x + (Math.floor(y / 8) % 2) * 8) % 16 < 1;
      const c = relief ? (mortar ? [90, 90, 90] : y % 8 < 3 ? [160, 160, 160] : [128, 128, 128]) : mortar ? [200, 190, 180] : [150, 60, 45];
      raw.set(c, y * (S * 3 + 1) + 1 + x * 3);
    }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type), body]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(typed));
    return Buffer.concat([len, typed, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(S, 0);
  head.writeUInt32BE(S, 4);
  head[8] = 8;
  head[9] = 2;
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64")}`;
}

const pack = (materials: unknown[]) => JSON.stringify({ format: "m3e-material", version: 1, generator: { name: "Material Pro", version: "0.1.0" }, materials });
const BRICKS = { id: "bricks", name: "Bricks", tile: 32, resolution: 32, light: { azimuth: 315, elevation: 45 }, maps: { surface: tile(false), shading: tile(true) }, swatch: { average: "#8a3d2e", palette: ["#963c2d", "#c8beb4"], lightness: 35 } };
const HOSTILE = { ...BRICKS, id: "evil", maps: { surface: `${BRICKS.maps.surface}"),url(https://evil.example/x`, shading: "data:image/svg+xml;base64,PHN2Zz4=" } };

async function importPack(page: Page, file: string) {
  await page.locator('button[title="Project"]').first().click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[role="menuitem"]').filter({ hasText: "Import materials" }).first().click()]);
  await chooser.setFiles(file);
  await settle(page, 900);
}

/** the style of the node on the canvas that a material layer paints, as the browser computed it */
const painted = (page: Page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-screen] [data-node] *")].find((e) => e.getAttribute("style")?.includes("--m3e-mat-")) as HTMLElement | undefined;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { inline: el.getAttribute("style") ?? "", image: cs.backgroundImage, size: cs.backgroundSize, blend: cs.backgroundBlendMode };
  });

export const tests: E2ETest[] = [
  {
    name: "materials: a pack is added to the library, a part wears its material as it is and tinted, and the import undoes",
    async run({ page, out }) {
      const hostile = join(out, "hostile.m3e-material.json");
      writeFileSync(hostile, pack([HOSTILE]));
      await importPack(page, hostile);
      check(!(await savedDoc(page)).hasOwnProperty("materials"), "a hostile pack leaves the library empty");
      check(!(await page.evaluate(() => document.getElementById("m3e-materials"))), "and puts no sheet on the page");

      const sample = join(out, "sample.m3e-material.json");
      writeFileSync(sample, pack([BRICKS]));
      await importPack(page, sample);
      const doc = (await savedDoc(page)) as unknown as { materials?: { id: string }[] };
      equal(doc.materials?.map((m) => m.id), ["bricks"], "the sample pack is in the library");
      const sheet = await page.evaluate(() => document.getElementById("m3e-materials")?.textContent ?? "");
      check(sheet.includes("--m3e-mat-bricks-surface:url(\"data:image/png;base64,") && !sheet.includes("evil"), "the page's sheet holds the material's pictures");

      /* a list row of the starter sketch, its fill made a material */
      await page.locator("[data-screen] [data-node]").nth(2).click();
      await settle(page, 400);
      await page.locator('[title="Add a fill"]').first().click();
      await settle(page, 300);
      await page.locator("button[aria-expanded]").filter({ hasText: "Linear" }).first().click();
      await settle(page, 300);
      await page.locator("button").filter({ hasText: /^Material$/ }).first().click();
      await settle(page, 600);
      const surface = await painted(page);
      check(surface && surface.image.includes("data:image/png;base64,") && surface.size.startsWith("32px 32px"), `the part is tiled with the surface: ${JSON.stringify(surface)?.slice(0, 300)}`);
      check(!surface!.inline.includes("base64"), "the part's own style carries no picture");

      await page.locator("button").filter({ hasText: /^Tinted$/ }).first().click();
      await settle(page, 600);
      const tinted = await painted(page);
      check(tinted && tinted.blend.startsWith("overlay") && tinted.inline.includes("var(--md-sys-color-primary)"), `tinted: the relief over the theme's primary: ${JSON.stringify(tinted)?.slice(0, 300)}`);
      await page.screenshot({ path: join(out, "materials-tinted.png") });

      /* the layer and the import are steps: taken back, the library is empty again and the part draws no material */
      for (let i = 0; i < 4 && ((await savedDoc(page)) as { materials?: unknown }).materials; i++) await undo(page);
      check(!((await savedDoc(page)) as { materials?: unknown }).materials, "undo takes the import back");
      check(!(await painted(page)), "and the part draws no material");
    },
  },
];
