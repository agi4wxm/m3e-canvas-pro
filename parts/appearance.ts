import type { ColorToken, Item, ItemLook, Radii, TextToken } from "../lib/tokens";
import { cornersCss, lookGradientTextStyle, lookStyle, lookTextNodeStyle } from "../lib/look";
import { mapNodes, type PNode, type PValue } from "./node";

/* A part's look, set beside its props: the fill role it paints itself with, the role its text reads in, its four corner
 * radii and its effects (lib/look.ts). They live on the item and are painted onto the part's tree as a fixed class map
 * plus inline style, so the canvas drawing and the printed code carry the same appearance. */

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

type Style = Record<string, PValue>;
const ownStyle = (props: Record<string, PValue>): Style => (typeof props.style === "object" && props.style !== null && !Array.isArray(props.style) ? (props.style as Style) : {});

const BACKGROUND_REST = { backgroundSize: "auto", backgroundPosition: "0 0", backgroundRepeat: "repeat" } as const;

/** A look's style over what a node already says. A picture the node paints itself stays under the look's paint rather
 *  than being replaced by it, at the size it had. */
function over(own: Style, look: Record<string, string | number>): Style {
  const out: Style = { ...own, ...look };
  if (typeof own.backgroundImage === "string" && typeof look.backgroundImage === "string") {
    out.backgroundImage = `${look.backgroundImage}, ${own.backgroundImage}`;
    for (const k of Object.keys(BACKGROUND_REST) as (keyof typeof BACKGROUND_REST)[])
      if (typeof look[k] === "string") out[k] = `${look[k]}, ${typeof own[k] === "string" ? own[k] : BACKGROUND_REST[k]}`;
  }
  return out;
}

/** marks a run of words a gradient was put on, so it is never wrapped twice */
const WORDS = "data-look-text";
const holdsWords = (n: PNode) => !!n.children?.some((c) => typeof c === "string" && c.trim() !== "");

/** The look's words, set on each node inside the painted one that holds words of its own: a class sets their size and
 *  weight on them, so what the painted node says would not reach them by inheritance alone. A gradient goes on each run
 *  of words in a span of its own, which clips it to the letters and leaves every surface its fill. */
function paintWords(tree: PNode, look: ItemLook): PNode {
  const own = lookTextNodeStyle(look);
  const gradient = lookGradientTextStyle(look);
  const sized = Object.keys(own).length > 0;
  if (!sized && !gradient) return tree;
  return mapNodes(tree, (n) => {
    if (n.props?.[WORDS] || !holdsWords(n)) return n;
    const props = sized ? { ...n.props, style: { ...ownStyle(n.props ?? {}), ...own } } : n.props;
    const children = gradient ? n.children!.map((c): PNode | string => (typeof c === "string" && c.trim() !== "" ? { type: "span", props: { [WORDS]: true, style: gradient }, children: [c] } : c)) : n.children;
    return { ...n, ...(props ? { props } : {}), children };
  });
}

/** paint `a` onto the nodes of `tree` whose type is `target` — the root when no target is named */
export function applyAppearance(tree: PNode, a: Appearance | undefined, target?: string | string[]): PNode {
  if (!a) return tree;
  const classes = [a.fill ? FILL_CLASS[a.fill]?.[0] : undefined, a.text ? TEXT_CLASS[a.text] : a.fill ? FILL_CLASS[a.fill]?.[1] : undefined]
    .filter((c): c is string => !!c)
    .join(" ");
  const look = lookStyle(a.look);
  const paint = (n: PNode): PNode => {
    const props = { ...n.props };
    if (classes) {
      const kept = (typeof props.className === "string" ? props.className.split(/\s+/) : []).filter((c) => c && !(a.fill && OWN_FILL.test(c)) && !(OWN_TEXT.test(c)));
      props.className = [...kept, ...classes.split(" ")].join(" ");
    }
    const style = { ...wordRoles(a), ...(a.corners ? { borderRadius: cornersCss(a.corners, a.look) } : {}), ...look };
    if (Object.keys(style).length) props.style = over(ownStyle(props), style);
    const painted = { ...n, props };
    return a.look ? paintWords(painted, a.look) : painted;
  };
  const targets = target === undefined ? [] : Array.isArray(target) ? target : [target];
  return targets.length ? mapNodes(tree, (n) => (targets.includes(n.type) && !n.props?.[WORDS] ? paint(n) : n)) : paint(tree);
}
