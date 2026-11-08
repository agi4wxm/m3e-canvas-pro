/* What an operation is: a typed change of the document, `(state, args, ctx) → state`, with its arguments described
 * as JSON Schema (for the tools the in-app agent and MCP are given) and checked before it runs. An operation that
 * cannot do what it was asked throws an `OpError`: a code a program can act on, and words a person can read. */

import { isStrict, styleContext, withDocStyles } from "../styles";
import { conformDoc, conformGroups } from "../styleRules";
import { defaultMeasures } from "../../parts/templates/kit";
import type { Group } from "../tokens";
import type { Lang } from "../i18n";
import type { CoreState, Origin, Widths } from "./state";

export type OpErrorCode =
  | "bad_args"
  | "not_found"
  | "locked"
  | "refused"
  | "invalid_value"
  | "nothing_to_do"
  | "busy";

export class OpError extends Error {
  readonly code: OpErrorCode;
  /** what it was about: an id, a field */
  readonly about?: string;
  constructor(code: OpErrorCode, message: string, about?: string) {
    super(message);
    this.name = "OpError";
    this.code = code;
    this.about = about;
  }
}

/** Where the sizes of parts come from. The editor measures them on the canvas; headless, the parts' own guesses
 *  stand in (`guessMeasurer`). */
export interface Measurer {
  measure(state: CoreState): Widths;
}

/** the canvas's measures, as the editor took them: a part not measured yet goes by its definition's own size */
export const sessionMeasurer: Measurer = { measure: (s) => s.session.widths };

/** what a document without a canvas goes by: each part's guess (its width prop, its kit's measure), under whatever
 *  has been measured */
export const guessMeasurer: Measurer = {
  measure: (s) => ({ ...defaultMeasures(s.doc.groups), ...s.session.widths }),
};

export type OpCtx = {
  /** the sizes of the parts, from the store's measurer */
  widths: Widths;
  /** the language words are written in (a kit's labels, a new screen's name) */
  lang: Lang;
  /** a new id; the same sequence each time when the store was given one */
  newId: () => string;
  /** who asked */
  origin: Origin;
  /** Arguments and values are checked strictly: a prop the part does not have, or a value outside its range, is
   *  refused. The editor's own panels are trusted to write what they show (false). */
  strict: boolean;
};

/** a JSON Schema, as far as the tools need one */
export type Schema = { [key: string]: unknown };

export type OpResult<R = unknown> = {
  state: CoreState;
  result?: R;
  /** how the change wants to be kept in the history when the caller does not say: `whole` crosses the whole
   *  document (a style), `none` belongs to the step before it (a theme patch that changes no composition) */
  history?: "whole" | "none";
};

export type Op<A = Record<string, unknown>, R = unknown> = {
  name: string;
  /** one line for the tool's description */
  summary: string;
  /** the arguments, as JSON Schema */
  args: Schema;
  /** what an undo step taken for it is called */
  label?: (args: A) => string;
  run: (state: CoreState, args: A, ctx: OpCtx) => OpResult<R>;
};

/** defines an operation; the identity function, for its types */
export const op = <A, R = unknown>(def: Op<A, R>): Op<A, R> => def;

/* ---------- schema helpers ---------- */

export const S = {
  str: (description?: string, more: Schema = {}): Schema => ({ type: "string", ...(description ? { description } : {}), ...more }),
  num: (description?: string, more: Schema = {}): Schema => ({ type: "number", ...(description ? { description } : {}), ...more }),
  int: (description?: string, more: Schema = {}): Schema => ({ type: "integer", ...(description ? { description } : {}), ...more }),
  bool: (description?: string): Schema => ({ type: "boolean", ...(description ? { description } : {}) }),
  enum: (values: readonly string[], description?: string): Schema => ({ type: "string", enum: [...values], ...(description ? { description } : {}) }),
  arr: (items: Schema, description?: string, more: Schema = {}): Schema => ({ type: "array", items, ...(description ? { description } : {}), ...more }),
  obj: (properties: Record<string, Schema>, required: string[] = [], description?: string): Schema => ({ type: "object", properties, required, additionalProperties: false, ...(description ? { description } : {}) }),
  /** an object whose fields are not listed (props, a look, a patch): checked by the operation itself */
  any: (description?: string): Schema => ({ type: "object", ...(description ? { description } : {}) }),
  point: (description?: string): Schema => ({ type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false, ...(description ? { description } : {}) }),
};

const typeOf = (v: unknown) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

/** the name a word was probably meant to be: the one fewest letters away, when that is close enough to say */
export function nearestName(names: string[], word: string): string | undefined {
  const w = word.toLowerCase().replace(/[\s-]/g, "_");
  const flat = (s: string) => s.replace(/_/g, "");
  let best: { name: string; d: number } | undefined;
  for (const name of names) {
    const n = name.toLowerCase();
    if (n === w || flat(n) === flat(w)) return name;
    const d = editDistance(n, w);
    if (!best || d < best.d) best = { name, d };
  }
  return best && best.d <= Math.max(2, Math.floor(w.length / 3)) ? best.name : undefined;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** Checks a value against the subset of JSON Schema the operations use; the first thing wrong, or null. */
export function schemaError(schema: Schema, v: unknown, at = "args"): string | null {
  const types = (Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []) as string[];
  const fits = (type: string) => (type === "integer" ? typeof v === "number" && Number.isInteger(v) : type === "number" ? typeof v === "number" && Number.isFinite(v) : typeOf(v) === type);
  const named = (type: string) => (type === "object" ? "an object" : type === "array" ? "an array" : type === "null" ? "null" : type === "integer" ? "a whole number" : `a ${type}`);
  if (types.length && !types.some(fits)) {
    const t = typeOf(v);
    return `${at} should be ${types.map(named).join(" or ")}, not ${t === "number" && !Number.isFinite(v as number) ? "a number that is not finite" : t}`;
  }
  const type = types.find(fits);
  if (Array.isArray(schema.enum) && !schema.enum.includes(v)) {
    /* a long list (every operation's name) is in the schema the caller already has: name the nearest instead */
    if (schema.enum.length <= 16) return `${at} should be one of ${schema.enum.map((x) => JSON.stringify(x)).join(", ")}`;
    const near = typeof v === "string" ? nearestName(schema.enum.filter((x): x is string => typeof x === "string"), v) : undefined;
    return `${at} ${JSON.stringify(v)} is not one of the ${schema.enum.length} values the schema lists${near ? `; the nearest is ${JSON.stringify(near)}` : ""}`;
  }
  if (typeof v === "number") {
    if (typeof schema.minimum === "number" && v < schema.minimum) return `${at} should be at least ${schema.minimum}`;
    if (typeof schema.maximum === "number" && v > schema.maximum) return `${at} should be at most ${schema.maximum}`;
  }
  if (typeof v === "string" && typeof schema.minLength === "number" && v.length < schema.minLength) return `${at} should not be empty`;
  if (Array.isArray(v)) {
    if (typeof schema.minItems === "number" && v.length < schema.minItems) return `${at} should have at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}`;
    if (schema.items) for (let i = 0; i < v.length; i++) {
      const e = schemaError(schema.items as Schema, v[i], `${at}[${i}]`);
      if (e) return e;
    }
  }
  if (type === "object" && v && typeof v === "object" && schema.properties) {
    const props = schema.properties as Record<string, Schema>;
    for (const k of (schema.required as string[] | undefined) ?? []) if ((v as Record<string, unknown>)[k] === undefined) return `${at}.${k} is required`;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined) continue;
      if (!props[k]) {
        if (schema.additionalProperties === false) return `${at}.${k} is not an argument of this operation (it takes ${Object.keys(props).join(", ") || "none"})`;
        continue;
      }
      const e = schemaError(props[k], x, `${at}.${k}`);
      if (e) return e;
    }
  }
  return null;
}

/** Runs an operation on a state: its arguments checked when the caller is not the editor, and the rules of a style
 *  the document is held to applied to what it made (lib/styleRules.ts), whoever asked. */
export function runOp<A, R>(o: Op<A, R>, state: CoreState, args: A, ctx: OpCtx): OpResult<R> {
  if (ctx.strict) {
    const e = schemaError(o.args, args ?? {});
    if (e) throw new OpError("bad_args", `${o.name}: ${e}`);
  }
  /* An operation is synchronous, and what it calls reads a style without being handed one (the layout, the kits): the
     document's own styles are in reach while it runs. What it leaves is held to its rules in the styles it left. */
  const out = withDocStyles(styleContext(state.doc.styles), () => o.run(state, args, ctx));
  return { ...out, state: conformed(out.state, state) };
}

/** a state as its theme's rules allow it, when the operation changed its parts, read in its own styles */
export function conformed(s: CoreState, before: CoreState): CoreState {
  const styles = styleContext(s.doc.styles);
  if (!isStrict(s.doc.theme, styles)) return s;
  const groups = s.doc.groups === before.doc.groups && s.doc.theme === before.doc.theme ? s.doc.groups : conformGroups(s.doc.groups, s.doc.theme, styles);
  const components =
    s.doc.components === before.doc.components && s.doc.theme === before.doc.theme ? s.doc.components : s.doc.components && conformDoc({ groups: [] as Group[], components: s.doc.components }, s.doc.theme, styles).components;
  if (groups === s.doc.groups && components === s.doc.components) return s;
  return { ...s, doc: { ...s.doc, groups, ...(components ? { components } : {}) } };
}
