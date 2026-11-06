/* Example values from the contract's schemas, for the requests the contract tests send and the server's own checks. The
 * contract's own examples come first (examples, example, const, default, the first of an enum); otherwise a plain value
 * of the schema's type and format that keeps to its bounds. Deterministic: the same schema always gives the same value.
 *
 * This is a small generator of the back end's own: the mock library (lib/mocks) has the full one (data in every
 * language, files of every kind, scenarios). The contract tests only need one valid request per operation. */

import { isRecord } from "../../api/schema";
import { refModel, type ApiSpec, type JsonSchema } from "../../api/types";

/** a file field of a form: what the contract tests upload for it */
export type ExampleFile = { name: string; type: string };

const MAX_DEPTH = 8;

const STRINGS: Record<string, string> = {
  uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  email: "user@example.com",
  "date-time": "2026-01-01T09:00:00Z",
  date: "2026-01-01",
  time: "09:00:00Z",
  duration: "P1D",
  uri: "https://example.com/",
  url: "https://example.com/",
  "uri-reference": "/example",
  hostname: "example.com",
  ipv4: "192.0.2.1",
  ipv6: "2001:db8::1",
  byte: "ZXhhbXBsZQ==",
  password: "correct-horse-1",
  phone: "+15550100000",
  "json-pointer": "/example",
  regex: "^example$",
};

export class Examples {
  private readonly models: Map<string, JsonSchema>;

  constructor(spec: ApiSpec) {
    this.models = new Map((spec.models ?? []).map((m) => [m.name, m.schema]));
  }

  /** the value of a schema: the contract's own example, else one made from the schema */
  of(schema: JsonSchema | undefined, view: "request" | "response" = "request"): unknown {
    return this.value(schema, view, 0, []);
  }

  /** whether a schema (or what it refers to) is a file */
  isFile(schema: JsonSchema | undefined): boolean {
    const s = this.resolve(schema);
    return isRecord(s) && (s.format === "binary" || s.contentMediaType === "application/octet-stream");
  }

  /** a schema with its references to models followed until it is not one */
  resolve(schema: JsonSchema | undefined): JsonSchema | undefined {
    let s = schema;
    for (let i = 0; i < 16 && isRecord(s) && typeof s.$ref === "string"; i++) {
      const name = refModel(s.$ref);
      s = name !== undefined ? this.models.get(name) : undefined;
    }
    return s;
  }

  private value(schema: JsonSchema | undefined, view: "request" | "response", depth: number, seen: string[]): unknown {
    if (schema === undefined || schema === true) return {};
    if (schema === false || depth > MAX_DEPTH) return null;
    const s = schema;
    if (typeof s.$ref === "string") {
      const name = refModel(s.$ref);
      if (name === undefined || !this.models.has(name) || seen.includes(name)) return null;
      return this.value(this.models.get(name), view, depth + 1, [...seen, name]);
    }
    if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
    if ("example" in s) return s.example;
    if ("const" in s) return s.const;
    if ("default" in s) return s.default;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
    if (Array.isArray(s.allOf)) {
      const parts = s.allOf.map((x) => this.value(x as JsonSchema, view, depth + 1, seen));
      const own = s.type || s.properties ? this.value({ ...s, allOf: undefined }, view, depth + 1, seen) : undefined;
      const objects = [...parts, own].filter(isRecord);
      return objects.length ? Object.assign({}, ...objects) : (parts.find((p) => p !== null && p !== undefined) ?? null);
    }
    for (const k of ["oneOf", "anyOf"] as const) {
      const list = s[k];
      if (Array.isArray(list) && list.length) {
        const pick = list.find((x) => !(isRecord(x) && (x.type === "null" || x.const === null))) ?? list[0];
        const own = s.type || s.properties ? this.value({ ...s, oneOf: undefined, anyOf: undefined }, view, depth + 1, seen) : undefined;
        const v = this.value(pick as JsonSchema, view, depth + 1, seen);
        return isRecord(own) && isRecord(v) ? { ...own, ...v } : v;
      }
    }
    const types = Array.isArray(s.type) ? s.type.filter((t) => t !== "null") : s.type ? [s.type] : isRecord(s.properties) ? ["object"] : s.items !== undefined ? ["array"] : [];
    switch (types[0]) {
      case "string":
        return this.string(s);
      case "integer":
      case "number":
        return this.number(s, types[0] === "integer");
      case "boolean":
        return true;
      case "null":
        return null;
      case "array": {
        const n = Math.max(1, typeof s.minItems === "number" ? Math.min(s.minItems, 5) : 1);
        const item = this.value(s.items as JsonSchema | undefined, view, depth + 1, seen);
        if (s.uniqueItems === true) return [item];
        return Array.from({ length: typeof s.maxItems === "number" ? Math.min(n, s.maxItems) : n }, () => item);
      }
      case "object": {
        const out: Record<string, unknown> = {};
        const props = isRecord(s.properties) ? s.properties : {};
        const required = new Set(Array.isArray(s.required) ? s.required : []);
        for (const [name, sub] of Object.entries(props)) {
          const p = isRecord(sub) ? sub : {};
          if (view === "request" && p.readOnly === true) continue;
          if (view === "response" && p.writeOnly === true) continue;
          /* what is not required goes in only when the contract gives an example of it */
          const own = isRecord(sub) && (Array.isArray(p.examples) || "example" in p || "default" in p);
          if (!required.has(name) && !own) continue;
          Object.defineProperty(out, name, { value: this.value(sub as JsonSchema, view, depth + 1, seen), enumerable: true, writable: true, configurable: true });
        }
        return out;
      }
      default:
        return types.length ? null : {};
    }
  }

  private string(s: Exclude<JsonSchema, boolean>): string {
    const format = typeof s.format === "string" ? s.format : "";
    let v = STRINGS[format] ?? "example";
    const min = typeof s.minLength === "number" ? s.minLength : 0;
    const max = typeof s.maxLength === "number" ? s.maxLength : Infinity;
    if (!STRINGS[format]) {
      while (v.length < min) v += "x";
      if (v.length > max) v = v.slice(0, Math.max(max, 0));
    }
    return v;
  }

  private number(s: Exclude<JsonSchema, boolean>, integer: boolean): number {
    const low = typeof s.minimum === "number" ? s.minimum : typeof s.exclusiveMinimum === "number" ? s.exclusiveMinimum + (integer ? 1 : 0.5) : undefined;
    const high = typeof s.maximum === "number" ? s.maximum : typeof s.exclusiveMaximum === "number" ? s.exclusiveMaximum - (integer ? 1 : 0.5) : undefined;
    let v = low ?? (high !== undefined ? Math.min(1, high) : 1);
    if (high !== undefined && v > high) v = high;
    if (integer) v = Math.ceil(v);
    if (typeof s.multipleOf === "number" && s.multipleOf > 0) v = Math.ceil(v / s.multipleOf) * s.multipleOf;
    return v;
  }
}

/** a file the contract tests upload for a field that takes one of these types */
export function exampleFile(field: string, accept: string[] | undefined): ExampleFile {
  const type = (accept ?? []).find((t) => !t.includes("*")) ?? (accept?.some((t) => t.startsWith("image/")) ? "image/png" : "application/octet-stream");
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : type === "application/pdf" ? "pdf" : type.startsWith("text/") ? "txt" : "bin";
  return { name: `${field.replace(/[^A-Za-z0-9_-]/g, "") || "file"}.${ext}`, type };
}
