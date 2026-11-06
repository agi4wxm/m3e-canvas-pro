/* What printing a screen's bindings (lib/bindings, docs/数据绑定.md) is the same for on every front end the product
 * exports: the web app's printer (lib/printBindings.ts), React Native's (lib/export/rn/print.ts) and the mini-program's
 * (lib/export/miniapp/print.ts) each write code in their own form, and decide here what it says.
 *
 * - data: where the contract places a call's arguments (path, query, header, or the body's fields), how an answer holds
 *   its list and pages it, the page size a source asks for, the status a success answers with;
 * - forms: the rule each field is checked by in the app (the preview's own, lib/bindings/rules.ts);
 * - regions: the state a design is for, and how a region's state is chosen;
 * - the scope: how a bound prop is read by the kind of value it takes, a condition, words with `{{expressions}}`, the
 *   list a repeat draws, all through the shared runtime's `Bindings` (packages/app-runtime);
 * - effects: which effects of a tap are the API's (a call, a refresh, a next page, a submit, a sign-out);
 * - names: what the printed apps, and what they report, call a part: its words, never its id.
 *
 * Pure: the contract and the design in, data and strings out. Expressions reach code only as escaped strings (`str`). */

import { paginationOf, type ApiEndpoint, type ApiSpec } from "../api/types";
import type { ApiOperation } from "./api";
import { formFields, listOf, paramsOf, type FieldRule, type FieldSpec } from "../bindings/contract";
import { partBySlug } from "../../parts/registry";
import type { PropDef } from "../../parts/types";
import { str } from "../../parts/print";
import { REGION_STATES, type DataSource, type Doc, type Effect, type Group } from "../tokens";

/* ---------- the data a screen loads, the calls it makes ---------- */

/** where the contract places each parameter of an operation, by its name: path, query, header or cookie */
export const paramPlaces = (api: ApiSpec, e: ApiEndpoint): Map<string, string> => new Map(paramsOf(api, e).map((p) => [p.name, p.in]));

/** A call's arguments (name and expression, in the design's order) as the contract places them: query and header
 *  parameters, and what is no parameter, the fields of its body. Path parameters are each front end's own to fill. */
export function placeArgs<T>(args: Record<string, T>, places: Map<string, string>): { query: [string, T][]; headers: [string, T][]; fields: [string, T][] } {
  const all = Object.entries(args);
  return { query: all.filter(([k]) => places.get(k) === "query"), headers: all.filter(([k]) => places.get(k) === "header"), fields: all.filter(([k]) => !places.has(k)) };
}

/** how an operation's answer holds its list (the field, "" when the answer is the list) and pages it, its names filled in */
export function answerShape(api: ApiSpec, e: ApiEndpoint): { list?: { field: string }; paging?: ReturnType<typeof paginationOf> } {
  const list = listOf(api, e);
  return { ...(list ? { list: { field: list.field } } : {}), ...(e.pagination ? { paging: paginationOf(e.pagination) } : {}) };
}

/** the page size a data source asks for: only of an operation that pages, a whole number of at least one */
export const pageSizeOf = (src: Pick<DataSource, "pageSize">, paged: boolean): number | undefined => (paged && src.pageSize ? Math.max(1, Math.floor(src.pageSize)) : undefined);

/** Whether the typed client's function for an operation (packages/api `createApi`) takes an input before its init: its
 *  path parameters, its body or its query. One that takes none (`GET /me`, a sign-out) is called with its init alone. */
export const takesInput = (op: Pick<ApiOperation, "params" | "body" | "query">): boolean => op.params.length > 0 || !!op.body || !!op.query;

/** A call of the typed client as code, in the shape its function takes: `api.getProduct({ params: … }, { signal })`,
 *  `api.listProducts(undefined, { signal })` (an input it may leave out), `api.getMe({ signal })` (no input at all). */
export function clientCallCode(client: string, op: Pick<ApiOperation, "name" | "params" | "body" | "query">, input: string | undefined, init: string | undefined): string {
  const args = takesInput(op) ? (input !== undefined ? [input, ...(init ? [init] : [])] : init ? ["undefined", init] : []) : init ? [init] : [];
  return `${client}.${op.name}(${args.join(", ")})`;
}

/** the status an operation answers with when it goes well: its first 2xx response, else 200 */
export function okStatus(e: ApiEndpoint): number {
  const ok = Object.keys(e.responses ?? {}).find((code) => /^2\d\d$/.test(code));
  return ok ? Number(ok) : 200;
}

/* ---------- forms ---------- */

/** the keys of a field's schema the app's check reads (lib/bindings/rules.ts `fieldError`, `typedValue`) */
export const RULE_KEYS = ["type", "format", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "pattern", "enum", "contentMediaType", "contentEncoding"];

/** The rule a form's field is checked by in the app: its kind, whether it is required, its schema (whole, or only the keys
 *  the check reads). A field the contract does not have is free words. */
export function fieldRule(spec: FieldSpec | undefined, whole = false): FieldRule {
  if (!spec) return { kind: "text", required: false, schema: {} };
  return { kind: spec.kind, required: spec.required, schema: whole ? spec.schema : Object.fromEntries(RULE_KEYS.filter((k) => spec.schema[k] !== undefined).map((k) => [k, spec.schema[k]])) };
}

/** the rules of the fields of an operation's body, in its schema's order; with `only`, of those fields alone */
export function formRules(api: ApiSpec, e: ApiEndpoint, o: { only?: Set<string>; whole?: boolean } = {}): Record<string, FieldRule> {
  return Object.fromEntries(
    formFields(api, e)
      .filter((f) => !o.only || o.only.has(f.name))
      .map((f) => [f.name, fieldRule(f, o.whole)]),
  );
}

/* ---------- regions ---------- */

/** the state a design of a region is for: its pane (0 content, 1 loading, 2 empty, 3 error, 4 forbidden) */
export const paneState = (g: Pick<Group, "pane">): (typeof REGION_STATES)[number] => REGION_STATES[Math.max(0, Math.min(REGION_STATES.length - 1, g.pane ?? 0))];

/** How a region's state is chosen (the runtime's `regionOf` and `useRegion`), as the entries of its options: when its
 *  data loads (`always`: even the usual, on entering) and when it counts as empty, read in the scope `$`. */
export function regionOptions(load: DataSource["load"], emptyWhen: string | undefined, $: string, always: boolean): string[] {
  return [...(always || load === "demand" ? [`load: ${str(load ?? "enter")}`] : []), ...(emptyWhen ? [`emptyWhen: () => ${holdsCode($, emptyWhen)}`] : [])];
}

/* ---------- the scope ---------- */

/** what a prop bound to an expression is read as, by the kind of value it takes: words, a number kept in its range, yes
 *  or no, one of its choices, a list's rows; a table is not read */
export type BoundRead = "text" | "num" | "bool" | "pick" | "rows";
export function readOf(kind: PropDef["kind"]): BoundRead | null {
  switch (kind) {
    case "bool":
      return "bool";
    case "number":
      return "num";
    case "enum":
      return "pick";
    case "list":
      return "rows";
    case "table":
      return null;
    default:
      return "text";
  }
}

/** a bound prop's read as code: `$.text("item.name")`, `$.num("item.count", 0)`, `rowsOf($.ev("item.tags"), [], 50)`;
 *  `extra` are what follows the expression (the design's value, the range, the choices), printed by the front end */
export function readCode(read: BoundRead, $: string, expr: string, extra: string[] = []): string {
  const rest = extra.map((a) => `, ${a}`).join("");
  return read === "rows" ? `rowsOf(${$}.ev(${str(expr)})${rest})` : `${$}.${read}(${str(expr)}${rest})`;
}

/** whether a condition's expression holds, as code */
export const holdsCode = ($: string, expr: string) => `${$}.holds(${str(expr)})`;

/** words with `{{expressions}}` in them, filled in, as code */
export const fillCode = ($: string, words: string) => `${$}.fill(${str(words)})`;

/** the list a repeat draws, as code: what its expression reads, no more than its limit (as the preview cuts it) */
export const listCode = ($: string, data: string, limit: number | undefined) => `${$}.list(${str(data)})${limit !== undefined && Number.isFinite(limit) ? `.slice(0, ${Math.max(0, Math.floor(limit))})` : ""}`;

/* ---------- taps ---------- */

/** the effects of a tap that are the API's: run by the app's runtime, not by the screen's memory */
export const API_EFFECTS = new Set<Effect["do"]>(["call", "refresh", "loadMore", "submit", "signOut"]);
export const isApiEffect = (e: Effect): boolean => API_EFFECTS.has(e.do);

/* ---------- names ---------- */

/** A name for each part and form of a document, made of the letters and digits of its words, in the document's order:
 *  the same for the same design whatever ids it was given (a part a template adds has a random one). */
export function partNames(doc: Pick<Doc, "groups">): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  const add = (id: string, words: string, fallback: string) => {
    if (out.has(id)) return;
    const parts = (words.match(/[A-Za-z0-9]+/g) ?? []).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w[0].toLowerCase() + w.slice(1)));
    let base = parts.join("").slice(0, 40);
    if (!base || /^\d/.test(base)) base = fallback;
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}${i}`;
    taken.add(name.toLowerCase());
    out.set(id, name);
  };
  for (const g of doc.groups) {
    if (g.form) add(g.id, `${g.name ?? ""} form`, "form");
    for (const it of g.items) add(it.id, g.items.length === 1 && g.name ? g.name : (partBySlug(it.component)?.name ?? it.component ?? "part"), "part");
  }
  return out;
}
