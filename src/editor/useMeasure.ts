/* Measuring the parts as the canvas draws them: each part's width, height and first baseline go into the store's
 * session (`widths`), and the screens whose parts came out another size than they were laid out by (a screen that
 * changed size, a template's guesses, an overlay that moved) are laid out again by what they came to.
 *
 * Only the parts due a measure are read (src/editor/measureBook.ts): new ones, ones drawn from another item or on a
 * screen of another size, ones whose box changed size by itself (a ResizeObserver watches every box), the ones in a
 * fit box when an overlay settles, and all of them when a face loads or the measures are reset (`setWidths({})`, a
 * document arriving). A render for anything else — a selection, a panel, the pointer — reads no box at all. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { withFrames, withGroups, type DocStore } from "@/lib/core";
import { FIT_OVERLAY, REMEASURE } from "@/parts/contained";
import { roleOf } from "@/parts/role";
import { metricsOf } from "@/lib/styleLayout";
import { fillRest, fitLength, tidyFrame } from "@/lib/tidy";
import { frameOfGroup, type Frame, type Group, type Item, type Theme } from "@/lib/tokens";
import { firstBaseline } from "./model";
import { MeasureBook, withMeasures, type ScreenSize } from "./measureBook";

type Live<T> = MutableRefObject<T>;

export type MeasureInputs = {
  store: DocStore;
  /** what the hidden layer draws: every part, as `useCanvasView` lists them */
  items: readonly Item[];
  /** the size of the screen each of them stands on */
  screens: ReadonlyMap<string, ScreenSize>;
  groupsRef: Live<Group[]>;
  framesRef: Live<Frame[]>;
  themeRef: Live<Theme>;
};

const sameMeasures = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};

export function useMeasure({ store, items, screens, groupsRef, framesRef, themeRef }: MeasureInputs) {
  const [book] = useState(() => new MeasureBook());
  /** the hidden layer's element for each part, by item id */
  const els = useRef(new Map<string, HTMLElement>());
  /** which part an observed element is */
  const idOf = useRef(new WeakMap<Element, string>());
  /** one ref callback per part, kept: a layer drawn again does not take every box out and put it back */
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const observer = useRef<ResizeObserver | null>(null);
  /** the parts gone since the last pass: their measures are taken out with its next write */
  const gone = useRef<string[]>([]);
  /** The measures as the last pass left them. Any other in the store (`setWidths({})` after a face or a style changed,
   *  a whole document arriving) is a reset: every part is measured afresh, its baseline too. */
  const written = useRef<Record<string, number> | null>(null);
  /** a screen that changed size and is waiting for its parts' new measures before it is
   *  laid out again — an overlay's size only settles once it has been drawn in its new box */
  const retidyRef = useRef<string[] | null>(null);
  /** screens just added from a template: what touches on them does so because of a guess at its size, not by design */
  const freshFramesRef = useRef<{ ids: string[]; until: number } | null>(null);
  /** screens just put on another phone: what they hold wraps anew, and is only known once it has been drawn at that width */
  const newPhoneRef = useRef<{ ids: string[]; until: number } | null>(null);

  /** Measures the parts due, writes what changed, and lays out again the screens that need it. Runs after a commit
   *  that drew something anew, and on its own when a box resized, an overlay settled or a face loaded. */
  const pass = () => {
    const prev = store.get().session.widths;
    if (prev !== written.current) book.invalidateAll();
    const reset = prev !== written.current;
    const from = reset ? {} : prev;
    const found: Record<string, number | undefined> = {};
    for (const id of book.take()) {
      const el = els.current.get(id);
      if (!el) continue;
      /* a part that fits its overlay is the overlay's size, not the box it floats in */
      const ov = el.querySelector<HTMLElement>(FIT_OVERLAY);
      const fit = !!el.querySelector("[data-fit]");
      const own = el.getBoundingClientRect();
      const ownBox = { w: Math.ceil(own.width), h: Math.ceil(own.height) };
      book.measured(id, ownBox, fit);
      /* the overlay mounts through a portal a beat after the box does: until it is there,
       * the box's own size would be mistaken for the part's, so keep the last known size */
      if (!ov && fit && from[id] !== undefined) {
        found[id] = from[id];
        found[`${id}:h`] = from[`${id}:h`];
        found[`${id}:base`] = from[`${id}:base`];
        continue;
      }
      const box = ov ? ov.getBoundingClientRect() : own;
      const w = Math.ceil(box.width);
      const h = Math.ceil(box.height);
      found[id] = w;
      found[`${id}:h`] = h;
      /* where its first line of text sits, for lining parts up on their baselines: read again only when its size moved */
      found[`${id}:base`] = book.baseline(id, w, h, () => firstBaseline(ov ?? el, box.top));
    }
    const next = withMeasures(from, found, gone.current.splice(0));
    const changed = reset ? !sameMeasures(next, prev) : next !== prev;
    if (changed) store.setWidths(next);
    written.current = store.get().session.widths;
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
        if (!g.items.some((it) => roleOf(it) === "overlay" && (next[it.id] !== prev[it.id] || next[`${it.id}:h`] !== prev[`${it.id}:h`]))) continue;
        const fid = frameOfGroup(g, framesRef.current, next)?.id;
        if (fid) retidy.add(fid);
      }
    if (!retidy.size) return;
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
  };
  const passRef = useRef(pass);
  passRef.current = pass;
  /** A pass soon, once for however many asked: a thousand parts whose components arrive in one commit each say so, and
   *  are measured together right after it, not a thousand times over. */
  const soon = useRef(false);
  const passSoon = useCallback(() => {
    if (soon.current) return;
    soon.current = true;
    queueMicrotask(() => {
      soon.current = false;
      passRef.current();
    });
  }, []);

  /* after every commit: what it drew anew is measured, and nothing else */
  useLayoutEffect(() => {
    const left = book.sync(items, screens);
    /* a part gone has had its box taken out by now: its ref goes with it */
    for (const id of left) refs.current.delete(id);
    gone.current.push(...left);
    if (book.pending || gone.current.length || retidyRef.current || store.get().session.widths !== written.current) passRef.current();
  });

  /* a box that changed size by itself (a picture, a lazy component, a stylesheet): measured before the frame is drawn */
  const watch = useCallback((): ResizeObserver | null => {
    if (observer.current || typeof ResizeObserver === "undefined") return observer.current;
    observer.current = new ResizeObserver((entries) => {
      let due = false;
      for (const e of entries) {
        const id = idOf.current.get(e.target);
        const size = e.borderBoxSize?.[0];
        if (id !== undefined && book.resized(id, Math.ceil(size ? size.inlineSize : e.contentRect.width), Math.ceil(size ? size.blockSize : e.contentRect.height))) due = true;
      }
      if (due) passRef.current();
    });
    return observer.current;
  }, [book]);
  /* the boxes in the layer watched for as long as the editor is up (again after a development remount) */
  useEffect(() => {
    const ro = watch();
    for (const el of els.current.values()) ro?.observe(el, { box: "border-box" });
    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [watch]);

  /** the ref for a part's box in the hidden layer */
  const measureRef = useCallback(
    (id: string) => {
      let ref = refs.current.get(id);
      if (!ref) {
        ref = (el: HTMLElement | null) => {
          const was = els.current.get(id);
          if (el === was) return;
          if (was) observer.current?.unobserve(was);
          if (!el) {
            els.current.delete(id);
            return;
          }
          els.current.set(id, el);
          idOf.current.set(el, id);
          /* the border box, which is what is measured: padding or a border that grows counts too */
          watch()?.observe(el, { box: "border-box" });
          book.touch(id);
        };
        refs.current.set(id, ref);
      }
      return ref;
    },
    [book, watch],
  );

  /* an overlay mounts after the render that made its box, and a part's components arrive after its stand-in: they say
   * so, and the parts in a fit box or waiting are measured again */
  useEffect(() => {
    const again = () => {
      book.overlaysMoved();
      passSoon();
    };
    window.addEventListener(REMEASURE, again);
    return () => window.removeEventListener(REMEASURE, again);
  }, [book, passSoon]);

  /* a face that finished loading changes how wide words come out, and where their baseline sits in a box that kept its
   * size: every part is measured again, its baseline read afresh */
  useEffect(() => {
    let up = true;
    const again = () => {
      if (!up) return;
      book.invalidateAll();
      passSoon();
    };
    document.fonts?.ready.then(again);
    document.fonts?.addEventListener("loadingdone", again);
    return () => {
      up = false;
      document.fonts?.removeEventListener("loadingdone", again);
    };
  }, [book, passSoon]);

  return { measureRef, retidyRef, freshFramesRef, newPhoneRef };
}
