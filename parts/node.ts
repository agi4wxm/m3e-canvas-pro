import type { ListItem, PartSlot } from "./types";

/* A part is a small JSX tree. The same tree is drawn on the canvas (render.tsx), printed as
 * code (print.ts) and described in the prompt, so what you see is what the code builds. */

/** an expression the code prints as it is and the canvas does not run (an event handler) */
type PRaw = { $raw: string; uses?: string[] };

/** a render prop that wraps the element it is given in a component: `(button) => <Name render={button} />` */
type PWrap = { $wrap: string };

export type PValue = string | number | boolean | null | undefined | PNode | PRaw | PWrap | PValue[] | { [key: string]: PValue };

/** `type` is a shadcn M3E component name ("Button") or a lowercase HTML tag ("div") */
export type PNode = { type: string; props?: Record<string, PValue>; children?: (PNode | string)[] };

/** build a node; `props` may be left out */
export function h(type: string, props?: Record<string, PValue> | null, ...children: (PNode | string | false | null | undefined)[]): PNode {
  const node: PNode = { type };
  if (props) node.props = props;
  const kids = children.filter((c): c is PNode | string => c !== false && c !== null && c !== undefined);
  if (kids.length) node.children = kids;
  return node;
}

/** a copy of a tree with `fn` applied to every node, the root first */
export function mapNodes(node: PNode, fn: (n: PNode) => PNode): PNode {
  const next = fn(node);
  const deep = (v: PValue): PValue => {
    if (isNode(v)) return mapNodes(v, fn);
    if (Array.isArray(v)) return v.map(deep);
    if (typeof v === "object" && v !== null && !isRaw(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
    return v;
  };
  return {
    ...next,
    props: next.props && Object.fromEntries(Object.entries(next.props).map(([k, v]) => [k, deep(v)])),
    children: next.children?.map((c) => (typeof c === "string" ? c : mapNodes(c, fn))),
  };
}

/** a render prop that hands the element to `<Name render={element} />` (a menu trigger around a button) */
export const wrap = (name: string): PWrap => ({ $wrap: name });

/** `<Icon name="…" />` */
export const ic = (name: string, props?: Record<string, PValue>): PNode => h("Icon", { name, ...props });

/** code the canvas prints but never runs; `uses` names the imports it needs (`toast`) */
export const raw = (code: string, ...uses: string[]): PRaw => (uses.length ? { $raw: code, uses } : { $raw: code });

/** a list's rows as places to tap: each answers to the `data-tap` a tree gives it */
export const listSlots = (items: ListItem[]): PartSlot[] => items.map((it, i) => ({ key: `tab:${i}`, label: it.label || `${i + 1}`, icon: it.icon }));

/** A node is what `h` builds: a `type` and at most its props and children. A value that carries a `type` beside other
 *  keys is data (a world view's input `{ name: "move", type: "vec2" }`, a row of the design's data with a Type column):
 *  read as a node, the canvas would draw it and the code print it as an element `<vec2 />`. */
const NODE_KEYS = new Set(["type", "props", "children"]);
export const isNode = (v: unknown): v is PNode => typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as PNode).type === "string" && Object.keys(v).every((k) => NODE_KEYS.has(k));
export const isWrap = (v: unknown): v is PWrap => typeof v === "object" && v !== null && typeof (v as PWrap).$wrap === "string";
export const isRaw = (v: unknown): v is PRaw => typeof v === "object" && v !== null && typeof (v as PRaw).$raw === "string";
