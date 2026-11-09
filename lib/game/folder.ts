/* A folder project's gameplay contract read where the project's configuration says it is (`Doc.external.gameContract`,
 * a path inside the folder, `game-contract.m3e-game.json` by default, as the asset manifest's), each time the project is
 * opened (docs/玩法契约.md, “文件夹项目”): a contract that reads as the one the document has
 * changes nothing; a changed one is linked in its place, with what it changed and what in the design it broke; one
 * that is gone or no contract any more leaves the document as it was and says so. The hub decision of the plan: M3E
 * depends on the file's format, never on where the game loop keeps it, so moving it is changing that one path. The
 * fixtures imported from files of the folder (fixture.ts) are read again from where they were, the same way. */

import { readGameContract } from "./format";
import { gameContractPathOf, linkGame, type GameImportReport, type LinkTarget } from "./link";
import { fixtureHash, linkFixture, readGameFixture, unlinkFixture, type FixtureImportReport } from "./fixture";

/** the little of a folder's handle reading a file needs (the File System Access API's, or a test's) */
export type FolderLike = {
  getDirectoryHandle(name: string): Promise<FolderLike>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<{ text(): Promise<string> }> }>;
};

/** the text of the file at a relative path inside a folder; null when there is none */
export async function readInFolder(dir: FolderLike, path: string): Promise<string | null> {
  const steps = path.split("/");
  try {
    let at = dir;
    for (const s of steps.slice(0, -1)) at = await at.getDirectoryHandle(s);
    return await (await (await at.getFileHandle(steps[steps.length - 1])).getFile()).text();
  } catch {
    return null;
  }
}

/** What reading the contract beside the project came to: nothing to read (`none`), the same contract (`same`), a new
 *  one linked (`updated`, with its report), or a file that is gone or not a contract (`missing`, `invalid`). */
export type GameRefresh =
  | { status: "none" | "same" }
  | { status: "updated"; report: GameImportReport }
  | { status: "missing"; path: string }
  | { status: "invalid"; path: string; problems: string[] };

/** whether a project reads a gameplay contract from its folder: one it links (not M3E's example), or one its
 *  configuration names */
export const readsGameContract = (doc: LinkTarget & { external?: { gameContract?: unknown } }) => (!!doc.game && !doc.game.example) || typeof doc.external?.gameContract === "string";

/** What reading a fixture beside the project again came to (fixture.ts): the same one, a changed one linked in its
 *  place (its scene made again), or a file that is gone, is no fixture or no longer matches the contract (the last one
 *  read is kept). */
export type FixtureRefresh = { id: string; path: string } & ({ status: "same" } | { status: "updated"; report: FixtureImportReport } | { status: "missing" } | { status: "invalid"; problems: string[] });

/** The document with each fixture that came from a file of the project's folder read there again. */
export async function refreshFixtures<D extends LinkTarget & Record<string, unknown>>(doc: D, read: (path: string) => Promise<string | null>): Promise<{ doc: D; fixtures: FixtureRefresh[] }> {
  let out = doc;
  const fixtures: FixtureRefresh[] = [];
  for (const l of doc.game?.fixtures ?? []) {
    if (!l.path) continue;
    const at = { id: l.fixture.id, path: l.path };
    const text = await read(l.path).catch(() => null);
    if (text === null) {
      fixtures.push({ ...at, status: "missing" });
      continue;
    }
    const got = readGameFixture(text);
    if (!got.fixture) {
      fixtures.push({ ...at, status: "invalid", problems: got.problems });
      continue;
    }
    if (fixtureHash(got.fixture) === l.hash) {
      fixtures.push({ ...at, status: "same" });
      continue;
    }
    /* a file whose fixture now has another id is read as that one, in its place */
    const linked = linkFixture(got.fixture.id === l.fixture.id ? out : unlinkFixture(out, l.fixture.id), got.fixture, { path: l.path, use: false });
    if (linked.problems) {
      fixtures.push({ ...at, status: "invalid", problems: linked.problems });
      continue;
    }
    out = linked.doc;
    fixtures.push({ ...at, status: "updated", report: linked.report });
  }
  return { doc: out, fixtures };
}

/** The document with the contract its configuration names read again, and what that came to; then each fixture read
 *  from the folder again (`fixtures`, when there are any). `read` gives a file's text by its path in the project's
 *  folder, null when it has none. A document that links no contract, or only M3E's example, and names none, reads
 *  none; one with the example takes the game loop's when the folder has it. */
export async function refreshGame<D extends LinkTarget & { external?: { gameContract?: unknown } } & Record<string, unknown>>(doc: D, read: (path: string) => Promise<string | null>): Promise<{ doc: D; refresh: GameRefresh; fixtures?: FixtureRefresh[] }> {
  const contract = await refreshContract(doc, read);
  const again = await refreshFixtures(contract.doc, read);
  return { doc: again.doc, refresh: contract.refresh, ...(again.fixtures.length ? { fixtures: again.fixtures } : {}) };
}

async function refreshContract<D extends LinkTarget & { external?: { gameContract?: unknown } } & Record<string, unknown>>(doc: D, read: (path: string) => Promise<string | null>): Promise<{ doc: D; refresh: GameRefresh }> {
  const path = gameContractPathOf(doc);
  const wanted = readsGameContract(doc);
  if (!wanted && !doc.game) return { doc, refresh: { status: "none" } };
  const text = await read(path).catch(() => null);
  if (text === null) return { doc, refresh: wanted ? { status: "missing", path } : { status: "none" } };
  const got = readGameContract(text);
  if (!got.contract) return { doc, refresh: { status: "invalid", path, problems: got.problems } };
  const linked = linkGame(doc, got.contract);
  if (linked.report.same) return { doc, refresh: { status: "same" } };
  return { doc: linked.doc, refresh: { status: "updated", report: linked.report } };
}
