/* The bindings read back from a file (lib/project.ts): what has the wrong shape is dropped, what is too long is not
 * kept, and the rest stays as it came. Nothing here refuses a document; an expression that does not parse is kept,
 * for the author to see and fix (the preview reads it as nothing). */

import { REGION_STATES, type ActionBody, type DataSource, type FormBinding, type RegionBinding, type ScreenParam } from "../tokens";
import { exprRule } from "../rules";
import { fields, withUnknown } from "../keep";

/* what each kind of binding has; anything else in one is kept as it came (lib/keep.ts) */
const DATA_SOURCE = fields("name", "operationId", "params", "body", "load", "pullToRefresh", "paging", "pageSize");
const SCREEN_PARAM = fields("name", "type", "example");
const FORM = fields("operationId", "params", "values", "then", "catch");
const REGION = fields("source", "emptyWhen", "show");

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** a name a binding is called by: data.<name>, params.<name> */
export const BINDING_NAME = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

/** an expression as the document keeps it: text no longer than an expression may be (lib/rules.ts) */
export const cleanExpr = (v: unknown): string | undefined => (exprRule(v) ? undefined : (v as string));

/** names to expressions, at most 200 of them; empty is nothing */
export function cleanExprMap(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v).slice(0, 200)) {
    const e = cleanExpr(x);
    if (e && k && k.length <= 200) Object.defineProperty(out, k, { value: e, enumerable: true, writable: true, configurable: true });
  }
  return Object.keys(out).length ? out : undefined;
}

export function cleanDataSources(v: unknown): DataSource[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: DataSource[] = [];
  for (const d of v.slice(0, 50)) {
    if (!isRecord(d) || typeof d.name !== "string" || !BINDING_NAME.test(d.name) || seen.has(d.name) || typeof d.operationId !== "string" || !d.operationId) continue;
    seen.add(d.name);
    const params = cleanExprMap(d.params);
    const body = cleanExpr(d.body);
    const built: DataSource = {
      name: d.name,
      operationId: d.operationId,
      ...(params ? { params } : {}),
      ...(body ? { body } : {}),
      ...(d.load === "demand" ? { load: "demand" as const } : {}),
      ...(d.pullToRefresh === true ? { pullToRefresh: true } : {}),
      ...(d.paging === "scroll" || d.paging === "button" ? { paging: d.paging } : {}),
      ...(typeof d.pageSize === "number" && Number.isInteger(d.pageSize) && d.pageSize >= 1 && d.pageSize <= 500 ? { pageSize: d.pageSize } : {}),
    };
    out.push(withUnknown(d, built, DATA_SOURCE));
  }
  return out.length ? out : undefined;
}

export function cleanScreenParams(v: unknown): ScreenParam[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: ScreenParam[] = [];
  for (const p of v.slice(0, 50)) {
    if (!isRecord(p) || typeof p.name !== "string" || !BINDING_NAME.test(p.name) || seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(withUnknown(p, { name: p.name, ...(p.type === "string" || p.type === "number" || p.type === "boolean" ? { type: p.type } : {}), ...(typeof p.example === "string" && p.example.length <= 500 ? { example: p.example } : {}) }, SCREEN_PARAM));
  }
  return out.length ? out : undefined;
}

export function cleanForm(v: unknown, cleanBody: (a: unknown) => ActionBody | undefined): FormBinding | undefined {
  if (!isRecord(v) || typeof v.operationId !== "string" || !v.operationId) return undefined;
  const params = cleanExprMap(v.params);
  const values = cleanExprMap(v.values);
  const then = cleanBody(v.then);
  const fail = cleanBody(v.catch);
  // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
  return withUnknown(v, { operationId: v.operationId, ...(params ? { params } : {}), ...(values ? { values } : {}), ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}) }, FORM);
}

export function cleanRegion(v: unknown): RegionBinding | undefined {
  if (!isRecord(v)) return undefined;
  const emptyWhen = cleanExpr(v.emptyWhen);
  const built: RegionBinding = {
    ...(typeof v.source === "string" && BINDING_NAME.test(v.source) ? { source: v.source } : {}),
    ...(emptyWhen ? { emptyWhen } : {}),
    ...(REGION_STATES.includes(v.show as never) && v.show !== "ready" ? { show: v.show as RegionBinding["show"] } : {}),
  };
  return withUnknown(v, built, REGION);
}
