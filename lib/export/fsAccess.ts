/* A product written into a folder the person picked in the browser (File System Access, Chromium): the folder is read
 * through its handle, the merge planned (lib/export/merge.ts) and carried out. A handle cannot reach outside the
 * folder it was picked for, and every path is checked as text before it is asked for. The folder picked for a project
 * is remembered (lib/projects/db.ts, `export-dir:<project>`), so the next export goes back to it. */

import type { DirHandle, FileHandle } from "../projects/fileLink";
import { MANIFEST_PATH, parseManifest, pathsToHash, pathsToRead, planExport, type ExportPlan } from "./merge";
import { pathProblem } from "./paths";
import { sha256 } from "./sha256";
import type { Product } from "./types";

const notFound = (e: unknown) => e instanceof DOMException && (e.name === "NotFoundError" || e.name === "TypeMismatchError");

/** the folder holding a path, made on the way when `create`; null when it is not there */
async function folderOf(root: DirHandle, path: string, create: boolean): Promise<DirHandle | null> {
  const problem = pathProblem(path);
  if (problem) throw new Error(`refusing to write ${JSON.stringify(path)}: ${problem}`);
  let dir = root;
  for (const name of path.split("/").slice(0, -1)) {
    try {
      dir = await dir.getDirectoryHandle(name, { create });
    } catch (e) {
      if (!create && notFound(e)) return null;
      throw e;
    }
  }
  return dir;
}

const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

async function fileAt(root: DirHandle, path: string): Promise<File | null> {
  const dir = await folderOf(root, path, false);
  if (!dir) return null;
  try {
    return await (await dir.getFileHandle(nameOf(path))).getFile();
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

async function write(root: DirHandle, path: string, body: string | Uint8Array) {
  const dir = (await folderOf(root, path, true))!;
  const handle: FileHandle = await dir.getFileHandle(nameOf(path), { create: true });
  const out = await handle.createWritable();
  try {
    await out.write(typeof body === "string" ? body : (body as unknown as BufferSource));
    await out.close();
  } catch (e) {
    await out.abort?.().catch(() => {});
    throw e;
  }
}

async function remove(root: DirHandle, path: string) {
  const pieces = path.split("/");
  const dirs: DirHandle[] = [root];
  for (const name of pieces.slice(0, -1)) {
    try {
      dirs.push(await dirs[dirs.length - 1].getDirectoryHandle(name));
    } catch {
      return;
    }
  }
  await dirs[dirs.length - 1].removeEntry(pieces[pieces.length - 1]).catch(() => {});
  /* the folders a removed file leaves empty go too, up to the product's root */
  for (let i = dirs.length - 1; i > 0; i--) {
    let empty = true;
    for await (const entry of dirs[i].entries()) {
      void entry;
      empty = false;
      break;
    }
    if (!empty) break;
    await dirs[i - 1].removeEntry(pieces[i - 1]).catch(() => {});
  }
}

/** whether the folder holds anything, and whether an export left it */
export async function folderState(root: DirHandle): Promise<{ empty: boolean; exported: boolean }> {
  let empty = true;
  for await (const entry of root.entries()) {
    void entry;
    empty = false;
    break;
  }
  return { empty, exported: !!(await fileAt(root, MANIFEST_PATH)) };
}

/** Exports `product` into the folder. Progress is told as files looked at, then files written. */
export async function exportToDirectory(root: DirHandle, product: Product, onProgress?: (done: number, total: number) => void): Promise<ExportPlan> {
  const manifest = await fileAt(root, MANIFEST_PATH);
  const previous = parseManifest(manifest ? await manifest.text() : null);
  const paths = pathsToHash(product.files, previous);
  const read = new Set(pathsToRead(product.files));
  const disk: Record<string, string | undefined> = {};
  const texts: Record<string, string | undefined> = {};
  let done = 0;
  for (const path of paths) {
    const file = await fileAt(root, path);
    if (file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      disk[path] = sha256(bytes);
      if (read.has(path)) texts[path] = new TextDecoder().decode(bytes);
    }
    onProgress?.(++done, paths.length);
  }
  const plan = planExport({ product: product.name, next: product.files, disk, texts, previous });
  const total = plan.writes.length + plan.deletes.length;
  done = 0;
  /* the manifest last: an export cut short leaves the last one's, which only ever makes more conflicts, never fewer */
  for (const w of plan.writes.filter((x) => x.why !== "manifest")) {
    await write(root, w.path, w.body);
    onProgress?.(++done, total);
  }
  for (const path of plan.deletes) {
    await remove(root, path);
    onProgress?.(++done, total);
  }
  for (const w of plan.writes.filter((x) => x.why === "manifest")) {
    await write(root, w.path, w.body);
    onProgress?.(++done, total);
  }
  return plan;
}

/* ---------- the folder a project exports into ---------- */

type DirPicker = { showDirectoryPicker?(o?: { mode?: "read" | "readwrite"; id?: string }): Promise<DirHandle> };

/** whether this browser can pick a folder to export into */
export const canExportToFolder = () => typeof window !== "undefined" && typeof (window as unknown as DirPicker).showDirectoryPicker === "function";

/** the folder to export into, picked by the person; null when they changed their mind or the browser cannot pick */
export async function pickExportFolder(): Promise<DirHandle | null> {
  const pick = typeof window === "undefined" ? undefined : (window as unknown as DirPicker).showDirectoryPicker;
  if (!pick) return null;
  try {
    return await pick({ mode: "readwrite", id: "m3e-export" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

const kvKey = (project: string) => `export-dir:${project}`;
/* the folders of this tab's projects: the handle in use, so it is not read back from IndexedDB each time */
const known = new Map<string, DirHandle>();

/** the folder a project last exported into, when the browser still knows it */
export async function rememberedFolder(project: string): Promise<DirHandle | null> {
  const here = known.get(project);
  if (here) return here;
  try {
    const { getKv } = await import("../projects/db");
    const handle = await getKv<DirHandle>(kvKey(project));
    if (handle && typeof handle === "object" && handle.kind === "directory") known.set(project, handle);
    return known.get(project) ?? null;
  } catch {
    return null;
  }
}

/** remembers the folder a project exported into, for the next export */
export async function rememberFolder(project: string, handle: DirHandle): Promise<void> {
  known.set(project, handle);
  try {
    const { putKv } = await import("../projects/db");
    await putKv(kvKey(project), handle);
  } catch {
    /* kept for this tab only */
  }
}
