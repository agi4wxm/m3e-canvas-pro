/* The contract's JSON Schemas as the generated server and contract tests check against them (ajv, JSON Schema 2020-12).
 * Every model goes into one definitions document per view; a reference to a model points into it; what would move or
 * break the references (ids, anchors, references that lead nowhere or outside the models) is left out; a pattern that is
 * no regular expression is dropped rather than stop the server from starting. Two views, as OpenAPI reads readOnly and
 * writeOnly: in the request view a readOnly property is not required (the app does not send it), in the response view a
 * writeOnly one is not (the server does not answer with it). */

import { isRecord, LIST_SCHEMAS, MAP_SCHEMAS, MAX_SCHEMA_DEPTH, ONE_SCHEMA } from "../../api/schema";
import { encodePointer, refModel, type ApiSpec, type JsonSchema } from "../../api/types";

export type View = "request" | "response";

export const DEFINITIONS_ID: Record<View, string> = { request: "urn:m3e:contract:request", response: "urn:m3e:contract:response" };

/** keywords that would make references resolve somewhere else, or are no part of what is checked */
const DROPPED = new Set(["$id", "$schema", "$anchor", "$dynamicAnchor", "$dynamicRef", "$recursiveAnchor", "$recursiveRef", "$vocabulary"]);

/** the formats ajv-formats checks; any other a contract names is accepted as it is */
export const KNOWN_FORMATS = new Set(
  "date time date-time iso-time iso-date-time duration uri uri-reference uri-template url email hostname ipv4 ipv6 regex uuid json-pointer json-pointer-uri-fragment relative-json-pointer byte int32 int64 float double password binary".split(" "),
);

type Walk = { models: Set<string>; budget: { left: number }; formats: Set<string>; dropped: string[] };

function validRegex(p: unknown): boolean {
  if (typeof p !== "string") return false;
  try {
    new RegExp(p, "u");
    return true;
  } catch {
    return false;
  }
}

function copy(schema: unknown, view: View, w: Walk, depth: number): JsonSchema {
  if (typeof schema === "boolean") return schema;
  if (!isRecord(schema) || depth > MAX_SCHEMA_DEPTH || w.budget.left-- <= 0) return true;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (DROPPED.has(k) || k === "__proto__") continue;
    if (k === "$ref") {
      const model = refModel(v);
      if (model !== undefined && w.models.has(model)) out.$ref = `${DEFINITIONS_ID[view]}#/$defs/${encodePointer(model)}`;
      else w.dropped.push(String(v));
    } else if (k === "pattern") {
      if (validRegex(v)) out.pattern = v;
      else w.dropped.push(`pattern ${JSON.stringify(v)}`);
    } else if (k === "patternProperties" && isRecord(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v)
          .filter(([p]) => validRegex(p))
          .map(([p, s]) => [p, copy(s, view, w, depth + 1)]),
      );
    } else if ((ONE_SCHEMA as readonly string[]).includes(k)) out[k] = copy(v, view, w, depth + 1);
    else if ((LIST_SCHEMAS as readonly string[]).includes(k) && Array.isArray(v)) out[k] = v.map((s) => copy(s, view, w, depth + 1));
    else if ((MAP_SCHEMAS as readonly string[]).includes(k) && isRecord(v)) out[k] = Object.fromEntries(Object.entries(v).map(([n, s]) => [n, copy(s, view, w, depth + 1)]));
    else out[k] = v;
    if (k === "format" && typeof v === "string") w.formats.add(v);
  }
  /* what one side never sends is not required of it */
  if (Array.isArray(out.required) && isRecord(schema.properties)) {
    const props = schema.properties;
    const flag = view === "request" ? "readOnly" : "writeOnly";
    out.required = out.required.filter((name) => !(typeof name === "string" && isRecord(props[name]) && props[name][flag] === true));
  }
  return out as JsonSchema;
}

/** The schemas of one contract, ready for the validator. */
export class ValidatorSchemas {
  private readonly models: Set<string>;
  readonly formats = new Set<string>();
  readonly dropped: string[] = [];
  private readonly budget = { left: 400_000 };

  constructor(private readonly spec: ApiSpec) {
    this.models = new Set((spec.models ?? []).map((m) => m.name));
  }

  /** a schema of an operation or a message, its references pointing into the view's definitions */
  schema(schema: JsonSchema | undefined, view: View): JsonSchema {
    return copy(schema ?? true, view, { models: this.models, budget: this.budget, formats: this.formats, dropped: this.dropped }, 0);
  }

  /** the definitions document of a view: every model under $defs */
  definitions(view: View): Record<string, unknown> {
    const $defs: Record<string, unknown> = {};
    for (const m of this.spec.models ?? []) Object.defineProperty($defs, m.name, { value: this.schema(m.schema, view), enumerable: true, writable: true, configurable: true });
    return { $id: DEFINITIONS_ID[view], $defs };
  }

  /** the formats the contract names that the validator does not know: they are accepted as they are */
  unknownFormats(): string[] {
    return [...this.formats].filter((f) => !KNOWN_FORMATS.has(f)).sort();
  }
}

/** an object schema without some of its properties (the files of a form, checked apart) */
export function withoutProperties(schema: JsonSchema, names: string[]): JsonSchema {
  if (!isRecord(schema)) return schema;
  const props = isRecord(schema.properties) ? Object.fromEntries(Object.entries(schema.properties).filter(([k]) => !names.includes(k))) : undefined;
  const required = Array.isArray(schema.required) ? schema.required.filter((k) => !names.includes(k as string)) : undefined;
  return { ...schema, ...(props ? { properties: props } : {}), ...(required ? { required } : {}) } as JsonSchema;
}
