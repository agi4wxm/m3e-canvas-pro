/* The agent's eyes: a screen (or one part cut out of it) drawn offscreen at 1:1 with plain parts, the way a screen is
 * saved as a picture (useFrameImages.ts), and handed back as a PNG data URL. The editor renders the screen named by
 * `shotFrame` into its hidden export layer (src/editor/render.tsx `renderExport`) while a picture is taken; pictures
 * are taken one at a time. */

import { useMemo, useRef, useState } from "react";
import { toCanvas } from "html-to-image";
import { describeNode, type DocStore } from "@/lib/core";
import type { Renderer } from "@/lib/tools";
import { frameLengthOf, frameSizeOf, type Doc, type Frame } from "@/lib/tokens";

const frames = (n: number) => new Promise<void>((resolve) => {
  const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
  step(n);
});
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** the tallest picture taken of a long screen, in dp: a model reads the top of a feed as well as all of it */
const MAX_H = 2000;

export function useScreenshots(store: DocStore) {
  const [shotFrame, setShotFrame] = useState<Frame | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const renderer = useMemo<Renderer>(() => {
    const take = async (id: string, o: { scale?: number; signal?: AbortSignal } = {}): Promise<string> => {
      const s = store.get();
      const doc = s.doc as Doc;
      let frame = doc.frames.find((f) => f.id === id);
      let crop: { x: number; y: number; w: number; h: number } | undefined;
      if (!frame) {
        const d = describeNode(doc, store.ctx("ai").widths, id);
        if (!d?.screen) throw new Error(`${id} is on no screen`);
        frame = doc.frames.find((f) => f.id === d.screen!.id);
        crop = d.bounds;
      }
      if (!frame) throw new Error(`there is no screen ${id}`);
      setShotFrame(frame);
      try {
        /* drawn, measured and laid out by the canvas, its fonts and icons in */
        await frames(2);
        await document.fonts?.ready;
        await wait(350, o.signal);
        const el = document.querySelector<HTMLElement>(`[data-shot] [data-export="${frame.id}"]`);
        if (!el) throw new Error("the screen could not be drawn");
        const scale = Math.max(0.25, Math.min(2, o.scale ?? 1));
        const w = frameSizeOf(frame).w;
        const h = Math.min(frameLengthOf(frame), MAX_H);
        /* the web fonts are not embedded: a face in many files (a CJK face comes in a hundred pieces) takes seconds to
           fetch for every picture, and the model reads the layout, not the type, which the fallback faces keep */
        const canvas = await toCanvas(el, { pixelRatio: scale, width: w, height: h, cacheBust: false, skipFonts: true });
        if (!crop) return canvas.toDataURL("image/png");
        const pad = 8;
        const x = Math.max(0, crop.x - pad);
        const y = Math.max(0, crop.y - pad);
        const cw = Math.max(1, Math.min(w - x, crop.w + pad * 2));
        const ch = Math.max(1, Math.min(h - y, crop.h + pad * 2));
        const out = document.createElement("canvas");
        out.width = Math.round(cw * scale);
        out.height = Math.round(ch * scale);
        out.getContext("2d")?.drawImage(canvas, x * scale, y * scale, cw * scale, ch * scale, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
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
