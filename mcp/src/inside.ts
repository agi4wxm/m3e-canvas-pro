/* Files inside one folder, read, written and taken away so that nothing outside it is: a project folder's pictures
 * (fileStore.ts). The rule the product export keeps (lib/export/nodeWriter.ts `placeOf`), and a little more:
 *
 * - The folder is the one the project was first read or written in, by its real path. A folder moved away and
 *   replaced since (by another folder, or a link to one) is refused, not followed.
 * - A path is checked as text (lib/export/paths.ts: no `..`, no root, no drive), then piece by piece on the disk: a
 *   symbolic link on the way (a junction on Windows, which Node reports as one) is refused, as is a file with another
 *   name elsewhere (a hard link).
 * - Something could be swapped between the check and the use. A file read is opened without following a last link
 *   and checked again through its handle: the file opened must be the one the check found, in a folder that is still
 *   the real one. A file written goes beside its place first, and is renamed over it (a rename replaces a link, never
 *   writes through one) only once its folder has been checked again. A file is taken away only once its folder has
 *   been checked again; what is left is the instant between that check and the unlink, which Node cannot close
 *   (it has no unlinkat). */

import { randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathProblem } from "../../lib/export/paths";

/** a path that would reach outside the folder, or a folder no longer the one it was */
export class OutsideFolder extends Error {}

const lstatOrNull = (p: string) => lstat(p).catch((e: NodeJS.ErrnoException) => (e.code === "ENOENT" || e.code === "ENOTDIR" ? null : Promise.reject(e)));

/** O_NOFOLLOW where the system has it (not Windows, where the check through the handle stands alone) */
const NOFOLLOW = (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

export class Folder {
  private real: string | null = null;

  /** `dir` as the caller names it; its real path is fixed the first time it is used */
  constructor(readonly dir: string) {}

  /** The folder's real path; refused when it is no longer the one first used. With `make`, made when missing. */
  async root(make = false): Promise<string> {
    if (make) await mkdir(this.dir, { recursive: true });
    const real = await realpath(this.dir);
    if (this.real === null) this.real = real;
    else if (real !== this.real) throw new OutsideFolder(`${this.dir} is no longer the folder the project was opened in (it now leads to ${real}); nothing was read or written there.`);
    return real;
  }

  /** Where `rel` is inside the folder, checked piece by piece; what is there now (null when nothing is). Every piece
   *  but the last must be a folder, and none may be a link. */
  async place(rel: string): Promise<{ full: string; st: Stats | null }> {
    const problem = pathProblem(rel);
    if (problem) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: ${problem}`);
    const root = await this.root();
    const pieces = rel.split("/");
    let at = root;
    let st: Stats | null = null;
    for (let i = 0; i < pieces.length; i++) {
      at = join(at, pieces[i]);
      st = await lstatOrNull(at);
      if (!st) return { full: join(root, ...pieces), st: null };
      if (st.isSymbolicLink()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: ${at} is a link`);
      if (i < pieces.length - 1 && !st.isDirectory()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: ${at} is not a folder`);
    }
    return { full: at, st };
  }

  /** the folder at `rel` (inside this one; "" is this one) is still the real one it names */
  private async stillThere(rel: string) {
    const root = await this.root();
    const want = rel ? join(root, ...rel.split("/")) : root;
    const real = await realpath(want).catch(() => "");
    if (real !== want) throw new OutsideFolder(`refusing ${JSON.stringify(rel || ".")}: the folder changed while it was used`);
  }

  /** the folder holding the file at `rel`, as `rel` names it */
  private static parent = (rel: string) => rel.split("/").slice(0, -1).join("/");

  /** whether a file is at `rel` (a link there is refused, not taken as one) */
  async isFile(rel: string): Promise<boolean> {
    const { st } = await this.place(rel);
    if (st && !st.isFile()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it is not a file`);
    return !!st;
  }

  /** the bytes of the file at `rel` */
  async read(rel: string): Promise<Uint8Array> {
    const { full, st } = await this.place(rel);
    if (!st) throw Object.assign(new Error(`${rel} is not there`), { code: "ENOENT" });
    if (!st.isFile()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it is not a file`);
    if (st.nlink > 1) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it has another name elsewhere (a hard link)`);
    const fh = await open(full, constants.O_RDONLY | NOFOLLOW);
    try {
      const got = await fh.stat();
      if (!got.isFile() || got.ino !== st.ino || got.dev !== st.dev) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it changed while it was opened`);
      await this.stillThere(Folder.parent(rel));
      return new Uint8Array(await fh.readFile());
    } finally {
      await fh.close();
    }
  }

  /** Writes `bytes` at `rel`, all at once (beside it first, then renamed over it), the folders on the way made when
   *  missing; never through a link. */
  async write(rel: string, bytes: Uint8Array | string): Promise<void> {
    const pieces = rel.split("/");
    /* the folders on the way, made one at a time and each checked */
    for (let i = 1; i < pieces.length; i++) {
      const sub = pieces.slice(0, i).join("/");
      const { full, st } = await this.place(sub);
      if (!st) await mkdir(full).catch((e: NodeJS.ErrnoException) => (e.code === "EEXIST" ? undefined : Promise.reject(e)));
      const now = await this.place(sub);
      if (!now.st?.isDirectory()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: ${now.full} is not a folder`);
    }
    const { full, st } = await this.place(rel);
    if (st && !st.isFile()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it is not a file`);
    const tmp = join(dirname(full), `.${basename(full)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
    const fh = await open(tmp, "wx", 0o666);
    try {
      await fh.writeFile(bytes);
      await fh.sync();
    } finally {
      await fh.close();
    }
    try {
      await this.stillThere(Folder.parent(rel));
      await rename(tmp, full);
    } catch (e) {
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }

  /** the names of the files (not links, not folders) in the folder at `rel`; none when there is no such folder */
  async files(rel: string): Promise<string[]> {
    const { full, st } = await this.place(rel);
    if (!st) return [];
    if (!st.isDirectory()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it is not a folder`);
    const names = (await readdir(full, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
    await this.stillThere(rel);
    return names;
  }

  /** what is at `rel`, without following a link (a link is refused) */
  async stat(rel: string): Promise<Stats | null> {
    return (await this.place(rel)).st;
  }

  /** Takes the file at `rel` away; whether it went. A link there is refused, and so is a folder changed meanwhile. */
  async remove(rel: string): Promise<boolean> {
    const { full, st } = await this.place(rel);
    if (!st) return false;
    if (!st.isFile()) throw new OutsideFolder(`refusing ${JSON.stringify(rel)}: it is not a file`);
    await this.stillThere(Folder.parent(rel));
    return unlink(full).then(
      () => true,
      () => false,
    );
  }
}
