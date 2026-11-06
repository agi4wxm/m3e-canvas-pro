/* The editor's `PersistAdapter` (lib/core/persist.ts) for projects kept in IndexedDB (lib/projects/db.ts). A tab opens
 * one project: the one its address names (`?project=`), else the one last in use, else a new one; on the very first
 * run the earlier version's single document becomes that project (lib/projects/migrate.ts). One tab edits a project at a
 * time (a Web Lock per project), so two tabs on two projects both edit. A project bound to a file on this computer is
 * written to it as it changes (lib/projects/fileLink.ts).
 *
 * Where IndexedDB cannot be opened at all (storage blocked), the editor keeps working the earlier way, through
 * `localPersist`, and says so. */

import { assetRefsIn, getAssets as getLegacyAssets, restoreAssets } from "../assets";
import { localPersist, PersistFullError, type PersistAdapter, type Stored } from "../core/persist";
import { isProject } from "../project";
import type { Doc } from "../tokens";
import { getAssets, getFileRecord, getProject, listProjects, patchProject, pruneAssets, putFileRecord, deleteFileRecord, readProjectRecords, writeBeforeRecord, writeDocRecord, type FileRecord, type ProjectMeta } from "./db";
import { FileLink, type LinkState } from "./fileLink";
import { migrateLegacy } from "./migrate";
import { setOutsideBlocked } from "../outsidePolicy";
import { createProject, lockName, mostRecent, onProjectsChanged, PROJECT_PARAM, purgeTrashed, storedForm, summaryOf, tellProjectsChanged } from "./projects";

/** where the id of the project last opened is kept, for what reads it before IndexedDB has answered */
export const LAST_PROJECT_KEY = "m3e:project:last";

export type Opening =
  | { mode: "projects"; id: string; meta: ProjectMeta; stored: Stored; file: FileRecord | null; missing?: string }
  | { mode: "legacy"; stored: Stored; error: string };

export type OpeningEnv = {
  /** the address the tab is at, and a way to say which project it shows */
  location: { pathname: string; search: string; hash: string };
  replaceUrl?: (url: string) => void;
  storage: Pick<Storage, "getItem" | "setItem">;
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
export async function readStored(id: string): Promise<{ meta?: ProjectMeta; stored: Stored }> {
  const rec = await readProjectRecords(id);
  const doc = parse(rec.doc) as Partial<Doc> | null;
  const beforeValue = doc ? parse(rec.before) : null;
  const before = isProject(beforeValue) ? beforeValue : null;
  const pictures = await picturesFor(new Set([...assetRefsIn(doc), ...assetRefsIn(before)]));
  return { meta: rec.meta, stored: { doc: pictures.size ? restoreAssets(doc, pictures) : doc, before: before && pictures.size ? restoreAssets(before, pictures) : before } };
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
    const [{ stored }, file] = await Promise.all([readStored(id), getFileRecord(id).catch(() => undefined)]);
    const opened = (await patchProject(id, { opened: now() }).catch(() => undefined)) ?? meta;
    return { mode: "projects", id, meta: opened, stored, file: file ?? null, ...(missing ? { missing } : {}) };
  } catch (e) {
    let stored: Stored = { doc: null, before: null };
    try {
      stored = localPersist.read() as Stored;
    } catch {}
    return { mode: "legacy", stored, error: e instanceof Error ? e.message : String(e) };
  }
}

const isFull = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");

/** how often the other tabs hear that a project was edited: its listing's time moves on every change */
const TELL_EDITS_MS = 2000;

export class ProjectsPersist implements PersistAdapter {
  readonly opening: Promise<Opening>;
  private ready: Opening | null = null;
  private metaNow: ProjectMeta | null = null;
  private metaListeners = new Set<(m: ProjectMeta | null) => void>();
  private pending: Doc | null = null;
  private flight: Promise<void> | null = null;
  private lastJson: string | null = null;
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

  constructor(opening: Promise<Opening>) {
    this.opening = opening;
    void opening.then((o) => {
      this.ready = o;
      if (o.mode !== "projects") return;
      this.metaNow = o.meta;
      /* before anyone is handed the document: its outside pictures must not be fetched by the first draw */
      setOutsideBlocked(o.meta.outside === "blocked");
      this.lastJson = o.stored.doc ? storedForm(o.stored.doc).json : null;
      if (o.file) this.attach(o.file, false);
      /* renamed from the projects home, here or in another tab: the chrome follows */
      if (typeof window !== "undefined")
        onProjectsChanged(() => {
          void getProject(o.id)
            .then((m) => {
              if (m && (m.name !== this.metaNow?.name || m.thumb !== this.metaNow?.thumb)) this.setMeta({ ...this.metaNow, ...m });
            })
            .catch(() => {});
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

  /* ---------- PersistAdapter ---------- */

  read(): Stored | Promise<Stored> {
    return this.ready ? this.ready.stored : this.opening.then((o) => o.stored);
  }

  write(doc: Doc): Promise<void> | void {
    this.lastDoc = doc;
    if (this.ready?.mode === "legacy") return localPersist.write(doc);
    this.pending = doc;
    this.link?.schedule(doc);
    this.flight ??= this.drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }

  /** writes the latest document until none is waiting: at most one write in flight, the ones between skipped */
  private async drain() {
    const o = await this.opening;
    if (o.mode !== "projects") return;
    while (this.pending) {
      const doc = this.pending;
      this.pending = null;
      const { json, refs, assets } = storedForm(doc);
      /* An edit moves the project's time on; a layout pass after opening, or the first write that only brings the
         document to how this version writes it, does not. */
      const edit = this.lastJson === null || (this.editSignals ? this.edited : this.seenWrite);
      this.seenWrite = true;
      if (json === this.lastJson) continue;
      this.edited = false;
      const at = Date.now();
      try {
        const meta = await writeDocRecord(o.id, { json, refs, assets, meta: (old) => (old ? { ...old, ...summaryOf(doc), ...(edit ? { updated: at } : {}) } : undefined) });
        this.setMeta(meta);
      } catch (e) {
        if (isFull(e)) throw new PersistFullError(String(e));
        throw e;
      }
      this.lastJson = json;
      if (at - this.toldAt > TELL_EDITS_MS) {
        this.toldAt = at;
        tellProjectsChanged();
      }
    }
  }

  writeBefore(doc: Doc | null): void {
    if (this.ready?.mode === "legacy") return localPersist.writeBefore(doc);
    void this.opening.then((o) => {
      if (o.mode !== "projects") return;
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
    void this.opening.then((o) => {
      if (!active) return;
      if (o.mode === "legacy") {
        release = localPersist.lock(say);
        return;
      }
      if (!navigator.locks) {
        say("editable");
        return;
      }
      /* as `localPersist`: the first tab holds the lock for its lifetime; a later one on the same project gets none and
         stays read-only; an error leaves the editor working as it did before locks */
      void navigator.locks
        .request(lockName(o.id), { ifAvailable: true }, async (lock) => {
          if (!active) return;
          if (!lock) {
            say("readonly");
            return;
          }
          say("editable");
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        })
        .catch(() => {
          if (active) say("editable");
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

  /** resolves once what was handed over is kept: before the tab goes to another project */
  async flush(): Promise<void> {
    while (this.flight) await this.flight.catch(() => {});
    await this.link?.flush().catch(() => {});
  }

  /** keeps a picture of the first screen for the projects list */
  async setThumb(thumb: string) {
    const id = this.id;
    if (!id || this.metaNow?.thumb === thumb) return;
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
