/* A document's link to its gameplay contract (`Doc.game`, docs/玩法契约.md): the contract as last read, and its hash.
 * Where the file is is the project's configuration, beside the asset manifest's (`Doc.external.gameContract`, a path
 * inside the project's folder, `game-contract.m3e-game.json` by default: the hub decision's "depend on the format, not
 * the location"); a folder project reads it there each time it is opened (folder.ts). The contract is kept so a shared
 * link or the browser's copy still knows it, but it is never edited: it changes only by reading the file again
 * (`linkGame`), which replaces every operation and scenario it made and says what in the design no longer matches it
 * (gaps.ts). */

import { cleanApi } from "../api/clean";
import type { ApiSpec } from "../api/types";
import { cleanMocks } from "../mocks/clean";
import { hash53 } from "../mocks/rng";
import type { MockSpec } from "../mocks/types";
import type { Doc } from "../tokens";
import { ASSET_PATH } from "../assetManifest";
import { apiCommands, inputCommands, readGameContract, type GameContract } from "./format";
import { gameEndpoints, gameModels, gameRefusals, gameScenarios, isGameEndpoint, refusalScenarioId } from "./map";
import { gameGaps, type GameGap } from "./gaps";
import { cleanFixtureLinks, withFixtureScenes, withoutFixtureScenes, type GameFixtureLink } from "./fixture";

export type GameLink = {
  /** the hash of the contract as last read: a file that reads the same is not imported again */
  hash: string;
  /** the contract as last read, read-only */
  contract: GameContract;
  /** M3E's example contract (a template brought it), until a game loop's own is linked */
  example?: true;
  /** the game loop's fixtures imported against it (fixture.ts): known states of the game, each a mock scene */
  fixtures?: GameFixtureLink[];
};

/** the hash of a contract: of what it says, not of how its file is spaced */
export const contractHash = (c: GameContract) => hash53(JSON.stringify(c)).toString(36);

/** where a project looks for its gameplay contract when its configuration names no other place: beside the project file */
export const DEFAULT_GAME_CONTRACT_PATH = "game-contract.m3e-game.json";

/** A path a project may name its contract by: one inside the project's folder, as the asset manifest's (lib/assetManifest.ts
 *  `ASSET_PATH`): `/`-separated names, none empty, `.` or `..`, no drive or backslash. */
export const cleanGamePath = (v: unknown): string | undefined => (typeof v === "string" && ASSET_PATH.test(v) ? v : undefined);

/** where the project's gameplay contract is: what its configuration says, else beside the project file */
export const gameContractPathOf = (doc: { external?: { gameContract?: unknown } } | null | undefined): string => cleanGamePath(doc?.external?.gameContract) ?? DEFAULT_GAME_CONTRACT_PATH;

/** The link as a document may hold it: its contract read again as the format allows (one that is not a contract any
 *  more is no link), its hash the contract's. */
export function cleanGameLink(v: unknown): GameLink | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const read = readGameContract(o.contract);
  if (!read.contract) return undefined;
  const fixtures = cleanFixtureLinks(o.fixtures);
  return { hash: contractHash(read.contract), contract: read.contract, ...(o.example === true ? { example: true as const } : {}), ...(fixtures ? { fixtures } : {}) };
}

/** What changed between two contracts, in words a person and a model read: each a command, a rejection, an input, an
 *  event or a fact, with its name. */
export type GameChanges = { added: string[]; removed: string[]; changed: string[] };

function entriesOf(c: GameContract | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!c) return out;
  for (const [name, cmd] of apiCommands(c)) out.set(`command ${c.namespace}.${name}`, JSON.stringify({ params: cmd.params ?? null, result: cmd.result ?? null }));
  for (const r of gameRefusals(c)) out.set(`rejection ${r.operationId} ${r.code}`, JSON.stringify([r.type, r.status]));
  for (const [name, cmd] of inputCommands(c)) out.set(`input ${name}`, cmd.input);
  for (const [name, e] of Object.entries(c.events)) out.set(`event ${name}`, JSON.stringify(e.payload));
  for (const [name, f] of Object.entries(c.facts ?? {})) out.set(`fact ${name}`, JSON.stringify(f));
  out.set("snapshot", JSON.stringify(c.snapshot));
  out.set("clock", JSON.stringify(c.clock));
  return out;
}

export function contractChanges(was: GameContract | undefined, now: GameContract): GameChanges {
  const a = entriesOf(was);
  const b = entriesOf(now);
  if (!was) return { added: [...b.keys()].filter((k) => k !== "snapshot" && k !== "clock"), removed: [], changed: [] };
  return {
    added: [...b.keys()].filter((k) => !a.has(k)),
    removed: [...a.keys()].filter((k) => !b.has(k)),
    changed: [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k)),
  };
}

/** What linking a contract came to: its namespace and version (and the one before), what changed in it, and what in the
 *  design no longer matches it. `same` when the contract read is the one the document had. */
export type GameImportReport = {
  namespace: string;
  contractVersion: string;
  previousVersion?: string;
  same: boolean;
  operations: string[];
  scenarios: string[];
  changes: GameChanges;
  gaps: GameGap[];
};

export type LinkTarget = Pick<Doc, "groups" | "frames" | "components"> & { api?: ApiSpec; mocks?: MockSpec; game?: GameLink };

/** the API without the operations a contract made */
export function withoutGameApi(api: ApiSpec | undefined): ApiSpec | undefined {
  if (!api?.endpoints?.some(isGameEndpoint)) return api;
  return cleanApi({ ...api, endpoints: api.endpoints.filter((e) => !isGameEndpoint(e)) });
}

/** the mocks without the scenarios a contract made */
export function withoutGameMocks(mocks: MockSpec | undefined, was: GameContract | undefined): MockSpec | undefined {
  if (!mocks || !was) return mocks;
  const made = new Set(gameRefusals(was).map(refusalScenarioId));
  if (!mocks.scenarios?.some((s) => made.has(s.id))) return mocks;
  return cleanMocks({ ...mocks, scenarios: mocks.scenarios.filter((s) => !made.has(s.id)), ...(mocks.scenario && made.has(mocks.scenario) ? { scenario: undefined } : {}) });
}

/** The document's API, mocks and link with a contract linked in its place of any before: the operations it is sent as
 *  replace the old contract's (an operation of the author's of the same id stays, and the contract's is not added),
 *  its refusals' scenarios replace the old ones, and what in the design no longer matches is listed. */
export function linkGame<D extends LinkTarget & Record<string, unknown>>(doc: D, contract: GameContract, o: { example?: boolean } = {}): { doc: D & LinkTarget & { game: GameLink }; report: GameImportReport } {
  const was = doc.game?.contract;
  const hash = contractHash(contract);
  const api = withoutGameApi(doc.api) ?? {};
  const own = new Set((api.endpoints ?? []).map((e) => e.operationId));
  const routes = new Set((api.endpoints ?? []).map((e) => `${e.method} ${e.path}`));
  const endpoints = gameEndpoints(contract).filter((e) => !own.has(e.operationId) && !routes.has(`${e.method} ${e.path}`));
  const models = new Set((api.models ?? []).map((m) => m.name));
  const nextApi = cleanApi({ ...api, models: [...(api.models ?? []), ...(endpoints.length ? gameModels().filter((m) => !models.has(m.name)) : [])], endpoints: [...(api.endpoints ?? []), ...endpoints] });
  const mocks = withoutGameMocks(doc.mocks, was) ?? {};
  const taken = new Set((mocks.scenarios ?? []).map((s) => s.id));
  const scenarios = gameScenarios(contract).filter((s) => !taken.has(s.id) && endpoints.some((e) => s.ops?.[e.operationId]));
  /* the fixtures stay, held to the contract as it is now: their scenes are made again from it (what no longer
     matches is a gap), so a world script never keeps the world's contract of the one before */
  const fixtures = doc.game?.fixtures;
  const withScenarios = scenarios.length || doc.mocks ? cleanMocks({ ...mocks, scenarios: [...(mocks.scenarios ?? []), ...scenarios] }) : undefined;
  const nextMocks = fixtures?.length ? withFixtureScenes(withScenarios, fixtures, contract) : withScenarios;
  const game: GameLink = { hash, contract, ...(o.example ? { example: true as const } : {}), ...(fixtures?.length ? { fixtures } : {}) };
  const next = { ...doc, api: nextApi, mocks: nextMocks, game } as D & LinkTarget & { game: GameLink };
  if (!nextApi) delete (next as LinkTarget).api;
  if (!nextMocks) delete (next as LinkTarget).mocks;
  return {
    doc: next,
    report: {
      namespace: contract.namespace,
      contractVersion: contract.contractVersion,
      ...(was ? { previousVersion: was.contractVersion } : {}),
      same: doc.game?.hash === hash,
      operations: endpoints.map((e) => e.operationId),
      scenarios: scenarios.map((s) => s.id),
      changes: contractChanges(was, contract),
      gaps: gameGaps(next),
    },
  };
}

/** The document with its contract unlinked: the operations and scenarios it made go, and so do the link and the
 *  fixtures held to it, with their scenes. What in the design called them is then a gap of the API's own (a call to no
 *  endpoint). */
export function unlinkGame<D extends LinkTarget & Record<string, unknown>>(doc: D): D {
  const next = { ...doc, api: withoutGameApi(doc.api), mocks: withoutFixtureScenes(withoutGameMocks(doc.mocks, doc.game?.contract), (doc.game?.fixtures ?? []).map((l) => l.fixture.id)) } as D;
  delete (next as LinkTarget).game;
  if (!next.api) delete (next as LinkTarget).api;
  if (!next.mocks) delete (next as LinkTarget).mocks;
  return next;
}
