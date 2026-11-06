/* A screen saved as a PNG: drawn offscreen at 1:1 with plain parts (src/editor/render.tsx `renderExport`), so the
 * canvas's zoom, outlines and animations never reach the picture. */

import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import { Frame, frameLengthOf, frameSizeOf } from "@/lib/tokens";

export function useFrameImages(framesRef: RefObject<Frame[]>) {
  /** frame being rendered offscreen for the PNG export */
  const [exportFrame, setExportFrame] = useState<Frame | null>(null);
  /** The screen is re-rendered offscreen at 1:1 with static parts, so the
   *  canvas zoom, selection outlines and in-flight animations never leak into the PNG. */
  const saveFrameImage = async (f: Frame) => {
    setExportFrame(f);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    try {
      await document.fonts?.ready;
      const el = document.querySelector<HTMLElement>(`[data-export="${f.id}"]`);
      if (!el) return;
      const url = await toPng(el, { pixelRatio: 2, cacheBust: true, width: frameSizeOf(f).w, height: frameLengthOf(f) });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${f.name || "screen"}.png`;
      a.click();
    } finally {
      setExportFrame(null);
    }
  };

  /** One file per screen, one after another: there is one export layer, and browsers drop downloads
   *  that start in the same instant. */
  const saveAllFrameImages = async () => {
    for (const f of framesRef.current) {
      await saveFrameImage(f);
      await new Promise((r) => setTimeout(r, 300));
    }
  };
  return { exportFrame, saveFrameImage, saveAllFrameImages };
}
