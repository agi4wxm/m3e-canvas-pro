/* A project on disk, read and written by the file backend, in the format the editor saves (docs/项目文件.md,
 * lib/core/projectFile.ts): one file (`m3e-canvas <name>.json`, pictures inside as data URLs), or a folder
 * (`m3e-project.json`, pictures beside it in `m3e-assets/`). What the bytes mean is the small `ProjectFormat`
 * interface; everything about the disk is here.
 *
 * Writes are atomic (a temporary file beside it, renamed over it), and a file that changed on disk since it was last
 * read or written is never overwritten: the caller is told, and reads it again. The format writes the same document as
 * the same bytes, so comparing what is on disk with what was last read or written is exact. */

import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, fileRefsIn, isAssetPath, readProjectText, serializeProject, type ProjectAssetFile } from "../../lib/core/projectFile";
import type { Doc } from "../../lib/tokens";

/** what a project file's bytes hold */
export interface ProjectFormat {
  /** the document in a file's text, with the pictures it refers to read through `load`; throws a NotAProject */
  parse(text: string, load: (path: string) => Promise<Uint8Array | null>): Promise<Doc>;
  /** the text a document is saved as, and in a folder the pictures to keep beside it */
  serialize(doc: Doc, layout: "file" | "folder"): { text: string; files: ProjectAssetFile[] };
}

export class NotAProject extends Error {}

/** the editor's own format (lib/core/projectFile.ts) */
export const editorProject: ProjectFormat = {
  async parse(text, load) {
    const doc = await readProjectText(text, load);
    if (!doc) throw new NotAProject("It is not an M3E Canvas project (or not JSON), or it was saved by a newer version.");
    return doc;
  },
  serialize: (doc, layout) => serializeProject(doc, { assets: layout === "folder" ? "files" : "inline" }),
};

/** the file as it was last read or written: what decides whether it changed since */
type Seen = { hash: string; mtimeMs: number; size: number } | { absent: true };

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");
const exists = (p: string) => stat(p).then(
  (s) => s,
  () => null,
);

/** the file changed on disk since it was last read or written */
export class FileConflict extends Error {}

/** writes bytes all at once: beside the target first, then over it */
async function atomicWrite(path: string, data: string | Uint8Array) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  const fh = await open(tmp, "wx");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await rename(tmp, path);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

export class ProjectFileStore {
  private seen: Seen | null = null;
  /** the project file itself (in a folder, its m3e-project.json) and how pictures are kept */
  private main: string;
  layout: "file" | "folder";

  constructor(
    readonly path: string,
    readonly format: ProjectFormat = editorProject,
  ) {
    this.layout = basename(path) === FOLDER_MAIN_FILE ? "folder" : "file";
    this.main = path;
  }

  /** a folder given for the project is the folder layout, its file inside it */
  private async locate() {
    const st = await exists(this.path);
    if (st?.isDirectory() || (!st && /[\\/]$/.test(this.path))) {
      this.layout = "folder";
      this.main = join(this.path, FOLDER_MAIN_FILE);
    }
  }

  /** Reads the project. Null when there is none yet (the first write creates it). */
  async read(): Promise<Doc | null> {
    await this.locate();
    let text: string;
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      [text, st] = await Promise.all([readFile(this.main, "utf8"), stat(this.main)]);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        this.seen = { absent: true };
        return null;
      }
      throw e;
    }
    const dir = dirname(this.main);
    const load = async (p: string) => (isAssetPath(p) ? new Uint8Array(await readFile(join(dir, p))) : null);
    const doc = await this.format.parse(text, load);
    /* a single file that refers to pictures beside it is kept that way */
    if (this.layout === "file" && fileRefsIn(JSON.parse(text)).length) this.layout = "folder";
    this.seen = { hash: hashOf(text), mtimeMs: st.mtimeMs, size: st.size };
    return doc;
  }

  /** whether the file is not what was last read or written: someone else saved it, or took it away */
  async changed(): Promise<boolean> {
    const seen = this.seen;
    if (!seen) return true;
    const st = await exists(this.main);
    if (!st) return !("absent" in seen);
    if ("absent" in seen) return true;
    if (st.mtimeMs === seen.mtimeMs && st.size === seen.size) return false;
    /* touched but the same bytes (a sync tool, a save of the same thing) is not a change */
    const now = hashOf(await readFile(this.main, "utf8"));
    if (now !== seen.hash) return true;
    this.seen = { ...seen, mtimeMs: st.mtimeMs, size: st.size };
    return false;
  }

  /** Writes the document over the file, all at once, unless the file changed since it was last read or written. In
   *  a folder its pictures go first: each is named by what it holds, so one already there is the same picture. */
  async write(doc: Doc): Promise<void> {
    if (await this.changed()) throw new FileConflict(`${basename(this.main)} changed on disk since it was read.`);
    const { text, files } = this.format.serialize(doc, this.layout);
    const dir = dirname(this.main);
    if (this.layout === "folder") await mkdir(dir, { recursive: true });
    if (files.length) await mkdir(join(dir, FOLDER_ASSET_DIR), { recursive: true });
    for (const f of files) if (!(await exists(join(dir, f.path)))) await atomicWrite(join(dir, f.path), f.bytes);
    await atomicWrite(this.main, text);
    const st = await stat(this.main);
    this.seen = { hash: hashOf(text), mtimeMs: st.mtimeMs, size: st.size };
  }
}
