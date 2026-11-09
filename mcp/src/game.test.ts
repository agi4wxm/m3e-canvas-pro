/* The gameplay contract beside a project on disk, in file mode (docs/玩法契约.md): linked through the tools with the path
 * it is at, then read again from there when the project is opened, as a folder project opened in the editor is. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../lib/i18n";
import { connect, errorOf, scratchDir, textOf, writeProject } from "./testkit";

beforeAll(() => setGlobalLang("en"));

let done: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of done) await d();
  done = [];
});

const CONTRACT = readFileSync(new URL("../../lib/game/fixtures/example.m3e-game.json", import.meta.url), "utf8");

describe("the gameplay contract in file mode", () => {
  it("is linked with the path it is at, and read again from beside the project when it is opened", async () => {
    const dir = scratchDir();
    const path = join(dir, "m3e-canvas Shop.json");
    writeProject(path);
    const first = await connect({ file: path });
    expect(errorOf(await first.call("import_game_contract", { text: CONTRACT, path: "game-loop/contract.m3e-game.json" }))).toBeNull();
    expect(JSON.parse(readFileSync(path, "utf8")).document.external).toEqual({ gameContract: "game-loop/contract.m3e-game.json" });
    await first.close();

    /* the game loop moves on: the next session opens the project with the contract as the folder has it now */
    mkdirSync(join(dir, "game-loop"), { recursive: true });
    writeFileSync(join(dir, "game-loop", "contract.m3e-game.json"), JSON.stringify({ ...JSON.parse(CONTRACT), contractVersion: "1.3.0" }));
    const again = await connect({ file: path });
    done.push(again.close);
    expect(textOf(await again.call("get_game_contract"))).toMatch(/Gameplay contract game 1\.3\.0, read from game-loop\/contract\.m3e-game\.json/);
  });
});
