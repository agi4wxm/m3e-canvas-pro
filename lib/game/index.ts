/* The gameplay contract (docs/玩法契约.md): the file a game loop writes and M3E reads (format.ts), what it becomes in a
 * document (map.ts: `game.*` operations, problem types, input actions, the world's contract, mock scenarios), the
 * document's link to it (link.ts), what in a design no longer matches it (gaps.ts), and reading it beside a folder
 * project (folder.ts). No DOM, no Node. */

export * from "./format";
export * from "./map";
export * from "./link";
export * from "./gaps";
export * from "./folder";
export * from "./readGaps";

import EXAMPLE from "./fixtures/example.m3e-game.json";
import { readGameContract, type GameContract } from "./format";

/** The minimal example contract (fixtures/example.m3e-game.json): what M3E's own templates and tests are written to,
 *  standing in for a game loop's until one is linked, as the example engine stands in for an engine. */
export const EXAMPLE_GAME_CONTRACT: GameContract = (() => {
  const read = readGameContract(EXAMPLE);
  if (!read.contract) throw new Error(`the example gameplay contract does not read: ${read.problems.join("; ")}`);
  return read.contract;
})();
