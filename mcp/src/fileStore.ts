/* A project file on disk, read and written by the file backend. What the file's bytes mean is one small interface
 * (`ProjectFormat`), so the format can change in one place: today it is the JSON the editor saves (lib/project.ts,
 * `m3e-canvas <name>.json`); the multi-project work's headless module (lib/core/projectFile.ts) can stand in for it.
 *
 * Writes are atomic (a temporary file beside it, renamed over it), and a file that changed on disk since it was last
 * read or written is never overwritten: the caller is told, and reads it again. */

import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { openProject, projectFile } from "../../lib/project";
import type { Doc } from "../../lib/tokens";

/** what a project file's bytes hold */
export interface ProjectFormat {
  /** the document in a file's text; throws a NotAProject when it is not one */
  parse(text: string): Doc;
  /** the text a document is saved as */
  serialize(doc: Doc): string;
}

export class NotAProject extends Error {}

/** the editor's own file: the document in its `m3e-project` envelope, as "Save project" writes it */
export const jsonProject: ProjectFormat = {
  parse(text) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (e) {
      throw new NotAProject(`It is not JSON (${e instanceof Error ? e.message : String(e)}).`);
    }
    const doc = openProject(value);
    if (!doc) throw new NotAProject("It is not an M3E Canvas project, or it was saved by a newer version.");
    return doc;
  },
  serialize: (doc) => JSON.stringify(projectFile(doc), null, 2),
};

/** the file as it was last read or written: what decides whether it changed since */
type Seen = { hash: string; mtimeMs: number; size: number } | { absent: true };

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

/** the file changed on disk since it was last read or written */
export class FileConflict extends Error {}

export class ProjectFileStore {
  private seen: Seen | null = null;

  constructor(
    readonly path: string,
    readonly format: ProjectFormat = jsonProject,
  ) {}

  /** Reads the file. Null when there is none yet (the first write creates it). */
  async read(): Promise<Doc | null> {
    let text: string;
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      [text, st] = await Promise.all([readFile(this.path, "utf8"), stat(this.path)]);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        this.seen = { absent: true };
        return null;
      }
      throw e;
    }
    const doc = this.format.parse(text);
    this.seen = { hash: hashOf(text), mtimeMs: st.mtimeMs, size: st.size };
    return doc;
  }

  /** whether the file is not what was last read or written: someone else saved it, or took it away */
  async changed(): Promise<boolean> {
    const seen = this.seen;
    if (!seen) return true;
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return !("absent" in seen);
      throw e;
    }
    if ("absent" in seen) return true;
    if (st.mtimeMs === seen.mtimeMs && st.size === seen.size) return false;
    /* touched but the same bytes (a sync tool, a save of the same thing) is not a change */
    const now = hashOf(await readFile(this.path, "utf8"));
    if (now !== seen.hash) return true;
    this.seen = { ...seen, mtimeMs: st.mtimeMs, size: st.size };
    return false;
  }

  /** Writes the document over the file, all at once, unless the file changed since it was last read or written. */
  async write(doc: Doc): Promise<void> {
    if (await this.changed()) throw new FileConflict(`${basename(this.path)} changed on disk since it was read.`);
    const text = this.format.serialize(doc);
    const tmp = join(dirname(this.path), `.${basename(this.path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
    const fh = await open(tmp, "wx");
    try {
      await fh.writeFile(text, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    try {
      await rename(tmp, this.path);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
    const st = await stat(this.path);
    this.seen = { hash: hashOf(text), mtimeMs: st.mtimeMs, size: st.size };
  }
}
