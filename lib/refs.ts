/* What a tap points at, found the same way wherever references are kept up (report 8.6): the screen it goes to, the
 * parts it shows, hides, opens, sets, scrolls to or asks about, the form it submits, in its `else`, in a call's (or an
 * invoke's) `then` and `catch` as deep as they go, and in a form's own `then` and `catch`. Copying a part retargets with it
 * (lib/tokens.ts `retarget`), deleting a screen unlinks with it (lib/core/ops/screens.ts `remove_screen`).
 *
 * The names expressions read are indexed below too (version 3, docs/整改计划.md 第四批): a variable (`vars.<name>`, or
 * by its key, the id that never changes), a data source of the screen (`data.<name>`, also inside `{{…}}` in words),
 * a param of the screen (`params.<name>`). They are found by reading the expression's tokens, not by matching text, so
 * a name inside a string literal or a field that happens to be called `data` is left alone, and a rename changes only
 * what read the thing renamed (`renameVarReads`, `renameReads`). */

import type { Action, ActionBody, Condition, DocVar, Effect, Frame, Group, Item } from "./tokens";

export type RefKind = "screen" | "part" | "form";
/** what each kind of reference becomes; a kind left out stays as it is */
export type RefMap = Partial<Record<RefKind, (id: string) => string>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** how deep a call's `then` and `catch` are followed: past what any document may hold (lib/project.ts) */
const MAX_DEPTH = 8;

function mapEffect(e: Effect, f: RefMap, depth: number): Effect {
  const r = e as Effect & Record<string, unknown>;
  let out: Record<string, unknown> = r;
  const set = (k: string, v: unknown) => {
    if (out[k] === v) return;
    if (out === r) out = { ...r };
    out[k] = v;
  };
  if (f.part && typeof r.part === "string") set("part", f.part(r.part));
  if (f.form && r.do === "submit" && typeof r.form === "string") set("form", f.form(r.form));
  /* the template a spawn makes an instance of is a group, mapped as a form's group is */
  if (f.form && r.do === "spawn" && typeof r.group === "string") set("group", f.form(r.group));
  if ((r.do === "call" || r.do === "invoke") && depth < MAX_DEPTH) {
    if (isRecord(r.then)) set("then", mapBody(r.then as unknown as ActionBody, f, depth + 1));
    if (isRecord(r.catch)) set("catch", mapBody(r.catch as unknown as ActionBody, f, depth + 1));
  }
  return out as unknown as Effect;
}

/** a condition with the part it asks about mapped */
export const mapCondition = (c: Condition | undefined, f: RefMap): Condition | undefined => (c && f.part && "filled" in c && typeof c.filled === "string" ? { ...c, filled: f.part(c.filled) } : c);

/** A tap's body (what it does: where it goes, its effects) with every reference in it mapped; the same object when
 *  nothing in it changes. */
export function mapBody<B extends ActionBody>(b: B, f: RefMap, depth = 0): B {
  let out: B = b;
  const set = <K extends keyof B>(k: K, v: B[K]) => {
    if (out[k] === v) return;
    if (out === b) out = { ...b };
    out[k] = v;
  };
  if (f.screen && typeof b.to === "string") set("to", f.screen(b.to) as B["to"]);
  if (f.part && typeof b.scrollTo === "string") set("scrollTo", f.part(b.scrollTo) as B["scrollTo"]);
  if (Array.isArray(b.effects)) {
    const effects = b.effects.map((e) => (isRecord(e) ? mapEffect(e, f, depth) : e));
    if (effects.some((e, i) => e !== b.effects![i])) set("effects", effects as B["effects"]);
  }
  return out;
}

/** A whole tap with every reference in it mapped: its body, its condition and its `else`. */
export function mapAction(a: Action, f: RefMap): Action {
  let out = mapBody(a, f);
  const when = mapCondition(a.when, f);
  if (when !== a.when) out = { ...out, when };
  if (a.else) {
    const other = mapBody(a.else, f);
    if (other !== a.else) out = { ...out, else: other };
  }
  return out;
}

/** The bodies a tap holds below its own: its `else`, and every call's and invoke's `then` and `catch`, at any depth. What deleting
 *  a screen sends somewhere else when it went there (the tap itself is the caller's to decide about). */
export function mapNestedBodies(a: Action, fn: (b: ActionBody) => ActionBody): Action {
  const inner = (b: ActionBody, depth: number): ActionBody => {
    if (!Array.isArray(b.effects) || depth >= MAX_DEPTH) return b;
    let changed = false;
    const effects = b.effects.map((e) => {
      if (!isRecord(e) || (e.do !== "call" && e.do !== "invoke")) return e;
      const c = e as Extract<Effect, { do: "call" | "invoke" }>;
      const then = c.then && fn(inner(c.then, depth + 1));
      const fail = c.catch && fn(inner(c.catch, depth + 1));
      if (then === c.then && fail === c.catch) return e;
      changed = true;
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      return { ...c, ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}) };
    });
    return changed ? { ...b, effects } : b;
  };
  let out = inner(a, 0) as Action;
  if (a.else) {
    const other = fn(inner(a.else, 0));
    if (other !== a.else) out = { ...out, else: other };
  }
  return out;
}

/* ---------- names that expressions read ---------- */

/** the roots whose next step is a name the document gives: a variable, a data source of the screen, a param of it */
export type NameRoot = "vars" | "data" | "params";
const NAME_ROOTS: ReadonlySet<string> = new Set<NameRoot>(["vars", "data", "params"]);

/** One read of a document's name in an expression: the root, the name, and the span that spells the step (from its dot,
 *  or its opening bracket's string, to the end of the name) so the step alone can be written again. */
export type NameRead = { root: NameRoot; name: string; start: number; end: number; how: "dot" | "optional" | "bracket" | "optionalBracket" };

type Tok = { t: "id" | "str" | "num" | "op"; v: string; at: number; end: number };

/** a name an expression may spell after a dot (lib/bindings/expr.ts reads the same) */
export const IDENTIFIER = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
const OPS = ["===", "!==", "?.", "??", "||", "&&", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "%", "!", "?", ":", ".", ",", "(", ")", "[", "]"];

/** The tokens of an expression, with where each ends; null when it cannot be read (an unclosed string), which leaves
 *  such an expression as it is. Follows the reader of lib/bindings/expr.ts in what is a string, a name and a number. */
function tokens(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i, i + 64))!;
      out.push({ t: "num", v: m[0], at: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let v = "";
      for (;;) {
        if (j >= src.length) return null;
        const d = src[j];
        if (d === c) break;
        if (d === "\\") {
          const e = src[j + 1];
          if (e === undefined) return null;
          if (e === "n") v += "\n";
          else if (e === "t") v += "\t";
          else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(j + 2, j + 6))) {
            v += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16));
            j += 4;
          } else v += e;
          j += 2;
          continue;
        }
        v += d;
        j++;
      }
      out.push({ t: "str", v, at: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    const id = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(src.slice(i, i + 256));
    if (id) {
      out.push({ t: "id", v: id[0], at: i, end: i + id[0].length });
      i += id[0].length;
      continue;
    }
    let op = OPS.find((o) => src.startsWith(o, i));
    if (op === "?." && /[0-9]/.test(src[i + 2] ?? "")) op = "?";
    if (!op) return null;
    out.push({ t: "op", v: op, at: i, end: i + op.length });
    i += op.length;
  }
  return out;
}

/** Every read of a variable, a data source or a screen param in an expression, in order. A root is one that starts a
 *  path (`item.data.x` reads no data source), and only a name known before it runs counts (`vars[key]` is none). */
export function namesRead(src: string): NameRead[] {
  const toks = typeof src === "string" ? tokens(src) : null;
  if (!toks) return [];
  const out: NameRead[] = [];
  const isOp = (k: number, v: string) => toks[k]?.t === "op" && toks[k].v === v;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id" || !NAME_ROOTS.has(t.v) || isOp(k - 1, ".") || isOp(k - 1, "?.")) continue;
    const root = t.v as NameRoot;
    if ((isOp(k + 1, ".") || isOp(k + 1, "?.")) && toks[k + 2]?.t === "id") out.push({ root, name: toks[k + 2].v, start: toks[k + 1].at, end: toks[k + 2].end, how: isOp(k + 1, ".") ? "dot" : "optional" });
    else if (isOp(k + 1, "[") && toks[k + 2]?.t === "str" && isOp(k + 3, "]")) out.push({ root, name: toks[k + 2].v, start: toks[k + 1].at, end: toks[k + 3].end, how: "bracket" });
    else if (isOp(k + 1, "?.") && isOp(k + 2, "[") && toks[k + 3]?.t === "str" && isOp(k + 4, "]")) out.push({ root, name: toks[k + 3].v, start: toks[k + 1].at, end: toks[k + 4].end, how: "optionalBracket" });
  }
  return out;
}

/** words as an expression's string literal: quoted, with what the reader of lib/bindings/expr.ts unescapes escaped */
// eslint-disable-next-line no-control-regex -- the control characters are what the literal escapes
export const exprString = (v: string) => `"${v.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\u0000-\u001f]/g, (c) => (c === "\n" ? "\\n" : c === "\t" ? "\\t" : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`))}"`;

/** An expression with each read of a field of `root` (`row.price`, `row?.price`, `row["unit price"]`) written as the
 *  literal it reads: what a printer does with what is fixed when it prints (the row a part was drawn for). A field the
 *  object does not have reads as `null`, nothing, as it would have; the same string when it reads none. */
export function inlineReads(src: string, root: string, fields: Record<string, unknown>): string {
  const toks = typeof src === "string" ? tokens(src) : null;
  if (!toks) return src;
  const isOp = (k: number, v: string) => toks[k]?.t === "op" && toks[k].v === v;
  const spans: { start: number; end: number; name: string }[] = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id" || t.v !== root || isOp(k - 1, ".") || isOp(k - 1, "?.")) continue;
    if ((isOp(k + 1, ".") || isOp(k + 1, "?.")) && toks[k + 2]?.t === "id") spans.push({ start: t.at, end: toks[k + 2].end, name: toks[k + 2].v });
    else if (isOp(k + 1, "[") && toks[k + 2]?.t === "str" && isOp(k + 3, "]")) spans.push({ start: t.at, end: toks[k + 3].end, name: toks[k + 2].v });
    else if (isOp(k + 1, "?.") && isOp(k + 2, "[") && toks[k + 3]?.t === "str" && isOp(k + 4, "]")) spans.push({ start: t.at, end: toks[k + 4].end, name: toks[k + 3].v });
  }
  let out = src;
  for (const r of spans.reverse()) {
    const v = Object.prototype.hasOwnProperty.call(fields, r.name) ? fields[r.name] : null;
    const lit = typeof v === "string" ? exprString(v) : typeof v === "number" || typeof v === "boolean" ? String(v) : "null";
    out = out.slice(0, r.start) + lit + out.slice(r.end);
  }
  return out;
}

/** a step to a name, spelled the way it was where the name allows it: `.name` (or `?.name`), else `["name"]` */
function stepTo(name: string, how: NameRead["how"]): string {
  const quoted = JSON.stringify(name);
  if (how === "dot") return IDENTIFIER.test(name) ? `.${name}` : `[${quoted}]`;
  if (how === "optional") return IDENTIFIER.test(name) ? `?.${name}` : `?.[${quoted}]`;
  return how === "bracket" ? `[${quoted}]` : `?.[${quoted}]`;
}

/** what a read of a name reads now: another name, or null to leave it as it is */
export type NameMap = (root: NameRoot, name: string) => string | null;

/** An expression with the names it reads mapped; the same string when none changes. */
export function mapNamesInExpr(src: string, f: NameMap): string {
  if (typeof src !== "string") return src;
  let out = src;
  /* from the end, so the spans before stay where they were */
  for (const r of namesRead(src).reverse()) {
    const to = f(r.root, r.name);
    if (to === null || to === r.name) continue;
    out = out.slice(0, r.start) + stepTo(to, r.how) + out.slice(r.end);
  }
  return out;
}

/* what lib/bindings/expr.ts reads as an expression inside words */
const TEMPLATE = /\{\{([^{}]*)\}\}/g;

/** Words with each `{{expression}}` in them mapped; the same string when none changes. */
export function mapNamesInWords(text: string, f: NameMap): string {
  if (typeof text !== "string" || !text.includes("{{")) return text;
  const out = text.replace(TEMPLATE, (whole, inner: string) => {
    const next = mapNamesInExpr(inner, f);
    return next === inner ? whole : `{{${next}}}`;
  });
  return out === text ? text : out;
}

/** how an expression and words with expressions in them are written again */
export type ExprMap = { expr: (src: string) => string; words: (text: string) => string };

/** the map of the names read by `f`, over expressions and words */
export const namesMap = (f: NameMap): ExprMap => ({ expr: (src) => mapNamesInExpr(src, f), words: (text) => mapNamesInWords(text, f) });

/** a record of expressions by name, each mapped; the same object when none changes */
function mapRecord(r: Record<string, string> | undefined, m: ExprMap): Record<string, string> | undefined {
  if (!isRecord(r)) return r;
  let out: Record<string, string> | null = null;
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== "string") continue;
    const next = m.expr(v);
    if (next === v) continue;
    out ??= { ...r };
    out[k] = next;
  }
  return out ?? r;
}

/** every string in a value (words in props, rows of a list) mapped as words; the same value when none changes */
function mapWordsDeep<T>(v: T, m: ExprMap, depth = 0): T {
  if (typeof v === "string") return m.words(v) as T;
  if (depth > 12 || !v || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const next = v.map((x) => mapWordsDeep(x, m, depth + 1));
    return next.some((x, i) => x !== v[i]) ? (next as T) : v;
  }
  let out: Record<string, unknown> | null = null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const next = mapWordsDeep(x, m, depth + 1);
    if (next === x) continue;
    out ??= { ...(v as Record<string, unknown>) };
    out[k] = next;
  }
  return (out ?? v) as T;
}

/** `o` with `key` set to `v`, the same object when it holds that already */
function withField<T extends object, K extends keyof T>(o: T, key: K, v: T[K]): T {
  return o[key] === v ? o : { ...o, [key]: v };
}

function mapEffectExprs(e: Effect, m: ExprMap, depth: number): Effect {
  if (!isRecord(e)) return e;
  const r = e as unknown as Record<string, unknown>;
  let out = r;
  const set = (k: string, v: unknown) => {
    out = withField(out, k, v);
  };
  if (r.do === "setVar" && typeof r.expr === "string") set("expr", m.expr(r.expr));
  if (r.do === "snackbar" && typeof r.message === "string") set("message", m.words(r.message));
  if (r.do === "call" || r.do === "invoke") {
    set("args", mapRecord(r.args as Record<string, string> | undefined, m));
    if (typeof r.body === "string") set("body", m.expr(r.body));
    if (isRecord(r.optimistic)) set("optimistic", withField(r.optimistic, "patch", mapRecord(r.optimistic.patch as Record<string, string> | undefined, m)));
    if (depth < MAX_DEPTH) {
      if (isRecord(r.then)) set("then", mapBodyExprs(r.then as unknown as ActionBody, m, depth + 1));
      if (isRecord(r.catch)) set("catch", mapBodyExprs(r.catch as unknown as ActionBody, m, depth + 1));
    }
  }
  return out as unknown as Effect;
}

/** a condition with its expression mapped */
export const mapConditionExprs = (c: Condition | undefined, m: ExprMap): Condition | undefined => (isRecord(c) && "expr" in c && typeof c.expr === "string" ? withField(c, "expr", m.expr(c.expr)) : c);

/** A tap's body with every expression in it mapped: the params it opens a screen with, its effects' expressions and
 *  words, as deep as calls go. The same object when none changes. */
export function mapBodyExprs<B extends ActionBody>(b: B, m: ExprMap, depth = 0): B {
  if (!isRecord(b)) return b;
  let out = withField(b, "params", mapRecord(b.params, m) as B["params"]);
  if (Array.isArray(b.effects)) {
    const effects = b.effects.map((e) => mapEffectExprs(e, m, depth));
    if (effects.some((e, i) => e !== b.effects![i])) out = withField(out, "effects", effects as B["effects"]);
  }
  return out;
}

/** a whole tap with every expression in it mapped: its body, its condition, its `else` */
export function mapActionExprs(a: Action, m: ExprMap): Action {
  if (!isRecord(a)) return a;
  let out = mapBodyExprs(a, m);
  out = withField(out, "when", mapConditionExprs(a.when, m));
  if (isRecord(a.else)) out = withField(out, "else", mapBodyExprs(a.else, m));
  return out;
}

/** A part with every expression it holds mapped: what its props are bound to (`=expression`), the words of its props
 *  and its label, its taps. The same object when none changes. */
export function mapItemExprs(it: Item, m: ExprMap): Item {
  let out = it;
  if (isRecord(it.bind)) {
    let bind: Record<string, string> | null = null;
    for (const [k, v] of Object.entries(it.bind)) {
      if (typeof v !== "string" || !v.startsWith("=")) continue;
      const next = `=${m.expr(v.slice(1))}`;
      if (next === v) continue;
      bind ??= { ...it.bind };
      bind[k] = next;
    }
    if (bind) out = { ...out, bind };
  }
  if (it.props !== undefined) out = withField(out, "props", mapWordsDeep(it.props, m));
  if (typeof it.label === "string") out = withField(out, "label", m.words(it.label));
  if (isRecord(it.action)) out = withField(out, "action", mapActionExprs(it.action, m));
  if (isRecord(it.actions)) {
    let actions: Record<string, Action> | null = null;
    for (const [k, a] of Object.entries(it.actions)) {
      const next = mapActionExprs(a, m);
      if (next === a) continue;
      actions ??= { ...it.actions };
      actions[k] = next;
    }
    if (actions) out = { ...out, actions };
  }
  return out;
}

/** A group with every expression it holds mapped: its parts', its condition, the list it repeats over, its region's
 *  test for empty, its form's params, values and answers. The same object when none changes. */
export function mapGroupExprs(g: Group, m: ExprMap): Group {
  let out = g;
  if (Array.isArray(g.items)) {
    const items = g.items.map((it) => mapItemExprs(it, m));
    if (items.some((it, i) => it !== g.items[i])) out = { ...out, items };
  }
  out = withField(out, "showWhen", mapConditionExprs(g.showWhen, m));
  if (isRecord(g.repeat) && typeof g.repeat.data === "string") out = withField(out, "repeat", withField(g.repeat, "data", m.expr(g.repeat.data)));
  if (isRecord(g.states) && typeof g.states.emptyWhen === "string") out = withField(out, "states", withField(g.states, "emptyWhen", m.expr(g.states.emptyWhen)));
  if (isRecord(g.form)) {
    let form = withField(g.form, "params", mapRecord(g.form.params, m));
    form = withField(form, "values", mapRecord(g.form.values, m));
    if (isRecord(g.form.then)) form = withField(form, "then", mapBodyExprs(g.form.then, m));
    if (isRecord(g.form.catch)) form = withField(form, "catch", mapBodyExprs(g.form.catch, m));
    out = withField(out, "form", form);
  }
  return out;
}

/** a screen with the expressions of its data sources (their params and bodies) mapped */
export function mapFrameExprs(f: Frame, m: ExprMap): Frame {
  if (!Array.isArray(f.data)) return f;
  const data = f.data.map((d) => (isRecord(d) ? withField(withField(d, "params", mapRecord(d.params, m)), "body", typeof d.body === "string" ? m.expr(d.body) : d.body) : d));
  return data.some((d, i) => d !== f.data![i]) ? { ...f, data } : f;
}

/** The parts of a document that hold expressions, every expression in them mapped: the groups on the canvas, the
 *  groups inside reusable components, the screens' data sources. The same arrays where none changes. */
export function mapDocExprs<D extends { groups: Group[]; frames: Frame[]; components?: { groups: Group[] }[] }>(doc: D, m: ExprMap): D {
  const list = <T>(xs: T[], fn: (x: T) => T) => {
    const next = xs.map(fn);
    return next.some((x, i) => x !== xs[i]) ? next : xs;
  };
  let out = doc;
  out = withField(out, "groups", list(doc.groups, (g) => mapGroupExprs(g, m)));
  out = withField(out, "frames", list(doc.frames, (f) => mapFrameExprs(f, m)));
  if (Array.isArray(doc.components)) out = withField(out, "components", list(doc.components, (c) => (Array.isArray(c.groups) ? withField(c, "groups", list(c.groups, (g) => mapGroupExprs(g, m))) : c)) as D["components"]);
  return out;
}

/* ---------- variables: by key, and by name kept up ---------- */

/** The variable `vars.<name>` reads, the way every runtime builds `vars` (lib/bindings/scope.ts `varsOf`): by key
 *  (the id) first, a name over it, the last variable of a name winning. */
export function varRead(vars: readonly Pick<DocVar, "id" | "name">[], name: string): string | undefined {
  for (let i = vars.length - 1; i >= 0; i--) if (vars[i].name && vars[i].name === name) return vars[i].id;
  return vars.find((v) => v.id === name)?.id;
}

/** How each read of a variable is to be spelled once the variables are `after` instead of `before`: every read reads
 *  the variable it read before. A read that would now read another (a rename that took a name another variable is
 *  read by, or gave up the name it was read by) is written by the variable's new name where that reads it, else by its
 *  key, which never changes. A read of no variable is left as it is. */
export function varReadsKept(before: readonly Pick<DocVar, "id" | "name">[], after: readonly Pick<DocVar, "id" | "name">[]): NameMap {
  return (root, name) => {
    if (root !== "vars") return null;
    const was = varRead(before, name);
    if (!was || varRead(after, name) === was) return null;
    const v = after.find((x) => x.id === was);
    if (!v) return null;
    if (v.name && varRead(after, v.name) === was) return v.name;
    return varRead(after, v.id) === was ? v.id : null;
  };
}

/** a document whose variables are now `after`, every expression still reading the variable it read */
export const renameVarReads = <D extends { groups: Group[]; frames: Frame[]; components?: { groups: Group[] }[]; vars?: DocVar[] }>(doc: D, after: DocVar[]): D => mapDocExprs(doc, namesMap(varReadsKept(doc.vars ?? [], after)));

/** a map that reads `root.<from>` as `root.<to>`, for a data source or a param of one screen */
export const renamedName =
  (root: "data" | "params", from: string, to: string): NameMap =>
  (r, name) =>
    r === root && name === from ? to : null;
