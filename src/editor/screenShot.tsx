/* A screen, or one part of it, as a PNG: drawn offscreen at 1:1 with plain parts (`renderExport`, the layer the
 * editor's "export image" draws), then turned into pixels with html-to-image. The in-app agent (useScreenshots.ts)
 * and the live MCP bridge take their screenshots this way inside the editor, and the render page the MCP server loads
 * in headless Chromium does the same, so a picture looks the same whoever took it. */

import { toCanvas } from "html-to-image";
import { describeNode } from "@/lib/core";
import type { Lang } from "@/lib/i18n";
import { fontFamilyOf, frameLengthOf, frameSizeOf, type Doc, type Frame, type Palette, type Theme } from "@/lib/tokens";
import { loadModules, modulesSettled } from "@/parts/components";
import { modulesOfDoc } from "@/parts/prefetch";
import { renderExport } from "./render";

export type Crop = { x: number; y: number; w: number; h: number };

/** what an id names: a screen, or a part and the box it takes on its screen */
export function shotTarget(doc: Doc, widths: Record<string, number>, id: string): { frame: Frame; crop?: Crop } | null {
  const frame = doc.frames.find((f) => f.id === id);
  if (frame) return { frame };
  const d = describeNode(doc, widths, id);
  const f = d?.screen && doc.frames.find((x) => x.id === d.screen!.id);
  return f && d ? { frame: f, crop: d.bounds } : null;
}

/** the layer a shot is taken of, far off the page */
export function ShotLayer({ frame, doc, widths, p, theme, lang, layer }: { frame: Frame; doc: Doc; widths: Record<string, number>; p: Palette; theme: Theme; lang: Lang; layer: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={layer} aria-hidden style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", fontFamily: fontFamilyOf(theme.font, lang) }}>
      {renderExport(frame, { doc, widths, frames: doc.frames, p, theme })}
    </div>
  );
}

/** The next frame, or a moment: a tab in the background draws no frames (the author may be looking at their MCP
 *  client), and a screenshot or a call's result must not wait for them. */
export const nextFrame = () =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 120);
    requestAnimationFrame(() => {
      clearTimeout(t);
      resolve();
    });
  });
const frameDone = nextFrame;

/** Waits for a layer to be drawn whole: the drawing code of the parts it holds, two frames, the faces. */
export async function layerDrawn(doc: Doc) {
  await loadModules(modulesOfDoc(doc)).catch(() => {});
  await modulesSettled().catch(() => {});
  await frameDone();
  await frameDone();
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 3000))]);
  await frameDone();
}

/** The drawn layer as a PNG data URL, at `scale` pixels per dp, cut down to `crop` for a part; a long screen is drawn
 *  no taller than `maxH` dp when that is given (a model reads the top of a feed as well as all of it). */
export async function capture(layer: HTMLElement, frame: Frame, scale = 1, crop?: Crop, maxH?: number): Promise<string> {
  const el = layer.querySelector<HTMLElement>(`[data-export="${CSS.escape(frame.id)}"]`) ?? layer;
  const w = frameSizeOf(frame).w;
  const h = maxH ? Math.min(frameLengthOf(frame), maxH) : frameLengthOf(frame);
  /* the web fonts are not embedded (as in the agent's screenshots, useScreenshots.ts): fetching a face in many files
     takes seconds a picture, and a model reads the layout, which the fallback faces keep */
  const canvas = await toCanvas(el, { pixelRatio: scale, width: w, height: h, skipFonts: true });
  if (!crop) return canvas.toDataURL("image/png");
  const x = Math.max(0, Math.min(w, crop.x));
  const y = Math.max(0, Math.min(h, crop.y));
  const cw = Math.max(1, Math.min(w - x, crop.w));
  const ch = Math.max(1, Math.min(h - y, crop.h));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * scale));
  out.height = Math.max(1, Math.round(ch * scale));
  out.getContext("2d")!.drawImage(canvas, x * scale, y * scale, cw * scale, ch * scale, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
