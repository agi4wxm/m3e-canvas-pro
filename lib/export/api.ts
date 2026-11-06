/* The API contract as the product export reads it: an OpenAPI 3.1 document (and an AsyncAPI 3.0 one for realtime),
 * the TypeScript declarations of its schemas, and the operations the client, the mocks and the server are generated
 * from. Until a document carries its own contract (Doc.api, lib/api) the product gets an empty one; the API model's
 * `toOpenApi` and `schemaToTs` feed `apiModelOf` once it does.
 *
 * Whatever the contract says is data: names become identifiers through `identifierOf`, paths and keys are printed as
 * escaped strings, and nothing of it is ever written into a comment. */

import { identifierOf } from "./paths";

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
const METHODS: HttpMethod[] = ["GET", "PUT", "POST", "DELETE", "PATCH", "HEAD", "OPTIONS"];

export type ApiOperation = {
  /** the operation's name in code: a camelCase identifier, unique in the contract */
  name: string;
  /** the contract's own operationId, or the name when it has none */
  operationId: string;
  method: HttpMethod;
  /** the path as the contract writes it, `/products/{id}` */
  path: string;
  /** the path's parameters, in order */
  params: string[];
  /** it takes query parameters */
  query: boolean;
  /** it takes a JSON body */
  body: boolean;
  /** the TypeScript type of its body and of its successful response: a name the types declare, or `unknown` */
  bodyType: string;
  responseType: string;
  /** the status its successful response has, as the contract says (200 when it does not) */
  status: number;
  /** an example of the successful response, when the contract gives one */
  example?: unknown;
};

export type ApiModel = {
  /** the OpenAPI 3.1 document */
  openapi: Record<string, unknown>;
  /** the AsyncAPI 3.0 document, when the product has realtime channels */
  asyncapi: Record<string, unknown> | null;
  /** TypeScript declarations of the contract's schemas (`export type X = …`), checked to be no more than that */
  types: string;
  operations: ApiOperation[];
};

/** the contract of a product that has none yet */
export const emptyOpenApi = (title: string): Record<string, unknown> => ({ openapi: "3.1.0", info: { title, version: "0.1.0" }, paths: {} });

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** the type names `types` declares at its top level */
export function declaredTypes(types: string): Set<string> {
  return new Set([...types.matchAll(/^export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
}

/** the TypeScript type of a schema: a declared name for a `$ref` to one, else unknown */
function typeOfSchema(schema: unknown, names: Set<string>): string {
  const ref = record(schema).$ref;
  const m = typeof ref === "string" ? /^#\/components\/schemas\/([A-Za-z_$][\w$]*)$/.exec(ref) : null;
  return m && names.has(m[1]) ? m[1] : "unknown";
}

function jsonContent(holder: unknown): Record<string, unknown> | null {
  const content = record(record(holder).content);
  const json = content["application/json"] ?? Object.entries(content).find(([type]) => /\+json$|^application\/json/.test(type))?.[1];
  return json ? record(json) : null;
}

/** the path's parameters: `/a/{id}/b/{slug}` → id, slug */
export const pathParams = (path: string) => [...path.matchAll(/\{([^{}/]+)\}/g)].map((m) => m[1]);

/** Every operation of an OpenAPI document, in the order of its paths, with what code needs to know of it. A path that
 *  does not start with `/` or holds what a URL path may not is left out, and so is a method JSON says nothing of. */
export function operationsOf(openapi: Record<string, unknown>, types = ""): ApiOperation[] {
  const names = declaredTypes(types);
  const taken = new Set<string>();
  const out: ApiOperation[] = [];
  for (const [path, item] of Object.entries(record(openapi.paths))) {
    // eslint-disable-next-line no-control-regex -- a path with control characters is no path
    if (!path.startsWith("/") || /[\u0000-\u001f\u007f\s#?\\]/.test(path)) continue;
    for (const method of METHODS) {
      const op = record(record(item)[method.toLowerCase()]);
      if (!Object.keys(op).length) continue;
      const given = typeof op.operationId === "string" ? op.operationId : "";
      /* short enough that the stub written for it stays one line of Prettier's */
      const base = identifierOf(given || `${method.toLowerCase()} ${path.replace(/[{}]/g, " ")}`, `${method.toLowerCase()}Operation`).slice(0, 30);
      /* one file per operation on the server: two names may not differ only in case */
      let name = base;
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}${i}`;
      taken.add(name.toLowerCase());
      const params = Array.isArray(op.parameters) ? op.parameters.map(record) : [];
      const responses = record(op.responses);
      const ok = Object.keys(responses).find((code) => /^2\d\d$/.test(code)) ?? (responses["2XX"] ? "2XX" : responses.default ? "default" : undefined);
      const success = ok ? jsonContent(responses[ok]) : null;
      const requestBody = jsonContent(op.requestBody);
      out.push({
        name,
        operationId: given || name,
        method,
        path,
        params: pathParams(path),
        query: params.some((p) => p.in === "query"),
        body: !!requestBody,
        bodyType: requestBody ? typeOfSchema(requestBody.schema, names) : "never",
        responseType: success ? typeOfSchema(success.schema, names) : ok && ok !== "204" ? "unknown" : "void",
        status: ok && /^\d{3}$/.test(ok) ? Number(ok) : 200,
        ...(success && "example" in success ? { example: success.example } : {}),
      });
    }
  }
  return out;
}

/** Declarations of types are kept only when they are nothing else: a line that is not part of an `export type` /
 *  `export interface` block, a comment or blank is a reason to drop them all (and type everything `unknown`). */
export function safeTypes(types: string): string {
  if (!types.trim()) return "";
  const bad = types.split("\n").some((line) => /^\s*(import|require|eval|new |function|class|const|let|var|declare global)\b/.test(line) || /\bimport\s*\(/.test(line));
  return bad ? "" : types;
}

/** The model a product is generated from: the given contract, or an empty one. */
export function apiModelOf(title: string, given?: { openapi?: Record<string, unknown>; asyncapi?: Record<string, unknown> | null; types?: string }): ApiModel {
  const openapi = given?.openapi ?? emptyOpenApi(title);
  const types = safeTypes(given?.types ?? "");
  return { openapi, asyncapi: given?.asyncapi ?? null, types, operations: operationsOf(openapi, types) };
}

export { METHODS as HTTP_METHODS };
