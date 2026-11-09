/* The expression language of the bindings: what a bound prop, a condition, a parameter of a call or a field of a body
 * is written in. Small and safe on purpose: it is parsed by a recursive-descent reader into a tree and walked, never
 * handed to `eval` or `Function`; it reads plain data only (own properties of plain objects and arrays, the length of a
 * string), never calls a value, and only the helpers listed in `HELPERS`; every parse and every evaluation has bounds
 * (length, nesting, steps, the size of what it makes), and a failure is a value of nothing, never a thrown error. The
 * exported app evaluates the same trees (the next export wave prints this file), so the preview and the app agree.
 *
 *   data.products.items          a path: data.<source>, params.<name>, vars.<name>, item, index, form, auth, response…
 *   item.price * item.qty        arithmetic; + joins words when either side is words
 *   item.stock > 0 && !item.hidden
 *   item.subtitle ?? "—"         the first that is not null
 *   item.done ? "Done" : "Open"
 *   currency(item.price, "CNY")  a helper: date, relative, number, currency, percent, fileSize, plural, truncate…
 */

import { formatDate, formatNumber, type FormatContext } from "./format";

/* ---------- the tree ---------- */

export type Expr =
  | { k: "lit"; v: string | number | boolean | null }
  | { k: "id"; name: string }
  | { k: "get"; obj: Expr; key: Expr; opt: boolean }
  | { k: "call"; fn: string; args: Expr[] }
  | { k: "un"; op: "!" | "-" | "+"; x: Expr }
  | { k: "bin"; op: BinOp; a: Expr; b: Expr }
  | { k: "cond"; test: Expr; yes: Expr; no: Expr };

type BinOp = "??" | "||" | "&&" | "==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%";

export type Parsed = { ok: true; expr: Expr; source: string } | { ok: false; error: string; at: number; source: string };

/** the bounds of a source and of the tree it is read into */
export const EXPR_LIMITS = {
  /** characters in one expression */
  length: 4000,
  /** tokens in one expression */
  tokens: 2000,
  /** how deep the tree may nest */
  depth: 64,
  /** steps one evaluation may take, a helper's work on a list counted by its elements */
  steps: 20_000,
  /** characters a string made by an evaluation may hold */
  text: 20_000,
};

/** the names a path may start at, besides the helpers'; `event` is the payload of the event an action runs on (`on:<name>`), `slot` the slot of a family that was tapped, `result` what a capability an action invoked gave back, `collections` the document's data sets by name, each a list of records, `input` the input device in use and the hint for each UI action on it (lib/focus/model.ts `inputScope`) */
export const ROOTS = ["data", "params", "vars", "item", "index", "form", "auth", "response", "error", "status", "row", "now", "event", "slot", "result", "collections", "input"] as const;
export type Root = (typeof ROOTS)[number];

/** keys a path never reads, whatever the data holds */
const DENIED = new Set(["__proto__", "prototype", "constructor", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

/* ---------- reading ---------- */

type Tok = { t: "num"; v: number; at: number } | { t: "str"; v: string; at: number } | { t: "id"; v: string; at: number } | { t: "op"; v: string; at: number };

const OPS = ["===", "!==", "?.", "??", "||", "&&", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!", "?", ":", ".", ",", "(", ")", "[", "]"];

class ParseError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    if (out.length > EXPR_LIMITS.tokens) throw new ParseError(`more than ${EXPR_LIMITS.tokens} tokens`, i);
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 64));
      const v = Number(m![0]);
      if (!Number.isFinite(v)) throw new ParseError("a number too large", i);
      out.push({ t: "num", v, at: i });
      i += m![0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = "";
      for (;;) {
        if (j >= src.length) throw new ParseError("a string that is not closed", i);
        const d = src[j];
        if (d === c) break;
        if (d === "\\") {
          const e = src[j + 1];
          if (e === "n") v += "\n";
          else if (e === "t") v += "\t";
          else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6))) {
            v += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16));
            j += 4;
          } else if (e === undefined) throw new ParseError("a string that is not closed", i);
          else v += e;
          j += 2;
          continue;
        }
        v += d;
        j++;
      }
      out.push({ t: "str", v, at: i });
      i = j + 1;
      continue;
    }
    const id = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(src.slice(i, i + 256));
    if (id) {
      out.push({ t: "id", v: id[0], at: i });
      i += id[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    /* `a?.5:1` is a condition and a number, not an optional chain */
    if (op === "?." && /[0-9]/.test(src[i + 2] ?? "")) {
      out.push({ t: "op", v: "?", at: i });
      i++;
      continue;
    }
    if (!op) throw new ParseError(`${JSON.stringify(c)} is not part of an expression`, i);
    out.push({ t: "op", v: op, at: i });
    i += op.length;
  }
  return out;
}

const BIN_LEVELS: BinOp[][] = [["??"], ["||"], ["&&"], ["==", "!=", "===", "!=="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/", "%"]];

/** Reads an expression into its tree, or says where it stops making sense. Never throws. */
export function parseExpr(source: string): Parsed {
  const cached = cache.get(source);
  if (cached) return cached;
  const out = read(source);
  if (cache.size >= 1000) cache.clear();
  cache.set(source, out);
  return out;
}

const cache = new Map<string, Parsed>();

function read(source: string): Parsed {
  if (typeof source !== "string") return { ok: false, error: "an expression is text", at: 0, source: String(source) };
  if (source.length > EXPR_LIMITS.length) return { ok: false, error: `longer than ${EXPR_LIMITS.length} characters`, at: EXPR_LIMITS.length, source };
  let toks: Tok[];
  try {
    toks = tokenize(source);
  } catch (e) {
    return { ok: false, error: (e as ParseError).message, at: (e as ParseError).at ?? 0, source };
  }
  if (!toks.length) return { ok: false, error: "the expression is empty", at: 0, source };
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ParseError(`expected ${JSON.stringify(v)}`, peek()?.at ?? source.length);
    pos++;
  };
  const deeper = (depth: number) => {
    if (depth > EXPR_LIMITS.depth) throw new ParseError(`nested more than ${EXPR_LIMITS.depth} deep`, peek()?.at ?? source.length);
    return depth + 1;
  };
  const conditional = (depth: number): Expr => {
    const d = deeper(depth);
    const test = binary(0, d);
    if (!isOp("?")) return test;
    pos++;
    const yes = conditional(d);
    expect(":");
    const no = conditional(d);
    return { k: "cond", test, yes, no };
  };
  const binary = (level: number, depth: number): Expr => {
    if (level >= BIN_LEVELS.length) return unary(depth);
    /* the levels of precedence are no nesting: only brackets, calls, branches and prefixes count */
    let a = binary(level + 1, depth);
    for (;;) {
      const t = peek();
      if (t?.t !== "op" || !(BIN_LEVELS[level] as string[]).includes(t.v)) break;
      pos++;
      const op = t.v as BinOp;
      const b = binary(level + 1, depth);
      a = { k: "bin", op, a, b };
    }
    return a;
  };
  const unary = (depth: number): Expr => {
    const d = deeper(depth);
    if (isOp("!") || isOp("-") || isOp("+")) {
      const op = toks[pos++].v as "!" | "-" | "+";
      return { k: "un", op, x: unary(d) };
    }
    return postfix(d);
  };
  const postfix = (depth: number): Expr => {
    let x = primary(depth);
    let links = 0;
    for (;;) {
      if (++links > EXPR_LIMITS.depth) throw new ParseError(`a path longer than ${EXPR_LIMITS.depth} steps`, peek()?.at ?? source.length);
      if (isOp(".") || isOp("?.")) {
        const opt = toks[pos++].v === "?.";
        const t = peek();
        if (t?.t === "op" && t.v === "[" && opt) {
          pos++;
          const key = conditional(depth + 1);
          expect("]");
          x = { k: "get", obj: x, key, opt };
          continue;
        }
        if (t?.t !== "id") throw new ParseError("expected a name after the dot", t?.at ?? source.length);
        pos++;
        x = { k: "get", obj: x, key: { k: "lit", v: t.v }, opt };
        continue;
      }
      if (isOp("[")) {
        pos++;
        const key = conditional(depth + 1);
        expect("]");
        x = { k: "get", obj: x, key, opt: false };
        continue;
      }
      if (isOp("(")) {
        if (x.k !== "id") throw new ParseError("only a helper can be called", peek()!.at);
        if (!Object.prototype.hasOwnProperty.call(HELPERS, x.name)) throw new ParseError(`there is no helper ${JSON.stringify(x.name)} (the helpers: ${Object.keys(HELPERS).join(", ")})`, peek()!.at);
        pos++;
        const args: Expr[] = [];
        if (!isOp(")")) {
          for (;;) {
            if (args.length >= 16) throw new ParseError("a helper takes at most 16 arguments", peek()?.at ?? source.length);
            args.push(conditional(depth + 1));
            if (isOp(",")) {
              pos++;
              continue;
            }
            break;
          }
        }
        expect(")");
        x = { k: "call", fn: x.name, args };
        continue;
      }
      return x;
    }
  };
  const primary = (depth: number): Expr => {
    const t = peek();
    if (!t) throw new ParseError("the expression stops too soon", source.length);
    pos++;
    if (t.t === "num") return { k: "lit", v: t.v };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "id") {
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null" || t.v === "undefined") return { k: "lit", v: null };
      return { k: "id", name: t.v };
    }
    if (t.v === "(") {
      const x = conditional(depth + 1);
      expect(")");
      return x;
    }
    throw new ParseError(`unexpected ${JSON.stringify(t.v)}`, t.at);
  };
  try {
    const expr = conditional(0);
    if (pos < toks.length) throw new ParseError(`unexpected ${JSON.stringify(toks[pos].t === "op" || toks[pos].t === "id" ? toks[pos].v : String(toks[pos].v))}`, toks[pos].at);
    /* a bare name has to be one an expression can read: a root, or a helper used as a value is no value */
    for (const r of rootsOf(expr)) if (!(ROOTS as readonly string[]).includes(r)) throw new ParseError(`${JSON.stringify(r)} is nothing an expression can read: it starts at ${ROOTS.join(", ")}, or a helper's call`, source.indexOf(r));
    return { ok: true, expr, source };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message, at: e.at, source };
    /* a stack overflow on a hostile input is a parse that failed, never a crash */
    return { ok: false, error: "the expression is too complex", at: 0, source };
  }
}

/* ---------- what an expression reads ---------- */

/** the names an expression starts its paths at, each once */
export function rootsOf(e: Expr): string[] {
  const out = new Set<string>();
  walk(e, (x) => {
    if (x.k === "id") out.add(x.name);
  });
  return [...out];
}

/** The paths an expression reads with names known before it runs (`data.products.items`, `item.price`): each as its
 *  steps, the root first. A step that is computed (`item[key]`) ends the path there. */
export function pathsOf(e: Expr): string[][] {
  const out: string[][] = [];
  const chain = (x: Expr): string[] | null => {
    if (x.k === "id") return [x.name];
    if (x.k === "get") {
      const base = chain(x.obj);
      if (!base) return null;
      if (x.key.k === "lit" && (typeof x.key.v === "string" || typeof x.key.v === "number")) return [...base, String(x.key.v)];
      return null;
    }
    return null;
  };
  const visit = (x: Expr) => {
    if (x.k === "get" || x.k === "id") {
      const c = chain(x);
      if (c) {
        out.push(c);
        /* a computed key still reads its own paths */
        if (x.k === "get") inner(x);
        return;
      }
    }
    inner(x);
  };
  const inner = (x: Expr) => {
    switch (x.k) {
      case "get":
        if (x.key.k !== "lit") visit(x.key);
        if (chainEnds(x.obj)) visit(x.obj);
        return;
      case "call":
        return x.args.forEach(visit);
      case "un":
        return visit(x.x);
      case "bin":
        visit(x.a);
        return visit(x.b);
      case "cond":
        visit(x.test);
        visit(x.yes);
        return visit(x.no);
      default:
        return;
    }
  };
  const chainEnds = (x: Expr) => x.k === "get" && chain(x) === null;
  visit(e);
  /* the longest of each prefix is enough */
  return out.filter((p, i) => !out.some((q, j) => j !== i && q.length > p.length && p.every((s, n) => q[n] === s)));
}

function walk(e: Expr, fn: (x: Expr) => void) {
  const stack = [e];
  while (stack.length) {
    const x = stack.pop()!;
    fn(x);
    switch (x.k) {
      case "get":
        stack.push(x.obj, x.key);
        break;
      case "call":
        stack.push(...x.args);
        break;
      case "un":
        stack.push(x.x);
        break;
      case "bin":
        stack.push(x.a, x.b);
        break;
      case "cond":
        stack.push(x.test, x.yes, x.no);
        break;
    }
  }
}

/* ---------- running ---------- */

/** What an expression reads: the roots by name (data, params, vars, item…), each plain data. */
export type Scope = Partial<Record<Root, unknown>>;

/** how values are written in words: the language and the time "now" is */
export type EvalContext = FormatContext;

class Budget extends Error {}

type Run = { steps: number; ctx: EvalContext };

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** one step of a path: an own property of plain data, an element of a list, a length; anything else is nothing */
export function readKey(obj: unknown, key: unknown): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof key === "number") {
    if (Array.isArray(obj) && Number.isInteger(key)) return safeValue(obj[key < 0 ? obj.length + key : key]);
    return undefined;
  }
  if (typeof key !== "string" || DENIED.has(key)) return undefined;
  if (Array.isArray(obj)) {
    if (key === "length") return obj.length;
    return /^-?\d+$/.test(key) ? readKey(obj, Number(key)) : undefined;
  }
  if (typeof obj === "string") return key === "length" ? obj.length : undefined;
  if (!isPlain(obj)) return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? safeValue(obj[key]) : undefined;
}

/** a value an expression may hold: plain data; a function or a class instance is nothing */
const safeValue = (v: unknown): unknown => (typeof v === "function" || typeof v === "symbol" || typeof v === "bigint" ? undefined : v);

/** Whether a value counts as yes: nothing, false, 0, "", NaN and an empty list do not. */
export function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v && !(typeof v === "number" && Number.isNaN(v));
}

const isNumeric = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === "number" && typeof b === "string") return isNumeric(b) && a === Number(b);
  if (typeof a === "string" && typeof b === "number") return isNumeric(a) && Number(a) === b;
  if (typeof a === "boolean" && typeof b === "string") return String(a) === b;
  if (typeof a === "string" && typeof b === "boolean") return a === String(b);
  return false;
}

function compare(op: "<" | "<=" | ">" | ">=", a: unknown, b: unknown): boolean {
  let x: number | string;
  let y: number | string;
  if (isNumeric(a) && isNumeric(b) && (typeof a === "number" || typeof b === "number")) {
    x = Number(a);
    y = Number(b);
  } else if (typeof a === "string" && typeof b === "string") {
    x = a;
    y = b;
  } else if (typeof a === "number" && typeof b === "number") {
    x = a;
    y = b;
  } else return false;
  return op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
}

/** a number from a value, or undefined: words that are a number count, nothing else does */
export const toNumber = (v: unknown): number | undefined => (typeof v === "number" ? (Number.isFinite(v) ? v : undefined) : typeof v === "string" && isNumeric(v) ? Number(v) : typeof v === "boolean" ? (v ? 1 : 0) : undefined);

const capped = (s: string) => (s.length > EXPR_LIMITS.text ? s.slice(0, EXPR_LIMITS.text) : s);

/** A value as the words a part shows: nothing is "", a list is its elements' words, an object its JSON. */
export function display(v: unknown, depth = 0): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return capped(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return depth > 2 ? "" : capped(v.slice(0, 200).map((x) => display(x, depth + 1)).join(", "));
  if (isPlain(v)) {
    try {
      return capped(JSON.stringify(v));
    } catch {
      return "";
    }
  }
  return "";
}

function step(r: Run, n = 1) {
  r.steps -= n;
  if (r.steps < 0) throw new Budget();
}

function evalNode(e: Expr, scope: Scope, r: Run): unknown {
  step(r);
  switch (e.k) {
    case "lit":
      return e.v;
    case "id":
      return Object.prototype.hasOwnProperty.call(scope, e.name) ? safeValue(scope[e.name as Root]) : undefined;
    case "get": {
      const obj = evalNode(e.obj, scope, r);
      if (obj === null || obj === undefined) return undefined;
      const key = evalNode(e.key, scope, r);
      return readKey(obj, key);
    }
    case "call": {
      const helper = HELPERS[e.fn];
      if (!helper) return undefined;
      const args = e.args.map((a) => evalNode(a, scope, r));
      return helper(args, r);
    }
    case "un": {
      const x = evalNode(e.x, scope, r);
      if (e.op === "!") return !truthy(x);
      const n = toNumber(x);
      return n === undefined ? undefined : e.op === "-" ? -n : n;
    }
    case "cond":
      return truthy(evalNode(e.test, scope, r)) ? evalNode(e.yes, scope, r) : evalNode(e.no, scope, r);
    case "bin": {
      const a = evalNode(e.a, scope, r);
      switch (e.op) {
        case "??":
          return a === null || a === undefined ? evalNode(e.b, scope, r) : a;
        case "||":
          return truthy(a) ? a : evalNode(e.b, scope, r);
        case "&&":
          return truthy(a) ? evalNode(e.b, scope, r) : a;
      }
      const b = evalNode(e.b, scope, r);
      switch (e.op) {
        case "==":
          return looseEquals(a, b);
        case "!=":
          return !looseEquals(a, b);
        case "===":
          return a === b;
        case "!==":
          return a !== b;
        case "<":
        case "<=":
        case ">":
        case ">=":
          return compare(e.op, a, b);
        case "+": {
          if (typeof a === "string" || typeof b === "string") {
            const s = display(a) + display(b);
            step(r, Math.ceil(s.length / 256));
            return capped(s);
          }
          const x = toNumber(a);
          const y = toNumber(b);
          return x === undefined || y === undefined ? undefined : x + y;
        }
        default: {
          const x = toNumber(a);
          const y = toNumber(b);
          if (x === undefined || y === undefined) return undefined;
          if ((e.op === "/" || e.op === "%") && y === 0) return undefined;
          const v = e.op === "-" ? x - y : e.op === "*" ? x * y : e.op === "/" ? x / y : x % y;
          return Number.isFinite(v) ? v : undefined;
        }
      }
    }
  }
}

/** Evaluates an expression (its source or its tree) over a scope: its value, or undefined when it cannot be read, its
 *  bounds are passed, or it is no expression at all. Never throws. */
export function evaluate(e: string | Parsed | Expr, scope: Scope, ctx: EvalContext = { lang: "en" }): unknown {
  const expr = typeof e === "string" ? parseExpr(e) : "k" in e ? ({ ok: true, expr: e, source: "" } as Parsed) : e;
  if (!expr.ok) return undefined;
  const r: Run = { steps: EXPR_LIMITS.steps, ctx };
  try {
    return evalNode(expr.expr, scope, r);
  } catch {
    /* the step budget, or a stack overflow on a hostile tree built by hand */
    return undefined;
  }
}

/** whether an expression holds, for a condition */
export const holds = (e: string, scope: Scope, ctx?: EvalContext) => truthy(evaluate(e, scope, ctx));

/* ---------- what a bound prop shows ---------- */

/** the kind of value a prop takes, as a binding's value is made one: a number's range and, for a choice, the words of
 *  its options (a text it holds picks the option of those words); an enum's choices; a list's most rows */
export type PropRead =
  | { kind: "text" }
  | { kind: "bool" }
  | { kind: "number"; min?: number; max?: number; labels?: readonly string[] }
  | { kind: "enum"; options: readonly string[] }
  | { kind: "list"; max?: number };

/** a row of a list as data says it: its words, and its icon, picture and the state its part reads */
export type BoundRow = { label: string; icon?: string; image?: string; variant?: string; width?: string };

/** A bound prop's value: what its expression came to made the kind of value the prop takes, by one rule for every
 *  binding (a plain read of a variable or any other expression) and every host (docs/数据绑定.md). Words for words
 *  (nothing is ""); yes or no, where words that say no ("", "false", "0") are no; a number kept to its range, where a
 *  choice's options' words pick the option; one of an enum's choices; rows for a list (data's records, or words one row
 *  a line). Undefined keeps the design's value. */
export function propValueOf(v: unknown, p: PropRead): unknown {
  switch (p.kind) {
    case "bool":
      if (v === undefined) return undefined;
      return typeof v === "string" ? v !== "" && v !== "false" && v !== "0" : truthy(v);
    case "number": {
      if (typeof v === "string" && p.labels) {
        const at = p.labels.indexOf(v);
        if (at >= 0) return at;
      }
      const n = toNumber(v);
      return n === undefined ? undefined : Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, n));
    }
    case "enum": {
      const s = typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;
      return s !== undefined && p.options.includes(s) ? s : undefined;
    }
    case "list": {
      const max = p.max ?? 50;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
        return String(v)
          .split("\n")
          .filter((w) => w.trim())
          .slice(0, max)
          .map((label): BoundRow => ({ label }));
      if (!Array.isArray(v)) return undefined;
      return v.slice(0, max).map((x): BoundRow => {
        if (!isPlain(x)) return { label: display(x) };
        /* a row keeps what it says of itself: its icon, its picture, and the state its part reads from `variant` (a
           to-do's status, a tile's mark) and `width` */
        return {
          label: display(x.label ?? x.name ?? x.title ?? ""),
          ...(typeof x.icon === "string" ? { icon: x.icon } : {}),
          ...(typeof x.image === "string" ? { image: x.image } : {}),
          ...(typeof x.variant === "string" ? { variant: x.variant } : {}),
          ...(typeof x.width === "string" ? { width: x.width } : {}),
        };
      });
    }
    default:
      return display(v);
  }
}

/* ---------- words with expressions in them ---------- */

/* What is between the braces is taken whole and trimmed after. A run of spaces matched on each side of a lazy middle
   is tried split every way when no `}}` follows (cubic in the run's length): a document's words must never be able
   to ask for that. Nothing between these braces can be a brace, so this reads in one pass. */
const TOKEN = /\{\{([^{}]*)\}\}/g;

/** Words with each `{{expression}}` read and written in: one that reads a root of the bindings (or calls a helper);
 *  another token (a typo, what is no expression) is left as written. With `only`, a token that reads anything beyond
 *  those roots is left too, for whoever reads it later: what draws a collection's rows fills `{{row.<field>}}` and
 *  leaves `{{vars.n}}` to the preview. A token that reads `row` where the scope has none (a part drawn for no row) is
 *  left as written too. The one filler of words every reader uses. The same string when it has none. */
export function fillTemplate(text: string, scope: Scope, ctx?: EvalContext, only?: readonly string[]): string {
  if (!text.includes("{{")) return text;
  let budget = 64;
  const out = text.replace(TOKEN, (whole, inner: string) => {
    const src = inner.trim();
    if (!src || --budget < 0) return whole;
    const p = parseExpr(src);
    if (!p.ok) return whole;
    const roots = rootsOf(p.expr);
    if (only && roots.some((r) => !only.includes(r))) return whole;
    /* a row read where no row is (a part drawn for none) stays as it is written, as a word a typo made does */
    if (roots.includes("row") && !("row" in scope)) return whole;
    return display(evaluate(p, scope, ctx));
  });
  return capped(out);
}

/** whether words hold a `{{expression}}` the bindings read */
export function hasTemplate(text: string): boolean {
  if (!text.includes("{{")) return false;
  for (const m of text.matchAll(TOKEN)) {
    const src = m[1].trim();
    if (src && parseExpr(src).ok) return true;
  }
  return false;
}

/* ---------- the helpers ---------- */

type Helper = (args: unknown[], r: Run) => unknown;

const str = (v: unknown) => display(v);
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** the helpers an expression may call, by name: formatting per the language, words, lists and numbers */
export const HELPERS: Record<string, Helper> = Object.assign(Object.create(null) as Record<string, Helper>, {
  /** date(value, style?): "date" (default), "time", "datetime", "short", "long", "weekday", "month", "relative" */
  date: (a: unknown[], r: Run) => formatDate(a[0], typeof a[1] === "string" ? a[1] : "date", r.ctx),
  /** relative(value): "3 minutes ago", "in 2 days" */
  relative: (a: unknown[], r: Run) => formatDate(a[0], "relative", r.ctx),
  /** number(value, digits?) with the language's grouping */
  number: (a: unknown[], r: Run) => formatNumber(a[0], { style: "decimal", digits: toNumber(a[1]) }, r.ctx),
  /** currency(value, code?, digits?): the language's currency when no code is given */
  currency: (a: unknown[], r: Run) => formatNumber(a[0], { style: "currency", currency: typeof a[1] === "string" ? a[1] : undefined, digits: toNumber(a[2]) }, r.ctx),
  /** percent(fraction, digits?): 0.25 → 25% */
  percent: (a: unknown[], r: Run) => formatNumber(a[0], { style: "percent", digits: toNumber(a[1]) }, r.ctx),
  /** fileSize(bytes): 1.2 MB */
  fileSize: (a: unknown[], r: Run) => formatNumber(a[0], { style: "bytes" }, r.ctx),
  /** plural(n, one, other?): the form the language uses for n, "#" in it the number */
  plural: (a: unknown[], r: Run) => {
    const n = toNumber(a[0]);
    if (n === undefined) return "";
    let form = str(a[2] ?? a[1]);
    try {
      if (new Intl.PluralRules(localeOf(r.ctx.lang)).select(n) === "one") form = str(a[1]);
    } catch {}
    /* each `#` grows into the number: the words stop at the cap rather than being made whole and cut after */
    const number = formatNumber(n, { style: "decimal" }, r.ctx);
    const pieces = form.split("#");
    let out = pieces[0];
    for (let i = 1; i < pieces.length && out.length < EXPR_LIMITS.text; i++) out += number + pieces[i];
    return capped(out);
  },
  /** truncate(words, length): cut with an ellipsis */
  truncate: (a: unknown[]) => {
    const s = str(a[0]);
    const n = Math.max(0, Math.min(EXPR_LIMITS.text, Math.floor(toNumber(a[1]) ?? 40)));
    const chars = [...s];
    return chars.length > n ? `${chars.slice(0, Math.max(0, n - 1)).join("")}…` : s;
  },
  upper: (a: unknown[]) => capped(str(a[0]).toUpperCase()),
  lower: (a: unknown[]) => capped(str(a[0]).toLowerCase()),
  trim: (a: unknown[]) => str(a[0]).trim(),
  /** len(list or words) */
  len: (a: unknown[]) => (Array.isArray(a[0]) ? a[0].length : typeof a[0] === "string" ? [...a[0]].length : 0),
  /** join(list, separator?) */
  join: (a: unknown[], r: Run) => {
    const l = listOf(a[0]).slice(0, 1000);
    step(r, l.length);
    /* one element at a time, stopping at the cap: a long separator between a thousand elements would otherwise make
       far more than the cap before it was cut */
    const sep = typeof a[1] === "string" ? capped(a[1]) : ", ";
    let out = "";
    for (let i = 0; i < l.length && out.length < EXPR_LIMITS.text; i++) out += (i ? sep : "") + str(l[i]);
    return capped(out);
  },
  /** pluck(list, field): the field of each element */
  pluck: (a: unknown[], r: Run) => {
    const l = listOf(a[0]).slice(0, 1000);
    step(r, l.length);
    return l.map((x) => readKey(x, str(a[1])));
  },
  /** sum(list, field?) of the numbers in it */
  sum: (a: unknown[], r: Run) => {
    const l = listOf(a[0]).slice(0, 10_000);
    step(r, l.length);
    const key = a[1] === undefined ? undefined : str(a[1]);
    return l.reduce<number>((t, x) => t + (toNumber(key === undefined ? x : readKey(x, key)) ?? 0), 0);
  },
  first: (a: unknown[]) => listOf(a[0])[0],
  last: (a: unknown[]) => listOf(a[0]).at(-1),
  /** contains(list or words, what) */
  contains: (a: unknown[], r: Run) => {
    if (typeof a[0] === "string") return a[0].includes(str(a[1]));
    const l = listOf(a[0]);
    step(r, Math.min(l.length, 10_000));
    return l.slice(0, 10_000).some((x) => looseEquals(x, a[1]));
  },
  isEmpty: (a: unknown[]) => a[0] === null || a[0] === undefined || a[0] === "" || (Array.isArray(a[0]) && !a[0].length) || (isPlain(a[0]) && !Object.keys(a[0]).length),
  round: (a: unknown[]) => {
    const n = toNumber(a[0]);
    const d = Math.max(0, Math.min(10, Math.floor(toNumber(a[1]) ?? 0)));
    return n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d;
  },
  floor: (a: unknown[]) => (toNumber(a[0]) === undefined ? undefined : Math.floor(toNumber(a[0])!)),
  ceil: (a: unknown[]) => (toNumber(a[0]) === undefined ? undefined : Math.ceil(toNumber(a[0])!)),
  abs: (a: unknown[]) => (toNumber(a[0]) === undefined ? undefined : Math.abs(toNumber(a[0])!)),
  min: (a: unknown[]) => {
    const ns = a.map(toNumber).filter((n): n is number => n !== undefined);
    return ns.length ? Math.min(...ns) : undefined;
  },
  max: (a: unknown[]) => {
    const ns = a.map(toNumber).filter((n): n is number => n !== undefined);
    return ns.length ? Math.max(...ns) : undefined;
  },
  /** string(value): its words */
  string: (a: unknown[]) => str(a[0]),
  /** num(value): a number, or nothing */
  num: (a: unknown[]) => toNumber(a[0]),
});

/** the language's locale for Intl */
export const localeOf = (lang: string) => (lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : lang === "ko" ? "ko-KR" : "en-US");

/* ---------- checking an expression against what there is ---------- */

/** What an expression is wrong about before it runs, against the names there are: a source of data the screen does not
 *  load, a param it does not take. Empty when nothing is known to be wrong. */
export function exprProblems(source: string, known: { sources?: string[]; params?: string[] }): string[] {
  const p = parseExpr(source);
  if (!p.ok) return [`${p.error} (at ${p.at})`];
  const out: string[] = [];
  for (const path of pathsOf(p.expr)) {
    if (path[0] === "data" && path[1] !== undefined && known.sources && !known.sources.includes(path[1])) out.push(`the screen loads no data called ${JSON.stringify(path[1])}${known.sources.length ? ` (it loads ${known.sources.join(", ")})` : " (add_data_source adds one)"}`);
    if (path[0] === "params" && path[1] !== undefined && known.params && !known.params.includes(path[1])) out.push(`the screen takes no param ${JSON.stringify(path[1])}${known.params.length ? ` (it takes ${known.params.join(", ")})` : " (set_screen_params declares them)"}`);
  }
  return [...new Set(out)];
}
