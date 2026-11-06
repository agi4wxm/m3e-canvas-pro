/* Exporting: the download dialog's choice between the prototype project and the whole product (a monorepo), the product
 * as a zip with its manifest, and the product written into a folder on this computer (the browser's own private file
 * system stands in for the picker) and exported again into it after a seeded file and a generated file were edited
 * there: the seeded one is left as it is, the generated one is reported as a conflict with its new version beside it. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { check, equal, settle, type E2ETest, type Page } from "./lib";

const FOLDER = "export-e2e";

async function openDialog(page: Page) {
  await page.locator("button").filter({ hasText: "Ask an AI" }).first().click();
  await settle(page, 500);
  await page.waitForSelector("[data-download-project]", { timeout: 10_000 });
}

/** a file of the private file system's export folder, as text, or null */
const opfsText = (page: Page, path: string) =>
  page.evaluate(
    async ({ folder, path }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
      const pieces = path.split("/");
      try {
        for (const name of pieces.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
        return await (await (await dir.getFileHandle(pieces[pieces.length - 1])).getFile()).text();
      } catch {
        return null;
      }
    },
    { folder: FOLDER, path },
  );

const opfsWrite = (page: Page, path: string, text: string) =>
  page.evaluate(
    async ({ folder, path, text }) => {
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
      const pieces = path.split("/");
      for (const name of pieces.slice(0, -1)) dir = await dir.getDirectoryHandle(name);
      const out = await (await dir.getFileHandle(pieces[pieces.length - 1])).createWritable();
      await out.write(text);
      await out.close();
    },
    { folder: FOLDER, path, text },
  );

/** waits for the report of an export into the folder, or for what went wrong */
async function reported(page: Page): Promise<string> {
  await page.waitForSelector("[data-export-report], [data-download-project] [role=status]", { timeout: 120_000 });
  return (await page.locator("[data-download-project]").first().textContent()) ?? "";
}

export const tests: E2ETest[] = [
  {
    name: "export: the dialog offers the prototype and the whole product, and the product downloads as a monorepo zip",
    async run({ page, out }) {
      await openDialog(page);
      const choices = page.locator("[data-export-choice]");
      equal(await choices.count(), 2, "two kinds of export");
      equal(await page.locator('[data-export-choice="prototype"]').first().getAttribute("aria-checked"), "true", "the prototype is chosen at first");
      check(await page.locator('button[title="Save a project you can install and run, as a zip"]').first().isVisible(), "the prototype's download is there");
      check((await page.locator('[data-export-choice="product"]').first().textContent())?.includes("Whole product (monorepo)"), "the product is offered by name");

      await page.locator('[data-export-choice="product"]').first().click();
      await settle(page, 300);
      equal(await page.locator('[data-export-choice="product"]').first().getAttribute("aria-checked"), "true", "the product chosen");
      check(!(await page.locator('button[title="Save a project you can install and run, as a zip"]').count()), "the prototype's download gives way to the product's");
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-export-zip]").first().click()]);
      check(download.suggestedFilename().endsWith("-product.zip"), `the product's zip (${download.suggestedFilename()})`);
      const file = join(out, "export-product.zip");
      await download.saveAs(file);
      const zip = unzipSync(new Uint8Array(await readFile(file)));
      for (const path of [".m3e/manifest.json", "package.json", "apps/web/package.json", "apps/web/src/generated/App.tsx", "packages/api/openapi.yaml", "server/src/app.ts", "AGENTS.md"]) check(zip[path], `the zip holds ${path}`);
      const manifest = JSON.parse(strFromU8(zip[".m3e/manifest.json"])) as { files: Record<string, { kind: string }> };
      equal(manifest.files["apps/web/src/custom/setup.ts"]?.kind, "seeded", "the manifest says what is custom");
      equal(Object.keys(manifest.files).length, Object.keys(zip).length - 1, "and lists every other file");
    },
  },
  {
    name: "export: the product into a folder, then again: custom code kept, an edited generated file reported with its .m3e-new",
    async run({ page }) {
      /* the picker answers with a folder of the browser's own private file system, empty at first */
      await page.evaluate(async (folder) => {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(folder, { recursive: true }).catch(() => {});
        (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => root.getDirectoryHandle(folder, { create: true });
      }, FOLDER);
      await openDialog(page);
      await page.locator('[data-export-choice="product"]').first().click();
      await settle(page, 300);
      await page.locator("[data-export-folder]").first().click();
      const first = await reported(page);
      check(first.includes(`Exported to ${FOLDER}`), `the first export's report (${first.slice(0, 300)})`);
      check(!(await page.locator("[data-export-conflicts]").count()), "a first export has no conflicts");
      const seeded = "apps/web/src/custom/setup.ts";
      const generated = "apps/web/src/generated/routes.ts";
      const routes = await opfsText(page, generated);
      check(routes?.includes("export const ROUTES"), "the generated files are in the folder");
      check((await opfsText(page, ".m3e/manifest.json"))?.includes('"apps/web/src/custom/setup.ts"'), "with the manifest");

      /* someone writes custom code, and edits a generated file */
      await opfsWrite(page, seeded, "// custom code: the app's setup\nexport async function setup(): Promise<void> {}\n");
      await opfsWrite(page, generated, `${routes}// edited by hand\n`);

      /* the dialog remembers the folder: exported again into it */
      await page.keyboard.press("Escape");
      await settle(page, 400);
      await openDialog(page);
      await page.locator('[data-export-choice="product"]').first().click();
      await page.waitForSelector("[data-export-again]", { timeout: 10_000 });
      check((await page.locator("[data-export-again]").first().textContent())?.includes(`Export again to ${FOLDER}`), "the folder is offered again");
      await page.locator("[data-export-again]").first().click();
      await page.waitForSelector("[data-export-conflicts]", { timeout: 120_000 });
      check(await page.locator(`[data-export-conflict="${generated}"]`).count(), "the edited generated file is reported");
      equal(await page.locator("[data-export-conflict]").count(), 1, "and only it");
      check((await opfsText(page, seeded))?.includes("// custom code: the app's setup"), "the seeded file is left as it was");
      check((await opfsText(page, generated))?.includes("// edited by hand"), "the edited generated file is not overwritten");
      equal(await opfsText(page, `${generated}.m3e-new`), routes, "its new version is beside it as .m3e-new");
      check((await page.locator("[data-export-summary]").first().textContent())?.includes("0 written"), "nothing else needed writing");
    },
  },
];
