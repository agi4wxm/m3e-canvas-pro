/* A game loop's fixture (docs/玩法契约.md, “fixture”; the plan's batch 7, J3): one known state of the game, written by
 * the game loop against its gameplay contract, for M3E to show. It holds the world's snapshot as the game's `view()`
 * gives it, and what each command the contract sends as a call answers in that state (the low-frequency state: the
 * gems left, what a summon gives, a check-in that is cooling down), keyed to the contract's commands. The format is
 * `m3e-game-fixture`, version 1; m3e-game-fixture.schema.json is its JSON Schema. Like the contract it has one author:
 * M3E reads it, holds it to the contract the document links, and never writes or mends it.
 *
 * Importing one makes a mock scene (world scripts are lib/world/script.ts; scenarios lib/mocks/types.ts): a world script
 * with the snapshot as its start and no steps (B6-H6: "a fixture is a script with a start and no steps"), which the
 * world views play, and a scenario of the mock library in which each command answers as the fixture says, which the
 * design's calls and data sources on `game.*` get; so the whole screen, its HUD and the UI around the game, shows that
 * state in the preview, and a screenshot can be taken at it. Both are made from the fixture and the contract each time
 * either is read again (`withFixtureScenes`), so the scene never drifts from what the game loop wrote. No DOM, no Node. */

import { checkValue } from "../mocks/check";
import { cleanMocks } from "../mocks/clean";
import { hash53 } from "../mocks/rng";
import type { MockOpRule, MockScenario, MockSpec, MockWorldScript } from "../mocks/types";
import type { GapPlace } from "../export/gaps";
import type { JsonSchemaObject } from "../api/types";
import { ASSET_PATH } from "../assetManifest";
import { GAME_LIMITS, GAME_NAME, apiCommands, type GameContract } from "./format";
import { gameOperationId, refusalsOf, worldContractOf } from "./map";
import FIXTURE_FORMAT_SCHEMA from "./m3e-game-fixture.schema.json";

export const FIXTURE_FORMAT = "m3e-game-fixture";
export const FIXTURE_FORMAT_VERSION = 1;
/** what a fixture file is called: `<anything>.m3e-fixture.json` */
export const FIXTURE_FILE_SUFFIX = ".m3e-fixture.json";
/** the format's own JSON Schema (2020-12), as the game loop checks its output against it */
export const GAME_FIXTURE_SCHEMA = FIXTURE_FORMAT_SCHEMA as unknown as JsonSchemaObject;
/** what names a fixture: short enough that its scene's id (`fixture.<id>`) is a mock id */
export const FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/;
/** the most fixtures a document links */
export const MAX_FIXTURES = 50;

/** What a command answers in the fixture's state: its result, or one of its rejections (with the problem's detail). */
export type GameFixtureAnswer = { result: unknown; rejection?: undefined; detail?: undefined } | { rejection: string; detail?: string; result?: undefined };

export type GameFixture = {
  format: typeof FIXTURE_FORMAT;
  version: typeof FIXTURE_FORMAT_VERSION;
  /** the namespace of the contract it was written against */
  namespace: string;
  /** that contract's version */
  contractVersion: string;
  id: string;
  name: string;
  summary?: string;
  /** the world's snapshot in this state */
  snapshot: Record<string, unknown>;
  /** by command: what it answers in this state */
  answers?: Record<string, GameFixtureAnswer>;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export type GameFixtureRead = { fixture: GameFixture; problems: [] } | { fixture: null; problems: string[] };

/** A fixture read from its file's text or its parsed JSON, as its format says (not yet held to a contract: that is
 *  `matchFixture`): the fixture, or every reason it is none. */
export function readGameFixture(input: unknown): GameFixtureRead {
  let value = input;
  if (typeof input === "string") {
    if (input.length > GAME_LIMITS.text) return { fixture: null, problems: [`the file is longer than ${GAME_LIMITS.text} characters`] };
    try {
      value = JSON.parse(input);
    } catch {
      return { fixture: null, problems: ["the file is not JSON"] };
    }
  }
  if (!isRecord(value)) return { fixture: null, problems: ["the file holds no JSON object"] };
  if (value.format !== FIXTURE_FORMAT) return { fixture: null, problems: [`format should be "${FIXTURE_FORMAT}"${typeof value.format === "string" ? `, not "${value.format.slice(0, 40)}"` : ""}`] };
  if (value.version !== FIXTURE_FORMAT_VERSION) return { fixture: null, problems: [`version ${JSON.stringify(value.version)} is not one this M3E reads (it reads ${FIXTURE_FORMAT_VERSION})`] };
  const text = JSON.stringify(value);
  if (text.length > GAME_LIMITS.text) return { fixture: null, problems: [`it is longer than ${GAME_LIMITS.text} characters`] };
  const problems = checkValue({}, GAME_FIXTURE_SCHEMA, value, { locale: "en" }).map((e) => `${e.pointer.slice(1) || "/"}: ${e.detail}`);
  /* what the checker leaves to the reader: the commands' names, and an answer that is one of two */
  if (isRecord(value.answers))
    for (const [name, a] of Object.entries(value.answers)) {
      if (!GAME_NAME.test(name)) problems.push(`/answers: ${JSON.stringify(name.slice(0, 40))} cannot name a command (a small letter, then letters and digits)`);
      else if (isRecord(a) && ("result" in a) === ("rejection" in a)) problems.push(`/answers/${name}: should give either its result or its rejection`);
      else if (isRecord(a) && "result" in a && "detail" in a) problems.push(`/answers/${name}/detail: only a rejection has a detail`);
    }
  if (problems.length) return { fixture: null, problems: [...new Set(problems)].slice(0, 40) };
  return { fixture: JSON.parse(text) as GameFixture, problems: [] };
}

/** How a fixture matches the contract a document links: what in it the contract refuses (each a reason it is not
 *  taken), and the two versions when the fixture was written against another version of the contract (said, not
 *  refused: what it holds may still match). */
export type FixtureMatch = { problems: string[]; version?: { fixture: string; contract: string } };

export function matchFixture(f: GameFixture, c: GameContract): FixtureMatch {
  const problems: string[] = [];
  if (f.namespace !== c.namespace) problems.push(`/namespace: it was written for the contract ${JSON.stringify(f.namespace)}, and the document links ${JSON.stringify(c.namespace)}`);
  for (const e of checkValue({}, c.snapshot, f.snapshot, { locale: "en", direction: "response" })) problems.push(`/snapshot${e.pointer.slice(1)}: ${e.detail}`);
  const calls = apiCommands(c).map(([n]) => n);
  for (const [name, a] of Object.entries(f.answers ?? {})) {
    const cmd = c.commands[name];
    if (!cmd) {
      problems.push(`/answers/${name}: the contract has no command ${name} (its calls are ${calls.join(", ") || "none"})`);
      continue;
    }
    if (cmd.via !== "api") {
      problems.push(`/answers/${name}: ${name} is sent as an input action to the world and never answered`);
      continue;
    }
    if (a.rejection !== undefined) {
      const codes = Object.keys(cmd.rejections ?? {});
      if (!codes.includes(a.rejection)) problems.push(`/answers/${name}/rejection: ${name} does not refuse with ${a.rejection} (${codes.length ? `it refuses with ${codes.join(", ")}` : "it refuses with nothing"})`);
    } else if (cmd.result !== undefined) for (const e of checkValue({}, cmd.result, a.result, { locale: "en", direction: "response" })) problems.push(`/answers/${name}/result${e.pointer.slice(1)}: ${e.detail}`);
  }
  return { problems: problems.slice(0, 40), ...(f.contractVersion !== c.contractVersion ? { version: { fixture: f.contractVersion, contract: c.contractVersion } } : {}) };
}

/* ---------- the scene ---------- */

/** the id of the scenario and of the world script a fixture makes (one each, of the same id) */
export const fixtureSceneId = (id: string) => `fixture.${id}`;
/** the fixture whose scene an id is, when it is one */
export const fixtureOfScene = (sceneId: string | undefined): string | undefined => (sceneId?.startsWith("fixture.") ? sceneId.slice(8) : undefined);

/** The scenario of the mock library a fixture makes: each command it answers answers so, a result as the 200 and a
 *  rejection as its problem (the type, title and status the contract says, the fixture's detail), every time it is
 *  called; the rest answer as the mocks make them. */
export function fixtureScenario(f: GameFixture, c: GameContract): MockScenario {
  const ops: Record<string, MockOpRule> = {};
  for (const [name, a] of Object.entries(f.answers ?? {})) {
    const cmd = c.commands[name];
    if (cmd?.via !== "api") continue;
    const id = gameOperationId(c.namespace, name);
    if (a.rejection === undefined) {
      ops[id] = { status: 200, body: a.result };
      continue;
    }
    const r = refusalsOf(c, name, cmd).find((x) => x.code === a.rejection);
    if (r) ops[id] = { status: r.status, body: { type: r.type, title: r.title, status: r.status, ...(a.detail ? { detail: a.detail } : r.summary ? { detail: r.summary } : {}) } };
  }
  return { id: fixtureSceneId(f.id), name: `Fixture: ${f.name}`, description: `The game loop's fixture ${f.id} (contract ${f.namespace} ${f.contractVersion})${f.summary ? `: ${f.summary}` : ""}`, ...(Object.keys(ops).length ? { ops } : {}) };
}

/** The world script a fixture makes: its snapshot as the start, no steps (the world stands in that state), held to the
 *  world's contract the gameplay contract makes, its name as the scene's words. */
export function fixtureWorld(f: GameFixture, c: GameContract): MockWorldScript {
  return {
    id: fixtureSceneId(f.id),
    name: `Fixture: ${f.name}`,
    description: `The world in the game loop's fixture ${f.id}${f.summary ? `: ${f.summary}` : ""}`,
    contract: JSON.parse(JSON.stringify(worldContractOf(c))) as Record<string, unknown>,
    start: JSON.parse(JSON.stringify(f.snapshot)) as Record<string, unknown>,
    scene: f.name,
    steps: [],
  };
}

/* ---------- the document's fixtures ---------- */

/** A fixture as the document keeps it (`Doc.game.fixtures`): as last read, read-only, its hash, and where its file is in
 *  the project's folder when it came from one (a folder project reads it there again each time it opens). */
export type GameFixtureLink = { hash: string; fixture: GameFixture; path?: string };

/** the hash of a fixture: of what it says, not of how its file is spaced */
export const fixtureHash = (f: GameFixture) => hash53(JSON.stringify(f)).toString(36);

/** a path a fixture's file may be at: inside the project's folder, as the contract's (lib/game/link.ts `cleanGamePath`) */
export const cleanFixturePath = (v: unknown): string | undefined => (typeof v === "string" && ASSET_PATH.test(v) ? v : undefined);

/** the fixtures as a document may hold them: each read again as its format allows (one that is none any more goes),
 *  one id once */
export function cleanFixtureLinks(v: unknown): GameFixtureLink[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: GameFixtureLink[] = [];
  for (const x of v.slice(0, MAX_FIXTURES * 2)) {
    if (!isRecord(x)) continue;
    const read = readGameFixture(x.fixture);
    if (!read.fixture || out.some((o) => o.fixture.id === read.fixture.id)) continue;
    const path = cleanFixturePath(x.path);
    out.push({ hash: fixtureHash(read.fixture), fixture: read.fixture, ...(path ? { path } : {}) });
    if (out.length >= MAX_FIXTURES) break;
  }
  return out.length ? out : undefined;
}

type FixtureDoc = { mocks?: MockSpec; game?: { contract: GameContract; fixtures?: GameFixtureLink[] } };

/** the mocks without the scenes of these fixtures (by id); the preview's start left where it was unless it was one */
export function withoutFixtureScenes(mocks: MockSpec | undefined, ids: Iterable<string>): MockSpec | undefined {
  if (!mocks) return mocks;
  const scenes = new Set([...ids].map(fixtureSceneId));
  if (!scenes.size) return mocks;
  const scenarios = mocks.scenarios?.filter((s) => !scenes.has(s.id));
  const worlds = mocks.worlds?.filter((s) => !scenes.has(s.id));
  if (scenarios?.length === mocks.scenarios?.length && worlds?.length === mocks.worlds?.length && !scenes.has(mocks.scenario ?? "") && !scenes.has(mocks.world ?? "")) return mocks;
  return cleanMocks({ ...mocks, scenarios, worlds, ...(scenes.has(mocks.scenario ?? "") ? { scenario: undefined } : {}), ...(scenes.has(mocks.world ?? "") ? { world: undefined } : {}) });
}

/** The mocks with every fixture's scene made again from the fixture and the contract, after the author's own scenarios
 *  and scripts, in the fixtures' order: what the preview starts in stays when its scene is still there. The ids
 *  `fixture.<id>` are the fixtures': whatever had one is replaced. */
export function withFixtureScenes(mocks: MockSpec | undefined, fixtures: readonly GameFixtureLink[] | undefined, c: GameContract | undefined, was: Iterable<string> = []): MockSpec | undefined {
  const ids = new Set([...was, ...(fixtures ?? []).map((l) => l.fixture.id)]);
  const keep = { scenario: mocks?.scenario, world: mocks?.world };
  const base = withoutFixtureScenes(mocks, ids) ?? {};
  if (!c || !fixtures?.length) return mocks ? cleanMocks(base) : undefined;
  const next: MockSpec = { ...base, scenarios: [...(base.scenarios ?? []), ...fixtures.map((l) => fixtureScenario(l.fixture, c))], worlds: [...(base.worlds ?? []), ...fixtures.map((l) => fixtureWorld(l.fixture, c))] };
  if (keep.scenario && !next.scenario && next.scenarios?.some((s) => s.id === keep.scenario)) next.scenario = keep.scenario;
  if (keep.world && !next.world && next.worlds?.some((s) => s.id === keep.world)) next.world = keep.world;
  return cleanMocks(next);
}

/** What importing a fixture came to: its id and name, the scene it made (the scenario's and the world script's id),
 *  the contract's version and the fixture's when they differ, whether it replaced one of the same id and whether that
 *  one said the same, what changed in it (`snapshot`, `answer pull`), and whether the preview now starts in it. */
export type FixtureImportReport = {
  id: string;
  name: string;
  scene: string;
  contractVersion: string;
  versionMismatch?: { fixture: string; contract: string };
  replaced: boolean;
  same: boolean;
  changed: string[];
  answers: string[];
  used: boolean;
};

/** what differs between two fixtures, in words: `snapshot`, `answer pull`, `name` */
function fixtureChanges(was: GameFixture | undefined, now: GameFixture): string[] {
  if (!was) return [];
  const out: string[] = [];
  for (const k of ["name", "summary", "contractVersion", "snapshot"] as const) if (JSON.stringify(was[k]) !== JSON.stringify(now[k])) out.push(k);
  for (const name of new Set([...Object.keys(was.answers ?? {}), ...Object.keys(now.answers ?? {})])) if (JSON.stringify(was.answers?.[name]) !== JSON.stringify(now.answers?.[name])) out.push(`answer ${name}`);
  return out;
}

export type FixtureLinked<D> = { doc: D; report: FixtureImportReport; problems?: undefined } | { doc?: undefined; report?: undefined; problems: string[] };

/** The document with a fixture linked: refused, with every reason, when the document links no contract or the fixture
 *  does not match it; else in place of one of the same id, its scene made again, and (with `use`, the default) the
 *  scene the preview starts in. */
export function linkFixture<D extends FixtureDoc & Record<string, unknown>>(doc: D, fixture: GameFixture, o: { path?: string; use?: boolean } = {}): FixtureLinked<D> {
  const c = doc.game?.contract;
  if (!c) return { problems: ["the document links no gameplay contract: a fixture is held to one (import_game_contract links the game loop's)"] };
  const match = matchFixture(fixture, c);
  if (match.problems.length) return { problems: match.problems };
  const before = doc.game!.fixtures ?? [];
  const was = before.find((l) => l.fixture.id === fixture.id);
  if (!was && before.length >= MAX_FIXTURES) return { problems: [`the document links ${MAX_FIXTURES} fixtures, the most it may: remove one first`] };
  const path = o.path !== undefined ? cleanFixturePath(o.path) : was?.path;
  const link: GameFixtureLink = { hash: fixtureHash(fixture), fixture, ...(path ? { path } : {}) };
  const fixtures = was ? before.map((l) => (l === was ? link : l)) : [...before, link];
  const use = o.use !== false;
  const scene = fixtureSceneId(fixture.id);
  let mocks = withFixtureScenes(doc.mocks, fixtures, c) ?? {};
  if (use) mocks = cleanMocks({ ...mocks, ...(mocks.scenarios?.some((s) => s.id === scene) ? { scenario: scene } : {}), ...(mocks.worlds?.some((s) => s.id === scene) ? { world: scene } : {}) }) ?? {};
  const next = { ...doc, mocks, game: { ...doc.game!, fixtures } } as D;
  return {
    doc: next,
    report: {
      id: fixture.id,
      name: fixture.name,
      scene,
      contractVersion: c.contractVersion,
      ...(match.version ? { versionMismatch: match.version } : {}),
      replaced: !!was,
      same: was?.hash === link.hash,
      changed: fixtureChanges(was?.fixture, fixture),
      answers: Object.keys(fixture.answers ?? {}).map((n) => gameOperationId(c.namespace, n)),
      used: use,
    },
  };
}

/** the document with a fixture unlinked, and its scene gone with it */
export function unlinkFixture<D extends FixtureDoc & Record<string, unknown>>(doc: D, id: string): D {
  if (!doc.game?.fixtures?.some((l) => l.fixture.id === id)) return doc;
  const fixtures = doc.game.fixtures.filter((l) => l.fixture.id !== id);
  const game = { ...doc.game, fixtures };
  if (!fixtures.length) delete (game as { fixtures?: unknown }).fixtures;
  const next = { ...doc, mocks: withoutFixtureScenes(doc.mocks, [id]), game } as D;
  if (!next.mocks) delete (next as FixtureDoc).mocks;
  return next;
}

/** One fixture as the tools list it: what it is, its scene, the commands it answers, and how it matches the contract
 *  linked now (a contract read again may no longer take what it says). */
export type FixtureSummary = { id: string; name: string; summary?: string; scene: string; contractVersion: string; path?: string; answers: Record<string, string>; problems: string[]; versionMismatch?: { fixture: string; contract: string } };

export function fixtureSummaries(doc: FixtureDoc): FixtureSummary[] {
  const c = doc.game?.contract;
  return (doc.game?.fixtures ?? []).map(({ fixture: f, path }) => {
    const m = c ? matchFixture(f, c) : { problems: ["the document links no gameplay contract"] };
    return {
      id: f.id,
      name: f.name,
      ...(f.summary ? { summary: f.summary } : {}),
      scene: fixtureSceneId(f.id),
      contractVersion: f.contractVersion,
      ...(path ? { path } : {}),
      answers: Object.fromEntries(Object.entries(f.answers ?? {}).map(([n, a]) => [gameOperationId(f.namespace, n), a.rejection !== undefined ? `refuses ${a.rejection}` : "answers its result"])),
      problems: m.problems,
      ...("version" in m && m.version ? { versionMismatch: m.version } : {}),
    };
  });
}

/** The fixtures that no longer match the contract the document links, one gap each (docs/玩法契约.md “缺口”): kind
 *  `fixture`, ref `fixture <id>`, reason `mismatch`, what the contract refuses in it in the detail. A version that
 *  differs alone is no gap: what it holds still matches. */
export function fixtureGaps(doc: FixtureDoc): { kind: "fixture"; ref: string; reason: string; detail: string; where: GapPlace }[] {
  const c = doc.game?.contract;
  if (!c) return [];
  return (doc.game?.fixtures ?? []).flatMap(({ fixture: f }) => {
    const { problems } = matchFixture(f, c);
    if (!problems.length) return [];
    const words = `${problems.slice(0, 3).join("; ")}${problems.length > 3 ? `; and ${problems.length - 3} more` : ""}`;
    return [{ kind: "fixture" as const, ref: `fixture ${f.id}`, reason: "mismatch", detail: `the fixture ${f.id} (contract ${f.contractVersion}) no longer matches the contract ${c.contractVersion}: ${words}`, where: { prop: `fixture ${f.id}` } }];
  });
}
