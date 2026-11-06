import type { TextStyle, ViewStyle } from "react-native";

import type { BuildTextStyle, BuildViewStyle } from "./styles";

import { roleColor, type Kit } from "./theme/ThemeProvider";

/* A part's look as React Native draws it: the fill role it is painted with, the role its words read in, its corners and
 * its effects (the editor's lib/look.ts, whose data the printer hands over already cleaned). Most effects have a native
 * counterpart: paint layers are gradients drawn under the part, a stroke is an outline, shadows are `boxShadow`, a glass
 * is a blur behind the part. What a phone cannot draw is left out quietly, as `UNMAPPED` lists:
 *   - conic gradients (the first and last stop stand in as a linear one), textures, blend modes on iOS;
 *   - a layer blur and the colour filters other than brightness and opacity draw on Android and the web only;
 *   - words: only one text shadow; no outline around letters; a gradient on words takes its first color. */

export type ColorRef = string;
export type GradientStop = { color: ColorRef; at: number };
export type PaintLayer = { type: "solid" | "linear" | "radial" | "conic"; color?: ColorRef; stops?: GradientStop[]; angle?: number; x?: number; y?: number; circle?: boolean; hidden?: boolean };
export type LookShadow = { x: number; y: number; blur: number; spread: number; color: ColorRef; inset?: boolean; hidden?: boolean };
export type LookStroke = { width: number; color: ColorRef; style?: "solid" | "dashed" | "dotted"; position?: "inside" | "center" | "outside"; sides?: { t: number; r: number; b: number; l: number } };
export type LookText = {
  color?: ColorRef;
  size?: number;
  weight?: number;
  letterSpacing?: number;
  /** percent of the size */
  lineHeight?: number;
  case?: "upper" | "lower" | "title";
  italic?: boolean;
  decoration?: "underline" | "line-through" | "overline";
  shadows?: LookShadow[];
  stroke?: { width: number; color: ColorRef };
  gradient?: PaintLayer;
};
export type Look = {
  borderWidth?: number;
  borderColor?: string;
  shadow?: "none" | "soft" | "deep" | "hard" | "glow";
  opacity?: number;
  glass?: number;
  rotate?: number;
  gradientTo?: string;
  gradientAngle?: number;
  font?: "display" | "mono";
  clearFill?: boolean;
  fills?: PaintLayer[];
  stroke?: LookStroke;
  shadows?: LookShadow[];
  elevation?: 0 | 1 | 2 | 3 | 4;
  blur?: number;
  glassSaturate?: number;
  blend?: string;
  filter?: { brightness?: number; contrast?: number; saturate?: number; hueRotate?: number; grayscale?: number; sepia?: number; invert?: number };
  transform?: { scaleX?: number; scaleY?: number; skewX?: number; skewY?: number; flipX?: boolean; flipY?: boolean };
  text?: LookText;
  texture?: { kind: string };
  clip?: boolean;
};
export type Corners = { tl: number; tr: number; br: number; bl: number };

/** what a part may carry beside its props, as the editor's `Item` does */
export type Appearance = {
  /** a fill role (camelCase, as the document writes it: `primaryContainer`) */
  fill?: string;
  /** the role its words read in (`onSurfaceVariant`) */
  textColor?: string;
  corners?: Corners;
  look?: Look;
};

/** the effects a phone does not draw (see the head of this file); the exporter reports a look that uses one */
export const UNMAPPED = ["texture", "conic gradient", "text stroke", "text gradient", "blend (iOS)", "layer blur and color filters (iOS)"] as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** a color with an alpha (0–1) laid over it */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3,8})$/i.exec(color);
  if (!m) return color;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return `#${h.slice(0, 6)}${hex2(a * alpha * 255)}`.toUpperCase();
}

/** A color the document names: a role (`primary`, `on-surface`), a role with an opacity (`primary/40`) or a hex. */
export function colorOf(kit: Kit, ref: ColorRef | undefined): string | undefined {
  if (!ref || typeof ref !== "string") return undefined;
  if (ref.startsWith("#")) return /^#[0-9a-f]{3,8}$/i.test(ref) ? ref : undefined;
  const [role, alpha] = ref.split("/");
  const c = kit.colors[role];
  if (!c) return undefined;
  return alpha === undefined ? c : withAlpha(c, Number(alpha) / 100);
}

/** what words read in over each fill role: the on-color of the role */
const ON_FILL: Record<string, string> = {
  primaryContainer: "on-primary-container",
  secondaryContainer: "on-secondary-container",
  tertiaryContainer: "on-tertiary-container",
  primary: "on-primary",
  inverseSurface: "inverse-on-surface",
};

/** Material's elevation levels (styles/m3e.css) */
const ELEVATION: Record<number, string> = {
  1: "0px 1px 2px 0px #0000004D, 0px 1px 3px 1px #00000026",
  2: "0px 1px 2px 0px #0000004D, 0px 2px 6px 2px #00000026",
  3: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
  4: "0px 2px 3px 0px #0000004D, 0px 6px 10px 4px #00000026",
};
export const elevation = (level: number): string | undefined => ELEVATION[level];

const LEGACY_SHADOW: Record<string, string> = {
  soft: "0px 2px 8px 0px #0000001F",
  deep: "0px 12px 32px 0px #00000047",
  hard: "4px 4px 0px 0px #000000D9",
  glow: "0px 0px 16px 2px #6750A48C",
};

/** one shadow as React Native's `boxShadow` takes it */
function shadowOf(kit: Kit, s: LookShadow): string | undefined {
  if (s.hidden) return undefined;
  const c = colorOf(kit, s.color);
  return c ? `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${c}` : undefined;
}

/** a layer of paint, resolved to colors, ready to be drawn under the part */
export type Layer = { kind: "linear" | "radial"; colors: string[]; at: number[]; angle: number; x: number; y: number; circle: boolean };

function layerOf(kit: Kit, l: PaintLayer): Layer | undefined {
  if (l.hidden) return undefined;
  if (l.type === "solid") {
    const c = colorOf(kit, l.color);
    return c ? { kind: "linear", colors: [c, c], at: [0, 1], angle: 180, x: 50, y: 50, circle: false } : undefined;
  }
  const stops = (l.stops ?? []).map((s) => ({ c: colorOf(kit, s.color), at: s.at })).filter((s): s is { c: string; at: number } => !!s.c);
  if (stops.length < 2) return undefined;
  /* a conic gradient has nothing native: a linear one along its angle stands in */
  return { kind: l.type === "radial" ? "radial" : "linear", colors: stops.map((s) => s.c), at: stops.map((s) => Math.max(0, Math.min(1, s.at / 100))), angle: l.angle ?? 180, x: l.x ?? 50, y: l.y ?? 50, circle: !!l.circle };
}

export type Painted = {
  /** the style of the painted view */
  style: ViewStyle;
  /** paint layers under the content, the first on top */
  layers: Layer[];
  /** a blur of what is behind, in px */
  glass?: number;
  /** the roles the words inside read in */
  ink?: Record<string, string>;
  /** what the look sets on words */
  text?: TextStyle;
};

/** Everything an appearance says, for the view it paints. `base` is the part's own background, which a fill replaces. */
export function paint(kit: Kit, a: Appearance | undefined): Painted {
  const style: BuildViewStyle = {};
  const out: Painted = { style, layers: [] };
  if (!a) return out;
  if (a.fill) {
    const c = kit.colors[kebab(a.fill)];
    if (c) style.backgroundColor = c;
  }
  const inkRole = a.textColor ? kebab(a.textColor) : a.fill ? ON_FILL[a.fill] : undefined;
  if (inkRole && kit.colors[inkRole]) {
    const c = kit.colors[inkRole];
    out.ink = { "on-surface": c, "on-surface-variant": c };
  }
  if (a.corners) {
    style.borderTopLeftRadius = a.corners.tl;
    style.borderTopRightRadius = a.corners.tr;
    style.borderBottomRightRadius = a.corners.br;
    style.borderBottomLeftRadius = a.corners.bl;
  }
  const l = a.look;
  if (!l) return out;
  if (l.borderWidth) {
    style.borderWidth = l.borderWidth;
    style.borderColor = roleColor(kit, kebab(l.borderColor ?? "onSurfaceVariant"));
  }
  if (l.opacity !== undefined && l.opacity < 100) style.opacity = l.opacity / 100;
  if (l.glass) out.glass = l.glass;
  if (l.clearFill) style.backgroundColor = "transparent";
  if (l.fills) out.layers = l.fills.map((f) => layerOf(kit, f)).filter((x): x is Layer => !!x);
  else if (l.gradientTo) {
    const c = kit.colors[kebab(l.gradientTo)];
    if (c) out.layers = [{ kind: "linear", colors: ["#00000000", c], at: [0, 1], angle: l.gradientAngle ?? 180, x: 50, y: 50, circle: false }];
  }
  /* shadows: the author's own, else the legacy one; then the level of elevation */
  const shadows: string[] = [];
  if (l.shadows) shadows.push(...l.shadows.map((s) => shadowOf(kit, s)).filter((s): s is string => !!s));
  else if (l.shadow && l.shadow !== "none") shadows.push(LEGACY_SHADOW[l.shadow]);
  if (l.elevation) shadows.push(ELEVATION[l.elevation]);
  if (shadows.length) style.boxShadow = shadows.join(", ");
  else if (l.shadows || l.elevation === 0) style.boxShadow = [];
  /* a stroke takes no room: an outline, pulled inside as far as the web's inset ring sits */
  const s = l.stroke;
  const sc = s && colorOf(kit, s.color);
  if (s && sc) {
    if (s.sides) {
      Object.assign(style, { borderTopWidth: s.sides.t, borderRightWidth: s.sides.r, borderBottomWidth: s.sides.b, borderLeftWidth: s.sides.l, borderColor: sc });
      if (s.style && s.style !== "solid") style.borderStyle = s.style;
    } else if (s.width) {
      const pos = s.position ?? "inside";
      Object.assign(style, { outlineWidth: s.width, outlineColor: sc, outlineStyle: s.style ?? "solid", outlineOffset: pos === "inside" ? -s.width : pos === "center" ? -s.width / 2 : 0 });
    }
  }
  /* turned, scaled and slanted */
  const transform: Record<string, string | number>[] = [];
  if (l.rotate) transform.push({ rotate: `${l.rotate}deg` });
  const tr = l.transform;
  if (tr) {
    const sx = ((tr.scaleX ?? 100) / 100) * (tr.flipX ? -1 : 1);
    const sy = ((tr.scaleY ?? 100) / 100) * (tr.flipY ? -1 : 1);
    if (sx !== 1) transform.push({ scaleX: sx });
    if (sy !== 1) transform.push({ scaleY: sy });
    if (tr.skewX) transform.push({ skewX: `${tr.skewX}deg` });
    if (tr.skewY) transform.push({ skewY: `${tr.skewY}deg` });
  }
  if (transform.length) style.transform = transform as unknown as ViewStyle["transform"];
  /* what the view is passed through: brightness and opacity everywhere, the rest where the platform has them */
  const f = l.filter ?? {};
  const filters: { [k: string]: number | string }[] = [];
  if (l.blur) filters.push({ blur: l.blur });
  if (f.brightness !== undefined && f.brightness !== 100) filters.push({ brightness: f.brightness / 100 });
  if (f.contrast !== undefined && f.contrast !== 100) filters.push({ contrast: f.contrast / 100 });
  if (f.saturate !== undefined && f.saturate !== 100) filters.push({ saturate: f.saturate / 100 });
  if (f.hueRotate) filters.push({ hueRotate: `${f.hueRotate}deg` });
  if (f.grayscale) filters.push({ grayscale: f.grayscale / 100 });
  if (f.sepia) filters.push({ sepia: f.sepia / 100 });
  if (f.invert) filters.push({ invert: f.invert / 100 });
  if (filters.length) style.filter = filters as unknown as ViewStyle["filter"];
  if (l.blend && l.blend !== "normal") style.mixBlendMode = l.blend as ViewStyle["mixBlendMode"];
  if (l.clip) style.overflow = "hidden";
  out.text = textLookOf(kit, l);
  if (l.text?.color && !l.text.gradient) {
    const c = colorOf(kit, l.text.color);
    if (c) out.ink = { "on-surface": c, "on-surface-variant": c };
  }
  return out;
}

const CASE: Record<string, TextStyle["textTransform"]> = { upper: "uppercase", lower: "lowercase", title: "capitalize" };

/** what a look sets on the words of the part it paints */
export function textLookOf(kit: Kit, l: Look | undefined): TextStyle | undefined {
  const t = l?.text;
  const out: BuildTextStyle = {};
  if (l?.font === "mono") out.fontFamily = "monospace";
  if (!t) return Object.keys(out).length ? out : undefined;
  const color = colorOf(kit, t.color) ?? (t.gradient?.stops?.[0] ? colorOf(kit, t.gradient.stops[0].color) : undefined);
  if (color) out.color = color;
  if (t.size !== undefined) out.fontSize = t.size;
  if (t.weight !== undefined) out.fontWeight = String(t.weight) as TextStyle["fontWeight"];
  if (t.letterSpacing !== undefined) out.letterSpacing = t.letterSpacing;
  if (t.lineHeight !== undefined) out.lineHeight = Math.round(((t.size ?? 14) * t.lineHeight) / 100);
  if (t.case) out.textTransform = CASE[t.case];
  if (t.italic) out.fontStyle = "italic";
  if (t.decoration && t.decoration !== "overline") out.textDecorationLine = t.decoration;
  const shadow = t.shadows?.find((s) => !s.hidden);
  const sc = shadow && colorOf(kit, shadow.color);
  if (shadow && sc) Object.assign(out, { textShadowColor: sc, textShadowOffset: { width: shadow.x, height: shadow.y }, textShadowRadius: shadow.blur });
  return Object.keys(out).length ? out : undefined;
}
