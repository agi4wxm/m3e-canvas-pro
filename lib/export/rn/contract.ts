/* What an exported app's runtime needs of the contract, as data: each operation's method, path, where each parameter
 * goes, its request's media type, its success status, the list it answers with and how it pages; and the rules of the
 * fields of each form the design binds to an operation's body (lib/bindings/contract.ts `formFields`, the preview's
 * own). The mobile app's generated contract module is written from these, and the session's (`AuthConfig`) by the web
 * app's own generator (lib/export/targets/webSources.ts `authSource`). */

import type { paginationOf, ApiSpec } from "../../api/types";
import { requestOf } from "../../bindings/contract";
import type { Doc } from "../../tokens";
import { answerShape, formRules, okStatus, paramPlaces } from "../bindCode";

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
    const media = requestOf(api!, e)?.type;
    out[e.operationId] = {
      method: e.method.toUpperCase(),
      path: e.path,
      params: Object.fromEntries(paramPlaces(api!, e)) as OperationData["params"],
      ...(media && media !== "application/json" ? { media } : {}),
      status: okStatus(e),
      ...answerShape(api!, e),
    };
  }
  return out;
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
    out[e.operationId] = formRules(api, e, { whole: true });
  }
  return out;
}
