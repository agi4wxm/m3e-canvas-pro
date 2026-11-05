import { Lang, NAV_TABS, TAB_LABELS, getLang } from "./i18n";
import { Contrast, schemeFromSeed } from "./color";
import { partBySlug, reader } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import { roleOf } from "../parts/role";
import type { ListItem } from "../parts/types";
import { normalizeRecipes, normalizeUx, styleOf, stylePalette, stylePatch, styleSeed, type Recipes, type StyleUX } from "./styles";

/* ---------- geometry ---------- */
export const GAP = 3; // spacing between the parts of one group
export const R_INNER = 8; // inner corner of a connected run of cells (M3 small)

/** ms allowed for the landing animation before the item is committed */
export const SETTLE_MS = 340;
/** the same time and curve, as the CSS custom properties the stylesheet eases with */
export const SETTLE_CSS_VARS = { "--m3-settle": `${SETTLE_MS}ms`, "--m3-ease": "cubic-bezier(0.2, 0, 0, 1)" } as const;
/** the size handles stand above everything on the canvas but the panels */
export const SIZE_HANDLE_Z = 55;

/** phone screen used by the "phone" canvas mode (Pixel-like, dp) */
/* Pixel-class phone, 412 dp wide; kept at 892 dp tall so the whole screen fits the canvas */
export const PHONE_W = 412;
export const PHONE_H = 892;
export const PHONE_R = 40;
export const TABLET_W = 834;
export const TABLET_H = 1194;
export const DESKTOP_W = 1280;
export const DESKTOP_H = 800;
export const DESKTOP_R = 28;
/** M3 window size classes: a screen this wide is "expanded", where the navigation bar becomes a rail */
export const EXPANDED_W = 840;
export const isExpanded = (w: number) => w >= EXPANDED_W;
/** M3 Expressive navigation rail: narrow, collapsed and expanded widths */
export const RAIL_W = 80;
export const RAIL_COLLAPSED_W = 96;
const RAIL_EXPANDED_W = 220;
/* a modal rail expands over the content: the room it takes on the screen stays that of the collapsed one */
export const railWidth = (it: Item) => (it.props?.expanded && !it.props?.modal ? RAIL_EXPANDED_W : it.props?.narrow ? RAIL_W : RAIL_COLLAPSED_W);
/** Runtime-only expansion edge: copied by item edits, never included in JSON. */
export const railExpansionSide = Symbol("railExpansionSide");
/** the status bar above a top app bar */
export const STATUS_BAR_H = 24;
/** M3 layout margin: parts that are not edge-to-edge sit this far from the screen edge */
export const PHONE_MARGIN = 16;
export const contentWidth = (width: number) => width - PHONE_MARGIN * 2;
export const halfWidth = (width: number) => (contentWidth(width) - PHONE_MARGIN) / 2;
/** bezel around the screen and the label above it */
export const BEZEL = 10;
export const FRAME_LABEL_H = 44;
/** horizontal distance between newly added frames */
export const FRAME_GAP = 120;

export type Rect = { l: number; t: number; r: number; b: number };
/** the smallest box around all of these */
export const unionRect = (rects: Rect[]): Rect => ({
  l: Math.min(...rects.map((x) => x.l)),
  t: Math.min(...rects.map((x) => x.t)),
  r: Math.max(...rects.map((x) => x.r)),
  b: Math.max(...rects.map((x) => x.b)),
});

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const uid = () => Math.random().toString(36).slice(2, 10);

export type Radii = { tl: number; tr: number; bl: number; br: number };

/** what one part may look like beyond its fill, its words and its corners; each stands over what the style gives it */
export type ItemLook = {
  /** px */
  borderWidth?: number;
  borderColor?: TextToken;
  shadow?: "none" | "soft" | "deep" | "hard" | "glow";
  /** percent */
  opacity?: number;
  /** how much of what lies behind it is blurred through it, in px: frosted glass */
  glass?: number;
  /** degrees; it takes no more room for it */
  rotate?: number;
  /** the fill fades into this role */
  gradientTo?: ColorToken;
  gradientAngle?: number;
  font?: "display" | "mono";
};
export const uniformRadii = (r: number): Radii => ({ tl: r, tr: r, bl: r, br: r });

/* ---------- color ---------- */
export type Palette = {
  key: string;
  label: string;
  /** the color a custom scheme was generated from */
  seed?: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  secondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  surface: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
};

const ERROR = {
  error: "#B3261E",
  onError: "#FFFFFF",
  errorContainer: "#F9DEDC",
  onErrorContainer: "#410E0B",
};

/* presets are authored without secondary; it is derived from the seed below */
const PRESETS: Omit<Palette, "secondary">[] = [
  {
    key: "purple",
    label: "Purple",
    primary: "#6750A4",
    onPrimary: "#FFFFFF",
    primaryContainer: "#EADDFF",
    onPrimaryContainer: "#21005D",
    inversePrimary: "#D0BCFF",
    secondaryContainer: "#E8DEF8",
    onSecondaryContainer: "#1D192B",
    tertiaryContainer: "#FFD8E4",
    onTertiaryContainer: "#31111D",
    surface: "#FEF7FF",
    surfaceContainerLow: "#F7F2FA",
    surfaceContainer: "#F3EDF7",
    surfaceContainerHigh: "#ECE6F0",
    surfaceContainerHighest: "#E6E0E9",
    onSurface: "#1D1B20",
    onSurfaceVariant: "#49454F",
    outline: "#79747E",
    outlineVariant: "#CAC4D0",
    inverseSurface: "#322F35",
    inverseOnSurface: "#F5EFF7",
    ...ERROR,
  },
  {
    key: "blue",
    label: "Blue",
    primary: "#0B57D0",
    onPrimary: "#FFFFFF",
    primaryContainer: "#D3E3FD",
    onPrimaryContainer: "#041E49",
    inversePrimary: "#A8C7FA",
    secondaryContainer: "#DCE2F9",
    onSecondaryContainer: "#131C2B",
    tertiaryContainer: "#FFD8EE",
    onTertiaryContainer: "#2E1125",
    surface: "#FAF9FD",
    surfaceContainerLow: "#F3F3FA",
    surfaceContainer: "#EEEDF3",
    surfaceContainerHigh: "#E9E8EF",
    surfaceContainerHighest: "#E3E2E6",
    onSurface: "#1B1B1F",
    onSurfaceVariant: "#44474E",
    outline: "#74777F",
    outlineVariant: "#C4C6D0",
    inverseSurface: "#303034",
    inverseOnSurface: "#F2F0F4",
    ...ERROR,
  },
  {
    key: "green",
    label: "Green",
    primary: "#2E6A45",
    onPrimary: "#FFFFFF",
    primaryContainer: "#B0F1C2",
    onPrimaryContainer: "#00210F",
    inversePrimary: "#95D5A7",
    secondaryContainer: "#D3E8D8",
    onSecondaryContainer: "#102016",
    tertiaryContainer: "#C2E8FF",
    onTertiaryContainer: "#001E2C",
    surface: "#F6FBF4",
    surfaceContainerLow: "#F0F5EE",
    surfaceContainer: "#EAF0E8",
    surfaceContainerHigh: "#E4EAE2",
    surfaceContainerHighest: "#DEE4DC",
    onSurface: "#181D18",
    onSurfaceVariant: "#414941",
    outline: "#707972",
    outlineVariant: "#BFC9C0",
    inverseSurface: "#2D322D",
    inverseOnSurface: "#EEF2EB",
    ...ERROR,
  },
  {
    key: "coral",
    label: "Coral",
    primary: "#984061",
    onPrimary: "#FFFFFF",
    primaryContainer: "#FFD9E2",
    onPrimaryContainer: "#3E001D",
    inversePrimary: "#FFB0C8",
    secondaryContainer: "#F6DDE4",
    onSecondaryContainer: "#31101D",
    tertiaryContainer: "#FFDBCA",
    onTertiaryContainer: "#2C1600",
    surface: "#FFF8F8",
    surfaceContainerLow: "#FCF0F2",
    surfaceContainer: "#F6EBED",
    surfaceContainerHigh: "#F3E5E9",
    surfaceContainerHighest: "#EEE0E3",
    onSurface: "#201A1B",
    onSurfaceVariant: "#524346",
    outline: "#847377",
    outlineVariant: "#D5C2C6",
    inverseSurface: "#352F30",
    inverseOnSurface: "#FAEEEF",
    ...ERROR,
  },
  {
    key: "amber",
    label: "Amber",
    primary: "#8B5000",
    onPrimary: "#FFFFFF",
    primaryContainer: "#FFDCC2",
    onPrimaryContainer: "#2C1600",
    inversePrimary: "#FFB77C",
    secondaryContainer: "#F6DFC8",
    onSecondaryContainer: "#271905",
    tertiaryContainer: "#D5EDC0",
    onTertiaryContainer: "#0E2004",
    surface: "#FFF8F5",
    surfaceContainerLow: "#FCF1EA",
    surfaceContainer: "#F7ECE4",
    surfaceContainerHigh: "#F3E6DE",
    surfaceContainerHighest: "#EDE0D8",
    onSurface: "#211A14",
    onSurfaceVariant: "#51443B",
    outline: "#83746A",
    outlineVariant: "#D6C3B6",
    inverseSurface: "#362F28",
    inverseOnSurface: "#FBEEE5",
    ...ERROR,
  },
  {
    key: "teal",
    label: "Teal",
    primary: "#00696E",
    onPrimary: "#FFFFFF",
    primaryContainer: "#9CF1F6",
    onPrimaryContainer: "#002022",
    inversePrimary: "#80D5DA",
    secondaryContainer: "#CCE8E9",
    onSecondaryContainer: "#051F20",
    tertiaryContainer: "#D2E4FF",
    onTertiaryContainer: "#001C3B",
    surface: "#F4FBFB",
    surfaceContainerLow: "#EEF5F5",
    surfaceContainer: "#E8EFEF",
    surfaceContainerHigh: "#E2EAEA",
    surfaceContainerHighest: "#DDE4E4",
    onSurface: "#161D1D",
    onSurfaceVariant: "#3F4948",
    outline: "#6F7979",
    outlineVariant: "#BEC8C8",
    inverseSurface: "#2B3232",
    inverseOnSurface: "#ECF2F2",
    ...ERROR,
  },
  {
    key: "mono",
    label: "Mono",
    primary: "#4A4459",
    onPrimary: "#FFFFFF",
    primaryContainer: "#E6E0F0",
    onPrimaryContainer: "#1A1626",
    inversePrimary: "#CFC3E0",
    secondaryContainer: "#E6E1E6",
    onSecondaryContainer: "#1B1B1F",
    tertiaryContainer: "#E9E0EA",
    onTertiaryContainer: "#1E1A22",
    surface: "#FCF8FD",
    surfaceContainerLow: "#F5F1F6",
    surfaceContainer: "#EFEBF0",
    surfaceContainerHigh: "#E9E5EA",
    surfaceContainerHighest: "#E4E0E5",
    onSurface: "#1C1B1F",
    onSurfaceVariant: "#48454E",
    outline: "#79747E",
    outlineVariant: "#CAC4D0",
    inverseSurface: "#313033",
    inverseOnSurface: "#F4EFF4",
    ...ERROR,
  },
];
export const PALETTES: Palette[] = PRESETS.map((p) => ({ ...p, secondary: schemeFromSeed(p.primary, p.label, { keepChroma: true }).secondary }));

/* ---------- theme: the four expressive axes ---------- */
export type ShapeScale = "none" | "square" | "soft" | "rounded" | "full";
export type FontKey = "roboto" | "robotoFlex" | "robotoSerif" | "system" | "apple" | "segoe" | "inter" | "dmsans" | "mrounded" | "fredoka" | "lilita" | "barlow" | "rajdhani" | "pixel" | "garamond" | "cinzel" | "tiktok" | "brush";
export type MotionScheme = "standard" | "expressive";
/** which drawing of Material Symbols the icons are, or the pixel set for the names it has */
export type IconFamily = "rounded" | "filled" | "light" | "sharp" | "pixel";
export type { Contrast };

export type Theme = {
  dark: boolean;
  /** the app follows the system setting; the canvas shows the mode chosen in `dark` */
  bothModes: boolean;
  contrast: Contrast;
  shape: ShapeScale;
  font: FontKey;
  /** headings and labels take the heavier M3 Expressive "emphasized" styles */
  emphasized: boolean;
  motion: MotionScheme;
  /** the style the document wears (lib/styles.ts); left out, it is plain Material */
  style?: string;
  /** the author picked colors after the style: the palette is theirs, the rest stays the style's */
  ownColors?: boolean;
  /** how each kind of control is built, where it differs from the style */
  recipes?: Partial<Recipes>;
  /** headings, when they take another face than `font` */
  displayFont?: FontKey;
  icons?: IconFamily;
  /** how a screen is spaced and where its navigation stands, where it differs from the style */
  ux?: Partial<StyleUX>;
  /** whether the document is held to its style's rules (lib/styleRules.ts): left out, it is when it wears one */
  strict?: boolean;
};

export const DEFAULT_THEME: Theme = { dark: false, bothModes: false, contrast: "standard", shape: "rounded", font: "roboto", emphasized: false, motion: "standard" };

export const ICON_FAMILIES: IconFamily[] = ["rounded", "filled", "light", "sharp", "pixel"];

/** a stored theme with any missing or unknown field replaced by its default */
export function normalizeTheme(t: Partial<Theme> | undefined): Theme {
  if (!t) return DEFAULT_THEME;
  const pack = styleOf(t.style);
  /* a theme that only names a style (one written by hand, or by a model) gets what the style brings */
  const d: Theme = pack ? { ...DEFAULT_THEME, ...stylePatch(t.style!) } : DEFAULT_THEME;
  const strict = typeof t.strict === "boolean" ? t.strict : !!pack;
  /* held to a style, the theme has no say in what the style decides, whoever wrote it. Android's rules are Material's,
     and Material leaves the colors and how lively things are to the author */
  const held: Theme | null = !strict ? null : pack ? d : { ...DEFAULT_THEME, ...stylePatch("") };
  const recipes = held ? undefined : normalizeRecipes(t.recipes);
  const ux = held ? undefined : normalizeUx(t.ux);
  return {
    dark: typeof t.dark === "boolean" ? t.dark : d.dark,
    bothModes: typeof t.bothModes === "boolean" ? t.bothModes : d.bothModes,
    contrast: CONTRASTS.some((c) => c.key === t.contrast) ? (t.contrast as Contrast) : d.contrast,
    shape: held ? held.shape : SHAPES.some((c) => c.key === t.shape) ? (t.shape as ShapeScale) : d.shape,
    font: held ? held.font : FONTS.some((c) => c.key === t.font) ? (t.font as FontKey) : d.font,
    emphasized: held && pack ? false : typeof t.emphasized === "boolean" ? t.emphasized : d.emphasized,
    motion: held && pack ? held.motion : t.motion === "expressive" || t.motion === "standard" ? t.motion : d.motion,
    ...(pack ? { style: t.style } : {}),
    ...(strict !== !!pack ? { strict } : {}),
    ...(t.ownColors === true && !held ? { ownColors: true } : {}),
    ...(recipes ? { recipes } : {}),
    ...(ux ? { ux } : {}),
    ...(held ? (held.displayFont ? { displayFont: held.displayFont } : {}) : FONTS.some((c) => c.key === t.displayFont) ? { displayFont: t.displayFont } : d.displayFont ? { displayFont: d.displayFont } : {}),
    ...(held ? (held.icons ? { icons: held.icons } : {}) : ICON_FAMILIES.includes(t.icons as IconFamily) ? { icons: t.icons } : d.icons ? { icons: d.icons } : {}),
  };
}

export const SHAPES: { key: ShapeScale; label: string; icon: string }[] = [
  { key: "none", label: "None", icon: "square" },
  { key: "square", label: "Square", icon: "crop_square" },
  { key: "soft", label: "Soft", icon: "crop_din" },
  { key: "rounded", label: "Rounded", icon: "rounded_corner" },
  { key: "full", label: "Full", icon: "circle" },
];

/** how far the corners are scaled: 1 is M3's own steps */
export const shapeScaleOf = (s: ShapeScale) => (s === "none" ? 0 : s === "square" ? 0.35 : s === "soft" ? 0.5 : s === "full" ? 1.6 : 1);

const INTER = "Inter:wght@400;500;600;700";
/** a typeface and where its stylesheet comes from: Google Fonts, or a stylesheet of its own */
export type Face = { family: string; google?: string; css?: string };
const NOTO_SERIF_SC: Face = { family: "'Noto Serif SC'", google: "Noto+Serif+SC:wght@400;500;600;700" };
const KUAILE: Face = { family: "'ZCOOL KuaiLe'", google: "ZCOOL+KuaiLe" };
const QINGKE: Face = { family: "'ZCOOL QingKe HuangYou'", google: "ZCOOL+QingKe+HuangYou" };
const BRUSH: Face = { family: "'Ma Shan Zheng'", google: "Ma+Shan+Zheng" };
/* a pixel face that has Chinese, under the SIL Open Font License; Google Fonts has none */
const PIXEL_SC: Face = { family: "'Fusion Pixel 12px Proportional SC'", css: "https://cdn.jsdelivr.net/npm/@fontsource/fusion-pixel-12px-proportional-sc@5.3.0/index.css" };

export const FONTS: {
  key: FontKey;
  label: string;
  family: string;
  /** Google Fonts family to fetch, if any */
  google?: string;
  /** the face that stands in for it in Chinese, when Noto Sans would not suit it */
  zh?: Face;
}[] = [
  { key: "roboto", label: "Roboto", family: "Roboto, system-ui, sans-serif" },
  { key: "robotoFlex", label: "Roboto Flex", family: "'Roboto Flex', Roboto, system-ui, sans-serif", google: "Roboto+Flex:wght@400;500;600;700" },
  { key: "robotoSerif", label: "Roboto Serif", family: "'Roboto Serif', Georgia, serif", google: "Roboto+Serif:wght@400;500;600;700", zh: NOTO_SERIF_SC },
  { key: "system", label: "System", family: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  /* what these name is on the device that has it: a face from the system is never copied into a project, and the rest fall back to Inter */
  { key: "apple", label: "San Francisco", family: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', Inter, system-ui, sans-serif", google: INTER },
  { key: "segoe", label: "Segoe UI", family: "'Segoe UI Variable', 'Segoe UI', Inter, system-ui, sans-serif", google: INTER },
  { key: "inter", label: "Inter", family: "Inter, system-ui, sans-serif", google: INTER },
  { key: "dmsans", label: "DM Sans", family: "'DM Sans', system-ui, sans-serif", google: "DM+Sans:wght@400;500;600;700" },
  { key: "tiktok", label: "TikTok Sans", family: "'TikTok Sans', system-ui, sans-serif", google: "TikTok+Sans:wght@400;500;600;700" },
  { key: "mrounded", label: "M PLUS Rounded", family: "Nunito, 'M PLUS Rounded 1c', system-ui, sans-serif", google: "Nunito:wght@400;500;600;700&family=M+PLUS+Rounded+1c:wght@400;500;700" },
  { key: "fredoka", label: "Fredoka", family: "Fredoka, system-ui, sans-serif", google: "Fredoka:wght@400;500;600;700", zh: KUAILE },
  { key: "lilita", label: "Lilita One", family: "'Lilita One', 'Baloo 2', system-ui, sans-serif", google: "Lilita+One&family=Baloo+2:wght@500;700", zh: KUAILE },
  { key: "barlow", label: "Barlow Condensed", family: "'Barlow Condensed', system-ui, sans-serif", google: "Barlow+Condensed:ital,wght@0,400;0,500;0,600;0,700;0,800;1,700;1,800", zh: QINGKE },
  { key: "rajdhani", label: "Rajdhani", family: "Rajdhani, system-ui, sans-serif", google: "Rajdhani:wght@400;500;600;700", zh: QINGKE },
  { key: "pixel", label: "Pixelify Sans", family: "'Pixelify Sans', 'DotGothic16', monospace", google: "Pixelify+Sans:wght@400;500;600;700&family=DotGothic16", zh: PIXEL_SC },
  { key: "garamond", label: "EB Garamond", family: "'EB Garamond', Georgia, serif", google: "EB+Garamond:wght@400;500;600;700", zh: NOTO_SERIF_SC },
  { key: "cinzel", label: "Cinzel", family: "Cinzel, Georgia, serif", google: "Cinzel:wght@400;500;600;700", zh: NOTO_SERIF_SC },
  /* the brush of a Chinese title; its Latin stays carved */
  { key: "brush", label: "Ma Shan Zheng", family: "Cinzel, Georgia, serif", google: "Cinzel:wght@400;500;600;700", zh: BRUSH },
];

/** The Noto Sans face that covers a language's script, spliced in behind the chosen
 *  face so CJK text renders the same on every OS. English needs none. */
export const LANG_FONT: Record<Lang, Face | null> = {
  ja: { family: "'Noto Sans JP'", google: "Noto+Sans+JP:wght@400;500;600;700" },
  zh: { family: "'Noto Sans SC'", google: "Noto+Sans+SC:wght@400;500;600;700" },
  ko: { family: "'Noto Sans KR'", google: "Noto+Sans+KR:wght@400;500;600;700" },
  en: null,
};

/** the face that carries a language's script behind a chosen one */
export const langFaceOf = (f: FontKey, lang?: Lang) => (lang === "zh" && FONTS.find((x) => x.key === f)?.zh) || (lang ? LANG_FONT[lang] : null) || null;

/** a family list with the language's own face placed before the generic fallbacks */
const withLangFont = (family: string, f: FontKey | undefined, lang?: Lang) => {
  const extra = f ? langFaceOf(f, lang)?.family : lang ? LANG_FONT[lang]?.family : undefined;
  if (!extra) return family;
  const parts = family.split(",").map((s) => s.trim());
  /* a face with kanji of its own would draw Chinese and Korean words in Japanese forms, so it stands behind their face */
  const at = parts.findIndex((s) => /^(system-ui|Georgia|serif|sans-serif|monospace)$/.test(s) || (lang !== "ja" && /M PLUS Rounded|DotGothic/.test(s)));
  parts.splice(at < 0 ? parts.length : at, 0, extra);
  return parts.join(", ");
};

/** the chosen face, with the language's face behind it; the system font is left to the device */
export const fontFamilyOf = (f: FontKey, lang?: Lang) => {
  const family = FONTS.find((x) => x.key === f)?.family ?? FONTS[0].family;
  return f === "system" ? family : withLangFont(family, f, lang);
};
/** every stylesheet a theme's faces come from, in a language: what its pages have to ask for */
export function faceSheetsOf(theme: Pick<Theme, "font" | "displayFont">, lang?: Lang): { google: string[]; css: string[] } {
  const faces = [
    theme.font === "roboto" ? { google: "Roboto:wght@400;500;600;700" } : FONTS.find((f) => f.key === theme.font),
    FONTS.find((f) => f.key === theme.displayFont),
    theme.font === "system" ? null : langFaceOf(theme.font, lang),
    theme.displayFont ? langFaceOf(theme.displayFont, lang) : null,
  ];
  const unique = (list: (string | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))];
  return { google: unique(faces.map((f) => (f as Face | null | undefined)?.google)), css: unique(faces.map((f) => (f as Face | null | undefined)?.css)) };
}

/** the editor's own font: Roboto, then the language's Noto face */
export const uiFontFamily = (lang?: Lang) => withLangFont("Roboto, system-ui, sans-serif", undefined, lang);

export const CONTRASTS: { key: Contrast; label: string }[] = [
  { key: "standard", label: "Standard" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

/** the band of colour a part takes while a model writes into it: the screens wear it as a fill,
 *  a field as a ring. It drifts with the `m3e-drift` keyframes. */
export const draftGradient = (p: Palette) =>
  `linear-gradient(120deg, ${p.primaryContainer}, ${p.tertiaryContainer}, ${p.primary}, ${p.secondaryContainer}, ${p.primaryContainer})`;

/** The scheme the document renders with. Hand-written presets and the author's
 *  fine-tuned custom scheme are light and standard contrast; dark mode and the
 *  other contrast levels are generated from the same seed. */
export function paletteOf(key: string, custom?: Palette | null, theme?: Theme): Palette {
  const styled = stylePalette(theme);
  if (styled) return styled;
  const base = (key === "custom" && custom) || PALETTES.find((p) => p.key === key) || PALETTES[0];
  const fromStyle = styleSeed(theme);
  if (!theme || (!fromStyle && !theme.dark && theme.contrast === "standard")) return base;
  const seed = fromStyle ?? base.seed ?? base.primary;
  /* a preset's hue and chroma are deliberate (Mono is nearly grey), so they are kept as they are */
  return { ...schemeFromSeed(seed, base.label, { dark: theme.dark, contrast: theme.contrast, keepChroma: base.key !== "custom" }), key: base.key };
}

/* ---------- contrast roles a component can take ---------- */
export type Variant = "filled" | "tonal" | "elevated" | "outlined" | "text";

export const VARIANTS: { key: Variant; label: string }[] = [
  { key: "filled", label: "Filled" },
  { key: "tonal", label: "Tonal" },
  { key: "elevated", label: "Elevated" },
  { key: "outlined", label: "Outlined" },
  { key: "text", label: "Text" },
];

export type Axis = "x" | "y";

/* ---------- screen data ---------- */
/** one row of a list a part's panel edits */
export type NavTab = { icon: string; label: string; variant?: string; width?: string; image?: string };

/** every part on the canvas is a shadcn M3E component: `component` names it, `props` configures it */
export type Item = {
  id: string;
  kind: "component";
  label: string;
  icon: string | null;
  variant: Variant;
  /** the docs slug of the shadcn M3E component this part is */
  component?: string;
  /** the values the author set, over the part's own defaults */
  props?: Record<string, unknown>;
  /** what it looks like beyond `fill`, `textColor` and `corners` */
  look?: ItemLook;
  /** tabs standing in for the navigation bar, because the style has its navigation on top */
  navTabs?: boolean;
  /** free text the author writes about what this part does */
  note?: string;
  /** what `note` said before the AI rewrote it, so the rewrite can be undone */
  noteHistory?: string[];
  /** in the preview, fold to an icon-only FAB when the body scrolls down and unfold when it scrolls back up */
  collapseOnScroll?: boolean;
  /** a palette role painted over the part's own background */
  fill?: ColorToken;
  /** a palette role painted over the part's own text */
  textColor?: TextToken;
  /** each corner on its own, painted over the part's own radius */
  corners?: Radii;
  /** in a container's auto layout, it takes what room is left along the run */
  flowFill?: boolean;
  /** tap navigation to another frame */
  action?: Action;
  /** per-slot tap navigation, by the keys its `PartDef.slots` names */
  actions?: Record<string, Action>;
  /** which of the part's props follow a variable in the preview: prop key to `DocVar.id` */
  bind?: Record<string, string>;
  /** Runtime only, never saved: the fields of the row this copy was drawn for (lib/collections.ts).
   *  A tap on it runs with them as `row.field`. */
  row?: Record<string, string>;
  /** the rail remembers which edge it expanded from */
  [railExpansionSide]?: "left" | "right";
};

/** target id that pops the preview stack instead of opening a frame */
export const BACK_TARGET = "back";

/** target id that opens a web page in the browser instead of a screen */
export const LINK_TARGET = "link";

/** target id of an action that goes nowhere and only runs its effects */
export const STAY_TARGET = "none";

/** the address a link action opens, once it is one a browser may follow; a bare host is read as https */
export function linkUrlOf(a: ActionBody | undefined): string | null {
  const raw = a?.url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** the host the small browser in the trigger tab shows */
export function linkHostOf(a: Action | undefined): string | null {
  const href = linkUrlOf(a);
  if (!href) return null;
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
}

/** a swipe on a frame: the finger's direction */
export type SwipeDir = "left" | "right" | "up" | "down";
export const SWIPE_DIRS: { key: SwipeDir; icon: string; transition: Transition }[] = [
  { key: "left", icon: "swipe_left", transition: "slide" },
  { key: "right", icon: "swipe_right", transition: "slideLeft" },
  { key: "up", icon: "swipe_up", transition: "slideUp" },
  { key: "down", icon: "swipe_down", transition: "slideDown" },
];

/** how a sliding transition moves: the axis, where the new screen enters from and
 *  where the old one parks, as fractions of the screen */
export const SLIDE_SPEC: Partial<Record<Transition, { axis: "x" | "y"; enter: number; exit: number }>> = {
  slide: { axis: "x", enter: 1, exit: -0.3 },
  slideLeft: { axis: "x", enter: -1, exit: 0.3 },
  slideUp: { axis: "y", enter: 1, exit: -0.3 },
  slideDown: { axis: "y", enter: -1, exit: 0.3 },
};

export type Transition = "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none";
/** what a tap does once it has been decided to do it: its effects in order, then where it goes */
export type ActionBody = { to: string; transition: Transition; /** the address a `LINK_TARGET` action opens */ url?: string; effects?: Effect[] };
/** A tap. Without `when` it always runs; with one it runs when that holds, and `else` runs when it
 *  does not. Printed code reads this too, so it stays plain data. */
export type Action = ActionBody & { when?: Condition; else?: ActionBody };

/** what a variable can hold */
export type VarValue = string | number | boolean;
export type VarType = "text" | "number" | "bool";
export type DocVar = { id: string; name: string; type: VarType; value: VarValue };

/** a test on the preview's state: a variable against a value, or a form field (by item id) that has something in it */
export type Condition = { var: string; op: "eq" | "neq"; value: VarValue } | { filled: string };

/** one step of a tap. `part` is an item id, the name that survives grouping and regrouping. */
export type Effect =
  | { do: "show" | "hide" | "toggle" | "open" | "close"; part: string }
  | { do: "setVar"; var: string; value: VarValue }
  | { do: "toggleVar"; var: string }
  /** a counter has to count: "set" alone can only ever land on one number */
  | { do: "addVar"; var: string; by: number }
  | { do: "setProp"; part: string; prop: string; value: VarValue }
  | { do: "snackbar"; message: string };

/** the action left when its screen is deleted: its effects go on, staying put; with none it is gone */
export function actionWithoutScreen(a: Action, screen: string): Action | undefined {
  const other = a.else?.to === screen ? { ...a.else, to: STAY_TARGET, transition: "none" as const } : a.else;
  if (a.to !== screen) return other === a.else ? a : { ...a, else: other };
  return a.effects?.length || a.when ? { ...a, to: STAY_TARGET, transition: "none", else: other } : undefined;
}

/** a FAB that shows both an icon and a label may fold to the icon while the body scrolls */
export function canCollapseFab(it: Item): boolean {
  if (it.component !== "fab") return false;
  const def = partBySlug(it.component);
  const values = def && reader(def, it.props);
  return !!values?.s("label") && !!values.s("icon");
}

export const TRANSITIONS: { key: Transition; label: string; icon: string }[] = [
  { key: "slide", label: "Slide from right", icon: "arrow_back" },
  { key: "slideLeft", label: "Slide from left", icon: "arrow_forward" },
  { key: "slideUp", label: "Slide from bottom", icon: "arrow_upward" },
  { key: "slideDown", label: "Slide from top", icon: "arrow_downward" },
  { key: "fade", label: "Fade", icon: "blur_on" },
  { key: "expand", label: "Expand", icon: "open_in_full" },
  { key: "none", label: "None", icon: "block" },
];

/** the places inside a part that can each carry their own tap action: each node it marks `data-tap` answers to one */
export function actionSlotsOf(it: Item): IconSlot[] {
  const def = partBySlug(it.component);
  if (!def?.slots) return [];
  return def.slots(reader(def, it.props)).map((s) => ({ key: s.key, label: s.label, value: s.icon ?? null }));
}

/** the patch that gives a list prop new rows. `order` holds, for each new row, the index it had
 *  (-1 for a new one). The part's chosen entry goes with its row. Where the part's `tab:N` slots
 *  are this list's rows, so does a row's tap target, and the target of a removed row goes with it. */
export function listRowsPatch(it: Item, key: string, rows: ListItem[], order: number[]): Partial<Item> {
  const patch: Partial<Item> = { props: { ...it.props, [key]: rows } };
  const def = partBySlug(it.component);
  if (!def) return patch;
  const was = reader(def, it.props).list(key);
  const select = def.props.find((d) => d.key === def.selectKey);
  /* a part's choice counts the rows of its first list */
  if (select?.kind === "number" && def.props.find((d) => d.kind === "list")?.key === key) {
    const sel = reader(def, it.props).n(select.key);
    if (sel >= 0 && sel < was.length) {
      /* a removed entry leaves the choice on the one that takes its place */
      const at = order.indexOf(sel);
      const next = at >= 0 ? at : Math.min(sel, Math.max(0, rows.length - 1));
      /* a choice the author never made stays unmade until its row moves */
      if (next !== sel) patch.props![select.key] = next;
    }
  }
  if (!def.slots) return patch;
  const tabSlots = (list: ListItem[]) => def.slots!(reader(def, { ...it.props, [key]: list })).filter((s) => s.key.startsWith("tab:")).length;
  /* the slots are this list's rows when they come and go with them */
  if (tabSlots([...was, { label: "" }]) === tabSlots(was)) return patch;
  /* a slot past the rows (a menu's destructive entry) only keeps its distance from their end */
  const to = (j: number) => (j >= was.length ? j + rows.length - was.length : order.indexOf(j));
  if (it.actions) {
    const actions: NonNullable<Item["actions"]> = {};
    for (const [slot, action] of Object.entries(it.actions)) {
      const m = /^tab:(\d+)$/.exec(slot);
      const at = m ? to(Number(m[1])) : 0;
      if (at >= 0) actions[m ? `tab:${at}` : slot] = action;
    }
    patch.actions = Object.keys(actions).length ? actions : undefined;
  }
  return patch;
}

/** a free group down to one part is just that part again */
export function collapseFree(g: Group, widths: Record<string, number>): Group {
  if (!g.free || g.items.length !== 1) return g;
  const pl = layoutOf(g, widths)[0];
  return { id: g.id, x: pl.x, y: pl.y, axis: "x", items: g.items, ...placeOf(g) };
}

/** what a group says about where it belongs and when it shows, carried over when it is rebuilt */
const placeOf = (g: Group): Partial<Group> => ({
  ...(g.inFlow ? { inFlow: g.inFlow } : {}),
  ...(g.name ? { name: g.name } : {}),
  ...(g.hidden ? { hidden: true } : {}),
  ...(g.showWhen ? { showWhen: g.showWhen } : {}),
  ...(g.pane !== undefined ? { pane: g.pane } : {}),
});

/** every navigation an item carries: its own action plus per-slot ones */
export function actionsOf(it: Item): { slot: string; action: Action }[] {
  const out: { slot: string; action: Action }[] = [];
  if (it.action) out.push({ slot: "", action: it.action });
  for (const [slot, action] of Object.entries(it.actions ?? {})) if (action) out.push({ slot, action });
  return out;
}

/** palette roles a user may pick as a background */
export type ColorToken =
  | "surface"
  | "surfaceContainerLow"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "surfaceContainerHighest"
  | "primaryContainer"
  | "secondaryContainer"
  | "tertiaryContainer"
  | "primary"
  | "inverseSurface";

export const COLOR_TOKENS: { key: ColorToken; label: string }[] = [
  { key: "surface", label: "Surface" },
  { key: "surfaceContainerLow", label: "Container low" },
  { key: "surfaceContainer", label: "Container" },
  { key: "surfaceContainerHigh", label: "Container high" },
  { key: "surfaceContainerHighest", label: "Container highest" },
  { key: "primaryContainer", label: "Primary container" },
  { key: "secondaryContainer", label: "Secondary container" },
  { key: "tertiaryContainer", label: "Tertiary container" },
  { key: "primary", label: "Primary" },
  { key: "inverseSurface", label: "Inverse surface" },
];

/** the color roles a part's text may be set to; "on" roles pair with the containers offered as backgrounds */
export type TextToken = "primary" | "secondary" | "onSurface" | "onSurfaceVariant" | "onPrimaryContainer" | "onSecondaryContainer" | "onTertiaryContainer" | "inverseOnSurface";
export const TEXT_TOKENS: { key: TextToken; label: string }[] = [
  { key: "onSurface", label: "On surface" },
  { key: "onSurfaceVariant", label: "On surface variant" },
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "onPrimaryContainer", label: "On primary container" },
  { key: "onSecondaryContainer", label: "On secondary container" },
  { key: "onTertiaryContainer", label: "On tertiary container" },
  { key: "inverseOnSurface", label: "Inverse on surface" },
];
export const isTextToken = (v: unknown): v is TextToken => TEXT_TOKENS.some((t) => t.key === v);
/** readable foreground for a chosen background token */
export function onToken(t: ColorToken, p: Palette): string {
  switch (t) {
    case "primary":
      return p.onPrimary;
    case "primaryContainer":
      return p.onPrimaryContainer;
    case "secondaryContainer":
      return p.onSecondaryContainer;
    case "tertiaryContainer":
      return p.onTertiaryContainer;
    case "inverseSurface":
      return p.inverseOnSurface;
    default:
      return p.onSurface;
  }
}

export type Frame = {
  id: string;
  name: string;
  x: number;
  y: number;
  /** a phone screen leaves its size out */
  w?: number;
  h?: number;
  bg?: ColorToken;
  /** what this screen is for, in the author's words; goes into the prompt */
  note?: string;
  /** what `note` said before the AI rewrote it */
  noteHistory?: string[];
  /** frame ids reached by swiping in each direction */
  swipe?: Partial<Record<SwipeDir, string>>;
  /** where Tidy puts the body rows between the bars: from the top unless the author says otherwise */
  place?: Place;
  /** how far the screen runs when it is longer than the device: its body scrolls under the bars */
  length?: number;
  /** the length a screen had before a style needed it longer; the next style that needs less gives the rest back */
  grownFrom?: number;
  /** the screen this one is another size of (lib/variants.ts); each keeps a layout of its own */
  variantOf?: string;
  /** Shows the device's status bar and gesture bar in the editor and the preview, and Tidy keeps
   *  between them. A phone or a tablet only (`takesDeviceBars`). The real device has its own: never printed in code. */
  deviceBars?: boolean;
  /** a picture to trace, under the parts in the editor only: not in the preview, a saved image or printed code */
  backgroundImage?: string;
  /** how much of that picture shows, 0 to 1 */
  backgroundOpacity?: number;
};

/** how much of `backgroundImage` shows when the author has said nothing */
export const TRACE_OPACITY = 0.5;

/** the bar for the home gesture at the foot of a phone or a tablet */
export const GESTURE_BAR_H = 24;
/** a screen that stands on a device with bars of its own: a desktop window has none */
export const takesDeviceBars = (f: Frame) => frameSizeOf(f).w < DESKTOP_W;
/** what the device's bars take off the top and the foot of a screen */
export const safeAreaOf = (f: Frame) => (f.deviceBars && takesDeviceBars(f) ? { t: STATUS_BAR_H, b: GESTURE_BAR_H } : { t: 0, b: 0 });

/** how Tidy stacks the body of a screen: from the top, centered, against the bottom bar, or spread out */
export type Place = "top" | "center" | "bottom" | "spread";
export const PLACES: { key: Place; icon: string }[] = [
  { key: "top", icon: "vertical_align_top" },
  { key: "center", icon: "vertical_align_center" },
  { key: "bottom", icon: "vertical_align_bottom" },
  { key: "spread", icon: "expand" },
];
export const isPlace = (v: unknown): v is Place => v === "top" || v === "center" || v === "bottom" || v === "spread";

export type FramePreset = "phone" | "tablet" | "desktop";
export const frameSizeOf = (f: Frame) => ({ w: f.w ?? PHONE_W, h: f.h ?? PHONE_H });
export const isPhoneFrame = (f: Frame) => {
  const { w, h } = frameSizeOf(f);
  return Math.min(w, h) < 600;
};

/** The phones a screen can be the size of, in CSS pixels: what people hold most (StatCounter, 2026) and the current
 *  flagships. The first is a screen's size when it names none. */
export const PHONE_MODELS: { key: string; name: string; w: number; h: number }[] = [
  { key: "android", name: "Android", w: PHONE_W, h: PHONE_H },
  { key: "iphone-17", name: "iPhone 17 / 16 Pro", w: 402, h: 874 },
  { key: "iphone-17-pro-max", name: "iPhone 17 Pro Max / 16 Pro Max", w: 440, h: 956 },
  { key: "iphone-air", name: "iPhone Air", w: 420, h: 912 },
  { key: "iphone-16", name: "iPhone 16 / 15", w: 393, h: 852 },
  { key: "iphone-14", name: "iPhone 14 / 13 / 12", w: 390, h: 844 },
  { key: "iphone-11", name: "iPhone 11 / XR", w: 414, h: 896 },
  { key: "pixel-10", name: "Pixel 10", w: 412, h: 923 },
  { key: "android-393", name: "Android", w: 393, h: 873 },
  { key: "android-360", name: "Android", w: 360, h: 800 },
  { key: "galaxy-s25", name: "Galaxy S25", w: 360, h: 780 },
];

/** the model a screen is the size of, turned upright or on its side */
export const phoneModelOf = (f: Frame) => {
  const { w, h } = frameSizeOf(f);
  return PHONE_MODELS.find((m) => (m.w === w && m.h === h) || (m.w === h && m.h === w));
};

/** the size of phone a document is drawn for: its first upright phone's, so that whatever is added next matches it */
export const phoneSizeOf = (frames: Frame[]): { w: number; h: number } => {
  const f = frames.find((x) => isPhoneFrame(x) && frameSizeOf(x).h >= frameSizeOf(x).w);
  return f ? frameSizeOf(f) : { w: PHONE_W, h: PHONE_H };
};

/** what a frame says to be that size: the usual phone says nothing */
export const phoneFields = (size: { w: number; h: number }): Pick<Frame, "w" | "h"> => (size.w === PHONE_W && size.h === PHONE_H ? { w: undefined, h: undefined } : { w: size.w, h: size.h });
/** the named device a screen is the size of; any other size is the author's own */
export const framePresetOf = (f: Frame): FramePreset | "custom" => {
  const { w, h } = frameSizeOf(f);
  return isPhoneFrame(f) ? "phone" : w === TABLET_W && h === TABLET_H ? "tablet" : w === DESKTOP_W && h === DESKTOP_H ? "desktop" : "custom";
};
export const framePresetPatch = (preset: FramePreset): Pick<Frame, "w" | "h"> =>
  preset === "desktop" ? { w: DESKTOP_W, h: DESKTOP_H } : preset === "tablet" ? { w: TABLET_W, h: TABLET_H } : { w: undefined, h: undefined };
/** the device a screen is drawn for is `frameSizeOf`; the screen itself may run further down,
 *  and everything laid out on it -- what it holds, where Tidy puts its bars -- goes by this */
export const frameLengthOf = (f: Frame) => Math.max(f.length ?? 0, frameSizeOf(f).h);
export const scrollsOf = (f: Frame) => frameLengthOf(f) > frameSizeOf(f).h;
export const frameRect = (f: Frame) => {
  const { w } = frameSizeOf(f);
  return { l: f.x, t: f.y, r: f.x + w, b: f.y + frameLengthOf(f) };
};
/** the corner radius of a screen: a phone's rounded glass, a flatter window for the desktop */
export const frameRadius = (f: Frame) => (isPhoneFrame(f) ? PHONE_R : DESKTOP_R);

/** a part no taller than the screen it is placed on: a box or a rail sized to a phone shrinks to a shorter screen */
export function fitHeight(it: Item, screenH: number): Item {
  /* a part's height is its `height` prop */
  const ax = resizeOf(partBySlug(it.component), it.props)?.height;
  if (!ax) return it;
  const cur = axisValue(ax, it.props);
  return cur > screenH ? { ...it, props: { ...it.props, [ax.key]: axisWrite(ax, screenH) } } : it;
}

/** A part carried from one screen size to another: edge-to-edge parts take the new width, a part
 *  sized to the old content or screen width takes the new one, and a rail as tall as the old screen
 *  takes the new height. Nothing ends up wider than the new screen. */
export function carryItemSize(it: Item, from: { w: number; h: number }, to: { w: number; h: number }): Item {
  const ax = resizeOf(partBySlug(it.component), it.props);
  const role = roleOf(it);
  const props = { ...it.props };
  let changed = false;
  if (ax?.width) {
    const cur = axisValue(ax.width, it.props);
    const wide = role === "top" || role === "bottom" || role === "fullWidth";
    if (wide ? cur === from.w || cur > to.w : cur === from.w || cur === contentWidth(from.w) || cur === halfWidth(from.w) || cur > to.w) {
      const v = cur === contentWidth(from.w) && !wide ? contentWidth(to.w) : cur === halfWidth(from.w) && !wide ? halfWidth(to.w) : to.w;
      props[ax.width.key] = axisWrite(ax.width, v);
      changed = true;
    }
  }
  if (ax?.height && role === "rail" && axisValue(ax.height, it.props) === from.h) {
    props[ax.height.key] = axisWrite(ax.height, to.h);
    changed = true;
  }
  return changed ? { ...it, props } : it;
}

type Placed = { item: Item; index: number; x: number; y: number; w: number; h: number };

/** where each part of a run sits in world space: a connected run lays its parts
 *  out along its axis, a free group keeps the offsets it was grouped with */
export function layoutOf(g: Group, widths: Record<string, number>): Placed[] {
  const out: Placed[] = [];
  let off = 0;
  g.items.forEach((it, index) => {
    const sz = sizeOf(it, widths);
    if (g.free) {
      const o = g.pos?.[it.id] ?? { x: 0, y: 0 };
      out.push({ item: it, index, x: g.x + o.x, y: g.y + o.y, w: sz.w, h: sz.h });
      return;
    }
    out.push({ item: it, index, x: g.axis === "x" ? g.x + off : g.x, y: g.axis === "x" ? g.y : g.y + off, w: sz.w, h: sz.h });
    off += (g.axis === "x" ? sz.w : sz.h) + GAP;
  });
  return out;
}

/** world-space bounds of a whole run */
export function groupBounds(g: Group, widths: Record<string, number>) {
  let l = g.x;
  let t = g.y;
  let r = g.x;
  let b = g.y;
  for (const pl of layoutOf(g, widths)) {
    l = Math.min(l, pl.x);
    t = Math.min(t, pl.y);
    r = Math.max(r, pl.x + pl.w);
    b = Math.max(b, pl.y + pl.h);
  }
  return { l, t, r, b };
}

/** a tap's reach, for copies: what a copied part points at follows the copy when that was copied too */
export function retarget(g: Group, ids: Map<string, string> | ((id: string) => string)): Group {
  const part = typeof ids === "function" ? ids : (id: string) => ids.get(id) ?? id;
  const when = (c: Condition | undefined): Condition | undefined => (c && "filled" in c ? { filled: part(c.filled) } : c);
  const effects = (list: Effect[] | undefined) => list?.map((e) => ("part" in e ? { ...e, part: part(e.part) } : e));
  const body = <T extends ActionBody>(a: T): T => ({ ...a, ...(a.effects ? { effects: effects(a.effects) } : {}) });
  const action = (a: Action): Action => ({ ...body(a), ...(a.when ? { when: when(a.when) } : {}), ...(a.else ? { else: body(a.else) } : {}) });
  return {
    ...g,
    ...(g.showWhen ? { showWhen: when(g.showWhen) } : {}),
    items: g.items.map((it) => ({
      ...it,
      ...(it.action ? { action: action(it.action) } : {}),
      ...(it.actions ? { actions: Object.fromEntries(Object.entries(it.actions).map(([k, a]) => [k, action(a)])) } : {}),
    })),
  };
}

/** a part that can hold others, standing alone. An instance is drawn from its definition and holds
 *  nothing of the document's, though the item standing in for it is a container. */
export const holdsParts = (g: Group) => !g.free && !g.instanceOf && g.items.length === 1 && !!partBySlug(g.items[0].component)?.holds;

/** The group an expanded id belongs to: `inst/g` to the instance `inst`, `inst/inner/g` to the nested
 *  `inst/inner`, and `host#2/g` (a repeated row) to the host. A plain id belongs to nobody. */
export const ownerIdOf = (id: string): string | undefined => {
  const at = id.lastIndexOf("/");
  return at < 0 ? undefined : id.slice(0, at).replace(/#\d+$/, "");
};

export const liesInside = (g: Group, outer: ReturnType<typeof groupBounds>, widths: Record<string, number>) => {
  const b = groupBounds(g, widths);
  const tol = 2;
  return b.l >= outer.l - tol && b.t >= outer.t - tol && b.r <= outer.r + tol && b.b <= outer.b + tol && (b.r - b.l) * (b.b - b.t) < (outer.r - outer.l) * (outer.b - outer.t);
};

/** What a container holds, by the rule the prompt reads a layout with (`layoutTree`) and a screen
 *  carries its parts by: whatever lies wholly inside it and is drawn over it. There is no list to
 *  keep in step, so dragging a part out is all it takes to take it out. What it holds nests by the
 *  same rule, and so comes along. A locked group stays where it is. */
export function heldBy(container: Group, groups: Group[], widths: Record<string, number>): Group[] {
  if (!holdsParts(container)) return [];
  const at = groups.findIndex((g) => g.id === container.id);
  const outer = groupBounds(container, widths);
  /* lying inside counts only among parts of the same expansion: the rows of a repeat start out stacked
   * on one another until they are placed, and one must not take the next along */
  const scopeOf = (id: string) => id.slice(0, Math.max(0, id.lastIndexOf("/")));
  const held = new Set(groups.filter((g, i) => g.id !== container.id && !g.locked && (g.inFlow === container.id || ownerIdOf(g.id) === container.id || (i > at && scopeOf(g.id) === scopeOf(container.id) && liesInside(g, outer, widths)))));
  /* what a layout or an expansion holds is its own even where it overflows, at any depth */
  for (const g of held) for (const o of groups) if ((o.inFlow === g.id || ownerIdOf(o.id) === g.id) && !o.locked) held.add(o);
  return groups.filter((g) => held.has(g));
}

/** A container put down over parts already there would hide them: it goes behind the first of them. */
export function underWhatItHolds(groups: Group[], id: string, widths: Record<string, number>): Group[] {
  const at = groups.findIndex((g) => g.id === id);
  if (at < 0 || !holdsParts(groups[at])) return groups;
  const outer = groupBounds(groups[at], widths);
  const first = groups.findIndex((g, i) => i < at && liesInside(g, outer, widths));
  if (first < 0) return groups;
  const out = groups.filter((g) => g.id !== id);
  out.splice(first, 0, groups[at]);
  return out;
}

/** A free group written as the parts it holds, each a group of its own. Layout logic, the prompt
 *  and ungrouping all see them in the group's own order (later = drawn on top), which is what the
 *  layers panel edits. */
export function explodeGroup(g: Group, widths: Record<string, number>): Group[] {
  if (!g.free) return [g];
  return layoutOf(g, widths).map((pl) => ({ id: `${g.id}:${pl.item.id}`, x: pl.x, y: pl.y, axis: "x" as const, items: [pl.item], ...placeOf(g) }));
}

/** the screen a group belongs to, going by the container that lays it out: what overflows that
 *  container is still on its screen */
export function frameOfPart(g: Group, groups: Group[], frames: Frame[], widths: Record<string, number>): Frame | undefined {
  let at = g;
  const seen = new Set([g.id]);
  for (;;) {
    const next = at.inFlow ?? ownerIdOf(at.id);
    if (!next) break;
    const host = groups.find((x) => x.id === next);
    if (!host || seen.has(host.id)) break;
    seen.add(host.id);
    at = host;
  }
  return frameOfGroup(at, frames, widths);
}

/** a group belongs to the frame that contains its centre */
export function frameOfGroup(g: Group, frames: Frame[], widths: Record<string, number>): Frame | undefined {
  const bb = groupBounds(g, widths);
  let cx = (bb.l + bb.r) / 2;
  let cy = (bb.t + bb.b) / 2;
  /* a menu is drawn open on the canvas, hanging past its button: where it stands is where its button is,
   * or one set low on a screen would stop being on that screen and go missing from the preview and the code */
  const def = g.items.length === 1 ? partBySlug(g.items[0].component) : undefined;
  if (def?.open && def.open.trigger !== "hide") {
    const box = def.open.box(reader(def, g.items[0].props));
    const w = Math.min(def.w, bb.r - bb.l);
    const h = Math.min(def.h, bb.b - bb.t);
    cx = box.ax === "end" ? bb.r - w / 2 : box.ax === "center" ? cx : bb.l + w / 2;
    cy = box.ay === "end" ? bb.b - h / 2 : box.ay === "center" ? cy : bb.t + h / 2;
  }
  return frames.find((f) => {
    const fr = frameRect(f);
    return cx >= fr.l && cx <= fr.r && cy >= fr.t && cy <= fr.b;
  });
}

export const groupsInFrame = (groups: Group[], f: Frame, frames: Frame[], widths: Record<string, number>) =>
  groups.filter((g) => frameOfPart(g, groups, frames, widths)?.id === f.id);

export type Group = {
  /** the main column of a desktop template: the style's spacing reaches it */
  screenMain?: boolean;
  id: string;
  x: number;
  y: number;
  axis: Axis;
  items: Item[];
  /** a finished section the author locked from the Layers panel: it cannot be dragged, deleted or tidied, but stays selectable */
  locked?: boolean;
  /** a hand-made group: parts keep their own offsets (in `pos`) and move as one layer */
  free?: boolean;
  pos?: Record<string, { x: number; y: number }>;
  /** the group of the container whose auto layout places this one (lib/flow.ts) */
  inFlow?: string;
  /** what the author calls it; the layers and the prompt use it over the words the part shows */
  name?: string;
  /** hidden at the start of the preview, drawn dimmed on the canvas */
  hidden?: boolean;
  /** in the preview, shown only while this holds */
  showWhen?: Condition;
  /** the tab of the dock it was dropped in */
  pane?: number;
  /** An instance of a reusable component (lib/instances.ts): the group is one unit on the canvas and
   *  `items` holds a single empty container standing in for it, so that moving, selecting and
   *  measuring it work as for any part. What it shows comes from the definition. */
  instanceOf?: string;
  /** what this instance changes of its definition, by `itemId/propKey` */
  overrides?: Record<string, VarValue>;
  /** on a layout container: its first child is drawn once per row of a collection (lib/collections.ts) */
  repeat?: { collection: string; limit?: number };
  /** Runtime only, never saved: this is the container left where an instance was, and what it is an instance of. */
  expandedFrom?: string;
  /** Runtime only, never saved: the prompt's words for a `repeat`. */
  rowsOf?: { name: string; rows: number; fields: string[] };
};

/** a reusable component: its parts, placed relative to its own top left, and how big they come to */
export type ComponentDef = { id: string; name: string; groups: Group[]; w: number; h: number };

/** rows of data a layout can repeat its first child over */
export type Collection = { id: string; name: string; fields: string[]; rows: string[][] };

export type FrameMode = "blank" | "phone";

export type Doc = {
  groups: Group[];
  frames: Frame[];
  paletteKey: string;
  /** the author's own scheme, used when paletteKey is "custom" */
  customPalette?: Palette;
  /** the app should take its colors from the user's wallpaper (Material You) */
  dynamicColor?: boolean;
  frame: FrameMode;
  title: string;
  brief: string;
  /** the prompt as the author rewrote it by hand; undefined means the generated one */
  promptEdit?: string;
  /** the guidance lines the author switched on; undefined means the default set */
  promptOptions?: string[];
  /** shape, type, motion and the light / dark and contrast switches */
  theme?: Theme;
  /** the prototype's state, live during the preview only; `value` is what each starts at */
  vars?: DocVar[];
  /** reusable components; `Group.instanceOf` names one */
  components?: ComponentDef[];
  /** the data repeated layouts draw from; `Group.repeat` names one */
  collections?: Collection[];
};

export const defaultTabs = (): NavTab[] => NAV_TABS[getLang()].map((t) => ({ ...t }));

/** the rows a list prop without destinations gets when the author adds one */
export const defaultTabRows = (): NavTab[] => TAB_LABELS[getLang()].map((label) => ({ icon: "", label }));

export function makeItem(slug?: string): Item {
  const def = partBySlug(slug);
  return { id: uid(), kind: "component", label: def?.name ?? "", icon: null, variant: "filled", component: slug, props: {} };
}

/** the icon a part is shown with in the palette and the layers */
export const paletteIconOf = (it: Item) => partBySlug(it.component)?.icon ?? "widgets";

/** the color a sketch's scheme is generated from: the custom scheme's seed, or the preset's color */
export function seedOf(key: string, custom?: Palette | null, theme?: Theme): string {
  const fromStyle = styleSeed(theme);
  if (fromStyle) return fromStyle;
  const base = (key === "custom" && custom) || PALETTES.find((p) => p.key === key) || PALETTES[0];
  return base.seed ?? base.primary;
}

/** a part is as big as it measures; until it has been measured, the part's own guess */
export function sizeOf(it: Item, widths: Record<string, number>) {
  const def = partBySlug(it.component);
  const railHeight = roleOf(it) === "rail" && def ? reader(def, it.props).n("height") : undefined;
  return { w: widths[it.id] ?? def?.w ?? 120, h: railHeight ?? widths[`${it.id}:h`] ?? def?.h ?? 40 };
}

/** a place inside a part that a tap can be sent from */
type IconSlot = { key: string; label: string; value: string | null };
