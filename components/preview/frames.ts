/* The preview's bindings per frame (lib/bindings/frame.ts, docs/数据绑定.md “每帧绑定”): one frame loop for the preview
 * session (lib/app/frame.ts), on `requestAnimationFrame`, reading the world a world view connected to its channel (the
 * example engine, the mocks' world), else the one the page hands in (`window.m3ePreviewWorld`, as the page may hand in
 * a transport: a test, the editor's benchmark). Each screen on show adds the bindings per frame of its parts, and each
 * part drawn writes its values straight into its box (lib/world/frameTargets.ts `writeFrameDom`): no React state, no
 * render, no commit per frame. */

import { createContext, useContext, useEffect, useMemo, type RefObject } from "react";
import { createFrameLoop, type FrameLoop, type FrameSpec } from "@/lib/app/frame";
import { FRAME_LIMITS } from "@/lib/bindings/frame";
import { frameTargetOf, framesOfItem, writeFrameDom, type FrameNode } from "@/lib/world/frameTargets";
import type { WorldSource } from "@/lib/world/root";
import type { Worlds } from "@/lib/world/channel";
import type { Group, Item } from "@/lib/tokens";

declare global {
  interface Window {
    /** a world the page hands the preview for the `world` root, read when no world view connected one */
    m3ePreviewWorld?: WorldSource;
  }
}

/** the frame loop of the preview session on show; none outside a preview */
export const PreviewFrames = createContext<FrameLoop | null>(null);

/** the preview session's frame loop: on the browser's frames, over the views' worlds or the page's */
export function createPreviewFrames(worlds: Worlds, lang: () => string): FrameLoop {
  const browser = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function";
  return createFrameLoop({
    world: () => worlds.attached() ?? (typeof window !== "undefined" ? window.m3ePreviewWorld : undefined),
    ...(browser ? { schedule: (fn: () => void) => window.requestAnimationFrame(fn), cancel: (h: unknown) => window.cancelAnimationFrame(h as number) } : {}),
    context: () => ({ lang: lang() }),
  });
}

/** Adds the bindings per frame of the parts a screen draws while it is drawn, at most `FRAME_LIMITS.perScreen`. */
export function useScreenFrames(groups: readonly Group[]) {
  const loop = useContext(PreviewFrames);
  const specs = useMemo(() => groups.flatMap((g) => g.items.flatMap(framesOfItem)).slice(0, FRAME_LIMITS.perScreen), [groups]);
  /* the same bindings drawn again are the same: a render does not add them anew */
  const key = useMemo(() => JSON.stringify(specs), [specs]);
  useEffect(() => {
    if (!loop || key === "[]") return;
    return loop.add(JSON.parse(key) as FrameSpec[]);
  }, [loop, key]);
}

/** Writes a part's values per frame into the box it is drawn in, on every frame (a render of the part may have put its
 *  design's value back; writing what is there already costs a read). */
export function usePartFrames(it: Pick<Item, "id" | "component" | "frame">, box: RefObject<HTMLElement | null>) {
  const loop = useContext(PreviewFrames);
  const props = Object.keys(it.frame ?? {})
    .filter((p) => frameTargetOf(it.component, p))
    .join("\u0000");
  const { id, component } = it;
  useEffect(() => {
    if (!loop || !props) return;
    const off = props.split("\u0000").map((prop) =>
      loop.listen(
        id,
        prop,
        (v) => {
          if (box.current) writeFrameDom(component, prop, box.current as unknown as FrameNode, v);
        },
        true,
      ),
    );
    return () => off.forEach((f) => f());
  }, [loop, props, id, component, box]);
}
