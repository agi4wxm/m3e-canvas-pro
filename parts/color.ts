/* The one color value type (docs/组件规范.md "颜色"): every color a document holds, a part's color prop and a look's
 * paint alike, is a role of the scheme in kebab case (`primary`, `on-surface-variant`), the same role at a share of
 * itself (`primary/40`), or a hex of the author's own (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`). A role follows the
 * style and the mode; a hex stays what it is. Nothing else is a color: `parseColor` is the one reader, and whatever it
 * refuses never reaches a style (no address, no expression, no CSS of a file's own).
 *
 * A part's color prop (`kind: "color"`) holds one of these, or "" for none set: the part's own color (a text's ink, an
 * icon that takes the color of the words around it) or no paint at all (a container without a fill); its `none` says
 * which. The roles a part was designed around (its `roles`) are drawn as they always were, by the part's own classes;
 * any other color is painted as a style (`paintOf`), so an old document draws the same tree.
 *
 * Plain functions over plain data with no imports: the parts, the editor, the tools and the exported apps read it. */

/** a color as a document writes it (lib/tokens.ts `ColorRef`) */
type ColorValue = string;

/** The roles a color may name. Every theme defines them as `--md-sys-color-<role>` (lib/m3e/color.ts), and a style
 *  repaints the ones it has its own colors for, so a role follows the style and the mode. */
export const COLOR_ROLES = [
  "primary",
  "on-primary",
  "primary-container",
  "on-primary-container",
  "inverse-primary",
  "primary-fixed",
  "primary-fixed-dim",
  "on-primary-fixed",
  "on-primary-fixed-variant",
  "secondary",
  "on-secondary",
  "secondary-container",
  "on-secondary-container",
  "secondary-fixed",
  "secondary-fixed-dim",
  "on-secondary-fixed",
  "on-secondary-fixed-variant",
  "tertiary",
  "on-tertiary",
  "tertiary-container",
  "on-tertiary-container",
  "tertiary-fixed",
  "tertiary-fixed-dim",
  "on-tertiary-fixed",
  "on-tertiary-fixed-variant",
  "error",
  "on-error",
  "error-container",
  "on-error-container",
  "background",
  "on-background",
  "surface",
  "on-surface",
  "surface-variant",
  "on-surface-variant",
  "surface-dim",
  "surface-bright",
  "surface-container-lowest",
  "surface-container-low",
  "surface-container",
  "surface-container-high",
  "surface-container-highest",
  "inverse-surface",
  "inverse-on-surface",
  "surface-tint",
  "outline",
  "outline-variant",
  "shadow",
  "scrim",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
const ROLES = new Set<string>(COLOR_ROLES);

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const ROLE_REF = /^([a-z]+(?:-[a-z]+)*)(?:\/(\d{1,3}))?$/;

/** a color reference taken apart: a role, or six hex digits, with how much of it shows (0 to 100) */
export type ParsedColor = { role: ColorRole; alpha: number } | { hex: string; alpha: number };

/** reads a color reference, or nothing when it is not one */
export function parseColor(v: unknown): ParsedColor | undefined {
  if (typeof v !== "string" || v.length > 40) return undefined;
  const hex = HEX.exec(v);
  if (hex) {
    const d = hex[1].toLowerCase();
    const full = d.length <= 4 ? [...d].map((c) => c + c).join("") : d;
    /* kept exact, so a hex reads back to the same digits */
    const alpha = full.length === 8 ? (parseInt(full.slice(6), 16) / 255) * 100 : 100;
    return { hex: `#${full.slice(0, 6)}`, alpha };
  }
  const role = ROLE_REF.exec(v);
  if (!role || !ROLES.has(role[1])) return undefined;
  const alpha = role[2] === undefined ? 100 : Number(role[2]);
  return alpha <= 100 ? { role: role[1] as ColorRole, alpha } : undefined;
}

export const isColorRef = (v: unknown): v is ColorValue => parseColor(v) !== undefined;

const alphaHex = (alpha: number) =>
  Math.round((Math.max(0, Math.min(100, alpha)) / 100) * 255)
    .toString(16)
    .padStart(2, "0");

/** a parsed color written back as a reference, the shortest way it can be said */
export function formatColor(c: ParsedColor): ColorValue {
  if ("role" in c) {
    const alpha = Math.max(0, Math.min(100, Math.round(c.alpha)));
    return alpha === 100 ? c.role : `${c.role}/${alpha}`;
  }
  const byte = alphaHex(c.alpha);
  return byte === "ff" ? c.hex : `${c.hex}${byte}`;
}


/** A part's color prop's value as it reads: "" (none set) or a color; undefined for anything else. */
export const colorValue = (v: unknown): ColorValue | undefined => (v === "" ? "" : typeof v === "string" && parseColor(v) ? v : undefined);

/** a color as CSS: a role as its custom property (at a share of itself, mixed with nothing), a hex as it is */
export function cssColor(ref: ColorValue): string | undefined {
  const c = parseColor(ref);
  if (!c) return undefined;
  /* a hex as the author wrote it: what it draws is the same either way, and the tree stays as it was */
  if ("hex" in c) return ref;
  const role = `var(--md-sys-color-${c.role})`;
  return c.alpha >= 100 ? role : `color-mix(in srgb, ${role} ${Math.round(c.alpha)}%, transparent)`;
}

/** the role a color names at full strength, else undefined (a share of a role, a hex) */
export function roleOf(ref: ColorValue): ColorRole | undefined {
  const c = parseColor(ref);
  return c && "role" in c && c.alpha >= 100 ? c.role : undefined;
}

/** The color words read in over a fill of this color: a role's own on-color (`primary` → `on-primary`, a container's
 *  `on-…-container`), a surface's `on-surface`, and over a hex black or white, whichever stands out more. */
export function onColorOf(ref: ColorValue): ColorValue {
  const c = parseColor(ref);
  if (!c) return "on-surface";
  if ("role" in c) {
    const r = c.role;
    if (r === "inverse-surface") return "inverse-on-surface";
    if (r.startsWith("on-") || r === "inverse-on-surface") return "surface";
    if (r === "background" || r.startsWith("surface") || r === "outline" || r === "outline-variant" || r === "shadow" || r === "scrim") return r === "outline" || r === "shadow" || r === "scrim" ? "surface" : "on-surface";
    const on = `on-${r.replace(/-dim$/, "")}`;
    return (COLOR_ROLES as readonly string[]).includes(on) ? on : "on-surface";
  }
  const n = parseInt(c.hex.slice(1), 16);
  const lin = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
  return l > 0.179 ? "#000000" : "#ffffff";
}

/** What a part paints for a color prop: the class it always drew for a color it was designed around (one of its
 *  `classes`), else the color as a style of `css` (`color` for ink, `background` for a fill). "" with no class paints
 *  nothing. */
export function paintOf(ref: ColorValue, classes: Record<string, string | undefined>, css: "color" | "background" | "borderColor"): { className?: string; style?: Record<string, string> } {
  if (Object.prototype.hasOwnProperty.call(classes, ref)) return classes[ref] ? { className: classes[ref] } : {};
  const v = cssColor(ref);
  return v ? { style: { [css]: v } } : {};
}

/** The colors a color prop is drawn each way with where only a few can be (a printed app that picks among drawings, a
 *  panel's swatches): its default, the roles it was designed around, and none. */
export const colorChoicesOf = (d: { default: string; roles?: string[] }): string[] => [...new Set([d.default, ...(d.roles ?? []), ""])];

/** A list of colors given as words (a palette's colors as a tap sets them, or an expression gives them: "#6750A4,primary"),
 *  as rows of the row model: each a color and the name it is read out by, its color. */
export const colorRowsOf = (words: string): { label: string; color: string }[] =>
  words
    .split(/[,\n]/)
    .map((w) => w.trim())
    .map((c) => ({ label: c, color: c }));
