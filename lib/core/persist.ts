/* Where the editor keeps the document it is editing between visits, behind one small interface so that another place
 * can be put in without touching the editor. The editor's own is several projects in IndexedDB, each of which may be
 * kept in sync with a file (lib/projects/persist.ts). `localPersist` here is what earlier versions did, and what the
 * editor falls back to where IndexedDB is blocked: the document in localStorage under `m3e:doc`, its large pictures in
 * IndexedDB (lib/assets.ts), the design a draft or a link replaced under `m3e:doc:before`, and one tab editing at a
 * time by a Web Lock. */

import { assetRefsIn, getAssets, pruneAssets, putAssets, restoreAssets, stripAssets } from "../assets";
import { loadDocument, loadStored, PROJECT_VERSION } from "../project";
import type { Doc } from "../tokens";

/** what a store held when the editor opened */
export type Stored = {
  /** the document saved last, as it was written (fields may be missing); null when there is none */
  doc: Partial<Doc> | null;
  /** the design a draft or a shared link replaced, while the author has not kept or undone it */
  before: Doc | null;
};

export interface PersistAdapter {
  /** What was saved. It may come later (an asynchronous store); the editor shows its own seed meanwhile. */
  read(): Stored | Promise<Stored>;
  /** Keeps the document. A store that is full throws `PersistFullError`, which the editor tells the author of once. */
  write(doc: Doc): void | Promise<void>;
  /** keeps, or forgets (null), the design a draft or a link replaced */
  writeBefore(doc: Doc | null): void;
  /** The large pictures a document read back refers to, by reference, so it can be made whole again; what nothing
   *  refers to any more is forgotten. */
  assets(stored: Stored): Promise<Map<string, string> | null>;
  /** Asks to be the one tab that edits: `editable` or `readonly` is said once known. Returns the release. */
  lock(say: (access: "editable" | "readonly") => void): () => void;
}

/** Why a save did not go through, told apart because the author can do different things about each: no room left
 *  (`quota`), the store closed under the tab (`closed`: another tab upgrading it, the browser shutting it down), not
 *  allowed (`permission`: storage blocked, a file's permission taken back), saved meanwhile by another tab
 *  (`conflict`), or anything else the browser or the disk said (`io`). */
export type SaveErrorKind = "quota" | "closed" | "permission" | "conflict" | "io";

/** a save that did not go through, and why */
export class PersistError extends Error {
  constructor(
    readonly kind: SaveErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** a store with no room left */
export class PersistFullError extends PersistError {
  constructor(message = "") {
    super("quota", message);
  }
}

/** what kind of failure an error from IndexedDB, localStorage or the File System Access API is, by the names
 *  browsers give them */
export function saveErrorKind(err: unknown): SaveErrorKind {
  if (err instanceof PersistError) return err.kind;
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  if (name === "InvalidStateError" || name === "TransactionInactiveError") return "closed";
  if (name === "SecurityError" || name === "NotAllowedError") return "permission";
  return "io";
}

/** an error as the save that met it reports it */
export const asPersistError = (err: unknown): PersistError => {
  if (err instanceof PersistError) return err;
  const kind = saveErrorKind(err);
  const message = err instanceof Error ? err.message : String(err);
  return kind === "quota" ? new PersistFullError(message) : new PersistError(kind, message);
};

/** the browser refusing a save for want of room, by the names browsers give it */
const isStorageFull = (err: unknown) => saveErrorKind(err) === "quota";

export const DOC_KEY = "m3e:doc";
/** the design a draft or a link replaced, until the author keeps or undoes it */
export const BEFORE_KEY = "m3e:doc:before";
export const DOC_LOCK = "m3e:doc:editor";
/** the format version the document under DOC_KEY is written in (lib/migrations.ts); absent before it was noted */
export const DOC_VERSION_KEY = "m3e:doc:version";

const storedVersion = (raw: string | null): number | undefined => {
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** writes a document down, its large pictures kept apart (lib/assets.ts) */
function saveAt(key: string, doc: unknown) {
  const { doc: light, found } = stripAssets(doc);
  if (found.size) void putAssets(found).catch(() => {});
  localStorage.setItem(key, JSON.stringify(light));
}

/** the document in localStorage, its pictures in IndexedDB: the editor's own way */
export const localPersist: PersistAdapter = {
  read() {
    const d = localStorage.getItem(DOC_KEY);
    /* brought up to this version and cleaned as any document is, from the version noted beside it */
    const doc = d ? loadStored(JSON.parse(d), storedVersion(localStorage.getItem(DOC_VERSION_KEY))) : null;
    const raw = d ? localStorage.getItem(BEFORE_KEY) : null;
    if (!d) localStorage.removeItem(BEFORE_KEY);
    let before: Doc | null = null;
    if (raw) {
      const value = loadDocument(JSON.parse(raw));
      if (value) before = value.doc;
      else localStorage.removeItem(BEFORE_KEY);
    }
    return { doc, before };
  },
  write(doc) {
    try {
      saveAt(DOC_KEY, doc);
      localStorage.setItem(DOC_VERSION_KEY, String(PROJECT_VERSION));
    } catch (err) {
      if (isStorageFull(err)) throw new PersistFullError(String(err));
      throw asPersistError(err);
    }
  },
  writeBefore(doc) {
    try {
      if (doc) saveAt(BEFORE_KEY, doc);
      else localStorage.removeItem(BEFORE_KEY);
    } catch {}
  },
  async assets(stored) {
    const refs = new Set([...assetRefsIn(stored.doc), ...assetRefsIn(stored.before)]);
    const found = await getAssets(refs).catch(() => new Map<string, string>());
    await pruneAssets(refs).catch(() => {});
    return refs.size ? found : null;
  },
  lock(say) {
    /* The first tab keeps this promise pending for its lifetime. Later tabs get `null` immediately and stay read-only
       until they are reloaded. Where the browser has no locks (an insecure origin, an old WebKit) the editor works as
       it always did, without the guard. */
    if (!navigator.locks) {
      say("editable");
      return () => {};
    }
    let active = true;
    let releaseLock: (() => void) | undefined;
    /* Wait until React has finished its development-only effect replay. This prevents the discarded setup from
       briefly competing with the real one. */
    queueMicrotask(() => {
      if (!active) return;
      void navigator.locks
        .request(DOC_LOCK, { ifAvailable: true }, async (lock) => {
          if (!active) return;
          if (!lock) {
            say("readonly");
            return;
          }
          say("editable");
          await new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
        })
        .catch(() => {
          if (active) say("editable");
        });
    });
    return () => {
      active = false;
      releaseLock?.();
    };
  },
};

/** pictures put back into what was read: references replaced by the pictures found */
export const withAssets = <T>(value: T, found: Map<string, string>): T => restoreAssets(value, found);
