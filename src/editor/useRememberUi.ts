/* The editor's own settings written down as they change (the camera, the panels, the favourites, the tool, the language
 * picked), with the theme's surfaces, so the shell drawn before the editor loads is already this colour. Nothing is
 * written before the saved settings have been read back. */

import { useEffect, type RefObject } from "react";
import { FrameMode, Palette } from "@/lib/tokens";
import type { Mode } from "@/components/Toolbar";
import type { Lang } from "@/lib/i18n";
import { UI_KEY, type View } from "./model";

export type UiMemory = {
  loadedRef: RefObject<boolean>;
  view: View;
  leftOpen: boolean;
  rightOpen: boolean;
  leftW: number;
  rightW: number;
  favorites: string[];
  mode: Mode;
  lang: Lang;
  showAllLinks: boolean;
  p: Palette;
  frame: FrameMode;
};

export function useRememberUi({ loadedRef, view, leftOpen, rightOpen, leftW, rightW, favorites, mode, lang, showAllLinks, p, frame }: UiMemory) {
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({
          view,
          leftOpen,
          rightOpen,
          leftW,
          rightW,
          favorites,
          mode,
          pickedLang: lang,
          showAllLinks,
          /* the theme's surfaces, so the shell drawn before the editor loads is already this colour */
          boot: { surface: p.surface, container: p.surfaceContainer, low: p.surfaceContainerLow, high: p.surfaceContainerHigh, primary: p.primary, canvas: frame === "phone" ? p.surfaceContainerLow : "#ffffff" },
        }),
      );
    } catch {}
  }, [
    view,
    leftOpen,
    rightOpen,
    leftW,
    rightW,
    p,
    frame,
    favorites,
    mode,
    lang,
    showAllLinks,
  ]);
}
