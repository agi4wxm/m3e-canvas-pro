/* A folder project's gameplay contract read where the project's configuration says it is (`Doc.external.gameContract`,
 * a path inside the folder, `game-contract.m3e-game.json` by default, as the asset manifest's), each time the project is
 * opened (docs/玩法契约.md, “文件夹项目”): a contract that reads as the one the document has
 * changes nothing; a changed one is linked in its place, with what it changed and what in the design it broke; one
 * that is gone or no contract any more leaves the document as it was and says so. The hub decision of the plan: M3E
 * depends on the file's format, never on where the game loop keeps it, so moving it is changing that one path. */

import { readGameContract } from "./format";
import { gameContractPathOf, linkGame, type GameImportReport, type LinkTarget } from "./link";

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

/** The document with the contract its configuration names read again, and what that came to. `read` gives a file's
 *  text by its path in the project's folder, null when it has none. A document that links no contract, or only M3E's
 *  example, and names none, reads none; one with the example takes the game loop's when the folder has it. */
export async function refreshGame<D extends LinkTarget & { external?: { gameContract?: unknown } } & Record<string, unknown>>(doc: D, read: (path: string) => Promise<string | null>): Promise<{ doc: D; refresh: GameRefresh }> {
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
