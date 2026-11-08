/* A project on disk, read and written by the file backend, in the format the editor saves (docs/项目文件.md,
 * lib/core/projectFile.ts): one file (`m3e-canvas <name>.json`, pictures inside as data URLs), or a folder
 * (`m3e-project.json`, pictures beside it in `m3e-assets/`). What the bytes mean is the small `ProjectFormat`
 * interface; everything about the disk is here.
 *
 * Writes are atomic (a temporary file beside it, renamed over it), and a file that changed on disk since it was last
 * read or written is never overwritten: the caller is told, and reads it again. The format writes the same document as
 * the same bytes, so comparing what is on disk with what was last read or written is exact.
 *
 * A folder is written in the order the editor's folder sync uses (lib/projects/fileLink.ts), which leaves a whole
 * version on disk at every point: every file of m3e-assets/ the new version refers to, there and holding exactly what
 * its name says (one of that name holding something else is written again) and read back; then the project file; then
 * the files nothing refers to any more are taken away, of those provably the format's own: one this server wrote and
 * nothing changed since, or one whose name is the hash of what it holds (lib/core/projectFile.ts `isFormatAsset`) and
 * that another program did not write a moment ago (its own save may be under way). A file someone put there by hand is
 * never touched. Pictures and the mock library's files of every format are kept and taken away alike.
 *
 * The pictures are read, written and taken away only inside the project's folder (inside.ts): a link on the way (a
 * symbolic link, a junction, a hard link) is refused rather than followed, and so is a folder replaced since the
 * project was opened. The project file itself is the one named: written by a rename beside it, never through a link. */

import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { ASSET_GRACE_MS, FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, fileRefsIn, isAssetFileName, isAssetPath, isFormatAsset, readProjectText, serializeProject, type ProjectAssetFile } from "../../lib/core/projectFile";
import type { Doc } from "../../lib/tokens";
import { Folder, OutsideFolder } from "./inside";

export { OutsideFolder };

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

/** a file of m3e-assets/ as this server last wrote or checked it: what it was then, and whether it wrote it */
type Mark = { size: number; mtimeMs: number; own: boolean };

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** writes bytes all at once: beside the target first, then over it */
async function atomicWrite(path: string, data: string | Uint8Array) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  /* the file replaced keeps who may read it: a project the author made private stays private */
  const was = await exists(path);
  const mode = was ? was.mode & 0o777 : undefined;
  const fh = await open(tmp, "wx", mode ?? 0o666);
  try {
    if (mode !== undefined) await fh.chmod(mode);
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
  /** the files of m3e-assets/ this server wrote or found holding what they should, by file name */
  private readonly marks = new Map<string, Mark>();
  /** the project file itself (in a folder, its m3e-project.json) and how pictures are kept */
  private main: string;
  layout: "file" | "folder";
  /** the folder the project file is in, where its pictures are */
  private folder: Folder | null = null;

  constructor(
    readonly path: string,
    readonly format: ProjectFormat = editorProject,
    /** told about a picture that was not read because it is not inside the folder */
    private readonly warn: (m: string) => void = () => {},
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

  private dir(): Folder {
    const dir = dirname(this.main);
    if (this.folder?.dir !== dir) this.folder = new Folder(dir);
    return this.folder;
  }

  /** Reads the project. Null when there is none yet (the first write creates it). */
  async read(): Promise<Doc | null> {
    if (!this.folder) await this.locate();
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
    const folder = this.dir();
    /* the folder it was opened in, and no other: one replaced since is not read from */
    await folder.root();
    const refused: string[] = [];
    const load = async (p: string) => {
      if (!isAssetPath(p)) return null;
      try {
        return await folder.read(p);
      } catch (e) {
        if (e instanceof OutsideFolder) refused.push(e.message);
        throw e;
      }
    };
    const doc = await this.format.parse(text, load);
    for (const m of refused) this.warn(`A picture was left empty: ${m}.`);
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
   *  a folder the files it refers to go first, each checked (`put`); any that cannot be leaves the project file as it
   *  was. Then what nothing refers to any more is taken away (`prune`). */
  async write(doc: Doc): Promise<void> {
    if (await this.changed()) throw new FileConflict(`${basename(this.main)} changed on disk since it was read.`);
    const { text, files } = this.format.serialize(doc, this.layout);
    const folder = this.dir();
    await folder.root(this.layout === "folder");
    for (const f of files) await this.put(folder, f);
    /* still the folder it was opened in, just before the file goes over its place */
    await folder.root();
    await atomicWrite(this.main, text);
    const st = await stat(this.main);
    this.seen = { hash: hashOf(text), mtimeMs: st.mtimeMs, size: st.size };
    if (this.layout === "folder") await this.prune(new Set(files.map((f) => f.path.slice(FOLDER_ASSET_DIR.length + 1)))).catch(() => []);
  }

  /** A file the document refers to, in m3e-assets/ and holding exactly its bytes: one this server wrote or checked and
   *  that nothing changed since is left as it is; one of that name holding anything else (a broken or partial copy)
   *  is written again, and whatever is written is read back. Throws when it cannot be, or when a link is in the way. */
  private async put(folder: Folder, f: ProjectAssetFile) {
    const name = f.path.slice(FOLDER_ASSET_DIR.length + 1);
    const st = await folder.stat(f.path);
    if (st && !st.isFile()) throw new OutsideFolder(`refusing ${JSON.stringify(f.path)}: it is not a file`);
    const mark = this.marks.get(name);
    if (st && mark && st.size === mark.size && st.mtimeMs === mark.mtimeMs) return;
    if (st && st.size === f.bytes.length) {
      /* a hard link there is not read: written again, its name is this folder's own file */
      const there = await folder.read(f.path).catch(() => null);
      if (there && sameBytes(there, f.bytes)) {
        this.marks.set(name, { size: st.size, mtimeMs: st.mtimeMs, own: mark?.own ?? false });
        return;
      }
    }
    await folder.write(f.path, f.bytes);
    if (!sameBytes(await folder.read(f.path), f.bytes)) throw new Error(`${f.path} does not read back as it was written.`);
    const back = await folder.stat(f.path);
    if (back) this.marks.set(name, { size: back.size, mtimeMs: back.mtimeMs, own: true });
  }

  /** Takes away the files of m3e-assets/ the document no longer refers to, of those provably the format's own: one
   *  this server wrote that nothing changed since, or one named by the hash of exactly what it holds that another
   *  program did not write a moment ago. A file named any other way, or holding anything else, stays. What went. */
  async prune(wanted: ReadonlySet<string>, now = Date.now()): Promise<string[]> {
    const folder = this.dir();
    let names: string[];
    try {
      /* a link where m3e-assets/ should be is refused: what it leads to is not this project's */
      names = await folder.files(FOLDER_ASSET_DIR);
    } catch {
      return [];
    }
    for (const name of this.marks.keys()) if (!names.includes(name)) this.marks.delete(name);
    const gone: string[] = [];
    for (const name of names) {
      if (wanted.has(name) || !isAssetFileName(name)) continue;
      const rel = `${FOLDER_ASSET_DIR}/${name}`;
      const st = await folder.stat(rel).catch(() => null);
      if (!st?.isFile()) continue;
      const mark = this.marks.get(name);
      const ours = !!mark?.own && st.size === mark.size && st.mtimeMs === mark.mtimeMs;
      if (!ours) {
        if (now - st.mtimeMs < ASSET_GRACE_MS) continue;
        /* named like one of the format's, but holding something else: someone's own file */
        const bytes = await folder.read(rel).catch(() => null);
        if (!bytes || !isFormatAsset(name, bytes)) continue;
      }
      if (await folder.remove(rel).catch(() => false)) {
        gone.push(name);
        this.marks.delete(name);
      }
    }
    return gone;
  }
}
