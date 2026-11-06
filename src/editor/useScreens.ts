/* What is done to screens: the canvas mode, a screen added, from a template, resized, set to a phone model, tidied,
 * its buttons combined, its body placed or laid out, deleted, duplicated or given another size. Each is one lib/core
 * operation and one undo step; screens that changed size ease into place, and are laid out again once their parts
 * have been measured at the new size. */

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { Frame, FrameMode, FramePreset, frameSizeOf, Group, Place, SETTLE_MS, Theme, uid } from "@/lib/tokens";
import type { NoteAction } from "@/components/Toolbar";
import { TidyState } from "@/components/ui";
import { tidyFrame } from "@/lib/tidy";
import { combineButtons } from "@/lib/combine";
import { metricsOf } from "@/lib/styleLayout";
import { templateBySlug } from "@/parts/templates";
import { getLang, t } from "@/lib/i18n";
import { ops, withGroups, type CoreState, type DocStore, type Op, type OpError, type TxOptions } from "@/lib/core";
import { ensureScreen } from "@/lib/core/ops/screens";
import type { View } from "./model";

export type ScreenInputs = {
  store: DocStore;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string; refused?: (e: OpError) => void }) => R | undefined;
  didOp: <A>(o: Op<A, unknown>, args: A, opts?: TxOptions & { label?: string; refused?: (e: OpError) => void }) => boolean;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  snapshot: () => void;
  frame: FrameMode;
  groups: Group[];
  frames: Frame[];
  widths: Record<string, number>;
  theme: Theme;
  /** the screen the tidy button works on */
  tidyTarget: Frame | null;
  /** the groups before and after the last tidy */
  tidyRef: { current: { frameId: string; before: Group[]; after: Group[] } | null };
  frameRef: { current: FrameMode };
  framesRef: RefObject<Frame[]>;
  groupsRef: RefObject<Group[]>;
  widthsRef: RefObject<Record<string, number>>;
  defEditRef: { readonly current: CoreState["editing"] };
  viewRef: RefObject<View>;
  canvasRect: () => DOMRect | undefined;
  setView: (v: View) => void;
  fitRef: RefObject<() => void>;
  glideToFrame: (f: Frame) => void;
  /** screens to lay out again once their parts have been measured */
  retidyRef: { current: string[] | null };
  freshFramesRef: { current: { ids: string[]; until: number } | null };
  newPhoneRef: { current: { ids: string[]; until: number } | null };
  setSelectedLinkId: (id: string | null) => void;
  setRightTab: (tab: "edit" | "prompt") => void;
};

export function useScreens({ store, runOp, didOp, showToast, snapshot, frame, groups, frames, widths, theme, tidyTarget, tidyRef, frameRef, framesRef, groupsRef, widthsRef, defEditRef, viewRef, canvasRect, setView, fitRef, glideToFrame, retidyRef, freshFramesRef, newPhoneRef, setSelectedLinkId, setRightTab }: ScreenInputs) {
  /** screens ease to their new place and size for a moment after one changes size */
  const [easing, setEasing] = useState(false);
  /** The body of a screen in nested auto layouts: what stands at its edges (bars, a FAB, a dialog, a rail, its picture)
   *  and what is locked keep their places. */
  const autoLayoutScreen = (f: Frame) => {
    if (!runOp(ops.autoLayoutScreen, { screen: f.id }, { history: "step", refused: () => showToast(t("suggestNone", getLang())) })) return;
    tidyRef.current = null;
  };
  /** Entering phone mode with no frames wraps the existing parts in one. */
  const ensureFrame = () => store.update("Screens", "user", (s) => ensureScreen(s, widthsRef.current, uid(), t("home")));

  const ensureFrameRef = useRef(() => {});
  ensureFrameRef.current = ensureFrame;
  const changeFrame = (f: FrameMode) => {
    if (f === frame || defEditRef.current) return;
    if (!didOp(ops.setFrameMode, { mode: f }, { history: "step" })) return;
    frameRef.current = f;
    setSelectedLinkId(null);
    queueMicrotask(() => fitRef.current());
  };
  const addFrame = () => {
    if (defEditRef.current) return;
    const made = runOp(ops.addScreen, {}, { history: "step" });
    const f = made && store.get().doc.frames.find((x) => x.id === made.id);
    if (!f) return;
    const r = canvasRect();
    if (r) {
      const z = viewRef.current.z;
      const { w, h } = frameSizeOf(f);
      setView({
        x: r.width / 2 - (f.x + w / 2) * z,
        y: r.height / 2 - (f.y + h / 2) * z,
        z,
      });
    }
  };
  /** Adds a template's screens beside the existing ones, in the words of the editor's language, and
   *  selects the first. On a blank canvas it brings the screens back: they are what it adds. */
  const addTemplate = (slug: string) => {
    if (!templateBySlug(slug) || defEditRef.current) return;
    const added = runOp(ops.addTemplate, { slug }, { history: "step" });
    if (!added) return;
    frameRef.current = "phone";
    tidyRef.current = null;
    /* its parts were placed by a guess at their sizes: once they are drawn it is laid out again by what they came to */
    freshFramesRef.current = { ids: added.frames, until: Date.now() + 4000 };
    retidyRef.current = added.frames;
    setSelectedLinkId(null);
    setRightTab("edit");
    const first = store.get().doc.frames.find((x) => x.id === added.frames[0]);
    if (first) glideToFrame(first);
  };

  const patchFrame = (id: string, patch: Partial<Frame>) => runOp(ops.patchScreen, { id, patch }, { history: { coalesce: "frame:" + id + ":" + Object.keys(patch).join(",") } });

  /* a phone chosen for a screen is the phone the document is drawn for */
  const setFramePreset = (id: string, preset: FramePreset) => resizeFrame(id, { preset });

  /** every phone screen of the document at the size of one model, each kept upright or on its side. One undo step. */
  const setPhoneModel = (size: { w: number; h: number }) => {
    snapshot();
    tidyRef.current = null;
    const out = runOp(ops.setPhoneModel, size, { history: "none" });
    if (!out) return;
    setEasing(true);
    window.setTimeout(() => setEasing(false), SETTLE_MS + 40);
    retidyRef.current = out.frames;
    newPhoneRef.current = { ids: out.frames, until: Date.now() + 4000 };
  };

  /** A screen's new size: the screens to the right move over, parts take the sizes the new screen calls for, and the
   *  screen is laid out again by the tidy rules (lib/core `resize_screen`). */
  const resizeFrame = (id: string, size: { w?: number; h?: number; preset?: FramePreset }) => {
    if (!didOp(ops.resizeScreen, { id, ...size }, { history: "step" })) return;
    tidyRef.current = null;
    setEasing(true);
    window.setTimeout(() => setEasing(false), SETTLE_MS + 40);
    /* overlays drawn open (a dialog's box is the screen it floats in) are laid out here with
     * their old measures; they are re-measured against the new screen size in the measuring
     * pass, and the screen is laid out once more with the sizes that came out */
    retidyRef.current = [id];
  };
  /** the tidy button's state for the screen in play; the layout pass runs only when the document changes */
  const tidyState = useMemo((): TidyState | null => {
    if (!tidyTarget) return null;
    const last = tidyRef.current;
    if (last && last.frameId === tidyTarget.id && last.after === groups) return "undo";
    return tidyFrame(groups, tidyTarget, frames, widths, metricsOf(theme)) ? "tidy" : "done";
  }, [tidyTarget, groups, frames, widths]);

  const tidy = (f: Frame) => {
    const last = tidyRef.current;
    if (last && last.frameId === f.id && last.after === groupsRef.current) {
      /* tidy's own way back, as a step of its own */
      store.transact("Undo tidy", "user", (tx) => tx.set((s) => withGroups(s, last.before)), { history: "step" });
      tidyRef.current = null;
      return;
    }
    const out = runOp(ops.tidyScreen, { screen: f.id }, { history: "step" });
    if (out) tidyRef.current = { frameId: f.id, before: out.before, after: store.get().doc.groups };
  };
  /** whether the screen in play has buttons side by side that can become one button group */
  const canCombine = useMemo(() => !!tidyTarget && !!combineButtons(groups, tidyTarget, frames, widths), [tidyTarget, groups, frames, widths]);

  /** joins neighbouring buttons into button groups; one undo step */
  const combine = (f: Frame) => {
    if (didOp(ops.combine, { screen: f.id }, { history: "step" })) tidyRef.current = null;
  };

  /** sets where Tidy puts a screen's body, then tidies it that way; one undo step covers both */
  const setPlace = (f: Frame, place: Place) => {
    const before = store.get().doc.groups;
    const out = runOp(ops.setPlace, { id: f.id, place }, { history: "step" });
    tidyRef.current = out?.tidied ? { frameId: f.id, before, after: store.get().doc.groups } : null;
  };
  /** a screen takes everything on it along, and links into it are dropped */
  const deleteFrame = useCallback(
    (id: string) => {
      if (defEditRef.current) return;
      runOp(ops.removeScreen, { id }, { history: "step" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  );

  const duplicateFrame = (id: string) => {
    if (!framesRef.current.some((x) => x.id === id) || defEditRef.current) return;
    /* a copy is a screen of its own, not one more size of this one */
    runOp(ops.duplicateScreen, { id }, { history: "step" });
  };

  /** another size of a screen, beside it: a copy carried to the new size, one undo step */
  const createVariantOf = (id: string, preset: FramePreset) => {
    const made = runOp(ops.createScreenVariant, { id, preset }, { history: "step" });
    if (!made) return;
    tidyRef.current = null;
    retidyRef.current = [made.id];
    const f = store.get().doc.frames.find((x) => x.id === made.id);
    if (f) glideToFrame(f);
  };
  const duplicateFrameRef = useRef(duplicateFrame);
  duplicateFrameRef.current = duplicateFrame;
  return { easing, autoLayoutScreen, ensureFrameRef, changeFrame, addFrame, addTemplate, patchFrame, setFramePreset, setPhoneModel, resizeFrame, tidyState, tidy, canCombine, combine, setPlace, deleteFrame, duplicateFrame, duplicateFrameRef, createVariantOf };
}
