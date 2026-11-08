import type { Recipes } from "./recipes";
import { ERRORS_DARK, ERRORS_LIGHT, type StyleRoles, type StyleToken, type Step, type TypeRamp } from "./types";

/* Whether a style's colors can be read: an accessibility check, kept apart from whether the style can be imported.
 *
 * Importing a style (custom.ts `validateCustomStyle`) never depends on this. A style whose words read faintly is still a
 * style, kept as written; this says, check by check, where it falls short, so the author (or a model) can find it.
 *
 * Every check is made in light and in dark, in the state a control is drawn in (default, hover, focus, selected,
 * error, disabled), against the background as it ends up on screen (a state layer over its container, a translucent
 * token over what is behind it, the stops of a screen's backdrop over the screen's color), and at the size the style's
 * type ramp sets those words in. What a pair has to reach depends on what it is for:
 *
 *   text        4.5:1
 *   large text  3:1, where the ramp sets the words at 24px and over, or 18.66px and over at weight 700
 *   ui          3:1, for what tells a control or its state apart: a field's border, the focus ring, a switch that is on
 *   inactive    measured and listed, never required: a disabled control is exempt
 *   decorative  not checked at all: dividers (outlineVariant), toned lines, rims and strokes
 *
 * (the thresholds of WCAG 2.2's 1.4.3 and 1.4.11, and their exception for inactive controls). `loud` names the
 * backgrounds a product is known for even though words on them read faintly; it lowers nothing here. A loud pair that
 * falls short is an issue like any other, marked `loud` so it is plain it was kept on purpose.
 *
 * This checks the colors a style names, not a screen: a part filled by hand, a picture behind words, the colors a
 * custom CSS rule writes, a face that draws thinner than its weight are not seen. Passing it is not WCAG conformance;
 * it is what this checker can say from the style's data. */

export type ContrastUse = "text" | "large-text" | "ui" | "inactive";
export type ContrastState = "default" | "hover" | "focus" | "selected" | "error" | "disabled";

/** the least a pair has to read at, by what it is for; nothing for what is exempt */
export const CONTRAST_NEED: Record<ContrastUse, number | null> = { text: 4.5, "large-text": 3, ui: 3, inactive: null };
export const CONTRAST_STATES: ContrastState[] = ["default", "hover", "focus", "selected", "error", "disabled"];

/** the opacity of the layer an interactive part lays over itself, by state (styles/m3e.css `--md-sys-state-*`) */
const LAYER = { hover: 0.08, focus: 0.1 } as const;
/** a disabled control: its words, and its container (M3: on-surface at 38% and at 10–12%) */
const DISABLED_WORDS = 0.38;
const DISABLED_FILL = 0.1;

export type ContrastCheck = {
  /** the same check of the same style always has the same id: `light/hover/onPrimary@primary` */
  id: string;
  mode: "light" | "dark";
  state: ContrastState;
  use: ContrastUse;
  /** where the words (or the mark) take their color from: `light.onPrimary`, `tokens.primaryText` */
  path: string;
  /** where the background does: `light.primary`, `tokens.barBg`, `screen` */
  on: string;
  /** both colors as they are seen, composited: #RRGGBB */
  fg: string;
  bg: string;
  /** for words: the type role they are set in, and its size and weight in this style */
  type?: { role: string; size: number; weight: number };
  ratio: number;
  /** the least it has to reach; null where it is exempt */
  need: number | null;
  pass: boolean;
  /** the style says the background is its own (`loud`): kept as written, and still an issue when it falls short */
  loud?: true;
  /** what is being read, in words */
  what: { zh: string; en: string };
  /** what the author can do about it, where there is something particular */
  hint?: { zh: string; en: string };
};

export type AccessReport = {
  /** every check passes: as far as this checker can tell, not a statement of WCAG conformance */
  pass: boolean;
  checks: ContrastCheck[];
  /** the checks that fall short, in order */
  issues: ContrastCheck[];
};

/** what the check reads of a style: a custom style and a built-in pack both have it */
export type AccessInput = {
  light: StyleRoles;
  dark: StyleRoles;
  loud?: readonly (keyof StyleRoles)[] | null;
  tokens?: Partial<Record<StyleToken, string>> | null;
  type?: TypeRamp | null;
  compact?: boolean;
  screen?: string | null;
  screenDark?: string | null;
  /** how its tabs and its navigation are built, which says where the chosen one's words are drawn */
  recipes?: Partial<Recipes>;
};

/* ---------- colors ---------- */

type Rgba = [number, number, number, number];

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as channels 0–255 and an alpha 0–1 */
export function rgbaOf(hex: string): Rgba | undefined {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return undefined;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0").toUpperCase();
const hexOfRgb = ([r, g, b]: Rgba) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** a color laid over another, at the color's own alpha times `alpha`: what is seen, opaque */
export function over(top: string, under: string, alpha = 1): string {
  const a = rgbaOf(top);
  const b = rgbaOf(under);
  if (!a || !b) return under;
  const t = a[3] * alpha;
  /* what is under is opaque by the time it is seen */
  return hexOfRgb([a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t), 1]);
}

const luminance = (hex: string) => {
  const [r, g, b] = (rgbaOf(hex) ?? [0, 0, 0, 1]).slice(0, 3).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG's contrast ratio between two opaque #RRGGBB colors */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------- sizes ---------- */

/** M3's type scale where it bears on these checks (styles/m3e.css), and desktop software's smaller one (sheet.ts) */
const M3_TYPE: Record<string, [number, number]> = {
  "title-large": [22, 400],
  "title-medium": [16, 500],
  "title-small": [14, 500],
  "body-large": [16, 400],
  "body-medium": [14, 400],
  "body-small": [12, 400],
  "label-large": [14, 500],
  "label-medium": [12, 500],
  "label-small": [11, 500],
};
const COMPACT_SIZE: Record<string, number> = { "body-large": 14, "body-medium": 13, "title-large": 16, "title-medium": 14, "title-small": 13, "label-large": 13, "label-medium": 12 };

/** the size and weight a type role is drawn at in a style */
function sizeOf(s: AccessInput, role: string): { size: number; weight: number } {
  const own: Step | undefined = s.type?.[role];
  const [size, weight] = M3_TYPE[role] ?? [14, 400];
  if (own) return { size: own[0], weight: own[2] ?? weight };
  return { size: (s.compact ? COMPACT_SIZE[role] : undefined) ?? size, weight };
}

/** large text: 18pt, or 14pt bold */
export const isLargeText = (size: number, weight: number) => size >= 24 || (size >= 18.66 && weight >= 700);

/* ---------- what is read where ---------- */

/** where a color comes from: a role, a token (with the role it stands for when the style sets none), or the backdrop */
type Ref = { role: keyof StyleRoles } | { token: StyleToken; or: Ref } | { screen: true };
const R = (role: keyof StyleRoles): Ref => ({ role });
const T = (token: StyleToken, or: Ref): Ref => ({ token, or });

type Def = {
  state: ContrastState;
  /** text checks take their use from the size of `type`; the others say theirs */
  use: "text" | "ui" | "inactive";
  fg: Ref;
  bg: Ref;
  /** the words' own color as a layer over the background, at this opacity: a state layer */
  layer?: number;
  /** a disabled control: the words at this opacity, over a fill of on-surface at DISABLED_FILL */
  faded?: number;
  /** the type role the words are set in, whose size decides between text and large text */
  type?: string;
  /** checked only when the style sets one of these tokens */
  when?: StyleToken[];
  what: [zh: string, en: string];
  /** what the author can do about it, where there is something particular */
  hint?: [zh: string, en: string];
};

/** the accent words are set in: a color of their own, where the fill would not read (sheet.ts `--st-primary-text`) */
const ACCENT = (dark: boolean) => T(dark ? "primaryTextDark" : "primaryText", R("primary"));
const accentHint = (dark: boolean): [string, string] => {
  const token = dark ? "primaryTextDark" : "primaryText";
  return [`可以在 tokens.${token} 给文字另一个颜色`, `tokens.${token} can give them a color of their own`];
};

/* Where the selected tab and the selected destination take their color depends on how the style builds them (its
 * recipe): only the recipes that set those words in the accent, or in `--st-tab-on` / `--st-nav-on`, over a background
 * known here, are checked; the others set them in on-surface, which the surface checks already cover, or fill the
 * chosen one, which a role pair does not describe. */
function selectedTab(recipe: string | undefined): Def[] {
  const what: [string, string] = ["选中标签页的文字", "the label of the selected tab"];
  if (!recipe || recipe === "m3") return [{ state: "selected", use: "text", fg: R("primary"), bg: R("surface"), type: "title-small", what }];
  if (recipe === "glow") return [{ state: "selected", use: "text", fg: T("tabOn", R("primary")), bg: R("surface"), type: "title-small", what }];
  return [];
}

/** the navigation recipes that set the chosen destination in `--st-nav-on`, and what the bar is painted with */
const NAV_ON: Record<string, { bg: keyof StyleRoles; icons?: true }> = { plain: { bg: "surfaceContainer" }, topline: { bg: "surfaceContainer" }, floating: { bg: "surfaceContainer" }, goldglow: { bg: "surfaceContainerLow" }, icononly: { bg: "surface", icons: true } };
function selectedNav(recipe: string | undefined): Def[] {
  const on = recipe ? NAV_ON[recipe] : undefined;
  if (!on) return [];
  /* a bar of icons alone has no words: its chosen icon is a mark that tells the state, 3:1 */
  if (on.icons) return [{ state: "selected", use: "ui", fg: T("navOn", R("primary")), bg: R(on.bg), what: ["导航栏选中的图标", "the selected icon on the navigation bar"] }];
  return [{ state: "selected", use: "text", fg: T("navOn", R("primary")), bg: R(on.bg), type: "label-medium", what: ["导航栏选中项的文字", "the selected destination's label on the navigation bar"] }];
}

const defs = (dark: boolean, recipes: AccessInput["recipes"]): Def[] => [
  { state: "default", use: "text", fg: R("onSurface"), bg: R("surface"), type: "body-large", what: ["屏幕上的正文", "body text on the screen"] },
  { state: "default", use: "text", fg: R("onSurfaceVariant"), bg: R("surface"), type: "body-medium", what: ["屏幕上的次要文字", "supporting text on the screen"] },
  { state: "default", use: "text", fg: R("onSurface"), bg: R("surfaceContainerLow"), type: "body-large", what: ["低层面板上的正文", "body text on a low panel"] },
  { state: "default", use: "text", fg: R("onSurface"), bg: R("surfaceContainer"), type: "body-large", what: ["面板上的正文", "body text on a panel"] },
  { state: "default", use: "text", fg: R("onSurface"), bg: R("surfaceContainerHigh"), type: "body-large", what: ["高层面板上的正文", "body text on a high panel"] },
  { state: "default", use: "text", fg: R("onSurface"), bg: R("surfaceContainerHighest"), type: "body-large", what: ["最高层面板上的正文", "body text on the highest panel"] },
  { state: "default", use: "text", fg: R("onSurfaceVariant"), bg: R("surfaceContainerHighest"), type: "body-medium", what: ["输入框里的标签和提示", "a field's label and hint"] },
  { state: "default", use: "text", fg: R("inverseOnSurface"), bg: R("inverseSurface"), type: "body-medium", what: ["提示条的文字", "a snackbar's words"] },
  { state: "default", use: "text", fg: R("onPrimary"), bg: R("primary"), type: "label-large", what: ["主按钮的文字", "a filled button's label"] },
  { state: "default", use: "text", fg: R("onPrimaryContainer"), bg: R("primaryContainer"), type: "label-large", what: ["主色容器上的文字", "words on the primary container"] },
  { state: "default", use: "text", fg: R("onSecondary"), bg: R("secondary"), type: "label-large", what: ["次色填充上的文字", "words on the secondary fill"] },
  { state: "default", use: "text", fg: R("onTertiary"), bg: R("tertiary"), type: "label-large", what: ["第三色填充上的文字", "words on the tertiary fill"] },
  { state: "default", use: "text", fg: R("onTertiaryContainer"), bg: R("tertiaryContainer"), type: "label-large", what: ["第三色容器上的文字", "words on the tertiary container"] },
  { state: "default", use: "text", fg: ACCENT(dark), bg: R("surface"), type: "label-large", what: ["屏幕上的主色文字（文字按钮、链接）", "words in the accent on the screen (text buttons, links)"], hint: accentHint(dark) },
  { state: "default", use: "text", fg: ACCENT(dark), bg: R("surfaceContainerHigh"), type: "label-large", what: ["面板上的主色文字", "words in the accent on a panel"], hint: accentHint(dark) },
  { state: "default", use: "text", fg: R("onSurface"), bg: { screen: true }, type: "body-large", what: ["屏幕底纹上的正文", "body text over the screen's backdrop"] },
  { state: "default", use: "text", fg: T("onBar", R("onSurface")), bg: T("barBg", R("surfaceContainer")), type: "title-large", when: ["onBar", "barBg"], what: ["顶栏上的标题", "the title on the top bar"] },
  { state: "default", use: "ui", fg: R("outline"), bg: R("surface"), what: ["输入框和描边控件的边线", "the border of a field or an outlined control"] },
  { state: "selected", use: "text", fg: R("onSecondaryContainer"), bg: R("secondaryContainer"), type: "label-large", what: ["选中的导航项、标签、分段按钮的文字", "the words of a selected nav item, chip or segment"] },
  ...selectedTab(recipes?.tabs),
  ...selectedNav(recipes?.nav),
  { state: "selected", use: "ui", fg: T("toggleOn", R("primary")), bg: R("surface"), what: ["打开的开关", "a switch that is on"] },
  { state: "hover", use: "text", fg: R("onPrimary"), bg: R("primary"), layer: LAYER.hover, type: "label-large", what: ["悬停时主按钮的文字", "a filled button's label under the hover layer"] },
  { state: "hover", use: "text", fg: R("onSecondaryContainer"), bg: R("secondaryContainer"), layer: LAYER.hover, type: "label-large", what: ["悬停时选中项的文字", "a selected item's words under the hover layer"] },
  { state: "hover", use: "text", fg: R("onSurface"), bg: R("surface"), layer: LAYER.hover, type: "body-large", what: ["悬停时列表行的文字", "a list row's words under the hover layer"] },
  { state: "focus", use: "text", fg: R("onPrimary"), bg: R("primary"), layer: LAYER.focus, type: "label-large", what: ["获得焦点时主按钮的文字", "a filled button's label under the focus layer"] },
  { state: "focus", use: "text", fg: R("onSurface"), bg: R("surface"), layer: LAYER.focus, type: "body-large", what: ["获得焦点时列表行的文字", "a list row's words under the focus layer"] },
  { state: "focus", use: "ui", fg: R("secondary"), bg: R("surface"), what: ["焦点环", "the focus ring"] },
  { state: "error", use: "text", fg: R("error"), bg: R("surface"), type: "body-small", what: ["输入框下的错误提示", "the error text under a field"] },
  { state: "error", use: "text", fg: R("onError"), bg: R("error"), type: "label-large", what: ["错误色按钮的文字", "a label on the error fill"] },
  { state: "error", use: "text", fg: R("onErrorContainer"), bg: R("errorContainer"), type: "body-medium", what: ["错误容器里的文字", "words on the error container"] },
  { state: "disabled", use: "inactive", fg: R("onSurface"), bg: R("surface"), faded: DISABLED_WORDS, type: "label-large", what: ["停用按钮的文字（停用控件不要求对比度）", "a disabled button's label (a disabled control is exempt)"] },
];

const MODE_ZH = { light: "浅色", dark: "深色" } as const;
const STATE_ZH: Record<ContrastState, string> = { default: "常态", hover: "悬停", focus: "焦点", selected: "选中", error: "错误", disabled: "停用" };

/** the color of a token as it is seen: its own (a hex, translucent or not; a role's variable), or what it stands for */
function resolve(ref: Ref, roles: StyleRoles, tokens: AccessInput["tokens"], mode: "light" | "dark"): { color: string; path: string } {
  if ("role" in ref) return { color: (roles[ref.role] as string | undefined) ?? (mode === "dark" ? ERRORS_DARK : ERRORS_LIGHT)[ref.role as keyof typeof ERRORS_LIGHT] ?? "#000000", path: `${mode}.${ref.role}` };
  if ("token" in ref) {
    const own = tokens?.[ref.token]?.trim();
    const role = own ? /^var\(--md-sys-color-([a-z-]+)\)$/.exec(own)?.[1] : undefined;
    const named = role?.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    /* the two roles the web names besides a style's own (sheet.ts styleRoleColors) */
    const viaRole = (named === "background" ? "surface" : named === "onBackground" ? "onSurface" : named) as keyof StyleRoles | undefined;
    if (viaRole && roles[viaRole]) return { color: roles[viaRole] as string, path: `tokens.${ref.token}` };
    if (own && rgbaOf(own)) return { color: own, path: `tokens.${ref.token}` };
    return resolve(ref.or, roles, tokens, mode);
  }
  return { color: roles.surface, path: "screen" };
}

/** the #hex stops of a backdrop (gradients of colors), each laid over the screen's color */
function backdropStops(backdrop: string | null | undefined, surface: string): string[] {
  if (!backdrop) return [];
  return [...backdrop.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]).filter((h) => rgbaOf(h)).map((h) => over(h, surface));
}

/** Every check of a style's colors, in both modes, and whether it passes as a whole. */
export function checkAccess(s: AccessInput): AccessReport {
  const checks: ContrastCheck[] = [];
  for (const mode of ["light", "dark"] as const) {
    const dark = mode === "dark";
    const roles = s[mode];
    for (const d of defs(dark, s.recipes)) {
      if (d.when && !d.when.some((k) => s.tokens?.[k])) continue;
      const f = resolve(d.fg, roles, s.tokens, mode);
      const isScreen = "screen" in d.bg;
      const stops = isScreen ? backdropStops(dark ? (s.screenDark ?? s.screen) : s.screen, roles.surface) : [];
      if (isScreen && !stops.length) continue;
      const b = isScreen ? { color: roles.surface, path: "screen" } : resolve(d.bg, roles, s.tokens, mode);
      /* what is behind a translucent background is the screen */
      const ground = over(b.color, roles.surface);
      const layered = d.layer ? over(f.color, ground, d.layer) : d.faded ? over(roles.onSurface, ground, DISABLED_FILL) : ground;
      const words = d.faded ? over(f.color, layered, d.faded) : over(f.color, layered);
      let bg = layered;
      let ratio = contrastRatio(words, layered);
      /* over a backdrop the words are read on its faintest stop */
      if (isScreen) {
        ratio = Infinity;
        for (const c of stops) {
          const r = contrastRatio(over(f.color, c), c);
          if (r < ratio) [ratio, bg] = [r, c];
        }
      }
      const type = d.type ? { role: d.type, ...sizeOf(s, d.type) } : undefined;
      const use: ContrastUse = d.use === "text" ? (type && isLargeText(type.size, type.weight) ? "large-text" : "text") : d.use;
      const need = CONTRAST_NEED[use];
      const bgRole = "role" in d.bg ? d.bg.role : undefined;
      const loud = !!bgRole && !!s.loud?.includes(bgRole);
      const fgName = f.path.replace(/^(light|dark)\./, "");
      const onName = b.path.replace(/^(light|dark)\./, "");
      checks.push({
        id: `${mode}/${d.state}/${fgName}@${onName}`,
        mode,
        state: d.state,
        use,
        path: f.path,
        on: b.path,
        fg: isScreen ? over(f.color, bg) : words,
        bg,
        ...(type ? { type } : {}),
        ratio: Math.round(ratio * 100) / 100,
        need,
        pass: need === null || ratio >= need,
        ...(loud ? { loud: true as const } : {}),
        what: { zh: `${MODE_ZH[mode]}·${STATE_ZH[d.state]}：${d.what[0]}`, en: `${mode}, ${d.state}: ${d.what[1]}` },
        ...(d.hint ? { hint: { zh: d.hint[0], en: d.hint[1] } } : {}),
      });
    }
  }
  const issues = checks.filter((c) => !c.pass);
  return { pass: !issues.length, checks, issues };
}

const USE_ZH: Record<ContrastUse, string> = { text: "正文", "large-text": "大号文字", ui: "必要的界面元素", inactive: "停用控件" };
const USE_EN: Record<ContrastUse, string> = { text: "text", "large-text": "large text", ui: "an essential control", inactive: "a disabled control" };

/** one check in words: what, where, how well it reads, what it needs, and, when it is loud, that it was kept on purpose */
export function accessWords(c: ContrastCheck): { zh: string; en: string } {
  const size = c.type ? `（${c.type.role} ${c.type.size}px/${c.type.weight}）` : "";
  const sizeEn = c.type ? ` (${c.type.role}, ${c.type.size}px ${c.type.weight})` : "";
  const need = c.need === null ? "" : `，${USE_ZH[c.use]}至少 ${c.need}:1${size}`;
  const needEn = c.need === null ? "" : `; ${USE_EN[c.use]} needs ${c.need}:1${sizeEn}`;
  const loud = c.loud ? `；${c.on} 写在 loud 里，按风格保留，仍算可访问性问题` : "";
  const loudEn = c.loud ? `. ${c.on} is loud: kept as the style's own look, and still an accessibility issue` : "";
  return {
    zh: `${c.what.zh}：${c.path} 在 ${c.on} 上 ${c.ratio.toFixed(2)}:1${need}${loud}${c.hint ? `；${c.hint.zh}` : ""}`,
    en: `${c.what.en}: ${c.path} on ${c.on} reads ${c.ratio.toFixed(2)}:1${needEn}${loudEn}${c.hint ? `; ${c.hint.en}` : ""}`,
  };
}
