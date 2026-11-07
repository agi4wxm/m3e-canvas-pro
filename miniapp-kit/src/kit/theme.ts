import Taro from "@tarojs/taro";
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { MATERIAL } from "./theme.generated";

/* What a theme is to the kit, and how a part reads it. The colors are CSS variables: the theme's stylesheet
 * (src/generated/theme.css in an exported app, written by the editor) defines every M3 role on `.m3e-theme` as
 * `--md-sys-color-<role>` and `--md-sys-color-<role>-rgb`, and again under `.m3e-theme.m3e-dark`, so a part's style
 * says `var(--md-sys-color-primary)` and the stylesheet decides. Words, corners and recipes are plain numbers here. The
 * same colors come resolved too (`light`, `dark`), for what a stylesheet cannot reach: an icon is a picture (an SVG
 * data URL in an <Image>), and a picture is painted with a color, not a variable. */

/** one step of a type ramp: size and line height in px, weight, letter spacing in px */
export type TypeStep = { size: number; line: number; weight: number; track: number };

export type TypeRole =
  | "display-large"
  | "display-medium"
  | "display-small"
  | "headline-large"
  | "headline-medium"
  | "headline-small"
  | "title-large"
  | "title-medium"
  | "title-small"
  | "body-large"
  | "body-medium"
  | "body-small"
  | "label-large"
  | "label-medium"
  | "label-small";

/** one mode: every M3 color role by its kebab-case name, and the style's own colors (`st`) */
export type ThemeMode = { colors: Record<string, string>; st: Record<string, string> };

export type KitTheme = {
  /** the style's key, or "material" */
  key: string;
  group: string;
  mode: "light" | "dark";
  light: ThemeMode;
  dark: ThemeMode;
  type: Record<string, TypeStep>;
  /** the corner scale and M3's steps at it: xs, sm, md, lg, lgi, xl, xli, xxl */
  shape: { scale: number; corners: Record<string, number> };
  /** a button's or a chip's corner: 999 keeps the round ends; `follow` turns every round corner into it */
  control: { radius: number; follow: boolean };
  font: { web: string; webDisplay?: string; google: string[] };
  icons: string;
  /** the recipe each kind of control is built with (lib/styles/recipes): "m3" is Material's own */
  recipes: Record<string, string>;
  edge: number;
  compact: boolean;
  capsLabels: boolean;
  italicDisplay: boolean;
  ux: { margin: number; gap: number; tight: number };
  /** what a style's own CSS says that no recipe does: a color is a role, a role with an opacity (`outline/20`) or a hex */
  extras: Record<string, string | number>;
  /** the class its stylesheet's variables are under: "m3e-theme" unless one app shows several themes (the gallery) */
  scope?: string;
};

export type Kit = {
  theme: KitTheme;
  dark: boolean;
  /** what an icon is painted with, for a role (or a role with an opacity, or a hex): the mode's resolved color, with
   *  what a painted surface above has made of the words' roles */
  paint: (ref: string) => string;
};

/** the roles words read in under a painted surface, resolved (see `Ink`) */
const InkContext = createContext<Record<string, string> | null>(null);
const KitContext = createContext<{ theme: KitTheme; dark: boolean }>({ theme: MATERIAL, dark: false });

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** a hex color with an opacity laid over it */
export function hexAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color);
  if (!m) return color;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((x) => x + x).join("");
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `#${h.slice(0, 6)}${hex2(a * alpha * 255)}`.toUpperCase();
}

/** A color reference resolved against a mode: a role, a role with an opacity (`primary/40`) or a hex. */
export function resolveRef(colors: Record<string, string>, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith("#")) return /^#[0-9a-f]{3,8}$/i.test(ref) ? ref : undefined;
  const [role, alpha] = ref.split("/");
  const c = colors[role];
  if (!c) return undefined;
  return alpha === undefined ? c : hexAlpha(c, Number(alpha) / 100);
}

/** whether the device shows things dark: the system's setting where the platform tells it */
function systemDark(): boolean {
  if (process.env.TARO_ENV === "h5") return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  try {
    return (Taro.getSystemInfoSync() as { theme?: string }).theme === "dark";
  } catch {
    return false;
  }
}

/** the system's light or dark, kept up to date where the platform says when it changes */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(systemDark);
  useEffect(() => {
    if (process.env.TARO_ENV === "h5") {
      const q = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;
      const on = () => setDark(!!q?.matches);
      q?.addEventListener?.("change", on);
      return () => q?.removeEventListener?.("change", on);
    }
    const on = (r: { theme?: string }) => setDark(r.theme === "dark");
    try {
      Taro.onThemeChange?.(on as never);
    } catch {
      /* a platform with no theme events keeps the mode it started in */
    }
    return () => {
      try {
        Taro.offThemeChange?.(on as never);
      } catch {
        /* nothing to stop */
      }
    };
  }, []);
  return dark;
}

/** The theme for everything inside. `dark` follows the device unless it is given. */
export function ThemeProvider({ theme, dark, children }: { theme: KitTheme; dark?: boolean; children?: ReactNode }) {
  const system = useSystemDark();
  const value = useMemo(() => ({ theme, dark: dark ?? system }), [theme, dark, system]);
  return createElement(KitContext.Provider, { value }, children);
}

export function useKit(): Kit {
  const { theme, dark } = useContext(KitContext);
  const ink = useContext(InkContext);
  return useMemo(() => {
    const mode = dark ? theme.dark : theme.light;
    const colors = ink ? { ...mode.colors, ...ink } : mode.colors;
    /* "st:navOn" names one of the style's own colors */
    return { theme, dark, paint: (ref: string) => (ref.startsWith("st:") ? mode.st[ref.slice(3)] : resolveRef(colors, ref)) ?? colors["on-surface"] ?? "#000000" };
  }, [theme, dark, ink]);
}

/** the class the root of a screen wears: the theme's variables, light or dark */
export const themeClass = (dark: boolean, scope = "m3e-theme") => (dark ? `m3e-theme ${scope === "m3e-theme" ? "" : `${scope} `}m3e-dark` : scope === "m3e-theme" ? "m3e-theme" : `m3e-theme ${scope}`);

/** The words' roles repainted for everything inside, for the icons: what `inkVars` says to the stylesheet. */
export function Ink({ role, children }: { role: string | undefined; children?: ReactNode }) {
  const { theme, dark } = useContext(KitContext);
  const outer = useContext(InkContext);
  const value = useMemo(() => {
    if (!role) return outer;
    const mode = dark ? theme.dark : theme.light;
    const colors = { ...mode.colors, ...outer };
    const c = role.startsWith("st:") ? mode.st[role.slice(3)] : resolveRef(colors, role);
    return c ? { ...outer, "on-surface": c, "on-surface-variant": c } : outer;
  }, [role, outer, theme, dark]);
  return createElement(InkContext.Provider, { value }, children);
}

/* ---------- reading the theme ---------- */

/** a recipe's variant, "m3" when the style says nothing */
export const recipeOf = (kit: Kit, key: string): string => kit.theme.recipes[key] ?? "m3";

/** one of M3's corner steps at the theme's scale */
export const corner = (kit: Kit, step: "xs" | "sm" | "md" | "lg" | "lgi" | "xl" | "xli" | "xxl"): number => kit.theme.shape.corners[step] ?? 0;

/** the corner of a control under the style: half its height when it keeps M3's round ends */
export const controlRadius = (kit: Kit, height: number): number => (kit.theme.control.radius >= 999 ? height / 2 : kit.theme.control.radius);

/** what `rounded-full` means under the style */
export const pillRadius = (kit: Kit, height: number): number => (kit.theme.control.follow ? Math.min(height / 2, kit.theme.control.radius) : height / 2);

/** an extra a style's own CSS gives */
export const extra = (kit: Kit, key: string): string | number | undefined => kit.theme.extras?.[key];

const HEADINGS = new Set(["display-large", "display-medium", "display-small", "headline-large", "headline-medium", "headline-small", "title-large"]);

export type TextCss = { fontSize: number; lineHeight: string; fontWeight: number; letterSpacing: number; fontStyle?: string; textTransform?: string };

/** a type role as a text style (line heights in px: a bare number would be read as a multiple of the size) */
export function typeStyle(kit: Kit, role: TypeRole, bold = false): TextCss {
  const step = kit.theme.type[role] ?? kit.theme.type["body-medium"];
  const out: TextCss = { fontSize: step.size, lineHeight: `${step.line}px`, fontWeight: bold ? 700 : step.weight, letterSpacing: step.track };
  if (HEADINGS.has(role) && kit.theme.italicDisplay) Object.assign(out, { fontStyle: "italic", fontWeight: 800, textTransform: "uppercase" });
  return out;
}
