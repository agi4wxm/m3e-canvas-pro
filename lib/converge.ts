/* Versions 3 and 4 of the document format (lib/migrations.ts). Version 3 (this first half) wrote what a tap, a condition
 * and a binding say in the forms every reader of the time read alike; version 4 (the second half, below) leaves one form
 * of each and moved every reader onto it.
 *
 * Version 3: what a tap, a condition and a binding say is written one way.
 *
 * Every reader of a document (the preview, the web prototype and product printers, the React Native and mini-program
 * kits, the AI's tools) is being moved onto the one interpreter (lib/actions) while this step lands, so the step only
 * writes forms every one of them reads today, and reads the same way: each change below leaves what any of them does
 * with the document exactly as it was (lib/migrations.test.ts holds the old files to that). The readers keep reading
 * the older spellings too, for documents that come in without a version; a later version drops them.
 *
 * - Transitions: where a tap has a `motion`, that is how the screen comes in, and `transition` beside it is always the
 *   nearest older kind (what `withMotion` writes), never another one; a tap that says neither says `slide` (or `none`
 *   when it goes to no screen), as the panel shows it and the exports play it. The older transitions without a motion
 *   (`slide` 0.42 s on the emphasized curve or the theme's spring, `fade`, `expand`) have no motion that plays the same,
 *   so they stay until Motion can say them (docs/交接.md 第四批, left for the readers' next wave).
 * - Conditions: `{var, op, value}` compares by text in every reader ("3" and 3 are the same answer), so `value` is
 *   written as what it is compared as: of the variable's type where the text is the same (`"3"` → `3` for a number,
 *   `"true"` → `true` for a bool), the text of it for a field of a collection's row (`row.<field>`).
 * - Bindings: a prop bound to an expression is `=` and the expression with no space around it; a part bound to
 *   nothing has no `bind`.
 *
 * Each of these is a pure function of the document: it never changes what it is given, it keeps every field it does
 * not know, and it is idempotent. It is written against the format as it was at version 2 and depends on nothing that
 * may change after it (no reader, no registry), so it does the same to a document whenever it runs. */

import type { Migration, MigrationDoc } from "./migrations";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** how deep a call's `then` and `catch` are followed: past what any document may hold */
const MAX_DEPTH = 8;

/* ---------- walking a document ---------- */

/** what a step does to the places it changes; each returns what it was given when nothing changes */
type Visit = {
  body?: (b: Record<string, unknown>) => Record<string, unknown>;
  condition?: (c: Record<string, unknown>) => Record<string, unknown>;
  item?: (it: Record<string, unknown>) => Record<string, unknown>;
};

const same = <T>(xs: T[], next: T[]) => (next.some((x, i) => x !== xs[i]) ? next : xs);
const withKey = (o: Record<string, unknown>, k: string, v: unknown) => (o[k] === v ? o : { ...o, [k]: v });

/** a tap's body, and the bodies a call or an invoke in it answers with, at any depth */
function walkBody(b: unknown, v: Visit, depth: number): unknown {
  if (!isRecord(b)) return b;
  let out = b;
  if (Array.isArray(b.effects) && depth < MAX_DEPTH) {
    const effects = same(
      b.effects,
      b.effects.map((e) => {
        if (!isRecord(e) || (e.do !== "call" && e.do !== "invoke")) return e;
        let x = e;
        if ("then" in e) x = withKey(x, "then", walkBody(e.then, v, depth + 1));
        if ("catch" in e) x = withKey(x, "catch", walkBody(e.catch, v, depth + 1));
        return x;
      }),
    );
    out = withKey(out, "effects", effects);
  }
  return v.body ? v.body(out) : out;
}

/** a whole tap: its body, its condition, its `else` */
function walkAction(a: unknown, v: Visit): unknown {
  if (!isRecord(a)) return a;
  let out = walkBody(a, v, 0) as Record<string, unknown>;
  if (isRecord(a.when) && v.condition) out = withKey(out, "when", v.condition(a.when));
  if ("else" in a) out = withKey(out, "else", walkBody(a.else, v, 0));
  return out;
}

function walkItem(it: unknown, v: Visit): unknown {
  if (!isRecord(it)) return it;
  let out = it;
  if ("action" in it) out = withKey(out, "action", walkAction(it.action, v));
  if (isRecord(it.actions)) {
    const entries = Object.entries(it.actions);
    const next = entries.map(([k, a]) => [k, walkAction(a, v)] as const);
    if (next.some(([, a], i) => a !== entries[i][1])) out = { ...out, actions: Object.fromEntries(next) };
  }
  return v.item ? v.item(out) : out;
}

function walkGroup(g: unknown, v: Visit): unknown {
  if (!isRecord(g)) return g;
  let out = g;
  if (Array.isArray(g.items)) out = withKey(out, "items", same(g.items, g.items.map((it) => walkItem(it, v))));
  if (isRecord(g.showWhen) && v.condition) out = withKey(out, "showWhen", v.condition(g.showWhen));
  if (isRecord(g.form)) {
    let form = g.form;
    if ("then" in form) form = withKey(form, "then", walkBody(form.then, v, 0));
    if ("catch" in form) form = withKey(form, "catch", walkBody(form.catch, v, 0));
    out = withKey(out, "form", form);
  }
  return out;
}

/** the document with every group (on the canvas and inside reusable components) walked */
function walkDoc(doc: MigrationDoc, v: Visit): MigrationDoc {
  let out = doc;
  if (Array.isArray(doc.groups)) out = withKey(out, "groups", same(doc.groups, doc.groups.map((g) => walkGroup(g, v))));
  if (Array.isArray(doc.components))
    out = withKey(
      out,
      "components",
      same(
        doc.components,
        doc.components.map((c) => (isRecord(c) && Array.isArray(c.groups) ? withKey(c, "groups", same(c.groups, c.groups.map((g) => walkGroup(g, v)))) : c)),
      ),
    );
  return out;
}

/* ---------- transitions ---------- */

/* the format's own lists at version 2, written here so the step never changes with them */
const TRANSITIONS = ["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"];
const MOTION_KINDS = ["instant", "dissolve", "move", "push", "slide"];
/** the targets that are no screen: going nowhere, back (which plays the move it came in by), a web page */
const NOT_A_SCREEN = new Set(["none", "back", "link"]);

/** the older transition nearest to a motion (lib/tokens.ts `transitionOf` at version 2) */
function nearest(m: Record<string, unknown>): string {
  if (m.kind === "instant") return "none";
  if (m.kind === "dissolve") return "fade";
  return m.dir === "right" ? "slideLeft" : m.dir === "up" ? "slideUp" : m.dir === "down" ? "slideDown" : "slide";
}

/** A tap's body with its transition one with its motion: the nearest older kind where it has a motion every reader
 *  plays (one of a kind it knows), else the one it says, else `slide` (`none` to no screen). */
export function bodyTransition(b: Record<string, unknown>): Record<string, unknown> {
  if (typeof b.to !== "string") return b;
  const m = isRecord(b.motion) && MOTION_KINDS.includes(b.motion.kind as string) ? b.motion : undefined;
  if (m) return withKey(b, "transition", nearest(m));
  if (typeof b.transition === "string" && TRANSITIONS.includes(b.transition)) return b;
  return withKey(b, "transition", NOT_A_SCREEN.has(b.to) ? "none" : "slide");
}

export const convergeTransitions = (doc: MigrationDoc): MigrationDoc => walkDoc(doc, { body: bodyTransition });

/* ---------- conditions ---------- */

/** a field of the row a repeated part was drawn for, read as a variable (lib/rules.ts `ROW_FIELD` at version 2) */
const ROW_FIELD = /^row\.[A-Za-z_$][\w$-]{0,63}$/;

/** `value` as what the condition compares it as, when its text is the same; the value as it was otherwise */
function comparedAs(value: unknown, type: unknown): unknown {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return value;
  const text = String(value);
  if (type === "text" || type === "row") return text;
  if (type === "number") {
    const n = typeof value === "number" ? value : text.trim() === text && text !== "" ? Number(text) : NaN;
    return Number.isFinite(n) && String(n) === text ? n : value;
  }
  if (type === "bool") return text === "true" ? true : text === "false" ? false : value;
  return value;
}

/** A condition with its value written as what it is compared as, for the variables a document has. */
export const conditionValue =
  (vars: unknown) =>
  (c: Record<string, unknown>): Record<string, unknown> => {
    if (typeof c.var !== "string" || "filled" in c || "expr" in c || !("value" in c)) return c;
    const type = ROW_FIELD.test(c.var) ? "row" : Array.isArray(vars) ? (vars.find((v) => isRecord(v) && v.id === c.var) as Record<string, unknown> | undefined)?.type : undefined;
    return withKey(c, "value", comparedAs(c.value, type));
  };

export const convergeConditions = (doc: MigrationDoc): MigrationDoc => walkDoc(doc, { condition: conditionValue(doc.vars) });

/* ---------- bindings ---------- */

/** A part's bindings: an expression written without space around it, none at all as no `bind`. */
export function itemBind(it: Record<string, unknown>): Record<string, unknown> {
  if (!("bind" in it)) return it;
  if (isRecord(it.bind) && !Object.keys(it.bind).length) {
    const { bind: _bind, ...rest } = it;
    return rest;
  }
  if (!isRecord(it.bind)) return it;
  const entries = Object.entries(it.bind);
  const next = entries.map(([k, v]) => [k, typeof v === "string" && v.startsWith("=") && v.slice(1).trim() && v.slice(1).trim() !== v.slice(1) ? `=${v.slice(1).trim()}` : v] as const);
  return next.some(([, v], i) => v !== entries[i][1]) ? { ...it, bind: Object.fromEntries(next) } : it;
}

export const convergeBindings = (doc: MigrationDoc): MigrationDoc => walkDoc(doc, { item: itemBind });

/* ---------- the step ---------- */

/** the parts of the step, in the order it runs them, each a step of its own for its tests */
export const CONVERGE_PARTS: readonly { name: string; up: (doc: MigrationDoc) => MigrationDoc }[] = [
  { name: "transitions", up: convergeTransitions },
  { name: "conditions", up: convergeConditions },
  { name: "bindings", up: convergeBindings },
];

export const CONVERGE: Migration = {
  to: 3,
  name: "one written form: a tap's transition follows its motion, a condition's value is what it is compared as, a binding has no spaces and no empty bind",
  up: (doc) => CONVERGE_PARTS.reduce((d, p) => p.up(d), doc),
};

/* ================================ version 4 ================================ */

/* Version 4 (docs/项目文件.md, 第四批第三波): the forms that version 3 could only line up are now one, with every reader
 * changed to read only that one, and the older forms written over:
 *
 * - Motions: a tap says how the screen it opens comes in by its `motion` alone. An older `transition` becomes the
 *   motion that plays it exactly (lib/screenMotion.ts `TRANSITION_MOTIONS`: a slide on the theme's motion for 0.42 s,
 *   a fade on the emphasized curve for 0.3 s, an expand for 0.36 s, none at once); the default slide is no motion at
 *   all, as a tap that says none plays it. `transition` is gone from every body.
 * - Bindings: a prop (or a field of a part's design, `@fill`...) is bound to an expression, `=` and the expression. A
 *   prop bound to a variable's id is bound to the expression that reads that variable (`=vars.count`, by its name
 *   where the name reads it, else by its key: `=vars["v-1"]`); an input bound so writes what is entered back to it, as
 *   it did. A field of the design (`@fill`...) names its variable by key, always: `=vars["v-1"]`. A binding to a
 *   variable that is gone bound nothing and is left out.
 * - Conditions: what a condition compares is an expression. `{var, op, value}` becomes `{expr}`: `vars.n == 3` where
 *   the value is of the variable's type (the comparison by text it was then gives the same answer), the text of the
 *   variable compared otherwise (`string(vars.n) == "3.0"`), a field of the row a part was drawn for `row.price == "3"`
 *   (a row that has no such field answering no to both, as it did). One on a variable that is gone held never: `false`.
 *   `{filled}` (a part has something in it) and `{expr}` stay.
 * - Rows: words in a part repeated over a collection read a field of its row as `{{row.<field>}}`, as an expression
 *   anywhere else reads it, where they said `{{<field>}}`. The parts a repeat repeats are found by the auto layout they
 *   are in; a part placed freely in a row's box is found only by laying the screen out, which a step cannot do, so its
 *   words are left (the readers still fill a bare `{{field}}` of a row there: lib/collections.ts `fillRow`).
 *
 * Like version 3 it is pure, keeps what it does not know, is idempotent, and is written against the format as it was
 * at version 3, depending on no reader. */

/** the motion each older transition plays, as lib/screenMotion.ts had it when version 4 was written */
const TRANSITION_MOTIONS_V4: Record<string, Record<string, unknown> | null> = {
  /* the default: a tap that says no motion plays it */
  slide: null,
  slideLeft: { kind: "slide", dir: "right", easing: "theme", ms: 420 },
  slideUp: { kind: "slide", dir: "up", easing: "theme", ms: 420 },
  slideDown: { kind: "slide", dir: "down", easing: "theme", ms: 420 },
  fade: { kind: "dissolve", easing: "emphasized", ms: 300 },
  expand: { kind: "expand", easing: "theme", ms: 360 },
  none: { kind: "instant" },
};
/** the kinds of motion version 3 knew: one of another kind is no motion any reader of it played */
const MOTION_KINDS_V3 = ["instant", "dissolve", "move", "push", "slide"];

/** A body with its transition written as the motion that plays it, and gone. A body that opens no screen (stays, goes
 *  back, opens a web page) played no transition: it only loses it (a back action keeps its own motion). */
export function bodyMotion(b: Record<string, unknown>): Record<string, unknown> {
  if (!("transition" in b)) return b;
  const { transition, ...rest } = b;
  if (typeof b.to !== "string" || NOT_A_SCREEN.has(b.to)) return rest;
  if (isRecord(b.motion) && MOTION_KINDS_V3.includes(b.motion.kind as string)) return rest;
  const { motion: _gone, ...bare } = rest;
  const m = typeof transition === "string" && transition in TRANSITION_MOTIONS_V4 ? TRANSITION_MOTIONS_V4[transition] : null;
  return m ? { ...bare, motion: m } : bare;
}

export const convergeMotions = (doc: MigrationDoc): MigrationDoc => walkDoc(doc, { body: bodyMotion });

/* ---------- reading a variable, a field of a row ---------- */

/** a name an expression may spell after a dot (lib/refs.ts `IDENTIFIER` at version 4) */
const IDENT = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
/** the step to a name: `.name` where the name allows it, else `["name"]` */
const step = (name: string) => (IDENT.test(name) ? `.${name}` : `[${quoted(name)}]`);

type VarRef = { id: string; name: string; type?: unknown };
const varList = (vars: unknown): VarRef[] => (Array.isArray(vars) ? vars.filter((v): v is Record<string, unknown> => isRecord(v) && typeof v.id === "string").map((v) => ({ id: v.id as string, name: typeof v.name === "string" ? v.name : "", type: v.type })) : []);

/** the variable `vars.<name>` reads, as every runtime builds `vars` (lib/refs.ts `varRead` at version 4): a name over a
 *  key, the last of a name winning */
function readBy(vars: VarRef[], name: string): string | undefined {
  for (let i = vars.length - 1; i >= 0; i--) if (vars[i].name && vars[i].name === name) return vars[i].id;
  return vars.find((v) => v.id === name)?.id;
}

/** the expression that reads a variable: by its name where that reads it, else by its key */
function varExpr(vars: VarRef[], id: string): string {
  const v = vars.find((x) => x.id === id);
  if (v?.name && readBy(vars, v.name) === id) return `vars${step(v.name)}`;
  return `vars${step(id)}`;
}

/* ---------- conditions ---------- */

/** words as an expression's string literal, escaped as the reader of lib/bindings/expr.ts unescapes (lib/refs.ts
 *  `exprString` at version 4) */
// eslint-disable-next-line no-control-regex -- the control characters are what the literal escapes
const quoted = (v: string) => `"${v.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\u0000-\u001f]/g, (c) => (c === "\n" ? "\\n" : c === "\t" ? "\\t" : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`))}"`;
/** a value as an expression's literal */
const literal = (v: unknown) => (typeof v === "string" ? quoted(v) : String(v));

/** the expression a comparison of a variable (or a row's field) with a value is, giving the answers it gave */
function comparisonExpr(c: Record<string, unknown>, vars: VarRef[]): string {
  const neq = c.op === "neq";
  const value = c.value;
  if (ROW_FIELD.test(c.var as string)) {
    /* a row's fields are words; one it does not have answered no to both */
    const read = `row${step((c.var as string).slice(4))}`;
    return neq ? `${read} != null && ${read} != ${literal(String(value))}` : `${read} == ${literal(String(value))}`;
  }
  const v = vars.find((x) => x.id === c.var);
  if (!v) return "false";
  const read = varExpr(vars, v.id);
  const typed = (v.type === "number" && typeof value === "number") || (v.type === "bool" && typeof value === "boolean") || ((v.type === "text" || v.type === "color") && typeof value === "string");
  /* a value of the variable's type compares as it did by text; another is compared with the variable's text */
  const left = typed ? read : `string(${read})`;
  const right = typed ? literal(value) : literal(String(value));
  return `${left} ${neq ? "!=" : "=="} ${right}`;
}

/** A condition that compares a variable as the expression it is; `{filled}` and `{expr}` as they were. */
export const conditionExpr =
  (vars: unknown, o: { unknownVar?: "never" | "keep" } = {}) =>
  (c: Record<string, unknown>): Record<string, unknown> => {
    /* only a comparison the readers of version 3 kept: one of a wrong shape was dropped on reading, and still is */
    const prim = typeof c.value === "string" || typeof c.value === "boolean" || (typeof c.value === "number" && Number.isFinite(c.value));
    if (typeof c.var !== "string" || "filled" in c || "expr" in c || (c.op !== "eq" && c.op !== "neq") || !prim) return c;
    /* one on a variable that is gone held never; an operation keeps it, to refuse it for what it is */
    if (o.unknownVar === "keep" && !ROW_FIELD.test(c.var) && !varList(vars).some((v) => v.id === c.var)) return c;
    const { var: _var, op: _op, value: _value, ...rest } = c;
    return { ...rest, expr: comparisonExpr(c, varList(vars)) };
  };

export const convergeConditionExprs = (doc: MigrationDoc): MigrationDoc => walkDoc(doc, { condition: conditionExpr(doc.vars) });

/* ---------- bindings ---------- */

/** A part's bindings, each an expression: a variable's id the expression that reads it, one that is gone left out. */
export const itemBindExpr =
  (vars: unknown) =>
  (it: Record<string, unknown>): Record<string, unknown> => {
    if (!isRecord(it.bind)) return it;
    const list = varList(vars);
    const entries = Object.entries(it.bind);
    const next = entries.flatMap(([k, v]): [string, unknown][] => {
      if (typeof v !== "string" || v.startsWith("=")) return [[k, v]];
      if (!list.some((x) => x.id === v)) return [];
      /* a field of the design follows its variable by key (lib/bindings/bind.ts `fieldVarOf`); a prop reads it as any
         expression does */
      return [[k, k.startsWith("@") ? `=vars[${quoted(v)}]` : `=${varExpr(list, v)}`]];
    });
    if (next.length === entries.length && next.every(([, v], i) => v === entries[i][1])) return it;
    if (!next.length) {
      const { bind: _bind, ...rest } = it;
      return rest;
    }
    return { ...it, bind: Object.fromEntries(next) };
  };

export const convergeBindExprs = (doc: MigrationDoc): MigrationDoc => walkDoc(doc, { item: itemBindExpr(doc.vars) });

/* ---------- rows ---------- */

/* what is between a token's braces is taken whole (lib/bindings/expr.ts reads words so) */
const TOKEN = /\{\{([^{}]*)\}\}/g;
/** words an expression can be: what starts with a root or a helper's call reads the bindings, and is no field */
const READS_ROOT = /^(?:data|params|vars|item|index|form|auth|response|error|status|row|now|event|slot|result|collections|current)\b|^[A-Za-z_$][\w$]*\s*\(/;

/** words with each `{{field}}` of a row's fields read as `{{row.field}}` */
function rowWords(text: string, fields: Set<string>): string {
  if (!text.includes("{{")) return text;
  const out = text.replace(TOKEN, (whole, inner: string) => {
    const key = inner.trim();
    return key && fields.has(key) && !READS_ROOT.test(key) ? `{{row${step(key)}}}` : whole;
  });
  return out === text ? text : out;
}

function deepWords<T>(value: T, fill: (text: string) => string, depth = 0): T {
  if (depth > 64) return value;
  if (typeof value === "string") return fill(value) as T;
  if (Array.isArray(value)) {
    const out = value.map((x) => deepWords(x, fill, depth + 1));
    return out.some((x, i) => x !== value[i]) ? (out as T) : value;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    const out = entries.map(([k, v]) => [k, deepWords(v, fill, depth + 1)] as const);
    return out.some(([, v], i) => v !== entries[i][1]) ? (Object.fromEntries(out) as T) : value;
  }
  return value;
}

/** the groups of a list with their words read as a repeat's rows read them: in each repeat over a collection, its first
 *  child (the template) and everything laid out in it, at any depth */
function rowGroups(groups: unknown[], collections: unknown): unknown[] {
  const fieldsOf = new Map<string, Set<string>>();
  for (const c of Array.isArray(collections) ? collections : []) if (isRecord(c) && typeof c.id === "string" && Array.isArray(c.fields)) fieldsOf.set(c.id, new Set(c.fields.filter((f): f is string => typeof f === "string")));
  const byId = new Map<string, Record<string, unknown>>();
  for (const g of groups) if (isRecord(g) && typeof g.id === "string") byId.set(g.id, g);
  const kids = new Map<string, Record<string, unknown>[]>();
  for (const g of groups) if (isRecord(g) && typeof g.inFlow === "string") (kids.get(g.inFlow) ?? kids.set(g.inFlow, []).get(g.inFlow)!).push(g);
  /* the fields each group's words read, from every repeat it is in */
  const reads = new Map<Record<string, unknown>, Set<string>>();
  for (const host of groups) {
    if (!isRecord(host) || !isRecord(host.repeat) || typeof host.repeat.collection !== "string" || typeof host.id !== "string") continue;
    const fields = fieldsOf.get(host.repeat.collection);
    if (!fields?.size) continue;
    /* the template: the first child laid out in it, of the first pane where it has panes */
    const template = (kids.get(host.id) ?? []).find((g) => !isRecord(host.states) || ((g.pane as number | undefined) ?? 0) === 0);
    if (!template) continue;
    const seen = new Set<Record<string, unknown>>();
    const visit = (g: Record<string, unknown>, depth: number) => {
      if (seen.has(g) || depth > 64) return;
      seen.add(g);
      const had = reads.get(g) ?? new Set<string>();
      for (const f of fields) had.add(f);
      reads.set(g, had);
      if (typeof g.id === "string") for (const k of kids.get(g.id) ?? []) visit(k, depth + 1);
    };
    visit(template, 0);
  }
  if (!reads.size) return groups;
  return groups.map((g) => {
    const fields = isRecord(g) ? reads.get(g) : undefined;
    if (!fields || !Array.isArray((g as Record<string, unknown>).items)) return g;
    const fill = (text: string) => rowWords(text, fields);
    const items = (g as { items: unknown[] }).items.map((it) => {
      if (!isRecord(it)) return it;
      let out = it;
      for (const k of ["props", "action", "actions"] as const) if (k in it) out = withKey(out, k, deepWords(it[k], fill));
      return out;
    });
    return withKey(g as Record<string, unknown>, "items", same((g as { items: unknown[] }).items, items));
  });
}

export function convergeRows(doc: MigrationDoc): MigrationDoc {
  let out = doc;
  if (Array.isArray(doc.groups)) out = withKey(out, "groups", same(doc.groups, rowGroups(doc.groups, doc.collections)));
  if (Array.isArray(doc.components))
    out = withKey(out, "components", same(doc.components, doc.components.map((c) => (isRecord(c) && Array.isArray(c.groups) ? withKey(c, "groups", same(c.groups, rowGroups(c.groups, doc.collections))) : c))));
  return out;
}

/* ---------- what is written from now on ---------- */

/** A tap as version 4 writes it, for the operations that write one (set_action): a motion for its transition at every
 *  depth, its conditions as expressions. */
export function convergedAction<A>(a: A, vars: unknown): A {
  const typed = conditionValue(vars);
  const asExpr = conditionExpr(vars, { unknownVar: "keep" });
  /* what a model or a hand may still give in the older forms goes through both steps, as an old file does */
  /* a body that says no transition is left as it was given: a motion of no kind is the operation's to refuse */
  return walkAction(a, { body: (b) => ("transition" in b ? bodyMotion(bodyTransition(b)) : b), condition: (c) => asExpr(typed(c)) }) as A;
}

/** a condition as version 4 writes it, for the operations that write one (a group's showWhen) */
export const convergedCondition = <C>(c: C, vars: unknown): C => (isRecord(c) ? (conditionExpr(vars, { unknownVar: "keep" })(conditionValue(vars)(c)) as C) : c);

/** the parts of version 4, in the order it runs them; rows first, so a condition still names the row's field */
export const CONVERGE_4_PARTS: readonly { name: string; up: (doc: MigrationDoc) => MigrationDoc }[] = [
  { name: "motions", up: convergeMotions },
  { name: "rows", up: convergeRows },
  { name: "conditions", up: convergeConditionExprs },
  { name: "bindings", up: convergeBindExprs },
];

export const CONVERGE_4: Migration = {
  to: 4,
  name: "one form each, every reader on it: a tap's move is its motion, a binding and a condition are expressions, a repeat's words read row.<field>",
  up: (doc) => CONVERGE_4_PARTS.reduce((d, p) => p.up(d), doc),
};

/* ---------- version 5: one name and one unit for each idea a part's props hold ----------
 *
 * The props of the parts said the same thing under different names (a field's line of help was `supporting`,
 * `description` or `hint`; a variant was `style` on two parts; a close button `closable` on two) and in different units
 * (one duration in milliseconds where every other is in seconds; one part's sizes small/medium/large where every other
 * says sm/default/lg). Version 5 renames them to the one scheme docs/组件规范.md "属性的名字和单位" sets out, and every
 * reader (the parts, both apps' kits, the printers, the panels, the AI's tools) reads only the new names. What a part
 * draws does not change: an old file's parts read, under the new names and in the new units, what they read before.
 *
 * Wherever a document says a prop by its key, the key moves and the value is written in the new unit: the part's own
 * props, what it is bound to (an expression is wrapped so it comes to the same in the new unit), a tap that sets it
 * (`setProp`), what an instance overrides of it (`itemId/key`), a component property that shows words in it (its
 * target). Like the steps before it, the step knows only its own table: it depends on no reader and no registry. */

/** a value of the kind given, else what came */
const numberIn = (f: (n: number) => number) => (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? f(v) : v);
const choiceIn = (map: Record<string, string>) => (v: unknown) => (typeof v === "string" && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : v);

/** One prop of a part that version 5 renames, rescales or whose choices it renames. */
export type PropRename = {
  slug: string;
  from: string;
  to: string;
  /** a value as written now, in the new unit or form; anything not of the kind it converts is left as it is */
  value?: (v: unknown) => unknown;
  /** a bound expression's source that comes to the same in the new unit (what `value` does to what it came to) */
  expr?: (source: string) => string;
  /** whether a source is one `expr` wrote, so that a prop that keeps its key is never wrapped twice */
  wrapped?: (source: string) => boolean;
  /** a value as the part reads it now, back in the old unit or form: for the tests of old files (`asWrittenAt4`) */
  down?: (v: unknown) => unknown;
  /** what a tap that sets the prop sets it to now, where that is not `value` (a tap sets words, a number or yes or no,
   *  never rows: a palette's colors set by a tap stay the words the palette reads its colors from) */
  set?: (v: unknown) => unknown;
};

const PRICE_SIZES: Record<string, string> = { small: "sm", medium: "default", large: "lg" };
const PRICE_SIZES_BACK: Record<string, string> = { sm: "small", default: "medium", lg: "large" };
/** a size of a price as an expression came to it at version 4 (one of the old words, else nothing), in the new words */
const priceSizeExpr = (source: string) => {
  const x = `(${source})`;
  return `${x} == "small" ? "sm" : ${x} == "medium" ? "default" : ${x} == "large" ? "lg" : null`;
};
const PRICE_SIZE_WRAPPED = /^\(([\s\S]*)\) == "small" \? "sm" : \(\1\) == "medium" \? "default" : \(\1\) == "large" \? "lg" : null$/;

/** The props version 5 renames, by part: the inventory of docs/组件规范.md "属性的名字和单位" says why each. */
export const PROP_RENAMES_5: readonly PropRename[] = [
  /* a field's line of help is `helperText` and its message `errorText`, the field state package's own names */
  { slug: "text-field", from: "supporting", to: "helperText" },
  { slug: "select", from: "supporting", to: "helperText" },
  { slug: "field", from: "description", to: "helperText" },
  { slug: "field", from: "error", to: "errorText" },
  { slug: "file-upload", from: "hint", to: "helperText" },
  /* the look a part comes in is its `variant` */
  { slug: "dialog", from: "style", to: "variant" },
  { slug: "search", from: "style", to: "variant" },
  /* an overlay's two buttons are `dismiss` and `confirm`, as its places to tap always were */
  { slug: "alert-dialog", from: "cancel", to: "dismiss" },
  { slug: "alert-dialog", from: "action", to: "confirm" },
  /* a close button the author turns on is `closeButton` */
  { slug: "banner", from: "closable", to: "closeButton" },
  { slug: "notice-bar", from: "closable", to: "closeButton" },
  /* `selected` is which one is picked, a number, on every part; a cell picked on its own is `pressed`, as a toggle is */
  { slug: "item-cell", from: "selected", to: "pressed" },
  /* a type style is a `style`, as the text's is */
  { slug: "number-ticker", from: "size", to: "style" },
  /* a time a person sets is in seconds */
  { slug: "scene", from: "frameMs", to: "frameSeconds", value: numberIn((ms) => ms / 1000), expr: (s) => `(${s}) / 1000`, down: numberIn((s) => Math.round(s * 1e6) / 1e3) },
  /* a size from a few is sm, default or lg */
  { slug: "price-tag", from: "size", to: "size", value: choiceIn(PRICE_SIZES), expr: priceSizeExpr, wrapped: (s) => PRICE_SIZE_WRAPPED.test(s), down: choiceIn(PRICE_SIZES_BACK) },
];

/** a table of renames, read by part (version 5's, and version 6's after it) */
type Renames = readonly PropRename[];
const renamesIn = (table: Renames, slug: unknown): PropRename[] => table.filter((r) => r.slug === slug);
const renameIn = (table: Renames, slug: unknown, key: string): PropRename | undefined => table.find((r) => r.slug === slug && r.from === key);
const renamesOf = (slug: unknown): PropRename[] => renamesIn(PROP_RENAMES_5, slug);
const convert = (r: PropRename, v: unknown) => (r.value ? r.value(v) : v);

/** A part's props (or bindings) under the new names, each value as `move` writes it; one already in the new form comes
 *  back as it was. Where a new key is written beside the old one, the old key's value wins: it is what version 4 read,
 *  and the new key was a field no reader of the time knew. */
function renamedKeys(rs: PropRename[], o: Record<string, unknown>, move: (r: PropRename, v: unknown) => unknown): Record<string, unknown> {
  if (!rs.some((r) => r.from in o)) return o;
  const out: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(o)) {
    const r = rs.find((x) => x.from === k);
    if (r) {
      const next = move(r, v);
      if (next !== v || r.to !== k) changed = true;
      out[r.to] = next;
    } else if (rs.some((x) => x.to === k && x.from !== k && x.from in o)) changed = true;
    else out[k] = v;
  }
  return changed ? out : o;
}

/** a bound expression that comes to the same in the new unit: wrapped once, and never again where the key stays */
function boundTo(r: PropRename, b: unknown): unknown {
  if (typeof b !== "string" || !b.startsWith("=") || !r.expr) return b;
  const source = b.slice(1);
  if (r.from === r.to && r.wrapped?.(source)) return b;
  return `=${r.expr(source)}`;
}

const renamedItem =
  (table: Renames, bound: (r: PropRename, b: unknown) => unknown = boundTo) =>
  (it: Record<string, unknown>): Record<string, unknown> => {
    let out = it;
    const rs = renamesIn(table, it.component);
    if (!rs.length) return it;
    if (isRecord(it.props)) out = withKey(out, "props", renamedKeys(rs, it.props, convert));
    if (isRecord(it.bind)) out = withKey(out, "bind", renamedKeys(rs, it.bind, bound));
    return out;
  };

/** every part's id, on the canvas and in each component, with the part it is (one id that is two parts is left out) */
function partsById(doc: MigrationDoc): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const clash = new Set<string>();
  const groups = (gs: unknown) => {
    if (!Array.isArray(gs)) return;
    for (const g of gs)
      if (isRecord(g) && Array.isArray(g.items))
        for (const it of g.items) {
          if (!isRecord(it) || typeof it.id !== "string") continue;
          if (out.has(it.id) && out.get(it.id) !== it.component) clash.add(it.id);
          out.set(it.id, it.component);
        }
  };
  groups(doc.groups);
  if (Array.isArray(doc.components)) for (const c of doc.components) if (isRecord(c)) groups(c.groups);
  for (const id of clash) out.delete(id);
  return out;
}

/** the part a reference names: an id, or the path to one inside instances (`instance/part`), whose last step it is */
const partAt = (parts: Map<string, unknown>, path: unknown) => (typeof path === "string" ? parts.get(path.slice(path.lastIndexOf("/") + 1)) : undefined);

/** a tap's effects that set a renamed prop, setting it under its new name to the value in the new unit */
const renamedSets =
  (table: Renames, parts: Map<string, unknown>) =>
  (b: Record<string, unknown>): Record<string, unknown> => {
    if (!Array.isArray(b.effects)) return b;
    const effects = same(
      b.effects,
      b.effects.map((e) => {
        if (!isRecord(e) || e.do !== "setProp" || typeof e.prop !== "string") return e;
        const r = renameIn(table, partAt(parts, e.part), e.prop);
        if (!r) return e;
        return withKey(withKey(e, "prop", r.to), "value", r.set ? r.set(e.value) : convert(r, e.value));
      }),
    );
    return withKey(b, "effects", effects);
  };

/** an override key (`path/itemId/key`) and its value under the new name and unit, or undefined where it is none */
function renamedKey(table: Renames, parts: Map<string, unknown>, key: string): PropRename | undefined {
  const at = key.lastIndexOf("/");
  if (at <= 0) return undefined;
  return renameIn(table, partAt(parts, key.slice(0, at)), key.slice(at + 1));
}
const keyTo = (key: string, r: PropRename) => `${key.slice(0, key.lastIndexOf("/") + 1)}${r.to}`;

/** what instances override and what component properties write, under the new names */
function renamedOverrides(table: Renames, doc: MigrationDoc, parts: Map<string, unknown>): MigrationDoc {
  /* a component property that shows its words in a renamed prop: its targets, and what it and each instance give it */
  const converted = new Map<string, PropRename>();
  const components = !Array.isArray(doc.components)
    ? doc.components
    : same(
        doc.components,
        doc.components.map((c) => {
          if (!isRecord(c) || !Array.isArray(c.props)) return c;
          const props = same(
            c.props,
            c.props.map((p) => {
              if (!isRecord(p) || !Array.isArray(p.targets)) return p;
              const rs = p.targets.map((t) => (typeof t === "string" ? renamedKey(table, parts, t) : undefined));
              if (!rs.some(Boolean)) return p;
              const conv = rs.find((r) => r?.value);
              if (conv && typeof p.id === "string" && typeof c.id === "string") converted.set(`${c.id}\u0000${p.id}`, conv);
              let out = withKey(p, "targets", p.targets.map((t, i) => (rs[i] ? keyTo(t as string, rs[i]!) : t)));
              if (conv) out = withKey(out, "value", convert(conv, p.value));
              return out;
            }),
          );
          return withKey(c, "props", props);
        }),
      );
  const group = (g: unknown): unknown => {
    if (!isRecord(g)) return g;
    let out = g;
    if (isRecord(g.overrides)) {
      const entries = Object.entries(g.overrides);
      const next = entries.map(([k, v]) => {
        const r = renamedKey(table, parts, k);
        return r ? ([keyTo(k, r), convert(r, v)] as const) : ([k, v] as const);
      });
      if (next.some(([k, v], i) => k !== entries[i][0] || v !== entries[i][1])) out = { ...out, overrides: Object.fromEntries(next) };
    }
    if (isRecord(g.properties) && typeof g.instanceOf === "string") {
      const entries = Object.entries(g.properties);
      const next = entries.map(([k, v]) => {
        const r = converted.get(`${g.instanceOf}\u0000${k}`);
        return [k, r ? convert(r, v) : v] as const;
      });
      if (next.some(([, v], i) => v !== entries[i][1])) out = { ...out, properties: Object.fromEntries(next) };
    }
    return out;
  };
  let out = withKey(doc, "components", components);
  if (Array.isArray(out.groups)) out = withKey(out, "groups", same(out.groups, out.groups.map(group)));
  if (Array.isArray(out.components))
    out = withKey(out, "components", same(out.components, out.components.map((c) => (isRecord(c) && Array.isArray(c.groups) ? withKey(c, "groups", same(c.groups, c.groups.map(group))) : c))));
  return out;
}

/** A document with a table's props renamed wherever it says them: a part's props and bindings, what a tap sets, what an
 *  instance overrides and what a component property writes. */
function renamedProps(table: Renames, doc: MigrationDoc, bound?: (r: PropRename, b: unknown) => unknown): MigrationDoc {
  const parts = partsById(doc);
  return renamedOverrides(table, walkDoc(doc, { item: renamedItem(table, bound), body: renamedSets(table, parts) }), parts);
}

export const convergeNames = (doc: MigrationDoc): MigrationDoc => renamedProps(PROP_RENAMES_5, doc);

/** What a part reads now (every prop, by its key), as version 4 read it: under the old names, in the old units, in
 *  the order its props came in. For the tests of old files, which hold the readings the versions that wrote them made. */
export function asWrittenAt4(slug: string | undefined, read: Record<string, unknown>): Record<string, unknown> {
  return asWrittenAt4From5(slug, asWrittenAt5(slug, read));
}
function asWrittenAt4From5(slug: string | undefined, read: Record<string, unknown>): Record<string, unknown> {
  const rs = renamesOf(slug);
  if (!rs.length) return read;
  return Object.fromEntries(
    Object.entries(read).map(([k, v]) => {
      const r = rs.find((x) => x.to === k);
      return r ? [r.from, r.down ? r.down(v) : v] : [k, v];
    }),
  );
}

export const CONVERGE_5: Migration = {
  to: 5,
  name: "one name and one unit for each idea a part's props hold: a field's help and message, a variant, a dialog's buttons, a close button, a duration in seconds, a size from a few",
  up: convergeNames,
};

/* ---------- version 6: the row model and the one color value ----------
 *
 * Two models the parts lacked (docs/组件规范.md "行模型" and "颜色"), and the props moved onto them:
 *
 * - Colors. Every color prop holds one color value (parts/color.ts): a role, a role at a share of itself, a hex, or ""
 *   for none set. The words some parts had of their own for a color are written as the color they drew: `muted` is
 *   `on-surface-variant`, `inverse` is `inverse-on-surface`, a dot's and a list row's `surface` is
 *   `surface-container-highest`; `default`, `current` and `none` are "" (the part's own color, or no paint), except a
 *   vector's `default`, which drew `on-surface`. A rarity's color written as free words holds a color now: what was no
 *   hex (and so was never painted) is "". A palette's colors, words with commas between them, are rows of the row model,
 *   each a color and the name it is read out by (its color, as it was read out).
 * - Places from 0. Which row a table has picked, which page a pagination is on, which level a level map has reached and
 *   which rows a multiple choice has picked were counted from 1; they are counted from 0 now, as every other `selected`
 *   is (a table that picked none is -1). A value can only be moved once if its key moves with it, so each takes a key of
 *   its own: `selectedRow`, `page`, `level`, `picked`. An expression bound to one of the numbers is wrapped to come to
 *   the same row. A multiple choice's picks are words (`"1,3"`), which no expression can count down: one bound to a
 *   variable stays bound to it, two ways, and the variable's own value is written from 0 too; one bound to any other
 *   expression is left as it is, and reads its words as places from 0 from now on.
 *
 * Like the steps before it, the step knows only its own tables, keeps every field it does not know and is idempotent;
 * it is written against the format as it was at version 5. */

/** Words that hold rows counted from 1 ("1,3"), as places from 0 ("0,2"): each number one less, everything else as it
 *  was (what was no row before is none now either, and reads back the same). */
export const placesFrom0 = (v: unknown): unknown => (typeof v === "string" ? v.replace(/-?\d+/g, (n) => String(Number(n) - 1)) : v);
const placesFrom1 = (v: unknown): unknown => (typeof v === "string" ? v.replace(/-?\d+/g, (n) => String(Number(n) + 1)) : v);

/** The words parts had of their own for a color, by `<slug>.<prop>`, and the color each drew (parts/color.ts). */
export const COLOR_WORDS_6: Record<string, Record<string, string>> = {
  "svg.color": { current: "", default: "on-surface", muted: "on-surface-variant" },
  "dot.color": { muted: "on-surface-variant", surface: "surface-container-highest" },
  "item.iconFill": { none: "", surface: "surface-container-highest" },
  "separator.color": { default: "" },
  "icon.color": { default: "", muted: "on-surface-variant", inverse: "inverse-on-surface" },
  "container.fill": { none: "" },
  "text.color": { default: "", muted: "on-surface-variant", inverse: "inverse-on-surface" },
};

/** the roles a color may name, as parts/color.ts had them at version 6 */
const ROLES_6 = new Set(
  "primary on-primary primary-container on-primary-container inverse-primary primary-fixed primary-fixed-dim on-primary-fixed on-primary-fixed-variant secondary on-secondary secondary-container on-secondary-container secondary-fixed secondary-fixed-dim on-secondary-fixed on-secondary-fixed-variant tertiary on-tertiary tertiary-container on-tertiary-container tertiary-fixed tertiary-fixed-dim on-tertiary-fixed on-tertiary-fixed-variant error on-error error-container on-error-container background on-background surface on-surface surface-variant on-surface-variant surface-dim surface-bright surface-container-lowest surface-container-low surface-container surface-container-high surface-container-highest inverse-surface inverse-on-surface surface-tint outline outline-variant shadow scrim".split(" "),
);
/** whether words are a color as version 6 reads one: a hex, a role, a role at a share of itself */
function isColor6(v: string): boolean {
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return true;
  const m = /^([a-z]+(?:-[a-z]+)*)(?:\/(\d{1,3}))?$/.exec(v);
  return !!m && ROLES_6.has(m[1]) && (m[2] === undefined || Number(m[2]) <= 100);
}

/** an expression's source that comes to the color its words drew: each word as its color, anything else as it came */
const colorWordsExpr = (words: Record<string, string>) => (source: string) => {
  const x = `(${source})`;
  return `${Object.entries(words)
    .map(([from, to]) => `${x} == ${quoted(from)} ? ${quoted(to)} : `)
    .join("")}${x}`;
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const colorWordsWrapped = (words: Record<string, string>) => {
  const re = new RegExp(`^\\(([\\s\\S]*)\\) == ${escapeRe(quoted(Object.keys(words)[0]))} \\? `);
  return (source: string) => re.test(source);
};
const backOf = (words: Record<string, string>) => {
  const back: Record<string, string> = {};
  for (const [from, to] of Object.entries(words)) back[to] ??= from;
  return back;
};

/** a palette's colors, words with commas between them, as rows: each a color and the name it is read out by */
const colorRows = (v: unknown): unknown => (typeof v === "string" ? v.split(",").map((w) => ({ label: w.trim(), color: w.trim() })) : v);
const colorWords = (v: unknown): unknown => (Array.isArray(v) ? v.map((r) => (isRecord(r) && typeof r.color === "string" ? r.color : "")).join(",") : v);

/** The props version 6 moves onto the row model and the one color value (see above). */
export const PROP_CHANGES_6: readonly PropRename[] = [
  ...Object.entries(COLOR_WORDS_6).map(([at, words]): PropRename => {
    const [slug, key] = at.split(".");
    return { slug, from: key, to: key, value: choiceIn(words), expr: colorWordsExpr(words), wrapped: colorWordsWrapped(words), down: choiceIn(backOf(words)) };
  }),
  /* a rarity's color is a color; words that were none were never painted */
  { slug: "item-cell", from: "rarityColor", to: "rarityColor", value: (v) => (typeof v !== "string" ? v : isColor6(v.trim()) ? v.trim() : "") },
  { slug: "color-palette", from: "colors", to: "colors", value: colorRows, down: colorWords, set: (v) => v },
  /* places from 0, each under a key of its own */
  { slug: "table", from: "selected", to: "selectedRow", value: numberIn((n) => n - 1), expr: (s) => `(${s}) - 1`, down: numberIn((n) => n + 1) },
  { slug: "pagination", from: "current", to: "page", value: numberIn((n) => n - 1), expr: (s) => `(${s}) - 1`, down: numberIn((n) => n + 1) },
  { slug: "level-map", from: "current", to: "level", value: numberIn((n) => n - 1), expr: (s) => `(${s}) - 1`, down: numberIn((n) => n + 1) },
  { slug: "multi-select", from: "selected", to: "picked", value: placesFrom0, down: placesFrom1 },
];

/** the variable a binding reads plainly (`=vars.name`, `=vars["key"]`), as every runtime builds `vars` */
function plainVarOf(vars: VarRef[], b: unknown): string | undefined {
  if (typeof b !== "string") return undefined;
  const dot = /^=vars\.([\p{L}_$][\p{L}\p{N}_$]*)$/u.exec(b);
  if (dot) return readBy(vars, dot[1]);
  const key = /^=vars\[("(?:[^"\\]|\\.)*")\]$/.exec(b);
  if (!key) return undefined;
  try {
    return readBy(vars, JSON.parse(key[1]) as string);
  } catch {
    return undefined;
  }
}

/** A multiple choice bound two ways to a variable writes its picks from 0 into it from now on: the variable's own value
 *  (and its value in each mode) is written from 0 too, so the choice starts on the rows it started on. */
function picksVars(doc: MigrationDoc): MigrationDoc {
  if (!Array.isArray(doc.vars)) return doc;
  const list = varList(doc.vars);
  const ids = new Set<string>();
  const scan = (gs: unknown) => {
    if (!Array.isArray(gs)) return;
    for (const g of gs)
      if (isRecord(g) && Array.isArray(g.items))
        for (const it of g.items) {
          if (!isRecord(it) || it.component !== "multi-select" || !isRecord(it.bind) || !("selected" in it.bind)) continue;
          const id = plainVarOf(list, it.bind.selected);
          if (id) ids.add(id);
        }
  };
  scan(doc.groups);
  if (Array.isArray(doc.components)) for (const c of doc.components) if (isRecord(c)) scan(c.groups);
  if (!ids.size) return doc;
  const vars = same(
    doc.vars,
    doc.vars.map((v) => {
      if (!isRecord(v) || typeof v.id !== "string" || !ids.has(v.id) || v.type !== "text") return v;
      let out = withKey(v, "value", placesFrom0(v.value));
      if (isRecord(v.modes)) {
        const modes = Object.fromEntries(Object.entries(v.modes).map(([k, x]) => [k, placesFrom0(x)]));
        if (Object.entries(modes).some(([k, x]) => x !== (v.modes as Record<string, unknown>)[k])) out = withKey(out, "modes", modes);
      }
      return out;
    }),
  );
  return withKey(doc, "vars", vars);
}

export function convergeRowsAndColors(doc: MigrationDoc): MigrationDoc {
  return renamedProps(PROP_CHANGES_6, picksVars(doc));
}

/** What a part reads now as version 5 read it: under its old keys, its colors in its own words, its places from 1. */
export function asWrittenAt5(slug: string | undefined, read: Record<string, unknown>): Record<string, unknown> {
  const rs = renamesIn(PROP_CHANGES_6, slug);
  if (!rs.length) return read;
  return Object.fromEntries(
    Object.entries(read).map(([k, v]) => {
      const r = rs.find((x) => x.to === k);
      return r ? [r.from, r.down ? r.down(v) : v] : [k, v];
    }),
  );
}

/** What a visitor enters into an input is, now, where version 5 took the same act as another value: picks of a
 *  multiple choice, counted from 1 then (for the tests of old files: lib/fixtures/history/drawn.ts) */
export function enteredNow(slug: string | undefined, value: unknown): unknown {
  return slug === "multi-select" ? placesFrom0(value) : value;
}

/** A part's tree as version 5 drew it, where version 6 draws the same with a widget's value in another form: a multiple
 *  choice hands its widget the rows picked from 0 (`picked`), as it hands them out; version 5 counted them from 1
 *  (`selected`). For the tests of old files. */
export function treeAsWrittenAt5(tree: unknown): unknown {
  if (Array.isArray(tree)) return tree.map(treeAsWrittenAt5);
  if (!isRecord(tree)) return tree;
  const props = isRecord(tree.props) && tree.type === "MultiSelect" && "picked" in tree.props ? Object.fromEntries(Object.entries(tree.props).map(([k, v]) => (k === "picked" ? ["selected", placesFrom1(v)] : [k, v]))) : tree.props;
  const children = Array.isArray(tree.children) ? tree.children.map(treeAsWrittenAt5) : tree.children;
  return props === tree.props && children === tree.children ? tree : { ...tree, props, children };
}

export const CONVERGE_6: Migration = {
  to: 6,
  name: "the row model and the one color value: every color prop holds a role, a share of one or a hex, a palette's colors are rows, and a table's row, a page, a level and a multiple choice's picks are counted from 0 under keys of their own",
  up: convergeRowsAndColors,
};
