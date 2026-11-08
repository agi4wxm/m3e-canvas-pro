/* Version 3 of the document format (lib/migrations.ts): what a tap, a condition and a binding say is written one way.
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

/* ---------- what is written from now on ---------- */

/** A tap as version 3 writes it, for the operations that write one (set_action): its transitions following its
 *  motions, at every depth, and its condition's value as what it is compared as. */
export function convergedAction<A>(a: A, vars: unknown): A {
  return walkAction(a, { body: bodyTransition, condition: conditionValue(vars) }) as A;
}

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
