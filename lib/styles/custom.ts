import { onColorFor, schemeFromSeed } from "../color";
import { FONTS, ICON_FAMILIES, SHAPES, type FontKey, type IconFamily, type MotionScheme, type ShapeScale } from "../tokens";
import { accessWords, checkAccess, type AccessInput, type ContrastCheck } from "./access";
import { checkRule, checkValue, rulesCss, rulesFromCss, LIMITS, type CssRule, type Reason } from "./css";
import { PACKS } from "./packs";
import { RECIPES, RECIPE_KEYS, type RecipeKey, type Recipes } from "./recipes";
import { DEFAULT_UX, type StyleGroup, type StylePack, type StyleRoles, type StyleText, type StyleToken, type StyleUX, type Step, type TypeRamp } from "./types";
import { fields, withUnknown } from "../keep";

/* A custom style: a style as plain data, carried by the document that wears it (`Doc.styles`), so a person or a model can
 * make one, and it travels with the file, a link and an export. It holds what a pack holds (types.ts `StylePack`),
 * with its CSS written as rules (css.ts) instead of a string, and it may extend a built-in pack: then it takes that
 * pack's CSS as its base, and every field it leaves out from that pack. Duplicating a pack is extending it.
 *
 * What comes in is never trusted: `validateCustomStyle` makes a complete, safe style of whatever it is given, or says
 * it cannot, and lists what it changed and what it would have the author look at, in Chinese and English, so the
 * editor and a model can fix it. `compileCustomStyle` turns a style into the pack the rest of the system reads; the
 * document's styles are found by key through book.ts. */

export type { CssRule } from "./css";

/** every custom style's key starts with this, so it can never be taken for a built-in one */
export const CUSTOM_PREFIX = "custom:";
export const isCustomKey = (key: string | undefined): key is string => !!key && key.startsWith(CUSTOM_PREFIX);

/** What a custom style holds: a pack's fields, and its CSS as rules. A field left out is the base pack's; one the style
 *  takes away from what its base has is written as null, so that it stays away. */
export type CustomStyle = Omit<StylePack, "css" | "display" | "screen" | "screenDark" | "type" | "tokens" | "loud"> & {
  display?: FontKey | null;
  screen?: string | null;
  screenDark?: string | null;
  type?: TypeRamp | null;
  tokens?: Partial<Record<StyleToken, string>> | null;
  loud?: (keyof StyleRoles)[] | null;
  /** a built-in pack whose CSS this style starts from, and whose fields it takes where it says nothing */
  extends?: string;
  /** what no recipe says, as data: written after the recipes and after the pack it extends */
  rules: CssRule[];
};

/** a style as a file: `.m3e-style.json` */
export const STYLE_FORMAT = "m3e-style";
export const STYLE_VERSION = 1;
export type StyleFile = { format: typeof STYLE_FORMAT; version: number; style: CustomStyle };

/** what validation had to say about a style: where, what kind, what it did about it, and in words */
export type StyleProblem = {
  /** where in the style: "light.onPrimary", "recipes.tabs", "rules[3].background" */
  path: string;
  code: "style" | "key" | "extends" | "text" | "color" | "role" | "contrast" | "font" | "icons" | "value" | "recipe" | "token" | "screen" | "ux" | "type" | "rule" | "duplicate";
  /** "dropped": left out; "replaced": put right with another value; "kept": left as written, for the author to look at */
  fix: "dropped" | "replaced" | "kept";
  zh: string;
  en: string;
  /** for colors that read too faintly: the accessibility check they fail (access.ts), its state and its background */
  check?: ContrastCheck;
};

/** the color roles a style has to name, in the order the editor shows them */
export const ROLE_KEYS = [
  "primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "inversePrimary",
  "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer",
  "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer",
  "surface", "surfaceContainerLow", "surfaceContainer", "surfaceContainerHigh", "surfaceContainerHighest",
  "onSurface", "onSurfaceVariant", "outline", "outlineVariant", "inverseSurface", "inverseOnSurface",
] as const satisfies readonly (keyof StyleRoles)[];
/** the ones it may name, and otherwise takes Material's */
export const OPTIONAL_ROLE_KEYS = ["error", "onError", "errorContainer", "onErrorContainer"] as const satisfies readonly (keyof StyleRoles)[];

/** The pairs of roles a screen reads its words from, background first: the pairs the style editor shows side by side.
 *  What each has to reach, in which state and at which size, is the accessibility check's (access.ts `checkAccess`). */
export const READS: [keyof StyleRoles, keyof StyleRoles][] = [
  ["primary", "onPrimary"],
  ["primaryContainer", "onPrimaryContainer"],
  ["secondary", "onSecondary"],
  ["secondaryContainer", "onSecondaryContainer"],
  ["tertiary", "onTertiary"],
  ["tertiaryContainer", "onTertiaryContainer"],
  ["surface", "onSurface"],
  ["surface", "onSurfaceVariant"],
  ["surfaceContainerLow", "onSurface"],
  ["surfaceContainer", "onSurface"],
  ["surfaceContainerHigh", "onSurface"],
  ["surfaceContainerHighest", "onSurface"],
  ["surfaceContainerHighest", "onSurfaceVariant"],
  ["inverseSurface", "inverseOnSurface"],
];

export const TOKEN_KEYS: StyleToken[] = ["rim", "rimDark", "stroke", "toggleOn", "navOn", "navBg", "navActive", "barBg", "onBar", "tabOn", "primaryText", "primaryTextDark", "tonedLine"];
const GROUPS: StyleGroup[] = ["app", "desktop", "mobileGame", "pcGame"];
const BASES: StylePack["basis"][] = ["official", "sampled", "observed", "memory"];
const CONTROLS: StylePack["control"][] = ["pill", "extra-small", "small", "medium", "large"];
const MOTIONS: MotionScheme[] = ["standard", "expressive"];
const NAVS: StyleUX["nav"][] = ["keep", "bottom", "rail", "top"];
const PLACES: StyleUX["place"][] = ["top", "center", "bottom", "spread"];
const TYPE_ROLE = /^(display|headline|title|body|label)-(large|medium|small)$/;

/* ---------- colors and contrast ---------- */

/** a color as a style stores it: #RRGGBB, or nothing when it is not one */
export function hexOf(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return undefined;
}

/** a token's color: #hex (with alpha), or a role's variable */
const tokenColorOf = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s;
  if (/^var\(--md-sys-color-[a-z-]+\)$/.test(s)) return s;
  return undefined;
};

/** What lies behind a screen: a #hex color (as a gradient of one color, since it is drawn as an image), or gradients
 *  of safe colors. Nothing that loads a picture. */
function screenOf(v: unknown): string | undefined {
  const hex = hexOf(v);
  if (hex) return `linear-gradient(${hex}, ${hex})`;
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s || checkValue("background-image", s)) return undefined;
  /* only gradients, one after another */
  let depth = 0;
  let top = "";
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0) top += c;
  }
  const names = top.split(",").map((x) => x.trim());
  if (!names.every((n) => /^(repeating-)?(linear|radial|conic)-gradient$/.test(n))) return undefined;
  return s;
}

/* ---------- the parts of a style, each read with what its base and Material say ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const LANGS = ["zh", "en", "ja", "ko"] as const;
const clip = (s: string, n: number) => s.trim().slice(0, n);

/** words in four languages, from words in any of them, or one string for all; nothing when none is given at all */
function textOf(v: unknown, n = 200): StyleText | undefined {
  if (typeof v === "string") {
    const s = clip(v, n);
    return { zh: s, en: s, ja: s, ko: s };
  }
  if (!isRecord(v)) return undefined;
  const given = Object.fromEntries(LANGS.flatMap((l) => (typeof v[l] === "string" ? [[l, clip(v[l] as string, n)]] : []))) as Partial<StyleText>;
  if (!Object.keys(given).length) return undefined;
  const any = given.en || given.zh || given.ja || given.ko || "";
  return { zh: given.zh || any, en: given.en || any, ja: given.ja || given.en || any, ko: given.ko || given.en || any };
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => (list as readonly unknown[]).includes(v) ? (v as T) : undefined;
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

function stepOf(v: unknown): Step | undefined {
  if (!Array.isArray(v) || v.length < 2) return undefined;
  const size = num(v[0], 6, 120);
  const line = num(v[1], 6, 160);
  if (size === undefined || line === undefined) return undefined;
  const weight = v[2] === undefined ? undefined : num(v[2], 100, 900);
  const track = v[3] === undefined ? undefined : num(v[3], -5, 20);
  return track !== undefined ? [size, line, weight ?? 400, track] : weight !== undefined ? [size, line, weight] : [size, line];
}

/** a key for a new custom style: its name, made a word, and a few letters so it does not meet another */
export function newStyleKey(name: string, taken: readonly string[] = []): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "style";
  for (;;) {
    const key = `${CUSTOM_PREFIX}${slug}-${Math.random().toString(36).slice(2, 6)}`;
    if (!taken.includes(key)) return key;
  }
}

const builtIn = (key: unknown) => (typeof key === "string" ? PACKS.find((p) => p.key === key) : undefined);

/** Material's roles at a seed, for a style that names no base and leaves some out */
function seedRoles(seed: string, dark: boolean): StyleRoles {
  const s = schemeFromSeed(seed, "", { dark });
  const tertiary = s.onTertiaryContainer;
  return {
    primary: s.primary,
    onPrimary: s.onPrimary,
    primaryContainer: s.primaryContainer,
    onPrimaryContainer: s.onPrimaryContainer,
    inversePrimary: s.inversePrimary,
    secondary: s.secondary,
    onSecondary: onColorFor(s.secondary),
    secondaryContainer: s.secondaryContainer,
    onSecondaryContainer: s.onSecondaryContainer,
    tertiary,
    onTertiary: onColorFor(tertiary),
    tertiaryContainer: s.tertiaryContainer,
    onTertiaryContainer: s.onTertiaryContainer,
    surface: s.surface,
    surfaceContainerLow: s.surfaceContainerLow,
    surfaceContainer: s.surfaceContainer,
    surfaceContainerHigh: s.surfaceContainerHigh,
    surfaceContainerHighest: s.surfaceContainerHighest,
    onSurface: s.onSurface,
    onSurfaceVariant: s.onSurfaceVariant,
    outline: s.outline,
    outlineVariant: s.outlineVariant,
    inverseSurface: s.inverseSurface,
    inverseOnSurface: s.inverseOnSurface,
  };
}

/** the two schemes of a style, generated from one color: what the editor offers to start a palette from an accent */
export const rolesFromSeed = (seed: string) => ({ light: seedRoles(seed, false), dark: seedRoles(seed, true) });

/* ---------- validation ---------- */

export type Validated = { style: CustomStyle | null; problems: StyleProblem[] };

/** Makes a complete, safe custom style of what it is given, and says what it changed and what it would have looked at.
 *  `style` is null only when there is nothing to make one of. It is idempotent: a style it returns comes back the same. */
export function validateCustomStyle(input: unknown): Validated {
  const problems: StyleProblem[] = [];
  const say = (path: string, code: StyleProblem["code"], fix: StyleProblem["fix"], zh: string, en: string) => problems.push({ path, code, fix, zh, en });
  const sayWhy = (path: string, code: StyleProblem["code"], fix: StyleProblem["fix"], r: Reason) => say(path, code, fix, r.zh, r.en);

  let raw = input;
  if (isRecord(raw) && raw.format === STYLE_FORMAT) raw = raw.style;
  if (!isRecord(raw)) {
    say("", "style", "dropped", "这不是一个风格：风格要写成一个对象", "this is not a style: a style is an object");
    return { style: null, problems };
  }
  const v = raw;
  if (v.key === undefined && v.name === undefined && v.extends === undefined) {
    say("", "style", "dropped", "这不是一个风格：没有 key、name 或 extends", "this is not a style: it has no key, name or extends");
    return { style: null, problems };
  }

  /* the base first: every field left out comes from it */
  let base: StylePack | undefined;
  if (v.extends !== undefined && v.extends !== "") {
    base = builtIn(v.extends);
    if (!base) say("extends", "extends", "dropped", `没有叫 ${String(v.extends)} 的内置风格，不继承`, `there is no built-in style called ${String(v.extends)} to extend`);
  }

  /* the key: namespaced, one word */
  const id = typeof v.key === "string" ? v.key.trim().replace(new RegExp(`^${CUSTOM_PREFIX}`), "") : "";
  let key: string;
  if (/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)) {
    key = `${CUSTOM_PREFIX}${id}`;
    if (key !== v.key) say("key", "key", "replaced", `键名要以 ${CUSTOM_PREFIX} 开头：改成 ${key}`, `a key starts with ${CUSTOM_PREFIX}: made it ${key}`);
  } else {
    key = newStyleKey(textOf(v.name)?.en ?? base?.key ?? "style");
    say("key", "key", "replaced", `键名只能用小写字母、数字、- 和 _：改成 ${key}`, `a key is lowercase letters, digits, - and _: made it ${key}`);
  }

  const named = textOf(v.name, 60);
  const name = named?.en ? named : base ? base.name : undefined;
  if (!name) say("name", "text", "replaced", "风格没有名字，用键名代替", "the style has no name: its key stands in");
  const hint = textOf(v.hint) ?? base?.hint ?? { zh: "", en: "", ja: "", ko: "" };
  const layout = textOf(v.layout, 600) ?? base?.layout ?? { zh: "", en: "", ja: "", ko: "" };

  const refs = Array.isArray(v.refs) ? v.refs.filter((r): r is string => typeof r === "string" && !!r.trim()).map((r) => clip(r, 60)).slice(0, 8) : (base?.refs ?? []);
  const pick = <T extends string>(field: string, list: readonly T[], fallback: T): T => {
    const got = oneOf(list, v[field]);
    if (v[field] !== undefined && got === undefined) say(field, "value", "replaced", `${field} 不能是 ${JSON.stringify(v[field])}，只能是 ${list.join("、")}`, `${field} cannot be ${JSON.stringify(v[field])}: it is one of ${list.join(", ")}`);
    return got ?? fallback;
  };
  const basis = pick("basis", BASES, base?.basis ?? "observed");
  const group = pick("group", GROUPS, base?.group ?? "app");
  const mode = pick("mode", ["light", "dark"] as const, base?.mode ?? "light");
  const shape = pick("shape", SHAPES.map((s) => s.key) as ShapeScale[], base?.shape ?? "rounded");
  const motion = pick("motion", MOTIONS, base?.motion ?? "standard");
  const control = pick("control", CONTROLS, base?.control ?? "pill");
  const pill = pick("pill", ["round", "follow"] as const, base?.pill ?? "round");

  /* faces and icons: only those the app has */
  const fontKeys = FONTS.map((f) => f.key);
  const face = (field: "font" | "display"): FontKey | undefined => {
    const got = oneOf(fontKeys, v[field]);
    if (v[field] !== undefined && v[field] !== null && v[field] !== "" && got === undefined) say(field, "font", "replaced", `没有字体 ${String(v[field])}；可用：${fontKeys.join("、")}`, `there is no face ${String(v[field])}; there are ${fontKeys.join(", ")}`);
    return got;
  };
  const font = face("font") ?? base?.font ?? "roboto";
  /* no face of its own for headings: null, where the base has one, so that it stays so */
  const display = v.display === null || v.display === "" ? (base?.display ? null : undefined) : (face("display") ?? (v.display === undefined ? base?.display : undefined));
  const icons = oneOf(ICON_FAMILIES, v.icons) ?? base?.icons ?? "rounded";
  if (v.icons !== undefined && !oneOf(ICON_FAMILIES, v.icons)) say("icons", "icons", "replaced", `没有图标家族 ${String(v.icons)}；可用：${ICON_FAMILIES.join("、")}`, `there is no icon family ${String(v.icons)}; there are ${ICON_FAMILIES.join(", ")}`);

  /* the seed, then the roles in each mode: what is given, else the base's, else Material's at the seed */
  const givenSeed = hexOf(v.seed);
  if (v.seed !== undefined && !givenSeed) say("seed", "color", "replaced", `种子色 ${String(v.seed)} 不是 #RRGGBB`, `the seed ${String(v.seed)} is not #RRGGBB`);
  const lightIn = isRecord(v.light) ? v.light : {};
  const seed = givenSeed ?? hexOf(lightIn.primary) ?? base?.seed ?? "#6750A4";
  const scheme = (m: "light" | "dark"): StyleRoles => {
    const given = isRecord(v[m]) ? (v[m] as Record<string, unknown>) : {};
    if (v[m] !== undefined && !isRecord(v[m])) say(m, "color", "replaced", `${m} 要写成一组颜色角色`, `${m} is a set of color roles`);
    const from = base?.[m];
    let generated: StyleRoles | undefined;
    const missing: string[] = [];
    const out = {} as StyleRoles;
    for (const k of ROLE_KEYS) {
      const hex = hexOf(given[k]);
      if (given[k] !== undefined && !hex) say(`${m}.${k}`, "color", "replaced", `${m}.${k} 的 ${String(given[k])} 不是 #RRGGBB`, `${m}.${k}: ${String(given[k])} is not #RRGGBB`);
      if (hex) out[k] = hex;
      else if (from) out[k] = from[k];
      else {
        generated ??= seedRoles(seed, m === "dark");
        out[k] = generated[k];
        missing.push(k);
      }
    }
    for (const k of OPTIONAL_ROLE_KEYS) {
      const hex = hexOf(given[k]) ?? (from?.[k] ? hexOf(from[k]) : undefined);
      if (hex) out[k] = hex;
    }
    if (missing.length) say(m, "role", "replaced", `${m} 缺少 ${missing.length} 个颜色角色（${missing.join("、")}），按种子色生成`, `${m} leaves out ${missing.length} roles (${missing.join(", ")}): generated from the seed`);
    return out;
  };
  const light = scheme("light");
  const dark = scheme("dark");

  const roleSet = new Set<string>([...ROLE_KEYS, ...OPTIONAL_ROLE_KEYS]);
  const loud = Array.isArray(v.loud) ? v.loud.filter((k): k is keyof StyleRoles => typeof k === "string" && roleSet.has(k)) : v.loud === null ? undefined : base?.loud;
  if (Array.isArray(v.loud) && loud && loud.length !== v.loud.length) say("loud", "role", "dropped", "loud 里有不是颜色角色的名字，已去掉", "loud names something that is not a role: left out");

  /* the colors of controls no role names: the base's, unless the style names its own (all of them) */
  let tokens: Partial<Record<StyleToken, string>> | undefined = v.tokens === undefined && base?.tokens ? { ...base.tokens } : undefined;
  if (v.tokens !== undefined && v.tokens !== null) {
    if (!isRecord(v.tokens)) say("tokens", "token", "dropped", "tokens 要写成一个对象", "tokens is an object");
    else
      for (const [k, val] of Object.entries(v.tokens)) {
        if (!TOKEN_KEYS.includes(k as StyleToken)) {
          say(`tokens.${k}`, "token", "dropped", `没有叫 ${k} 的控件颜色；可用：${TOKEN_KEYS.join("、")}`, `there is no token ${k}; there are ${TOKEN_KEYS.join(", ")}`);
          continue;
        }
        if (val === null || val === "") continue;
        const c = tokenColorOf(val);
        if (!c) say(`tokens.${k}`, "token", "dropped", `tokens.${k} 只能是 #hex 或 var(--md-sys-color-…)`, `tokens.${k} is #hex or var(--md-sys-color-…)`);
        else (tokens ??= {})[k as StyleToken] = c;
      }
  }

  /* recipes: only variants the catalog has; what is left out is the base's, else Material's */
  const recipes: Partial<Recipes> = { ...base?.recipes };
  if (v.recipes !== undefined) {
    if (!isRecord(v.recipes)) say("recipes", "recipe", "dropped", "recipes 要写成一个对象", "recipes is an object");
    else
      for (const [k, val] of Object.entries(v.recipes)) {
        if (!(RECIPE_KEYS as string[]).includes(k)) {
          say(`recipes.${k}`, "recipe", "dropped", `没有叫 ${k} 的配方类别`, `there is no kind of recipe called ${k}`);
          continue;
        }
        const list = RECIPES[k as RecipeKey] as readonly string[];
        if (!list.includes(val as string)) {
          say(`recipes.${k}`, "recipe", "dropped", `${k} 没有 ${String(val)} 这个变体；可用：${list.join("、")}`, `${k} has no variant ${String(val)}; there are ${list.join(", ")}`);
          continue;
        }
        (recipes as Record<string, string>)[k] = val as string;
      }
  }

  /* spacing and navigation */
  const ux: StyleUX = { ...DEFAULT_UX, ...base?.ux };
  if (v.ux !== undefined) {
    if (!isRecord(v.ux)) say("ux", "ux", "dropped", "ux 要写成一个对象", "ux is an object");
    else {
      for (const k of ["margin", "gap", "tight"] as const) {
        if (v.ux[k] === undefined) continue;
        const n = num(v.ux[k], 0, 64);
        if (n === undefined) say(`ux.${k}`, "ux", "dropped", `ux.${k} 要是 0 到 64 的数`, `ux.${k} is a number from 0 to 64`);
        else {
          if (n !== v.ux[k]) say(`ux.${k}`, "ux", "replaced", `ux.${k} 限制在 0 到 64`, `ux.${k} is held between 0 and 64`);
          ux[k] = n;
        }
      }
      const nav = oneOf(NAVS, v.ux.nav);
      if (v.ux.nav !== undefined && !nav) say("ux.nav", "ux", "dropped", `ux.nav 只能是 ${NAVS.join("、")}`, `ux.nav is one of ${NAVS.join(", ")}`);
      if (nav) ux.nav = nav;
      const place = oneOf(PLACES, v.ux.place);
      if (v.ux.place !== undefined && !place) say("ux.place", "ux", "dropped", `ux.place 只能是 ${PLACES.join("、")}`, `ux.place is one of ${PLACES.join(", ")}`);
      if (place) ux.place = place;
      if (v.ux.bleed !== undefined) ux.bleed = Array.isArray(v.ux.bleed) ? [...new Set(v.ux.bleed.filter((b): b is "video" | "image" => b === "video" || b === "image"))] : [];
    }
  }

  /* the type ramp, by M3 type role */
  let type: TypeRamp | undefined = v.type !== null && base?.type ? { ...base.type } : undefined;
  if (v.type !== undefined && v.type !== null) {
    if (!isRecord(v.type)) say("type", "type", "dropped", "type 要写成 { 字号角色: [字号, 行高, 字重, 字距] }", "type is { role: [size, line, weight, tracking] }");
    else
      for (const [k, s] of Object.entries(v.type)) {
        const step = stepOf(s);
        if (!TYPE_ROLE.test(k) || !step) say(`type.${k}`, "type", "dropped", `type.${k} 不是一个字号角色和 [字号, 行高, 字重, 字距]`, `type.${k} is not a type role with [size, line, weight, tracking]`);
        else (type ??= {})[k] = step;
      }
  }

  /* what lies behind a screen */
  const backdrop = (field: "screen" | "screenDark") => {
    if (v[field] === undefined) return base?.[field];
    if (v[field] === null || v[field] === "") return undefined;
    const s = screenOf(v[field]);
    if (!s) say(field, "screen", "dropped", `${field} 只能是 #hex 或渐变（linear/radial/conic-gradient），不能取图片`, `${field} is a #hex or gradients (linear/radial/conic-gradient), never a picture`);
    return s ?? base?.[field];
  };
  const screen = backdrop("screen");
  const screenDark = backdrop("screenDark");

  const flag = (field: "compact" | "capsLabels" | "italicDisplay") => (typeof v[field] === "boolean" ? (v[field] as boolean) : base?.[field]);
  const edge = num(v.edge, 0, 8) ?? base?.edge;
  const art = typeof v.art === "string" ? clip(v.art, 500) : (base?.art ?? "");

  /* the rules: each one checked, what does not fit left out with the reason */
  const rules: CssRule[] = [];
  if (v.rules !== undefined) {
    if (!Array.isArray(v.rules)) say("rules", "rule", "dropped", "rules 要写成 [{ selector, declarations }]", "rules is a list of { selector, declarations }");
    else {
      if (v.rules.length > LIMITS.rules) say("rules", "rule", "dropped", `最多 ${LIMITS.rules} 条规则，后面的去掉`, `at most ${LIMITS.rules} rules: the rest are left out`);
      v.rules.slice(0, LIMITS.rules).forEach((r, i) => {
        const { rule, dropped } = checkRule(r);
        for (const d of dropped) sayWhy(d.what === "selector" || d.what === "rule" ? `rules[${i}]` : `rules[${i}].${d.what}`, "rule", "dropped", { zh: `规则 ${i + 1}${d.what === "selector" || d.what === "rule" ? "" : ` 的 ${d.what}`} 去掉了：${d.reason.zh}`, en: `rule ${i + 1}${d.what === "selector" || d.what === "rule" ? "" : `, ${d.what},`} left out: ${d.reason.en}` });
        if (rule) rules.push(rule);
      });
    }
  }

  const style: CustomStyle = {
    key,
    name: name ?? { zh: id || key, en: id || key, ja: id || key, ko: id || key },
    hint,
    refs,
    basis,
    group,
    ...(base ? { extends: base.key } : {}),
    seed,
    light,
    dark,
    mode,
    shape,
    font,
    ...(display ? { display } : {}),
    icons: icons as IconFamily,
    motion,
    recipes,
    control,
    pill,
    ...(flag("compact") !== undefined ? { compact: flag("compact") } : {}),
    ...(edge !== undefined ? { edge } : {}),
    /* what the base has and this style takes away is written as null, so that it stays away */
    ...(screen ? { screen } : base?.screen ? { screen: null } : {}),
    ...(screenDark ? { screenDark } : base?.screenDark ? { screenDark: null } : {}),
    ...(flag("capsLabels") !== undefined ? { capsLabels: flag("capsLabels") } : {}),
    ...(flag("italicDisplay") !== undefined ? { italicDisplay: flag("italicDisplay") } : {}),
    ...(loud ? { loud: [...loud] } : base?.loud ? { loud: null } : {}),
    ...(tokens && Object.keys(tokens).length ? { tokens } : base?.tokens ? { tokens: null } : {}),
    art,
    ux,
    layout,
    ...(type ? { type } : base?.type ? { type: null } : {}),
    rules,
  };
  problems.push(...contrastProblems(style));
  return { style, problems };
}

/** What a style's colors would make hard to read: every accessibility check it fails (access.ts), as a problem to look
 *  at. The style stays as written ("kept"): whether a style can be imported never depends on it. A pair the style calls
 *  `loud` is listed like any other, and says it was kept on purpose. */
export function contrastProblems(s: AccessInput): StyleProblem[] {
  return checkAccess(s).issues.map((c) => ({ path: c.path, code: "contrast", fix: "kept", ...accessWords(c), check: c }));
}

/* ---------- compiling ---------- */

/** The pack a custom style comes to, which everything that reads a style takes as it takes a built-in one: its data,
 *  and as its CSS the pack it extends followed by its own rules. It is validated first, so whatever it is given, the
 *  CSS it writes is CSS a custom style may write. */
export function compileCustomStyle(input: CustomStyle | unknown): StylePack | null {
  const { style } = validateCustomStyle(input);
  return style ? packOf(style) : null;
}

/** a style already validated, as a pack */
function packOf(style: CustomStyle): StylePack {
  const { extends: from, rules, display, screen, screenDark, type, tokens, loud, ...data } = style;
  const css = [builtIn(from)?.css ?? "", rulesCss(rules)].filter(Boolean).join("\n");
  return {
    ...data,
    ...(display ? { display } : {}),
    ...(screen ? { screen } : {}),
    ...(screenDark ? { screenDark } : {}),
    ...(type ? { type } : {}),
    ...(tokens ? { tokens } : {}),
    ...(loud?.length ? { loud } : {}),
    ...(css ? { css } : {}),
  };
}

/* ---------- making one ---------- */

/** A built-in pack as a custom style, losing none of its data. Its CSS becomes rules when all of it fits what a custom
 *  style may write; otherwise the style extends the pack and takes its CSS from it, which is also how a later version
 *  of the pack reaches it. */
export function fromPack(pack: StylePack, opts: { key?: string; name?: StyleText } = {}): CustomStyle {
  const converted = pack.css ? rulesFromCss(pack.css) : { rules: [], rejected: [] };
  const inline = !converted.rejected.length;
  const { css: _css, key: _key, ...data } = pack;
  return {
    ...structuredCloneOf(data),
    key: opts.key ?? `${CUSTOM_PREFIX}${pack.key}`,
    ...(opts.name ? { name: opts.name } : {}),
    ...(inline ? {} : { extends: pack.key }),
    rules: inline ? converted.rules : [],
  };
}

const structuredCloneOf = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const COPY: StyleText = { zh: "副本", en: "copy", ja: "コピー", ko: "사본" };
/** a pack, or another custom style, as a new custom style of the document's own: a key of its own, named as a copy */
export function copyOfStyle(source: StylePack | CustomStyle, taken: readonly string[] = []): CustomStyle {
  const name = Object.fromEntries(LANGS.map((l) => [l, `${source.name[l]} ${COPY[l]}`])) as StyleText;
  const key = newStyleKey(source.name.en, taken);
  if ("rules" in source) return { ...structuredCloneOf(source), key, name };
  return fromPack(source, { key, name });
}

/* ---------- files and documents ---------- */

/** a style as the file it is exported to */
export const styleFile = (style: CustomStyle): StyleFile => ({ format: STYLE_FORMAT, version: STYLE_VERSION, style });
/** the file name a style is exported under */
export const styleFileName = (style: CustomStyle) => `${(style.name.en || style.key).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "style"}.m3e-style.json`;

/** A style file read back: the style it carries, validated, or null with the reason. A bare style is read as well. */
export function readStyleFile(text: string): Validated {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { style: null, problems: [{ path: "", code: "style", fix: "dropped", zh: "这个文件不是 JSON", en: "the file is not JSON" }] };
  }
  if (isRecord(json) && json.format !== undefined && json.format !== STYLE_FORMAT) return { style: null, problems: [{ path: "format", code: "style", fix: "dropped", zh: "这不是风格文件（.m3e-style.json）", en: "this is not a style file (.m3e-style.json)" }] };
  if (isRecord(json) && typeof json.version === "number" && json.version > STYLE_VERSION) return { style: null, problems: [{ path: "version", code: "style", fix: "dropped", zh: "这个风格文件来自更新的版本", en: "this style file is from a newer version" }] };
  return validateCustomStyle(json);
}

/** the fields a style of a document's own has (`CustomStyle`) */
const STYLE_FIELDS = fields("key", "name", "hint", "refs", "basis", "group", "extends", "seed", "light", "dark", "mode", "shape", "font", "display", "icons", "motion", "recipes", "control", "pill", "compact", "edge", "screen", "screenDark", "capsLabels", "italicDisplay", "loud", "tokens", "art", "ux", "layout", "type", "rules", "css", "format", "version", "style");

/** A document's styles as it may keep them: each one validated, what is no style left out, one style to a key.
 *  Undefined when none is left. */
export function cleanStyles(list: unknown): CustomStyle[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: CustomStyle[] = [];
  for (const item of list) {
    const { style } = validateCustomStyle(item);
    /* a field a style does not have (a newer version's) is kept with it, as it came; nothing compiles it */
    if (style && !out.some((s) => s.key === style.key)) out.push(withUnknown(isRecord(item) && item.format === STYLE_FORMAT ? item.style : item, style, STYLE_FIELDS));
  }
  return out.length ? out : undefined;
}

/** Puts a style into a list, in place of one with its key: what importing a style or a model's styles does */
export function withStyle(list: readonly CustomStyle[] | undefined, style: CustomStyle): CustomStyle[] {
  const at = (list ?? []).findIndex((s) => s.key === style.key);
  if (at < 0) return [...(list ?? []), style];
  return (list ?? []).map((s, i) => (i === at ? style : s));
}
