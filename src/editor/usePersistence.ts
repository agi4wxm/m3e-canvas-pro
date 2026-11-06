/* Where the editor keeps the document between visits, through a `PersistAdapter` (lib/core/persist.ts): one tab
 * edits and the others wait read-only, the document saved last comes back on load with its pictures, and every change
 * of the document is written down.
 *
 * Reading may take a while (projects in IndexedDB, lib/projects/persist.ts). Until it is done the boot cover stays up
 * over the starter sketch, nothing is written, and the tab is not yet editable, so nothing (a link's design, a
 * keystroke) lands on a document about to be replaced. */

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { withGroups, withFrames, type DocStore } from "@/lib/core";
import { PersistFullError, withAssets, type PersistAdapter, type Stored } from "@/lib/core/persist";
import { getLang, setGlobalLang, t, type Lang } from "@/lib/i18n";
import type { Doc, Frame, Group } from "@/lib/tokens";

type Live<T> = MutableRefObject<T>;

export type PersistenceInputs = {
  store: DocStore;
  persist: PersistAdapter;
  /** the document as it is saved, as of the last draw */
  docRef: Live<Doc>;
  /** the document's step in the store: what changing it means */
  docKey: readonly unknown[];
  editAccess: "checking" | "editable" | "readonly";
  setEditAccess: (access: "editable" | "readonly") => void;
  setDraftBefore: Dispatch<SetStateAction<Doc | null>>;
  /** set once the saved document has been read; nothing is written before */
  loadedRef: Live<boolean>;
  /** a saved document or the phone's own seed was put on the canvas: nothing reseeds it */
  hadDocRef: Live<boolean>;
  initialLang: Lang;
  initialLangRef: Live<Lang>;
  /** what a whole document arriving does to what was open over the one there */
  leaveForNewDoc: () => void;
  /** the editor's own settings put back (the camera, the panels); false when there were none */
  restoreUi: () => boolean;
  /** the starter sketch, when nothing was saved */
  seed: () => { groups: Group[]; frames: Frame[] };
  /** once the document is in the store; `late` when it came after the editor's first effects had run */
  onLoaded: (late: boolean) => void;
  showToast: (msg: string, ms?: number, icon?: string) => void;
};

export function usePersistence(o: PersistenceInputs) {
  const { store, persist } = o;
  /** what the tab lock said, held until the document is in: only then may the tab edit */
  const accessRef = useRef<"editable" | "readonly" | null>(null);
  /* where the document is kept between visits (lib/core/persist.ts): one tab edits, the others wait read-only */
  useEffect(
    () =>
      persist.lock((access) => {
        accessRef.current = access;
        if (o.loadedRef.current) o.setEditAccess(access);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  /** the reading has started: React's development double-run must not start a second one */
  const startedRef = useRef(false);
  useEffect(() => {
    if (o.loadedRef.current || startedRef.current) return;
    startedRef.current = true;
    const apply = (stored: Stored, late: boolean) => {
      try {
        const d = stored.doc;
        if (d) {
          o.hadDocRef.current = true;
          o.leaveForNewDoc();
          store.load(d, false);
          // frame mode is decided by the device (media-query effect), not restored
        }
        if (stored.before) o.setDraftBefore(stored.before);
        /* the large pictures, where the store keeps them apart: the document comes back whole a moment later */
        void persist
          .assets(stored)
          .then((found) => {
            if (!found) return;
            store.update("Pictures", "system", (s) => ({ ...s, doc: { ...s.doc, groups: withAssets(s.doc.groups, found), frames: withAssets(s.doc.frames, found), ...(s.doc.components ? { components: withAssets(s.doc.components, found) } : {}) } }));
            o.setDraftBefore((b) => (b ? withAssets(b, found) : b));
          })
          .catch(() => {});
        o.restoreUi();
        setGlobalLang(o.initialLang);
        o.initialLangRef.current = o.initialLang;
        /* Read at once, nothing has drawn yet and the starter goes down now. Read later, the canvas already holds the
           starter (or the phone's own), and it stays. */
        if (!d && !late) {
          const { groups, frames } = o.seed();
          store.update("Seed", "system", (s) => withFrames(withGroups(s, groups), frames));
        }
      } catch {}
      o.onLoaded(late);
      if (accessRef.current) o.setEditAccess(accessRef.current);
    };
    let read: Stored | Promise<Stored>;
    try {
      read = persist.read();
    } catch {
      read = { doc: null, before: null };
    }
    if (read instanceof Promise) read.then((stored) => apply(stored, true), () => apply({ doc: null, before: null }, true));
    else apply(read, false);
    // the saved document is read once, when the editor opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFullToldRef = useRef(false);
  useEffect(() => {
    if (!o.loadedRef.current || o.editAccess !== "editable") return;
    /* the author keeps working; said once, since every later change would fail the same way */
    const full = (err: unknown) => {
      if (err instanceof PersistFullError && !saveFullToldRef.current) {
        saveFullToldRef.current = true;
        o.showToast(t("saveFull", getLang()), 9000, "warning");
      }
    };
    try {
      /* the document, even while a definition is open: a reload then finds its screens, and the definition as far as it got */
      const done = persist.write(o.docRef.current);
      if (done) done.then(() => (saveFullToldRef.current = false), full);
      else saveFullToldRef.current = false;
    } catch (err) {
      full(err);
    }
    /* whatever in the document changed, or the definition opened or closed; not the selection or the measures */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.editAccess, persist, ...o.docKey]);
}
