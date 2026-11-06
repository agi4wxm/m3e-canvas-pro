/* A screen saved as a PNG: drawn offscreen at 1:1 with plain parts (src/editor/render.tsx `renderExport`), so the
 * canvas's zoom, outlines and animations never reach the picture. The same layer draws the small picture of the first
 * screen the projects list shows. There is one layer, so one picture is drawn at a time. */

import { useRef, useState, type RefObject } from "react";
import { toCanvas, toPng } from "html-to-image";
import { Frame, frameLengthOf, frameSizeOf } from "@/lib/tokens";

/** how wide a project's picture is, and how tall a long screen's picture may run before it is cut */
const THUMB_W = 240;
const THUMB_MAX_RATIO = 2.4;

export function useFrameImages(framesRef: RefObject<Frame[]>) {
  /** frame being rendered offscreen for the PNG export */
  const [exportFrame, setExportFrame] = useState<Frame | null>(null);
  /** the pictures waiting their turn on the one layer */
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  /** draws `f` on the export layer and hands its element to `take`, one at a time */
  const onLayer = <T,>(f: Frame, take: (el: HTMLElement) => Promise<T>): Promise<T | null> => {
    const run = async () => {
      setExportFrame(f);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      try {
        await document.fonts?.ready;
        const el = document.querySelector<HTMLElement>(`[data-export="${f.id}"]`);
        return el ? await take(el) : null;
      } finally {
        setExportFrame(null);
      }
    };
    const next = queueRef.current.then(run, run);
    queueRef.current = next.catch(() => {});
    return next;
  };

  /** The screen is re-rendered offscreen at 1:1 with static parts, so the
   *  canvas zoom, selection outlines and in-flight animations never leak into the PNG. */
  const saveFrameImage = async (f: Frame) => {
    await onLayer(f, async (el) => {
      const url = await toPng(el, { pixelRatio: 2, cacheBust: true, width: frameSizeOf(f).w, height: frameLengthOf(f) });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${f.name || "screen"}.png`;
      a.click();
    });
  };

  /** One part of a screen saved as a PNG at a scale (the design panel's Export): the screen drawn as for its own picture,
   *  cut to the part's box. False when it could not be drawn. */
  const savePartImage = async (f: Frame, box: { x: number; y: number; w: number; h: number }, scale: number, name: string) =>
    !!(await onLayer(f, async (el) => {
      const canvas = await toCanvas(el, { pixelRatio: scale, cacheBust: true, width: frameSizeOf(f).w, height: frameLengthOf(f) });
      const x = Math.max(0, box.x - f.x);
      const y = Math.max(0, box.y - f.y);
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(box.w * scale));
      out.height = Math.max(1, Math.round(box.h * scale));
      out.getContext("2d")?.drawImage(canvas, x * scale, y * scale, box.w * scale, box.h * scale, 0, 0, out.width, out.height);
      const a = document.createElement("a");
      a.href = out.toDataURL("image/png");
      a.download = `${name || "part"}@${scale}x.png`;
      a.click();
      return true;
    }).catch(() => null));

  /** One file per screen, one after another: there is one export layer, and browsers drop downloads
   *  that start in the same instant. */
  const saveAllFrameImages = async () => {
    for (const f of framesRef.current) {
      await saveFrameImage(f);
      await new Promise((r) => setTimeout(r, 300));
    }
  };

  /** A small picture of a screen for the projects list (WebP where the browser writes it, else JPEG); a long screen
   *  is cut below the first view or so. Null when it could not be drawn. Web fonts are not embedded: at this size the
   *  page's own faces do, and embedding them is the slow part (and reads stylesheets of other origins). */
  const frameThumb = (f: Frame): Promise<string | null> =>
    onLayer(f, async (el) => {
      const { w } = frameSizeOf(f);
      const h = Math.min(frameLengthOf(f), Math.round(w * THUMB_MAX_RATIO));
      const canvas = await toCanvas(el, { pixelRatio: THUMB_W / w, width: w, height: h, skipFonts: true });
      const webp = canvas.toDataURL("image/webp", 0.72);
      return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.78);
    }).catch(() => null);

  return { exportFrame, saveFrameImage, saveAllFrameImages, savePartImage, frameThumb };
}
