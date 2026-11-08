/* What an operation checks before it writes what a model or a client asked for: a prop the part has, of its kind and
 * in its range; a color by its role; a look as `cleanLook` leaves it; a tap that goes somewhere that exists. The
 * editor's own panels write only what they show, so for them (`ctx.strict` false) nothing here refuses anything. */

import { partBySlug } from "../../../parts/registry";
import { choiceValueOf } from "../../../parts/labels";
import type { PartDef, PropDef } from "../../../parts/types";
export type { PartDef };
import { cleanLook } from "../../look";
import { styleOwnsProp } from "../../styleRules";
import { isStrict, styleContext } from "../../styles";
import { BACK_TARGET, COLOR_TOKENS, MOTION_DIRS, MOTION_EASINGS, MOTION_KINDS, TEXT_TOKENS, isTextToken, LINK_TARGET, STAY_TARGET, presetOf, type Action, type ActionBody, type Condition, type DocVar, type Effect, type Item, type VarValue } from "../../tokens";
import { cleanMotion, cleanTrigger } from "../../prototype";
import { EVENT_PREFIX, outletKeysOf } from "../../partContract";
import { H_CONSTRAINTS, V_CONSTRAINTS } from "../../constraints";
import { OpError } from "../op";
import { pictureError } from "../images";
import { docIconId, docIconName, isDocIconName } from "../../docIcons";
import type { CoreState } from "../state";
import { exprSyntaxError } from "../../bindings/check";
import { allCapabilities, argNamesOf as argNames, capabilityOf, requiredArgsOf as requiredArgs } from "../../capabilities/catalog";
import { bindRule, conditionRule } from "../../rules";
import { mapNestedBodies } from "../../refs";
import { convergedAction } from "../../converge";
import { bindOfVar, fieldBindOf } from "../../bindings/bind";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** what a prop takes, in words */
export function propKindText(d: PropDef): string {
  switch (d.kind) {
    case "text":
      return "text";
    case "icon":
      return 'a Material Symbols icon name, or svg:<id> for one of the document\'s own icons ("" for none)';
    case "enum":
      return `one of ${d.options.map((o) => JSON.stringify(choiceValueOf(o))).join(", ")}`;
    case "bool":
      return "true or false";
    case "number":
      return `a number from ${d.min} to ${d.max}${d.unit ? ` ${d.unit}` : ""}`;
    case "image":
      return 'a picture drawn into the document (a data:image URL; generate_image paints one) or ""';
    case "list":
      return `a list of rows like {"label": "…"${d.icons ? ', "icon": "…"' : ""}${d.images ? ', "image": "…"' : ""}}${d.min !== undefined ? `, at least ${d.min}` : ""}${d.max !== undefined ? `, at most ${d.max}` : ""}`;
    case "table":
      return 'a table {"columns": ["…"], "rows": [["…"]]}';
  }
}

/** words for sizes models write, by the short ones a part's choices use */
const SIZE_WORDS: Record<string, string[]> = { sm: ["small", "s"], default: ["medium", "md", "m", "normal", "regular"], lg: ["large", "l", "big"], xs: ["extra-small", "xsmall", "tiny"], xl: ["extra-large", "xlarge", "huge"] };

/** The choice a value nearly is, to name in an error: the same word in another case, a size said the long way ("large"
 *  for "lg"), or the one choice that starts with it. */
export function nearestChoice(d: Extract<PropDef, { kind: "enum" }>, v: string): string | undefined {
  const values = d.options.map(choiceValueOf);
  const w = v.trim().toLowerCase();
  const same = values.find((x) => x.toLowerCase() === w);
  if (same) return same;
  for (const [short, long] of Object.entries(SIZE_WORDS)) if (long.includes(w) && values.includes(short)) return short;
  const starts = values.filter((x) => w && (x.toLowerCase().startsWith(w) || w.startsWith(x.toLowerCase())));
  return starts.length === 1 ? starts[0] : undefined;
}

/** why a value does not suit a prop, or null when it does */
export function propValueError(d: PropDef, v: unknown): string | null {
  switch (d.kind) {
    case "text":
      return typeof v === "string" ? null : "should be text";
    case "icon":
      return typeof v === "string" && (/^[a-z0-9_]*$/.test(v) || isDocIconName(v)) ? null : "should be a Material Symbols icon name in snake_case, or svg:<id>";
    case "enum": {
      if (typeof v === "string" && d.options.some((o) => choiceValueOf(o) === v)) return null;
      const near = typeof v === "string" ? nearestChoice(d, v) : undefined;
      return `should be ${propKindText(d)}${near ? ` ("${near}" is the nearest)` : typeof v !== "string" ? `, not ${typeof v === "number" ? "a number" : typeof v}` : ""}`;
    }
    case "bool":
      return typeof v === "boolean" ? null : "should be true or false";
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return "should be a number";
      return v < d.min || v > d.max ? `should be from ${d.min} to ${d.max}` : null;
    case "image":
      return pictureError(v);
    case "list": {
      if (!Array.isArray(v)) return "should be a list of rows";
      const bad = v.findIndex((r) => !isRecord(r) || typeof r.label !== "string" || Object.entries(r).some(([k, x]) => k !== "label" && typeof x !== "string"));
      if (bad >= 0) return `row ${bad} should be {"label": "…"} with text fields only`;
      const picture = d.images ? v.findIndex((r) => r.image !== undefined && pictureError(r.image)) : -1;
      if (picture >= 0) return `row ${picture}: image ${pictureError(v[picture].image)}`;
      if (d.min !== undefined && v.length < d.min) return `should have at least ${d.min} rows`;
      if (d.max !== undefined && v.length > d.max) return `should have at most ${d.max} rows`;
      return null;
    }
    case "table": {
      if (!isRecord(v) || !Array.isArray(v.columns) || !Array.isArray(v.rows)) return 'should be {"columns": [...], "rows": [[...]]}';
      if (!v.columns.every((c) => typeof c === "string")) return "columns should be text";
      if (!v.rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string"))) return "rows should be lists of text";
      /* a row of more cells than the table has columns would lose them */
      const wide = (v.rows as unknown[][]).findIndex((r) => r.length > (v.columns as unknown[]).length);
      if (wide >= 0) return `row ${wide} has ${(v.rows as unknown[][])[wide].length} cells, the table ${(v.columns as unknown[]).length} columns`;
      if (v.spec !== undefined) {
        const TYPES = ["text", "number", "currency", "percent", "date", "bool"];
        if (!Array.isArray(v.spec) || v.spec.length > v.columns.length) return "spec should be one entry for each column";
        for (const [i, c] of (v.spec as unknown[]).entries()) {
          if (!isRecord(c) || typeof c.key !== "string" || !/^[A-Za-z_$][\w$]{0,63}$/.test(c.key)) return `spec ${i} should have a key: letters and digits, starting with a letter`;
          if (c.type !== undefined && !TYPES.includes(c.type as string)) return `spec ${i}: type should be one of ${TYPES.join(", ")}`;
          if (c.align !== undefined && !["start", "center", "end"].includes(c.align as string)) return `spec ${i}: align should be start, center or end`;
          if (c.width !== undefined && (typeof c.width !== "number" || !(c.width >= 24 && c.width <= 960))) return `spec ${i}: width should be a number from 24 to 960`;
          if (c.format !== undefined && typeof c.format !== "string") return `spec ${i}: format should be text`;
        }
      }
      return null;
    }
  }
}

/** Checks a patch of props against the part's definition: every key one of its props, every value of that prop's
 *  kind. Under a style's rules, a prop the style decides (corners, a button's shape) is refused with the reason. */
export function checkProps(def: PartDef, props: Record<string, unknown>, s: CoreState) {
  for (const [key, v] of Object.entries(props)) {
    if (v === undefined) continue;
    const d = def.props.find((x) => x.key === key);
    if (!d) throw new OpError("invalid_value", `${def.slug} has no prop "${key}". Its props are: ${def.props.map((x) => x.key).join(", ")}.`, key);
    const e = propValueError(d, v);
    /* the error says what the prop takes where that helps (an enum's choices, a range), once */
    if (e) throw new OpError("invalid_value", `${def.slug}.${key} ${e}.`, key);
    if (d.kind === "icon" && isDocIconName(v) && !s.doc.icons?.[docIconId(v)]) {
      const own = Object.keys(s.doc.icons ?? {}).map(docIconName);
      throw new OpError("invalid_value", `The document has no icon ${v}. ${own.length ? `Its own icons are: ${own.join(", ")}.` : "It has none of its own yet:"} set_icon (or generate_svg with icon) adds one.`, key);
    }
    if (isStrict(s.doc.theme, styleContext(s.doc.styles)) && styleOwnsProp(def.slug, key)) throw new OpError("refused", `The document is held to its style, which decides ${def.slug}.${key}.`, key);
  }
}

const FLOW_SIZING = ["fixed", "hug", "fill"];
/** a field of a body: names joined by dots */
export const FIELD_PATH = /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*){0,7}$/;
const FLOW_ALIGN = ["start", "center", "end", "stretch", "baseline"];
const isWH = (v: unknown, of: (x: unknown) => boolean) => isRecord(v) && Object.entries(v).every(([k, x]) => (k === "w" || k === "h") && (x === undefined || of(x)));

/** the fields of a part an operation may set, with how each is checked */
const ITEM_FIELDS: Record<string, (v: unknown, s: CoreState, it: Item) => string | null> = {
  fill: (v) => (v === undefined || COLOR_TOKENS.some((t) => t.key === v) ? null : `should be a color role: ${COLOR_TOKENS.map((t) => t.key).join(", ")} (other colors go in the look: {"fills": [...]})`),
  textColor: (v) => (v === undefined || isTextToken(v) ? null : `should be a text color role: ${TEXT_TOKENS.map((t) => t.key).join(", ")} (other colors go in the look: {"text": {"color": "#hex"}})`),
  corners: (v, s) => {
    if (v === undefined) return null;
    if (isStrict(s.doc.theme, styleContext(s.doc.styles))) return "are decided by the style the document is held to";
    return isRecord(v) && ["tl", "tr", "bl", "br"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0) ? null : "should be {tl, tr, bl, br} in dp";
  },
  look: (v) => (v === undefined || isRecord(v) ? null : "should be an object (see the look fields)"),
  note: (v) => (v === undefined || typeof v === "string" ? null : "should be text"),
  noteHistory: (v) => (v === undefined || (Array.isArray(v) && v.every((x) => typeof x === "string")) ? null : "should be a list of text"),
  label: (v) => (typeof v === "string" ? null : "should be text"),
  /* the product draws the part with a slot of its own (lib/export/appCapabilities.ts): its name, or true to have one made */
  slot: (v) => (v === undefined || v === true || (typeof v === "string" && /^[A-Z][A-Za-z0-9]{0,39}$/.test(v)) ? null : "should be true, or the slot's component name: a capital letter, then letters and digits (\"BuyButton\")"),
  collapseOnScroll: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  navTabs: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  flowFill: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  flowSize: (v) => (v === undefined || isWH(v, (x) => FLOW_SIZING.includes(x as string)) ? null : `should be {w?, h?} each one of ${FLOW_SIZING.join(", ")}`),
  alignSelf: (v) => (v === undefined || FLOW_ALIGN.includes(v as string) ? null : `should be one of ${FLOW_ALIGN.join(", ")}`),
  flowAbsolute: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  flowMin: (v) => (v === undefined || isWH(v, (x) => typeof x === "number" && Number.isFinite(x) && x >= 0) ? null : "should be {w?, h?} in dp"),
  flowMax: (v) => (v === undefined || isWH(v, (x) => typeof x === "number" && Number.isFinite(x) && x >= 0) ? null : "should be {w?, h?} in dp"),
  flowSpan: (v) => (v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12) ? null : "should be a whole number of columns from 1 to 12"),
  constraints: (v) => (v === undefined || (isRecord(v) && Object.keys(v).every((k) => k === "h" || k === "v") && (v.h === undefined || H_CONSTRAINTS.includes(v.h as never)) && (v.v === undefined || V_CONSTRAINTS.includes(v.v as never))) ? null : `should be {h?: ${H_CONSTRAINTS.join("|")}, v?: ${V_CONSTRAINTS.join("|")}}`),
  action: (v, s) => (v === undefined ? null : actionError(v, s)),
  actions: (v, s, it) => {
    if (v === undefined) return null;
    if (!isRecord(v)) return "should be {slot: action}";
    /* a slot, a family of slots ("tab:*") or a named event ("on:submit"), as the part declares them */
    const slots = outletKeysOf(it);
    for (const [slot, a] of Object.entries(v)) {
      if (!slots.includes(slot)) {
        const what = slot.startsWith(EVENT_PREFIX) ? "is not an event this part sends" : slot.endsWith(":*") ? "is not a family of places on this part" : "is not a place on this part";
        return `${JSON.stringify(slot)} ${what}${slots.length ? ` (it has ${slots.join(", ")})` : "; set action instead"}`;
      }
      const e = actionError(a, s);
      if (e) return `${slot}: ${e}`;
    }
    return null;
  },
  bind: (v, s, it) => {
    if (v === undefined) return null;
    if (!isRecord(v)) return 'should be {prop: "=expression"}';
    const def = partBySlug(it.component);
    for (const [prop, id] of Object.entries(v)) {
      if (!def?.props.some((d) => d.key === prop)) return `${it.component} has no prop "${prop}" to bind`;
      /* held to what reading a file holds a binding to (lib/rules.ts) */
      const shape = bindRule(id);
      if (shape) return `${prop}: ${shape}`;
      /* "=…" is an expression over the bindings */
      const e = exprSyntaxError((id as string).slice(1));
      if (e) return `${prop}: ${e}`;
    }
    return null;
  },
  field: (v) => (v === undefined || (typeof v === "string" && FIELD_PATH.test(v)) ? null : 'should be the name of a field of the form\'s body ("email", "address.city")'),
};

/** A patch of a part's own fields with what it says in the older forms written as version 4 writes them
 *  (lib/converge.ts): a tap's transition as its motion and a comparison as an expression, a binding to a variable's id
 *  as the expression that reads it (a field of the design, `@fill`..., by key). What a model gives as it was taught
 *  before comes out as the document keeps it, then is checked. */
export function writtenForms(patch: Record<string, unknown>, vars: DocVar[] | undefined): Record<string, unknown> {
  let out = patch;
  if (isRecord(patch.action)) out = { ...out, action: fullAction(convergedAction(patch.action as Action, vars)) };
  if (isRecord(patch.actions)) out = { ...out, actions: Object.fromEntries(Object.entries(patch.actions).map(([k, a]) => [k, isRecord(a) ? fullAction(convergedAction(a as Action, vars)) : a])) };
  if (isRecord(patch.bind)) {
    const list = vars ?? [];
    out = { ...out, bind: Object.fromEntries(Object.entries(patch.bind).map(([k, v]) => [k, typeof v === "string" && !v.startsWith("=") && list.some((x) => x.id === v) ? (k.startsWith("@") ? fieldBindOf(v) : bindOfVar(list, v)) : v])) };
  }
  return out;
}

/** Checks a patch of a part's own fields. `props` is checked against the definition; `id`, `kind` and `component`
 *  cannot change. */
export function checkItemPatch(it: Item, patch: Record<string, unknown>, s: CoreState) {
  for (const [key, v] of Object.entries(patch)) {
    if (key === "props") {
      const def = partBySlug(it.component);
      if (!def) throw new OpError("invalid_value", `${it.component} is not a known part.`, it.id);
      if (!isRecord(v)) throw new OpError("invalid_value", "props should be an object.", "props");
      checkProps(def, v, s);
      continue;
    }
    const check = ITEM_FIELDS[key];
    if (!check) throw new OpError("invalid_value", `A part has no field "${key}" to set. It takes: props, ${Object.keys(ITEM_FIELDS).join(", ")}.`, key);
    const e = check(v, s, it);
    if (e) throw new OpError("invalid_value", `${key} ${e}.`, key);
  }
}

/** a look as the document keeps it, or a refusal that says what was wrong */
export function cleanedLook(v: unknown) {
  const look = cleanLook(v);
  if (v !== undefined && !look && isRecord(v) && Object.keys(v).length) throw new OpError("invalid_value", "Nothing in that look is a field a look has, of the right kind.", "look");
  return look;
}

const isValue = (v: unknown): v is VarValue => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

/** A condition as the one rule for conditions has it (lib/rules.ts, what reading a file holds it to too), then what it
 *  points at: the part it asks about, the variable it reads (a field of the row, `row.<field>`, is one, as the guide
 *  says), and an expression that parses. */
export function conditionError(c: unknown, s: CoreState): string | null {
  const shape = conditionRule(c);
  if (shape) return shape;
  const r = c as Record<string, unknown>;
  if (typeof r.filled === "string") return s.doc.groups.some((g) => g.items.some((it) => it.id === r.filled)) ? null : `there is no part ${JSON.stringify(r.filled)}`;
  return exprSyntaxError(r.expr);
}


function effectError(e: unknown, s: CoreState, depth = 0): string | null {
  if (!isRecord(e)) return "an effect should be an object";
  const part = (id: unknown) => (typeof id === "string" && s.doc.groups.some((g) => g.items.some((it) => it.id === id)) ? null : `there is no part ${JSON.stringify(id)}`);
  const v = (id: unknown) => (typeof id === "string" && (s.doc.vars ?? []).some((x) => x.id === id) ? null : `there is no variable ${JSON.stringify(id)}`);
  switch (e.do) {
    case "show":
    case "hide":
    case "toggle":
    case "open":
    case "close":
      return part(e.part);
    case "setVar":
      return v(e.var) ?? (e.expr !== undefined ? exprSyntaxError(e.expr) : null) ?? (isValue(e.value) || e.expr !== undefined ? null : "value should be text, a number or true/false (or give expr)");
    case "toggleVar":
      return v(e.var);
    case "addVar":
      return v(e.var) ?? (typeof e.by === "number" && Number.isFinite(e.by) ? null : "by should be a number");
    case "setProp": {
      const bad = part(e.part) ?? (typeof e.prop === "string" && isValue(e.value) ? null : "prop and value are required");
      if (bad) return bad;
      /* the prop is one the part has, and the value one it takes: a preview would show nothing else */
      const def = partBySlug(s.doc.groups.flatMap((g) => g.items).find((it) => it.id === e.part)?.component);
      if (!def) return null;
      const d = def.props.find((x) => x.key === e.prop);
      if (!d) return `${def.slug} has no prop ${JSON.stringify(e.prop)} (it has ${def.props.map((x) => x.key).slice(0, 16).join(", ")})`;
      if (d.kind === "list" || d.kind === "table") return `${d.key} is a ${d.kind}: an effect sets words, a number, true/false or a choice`;
      const wrong = propValueError(d, e.value);
      return wrong ? `${d.key} ${wrong}` : null;
    }
    case "snackbar":
      return typeof e.message === "string" ? null : "message should be text";
    case "call": {
      const endpoints = s.doc.api?.endpoints ?? [];
      if (typeof e.operationId !== "string" || !endpoints.some((x) => x.operationId === e.operationId)) return `there is no endpoint ${JSON.stringify(e.operationId)}${endpoints.length ? ` (get_api lists them: ${endpoints.slice(0, 12).map((x) => x.operationId).join(", ")})` : "; add_endpoint adds one"}`;
      if (depth > 3) return "a call's then and catch may hold calls only 4 deep";
      for (const k of ["args"] as const) {
        if (e[k] === undefined) continue;
        if (!isRecord(e[k])) return `${k} should be {name: expression}`;
        for (const [name, x] of Object.entries(e[k] as Record<string, unknown>)) {
          const err = exprSyntaxError(x);
          if (err) return `${k}.${name}: ${err}`;
        }
      }
      if (e.body !== undefined) {
        /* the expressions have no object literals: models reach for one to send a few fields, which args does */
        if (typeof e.body === "string" && e.body.trim().startsWith("{")) return `body is one expression that reads a whole body (form.values, vars.draft), not an object: give the fields in args instead, each an expression ({productId: "'latte'", quantity: "2"})`;
        const err = exprSyntaxError(e.body);
        if (err) return `body: ${err}`;
      }
      if (e.optimistic !== undefined && (!isRecord(e.optimistic) || typeof e.optimistic.source !== "string")) return "optimistic should be {source, remove: true} or {source, patch: {field: expression}}";
      for (const k of ["then", "catch"] as const) {
        if (e[k] === undefined) continue;
        const err = answerError(e[k], s, depth + 1, k === "then" ? "answers 2XX" : "fails");
        if (err) return `${k}: ${err}`;
      }
      return null;
    }
    case "invoke": {
      const def = typeof e.capability === "string" ? capabilityOf(s.doc.capabilities, e.capability) : undefined;
      if (!def) return `there is no capability ${JSON.stringify(e.capability)} (list_capabilities lists them: ${allCapabilities(s.doc.capabilities).filter((c) => c.kind === "call").map((c) => c.name).join(", ")}; declare_capability declares one of the product's own)`;
      if (def.kind !== "call") return `${def.name} is a ${def.kind === "view" ? "view: put the part that stands for it on the screen and wire its events" : "platform event: it is not invoked"}, not a call`;
      if (depth > 3) return "a call's or an invoke's then and catch may hold calls and invokes only 4 deep";
      if (e.args !== undefined) {
        if (!isRecord(e.args)) return "args should be {name: expression}";
        const takes = argNames(def);
        for (const [name, x] of Object.entries(e.args)) {
          if (takes && !takes.includes(name)) return `${def.name} takes no argument ${JSON.stringify(name)} (it takes ${takes.join(", ") || "none"})`;
          const err = exprSyntaxError(x);
          if (err) return `args.${name}: ${err}`;
        }
      }
      const missing = requiredArgs(def).filter((k) => !isRecord(e.args) || (e.args as Record<string, unknown>)[k] === undefined);
      if (missing.length) return `${def.name} needs ${missing.map((k) => `args.${k}`).join(" and ")}`;
      for (const k of ["then", "catch"] as const) {
        if (e[k] === undefined) continue;
        const err = answerError(e[k], s, depth + 1, k === "then" ? "does what was asked" : "fails");
        if (err) return `${k}: ${err}`;
      }
      return null;
    }
    case "refresh":
    case "loadMore": {
      const names = s.doc.frames.flatMap((f) => (f.data ?? []).map((d) => d.name));
      return typeof e.source === "string" && names.includes(e.source) ? null : `no screen loads data called ${JSON.stringify(e.source)}${names.length ? ` (the screens load ${[...new Set(names)].join(", ")})` : "; add_data_source adds one"}`;
    }
    case "submit":
      if (e.form === undefined) return null;
      return typeof e.form === "string" && s.doc.groups.some((g) => g.form && (g.id === e.form || g.items.some((it) => it.id === e.form))) ? null : `there is no form ${JSON.stringify(e.form)} (make_form makes one)`;
    case "signOut":
      return null;
    default:
      return `"${String(e.do)}" is not an effect (show, hide, toggle, open, close, setVar, toggleVar, addVar, setProp, snackbar, call, invoke, refresh, loadMore, submit, signOut)`;
  }
}

/** A call's or an invoke's then or catch: a body, which may branch on the answer (`when` reading `response`, `status`,
 *  `result` or `error`, and `else`); it starts on the answer, so it takes no trigger (docs/交互规则.md, 回答上的条件). */
function answerError(a: unknown, s: CoreState, depth: number, runs: string): string | null {
  if (isRecord(a) && a.trigger !== undefined) return `takes no trigger: it runs whenever it ${runs}`;
  if (isRecord(a) && a.when !== undefined) {
    const err = conditionError(a.when, s);
    if (err) return `when: ${err}`;
  }
  if (isRecord(a) && a.else !== undefined) {
    const err = bodyError(a.else, s, depth);
    if (err) return `else: ${err}`;
  }
  return bodyError(a, s, depth);
}

function bodyError(a: unknown, s: CoreState, depth = 0): string | null {
  if (!isRecord(a)) return "should be an object";
  const to = a.to;
  if (typeof to !== "string") return 'to should be a screen id, "back", "link" or "none"';
  if (to !== BACK_TARGET && to !== LINK_TARGET && to !== STAY_TARGET && !s.doc.frames.some((f) => f.id === to)) return `there is no screen ${JSON.stringify(to)}`;
  if (to === LINK_TARGET && (typeof a.url !== "string" || !/^https?:\/\//i.test(a.url))) return "a link needs an http(s) url";
  if (a.overlay !== undefined && (typeof a.overlay !== "boolean" || (a.overlay && !s.doc.frames.some((f) => f.id === to)))) return "overlay is true or false, and only a screen opens as an overlay";
  if (a.scrollTo !== undefined && (typeof a.scrollTo !== "string" || !s.doc.groups.some((g) => g.items.some((it) => it.id === a.scrollTo)))) return `there is no part ${JSON.stringify(a.scrollTo)} to scroll to`;
  if (a.motion !== undefined && !cleanMotion(a.motion)) return `motion should be {kind: ${MOTION_KINDS.join("|")}, dir: ${MOTION_DIRS.join("|")}, easing: ${MOTION_EASINGS.join("|")}, ms}`;
  if (a.effects !== undefined) {
    if (!Array.isArray(a.effects)) return "effects should be a list";
    for (const [i, e] of a.effects.entries()) {
      const err = effectError(e, s, depth);
      if (err) return `effect ${i}: ${err}`;
    }
  }
  if (a.params !== undefined) {
    if (!isRecord(a.params)) return "params should be {name: expression}";
    const target = s.doc.frames.find((f) => f.id === to);
    const takes = (target?.params ?? []).map((p) => p.name);
    for (const [name, x] of Object.entries(a.params)) {
      if (target && !takes.includes(name)) return `the screen ${JSON.stringify(target.name || target.id)} takes no param ${JSON.stringify(name)}${takes.length ? ` (it takes ${takes.join(", ")})` : "; set_screen_params declares what it takes"}`;
      const err = exprSyntaxError(x);
      if (err) return `params.${name}: ${err}`;
    }
  }
  return null;
}

/** A tap that opens a screen with params the screen does not declare yet declares them there: the screen a list's row
 *  opens learns what it is given, whichever of the two is made first. Its call branches and its else count too. */
export function withTapParams(s: CoreState, a: unknown): CoreState {
  const wanted = new Map<string, Set<string>>();
  const visit = (b: unknown, depth: number) => {
    if (!isRecord(b) || depth > 6) return;
    if (typeof b.to === "string" && isRecord(b.params)) for (const name of Object.keys(b.params)) if (/^[A-Za-z_]\w{0,63}$/.test(name)) (wanted.get(b.to) ?? wanted.set(b.to, new Set()).get(b.to)!).add(name);
    for (const e of Array.isArray(b.effects) ? b.effects : [])
      if (isRecord(e) && (e.do === "call" || e.do === "invoke")) {
        visit(e.then, depth + 1);
        visit(e.catch, depth + 1);
      }
    visit(b.else, depth + 1);
  };
  visit(a, 0);
  if (!wanted.size) return s;
  let changed = false;
  const frames = s.doc.frames.map((f) => {
    const names = wanted.get(f.id);
    const missing = names ? [...names].filter((n) => !(f.params ?? []).some((p) => p.name === n)) : [];
    if (!missing.length) return f;
    changed = true;
    return { ...f, params: [...(f.params ?? []), ...missing.map((name) => ({ name, type: "string" as const }))] };
  });
  return changed ? { ...s, doc: { ...s.doc, frames } } : s;
}

export function actionError(a: unknown, s: CoreState): string | null {
  const e = bodyError(a, s);
  if (e) return e;
  const r = a as Record<string, unknown>;
  if (r.trigger !== undefined && !cleanTrigger(r.trigger)) return 'trigger should be {on: "hover"} or {on: "delay", ms}';
  if (r.when !== undefined) {
    const c = conditionError(r.when, s);
    if (c) return `when: ${c}`;
  }
  if (r.else !== undefined) {
    const b = bodyError(r.else, s);
    if (b) return `else: ${b}`;
  }
  return null;
}

/** An action as it is written: the default slide is no motion (lib/screenMotion.ts `DEFAULT_MOTION`), at any depth. What
 *  a model may still give in the older forms (a `transition`, a `{var, op, value}`) the operation writes as version 4
 *  does (lib/converge.ts `convergedAction`). */
export const fullAction = (a: Action): Action => {
  const plain = <B extends ActionBody>(b: B): B => {
    if (!b.motion || presetOf(b.motion) !== "slide") return b;
    const { motion: _default, ...rest } = b;
    return rest as B;
  };
  return plain(mapNestedBodies(a, plain));
};

const VALUE_WORDS = { text: "text", number: "a number", bool: "true or false", color: "a color (a role such as primary, or a hex such as #6750a4)" } as const;

export function varError(v: unknown): string | null {
  if (!isRecord(v)) return "a variable should be {id, name, type, value}";
  if (typeof v.name !== "string" || !v.name.trim()) return "a variable needs a name";
  if (v.type !== "text" && v.type !== "number" && v.type !== "bool" && v.type !== "color") return 'type should be "text", "number", "bool" or "color"';
  if (!fitsType(v.value, v.type)) return `value should be ${VALUE_WORDS[v.type]} for a ${v.type} variable`;
  if (v.modes !== undefined) {
    if (!isRecord(v.modes)) return "modes should be {mode id: value}";
    for (const [mode, x] of Object.entries(v.modes)) if (!fitsType(x, v.type)) return `the value in mode ${JSON.stringify(mode)} should be ${VALUE_WORDS[v.type]}`;
  }
  return null;
}

export type { Condition, DocVar, Effect };
import { fitsType } from "../../variables";
