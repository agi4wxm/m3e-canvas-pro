/* The agent's eyes: a screen (or one part cut out of it) drawn offscreen at 1:1 with plain parts and handed back as a
 * PNG data URL, the same way the MCP bridge and the MCP server's render page take theirs (screenShot.tsx: what an id
 * names, waiting until the layer is drawn, with a timer for a tab in the background that draws no frames, and the
 * capture without web fonts). The editor renders the screen named by `shotFrame` into its hidden export layer
 * (src/editor/render.tsx `renderExport`, under `[data-shot]`) while a picture is taken; pictures are taken one at a time. */

import { useMemo, useRef, useState } from "react";
import type { DocStore } from "@/lib/core";
import type { Renderer } from "@/lib/tools";
import type { Doc, Frame } from "@/lib/tokens";
import { capture, layerDrawn, nextFrame, shotTarget } from "./screenShot";

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** the tallest picture taken of a long screen, in dp: a model reads the top of a feed as well as all of it */
const MAX_H = 2000;
/** how long a PNG may be before the picture goes as a JPEG: a screen with a painted backdrop is megabytes as a PNG */
const JPEG_OVER = 600_000;
/** room around a part cut out of its screen, so its edges and shadow show */
const PAD = 8;

export function useScreenshots(store: DocStore) {
  const [shotFrame, setShotFrame] = useState<Frame | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const renderer = useMemo<Renderer>(() => {
    const take = async (id: string, o: { scale?: number; signal?: AbortSignal } = {}): Promise<string> => {
      const doc = store.get().doc as Doc;
      const target = shotTarget(doc, store.ctx("ai").widths, id);
      if (!target) throw new Error(`there is no screen or part ${id} on a screen`);
      setShotFrame(target.frame);
      try {
        /* drawn, measured and laid out by the canvas, its parts' code and faces in */
        await nextFrame();
        await layerDrawn(doc);
        await wait(250, o.signal);
        const layer = document.querySelector<HTMLElement>("[data-shot]");
        if (!layer) throw new Error("the screen could not be drawn");
        const scale = Math.max(0.25, Math.min(2, o.scale ?? 1));
        const crop = target.crop && { x: target.crop.x - PAD, y: target.crop.y - PAD, w: target.crop.w + PAD * 2, h: target.crop.h + PAD * 2 };
        return await capture(layer, target.frame, scale, crop, MAX_H, JPEG_OVER);
      } finally {
        setShotFrame(null);
      }
    };
    return {
      screenshot(id, o) {
        const run = chain.current.then(() => take(id, o));
        chain.current = run.catch(() => undefined);
        return run;
      },
    };
  }, [store]);

  return { shotFrame, renderer };
}
