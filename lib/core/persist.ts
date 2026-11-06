/* Where the editor keeps the document it is editing between visits, behind one small interface so that another place
 * (several projects in IndexedDB, a .json file kept up to date with the File System Access API) can be put in without
 * touching the editor. The default is what the editor has always done: the document in localStorage under `m3e:doc`,
 * its large pictures in IndexedDB (lib/assets.ts), the design a draft or a link replaced under `m3e:doc:before`, and
 * one tab editing at a time by a Web Lock. */

import { assetRefsIn, getAssets, pruneAssets, putAssets, restoreAssets, stripAssets } from "../assets";
import { isProject } from "../project";
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

/** a store with no room left */
export class PersistFullError extends Error {}

/** the browser refusing a save for want of room, by the names browsers give it */
const isStorageFull = (err: unknown) => err instanceof DOMException && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");

export const DOC_KEY = "m3e:doc";
/** the design a draft or a link replaced, until the author keeps or undoes it */
export const BEFORE_KEY = "m3e:doc:before";
export const DOC_LOCK = "m3e:doc:editor";

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
    const doc = d ? (JSON.parse(d) as Partial<Doc>) : null;
    const raw = d ? localStorage.getItem(BEFORE_KEY) : null;
    if (!d) localStorage.removeItem(BEFORE_KEY);
    let before: Doc | null = null;
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (isProject(value)) before = value;
      else localStorage.removeItem(BEFORE_KEY);
    }
    return { doc, before };
  },
  write(doc) {
    try {
      saveAt(DOC_KEY, doc);
    } catch (err) {
      if (isStorageFull(err)) throw new PersistFullError(String(err));
      throw err;
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
