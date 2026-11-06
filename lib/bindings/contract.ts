/* What the bindings read of the contract (lib/api): an endpoint's success response and the list in it, its request
 * body as the fields of a form with the rules its schema gives them, the checking of a value against those rules,
 * problem details read out of an error, and the shape of a path (`data.products.items[]`) for autocomplete. */

import { bodyOf, endpointParams, followRef, successOf } from "../api";
import { isRecord, isSchemaObject } from "../api/schema";
import { authFields, paginationOf, refModel, type ApiEndpoint, type ApiParameter, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";
import { appMessage } from "./messages";

export const endpointOf = (api: ApiSpec | undefined, operationId: string): ApiEndpoint | undefined => api?.endpoints?.find((e) => e.operationId === operationId);

/** a schema with its top reference followed, and a nullable `anyOf [X, null]` read as X */
export function resolved(api: ApiSpec, s: JsonSchema | undefined): JsonSchemaObject | undefined {
  let x = followRef(api, s);
  for (let i = 0; i < 4 && isSchemaObject(x); i++) {
    const pair = Array.isArray(x.anyOf) ? x.anyOf : Array.isArray(x.oneOf) ? x.oneOf : undefined;
    if (!pair) break;
    const real = pair.filter((y) => !(isSchemaObject(y) && y.type === "null"));
    if (real.length !== 1) break;
    x = followRef(api, real[0] as JsonSchema);
  }
  return isSchemaObject(x) ? x : undefined;
}

/** the schema of what an endpoint answers when it goes well */
export function responseSchema(api: ApiSpec, e: ApiEndpoint): JsonSchemaObject | undefined {
  const ok = successOf(e);
  const body = ok ? bodyOf(e.responses[ok], api) : undefined;
  return resolved(api, body?.schema);
}

const typeOf = (s: JsonSchemaObject | undefined): string | undefined => {
  if (!s) return undefined;
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;
  return t ?? (s.properties ? "object" : s.items ? "array" : undefined);
};

/** The list an endpoint answers with: the field of its body that holds it (pagination's `items`, the one array field),
 *  or "" when the body is the list; and the schema of one element. Undefined when it answers no list. */
export function listOf(api: ApiSpec, e: ApiEndpoint): { field: string; item: JsonSchemaObject | undefined } | undefined {
  const s = responseSchema(api, e);
  if (!s) return e.pagination ? { field: paginationOf(e.pagination).items, item: undefined } : undefined;
  if (typeOf(s) === "array") return { field: "", item: resolved(api, s.items as JsonSchema) };
  const props = isRecord(s.properties) ? s.properties : {};
  const field = e.pagination ? paginationOf(e.pagination).items : Object.keys(props).filter((k) => typeOf(resolved(api, props[k] as JsonSchema)) === "array")[0];
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

/** what kind of input a field is entered with */
export type FieldKind = "text" | "email" | "password" | "number" | "integer" | "date" | "datetime" | "url" | "tel" | "textarea" | "select" | "switch" | "file";

/** one field of a form, as its schema says it is entered and checked */
export type FieldSpec = {
  /** where it goes in the body: "email", "address.city" */
  name: string;
  /** what a person is shown: the schema's title, else the name in words */
  title: string;
  description?: string;
  kind: FieldKind;
  required: boolean;
  /** the values a select offers */
  options?: string[];
  schema: JsonSchemaObject;
};

/** a field's name in words: displayName → Display name */
export const titleOf = (name: string) => {
  const last = name.split(".").at(-1) ?? name;
  const words = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : name;
};

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

/* ---------- checking ---------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** whether a value is nothing a person entered */
export const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && !v.length);

/** a pattern the schema gives, made once; one that is not a regular expression, or too long to trust, checks nothing */
function patternOf(p: unknown): RegExp | null {
  if (typeof p !== "string" || p.length > 500) return null;
  try {
    return new RegExp(p, "u");
  } catch {
    return null;
  }
}

/** What is wrong with a value against its field's schema, in the app's language; null when nothing is. */
export function fieldError(spec: Pick<FieldSpec, "kind" | "required" | "schema">, value: unknown, lang: string): string | null {
  const s = spec.schema;
  if (isBlank(value) || value === false) {
    if (spec.required && !(spec.kind === "switch" && value === false)) return appMessage("required", lang);
    return null;
  }
  if (spec.kind === "number" || spec.kind === "integer" || typeOf(s) === "number" || typeOf(s) === "integer") {
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) return appMessage("number", lang);
    if ((spec.kind === "integer" || typeOf(s) === "integer") && !Number.isInteger(n)) return appMessage("integer", lang);
    if (typeof s.minimum === "number" && n < s.minimum) return appMessage("minimum", lang, s.minimum);
    if (typeof s.exclusiveMinimum === "number" && n <= s.exclusiveMinimum) return appMessage("minimum", lang, s.exclusiveMinimum);
    if (typeof s.maximum === "number" && n > s.maximum) return appMessage("maximum", lang, s.maximum);
    if (typeof s.exclusiveMaximum === "number" && n >= s.exclusiveMaximum) return appMessage("maximum", lang, s.exclusiveMaximum);
    return null;
  }
  if (Array.isArray(s.enum) && s.enum.length && !s.enum.some((x) => String(x) === String(value))) return appMessage("enum", lang);
  if (typeof value !== "string") return null;
  const len = [...value].length;
  if (typeof s.minLength === "number" && len < s.minLength) return appMessage("minLength", lang, s.minLength);
  if (typeof s.maxLength === "number" && len > s.maxLength) return appMessage("maxLength", lang, s.maxLength);
  const v = value.trim();
  if (s.format === "email" && !EMAIL.test(v)) return appMessage("email", lang);
  if ((s.format === "uri" || s.format === "url") && !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(v)) return appMessage("url", lang);
  if (s.format === "uuid" && !UUID.test(v)) return appMessage("uuid", lang);
  if (s.format === "date" && (!DATE.test(v) || !Number.isFinite(Date.parse(v)))) return appMessage("date", lang);
  if (s.format === "date-time" && !Number.isFinite(Date.parse(v))) return appMessage("dateTime", lang);
  const re = patternOf(s.pattern);
  if (re && !re.test(value.slice(0, 10_000))) return appMessage("pattern", lang);
  return null;
}

/** a value as the schema's type has it: a number field's words become a number, a boolean's a boolean */
export function typedValue(s: JsonSchemaObject, v: unknown): unknown {
  const t = typeOf(s);
  if ((t === "number" || t === "integer") && typeof v === "string") return v.trim() === "" ? undefined : Number.isFinite(Number(v)) ? Number(v) : v;
  if (t === "boolean" && typeof v === "string") return v === "true" ? true : v === "false" ? false : v;
  if (t === "string" && typeof v === "number") return String(v);
  return v;
}

/* ---------- errors ---------- */

/** RFC 9457 problem details as the bindings read them: status always, the rest when the server said */
export type Problem = { status: number; title: string; detail?: string; type?: string; errors?: { pointer?: string; detail: string; in?: "body" | "query" | "path" | "header" }[] };

/** The problem an error answer is: its problem details where the body has them, else what its status says. Status 0
 *  is a call that never reached the server. */
export function problemOf(status: number, body: unknown, lang: string): Problem {
  const b = isRecord(body) ? body : {};
  const errors = Array.isArray(b.errors)
    ? b.errors
        .slice(0, 200)
        .flatMap((x) =>
          isRecord(x) && typeof x.detail === "string"
            ? [{ ...(typeof x.pointer === "string" ? { pointer: x.pointer } : {}), detail: x.detail.slice(0, 500), ...(x.in === "body" || x.in === "query" || x.in === "path" || x.in === "header" ? { in: x.in as "body" | "query" | "path" | "header" } : {}) }]
            : [],
        )
    : undefined;
  const title = typeof b.title === "string" && b.title ? b.title.slice(0, 300) : status === 0 ? appMessage("network", lang) : appMessage("failed", lang);
  return {
    status: typeof b.status === "number" && b.status >= 100 && b.status <= 599 ? b.status : status,
    title,
    ...(typeof b.detail === "string" ? { detail: b.detail.slice(0, 2000) } : typeof body === "string" && body.trim() && body.length < 500 ? { detail: body } : {}),
    ...(typeof b.type === "string" ? { type: b.type } : {}),
    ...(errors?.length ? { errors } : {}),
  };
}

/** the field of a form an error's JSON Pointer names: "#/email" or "/address/city" → "email", "address.city" */
export function pointerField(pointer: string | undefined): string | undefined {
  if (!pointer) return undefined;
  const p = pointer.replace(/^#/, "");
  if (!p.startsWith("/")) return p || undefined;
  const parts = p
    .slice(1)
    .split("/")
    .map((x) => x.replace(/~1/g, "/").replace(/~0/g, "~"));
  return parts.filter(Boolean).join(".") || undefined;
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
