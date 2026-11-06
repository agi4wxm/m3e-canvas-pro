/* What an operation checks before it writes what a model or a client asked for: a prop the part has, of its kind and
 * in its range; a color by its role; a look as `cleanLook` leaves it; a tap that goes somewhere that exists. The
 * editor's own panels write only what they show, so for them (`ctx.strict` false) nothing here refuses anything. */

import { partBySlug } from "../../../parts/registry";
import { choiceValueOf } from "../../../parts/labels";
import type { PartDef, PropDef } from "../../../parts/types";
export type { PartDef };
import { cleanLook } from "../../look";
import { styleOwnsProp } from "../../styleRules";
import { isStrict } from "../../styles";
import { actionSlotsOf, BACK_TARGET, COLOR_TOKENS, TEXT_TOKENS, isTextToken, LINK_TARGET, STAY_TARGET, type Action, type ActionBody, type Condition, type DocVar, type Effect, type Item, type VarValue } from "../../tokens";
import { OpError } from "../op";
import { docIconId, docIconName, isDocIconName } from "../../docIcons";
import type { CoreState } from "../state";

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
      return 'an image address (https:, data:image/…) or ""';
    case "list":
      return `a list of rows like {"label": "…"${d.icons ? ', "icon": "…"' : ""}${d.images ? ', "image": "…"' : ""}}${d.min !== undefined ? `, at least ${d.min}` : ""}${d.max !== undefined ? `, at most ${d.max}` : ""}`;
    case "table":
      return 'a table {"columns": ["…"], "rows": [["…"]]}';
  }
}

/** why a value does not suit a prop, or null when it does */
export function propValueError(d: PropDef, v: unknown): string | null {
  switch (d.kind) {
    case "text":
      return typeof v === "string" ? null : "should be text";
    case "icon":
      return typeof v === "string" && (/^[a-z0-9_]*$/.test(v) || isDocIconName(v)) ? null : "should be a Material Symbols icon name in snake_case, or svg:<id>";
    case "enum":
      return typeof v === "string" && d.options.some((o) => choiceValueOf(o) === v) ? null : `should be ${propKindText(d)}`;
    case "bool":
      return typeof v === "boolean" ? null : "should be true or false";
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return "should be a number";
      return v < d.min || v > d.max ? `should be from ${d.min} to ${d.max}` : null;
    case "image":
      return typeof v === "string" && (v === "" || /^(https?:|data:image\/|m3e-asset:)/i.test(v)) ? null : "should be an https: or data:image address";
    case "list": {
      if (!Array.isArray(v)) return "should be a list of rows";
      const bad = v.findIndex((r) => !isRecord(r) || typeof r.label !== "string" || Object.entries(r).some(([k, x]) => k !== "label" && typeof x !== "string"));
      if (bad >= 0) return `row ${bad} should be {"label": "…"} with text fields only`;
      if (d.min !== undefined && v.length < d.min) return `should have at least ${d.min} rows`;
      if (d.max !== undefined && v.length > d.max) return `should have at most ${d.max} rows`;
      return null;
    }
    case "table": {
      if (!isRecord(v) || !Array.isArray(v.columns) || !Array.isArray(v.rows)) return 'should be {"columns": [...], "rows": [[...]]}';
      if (!v.columns.every((c) => typeof c === "string")) return "columns should be text";
      if (!v.rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string"))) return "rows should be lists of text";
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
    if (e) throw new OpError("invalid_value", `${def.slug}.${key} ${e}; it takes ${propKindText(d)}.`, key);
    if (d.kind === "icon" && isDocIconName(v) && !s.doc.icons?.[docIconId(v)]) {
      const own = Object.keys(s.doc.icons ?? {}).map(docIconName);
      throw new OpError("invalid_value", `The document has no icon ${v}. ${own.length ? `Its own icons are: ${own.join(", ")}.` : "It has none of its own yet:"} set_icon (or generate_svg with icon) adds one.`, key);
    }
    if (isStrict(s.doc.theme) && styleOwnsProp(def.slug, key)) throw new OpError("refused", `The document is held to its style, which decides ${def.slug}.${key}.`, key);
  }
}

const FLOW_SIZING = ["fixed", "hug", "fill"];
const FLOW_ALIGN = ["start", "center", "end", "stretch", "baseline"];
const isWH = (v: unknown, of: (x: unknown) => boolean) => isRecord(v) && Object.entries(v).every(([k, x]) => (k === "w" || k === "h") && (x === undefined || of(x)));

/** the fields of a part an operation may set, with how each is checked */
const ITEM_FIELDS: Record<string, (v: unknown, s: CoreState, it: Item) => string | null> = {
  fill: (v) => (v === undefined || COLOR_TOKENS.some((t) => t.key === v) ? null : `should be a color role: ${COLOR_TOKENS.map((t) => t.key).join(", ")} (other colors go in the look: {"fills": [...]})`),
  textColor: (v) => (v === undefined || isTextToken(v) ? null : `should be a text color role: ${TEXT_TOKENS.map((t) => t.key).join(", ")} (other colors go in the look: {"text": {"color": "#hex"}})`),
  corners: (v, s) => {
    if (v === undefined) return null;
    if (isStrict(s.doc.theme)) return "are decided by the style the document is held to";
    return isRecord(v) && ["tl", "tr", "bl", "br"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0) ? null : "should be {tl, tr, bl, br} in dp";
  },
  look: (v) => (v === undefined || isRecord(v) ? null : "should be an object (see the look fields)"),
  note: (v) => (v === undefined || typeof v === "string" ? null : "should be text"),
  noteHistory: (v) => (v === undefined || (Array.isArray(v) && v.every((x) => typeof x === "string")) ? null : "should be a list of text"),
  label: (v) => (typeof v === "string" ? null : "should be text"),
  collapseOnScroll: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  navTabs: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  flowFill: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  flowSize: (v) => (v === undefined || isWH(v, (x) => FLOW_SIZING.includes(x as string)) ? null : `should be {w?, h?} each one of ${FLOW_SIZING.join(", ")}`),
  alignSelf: (v) => (v === undefined || FLOW_ALIGN.includes(v as string) ? null : `should be one of ${FLOW_ALIGN.join(", ")}`),
  flowAbsolute: (v) => (v === undefined || typeof v === "boolean" ? null : "should be true or false"),
  flowMin: (v) => (v === undefined || isWH(v, (x) => typeof x === "number" && Number.isFinite(x) && x >= 0) ? null : "should be {w?, h?} in dp"),
  flowMax: (v) => (v === undefined || isWH(v, (x) => typeof x === "number" && Number.isFinite(x) && x >= 0) ? null : "should be {w?, h?} in dp"),
  flowSpan: (v) => (v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12) ? null : "should be a whole number of columns from 1 to 12"),
  action: (v, s) => (v === undefined ? null : actionError(v, s)),
  actions: (v, s, it) => {
    if (v === undefined) return null;
    if (!isRecord(v)) return "should be {slot: action}";
    const slots = actionSlotsOf(it).map((x) => x.key);
    for (const [slot, a] of Object.entries(v)) {
      if (!slots.includes(slot)) return `${JSON.stringify(slot)} is not a place on this part${slots.length ? ` (it has ${slots.join(", ")})` : "; set action instead"}`;
      const e = actionError(a, s);
      if (e) return `${slot}: ${e}`;
    }
    return null;
  },
  bind: (v, s, it) => {
    if (v === undefined) return null;
    if (!isRecord(v)) return "should be {prop: variable id}";
    const def = partBySlug(it.component);
    for (const [prop, id] of Object.entries(v)) {
      if (!def?.props.some((d) => d.key === prop)) return `${it.component} has no prop "${prop}" to bind`;
      if (typeof id !== "string" || !(s.doc.vars ?? []).some((x) => x.id === id)) return `there is no variable ${JSON.stringify(id)} for ${prop}`;
    }
    return null;
  },
};

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

export function conditionError(c: unknown, s: CoreState): string | null {
  if (!isRecord(c)) return "should be {var, op, value} or {filled}";
  if (typeof c.filled === "string") return s.doc.groups.some((g) => g.items.some((it) => it.id === c.filled)) ? null : `there is no part ${JSON.stringify(c.filled)}`;
  if (typeof c.var !== "string" || !(s.doc.vars ?? []).some((v) => v.id === c.var)) return `there is no variable ${JSON.stringify(c.var)}`;
  if (c.op !== "eq" && c.op !== "neq") return 'op should be "eq" or "neq"';
  return isValue(c.value) ? null : "value should be text, a number or true/false";
}

const TRANSITIONS = ["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"];

function effectError(e: unknown, s: CoreState): string | null {
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
      return v(e.var) ?? (isValue(e.value) ? null : "value should be text, a number or true/false");
    case "toggleVar":
      return v(e.var);
    case "addVar":
      return v(e.var) ?? (typeof e.by === "number" && Number.isFinite(e.by) ? null : "by should be a number");
    case "setProp":
      return part(e.part) ?? (typeof e.prop === "string" && isValue(e.value) ? null : "prop and value are required");
    case "snackbar":
      return typeof e.message === "string" ? null : "message should be text";
    default:
      return `"${String(e.do)}" is not an effect (show, hide, toggle, open, close, setVar, toggleVar, addVar, setProp, snackbar)`;
  }
}

function bodyError(a: unknown, s: CoreState): string | null {
  if (!isRecord(a)) return "should be an object";
  const to = a.to;
  if (typeof to !== "string") return 'to should be a screen id, "back", "link" or "none"';
  if (to !== BACK_TARGET && to !== LINK_TARGET && to !== STAY_TARGET && !s.doc.frames.some((f) => f.id === to)) return `there is no screen ${JSON.stringify(to)}`;
  if (a.transition !== undefined && !TRANSITIONS.includes(a.transition as string)) return `transition should be one of ${TRANSITIONS.join(", ")}`;
  if (to === LINK_TARGET && (typeof a.url !== "string" || !/^https?:\/\//i.test(a.url))) return "a link needs an http(s) url";
  if (a.effects !== undefined) {
    if (!Array.isArray(a.effects)) return "effects should be a list";
    for (const [i, e] of a.effects.entries()) {
      const err = effectError(e, s);
      if (err) return `effect ${i}: ${err}`;
    }
  }
  return null;
}

export function actionError(a: unknown, s: CoreState): string | null {
  const e = bodyError(a, s);
  if (e) return e;
  const r = a as Record<string, unknown>;
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

/** an action with its transition filled in */
export const fullAction = (a: Action): Action => ({ ...a, transition: a.transition ?? "slide", ...(a.else ? { else: { ...a.else, transition: (a.else as ActionBody).transition ?? "slide" } } : {}) });

export function varError(v: unknown): string | null {
  if (!isRecord(v)) return "a variable should be {id, name, type, value}";
  if (typeof v.name !== "string" || !v.name.trim()) return "a variable needs a name";
  if (v.type !== "text" && v.type !== "number" && v.type !== "bool") return 'type should be "text", "number" or "bool"';
  const want = v.type === "text" ? "string" : v.type === "number" ? "number" : "boolean";
  if (typeof v.value !== want) return `value should be ${v.type === "text" ? "text" : v.type === "number" ? "a number" : "true or false"} for a ${v.type} variable`;
  return null;
}

export type { Condition, DocVar, Effect };
