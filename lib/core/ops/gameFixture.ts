/* The game loop's fixtures (lib/game/fixture.ts, docs/玩法契约.md “fixture”): a known state of the game imported as a
 * mock scene, and taken away again. A fixture is the game loop's, like its contract: these read the file as it is and
 * never write one; the scene it makes changes only by importing the file again. */

import { cleanFixturePath, fixtureSceneId, linkFixture, readGameFixture, unlinkFixture, type FixtureImportReport } from "../../game/fixture";
import type { Doc } from "../../tokens";
import { op, OpError, S } from "../op";
import { withDoc, type CoreState } from "../state";

const fromDoc = (s: CoreState) => s.doc as unknown as Doc & Record<string, unknown>;

export const importGameFixture = op<{ text: string; path?: string; use?: boolean }, FixtureImportReport>({
  name: "import_game_fixture",
  summary:
    "Imports one of the game loop's fixtures (an m3e-game-fixture file, version 1: one known state of the game, its world snapshot and what each game.* command answers in it), held to the linked gameplay contract, as a mock scene: a world script fixture.<id> whose start is the snapshot (the world views stand in that state) and a mock scenario fixture.<id> in which each command answers as the fixture says (its result, or its refusal's problem), so the HUD and the screens around the game show that state in the preview. Give the file's text exactly as the game loop wrote it, never one of your own. A fixture of the same id is replaced and its scene made again; one the contract refuses (a snapshot its schema does not take, an answer to a command it has not, a refusal the command does not have) is refused with every reason, and a fixture written against another version of the contract is said in versionMismatch. use (true by default) makes the preview start in the scene. path: where the file is in the project's folder, read again there each time a folder project opens.",
  args: S.obj({ text: S.str("the fixture file's text, as the game loop wrote it"), path: S.str("where the file is, relative to the project's folder: game-loop/fixtures/day-12.m3e-fixture.json"), use: S.bool("make the preview start in its scene (true)") }, ["text"]),
  label: () => "Import game fixture",
  run(s, a) {
    if (a.path !== undefined && !cleanFixturePath(a.path)) throw new OpError("invalid_value", `${JSON.stringify(a.path)} is no path inside the project's folder: a relative one, steps joined by /, no "..".`, "path");
    const read = readGameFixture(a.text);
    if (!read.fixture) throw new OpError("invalid_value", `That is no game fixture this version reads (format m3e-game-fixture, version 1): ${read.problems.slice(0, 8).join("; ")}.`, "text");
    const linked = linkFixture(fromDoc(s), read.fixture, { path: a.path, use: a.use });
    if (linked.problems) throw new OpError(s.doc.game ? "invalid_value" : "refused", `The fixture ${read.fixture.id} does not match the gameplay contract${s.doc.game ? ` ${s.doc.game.contract.namespace} ${s.doc.game.contract.contractVersion}` : ""}: ${linked.problems.slice(0, 8).join("; ")}${linked.problems.length > 8 ? `; and ${linked.problems.length - 8} more` : ""}.`, "text");
    return { state: withDoc(s, { mocks: linked.doc.mocks ?? {}, game: linked.doc.game }), result: linked.report };
  },
});

export const removeGameFixture = op<{ id: string }, { removed: string; scene: string }>({
  name: "remove_game_fixture",
  summary: "Removes one of the game loop's fixtures from the document, and the mock scene it made (its scenario and world script); the preview no longer starts in it.",
  args: S.obj({ id: S.str("the fixture's id (list_game_fixtures lists them)") }, ["id"]),
  label: () => "Remove game fixture",
  run(s, a) {
    const doc = fromDoc(s);
    const ids = (doc.game?.fixtures ?? []).map((l) => l.fixture.id);
    if (!ids.includes(a.id)) throw new OpError("not_found", `There is no fixture ${JSON.stringify(a.id)}.${ids.length ? ` The fixtures are: ${ids.join(", ")}.` : " import_game_fixture imports one."}`, a.id);
    const next = unlinkFixture(doc, a.id);
    return { state: withDoc(s, { mocks: next.mocks ?? {}, game: next.game }), result: { removed: a.id, scene: fixtureSceneId(a.id) } };
  },
});
