import { EXTERNAL } from "./externals";
import { FILE_OF } from "./files.generated";
import { isNode, isRaw, isWrap, type PNode, type PValue } from "./node";
import { WIDGET_SOURCES } from "./widgets/sources";

const str = (s: string) => JSON.stringify(s);

/** text as a JSX child: plain when it can be, an expression when it holds a brace or an angle */
const text = (s: string) => (/[{}<>]|^\s|\s$/.test(s) ? `{${str(s)}}` : s);

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
  if (typeof v === "string" && !/["\\\n]/.test(v)) return `${name}=${str(v)}`;
  return `${name}={${printValue(v, keepTap)}}`;
}

/* `data-tap` is the canvas's own mark for a tappable place inside a part. The printed code keeps it
 *  only on a part whose wrapper tells its places apart by it (see `Pressable` in lib/runtimeSource.ts) */
const attrs = (node: PNode, keepTap: boolean) =>
  Object.entries(node.props ?? {})
    .filter(([k]) => keepTap || k !== "data-tap")
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
