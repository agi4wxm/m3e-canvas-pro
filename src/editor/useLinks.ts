/* The arrows of a design: from each tappable part to the screen it opens, routed around the other screens, and the
 * ones worth drawing now. A line can stand for several rows that open one screen; what is done to it is done to all. */

import { useMemo } from "react";
import { actionsOf, BACK_TARGET, BEZEL, Frame, FrameMode, frameOfPart, frameRect, Group, Transition } from "@/lib/tokens";
import { isNavPart, mergeLinks, routeLink, shownLinks, type LinkLine, type Route } from "@/lib/links";
import { ops, type Op, type TxOptions } from "@/lib/core";

export type LinkInputs = {
  frame: FrameMode;
  groups: Group[];
  frames: Frame[];
  widths: Record<string, number>;
  itemRects: () => { id: string; l: number; t: number; r: number; b: number }[];
  showAllLinks: boolean;
  selectedIds: string[];
  selectedFrameId: string | null;
  selectedLinkId: string | null;
  setSelectedLinkId: (id: string | null) => void;
  runOp: <A, R>(o: Op<A, R>, args: A, opts?: TxOptions & { label?: string }) => R | undefined;
};

export function useLinks({ frame, groups, frames, widths, itemRects, showAllLinks, selectedIds, selectedFrameId, selectedLinkId, setSelectedLinkId, runOp }: LinkInputs) {
  /** arrows from tappable parts to the frames they open */
  const links = useMemo(() => {
    if (frame !== "phone") return [];
    const rects = itemRects();
    const out: (Route & LinkLine & { t: Transition })[] = [];
    for (const g of groups) {
      const source = frameOfPart(g, groups, frames, widths);
      for (const it of g.items) {
        for (const { slot, action } of actionsOf(it)) {
        if (action.to === BACK_TARGET) continue;
        const at = frames.findIndex((x) => x.id === action.to);
        const r = rects.find((x) => x.id === it.id);
        if (at < 0 || !r) continue;
        const f = frames[at];
        const others = frames.filter((x) => x.id !== f.id && x.id !== source?.id).map(frameRect);
        out.push({
          ...routeLink(r, frameRect(f), others, source ? frameRect(source) : undefined, BEZEL, at * 12),
          id: `${it.id}|${slot}`,
          itemId: it.id,
          to: f.id,
          fromFrame: source?.id,
          nav: isNavPart(it.component),
          t: action.transition,
        });
        }
      }
    }
    return mergeLinks(out);
  }, [groups, frames, frame, itemRects, widths]);
  /** the lines worth drawing right now: most of a design's are noise until asked for */
  const visibleLinks = useMemo(() => shownLinks(links, { all: showAllLinks, selectedIds, selectedFrameId, selectedLinkId }), [links, showAllLinks, selectedIds, selectedFrameId, selectedLinkId]);

  /* a line can stand for several rows that open one screen: what is done to it is done to them all */
  const idsOfLink = (linkId: string) => links.find((l) => l.id === linkId)?.ids ?? [linkId];
  const setLinkTransition = (linkId: string, transition: Transition) => runOp(ops.setLinkTransition, { links: idsOfLink(linkId), transition }, { history: { coalesce: "link:" + linkId } });
  const removeLink = (linkId: string) => {
    /* the arrow is where it goes; what else the tap does stays */
    runOp(ops.removeLinks, { links: idsOfLink(linkId) }, { history: "step" });
    setSelectedLinkId(null);
  };
  return { visibleLinks, setLinkTransition, removeLink };
}
