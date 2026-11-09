/* The game loop's gameplay contract (docs/玩法契约.md) in the editor: a file that is no contract refused with nothing
 * kept, the example contract linked from the project menu (its commands the API's game.* operations, its refusals mock
 * scenarios), and the import one undo step. */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
];
