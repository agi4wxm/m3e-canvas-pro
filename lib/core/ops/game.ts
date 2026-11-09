/* The document's gameplay contract (lib/game, docs/玩法契约.md): a game loop's contract file linked, and unlinked. The
 * contract is the game loop's (the plan's K2): these read it as it is and never write one, and the operations and
 * scenarios it makes are changed only by linking the file again, which says what changed and what it broke. */

import { linkGame, readGameContract, unlinkGame, type GameImportReport } from "../../game";
import { cleanGamePath } from "../../game/link";
import type { Doc } from "../../tokens";
import { op, OpError, S } from "../op";
import { withDoc, type CoreState } from "../state";

const fromDoc = (s: CoreState) => s.doc as unknown as Doc & Record<string, unknown>;

/** the state with the document's API, mocks and link as `next` has them */
const withGame = (s: CoreState, next: Partial<Doc>) => withDoc(s, { api: next.api, mocks: next.mocks, game: next.game });

export const importGameContract = op<{ text: string; path?: string }, GameImportReport>({
  name: "import_game_contract",
  summary:
    "Links the game loop's gameplay contract (an m3e-game file, version 1: its commands, rejection codes, events, snapshot, clock, facts), read-only, in place of the one before: each command sent as an API call becomes the operation <namespace>.<command> (game.pull) with its rejections as problem types, each refusal a mock scenario, its input commands and snapshot the world's contract. Give the file's text exactly as the game loop wrote it, never one of your own. path is where the file is beside the project (a folder project reads it there each time it opens). Returns what changed and the gaps: what in the design no longer matches.",
  args: S.obj({ text: S.str("the contract file's text, as the game loop wrote it"), path: S.str("where the file is, relative to the project's folder: game-loop/contract.m3e-game.json") }, ["text"]),
  label: () => "Import game contract",
  run(s, a) {
    const read = readGameContract(a.text);
    if (!read.contract) throw new OpError("invalid_value", `That is no gameplay contract this version reads (format m3e-game, version 1): ${read.problems.slice(0, 8).join("; ")}.`, "text");
    if (a.path !== undefined && !cleanGamePath(a.path)) throw new OpError("invalid_value", `${JSON.stringify(a.path)} is no path inside the project's folder: a relative one, steps joined by /, no "..".`, "path");
    const linked = linkGame(fromDoc(s), read.contract, { path: a.path });
    return { state: withGame(s, linked.doc), result: linked.report };
  },
});

export const removeGameContract = op<Record<string, never>, { removed: string; operations: number }>({
  name: "remove_game_contract",
  summary: "Unlinks the gameplay contract: the operations and mock scenarios it made go with it. What still calls them then calls no endpoint.",
  args: S.obj({}),
  label: () => "Remove game contract",
  run(s) {
    const doc = fromDoc(s);
    if (!doc.game) throw new OpError("nothing_to_do", "The document has no gameplay contract.");
    const before = doc.api?.endpoints?.length ?? 0;
    const next = unlinkGame(doc);
    return { state: withGame(s, next), result: { removed: doc.game.contract.namespace, operations: before - (next.api?.endpoints?.length ?? 0) } };
  },
});
