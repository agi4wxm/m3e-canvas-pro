
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import { BASELINE_SEED, themeCss } from "@/lib/m3e/color";
import { CANVAS_SCOPE, recipesOf, styleContext, styleCss, stylesInReach, type CustomStyle, type StyleContext } from "@/lib/styles";
import { elevationCss } from "@/lib/look";
import { IconFamilyProvider, type IconFamily } from "@/components/m3e/icon";
import { fontFamilyOf, type Theme } from "@/lib/tokens";
import { getLang } from "@/lib/i18n";

/** the sketch's color scheme, as the shadcn M3E components see it */
export type PartTheme = {
  /** the color the scheme is generated from */
  seed: string;
  dark: boolean;
  contrast: "standard" | "medium" | "high";
  /** M3 shape scale: 0.35 is about square, 1 the standard corners, 1.6 about round */
  shape: number;
};

const DEFAULT_PART_THEME: PartTheme = { seed: "#6750A4", dark: false, contrast: "standard", shape: 1 };
export const PartThemeContext = createContext<PartTheme>(DEFAULT_PART_THEME);
export const usePartTheme = () => useContext(PartThemeContext);

const SCOPE = "m3-part-scope";

/** The variant a seed's scheme is built with. `baseline` is M3's static purple whatever the seed,
 *  so any other seed needs a variant that reads it; codegen prints the same choice. */
const variantOfSeed = (seed: string) => (seed.toUpperCase() === BASELINE_SEED ? "baseline" : "tonalSpot");

/** The scheme's CSS variables for every part. Rendered once. */
export function PartThemeStyle({ seed, contrast }: Pick<PartTheme, "seed" | "contrast">) {
  const css = themeCss({ source: { primary: seed }, variant: variantOfSeed(seed), contrast }, { light: `.${SCOPE}`, dark: `.dark .${SCOPE}` });
  /* an overlay drawn open inside its box has no page to dim */
  const overlays = ["dialog", "alert-dialog", "sheet", "drawer"].map((s) => `.${SCOPE} [data-slot="${s}-overlay"]`).join(", ");
  return <style id="m3-part-theme">{`${css}\n${overlays} { display: none; }`}</style>;
}

/* The document's own styles, for everything drawn under a root: what a style's key is read against there (lib/styles/
 * book.ts `StyleContext`). Each root that draws a document says whose: the editor, the screenshot page and the gallery
 * do. Two roots side by side may wear two styles of the same key, each its own. Outside any, what is in reach. */
const DocStylesContext = createContext<StyleContext | null>(null);

/** draws `children` in a document's own styles, and, given `icons`, its icons in that family (components/m3e/icon.tsx) */
export function DocStylesProvider({ styles, icons, children }: { styles: readonly CustomStyle[] | StyleContext | undefined; icons?: IconFamily; children: ReactNode }) {
  const value = styles && !Array.isArray(styles) ? (styles as StyleContext) : styleContext(styles as readonly CustomStyle[] | undefined);
  const inner = icons ? <IconFamilyProvider family={icons}>{children}</IconFamilyProvider> : children;
  return <DocStylesContext.Provider value={value}>{inner}</DocStylesContext.Provider>;
}

/** the styles a key is read against where this is drawn */
export const useDocStyles = (): StyleContext => useContext(DocStylesContext) ?? stylesInReach();

/** The document's style, as one stylesheet over the scheme. It comes after it, so what it says of a role wins. */
export function PartStyleSheet({ theme }: { theme: Theme }) {
  const lang = getLang();
  const styles = useDocStyles();
  const css = useMemo(
    /* a part raised to a level of elevation takes the style's own shadow for it */
    () => [styleCss({ ...theme, displayFamily: theme.displayFont ? fontFamilyOf(theme.displayFont, lang) : undefined }, CANVAS_SCOPE, styles), elevationCss(recipesOf(theme, styles).surface, CANVAS_SCOPE)].filter(Boolean).join("\n"),
    [theme, lang, styles],
  );
  return css ? <style id="m3-part-style">{css}</style> : null;
}

/** M3's corner steps at the standard scale (styles/m3e.css) */
const CORNERS: Record<string, number> = { "extra-small": 4, small: 8, medium: 12, large: 16, "large-increased": 20, "extra-large": 28, "extra-large-increased": 32, "extra-extra-large": 48 };

/** The corners at a shape scale, for a scope smaller than the page. A step is worked out where it is
 *  declared, on `:root`, so a scale set further down would reach nothing unless the steps come with it. */
export function shapeVars(scale: number): Record<string, string> {
  const at = (r: number) => `${Math.round(r * scale * 100) / 100}px`;
  return { "--md-sys-shape-scale": String(scale), "--radius": at(CORNERS.large), ...Object.fromEntries(Object.entries(CORNERS).map(([k, r]) => [`--md-sys-shape-corner-${k}`, at(r)])) };
}

/** what a part is drawn inside: the scheme's scope, in dark mode when the sketch is. It adds no box. */
export function PartSurface({ children }: { children: ReactNode }) {
  const { dark, shape } = usePartTheme();
  const style = { display: "contents", ...(shape === 1 ? null : shapeVars(shape)) } as CSSProperties;
  return (
    <div className={dark ? "dark" : undefined} style={{ display: "contents" }}>
      <div className={SCOPE} style={style}>
        {children}
      </div>
    </div>
  );
}
