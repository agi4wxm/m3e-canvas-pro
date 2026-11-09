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
const FIXTURE = readFileSync(new URL("../../lib/game/fixtures/example.m3e-fixture.json", import.meta.url), "utf8");

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

  it("imports a fixture beside the project as a scene, reads it again when it changed, and draws a screen at it", async () => {
    const dir = scratchDir();
    const path = join(dir, "m3e-canvas Arena.json");
    writeProject(path);
    const first = await connect({ file: path });
    expect(errorOf(await first.call("import_game_contract", { text: CONTRACT }))).toBeNull();
    expect(errorOf(await first.call("apply_ops", { ops: [{ op: "add_screen", args: { id: "arena", name: "Arena" } }, { op: "add_part", args: { slug: "world-view", id: "world", screen: "arena", at: { x: 16, y: 80 } } }] }))).toBeNull();
    expect(errorOf(await first.call("import_game_fixture", { text: FIXTURE, path: "fixtures/day-12.m3e-fixture.json" }))).toBeNull();
    await first.close();

    /* the game loop writes the state again: the next session opens the project with the fixture as the folder has it */
    mkdirSync(join(dir, "fixtures"), { recursive: true });
    writeFileSync(join(dir, "game-contract.m3e-game.json"), CONTRACT);
    writeFileSync(join(dir, "fixtures", "day-12.m3e-fixture.json"), JSON.stringify({ ...JSON.parse(FIXTURE), snapshot: { ...JSON.parse(FIXTURE).snapshot, score: 11 } }));
    const again = await connect({ file: path });
    done.push(again.close);
    expect(textOf(await again.call("list_game_fixtures"))).toMatch(/"startsIn":\s*"fixture\.day-12"/);
    /* no browser here: the screenshot says what the screen got at the fixture */
    const shot = JSON.parse(textOf(await again.call("screenshot", { id: "arena", fixture: "day-12" }))) as { data: { fixture: { scene: string }; world: { views: string[] } } };
    expect(shot.data.fixture.scene).toBe("fixture.day-12");
    expect(shot.data.world.views).toEqual(["world"]);
    /* what was read again is written with the next change */
    expect(errorOf(await again.call("set_title", { title: "Arena" }))).toBeNull();
    const saved = JSON.parse(readFileSync(path, "utf8")) as { document: { mocks: { worlds: { id: string; start: { score: number } }[] } } };
    expect(saved.document.mocks.worlds.find((w) => w.id === "fixture.day-12")?.start.score).toBe(11);
  });
});
