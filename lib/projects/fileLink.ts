/* A project kept in sync with a file on this computer through the File System Access API (Chromium): once bound, every
 * change is written to it a moment later, in one atomic write (`createWritable` writes aside and swaps on close). A
 * folder takes the project file and its pictures as files of their own (lib/core/projectFile.ts). After a reload the
 * browser asks again before the editor may write (`reconnect`), and a file changed by something else since the editor
 * last wrote it is never written over without asking (`conflict`). */

import { FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, digest, isAssetPath, readProjectText, serializeProject } from "../core/projectFile";
import type { Doc } from "../tokens";
import type { FileRecord } from "./db";

/* ---------- the little of the API that is used, typed here: not every lib.dom has it ---------- */

type Perm = "granted" | "denied" | "prompt";
type Permissions = { queryPermission?(o: { mode: "read" | "readwrite" }): Promise<Perm>; requestPermission?(o: { mode: "read" | "readwrite" }): Promise<Perm> };
type Writable = { write(data: string | BufferSource | Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> };
export type FileHandle = FileSystemHandle & Permissions & { kind: "file"; getFile(): Promise<File>; createWritable(o?: { keepExistingData?: boolean }): Promise<Writable> };
export type DirHandle = FileSystemHandle &
  Permissions & {
    kind: "directory";
    getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>;
    getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
    removeEntry(name: string): Promise<void>;
    entries(): AsyncIterable<[string, FileSystemHandle]>;
  };
type Pickers = {
  showSaveFilePicker?(o?: { suggestedName?: string; types?: { description?: string; accept: Record<string, string[]> }[] }): Promise<FileHandle>;
  showOpenFilePicker?(o?: { multiple?: boolean; types?: { description?: string; accept: Record<string, string[]> }[] }): Promise<FileHandle[]>;
  showDirectoryPicker?(o?: { mode?: "read" | "readwrite"; id?: string }): Promise<DirHandle>;
};
const pickers = () => (typeof window === "undefined" ? {} : (window as unknown as Pickers));
const JSON_TYPES = [{ description: "M3E Canvas project", accept: { "application/json": [".json"] } }];

/** whether this browser can keep a project in sync with a file it picks */
export const canSyncFile = () => typeof pickers().showSaveFilePicker === "function";
/** whether it can pick a folder */
export const canPickFolder = () => typeof pickers().showDirectoryPicker === "function";

const cancelled = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** the file a project is to be saved to, picked by the person; null when they changed their mind */
export async function pickSaveFile(suggestedName: string): Promise<FileHandle | null> {
  try {
    return (await pickers().showSaveFilePicker?.({ suggestedName, types: JSON_TYPES })) ?? null;
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

export async function pickFolder(): Promise<DirHandle | null> {
  try {
    return (await pickers().showDirectoryPicker?.({ mode: "readwrite", id: "m3e-project" })) ?? null;
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

/** a project file picked to open, with its handle where the browser gives one; undefined when it cannot pick here */
export async function pickOpenFile(): Promise<FileHandle | null | undefined> {
  const pick = pickers().showOpenFilePicker;
  if (!pick) return undefined;
  try {
    return (await pick({ types: JSON_TYPES }))[0] ?? null;
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

/** whether the editor may write to the file or folder now, asking only when `ask` (a press, which the browser wants) */
export async function mayWrite(handle: FileSystemHandle, ask = false): Promise<boolean> {
  const h = handle as FileSystemHandle & Permissions;
  try {
    if ((await h.queryPermission?.({ mode: "readwrite" })) === "granted" || !h.queryPermission) return true;
    if (!ask || !h.requestPermission) return false;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

/* ---------- reading a project back from disk ---------- */

async function readBytes(dir: DirHandle, path: string): Promise<Uint8Array | null> {
  if (!isAssetPath(path)) return null;
  const [folder, name] = path.split("/");
  const file = await (await (await dir.getDirectoryHandle(folder)).getFileHandle(name)).getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/** the project file inside a folder: the one it is kept as, else the only JSON there that is a project */
async function mainFileOf(dir: DirHandle): Promise<FileHandle | null> {
  try {
    return await dir.getFileHandle(FOLDER_MAIN_FILE);
  } catch {}
  const found: FileHandle[] = [];
  for await (const [name, h] of dir.entries()) if (h.kind === "file" && name.toLowerCase().endsWith(".json")) found.push(h as FileHandle);
  for (const h of found) {
    const text = await (await h.getFile()).text();
    if (text.includes('"m3e-project"')) return h;
  }
  return null;
}

/** What a file or folder holds: the project's document (null when it is not one) and the text it was read from. */
export async function readFromDisk(handle: FileSystemHandle): Promise<{ doc: Doc | null; text: string | null; name: string }> {
  if (handle.kind === "directory") {
    const dir = handle as DirHandle;
    const main = await mainFileOf(dir);
    if (!main) return { doc: null, text: null, name: dir.name };
    const text = await (await main.getFile()).text();
    return { doc: await readProjectText(text, (p) => readBytes(dir, p)), text, name: dir.name };
  }
  const file = await (handle as FileHandle).getFile();
  const text = await file.text();
  return { doc: await readProjectText(text), text, name: file.name };
}

/* ---------- keeping a project in sync ---------- */

export type LinkStatus = "saved" | "pending" | "saving" | "reconnect" | "conflict" | "error";
export type LinkState = { kind: "file" | "folder"; name: string; status: LinkStatus; at?: number; error?: string };

/** how long after the last change the file is written, and how long a stream of changes may hold it back */
const QUIET_MS = 700;
const MAX_WAIT_MS = 3000;
/** the pictures the editor writes into a folder, and so may remove from it */
const OWN_ASSET = /^[a-z0-9]+\.(?:png|jpg|webp|gif|avif|svg)$/;

export type LinkDeps = {
  /** the document with any picture still kept by reference in the browser put back */
  resolve: (doc: Doc) => Promise<Doc>;
  /** keeps what the browser knows of the file (the handle, how it was left) */
  save: (rec: FileRecord) => Promise<void>;
};

export class FileLink {
  state: LinkState;
  private listeners = new Set<(s: LinkState) => void>();
  private doc: Doc | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstAt = 0;
  private running: Promise<void> | null = null;
  /** what the file held when it was found changed: the version `loadDisk` brings in */
  private disk: string | null = null;
  /** the project no longer writes here: nothing waiting is written */
  private closed = false;

  constructor(
    readonly rec: FileRecord,
    private deps: LinkDeps,
  ) {
    this.state = { kind: rec.kind, name: rec.name, status: "saved" };
  }

  subscribe(fn: (s: LinkState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<LinkState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /** whether the file can be written now without asking anything */
  get blocked() {
    return this.state.status === "reconnect" || this.state.status === "conflict";
  }

  /** The latest document, to be written a moment from now. While the file waits on the person (reconnect, conflict)
   *  it is only kept, and written once they have answered. */
  schedule(doc: Doc) {
    if (this.closed) return;
    this.doc = doc;
    if (this.blocked) return;
    const now = Date.now();
    if (!this.timer) this.firstAt = now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(QUIET_MS, this.firstAt + MAX_WAIT_MS - now));
    if (this.state.status !== "saving") this.set({ status: "pending" });
    this.timer = setTimeout(() => void this.flush(), wait);
  }

  /** writes what is waiting now; resolves once it has been written (or could not be) */
  async flush(force = false): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    while (this.running) await this.running;
    const doc = this.doc;
    if (!doc || this.closed || (this.blocked && !force)) return;
    this.doc = null;
    this.running = this.put(doc, force)
      .catch((e: unknown) => {
        /* written next time: the document is kept for it */
        this.doc ??= doc;
        this.set({ status: "error", error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        this.running = null;
      });
    await this.running;
    if (this.doc && !this.blocked && this.state.status !== "error") this.schedule(this.doc);
  }

  /** Lets go of the file: what was waiting is not written, nothing more is. */
  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.doc = null;
    this.listeners.clear();
  }

  /** On opening: whether the editor may still write, and whether the file was changed elsewhere meanwhile. */
  async check(): Promise<void> {
    if (!(await mayWrite(this.rec.handle))) {
      this.set({ status: "reconnect" });
      return;
    }
    const main = await this.mainHandle(false).catch(() => null);
    if (main && (await this.changedOnDisk(main, null))) return;
    this.set({ status: this.doc ? "pending" : "saved" });
    if (this.doc) void this.flush();
  }

  /** asks the browser again (call it from a press); then carries on as on opening */
  async reconnect(): Promise<boolean> {
    if (!(await mayWrite(this.rec.handle, true))) return false;
    await this.check();
    return true;
  }

  /** the conflict settled for this version: the file is written over with it */
  async keepMine(doc: Doc | null): Promise<void> {
    if (doc) this.doc = doc;
    this.disk = null;
    this.set({ status: "pending" });
    await this.flush(true);
  }

  /** The conflict settled for the file's version: the document it holds, for the editor to open. What the file holds
   *  now counts as written, so the editor's next save of it is no conflict. */
  async loadDisk(): Promise<Doc | null> {
    const { doc } = await readFromDisk(this.rec.handle);
    const main = await this.mainHandle(false).catch(() => null);
    if (main && this.disk !== null) await this.record(main, this.disk);
    this.disk = null;
    this.doc = null;
    this.set({ status: "saved", at: Date.now() });
    return doc;
  }

  private mainHandle(create: boolean): Promise<FileHandle> {
    if (this.rec.kind === "file") return Promise.resolve(this.rec.handle as FileHandle);
    return (this.rec.handle as DirHandle).getFileHandle(FOLDER_MAIN_FILE, { create });
  }

  /** whether the file holds something other than what the editor wrote last and other than `text`: a conflict */
  private async changedOnDisk(main: FileHandle, text: string | null): Promise<boolean> {
    const w = this.rec.written;
    if (!w) return false;
    const f = await main.getFile().catch(() => null);
    if (!f || (f.size === w.size && f.lastModified === w.modified)) return false;
    const disk = await f.text();
    if (digest(disk) === w.digest || disk === text) return false;
    this.disk = disk;
    this.set({ status: "conflict" });
    return true;
  }

  private async record(main: FileHandle, text: string) {
    const f = await main.getFile();
    this.rec.written = { size: f.size, modified: f.lastModified, digest: digest(text) };
    await this.deps.save(this.rec).catch(() => {});
  }

  private async put(doc: Doc, force: boolean) {
    const whole = await this.deps.resolve(doc);
    const folder = this.rec.kind === "folder";
    const { text, files } = serializeProject(whole, { assets: folder ? "files" : "inline" });
    const main = await this.mainHandle(true);
    if (!force) {
      if (await this.changedOnDisk(main, text)) {
        /* kept for when the person has said which version stands */
        this.doc ??= doc;
        return;
      }
      const w = this.rec.written;
      const f = w ? await main.getFile().catch(() => null) : null;
      /* the file is as the editor left it, and that is what it would write */
      if (w && f && f.size === w.size && f.lastModified === w.modified && w.digest === digest(text)) {
        this.set({ status: "saved", at: Date.now() });
        return;
      }
    }
    this.set({ status: "saving" });
    if (folder) await this.putPictures(this.rec.handle as DirHandle, files);
    const out = await main.createWritable();
    try {
      await out.write(text);
      await out.close();
    } catch (e) {
      await out.abort?.().catch(() => {});
      throw e;
    }
    await this.record(main, text);
    this.set({ status: "saved", at: Date.now(), error: undefined });
  }

  /** the pictures the document refers to, each written once; those it no longer refers to taken away */
  private async putPictures(dir: DirHandle, files: { path: string; bytes: Uint8Array }[]) {
    const wanted = new Map(files.map((f) => [f.path.slice(FOLDER_ASSET_DIR.length + 1), f.bytes]));
    let assets: DirHandle | null = null;
    try {
      assets = await dir.getDirectoryHandle(FOLDER_ASSET_DIR, { create: wanted.size > 0 });
    } catch {
      return;
    }
    const there = new Set<string>();
    for await (const [name, h] of assets.entries()) if (h.kind === "file") there.add(name);
    for (const [name, bytes] of wanted) {
      if (there.has(name)) continue;
      const out = await (await assets.getFileHandle(name, { create: true })).createWritable();
      await out.write(bytes as unknown as BufferSource);
      await out.close();
    }
    for (const name of there) if (!wanted.has(name) && OWN_ASSET.test(name)) await assets.removeEntry(name).catch(() => {});
  }
}
