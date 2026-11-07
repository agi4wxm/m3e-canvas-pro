import { BASELINE_SEED, generateScheme } from "../../m3e/color";
import { FONTS, normalizeTheme, seedOf, shapeScaleOf, type Doc, type FontKey, type Theme } from "../../tokens";
import { recipesOf, resolveStyle, styleRoleColors, uxOf, type StylePack } from "../../styles";

/* The theme an exported React Native app wears: the document's colors in light and dark, its type ramp, corners, faces,
 * icon family and the recipes its style builds each kind of control with. The web wears the same theme as CSS variables
 * and a stylesheet of recipes (lib/styles/sheet.ts); a phone has neither, so everything a style says is resolved here to
 * plain numbers and colors, and the kit (rn/src/kit) reads the recipe names to build each control the style's way.
 * The shape is the kit's `KitTheme` (rn/src/kit/theme/types.ts): the printed file is type-checked against it. */

/** one step of a type ramp, resolved */
export type RnTypeStep = { size: number; line: number; weight: number; track: number };

/** what one mode resolves to: every color role (kebab-case, as the web's `--md-sys-color-*`) and the style's own colors */
export type RnMode = { colors: Record<string, string>; st: Record<string, string> };

export type RnTheme = {
  key: string;
  group: string;
  /** the mode the style is at its best in */
  mode: "light" | "dark";
  light: RnMode;
  dark: RnMode;
  type: Record<string, RnTypeStep>;
  shape: { scale: number; corners: Record<string, number> };
  /** a control's corner: 999 keeps M3's round ends */
  control: { radius: number; follow: boolean };
  font: { web: string; webDisplay?: string; google: string[] };
  icons: string;
  recipes: Record<string, string>;
  edge: number;
  compact: boolean;
  capsLabels: boolean;
  italicDisplay: boolean;
  ux: { margin: number; gap: number; tight: number };
  /** what a style's own CSS says that no recipe does (see `EXTRAS`) */
  extras: Record<string, string | number>;
};

/** What a style's own CSS (its pack's `css`) says that no recipe does, as values the kit reads: a color is a role, a role
 *  with an opacity (`outline/20`) or a hex. Written by hand from the packs' CSS for the styles checked on a phone; a style
 *  with none here is drawn by its recipes alone. */
const EXTRAS: Record<string, Record<string, string | number>> = {
  ios: {
    fieldFill: "outline/20",
    fieldRadius: 10,
    navBg: "surface-container-low/80",
    navBlur: 20,
    navLine: "on-surface/22",
    navLabelSize: 10,
    navInactive: "outline",
    barLine: "on-surface/22",
    tonalBg: "primary/15",
    tonalText: "primary",
    outlinedBg: "outline/20",
    outlinedText: "primary",
    filledWeight: 600,
    dialogBg: "surface-container-high/86",
    sheetTitle: 17,
  },
  wechat: {
    appbarBg: "surface",
    appbarIcon: "on-surface",
    navBg: "surface-container-high",
    navLine: "on-surface/14",
    navLabelSize: 10,
    navInactive: "on-surface",
    filledWeight: 600,
    tonalBg: "on-surface/5",
    tonalText: "primary",
    outlinedBg: "on-surface/5",
    outlinedText: "primary",
    fieldFill: "on-surface/5",
    fieldRadius: 8,
    searchBg: "surface-container-low",
    rowMin: 56,
    sheetTitle: 17,
    largeTitle: 22,
  },
  spotify: {
    filledWeight: 700,
    outlinedBorder: "outline",
    outlinedText: "on-surface",
    textButtonText: "on-surface",
    tabsCapsules: 1,
    chipBg: "surface-container-high",
    chipOn: "primary",
    chipOnText: "on-primary",
    navBg: "surface/95",
    navNoLine: 1,
    navLabelSize: 10,
    fabColor: "primary",
    fieldRadius: 4,
    avatarBg: "surface-container-high",
  },
};

/** M3's type scale at its standard values (styles/m3e.css) */
const M3_TYPE: Record<string, [number, number, number, number]> = {
  "display-large": [57, 64, 400, -0.2],
  "display-medium": [45, 52, 400, 0],
  "display-small": [36, 44, 400, 0],
  "headline-large": [32, 40, 400, 0],
  "headline-medium": [28, 36, 400, 0],
  "headline-small": [24, 32, 400, 0],
  "title-large": [22, 28, 400, 0],
  "title-medium": [16, 24, 500, 0.2],
  "title-small": [14, 20, 500, 0.1],
  "body-large": [16, 24, 400, 0.5],
  "body-medium": [14, 20, 400, 0.2],
  "body-small": [12, 16, 400, 0.4],
  "label-large": [14, 20, 500, 0.1],
  "label-medium": [12, 16, 500, 0.5],
  "label-small": [11, 16, 500, 0.5],
};

/** desktop software's smaller words (sheet.ts COMPACT_VARS) */
const COMPACT_TYPE: Record<string, [number, number]> = {
  "body-large": [14, 20],
  "body-medium": [13, 18],
  "title-large": [16, 22],
  "title-medium": [14, 20],
  "title-small": [13, 20],
  "label-large": [13, 18],
  "label-medium": [12, 16],
};

/** M3's corner steps at the standard scale (parts/theme.tsx) */
const CORNERS: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, lgi: 20, xl: 28, xli: 32, xxl: 48 };
const CONTROL_STEP: Record<string, string> = { "extra-small": "xs", small: "sm", medium: "md", large: "lg" };

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const round = (n: number) => Math.round(n * 100) / 100;

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as `[r, g, b, a]`, or nothing */
function rgba(hex: string): [number, number, number, number] | undefined {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return undefined;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
const toHex = ([r, g, b, a]: [number, number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}${a >= 1 ? "" : hex2(a * 255)}`.toUpperCase();

/** A value a style writes for one of its own colors, resolved against the mode's roles: a hex, a role's variable, or a
 *  role mixed with transparent or another color (`mix` in lib/styles/recipes/shared.ts). Anything else is left out. */
export function resolveColor(v: string | undefined, colors: Record<string, string>): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return toHex(rgba(s)!);
  const role = /^var\(--md-sys-color-([a-z-]+)\)$/.exec(s);
  if (role) return colors[role[1]];
  const mix = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%,\s*(.+)\)$/.exec(s);
  if (mix) {
    const a = rgba(resolveColor(mix[1], colors) ?? "");
    const p = Number(mix[2]) / 100;
    const other = mix[3].trim();
    const b = other === "transparent" ? undefined : rgba(resolveColor(other, colors) ?? "");
    if (!a) return undefined;
    if (!b) return toHex([a[0], a[1], a[2], round(a[3] * p)]);
    return toHex([a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), a[2] * p + b[2] * (1 - p), a[3] * p + b[3] * (1 - p)]);
  }
  return undefined;
}

/** the colors of one mode: the scheme the seed makes, with the style's own roles over it as the web lays them */
function modeOf(pack: StylePack | undefined, theme: Theme, seed: string, dark: boolean): RnMode {
  const variant = seed.toUpperCase() === BASELINE_SEED ? "baseline" : "tonalSpot";
  const colors: Record<string, string> = { ...generateScheme({ source: { primary: seed }, variant, contrast: theme.contrast, dark }) };
  const own = pack && !theme.ownColors && theme.contrast === "standard" ? pack : undefined;
  if (own) for (const [k, v] of Object.entries(styleRoleColors(dark ? own.dark : own.light, dark))) colors[kebab(k)] = v;
  for (const [k, v] of Object.entries(colors)) colors[k] = resolveColor(v, colors) ?? v;
  const tk = pack?.tokens ?? {};
  const role = (name: string) => colors[name];
  const st: Record<string, string> = {
    rim: resolveColor(tk.rim, colors) ?? role("outline"),
    rimDark: resolveColor(tk.rimDark, colors) ?? role("on-surface"),
    toggleOn: resolveColor(tk.toggleOn, colors) ?? role("primary"),
    navOn: resolveColor(tk.navOn, colors) ?? role("primary"),
    tabOn: resolveColor(tk.tabOn, colors) ?? role("primary"),
    navBg: resolveColor(tk.navBg, colors) ?? role("surface-container"),
    navActive: resolveColor(tk.navActive, colors) ?? role("secondary-container"),
    barBg: resolveColor(tk.barBg, colors) ?? role("surface-container"),
    onBar: resolveColor(tk.onBar, colors) ?? role("on-surface"),
    primaryText: (own ? resolveColor(dark ? tk.primaryTextDark : tk.primaryText, colors) : undefined) ?? role("primary"),
    tonedLine: resolveColor(tk.tonedLine, colors) ?? "#00000000",
  };
  return { colors, st };
}

const familyOf = (f: FontKey | undefined) => (f ? FONTS.find((x) => x.key === f) : undefined);

/** the theme of a document (or of a bare theme, for the kit's own gallery) as the React Native kit reads it */
export function rnThemeOf(source: Pick<Doc, "theme" | "paletteKey" | "customPalette" | "styles">): RnTheme {
  const theme = normalizeTheme(source.theme);
  const pack = resolveStyle(theme.style, source.styles);
  const seed = seedOf(source.paletteKey ?? "purple", source.customPalette, theme);
  const scale = shapeScaleOf(theme.shape);
  const type: Record<string, RnTypeStep> = {};
  for (const [k, [size, line, weight, track]] of Object.entries(M3_TYPE)) {
    const compact = pack?.compact ? COMPACT_TYPE[k] : undefined;
    const own = pack?.type?.[k];
    type[k] = own ? { size: own[0], line: own[1], weight: own[2] ?? weight, track: own[3] ?? track } : { size: compact?.[0] ?? size, line: compact?.[1] ?? line, weight, track };
  }
  const squared = theme.shape === "square" || theme.shape === "none" || theme.shape === "soft";
  const control = pack?.control ?? (squared ? "small" : "pill");
  const corners = Object.fromEntries(Object.entries(CORNERS).map(([k, r]) => [k, round(r * scale)]));
  const body = familyOf(theme.font);
  const display = familyOf(theme.displayFont);
  const google = [theme.font === "roboto" ? "Roboto:wght@400;500;600;700" : body?.google, display?.google].filter((g): g is string => !!g);
  const ux = uxOf(theme);
  return {
    key: pack?.key ?? "material",
    group: pack?.group ?? "app",
    mode: pack?.mode ?? "light",
    light: modeOf(pack, theme, seed, false),
    dark: modeOf(pack, theme, seed, true),
    type,
    shape: { scale, corners },
    control: { radius: control === "pill" ? 999 : corners[CONTROL_STEP[control]], follow: pack?.pill === "follow" || (theme.shape === "none" && !pack) },
    font: { web: (body ?? FONTS[0]).family, ...(display ? { webDisplay: display.family } : {}), google: [...new Set(google)] },
    icons: theme.icons ?? "rounded",
    recipes: { ...recipesOf(theme) },
    edge: pack?.edge ?? 2,
    compact: !!pack?.compact,
    capsLabels: !!pack?.capsLabels,
    italicDisplay: !!pack?.italicDisplay,
    ux: { margin: ux.margin, gap: ux.gap, tight: ux.tight },
    extras: { ...(pack && !theme.ownColors ? EXTRAS[pack.key] : undefined) },
  };
}
