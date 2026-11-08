import { BOX_CSS, SCREEN_TEXTURE, headingRules, recipeRules, RECIPE_KEYS } from "./recipes";
import { BUTTON, CHIPS, CORNERED, HEADING_TYPE, role } from "./recipes/shared";
import type { StyleContext } from "./book";
import { colorsOf, recipesOf, styleOf, uxOf, type Styled } from "./theme";
import { ERRORS_DARK, ERRORS_LIGHT, type StylePack, type StyleRoles, type TypeRamp } from "./types";

/* A theme's style written out as one stylesheet, so the canvas, the preview and an exported app wear the same one and
 * no part has to know about it. The stylesheet is unlayered, and everything a component says about itself sits in
 * Tailwind's layers, so it wins without !important; what a part is told by hand (its own corners, its own fill) is
 * drawn inline or by class on that part and stays its own. Material adds nothing. */

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** every role of a scheme a style has an opinion on: what it names, and what follows from those */
function roleVars(r: StyleRoles, dark: boolean): string {
  return Object.entries(styleRoleColors(r, dark)).map(([k, v]) => `--md-sys-color-${kebab(k)}:${v};`).join("");
}

/** every role a style's colors come to, by camelCase name: what it names, and what follows from those (also read by the
 *  React Native theme, lib/export/rn/theme.ts) */
export function styleRoleColors(r: StyleRoles, dark: boolean): Record<string, string> {
  return {
    ...(dark ? ERRORS_DARK : ERRORS_LIGHT),
    ...r,
    background: r.surface,
    onBackground: r.onSurface,
    surfaceBright: r.surfaceContainerHigh,
    surfaceDim: r.surface,
    surfaceContainerLowest: r.surfaceContainerLow,
    surfaceVariant: r.surfaceContainerHighest,
    surfaceTint: r.primary,
    primaryDim: r.primary,
    secondaryDim: r.secondary,
    tertiaryDim: r.tertiary,
    primaryFixed: r.primaryContainer,
    primaryFixedDim: r.primaryContainer,
    onPrimaryFixed: r.onPrimaryContainer,
    onPrimaryFixedVariant: r.onPrimaryContainer,
    secondaryFixed: r.secondaryContainer,
    secondaryFixedDim: r.secondaryContainer,
    onSecondaryFixed: r.onSecondaryContainer,
    onSecondaryFixedVariant: r.onSecondaryContainer,
    tertiaryFixed: r.tertiaryContainer,
    tertiaryFixedDim: r.tertiaryContainer,
    onTertiaryFixed: r.onTertiaryContainer,
    onTertiaryFixedVariant: r.onTertiaryContainer,
  };
}

/** a type ramp as the variables the type classes read */
const ramp = (steps: TypeRamp) =>
  Object.entries(steps)
    .map(([k, [size, line, weight, track]]) =>
      [k, `${k}-emphasized`]
        .map((n, i) => `--text-${n}:${size}px;--text-${n}--line-height:${line}px;${weight ? `--text-${n}--font-weight:${i ? Math.min(900, weight + 100) : weight};` : ""}${track !== undefined ? `--text-${n}--letter-spacing:${track}px;` : ""}`)
        .join(""),
    )
    .join("");

/** what desktop software does to everything: smaller words, shorter controls */
const COMPACT_VARS = `--text-body-large:14px;--text-body-large--line-height:20px;--text-body-medium:13px;--text-body-medium--line-height:18px;--text-title-large:16px;--text-title-large--line-height:22px;--text-title-medium:14px;--text-title-medium--line-height:20px;--text-title-small:13px;--text-label-large:13px;--text-label-large--line-height:18px;--text-label-medium:12px;`;
const COMPACT_CSS = `[data-button][data-size=xs]{height:24px;padding-inline:8px}
[data-button]:is([data-size=sm],[data-size=default]){height:32px;padding-inline:12px}
[data-button][data-size=md]{height:36px;padding-inline:16px;font-size:14px}
[data-button][data-size=lg]{height:44px;padding-inline:20px;font-size:15px}
[data-slot=tabs-list]{height:36px}
[data-slot=tabs-trigger]{margin-block:0;height:100%}
[data-slot=app-bar-row]{height:48px}
[data-slot=navigation-bar]{height:56px}
[data-slot=text-field-box]{min-height:44px}
[data-slot=text-field] :is(input,textarea){padding-top:18px;padding-bottom:4px}`;

/** the corners a control takes under a style, or nothing when it keeps M3's own */
function cornerCss(control: StylePack["control"], pill: StylePack["pill"]): string {
  const r = control === "pill" ? "var(--st-control-r)" : `var(--md-sys-shape-corner-${control})`;
  return [
    control === "pill" ? "" : `:is(${CORNERED}){--btn-r:${r};--btn-r-pressed:${r};--btn-r-square:${r};--btn-r-selected:${r};--btn-h2:${r}}`,
    control === "pill" ? "" : `:is(${CHIPS},[data-slot=fab],[data-slot=extended-fab]){border-radius:${r}}`,
    pill === "follow" ? `.rounded-full{border-radius:${r}}\n:is([data-slot=radio-group-item],[data-slot=radio-group-indicator],[data-slot=slider-thumb]).rounded-full{border-radius:50%}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** the type roles a heading is set in: what the display face reaches, a price or a count set as large left out */
const DISPLAY_TYPE = HEADING_TYPE;

export type StyleSelectors = {
  /** where the variables are set in light mode, and where the rules start from */
  scope: string;
  /** where they are set in dark mode */
  dark: string;
};

export const CANVAS_SCOPE: StyleSelectors = { scope: ".m3-part-scope.m3-part-scope", dark: ".dark .m3-part-scope.m3-part-scope" };
/* the theme provider writes its scheme on :root at run time, later than this stylesheet: twice is enough to outrank it */
export const APP_SCOPE: StyleSelectors = { scope: ":root:root", dark: ":root:root.dark" };

type StyleInput = Styled & { fontFamily?: string; displayFamily?: string };

/** The whole look of a theme as CSS, or "" when it adds nothing to Material. What it writes, in this order:
 *
 *  1. the variables, in the scope: the style's own (`--st-*`), its type ramp, and its colors in light, then in dark;
 *  2. the size of words no part sets a size for;
 *  3. inside the scope, the rules, each later one built on those before it:
 *     - what every part starts from: `.rounded`, the corners of the media a style runs to the edge, the corners of
 *       controls (cornerCss), the accent color words are set in, desktop software's shorter controls;
 *     - the recipes, in recipes/index.ts's ORDER: buttons, then the panels (the surface recipe, which dresses every
 *       panel), then what is more particular than a panel (a card, a sheet, a tooltip), then tabs, controls,
 *       navigation, fields, bars, gauges, lists and their rows, menus, dialogs, pickers and the small marks;
 *     - the surface roles of the box an author builds with (BOX_CSS), the display face, the italic headings, the
 *       heading recipe, the capital labels;
 *     - last, the pack's own `css`;
 *  4. what is drawn behind an exported screen.
 *
 *  A rule later in the list wins over one before it only while it weighs as much, so the lists recipes and packs
 *  select by (recipes/shared.ts) each weigh one attribute, and what only narrows one down goes in `:where()`.
 *  styles.test.ts holds them to it, and holds every rule to no id's weight. */
export function styleCss(t: StyleInput, at: StyleSelectors = CANVAS_SCOPE, styles?: StyleContext): string {
  const pack = styleOf(t.style, styles);
  const squared = t.shape === "square" || t.shape === "none" || t.shape === "soft";
  const recipes = recipesOf(t, styles);
  const anyRecipe = RECIPE_KEYS.some((k) => recipes[k] !== "m3");
  const display = t.displayFamily;
  if (!pack && !squared && !anyRecipe && !display) return "";

  /* the corner a button gets when its style names none: M3's pill, until the shape scale says the document is square */
  const control = pack?.control ?? (squared ? "small" : "pill");
  const pill = pack?.pill === "follow" || (t.shape === "none" && !pack) ? "follow" : (pack?.pill ?? "round");
  const controlR = control === "pill" ? "999px" : `var(--md-sys-shape-corner-${control})`;
  const edge = pack?.edge ?? 2;
  const tk = pack?.tokens ?? {};
  const vars = [
    `--st-line:${role("outline")};--st-edge:${edge}px;--st-edge-thin:${Math.max(1, edge - 1)}px;--st-bar-line:${pack?.compact ? 1 : edge}px;--st-control-r:${controlR};`,
    `--st-rim:${tk.rim ?? role("outline")};--st-rim-dark:${tk.rimDark ?? role("on-surface")};--st-stroke:${tk.stroke ?? "rgb(0 0 0/.75)"};`,
    `--st-margin:${uxOf(t, styles).margin}px;--st-toned-line:${tk.tonedLine ?? "transparent"};--st-toggle-on:${tk.toggleOn ?? role("primary")};--st-nav-on:${tk.navOn ?? role("primary")};--st-tab-on:${tk.tabOn ?? role("primary")};`,
    `--st-nav-bg:${tk.navBg ?? role("surface-container")};--st-nav-active:${tk.navActive ?? role("secondary-container")};--st-bar-bg:${tk.barBg ?? role("surface-container")};--st-on-bar:${tk.onBar ?? role("on-surface")};`,
    pack?.compact ? COMPACT_VARS : "",
    pack?.type ? ramp(pack.type) : "",
    /* a pixel face has its one weight: anything drawn bolder only smears */
    pack?.font === "pixel" ? "--st-mono:'Pixelify Sans','Fusion Pixel 12px Proportional SC',monospace;" : "",
    /* the Chinese that stands in for these faces has its one weight, and anything drawn bolder only smears */
    pack && ["pixel", "barlow", "rajdhani", "lilita", "fredoka"].includes(pack.font) ? "font-synthesis-weight:none;" : "",
  ].join("");

  const colors = pack && !t.ownColors && (!t.contrast || t.contrast === "standard") ? pack : undefined;
  const top = [
    `${at.scope}{${vars}${colors ? `${roleVars(colors.light, false)}--st-primary-text:${tk.primaryText ?? role("primary")};` : ""}${display ? `--st-display:${display};` : ""}}`,
    colors ? `${at.dark}{${roleVars(colors.dark, true)}--st-primary-text:${tk.primaryTextDark ?? role("primary")};}` : "",
  ];
  /* words a part sets no size for are body text, by this style's ramp. On a whole page that is said of its body: the root's size is what rem counts from */
  const plainWords = pack?.type ? `${at === APP_SCOPE ? `${at.scope} body` : at.scope}{font-size:var(--text-body-large);line-height:var(--text-body-large--line-height)}` : "";
  const bleed = uxOf(t, styles).bleed ?? [];
  const rules = [
    pack ? `.rounded{border-radius:var(--md-sys-shape-corner-extra-small)}` : "",
    bleed.includes("video") ? `:is([data-slot=video],[data-slot=video-placeholder]){border-radius:0}` : "",
    /* a picture's corner comes from the theme by a variable, on the picture itself */
    bleed.includes("image") ? `[data-slot=image]{--md-sys-shape-corner-medium:0px}` : "",
    cornerCss(control, pill),
    /* a color made for filling a button is not always one words can be read in. What it leaves out weighs nothing, so
       a recipe or the pack that sets such words in a color of its own wins over it by coming later */
    colors && (tk.primaryText || tk.primaryTextDark) ? `.text-primary:where(:not([data-slot=app-bar] *)){color:var(--st-primary-text)}` : "",
    pack?.compact ? COMPACT_CSS : "",
    ...recipeRules(recipes),
    pack ? BOX_CSS : "",
    display ? `${DISPLAY_TYPE}{font-family:var(--st-display)}` : "",
    pack?.italicDisplay ? `${DISPLAY_TYPE}{font-style:italic;font-weight:800;text-transform:uppercase}` : "",
    headingRules(recipes),
    pack?.capsLabels ? `:is(${BUTTON},[data-slot=tabs-trigger]){text-transform:uppercase;letter-spacing:.06em}` : "",
    /* the pack's own word comes last */
    pack?.css ?? "",
  ].filter(Boolean);
  /* an exported screen and a style's sample are drawn by class, so a rule reaches them; on the canvas and in the
     preview a screen paints itself inline: see screenBackground */
  const light = screenImageOf({ ...t, dark: false }, styles);
  const dark = screenImageOf({ ...t, dark: true }, styles);
  const backdrop = [light ? `${at.scope} [data-backdrop]{background-image:${light}}` : "", dark ? `${at.dark} [data-backdrop]{background-image:${dark}}` : ""];
  return [...top, plainWords, `${at.scope}{\n${rules.join("\n")}\n}`, ...backdrop].filter(Boolean).join("\n");
}

/** what lies behind a screen of this style, if it is more than the screen's color: the texture its screen recipe lays
 *  over everything, then the style's own picture, which goes with its colors */
function screenImageOf(t: Styled, styles?: StyleContext): string | undefined {
  const pack = colorsOf(t, styles);
  const texture = SCREEN_TEXTURE[recipesOf(t, styles).screen];
  const image = pack && (t.dark ? (pack.screenDark ?? pack.screen) : pack.screen);
  return [texture, image].filter(Boolean).join(", ") || undefined;
}

/** the screen's background, for where it is drawn inline: the style's picture over the screen's color */
export const screenBackground = (color: string, t: Styled, styles?: StyleContext) => {
  const image = screenImageOf(t, styles);
  return image ? `${image}, ${color}` : color;
};

/** whether an exported screen has anything to draw behind itself */
export const hasBackdrop = (t: Styled, styles?: StyleContext) => !!(screenImageOf({ ...t, dark: false }, styles) ?? screenImageOf({ ...t, dark: true }, styles));
