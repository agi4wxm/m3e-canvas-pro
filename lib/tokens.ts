import { Lang, NAV_TABS, TAB_LABELS, getLang } from "./i18n";
import { Contrast, schemeFromSeed } from "./color";
import { partBySlug, reader } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import { roleOf } from "../parts/role";
import type { ListItem } from "../parts/types";

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
export const railWidth = (it: Item) => (it.props?.expanded ? RAIL_EXPANDED_W : it.props?.narrow ? RAIL_W : RAIL_COLLAPSED_W);
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
export type ShapeScale = "square" | "rounded" | "full";
export type FontKey = "roboto" | "robotoFlex" | "robotoSerif" | "system";
export type MotionScheme = "standard" | "expressive";
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
};

export const DEFAULT_THEME: Theme = { dark: false, bothModes: false, contrast: "standard", shape: "rounded", font: "roboto", emphasized: false, motion: "standard" };

/** a stored theme with any missing or unknown field replaced by its default */
export function normalizeTheme(t: Partial<Theme> | undefined): Theme {
  const d = DEFAULT_THEME;
  if (!t) return d;
  return {
    dark: typeof t.dark === "boolean" ? t.dark : d.dark,
    bothModes: typeof t.bothModes === "boolean" ? t.bothModes : d.bothModes,
    contrast: CONTRASTS.some((c) => c.key === t.contrast) ? (t.contrast as Contrast) : d.contrast,
    shape: SHAPES.some((c) => c.key === t.shape) ? (t.shape as ShapeScale) : d.shape,
    font: FONTS.some((c) => c.key === t.font) ? (t.font as FontKey) : d.font,
    emphasized: typeof t.emphasized === "boolean" ? t.emphasized : d.emphasized,
    motion: t.motion === "expressive" || t.motion === "standard" ? t.motion : d.motion,
  };
}

export const SHAPES: { key: ShapeScale; label: string; icon: string }[] = [
  { key: "square", label: "Square", icon: "crop_square" },
  { key: "rounded", label: "Rounded", icon: "rounded_corner" },
  { key: "full", label: "Full", icon: "circle" },
];

export const FONTS: { key: FontKey; label: string; family: string; /** Google Fonts family to fetch, if any */ google?: string }[] = [
  { key: "roboto", label: "Roboto", family: "Roboto, system-ui, sans-serif" },
  { key: "robotoFlex", label: "Roboto Flex", family: "'Roboto Flex', Roboto, system-ui, sans-serif", google: "Roboto+Flex:wght@400;500;600;700" },
  { key: "robotoSerif", label: "Roboto Serif", family: "'Roboto Serif', Georgia, serif", google: "Roboto+Serif:wght@400;500;600;700" },
  { key: "system", label: "System", family: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
];

/** The Noto Sans face that covers a language's script, spliced in behind the chosen
 *  face so CJK text renders the same on every OS. English needs none. */
export const LANG_FONT: Record<Lang, { family: string; google: string } | null> = {
  ja: { family: "'Noto Sans JP'", google: "Noto+Sans+JP:wght@400;500;600;700" },
  zh: { family: "'Noto Sans SC'", google: "Noto+Sans+SC:wght@400;500;600;700" },
  ko: { family: "'Noto Sans KR'", google: "Noto+Sans+KR:wght@400;500;600;700" },
  en: null,
};

/** a family list with the language's Noto face placed before the generic fallbacks */
const withLangFont = (family: string, lang?: Lang) => {
  const extra = lang ? LANG_FONT[lang]?.family : undefined;
  if (!extra) return family;
  const parts = family.split(",").map((s) => s.trim());
  const at = parts.findIndex((s) => /^(system-ui|-apple-system|Georgia|serif|sans-serif)$/.test(s));
  parts.splice(at < 0 ? parts.length : at, 0, extra);
  return parts.join(", ");
};

/** the chosen face, with the language's Noto face behind it; the system font is left to the device */
export const fontFamilyOf = (f: FontKey, lang?: Lang) => {
  const family = FONTS.find((x) => x.key === f)?.family ?? FONTS[0].family;
  return f === "system" ? family : withLangFont(family, lang);
};
/** the editor's own font: Roboto, then the language's Noto face */
export const uiFontFamily = (lang?: Lang) => withLangFont("Roboto, system-ui, sans-serif", lang);

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
  const base = (key === "custom" && custom) || PALETTES.find((p) => p.key === key) || PALETTES[0];
  if (!theme || (!theme.dark && theme.contrast === "standard")) return base;
  const seed = base.seed ?? base.primary;
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
};

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
  return w === PHONE_W && h === PHONE_H;
};
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

/** a part that can hold others, standing alone */
export const holdsParts = (g: Group) => !g.free && g.items.length === 1 && !!partBySlug(g.items[0].component)?.holds;

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
  const held = new Set(groups.filter((g, i) => g.id !== container.id && !g.locked && (g.inFlow === container.id || (i > at && liesInside(g, outer, widths)))));
  /* what a layout holds is its own even where it overflows, at any depth */
  for (const g of held) for (const o of groups) if (o.inFlow === g.id && !o.locked) held.add(o);
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
  while (at.inFlow) {
    const host = groups.find((x) => x.id === at.inFlow);
    if (!host || seen.has(host.id)) break;
    seen.add(host.id);
    at = host;
  }
  return frameOfGroup(at, frames, widths);
}

/** a group belongs to the frame that contains its centre */
export function frameOfGroup(g: Group, frames: Frame[], widths: Record<string, number>): Frame | undefined {
  const bb = groupBounds(g, widths);
  const cx = (bb.l + bb.r) / 2;
  const cy = (bb.t + bb.b) / 2;
  return frames.find((f) => {
    const fr = frameRect(f);
    return cx >= fr.l && cx <= fr.r && cy >= fr.t && cy <= fr.b;
  });
}

export const groupsInFrame = (groups: Group[], f: Frame, frames: Frame[], widths: Record<string, number>) =>
  groups.filter((g) => frameOfPart(g, groups, frames, widths)?.id === f.id);

export type Group = {
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
};

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
export function seedOf(key: string, custom?: Palette | null): string {
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
