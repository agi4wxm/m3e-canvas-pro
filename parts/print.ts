import { EXTERNAL } from "./externals";
import { FILE_OF } from "./files.generated";
import { isNode, isRaw, isWrap, type PNode, type PValue } from "./node";
import { WIDGET_SOURCES } from "./widgets/sources";

const str = (s: string) => JSON.stringify(s);

/** text as a JSX child: plain when it can be, an expression when it holds a brace or an angle */
const text = (s: string) => (/[{}<>]|^\s|\s$/.test(s) ? `{${str(s)}}` : s);

/** a value as an expression (what goes between the braces of an attribute) */
function expr(v: PValue): string {
  if (isRaw(v)) return v.$raw;
  if (isWrap(v)) return `(element) => <${v.$wrap} render={element} />`;
  if (isNode(v)) return inlineNode(v);
  if (Array.isArray(v)) return `[${v.map(expr).join(", ")}]`;
  if (typeof v === "object" && v !== null) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k)}: ${expr(x)}`).join(", ")} }` : "{}";
  }
  if (typeof v === "string") return str(v);
  return String(v);
}

/** `name="x"`, `name={…}` or a bare `name` for true; undefined and null print nothing */
function attr(name: string, v: PValue): string | null {
  if (v === undefined || v === null) return null;
  if (v === true) return name;
  if (typeof v === "string" && !/["\\\n]/.test(v)) return `${name}=${str(v)}`;
  return `${name}={${expr(v)}}`;
}

/* `data-tap` is the canvas's own mark for a tappable place inside a part; the printed code has
 *  no use for it */
const attrs = (node: PNode) =>
  Object.entries(node.props ?? {})
    .filter(([k]) => k !== "data-tap")
    .map(([k, v]) => attr(k, v))
    .filter((a): a is string => a !== null);

/** the whole node on one line */
export function inlineNode(node: PNode): string {
  const a = attrs(node);
  const open = `${node.type}${a.length ? " " + a.join(" ") : ""}`;
  if (!node.children?.length) return `<${open} />`;
  return `<${open}>${node.children.map((c) => (typeof c === "string" ? text(c) : inlineNode(c))).join("")}</${node.type}>`;
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
