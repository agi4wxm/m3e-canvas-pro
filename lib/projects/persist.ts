/* The editor's `PersistAdapter` (lib/core/persist.ts) for projects kept in IndexedDB (lib/projects/db.ts). A tab opens
 * one project: the one its address names (`?project=`), else the one last in use, else a new one; on the very first
 * run the earlier version's single document becomes that project (lib/projects/migrate.ts). One tab edits a project at a
 * time (a Web Lock per project), so two tabs on two projects both edit. A project bound to a file on this computer is
 * written to it as it changes (lib/projects/fileLink.ts).
 *
 * Every document handed over gets a revision; the save state says which is the latest, which is being written and
 * which was kept last, and why the last write failed. A write that fails keeps its document waiting (a newer one
 * handed over meanwhile is never replaced by it) and is tried again a little later, and `flush` says whether
 * everything was kept. Where Web Locks are missing or refuse, two tabs may both edit: each write then checks that
 * the project is still as this tab last read or wrote it, and the tab that finds it changed stops (read-only) rather
 * than write over the other's. Before the page may go (hidden, pagehide) what waits is written at once, best effort,
 * and the latest version not yet kept is noted in localStorage, where the next tab on the project finds and offers it.
 *
 * Where IndexedDB cannot be opened at all (storage blocked), the editor keeps working the earlier way, through
 * `localPersist`, and says so. */

import { assetRefsIn, getAssets as getLegacyAssets, restoreAssets } from "../assets";
import { asPersistError, localPersist, PersistError, type PersistAdapter, type SaveErrorKind, type Stored } from "../core/persist";
import { isProject } from "../project";
import type { Doc } from "../tokens";
import { DocConflict, getAssets, getFileRecord, getProject, listProjects, patchProject, pruneAssets, putFileRecord, deleteFileRecord, readProjectRecords, writeBeforeRecord, writeDocRecord, type FileRecord, type ProjectMeta } from "./db";
import { FileLink, type LinkState } from "./fileLink";
import { migrateLegacy } from "./migrate";
import { setOutsideBlocked } from "../outsidePolicy";
import { createProject, lockName, mostRecent, newProjectId, onProjectsChanged, PROJECT_PARAM, purgeTrashed, storedForm, summaryOf, tellProjectsChanged } from "./projects";

/** where the id of the project last opened is kept, for what reads it before IndexedDB has answered */
export const LAST_PROJECT_KEY = "m3e:project:last";
/** where a tab notes the latest version of a project it could not keep yet, for the next tab on it */
export const unsavedKey = (id: string) => `m3e:project:${id}:unsaved`;

/** a version of the project a tab could not keep before it went, found when the project opened again */
export type Recovered = { doc: Doc; at: number };

export type Opening =
  | { mode: "projects"; id: string; meta: ProjectMeta; stored: Stored; file: FileRecord | null; missing?: string; stamp?: string | null; recovered?: Recovered }
  | { mode: "legacy"; stored: Stored; error: string };

type Storage_ = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;

export type OpeningEnv = {
  /** the address the tab is at, and a way to say which project it shows */
  location: { pathname: string; search: string; hash: string };
  replaceUrl?: (url: string) => void;
  storage: Storage_;
  /** the names a project gets when it has none of its own */
  names: { untitled: string; first: string };
  now?: () => number;
};

const parse = (json: string | null): unknown => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/** pictures by reference, from this store, else from where the earlier version kept them (copied over as found) */
async function picturesFor(refs: Set<string>): Promise<Map<string, string>> {
  if (!refs.size) return new Map();
  const found = await getAssets(refs).catch(() => new Map<string, string>());
  const missing = [...refs].filter((r) => !found.has(r));
  if (missing.length) {
    const legacy = await getLegacyAssets(missing).catch(() => new Map<string, string>());
    for (const [k, v] of legacy) found.set(k, v);
  }
  return found;
}

/** what a project holds, read back whole: its document and kept design with their pictures put back */
export async function readStored(id: string): Promise<{ meta?: ProjectMeta; stored: Stored; json: string | null; stamp: string | null }> {
  const rec = await readProjectRecords(id);
  const doc = parse(rec.doc) as Partial<Doc> | null;
  const beforeValue = doc ? parse(rec.before) : null;
  const before = isProject(beforeValue) ? beforeValue : null;
  const pictures = await picturesFor(new Set([...assetRefsIn(doc), ...assetRefsIn(before)]));
  return { meta: rec.meta, json: rec.doc, stamp: rec.stamp, stored: { doc: pictures.size ? restoreAssets(doc, pictures) : doc, before: before && pictures.size ? restoreAssets(before, pictures) : before } };
}

/** The version a tab noted as not kept, when it is not what the project holds: offered back. One that is (the write
 *  went through after all) or that is not a document is forgotten. */
async function unsavedFor(storage: Storage_, id: string, storedJson: string | null): Promise<Recovered | undefined> {
  let raw: string | null = null;
  try {
    raw = storage.getItem(unsavedKey(id));
  } catch {}
  if (!raw) return undefined;
  const entry = parse(raw) as { at?: unknown; doc?: unknown } | null;
  const doc = entry && isProject(entry.doc) ? entry.doc : null;
  if (!doc || storedForm(doc).json === storedJson) {
    try {
      storage.removeItem?.(unsavedKey(id));
    } catch {}
    return undefined;
  }
  const refs = assetRefsIn(doc);
  return { doc: refs.size ? restoreAssets(doc, await picturesFor(refs)) : doc, at: typeof entry?.at === "number" ? entry.at : 0 };
}

/** The document of the project a tab of the editor last opened, as stored, without opening, moving in or making
 *  anything: for the pages beside the editor (the gallery). Null when there is none. */
export async function lastProjectDoc(): Promise<unknown> {
  const id = localStorage.getItem(LAST_PROJECT_KEY);
  if (!id) return null;
  return parse((await readProjectRecords(id)).doc);
}

/** Which project a tab opens, read whole; the earlier version's document moved in first if it has not been. */
export async function resolveOpening(env: OpeningEnv): Promise<Opening> {
  const now = env.now ?? Date.now;
  try {
    await migrateLegacy({ storage: env.storage, fallbackName: env.names.first, now: now() });
    await purgeTrashed(now()).catch(() => {});
    const list = await listProjects();
    const wanted = new URLSearchParams(env.location.search).get(PROJECT_PARAM);
    let meta = wanted ? list.find((m) => m.id === wanted && !m.deleted) : undefined;
    const missing = wanted && !meta ? wanted : undefined;
    meta ??= mostRecent(list);
    meta ??= await createProject({ name: env.names.untitled, now: now() });
    const id = meta.id;
    const q = new URLSearchParams(env.location.search);
    if (q.get(PROJECT_PARAM) !== id) {
      q.set(PROJECT_PARAM, id);
      env.replaceUrl?.(`${env.location.pathname}?${q.toString()}${env.location.hash}`);
    }
    try {
      env.storage.setItem(LAST_PROJECT_KEY, id);
    } catch {}
    const [{ stored, json, stamp }, file] = await Promise.all([readStored(id), getFileRecord(id).catch(() => undefined)]);
    const recovered = await unsavedFor(env.storage, id, json).catch(() => undefined);
    const opened = (await patchProject(id, { opened: now() }).catch(() => undefined)) ?? meta;
    return { mode: "projects", id, meta: opened, stored, stamp, file: file ?? null, ...(missing ? { missing } : {}), ...(recovered ? { recovered } : {}) };
  } catch (e) {
    let stored: Stored = { doc: null, before: null };
    try {
      stored = localPersist.read() as Stored;
    } catch {}
    return { mode: "legacy", stored, error: e instanceof Error ? e.message : String(e) };
  }
}

/** how often the other tabs hear that a project was edited: its listing's time moves on every change */
const TELL_EDITS_MS = 2000;
/** how long after a failed write it is tried again, one step longer each time it fails again */
const RETRY_MS = [2000, 5000, 15_000, 30_000, 60_000];

/** where the browser's copy of the project stands */
export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";
export type SaveState = {
  status: SaveStatus;
  /** the revision of the latest document handed over (0: none since opening), of the one being written, and of the
   *  latest one kept (written, or found to be what is kept already) */
  handed: number;
  writing: number | null;
  kept: number;
  /** when the latest one was kept */
  at?: number;
  /** why the last write failed, and the revision it was writing; gone once a later one is kept */
  error?: { kind: SaveErrorKind; message: string; rev: number; at: number };
};
/** what `flush` found: the browser's copy and the file's, and whether both have everything */
export type SaveReport = { ok: boolean; browser: SaveState; file: LinkState | null };

export type PersistOptions = {
  /** where the version not kept yet is noted, synchronously (localStorage) */
  storage?: Storage_ | null;
  retryMs?: readonly number[];
};

const browserStorage = (): Storage_ | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export class ProjectsPersist implements PersistAdapter {
  readonly opening: Promise<Opening>;
  private ready: Opening | null = null;
  private metaNow: ProjectMeta | null = null;
  private metaListeners = new Set<(m: ProjectMeta | null) => void>();
  /** the latest document handed over and not yet written, with its revision */
  private pending: { doc: Doc; rev: number } | null = null;
  private flight: Promise<void> | null = null;
  private lastJson: string | null = null;
  /** the stamp of the document as this tab last read or wrote it (db.ts `DocRecord`) */
  private stamp: string | null = null;
  private handed = 0;
  private writing: number | null = null;
  private kept = 0;
  private keptAt: number | undefined;
  private error: SaveState["error"];
  /** another tab saved the project since this one read it: this one writes no more */
  private conflict = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private saveListeners = new Set<(s: SaveState) => void>();
  /** what the tab lock was told to say, for a conflict found later */
  private sayAccess: ((access: "editable" | "readonly") => void) | null = null;
  /** the revision noted in localStorage as not kept, until one at least as new is */
  private noted: number | null = null;
  private storage: Storage_ | null;
  private retryMs: readonly number[];
  /** a write has been asked for since opening */
  private seenWrite = false;
  /** the host says which changes are someone's edits (`markEdited`), and one has come since the last write */
  private editSignals = false;
  private edited = false;
  private toldAt = 0;
  private pruned = false;
  /** the document as last handed over: what a file bound now starts from */
  lastDoc: Doc | null = null;
  link: FileLink | null = null;
  private linkListeners = new Set<(s: LinkState | null) => void>();

  constructor(opening: Promise<Opening>, o: PersistOptions = {}) {
    this.opening = opening;
    this.storage = o.storage === undefined ? browserStorage() : o.storage;
    this.retryMs = o.retryMs?.length ? o.retryMs : RETRY_MS;
    void opening.then((o) => {
      this.ready = o;
      if (o.mode !== "projects") return;
      this.metaNow = o.meta;
      this.stamp = o.stamp ?? null;
      /* before anyone is handed the document: its outside pictures must not be fetched by the first draw */
      setOutsideBlocked(o.meta.outside === "blocked");
      this.lastJson = o.stored.doc ? storedForm(o.stored.doc).json : null;
      if (o.file) this.attach(o.file, false);
      if (typeof window === "undefined") return;
      /* renamed from the projects home, here or in another tab: the chrome follows */
      onProjectsChanged(() => {
        void getProject(o.id)
          .then((m) => {
            if (m && (m.name !== this.metaNow?.name || m.thumb !== this.metaNow?.thumb)) this.setMeta({ ...this.metaNow, ...m });
          })
          .catch(() => {});
      });
      /* the page may go without another word: hidden is the last moment it surely runs (on a phone above all) */
      window.addEventListener("pagehide", () => this.commitNow());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.commitNow();
      });
    });
  }

  /** the open project's id, once known */
  get id(): string | null {
    return this.ready?.mode === "projects" ? this.ready.id : null;
  }
  get mode(): Opening["mode"] | null {
    return this.ready?.mode ?? null;
  }
  get meta(): ProjectMeta | null {
    return this.metaNow;
  }
  /** a version an earlier tab could not keep, found on opening, until it is taken or let go (`dropRecovered`) */
  get recovered(): Recovered | null {
    return (this.ready?.mode === "projects" && this.ready.recovered) || null;
  }

  /** Holds the open project's pictures from other sites back, or lets them load, and remembers it in its listing. */
  async setOutside(v: "blocked" | "allowed") {
    setOutsideBlocked(v === "blocked");
    const o = await this.opening;
    if (o.mode !== "projects" || this.metaNow?.outside === v) return;
    const m = await patchProject(o.id, { outside: v }).catch(() => undefined);
    this.setMeta(m ?? (this.metaNow ? { ...this.metaNow, outside: v } : undefined));
  }

  /** hears the open project's listing change (its name, its picture, its file); returns the unsubscribe */
  onMeta(fn: (m: ProjectMeta | null) => void): () => void {
    this.metaListeners.add(fn);
    return () => {
      this.metaListeners.delete(fn);
    };
  }
  private setMeta(m: ProjectMeta | undefined) {
    if (!m) return;
    this.metaNow = m;
    for (const fn of this.metaListeners) fn(m);
  }

  onLink(fn: (s: LinkState | null) => void): () => void {
    this.linkListeners.add(fn);
    return () => {
      this.linkListeners.delete(fn);
    };
  }
  private tellLink() {
    for (const fn of this.linkListeners) fn(this.link?.state ?? null);
  }

  /** where the browser's copy stands now */
  get save(): SaveState {
    const unsaved = this.kept < this.handed;
    /* a write that failed stays the news while it is tried again: only one that goes through ends it */
    const status: SaveStatus = this.conflict ? "conflict" : this.error && unsaved ? "error" : this.writing !== null ? "saving" : unsaved ? "pending" : "saved";
    return { status, handed: this.handed, writing: this.writing, kept: this.kept, ...(this.keptAt ? { at: this.keptAt } : {}), ...(this.error ? { error: this.error } : {}) };
  }
  /** hears the save state change; returns the unsubscribe */
  onSave(fn: (s: SaveState) => void): () => void {
    this.saveListeners.add(fn);
    return () => {
      this.saveListeners.delete(fn);
    };
  }
  private tellSave() {
    const s = this.save;
    for (const fn of this.saveListeners) fn(s);
  }

  /* ---------- PersistAdapter ---------- */

  read(): Stored | Promise<Stored> {
    return this.ready ? this.ready.stored : this.opening.then((o) => o.stored);
  }

  write(doc: Doc): Promise<void> | void {
    this.lastDoc = doc;
    if (this.ready?.mode === "legacy") return localPersist.write(doc);
    this.pending = { doc, rev: ++this.handed };
    this.link?.schedule(doc);
    if (this.conflict) {
      /* written nowhere now: noted for the next tab, and the person is told (read-only) */
      this.note();
      this.tellSave();
      return;
    }
    this.flight ??= this.drain();
    this.tellSave();
    return this.flight;
  }

  /** Writes the latest document until none is waiting: at most one write in flight, the ones between skipped.
   *  It lets go of `flight` in the very step that finds nothing more waiting (the `finally` below runs straight after
   *  the loop's last check, with no await between). Let go any later (a `.finally` chained on, or an awaited inner
   *  function, runs a tick or more on), a write coming in between would see a drain still "in flight", leave its
   *  document waiting and start none: a design from a link, or an author's last edit, then sat unwritten until the
   *  next change. A write that fails ends the drain with its error; its document waits again (`failed`). */
  private async drain() {
    try {
      const o = await this.opening;
      if (o.mode !== "projects") return;
      while (this.pending && !this.conflict) {
        const { doc, rev } = this.pending;
        this.pending = null;
        const { json, refs, assets } = storedForm(doc);
        /* An edit moves the project's time on; a layout pass after opening, or the first write that only brings the
           document to how this version writes it, does not. */
        const edit = this.lastJson === null || (this.editSignals ? this.edited : this.seenWrite);
        this.seenWrite = true;
        if (json === this.lastJson) {
          this.keep(rev);
          continue;
        }
        this.edited = false;
        const at = Date.now();
        const stamp = newProjectId();
        this.writing = rev;
        this.tellSave();
        try {
          const meta = await writeDocRecord(o.id, { json, refs, assets, stamp, expect: this.stamp, meta: (old) => (old ? { ...old, ...summaryOf(doc), ...(edit ? { updated: at } : {}) } : undefined) });
          this.setMeta(meta);
        } catch (e) {
          this.writing = null;
          /* still the version to write, unless a newer one came meanwhile: an old one never takes a newer one's place */
          this.pending ??= { doc, rev };
          if (edit && this.editSignals) this.edited = true;
          throw this.failed(e instanceof DocConflict ? new PersistError("conflict", e.message) : asPersistError(e), rev);
        }
        this.writing = null;
        this.stamp = stamp;
        this.lastJson = json;
        this.keep(rev, at);
        if (at - this.toldAt > TELL_EDITS_MS) {
          this.toldAt = at;
          tellProjectsChanged();
        }
      }
    } finally {
      this.flight = null;
    }
  }

  /** a revision kept: what failed before it is over, and so is what was noted of it */
  private keep(rev: number, at?: number) {
    this.kept = Math.max(this.kept, rev);
    if (at) this.keptAt = at;
    if (this.error && this.kept >= this.error.rev) {
      this.error = undefined;
      this.retries = 0;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.noted !== null && this.kept >= this.noted) this.forgetNote();
    this.tellSave();
  }

  /** A write failed: why, kept for the person; the version noted where the next tab finds it; tried again a little
   *  later, unless another tab saved the project, when this one stops writing and goes read-only. */
  private failed(err: PersistError, rev: number): PersistError {
    this.error = { kind: err.kind, message: err.message, rev, at: Date.now() };
    this.note();
    if (err.kind === "conflict") {
      this.conflict = true;
      /* the file follows the browser's copy: it must not take this tab's version over the other's either */
      this.link?.close();
      this.sayAccess?.("readonly");
    } else this.scheduleRetry();
    this.tellSave();
    return err;
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    const wait = this.retryMs[Math.min(this.retries, this.retryMs.length - 1)];
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.pending || this.flight || this.conflict) return;
      this.flight = this.drain();
      this.flight.catch(() => {});
    }, wait);
  }

  /** Notes the latest version not kept yet in localStorage, synchronously: with its pictures if there is room, else
   *  with them by reference (those already kept come back). Best effort: a full store notes nothing. */
  private note() {
    const id = this.id;
    const doc = this.lastDoc;
    if (!this.storage || !id || !doc) return;
    const at = Date.now();
    for (const text of [() => JSON.stringify(doc), () => storedForm(doc).json]) {
      try {
        this.storage.setItem(unsavedKey(id), `{"at":${at},"doc":${text()}}`);
        this.noted = this.handed;
        return;
      } catch {}
    }
  }
  private forgetNote() {
    this.noted = null;
    const id = this.id;
    if (!id) return;
    try {
      this.storage?.removeItem?.(unsavedKey(id));
    } catch {}
  }

  /** The version an earlier tab could not keep has been taken (it is now the document, written as any other) or
   *  let go: it is not offered again. */
  dropRecovered() {
    if (this.ready?.mode !== "projects" || !this.ready.recovered) return;
    delete this.ready.recovered;
    if (this.noted === null) this.forgetNote();
  }

  /** Before the page may go: what waits is written now and the file without its pause, and the latest version not
   *  kept yet is noted for the next tab. Nothing makes the browser wait for the writes: they may still be cut short,
   *  which the note is for. */
  commitNow() {
    if (this.ready?.mode !== "projects") return;
    if (this.kept < this.handed) this.note();
    if (this.pending && !this.flight && !this.conflict) {
      this.flight = this.drain();
      this.flight.catch(() => {});
    }
    void this.link?.flush().catch(() => {});
  }

  writeBefore(doc: Doc | null): void {
    if (this.ready?.mode === "legacy") return localPersist.writeBefore(doc);
    void this.opening.then((o) => {
      if (o.mode !== "projects" || this.conflict) return;
      return writeBeforeRecord(o.id, doc ? storedForm(doc) : null);
    }).catch(() => {});
  }

  /** The pictures came back with the document (`read`); this only forgets, once the editor is up, the pictures no
   *  project refers to any more. */
  async assets(stored: Stored): Promise<Map<string, string> | null> {
    const o = await this.opening;
    if (o.mode === "legacy") return localPersist.assets(stored);
    if (!this.pruned) {
      this.pruned = true;
      const later = (fn: () => void) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 10_000 }) : setTimeout(fn, 4000));
      later(() => void pruneAssets().catch(() => 0));
    }
    return null;
  }

  lock(say: (access: "editable" | "readonly") => void): () => void {
    let active = true;
    let release: (() => void) | undefined;
    this.sayAccess = (access) => {
      if (active) say(access);
    };
    void this.opening.then((o) => {
      if (!active) return;
      if (o.mode === "legacy") {
        release = localPersist.lock(say);
        return;
      }
      /* Without locks (an insecure origin, an old WebKit), or when asking for one fails, two tabs may both edit:
         each write checks the project is as this tab left it (`writeDocRecord`'s stamp), and the tab that finds it
         saved by the other goes read-only (`failed`) instead of writing over it. */
      if (!navigator.locks) {
        say("editable");
        return;
      }
      /* as `localPersist`: the first tab holds the lock for its lifetime; a later one on the same project gets none and
         stays read-only */
      void navigator.locks
        .request(lockName(o.id), { ifAvailable: true }, async (lock) => {
          if (!active) return;
          if (!lock) {
            say("readonly");
            return;
          }
          say(this.conflict ? "readonly" : "editable");
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        })
        .catch(() => {
          if (active) say(this.conflict ? "readonly" : "editable");
        });
    });
    return () => {
      active = false;
      release?.();
    };
  }

  /* ---------- beyond the adapter ---------- */

  /** Someone changed the document (not the editor's own layout passes): the next write is an edit. */
  markEdited() {
    this.editSignals = true;
    this.edited = true;
  }

  /** Writes what waits now, the browser's copy and the file's, and says where both stand: before the tab goes to
   *  another project. A document whose last write failed gets one more try here. Never rejects. */
  async flush(): Promise<SaveReport> {
    await this.opening;
    if (this.pending && !this.flight && !this.conflict && this.ready?.mode === "projects") this.flight = this.drain();
    while (this.flight) await this.flight.catch(() => {});
    await this.link?.flush().catch(() => {});
    return this.report();
  }

  /** tries again now what failed (the browser's copy and the file's), with the waits between tries started over */
  retry(): Promise<SaveReport> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retries = 0;
    return this.flush();
  }

  /** where the browser's copy and the file's stand */
  report(): SaveReport {
    const browser = this.save;
    const file = this.link?.state ?? null;
    return { ok: browser.status === "saved" && (!file || file.status === "saved"), browser, file };
  }

  /** keeps a picture of the first screen for the projects list */
  async setThumb(thumb: string) {
    const id = this.id;
    if (!id || this.conflict || this.metaNow?.thumb === thumb) return;
    this.setMeta(await patchProject(id, { thumb }).catch(() => undefined));
    tellProjectsChanged();
  }

  private attach(rec: FileRecord, fresh: boolean) {
    this.link?.close();
    const link = new FileLink(rec, {
      resolve: async (doc) => {
        const refs = assetRefsIn(doc);
        return refs.size ? restoreAssets(doc, await picturesFor(refs)) : doc;
      },
      save: (r) => putFileRecord(r),
    });
    this.link = link;
    link.subscribe(() => this.tellLink());
    this.tellLink();
    if (this.lastDoc) link.schedule(this.lastDoc);
    void (fresh ? link.flush() : link.check()).then(() => this.tellLink());
  }

  /** Binds the open project to a file or folder the person picked, and writes it there now. */
  async bindFile(handle: FileSystemHandle, kind: "file" | "folder", written?: FileRecord["written"]) {
    const id = this.id;
    if (!id) return;
    const rec: FileRecord = { id, kind, handle, name: handle.name, ...(written ? { written } : {}) };
    await putFileRecord(rec);
    this.setMeta(this.metaNow ? { ...this.metaNow, file: { name: rec.name, kind } } : undefined);
    tellProjectsChanged();
    this.attach(rec, true);
  }

  /** stops writing the open project to its file; the file stays as it is */
  async unbindFile() {
    const id = this.id;
    if (!id) return;
    this.link?.close();
    this.link = null;
    this.tellLink();
    await deleteFileRecord(id);
    if (this.metaNow) {
      const { file: _gone, ...rest } = this.metaNow;
      this.setMeta(rest);
    }
    tellProjectsChanged();
  }
}

/** the editor's own: the browser's address, its history and localStorage */
export function browserOpening(names: OpeningEnv["names"]): Promise<Opening> {
  return resolveOpening({
    location: window.location,
    replaceUrl: (url) => window.history.replaceState(window.history.state, "", url),
    storage: localStorage,
    names,
  });
}
