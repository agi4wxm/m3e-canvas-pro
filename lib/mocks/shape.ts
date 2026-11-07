/* What the mocks need to know of a model's schema, without making anything: its allOf as one object, the field that
 * identifies its records, the models a response hands out. Light, so the editor's operations read it without
 * loading the generator and its words. */

import { isRecord, pointerRoot, resolvePointer } from "../api/schema";
import { refModel, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";

/** how many records a model has when nobody says */
export const DEFAULT_COUNT = 24;


/** a JSON copy */
export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/** the model's schema with its allOf merged: what its records have */
export function modelShape(api: ApiSpec, model: string): JsonSchemaObject | undefined {
  const s = api.models?.find((m) => m.name === model)?.schema;
  if (!isRecord(s)) return undefined;
  const o = s as JsonSchemaObject;
  return Array.isArray(o.allOf) ? mergeAllOf({ api }, o) : o;
}

/** the field that identifies a model's records: id, else <model>Id, else uuid / key / code; undefined when none */
export function idFieldOf(api: ApiSpec, model: string): string | undefined {
  const s = modelShape(api, model);
  const props = isRecord(s?.properties) ? Object.keys(s!.properties as object) : [];
  const lower = model.charAt(0).toLowerCase() + model.slice(1);
  return ["id", "_id", `${lower}Id`, `${lower}_id`, "uuid", "key", "code", "slug"].find((k) => props.includes(k));
}

/** the schemas of an allOf as one: their properties together, their required lists together, the rest laid over */
export function mergeAllOf(ctx: { api: ApiSpec; root?: Record<string, unknown> }, s: JsonSchemaObject, depth = 0): JsonSchemaObject {
  const root = ctx.root ?? pointerRoot(ctx.api);
  const out: JsonSchemaObject = {};
  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  const add = (x: JsonSchema | undefined, d: number) => {
    if (!isRecord(x) || d > 12) return;
    let part = x as JsonSchemaObject;
    const seen = new Set<string>();
    while (typeof part.$ref === "string" && !seen.has(part.$ref) && seen.size < 16) {
      seen.add(part.$ref);
      const next = resolvePointer(root, part.$ref);
      if (!isRecord(next)) return;
      part = next as JsonSchemaObject;
    }
    if (Array.isArray(part.allOf)) for (const y of part.allOf) add(y as JsonSchema, d + 1);
    for (const [k, v] of Object.entries(part)) {
      if (k === "allOf" || k === "$ref") continue;
      if (k === "properties" && isRecord(v)) Object.assign(properties, v);
      else if (k === "required" && Array.isArray(v)) v.forEach((r) => typeof r === "string" && required.add(r));
      else if (out[k] === undefined) out[k] = v;
    }
  };
  const { allOf, ...own } = s;
  for (const x of allOf ?? []) add(x as JsonSchema, depth);
  add(own as JsonSchema, depth);
  if (Object.keys(properties).length) {
    out.properties = properties;
    if (!out.type) out.type = "object";
  }
  if (required.size) out.required = [...required];
  return out;
}

/** the models a response hands out as records: a model itself, a list of it, or an object with a list of it */
export function listedModels(api: ApiSpec, schema: JsonSchema | undefined, depth = 0): string[] {
  if (!isRecord(schema) || depth > 3) return [];
  const s = schema as JsonSchemaObject;
  const m = refModel(s.$ref);
  if (m) {
    const shape = modelShape(api, m);
    /* a page model (ProductPage: {items: Product[]}) hands out what it lists, not itself */
    const inner = shape && isRecord(shape.properties) ? Object.values(shape.properties as Record<string, JsonSchema>).flatMap((p) => (isRecord(p) && (p as JsonSchemaObject).type === "array" ? listedModels(api, (p as JsonSchemaObject).items, depth + 1) : [])) : [];
    return inner.length && !idFieldOf(api, m) ? inner : [m];
  }
  if (s.type === "array") return listedModels(api, s.items, depth + 1);
  if (isRecord(s.properties)) return Object.values(s.properties as Record<string, JsonSchema>).flatMap((p) => (isRecord(p) && ((p as JsonSchemaObject).type === "array" || typeof (p as JsonSchemaObject).$ref === "string") ? listedModels(api, p, depth + 1) : []));
  for (const k of ["anyOf", "oneOf", "allOf"] as const) if (Array.isArray(s[k])) return (s[k] as JsonSchema[]).flatMap((x) => listedModels(api, x, depth + 1));
  return [];
}
