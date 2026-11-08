/* The operations of the contract as the mocks answer them: each endpoint's path as a pattern, and what it does to the
 * mock data, read from REST conventions. GET /products lists the products, GET /products/{id} reads one, POST
 * /products makes one, PATCH and PUT change it, DELETE takes it away; GET /me is one record of its own; a multipart
 * body with a file is an upload, a response that is not JSON a download; the endpoints the auth names sign in,
 * refresh and sign out. Anything else is an action, answered with made-up data. An operation of the author's may say
 * otherwise (MockSpec.routes). */

import { isRecord, pointerRoot, resolvePointer } from "../api/schema";
import { paginationOf, refModel, type ApiEndpoint, type ApiPagination, type ApiParameter, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";
import { idFieldOf, listedModels, modelShape } from "./shape";
import type { MockRouteKind, MockSpec } from "./types";

export type RouteKind = Exclude<MockRouteKind, "auto">;

/** a body or a response: its media type and its schema */
export type Media = { type: string; schema?: JsonSchema };

export type Route = {
  endpoint: ApiEndpoint;
  operationId: string;
  method: string;
  path: string;
  /** the path as a pattern; its groups are the path parameters, in `params` order */
  pattern: RegExp;
  params: string[];
  /** how many of the path's segments are fixed: the more, the sooner it is tried */
  fixed: number;
  kind: RouteKind;
  /** the model whose records it hands out */
  model?: string;
  /** the field of the model's records the last path parameter names */
  idField?: string;
  /** the path parameter that names the record */
  idParam?: string;
  /** the collection's path: /products for /products/{id}; records of nested collections are told apart by it */
  collection: string;
  /** the successful answer: its status and its body */
  status: number;
  success?: Media;
  /** every media type the successful answer comes in (its content's keys), the JSON one first when there is one */
  types: string[];
  body?: Media;
  /** the field of the answer that holds the list, and how it pages */
  pagination?: Required<ApiPagination> | { style: "page"; items: string; pageParam: string; limitParam: string; totalField?: string };
  parameters: ApiParameter[];
};

const isJson = (type: string) => /^application\/(?:[\w.-]+\+)?json\b/i.test(type) || type === "*/*";

/** the media of a body or a response, references followed */
export function mediaOf(api: ApiSpec, v: unknown): Media | undefined {
  const root = pointerRoot(api);
  const target = isRecord(v) && typeof v.$ref === "string" ? resolvePointer(root, v.$ref) : v;
  if (!isRecord(target) || !isRecord(target.content)) return undefined;
  const entries = Object.entries(target.content as Record<string, unknown>);
  const [type, media] = entries.find(([t]) => isJson(t)) ?? entries[0] ?? [];
  return type ? { type, schema: isRecord(media) ? (media.schema as JsonSchema | undefined) : undefined } : undefined;
}

/** the media types a response comes in, references followed: the JSON one first, then the rest as written */
export function mediaTypesOf(api: ApiSpec, v: unknown): string[] {
  const target = isRecord(v) && typeof v.$ref === "string" ? resolvePointer(pointerRoot(api), v.$ref) : v;
  if (!isRecord(target) || !isRecord(target.content)) return [];
  const all = Object.keys(target.content as Record<string, unknown>);
  return [...all.filter(isJson), ...all.filter((t) => !isJson(t))];
}

/** the parameters of an endpoint, references followed */
export function paramsOf(api: ApiSpec, e: ApiEndpoint): ApiParameter[] {
  const root = pointerRoot(api);
  return (e.parameters ?? [])
    .map((p) => (isRecord(p) && typeof (p as { $ref?: unknown }).$ref === "string" ? resolvePointer(root, (p as { $ref: string }).$ref) : p))
    .filter((p): p is ApiParameter => isRecord(p) && typeof p.name === "string" && typeof p.in === "string");
}

/** the successful response: the first 2XX, else the first that is not the default */
function successOf(e: ApiEndpoint): string | undefined {
  const codes = Object.keys(e.responses);
  return codes.find((c) => c.startsWith("2")) ?? codes.find((c) => c !== "default");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** whether a schema is a model, or holds one at its top (a nullable reference, an allOf of it) */
function modelOf(schema: JsonSchema | undefined): string | undefined {
  if (!isRecord(schema)) return undefined;
  const s = schema as JsonSchemaObject;
  const m = refModel(s.$ref);
  if (m) return m;
  for (const k of ["anyOf", "oneOf", "allOf"] as const) {
    const list = s[k];
    if (Array.isArray(list)) for (const x of list) {
      const inner = modelOf(x as JsonSchema);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** the array field of an object that holds the list (its pagination's, else the only array of objects) */
function listField(api: ApiSpec, schema: JsonSchema | undefined): string | undefined {
  const ref = isRecord(schema) ? refModel((schema as JsonSchemaObject).$ref) : undefined;
  /* a record of its own (a user with a list of roles) is no page of records */
  if (ref && idFieldOf(api, ref)) return undefined;
  const target = ref ? modelShape(api, ref) : (schema as JsonSchemaObject | undefined);
  if (!isRecord(target) || !isRecord(target.properties)) return undefined;
  const ofRecords = (p: JsonSchema) => {
    const items = isRecord(p) ? (p as JsonSchemaObject).items : undefined;
    return isRecord(items) && (typeof (items as JsonSchemaObject).$ref === "string" || (items as JsonSchemaObject).type === "object" || isRecord((items as JsonSchemaObject).properties));
  };
  const arrays = Object.entries(target.properties as Record<string, JsonSchema>).filter(([, p]) => isRecord(p) && (p as JsonSchemaObject).type === "array" && ofRecords(p));
  const named = arrays.find(([k]) => ["items", "data", "results", "list", "records", "rows", "entries", "content", "nodes", "edges"].includes(k));
  return (named ?? (arrays.length === 1 ? arrays[0] : undefined))?.[0];
}

/** how a list pages when it does not say: by the query parameters it takes */
function inferredPaging(params: ApiParameter[], items: string, fields: string[]): Route["pagination"] {
  const q = params.filter((p) => p.in === "query").map((p) => p.name);
  const limit = q.find((n) => ["limit", "pageSize", "page_size", "perPage", "per_page", "size", "count", "first"].includes(n)) ?? "limit";
  if (q.includes("cursor") || q.includes("after") || q.includes("pageToken") || q.includes("page_token")) {
    const cursorParam = q.find((n) => ["cursor", "after", "pageToken", "page_token"].includes(n))!;
    const nextField = fields.find((f) => /^next/i.test(f) || /cursor|token/i.test(f)) ?? "nextCursor";
    return { style: "cursor", items, cursorParam, nextField, limitParam: limit };
  }
  if (q.includes("offset") || q.includes("skip")) return { style: "offset", items, offsetParam: q.includes("offset") ? "offset" : "skip", limitParam: limit, totalField: fields.find((f) => /^(total|count|totalCount|total_count)$/.test(f)) ?? "total" };
  if (q.includes("page")) return { style: "page", items, pageParam: "page", limitParam: limit, totalField: fields.find((f) => /^(total|count|totalCount|total_count)$/.test(f)) };
  return undefined;
}

/** Every endpoint as a route, the most specific path first. */
export function compileRoutes(api: ApiSpec, spec: MockSpec = {}): Route[] {
  const endpoints = api.endpoints ?? [];
  const auth = api.auth;
  /* the model each collection path hands out: from its list, else its detail, else what making one answers */
  const collectionModel = new Map<string, string>();
  const collectionOf = (path: string) => (/\/\{[^{}]+\}$/.test(path) ? path.replace(/\/\{[^{}]+\}$/, "") : path);
  for (const pass of ["list", "detail", "create"] as const) {
    for (const e of endpoints) {
      const ok = successOf(e);
      const media = ok ? mediaOf(api, e.responses[ok]) : undefined;
      if (!media || !isJson(media.type)) continue;
      const col = collectionOf(e.path);
      if (collectionModel.has(col)) continue;
      const endsWithParam = /\/\{[^{}]+\}$/.test(e.path);
      if (pass === "list" && e.method === "get" && !endsWithParam) {
        const isList = isRecord(media.schema) && ((media.schema as JsonSchemaObject).type === "array" || !!listField(api, media.schema));
        const m = isList ? listedModels(api, media.schema)[0] : undefined;
        if (m) collectionModel.set(col, m);
      } else if (pass === "detail" && e.method === "get" && endsWithParam) {
        const m = modelOf(media.schema) ?? listedModels(api, media.schema)[0];
        if (m) collectionModel.set(col, m);
      } else if (pass === "create" && e.method === "post" && !endsWithParam) {
        const m = modelOf(media.schema);
        if (m && idFieldOf(api, m)) collectionModel.set(col, m);
      }
    }
  }
  const routes: Route[] = endpoints.map((e) => {
    const params: string[] = [];
    const source = e.path
      .split("/")
      .map((seg) => {
        const m = /^\{([^{}]+)\}$/.exec(seg);
        if (m) {
          params.push(m[1]);
          return "([^/]+)";
        }
        return escape(seg).replace(/\\\{[^{}]*\\\}/g, "[^/]*");
      })
      .join("/");
    const ok = successOf(e);
    const success = ok ? mediaOf(api, e.responses[ok]) : undefined;
    const body = e.requestBody ? mediaOf(api, e.requestBody) : undefined;
    const parameters = paramsOf(api, e);
    const endsWithParam = /\/\{[^{}]+\}$/.test(e.path);
    const collection = collectionOf(e.path);
    const colModel = collectionModel.get(collection);
    const rule = spec.routes?.find((r) => r.operationId === e.operationId);
    let kind: RouteKind = "action";
    const binaryBody = !!body && (/multipart\/form-data|application\/octet-stream/i.test(body.type) || /^(image|audio|video)\//.test(body.type));
    const download = !!success && !isJson(success.type) && !success.type.startsWith("text/plain") || (isRecord(success?.schema) && (success!.schema as JsonSchemaObject).format === "binary");
    if (auth?.login === e.operationId) kind = "login";
    else if (auth?.refresh === e.operationId) kind = "refresh";
    else if (auth?.logout === e.operationId) kind = "logout";
    else if (download && e.method === "get") kind = "download";
    else if (binaryBody) kind = "upload";
    else if (e.method === "get" && !endsWithParam && colModel && (listField(api, success?.schema) || (isRecord(success?.schema) && (success!.schema as JsonSchemaObject).type === "array"))) kind = "list";
    else if (e.method === "get" && endsWithParam && colModel) kind = "get";
    else if (e.method === "post" && !endsWithParam && colModel) kind = "create";
    else if (e.method === "patch" && endsWithParam && colModel) kind = "update";
    else if (e.method === "put" && endsWithParam && colModel) kind = "replace";
    else if (e.method === "delete" && endsWithParam && colModel) kind = "delete";
    else if (e.method === "get" && success && isJson(success.type) && modelOf(success.schema) && !listField(api, success.schema)) kind = "singleton";
    else if ((e.method === "patch" || e.method === "put") && !endsWithParam && endpoints.some((x) => x.method === "get" && x.path === e.path)) kind = "singleton";
    if (rule?.kind && rule.kind !== "auto") kind = rule.kind;
    const model = rule?.model ?? (["list", "get", "create", "update", "replace", "delete"].includes(kind) ? colModel : kind === "singleton" ? (modelOf(success?.schema) ?? colModel) : undefined);
    let pagination: Route["pagination"];
    if (kind === "list") {
      const items = e.pagination?.items ?? listField(api, success?.schema);
      if (e.pagination) pagination = paginationOf(e.pagination);
      else if (items) {
        const target = isRecord(success?.schema) && typeof (success!.schema as JsonSchemaObject).$ref === "string" ? modelShape(api, refModel((success!.schema as JsonSchemaObject).$ref) ?? "") : (success?.schema as JsonSchemaObject | undefined);
        pagination = inferredPaging(parameters, items, isRecord(target?.properties) ? Object.keys(target!.properties as object) : []);
      }
    }
    const fixed = e.path.split("/").filter((s) => s && !/\{/.test(s)).length;
    return {
      endpoint: e,
      operationId: e.operationId,
      method: e.method.toUpperCase(),
      path: e.path,
      pattern: new RegExp(`^${source}/?$`),
      params,
      fixed,
      kind,
      model,
      idField: model ? idFieldOf(api, model) : undefined,
      idParam: endsWithParam ? params[params.length - 1] : undefined,
      collection,
      status: ok && /^\d{3}$/.test(ok) ? Number(ok) : e.method === "post" ? 201 : 200,
      success,
      types: ok ? mediaTypesOf(api, e.responses[ok]) : [],
      body,
      pagination,
      parameters,
    };
  });
  return routes.sort((a, b) => b.fixed - a.fixed || a.params.length - b.params.length);
}

/** the route a request is for, and its path parameters; `allowed` lists the methods of a path that matched another */
export function matchRoute(routes: readonly Route[], method: string, path: string, operationId?: string): { route?: Route; params: Record<string, string>; allowed: string[] } {
  const clean = path.split("?")[0].split("#")[0] || "/";
  const allowed: string[] = [];
  const tryRoute = (r: Route) => {
    const m = r.pattern.exec(clean);
    if (!m) return undefined;
    const params: Record<string, string> = {};
    r.params.forEach((name, i) => {
      try {
        params[name] = decodeURIComponent(m[i + 1]);
      } catch {
        params[name] = m[i + 1];
      }
    });
    return params;
  };
  if (operationId) {
    const r = routes.find((x) => x.operationId === operationId && x.method === method);
    const params = r ? tryRoute(r) : undefined;
    if (r && params) return { route: r, params, allowed };
  }
  for (const r of routes) {
    const params = tryRoute(r);
    if (!params) continue;
    if (r.method === method || (method === "HEAD" && r.method === "GET")) return { route: r, params, allowed };
    allowed.push(r.method);
  }
  return { params: {}, allowed: [...new Set(allowed)] };
}
