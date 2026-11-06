/* JSON Schema 2020-12 as the API section uses it: which keywords hold subschemas, walking every schema of an API with a
 * budget (a hostile document cannot make a walk run away), references followed one step at a time and renamed, and the
 * rows of fields the editor shows for an object model and writes back. */

import { MODEL_REF, decodePointer, encodePointer, modelRef, refModel, type ApiSpec, type JsonSchema, type JsonSchemaObject, type JsonType } from "./types";

export const JSON_TYPES: readonly JsonType[] = ["string", "number", "integer", "boolean", "object", "array", "null"];

/** the formats the editor offers; any other string is kept and passed on */
export const FORMATS = ["date-time", "date", "time", "duration", "uuid", "email", "uri", "url", "hostname", "ipv4", "ipv6", "password", "binary", "byte", "int32", "int64", "float", "double", "phone"] as const;

/** keywords whose value is one subschema */
export const ONE_SCHEMA = ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedItems", "unevaluatedProperties", "contentSchema"] as const;
/** keywords whose value is a list of subschemas */
export const LIST_SCHEMAS = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;
/** keywords whose value maps names to subschemas */
export const MAP_SCHEMAS = ["properties", "patternProperties", "dependentSchemas", "$defs"] as const;

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isSchemaObject = (v: unknown): v is JsonSchemaObject => isRecord(v);

/** how deep schemas may nest inside one another, and how many there may be in a walk: past these a walk stops */
export const MAX_SCHEMA_DEPTH = 40;

/** Calls `visit` on a schema and each subschema in it, depth first, with its JSON path from the schema. Stops going
 *  deeper past MAX_SCHEMA_DEPTH and stops altogether when `budget.left` runs out. */
export function eachSubschema(schema: JsonSchema | undefined, visit: (s: JsonSchemaObject, path: string, depth: number) => void, budget = { left: 100_000 }, path = "", depth = 0) {
  if (!isSchemaObject(schema) || budget.left <= 0 || depth > MAX_SCHEMA_DEPTH) return;
  budget.left--;
  visit(schema, path, depth);
  for (const k of ONE_SCHEMA) if (schema[k] !== undefined) eachSubschema(schema[k] as JsonSchema, visit, budget, `${path}/${k}`, depth + 1);
  for (const k of LIST_SCHEMAS) {
    const list = schema[k];
    if (Array.isArray(list)) list.forEach((s, i) => eachSubschema(s as JsonSchema, visit, budget, `${path}/${k}/${i}`, depth + 1));
  }
  for (const k of MAP_SCHEMAS) {
    const map = schema[k];
    if (isRecord(map)) for (const [name, s] of Object.entries(map)) eachSubschema(s as JsonSchema, visit, budget, `${path}/${k}/${encodePointer(name)}`, depth + 1);
  }
}

/** every `$ref` a schema makes, each once */
export function schemaRefs(schema: JsonSchema | undefined): string[] {
  const out = new Set<string>();
  eachSubschema(schema, (s) => {
    if (typeof s.$ref === "string") out.add(s.$ref);
  });
  return [...out];
}

/** the models a schema refers to, each once */
export const schemaModels = (schema: JsonSchema | undefined): string[] => [...new Set(schemaRefs(schema).map(refModel).filter((x): x is string => !!x))];

/** Every value in a piece of JSON with each `$ref` (and each discriminator mapping, which holds references as plain
 *  strings) passed through `fn`: a string becomes the new reference, null takes the reference away (what else the
 *  object says stays). The same object where nothing changed. Bounded by depth. */
export function mapRefs<T>(value: T, fn: (ref: string) => string | null, depth = 0): T {
  if (depth > 200 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const next = mapRefs(v, fn, depth + 1);
      if (next !== v) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  const o = value as Record<string, unknown>;
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    let next: unknown = v;
    if (k === "$ref" && typeof v === "string") {
      const r = fn(v);
      if (r === null) {
        changed = true;
        continue;
      }
      next = r;
    } else if (k === "discriminator" && isRecord(v) && isRecord(v.mapping)) {
      const mapping = Object.fromEntries(Object.entries(v.mapping).map(([name, ref]) => [name, typeof ref === "string" ? (fn(ref) ?? ref) : ref]));
      next = JSON.stringify(mapping) === JSON.stringify(v.mapping) ? v : { ...v, mapping };
    } else next = mapRefs(v, fn, depth + 1);
    if (next !== v) changed = true;
    define(out, k, next);
  }
  return (changed ? out : value) as T;
}

/** a key set on an object without reaching its prototype (`__proto__` is a property name like any other in JSON) */
export function define(o: Record<string, unknown>, k: string, v: unknown) {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

/** the API with every reference to one model made to another (or taken away, with `to` null) */
export function renameModelRefs(api: ApiSpec, from: string, to: string | null): ApiSpec {
  const old = modelRef(from);
  const prefix = `${MODEL_REF}${encodePointer(from)}/`;
  return mapRefs(api, (ref) => {
    if (ref === old || ref === `${MODEL_REF}${encodePointer(from)}`) return to === null ? null : modelRef(to);
    if (ref.startsWith(prefix)) return to === null ? null : `${MODEL_REF}${encodePointer(to)}/${ref.slice(prefix.length)}`;
    return ref;
  });
}

/** the virtual document a `#/…` pointer of the API is read against: OpenAPI's, with the models as its schemas */
export function pointerRoot(api: ApiSpec): Record<string, unknown> {
  const extraComponents = isRecord(api.extra?.openapi?.components) ? (api.extra!.openapi!.components as Record<string, unknown>) : {};
  return { components: { ...extraComponents, schemas: Object.fromEntries((api.models ?? []).map((m) => [m.name, m.schema])) } };
}

/** What a local reference (`#/components/schemas/User`, `#/components/responses/NotFound`) points at, one step: the
 *  value, or undefined when there is nothing there or it is not a local reference. */
export function resolvePointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#")) return undefined;
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;
  let at: unknown = root;
  for (const raw of ref.slice(2).split("/")) {
    let part: string;
    try {
      part = decodePointer(decodeURIComponent(raw));
    } catch {
      return undefined;
    }
    if (Array.isArray(at)) at = /^\d+$/.test(part) ? at[Number(part)] : undefined;
    else if (isRecord(at) && Object.prototype.hasOwnProperty.call(at, part)) at = at[part];
    else return undefined;
  }
  return at;
}

/** A schema with references to models followed until it is not one (a chain of references ends; a loop stops): what
 *  a reader of its fields needs. Only the top is followed; the fields inside may still refer. */
export function followRef(api: ApiSpec, schema: JsonSchema | undefined): JsonSchema | undefined {
  const root = pointerRoot(api);
  let s = schema;
  const seen = new Set<string>();
  while (isSchemaObject(s) && typeof s.$ref === "string" && !seen.has(s.$ref) && seen.size < 32) {
    seen.add(s.$ref);
    const next = resolvePointer(root, s.$ref);
    if (next === undefined || (typeof next !== "boolean" && !isRecord(next))) return s;
    s = next as JsonSchema;
  }
  return s;
}

/* ---------- the types a schema stands for, in short ---------- */

/** the type of a schema in a few characters, for outlines and the field table: User, string(email), Product[], "a"|"b" */
export function typeText(schema: JsonSchema | undefined, depth = 0): string {
  if (schema === true || schema === undefined) return "any";
  if (schema === false) return "never";
  if (depth > 4) return "…";
  const s = schema;
  if (typeof s.$ref === "string") return refModel(s.$ref) ?? s.$ref;
  if (Array.isArray(s.enum)) return s.enum.slice(0, 6).map((v) => JSON.stringify(v)).join("|") + (s.enum.length > 6 ? "|…" : "");
  if (s.const !== undefined) return JSON.stringify(s.const);
  for (const k of ["oneOf", "anyOf"] as const) if (Array.isArray(s[k])) return (s[k] as JsonSchema[]).map((x) => typeText(x, depth + 1)).join("|");
  if (Array.isArray(s.allOf)) return (s.allOf as JsonSchema[]).map((x) => typeText(x, depth + 1)).join("&");
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : s.properties ? ["object"] : s.items ? ["array"] : [];
  if (!types.length) return "any";
  return types
    .map((t) => {
      if (t === "array") return `${typeText(s.items, depth + 1)}[]`;
      if (t === "string" || t === "integer" || t === "number") return s.format ? `${t}(${s.format})` : t;
      if (t === "object" && isRecord(s.properties) && depth > 0) return `{${Object.keys(s.properties).slice(0, 4).join(", ")}${Object.keys(s.properties).length > 4 ? ", …" : ""}}`;
      return t;
    })
    .join("|");
}

/* ---------- an object model as rows of fields ---------- */

/** what the editor's field table shows of one property */
export type FieldRow = {
  name: string;
  /** a JSON type, "ref" (a model), or "array" of `items` */
  type: JsonType | "ref";
  /** the model of a ref, or of an array's items */
  ref?: string;
  /** the type of an array's items when they are not a model */
  items?: JsonType;
  /** the format of an array's items when they are not a model (a list of files: binary) */
  itemsFormat?: string;
  required: boolean;
  nullable: boolean;
  format?: string;
  enum?: string[];
  description?: string;
  example?: string;
};

/** the type a field's own schema has, its "null" set apart */
function baseType(s: JsonSchemaObject): { type?: JsonType; nullable: boolean } {
  const list = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const nullable = list.includes("null");
  const rest = list.filter((t) => t !== "null");
  return { type: rest.length === 1 ? rest[0] : rest.length ? rest[0] : undefined, nullable };
}

/** a value shown in a one-line cell */
const cell = (v: unknown) => (v === undefined ? undefined : typeof v === "string" ? v : JSON.stringify(v));

/** The rows of an object schema's properties, in their order; empty for a schema that is not an object. */
export function fieldRows(schema: JsonSchema | undefined): FieldRow[] {
  if (!isSchemaObject(schema) || !isRecord(schema.properties)) return [];
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(schema.properties).map(([name, raw]) => {
    const s: JsonSchemaObject = isSchemaObject(raw) ? raw : {};
    const { type, nullable: typeNullable } = baseType(s);
    /* a nullable reference is written as anyOf: [the model, null] */
    const pair = Array.isArray(s.anyOf) && s.anyOf.length === 2 ? (s.anyOf as JsonSchema[]) : undefined;
    const pairRef = pair && pair.some((x) => isSchemaObject(x) && x.type === "null") ? pair.map((x) => (isSchemaObject(x) ? refModel(x.$ref) : undefined)).find(Boolean) : undefined;
    const model = refModel(s.$ref) ?? pairRef;
    const nullable = typeNullable || !!pairRef;
    const example = Array.isArray(s.examples) && s.examples.length ? s.examples[0] : s.example;
    const row: FieldRow = { name, type: model ? "ref" : (type ?? "string"), required: required.has(name), nullable };
    if (model) row.ref = model;
    if (type === "array" && isSchemaObject(s.items)) {
      const inner = refModel(s.items.$ref);
      if (inner) row.ref = inner;
      else {
        row.items = baseType(s.items).type ?? "string";
        if (typeof s.items.format === "string") row.itemsFormat = s.items.format;
      }
    }
    if (typeof s.format === "string") row.format = s.format;
    if (Array.isArray(s.enum)) row.enum = s.enum.map((v) => String(v));
    if (typeof s.description === "string") row.description = s.description;
    const ex = cell(example);
    if (ex !== undefined) row.example = ex;
    return row;
  });
}

/** The formats of text the field table names as types of their own: a file (`binary`) is no words, a date is a date.
 *  Other formats stay text, their format shown beside. */
export const FORMAT_TYPES = ["binary", "date-time", "date", "time", "email", "uri", "uuid"] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];
const isFormatType = (f: string | undefined): f is FormatType => !!f && (FORMAT_TYPES as readonly string[]).includes(f);

/** The type a row is shown as in the field table: a JSON type, `format:<format>` for text of a format that is a type of
 *  its own (`format:binary`, a file), or `ref:<model>`. */
export function rowTypeKey(r: FieldRow): string {
  if (r.type === "ref") return `ref:${r.ref ?? ""}`;
  return r.type === "string" && isFormatType(r.format) ? `format:${r.format}` : r.type;
}

/** the type a list's items are shown as, the same way */
export function itemsTypeKey(r: FieldRow): string {
  if (r.ref) return `ref:${r.ref}`;
  const t = r.items ?? "string";
  return t === "string" && isFormatType(r.itemsFormat) ? `format:${r.itemsFormat}` : t;
}

/** A row of the type a key names (see `rowTypeKey`). A format's type is text of that format; a file takes no choices or
 *  example, which are words; plain text from a format's type drops the format, so a file made text is no file. */
export function withRowType(r: FieldRow, key: string): FieldRow {
  if (key.startsWith("ref:")) return { ...r, type: "ref", ref: key.slice(4), items: undefined, itemsFormat: undefined, format: undefined, enum: undefined };
  if (key.startsWith("format:")) {
    const format = key.slice(7);
    return { ...r, type: "string", ref: undefined, items: undefined, itemsFormat: undefined, format, ...(format === "binary" ? { enum: undefined, example: undefined } : {}) };
  }
  const type = key as JsonType;
  const next: FieldRow = { ...r, type, ref: undefined, items: type === "array" ? (r.type === "array" ? r.items : "string") : undefined, itemsFormat: type === "array" && r.type === "array" ? r.itemsFormat : undefined };
  if (rowTypeKey(r).startsWith("format:")) next.format = undefined;
  return next;
}

/** a list's row whose items are of the type a key names */
export function withItemsType(r: FieldRow, key: string): FieldRow {
  if (key.startsWith("ref:")) return { ...r, ref: key.slice(4), items: undefined, itemsFormat: undefined };
  if (key.startsWith("format:")) return { ...r, ref: undefined, items: "string", itemsFormat: key.slice(7) };
  return { ...r, ref: undefined, items: key as JsonType, itemsFormat: undefined };
}

/** whether a schema's own fields (or the items of a list among them) hold a file: what only a multipart body carries */
export function holdsFile(schema: JsonSchema | undefined): boolean {
  return fieldRows(schema).some((r) => (r.type === "string" && r.format === "binary") || (r.type === "array" && !r.ref && r.itemsFormat === "binary"));
}

/** an example typed in a cell, as the value its type takes */
export function exampleValue(text: string, type: JsonType | "ref"): unknown {
  const t = text.trim();
  if (type === "number" || type === "integer") return Number.isFinite(Number(t)) && t !== "" ? Number(t) : text;
  if (type === "boolean") return t === "true" ? true : t === "false" ? false : text;
  if (type === "object" || type === "array" || type === "null") {
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  }
  return text;
}

/** The schema of one property as a row says it is, keeping what the row does not show (bounds, a pattern, nested
 *  properties) from the schema it had. */
export function fieldSchema(row: FieldRow, was?: JsonSchema): JsonSchemaObject {
  const old: JsonSchemaObject = isSchemaObject(was) ? was : {};
  const keep: JsonSchemaObject = {};
  /* what the row does not speak for stays: bounds, patterns, nested properties of a matching type */
  const shown = new Set(["$ref", "type", "format", "enum", "description", "examples", "example", "items"]);
  const sameType = row.type !== "ref" && baseType(old).type === row.type && !old.$ref;
  for (const [k, v] of Object.entries(old)) if (!shown.has(k) && (sameType || k.startsWith("x-") || k === "title" || k === "readOnly" || k === "writeOnly" || k === "deprecated")) define(keep, k, v);
  const out: JsonSchemaObject = {};
  if (row.type === "ref") {
    out.$ref = modelRef(row.ref ?? "");
    if (row.nullable) {
      /* a nullable reference: either the model or null */
      return { ...(row.description ? { description: row.description } : {}), anyOf: [{ $ref: modelRef(row.ref ?? "") }, { type: "null" }] };
    }
  } else out.type = row.nullable ? [row.type, "null"] : row.type;
  if (row.description) out.description = row.description;
  if (row.format && row.type !== "ref" && row.type !== "boolean" && row.type !== "object" && row.type !== "array") out.format = row.format;
  if (row.enum?.length && row.type !== "ref") out.enum = row.enum.map((v) => exampleValue(v, row.type));
  if (row.type === "array") {
    const oldItems = sameType && isSchemaObject(old.items) ? old.items : undefined;
    if (row.ref) out.items = { $ref: modelRef(row.ref) };
    else {
      const type = row.items ?? "string";
      const items: JsonSchemaObject = { ...(oldItems && !oldItems.$ref ? oldItems : {}), type };
      /* the row reads the items' format, so one it does not have was taken off */
      if (row.itemsFormat && (type === "string" || type === "number" || type === "integer")) items.format = row.itemsFormat;
      else delete items.format;
      out.items = items;
    }
  }
  if (row.example !== undefined && row.example !== "") out.examples = [exampleValue(row.example, row.type === "ref" ? "object" : row.type)];
  for (const [k, v] of Object.entries(keep)) if (!(k in out)) define(out, k, v);
  return out;
}

/** an object schema with its properties as the rows say, in their order; what else it says stays */
export function withFieldRows(schema: JsonSchema | undefined, rows: FieldRow[]): JsonSchemaObject {
  const base: JsonSchemaObject = isSchemaObject(schema) ? schema : {};
  const props = isRecord(base.properties) ? base.properties : {};
  const properties: Record<string, JsonSchema> = {};
  for (const r of rows) if (r.name) define(properties, r.name, fieldSchema(r, props[r.name] as JsonSchema | undefined));
  const required = rows.filter((r) => r.required && r.name).map((r) => r.name);
  const out: JsonSchemaObject = {};
  /* the usual order: what it is, then its fields, then what else it had */
  out.type = base.type ?? "object";
  if (base.description !== undefined) out.description = base.description;
  out.properties = properties;
  if (required.length) out.required = required;
  for (const [k, v] of Object.entries(base)) if (!(k in out) && k !== "required" && k !== "properties") define(out, k, v);
  return out;
}

/** the path parameters a path template names, in order: /users/{id}/posts/{postId} → id, postId */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
}

/** an identifier made of any words: what an operationId or a model name is made from */
export function identifier(words: string, upper = false): string {
  const parts = words
    .normalize("NFKD")
    .replace(/\{([^{}]*)\}/g, " by $1 ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const joined = parts.map((p, i) => (i === 0 && !upper ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1))).join("");
  const safe = /^[A-Za-z]/.test(joined) ? joined : `x${joined}`;
  return safe.slice(0, 64);
}

/** the operationId an endpoint without one is given: getUsersById for GET /users/{id} */
export const operationIdFor = (method: string, path: string) => identifier(`${method} ${path.replace(/^\//, "")}`);
