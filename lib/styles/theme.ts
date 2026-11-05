import type { FontKey, IconFamily, Palette, ShapeScale } from "../tokens";
import { PACKS } from "./packs";
import { M3, RECIPES, RECIPE_KEYS, type RecipeKey, type Recipes } from "./recipes";
import { DEFAULT_UX, ERRORS_DARK, ERRORS_LIGHT, type StyleGroup, type StylePack, type StyleUX } from "./types";

/* Reading a style off a theme: which pack it wears, the settings picking it writes, and what the theme comes to once
 * the author's own changes are laid over the style's. */

export const STYLE_PACKS: StylePack[] = PACKS;

export const STYLE_GROUPS: StyleGroup[] = ["app", "desktop", "mobileGame", "pcGame"];

/** the table of styles in public/agent.md, for a model choosing one and composing its screens */
export function styleCatalog(): string {
  const row = (key: string, refs: string, layout: string) => `| ${key} | ${refs} | ${layout} |`;
  return [
    "| `style` | Looks like | How its screens are composed |",
    "| --- | --- | --- |",
    row("(left out)", "Android, Google's apps", "Plain Material 3: a top bar, a body on 16dp margins, a bottom navigation bar."),
    ...STYLE_PACKS.map((s) => row(`\`${s.key}\``, s.refs.join(", "), s.layout.en)),
  ].join("\n");
}

export const styleOf = (key: string | undefined): StylePack | undefined => (key ? STYLE_PACKS.find((s) => s.key === key) : undefined);

/** what a theme says that bears on its style */
export type Styled = {
  style?: string;
  ownColors?: boolean;
  recipes?: Partial<Recipes>;
  dark?: boolean;
  contrast?: string;
  shape?: ShapeScale;
  font?: FontKey;
  displayFont?: FontKey;
  icons?: IconFamily;
  ux?: Partial<StyleUX>;
};

/** the settings a style brings: picking it writes them on the theme, where each can be changed afterwards */
export function stylePatch(key: string) {
  const pack = styleOf(key);
  if (!pack) return { style: undefined, strict: true, ownColors: undefined, recipes: undefined, ux: undefined, displayFont: undefined, icons: undefined, shape: "rounded" as const, font: "roboto" as const, motion: "standard" as const, dark: false };
  return { style: pack.key, strict: true, ownColors: undefined, recipes: undefined, ux: undefined, displayFont: pack.display, icons: pack.icons, shape: pack.shape, font: pack.font, motion: pack.motion, dark: pack.mode === "dark" };
}

/** whether a document is held to its style's rules. A style held by default; Android once the author has picked it. */
export const isStrict = (t: { style?: string; strict?: boolean }) => t.strict ?? !!styleOf(t.style);

/** a style's colors are the document's until the author picks others */
export const colorsOf = (t: Styled) => (t.ownColors ? undefined : styleOf(t.style));

/** the seed the rest of a scheme comes from, when the style is the one coloring the document */
export const styleSeed = (t: Styled | undefined) => (t ? colorsOf(t)?.seed : undefined);

/** The palette the editor and the screens draw with. At a higher contrast the generated scheme is kept, since it is
 *  the one that promises that contrast; a style's own colors are for the standard level. */
export function stylePalette(t: Styled | undefined): Palette | undefined {
  if (!t || (t.contrast && t.contrast !== "standard")) return undefined;
  const pack = colorsOf(t);
  if (!pack) return undefined;
  const r = t.dark ? pack.dark : pack.light;
  return { key: pack.key, label: pack.name.en, seed: pack.seed, ...(t.dark ? ERRORS_DARK : ERRORS_LIGHT), ...r };
}

export const recipesOf = (t: Styled): Recipes => ({ ...M3, ...styleOf(t.style)?.recipes, ...t.recipes });

/** how a screen is laid out under a theme: Material's, the style's, and what the author changed */
export const uxOf = (t: Styled): StyleUX => ({ ...DEFAULT_UX, ...styleOf(t.style)?.ux, ...t.ux });

/** the words a picture is painted with when its scene names no style of its own */
export const artOf = (t: Styled | undefined) => styleOf(t?.style)?.art ?? "";

const isVariant = <K extends RecipeKey>(k: K, v: unknown): v is Recipes[K] => (RECIPES[k] as readonly unknown[]).includes(v);

/** the layout settings a stored theme names, without what it could not mean */
export function normalizeUx(u: unknown): Partial<StyleUX> | undefined {
  if (typeof u !== "object" || u === null) return undefined;
  const r = u as Record<string, unknown>;
  const out: Partial<StyleUX> = {};
  for (const k of ["margin", "gap", "tight"] as const) if (Number.isFinite(r[k]) && (r[k] as number) >= 0 && (r[k] as number) <= 64) out[k] = r[k] as number;
  if (r.nav === "keep" || r.nav === "bottom" || r.nav === "rail" || r.nav === "top") out.nav = r.nav;
  if (r.place === "top" || r.place === "center" || r.place === "bottom" || r.place === "spread") out.place = r.place;
  return Object.keys(out).length ? out : undefined;
}

/** the recipes a stored theme names, without the ones this version does not know */
export function normalizeRecipes(r: unknown): Partial<Recipes> | undefined {
  if (typeof r !== "object" || r === null) return undefined;
  const out: Partial<Recipes> = {};
  for (const k of RECIPE_KEYS) {
    const v = (r as Record<string, unknown>)[k];
    if (isVariant(k, v)) (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
