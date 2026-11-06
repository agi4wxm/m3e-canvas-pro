/* What the canvas draws of the document: instances and repeats worked out, the layout of containers applied, and
 * which screen each part stands on. */

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Collection, ComponentDef, Frame, FrameMode, frameOfGroup, frameSizeOf, Group, heldBy, Item } from "@/lib/tokens";
import { outOfPane } from "@/lib/flow";
import { canvasView, type CanvasView } from "@/lib/expand";
import type { DragState } from "./model";

export type CanvasViewInputs = {
  /** something is being carried: what was worked out last stands meanwhile */
  carrying: boolean;
  groups: Group[];
  frames: Frame[];
  frame: FrameMode;
  components: ComponentDef[] | undefined;
  collections: Collection[] | undefined;
  widths: Record<string, number>;
  drag: DragState | null;
  /** groups that reposition without easing on the next render */
  instantRef: RefObject<Set<string>>;
  /** Tidy's way back, told of the state the layout pass turns this one into */
  tidyRef: { current: { after: Group[] } | null };
  /** a length being dragged, told the same */
  lengthRun: { current: { to: { frames: Frame[]; groups: Group[] } } | null };
  setGroups: (next: (g: Group[]) => Group[]) => void;
};

export function useCanvasView({ carrying, groups, frames, frame, components, collections, widths, drag, instantRef, tidyRef, lengthRun, setGroups }: CanvasViewInputs) {
  /* Containers with a layout put what they hold in its place after every change. It waits while
   * something is being carried, which is what lets a part be dragged out of its row or across it,
   * and it is part of whatever change caused it, so it never makes an undo step of its own. */
  /* What instances and repeats come to, and the layout of the document with them in it. It is worked
   * out while nothing is being carried; what it draws is relative to the group it stands on, so a
   * carried group takes its share along with no need to work anything out meanwhile. */
  const lastView = useRef<CanvasView>({ groups, drawn: new Map(), shown: new Map(), extra: [] });
  const canvas = useMemo(() => (carrying ? lastView.current : canvasView({ groups, components, collections }, widths)), [carrying, groups, components, collections, widths]);
  lastView.current = canvas;
  /* the part being carried, not where it is: the drag changes with every move of the pointer */
  const dragItem = drag?.item;
  const allItems = useMemo(() => {
    const map = new Map<string, Item>();
    for (const g of groups) for (const it of g.items) map.set(it.id, canvas.shown.get(it.id) ?? it);
    for (const { item } of canvas.extra) map.set(item.id, item);
    if (dragItem) map.set(dragItem.id, dragItem);
    return [...map.values()];
  }, [groups, dragItem, canvas]);
  useEffect(() => {
    if (carrying) return;
    const next = canvas.groups;
    if (next === groups) return;
    next.forEach((g, i) => {
      if (g !== groups[i]) instantRef.current.add(g.id);
    });
    /* what remembers this very state (Tidy's way back, a length being dragged) is told of the new one */
    if (tidyRef.current?.after === groups) tidyRef.current = { ...tidyRef.current, after: next };
    if (lengthRun.current?.to.groups === groups) lengthRun.current = { ...lengthRun.current, to: { ...lengthRun.current.to, groups: next } };
    /* only over the state it was worked out from: a layout just asked for must not be written over by this older one, and it comes back here anyway */
    setGroups((current) => (current === groups ? next : current));
  }, [groups, canvas, carrying]);
  /** what a dock's other tabs hold: the canvas draws only the tab that is showing */
  const offTab = useMemo(() => outOfPane(groups, widths), [groups, widths]);
  /** what the preview starts without, with what those parts hold: drawn dimmed, so it can still be selected */
  const startsHidden = useMemo(() => new Set(groups.filter((g) => g.hidden).flatMap((g) => [g.id, ...heldBy(g, groups, widths).map((x) => x.id)])), [groups, widths]);
  /** which frame each run sits on (phone mode only) */
  const frameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (frame !== "phone") return m;
    /* a part goes with the layout that holds it: what overflows, or stands on a dock's other tab where it
     * was last laid out, is still on that screen. One walk for each part, so a large document stays quick */
    const byId = new Map(groups.map((g) => [g.id, g]));
    const screenOf = (g: Group, depth = 0): string | undefined => {
      const known = m.get(g.id);
      if (known !== undefined) return known;
      const host = g.inFlow ? byId.get(g.inFlow) : undefined;
      const id = host && host !== g && depth < 32 ? screenOf(host, depth + 1) : frameOfGroup(g, frames, widths)?.id;
      if (id) m.set(g.id, id);
      return id;
    };
    for (const g of groups) screenOf(g);
    return m;
  }, [groups, frames, frame, widths]);

  /** the size of the screen each part sits on, by part: an overlay drawn open never gets a
   *  virtual viewport bigger than the real one it is on */
  const screenByItem = useMemo(() => {
    const m = new Map<string, { w: number; h: number }>();
    for (const g of groups) {
      const fid = frameOf.get(g.id);
      const f = fid ? frames.find((x) => x.id === fid) : undefined;
      if (!f) continue;
      const s = frameSizeOf(f);
      for (const it of g.items) m.set(it.id, s);
    }
    /* what an instance or a row draws is on the screen of the group it stands on */
    for (const { item, owner } of canvas.extra) {
      const f = frames.find((x) => x.id === frameOf.get(owner));
      if (f) m.set(item.id, frameSizeOf(f));
    }
    return m;
  }, [groups, frameOf, frames, canvas]);
  return { canvas, allItems, offTab, startsHidden, frameOf, screenByItem };
}
