/* Example values from the contract's schemas, for the requests the contract tests send and the server's own checks.
 * Made by the mock library's generator (lib/mocks/generate.ts, docs/模拟库.md), so the product has one generator: here
 * with the contract's own examples first wherever it gives them (examples, example, default), only what is required
 * (and what has an example), lists as short as they may be, no nulls, in English, and around a fixed moment, so the
 * same contract always gives the same files. */

import { isRecord } from "../../api/schema";
import { refModel, type ApiSpec, type JsonSchema } from "../../api/types";
import { generateValue } from "../../mocks/generate";
import { hash53 } from "../../mocks/rng";

/** a file field of a form: what the contract tests upload for it */
export type ExampleFile = { name: string; type: string };

/** the moment dates are made around: fixed, so an export is the same every day */
const EXAMPLE_NOW = Date.UTC(2026, 0, 1, 9);

export class Examples {
  private readonly spec: ApiSpec;
  private readonly models: Map<string, JsonSchema>;

  constructor(spec: ApiSpec) {
    this.spec = spec;
    this.models = new Map((spec.models ?? []).map((m) => [m.name, m.schema]));
  }

  /** the value of a schema: the contract's own example, else one the mock library makes from the schema */
  of(schema: JsonSchema | undefined, view: "request" | "response" = "request"): unknown {
    if (schema === undefined || schema === true) return {};
    if (schema === false) return null;
    const key = `example:${hash53(JSON.stringify(schema).slice(0, 50_000))}`;
    return generateValue(schema, { api: this.spec, locale: "en", now: EXAMPLE_NOW, direction: view, preferExamples: true, minimal: true, budget: 2000, files: [] }, { key, name: "" });
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
}

/** a file the contract tests upload for a field that takes one of these types */
export function exampleFile(field: string, accept: string[] | undefined): ExampleFile {
  const type = (accept ?? []).find((t) => !t.includes("*")) ?? (accept?.some((t) => t.startsWith("image/")) ? "image/png" : "application/octet-stream");
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : type === "application/pdf" ? "pdf" : type.startsWith("text/") ? "txt" : "bin";
  return { name: `${field.replace(/[^A-Za-z0-9_-]/g, "") || "file"}.${ext}`, type };
}
