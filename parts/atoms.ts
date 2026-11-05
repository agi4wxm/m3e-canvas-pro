import type { Node, Say } from "./templates/kit";

/* Building blocks for trees of atoms: what a kit is (parts/kits) and what a composite splits into
 * (`PartDef.atoms`). Each makes a plain `Node`; boxes lay out what they hold, so the tree stays
 * aligned however its words change. Plain data: no React, no registry. */

/** words: the same in every language, or one per language */
export type Words = string | Say;
type Props = Record<string, unknown>;
type Extra = Omit<Node, "slug" | "props" | "kids">;

/** any atom, by its id */
export const atom = (slug: string, props: Props = {}, extra: Extra = {}): Node => ({ slug, props, ...extra });

/** a box laying out what it holds; it hugs its contents both ways unless told otherwise */
export const box = (props: Props, kids: Node[], extra: Extra = {}): Node => ({
  slug: "box",
  props: { surface: "none", layout: "column", gap: 8, padX: 0, padY: 0, align: "start", justify: "start", hugWidth: true, hugHeight: true, ...props },
  ...extra,
  kids,
});

/** a row, centered across */
export const hbox = (props: Props, kids: Node[], extra: Extra = {}): Node => box({ layout: "row", align: "center", ...props }, kids, extra);

/** a column whose parts are as wide as it is */
export const vbox = (props: Props, kids: Node[], extra: Extra = {}): Node => box({ layout: "column", align: "stretch", ...props }, kids, extra);

/** a line of words that hugs them; `fixed` gives it a width to wrap in, which a stretching column then sets */
export const text = (words: Words, style = "body", more: Props = {}, extra: Extra = {}): Node => atom("text", { text: words, style, fit: "auto", ...more }, extra);

/** words that wrap in the room a column gives them */
export const para = (words: Words, style = "body", more: Props = {}, extra: Extra = {}): Node => atom("text", { text: words, style, fit: "fixed", ...more }, extra);

export const icon = (name: string, more: Props = {}, extra: Extra = {}): Node => atom("icon", { name, ...more }, extra);

export const iconButton = (name: string, label: Words, more: Props = {}, extra: Extra = {}): Node => atom("icon-button", { icon: name, label, variant: "ghost", ...more }, extra);

export const button = (label: Words, more: Props = {}, extra: Extra = {}): Node => atom("button", { label, ...more }, extra);

/** a bare one-line entry with no chrome of its own: the box around it is its field */
export const entry = (placeholder: Words, more: Props = {}, extra: Extra = {}): Node => atom("input", { variant: "plain", placeholder, ...more }, { grow: true, ...extra });

/** a bare entry of several lines that grows with what is typed */
export const area = (placeholder: Words, more: Props = {}, extra: Extra = {}): Node => atom("textarea", { variant: "plain", placeholder, rows: 1, autoGrow: true, ...more }, extra);

export const avatar = (initials: Words, more: Props = {}, extra: Extra = {}): Node => atom("avatar", { initials, ...more }, extra);

/** one chip: the chip atom holds a list of them, here just the one */
export const chip = (label: Words, more: Props = {}, extra: Extra = {}): Node => atom("chip", { items: [{ label }], ...more }, extra);

export const svg = (preset: string, more: Props = {}, extra: Extra = {}): Node => atom("svg", { mode: "preset", preset, ...more }, extra);

export const image = (more: Props = {}, extra: Extra = {}): Node => atom("image", more, extra);

export const line = (more: Props = {}, extra: Extra = {}): Node => atom("separator", more, extra);

/** the same four corners, for a node's `corners` */
export const round = (r: number) => ({ tl: r, tr: r, br: r, bl: r });

/** A tree with each box's measures settled against its box: one whose width (or height) its layout
 *  gives it, by stretching it across or by letting it take the rest of the run, stops hugging its
 *  contents on that axis. A box that hugs lays out what it holds by their own sizes, so a field in
 *  a stretched column would otherwise keep its narrow width. */
export function settleSizes(n: Node, parent?: Node): Node {
  let props = n.props;
  if (n.slug === "box" && parent) {
    const dir = parent.props.layout;
    const stretched = parent.props.align === "stretch";
    const grows = !!n.grow || n.fill === true;
    /* a grid's cell gives its width as a stretched column does */
    if (((dir === "column" || dir === "grid") && stretched) || (dir === "row" && grows)) props = { ...props, hugWidth: false };
    if ((dir === "row" && stretched) || (dir === "column" && grows)) props = { ...props, hugHeight: false };
  }
  const self = props === n.props ? n : { ...n, props };
  return n.kids ? { ...self, kids: n.kids.map((k) => settleSizes(k, self)) } : self;
}
