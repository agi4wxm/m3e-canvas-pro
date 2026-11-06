/* The size handles of a lone part: an edge (or a circle's point) pulled with the pointer, or stepped with the keyboard.
 * The edge being pulled lines up with what is around it; off a guide it settles on the 4dp grid. One drag is one undo
 * step, taken at the first change, and the opposite edge stays where it is. As in Figma, Shift keeps the part's
 * proportions (the other measure follows) and Alt pulls from the centre (both edges move). */

import { useEffect, useRef, useState, type RefObject } from "react";
import { clamp, Group, Item, layoutOf } from "@/lib/tokens";
import { CORNER_GAIN, CORNERS, HandleSide } from "@/components/SizeHandles";
import { snapRect, type GuideGap, type GuideLine, type GuideTargets } from "@/lib/guides";
import { axisStep, axisValue, axisWrite, type PartAxis } from "@/parts/resize";
import { componentAxes, GUIDE_PX, type View } from "./model";
import { boxWithProps, constrainedIn, holdsFreely, withConstraints, type HeldBase } from "@/lib/constraints";

export type SizeHandleInputs = {
  snapshot: () => void;
  setGroups: (next: (g: Group[]) => Group[]) => void;
  /** groups that reposition without easing on the next render */
  instantRef: RefObject<Set<string>>;
  viewRef: RefObject<View>;
  widthsRef: RefObject<Record<string, number>>;
  targetsFor: (skip: Set<string>) => GuideTargets;
  endGuides: () => void;
  /** the selected part changed the way a panel changes it */
  patchSelected: (patch: Partial<Item>) => void;
  /** the canvas's groups now, for what a box with no auto layout holds */
  groupsRef?: RefObject<Group[]>;
};

export function useSizeHandles({ snapshot, setGroups, instantRef, viewRef, widthsRef, targetsFor, endGuides, patchSelected, groupsRef }: SizeHandleInputs) {
  /** the in-flight size drag on a lone button's edge handle */
  const [widthDragId, setWidthDragId] = useState<string | null>(null);
  /** how far the group under a left- or top-edge drag is drawn from where it sits, so the opposite
   *  edge stays put. It rides on the same commit as the new size, which keeps the two in step; the
   *  group's own position only moves once the drag ends. */
  const [widthShift, setWidthShift] = useState<{ gid: string; dx: number; dy: number } | null>(null);
  /** the lines an edge being pulled lines up with */
  const [resizeGuide, setResizeGuide] = useState<{ lines: GuideLine[]; gaps: GuideGap[] } | null>(null);
  const widthDragRef = useRef<{
    id: string;
    gid: string;
    side: HandleSide;
    vertical: boolean;
    round: boolean;
    /** the measure this handle pulls */
    axis?: PartAxis;
    /** the measure across it, which Shift keeps in proportion, and where it started */
    other?: PartAxis;
    otherV: number;
    startX: number;
    startY: number;
    start0: number;
    startV: number;
    v: number;
    min: number;
    max: number;
    /** where the part stood when the handle was taken, for the edge it pulls to line up with its neighbours */
    box0: { l: number; t: number; r: number; b: number };
    /** the undo step for this drag has been taken: it is taken at the first change */
    taken: boolean;
    /** the measure across, while Shift holds the proportions */
    o: number | undefined;
    /** pulled from the centre (Alt) at the last move */
    centre: boolean;
    /** a box with no auto layout: the parts it holds with constraints, as they stood, and the box they stood in */
    held: HeldBase[];
    was: { l: number; t: number; w: number; h: number } | null;
    group0: Group;
  } | null>(null);
  /** What a handle on this side of the part changes, and how far it may be pulled: the prop it
   *  holds, and the bounds of that prop. A drag and a key press read the same answer. */
  const sizeDragSpec = (item: Item, side: HandleSide) => {
    const vertical = side === "top" || side === "bottom";
    /* a circle is pulled by a point on it: the drag reads along the diagonal and the one
     * measure it has -- its diameter -- follows, so it stays round the whole way */
    const round = CORNERS.includes(side);
    const ax = componentAxes(item);
    const axis = ax ? (round ? ax.size : vertical ? ax.height : ax.width) : undefined;
    const other = ax && !round ? (vertical ? ax.width : ax.height) : undefined;
    const startV = axis ? axisValue(axis, item.props) : 0;
    return { vertical, round, startV, min: axis?.min ?? startV, max: axis?.max ?? startV, axis, other, otherV: other ? axisValue(other, item.props) : 0 };
  };
  /** the patch a new measure is */
  const sizePatch = (item: Item, d: { axis?: PartAxis; other?: PartAxis }, v: number, o?: number): Partial<Item> =>
    d.axis ? { props: { ...item.props, [d.axis.key]: axisWrite(d.axis, v), ...(d.other && o !== undefined ? { [d.other.key]: axisWrite(d.other, o) } : {}) } } : {};
  /** how far the group is drawn from where it sits, so the edges that stay put do: the one across from the handle, or
   *  with Alt the centre; `o` is the other measure Shift brought along */
  const shiftOf = (d: { side: HandleSide; round: boolean; vertical: boolean; startV: number; otherV: number }, v: number, o: number | undefined, centre: boolean) => {
    const grow = v - d.startV;
    const og = o === undefined ? 0 : o - d.otherV;
    if (d.round) {
      if (centre) return { dx: -grow / 2, dy: -grow / 2 };
      return { dx: d.side === "tl" || d.side === "bl" ? -grow : 0, dy: d.side === "tl" || d.side === "tr" ? -grow : 0 };
    }
    const main = centre ? -grow / 2 : d.side === "left" || d.side === "top" ? -grow : 0;
    const across = centre ? -og / 2 : 0;
    return d.vertical ? { dx: across, dy: main } : { dx: main, dy: across };
  };
  /** a handle pulled by the keyboard: one step out or in, kept the way a panel change is */
  const nudgeSize = (item: Item, side: HandleSide, dir: 1 | -1) => {
    const d = sizeDragSpec(item, side);
    if (!d.axis) return;
    const next = axisStep(d.axis, item.props, dir);
    if (next !== undefined) patchSelected({ props: { ...item.props, [d.axis.key]: next } });
  };
  /* a drag that outlives the editor leaves nothing listening behind it */
  const widthDragEnd = useRef<(() => void) | null>(null);
  useEffect(() => () => widthDragEnd.current?.(), []);
  const onWidthHandleDown = (e: React.PointerEvent, g: Group, item: Item, side: HandleSide) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const spec = sizeDragSpec(item, side);
    const at = layoutOf(g, widthsRef.current).find((pl) => pl.item.id === item.id);
    endGuides();
    widthDragRef.current = {
      id: item.id,
      gid: g.id,
      side,
      ...spec,
      startX: e.clientX,
      startY: e.clientY,
      start0: spec.vertical ? e.clientY : e.clientX,
      v: spec.startV,
      o: undefined,
      centre: false,
      box0: at ? { l: at.x, t: at.y, r: at.x + at.w, b: at.y + at.h } : { l: g.x, t: g.y, r: g.x, b: g.y },
      taken: false,
      held: [],
      was: null,
      group0: g,
    };
    /* a box with no auto layout takes what it holds along by their constraints, while it is pulled */
    if (g.items.length === 1 && holdsFreely(g)) {
      const all = groupsRef?.current ?? [];
      widthDragRef.current.held = constrainedIn(g, all, widthsRef.current);
      widthDragRef.current.was = boxWithProps(g, item, widthsRef.current);
    }
    setWidthDragId(item.id);
    const move = (ev: PointerEvent) => {
      const d = widthDragRef.current;
      if (!d) return;
      const z = viewRef.current.z;
      let raw: number;
      if (d.round) {
        /* how far the point travelled along its own diagonal, the two axes counting equally, read
           back as size through the gain the point itself is drawn with: it stays under the pointer */
        const dx = ((ev.clientX - d.startX) / z) * (d.side === "tl" || d.side === "bl" ? -1 : 1);
        const dy = ((ev.clientY - d.startY) / z) * (d.side === "tl" || d.side === "tr" ? -1 : 1);
        raw = d.startV + (dx + dy) / CORNER_GAIN;
      } else {
        const delta = ((d.vertical ? ev.clientY : ev.clientX) - d.start0) / z;
        /* from the centre both edges move, so the measure grows twice what the pointer travelled */
        raw = d.startV + (d.side === "right" || d.side === "bottom" ? delta : -delta) * (ev.altKey ? 2 : 1);
      }
      /* the edge being pulled lines up with the edges and centres around it, as a moved part does; Ctrl skips it */
      let snapped = false;
      if (!d.round && !(ev.ctrlKey || ev.metaKey) && !ev.altKey) {
        const grow = raw - d.startV;
        const b0 = d.box0;
        const far = d.side === "right" || d.side === "bottom";
        const rect = d.side === "right" ? { ...b0, r: b0.r + grow } : d.side === "left" ? { ...b0, l: b0.l - grow } : d.side === "bottom" ? { ...b0, b: b0.b + grow } : { ...b0, t: b0.t - grow };
        const edge: ("lo" | "hi")[] = [far ? "hi" : "lo"];
        const s = snapRect(rect, targetsFor(new Set([d.id])), GUIDE_PX / z, d.vertical ? { x: [], y: edge } : { x: edge, y: [] });
        const by = d.vertical ? s.dy : s.dx;
        if (d.vertical ? s.snapY : s.snapX) {
          raw += far ? by : -by;
          snapped = true;
          setResizeGuide({ lines: s.lines, gaps: [] });
        } else setResizeGuide(null);
      }
      /* on a guide the edge keeps its whole pixel; off one it settles on the 4dp grid */
      const v = clamp(snapped ? Math.round(raw) : Math.round(raw / 4) * 4, d.min, d.max);
      /* Shift keeps the proportions: the measure across follows */
      const o = ev.shiftKey && d.other && d.startV > 0 ? clamp(Math.round((d.otherV * v) / d.startV), d.other.min, d.other.max) : undefined;
      if (v === d.v && o === d.o && ev.altKey === d.centre) return;
      /* the undo step is taken at the first change, so a handle merely pressed leaves none */
      if (!d.taken) {
        snapshot();
        d.taken = true;
      }
      d.v = v;
      d.o = o;
      d.centre = ev.altKey;
      /* a FAB hangs off its own corner, so its run is drawn at an offset that changes with the
         size: it has to land with the pointer rather than ease after it */
      instantRef.current.add(d.gid);
      /* whichever point is held, the one across from it stays where it is; with Alt the centre does */
      const sh = shiftOf(d, v, o, ev.altKey);
      setWidthShift(sh.dx || sh.dy ? { gid: d.gid, dx: sh.dx, dy: sh.dy } : null);
      setGroups((prev) => {
        const next = prev.map((gr) =>
          gr.id !== d.gid
            ? gr
            : {
                ...gr,
                items: gr.items.map((it) => (it.id !== d.id ? it : { ...it, ...sizePatch(it, d, v, o ?? (d.other ? d.otherV : undefined)) })),
              },
        );
        if (!d.held.length || !d.was) return next;
        const box = next.find((gr) => gr.id === d.gid);
        if (!box) return next;
        const now = boxWithProps(d.group0, box.items[0], widthsRef.current);
        return withConstraints(next, d.held, d.was, { ...now, l: d.was.l + sh.dx, t: d.was.t + sh.dy });
      });

    };
    const up = () => {
      const d = widthDragRef.current;
      /* the drawn offset becomes the group's real position, in one step and with no easing */
      if (d && (d.v !== d.startV || d.o !== undefined)) {
        const sh = shiftOf(d, d.v, d.o, d.centre);
        const dx = Math.round(sh.dx);
        const dy = Math.round(sh.dy);
        if (dx || dy) {
          instantRef.current.add(d.gid);
          setGroups((prev) => prev.map((gr) => (gr.id !== d.gid ? gr : { ...gr, x: gr.x + dx, y: gr.y + dy })));
        }
      }
      setWidthShift(null);
      setResizeGuide(null);
      endGuides();
      widthDragRef.current = null;
      setWidthDragId(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      widthDragEnd.current = null;
    };
    widthDragEnd.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  return { widthDragId, widthShift, resizeGuide, onWidthHandleDown, nudgeSize };
}
