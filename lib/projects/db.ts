/* The browser's own store of projects: one IndexedDB database holding every project's listing, its document, the
 * design a draft replaced, the file it is kept in sync with, and the large pictures of all of them, kept once by
 * content and forgotten when nothing refers to them any more. Every change is one transaction, so a document and the
 * pictures it refers to land together or not at all.
 *
 *   projects  id -> ProjectMeta          what the projects list shows
 *   docs      id -> { json }             the document as JSON, its large pictures replaced by `m3e-asset:` references
 *   befores   id -> { json }             the design a draft or a link replaced, until it is kept or undone
 *   refs      id | id#before -> string[] the pictures each of those refers to, so the unused ones can be found cheaply
 *   assets    m3e-asset:… -> data URL    the pictures, shared by every project (lib/assets.ts names them)
 *   files     id -> FileRecord           the file or folder a project is saved to as it changes
 *   kv        key -> value               bookkeeping: whether the old single document has been moved in; what a
 *                                        project keeps beside its document (the agent's conversation)
 *
 * Callback-style requests rather than awaits inside a transaction, so it behaves the same in every browser and in
 * fake-indexeddb under the tests. */

export const DB_NAME = "m3e-projects";
const VERSION = 1;
const STORES = ["projects", "docs", "befores", "refs", "assets", "files", "kv"] as const;
export type StoreName = (typeof STORES)[number];

export type ProjectMeta = {
  id: string;
  name: string;
  created: number;
  /** when its document last changed */
  updated: number;
  /** when it was last opened in a tab */
  opened?: number;
  /** how many screens it has */
  screens: number;
  /** the style it wears (a key of lib/styles or of the document's own styles) */
  style?: string;
  /** a small picture of its first screen */
  thumb?: string;
  /** the file it is saved to, as the list shows it */
  file?: { name: string; kind: "file" | "folder" };
  /** Pictures from other sites in it (lib/outside.ts): held back until the author allows them, since it came from a
   *  file or a link, or allowed. Absent, as for every project made here, they load. */
  outside?: "blocked" | "allowed";
  /** put in the bin at this time: hidden, and gone once its undo has passed */
  deleted?: number;
};

/** What the browser knows of the file a project is saved to. The handle itself is kept, so the file can be written
 *  again after a reload once the author allows it. */
export type FileRecord = {
  id: string;
  kind: "file" | "folder";
  handle: FileSystemHandle;
  name: string;
  /** the file as it was right after the editor last wrote it: what tells a change made elsewhere */
  written?: { size: number; modified: number; digest: string };
  /** A folder's pictures (m3e-assets/) as each was right after the editor wrote it (`own`) or read it and found what
   *  the document needs: one unchanged since needs no reading again, and only one the editor wrote, or one named by
   *  the hash of what it holds, is ever taken away. */
  assets?: Record<string, AssetMark>;
};

export type AssetMark = { size: number; modified: number; own?: boolean };

/** The record a document is kept in. `stamp` is new with every write of the editor: a tab that finds another stamp
 *  than the one it read or wrote last knows another tab saved the project meanwhile (absent in what earlier
 *  versions, and the other ways a project is made, wrote). `version` is the format version the document is written
 *  in (lib/migrations.ts); absent in what was written before records said, which is read as BARE_VERSION. */
export type DocRecord = { json: string; stamp?: string; version?: number };

/** a document as a record keeps it: its JSON, the pictures it refers to, and the format version it is written in */
export type StoredDoc = { json: string; refs: string[]; assets: ReadonlyMap<string, string>; version?: number };

const versionField = (v: number | undefined) => (typeof v === "number" ? { version: v } : {});

/** another tab wrote the project since this one read or wrote it */
export class DocConflict extends Error {}

export const beforeKey = (id: string) => `${id}#before`;

let cached: Promise<IDBDatabase> | null = null;
let factory: () => IDBFactory = () => indexedDB;

/** Uses another IndexedDB (the tests' fake one) and forgets the open connection. */
export function useIndexedDb(make: () => IDBFactory) {
  factory = make;
  cached = null;
}

/** Opens the database, made or brought up to date as needed. A database someone opened without a version (and so
 *  without its stores) is upgraded rather than trusted. */
export function openDb(): Promise<IDBDatabase> {
  if (cached) return cached;
  const open = (version?: number) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = version === undefined ? factory().open(DB_NAME) : factory().open(DB_NAME, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, name === "projects" || name === "files" ? { keyPath: "id" } : undefined);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new DOMException("The projects database is held by an older tab.", "InvalidStateError"));
    });
  const attempt = (async () => {
    let db = await open(VERSION).catch(async (e: unknown) => {
      /* already at a later version (a newer build ran here): open what is there */
      if (e instanceof DOMException && e.name === "VersionError") return open();
      throw e;
    });
    if (STORES.some((s) => !db.objectStoreNames.contains(s))) {
      const next = db.version + 1;
      db.close();
      db = await open(next);
    }
    /* another tab upgrading, or a test deleting the database: step aside instead of blocking it */
    db.onversionchange = () => {
      db.close();
      cached = null;
    };
    db.onclose = () => {
      cached = null;
    };
    return db;
  })();
  cached = attempt;
  attempt.catch(() => {
    if (cached === attempt) cached = null;
  });
  return attempt;
}

/** Runs one transaction: `body` makes its requests (callbacks, no awaits) and says what it comes to with `set`. The
 *  promise settles once the transaction has committed, or rejects with why it did not. */
export async function transact<T = void>(stores: StoreName[], mode: IDBTransactionMode, body: (t: IDBTransaction, set: (value: T) => void) => void): Promise<T> {
  let db = await openDb();
  let t: IDBTransaction;
  try {
    t = db.transaction(stores, mode);
  } catch (e) {
    /* the connection closed under the tab without saying so (the browser shut it): one more try on a fresh one */
    if (!(e instanceof DOMException && e.name === "InvalidStateError")) throw e;
    const was = cached;
    if (was && (await was.catch(() => null)) === db && cached === was) cached = null;
    db = await openDb();
    t = db.transaction(stores, mode);
  }
  return new Promise<T>((resolve, reject) => {
    let value: T | undefined;
    t.oncomplete = () => resolve(value as T);
    /* a request's failure reaches here before the transaction has an error of its own */
    t.onerror = (e) => reject((e.target as IDBRequest | null)?.error ?? t.error ?? new DOMException("The transaction failed.", "UnknownError"));
    t.onabort = () => reject(t.error ?? new DOMException("The transaction was aborted.", "AbortError"));
    try {
      body(t, (v) => {
        value = v;
      });
    } catch (e) {
      try {
        t.abort();
      } catch {}
      reject(e);
    }
  });
}

/* ---------- reading ---------- */

export const listProjects = () => transact<ProjectMeta[]>(["projects"], "readonly", (t, set) => {
  t.objectStore("projects").getAll().onsuccess = (e) => set((e.target as IDBRequest<ProjectMeta[]>).result);
});

export const getProject = (id: string) => transact<ProjectMeta | undefined>(["projects"], "readonly", (t, set) => {
  t.objectStore("projects").get(id).onsuccess = (e) => set((e.target as IDBRequest<ProjectMeta | undefined>).result);
});

/** what `readProjectRecords` finds: the versions are the records' own, undefined when they say none */
export type ProjectRecords = { meta?: ProjectMeta; doc: string | null; stamp: string | null; before: string | null; docVersion?: number; beforeVersion?: number };

/** a project's listing, its document (and the stamp of its last write) and the design a draft replaced, as stored */
export const readProjectRecords = (id: string) =>
  transact<ProjectRecords>(["projects", "docs", "befores"], "readonly", (t, set) => {
    const out: ProjectRecords = { doc: null, stamp: null, before: null };
    set(out);
    t.objectStore("projects").get(id).onsuccess = (e) => (out.meta = (e.target as IDBRequest<ProjectMeta | undefined>).result);
    t.objectStore("docs").get(id).onsuccess = (e) => {
      const rec = (e.target as IDBRequest<DocRecord | undefined>).result;
      out.doc = rec?.json ?? null;
      out.stamp = rec?.stamp ?? null;
      if (typeof rec?.version === "number") out.docVersion = rec.version;
    };
    t.objectStore("befores").get(id).onsuccess = (e) => {
      const rec = (e.target as IDBRequest<DocRecord | undefined>).result;
      out.before = rec?.json ?? null;
      if (typeof rec?.version === "number") out.beforeVersion = rec.version;
    };
  });

/** the pictures found of those named */
export const getAssets = (names: Iterable<string>) => {
  const wanted = [...new Set(names)];
  if (!wanted.length) return Promise.resolve(new Map<string, string>());
  return transact<Map<string, string>>(["assets"], "readonly", (t, set) => {
    const out = new Map<string, string>();
    set(out);
    const store = t.objectStore("assets");
    for (const name of wanted)
      store.get(name).onsuccess = (e) => {
        const v = (e.target as IDBRequest<unknown>).result;
        if (typeof v === "string") out.set(name, v);
      };
  });
};

export const getFileRecord = (id: string) => transact<FileRecord | undefined>(["files"], "readonly", (t, set) => {
  t.objectStore("files").get(id).onsuccess = (e) => set((e.target as IDBRequest<FileRecord | undefined>).result);
});

export const getKv = <T>(key: string) => transact<T | undefined>(["kv"], "readonly", (t, set) => {
  t.objectStore("kv").get(key).onsuccess = (e) => set((e.target as IDBRequest<T | undefined>).result);
});

/* ---------- writing ---------- */

/** puts the pictures not yet there: what is there already is the same picture, by its name */
function putMissing(store: IDBObjectStore, assets: ReadonlyMap<string, string>) {
  for (const [name, data] of assets)
    store.getKey(name).onsuccess = (e) => {
      if ((e.target as IDBRequest<IDBValidKey | undefined>).result === undefined) store.put(data, name);
    };
}

/** Keeps a project's document with the pictures it refers to and its listing as `meta` makes it from the one
 *  stored (absent for a project not listed yet), in one transaction. With `expect`, only if the document stored
 *  still carries that stamp (null: none): else nothing is written and it rejects with a `DocConflict`. */
export async function writeDocRecord(id: string, o: StoredDoc & { meta: (old: ProjectMeta | undefined) => ProjectMeta | undefined; stamp?: string; expect?: string | null }): Promise<ProjectMeta | undefined> {
  let clash = false;
  try {
    return await transact<ProjectMeta | undefined>(["projects", "docs", "refs", "assets"], "readwrite", (t, set) => {
      const docs = t.objectStore("docs");
      const write = () => {
        putMissing(t.objectStore("assets"), o.assets);
        docs.put({ json: o.json, ...(o.stamp ? { stamp: o.stamp } : {}), ...versionField(o.version) } satisfies DocRecord, id);
        t.objectStore("refs").put(o.refs, id);
        const projects = t.objectStore("projects");
        projects.get(id).onsuccess = (e) => {
          const next = o.meta((e.target as IDBRequest<ProjectMeta | undefined>).result);
          if (next) projects.put(next);
          set(next);
        };
      };
      if (o.expect === undefined) return write();
      docs.get(id).onsuccess = (e) => {
        if (((e.target as IDBRequest<DocRecord | undefined>).result?.stamp ?? null) === o.expect) return write();
        clash = true;
        t.abort();
      };
    });
  } catch (e) {
    if (clash) throw new DocConflict("Another tab saved this project after this one opened it.");
    throw e;
  }
}

/** keeps, or forgets (null), the design a draft or a link replaced */
export const writeBeforeRecord = (id: string, o: StoredDoc | null) =>
  transact(["befores", "refs", "assets"], "readwrite", (t) => {
    if (!o) {
      t.objectStore("befores").delete(id);
      t.objectStore("refs").delete(beforeKey(id));
      return;
    }
    putMissing(t.objectStore("assets"), o.assets);
    t.objectStore("befores").put({ json: o.json, ...versionField(o.version) } satisfies DocRecord, id);
    t.objectStore("refs").put(o.refs, beforeKey(id));
  });

/** changes a project's listing; undefined when there is no such project */
export const patchProject = (id: string, patch: Partial<ProjectMeta> | ((m: ProjectMeta) => ProjectMeta)) =>
  transact<ProjectMeta | undefined>(["projects"], "readwrite", (t, set) => {
    const store = t.objectStore("projects");
    store.get(id).onsuccess = (e) => {
      const was = (e.target as IDBRequest<ProjectMeta | undefined>).result;
      if (!was) return;
      const next = typeof patch === "function" ? patch(was) : { ...was, ...patch, id };
      for (const k of Object.keys(next) as (keyof ProjectMeta)[]) if (next[k] === undefined) delete next[k];
      store.put(next);
      set(next);
    };
  });

/** A new project: its listing, and its document with its pictures when it starts from one. */
export const putNewProject = (meta: ProjectMeta, doc?: StoredDoc) =>
  transact(["projects", "docs", "refs", "assets"], "readwrite", (t) => {
    t.objectStore("projects").add(meta);
    if (!doc) return;
    putMissing(t.objectStore("assets"), doc.assets);
    t.objectStore("docs").put({ json: doc.json, ...versionField(doc.version) } satisfies DocRecord, meta.id);
    t.objectStore("refs").put(doc.refs, meta.id);
  });

/** A copy of a project's document (not the design a draft replaced, nor its file) under a new listing. The pictures
 *  are shared, so nothing else is copied. */
export const copyProjectRecords = (from: string, meta: ProjectMeta) =>
  transact<boolean>(["projects", "docs", "refs"], "readwrite", (t, set) => {
    set(false);
    const docs = t.objectStore("docs");
    const refs = t.objectStore("refs");
    docs.get(from).onsuccess = (e) => {
      const rec = (e.target as IDBRequest<DocRecord | undefined>).result;
      if (rec) docs.put(rec, meta.id);
      refs.get(from).onsuccess = (r) => {
        const list = (r.target as IDBRequest<string[] | undefined>).result;
        if (list) refs.put(list, meta.id);
        t.objectStore("projects").add(meta);
        set(true);
      };
    };
  });

/** Forgets a project for good: its listing, documents, references and file. Its pictures go with the next prune. */
export const deleteProjectRecords = (id: string) =>
  transact(["projects", "docs", "befores", "refs", "files"], "readwrite", (t) => {
    t.objectStore("projects").delete(id);
    t.objectStore("docs").delete(id);
    t.objectStore("befores").delete(id);
    t.objectStore("refs").delete(id);
    t.objectStore("refs").delete(beforeKey(id));
    t.objectStore("files").delete(id);
  });

/** Forgets the pictures no project and no kept design refers to any more; how many went. */
export const pruneAssets = () =>
  transact<number>(["refs", "assets"], "readwrite", (t, set) => {
    set(0);
    t.objectStore("refs").getAll().onsuccess = (e) => {
      const keep = new Set(((e.target as IDBRequest<unknown[]>).result ?? []).flatMap((v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])));
      const assets = t.objectStore("assets");
      assets.getAllKeys().onsuccess = (k) => {
        let gone = 0;
        for (const key of (k.target as IDBRequest<IDBValidKey[]>).result) {
          if (keep.has(String(key))) continue;
          assets.delete(key);
          gone++;
        }
        set(gone);
      };
    };
  });

export const putFileRecord = (rec: FileRecord, meta?: ProjectMeta["file"]) =>
  transact(["files", "projects"], "readwrite", (t) => {
    t.objectStore("files").put(rec);
    const projects = t.objectStore("projects");
    projects.get(rec.id).onsuccess = (e) => {
      const was = (e.target as IDBRequest<ProjectMeta | undefined>).result;
      if (was) projects.put({ ...was, file: meta ?? { name: rec.name, kind: rec.kind } });
    };
  });

export const deleteFileRecord = (id: string) =>
  transact(["files", "projects"], "readwrite", (t) => {
    t.objectStore("files").delete(id);
    const projects = t.objectStore("projects");
    projects.get(id).onsuccess = (e) => {
      const was = (e.target as IDBRequest<ProjectMeta | undefined>).result;
      if (!was?.file) return;
      const { file: _gone, ...rest } = was;
      projects.put(rest);
    };
  });

export const putKv = (key: string, value: unknown) => transact(["kv"], "readwrite", (t) => {
  t.objectStore("kv").put(value, key);
});

/** forgets some keys of the kv store */
export const deleteKv = (keys: readonly string[]) => transact(["kv"], "readwrite", (t) => {
  for (const key of keys) t.objectStore("kv").delete(key);
});
