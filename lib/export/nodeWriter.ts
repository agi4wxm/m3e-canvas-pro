/* A product written into a folder on disk from Node (scripts/export.ts, the MCP server's export_product): the folder
 * is read, the merge planned (lib/export/merge.ts), and the plan carried out. Nothing is written outside the folder:
 * every path is checked as text (lib/export/paths.ts) and against the disk, where a symbolic link on the way is
 * refused rather than followed. Each file is written beside its place and renamed over it. */

import { randomBytes } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { CONFLICT_SUFFIX, MANIFEST_PATH, parseManifest, pathsToHash, pathsToRead, planExport, type ExportPlan } from "./merge";
import { pathProblem } from "./paths";
import { sha256 } from "./sha256";
import type { Product } from "./types";

export class FolderRefused extends Error {}

const lstatOrNull = (p: string) => lstat(p).catch(() => null);

/** the file's place in the folder, checked: inside it, no link on the way */
async function placeOf(root: string, path: string): Promise<string> {
  const problem = pathProblem(path);
  if (problem) throw new FolderRefused(`refusing to write ${JSON.stringify(path)}: ${problem}`);
  const full = resolve(root, ...path.split("/"));
  if (!full.startsWith(root + sep)) throw new FolderRefused(`refusing to write ${JSON.stringify(path)}: outside the folder`);
  let at = root;
  for (const piece of path.split("/")) {
    at = join(at, piece);
    const s = await lstatOrNull(at);
    if (!s) break;
    if (s.isSymbolicLink()) throw new FolderRefused(`refusing to write ${JSON.stringify(path)}: ${at} is a link`);
  }
  return full;
}

/** what is at a path: its bytes' hash, or undefined when there is no file */
async function hashAt(root: string, path: string): Promise<string | undefined> {
  const full = await placeOf(root, path);
  const s = await lstatOrNull(full);
  if (!s) return undefined;
  if (!s.isFile()) throw new FolderRefused(`${path} is in the way: it is not a file`);
  return sha256(new Uint8Array(await readFile(full)));
}

async function atomicWrite(full: string, body: string | Uint8Array) {
  await mkdir(dirname(full), { recursive: true });
  const tmp = join(dirname(full), `.${randomBytes(6).toString("hex")}.m3e-tmp`);
  await writeFile(tmp, body);
  await rename(tmp, full);
}

/** whether a folder holds anything but what an export left (or nothing at all) */
async function foreign(root: string): Promise<boolean> {
  const names = await readdir(root).catch(() => [] as string[]);
  if (!names.length) return false;
  return !(await lstatOrNull(join(root, ...MANIFEST_PATH.split("/"))))?.isFile();
}

export type FolderExport = ExportPlan & { dir: string };

/** Exports `product` into `dir` (made when missing). A folder that holds other things and no export manifest is
 *  refused unless `force`: the export would add its files among them. */
export async function exportToFolder(dir: string, product: Product, o: { force?: boolean } = {}): Promise<FolderExport> {
  await mkdir(dir, { recursive: true });
  const root = await realpath(dir);
  if (!o.force && (await foreign(root))) throw new FolderRefused(`${dir} is not empty and holds no export of a product (.m3e/manifest.json): pick an empty folder, or pass force`);
  const manifestFile = await placeOf(root, MANIFEST_PATH);
  const previous = parseManifest((await lstatOrNull(manifestFile))?.isFile() ? await readFile(manifestFile, "utf8") : null);
  const disk: Record<string, string | undefined> = {};
  for (const path of pathsToHash(product.files, previous)) disk[path] = await hashAt(root, path);
  const texts: Record<string, string | undefined> = {};
  for (const path of pathsToRead(product.files)) if (disk[path] !== undefined) texts[path] = await readFile(await placeOf(root, path), "utf8");
  const plan = planExport({ product: product.name, next: product.files, disk, texts, previous });
  /* the manifest last: an export cut short leaves the last one's, which only ever makes more conflicts, never fewer */
  for (const w of plan.writes) if (w.why !== "manifest") await atomicWrite(await placeOf(root, w.path), w.body);
  for (const path of plan.deletes) {
    const full = await placeOf(root, path);
    await unlink(full).catch(() => {});
    /* the folders a removed file leaves empty go too, up to the product's root */
    for (let at = dirname(full); at.startsWith(root + sep); at = dirname(at)) if (!(await rmdir(at).then(() => true, () => false))) break;
  }
  for (const w of plan.writes) if (w.why === "manifest") await atomicWrite(manifestFile, w.body);
  return { ...plan, dir: root };
}

/** a plan as the lines a terminal shows */
export function reportLines(plan: ExportPlan): string[] {
  const written = plan.writes.filter((w) => w.why !== "conflict" && w.why !== "manifest");
  return [
    `${written.length} written, ${plan.unchanged.length} unchanged, ${plan.kept.length} custom kept, ${plan.merged.length} merged, ${plan.conflicts.length} conflicts, ${plan.removed.length} removed`,
    ...plan.conflicts.map((c) => `conflict: ${c.path} was changed since the last export; the new version is in ${c.copy}`),
    ...plan.orphaned.map((p) => `left: ${p} is no longer generated but was changed, so it stays`),
    ...plan.notes.map((n) => `note: ${n}`),
  ];
}

export { CONFLICT_SUFFIX };
