/* A project on disk, read and written by the file backend, in the format the editor saves (docs/项目文件.md,
 * lib/core/projectFile.ts): one file (`m3e-canvas <name>.json`, pictures inside as data URLs), or a folder
 * (`m3e-project.json`, pictures beside it in `m3e-assets/`). What the bytes mean is the small `ProjectFormat`
 * interface; everything about the disk is here.
 *
 * Writes are atomic (a temporary file beside it, renamed over it), and a file that changed on disk since it was last
 * read or written is never overwritten: the caller is told, and reads it again. The format writes the same document as
 * the same bytes, so comparing what is on disk with what was last read or written is exact.
 *
 * In a folder, a picture the saved document no longer refers to is taken away from m3e-assets/ after each write, but
 * only one this server wrote itself, or one whose name is the hash of what it holds (as the format names them): a file
 * someone put there by hand is never touched, and one another program wrote a moment ago is left for its own save.
 *
 * The pictures are read, written and taken away only inside the project's folder (inside.ts): a link on the way (a
 * symbolic link, a junction, a hard link) is refused rather than followed, and so is a folder replaced since the
 * project was opened. The project file itself is the one named: written by a rename beside it, never through a link. */

import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { bytesToBase64, digest, FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, fileRefsIn, isAssetPath, readProjectText, serializeProject, type ProjectAssetFile } from "../../lib/core/projectFile";
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
    if (!doc) throw new NotAProject("It is not an M3E Canvas project (or not JSON), or it was saved by a newer version in a shape this one cannot read.");
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

/** a picture's file name as the format gives it: its hash and an extension */
const HASH_NAME = /^([a-z0-9]+)\.(?:png|jpg|webp|gif|avif|svg)$/;
/** a picture another program wrote this recently may belong to a save of its own still under way */
export const ASSET_GRACE_MS = 60_000;

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
  /** the pictures this server wrote into m3e-assets/, by file name */
  private readonly wrote = new Set<string>();
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
   *  a folder its pictures go first: each is named by what it holds, so one already there is the same picture. */
  async write(doc: Doc): Promise<void> {
    if (await this.changed()) throw new FileConflict(`${basename(this.main)} changed on disk since it was read.`);
    const { text, files } = this.format.serialize(doc, this.layout);
    const folder = this.dir();
    await folder.root(this.layout === "folder");
    for (const f of files) {
      if (await folder.isFile(f.path)) continue;
      await folder.write(f.path, f.bytes);
      this.wrote.add(f.path.slice(FOLDER_ASSET_DIR.length + 1));
    }
    /* still the folder it was opened in, just before the file goes over its place */
    await folder.root();
    await atomicWrite(this.main, text);
    const st = await stat(this.main);
    this.seen = { hash: hashOf(text), mtimeMs: st.mtimeMs, size: st.size };
    if (this.layout === "folder") await this.prune(new Set(files.map((f) => f.path.slice(FOLDER_ASSET_DIR.length + 1)))).catch(() => []);
  }

  /** Takes away the pictures of m3e-assets/ the document no longer refers to: those this server wrote, and those
   *  whose name is the hash of what they hold, unless another program wrote them a moment ago. What went, by name. */
  async prune(wanted: ReadonlySet<string>, now = Date.now()): Promise<string[]> {
    const folder = this.dir();
    let names: string[];
    try {
      /* a link where m3e-assets/ should be is refused: what it leads to is not this project's */
      names = await folder.files(FOLDER_ASSET_DIR);
    } catch {
      return [];
    }
    const gone: string[] = [];
    for (const name of names) {
      const m = HASH_NAME.exec(name);
      if (!m || wanted.has(name)) continue;
      const rel = `${FOLDER_ASSET_DIR}/${name}`;
      if (!this.wrote.has(name)) {
        const st = await folder.stat(rel).catch(() => null);
        if (!st?.isFile() || now - st.mtimeMs < ASSET_GRACE_MS) continue;
        /* named like one of the format's, but holding something else: someone's own file */
        const bytes = await folder.read(rel).catch(() => null);
        if (!bytes || digest(bytesToBase64(bytes)) !== m[1]) continue;
      }
      if (await folder.remove(rel).catch(() => false)) gone.push(name);
      this.wrote.delete(name);
    }
    return gone;
  }
}
