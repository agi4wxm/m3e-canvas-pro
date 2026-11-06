import { c, css, inkVars, roleCss } from "./color";
import type { CSS } from "./styles";

/* A part's look as a mini-program draws it: the fill role it is painted with, the role its words read in, its corners
 * and its effects (the editor's lib/look.ts, whose data the printer hands over already cleaned). A mini-program's page
 * is drawn by a web view (the default renderer), so nearly every effect is plain CSS: gradients, box shadows, a frosted
 * glass (backdrop-filter), filters, blend modes, transforms. What is left out, quietly, is listed in `UNMAPPED`:
 *   - textures (the editor's patterns are pictures it draws itself);
 *   - a glass on an older Android web view without backdrop-filter shows the fill alone;
 *   - words: a gradient on words needs background-clip: text, kept; an outline around letters is -webkit-text-stroke. */

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

/** what a mini-program does not draw of a look (see the head of this file); the exporter reports a look that uses one */
export const UNMAPPED = ["texture"] as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`);

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
  1: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)",
  2: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 2px 6px 2px rgba(0,0,0,0.15)",
  3: "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)",
  4: "0px 2px 3px 0px rgba(0,0,0,0.3), 0px 6px 10px 4px rgba(0,0,0,0.15)",
};
export const elevation = (level: number): string | undefined => ELEVATION[level];

const LEGACY_SHADOW: Record<string, string> = {
  soft: "0px 2px 8px 0px rgba(0,0,0,0.12)",
  deep: "0px 12px 32px 0px rgba(0,0,0,0.28)",
  hard: "4px 4px 0px 0px rgba(0,0,0,0.85)",
  glow: "0px 0px 16px 2px rgba(103,80,164,0.55)",
};

const shadowOf = (s: LookShadow): string | undefined => {
  if (s.hidden) return undefined;
  const color = css(s.color);
  return color ? `${s.inset ? "inset " : ""}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${color}` : undefined;
};

/** one layer of paint as a CSS image */
function layerOf(l: PaintLayer): string | undefined {
  if (l.hidden) return undefined;
  if (l.type === "solid") {
    const color = css(l.color);
    return color ? `linear-gradient(${color}, ${color})` : undefined;
  }
  const stops = (l.stops ?? []).map((s) => ({ color: css(s.color), at: s.at })).filter((s): s is { color: string; at: number } => !!s.color);
  if (stops.length < 2) return undefined;
  const list = stops.map((s) => `${s.color} ${Math.max(0, Math.min(100, s.at))}%`).join(", ");
  if (l.type === "radial") return `radial-gradient(${l.circle ? "circle" : "ellipse"} at ${l.x ?? 50}% ${l.y ?? 50}%, ${list})`;
  if (l.type === "conic") return `conic-gradient(from ${l.angle ?? 0}deg at ${l.x ?? 50}% ${l.y ?? 50}%, ${list})`;
  return `linear-gradient(${l.angle ?? 180}deg, ${list})`;
}

export type Painted = {
  /** the style of the painted view: its fill, corners, effects, and the words' roles inside redefined */
  style: CSS;
  /** the role (or color) the words inside read in, for the icons */
  ink?: string;
  /** what the look sets on words */
  text?: CSS;
};

/** Everything an appearance says, as the style of the view it paints. */
export function paint(a: Appearance | undefined): Painted {
  const style: CSS = {};
  const out: Painted = { style };
  if (!a) return out;
  if (a.fill) {
    const fill = roleCss(a.fill);
    if (fill) style.backgroundColor = fill;
  }
  const inkRole = a.textColor ? kebab(a.textColor) : a.fill ? ON_FILL[a.fill] : undefined;
  if (inkRole && /^[a-z-]+$/.test(inkRole)) {
    out.ink = inkRole;
    Object.assign(style, inkVars(inkRole), { color: c(inkRole) });
  }
  if (a.corners) {
    style.borderTopLeftRadius = a.corners.tl;
    style.borderTopRightRadius = a.corners.tr;
    style.borderBottomRightRadius = a.corners.br;
    style.borderBottomLeftRadius = a.corners.bl;
  }
  const l = a.look;
  if (!l) return out;
  if (l.borderWidth) Object.assign(style, { borderWidth: l.borderWidth, borderStyle: "solid", borderColor: c(kebab(l.borderColor ?? "onSurfaceVariant")) });
  if (l.opacity !== undefined && l.opacity < 100) style.opacity = l.opacity / 100;
  if (l.clearFill) style.backgroundColor = "transparent";
  const images = l.fills ? l.fills.map(layerOf).filter((x): x is string => !!x) : l.gradientTo && roleCss(l.gradientTo) ? [`linear-gradient(${l.gradientAngle ?? 180}deg, transparent, ${roleCss(l.gradientTo)})`] : [];
  if (images.length) style.backgroundImage = images.join(", ");
  const shadows: string[] = [];
  if (l.shadows) shadows.push(...l.shadows.map(shadowOf).filter((s): s is string => !!s));
  else if (l.shadow && l.shadow !== "none") shadows.push(LEGACY_SHADOW[l.shadow]);
  if (l.elevation) shadows.push(ELEVATION[l.elevation]);
  /* a stroke takes no room: a ring inside the edge, as the web's inset ring */
  const s = l.stroke;
  const sc = s && css(s.color);
  if (s && sc) {
    if (s.sides) Object.assign(style, { borderTopWidth: s.sides.t, borderRightWidth: s.sides.r, borderBottomWidth: s.sides.b, borderLeftWidth: s.sides.l, borderColor: sc, borderStyle: s.style ?? "solid" });
    else if (s.width && (s.style ?? "solid") === "solid") {
      const pos = s.position ?? "inside";
      shadows.unshift(pos === "inside" ? `inset 0 0 0 ${s.width}px ${sc}` : pos === "outside" ? `0 0 0 ${s.width}px ${sc}` : `inset 0 0 0 ${s.width / 2}px ${sc}, 0 0 0 ${s.width / 2}px ${sc}`);
    } else if (s.width) Object.assign(style, { outline: `${s.width}px ${s.style} ${sc}`, outlineOffset: (s.position ?? "inside") === "inside" ? -s.width : 0 });
  }
  if (shadows.length) style.boxShadow = shadows.join(", ");
  else if (l.shadows || l.elevation === 0) style.boxShadow = "none";
  if (l.glass) {
    const blur = `blur(${l.glass}px)${l.glassSaturate ? ` saturate(${l.glassSaturate}%)` : ""}`;
    Object.assign(style, { backdropFilter: blur, WebkitBackdropFilter: blur });
  }
  const transform: string[] = [];
  if (l.rotate) transform.push(`rotate(${l.rotate}deg)`);
  const tr = l.transform;
  if (tr) {
    const sx = ((tr.scaleX ?? 100) / 100) * (tr.flipX ? -1 : 1);
    const sy = ((tr.scaleY ?? 100) / 100) * (tr.flipY ? -1 : 1);
    if (sx !== 1 || sy !== 1) transform.push(`scale(${sx}, ${sy})`);
    if (tr.skewX || tr.skewY) transform.push(`skew(${tr.skewX ?? 0}deg, ${tr.skewY ?? 0}deg)`);
  }
  if (transform.length) style.transform = transform.join(" ");
  const f = l.filter ?? {};
  const filters: string[] = [];
  if (l.blur) filters.push(`blur(${l.blur}px)`);
  if (f.brightness !== undefined && f.brightness !== 100) filters.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== undefined && f.contrast !== 100) filters.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== undefined && f.saturate !== 100) filters.push(`saturate(${f.saturate}%)`);
  if (f.hueRotate) filters.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.grayscale) filters.push(`grayscale(${f.grayscale}%)`);
  if (f.sepia) filters.push(`sepia(${f.sepia}%)`);
  if (f.invert) filters.push(`invert(${f.invert}%)`);
  if (filters.length) style.filter = filters.join(" ");
  if (l.blend && l.blend !== "normal" && /^[a-z-]+$/.test(l.blend)) style.mixBlendMode = l.blend;
  if (l.clip) style.overflow = "hidden";
  out.text = textLookOf(l);
  if (l.text?.color && !l.text.gradient && css(l.text.color)) {
    out.ink = l.text.color;
    Object.assign(style, inkVars(l.text.color));
  }
  return out;
}

const CASE: Record<string, string> = { upper: "uppercase", lower: "lowercase", title: "capitalize" };

/** what a look sets on the words of the part it paints */
export function textLookOf(l: Look | undefined): CSS | undefined {
  const t = l?.text;
  const out: CSS = {};
  if (l?.font === "mono") out.fontFamily = "monospace";
  if (!t) return Object.keys(out).length ? out : undefined;
  const color = css(t.color);
  if (color) out.color = color;
  if (t.gradient && !t.gradient.hidden) {
    const image = layerOf(t.gradient);
    if (image) Object.assign(out, { backgroundImage: image, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" });
  }
  if (t.size !== undefined) out.fontSize = t.size;
  if (t.weight !== undefined) out.fontWeight = t.weight;
  if (t.letterSpacing !== undefined) out.letterSpacing = t.letterSpacing;
  if (t.lineHeight !== undefined) out.lineHeight = `${Math.round(((t.size ?? 14) * t.lineHeight) / 100)}px`;
  if (t.case) out.textTransform = CASE[t.case];
  if (t.italic) out.fontStyle = "italic";
  if (t.decoration) out.textDecoration = t.decoration;
  const shadows = (t.shadows ?? []).map((s) => (s.hidden ? undefined : css(s.color) ? `${s.x}px ${s.y}px ${s.blur}px ${css(s.color)}` : undefined)).filter((x): x is string => !!x);
  if (shadows.length) out.textShadow = shadows.join(", ");
  const stroke = t.stroke && css(t.stroke.color);
  if (t.stroke && stroke) out.WebkitTextStroke = `${t.stroke.width}px ${stroke}`;
  return Object.keys(out).length ? out : undefined;
}
