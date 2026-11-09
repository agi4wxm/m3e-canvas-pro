/* The gameplay contract (docs/玩法契约.md): the file a game loop writes and M3E reads (format.ts), what it becomes in a
 * document (map.ts: `game.*` operations, problem types, input actions, the world's contract, mock scenarios), the
 * document's link to it (link.ts), what in a design no longer matches it (gaps.ts), reading it beside a folder
 * project (folder.ts), and the game loop's fixtures, known states of the game shown as mock scenes (fixture.ts). No
 * DOM, no Node. */

export * from "./format";
export * from "./map";
export * from "./link";
export * from "./gaps";
export * from "./folder";
export * from "./fixture";

import EXAMPLE from "./fixtures/example.m3e-game.json";
import { readGameContract, type GameContract } from "./format";

/** The minimal example contract (fixtures/example.m3e-game.json): what M3E's own templates and tests are written to,
 *  standing in for a game loop's until one is linked, as the example engine stands in for an engine. */
export const EXAMPLE_GAME_CONTRACT: GameContract = (() => {
  const read = readGameContract(EXAMPLE);
  if (!read.contract) throw new Error(`the example gameplay contract does not read: ${read.problems.join("; ")}`);
  return read.contract;
})();

import EXAMPLE_FIXTURE from "./fixtures/example.m3e-fixture.json";
import { readGameFixture, type GameFixture } from "./fixture";

/** The minimal example fixture (fixtures/example.m3e-fixture.json): one state of the example contract's game, as a game
 *  loop would write it. */
export const EXAMPLE_GAME_FIXTURE: GameFixture = (() => {
  const read = readGameFixture(EXAMPLE_FIXTURE);
  if (!read.fixture) throw new Error(`the example game fixture does not read: ${read.problems.join("; ")}`);
  return read.fixture;
})();
