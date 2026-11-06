/* The API section as an OpenAPI 3.1 document, and back. Writing is a pure function of the document: the same document
 * always gives the same text. Reading takes OpenAPI 3.1 (and 3.0, converted: `nullable`, boolean exclusive bounds),
 * YAML or JSON, and says what it did: what it converted, what it kept verbatim (webhooks, reusable responses and
 * parameters, x- fields), what it could not take. A document written here and read back is the same API section. */

import { API_LIMITS, cleanApi, cleanPagination, cleanSecurity, compact, freeName, MODEL_NAME, modelNameFor, OPERATION_ID } from "./clean";
import { define, eachSubschema, isRecord, mapRefs, operationIdFor } from "./schema";
import { HTTP_METHODS, MODEL_REF, decodePointer, encodePointer, modelRef, type ApiAuth, type ApiEndpoint, type ApiModel, type ApiServer, type ApiSpec, type HttpMethod, type JsonSchema } from "./types";
import { apiProblems } from "./validate";
import { parseSpecText, toYaml } from "./yaml";

export const OPENAPI_VERSION = "3.1.0";

/** what a document gives the spec writers: its API section, and the title an API without one is called by */
export type SpecSource = { api?: ApiSpec; title?: string };

/* ---------- writing ---------- */

const AUTH_FIELDS = ["login", "refresh", "logout", "tokenField", "refreshTokenField"] as const;
/** the order OpenAPI lists the reusable components in */
const COMPONENT_ORDER = ["schemas", "responses", "parameters", "examples", "requestBodies", "headers", "securitySchemes", "links", "callbacks", "pathItems"];

/** an object with some keys first, in that order, and the rest after in their own */
function ordered(o: Record<string, unknown>, first: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of first) if (o[k] !== undefined) define(out, k, o[k]);
  for (const [k, v] of Object.entries(o)) if (!(k in out) && v !== undefined) define(out, k, v);
  return out;
}

/** one endpoint as an OpenAPI Operation object */
export function operationObject(e: ApiEndpoint): Record<string, unknown> {
  return compact({
    tags: e.tags,
    summary: e.summary,
    description: e.description,
    operationId: e.operationId,
    parameters: e.parameters,
    requestBody: e.requestBody,
    responses: e.responses,
    security: e.security,
    deprecated: e.deprecated,
    "x-m3e-pagination": e.pagination,
    ...e.extra,
  });
}

/** an environment as an OpenAPI Server object */
const serverObject = (s: ApiServer) => compact({ url: s.url, description: s.description, "x-m3e-env": s.env, "x-m3e-realtime": s.realtime, ...s.extra });

/** The API section as an OpenAPI 3.1 document (plain data): openapi, info, servers, security, tags, paths (each path
 *  in the order its first endpoint comes, its methods in the order of the endpoints), webhooks, components (the
 *  models as schemas, the security schemes, and the reusable objects an import kept), then the rest it kept. */
export function openApiObject(doc: SpecSource): Record<string, unknown> {
  const api = doc.api ?? {};
  const extra = { ...api.extra?.openapi };
  const { components: extraComponents, paths: extraPaths, webhooks, ...rest } = extra as Record<string, unknown> & { components?: Record<string, unknown>; paths?: Record<string, Record<string, unknown>> };
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of api.endpoints ?? []) {
    if (!paths[e.path]) define(paths, e.path, { ...(isRecord(extraPaths?.[e.path]) ? extraPaths![e.path] : {}) });
    define(paths[e.path], e.method, operationObject(e));
  }
  /* a path item an import kept with no endpoint of its own stays (its summary, its servers) */
  for (const [p, item] of Object.entries(isRecord(extraPaths) ? extraPaths : {})) if (!paths[p] && isRecord(item)) define(paths, p, { ...item });
  const schemas: Record<string, unknown> = {};
  for (const m of api.models ?? []) define(schemas, m.name, m.schema);
  const components = ordered(
    compact({
      ...(isRecord(extraComponents) ? extraComponents : {}),
      schemas: Object.keys(schemas).length ? schemas : undefined,
      securitySchemes: api.auth && Object.keys(api.auth.schemes).length ? api.auth.schemes : undefined,
    }),
    COMPONENT_ORDER,
  );
  const auth = api.auth ? compact(Object.fromEntries(AUTH_FIELDS.map((k) => [k, api.auth![k]]))) : {};
  const info = compact({ title: api.info?.title || doc.title || "API", version: api.info?.version || "1.0.0", description: api.info?.description, ...api.info?.extra });
  return compact({
    openapi: OPENAPI_VERSION,
    info: ordered(info, ["title", "summary", "description", "termsOfService", "contact", "license", "version"]),
    jsonSchemaDialect: rest.jsonSchemaDialect,
    servers: api.servers?.length ? api.servers.map(serverObject) : undefined,
    security: api.auth?.security?.length ? api.auth.security : undefined,
    tags: api.tags?.length ? api.tags.map((t) => compact({ name: t.name, description: t.description, ...t.extra })) : undefined,
    paths,
    webhooks,
    components: Object.keys(components).length ? components : undefined,
    "x-m3e-auth": Object.keys(auth).length ? auth : undefined,
    ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "jsonSchemaDialect")),
  });
}

/** The API section as OpenAPI 3.1 YAML: openapi.yaml. The same document always gives the same text. */
export function toOpenApi(doc: SpecSource): string {
  return toYaml(openApiObject(doc));
}

/* ---------- reading ---------- */

/** what an import did, for the author and the model */
export type ImportReport = {
  format: "openapi" | "asyncapi";
  /** the version the file said it was */
  version: string;
  models: number;
  endpoints: number;
  channels: number;
  /** what was changed to fit: 3.0 converted, names made into identifiers, operationIds made up */
  converted: string[];
  /** what the model has no place for and is kept verbatim, written back on export */
  kept: string[];
  /** what was left out, and why */
  dropped: string[];
  /** problems of the API as it came in (lib/api/validate.ts), errors first */
  problems: string[];
};

/** a file that cannot be read as the spec it claims to be */
export class ApiImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiImportError";
  }
}

/** a spec's text, or what it parses to */
export function specValue(input: unknown): Record<string, unknown> {
  let v = input;
  if (typeof input === "string") {
    try {
      v = parseSpecText(input);
    } catch (e) {
      throw new ApiImportError(`The text is not YAML or JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!isRecord(v)) throw new ApiImportError("The text is not a spec: it should be a mapping with openapi (or asyncapi), info and paths (or channels).");
  return v;
}

/** OpenAPI 3.0's schema keywords in 3.1's terms: `nullable` as a "null" type, boolean exclusive bounds as numbers */
export function from30(schema: unknown): unknown {
  if (!isRecord(schema)) return schema;
  const visit = (s: Record<string, unknown>) => {
    if (s.nullable === true) {
      if (typeof s.type === "string") s.type = [s.type, "null"];
      else if (Array.isArray(s.type) && !s.type.includes("null")) s.type = [...s.type, "null"];
      else if (typeof s.$ref === "string") {
        const ref = s.$ref;
        delete s.$ref;
        s.anyOf = [{ $ref: ref }, { type: "null" }];
      }
    }
    delete s.nullable;
    for (const [flag, bound] of [
      ["exclusiveMinimum", "minimum"],
      ["exclusiveMaximum", "maximum"],
    ] as const) {
      if (s[flag] === true && typeof s[bound] === "number") {
        s[flag] = s[bound];
        delete s[bound];
      } else if (s[flag] === false) delete s[flag];
    }
  };
  const copy = structuredClone(schema);
  eachSubschema(copy as JsonSchema, (s) => visit(s as Record<string, unknown>));
  return copy;
}

/** every schema inside an OpenAPI value (operations, components) passed through `fn` */
function mapSchemasDeep(v: unknown, fn: (s: unknown) => unknown, depth = 0): unknown {
  if (depth > 60 || !v || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => mapSchemasDeep(x, fn, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) define(out, k, k === "schema" ? fn(x) : mapSchemasDeep(x, fn, depth + 1));
  return out;
}

/** a server's environment, from what the file says of it */
function envOf(s: Record<string, unknown>, i: number): string {
  if (typeof s["x-m3e-env"] === "string") return s["x-m3e-env"];
  const words = `${s.description ?? ""} ${s.url ?? ""}`.toLowerCase();
  if (/\bprod(?:uction)?\b/.test(words)) return "prod";
  if (/\bstag(?:e|ing)\b/.test(words)) return "staging";
  if (/\b(?:dev(?:elopment)?|local(?:host)?|127\.0\.0\.1)\b/.test(words)) return "dev";
  if (/\btest(?:ing)?\b/.test(words)) return "test";
  return `server${i + 1}`;
}

/** the fields of an object other than those named: what an import keeps verbatim */
const others = (o: Record<string, unknown>, known: string[]) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!known.includes(k)) define(out, k, v);
  return Object.keys(out).length ? out : undefined;
};

/** Reads an OpenAPI 3.1 (or 3.0) document, as YAML or JSON text or as parsed data, into an API section: the models
 *  from components.schemas, the endpoints from paths, the security schemes and requirements, the servers and tags,
 *  and the x-m3e-* fields of our own. Throws ApiImportError for what is no OpenAPI 3 document (Swagger 2.0 included). */
export function fromOpenApi(input: unknown): { api: ApiSpec; report: ImportReport } {
  const doc = specValue(input);
  const version = typeof doc.openapi === "string" ? doc.openapi : typeof doc.openapi === "number" ? String(doc.openapi) : "";
  if (doc.swagger !== undefined) throw new ApiImportError("Swagger 2.0 is not supported: convert it to OpenAPI 3 first (for example with swagger2openapi), then import that.");
  if (!/^3\.[01](?:\.\d+)?$/.test(version)) throw new ApiImportError(doc.asyncapi !== undefined ? "This is an AsyncAPI document: import it as AsyncAPI." : `This is not an OpenAPI 3.0 or 3.1 document (openapi: ${JSON.stringify(doc.openapi ?? null)}).`);
  const v30 = version.startsWith("3.0");
  const report: ImportReport = { format: "openapi", version, models: 0, endpoints: 0, channels: 0, converted: [], kept: [], dropped: [] , problems: [] };
  if (v30) report.converted.push("OpenAPI 3.0 read as 3.1: nullable became a \"null\" type, boolean exclusiveMinimum/Maximum became the bound itself");
  const schema = (s: unknown) => (v30 ? from30(s) : s);
  const components = isRecord(doc.components) ? doc.components : {};

  /* models: a name that is no identifier is made one, and every reference to it follows */
  const renamed = new Map<string, string>();
  const taken = new Set<string>();
  const models: ApiModel[] = [];
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  for (const [name, s] of Object.entries(schemas)) {
    if (models.length >= API_LIMITS.models) {
      report.dropped.push(`models past the first ${API_LIMITS.models}`);
      break;
    }
    const n = freeName(MODEL_NAME.test(name) ? name : modelNameFor(name), taken);
    taken.add(n);
    if (n !== name) {
      renamed.set(name, n);
      report.converted.push(`model ${JSON.stringify(name)} is called ${n} (a model's name is an identifier)`);
    }
    models.push({ name: n, schema: schema(s) as JsonSchema });
  }
  const fixRefs = <T>(v: T): T =>
    renamed.size
      ? mapRefs(v, (ref) => {
          if (!ref.startsWith(MODEL_REF)) return ref;
          const [head, ...tail] = ref.slice(MODEL_REF.length).split("/");
          const to = renamed.get(decodePointer(head));
          return to ? [modelRef(to), ...tail].join("/") : ref;
        })
      : v;

  /* endpoints, path by path; a path's own parameters go onto each of its operations */
  const endpoints: ApiEndpoint[] = [];
  const ids = new Set<string>();
  const extraPaths: Record<string, Record<string, unknown>> = {};
  const paths = isRecord(doc.paths) ? doc.paths : {};
  for (const [path, rawItem] of Object.entries(paths)) {
    if (!isRecord(rawItem)) continue;
    if (!path.startsWith("/")) {
      report.dropped.push(`the path ${JSON.stringify(path)} (paths start with /)`);
      continue;
    }
    if (typeof rawItem.$ref === "string") {
      report.dropped.push(`the path ${path}: a path item that is a $ref (${rawItem.$ref}) is not supported; write it out`);
      continue;
    }
    const shared = Array.isArray(rawItem.parameters) ? rawItem.parameters : [];
    const own = others(rawItem, [...HTTP_METHODS, "parameters"]);
    if (own) {
      define(extraPaths, path, own);
      report.kept.push(`the path item fields of ${path} (${Object.keys(own).join(", ")})`);
    }
    if (shared.length) report.converted.push(`the parameters of the path ${path} are listed on each of its operations`);
    for (const method of HTTP_METHODS) {
      const op = rawItem[method];
      if (!isRecord(op)) continue;
      if (endpoints.length >= API_LIMITS.endpoints) {
        report.dropped.push(`endpoints past the first ${API_LIMITS.endpoints}`);
        break;
      }
      let id = typeof op.operationId === "string" && OPERATION_ID.test(op.operationId) ? op.operationId : "";
      if (!id) {
        id = operationIdFor(method, path);
        report.converted.push(`${method.toUpperCase()} ${path} had ${op.operationId === undefined ? "no operationId" : `the operationId ${JSON.stringify(op.operationId)}, which is no name`}: it is ${id}`);
      }
      if (ids.has(id)) {
        const was = id;
        id = freeName(id, ids);
        report.converted.push(`a second operationId ${JSON.stringify(was)} (${method.toUpperCase()} ${path}) is ${id}`);
      }
      ids.add(id);
      const opParams = Array.isArray(op.parameters) ? op.parameters : [];
      const key = (p: unknown) => (isRecord(p) ? (typeof p.$ref === "string" ? `ref:${p.$ref}` : `${p.in}:${p.name}`) : "");
      const ownKeys = new Set(opParams.map(key));
      const params = [...shared.filter((p) => !ownKeys.has(key(p))), ...opParams];
      const responses: Record<string, unknown> = {};
      if (isRecord(op.responses)) for (const [code, r] of Object.entries(op.responses)) define(responses, String(code), r);
      const e: ApiEndpoint = compact({
        operationId: id,
        method: method as HttpMethod,
        path,
        summary: typeof op.summary === "string" ? op.summary : undefined,
        description: typeof op.description === "string" ? op.description : undefined,
        tags: Array.isArray(op.tags) ? op.tags.filter((t): t is string => typeof t === "string") : undefined,
        deprecated: op.deprecated === true ? true : undefined,
        parameters: params.length ? (mapSchemasDeep(params, schema) as ApiEndpoint["parameters"]) : undefined,
        requestBody: isRecord(op.requestBody) ? (mapSchemasDeep(op.requestBody, schema) as ApiEndpoint["requestBody"]) : undefined,
        responses: mapSchemasDeep(responses, schema) as ApiEndpoint["responses"],
        security: cleanSecurity(op.security),
        pagination: cleanPagination(op["x-m3e-pagination"]),
        extra: others(op, ["tags", "summary", "description", "operationId", "parameters", "requestBody", "responses", "security", "deprecated", "x-m3e-pagination"]),
      });
      if (op["x-m3e-pagination"] !== undefined && !e.pagination) report.dropped.push(`the x-m3e-pagination of ${id} (it should be {style: cursor | offset, items})`);
      if (e.extra) report.kept.push(`${Object.keys(e.extra).join(", ")} of ${id}`);
      endpoints.push(fixRefs(e));
    }
  }

  /* security */
  const schemes = isRecord(components.securitySchemes) ? components.securitySchemes : {};
  const authExt = isRecord(doc["x-m3e-auth"]) ? doc["x-m3e-auth"] : {};
  const auth: ApiAuth | undefined =
    Object.keys(schemes).length || Array.isArray(doc.security) || Object.keys(authExt).length
      ? compact({
          schemes: schemes as ApiAuth["schemes"],
          security: cleanSecurity(doc.security),
          ...Object.fromEntries(AUTH_FIELDS.map((k) => [k, typeof authExt[k] === "string" ? authExt[k] : undefined])),
        })
      : undefined;

  const servers = (Array.isArray(doc.servers) ? doc.servers : []).filter(isRecord).map((s, i): ApiServer =>
    compact({ env: envOf(s, i), url: typeof s.url === "string" ? s.url : "/", description: typeof s.description === "string" ? s.description : undefined, realtime: typeof s["x-m3e-realtime"] === "string" ? s["x-m3e-realtime"] : undefined, extra: others(s, ["url", "description", "x-m3e-env", "x-m3e-realtime"]) }),
  );
  const envs = new Set<string>();
  for (const s of servers) {
    s.env = freeName(s.env, envs);
    envs.add(s.env);
  }

  const info = isRecord(doc.info) ? doc.info : {};
  const extraComponents = others(components, ["schemas", "securitySchemes"]);
  if (extraComponents) report.kept.push(`the reusable ${Object.keys(extraComponents).join(", ")} of components (endpoints may refer to them)`);
  /* in the order the writer puts them back, so a file read, written and read again is the same */
  const rawTop = others(doc, ["openapi", "info", "servers", "paths", "components", "security", "tags", "x-m3e-auth"]);
  const top = rawTop ? ordered(rawTop, ["jsonSchemaDialect", "webhooks"]) : undefined;
  if (top) report.kept.push(Object.keys(top).join(", "));
  const openapiExtra = compact({
    ...top,
    components: extraComponents ? fixRefs(v30 ? (mapSchemasDeep(extraComponents, schema) as Record<string, unknown>) : extraComponents) : undefined,
    paths: Object.keys(extraPaths).length ? extraPaths : undefined,
  });
  const raw: ApiSpec = compact({
    info: compact({
      title: typeof info.title === "string" ? info.title : undefined,
      version: info.version !== undefined ? String(info.version) : undefined,
      description: typeof info.description === "string" ? info.description : undefined,
      extra: others(info, ["title", "version", "description"]),
    }),
    servers: servers.length ? servers : undefined,
    models: models.length ? models.map((m) => fixRefs(m)) : undefined,
    endpoints: endpoints.length ? endpoints : undefined,
    tags: Array.isArray(doc.tags) ? doc.tags.filter(isRecord).map((t) => compact({ name: String(t.name ?? ""), description: typeof t.description === "string" ? t.description : undefined, extra: others(t, ["name", "description"]) })) : undefined,
    auth,
    extra: Object.keys(openapiExtra).length ? { openapi: openapiExtra } : undefined,
  });
  const api = cleanApi(raw) ?? {};
  report.models = api.models?.length ?? 0;
  report.endpoints = api.endpoints?.length ?? 0;
  if ((raw.endpoints?.length ?? 0) > report.endpoints) report.dropped.push(`${(raw.endpoints?.length ?? 0) - report.endpoints} endpoints that are not usable (a method and a path)`);
  report.problems = apiProblems(api).map((p) => `${p.level}: ${p.at}: ${p.message}`);
  return { api, report };
}

/** the reference to a model, for those writing specs by hand */
export { encodePointer };
