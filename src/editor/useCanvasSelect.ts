/* Selecting on the canvas the way Figma does, by the layers tree (lib/layerTree.ts): a press picks the outermost layer
 * in the context of what is selected now, a double-click goes one level in, Ctrl/Cmd picks the part itself, Enter
 * selects the children, Shift+Enter or Escape the parent, Tab and Shift+Tab the next and the previous sibling. The
 * pointer over a part outlines what a press would pick. Nothing here changes the document. */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Group, Item, unionRect } from "@/lib/tokens";
import { childrenOfSelection, parentOfSelection, pickInside, pickTarget, siblingOf, type LayerTree } from "@/lib/layerTree";
import type { DocStore } from "@/lib/core";

export type CanvasSelectInputs = {
  store: DocStore;
  layersRef: RefObject<LayerTree | null>;
  groupsRef: RefObject<Group[]>;
  /** every part's box on the canvas */
  itemRects: () => { id: string; l: number; t: number; r: number; b: number }[];
  setSelectedIds: (ids: string[]) => void;
  setSelectedFrameId: (id: string | null) => void;
  setSelectedLinkId: (id: string | null) => void;
  setRightTab: (tab: "edit" | "prompt") => void;
  /** something is being carried or a gesture is on: no hover outline meanwhile */
  busy: () => boolean;
  /** a phone: with no double-click or keyboard to go in with, a tap picks the part itself, as it always did */
  mobileRef: RefObject<boolean>;
};

/** what a press picked: the group and the part a drag takes hold of, and what becomes selected */
export type Picked = { g: Group; index: number; item: Item; ids: string[]; /** all of it was selected before the press */ wasSelected: boolean };

export function useCanvasSelect({ store, layersRef, groupsRef, itemRects, setSelectedIds, setSelectedFrameId, setSelectedLinkId, setRightTab, busy, mobileRef }: CanvasSelectInputs) {
  /** What a press on a part on the canvas picks. With no tree yet, the part itself (its whole group when hand-made). */
  const pickFor = (e: { ctrlKey: boolean; metaKey: boolean }, g: Group, index: number, item: Item): Picked => {
    const tree = layersRef.current;
    const cur = store.get().session.selection;
    const was = (ids: string[]) => ids.every((x) => cur.includes(x));
    const own = g.free || g.instanceOf ? g.items.map((it) => it.id) : [item.id];
    const fallback: Picked = { g, index, item, ids: own, wasSelected: was(own) };
    if (!tree) return fallback;
    const ids = pickTarget(tree, item.id, cur, e.ctrlKey || e.metaKey || !!mobileRef.current);
    const tg = groupsRef.current.find((x) => x.items.some((it) => it.id === ids[0]));
    if (!tg) return fallback;
    const ti = Math.max(0, tg.items.findIndex((it) => it.id === ids[0]));
    return { g: tg, index: ti, item: tg.items[ti], ids, wasSelected: was(ids) };
  };

  const select = (ids: string[]) => {
    setSelectedIds(ids);
    setSelectedFrameId(null);
    setSelectedLinkId(null);
    setRightTab("edit");
  };

  /** a double-click on a part: one level further in than the selected layer it is inside */
  const onCanvasDoubleClick = (e: React.MouseEvent) => {
    const tree = layersRef.current;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node]");
    const id = el?.getAttribute("data-node");
    if (!tree || !id) return;
    const cur = store.get().session.selection;
    const next = pickInside(tree, id, cur);
    if (next.join(" ") !== cur.join(" ")) select(next);
  };

  /** Enter: what the selection holds */
  const enterChildren = () => {
    const tree = layersRef.current;
    const next = tree && childrenOfSelection(tree, store.get().session.selection);
    if (next) select(next);
  };
  /** Shift+Enter: the selection's parent, its screen at the top; Escape the same, letting go at the top */
  const selectParent = (escape: boolean) => {
    const tree = layersRef.current;
    const cur = store.get().session.selection;
    const up = tree && cur.length ? parentOfSelection(tree, cur) : null;
    if (up && "items" in up) {
      select(up.items);
      return true;
    }
    if (up && "screen" in up && !escape) {
      setSelectedIds([]);
      setSelectedFrameId(up.screen);
      setSelectedLinkId(null);
      setRightTab("edit");
      return true;
    }
    return false;
  };
  /** Tab and Shift+Tab: the next or the previous sibling */
  const selectSibling = (dir: 1 | -1) => {
    const tree = layersRef.current;
    const next = tree && siblingOf(tree, store.get().session.selection, dir);
    if (next) select(next);
    return !!next;
  };

  /* the pointer over a part outlines what a press there would pick: Ctrl/Cmd the part itself */
  const [hoverIds, setHoverIds] = useState<string[] | null>(null);
  const frame = useRef(0);
  const onCanvasPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const target = e.target as HTMLElement;
    const deep = e.ctrlKey || e.metaKey;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const tree = layersRef.current;
      const id = target.closest<HTMLElement>("[data-node]")?.getAttribute("data-node");
      if (!tree || !id || busy()) return setHoverIds((cur) => (cur ? null : cur));
      const ids = pickTarget(tree, id, store.get().session.selection, deep);
      setHoverIds((cur) => (cur && cur.join(" ") === ids.join(" ") ? cur : ids));
    });
  };
  const onCanvasPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    setHoverIds(null);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  /** the box the hover outline is drawn round, unless what it covers is selected already; worked out again only when
   *  what is pointed at, the selection or the canvas changes, not on every draw of the editor */
  const selection = store.get().session.selection;
  const groups = groupsRef.current;
  const hoverBox = useMemo(() => {
    if (!hoverIds?.length) return null;
    if (hoverIds.every((id) => selection.includes(id))) return null;
    const ids = new Set(hoverIds);
    const rects = itemRects().filter((r) => ids.has(r.id));
    return rects.length ? unionRect(rects) : null;
    // the rects are read off the groups named here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverIds, selection, groups]);

  return { pickFor, onCanvasDoubleClick, enterChildren, selectParent, selectSibling, onCanvasPointerMove, onCanvasPointerLeave, hoverBox };
}
