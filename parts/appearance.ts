import type { ColorToken, Item, ItemLook, Radii, TextToken } from "../lib/tokens";
import { mapNodes, type PNode } from "./node";

/* A part's look, set beside its props: the fill role it paints itself with, the role its text
 * reads in, and its four corner radii. They live on the item and are painted onto the part's tree as a fixed class map plus `style.borderRadius`,
 * so the canvas drawing and the printed code carry the same appearance. */

export type Appearance = { fill?: ColorToken; text?: TextToken; corners?: Radii; look?: ItemLook };

/** the palette role a fill paints with, and the on-role its text takes over it */
const FILL_CLASS: Record<ColorToken, [bg: string, on: string]> = {
  surface: ["bg-surface", "text-on-surface"],
  surfaceContainerLow: ["bg-surface-container-low", "text-on-surface"],
  surfaceContainer: ["bg-surface-container", "text-on-surface"],
  surfaceContainerHigh: ["bg-surface-container-high", "text-on-surface"],
  surfaceContainerHighest: ["bg-surface-container-highest", "text-on-surface"],
  primaryContainer: ["bg-primary-container", "text-on-primary-container"],
  secondaryContainer: ["bg-secondary-container", "text-on-secondary-container"],
  tertiaryContainer: ["bg-tertiary-container", "text-on-tertiary-container"],
  primary: ["bg-primary", "text-on-primary"],
  inverseSurface: ["bg-inverse-surface", "text-inverse-on-surface"],
};

const FILL_ROLE: Record<ColorToken, string> = {
  surface: "surface",
  surfaceContainerLow: "surface-container-low",
  surfaceContainer: "surface-container",
  surfaceContainerHigh: "surface-container-high",
  surfaceContainerHighest: "surface-container-highest",
  primaryContainer: "primary-container",
  secondaryContainer: "secondary-container",
  tertiaryContainer: "tertiary-container",
  primary: "primary",
  inverseSurface: "inverse-surface",
};

const TEXT_CLASS: Record<TextToken, string> = {
  onSurface: "text-on-surface",
  onSurfaceVariant: "text-on-surface-variant",
  primary: "text-primary",
  secondary: "text-secondary",
  onPrimaryContainer: "text-on-primary-container",
  onSecondaryContainer: "text-on-secondary-container",
  onTertiaryContainer: "text-on-tertiary-container",
  inverseOnSurface: "text-inverse-on-surface",
};

/** the classes a fill and a text role replace on what they paint: its own color, at any opacity;
 *  a background's position or size is not a color, and a hover or pressed look stays its own */
const OWN_FILL = /^bg-(?!gradient|cover|contain|center|no-repeat|clip|origin|fixed|local|scroll)/;
const OWN_TEXT = /^text-(on-|inverse-|primary|secondary|tertiary|error|outline|surface)/;

/** the look an item carries, or nothing when the part keeps its own */
export function appearanceOf(it: Pick<Item, "fill" | "textColor" | "corners" | "look">): Appearance | undefined {
  return it.fill || it.textColor || it.corners || it.look ? { fill: it.fill, text: it.textColor, corners: it.corners, ...(it.look ? { look: it.look } : {}) } : undefined;
}

const roleVar = (name: string) => `var(--md-sys-color-${name})`;
const mixRole = (name: string, percent: number) => `color-mix(in srgb, ${roleVar(name)} ${percent}%, transparent)`;

/** the shadows a part can be given; a style's own are what it has until then */
const SHADOW_OF: Record<NonNullable<ItemLook["shadow"]>, string> = {
  none: "none",
  soft: "0 2px 12px rgb(0 0 0 / 0.14)",
  deep: "0 10px 30px rgb(0 0 0 / 0.32)",
  hard: `4px 4px 0 ${roleVar("outline")}`,
  glow: `0 0 16px ${mixRole("primary", 70)}`,
};

const FONT_OF: Record<NonNullable<ItemLook["font"]>, string> = {
  display: "var(--st-display, inherit)",
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};

/** what a look draws, as the style of the node it paints */
function lookStyle(l: ItemLook | undefined): Record<string, string | number> {
  if (!l) return {};
  const out: Record<string, string | number> = {};
  if (l.borderWidth) out.border = `${l.borderWidth}px solid ${roleVar(TEXT_ROLE[l.borderColor ?? "onSurfaceVariant"])}`;
  if (l.shadow) out.boxShadow = SHADOW_OF[l.shadow];
  if (l.opacity !== undefined && l.opacity < 100) out.opacity = l.opacity / 100;
  if (l.glass) {
    out.backdropFilter = `blur(${l.glass}px) saturate(1.5)`;
    out.WebkitBackdropFilter = `blur(${l.glass}px) saturate(1.5)`;
  }
  if (l.rotate) out.rotate = `${l.rotate}deg`;
  if (l.gradientTo) out.backgroundImage = `linear-gradient(${l.gradientAngle ?? 180}deg, transparent, ${roleVar(FILL_ROLE[l.gradientTo])})`;
  if (l.font) out.fontFamily = FONT_OF[l.font];
  return out;
}

const radiusOf = (c: Radii) => `${c.tl}px ${c.tr}px ${c.br}px ${c.bl}px`;

/** the role words read in over a fill; a surface's own words already read over it */
const ON_FILL: Partial<Record<ColorToken, string>> = {
  primaryContainer: "on-primary-container",
  secondaryContainer: "on-secondary-container",
  tertiaryContainer: "on-tertiary-container",
  primary: "on-primary",
  inverseSurface: "inverse-on-surface",
};

const TEXT_ROLE: Record<TextToken, string> = {
  onSurface: "on-surface",
  onSurfaceVariant: "on-surface-variant",
  primary: "primary",
  secondary: "secondary",
  onPrimaryContainer: "on-primary-container",
  onSecondaryContainer: "on-secondary-container",
  onTertiaryContainer: "on-tertiary-container",
  inverseOnSurface: "inverse-on-surface",
};

/** A part names its words by role, deep inside it, and a fill or a text color on its surface has to
 *  reach them. So the painted node redefines the two roles those words read from, for its own subtree. */
function wordRoles(a: Appearance): Record<string, string> {
  const role = a.text ? TEXT_ROLE[a.text] : a.fill ? ON_FILL[a.fill] : undefined;
  if (!role) return {};
  const out: Record<string, string> = {};
  /* a role defined by itself is no value at all, so the one being read stays as it is */
  for (const name of ["on-surface", "on-surface-variant"]) if (name !== role) out[`--md-sys-color-${name}`] = `var(--md-sys-color-${role})`;
  return out;
}

/** paint `a` onto the nodes of `tree` whose type is `target` — the root when no target is named */
export function applyAppearance(tree: PNode, a: Appearance | undefined, target?: string | string[]): PNode {
  if (!a) return tree;
  const classes = [a.fill ? FILL_CLASS[a.fill][0] : undefined, a.text ? TEXT_CLASS[a.text] : a.fill ? FILL_CLASS[a.fill][1] : undefined]
    .filter((c): c is string => !!c)
    .join(" ");
  const paint = (n: PNode): PNode => {
    const props = { ...(n.props ?? {}) };
    if (classes) {
      const kept = (typeof props.className === "string" ? props.className.split(/\s+/) : []).filter((c) => c && !(a.fill && OWN_FILL.test(c)) && !(OWN_TEXT.test(c)));
      props.className = [...kept, ...classes.split(" ")].join(" ");
    }
    const style = { ...wordRoles(a), ...(a.corners ? { borderRadius: radiusOf(a.corners) } : {}), ...lookStyle(a.look) };
    if (Object.keys(style).length) props.style = { ...(typeof props.style === "object" && props.style !== null ? props.style : {}), ...style };
    return { ...n, props };
  };
  const targets = target === undefined ? [] : Array.isArray(target) ? target : [target];
  return targets.length ? mapNodes(tree, (n) => (targets.includes(n.type) ? paint(n) : n)) : paint(tree);
}
