/* Figma-style smart guides, and where the parts stand on the canvas: what a part carried, a group moved or an edge
 * pulled lines up with, and the rectangles a sweep, a measure or a landing spot reads. Everything is read from refs,
 * so the answers are those of the moment a pointer moves. */

import { useCallback, useRef, type RefObject } from "react";
import { Frame, FrameMode, frameRect, Group, layoutOf, Theme } from "@/lib/tokens";
import { flowHostAt, outOfPane } from "@/lib/flow";
import { guideTargets, snapRect, type GuideTargets } from "@/lib/guides";
import { metricsOf } from "@/lib/styleLayout";
import { FRAME_MARGIN, GUIDE_PX, type Guide, type View } from "./model";

export type GuideInputs = {
  groupsRef: RefObject<Group[]>;
  framesRef: RefObject<Frame[]>;
  widthsRef: RefObject<Record<string, number>>;
  frameRef: RefObject<FrameMode>;
  themeRef: RefObject<Theme>;
  viewRef: RefObject<View>;
};

export function useGuides({ groupsRef, framesRef, widthsRef, frameRef, themeRef, viewRef }: GuideInputs) {
  /** What a drag can line up with, worked out once when it starts and kept until it ends: every part on the canvas but
   *  what is carried, and the screens with their margins and middles. A move of the pointer only reads it. */
  const guideCache = useRef<{ key: string; targets: GuideTargets } | null>(null);
  const targetsFor = useCallback((skip: Set<string>): GuideTargets => {
    const key = [...skip].sort().join(" ");
    if (guideCache.current?.key === key) return guideCache.current.targets;
    const rects: { l: number; t: number; r: number; b: number }[] = [];
    /* a part on a dock's other tab is not on the canvas to line up with */
    const off = outOfPane(groupsRef.current, widthsRef.current);
    for (const g of groupsRef.current) {
      if (off.has(g.id)) continue;
      for (const pl of layoutOf(g, widthsRef.current)) if (!skip.has(pl.item.id)) rects.push({ l: pl.x, t: pl.y, r: pl.x + pl.w, b: pl.y + pl.h });
    }
    const margin = metricsOf(themeRef.current).margin ?? FRAME_MARGIN;
    const screens = frameRef.current === "phone" ? framesRef.current.map((f) => ({ rect: frameRect(f), margin })) : [];
    const targets = guideTargets(rects, screens);
    guideCache.current = { key, targets };
    return targets;
  }, []);
  /** a drag is over: what it could line up with is worked out afresh for the next */
  const endGuides = () => {
    guideCache.current = null;
  };
  /** whether a group let go where it stands in these groups would go into an auto layout, which then places it */
  const overFlow = (gs: Group[], id: string) => !!flowHostAt(gs, id, widthsRef.current);

  /** Figma-style smart guides: the edges and centres of the parts on the same screen and of the screen itself, the gaps
   *  its neighbours keep, pull the part gently into line, and the guides say what it lines up with and how far it is. */
  const guideFor = useCallback(
    (left: number, top: number, sz: { w: number; h: number }, skip: Set<string>): Guide | null => {
      const tol = GUIDE_PX / viewRef.current.z;
      const s = snapRect({ l: left, t: top, r: left + sz.w, b: top + sz.h }, targetsFor(skip), tol);
      if (!s.snapX && !s.snapY && !s.gaps.length) return null;
      return { x: s.snapX ? left + s.dx : undefined, y: s.snapY ? top + s.dy : undefined, lines: s.lines, gaps: s.gaps };
    },
    [targetsFor],
  );
  const itemRects = useCallback(() => {
    const out: { id: string; l: number; t: number; r: number; b: number }[] =
      [];
    /* a part on a dock's other tab is not on the canvas to be swept up or pointed at */
    const off = outOfPane(groupsRef.current, widthsRef.current);
    for (const g of groupsRef.current) {
      if (off.has(g.id)) continue;
      for (const pl of layoutOf(g, widthsRef.current)) {
        out.push({ id: pl.item.id, l: pl.x, t: pl.y, r: pl.x + pl.w, b: pl.y + pl.h });
      }
    }
    return out;
  }, []);
  return { guideCache, targetsFor, endGuides, overFlow, guideFor, itemRects };
}
