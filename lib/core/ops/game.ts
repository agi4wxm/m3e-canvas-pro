/* The document's gameplay contract (lib/game, docs/玩法契约.md): a game loop's contract file linked, and unlinked. The
 * contract is the game loop's (the plan's K2): these read it as it is and never write one, and the operations and
 * scenarios it makes are changed only by linking the file again, which says what changed and what it broke. */

import { linkGame, readGameContract, unlinkGame, type GameImportReport } from "../../game";
import { DEFAULT_GAME_CONTRACT_PATH, cleanGamePath, gameContractPathOf } from "../../game/link";
import type { Doc, ExternalFiles } from "../../tokens";
import { readGameLoopUrl, type GameLoopLink } from "../../gameLoop/link";
import { op, OpError, S } from "../op";
import { withDoc, type CoreState } from "../state";

const fromDoc = (s: CoreState) => s.doc as unknown as Doc & Record<string, unknown>;

/** the state with the document's API, mocks and link as `next` has them */
const withGame = (s: CoreState, next: Partial<Doc>) => withDoc(s, { api: next.api, mocks: next.mocks, game: next.game });

/** the project's configuration with the contract's path in it: left out where it is the default, as the asset manifest's */
function withPath(external: ExternalFiles | undefined, path: string): ExternalFiles | undefined {
  const { gameContract: _was, ...rest } = external ?? {};
  const next: ExternalFiles = path !== DEFAULT_GAME_CONTRACT_PATH ? { ...rest, gameContract: path } : rest;
  return Object.keys(next).length ? next : undefined;
}

export const importGameContract = op<{ text: string; path?: string }, GameImportReport>({
  name: "import_game_contract",
  summary:
    "Links the game loop's gameplay contract (an m3e-game file, version 1: its commands, rejection codes, events, snapshot, clock, facts), read-only, in place of the one before: each command sent as an API call becomes the operation <namespace>.<command> (game.pull) with its rejections as problem types, each refusal a mock scenario, its input commands and snapshot the world's contract. Give the file's text exactly as the game loop wrote it, never one of your own. path is where the file is inside the project's folder (the project's configuration, external.gameContract; game-contract.m3e-game.json by default): a folder project reads it there each time it opens. Returns what changed and the gaps: what in the design no longer matches.",
  args: S.obj({ text: S.str("the contract file's text, as the game loop wrote it"), path: S.str("where the file is, relative to the project's folder: game-loop/contract.m3e-game.json") }, ["text"]),
  label: () => "Import game contract",
  run(s, a) {
    const read = readGameContract(a.text);
    if (!read.contract) throw new OpError("invalid_value", `That is no gameplay contract this version reads (format m3e-game, version 1): ${read.problems.slice(0, 8).join("; ")}.`, "text");
    if (a.path !== undefined && !cleanGamePath(a.path)) throw new OpError("invalid_value", `${JSON.stringify(a.path)} is no path inside the project's folder: a relative one, steps joined by /, no "..".`, "path");
    const linked = linkGame(fromDoc(s), read.contract);
    const state = withGame(s, linked.doc);
    return { state: a.path === undefined || a.path === gameContractPathOf(s.doc) ? state : withDoc(state, { external: withPath(s.doc.external, a.path) }), result: linked.report };
  },
});

export const removeGameContract = op<Record<string, never>, { removed: string; operations: number }>({
  name: "remove_game_contract",
  summary: "Unlinks the gameplay contract: the operations and mock scenarios it made go with it, and so does where the project read it from. What still calls them then calls no endpoint.",
  args: S.obj({}),
  label: () => "Remove game contract",
  run(s) {
    const doc = fromDoc(s);
    if (!doc.game && !doc.external?.gameContract) throw new OpError("nothing_to_do", "The document has no gameplay contract.");
    const before = doc.api?.endpoints?.length ?? 0;
    const next = unlinkGame(doc);
    return { state: withDoc(withGame(s, next), { external: withPath(s.doc.external, DEFAULT_GAME_CONTRACT_PATH) }), result: { removed: doc.game?.contract.namespace ?? "", operations: before - (next.api?.endpoints?.length ?? 0) } };
  },
});

/** The local game loop the preview answers from (lib/gameLoop, docs/玩法契约.md “本地 game-loop”): its address, and
 *  whether the preview's calls, channels and world go to it or to the mock library. The preview bar's own gesture, kept
 *  in the project's configuration beside the paths of the outside modules' files (`external.gameLoop`); not one of the
 *  tools. Only the address is kept: one with a user, a password, a query or a fragment is refused, since a credential
 *  never goes into the document. `url: ""` forgets the game loop. */
export const setGameLoop = op<{ url: string; preview?: boolean }, { gameLoop: GameLoopLink | null }>({
  name: "set_game_loop",
  summary: "Says where the local game loop the preview may answer from is (an http or https address, no credentials, query or fragment), and whether the preview answers from it instead of the mock library. \"\" forgets it.",
  args: S.obj({ url: S.str("the game loop's address: http://localhost:8787, or \"\""), preview: S.bool("whether the preview answers from it") }, ["url"]),
  label: () => "Preview backend",
  run(s, a) {
    const { gameLoop: was, ...rest } = s.doc.external ?? {};
    let link: GameLoopLink | undefined;
    if (a.url.trim()) {
      const read = readGameLoopUrl(a.url);
      if ("problem" in read) throw new OpError("invalid_value", `${JSON.stringify(a.url)} is no address the project keeps for a game loop (${read.problem}): http or https, with no user, password, query or fragment.`, "url");
      link = { url: read.url, ...(a.preview ? { preview: true } : {}) };
    }
    if (JSON.stringify(was ?? null) === JSON.stringify(link ?? null)) throw new OpError("nothing_to_do", "The project's game loop is that already.");
    const next: ExternalFiles = link ? { ...rest, gameLoop: link } : rest;
    return { state: withDoc(s, { external: Object.keys(next).length ? next : undefined }), result: { gameLoop: link ?? null } };
  },
});
