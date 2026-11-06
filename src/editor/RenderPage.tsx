/* The render page (/render): nothing but a screen drawn the way the editor's "export image" draws it, for the MCP
 * server's file backend, which has no editor open. Headless Chromium loads it from the app build the server serves
 * and calls two functions on the page:
 *
 *   m3eMeasure({doc, lang})                 the sizes the parts come out at, as the canvas measures them
 *   m3eRender({doc, widths, id, scale, lang})  a PNG of a screen (or a part cut out of its screen) as a data URL
 *
 * Both take the document as the store holds it (the canvas as shown), with the theme always present. */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CoreState } from "@/lib/core";
import { canvasView } from "@/lib/expand";
import { LangContext, setGlobalLang, type Lang } from "@/lib/i18n";
import { setDocStyles } from "@/lib/styles";
import { setDocIcons } from "./docIcons";
import { fontFamilyOf, frameOfGroup, frameSizeOf, normalizeTheme, paletteOf, seedOf, shapeScaleOf, type Doc, type Item } from "@/lib/tokens";
import { PartView } from "@/components/PartView";
import { FIT_OVERLAY } from "@/parts/contained";
import { PartStyleSheet, PartThemeContext, PartThemeStyle, type PartTheme } from "@/parts/theme";
import { firstBaseline } from "./model";
import { capture, layerDrawn, shotTarget, ShotLayer, themeFacesLoaded } from "./screenShot";

type Widths = Record<string, number>;
export type MeasureJob = { doc: CoreState["doc"]; lang: Lang };
export type RenderJob = { doc: CoreState["doc"]; widths: Widths; id: string; scale?: number; lang: Lang };

declare global {
  interface Window {
    m3eMeasure?: (job: MeasureJob) => Promise<Widths>;
    m3eRender?: (job: RenderJob) => Promise<string>;
  }
}

type Work = { kind: "measure"; job: MeasureJob; done: (w: Widths) => void; fail: (e: unknown) => void } | { kind: "render"; job: RenderJob; done: (png: string) => void; fail: (e: unknown) => void };

/** every part the canvas would draw, with the size of the screen it stands on */
function partsOf(doc: Doc): { item: Item; screen?: { w: number; h: number } }[] {
  const view = canvasView({ groups: doc.groups, components: doc.components, collections: doc.collections }, {});
  const out = new Map<string, { item: Item; screen?: { w: number; h: number } }>();
  const screenOf = (gid: string) => {
    const g = doc.groups.find((x) => x.id === gid);
    const f = g && frameOfGroup(g, doc.frames, {});
    return f ? frameSizeOf(f) : undefined;
  };
  for (const g of doc.groups) for (const it of g.items) out.set(it.id, { item: view.shown.get(it.id) ?? it, screen: screenOf(g.id) });
  for (const { item, owner } of view.extra) out.set(item.id, { item, screen: screenOf(owner) });
  return [...out.values()];
}

export function RenderPage() {
  const [work, setWork] = useState<Work | null>(null);
  const queue = useRef<Work[]>([]);
  const layer = useRef<HTMLDivElement>(null);
  const measured = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const take = (w: Work) => {
      queue.current.push(w);
      setWork((cur) => cur ?? queue.current.shift() ?? null);
    };
    window.m3eMeasure = (job) => new Promise((done, fail) => take({ kind: "measure", job, done, fail }));
    window.m3eRender = (job) => new Promise((done, fail) => take({ kind: "render", job, done, fail }));
    document.documentElement.dataset.m3eRender = "ready";
    return () => {
      delete window.m3eMeasure;
      delete window.m3eRender;
    };
  }, []);

  const doc = work?.job.doc as Doc | undefined;
  const lang = work?.job.lang ?? "en";
  const theme = useMemo(() => normalizeTheme(doc?.theme), [doc]);
  if (doc) {
    setGlobalLang(lang);
    setDocStyles(doc.styles);
    setDocIcons(doc.icons);
  }
  const p = useMemo(() => paletteOf(doc?.paletteKey ?? "purple", doc?.customPalette ?? null, theme), [doc, theme]);
  const partTheme = useMemo<PartTheme>(() => ({ seed: seedOf(doc?.paletteKey ?? "purple", doc?.customPalette ?? null, theme), dark: theme.dark, contrast: theme.contrast, shape: shapeScaleOf(theme.shape) }), [doc, theme]);
  const target = work?.kind === "render" && doc ? shotTarget(doc, work.job.widths, work.job.id) : null;

  /* once what the work needs is drawn, it is done and the next one comes */
  useEffect(() => {
    if (!work || !doc) return;
    let gone = false;
    const next = () => setWork(queue.current.shift() ?? null);
    void (async () => {
      try {
        /* the theme's faces first: the sizes are measured, and the words drawn, in them, as on the canvas */
        await themeFacesLoaded(theme, lang);
        await layerDrawn(doc);
        if (gone) return;
        if (work.kind === "measure") {
          const out: Widths = {};
          measured.current.forEach((el, id) => {
            const ov = el.querySelector<HTMLElement>(FIT_OVERLAY);
            const box = (ov ?? el).getBoundingClientRect();
            out[id] = Math.ceil(box.width);
            out[`${id}:h`] = Math.ceil(box.height);
            const base = firstBaseline(ov ?? el, box.top);
            if (base !== undefined) out[`${id}:base`] = base;
          });
          work.done(out);
        } else {
          if (!target) throw new Error(`There is no screen or part ${JSON.stringify(work.job.id)} to draw.`);
          work.done(await capture(layer.current!, target.frame, work.job.scale ?? 1, target.crop));
        }
      } catch (e) {
        work.fail(e instanceof Error ? e.message : String(e));
      }
      if (!gone) next();
    })();
    return () => {
      gone = true;
    };
  }, [work]);

  if (!work || !doc) return null;
  return (
    <LangContext.Provider value={lang}>
      <PartThemeContext.Provider value={partTheme}>
        <PartThemeStyle seed={partTheme.seed} contrast={partTheme.contrast} />
        <PartStyleSheet theme={theme} />
        {work.kind === "measure" ? (
          <div aria-hidden style={{ position: "fixed", left: -99999, top: 0, visibility: "hidden", fontFamily: fontFamilyOf(theme.font, lang) }}>
            {partsOf(doc).map(({ item, screen }) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) measured.current.set(item.id, el);
                  else measured.current.delete(item.id);
                }}
                style={{ display: "inline-flex", boxSizing: "border-box" }}
              >
                <PartView item={item} screen={screen} />
              </div>
            ))}
          </div>
        ) : (
          target && <ShotLayer layer={layer} frame={target.frame} doc={doc} widths={work.job.widths} p={p} theme={theme} lang={lang} />
        )}
      </PartThemeContext.Provider>
    </LangContext.Provider>
  );
}
