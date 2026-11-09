/* The game loop's gameplay contract (docs/玩法契约.md) in the editor: a file that is no contract refused with nothing
 * kept, the example contract linked from the project menu (its commands the API's game.* operations, its refusals mock
 * scenarios), and the import one undo step. And what a design leans on that the contract does not have (an event the
 * world does not send, a key its snapshot does not have) in the export's report and the product's .m3e/gaps.json. */

import { readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { EXAMPLE_GAME_CONTRACT, linkGame } from "../lib/game";
import type { Doc } from "../lib/tokens";
import { check, equal, savedDoc, settle, undo, type E2ETest, type Page } from "./lib";

const EXAMPLE = readFileSync(new URL("../lib/game/fixtures/example.m3e-game.json", import.meta.url), "utf8");

async function importContract(page: Page, file: string) {
  await page.locator('button[title="Project"]').first().click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[role="menuitem"]').filter({ hasText: "Import game contract" }).first().click()]);
  await chooser.setFiles(file);
  await settle(page, 900);
}

type Saved = { external?: { gameContract?: string }; game?: { contract: { contractVersion: string } }; api?: { endpoints?: { operationId: string }[] }; mocks?: { scenarios?: { id: string }[] } };

export const tests: E2ETest[] = [
  {
    name: "game contract: the game loop's file is linked read-only from the project menu, and the import undoes",
    async run({ page, out }) {
      const wrong = join(out, "wrong.m3e-game.json");
      writeFileSync(wrong, JSON.stringify({ format: "m3e-game", version: 9 }));
      await importContract(page, wrong);
      check(!(await savedDoc(page)).hasOwnProperty("game"), "a file that is no contract links nothing");

      const file = join(out, "contract.m3e-game.json");
      writeFileSync(file, EXAMPLE);
      await importContract(page, file);
      const doc = (await savedDoc(page)) as unknown as Saved;
      equal(doc.game?.contract.contractVersion, "1.0.0", "the contract is linked");
      equal(doc.external?.gameContract, "contract.m3e-game.json", "read beside the project, by its file's name (the project's configuration)");
      equal(doc.api?.endpoints?.map((e) => e.operationId).filter((id) => id.startsWith("game.")), ["game.pull", "game.checkIn"], "its commands are the API's game.* operations");
      equal(doc.mocks?.scenarios?.map((s) => s.id).filter((id) => id.startsWith("game.")), ["game.pull.insufficient-resources", "game.pull.pool-closed", "game.checkIn.cooldown"], "each refusal is a scenario of the mocks");

      await undo(page);
      check(!((await savedDoc(page)) as Saved).game, "undo takes the import back");
    },
  },
  {
    name: "game contract: what the design leans on and the contract lacks is in the export's report and .m3e/gaps.json",
    async run({ page, base, out }) {
      const part = (id: string, component: string, extra: Record<string, unknown>) => ({ id, kind: "component", component, label: "", icon: null, variant: "", props: {}, ...extra });
      const doc = {
        ...linkGame({ title: "Arena", groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT).doc,
        frame: "phone",
        frames: [{ id: "battle", name: "Battle", x: 0, y: 0 }],
        groups: [{ id: "g1", x: 24, y: 80, axis: "y", items: [part("world", "world-view", { label: "World", actions: { "on:dodged": { to: "none" } } }), part("lives", "text", { label: "Lives", props: { text: "Lives {{world.lives}}" } })] }],
      } as unknown as Doc;
      await page.goto(`${base}/#doc=${encodeURIComponent(JSON.stringify(doc))}`, { waitUntil: "load" });
      await page.waitForSelector(".m3e-boot", { state: "detached", timeout: 90_000 });
      await page.waitForSelector('[data-screen="battle"]', { timeout: 30_000 });
      await settle(page, 1000);
      await page.locator("button").filter({ hasText: "Ask an AI" }).first().click();
      await page.waitForSelector("[data-download-project]", { timeout: 10_000 });
      await page.locator('[data-export-choice="product"]').first().click();
      await settle(page, 300);
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-export-zip]").first().click()]);
      const file = join(out, "game-gaps-product.zip");
      await download.saveAs(file);
      const zip = unzipSync(new Uint8Array(await readFile(file)));
      const gaps = JSON.parse(strFromU8(zip[".m3e/gaps.json"])) as { gaps: { kind: string; module: string; ref: string }[] };
      equal(gaps.gaps.map((g) => `${g.kind} ${g.module} ${g.ref}`), ["game-event game-loop event dodged", "game-snapshot game-loop world.lives"], "the gap file lists them for the hub");
      await page.waitForSelector("[data-export-differences]", { timeout: 10_000 });
      const said = (await page.locator("[data-export-differences]").first().textContent()) ?? "";
      check(said.includes("references the game contract lacks 2"), `the report counts them by kind: ${said.slice(0, 300)}`);
      await page.locator("[data-export-differences] summary").first().click();
      await settle(page, 300);
      const listed = (await page.locator("[data-export-differences] ul").first().textContent()) ?? "";
      check(listed.includes("Battle · Lives: text: reads world.lives, which the game's snapshot has no place for"), `each is listed where it is: ${listed.slice(0, 400)}`);
      await page.locator("[data-download-project]").first().screenshot({ path: join(out, "game-gaps.png") });
    },
  },
];
