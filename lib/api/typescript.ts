/* The models as TypeScript types, for the generated client, the mocks and the server alike. A model that refers to
 * another (or to itself) names its type, so a recursive model is a recursive type and nothing is ever inlined twice. */

import { isRecord } from "./schema";
import { refModel, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "./types";

export type TsOptions = {
  /** the type a `format: binary` string (a file) is written as; "Blob" by default (web and React Native both have it) */
  binary?: string;
  /** how deep inline schemas are written before they become `unknown` */
  maxDepth?: number;
};

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** a model's name as a type name: models are identifiers already; a stray one is made one */
export const tsTypeName = (name: string) => (IDENT.test(name) ? name : name.replace(/[^A-Za-z0-9_$]/g, "_").replace(/^(\d)/, "_$1") || "Model");

const prop = (name: string) => (IDENT.test(name) ? name : JSON.stringify(name));

/** a comment's words, safe inside /** … *\/ */
const commentText = (s: string) => s.replace(/\*\//g, "*\\/").replace(/\r?\n/g, " ").trim();

function docComment(s: JsonSchemaObject, indent: string): string {
  const parts = [typeof s.description === "string" ? commentText(s.description) : "", typeof s.format === "string" ? `@format ${commentText(s.format)}` : "", s.deprecated === true ? "@deprecated" : ""].filter(Boolean);
  return parts.length ? `${indent}/** ${parts.join(" ")} */\n` : "";
}

const literal = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : typeof v === "number" || typeof v === "boolean" || v === null ? String(v) : "unknown");

/** One schema as a TypeScript type expression. References to models are their type names; an object's properties are
 *  written out, the required ones without `?`. */
export function schemaTypeTs(schema: JsonSchema | undefined, o: TsOptions = {}, indent = "", depth = 0): string {
  if (schema === undefined || schema === true) return "unknown";
  if (schema === false) return "never";
  if (depth > (o.maxDepth ?? 24)) return "unknown";
  const s = schema;
  const sub = (x: unknown) => schemaTypeTs(x as JsonSchema, o, indent, depth + 1);
  if (typeof s.$ref === "string") {
    const m = refModel(s.$ref);
    return m ? tsTypeName(m) : "unknown";
  }
  if (Array.isArray(s.enum)) return s.enum.map(literal).join(" | ") || "never";
  if (s.const !== undefined) return literal(s.const);
  if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) {
    const list = ((s.oneOf ?? s.anyOf) as JsonSchema[]).map(sub);
    const own = s.type || s.properties ? [schemaTypeTs({ ...s, oneOf: undefined, anyOf: undefined }, o, indent, depth + 1)] : [];
    const union = [...new Set(list)].map((x) => (x.includes("&") ? `(${x})` : x)).join(" | ");
    return own.length ? `(${own[0]}) & (${union})` : union;
  }
  if (Array.isArray(s.allOf)) {
    const list = (s.allOf as JsonSchema[]).map(sub);
    const own = s.type || s.properties ? [schemaTypeTs({ ...s, allOf: undefined }, o, indent, depth + 1)] : [];
    return [...own, ...list].map((x) => (x.includes("|") ? `(${x})` : x)).join(" & ");
  }
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : isRecord(s.properties) ? ["object"] : s.items !== undefined ? ["array"] : [];
  if (!types.length) return "unknown";
  const one = (t: string): string => {
    switch (t) {
      case "string":
        return s.format === "binary" || s.contentMediaType === "application/octet-stream" ? (o.binary ?? "Blob") : "string";
      case "integer":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      case "array": {
        const inner = sub(s.items);
        return /[|&\s]/.test(inner) && !inner.startsWith("{") ? `(${inner})[]` : `${inner}[]`;
      }
      case "object": {
        const props = isRecord(s.properties) ? s.properties : {};
        const required = new Set(Array.isArray(s.required) ? s.required : []);
        const inner = indent + "  ";
        const lines = Object.entries(props).map(([k, v]) => `${isRecord(v) ? docComment(v as JsonSchemaObject, inner) : ""}${inner}${prop(k)}${required.has(k) ? "" : "?"}: ${schemaTypeTs(v as JsonSchema, o, inner, depth + 1)};`);
        const extra = s.additionalProperties;
        if (extra !== undefined && extra !== false) lines.push(`${inner}[key: string]: ${extra === true ? "unknown" : Object.keys(props).length ? "unknown" : sub(extra)};`);
        if (!lines.length) return extra === false ? "Record<string, never>" : "Record<string, unknown>";
        return `{\n${lines.join("\n")}\n${indent}}`;
      }
      default:
        return "unknown";
    }
  };
  return types.map(one).join(" | ");
}

/** Every model of the API as an exported TypeScript type, in the models' order, with each one's description as its
 *  doc comment: `export type User = { id: string; email: string; name?: string | null };`. A document without models
 *  gives an empty module. */
export function schemaToTs(api: ApiSpec | undefined, o: TsOptions = {}): string {
  const lines = ["/* The data models of the API, from its JSON Schemas (generated: do not edit). */", ""];
  for (const m of api?.models ?? []) {
    const s = m.schema;
    if (isRecord(s)) lines.push(docComment(s as JsonSchemaObject, "").trimEnd());
    lines.push(`export type ${tsTypeName(m.name)} = ${schemaTypeTs(s, o)};`, "");
  }
  if (!api?.models?.length) lines.push("export {};", "");
  return lines.filter((l, i) => l !== "" || lines[i - 1] !== "").join("\n");
}
