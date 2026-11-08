/* The API section as it comes in from outside (a file, a shared link, an MCP client): every container checked for its
 * shape, every standard object copied as plain JSON within a budget, so a hostile document cannot hang the tab or reach
 * a prototype. What is not usable goes (an endpoint with no path, a model with no name); what is merely wrong stays and
 * is reported by `apiProblems` (lib/api/validate.ts), so an author can still open and fix it. Keys keep their order:
 * the order of a schema's properties, of the paths, of the responses is the author's. */

import { define, identifier, isRecord, operationIdFor } from "./schema";
import { fields, withUnknown } from "../keep";
import { HTTP_METHODS, type ApiAuth, type ApiChannel, type ApiChannelOperation, type ApiEndpoint, type ApiInfo, type ApiMessage, type ApiModel, type ApiPagination, type ApiServer, type ApiSpec, type ApiTag, type HttpMethod, type JsonSchema, type SecurityRequirement } from "./types";

/** how much an API section may hold; far past any real product, small enough that every walk of it is quick */
export const API_LIMITS = {
  models: 1000,
  endpoints: 2000,
  channels: 500,
  servers: 20,
  tags: 500,
  schemes: 50,
  /** per endpoint */
  parameters: 100,
  responses: 60,
  /** per channel */
  messages: 200,
  operations: 200,
  /** JSON values in the whole section */
  nodes: 400_000,
  /** how deep a JSON value inside it may nest */
  depth: 64,
  /** the longest string kept whole */
  string: 200_000,
};

/** a model's name: what the TypeScript type is called */
export const MODEL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/** an id of a channel, a channel operation, a server environment */
export const API_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
/** an operationId as files write them: identifiers, and the dotted or dashed names some tools use */
export const OPERATION_ID = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;

export type Budget = { nodes: number };

/** A JSON value copied within the budget: plain objects, arrays, strings (cut at API_LIMITS.string), finite numbers,
 *  booleans and null, keys in their order, nothing past API_LIMITS.depth. Undefined when nothing is left of it. */
export function cleanJson(v: unknown, budget: Budget, depth = 0): unknown {
  if (budget.nodes <= 0 || depth > API_LIMITS.depth) return undefined;
  budget.nodes--;
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return v.length > API_LIMITS.string ? v.slice(0, API_LIMITS.string) : v;
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const x of v) {
      if (budget.nodes <= 0) break;
      const c = cleanJson(x, budget, depth + 1);
      if (c !== undefined) out.push(c);
    }
    return out;
  }
  if (isRecord(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (budget.nodes <= 0) break;
      const c = cleanJson(x, budget, depth + 1);
      if (c !== undefined) define(out, k, c);
    }
    return out;
  }
  return undefined;
}

/* What each object of the section has. A field it holds that this version does not know is kept as it came, copied
   within the budget like everything else (lib/keep.ts), after the fields it knows. */
const API = fields("info", "servers", "models", "endpoints", "tags", "auth", "channels", "extra");
const INFO = fields("title", "version", "description", "extra");
const SERVER = fields("env", "url", "description", "realtime", "extra");
const MODEL = fields("name", "schema");
const ENDPOINT = fields("operationId", "method", "path", "summary", "description", "tags", "deprecated", "parameters", "requestBody", "responses", "security", "pagination", "extra");
const PAGINATION = fields("style", "items", "cursorParam", "nextField", "limitParam", "offsetParam", "totalField");
const TAG = fields("name", "description", "extra");
const AUTH = fields("schemes", "security", "login", "refresh", "logout", "tokenField", "refreshTokenField");
const EXTRA = fields("openapi", "asyncapi");
const MESSAGE = fields("name", "title", "summary", "description", "contentType", "payload", "headers", "examples", "extra");
const OPERATION = fields("id", "action", "messages", "summary", "description", "extra");
const CHANNEL = fields("id", "address", "title", "summary", "description", "transport", "parameters", "messages", "operations", "extra");
/** what a field this version does not know becomes: plain JSON within the budget */
const kept = (budget: Budget) => (v: unknown) => cleanJson(v, budget);

const str = (v: unknown, max = 20_000): string | undefined => (typeof v === "string" ? (v.length > max ? v.slice(0, max) : v) : undefined);
const record = (v: unknown, budget: Budget): Record<string, unknown> | undefined => {
  const c = isRecord(v) ? cleanJson(v, budget) : undefined;
  return isRecord(c) && Object.keys(c).length ? c : undefined;
};
const schemaOf = (v: unknown, budget: Budget): JsonSchema | undefined => (typeof v === "boolean" ? v : isRecord(v) ? (cleanJson(v, budget) as JsonSchema) : undefined);

/** a value with its undefined fields left out, so what is written never says `"x": undefined` */
export function compact<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) define(out, k, v);
  return out as T;
}

/** a name that is not taken yet: the name, else name_2, name_3… */
export function freeName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name}_${n}`)) n++;
  return `${name}_${n}`;
}

function cleanInfo(v: unknown, budget: Budget): ApiInfo | undefined {
  if (!isRecord(v)) return undefined;
  const out = withUnknown(v, compact({ title: str(v.title, 500), version: str(v.version, 100), description: str(v.description), extra: record(v.extra, budget) }), INFO, kept(budget));
  return Object.keys(out).length ? out : undefined;
}

function cleanServers(v: unknown, budget: Budget): ApiServer[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const taken = new Set<string>();
  const out: ApiServer[] = [];
  for (const s of v.slice(0, API_LIMITS.servers)) {
    if (!isRecord(s) || typeof s.url !== "string") continue;
    const env = freeName(typeof s.env === "string" && API_ID.test(s.env) ? s.env : `server${out.length + 1}`, taken);
    taken.add(env);
    out.push(withUnknown(s, compact({ env, url: s.url.slice(0, 2000), description: str(s.description, 2000), realtime: str(s.realtime, 2000), extra: record(s.extra, budget) }), SERVER, kept(budget)));
  }
  return out.length ? out : undefined;
}

function cleanModels(v: unknown, budget: Budget): ApiModel[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const taken = new Set<string>();
  const out: ApiModel[] = [];
  for (const m of v.slice(0, API_LIMITS.models)) {
    if (!isRecord(m) || typeof m.name !== "string" || !MODEL_NAME.test(m.name) || taken.has(m.name)) continue;
    const schema = schemaOf(m.schema, budget);
    if (schema === undefined) continue;
    taken.add(m.name);
    out.push(withUnknown(m, { name: m.name, schema }, MODEL, kept(budget)));
  }
  return out.length ? out : undefined;
}

export function cleanPagination(v: unknown, budget: Budget = { nodes: API_LIMITS.nodes }): ApiPagination | undefined {
  if (!isRecord(v) || typeof v.items !== "string" || !v.items) return undefined;
  const name = (x: unknown) => (typeof x === "string" && x ? x.slice(0, 100) : undefined);
  if (v.style === "cursor") return withUnknown(v, compact({ style: "cursor" as const, items: v.items.slice(0, 100), cursorParam: name(v.cursorParam), nextField: name(v.nextField), limitParam: name(v.limitParam) }), PAGINATION, kept(budget));
  if (v.style === "offset") return withUnknown(v, compact({ style: "offset" as const, items: v.items.slice(0, 100), offsetParam: name(v.offsetParam), limitParam: name(v.limitParam), totalField: name(v.totalField) }), PAGINATION, kept(budget));
  return undefined;
}

export function cleanSecurity(v: unknown): SecurityRequirement[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.slice(0, 20).filter(isRecord).map((r) => Object.fromEntries(Object.entries(r).slice(0, 20).map(([k, scopes]) => [k, Array.isArray(scopes) ? scopes.filter((x): x is string => typeof x === "string").slice(0, 50) : []])));
}

const isMethod = (v: unknown): v is HttpMethod => typeof v === "string" && (HTTP_METHODS as readonly string[]).includes(v);
const STATUS = /^(?:[1-5](?:\d\d|XX)|default)$/;

function cleanEndpoints(v: unknown, budget: Budget): ApiEndpoint[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const taken = new Set<string>();
  const out: ApiEndpoint[] = [];
  for (const e of v.slice(0, API_LIMITS.endpoints)) {
    if (!isRecord(e) || !isMethod(e.method) || typeof e.path !== "string" || !e.path.startsWith("/") || e.path.length > 2000) continue;
    const id = freeName(typeof e.operationId === "string" && OPERATION_ID.test(e.operationId) ? e.operationId : operationIdFor(e.method, e.path), taken);
    taken.add(id);
    const params = Array.isArray(e.parameters) ? e.parameters.slice(0, API_LIMITS.parameters).filter((p) => isRecord(p) && (typeof p.$ref === "string" || (typeof p.name === "string" && typeof p.in === "string"))).map((p) => cleanJson(p, budget) as ApiEndpoint["parameters"] & object) : undefined;
    const responses: Record<string, unknown> = {};
    if (isRecord(e.responses))
      for (const [code, r] of Object.entries(e.responses).slice(0, API_LIMITS.responses)) {
        const c = isRecord(r) ? cleanJson(r, budget) : undefined;
        if (STATUS.test(code) && isRecord(c)) define(responses, code, c);
      }
    const tags = Array.isArray(e.tags) ? e.tags.filter((x): x is string => typeof x === "string").slice(0, 20) : undefined;
    const built = compact({
      operationId: id,
      method: e.method,
      path: e.path,
      summary: str(e.summary, 2000),
      description: str(e.description),
      tags: tags?.length ? tags : undefined,
      deprecated: e.deprecated === true ? true : undefined,
      parameters: (params?.length ? params : undefined) as ApiEndpoint["parameters"],
      requestBody: isRecord(e.requestBody) ? (cleanJson(e.requestBody, budget) as ApiEndpoint["requestBody"]) : undefined,
      responses: responses as ApiEndpoint["responses"],
      security: cleanSecurity(e.security),
      pagination: cleanPagination(e.pagination, budget),
      extra: record(e.extra, budget),
    });
    out.push(withUnknown(e, built, ENDPOINT, kept(budget)));
  }
  return out.length ? out : undefined;
}

function cleanTags(v: unknown, budget: Budget): ApiTag[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out = v
    .slice(0, API_LIMITS.tags)
    .filter((t): t is Record<string, unknown> => isRecord(t) && typeof t.name === "string" && !!t.name && !seen.has(t.name) && !!seen.add(t.name))
    .map((t) => withUnknown(t, compact({ name: (t.name as string).slice(0, 200), description: str(t.description), extra: record(t.extra, budget) }), TAG, kept(budget)));
  return out.length ? out : undefined;
}

const SCHEME_TYPES = new Set(["http", "apiKey", "oauth2", "openIdConnect", "mutualTLS"]);

function cleanAuth(v: unknown, budget: Budget): ApiAuth | undefined {
  if (!isRecord(v)) return undefined;
  const schemes: ApiAuth["schemes"] = {};
  if (isRecord(v.schemes))
    for (const [name, s] of Object.entries(v.schemes).slice(0, API_LIMITS.schemes)) {
      const c = isRecord(s) && SCHEME_TYPES.has(s.type as string) ? cleanJson(s, budget) : undefined;
      if (isRecord(c) && name) define(schemes, name, c);
    }
  const id = (x: unknown) => (typeof x === "string" && x ? x.slice(0, 128) : undefined);
  const out = compact({ schemes, security: cleanSecurity(v.security), login: id(v.login), refresh: id(v.refresh), logout: id(v.logout), tokenField: id(v.tokenField), refreshTokenField: id(v.refreshTokenField) });
  return Object.keys(schemes).length || out.security?.length || out.login || out.refresh || out.logout ? withUnknown(v, out, AUTH, kept(budget)) : undefined;
}

function cleanMessage(m: unknown, budget: Budget): ApiMessage | undefined {
  if (!isRecord(m) || typeof m.name !== "string" || !m.name) return undefined;
  const examples = Array.isArray(m.examples) ? (m.examples.slice(0, 20).map((x) => cleanJson(x, budget)).filter(isRecord) as ApiMessage["examples"]) : undefined;
  const built = compact({
    name: m.name.slice(0, 128),
    title: str(m.title, 500),
    summary: str(m.summary, 2000),
    description: str(m.description),
    contentType: str(m.contentType, 200),
    payload: schemaOf(m.payload, budget),
    headers: schemaOf(m.headers, budget),
    examples: examples?.length ? examples : undefined,
    extra: record(m.extra, budget),
  });
  return withUnknown(m, built, MESSAGE, kept(budget));
}

function cleanOperation(o: unknown, budget: Budget): ApiChannelOperation | undefined {
  if (!isRecord(o) || typeof o.id !== "string" || !o.id || (o.action !== "send" && o.action !== "receive")) return undefined;
  const messages = Array.isArray(o.messages) ? o.messages.filter((x): x is string => typeof x === "string").slice(0, API_LIMITS.messages) : undefined;
  return withUnknown(o, compact({ id: o.id.slice(0, 128), action: o.action as ApiChannelOperation["action"], messages, summary: str(o.summary, 2000), description: str(o.description), extra: record(o.extra, budget) }), OPERATION, kept(budget));
}

function cleanChannels(v: unknown, budget: Budget): ApiChannel[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const taken = new Set<string>();
  const out: ApiChannel[] = [];
  for (const c of v.slice(0, API_LIMITS.channels)) {
    if (!isRecord(c) || typeof c.id !== "string" || !c.id || typeof c.address !== "string") continue;
    const id = freeName(c.id.slice(0, 64), taken);
    taken.add(id);
    const names = new Set<string>();
    const messages = (Array.isArray(c.messages) ? c.messages.slice(0, API_LIMITS.messages) : []).map((m) => cleanMessage(m, budget)).filter((m): m is ApiMessage => !!m && !names.has(m.name) && !!names.add(m.name));
    const ops = new Set<string>();
    const operations = (Array.isArray(c.operations) ? c.operations.slice(0, API_LIMITS.operations) : []).map((o) => cleanOperation(o, budget)).filter((o): o is ApiChannelOperation => !!o && !ops.has(o.id) && !!ops.add(o.id));
    const parameters = record(c.parameters, budget) as ApiChannel["parameters"];
    const built = compact({
      id,
      address: c.address.slice(0, 2000),
      title: str(c.title, 500),
      summary: str(c.summary, 2000),
      description: str(c.description),
      transport: c.transport === "sse" || c.transport === "websocket" ? (c.transport as ApiChannel["transport"]) : undefined,
      parameters,
      messages,
      operations,
      extra: record(c.extra, budget),
    });
    out.push(withUnknown(c, built, CHANNEL, kept(budget)));
  }
  return out.length ? out : undefined;
}

/** whether an API section holds nothing at all */
export const isEmptyApi = (a: ApiSpec | undefined) => !a || Object.values(a).every((v) => v === undefined || (Array.isArray(v) ? !v.length : isRecord(v) ? !Object.keys(v).length : false));

/** An API section as it may come from a file: only what has the shape the model relies on, copied within the budgets
 *  of API_LIMITS; undefined when nothing usable is left. Duplicate operationIds, channel ids and environments are
 *  told apart with a suffix; models of the same name keep the first. */
export function cleanApi(v: unknown): ApiSpec | undefined {
  if (!isRecord(v)) return undefined;
  const budget: Budget = { nodes: API_LIMITS.nodes };
  const extra = isRecord(v.extra) ? withUnknown(v.extra, compact({ openapi: record(v.extra.openapi, budget), asyncapi: record(v.extra.asyncapi, budget) }), EXTRA, kept(budget)) : undefined;
  const built: ApiSpec = compact({
    info: cleanInfo(v.info, budget),
    servers: cleanServers(v.servers, budget),
    models: cleanModels(v.models, budget),
    endpoints: cleanEndpoints(v.endpoints, budget),
    tags: cleanTags(v.tags, budget),
    auth: cleanAuth(v.auth, budget),
    channels: cleanChannels(v.channels, budget),
    extra: extra && Object.keys(extra).length ? extra : undefined,
  });
  const out = withUnknown(v, built, API, kept(budget));
  return isEmptyApi(out) ? undefined : out;
}

/** a model name made of whatever a file called it */
export const modelNameFor = (name: string) => {
  const id = identifier(name, true);
  return MODEL_NAME.test(id) ? id : "Model";
};
