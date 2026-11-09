import {
  COLOR_TOKENS,
  type ColorPaint,
  isTextToken,
  type BlendMode,
  type ColorRef,
  type ColorToken,
  type GradientStop,
  type ItemLook,
  type LookFilter,
  type LookShadow,
  type LookStroke,
  type LookText,
  type LookTexture,
  type LookTransform,
  type PaintLayer,
  type Radii,
  type TextToken,
  type TextureKind,
} from "./tokens";
import { fields, withUnknown } from "./keep";
import { cleanMaterialLayer } from "./material";
import { materialPaintCss } from "./materialCss";

/* A part's effects, as data and as CSS. The data is what a document saves, a model writes and the panel edits; the CSS is
 * what parts/appearance.ts paints onto the part's tree, so the canvas, the preview, the printed code and the prompt all
 * carry the same look. Everything a document says passes through here before it reaches a style: a color is a role or a
 * hex and nothing else, a number is clamped, a choice is one of its own words. A string that is none of these is dropped,
 * so nothing a file or a model writes can put its own CSS (an address, an expression) into a page. */

/* ---------- colors ---------- */

/* The roles, the reader and the writer of a color are parts/color.ts's: the one color value type every color a document
 * holds (a look's, a part's color prop) is read by, so a color is validated in one place. */
export { COLOR_ROLES, formatColor, isColorRef, parseColor, type ColorRole, type ParsedColor } from "../parts/color";
import { formatColor, isColorRef, parseColor, type ColorRole } from "../parts/color";

/** the same color with another share of it showing */
export function withAlpha(ref: ColorRef, alpha: number): ColorRef {
  const c = parseColor(ref);
  return c ? formatColor({ ...c, alpha }) : ref;
}

/** `primaryContainer` as the role it names, `primary-container` */
export const tokenRole = (t: ColorToken | TextToken): ColorRole => t.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`) as ColorRole;

export const roleVar = (role: string) => `var(--md-sys-color-${role})`;

/** the name of a CSS variable an exported app paints a bound field with (`--m3e-v-<name>`): letters, digits, dashes */
const isVarName = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9-]{0,40}$/.test(v);

/** A value read from a variable's CSS variable when the field is bound to one, the field's own standing in while it is
 *  not defined; the value itself when it is not. */
export const boundCss = (css: string, name: string | undefined) => (name ? `var(--m3e-v-${name}, ${css})` : css);

/** A color reference as CSS: a role is its variable, a share of one is mixed with nothing, a hex stays a hex.
 *  Anything else is no color, and comes back as nothing. */
export function colorCss(ref: unknown): string | undefined {
  const c = parseColor(ref);
  if (!c) return undefined;
  if ("hex" in c) return formatColor(c);
  return c.alpha === 100 ? roleVar(c.role) : `color-mix(in srgb, ${roleVar(c.role)} ${c.alpha}%, transparent)`;
}

/* ---------- numbers and words ---------- */

const round = (n: number) => Math.round(n * 100) / 100;

/** a finite number held between two others, or nothing */
function num(v: unknown, lo: number, hi: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? round(Math.min(hi, Math.max(lo, v))) : undefined;
}

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const BLEND_MODES: readonly BlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "plus-lighter"];
export const TEXTURE_KINDS: readonly TextureKind[] = ["noise", "paper", "dots", "grid", "stripes", "diagonal", "checker", "carbon", "scanlines", "crosshatch", "halftone"];
export const PAINT_TYPES: readonly PaintLayer["type"][] = ["solid", "linear", "radial", "conic", "material"];
/** the layers of colour alone: what words, which have no tile to lay a material in, may be painted with */
export const COLOR_PAINT_TYPES: readonly ColorPaint["type"][] = ["solid", "linear", "radial", "conic"];

/** How far each number may go. A document holding more is brought back inside; the panel's controls stop at the same places. */
export const LIMITS = {
  borderWidth: [0, 32],
  opacity: [0, 100],
  glass: [0, 80],
  glassSaturate: [0, 300],
  rotate: [-360, 360],
  angle: [-360, 360],
  at: [0, 100],
  center: [-50, 150],
  strokeWidth: [0, 32],
  shadowOffset: [-200, 200],
  shadowBlur: [0, 300],
  shadowSpread: [-100, 100],
  blur: [0, 100],
  brightness: [0, 300],
  contrast: [0, 300],
  saturate: [0, 300],
  hueRotate: [-360, 360],
  grayscale: [0, 100],
  sepia: [0, 100],
  invert: [0, 100],
  scale: [5, 400],
  skew: [-80, 80],
  textSize: [6, 400],
  weight: [100, 900],
  letterSpacing: [-20, 60],
  lineHeight: [50, 400],
  textStroke: [0, 20],
  textureSize: [2, 400],
} as const satisfies Record<string, readonly [number, number]>;

const lim = (v: unknown, k: keyof typeof LIMITS) => num(v, LIMITS[k][0], LIMITS[k][1]);

/** how many of a list a part keeps: past these a look is a picture, and the rest is dropped */
export const MAX_FILLS = 8;
export const MAX_STOPS = 10;
export const MAX_SHADOWS = 10;

/* What each part of a look has. Read from a document (`keep`, lib/project.ts), a field it holds that this version does
   not know stays as it came (lib/keep.ts): a newer version's, kept for it. Painted, printed or set by an operation, a
   look is only what is known of it, so nothing unknown reaches a style or an exported app. */
const STOP = fields("color", "at");
const PAINT = fields("type", "color", "cssVar", "stops", "angle", "x", "y", "circle", "hidden");
const MATERIAL_PAINT = fields("type", "material", "mode", "tint", "scale", "x", "y", "opacity", "blend", "hidden");
const SHADOW = fields("x", "y", "blur", "spread", "color", "inset", "hidden");
const STROKE = fields("width", "color", "style", "position", "sides", "cssVar");
const SIDES = fields("t", "r", "b", "l");
const TEXT_STROKE = fields("width", "color");
const TEXTURE = fields("kind", "color", "opacity", "size", "blend");
const TEXT = fields("color", "size", "weight", "letterSpacing", "lineHeight", "case", "italic", "decoration", "shadows", "stroke", "gradient", "cssVar");
const FILTER = fields("brightness", "contrast", "saturate", "hueRotate", "grayscale", "sepia", "invert");
const TRANSFORM = fields("scaleX", "scaleY", "skewX", "skewY", "flipX", "flipY");
const LOOK_VARS = fields("opacity", "rotate", "radius");
/** the fields a look has */
export const LOOK_FIELDS = fields("borderWidth", "borderColor", "shadow", "opacity", "glass", "rotate", "gradientTo", "gradientAngle", "font", "fills", "stroke", "shadows", "elevation", "blur", "glassSaturate", "blend", "filter", "transform", "text", "texture", "clip", "clearFill", "vars");
/** `built`, with what `raw` holds that this version does not know when it is read from a document */
const kept = <T extends object>(keep: boolean, raw: unknown, built: T, known: ReadonlySet<string>): T => (keep ? withUnknown(raw, built, known) : built);

/* ---------- paint ---------- */

function cleanStops(v: unknown, keep = false): GradientStop[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const stops = v
    .slice(0, MAX_STOPS)
    .flatMap((s) => {
      if (!isRecord(s) || !isColorRef(s.color)) return [];
      return [kept(keep, s, { color: s.color, at: lim(s.at, "at") ?? 0 }, STOP)];
    })
    .sort((a, b) => a.at - b.at);
  return stops.length ? stops : undefined;
}

/** one layer of paint as it may be kept, or nothing. A material layer is the format's own (lib/material.ts): it names a
 *  material of the document by id, and its tint is a colour reference like any other. */
export function cleanPaint(v: unknown, keep = false): PaintLayer | undefined {
  if (!isRecord(v)) return undefined;
  if (v.type === "material") {
    const m = cleanMaterialLayer(v, isColorRef);
    return m && kept(keep, v, m, MATERIAL_PAINT);
  }
  return cleanColorPaint(v, keep);
}

/** a layer of colour as it may be kept, or nothing */
export function cleanColorPaint(v: unknown, keep = false): ColorPaint | undefined {
  if (!isRecord(v)) return undefined;
  const type = oneOf(v.type, COLOR_PAINT_TYPES);
  if (!type) return undefined;
  const out: ColorPaint = { type };
  if (type === "solid") {
    if (!isColorRef(v.color)) return undefined;
    out.color = v.color;
    if (isVarName(v.cssVar)) out.cssVar = v.cssVar;
  } else {
    const stops = cleanStops(v.stops, keep);
    if (!stops || stops.length < 2) return undefined;
    out.stops = stops;
    const angle = lim(v.angle, "angle");
    if (angle !== undefined && type !== "radial") out.angle = angle;
    if (type !== "linear") {
      const x = lim(v.x, "center");
      const y = lim(v.y, "center");
      if (x !== undefined) out.x = x;
      if (y !== undefined) out.y = y;
    }
    if (type === "radial" && v.circle === true) out.circle = true;
  }
  if (v.hidden === true) out.hidden = true;
  return kept(keep, v, out, PAINT);
}

const stopsCss = (stops: GradientStop[]) =>
  stops
    .map((s) => {
      const c = colorCss(s.color);
      return c ? `${c} ${round(s.at)}%` : "";
    })
    .filter(Boolean)
    .join(", ");

/** a layer of colour as a CSS image: a gradient, a solid one included, so layers stack the same way whatever they are */
export function paintCss(layer: PaintLayer | undefined): string | undefined {
  const l = cleanColorPaint(layer);
  if (!l || l.hidden) return undefined;
  if (l.type === "solid") {
    const own = colorCss(l.color)!;
    const c = boundCss(own, l.cssVar);
    return `linear-gradient(${c}, ${c})`;
  }
  const stops = stopsCss(l.stops!);
  const at = `${l.x ?? 50}% ${l.y ?? 50}%`;
  if (l.type === "linear") return `linear-gradient(${l.angle ?? 180}deg, ${stops})`;
  if (l.type === "radial") return `radial-gradient(${l.circle ? "circle" : "ellipse"} at ${at}, ${stops})`;
  return `conic-gradient(from ${l.angle ?? 0}deg at ${at}, ${stops})`;
}

/* ---------- shadows ---------- */

export function cleanShadow(v: unknown, keep = false): LookShadow | undefined {
  if (!isRecord(v) || !isColorRef(v.color)) return undefined;
  const out: LookShadow = {
    x: lim(v.x, "shadowOffset") ?? 0,
    y: lim(v.y, "shadowOffset") ?? 0,
    blur: lim(v.blur, "shadowBlur") ?? 0,
    spread: lim(v.spread, "shadowSpread") ?? 0,
    color: v.color,
  };
  if (v.inset === true) out.inset = true;
  if (v.hidden === true) out.hidden = true;
  return kept(keep, v, out, SHADOW);
}

const cleanShadows = (v: unknown, keep = false): LookShadow[] | undefined => (Array.isArray(v) ? v.slice(0, MAX_SHADOWS).map((s) => cleanShadow(s, keep)).filter((s): s is LookShadow => !!s) : undefined);

/** one shadow as CSS; on words there is no spread and no inside */
export function shadowCss(s: LookShadow | undefined, words = false): string | undefined {
  const c = cleanShadow(s);
  if (!c || c.hidden) return undefined;
  const color = colorCss(c.color)!;
  if (words) return `${c.x}px ${c.y}px ${c.blur}px ${color}`;
  return `${c.inset ? "inset " : ""}${c.x}px ${c.y}px ${c.blur}px ${c.spread}px ${color}`;
}

/** the shadows the first look offered, as they have always been drawn */
export const LEGACY_SHADOW: Record<NonNullable<ItemLook["shadow"]>, string> = {
  none: "none",
  soft: "0 2px 12px rgb(0 0 0 / 0.14)",
  deep: "0 10px 30px rgb(0 0 0 / 0.32)",
  hard: `4px 4px 0 ${roleVar("outline")}`,
  glow: `0 0 16px color-mix(in srgb, ${roleVar("primary")} 70%, transparent)`,
};

/** the same shadows as a list the panel can edit */
export function legacyShadows(shadow: ItemLook["shadow"]): LookShadow[] | undefined {
  switch (shadow) {
    case "none":
      return [];
    case "soft":
      return [{ x: 0, y: 2, blur: 12, spread: 0, color: "#00000024" }];
    case "deep":
      return [{ x: 0, y: 10, blur: 30, spread: 0, color: "#00000052" }];
    case "hard":
      return [{ x: 4, y: 4, blur: 0, spread: 0, color: "outline" }];
    case "glow":
      return [{ x: 0, y: 0, blur: 16, spread: 0, color: "primary/70" }];
    default:
      return undefined;
  }
}

/* ---------- elevation ---------- */

export const ELEVATION_LEVELS = [0, 1, 2, 3, 4] as const;
type Level = 0 | 1 | 2 | 3 | 4;
type Lift = 1 | 2 | 3 | 4;

/** Material's own levels (styles/m3e.css), what a level is wherever a style says nothing else */
const M3_ELEVATION: Record<Level, string> = {
  0: "none",
  1: "0 1px 2px 0 rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15)",
  2: "0 1px 2px 0 rgb(0 0 0 / 0.3), 0 2px 6px 2px rgb(0 0 0 / 0.15)",
  3: "0 1px 3px 0 rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15)",
  4: "0 2px 3px 0 rgb(0 0 0 / 0.3), 0 6px 10px 4px rgb(0 0 0 / 0.15)",
};

const mixRole = (role: string, percent: number) => `color-mix(in srgb, ${roleVar(role)} ${percent}%, transparent)`;

/** A style's way of lifting a panel: what stays at every level (a rim, a highlight along the top edge), and the
 *  shadow that grows with it. Level 0 keeps only what stays, so a flat panel still wears the style's edge. */
type Recipe = { stays?: string; lift: (n: Lift) => string };

/** Each level in a style's own way, by its surface recipe (lib/styles: `recipesOf(theme).surface`). A lookup rather
 *  than a full map: a recipe not listed here lifts the way Material does. */
const ELEVATION_BY_SURFACE: Partial<Record<string, Recipe>> = {
  soft: { lift: (n) => `0 ${n}px ${n * 2}px rgb(0 0 0 / ${round(0.04 + n * 0.01)}), 0 ${n * 5}px ${n * 16}px rgb(0 0 0 / ${round(0.04 + n * 0.02)})` },
  tile: { lift: (n) => `0 ${n}px ${n * 3}px rgb(0 0 0 / ${round(0.03 + n * 0.015)})` },
  plain: { lift: (n) => `0 ${n * 2}px ${n * 8}px rgb(0 0 0 / ${round(n * 0.08)})` },
  line: { lift: (n) => `0 ${n}px ${n * 3 + 1}px rgb(0 0 0 / ${round(0.04 + n * 0.03)})` },
  hard: { lift: (n) => `${n * 2}px ${n * 2}px 0 var(--st-line)` },
  glow: { lift: (n) => `0 0 ${8 + n * 8}px ${mixRole("primary", 10 + n * 10)}, inset 0 0 ${n * 8}px ${mixRole("primary", 4 + n * 2)}` },
  glass: { stays: "inset 0 1px 0 rgb(255 255 255 / 0.22)", lift: (n) => `0 ${n * 4}px ${n * 14}px rgb(0 0 0 / ${round(0.1 + n * 0.05)})` },
  ornate: { stays: `0 0 0 1px ${roleVar("surface")}, 0 0 0 3px ${mixRole("primary", 55)}`, lift: (n) => `0 ${n * 3}px ${n * 8}px rgb(0 0 0 / 0.45)` },
  chunk: { stays: "0 0 0 2px var(--st-rim-dark), inset 0 2px 0 rgb(255 255 255 / 0.7)", lift: (n) => `0 ${n * 2 + 2}px 0 2px rgb(0 0 0 / 0.25)` },
  hairline: { lift: (n) => `0 0 ${n * 6}px ${mixRole("primary", n * 5)}, 0 ${n * 2}px ${n * 8}px rgb(0 0 0 / 0.4)` },
  wood: { stays: "0 0 0 2px var(--st-rim-dark)", lift: (n) => `${n}px ${n * 2 + 1}px 0 2px rgb(0 0 0 / 0.25)` },
  gilt: { stays: "inset 0 0 0 1px rgb(255 255 255 / 0.06)", lift: (n) => `0 ${n * 2}px ${n * 8}px rgb(0 0 0 / ${round(0.15 + n * 0.05)})` },
  steel: { stays: "inset 0 1px 0 rgb(255 255 255 / 0.6)", lift: (n) => `0 ${n + 1}px 0 rgb(0 0 0 / 0.18), 0 ${n * 2}px ${n * 6}px rgb(0 0 0 / 0.12)` },
};

/** the shadow of one level under a surface recipe */
export function elevationShadow(surface: string | undefined, level: number): string {
  const n = Math.round(level);
  if (!(n >= 0 && n <= 4)) return "none";
  const own = surface ? ELEVATION_BY_SURFACE[surface] : undefined;
  if (!own) return M3_ELEVATION[n as Level];
  if (n === 0) return own.stays ?? "none";
  return own.stays ? `${own.stays}, ${own.lift(n as Lift)}` : own.lift(n as Lift);
}

/** what a part raised to a level carries: the style's shadow for it, Material's until a style says otherwise */
const elevationVar = (n: Level) => `var(--look-elev-${n}, ${M3_ELEVATION[n]})`;

/** The levels of a style as variables on its scope, so a part's level follows a change of style without being
 *  written again. Nothing for a style that lifts the way Material does. */
export function elevationCss(surface: string | undefined, at: { scope: string }): string {
  if (!surface || !ELEVATION_BY_SURFACE[surface]) return "";
  return `${at.scope}{${ELEVATION_LEVELS.map((n) => `--look-elev-${n}:${elevationShadow(surface, n)};`).join("")}}`;
}

/* ---------- stroke ---------- */

export function cleanStroke(v: unknown, keep = false): LookStroke | undefined {
  if (!isRecord(v) || !isColorRef(v.color)) return undefined;
  const width = lim(v.width, "strokeWidth");
  if (width === undefined) return undefined;
  const out: LookStroke = { width, color: v.color };
  const style = oneOf(v.style, ["solid", "dashed", "dotted"] as const);
  if (style && style !== "solid") out.style = style;
  const position = oneOf(v.position, ["inside", "center", "outside"] as const);
  if (position && position !== "inside") out.position = position;
  if (isRecord(v.sides)) {
    const s = v.sides;
    out.sides = kept(keep, s, { t: lim(s.t, "strokeWidth") ?? 0, r: lim(s.r, "strokeWidth") ?? 0, b: lim(s.b, "strokeWidth") ?? 0, l: lim(s.l, "strokeWidth") ?? 0 }, SIDES);
  }
  if (isVarName(v.cssVar)) out.cssVar = v.cssVar;
  return kept(keep, v, out, STROKE);
}

/** A stroke takes no room, so it is drawn rather than laid out. A solid line is a ring of shadow (inside, outside, or half
 *  of each), which follows the corners and leaves `outline` to the focus ring. A dashed or dotted one has no shadow to be
 *  made of, so it is the outline, pulled in by as much as it should sit inside. */
export function strokeCss(stroke: LookStroke | undefined): { shadows: string[]; outline?: string; outlineOffset?: string } {
  const s = cleanStroke(stroke);
  const own = s && colorCss(s.color);
  const color = own && boundCss(own, s.cssVar);
  if (!s || !color) return { shadows: [] };
  const position = s.position ?? "inside";
  if (s.style === "dashed" || s.style === "dotted") {
    if (!s.width) return { shadows: [] };
    const offset = position === "inside" ? -s.width : position === "center" ? -s.width / 2 : 0;
    return { shadows: [], outline: `${s.width}px ${s.style} ${color}`, outlineOffset: `${round(offset)}px` };
  }
  const ring = (w: number, inside: boolean) => (w > 0 ? [`${inside ? "inset " : ""}0 0 0 ${round(w)}px ${color}`] : []);
  if (!s.sides) {
    if (position === "inside") return { shadows: ring(s.width, true) };
    if (position === "outside") return { shadows: ring(s.width, false) };
    return { shadows: [...ring(s.width / 2, false), ...ring(s.width / 2, true)] };
  }
  /* each side alone: a copy of the box moved out (or in) by that side's width shows only along that side */
  const side = (w: number, dx: number, dy: number, inside: boolean) => (w > 0 ? [`${inside ? "inset " : ""}${round(dx * w)}px ${round(dy * w)}px 0 0 ${color}`] : []);
  const at = (k: number, inside: boolean) => {
    const { t, r, b, l } = s.sides!;
    const sign = inside ? 1 : -1;
    return [...side(t * k, 0, sign, inside), ...side(r * k, -sign, 0, inside), ...side(b * k, 0, -sign, inside), ...side(l * k, sign, 0, inside)];
  };
  if (position === "inside") return { shadows: at(1, true) };
  if (position === "outside") return { shadows: at(1, false) };
  return { shadows: [...at(0.5, false), ...at(0.5, true)] };
}

/* ---------- texture ---------- */

export function cleanTexture(v: unknown, keep = false): LookTexture | undefined {
  if (!isRecord(v)) return undefined;
  const kind = oneOf(v.kind, TEXTURE_KINDS);
  if (!kind) return undefined;
  const out: LookTexture = { kind };
  if (isColorRef(v.color)) out.color = v.color;
  const opacity = lim(v.opacity, "opacity");
  if (opacity !== undefined) out.opacity = opacity;
  const size = lim(v.size, "textureSize");
  if (size !== undefined) out.size = size;
  const blend = oneOf(v.blend, BLEND_MODES);
  if (blend && blend !== "normal") out.blend = blend;
  return kept(keep, v, out, TEXTURE);
}

/** the tile each pattern is drawn at when the author has not said */
export const TEXTURE_SIZE: Record<TextureKind, number> = { noise: 160, paper: 220, dots: 12, grid: 16, stripes: 12, diagonal: 10, checker: 16, carbon: 16, scanlines: 3, crosshatch: 10, halftone: 8 };
export const TEXTURE_OPACITY = 20;

/** a picture made here from fixed words and numbers only: the author's color reaches it as six hex digits */
const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

function grain(size: number, ink: string, opacity: number, frequency: number, octaves: number, gain: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => round(parseInt(ink.slice(i, i + 2), 16) / 255));
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='${octaves}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${gain} 0 0 0 ${round(-gain / 2 + 0.1)}'/></filter><rect width='100%' height='100%' filter='url(#g)' opacity='${round(opacity / 100)}'/></svg>`,
  );
}

/** One texture as background layers, each with its tile size and place, top first. */
export function textureLayers(texture: LookTexture | undefined): { image: string; size: string; position: string; repeat: string; blend: string }[] {
  const t = cleanTexture(texture);
  if (!t) return [];
  const size = t.size ?? TEXTURE_SIZE[t.kind];
  const opacity = t.opacity ?? TEXTURE_OPACITY;
  if (!opacity) return [];
  const blend = t.blend ?? "normal";
  const parsed = parseColor(t.color ?? "#000000");
  const ink = colorCss(t.color) ?? "#000000";
  const inked = `color-mix(in srgb, ${ink} ${opacity}%, transparent)`;
  const S = round(size);
  const half = round(size / 2);
  const tile = (image: string, position = "0 0", at = S) => ({ image, size: `${at}px ${at}px`, position, repeat: "repeat", blend });
  const whole = (image: string) => ({ image, size: "auto", position: "0 0", repeat: "repeat", blend });
  switch (t.kind) {
    case "noise":
    case "paper": {
      const hex = parsed && "hex" in parsed ? parsed.hex : "#000000";
      const grainOpacity = parsed ? (opacity * parsed.alpha) / 100 : opacity;
      const fine = Math.max(2, Math.round(S / 3));
      return t.kind === "noise" ? [tile(grain(S, hex, grainOpacity, 0.8, 3, 2.2))] : [tile(grain(S, hex, grainOpacity, 0.035, 5, 1.6)), tile(grain(fine, hex, grainOpacity / 2, 0.9, 2, 2), "0 0", fine)];
    }
    case "dots": {
      const r = round(Math.max(1, size * 0.16));
      return [tile(`radial-gradient(circle, ${inked} ${r}px, transparent ${round(r + 0.6)}px)`)];
    }
    case "grid":
      return [tile(`linear-gradient(${inked} 1px, transparent 1px)`), tile(`linear-gradient(90deg, ${inked} 1px, transparent 1px)`)];
    case "stripes":
      return [whole(`repeating-linear-gradient(90deg, ${inked} 0 ${half}px, transparent ${half}px ${S}px)`)];
    case "diagonal": {
      const w = round(Math.max(1, size * 0.3));
      return [whole(`repeating-linear-gradient(45deg, ${inked} 0 ${w}px, transparent ${w}px ${S}px)`)];
    }
    case "checker":
      return [tile(`conic-gradient(${inked} 25%, transparent 0 50%, ${inked} 0 75%, transparent 0)`)];
    case "carbon": {
      /* a weave: short diagonal threads two ways over a light and dark check */
      const u = round(size / 4);
      const mid = `color-mix(in srgb, ${ink} ${round(opacity * 0.7)}%, transparent)`;
      const deep = `color-mix(in srgb, ${ink} ${round(opacity * 0.85)}%, transparent)`;
      return [
        tile(`linear-gradient(27deg, ${inked} ${u}px, transparent ${u}px)`, `0 ${u}px`),
        tile(`linear-gradient(207deg, ${inked} ${u}px, transparent ${u}px)`, `${2 * u}px 0`),
        tile(`linear-gradient(27deg, ${mid} ${u}px, transparent ${u}px)`, `0 ${2 * u}px`),
        tile(`linear-gradient(207deg, ${mid} ${u}px, transparent ${u}px)`, `${2 * u}px ${u}px`),
        tile(`linear-gradient(90deg, ${deep} ${2 * u}px, transparent ${2 * u}px)`),
        tile(`linear-gradient(${deep} 25%, ${mid} 25% 50%, transparent 50% 75%, ${inked} 75%)`),
      ];
    }
    case "scanlines":
      return [whole(`repeating-linear-gradient(180deg, ${inked} 0 1px, transparent 1px ${S}px)`)];
    case "crosshatch":
      return [whole(`repeating-linear-gradient(45deg, ${inked} 0 1px, transparent 1px ${S}px)`), whole(`repeating-linear-gradient(-45deg, ${inked} 0 1px, transparent 1px ${S}px)`)];
    case "halftone":
      return [tile(`radial-gradient(circle, ${inked} 28%, transparent 30%)`), tile(`radial-gradient(circle, ${inked} 28%, transparent 30%)`, `${half}px ${half}px`)];
  }
}

/* ---------- text ---------- */

export function cleanText(v: unknown, keep = false): LookText | undefined {
  if (!isRecord(v)) return undefined;
  const out: LookText = {};
  if (isColorRef(v.color)) out.color = v.color;
  const size = lim(v.size, "textSize");
  if (size !== undefined) out.size = size;
  const weight = lim(v.weight, "weight");
  if (weight !== undefined) out.weight = Math.round(weight / 100) * 100;
  const spacing = lim(v.letterSpacing, "letterSpacing");
  if (spacing !== undefined) out.letterSpacing = spacing;
  const line = lim(v.lineHeight, "lineHeight");
  if (line !== undefined) out.lineHeight = line;
  const kase = oneOf(v.case, ["upper", "lower", "title"] as const);
  if (kase) out.case = kase;
  if (v.italic === true) out.italic = true;
  const decoration = oneOf(v.decoration, ["underline", "line-through", "overline"] as const);
  if (decoration) out.decoration = decoration;
  const shadows = cleanShadows(v.shadows, keep);
  if (shadows?.length) out.shadows = shadows;
  if (isRecord(v.stroke) && isColorRef(v.stroke.color)) {
    const width = lim(v.stroke.width, "textStroke");
    if (width) out.stroke = kept(keep, v.stroke, { width, color: v.stroke.color }, TEXT_STROKE);
  }
  const gradient = cleanColorPaint(v.gradient, keep);
  if (gradient && gradient.type !== "solid") out.gradient = gradient;
  if (out.color && isVarName(v.cssVar)) out.cssVar = v.cssVar;
  const all = kept(keep, v, out, TEXT);
  return Object.keys(all).length ? all : undefined;
}

const FONT_OF: Record<NonNullable<ItemLook["font"]>, string> = {
  display: "var(--st-display, inherit)",
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};

const CASE_OF = { upper: "uppercase", lower: "lowercase", title: "capitalize" } as const;

/** the one color words are read in, when the look names one, written into the roles words read so it reaches them all;
 *  `bound` is the variable it is bound to in an exported app */
function wordColor(c: string, bound?: string): Record<string, string> {
  const out: Record<string, string> = { color: boundCss(c, bound) };
  for (const name of ["on-surface", "on-surface-variant"]) {
    /* a role defined by itself is no value at all, so the one being read stays as it is; one bound to a variable reads
       the variable alone, which the screen around it always defines */
    if (!c.includes(`--md-sys-color-${name})`)) out[`--md-sys-color-${name}`] = boundCss(c, bound);
    else if (bound) out[`--md-sys-color-${name}`] = `var(--m3e-v-${bound})`;
  }
  return out;
}

/** An outline around each letter. Drawn twice as wide and under the fill, so only the outer half shows: the letter keeps
 *  its own shape. */
const textStrokeCss = (t: LookText) => {
  const c = t.stroke && colorCss(t.stroke.color);
  return c && t.stroke!.width ? { WebkitTextStroke: `${round(t.stroke!.width * 2)}px ${c}`, paintOrder: "stroke fill" } : {};
};

/** what the look sets on every node that holds words of its own, over the size, weight and color its class gives them */
export function lookTextNodeStyle(look: ItemLook | undefined): Record<string, string | number> {
  const t = cleanText(look?.text);
  if (!t) return {};
  const out: Record<string, string | number> = {};
  if (t.color && !t.gradient) out.color = boundCss(colorCss(t.color)!, t.cssVar);
  if (t.size !== undefined) out.fontSize = `${t.size}px`;
  if (t.weight !== undefined) out.fontWeight = t.weight;
  if (t.letterSpacing !== undefined) out.letterSpacing = `${t.letterSpacing}px`;
  if (t.lineHeight !== undefined) out.lineHeight = round(t.lineHeight / 100);
  if (t.case) out.textTransform = CASE_OF[t.case];
  if (t.italic) out.fontStyle = "italic";
  return out;
}

/** What words painted with a gradient are wrapped in. The gradient is clipped to the letters of that run alone, so the
 *  part's own surface keeps its fill. Shadows and an outline go under the letters as drop shadows: a text shadow would be
 *  drawn over a clipped gradient and hide it. */
export function lookGradientTextStyle(look: ItemLook | undefined): Record<string, string | number> | undefined {
  const t = cleanText(look?.text);
  const image = t?.gradient && paintCss(t.gradient);
  if (!t || !image) return undefined;
  const drops: string[] = [];
  const stroke = t.stroke && colorCss(t.stroke.color);
  if (stroke && t.stroke!.width) {
    const w = t.stroke!.width;
    /* each drop shadow repeats what is drawn so far: four of them, one each way, make a ring */
    for (const [dx, dy] of [[w, 0], [-w, 0], [0, w], [0, -w]]) drops.push(`drop-shadow(${round(dx)}px ${round(dy)}px 0 ${stroke})`);
  }
  for (const s of t.shadows ?? []) {
    const c = !s.hidden && colorCss(s.color);
    if (c) drops.push(`drop-shadow(${s.x}px ${s.y}px ${round(s.blur / 2)}px ${c})`);
  }
  return {
    backgroundImage: image,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: "0",
    textShadow: "none",
    ...(drops.length ? { filter: drops.join(" ") } : {}),
  };
}

/* ---------- the whole look ---------- */

function cleanFilter(v: unknown, keep = false): LookFilter | undefined {
  if (!isRecord(v)) return undefined;
  const out: LookFilter = {};
  for (const k of ["brightness", "contrast", "saturate", "hueRotate", "grayscale", "sepia", "invert"] as const) {
    const n = lim(v[k], k);
    if (n !== undefined) out[k] = n;
  }
  const all = kept(keep, v, out, FILTER);
  return Object.keys(all).length ? all : undefined;
}

function cleanTransform(v: unknown, keep = false): LookTransform | undefined {
  if (!isRecord(v)) return undefined;
  const out: LookTransform = {};
  for (const k of ["scaleX", "scaleY"] as const) {
    const n = lim(v[k], "scale");
    if (n !== undefined) out[k] = n;
  }
  for (const k of ["skewX", "skewY"] as const) {
    const n = lim(v[k], "skew");
    if (n !== undefined) out[k] = n;
  }
  if (v.flipX === true) out.flipX = true;
  if (v.flipY === true) out.flipY = true;
  const all = kept(keep, v, out, TRANSFORM);
  return Object.keys(all).length ? all : undefined;
}

/* read when asked: lib/tokens.ts may still be loading when this module is */
const isFillToken = (v: unknown): v is ColorToken => typeof v === "string" && COLOR_TOKENS.some((t) => t.key === v);

/** A look as a document may keep it: every field of its own type and within its limits, the rest dropped. Nothing when
 *  nothing is left. This is what a file, a link and a model's answer go through. */
export function cleanLook(v: unknown, keep = false): ItemLook | undefined {
  if (!isRecord(v)) return undefined;
  const out: ItemLook = {};
  const borderWidth = lim(v.borderWidth, "borderWidth");
  if (borderWidth !== undefined) out.borderWidth = borderWidth;
  if (isTextToken(v.borderColor)) out.borderColor = v.borderColor;
  const shadow = oneOf(v.shadow, ["none", "soft", "deep", "hard", "glow"] as const);
  if (shadow) out.shadow = shadow;
  const opacity = lim(v.opacity, "opacity");
  if (opacity !== undefined) out.opacity = opacity;
  const glass = lim(v.glass, "glass");
  if (glass !== undefined) out.glass = glass;
  const rotate = lim(v.rotate, "rotate");
  if (rotate !== undefined) out.rotate = rotate;
  if (isFillToken(v.gradientTo)) out.gradientTo = v.gradientTo;
  const gradientAngle = lim(v.gradientAngle, "angle");
  if (gradientAngle !== undefined) out.gradientAngle = gradientAngle;
  const font = oneOf(v.font, ["display", "mono"] as const);
  if (font) out.font = font;

  if (Array.isArray(v.fills)) out.fills = v.fills.slice(0, MAX_FILLS).map((p) => cleanPaint(p, keep)).filter((p): p is PaintLayer => !!p);
  const stroke = cleanStroke(v.stroke, keep);
  if (stroke) out.stroke = stroke;
  const shadows = cleanShadows(v.shadows, keep);
  if (shadows) out.shadows = shadows;
  if (typeof v.elevation === "number" && Number.isFinite(v.elevation)) out.elevation = Math.round(Math.min(4, Math.max(0, v.elevation))) as ItemLook["elevation"];
  const blur = lim(v.blur, "blur");
  if (blur !== undefined) out.blur = blur;
  const glassSaturate = lim(v.glassSaturate, "glassSaturate");
  if (glassSaturate !== undefined) out.glassSaturate = glassSaturate;
  const blend = oneOf(v.blend, BLEND_MODES);
  if (blend) out.blend = blend;
  const filter = cleanFilter(v.filter, keep);
  if (filter) out.filter = filter;
  const transform = cleanTransform(v.transform, keep);
  if (transform) out.transform = transform;
  const text = cleanText(v.text, keep);
  if (text) out.text = text;
  const texture = cleanTexture(v.texture, keep);
  if (texture) out.texture = texture;
  if (v.clip === true) out.clip = true;
  if (v.clearFill === true) out.clearFill = true;
  if (isRecord(v.vars)) {
    const named = v.vars;
    const vars: NonNullable<ItemLook["vars"]> = {};
    for (const k of ["opacity", "rotate", "radius"] as const) if (isVarName(named[k])) vars[k] = named[k];
    const keptVars = kept(keep, named, vars, LOOK_VARS);
    if (Object.keys(keptVars).length) out.vars = keptVars;
  }
  const all = kept(keep, v, out, LOOK_FIELDS);
  return Object.keys(all).length ? all : undefined;
}

/** the look with what is undefined taken out, or nothing when it is empty: what the panel writes back */
export function tidyLook(l: ItemLook | undefined): ItemLook | undefined {
  if (!l) return undefined;
  const out = Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined)) as ItemLook;
  return Object.keys(out).length ? out : undefined;
}

/** What a part held to a style may still carry: how much of it shows, how it is turned and scaled, a blur, a blend, and
 *  a level of the style's own elevation. The rest is the style's to decide. */
export const STRICT_LOOK_KEYS = ["opacity", "rotate", "transform", "blur", "blend", "elevation"] as const satisfies readonly (keyof ItemLook)[];

/** A material a part held to a style may still wear: tinted, by a role. It then takes its colour from the style's scheme
 *  and keeps only its relief, as a texture would (docs/m3e-material.md §4). */
export const strictMaterial = (p: PaintLayer): boolean => p.type === "material" && p.mode === "tint" && typeof p.tint === "string" && parseColor(p.tint) !== undefined && "role" in parseColor(p.tint)!;

/** the look as a style's rules allow it, or nothing when none of it may stay */
export function strictLook(l: ItemLook | undefined): ItemLook | undefined {
  if (!l) return undefined;
  const out: ItemLook = {};
  for (const k of STRICT_LOOK_KEYS) if (l[k] !== undefined) (out as Record<string, unknown>)[k] = l[k];
  const tinted = l.fills?.filter(strictMaterial);
  if (tinted?.length) out.fills = tinted;
  /* what a style decides goes; a field this version does not know is not one of those, and stays */
  const all = withUnknown(l, out, LOOK_FIELDS);
  return Object.keys(all).length ? all : undefined;
}

const LEGACY_FILL_ROLE = (t: ColorToken) => tokenRole(t);

type CssLayer = ReturnType<typeof textureLayers>[number] & { whole?: true };
/** a gradient layer, over the whole box: what a look of gradients alone needs say nothing more of */
const wholeBox = (image: string): CssLayer => ({ image, size: "100% 100%", position: "0 0", repeat: "no-repeat", blend: "normal", whole: true });
const LEGACY_TEXT_ROLE = (t: TextToken) => tokenRole(t);

/** The old fade into a role, as a paint layer the panel can edit: from nothing to that role. */
export function legacyGradient(l: ItemLook | undefined): PaintLayer | undefined {
  if (!isFillToken(l?.gradientTo)) return undefined;
  return { type: "linear", angle: l.gradientAngle ?? 180, stops: [{ color: "#0000", at: 0 }, { color: tokenRole(l!.gradientTo!), at: 100 }] };
}

/** The look as the style of the box it paints. The first look's fields are drawn exactly as they always were; the
 *  effects stand beside them, and where both speak (paint, shadows) the effects win. Words take theirs from
 *  `lookTextNodeStyle` and `lookGradientTextStyle` too. */
export function lookStyle(look: ItemLook | undefined): Record<string, string | number> {
  if (!look) return {};
  const l = cleanLook(look);
  if (!l) return {};
  const out: Record<string, string | number> = {};

  /* the first look */
  if (l.borderWidth) out.border = `${l.borderWidth}px solid ${roleVar(LEGACY_TEXT_ROLE(l.borderColor ?? "onSurfaceVariant"))}`;
  /* a bound number is read off its variable, held in the range the panel keeps it in */
  if (l.vars?.opacity) out.opacity = `clamp(0, ${boundCss(String(l.opacity ?? 100), l.vars.opacity)} / 100, 1)`;
  else if (l.opacity !== undefined && l.opacity < 100) out.opacity = l.opacity / 100;
  if (l.glass) {
    const saturate = round((l.glassSaturate ?? 150) / 100);
    out.backdropFilter = `blur(${l.glass}px) saturate(${saturate})`;
    out.WebkitBackdropFilter = out.backdropFilter;
  }
  if (l.vars?.rotate) out.rotate = `calc(clamp(-360, ${boundCss(String(l.rotate ?? 0), l.vars.rotate)}, 360) * 1deg)`;
  else if (l.rotate) out.rotate = `${l.rotate}deg`;
  if (l.font) out.fontFamily = FONT_OF[l.font];

  /* paint: a texture over the paint layers, over the part's own fill unless that is taken away */
  if (l.clearFill) out.backgroundColor = "transparent";
  const textures = textureLayers(l.texture);
  /* each paint layer is one background layer, a material one or two (lib/materialCss.ts), in the order of the fills */
  const paints: CssLayer[] = l.fills
    ? l.fills.flatMap((f) => (f.type === "material" ? materialPaintCss(f, colorCss) : [paintCss(f)].filter((p): p is string => !!p).map(wholeBox)))
    : l.gradientTo
      ? [wholeBox(`linear-gradient(${l.gradientAngle ?? 180}deg, transparent, ${roleVar(LEGACY_FILL_ROLE(l.gradientTo))})`)]
      : [];
  if (textures.length || paints.length) {
    const layers = [...textures, ...paints];
    out.backgroundImage = layers.map((t) => t.image).join(", ");
    /* gradients alone cover the box as a background image does by itself; a tiled layer says how each is laid */
    if (textures.length || paints.some((p) => !p.whole)) {
      out.backgroundSize = layers.map((t) => t.size).join(", ");
      out.backgroundPosition = layers.map((t) => t.position).join(", ");
      out.backgroundRepeat = layers.map((t) => t.repeat).join(", ");
      if (layers.some((t) => t.blend !== "normal")) out.backgroundBlendMode = layers.map((t) => t.blend).join(", ");
    }
  }

  /* shadows: the stroke on top, then the author's own, then the style's elevation */
  const stroke = strokeCss(l.stroke);
  const own = l.shadows ? l.shadows.map((s) => shadowCss(s)).filter((s): s is string => !!s) : undefined;
  /* level 0 is the style's surface laid flat; it may be "none", which cannot stand in a list, so it stands alone */
  const elevated = l.elevation ? [elevationVar(l.elevation as Level)] : [];
  if (!stroke.shadows.length && !elevated.length && !own) {
    if (l.shadow) out.boxShadow = LEGACY_SHADOW[l.shadow];
    else if (l.elevation === 0) out.boxShadow = elevationVar(0);
  } else {
    const legacy = !own && l.shadow && l.shadow !== "none" ? [LEGACY_SHADOW[l.shadow]] : [];
    const list = [...stroke.shadows, ...(own ?? legacy), ...elevated];
    out.boxShadow = list.length ? list.join(", ") : "none";
  }
  if (stroke.outline) {
    out.outline = stroke.outline;
    out.outlineOffset = stroke.outlineOffset!;
  }

  /* what the box is passed through */
  const f = l.filter ?? {};
  const filters = [
    l.blur ? `blur(${l.blur}px)` : "",
    f.brightness !== undefined && f.brightness !== 100 ? `brightness(${f.brightness}%)` : "",
    f.contrast !== undefined && f.contrast !== 100 ? `contrast(${f.contrast}%)` : "",
    f.saturate !== undefined && f.saturate !== 100 ? `saturate(${f.saturate}%)` : "",
    f.hueRotate ? `hue-rotate(${f.hueRotate}deg)` : "",
    f.grayscale ? `grayscale(${f.grayscale}%)` : "",
    f.sepia ? `sepia(${f.sepia}%)` : "",
    f.invert ? `invert(${f.invert}%)` : "",
  ].filter(Boolean);
  if (filters.length) out.filter = filters.join(" ");
  if (l.blend && l.blend !== "normal") out.mixBlendMode = l.blend;

  /* turned, scaled and slanted, none of it taking room */
  const tr = l.transform ?? {};
  const sx = round(((tr.scaleX ?? 100) / 100) * (tr.flipX ? -1 : 1));
  const sy = round(((tr.scaleY ?? 100) / 100) * (tr.flipY ? -1 : 1));
  if (sx !== 1 || sy !== 1) out.scale = `${sx} ${sy}`;
  if (tr.skewX || tr.skewY) out.transform = `skew(${tr.skewX ?? 0}deg, ${tr.skewY ?? 0}deg)`;
  if (l.clip) out.overflow = "hidden";

  /* words, as far as they are inherited: the size and weight a class gives a node are set on that node too */
  const t = l.text;
  if (t) {
    if (t.color && !t.gradient) Object.assign(out, wordColor(colorCss(t.color)!, t.cssVar));
    Object.assign(out, lookTextNodeStyle(l));
    if (t.decoration) out.textDecorationLine = t.decoration;
    const shadows = (t.shadows ?? []).map((s) => shadowCss(s, true)).filter((s): s is string => !!s);
    if (shadows.length && !t.gradient) out.textShadow = shadows.join(", ");
    if (!t.gradient) Object.assign(out, textStrokeCss(t));
  }
  return out;
}

/** every color a look names, for a picker's row of colors already in use */
export function colorsOfLook(l: ItemLook | undefined): ColorRef[] {
  if (!l) return [];
  const out: ColorRef[] = [];
  const paint = (p: PaintLayer | undefined) => {
    if (p?.type === "material") {
      if (p.tint) out.push(p.tint);
      return;
    }
    if (p?.color) out.push(p.color);
    for (const s of p?.stops ?? []) out.push(s.color);
  };
  l.fills?.forEach(paint);
  if (l.stroke) out.push(l.stroke.color);
  for (const s of l.shadows ?? []) out.push(s.color);
  if (l.text?.color) out.push(l.text.color);
  for (const s of l.text?.shadows ?? []) out.push(s.color);
  if (l.text?.stroke) out.push(l.text.stroke.color);
  paint(l.text?.gradient);
  if (l.texture?.color) out.push(l.texture.color);
  return out.filter(isColorRef);
}

/** The four corners as CSS: one radius read off the variable it is bound to in an exported app, held where the panel
 *  holds it, else each corner as it is. */
export function cornersCss(c: Radii, look: ItemLook | undefined): string {
  const bound = look?.vars && isVarName(look.vars.radius) ? look.vars.radius : undefined;
  return bound ? `calc(clamp(0, ${boundCss(String(c.tl), bound)}, 999) * 1px)` : `${c.tl}px ${c.tr}px ${c.br}px ${c.bl}px`;
}

/* ---------- presets ---------- */

export type LookPresetKey =
  | "softCard"
  | "floatingCard"
  | "bevel"
  | "glossButton"
  | "glass"
  | "neumorphic"
  | "neon"
  | "pressedLip"
  | "innerGlow"
  | "longShadow"
  | "embossedText"
  | "gameTitle"
  | "goldFrame"
  | "paper";

const sh = (x: number, y: number, blur: number, spread: number, color: ColorRef, inset?: boolean): LookShadow => (inset ? { x, y, blur, spread, color, inset } : { x, y, blur, spread, color });
const linear = (angle: number, ...stops: [ColorRef, number][]): ColorPaint => ({ type: "linear", angle, stops: stops.map(([color, at]) => ({ color, at })) });

/** One-click looks. Each is written as ordinary look fields, so whatever a preset sets can be changed afterwards, and
 *  most are in roles, so they take the style's and the mode's colors. */
export const LOOK_PRESETS: { key: LookPresetKey; look: ItemLook }[] = [
  { key: "softCard", look: { shadows: [sh(0, 1, 2, 0, "#0000000f"), sh(0, 6, 20, 0, "#0000001a")] } },
  { key: "floatingCard", look: { shadows: [sh(0, 2, 4, 0, "#00000014"), sh(0, 16, 36, -6, "#00000038")], stroke: { width: 1, color: "outline-variant/60" } } },
  {
    key: "bevel",
    look: {
      fills: [linear(180, ["#ffffff3d", 0], ["#ffffff00", 50], ["#00000029", 100])],
      shadows: [sh(0, 1, 0, 0, "#ffffff6b", true), sh(0, -1, 0, 0, "#00000059", true), sh(0, 2, 0, 0, "#00000059")],
      stroke: { width: 1, color: "#00000040" },
    },
  },
  {
    key: "glossButton",
    look: {
      fills: [linear(180, ["#ffffffa6", 0], ["#ffffff33", 48], ["#ffffff00", 52], ["#0000001f", 100])],
      shadows: [sh(0, 2, 0, 0, "#ffffff99", true), sh(0, 4, 0, 0, "#00000033"), sh(0, 4, 0, 0, "primary"), sh(0, 6, 10, 0, "#00000033")],
      stroke: { width: 2, color: "#00000040" },
      text: { weight: 800, shadows: [sh(0, 1, 0, 0, "#00000059")] },
    },
  },
  {
    key: "glass",
    look: {
      clearFill: true,
      glass: 18,
      glassSaturate: 180,
      fills: [linear(160, ["#ffffff59", 0], ["#ffffff14", 100])],
      stroke: { width: 1, color: "#ffffff66" },
      shadows: [sh(0, 1, 0, 0, "#ffffff59", true), sh(0, 8, 32, 0, "#00000033")],
      /* the part's own words were for its own fill, which is gone: these follow the mode, dark on light glass */
      text: { color: "on-surface" },
    },
  },
  { key: "neumorphic", look: { shadows: [sh(6, 6, 14, 0, "#0000002e"), sh(-6, -6, 14, 0, "#ffffffcc")], stroke: { width: 1, color: "#ffffff40" } } },
  {
    key: "neon",
    look: {
      fills: [{ type: "solid", color: "#0b0a18" }],
      stroke: { width: 2, color: "primary", position: "center" },
      shadows: [sh(0, 0, 8, 0, "primary/80"), sh(0, 0, 26, 2, "primary/45"), sh(0, 0, 14, 0, "primary/40", true)],
      text: { color: "#ffffff", shadows: [sh(0, 0, 4, 0, "primary"), sh(0, 0, 14, 0, "primary/70")] },
    },
  },
  {
    key: "pressedLip",
    look: {
      fills: [linear(180, ["#ffffff38", 0], ["#ffffff00", 55]), { type: "solid", color: "primary" }],
      /* a dark film over a copy of the fill, both set down under the button: the lip is the fill's own color, darker */
      shadows: [sh(0, 2, 0, 0, "#ffffff59", true), sh(0, 6, 0, 0, "#00000047"), sh(0, 6, 0, 0, "primary"), sh(0, 9, 8, 0, "#00000033")],
      text: { color: "on-primary", weight: 800, shadows: [sh(0, 2, 0, 0, "#00000040")] },
    },
  },
  { key: "innerGlow", look: { shadows: [sh(0, 0, 18, 2, "primary/45", true)], stroke: { width: 1, color: "primary/60" } } },
  {
    key: "longShadow",
    look: { shadows: [2, 4, 6, 8, 10, 12, 14, 16].map((d) => sh(d, d, 0, 0, "#00000017")) },
  },
  { key: "embossedText", look: { text: { color: "on-surface-variant", weight: 700, shadows: [sh(0, 1, 0, 0, "#ffffffb3"), sh(0, -1, 0, 0, "#00000047")] } } },
  {
    key: "gameTitle",
    look: {
      font: "display",
      text: {
        weight: 900,
        case: "upper",
        letterSpacing: 1,
        gradient: linear(180, ["#fff8c4", 0], ["#ffd23f", 52], ["#ff9417", 100]),
        stroke: { width: 3, color: "#3a1c00" },
        shadows: [sh(0, 4, 0, 0, "#3a1c00"), sh(0, 6, 10, 0, "#00000066")],
      },
    },
  },
  {
    key: "goldFrame",
    look: {
      fills: [linear(180, ["#ffffff1f", 0], ["#00000026", 100])],
      stroke: { width: 2, color: "#e2bd4f" },
      shadows: [sh(0, 0, 0, 1, "#5a4300"), sh(0, 0, 0, 3, "#c9a227"), sh(0, 0, 0, 4, "#5a4300"), sh(0, 0, 0, 3, "#fff3b0", true), sh(0, 0, 16, 0, "#00000059", true), sh(0, 6, 16, 0, "#00000059")],
    },
  },
  {
    key: "paper",
    look: {
      fills: [linear(180, ["#fffdf6", 0], ["#f1e6cf", 100])],
      texture: { kind: "paper", color: "#6b4f23", opacity: 30 },
      shadows: [sh(0, 1, 2, 0, "#0000001f"), sh(0, 6, 14, -2, "#00000024")],
      text: { color: "#3b2f1e" },
    },
  },
];

export const presetOf = (key: LookPresetKey) => LOOK_PRESETS.find((p) => p.key === key)?.look;

/** A preset over a look: it takes the place of the paint, the lines, the shadows, the words and the texture, and leaves
 *  how the part is turned and how much of it shows as they were. */
export function withPreset(current: ItemLook | undefined, preset: ItemLook): ItemLook {
  const kept: ItemLook = {};
  for (const k of ["opacity", "rotate", "transform", "blend", "clip"] as const) if (current?.[k] !== undefined) (kept as Record<string, unknown>)[k] = current[k];
  return { ...kept, ...structuredClone(preset) };
}

/* ---------- what a model is told ---------- */

/** The look fields a model may write, said once in one place: the guide it reads (public/agent.md) does not spell them out. */
export function lookForModel(): string {
  return [
    "Any part with a surface may also carry `look`, its effects. Use it only where the idea asks for a crafted look (a game button, a glass panel, a title); most parts need none.",
    "Colors in a look are an M3 role in kebab case (`primary`, `on-primary`, `primary-container`, `surface-container-high`, `on-surface`, `outline`, `error`…), a role at a share (`primary/40`), or a hex (`#rrggbb`, `#rrggbbaa`). Nothing else.",
    "`clearFill: true` takes the part's own fill away, so only its paint and what is behind it show (glass). `fills`: paint over the fill, top first: `{ \"type\": \"solid\", \"color\" }` or `{ \"type\": \"linear\" | \"radial\" | \"conic\", \"stops\": [{ \"color\", \"at\": 0–100 }, …], \"angle\", \"x\", \"y\" }`.",
    "`stroke`: `{ \"width\", \"color\", \"style\": \"solid\" | \"dashed\" | \"dotted\", \"position\": \"inside\" | \"center\" | \"outside\" }`. `shadows`: `[{ \"x\", \"y\", \"blur\", \"spread\", \"color\", \"inset\": true }]`, an empty list for none. `elevation`: 0–4, the style's own shadow.",
    "`opacity` 0–100, `blur` px, `glass` px (frosted backdrop) with `glassSaturate` %, `blend` (a CSS mix-blend-mode), `filter`: `{ \"brightness\", \"contrast\", \"saturate\", \"grayscale\", \"sepia\", \"invert\" (percent), \"hueRotate\" (deg) }`.",
    "`rotate` deg, `transform`: `{ \"scaleX\", \"scaleY\" (percent), \"skewX\", \"skewY\" (deg), \"flipX\", \"flipY\" }`. `clip: true` cuts off what reaches past the edge.",
    "`text`: `{ \"color\", \"size\" px, \"weight\" 100–900, \"letterSpacing\" px, \"lineHeight\" %, \"case\": \"upper\" | \"lower\" | \"title\", \"italic\", \"decoration\", \"shadows\", \"stroke\": { \"width\", \"color\" }, \"gradient\": a linear, radial or conic paint }`.",
    "A fill may also be a material of the document's library (its `materials`, each with an id, a name and its colours): `{ \"type\": \"material\", \"material\": <id>, \"mode\": \"surface\" | \"tint\", \"tint\": a color, \"scale\": 5–400 (percent of its tile), \"x\", \"y\" (percent of a tile), \"opacity\": 0–100, \"blend\" }`. `surface` lays the material as it is; `tint` lays its relief over the color (a role follows the theme and light or dark). Name only a material id the document has; a material cannot be made or drawn here.",
    `\`texture\`: \`{ "kind": ${TEXTURE_KINDS.map((k) => `"${k}"`).join(" | ")}, "color", "opacity", "size" }\`. Example: \`"look": { "fills": [{ "type": "linear", "angle": 180, "stops": [{ "color": "#ffffff66", "at": 0 }, { "color": "#ffffff00", "at": 50 }] }], "shadows": [{ "x": 0, "y": 6, "blur": 0, "spread": 0, "color": "#00000040" }] }\`.`,
  ].join("\n");
}
