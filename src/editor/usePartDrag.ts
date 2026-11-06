/* A part carried by the pointer: one taken out of its run on the canvas, or a new one from the parts palette, the
 * Components tab or a kit. The copy that follows the pointer springs after it and is held by smart guides; the run it
 * came out of keeps its hole until it has moved on; let go, it lands through lib/core (`drop_part`, `add_kit`), goes
 * into the bin over the parts panel, or fades where it was. Ctrl (Cmd) skips every snap while it is held. */

import { useCallback, useEffect, useState, type RefObject } from "react";
import { useSpring } from "motion/react";
import { Axis, ComponentDef, Frame, GAP, Group, heldBy, Item, sizeOf } from "@/lib/tokens";
import type { Mode, NoteAction } from "@/components/Toolbar";
import { canNest, standIn } from "@/lib/instances";
import { treeSize } from "@/lib/kits";
import { defaultMeasures } from "@/parts/templates/kit";
import { getLang, t } from "@/lib/i18n";
import { ops, type CoreState, type Op, type TxOptions } from "@/lib/core";
import { freshPart, freshSize } from "@/lib/core/ops/common";
import { CARRIED, carriedDrag, CARRY, VANISH_MS, type DragState, type Gesture, type Guide, type View } from "./model";

export type PartDragInputs = {
  dragRef: { current: DragState | null };
  gestureRef: { current: Gesture | null };
  setGesture: (g: Gesture | null) => void;
  startPan: (clientX: number, clientY: number) => void;
  modeRef: RefObject<Mode>;
  spaceRef: RefObject<boolean>;
  groupsRef: RefObject<Group[]>;
  framesRef: RefObject<Frame[]>;
  widthsRef: RefObject<Record<string, number>>;
  componentsRef: RefObject<ComponentDef[] | undefined>;
  defEditRef: { readonly current: CoreState["editing"] };
  viewRef: RefObject<View>;
  instantRef: RefObject<Set<string>>;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  inCanvas: (clientX: number, clientY: number) => boolean;
  /** over the open parts panel, where a drop deletes */
  inBin: (clientX: number) => boolean;
  snapshot: (withMeta?: boolean, label?: string) => void;
  setGroups: (next: (g: Group[]) => Group[]) => void;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;
  showToast: (msg: string, ms?: number, icon?: string, action?: NoteAction) => void;
  endGuides: () => void;
  guideFor: (left: number, top: number, sz: { w: number; h: number }, skip: Set<string>) => Guide | null;
  overFlow: (gs: Group[], id: string) => boolean;
  holdGap: (gid: string, index: number, w: number, h: number, from?: boolean) => void;
  closeGap: () => void;
  setSelectedIds: (ids: string[] | ((cur: string[]) => string[])) => void;
  setSelectedFrameId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
  setRightTab: (tab: "edit" | "prompt") => void;
  buildKit: (slug: string, variant: string | undefined, screen: Frame | undefined) => Group[] | null;
  landKit: (kit: NonNullable<DragState["kit"]>, x: number, y: number) => void;
  /** a tile clicked rather than dragged adds where the view is looking */
  addPart: (slug: string) => void;
  addInstance: (id: string) => void;
  addKit: (slug: string, variant?: string) => void;
  /** what a press on a part picks, by the layers tree: the outermost layer in context, or the part itself with Ctrl/Cmd */
  pickFor: (e: { ctrlKey: boolean; metaKey: boolean }, g: Group, index: number, item: Item) => { g: Group; index: number; item: Item; ids: string[]; wasSelected: boolean };
  /** what is selected right now, read at the moment of a press */
  selectionNow?: () => string[];
};

export function usePartDrag({ dragRef, gestureRef, setGesture, startPan, modeRef, spaceRef, groupsRef, framesRef, widthsRef, componentsRef, defEditRef, viewRef, instantRef, toWorld, inCanvas, inBin, snapshot, setGroups, runOp, showToast, endGuides, guideFor, overFlow, holdGap, closeGap, setSelectedIds, setSelectedFrameId, setSelectedLinkId, setRightTab, buildKit, landKit, addPart, addInstance, addKit, pickFor, selectionNow }: PartDragInputs) {
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const sizeRef = useCallback((it: Item) => sizeOf(it, widthsRef.current), []);
  const alongRef = useCallback(
    (it: Item, axis: Axis) => (axis === "x" ? sizeRef(it).w : sizeRef(it).h),
    [sizeRef],
  );
  const prefixOf = useCallback(
    (g: Group, k: number) =>
      g.items.slice(0, k).reduce((s, it) => s + alongRef(it, g.axis) + GAP, 0),
    [alongRef],
  );
  const sx = useSpring(0, CARRY);
  const sy = useSpring(0, CARRY);
  const findGuide = useCallback(
    (item: Item, left: number, top: number): Guide | null => guideFor(left, top, sizeRef(item), new Set([item.id])),
    [guideFor, sizeRef],
  );
  /* a drop that adds or deletes nothing: the ghost fades and shrinks where it was let go, so the
   * cancel is seen rather than the part simply blinking out */
  const vanishDrag = (d: DragState) => {
    setDrag({ ...d, vanishing: true, overBin: false, guide: null });
    window.setTimeout(() => setDrag((cur) => (cur?.vanishing ? null : cur)), VANISH_MS);
  };
  const onItemPointerDown = (
    e: React.PointerEvent,
    pressedGroup: Group,
    pressedIndex: number,
    pressedItem: Item,
  ) => {
    if (e.button === 1 || modeRef.current === "hand" || spaceRef.current) {
      e.preventDefault();
      e.stopPropagation();
      startPan(e.clientX, e.clientY);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    /* what the press picks: the outermost layer in the selection's context, or with Ctrl/Cmd the part itself; that
       layer is what is selected and what a drag carries */
    const { g, index, item, ids, wasSelected } = pickFor(e, pressedGroup, pressedIndex, pressedItem);
    /* Shift adds what was picked, or takes it away when it is selected already; the same selection again changes nothing,
       so pressing a selected part to drag it does not draw the panels again */
    const pick = (cur: string[]) => (!e.shiftKey ? (cur.length === ids.length && ids.every((x, i) => cur[i] === x) ? cur : ids) : ids.every((x) => cur.includes(x)) ? cur.filter((x) => !ids.includes(x)) : [...cur.filter((x) => !ids.includes(x)), ...ids]);
    /* A press on a part of a selection of several carries all of them, as in Figma: the part pressed leads and the rest,
       with what they hold, keep their distance to it. Parts a layout places stay to it unless their layout comes too. */
    const sel = selectionNow?.() ?? [];
    if (!e.shiftKey && wasSelected && sel.length > ids.length && !g.locked) {
      const chosen = new Set(sel);
      const all = groupsRef.current;
      const units = all.filter((x) => x.items.some((it) => chosen.has(it.id)) && !x.locked);
      const loose = (x: Group) => !x.inFlow || units.some((u) => u.id === x.inFlow) || (x.items.length === 1 && !!x.items[0].flowAbsolute);
      if (units.some((u) => u.id === g.id) && units.every(loose)) {
        const carried = new Map<string, Group>();
        for (const u of units) for (const x of [u, ...heldBy(u, all, widthsRef.current)]) if (x.id !== g.id) carried.set(x.id, x);
        for (const x of heldBy(g, all, widthsRef.current)) carried.set(x.id, x);
        const gg: Gesture = { kind: "group", id: g.id, sx: e.clientX, sy: e.clientY, gx: g.x, gy: g.y, moved: false, overBin: false, carry: [...carried.values()].map((x) => ({ id: x.id, x: x.x, y: x.y })) };
        gestureRef.current = gg;
        setGesture(gg);
        return;
      }
    }
    /* an instance moves in place, as one unit, like a hand-made group: the copy that follows a
       pointer is for parts that are nothing but their item */
    if (g.free || g.instanceOf) {
      setSelectedIds(pick);
      setSelectedFrameId(null);
      setSelectedLinkId(null);
      setRightTab("edit");
      /* a locked group stays selectable, but dragging it does nothing */
      if (g.locked) return;
      const gg: Gesture = { kind: "group", id: g.id, sx: e.clientX, sy: e.clientY, gx: g.x, gy: g.y, moved: false, overBin: false };
      gestureRef.current = gg;
      setGesture(gg);
      return;
    }
    /* a container with something on it moves with what it holds, all in place, not as a copy
       following the pointer; an empty one is a part like any other */
    const held = g.locked ? [] : heldBy(g, groupsRef.current, widthsRef.current);
    if (held.length) {
      setSelectedIds(pick);
      setSelectedFrameId(null);
      setSelectedLinkId(null);
      setRightTab("edit");
      const gg: Gesture = { kind: "group", id: g.id, sx: e.clientX, sy: e.clientY, gx: g.x, gy: g.y, moved: false, overBin: false, carry: held.map((x) => ({ id: x.id, x: x.x, y: x.y })) };
      gestureRef.current = gg;
      setGesture(gg);
      return;
    }
    const pt = toWorld(e.clientX, e.clientY);
    const off = prefixOf(g, index);
    const left = g.axis === "x" ? g.x + off : g.x;
    const top = g.axis === "x" ? g.y : g.y + off;
    sx.jump(left);
    sy.jump(top);
    setSelectedIds(pick);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
    setRightTab("edit");
    /* a locked group's part stays selectable, but dragging it does nothing; one taken out of the selection is not carried */
    if (g.locked || (e.shiftKey && wasSelected)) return;
    setPressedId(item.id);
    const d: DragState = {
      item,
      offX: pt.x - left,
      offY: pt.y - top,
      startX: pt.x,
      startY: pt.y,
      px: pt.x,
      py: pt.y,
      active: false,
      fromPalette: false,
      overBin: false,
      vanishing: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  const onPartPointerDown = (e: React.PointerEvent, slug: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const item = freshPart(slug);
    const pt = toWorld(e.clientX, e.clientY);
    /* held by its middle, at the size it will come out: a line of words that hugs them is far narrower than its part's default */
    const sz = freshSize(item);
    const offX = Math.min(sz.w / 2, 90);
    const offY = Math.min(sz.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    setSelectedIds([item.id]);
    setRightTab("edit");
    const d: DragState = {
      item,
      offX,
      offY,
      startX: pt.x,
      startY: pt.y,
      px: pt.x,
      py: pt.y,
      active: true,
      fromPalette: true,
      overBin: false,
      vanishing: false,
      guide: null,
    };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** A definition picked up from the Components tab: it is carried like a part from the palette, and lands as an instance. */
  const onComponentPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const def = componentsRef.current?.find((c) => c.id === id);
    if (!def) return;
    e.preventDefault();
    e.stopPropagation();
    const item = standIn(def, 0, 0).items[0];
    const pt = toWorld(e.clientX, e.clientY);
    const offX = Math.min(def.w / 2, 90);
    const offY = Math.min(def.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    const d: DragState = { item, offX, offY, startX: pt.x, startY: pt.y, px: pt.x, py: pt.y, active: true, fromPalette: true, overBin: false, vanishing: false, guide: null, instance: id };
    dragRef.current = d;
    setDrag({ ...d });
  };

  /** A kit picked up from the palette: carried like a part, drawn whole, and let go as its atoms. */
  const onKitPointerDown = (e: React.PointerEvent, slug: string, variant?: string) => {
    if (e.button !== 0 || defEditRef.current) return;
    const groups = buildKit(slug, variant, framesRef.current[0]);
    if (!groups?.length) return;
    e.preventDefault();
    e.stopPropagation();
    const item = groups[0].items[0];
    const size = treeSize(groups);
    const pt = toWorld(e.clientX, e.clientY);
    const offX = Math.min(size.w / 2, 90);
    const offY = Math.min(size.h / 2, 40);
    sx.jump(pt.x - offX);
    sy.jump(pt.y - offY);
    const d: DragState = { item, offX, offY, startX: pt.x, startY: pt.y, px: pt.x, py: pt.y, active: true, fromPalette: true, overBin: false, vanishing: false, guide: null, kit: { slug, variant, groups, measures: defaultMeasures(groups) } };
    dragRef.current = d;
    setDrag({ ...d });
  };

  const isDragging = drag !== null;

  useEffect(() => {
    if (!isDragging) return;
    /* Ctrl overrides auto-snap for as long as it is held: no magnet slot, no
       alignment guide, no 4dp grid. A pointer move carries its own ctrlKey, and
       key events cover the moments in between when the pointer is still. */
    let ctrlHeld = false;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const pt = toWorld(e.clientX, e.clientY);
      d.px = pt.x;
      d.py = pt.y;
      ctrlHeld = e.ctrlKey || e.metaKey;

      if (!d.active) {
        if (
          Math.hypot(pt.x - d.startX, pt.y - d.startY) * viewRef.current.z <
          5
        ) {
          setDrag({ ...d });
          return;
        }
        d.active = true;
        endGuides();
        const id = d.item.id;
        /* the group keeps the hole the part came out of until the part has moved on, rather than
         * snapping shut the moment the drag begins */
        const from = groupsRef.current.find((x) => !x.free && x.items.length > 1 && x.items.some((it) => it.id === id));
        if (from) {
          const index = from.items.findIndex((it) => it.id === id);
          const sz = sizeRef(d.item);
          holdGap(from.id, index, sz.w, sz.h, true);
        }
        snapshot();
        setGroups((prev) => {
          const out: Group[] = [];
          for (const g of prev) {
            const idx = g.items.findIndex((it) => it.id === id);
            if (idx < 0) {
              out.push(g);
              continue;
            }
            const rest = g.items.filter((it) => it.id !== id);
            if (rest.length === 0) continue;
            const sz = sizeOf(g.items[idx], widthsRef.current);
            const back = idx === 0;
            // The anchor moves to the new first item; that jump must not animate,
            // otherwise the remaining run springs sideways for a frame.
            if (back) instantRef.current.add(g.id);
            out.push({
              ...g,
              x: back && g.axis === "x" ? g.x + sz.w + GAP : g.x,
              y: back && g.axis === "y" ? g.y + sz.h + GAP : g.y,
              items: rest,
            });
          }
          return out;
        });
        setPressedId(null);
        setDrag({ ...d });
        return;
      }

      /* a part being added from the palette has nothing to delete yet; dropping it back there just cancels */
      d.overBin = !d.fromPalette && inBin(e.clientX);
      closeGap();
      /* over an auto layout the layout places it: nothing to line up with, only its slot to show */
      d.guide =
        d.overBin || ctrlHeld || d.kit || overFlow(carriedDrag(groupsRef.current, d.item, pt.x - d.offX, pt.y - d.offY), CARRIED)
          ? null
          : findGuide(d.item, pt.x - d.offX, pt.y - d.offY);
      setDrag({ ...d });
    };

    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setPressedId(null);
      endGuides();
      if (!d) return;
      if (!d.active) {
        setDrag(null);
        return;
      }

      closeGap();
      const loose = ctrlHeld || e.ctrlKey || e.metaKey;

      const item = d.item;

      if (d.overBin) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        vanishDrag(d);
        return;
      }

      /* A palette part is accepted by the canvas only when the pointer is released over it.
       * Testing the part's bounds here made a click in the palette add any wide part whose
       * preview happened to overlap the canvas. */
      if (d.fromPalette && !inCanvas(e.clientX, e.clientY)) {
        setSelectedIds((cur) => cur.filter((x) => x !== item.id));
        /* a component's tile pressed and let go without moving is a click: it adds one where the view is looking */
        if (d.instance && Math.hypot(d.px - d.startX, d.py - d.startY) * viewRef.current.z < 5) {
          setDrag(null);
          addInstance(d.instance);
          return;
        }
        /* so is a kit's */
        if (d.kit && Math.hypot(d.px - d.startX, d.py - d.startY) * viewRef.current.z < 5) {
          setDrag(null);
          addKit(d.kit.slug, d.kit.variant);
          return;
        }
        /* and a part's, as Enter on its tile does */
        if (!d.kit && !d.instance && item.component && Math.hypot(d.px - d.startX, d.py - d.startY) * viewRef.current.z < 5) {
          setDrag(null);
          addPart(item.component);
          return;
        }
        vanishDrag(d);
        return;
      }
      /* a definition does not go inside itself: refused here, before anything is added */
      if (d.instance && !canNest(componentsRef.current, defEditRef.current?.id ?? null, d.instance)) {
        showToast(t("nestRefused", getLang()));
        vanishDrag(d);
        return;
      }
      /* a kit lands as the tree of atoms it is, on the screen under it */
      if (d.kit) {
        landKit(d.kit, d.px - d.offX, d.py - d.offY);
        setDrag(null);
        return;
      }
      /* a Ctrl drop lands where the cursor is, untouched by any guide hold */
      const rawX = loose ? d.px - d.offX : d.guide?.x ?? d.px - d.offX;
      const rawY = loose ? d.py - d.offY : d.guide?.y ?? d.py - d.offY;
      if (d.fromPalette) snapshot(false, "Add");
      /* Ctrl keeps the pixel the cursor chose and a guide holds its whole-pixel position; the step was taken when the
       * part was picked up, or just now for one from the palette */
      const dropped = runOp(ops.dropPart, { item, x: rawX, y: rawY, heldX: d.guide?.x !== undefined, heldY: d.guide?.y !== undefined, loose, instanceOf: d.instance, pointer: { x: d.px, y: d.py } }, { history: "none" });
      if (d.instance) setSelectedIds([item.id]);
      if (dropped?.joined) {
        setSelectedIds([dropped.itemId]);
        showToast(t("buttonsJoined", getLang()));
      }
      setDrag(null);
    };

    /* Ctrl (or Cmd on a Mac) pressed or released while the pointer is still: the drawn
       magnet and guide must leave (or be free to return) right away, not on the next move */
    const onCtrl = (e: KeyboardEvent, held: boolean) => {
      if ((e.key !== "Control" && e.key !== "Meta") || e.repeat) return;
      const d = dragRef.current;
      if (!d) return;
      ctrlHeld = held;
      if (held) d.guide = null;
      setDrag({ ...d });
    };
    const onCtrlDown = (e: KeyboardEvent) => onCtrl(e, true);
    const onCtrlUp = (e: KeyboardEvent) => onCtrl(e, false);
    window.addEventListener("keydown", onCtrlDown);
    window.addEventListener("keyup", onCtrlUp);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", onCtrlDown);
      window.removeEventListener("keyup", onCtrlUp);
    };
    // handlers read live state through refs, so this binds once per drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  /* the overlay sits between the cursor and the slot, weighted by attraction */
  useEffect(() => {
    if (!drag?.active) return;
    const cursorL = drag.px - drag.offX;
    const cursorT = drag.py - drag.offY;
    sx.set(drag.guide?.x ?? cursorL);
    sy.set(drag.guide?.y ?? cursorT);
  }, [drag, sx, sy]);
  return { drag, setDrag, pressedId, setPressedId, sx, sy, onItemPointerDown, onPartPointerDown, onComponentPointerDown, onKitPointerDown };
}
