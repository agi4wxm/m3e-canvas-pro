/* A screen, or one part of it, as a PNG: drawn offscreen at 1:1 with plain parts (`renderExport`, the layer the
 * editor's "export image" draws), then turned into pixels with html-to-image, with the web fonts its words use
 * embedded (shotFonts.ts: only those faces, a second or so). The in-app agent (useScreenshots.ts) and the live MCP
 * bridge take their screenshots this way inside the editor, and the render page the MCP server loads in headless
 * Chromium does the same, so a picture looks the same whoever took it, and its words as they are on the canvas. */

import { toCanvas } from "html-to-image";
import { describeNode } from "@/lib/core";
import type { Lang } from "@/lib/i18n";
import { ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { fontFamilyOf, frameLengthOf, frameSizeOf, type Doc, type Frame, type Palette, type Theme } from "@/lib/tokens";
import { loadModules, modulesSettled } from "@/parts/components";
import { modulesOfDoc } from "@/parts/prefetch";
import { renderExport } from "./render";
import { shotFontCss } from "./shotFonts";

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

/** Waits for the faces a theme sets its words in, in a language, to be fetched (at most `ms`): what a page that
 *  draws a document without the editor around it (the render page) asks for before it measures or draws. */
export function themeFacesLoaded(theme: Pick<Theme, "font" | "displayFont">, lang: Lang, ms = 6000): Promise<void> {
  const loads: ((done: () => void) => void)[] = [(done) => ensureLangFontLoaded(lang, done), (done) => ensureFontLoaded(theme.font, done, lang)];
  if (theme.displayFont) loads.push((done) => ensureFontLoaded(theme.displayFont!, done, lang));
  return Promise.race([Promise.all(loads.map((load) => new Promise<void>((resolve) => load(resolve)))).then(() => {}), new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/** Waits for a layer to be drawn whole: the drawing code of the parts it holds, two frames, the faces. */
export async function layerDrawn(doc: Doc) {
  await loadModules(modulesOfDoc(doc)).catch(() => {});
  await modulesSettled().catch(() => {});
  await frameDone();
  await frameDone();
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 3000))]);
  await frameDone();
}

/** what a picture that will not draw is shown as: a plain grey patch where it stands */
const MISSING = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23d6d6d6'/%3E%3C/svg%3E";

/** Pictures from elsewhere that will not draw (gone, not a picture, or not allowed to be copied into another one) are
 *  swapped for a grey patch before the layer is turned into pixels: html-to-image fails the whole shot over one of
 *  them, with nothing but an error event to say why. Their addresses are handed back. */
async function setAsideBroken(el: HTMLElement): Promise<string[]> {
  const out: string[] = [];
  await Promise.all(
    [...el.querySelectorAll("img")].map(async (img) => {
      const src = img.currentSrc || img.getAttribute("src") || "";
      if (!src || /^(data|blob):/i.test(src)) return;
      const ok = await fetch(src, { signal: AbortSignal.timeout(8000) })
        .then((r) => r.ok && /^image\//i.test(r.headers.get("content-type") ?? ""))
        .catch(() => false);
      if (ok) return;
      out.push(src);
      img.removeAttribute("srcset");
      img.src = MISSING;
    }),
  );
  return out;
}

/** The drawn layer as a PNG data URL, at `scale` pixels per dp, cut down to `crop` for a part; a long screen is drawn
 *  no taller than `maxH` dp when that is given (a model reads the top of a feed as well as all of it). A PNG longer
 *  than `jpegOver` characters (a screen with a painted backdrop is megabytes) comes as a JPEG instead: every picture is
 *  sent again with each request of a turn. The addresses of pictures that would not draw, and were left out, go into
 *  `skipped`. */
export async function capture(layer: HTMLElement, frame: Frame, scale = 1, crop?: Crop, maxH?: number, jpegOver?: number, skipped?: string[]): Promise<string> {
  const el = layer.querySelector<HTMLElement>(`[data-export="${CSS.escape(frame.id)}"]`) ?? layer;
  const w = frameSizeOf(frame).w;
  const h = maxH ? Math.min(frameLengthOf(frame), maxH) : frameLengthOf(frame);
  const broken = await setAsideBroken(el);
  /* one that still fails as it is copied is left blank rather than failing the whole picture */
  const onImageErrorHandler = (e: Event | string) => {
    const src = typeof e === "string" ? "" : ((e.target as HTMLImageElement | null)?.src ?? "");
    broken.push(src && !src.startsWith("data:") ? src : "a picture");
  };
  /* the faces its words use, and only those: without them the words fall back to a wider face and get cut short */
  const canvas = await toCanvas(el, { pixelRatio: scale, width: w, height: h, fontEmbedCSS: await shotFontCss(el), imagePlaceholder: MISSING, onImageErrorHandler });
  skipped?.push(...broken);
  const encode = (c: HTMLCanvasElement) => {
    const png = c.toDataURL("image/png");
    return jpegOver && png.length > jpegOver ? c.toDataURL("image/jpeg", 0.9) : png;
  };
  if (!crop) return encode(canvas);
  const x = Math.max(0, Math.min(w, crop.x));
  const y = Math.max(0, Math.min(h, crop.y));
  const cw = Math.max(1, Math.min(w - x, crop.w));
  const ch = Math.max(1, Math.min(h - y, crop.h));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * scale));
  out.height = Math.max(1, Math.round(ch * scale));
  out.getContext("2d")!.drawImage(canvas, x * scale, y * scale, cw * scale, ch * scale, 0, 0, out.width, out.height);
  return encode(out);
}
