import type { FontKey, IconFamily, MotionScheme, Palette, ShapeScale } from "../tokens";
import type { Recipes } from "./recipes";

/* What a style is made of, as types: the words it is named in, its colors, how its screens are spaced, and the pack
 * itself. Kept apart from the packs so a pack file reads as data and nothing else. */

export type StyleText = { zh: string; en: string; ja: string; ko: string };
export const styleTextOf = (t: StyleText, lang: string) => t[lang as keyof StyleText] ?? t.en;
export const say = (zh: string, en: string, ja: string, ko: string): StyleText => ({ zh, en, ja, ko });

/** the color roles a style names; the ones a scheme has beyond these follow from them */
export type StyleRoles = Omit<Palette, "key" | "label" | "seed" | "error" | "onError" | "errorContainer" | "onErrorContainer"> & {
  onSecondary: string;
  tertiary: string;
  onTertiary: string;
} & Partial<Pick<Palette, "error" | "onError" | "errorContainer" | "onErrorContainer">>;

export type StyleGroup = "app" | "desktop" | "mobileGame" | "pcGame";

/** where a screen's main navigation stands, and how a screen is spaced: what Tidy lays a screen out by */
export type StyleUX = {
  /** between the screen's edge and what is on it, in px */
  margin: number;
  /** between the rows of a screen */
  gap: number;
  /** between rows of one kind, and after a heading */
  tight: number;
  /** "keep" leaves it wherever the author put it */
  nav: "keep" | "bottom" | "rail" | "top";
  /** where the body of a screen gathers */
  place: "top" | "center" | "bottom" | "spread";
  /** the media a style runs from edge to edge, with no corners */
  bleed?: ("video" | "image")[];
};

/** Material's own: a 16dp margin, 16dp between rows, 8dp between rows of a kind */
export const DEFAULT_UX: StyleUX = { margin: 16, gap: 16, tight: 8, nav: "keep", place: "top" };

export type StyleToken = "rim" | "rimDark" | "stroke" | "toggleOn" | "navOn" | "navBg" | "navActive" | "barBg" | "onBar" | "tabOn" | "primaryText" | "primaryTextDark" | "tonedLine";

/** one step of a type ramp: [size, line, weight, tracking in px] */
export type Step = [size: number, line: number, weight?: number, track?: number];
/** a style's type ramp, by M3 type role ("title-large", "body-medium"…) */
export type TypeRamp = Record<string, Step>;

export type StylePack = {
  key: string;
  name: StyleText;
  /** one line saying whose look this is and what gives it away */
  hint: StyleText;
  /** the products it is modeled on */
  refs: string[];
  basis: "official" | "sampled" | "observed" | "memory";
  group: StyleGroup;
  /** the color a scheme is generated from at the higher contrast levels, and for the roles it does not name */
  seed: string;
  light: StyleRoles;
  dark: StyleRoles;
  /** the mode it is at its best in, and the one it opens with */
  mode: "light" | "dark";
  shape: ShapeScale;
  font: FontKey;
  /** headings, when they take another face */
  display?: FontKey;
  icons: IconFamily;
  motion: MotionScheme;
  recipes: Partial<Recipes>;
  /** the corner of a button or a chip: "pill" keeps M3's round ends, a step follows the shape scale */
  control: "pill" | "extra-small" | "small" | "medium" | "large";
  /** what `rounded-full` means: "round" stays round, "follow" takes the control's corner, so a circle turns square */
  pill: "round" | "follow";
  /** desktop software packs its controls closer and sets its words smaller */
  compact?: boolean;
  /** the width of a hard edge, in px */
  edge?: number;
  /** behind everything on a screen, in both modes unless `screenDark` says otherwise */
  screen?: string;
  screenDark?: string;
  /** set in capitals, spaced out: the labels on its buttons and tabs */
  capsLabels?: boolean;
  /** headings lean */
  italicDisplay?: boolean;
  /** the pairs of roles that are this product's own even though they read below 4.5:1, kept because they are what it looks like */
  loud?: (keyof StyleRoles)[];
  /** colors of a control that no role names */
  tokens?: Partial<Record<StyleToken, string>>;
  /** the words every picture of this style is painted with */
  art: string;
  /** how a screen of this style is spaced and where its navigation stands */
  ux: StyleUX;
  /** how a screen of this product is composed, in words: for a model drafting one, and in the prompt */
  layout: StyleText;
  /** how it sets its words, by type role; left out, Material's ramp (or the compact one, for desktop software) */
  type?: TypeRamp;
  /** What no recipe says about this product: rules of its own, written only against `data-slot` and other `data-*`
   *  attributes, the role variables (`--md-sys-color-*`) and the style's own (`--st-*`). They come last, inside the
   *  style's scope, so they win over the recipes. */
  css?: string;
};

/** a pack as its file writes it: the layout in two languages, the spacing as far as it differs from Material's */
export type PackSource = Omit<StylePack, "ux" | "layout"> & { ux: Partial<StyleUX>; layout: { zh: string; en: string } };

/** a pack file's data as the rest of the system reads it */
export const definePack = (p: PackSource): StylePack => ({
  ...p,
  ux: { ...DEFAULT_UX, ...p.ux },
  layout: { zh: p.layout.zh, en: p.layout.en, ja: p.layout.en, ko: p.layout.en },
});

type Pair = [string, string];
/** a scheme written short: [fill, on it] for each accent, then the five surfaces low to high, the two text levels and the two lines */
export const roles = (r: { p: Pair; pc: Pair; s: Pair; sc: Pair; t: Pair; tc: Pair; bg: [string, string, string, string, string]; text: Pair; line: Pair }): StyleRoles => ({
  primary: r.p[0],
  onPrimary: r.p[1],
  primaryContainer: r.pc[0],
  onPrimaryContainer: r.pc[1],
  inversePrimary: r.pc[0],
  secondary: r.s[0],
  onSecondary: r.s[1],
  secondaryContainer: r.sc[0],
  onSecondaryContainer: r.sc[1],
  tertiary: r.t[0],
  onTertiary: r.t[1],
  tertiaryContainer: r.tc[0],
  onTertiaryContainer: r.tc[1],
  surface: r.bg[0],
  surfaceContainerLow: r.bg[1],
  surfaceContainer: r.bg[2],
  surfaceContainerHigh: r.bg[3],
  surfaceContainerHighest: r.bg[4],
  onSurface: r.text[0],
  onSurfaceVariant: r.text[1],
  outline: r.line[0],
  outlineVariant: r.line[1],
  inverseSurface: r.text[0],
  inverseOnSurface: r.bg[0],
});

export const ERRORS_LIGHT = { error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B" };
export const ERRORS_DARK = { error: "#FF8A80", onError: "#3B0907", errorContainer: "#7A1F1A", onErrorContainer: "#FFDAD6" };

/* type ramps written short, by the three sizes of a role */
export const TITLES = (l: Step, m: Step, s: Step): TypeRamp => ({ "title-large": l, "title-medium": m, "title-small": s });
export const BODIES = (l: Step, m: Step, s: Step): TypeRamp => ({ "body-large": l, "body-medium": m, "body-small": s });
export const LABELS = (l: Step, m: Step, s: Step): TypeRamp => ({ "label-large": l, "label-medium": m, "label-small": s });
/** the serif menus of the dark fantasy games: one weight, spaced a little */
export const SERIF_RAMP = (title: number): TypeRamp => ({ "headline-small": [28, 36, 400, 1], ...TITLES([title, title + 8, 400, 1], [17, 24, 400, 0.5], [15, 22, 400, 0.5]), ...BODIES([16, 24, 400, 0.2], [15, 22, 400, 0.2], [13, 18, 400, 0.2]), ...LABELS([15, 20, 400, 0.5], [13, 18, 400, 0.3], [12, 16, 400, 0.3]) });
/** the casual games: one heavy display face at every size */
export const CHUNKY_RAMP: TypeRamp = { "headline-small": [26, 32, 400, 0], ...TITLES([22, 28, 400, 0], [18, 24, 400, 0], [16, 22, 400, 0]), ...BODIES([16, 22, 500, 0], [14, 20, 500, 0], [12, 16, 500, 0]), ...LABELS([16, 22, 400, 0], [14, 18, 400, 0], [12, 14, 400, 0]) };
