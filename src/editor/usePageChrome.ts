/* The page around the editor: its language and face, the fonts the theme asks for (every part measured again once
 * they arrive), the icon family, the background outside the app, and the height in-app browsers really give it. */

import { useEffect } from "react";
import { Palette, Theme, uiFontFamily } from "@/lib/tokens";
import { ensureFontLoaded, ensureLangFontLoaded } from "@/lib/theme";
import { useIconFamily } from "@/parts/icons";
import type { Lang } from "@/lib/i18n";

export function usePageChrome({ lang, theme, p, setWidths }: { lang: Lang; theme: Theme; p: Palette; setWidths: (w: Record<string, number>) => void }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    /* the editor's own text and the parts both pick up the language's Noto face */
    document.body.style.fontFamily = uiFontFamily(lang);
    ensureLangFontLoaded(lang, () => setWidths({}));
  }, [lang]);

  useEffect(() => {
    /* an empty width map makes every measured part read its width again in the new face */
    ensureFontLoaded(theme.font, () => setWidths({}), lang);
    if (theme.displayFont) ensureFontLoaded(theme.displayFont, () => setWidths({}), lang);
    /* a style builds its controls to other sizes too */
    setWidths({});
  }, [theme.font, theme.displayFont, theme.style, theme.recipes, lang]);

  useIconFamily(theme.icons ?? "rounded");

  /* the page background outside the app root follows the scheme, so dark mode has no white edges */
  useEffect(() => {
    document.body.style.background = p.surface;
    document.body.style.color = p.onSurface;
  }, [p.surface, p.onSurface]);

  /* in-app browsers size the page behind their own toolbars and may ignore dvh,
     so the measured inner height wins over the CSS height (innerHeight, not the
     visual viewport, so pinch-zoom and the keyboard leave the layout alone) */
  useEffect(() => {
    const apply = () => {
      const h = Math.round(window.innerHeight);
      if (h > 0) document.documentElement.style.setProperty("--app-h", `${h}px`);
    };
    /* in-app browsers (X, Instagram, LINE...) keep their own action bar over the
       page bottom, so the controls sit one button higher there. App names in the
       user agent are unreliable; the embedded web view itself is not: iOS web
       views omit the Safari token and Android ones carry "wv" */
    const ua = navigator.userAgent;
    const iosWebView = /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua);
    const androidWebView = /Android/.test(ua) && /(?:^|\W)wv(?:\W|$)/.test(ua);
    if (iosWebView || androidWebView || /Twitter|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
      document.documentElement.style.setProperty("--bottom-ui", "64px");
    }
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
}
