/* The one document an earlier version kept (localStorage `m3e:doc`, the design a draft replaced under
 * `m3e:doc:before`, the large pictures in the `m3e-assets` database) becomes the first project, once, the first time
 * this version opens. Nothing of it is removed: an earlier version opened again finds it as it left it, and the
 * pictures stay readable from where they were for as long as this version reads them there (`legacyAssets`). */

import { assetRefsIn, getAssets as getLegacyAssets } from "../assets";
import { BEFORE_KEY, DOC_KEY } from "../core/persist";
import { isProject } from "../project";
import type { Doc } from "../tokens";
import { transact, type ProjectMeta } from "./db";
import { newProjectId, summaryOf } from "./projects";

/** the bookkeeping entry that says the old document has been moved in (or that there was none) */
export const LEGACY_MARK = "legacy";
export type LegacyMark = { at: number; project: string | null };

export type MigrateInputs = {
  storage: Pick<Storage, "getItem">;
  /** the name the project takes when the document has no title */
  fallbackName: string;
  /** the pictures the earlier version kept, by reference */
  legacyAssets?: (names: Iterable<string>) => Promise<Map<string, string>>;
  now?: number;
  id?: string;
};

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Moves the earlier version's document in as a project, unless that has been done; the new project's id, or null.
 *  Safe with two tabs starting at once: the check and the move are one transaction. */
export async function migrateLegacy(o: MigrateInputs): Promise<string | null> {
  const now = o.now ?? Date.now();
  const raw = o.storage.getItem(DOC_KEY);
  const doc = parse(raw) as Partial<Doc> | null;
  const usable = !!raw && !!doc && typeof doc === "object" && Array.isArray(doc.groups) && Array.isArray(doc.frames);
  const beforeRaw = usable ? o.storage.getItem(BEFORE_KEY) : null;
  const before = parse(beforeRaw);
  const keepBefore = !!beforeRaw && isProject(before);
  /* the pictures are read first: they are in another database, outside the transaction below */
  const refs = usable ? new Set([...assetRefsIn(doc), ...(keepBefore ? assetRefsIn(before) : [])]) : new Set<string>();
  const pictures = refs.size ? await (o.legacyAssets ?? getLegacyAssets)(refs).catch(() => new Map<string, string>()) : new Map<string, string>();
  const id = o.id ?? newProjectId();
  return transact<string | null>(["kv", "projects", "docs", "befores", "refs", "assets"], "readwrite", (t, set) => {
    set(null);
    const kv = t.objectStore("kv");
    kv.get(LEGACY_MARK).onsuccess = (e) => {
      if ((e.target as IDBRequest<unknown>).result !== undefined) return;
      if (!usable) {
        kv.put({ at: now, project: null } satisfies LegacyMark, LEGACY_MARK);
        return;
      }
      const meta: ProjectMeta = { id, name: doc.title?.trim() || o.fallbackName, created: now, updated: now, opened: now, ...summaryOf(doc) };
      t.objectStore("projects").add(meta);
      /* the document exactly as the earlier version wrote it */
      t.objectStore("docs").put({ json: raw }, id);
      t.objectStore("refs").put([...assetRefsIn(doc)], id);
      if (keepBefore) {
        t.objectStore("befores").put({ json: beforeRaw }, id);
        t.objectStore("refs").put([...assetRefsIn(before)], `${id}#before`);
      }
      const assets = t.objectStore("assets");
      for (const [name, data] of pictures) assets.put(data, name);
      kv.put({ at: now, project: id } satisfies LegacyMark, LEGACY_MARK);
      set(id);
    };
  });
}
