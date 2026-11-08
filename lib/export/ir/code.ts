/* The code builders both screen printers (lib/export/rn/print.ts, lib/export/miniapp/print.ts) print with: values as
 * expressions, JSX as data (an element, an expression among its children, a part drawn on a condition, a list drawn
 * per element, one of several by a value) printed at a depth, the imports of a file as a set, and names made of the
 * letters and digits of the author's words. A printer builds these; it never puts code together by cutting or
 * searching other code (report 9.6).
 *
 * Every word of a document reaches code only as a string (`str`), never as JSX text or a comment, and every name the
 * code is given is made of letters and digits (lib/exportInjection.test.ts). */

import { str } from "../../../parts/print";
import { sanitizeSvg } from "../../../parts/svg";
import { isNode, type PNode } from "../../../parts/node";

export { str };

/** an attribute's or a key's name as a printer chooses it: letters and digits */
export const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** code standing where a value is printed (a picture the app bundles, read from its images module: `IMAGES.image1`) */
export class Raw {
  constructor(readonly code: string) {}
}

/** A value as an expression: numbers, words (as strings), lists and objects of them, code where it is `Raw`. `nil` is
 *  what `null` prints as: the phone's kit reads a missing value (`undefined`), the mini-program's runtime a null. */
export function exprOf(v: unknown, nil: "undefined" | "null" = "undefined"): string {
  if (v instanceof Raw) return v.code;
  if (v === null) return nil;
  if (v === undefined) return "undefined";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "0";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return str(v);
  if (Array.isArray(v)) return `[${v.map((x) => exprOf(x, nil)).join(", ")}]`;
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return `{ ${entries.map(([k, x]) => `${NAME.test(k) ? k : str(k)}: ${exprOf(x, nil)}`).join(", ")} }`;
  }
  return "undefined";
}

/** an object literal of printed `key: value` entries; `{}` with none */
export const objOf = (entries: string[]) => (entries.length ? `{ ${entries.join(", ")} }` : "{}");

/** whether two values are the same data */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- JSX as data ---------- */

/** an element: a kit component (or "" for a fragment) with its props, each an expression already printed */
export type El = { tag: string; props: [string, string][]; kids: J[] };
/** an expression among an element's children: `{code}` */
export type Expr = { expr: string };
/** what is drawn only while `when` holds */
export type When = { when: string; show: J[] };
/** a list drawn once per element (`.map`), each in a `Fragment` keyed by `keyOf`, after the lines it reads first */
export type Each = { each: string; item: string; index: string; pre: string[]; body: J[] };
/** one of several, by what `on` is */
export type Cases = { on: string; branches: [string, J[]][] };
/** a function among the children (a render prop): its parameters, the lines before what it returns, and what it returns */
export type Fn = { params: string; pre: string[]; returns: J };
export type J = El | Expr | When | Each | Cases | Fn;

export const el = (tag: string, props: [string, string][] = [], kids: J[] = []): El => ({ tag, props, kids });
export const when = (test: string, inner: J): When => ({ when: test, show: [inner] });
export const isEl = (j: J): j is El => "tag" in j;

/** an attribute as JSX writes it: a bare word for true, a quoted string when it holds nothing a quote could end */
export function attr(name: string, value: string): string {
  if (value === "true") return name;
  if (/^"[\w .,:#%/()+-]*"$/.test(value)) return `${name}=${value}`;
  return `${name}={${value}}`;
}

const pad = (depth: number) => "  ".repeat(depth);

/** what is drawn as one: itself, else its pieces in a fragment */
const one = (kids: J[]): J => (kids.length === 1 && isEl(kids[0]) ? kids[0] : el("", [], kids));

/** JSX as indented code, at a depth */
export function jsx(j: J, depth: number): string {
  const p = pad(depth);
  if ("expr" in j) return `${p}{${j.expr}}`;
  if ("when" in j) return `${p}{${j.when} ? (\n${jsx(one(j.show), depth + 1)}\n${p}) : null}`;
  if ("each" in j) {
    const pre = j.pre.map((l) => `${p}  ${l}`).join("\n");
    return `${p}{${j.each}.map((${j.item}, ${j.index}) => {\n${pre}${pre ? "\n" : ""}${p}  return (\n${p}    <Fragment key={keyOf(${j.item}, ${j.index})}>\n${j.body.map((k) => jsx(k, depth + 3)).join("\n")}\n${p}    </Fragment>\n${p}  );\n${p}})}`;
  }
  if ("on" in j) {
    const lines = [`${p}{`];
    for (const [value, kids] of j.branches) lines.push(`${pad(depth + 1)}${j.on} === ${str(value)} ? (`, jsx(kids.length === 1 ? kids[0] : el("", [], kids), depth + 2), `${pad(depth + 1)}) :`);
    lines.push(`${pad(depth + 1)}null}`);
    return lines.join("\n");
  }
  if ("returns" in j) return [`${p}{(${j.params}) => {`, ...j.pre.map((l) => `${pad(depth + 1)}${l}`), `${pad(depth + 1)}return (`, jsx(j.returns, depth + 2), `${pad(depth + 1)});`, `${p}}}`].join("\n");
  if (!j.tag) return `${p}<>\n${j.kids.map((k) => jsx(k, depth + 1)).join("\n")}\n${p}</>`;
  const attrs = j.props.map(([k, v]) => attr(k, v));
  const open = `<${j.tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}`;
  const long = p.length + open.length > 120 || open.includes("\n");
  const head = long ? `<${j.tag}\n${attrs.map((a) => `${p}  ${a.replace(/\n/g, `\n${p}  `)}`).join("\n")}\n${p}` : open;
  if (!j.kids.length) return `${p}${head}${long ? "/>" : " />"}`;
  return `${p}${head}>\n${j.kids.map((k) => jsx(k, depth + 1)).join("\n")}\n${p}</${j.tag}>`;
}

/** whether a tree of JSX draws an element of this tag anywhere */
export function draws(j: J | J[], tag: string): boolean {
  if (Array.isArray(j)) return j.some((x) => draws(x, tag));
  if ("tag" in j) return j.tag === tag || draws(j.kids, tag);
  if ("when" in j) return draws(j.show, tag);
  if ("each" in j) return draws(j.body, tag);
  if ("on" in j) return j.branches.some(([, kids]) => draws(kids, tag));
  if ("returns" in j) return draws(j.returns, tag);
  return false;
}

/* ---------- handlers ---------- */

/** A function as code: what it takes and the expression it runs. Kept apart until it is printed, so a printer that
 *  runs more after it (a layer that closes once a place of it is tapped) adds to its body, not to its text. */
export type Handler = { params: string; body: string };
export const handler = (body: string, params = ""): Handler => ({ params, body });
export const printHandler = (h: Handler) => `(${h.params}) => ${h.body}`;
/** the handler, then more after it, as one expression */
export const andThen = (h: Handler, more: string): Handler => ({ params: h.params, body: `(${h.body}, ${more})` });

/* ---------- imports ---------- */

/** The names a file imports from one module, each a value or a type. `line` prints them as the printer's files have
 *  them: `mixed` sorts every name by its own (a type among the values, `type Action`), `split` the values first, then
 *  the types. */
export class Imports {
  private values = new Set<string>();
  private types = new Set<string>();
  add(name: string): this {
    this.values.add(name);
    return this;
  }
  type(name: string): this {
    this.types.add(name);
    return this;
  }
  has(name: string): boolean {
    return this.values.has(name) || this.types.has(name);
  }
  get size(): number {
    return this.values.size + this.types.size;
  }
  /** the names, `type X` for a type, in the order `line` prints them */
  names(order: "mixed" | "split"): string[] {
    const values = [...this.values].filter((v) => !this.types.has(v));
    if (order === "split") return [...values.sort(), ...[...this.types].sort().map((t) => `type ${t}`)];
    return [...values.map((v) => [v, v] as const), ...[...this.types].map((t) => [t, `type ${t}`] as const)].sort((a, b) => a[0].localeCompare(b[0])).map(([, n]) => n);
  }
  line(from: string, order: "mixed" | "split"): string {
    return `import { ${this.names(order).join(", ")} } from ${str(from)};`;
  }
}

/* ---------- names ---------- */

/** A name made of the letters and digits of the author's words, each word capitalized, unique among those taken where
 *  case does not count (each is a file's name too: one file on macOS and Windows); `fallback` when the words give
 *  none; `lower` starts it with a small letter. */
export function nameOf(words: string, fallback: string, taken: Set<string>, suffix = "", lower = false): string {
  const parts = (words.match(/[A-Za-z0-9]+/g) ?? []).map((w) => w[0].toUpperCase() + w.slice(1));
  let base = parts.join("");
  if (!base || /^\d/.test(base)) base = fallback;
  else if (suffix && !base.endsWith(suffix)) base += suffix;
  if (lower) base = base[0].toLowerCase() + base.slice(1);
  let out = base;
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${base}${i}`;
  taken.add(out.toLowerCase());
  return out;
}

/** the printer's own characters (U+E000 to U+E01F) are cleared from a document's words first, as lib/codegen.ts does */
const PRINTER_MARKS = /[-]/g;
export function withoutMarks<T>(value: T): T {
  if (typeof value === "string") return value.replace(PRINTER_MARKS, "") as T;
  if (Array.isArray(value)) return value.map(withoutMarks) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [withoutMarks(k), withoutMarks(v)])) as T;
  return value;
}

/* ---------- markup ---------- */

/** Markup the editor cleaned, written back as markup for a kit's SVG component: only what `sanitizeSvg` kept, every
 *  value escaped for an attribute. */
export function svgMarkup(markup: string, scope: string): string | undefined {
  const clean = sanitizeSvg(markup, scope);
  if (!clean) return undefined;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const kebabAttr = (k: string) => (/^(viewBox|preserveAspectRatio|gradientUnits|gradientTransform|patternUnits|patternTransform|spreadMethod|markerWidth|markerHeight|refX|refY|maskUnits|clipPathUnits|stdDeviation|textLength|lengthAdjust|pathLength)$/.test(k) ? k : k === "className" ? "class" : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
  const attrs = (props: Record<string, unknown> | undefined) =>
    Object.entries(props ?? {})
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .map(([k, v]) => ` ${kebabAttr(k)}="${esc(String(v))}"`)
      .join("");
  const node = (n: PNode | string): string => (typeof n === "string" ? esc(n) : isNode(n) ? `<${n.type}${attrs(n.props as Record<string, unknown>)}>${(n.children ?? []).map(node).join("")}</${n.type}>` : "");
  return `<svg xmlns="http://www.w3.org/2000/svg"${attrs({ ...clean.attrs, viewBox: clean.viewBox, fill: clean.attrs.fill ?? "currentColor" })}>${clean.children.map(node).join("")}</svg>`;
}
