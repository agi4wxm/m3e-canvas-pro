/* What a pointer does on the canvas itself: pan it, sweep a selection, carry a group or a screen with what stands on
 * it, and, with Alt held, measure from the selection to what is under the pointer. A carried group lines up with its
 * neighbours like a part does; the undo step is taken when it first moves. */

import { useEffect, useState, type RefObject } from "react";
import { Frame, frameOfGroup, frameRect, Group, groupBounds, unionRect } from "@/lib/tokens";
import type { NoteAction } from "@/components/Toolbar";
import { measureBetween, type GuideGap, type Rect as GuideRect } from "@/lib/guides";
import { getLang, t } from "@/lib/i18n";
import { ops, type CoreState, type Op, type TxOptions } from "@/lib/core";
import { onGrid } from "@/lib/core/ops/common";
import type { Mode } from "@/components/Toolbar";
import type { DragState, Gesture, Guide, View } from "./model";

export type GestureInputs = {
  dragRef: RefObject<DragState | null>;
  gestureRef: { current: Gesture | null };
  selectedIds: string[];
  isMobile: boolean;
  mobileRef: RefObject<boolean>;
  modeRef: RefObject<Mode>;
  spaceRef: RefObject<boolean>;
  defEditRef: { readonly current: CoreState["editing"] };
  groupsRef: RefObject<Group[]>;
  framesRef: RefObject<Frame[]>;
  widthsRef: RefObject<Record<string, number>>;
  viewRef: RefObject<View>;
  instantRef: RefObject<Set<string>>;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  setView: (next: (v: View) => View) => void;
  /** over the open parts panel, where a drop deletes */
  inBin: (clientX: number) => boolean;
  snapshot: () => void;
  setGroups: (next: (g: Group[]) => Group[]) => void;
  setFrames: (next: (f: Frame[]) => Frame[]) => void;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  endGuides: () => void;
  guideFor: (left: number, top: number, sz: { w: number; h: number }, skip: Set<string>) => Guide | null;
  overFlow: (gs: Group[], id: string) => boolean;
  itemRects: () => { id: string; l: number; t: number; r: number; b: number }[];
  clearSelection: () => void;
  setSelectedIds: (ids: string[] | ((cur: string[]) => string[])) => void;
  setSelectedFrameId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
  setRightTab: (tab: "edit" | "prompt") => void;
};

export function useGestures({ dragRef, gestureRef, selectedIds, isMobile, mobileRef, modeRef, spaceRef, defEditRef, groupsRef, framesRef, widthsRef, viewRef, instantRef, toWorld, setView, inBin, snapshot, setGroups, setFrames, runOp, showToast, endGuides, guideFor, overFlow, itemRects, clearSelection, setSelectedIds, setSelectedFrameId, setSelectedLinkId, setRightTab }: GestureInputs) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const startPan = (clientX: number, clientY: number) => {
    const g: Gesture = {
      kind: "pan",
      sx: clientX,
      sy: clientY,
      vx: viewRef.current.x,
      vy: viewRef.current.y,
    };
    gestureRef.current = g;
    setGesture(g);
  };

  /** Alt held with something selected, as in Figma: the distances from it to the part under the pointer, or to the
   *  edges of the screen when the pointer is on nothing else */
  const [measure, setMeasure] = useState<{ gaps: GuideGap[]; avoid: GuideRect[] } | null>(null);
  useEffect(() => {
    if (!selectedIds.length || isMobile) return;
    let alt = false;
    let last: { x: number; y: number } | null = null;
    const update = () => {
      if (!alt || !last || dragRef.current || gestureRef.current) return setMeasure(null);
      const pt = toWorld(last.x, last.y);
      const ids = new Set(selectedIds);
      const rects = itemRects();
      const mine = rects.filter((r) => ids.has(r.id));
      if (!mine.length) return setMeasure(null);
      const a = unionRect(mine);
      const area = (r: { l: number; t: number; r: number; b: number }) => (r.r - r.l) * (r.b - r.t);
      const over = rects.filter((r) => !ids.has(r.id) && pt.x >= r.l && pt.x <= r.r && pt.y >= r.t && pt.y <= r.b).sort((x, y) => area(x) - area(y))[0];
      const screen = framesRef.current.map(frameRect).find((r) => pt.x >= r.l && pt.x <= r.r && pt.y >= r.t && pt.y <= r.b);
      const b = over ?? screen;
      /* the numbers keep clear of every other part's words: the two measured are where the lines end */
      setMeasure(b ? { gaps: measureBetween(a, b), avoid: rects.filter((r) => !ids.has(r.id) && r !== over) } : null);
    };
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      alt = e.altKey;
      update();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      alt = e.type === "keydown";
      /* the browser's own use of Alt (its menu bar) would take the focus away from the canvas */
      if (alt) e.preventDefault();
      update();
    };
    const off = () => {
      alt = false;
      setMeasure(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", off);
      setMeasure(null);
    };
    // the handlers read live state through refs; a new selection measures from it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, isMobile]);

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (mobileRef.current && e.pointerType === "touch") {
      e.preventDefault();
      clearSelection();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    const pt = toWorld(e.clientX, e.clientY);
    const g: Gesture = {
      kind: "marquee",
      x0: pt.x,
      y0: pt.y,
      x1: pt.x,
      y1: pt.y,
      moved: false,
    };
    gestureRef.current = g;
    setGesture(g);
    if (!e.shiftKey) setSelectedIds([]);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
  };

  /** grab a phone frame by its bezel or label: it carries everything on it;
   *  on a phone the screen stays put and a tap on it just clears the selection */
  const onFramePointerDown = (e: React.PointerEvent, f: Frame) => {
    /* the screen a definition is edited on is only the ground it stands on: it is not moved or chosen */
    if (mobileRef.current || defEditRef.current) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedFrameId(f.id);
    setSelectedIds([]);
    setSelectedLinkId(null);
    setRightTab("edit");
    const carried = groupsRef.current
      .filter(
        (g) =>
          frameOfGroup(g, framesRef.current, widthsRef.current)?.id === f.id,
      )
      .map((g) => ({ id: g.id, x: g.x, y: g.y }));
    const g: Gesture = {
      kind: "frame",
      id: f.id,
      sx: e.clientX,
      sy: e.clientY,
      fx: f.x,
      fy: f.y,
      groups: carried,
      moved: false,
    };
    gestureRef.current = g;
    setGesture(g);
  };

  const isGesturing = gesture !== null;
  useEffect(() => {
    if (!isGesturing) return;
    const move = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      if (g.kind === "pan") {
        setView((v) => ({
          ...v,
          x: g.vx + (e.clientX - g.sx),
          y: g.vy + (e.clientY - g.sy),
        }));
        return;
      }
      if (g.kind === "group") {
        const z = viewRef.current.z;
        const dx = (e.clientX - g.sx) / z;
        const dy = (e.clientY - g.sy) / z;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * z < 4) return;
          g.moved = true;
          endGuides();
          snapshot();
        }
        instantRef.current.add(g.id);
        g.overBin = inBin(e.clientX);
        const gr = groupsRef.current.find((x) => x.id === g.id);
        if (!gr) return;
        /* a moved group lines up with its neighbours like a single part does, and off
           any guide settles on the 4dp grid of the screen it is over; Ctrl (or Cmd)
           skips both */
        const moved = { ...gr, x: g.gx + dx, y: g.gy + dy };
        const loose = e.ctrlKey || e.metaKey;
        const b = groupBounds(moved, widthsRef.current);
        const carried = new Map((g.carry ?? []).map((o) => [o.id, o]));
        /* what travels with it is no neighbour to line up with */
        const own = [gr, ...groupsRef.current.filter((x) => carried.has(x.id))].flatMap((x) => x.items.map((it) => it.id));
        /* over an auto layout the layout places it: nothing to line up with, only its slot to show */
        const intoFlow = overFlow(groupsRef.current.map((x) => (x.id === g.id ? moved : x)), g.id);
        const guide = loose || g.overBin || intoFlow ? null : guideFor(b.l, b.t, { w: b.r - b.l, h: b.b - b.t }, new Set(own));
        g.guide = guide;
        setGesture({ ...g });
        const f = frameOfGroup(moved, framesRef.current, widthsRef.current);
        const placed = loose
          ? moved
          : {
              ...moved,
              x: guide?.x !== undefined ? Math.round(moved.x + guide.x - b.l) : onGrid(moved.x, f?.x ?? 0),
              y: guide?.y !== undefined ? Math.round(moved.y + guide.y - b.t) : onGrid(moved.y, f?.y ?? 0),
            };
        for (const id of carried.keys()) instantRef.current.add(id);
        setGroups((gs) =>
          gs.map((x) => {
            if (x.id === g.id) return placed;
            const o = carried.get(x.id);
            return o ? { ...x, x: o.x + placed.x - g.gx, y: o.y + placed.y - g.gy } : x;
          }),
        );
        return;
      }
      if (g.kind === "frame") {
        const z = viewRef.current.z;
        const dx = (e.clientX - g.sx) / z;
        const dy = (e.clientY - g.sy) / z;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * z < 4) return;
          g.moved = true;
          snapshot();
        }
        const ids = new Map(g.groups.map((o) => [o.id, o]));
        for (const o of g.groups) instantRef.current.add(o.id);
        setFrames((fs) =>
          fs.map((f) =>
            f.id === g.id
              ? { ...f, x: Math.round(g.fx + dx), y: Math.round(g.fy + dy) }
              : f,
          ),
        );
        setGroups((gs) =>
          gs.map((gr) => {
            const o = ids.get(gr.id);
            return o
              ? { ...gr, x: Math.round(o.x + dx), y: Math.round(o.y + dy) }
              : gr;
          }),
        );
        return;
      }
      const pt = toWorld(e.clientX, e.clientY);
      g.x1 = pt.x;
      g.y1 = pt.y;
      if (
        !g.moved &&
        Math.hypot(pt.x - g.x0, pt.y - g.y0) * viewRef.current.z > 4
      )
        g.moved = true;
      if (g.moved) {
        const l = Math.min(g.x0, g.x1);
        const r = Math.max(g.x0, g.x1);
        const t = Math.min(g.y0, g.y1);
        const b = Math.max(g.y0, g.y1);
        const hit = itemRects()
          .filter((it) => it.l < r && it.r > l && it.t < b && it.b > t)
          .map((it) => it.id);
        setSelectedIds(hit);
      }
      setGesture({ ...g });
    };
    const up = (e: PointerEvent) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      setGesture(null);
      endGuides();
      // a group dragged onto the parts panel is deleted, like a single part
      /* the step was taken when the drag began */
      if (g?.kind === "group" && g.moved && inBin(e.clientX)) {
        runOp(ops.removeGroups, { ids: [g.id, ...(g.carry ?? []).map((o) => o.id)] }, { history: "none" });
      } else if (g?.kind === "group" && g.moved) {
        /* Ctrl (or Cmd) keeps it where it is, the way it skips the guides */
        const settled = runOp(ops.settleGroup, { id: g.id, loose: e.ctrlKey || e.metaKey }, { history: "none" });
        if (settled?.joined && settled.itemId) {
          setSelectedIds([settled.itemId]);
          showToast(t("buttonsJoined", getLang()));
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGesturing]);
  return { gesture, setGesture, startPan, onCanvasPointerDown, onFramePointerDown, measure };
}
