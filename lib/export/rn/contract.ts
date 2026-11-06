/* What an exported app's runtime needs of the contract, as data: each operation's method, path, where each parameter
 * goes, its request's media type, its success status, the list it answers with and how it pages; what the session
 * needs (packages/app-runtime `AuthConfig`: which operations sign in, refresh and sign out, how each one's token rides);
 * and the rules of the fields of each form the design binds to an operation's body (lib/bindings/contract.ts
 * `formFields`, the preview's own). The mobile app's generated contract module is written from these. */

import { successOf } from "../../api";
import { authFields, paginationOf, type ApiSpec } from "../../api/types";
import { formFields, listOf, paramsOf, requestOf, tokenPlacement } from "../../bindings/contract";
import type { Doc } from "../../tokens";

export type OperationData = {
  method: string;
  path: string;
  /** where each parameter goes, by name */
  params: Record<string, "path" | "query" | "header">;
  /** the request body's media type, when it is not JSON (multipart/form-data) */
  media?: string;
  /** the status a success answers with */
  status: number;
  /** where the answer holds its list */
  list?: { field: string };
  /** how it pages */
  paging?: ReturnType<typeof paginationOf>;
};

export function operationsOf(api: ApiSpec | undefined): Record<string, OperationData> {
  const out: Record<string, OperationData> = {};
  for (const e of api?.endpoints ?? []) {
    const ok = successOf(e);
    const media = requestOf(api!, e)?.type;
    const list = listOf(api!, e);
    out[e.operationId] = {
      method: e.method.toUpperCase(),
      path: e.path,
      params: Object.fromEntries(paramsOf(api!, e).map((p) => [p.name, p.in as "path" | "query" | "header"])),
      ...(media && media !== "application/json" ? { media } : {}),
      status: ok && /^\d{3}$/.test(ok) ? Number(ok) : 200,
      ...(list ? { list: { field: list.field } } : {}),
      ...(e.pagination ? { paging: paginationOf(e.pagination) } : {}),
    };
  }
  return out;
}

/** what the session needs of the contract (packages/app-runtime `AuthConfig`), as data */
export function authOf(api: ApiSpec | undefined): Record<string, unknown> {
  const a = api?.auth;
  const op = (id: string | undefined) => {
    const e = id ? api?.endpoints?.find((x) => x.operationId === id) : undefined;
    return e ? { operationId: e.operationId, method: e.method.toUpperCase(), path: e.path } : undefined;
  };
  const fields = authFields(a);
  const security = Object.fromEntries((api?.endpoints ?? []).map((e) => [e.operationId, tokenPlacement(api!, e)]));
  const anyone = (api?.auth?.security ?? []).length === 0;
  return {
    ...(a?.login ? { login: a.login } : {}),
    ...(op(a?.refresh) ? { refresh: op(a?.refresh) } : {}),
    ...(op(a?.logout) ? { logout: op(a?.logout) } : {}),
    tokenField: fields.token,
    refreshTokenField: fields.refreshToken,
    security,
    fallback: anyone ? null : { header: "Authorization", prefix: "Bearer " },
  };
}

/** the rules of the fields of each operation a form of the design sends: kind, required, schema */
export function formRulesOf(doc: Pick<Doc, "api" | "groups">): Record<string, Record<string, { kind: string; required: boolean; schema: unknown }>> {
  const out: Record<string, Record<string, { kind: string; required: boolean; schema: unknown }>> = {};
  const api = doc.api;
  if (!api) return out;
  for (const g of doc.groups) {
    const id = g.form?.operationId;
    const e = id ? api.endpoints?.find((x) => x.operationId === id) : undefined;
    if (!e || out[e.operationId]) continue;
    out[e.operationId] = Object.fromEntries(formFields(api, e).map((f) => [f.name, { kind: f.kind, required: f.required, schema: f.schema }]));
  }
  return out;
}
