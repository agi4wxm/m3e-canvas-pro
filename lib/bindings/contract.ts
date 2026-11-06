/* What the bindings read of the contract (lib/api): an endpoint's success response and the list in it, its request
 * body as the fields of a form with the rules its schema gives them, the checking of a value against those rules,
 * problem details read out of an error, and the shape of a path (`data.products.items[]`) for autocomplete. */

import { bodyOf, endpointParams, followRef, successOf } from "../api";
import { isRecord, isSchemaObject } from "../api/schema";
import { authFields, paginationOf, refModel, type ApiEndpoint, type ApiParameter, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";
import { schemaType, titleOf, type FieldKind, type FieldSpec } from "./rules";

export { fieldError, isBlank, pointerField, problemFieldErrors, problemMessage, problemOf, schemaType, statusMessage, titleOf, typedValue, type FieldKind, type FieldRule, type FieldSpec, type Problem } from "./rules";

export const endpointOf = (api: ApiSpec | undefined, operationId: string): ApiEndpoint | undefined => api?.endpoints?.find((e) => e.operationId === operationId);

/** a schema with its top reference followed, and a nullable `anyOf [X, null]` read as X */
export function resolved(api: ApiSpec, s: JsonSchema | undefined, depth = 0): JsonSchemaObject | undefined {
  let x = followRef(api, s);
  for (let i = 0; i < 4 && isSchemaObject(x); i++) {
    const pair = Array.isArray(x.anyOf) ? x.anyOf : Array.isArray(x.oneOf) ? x.oneOf : undefined;
    if (!pair) break;
    const real = pair.filter((y) => !(isSchemaObject(y) && y.type === "null"));
    if (real.length !== 1) break;
    x = followRef(api, real[0] as JsonSchema);
  }
  if (isSchemaObject(x) && Array.isArray(x.allOf) && depth < 4) return allOfMerged(api, x, depth);
  return isSchemaObject(x) ? x : undefined;
}

/** A schema made of others (`allOf`: a model and what it adds) as one object: their properties and required fields
 *  together, the schema's own last, so a field reads the same however the contract composed it. */
function allOfMerged(api: ApiSpec, x: JsonSchemaObject, depth: number): JsonSchemaObject {
  const { allOf, ...own } = x;
  const parts = [...(allOf as JsonSchema[]).slice(0, 16).map((p) => resolved(api, p, depth + 1)), own as JsonSchemaObject];
  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  let out: JsonSchemaObject = {};
  for (const p of parts) {
    if (!p) continue;
    const { properties: props, required: req, ...rest } = p;
    out = { ...out, ...rest };
    if (isRecord(props)) Object.assign(properties, props);
    if (Array.isArray(req)) for (const r of req) if (typeof r === "string") required.add(r);
  }
  return { ...out, ...(Object.keys(properties).length ? { type: out.type ?? "object", properties } : {}), ...(required.size ? { required: [...required] } : {}) };
}

/** the schema of what an endpoint answers when it goes well */
export function responseSchema(api: ApiSpec, e: ApiEndpoint): JsonSchemaObject | undefined {
  const ok = successOf(e);
  const body = ok ? bodyOf(e.responses[ok], api) : undefined;
  return resolved(api, body?.schema);
}

const typeOf = schemaType;

/** The list an endpoint answers with: the field of its body that holds it (pagination's `items`, the one array field),
 *  or "" when the body is the list; and the schema of one element. Undefined when it answers no list. */
export function listOf(api: ApiSpec, e: ApiEndpoint): { field: string; item: JsonSchemaObject | undefined } | undefined {
  const s = responseSchema(api, e);
  if (!s) return e.pagination ? { field: paginationOf(e.pagination).items, item: undefined } : undefined;
  if (typeOf(s) === "array") return { field: "", item: resolved(api, s.items as JsonSchema) };
  const props = isRecord(s.properties) ? s.properties : {};
  /* a list of records is what a body holding a list holds (a page of products); a record with a list of words in it (a
     product's pictures) is one thing */
  const records = (k: string) => {
    const arr = resolved(api, props[k] as JsonSchema);
    return typeOf(arr) === "array" && typeOf(resolved(api, arr!.items as JsonSchema)) === "object";
  };
  const field = e.pagination ? paginationOf(e.pagination).items : Object.keys(props).filter(records)[0];
  if (!field) return undefined;
  const arr = resolved(api, props[field] as JsonSchema);
  return { field, item: arr ? resolved(api, arr.items as JsonSchema) : undefined };
}

/** an endpoint's parameters, references followed: path, query and header */
export const paramsOf = (api: ApiSpec, e: ApiEndpoint): ApiParameter[] => endpointParams(api, e).filter((p) => p.in === "path" || p.in === "query" || p.in === "header");

/** the schema of an endpoint's request body and its media type */
export function requestOf(api: ApiSpec, e: ApiEndpoint): { type: string; schema: JsonSchemaObject | undefined } | undefined {
  if (!e.requestBody) return undefined;
  const b = bodyOf(e.requestBody, api);
  return b ? { type: b.type, schema: resolved(api, b.schema) } : undefined;
}

/* ---------- a body as the fields of a form ---------- */

function kindOf(name: string, s: JsonSchemaObject): FieldKind {
  const t = typeOf(s);
  if (Array.isArray(s.enum) && s.enum.length) return "select";
  if (t === "boolean") return "switch";
  if (t === "integer") return "integer";
  if (t === "number") return "number";
  if (s.format === "binary" || s.contentMediaType || s.contentEncoding === "base64") return "file";
  if (s.format === "email") return "email";
  if (s.format === "password" || /password|passcode|secret/i.test(name)) return "password";
  if (s.format === "date") return "date";
  if (s.format === "date-time") return "datetime";
  if (s.format === "uri" || s.format === "url") return "url";
  if (s.format === "phone" || /phone|mobile|tel$/i.test(name)) return "tel";
  if ((typeof s.maxLength === "number" && s.maxLength > 200) || /description|bio|comment|content|body|message|note/i.test(name)) return "textarea";
  return "text";
}

/** The fields a form for an endpoint's body has: each property a person writes (not readOnly), in the schema's order,
 *  an object's properties one level down as "parent.child". */
export function formFields(api: ApiSpec, e: ApiEndpoint): FieldSpec[] {
  const body = requestOf(api, e)?.schema;
  if (!body || !isRecord(body.properties)) return [];
  const out: FieldSpec[] = [];
  const visit = (s: JsonSchemaObject, prefix: string, required: Set<string>, depth: number) => {
    for (const [key, raw] of Object.entries(s.properties ?? {})) {
      const f = resolved(api, raw as JsonSchema);
      if (!f || f.readOnly) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (typeOf(f) === "object" && isRecord(f.properties) && depth < 1) {
        visit(f, name, new Set(Array.isArray(f.required) ? f.required : []), depth + 1);
        continue;
      }
      if (typeOf(f) === "object" || (typeOf(f) === "array" && !(isSchemaObject(f.items) && (f.items.format === "binary")))) continue;
      out.push({
        name,
        title: typeof f.title === "string" && f.title ? f.title : titleOf(name),
        ...(typeof f.description === "string" ? { description: f.description } : {}),
        kind: typeOf(f) === "array" ? "file" : kindOf(key, f),
        required: required.has(key),
        ...(Array.isArray(f.enum) ? { options: f.enum.map((v) => String(v)) } : {}),
        schema: f,
      });
    }
  };
  visit(body, "", new Set(Array.isArray(body.required) ? body.required : []), 0);
  return out;
}

/* ---------- sessions ---------- */

/** the token fields of the sign-in answer, and how a token rides on a call to an endpoint: a header, or a query
 *  parameter; nothing for an endpoint anyone may call */
export function tokenPlacement(api: ApiSpec, e: ApiEndpoint): { header?: string; prefix?: string; query?: string } | null {
  const req = e.security ?? api.auth?.security ?? [];
  if (!req.length) return null;
  const schemes = api.auth?.schemes ?? {};
  for (const r of req) {
    for (const name of Object.keys(r)) {
      const sc = schemes[name];
      if (!sc) continue;
      if (sc.type === "http" && (sc.scheme ?? "").toLowerCase() === "bearer") return { header: "Authorization", prefix: "Bearer " };
      if (sc.type === "http" && (sc.scheme ?? "").toLowerCase() === "basic") return { header: "Authorization", prefix: "Basic " };
      if (sc.type === "apiKey" && sc.in === "header" && sc.name) return { header: sc.name };
      if (sc.type === "apiKey" && sc.in === "query" && sc.name) return { query: sc.name };
      if (sc.type === "oauth2" || sc.type === "openIdConnect") return { header: "Authorization", prefix: "Bearer " };
    }
  }
  return { header: "Authorization", prefix: "Bearer " };
}

export { authFields };

/* ---------- the shape of a path ---------- */

/** One name a path can go on with, for autocomplete: the step, what it is, and a word on it. */
export type PathStep = { name: string; type: string; doc?: string; list?: boolean };

/** the steps a schema offers after it: an object's properties, a list's `length` and its elements' fields under [] */
export function stepsOf(api: ApiSpec, s: JsonSchema | undefined): PathStep[] {
  const x = resolved(api, s);
  if (!x) return [];
  const t = typeOf(x);
  if (t === "array") return [{ name: "length", type: "integer" }];
  if (!isRecord(x.properties)) return [];
  return Object.entries(x.properties).map(([name, raw]) => {
    const f = resolved(api, raw as JsonSchema);
    const ft = typeOf(f) ?? "any";
    const model = isSchemaObject(raw) ? refModel(raw.$ref) : undefined;
    return { name, type: model ?? (ft === "array" ? `${typeOf(resolved(api, f?.items as JsonSchema)) ?? "any"}[]` : f?.format ? `${ft}(${f.format})` : ft), ...(typeof f?.description === "string" ? { doc: f.description } : {}), ...(ft === "array" ? { list: true } : {}) };
  });
}

/** the schema a path of steps reaches in a schema: a property, a list's element by any index */
export function schemaAt(api: ApiSpec, s: JsonSchema | undefined, steps: string[]): JsonSchemaObject | undefined {
  let at = resolved(api, s);
  for (const st of steps) {
    if (!at) return undefined;
    if (typeOf(at) === "array") {
      if (st === "length") return { type: "integer" };
      at = /^-?\d+$/.test(st) || st === "[]" ? resolved(api, at.items as JsonSchema) : undefined;
      continue;
    }
    at = isRecord(at.properties) ? resolved(api, at.properties[st] as JsonSchema) : undefined;
  }
  return at;
}
