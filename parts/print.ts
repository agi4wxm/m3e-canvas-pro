import { EXTERNAL } from "./externals";
import { FILE_OF } from "./files.generated";
import { isNode, isRaw, isWrap, type PNode, type PValue } from "./node";
import { WIDGET_SOURCES } from "./widgets/sources";

/** A value as a JS literal. The two line separators a string may hold are escaped as well: inside a
 *  string they are fine, but code is not only strings, and one that reached a comment would end it. */
export const str = (v: unknown): string => (JSON.stringify(v) ?? "undefined").replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

/** what JSX would read as an entity (`&amp;`), and so not print as it is written */
const ENTITY = /&(#\d+|#x[\da-f]+|\w+);/i;

/** text as a JSX child: plain when it can be, an expression when it holds a brace, an angle or an entity */
const text = (s: string) => (/[{}<>]|^\s|\s$/.test(s) || ENTITY.test(s) ? `{${str(s)}}` : s);

/** a node that stands for an expression among JSX children: what a value worked out at run time prints as */
export const EXPR_NODE = "$expr";

/** a value as an expression (what goes between the braces of an attribute) */
export function printValue(v: PValue, keepTap = false): string {
  if (isRaw(v)) return v.$raw;
  if (isWrap(v)) return `(element) => <${v.$wrap} render={element} />`;
  if (isNode(v)) return v.type === EXPR_NODE ? printValue(v.props?.code, keepTap) : inlineNode(v, keepTap);
  if (Array.isArray(v)) return `[${v.map((x) => printValue(x, keepTap)).join(", ")}]`;
  if (typeof v === "object" && v !== null) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k)}: ${printValue(x, keepTap)}`).join(", ")} }` : "{}";
  }
  if (typeof v === "string") return str(v);
  return String(v);
}

/** `name="x"`, `name={…}` or a bare `name` for true; undefined and null print nothing */
function attr(name: string, v: PValue, keepTap: boolean): string | null {
  if (v === undefined || v === null) return null;
  if (v === true) return name;
  /* JSX reads an attribute's quotes as they are: plain only when the literal needs no escape at all */
  if (typeof v === "string" && str(v) === `"${v}"` && !ENTITY.test(v)) return `${name}=${str(v)}`;
  return `${name}={${printValue(v, keepTap)}}`;
}

/* `data-tap` is the canvas's own mark for a tappable place inside a part (`data-tap-lead` hands it to
 *  a half of a split button). The printed code keeps it only on a part whose wrapper tells its places
 *  apart by it (see `Pressable` in lib/runtimeSource.ts) */
const attrs = (node: PNode, keepTap: boolean) =>
  Object.entries(node.props ?? {})
    .filter(([k]) => keepTap || !k.startsWith("data-tap"))
    .map(([k, v]) => attr(k, v, keepTap))
    .filter((a): a is string => a !== null);

/** the whole node on one line */
export function inlineNode(node: PNode, keepTap = false): string {
  if (node.type === EXPR_NODE) return `{${printValue(node.props?.code, keepTap)}}`;
  const a = attrs(node, keepTap);
  const open = `${node.type}${a.length ? " " + a.join(" ") : ""}`;
  if (!node.children?.length) return `<${open} />`;
  return `<${open}>${node.children.map((c) => (typeof c === "string" ? text(c) : inlineNode(c, keepTap))).join("")}</${node.type}>`;
}

/** the names a node (and everything inside it, props included) uses, in order of first use */
export function namesIn(node: PNode, into = new Set<string>()): Set<string> {
  const visit = (v: PValue): void => {
    if (isRaw(v)) for (const u of v.uses ?? []) into.add(u);
    else if (isWrap(v)) into.add(v.$wrap);
    else if (isNode(v)) namesIn(v, into);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object" && v !== null) Object.values(v).forEach(visit);
  };
  if (node.type in FILE_OF || node.type in EXTERNAL || node.type in WIDGET_SOURCES) into.add(node.type);
  Object.values(node.props ?? {}).forEach(visit);
  for (const c of node.children ?? []) if (typeof c !== "string") namesIn(c, into);
  return into;
}

/** the registry item a module file belongs to: every file is an item of its own */
export const itemOfFile = (file: string) => file;

/** M3E components whose copy in this repo (components/m3e) takes values the shadcn M3E registry's copy
 *  does not: by component, the files that carry them and, by prop, the values that are this copy's own.
 *  Code that uses one of these gets them only from this repo's files, so the code copied out of the
 *  editor says to take those files (a downloaded project has them already). */
export const LOCAL_M3E: Record<string, { files: string[]; props: Record<string, string[]> }> = {
  Button: { files: ["button"], props: { variant: ["ghost"], size: ["icon-xs"] } },
  Input: { files: ["input"], props: { variant: ["plain"] } },
  /* its variants are the input's */
  Textarea: { files: ["textarea", "input"], props: { variant: ["plain"] } },
};

/** The files of this repo's own a tree needs, each with the values that need it (`Button variant="ghost"`):
 *  what a node says itself, and what a value worked out at run time can come to. */
export function localUsesIn(node: PNode, into = new Map<string, Set<string>>()): Map<string, Set<string>> {
  const own = LOCAL_M3E[node.type];
  if (own)
    for (const [prop, values] of Object.entries(own.props)) {
      const v = node.props?.[prop];
      for (const value of values) {
        if (v !== value && !(isRaw(v) && v.$raw.includes(str(value)))) continue;
        for (const file of own.files) into.set(file, (into.get(file) ?? new Set<string>()).add(`${node.type} ${prop}=${str(value)}`));
      }
    }
  const visit = (v: PValue): void => {
    if (isNode(v)) localUsesIn(v, into);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v === "object" && v !== null && !isRaw(v) && !isWrap(v)) Object.values(v).forEach(visit);
  };
  Object.values(node.props ?? {}).forEach(visit);
  for (const c of node.children ?? []) if (typeof c !== "string") localUsesIn(c, into);
  return into;
}
