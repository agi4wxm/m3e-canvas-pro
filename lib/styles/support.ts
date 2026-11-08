import type { StyleContext } from "./book";
import type { CssRule } from "./css";
import { isCustomKey, type CustomStyle } from "./custom";
import { RECIPE_CSS, RECIPE_KEYS, type RecipeKey } from "./recipes";
import { builtInStyleOf, recipesOf, styleOf, type Styled } from "./theme";

/* How far a style reaches each app it is exported to: what of it is carried, what is not, and where an author who
 * needs what is not can say it instead. The web wears the style as one stylesheet (sheet.ts), so all of it; a phone app
 * and a mini-program wear it as a theme of plain values (lib/export/rn/theme.ts, lib/export/miniapp/theme.ts), so the
 * structured part of it (colors, tokens, type, corners, spacing, the recipe names the kits know) and none of its CSS.
 * What is not carried is listed in each app's difference report (`warnings.json`, the export's differences), with the
 * screens it touches, rather than called the same style. */

export type StyleTarget = "web" | "mobile" | "miniapp";
/** carried; carried in part (the note says which); not carried */
export type Carry = "yes" | "part" | "no";
export type SupportRow = { what: string; zh: string; en: string; web: Carry; mobile: Carry; miniapp: Carry; note: { zh: string; en: string } };

/** the recipe kinds each kit builds its controls by (rn/src/kit, miniapp-kit/src/kit: `recipeOf(kit, …)`); the others
 *  are drawn on the web only. styleSupport.test.ts holds these to the kits' sources. */
export const KIT_RECIPES: Record<"mobile" | "miniapp", readonly RecipeKey[]> = {
  mobile: ["appbar", "avatar", "badge", "bar", "button", "card", "check", "chip", "dialog", "fab", "field", "icon", "input", "list", "menu", "nav", "picker", "progress", "row", "search", "segmented", "sheet", "slider", "surface", "tabs", "toggle"],
  miniapp: ["appbar", "avatar", "badge", "bar", "button", "card", "check", "chip", "dialog", "divider", "fab", "field", "icon", "input", "list", "menu", "nav", "picker", "progress", "row", "search", "segmented", "sheet", "slider", "surface", "tabs", "toggle"],
};

const row = (what: string, zh: string, en: string, web: Carry, mobile: Carry, miniapp: Carry, note: [string, string] = ["", ""]): SupportRow => ({ what, zh, en, web, mobile, miniapp, note: { zh: note[0], en: note[1] } });

/** what of a style reaches each app (docs/风格清单.md prints it) */
export const STYLE_SUPPORT: SupportRow[] = [
  row("light, dark", "颜色角色（浅色、深色）", "color roles (light, dark)", "yes", "yes", "yes", ["手机写进主题，小程序写成 CSS 变量", "a theme on a phone, CSS variables in a mini-program"]),
  row("tokens", "控件颜色 `tokens.*`", "control colors `tokens.*`", "yes", "yes", "yes", ["`#hex`、角色变量和 `color-mix` 换算成颜色", "`#hex`, role variables and `color-mix` resolved to colors"]),
  row("type, compact", "字号阶梯、紧凑尺寸", "type ramp, compact sizes", "yes", "yes", "yes"),
  row("shape, control, pill, edge", "圆角档位、按钮圆角、硬边宽度", "corners, button corners, edge width", "yes", "yes", "yes"),
  row("font, display", "正文和标题字体", "body and heading faces", "yes", "part", "part", ["字体名照写，是否装上字体由应用决定", "the face is named; whether it is installed is the app's"]),
  row("icons", "图标家族", "icon family", "yes", "yes", "yes"),
  row("ux", "边距、间距、导航位置", "margins, gaps, where navigation stands", "yes", "part", "part", ["边距和间距写进主题；导航位置和排布在导出前已经排好", "margins and gaps in the theme; navigation and placement are laid out before export"]),
  row("capsLabels, italicDisplay", "大写标签、斜体标题", "capital labels, italic headings", "yes", "yes", "yes"),
  row("recipes", "配方", "recipes", "yes", "part", "part", [`手机端的组件按这些配方画：${KIT_RECIPES.mobile.join("、")}；小程序：${KIT_RECIPES.miniapp.join("、")}；其余只在网页上画`, `the phone's kit builds these its recipe's way: ${KIT_RECIPES.mobile.join(", ")}; the mini-program's: ${KIT_RECIPES.miniapp.join(", ")}; the others are drawn on the web only`]),
  row("screen, screenDark", "屏幕底纹（渐变）", "screen backdrop (gradients)", "yes", "no", "no", ["屏幕只画底色", "screens show their color only"]),
  row("css (built-in)", "内置风格自己的 CSS", "a built-in style's own CSS", "yes", "part", "part", ["几套核对过手机效果的风格（iOS、微信、Spotify）由人手换算成主题值，只对内置键名生效", "for the styles checked on a phone (iOS, WeChat, Spotify) by hand, as theme values, under the built-in key only"]),
  row("rules", "自定义 CSS 规则", "custom CSS rules", "yes", "no", "no", ["React Native 没有样式表，选择器到不了部件；小程序的组件没有 data-slot，WXSS 只能按类名选", "React Native has no stylesheet, so no selector reaches a part; the mini-program's parts carry no data-slot, and WXSS selects by class"]),
];

/* ---------- a rule, read for what it relies on ---------- */

const STATES = /:(hover|active|focus|focus-visible|focus-within|checked|disabled|enabled|indeterminate|placeholder-shown)\b/;
const ELEMENTS = /::?(before|after|placeholder)\b/;

/** the selector without what is in parentheses and quotes: what is left says how it is put together */
const outer = (s: string) => {
  let depth = 0;
  let out = "";
  for (const c of s.replace(/"[^"]*"|'[^']*'/g, '""').replace(/\[[^\]]*\]/g, "[]")) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0) out += c;
  }
  return out;
};

export type RuleTrait = "pseudo-element" | "state" | "complex" | "gradient" | "effect" | "shadow" | "motion" | "variable";

/** what a rule relies on that a theme of values has no word for */
export function ruleTraits(rule: CssRule): RuleTrait[] {
  const out: RuleTrait[] = [];
  const sel = rule.selector;
  if (ELEMENTS.test(sel)) out.push("pseudo-element");
  if (STATES.test(sel)) out.push("state");
  if (sel !== "&" && (/[\s>+~,]/.test(outer(sel).trim()) || /:(has|is|where|not)\(/.test(sel))) out.push("complex");
  const decls = Object.entries(rule.declarations);
  if (decls.some(([, v]) => /gradient\(/.test(v))) out.push("gradient");
  if (decls.some(([p]) => /^(-webkit-)?(filter|backdrop-filter|mask|mask-image|clip-path|mix-blend-mode|background-blend-mode)$/.test(p))) out.push("effect");
  if (decls.some(([p]) => p === "box-shadow" || p === "text-shadow")) out.push("shadow");
  if (decls.some(([p]) => /^(transition|animation)/.test(p))) out.push("motion");
  if (decls.some(([p]) => p.startsWith("--"))) out.push("variable");
  return out;
}

/** why what a rule relies on is not had on each, in the words of the difference report (English, as the rest of it) */
const TRAIT_WORDS: Record<RuleTrait, Record<"mobile" | "miniapp", string>> = {
  "pseudo-element": { mobile: "a phone has no ::before or ::after", miniapp: "WXSS has ::before/::after only on the kit's own classes" },
  state: { mobile: "hover, focus and the other states are drawn by the kit", miniapp: "a mini-program has no hover, and a pressed look is the kit's hover-class" },
  complex: { mobile: "with no selectors, no combinator or nesting reaches a part", miniapp: "WXSS has no attribute selectors and no :has or :is" },
  gradient: { mobile: "React Native draws no CSS gradient", miniapp: "a gradient needs a stylesheet of your own" },
  effect: { mobile: "filters, masks and clipping work on some platforms only", miniapp: "filters and masks depend on the platform" },
  shadow: { mobile: "shadows are the kit's, by its recipes", miniapp: "shadows are the kit's, by its recipes" },
  motion: { mobile: "transitions and animations are the kit's own", miniapp: "transitions and animations are the kit's own" },
  variable: { mobile: "a custom property has no theme value to become", miniapp: "a custom property has no theme value to become" },
};

/** where what a rule says can be said in the style's own values instead, by the part it dresses and what it sets */
export function ruleInstead(rule: CssRule): string[] {
  const slots = slotsIn(rule.selector).join(" ");
  const props = Object.keys(rule.declarations);
  const has = (re: RegExp) => props.some((p) => re.test(p));
  const out = new Set<string>();
  const paints = has(/^(color|background|background-color|fill)$/);
  if (paints && /navigation-bar|nav-/.test(slots)) out.add("tokens.navBg / navOn / navActive");
  else if (paints && /app-bar|top-app-bar|bar\b/.test(slots)) out.add("tokens.barBg / onBar");
  else if (paints && /tabs/.test(slots)) out.add("tokens.tabOn");
  else if (paints && /switch/.test(slots)) out.add("tokens.toggleOn");
  else if (paints) out.add("light / dark");
  if (has(/radius$/)) out.add("shape / control / pill");
  if (has(/^border(-[a-z]+)?-width$|^border$/)) out.add("edge");
  if (has(/^(font-size|line-height|font-weight|letter-spacing|font)$/)) out.add("type");
  if (rule.declarations["text-transform"] === "uppercase") out.add("capsLabels");
  if (rule.declarations["font-style"] === "italic") out.add("italicDisplay");
  if (has(/^(margin|padding|gap)/)) out.add("ux");
  out.add("recipes");
  return [...out];
}

/* ---------- which screens a selector reaches ---------- */

/** the parts a named slot belongs to, where its name does not start with theirs */
const SLOT_PARTS: Record<string, string[]> = {
  "nav-item": ["navigation-bar", "navigation-rail", "floating-nav"],
  "nav-indicator": ["navigation-bar", "navigation-rail", "floating-nav"],
  "nav-label": ["navigation-bar", "navigation-rail", "floating-nav"],
};

/** the `data-slot` names a selector (or a stylesheet) reaches */
export const slotsIn = (css: string): string[] => [...new Set([...css.matchAll(/\[data-slot\s*[~|^$*]?=\s*["']?([a-z0-9-]+)["']?\s*\]/g)].map((m) => m[1]))];

/** whether a part of this kind draws a slot of this name: its own name, or one that starts with it */
const reaches = (slot: string, slug: string) => slot === slug || slot.startsWith(`${slug}-`) || !!SLOT_PARTS[slot]?.includes(slug);

export type StyleScreen = { name: string; slugs: ReadonlySet<string> };

/** the kinds of part a screen's groups hold, for `StyleScreen` */
export const kindsIn = (groups: readonly { items: readonly { component?: string }[] }[]): Set<string> => new Set(groups.flatMap((g) => g.items.flatMap((it) => (it.component ? [it.component] : []))));

/** the screens a stylesheet's slots reach, by the kinds of part on each; every screen when it names no slot */
function screensReached(css: string, screens: readonly StyleScreen[]): string[] {
  const slots = slotsIn(css);
  if (!slots.length) return screens.map((s) => s.name);
  return screens.filter((s) => slots.some((slot) => [...s.slugs].some((slug) => reaches(slot, slug)))).map((s) => s.name);
}

/* ---------- the differences ---------- */

export type StyleDifference = { kind: "style"; screen?: string; screens: string[]; detail: string };

const plural = (names: string[]) => (names.length ? `screens: ${names.join(", ")}` : "no screen has such a part now");
/** the screens a difference touches: by name, and as `screen` too when it is one */
const on = (screens: string[]): Pick<StyleDifference, "screen" | "screens"> => ({ ...(screens.length === 1 ? { screen: screens[0] } : {}), screens });

/** What of the style a document wears an app does not draw: the recipes its kit has no build for, the screen's
 *  backdrop, and, for a style of the document's own, the CSS it extends and each of its rules, with what the rule
 *  relies on, the screens it reaches and where it can be said instead. Nothing for the web, which wears it all. */
export function styleDifferences(o: { theme: Styled; styles: StyleContext; docStyles?: readonly CustomStyle[]; screens: readonly StyleScreen[] }, app: "mobile" | "miniapp"): StyleDifference[] {
  const pack = styleOf(o.theme.style, o.styles);
  const out: StyleDifference[] = [];
  const all = o.screens.map((s) => s.name);
  const where = app === "mobile" ? "on a phone" : "in a mini-program";
  const code = app === "mobile" ? "apps/mobile/src/custom/" : "apps/miniapp/src/custom/";
  /* the recipes the kit builds no other way: the style's, or those the author picked on a document free of one */
  const recipes = recipesOf(o.theme, o.styles);
  for (const k of RECIPE_KEYS) {
    const v = recipes[k];
    if (v === "m3" || KIT_RECIPES[app].includes(k)) continue;
    /* the screen's texture has no rule: it is laid behind every screen */
    const css = k === "screen" ? "" : ((RECIPE_CSS as Record<string, Record<string, string>>)[k]?.[v] ?? "");
    const screens = screensReached(css, o.screens);
    /* a recipe for a kind of part no screen has makes no screen look otherwise */
    if (!screens.length) continue;
    out.push({ kind: "style", ...on(screens), detail: `recipe ${k}: ${v} is drawn on the web only; ${where} the kit builds ${k} as Material does (${plural(screens)})` });
  }
  if (!pack) return out;
  /* what lies behind a screen */
  if (!o.theme.ownColors && (pack.screen || pack.screenDark)) out.push({ kind: "style", ...on(all), detail: `the style's screen backdrop (${pack.screen ?? pack.screenDark}) is drawn on the web only; ${where} each screen shows its color (${plural(all)})` });
  if (!isCustomKey(o.theme.style)) return out;
  const own = o.docStyles?.find((s) => s.key === o.theme.style);
  if (!own) return out;
  /* the CSS of the built-in style it extends: a phone draws a built-in style's own only under its own key */
  const base = builtInStyleOf(own.extends);
  if (base?.css) {
    const screens = screensReached(base.css, o.screens);
    out.push({ kind: "style", ...on(screens), detail: `the CSS of ${base.key}, which ${own.key} extends, is drawn on the web only; ${where} the kit draws ${base.key}'s recipes, not what its CSS adds (${plural(screens)}). Instead: set what matters in tokens, type, shape or recipes, or draw it in ${code}` });
  }
  /* each of its own rules */
  own.rules.forEach((rule, i) => {
    const traits = ruleTraits(rule);
    const screens = screensReached(rule.selector, o.screens);
    const why = [app === "mobile" ? "React Native has no stylesheet: no selector reaches a part" : "the mini-program's parts carry no data-slot, and WXSS selects by class", ...traits.map((t) => TRAIT_WORDS[t][app])];
    const said = `${rule.selector} { ${Object.keys(rule.declarations).join(", ")} }`;
    out.push({ kind: "style", ...on(screens), detail: `rule ${i + 1} of ${own.key}, ${said}, is drawn on the web only${traits.length ? ` (it uses: ${traits.join(", ")})` : ""}: ${why.join("; ")} (${plural(screens)}). Instead: ${ruleInstead(rule).join(", ")}; or draw it in ${code}` });
  });
  return out;
}
