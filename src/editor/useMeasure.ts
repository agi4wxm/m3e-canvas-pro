/* Measuring the parts as the canvas draws them: each part's width, height and first baseline go into the store's
 * session (`widths`), and the screens whose parts came out another size than they were laid out by (a screen that
 * changed size, a template's guesses, an overlay that moved) are laid out again by what they came to. */

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { withFrames, withGroups, type DocStore } from "@/lib/core";
import { FIT_OVERLAY, REMEASURE } from "@/parts/contained";
import { roleOf } from "@/parts/role";
import { metricsOf } from "@/lib/styleLayout";
import { fillRest, fitLength, tidyFrame } from "@/lib/tidy";
import { frameOfGroup, type Frame, type Group, type Theme } from "@/lib/tokens";
import { firstBaseline } from "./model";

type Live<T> = MutableRefObject<T>;

export type MeasureInputs = {
  store: DocStore;
  /** the hidden layer's element for each part, by item id */
  measureEls: Live<Map<string, HTMLElement>>;
  groupsRef: Live<Group[]>;
  framesRef: Live<Frame[]>;
  widthsRef: Live<Record<string, number>>;
  themeRef: Live<Theme>;
};

export function useMeasure({ store, measureEls, groupsRef, framesRef, widthsRef, themeRef }: MeasureInputs) {
  /* an overlay mounts after the render that made its box; it says so, and this render measures it */
  const [, setRemeasure] = useState(0);
  useEffect(() => {
    const again = () => setRemeasure((n) => n + 1);
    window.addEventListener(REMEASURE, again);
    return () => window.removeEventListener(REMEASURE, again);
  }, []);
  /** a screen that changed size and is waiting for its parts' new measures before it is
   *  laid out again — an overlay's size only settles once it has been drawn in its new box */
  const retidyRef = useRef<string[] | null>(null);
  /** screens just added from a template: what touches on them does so because of a guess at its size, not by design */
  const freshFramesRef = useRef<{ ids: string[]; until: number } | null>(null);
  /** screens just put on another phone: what they hold wraps anew, and is only known once it has been drawn at that width */
  const newPhoneRef = useRef<{ ids: string[]; until: number } | null>(null);
  /** each part's text baseline, with the size it was read at */
  const baseCache = useRef(new Map<string, { w: number; h: number; base: number | undefined }>());
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    measureEls.current.forEach((el, id) => {
      /* a part that fits its overlay is the overlay's size, not the box it floats in */
      const ov = el.querySelector<HTMLElement>(FIT_OVERLAY);
      /* the overlay mounts through a portal a beat after the box does: until it is there,
       * the box's own size would be mistaken for the part's, so keep the last known size */
      if (!ov && el.querySelector("[data-fit]") && widthsRef.current[id] !== undefined) {
        next[id] = widthsRef.current[id];
        next[`${id}:h`] = widthsRef.current[`${id}:h`] ?? next[`${id}:h`];
        if (widthsRef.current[`${id}:base`] !== undefined) next[`${id}:base`] = widthsRef.current[`${id}:base`];
        return;
      }
      const box = (ov ?? el).getBoundingClientRect();
      next[id] = Math.ceil(box.width);
      next[`${id}:h`] = Math.ceil(box.height);
      /* where its first line of text sits, for lining parts up on their baselines: read again only when its size moved */
      const known = baseCache.current.get(id);
      const base = known && known.w === next[id] && known.h === next[`${id}:h`] ? known.base : firstBaseline(ov ?? el, box.top);
      baseCache.current.set(id, { w: next[id], h: next[`${id}:h`], base });
      if (base !== undefined) next[`${id}:base`] = base;
    });
    const keys = Object.keys(next);
    const changed = keys.length !== Object.keys(widthsRef.current).length || keys.some((k) => widthsRef.current[k] !== next[k]);
    if (changed) store.setWidths(next);
    /* the screens to lay out again: one whose preset just changed (`retidyRef`), and any
     * screen holding an overlay whose measured size moved under it — an overlay centers
     * itself, so a size that changed since the last tidy leaves it off center */
    const retidy = new Set<string>();
    if (retidyRef.current) for (const id of retidyRef.current) retidy.add(id);
    retidyRef.current = null;
    const fresh = freshFramesRef.current && Date.now() < freshFramesRef.current.until ? freshFramesRef.current.ids : [];
    const newPhone = newPhoneRef.current && Date.now() < newPhoneRef.current.until ? newPhoneRef.current.ids : [];
    if (changed) for (const id of [...fresh, ...newPhone]) retidy.add(id);
    if (changed)
      for (const g of groupsRef.current) {
        if (!g.items.some((it) => roleOf(it) === "overlay" && (next[it.id] !== widthsRef.current[it.id] || next[`${it.id}:h`] !== widthsRef.current[`${it.id}:h`]))) continue;
        const fid = frameOfGroup(g, framesRef.current, next)?.id;
        if (fid) retidy.add(fid);
      }
    /* `next` holds the sizes the parts just came out at; the change is instant — after a preset
     * change the screen is still easing to its new size, so the correction is part of the move */
    let laid = groupsRef.current;
    let laidFrames = framesRef.current;
    let moved = false;
    /* what a part is about to be given goes beside what the parts came out at, not over it: while a part has not
     * taken its new size the two differ, and a measure that kept reading as changed would run this again without end */
    const sizes = { ...next };
    for (const fid of retidy) {
      const fr = laidFrames.find((f) => f.id === fid);
      if (!fr) continue;
      const m = { ...metricsOf(themeRef.current), ...(fresh.includes(fid) ? { together: [] } : {}) };
      const filled = fillRest(laid, fr, laidFrames, sizes, m);
      /* how long such a screen has to be was reckoned from a guess, or from sizes on the other phone: now it is known */
      const fit = fresh.includes(fid) || newPhone.includes(fid) ? fitLength(filled, fr, laidFrames, sizes, m) : { groups: filled, frames: laidFrames, frame: fr };
      const tidied = tidyFrame(fit.groups, fit.frame, fit.frames, sizes, m);
      if (tidied || fit.groups !== laid || fit.frames !== laidFrames) {
        laid = tidied ?? fit.groups;
        laidFrames = fit.frames;
        moved = true;
      }
    }
    if (moved) store.update("Layout", "system", (s) => withFrames(withGroups(s, laid), laidFrames));
  });

  /* a face that finished loading changes how wide words come out: every part is measured again */
  useEffect(() => {
    const refreshWidths = () => store.setWidths({});
    document.fonts?.ready.then(refreshWidths);
    document.fonts?.addEventListener("loadingdone", refreshWidths);
    return () => document.fonts?.removeEventListener("loadingdone", refreshWidths);
  }, [store]);

  return { retidyRef, freshFramesRef, newPhoneRef };
}
