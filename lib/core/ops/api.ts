/* Operations on the API section (lib/api, docs/接口.md): data models, endpoints, auth, realtime channels, servers,
 * and importing OpenAPI and AsyncAPI files. Every one leaves the API with no error it did not have (lib/api/validate.ts):
 * what would add one is refused with the problems it would make, whoever asks. A path and its path parameters are kept
 * in step, a paged list gets its paging parameters, an endpoint gets the RFC 9457 error response, so what is asked for
 * in a few words comes out a valid contract. */

import {
  API_ID,
  ApiImportError,
  MODEL_NAME,
  OPERATION_ID,
  PROBLEM_MODEL_NAME,
  apiProblems,
  cleanApi,
  cleanJson,
  compact,
  fromAsyncApi,
  fromOpenApi,
  isEmptyApi,
  mergeApi,
  modelUses,
  newErrors,
  pathParams,
  problemModel,
  problemResponse,
  renameModelRefs,
  statusText,
  successStatus,
  syncPathParams,
  withPageParams,
  HTTP_METHODS,
  type ApiChannel,
  type ApiChannelOperation,
  type ApiEndpoint,
  type ApiMessage,
  type ApiModel,
  type ApiPagination,
  type ApiParameter,
  type ApiRef,
  type ApiRequestBody,
  type ApiResponse,
  type ApiSecurityScheme,
  type ApiServer,
  type ApiSpec,
  type ImportMode,
  type JsonSchema,
  type JsonSchemaObject,
  type SecurityRequirement,
} from "../../api";
import { cleanPagination, cleanSecurity } from "../../api/clean";
import { define, isRecord } from "../../api/schema";
import { gameMarkOf } from "../../game/map";
import { op, OpError, S } from "../op";
import { withDoc, type CoreState } from "../state";

/* ---------- reading and writing the section ---------- */

const apiOf = (s: CoreState): ApiSpec => s.doc.api ?? {};

/** a JSON value an operation was given, copied within the API's budget */
const json = <T>(v: T): T => cleanJson(v, { nodes: 100_000 }) as T;

/** The state with the API section replaced, when that adds no error to it: what would is refused, with the problems
 *  it would make, so the API is never left worse than it was. */
function withApi(s: CoreState, given: ApiSpec, collections = s.doc.collections): CoreState {
  /* in the shape loading gives it, so what is saved reads back as it is, byte for byte */
  const next = cleanApi(given) ?? {};
  const before = apiProblems(s.doc.api, { collections: s.doc.collections });
  const after = apiProblems(next, { collections });
  const fresh = newErrors(before, after);
  if (fresh.length) {
    const lines = fresh.slice(0, 6).map((p) => `${p.at}: ${p.message}`);
    throw new OpError("invalid_value", `That would leave the API with ${fresh.length === 1 ? "an error" : `${fresh.length} errors`}: ${lines.join("; ")}${fresh.length > 6 ? "; …" : ""}`);
  }
  const api = isEmptyApi(next) ? undefined : next;
  return withDoc(collections === s.doc.collections ? s : withDoc(s, { collections }), { api });
}

/** a list with one entry put in place of another, or taken out (`next` undefined) */
const replaced = <T>(list: T[] | undefined, at: number, next: T | undefined): T[] | undefined => {
  const out = [...(list ?? [])];
  if (next === undefined) out.splice(at, 1);
  else out[at] = next;
  return out.length ? out : undefined;
};

function modelAt(s: CoreState, name: string): number {
  const models = apiOf(s).models ?? [];
  const at = models.findIndex((m) => m.name === name);
  if (at < 0) throw new OpError("not_found", `There is no model ${JSON.stringify(name)}.${models.length ? ` The models are: ${models.map((m) => m.name).join(", ")}.` : " There are none yet: add_model makes one."}`, name);
  return at;
}

function endpointAt(s: CoreState, id: string): number {
  const list = apiOf(s).endpoints ?? [];
  const at = list.findIndex((e) => e.operationId === id);
  if (at < 0) throw new OpError("not_found", `There is no endpoint ${JSON.stringify(id)}.${list.length ? ` The endpoints are: ${list.map((e) => e.operationId).slice(0, 40).join(", ")}.` : " There are none yet."}`, id);
  return at;
}

/** An endpoint the gameplay contract made (lib/game: `x-m3e-game`) is the game loop's: it changes only by importing the
 *  contract again, never by hand, and its namespace is the contract's. */
function notTheGameLoops(s: CoreState, id: string, at?: number) {
  const e = at === undefined ? undefined : apiOf(s).endpoints?.[at];
  const mark = gameMarkOf(e);
  if (mark) throw new OpError("refused", `${id} is the game loop's (its gameplay contract, version ${mark.contractVersion}): it is read-only here. A change to it is made in the game loop and comes in with import_game_contract.`, id);
  const ns = (s.doc as { game?: { contract: { namespace: string } } }).game?.contract.namespace;
  if (ns && id.startsWith(`${ns}.`)) throw new OpError("refused", `${ns}.* is the namespace of the gameplay contract's operations: name the endpoint otherwise.`, id);
}

function channelAt(s: CoreState, id: string): number {
  const list = apiOf(s).channels ?? [];
  const at = list.findIndex((c) => c.id === id);
  if (at < 0) throw new OpError("not_found", `There is no channel ${JSON.stringify(id)}.${list.length ? ` The channels are: ${list.map((c) => c.id).join(", ")}.` : ""}`, id);
  return at;
}

const SCHEMA = (description: string) => S.any(`a JSON Schema 2020-12 object: ${description}. A model is {"$ref": "#/components/schemas/<Name>"}`);
const NULLABLE_STR = (description?: string) => ({ type: ["string", "null"], ...(description ? { description } : {}) });

/* ---------- models ---------- */

const checkModelName = (name: string) => {
  if (!MODEL_NAME.test(name)) throw new OpError("invalid_value", `${JSON.stringify(name)} cannot be a model's name: an identifier, a letter then letters, digits or _, up to 64 (User, OrderItem). It names the TypeScript type.`, "name");
};

export const addModel = op<{ name: string; schema?: JsonSchemaObject; description?: string }, { name: string }>({
  name: "add_model",
  summary:
    'Adds a data model: a named JSON Schema 2020-12 (usually an object: {type: "object", properties: {id: {type: "string", format: "uuid"}, email: {type: "string", format: "email"}, avatar: {type: "string", format: "uri"}}, required: ["id", "email"]}). Formats: date-time, date, uuid, email, uri, binary (a file). A field that is another model is {"$ref": "#/components/schemas/<Name>"}; a list of them {type: "array", items: {"$ref": …}}; nullable is type: ["string", "null"]. Give each field a description and examples: [..] where it helps the mocks.',
  args: S.obj({ name: S.str("an identifier: User, OrderItem"), schema: SCHEMA("the model; an empty object when left out"), description: S.str("what it is, kept as the schema's description") }, ["name"]),
  label: () => "Add model",
  run(s, a) {
    checkModelName(a.name);
    const api = apiOf(s);
    if (api.models?.some((m) => m.name === a.name)) throw new OpError("invalid_value", `There is a model ${JSON.stringify(a.name)} already: update_model changes it.`, a.name);
    const given: JsonSchemaObject = a.schema ? json(a.schema) : { type: "object", properties: {} };
    const schema: JsonSchemaObject = a.description !== undefined ? { ...given, description: a.description } : given;
    return { state: withApi(s, { ...api, models: [...(api.models ?? []), { name: a.name, schema }] }), result: { name: a.name } };
  },
});

export const updateModel = op<{ name: string; schema?: JsonSchemaObject; properties?: Record<string, JsonSchema | null>; required?: string[]; description?: string | null }, { name: string; fields: string[] }>({
  name: "update_model",
  summary:
    "Changes a model: its whole schema, or some of its properties (by name: a schema, or null to remove it; a new one goes last, a changed one stays in its place), its required list, its description (null removes it).",
  args: S.obj(
    {
      name: S.str(),
      schema: SCHEMA("the model's new schema, in place of the old one"),
      properties: { type: "object", additionalProperties: { type: ["object", "boolean", "null"] }, description: "fields by name: a JSON Schema, or null to remove the field" },
      required: S.arr(S.str(), "the required fields, all of them"),
      description: NULLABLE_STR(),
    },
    ["name"],
  ),
  label: () => "Model",
  run(s, a) {
    const at = modelAt(s, a.name);
    const api = apiOf(s);
    const was = api.models![at];
    let schema: JsonSchema = a.schema ? json(a.schema) : was.schema;
    if (a.properties || a.required || a.description !== undefined) {
      const base: JsonSchemaObject = typeof schema === "object" ? { ...schema } : {};
      if (a.properties) {
        const props: Record<string, JsonSchema> = isRecord(base.properties) ? { ...(base.properties as Record<string, JsonSchema>) } : {};
        let required = Array.isArray(base.required) ? [...base.required] : undefined;
        for (const [k, v] of Object.entries(a.properties)) {
          if (v === null) {
            delete props[k];
            required = required?.filter((r) => r !== k);
          } else define(props, k, json(v));
        }
        if (!base.type) base.type = "object";
        base.properties = props;
        if (required) base.required = required;
      }
      if (a.required) base.required = a.required;
      if (Array.isArray(base.required) && !base.required.length) delete base.required;
      if (a.description === null) delete base.description;
      else if (a.description !== undefined) base.description = a.description;
      schema = base;
    }
    if (JSON.stringify(schema) === JSON.stringify(was.schema)) throw new OpError("nothing_to_do", `The model ${a.name} is that already.`);
    const next = { ...api, models: replaced(api.models, at, { name: a.name, schema }) };
    const fields = typeof schema === "object" && isRecord(schema.properties) ? Object.keys(schema.properties) : [];
    return { state: withApi(s, next), result: { name: a.name, fields } };
  },
});

export const renameModel = op<{ name: string; to: string }, { name: string; uses: string[] }>({
  name: "rename_model",
  summary: "Renames a model; every reference to it (other models, endpoints, channels) and the data collections linked to it follow.",
  args: S.obj({ name: S.str(), to: S.str("the new name, an identifier") }, ["name", "to"]),
  label: () => "Rename model",
  run(s, a) {
    const at = modelAt(s, a.name);
    checkModelName(a.to);
    if (a.to === a.name) throw new OpError("nothing_to_do", `The model is called ${a.to} already.`);
    const api = apiOf(s);
    if (api.models!.some((m) => m.name === a.to)) throw new OpError("invalid_value", `There is a model ${JSON.stringify(a.to)} already.`, a.to);
    const uses = modelUses(api, a.name);
    const moved = renameModelRefs({ ...api, models: replaced(api.models, at, { ...api.models![at], name: a.to }) }, a.name, a.to);
    const collections = s.doc.collections?.some((c) => c.model === a.name) ? s.doc.collections.map((c) => (c.model === a.name ? { ...c, model: a.to } : c)) : s.doc.collections;
    return { state: withApi(s, moved, collections), result: { name: a.to, uses } };
  },
});

export const removeModel = op<{ name: string; force?: boolean }, { removed: string; unlinked: string[] }>({
  name: "remove_model",
  summary: "Removes a model. One still referred to is refused (the error lists where) unless force: then each reference to it becomes an empty schema, and data collections linked to it are unlinked.",
  args: S.obj({ name: S.str(), force: S.bool("remove it although it is referred to") }, ["name"]),
  label: () => "Delete model",
  run(s, a) {
    const at = modelAt(s, a.name);
    const api = apiOf(s);
    const uses = modelUses(api, a.name);
    if (uses.length && !a.force) throw new OpError("invalid_value", `The model ${a.name} is used by ${uses.join(", ")}: change those first, or give force: true to remove it anyway (each reference becomes an empty schema).`, a.name);
    const next = renameModelRefs({ ...api, models: replaced(api.models, at, undefined) }, a.name, null);
    const linked = (s.doc.collections ?? []).filter((c) => c.model === a.name);
    const collections = linked.length ? s.doc.collections!.map((c) => (c.model === a.name ? (({ model: _gone, ...rest }) => rest)(c) : c)) : s.doc.collections;
    return { state: withApi(s, next, collections), result: { removed: a.name, unlinked: linked.map((c) => c.name || c.id) } };
  },
});

/* ---------- endpoints ---------- */

type EndpointArgs = {
  operationId: string;
  method: ApiEndpoint["method"];
  path: string;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | null;
  deprecated?: boolean;
  parameters?: ApiParameter[];
  requestBody?: ApiRequestBody | null;
  body?: JsonSchemaObject | null;
  contentType?: string;
  responses?: Record<string, ApiResponse | null>;
  returns?: JsonSchemaObject;
  status?: string;
  security?: SecurityRequirement[] | null;
  pagination?: ApiPagination | null;
  problem?: boolean;
};

const ENDPOINT_FIELDS = {
  summary: NULLABLE_STR("a line on what it does"),
  description: NULLABLE_STR(),
  tags: { type: ["array", "null"], items: { type: "string" }, description: "the first groups it (Products, Auth)" },
  deprecated: S.bool(),
  parameters: S.arr(S.any("OpenAPI Parameter: {name, in: path | query | header | cookie, required, description, schema}"), "every parameter (in place of those there); the path's {params} are added when missing"),
  requestBody: { type: ["object", "null"], description: 'OpenAPI Request Body: {required: true, content: {"application/json": {schema}}}; null removes it' },
  body: { type: ["object", "null"], description: "shortcut for requestBody: the JSON Schema of the body (a model's $ref, or an object); null removes it" },
  contentType: S.str('the body\'s media type with `body`: application/json (the default), multipart/form-data for an upload (its file fields {type: "string", format: "binary"}), application/x-www-form-urlencoded'),
  responses: { type: "object", additionalProperties: { type: ["object", "null"] }, description: 'OpenAPI responses by status ("200", "404", "default"): {description, content: {"application/json": {schema}}}; null removes one' },
  returns: S.any("shortcut: the JSON Schema of the success response's JSON body"),
  status: S.str("the success status `returns` goes under; 201 for a POST, 204 for a DELETE that returns nothing, else 200"),
  security: { type: ["array", "null"], items: { type: "object" }, description: "who may call it: [] anyone; [{bearerAuth: []}] a signed-in user; null (or left out) the API's default (set_auth)" },
  pagination: { type: ["object", "null"], description: "a paged list: {style: cursor | offset, items: the response field holding the page's items (an array), cursorParam, nextField, limitParam | offsetParam, limitParam, totalField}; its query parameters are added. null: not paged" },
};

/** a response with its description, which OpenAPI requires */
const described = (code: string, r: ApiResponse | ApiRef): ApiResponse | ApiRef => ("$ref" in r && typeof r.$ref === "string" ? r : { ...(r as ApiResponse), description: typeof r.description === "string" ? r.description : statusText(code) });

/** the endpoint as the arguments say, from what it was */
function endpointFrom(was: ApiEndpoint | undefined, a: Partial<EndpointArgs>, method: ApiEndpoint["method"], path: string, id: string): ApiEndpoint {
  let parameters = a.parameters ? json(a.parameters) : was?.parameters;
  parameters = syncPathParams(path, parameters);
  const pagination = a.pagination === null ? undefined : a.pagination !== undefined ? cleanPagination(a.pagination) : was?.pagination;
  if (a.pagination && !pagination) throw new OpError("invalid_value", "pagination should be {style: \"cursor\" | \"offset\", items: \"<the response field holding the items>\"}.", "pagination");
  if (pagination && a.pagination) parameters = withPageParams(pagination, parameters);
  let requestBody: ApiEndpoint["requestBody"] = a.requestBody === null || a.body === null ? undefined : a.requestBody ? json(a.requestBody) : was?.requestBody;
  if (a.body) requestBody = { required: true, content: { [a.contentType ?? "application/json"]: { schema: json(a.body) } } };
  else if (a.contentType && requestBody && !("$ref" in requestBody)) {
    /* another media type for the body there is */
    const content = (requestBody as ApiRequestBody).content;
    const first = Object.values(content ?? {})[0];
    if (first) requestBody = { ...(requestBody as ApiRequestBody), content: { [a.contentType]: first } };
  }
  const responses: Record<string, ApiResponse | ApiRef> = { ...was?.responses };
  for (const [code, r] of Object.entries(a.responses ?? {})) {
    if (r === null) delete responses[code];
    else define(responses, code, json(r));
  }
  if (a.returns) {
    const code = a.status ?? successStatus(method, true);
    const old = responses[code];
    const base: ApiResponse = old && !("$ref" in old && typeof old.$ref === "string") ? (old as ApiResponse) : { description: statusText(code) };
    define(responses, code, { ...base, content: { "application/json": { schema: json(a.returns) } } });
  }
  if (!Object.keys(responses).some((c) => c !== "default")) {
    const code = a.status ?? successStatus(method, false);
    define(responses, code, { description: statusText(code) });
  }
  if (!was && a.problem !== false && !responses.default) define(responses, "default", problemResponse());
  const ordered: Record<string, ApiResponse | ApiRef> = {};
  /* the success first, then the errors by code, then the default */
  for (const code of Object.keys(responses).sort((x, y) => (x === "default" ? 1 : y === "default" ? -1 : x < y ? -1 : x > y ? 1 : 0))) define(ordered, code, described(code, responses[code]));
  const pick = <K extends "summary" | "description">(k: K) => (a[k] === null ? undefined : (a[k] ?? was?.[k]) || undefined);
  const tags = a.tags === null ? undefined : (a.tags ?? was?.tags);
  return compact({
    operationId: id,
    method,
    path,
    summary: pick("summary"),
    description: pick("description"),
    tags: tags?.length ? tags : undefined,
    deprecated: (a.deprecated ?? was?.deprecated) ? true : undefined,
    parameters: parameters.length ? parameters : undefined,
    requestBody,
    responses: ordered,
    security: a.security === null ? undefined : a.security !== undefined ? cleanSecurity(a.security) : was?.security,
    pagination,
    extra: was?.extra,
  });
}

/** the API with the Problem model in it, when an endpoint's error response needs it */
function withProblem(api: ApiSpec, e: ApiEndpoint): ApiSpec {
  if (api.models?.some((m) => m.name === PROBLEM_MODEL_NAME) || !JSON.stringify(e.responses).includes(`"#/components/schemas/${PROBLEM_MODEL_NAME}"`)) return api;
  return { ...api, models: [...(api.models ?? []), problemModel()] };
}

const checkPath = (path: string) => {
  if (!path.startsWith("/")) throw new OpError("invalid_value", `${JSON.stringify(path)} is no path: it starts with / and names its parameters in braces (/users/{id}).`, "path");
};

const checkOperationId = (id: string, api: ApiSpec, except?: string) => {
  if (!OPERATION_ID.test(id)) throw new OpError("invalid_value", `${JSON.stringify(id)} cannot be an operationId: an identifier (listProducts, getUser) names the generated function.`, "operationId");
  if (id !== except && api.endpoints?.some((e) => e.operationId === id)) throw new OpError("invalid_value", `There is an endpoint ${JSON.stringify(id)} already: update_endpoint changes it.`, id);
};

/** a parameter in the path the path does not name, said before the path parameters are made to match */
function strayPathParams(path: string, params: ApiParameter[] | undefined) {
  const names = pathParams(path);
  const stray = (params ?? []).filter((p) => isRecord(p) && p.in === "path" && !names.includes(p.name));
  if (stray.length) throw new OpError("invalid_value", `The path ${path} has no {${stray[0].name}}: put it in the path, or make the parameter in: query.`, "parameters");
}

export const addEndpoint = op<EndpointArgs, { operationId: string; parameters: string[]; responses: string[] }>({
  name: "add_endpoint",
  summary:
    'Adds an HTTP endpoint (an OpenAPI 3.1 operation). operationId names it (listProducts, getProduct, createOrder, uploadAvatar). The path\'s {params} become required path parameters. `body` and `returns` are shortcuts for the JSON bodies; it gets the RFC 9457 error response (default, application/problem+json, model Problem, made when missing) unless problem: false. An upload: body {type: "object", properties: {file: {type: "string", format: "binary"}}} with contentType multipart/form-data.',
  args: S.obj(
    {
      operationId: S.str("unique; the generated client function's name"),
      method: S.enum(HTTP_METHODS),
      path: S.str("from the base URL, parameters in braces: /products/{id}"),
      ...ENDPOINT_FIELDS,
      problem: S.bool("add the RFC 9457 problem response as `default` (true when left out)"),
    },
    ["operationId", "method", "path"],
  ),
  label: () => "Add endpoint",
  run(s, a) {
    const api = apiOf(s);
    notTheGameLoops(s, a.operationId);
    checkOperationId(a.operationId, api);
    checkPath(a.path);
    strayPathParams(a.path, a.parameters);
    const e = endpointFrom(undefined, a, a.method, a.path, a.operationId);
    const next = withProblem({ ...api, endpoints: [...(api.endpoints ?? []), e] }, e);
    return { state: withApi(s, next), result: { operationId: e.operationId, parameters: (e.parameters ?? []).map((p) => ("$ref" in p && typeof p.$ref === "string" ? p.$ref : `${(p as ApiParameter).in}:${(p as ApiParameter).name}`)), responses: Object.keys(e.responses) } };
  },
});

export const updateEndpoint = op<Partial<EndpointArgs> & { operationId: string; rename?: string }, { operationId: string }>({
  name: "update_endpoint",
  summary:
    "Changes an endpoint: its method, path (path parameters follow), words, tags, parameters (the whole list), body, responses (by status; null removes one), security, pagination; rename gives it another operationId (the auth's login / refresh follow). What is not given stays.",
  args: S.obj({ operationId: S.str(), rename: S.str("a new operationId"), method: S.enum(HTTP_METHODS), path: S.str(), ...ENDPOINT_FIELDS }, ["operationId"]),
  label: () => "Endpoint",
  run(s, a) {
    const at = endpointAt(s, a.operationId);
    notTheGameLoops(s, a.operationId, at);
    const api = apiOf(s);
    const was = api.endpoints![at];
    const id = a.rename ?? was.operationId;
    if (a.rename) notTheGameLoops(s, a.rename);
    if (a.rename) checkOperationId(a.rename, api, was.operationId);
    const path = a.path ?? was.path;
    checkPath(path);
    if (a.parameters) strayPathParams(path, a.parameters);
    const e = endpointFrom(was, a, a.method ?? was.method, path, id);
    if (JSON.stringify(e) === JSON.stringify(was)) throw new OpError("nothing_to_do", `The endpoint ${id} is that already.`);
    let next: ApiSpec = withProblem({ ...api, endpoints: replaced(api.endpoints, at, e) }, e);
    if (a.rename && api.auth) {
      const auth = { ...api.auth };
      for (const k of ["login", "refresh", "logout"] as const) if (auth[k] === was.operationId) auth[k] = id;
      next = { ...next, auth };
    }
    return { state: withApi(s, next), result: { operationId: id } };
  },
});

export const removeEndpoint = op<{ operationId: string }, { removed: string }>({
  name: "remove_endpoint",
  summary: "Removes an endpoint; the auth stops naming it as the login, refresh or logout.",
  args: S.obj({ operationId: S.str() }, ["operationId"]),
  label: () => "Delete endpoint",
  run(s, a) {
    const at = endpointAt(s, a.operationId);
    notTheGameLoops(s, a.operationId, at);
    const api = apiOf(s);
    let auth = api.auth;
    if (auth && (auth.login === a.operationId || auth.refresh === a.operationId || auth.logout === a.operationId)) auth = compact({ ...auth, login: auth.login === a.operationId ? undefined : auth.login, refresh: auth.refresh === a.operationId ? undefined : auth.refresh, logout: auth.logout === a.operationId ? undefined : auth.logout });
    return { state: withApi(s, compact({ ...api, endpoints: replaced(api.endpoints, at, undefined), auth })), result: { removed: a.operationId } };
  },
});

/* ---------- auth ---------- */

export const setAuth = op<{ schemes?: Record<string, ApiSecurityScheme | null>; security?: SecurityRequirement[] | null; login?: string | null; refresh?: string | null; logout?: string | null; tokenField?: string | null; refreshTokenField?: string | null }>({
  name: "set_auth",
  summary:
    'Sets how the app signs in: security schemes by name (an OpenAPI Security Scheme, null removes one), the default security every endpoint needs, and the endpoints that sign in (login: its operationId; it answers with the tokens), refresh and log out, with the response fields that hold the tokens (tokenField "accessToken", refreshTokenField "refreshToken"). Bearer JWT: {bearerAuth: {type: "http", scheme: "bearer", bearerFormat: "JWT"}}, security [{bearerAuth: []}]; an API key: {type: "apiKey", in: "header", name: "X-API-Key"}; OAuth2: {type: "oauth2", flows: {authorizationCode: {authorizationUrl, tokenUrl, refreshUrl, scopes: {}}}}. A public endpoint has security [] (update_endpoint).',
  args: S.obj({
    schemes: { type: "object", additionalProperties: { type: ["object", "null"] }, description: "security schemes by name; null removes one" },
    security: { type: ["array", "null"], items: { type: "object" }, description: "the default for every endpoint: [{bearerAuth: []}]; null or [] for none" },
    login: NULLABLE_STR("operationId of the endpoint that signs in"),
    refresh: NULLABLE_STR("operationId of the endpoint that refreshes the access token"),
    logout: NULLABLE_STR("operationId of the endpoint that signs out"),
    tokenField: NULLABLE_STR("the sign-in response's field holding the access token"),
    refreshTokenField: NULLABLE_STR("the field holding the refresh token"),
  }),
  label: () => "Auth",
  run(s, a) {
    const api = apiOf(s);
    const cur = api.auth ?? { schemes: {} };
    const schemes: Record<string, ApiSecurityScheme> = { ...cur.schemes };
    for (const [name, x] of Object.entries(a.schemes ?? {})) {
      if (x === null) delete schemes[name];
      else {
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) throw new OpError("invalid_value", `${JSON.stringify(name)} cannot be a scheme's name: letters, digits and . _ - (bearerAuth).`, name);
        if (!["http", "apiKey", "oauth2", "openIdConnect", "mutualTLS"].includes(x.type)) throw new OpError("invalid_value", `The scheme ${name} should have type http, apiKey, oauth2, openIdConnect or mutualTLS.`, name);
        define(schemes, name, json(x));
      }
    }
    const pickStr = (k: "login" | "refresh" | "logout" | "tokenField" | "refreshTokenField") => (a[k] === null ? undefined : (a[k] ?? cur[k]));
    const auth = compact({
      schemes,
      security: a.security === null ? undefined : a.security !== undefined ? cleanSecurity(a.security) : cur.security,
      login: pickStr("login"),
      refresh: pickStr("refresh"),
      logout: pickStr("logout"),
      tokenField: pickStr("tokenField"),
      refreshTokenField: pickStr("refreshTokenField"),
    });
    const empty = !Object.keys(auth.schemes).length && !auth.security?.length && !auth.login && !auth.refresh && !auth.logout;
    const next = compact({ ...api, auth: empty ? undefined : auth });
    if (JSON.stringify(next.auth) === JSON.stringify(api.auth)) throw new OpError("nothing_to_do", "The auth is that already.");
    return { state: withApi(s, next) };
  },
});

/* ---------- channels ---------- */

type ChannelArgs = {
  id: string;
  address: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  transport?: "websocket" | "sse";
  parameters?: ApiChannel["parameters"];
  messages?: ApiMessage[];
  operations?: ApiChannelOperation[];
};

const CHANNEL_FIELDS = {
  title: NULLABLE_STR(),
  summary: NULLABLE_STR(),
  description: NULLABLE_STR(),
  transport: S.enum(["websocket", "sse"], "a WebSocket (both ways; the default) or server-sent events (only the server sends)"),
  parameters: S.any("AsyncAPI parameters for the address's {braces}: {roomId: {description}}; missing ones are added"),
  messages: S.arr(S.any("{name, payload: JSON Schema (a model's $ref), summary, contentType, examples}"), "every message that goes over it (in place of those there)"),
  operations: S.arr(
    S.any('{id, action: "send" (the server sends it to the app) | "receive" (the server takes it from the app), messages: [message names; all when left out], summary}'),
    "who sends what (in place of those there)",
  ),
};

function channelFrom(was: ApiChannel | undefined, a: Partial<ChannelArgs>, id: string, address: string): ApiChannel {
  const params: NonNullable<ApiChannel["parameters"]> = { ...(a.parameters ? json(a.parameters) : was?.parameters) };
  const names = pathParams(address);
  for (const k of Object.keys(params)) if (!names.includes(k)) delete params[k];
  for (const n of names) if (!params[n]) define(params, n, {});
  const messages = a.messages ? a.messages.map((m) => json(m)) : (was?.messages ?? []);
  for (const m of messages) if (!isRecord(m) || typeof m.name !== "string" || !m.name) throw new OpError("invalid_value", "Each message needs a name (chatMessage, typing) and a payload schema.", "messages");
  if (new Set(messages.map((m) => m.name)).size !== messages.length) throw new OpError("invalid_value", "Two messages have the same name.", "messages");
  const operations = a.operations ? a.operations.map((o) => json(o)) : (was?.operations ?? []);
  for (const o of operations) if (!isRecord(o) || typeof o.id !== "string" || (o.action !== "send" && o.action !== "receive")) throw new OpError("invalid_value", 'Each operation is {id, action: "send" | "receive", messages?}.', "operations");
  const pick = <K extends "title" | "summary" | "description">(k: K) => (a[k] === null ? undefined : (a[k] ?? was?.[k]) || undefined);
  return compact({
    id,
    address,
    title: pick("title"),
    summary: pick("summary"),
    description: pick("description"),
    transport: a.transport ?? was?.transport,
    parameters: Object.keys(params).length ? params : undefined,
    messages: messages.map((m) => compact({ ...m })),
    operations: operations.map((o) => compact({ ...o })),
    extra: was?.extra,
  });
}

const checkChannelId = (id: string, api: ApiSpec, except?: string) => {
  if (!API_ID.test(id)) throw new OpError("invalid_value", `${JSON.stringify(id)} cannot be a channel's id: a short name, letters, digits and _ . - (chatRoom).`, "id");
  if (id !== except && api.channels?.some((c) => c.id === id)) throw new OpError("invalid_value", `There is a channel ${JSON.stringify(id)} already: update_channel changes it.`, id);
};

export const addChannel = op<ChannelArgs, { id: string }>({
  name: "add_channel",
  summary:
    'Adds a realtime channel (AsyncAPI 3.0): an address on the realtime server with {params}, the messages that go over it, and its operations from the back end\'s side: action "send" is the server sending to the app (a new chat message pushed), "receive" the server taking it from the app (the message a user sends). e.g. {id: "chatRoom", address: "/rooms/{roomId}", messages: [{name: "chatMessage", payload: {"$ref": "#/components/schemas/Message"}}], operations: [{id: "onMessage", action: "send"}, {id: "sendMessage", action: "receive"}]}.',
  args: S.obj({ id: S.str("a short name: chatRoom"), address: S.str("/rooms/{roomId}"), ...CHANNEL_FIELDS }, ["id", "address"]),
  label: () => "Add channel",
  run(s, a) {
    const api = apiOf(s);
    checkChannelId(a.id, api);
    const c = channelFrom(undefined, a, a.id, a.address);
    return { state: withApi(s, { ...api, channels: [...(api.channels ?? []), c] }), result: { id: c.id } };
  },
});

export const updateChannel = op<Partial<ChannelArgs> & { id: string; rename?: string }, { id: string }>({
  name: "update_channel",
  summary: "Changes a channel: its address (parameters follow), words, transport, parameters, messages or operations (each list whole, in place of the one there); rename gives it another id.",
  args: S.obj({ id: S.str(), rename: S.str("a new id"), address: S.str(), ...CHANNEL_FIELDS }, ["id"]),
  label: () => "Channel",
  run(s, a) {
    const at = channelAt(s, a.id);
    const api = apiOf(s);
    const was = api.channels![at];
    const id = a.rename ?? was.id;
    if (a.rename) checkChannelId(a.rename, api, was.id);
    const c = channelFrom(was, a, id, a.address ?? was.address);
    if (JSON.stringify(c) === JSON.stringify(was)) throw new OpError("nothing_to_do", `The channel ${id} is that already.`);
    const state = withApi(s, { ...api, channels: replaced(api.channels, at, c) });
    /* the screens that subscribe to it follow its new id */
    if (id === was.id || !state.doc.frames.some((f) => f.subscriptions?.some((x) => x.channel === was.id))) return { state, result: { id } };
    const frames = state.doc.frames.map((f) => (f.subscriptions?.some((x) => x.channel === was.id) ? { ...f, subscriptions: f.subscriptions.map((x) => (x.channel === was.id ? { ...x, channel: id } : x)) } : f));
    return { state: withDoc(state, { frames }), result: { id } };
  },
});

export const removeChannel = op<{ id: string }, { removed: string }>({
  name: "remove_channel",
  summary: "Removes a realtime channel with its messages and operations.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete channel",
  run(s, a) {
    const at = channelAt(s, a.id);
    const api = apiOf(s);
    return { state: withApi(s, { ...api, channels: replaced(api.channels, at, undefined) }), result: { removed: a.id } };
  },
});

/* ---------- servers and info ---------- */

export const setServers = op<{ servers: ApiServer[] }>({
  name: "set_servers",
  summary: 'Sets the environments the API runs in, all of them: [{env: "dev", url: "http://localhost:3000"}, {env: "staging", url: "https://staging.example.com/v1"}, {env: "prod", url: "https://api.example.com/v1", realtime: "wss://rt.example.com"}]. realtime is the base URL of the channels.',
  args: S.obj({ servers: S.arr(S.obj({ env: S.str("dev, staging, prod…"), url: S.str("the HTTP base URL"), description: S.str(), realtime: S.str("ws:// or wss:// base URL of the realtime channels") }, ["env", "url"])) }, ["servers"]),
  label: () => "Servers",
  run(s, a) {
    const api = apiOf(s);
    const envs = new Set<string>();
    for (const x of a.servers) {
      if (!API_ID.test(x.env)) throw new OpError("invalid_value", `${JSON.stringify(x.env)} cannot name an environment: a short name (dev, staging, prod).`, "env");
      if (envs.has(x.env)) throw new OpError("invalid_value", `Two servers are called ${JSON.stringify(x.env)}.`, x.env);
      envs.add(x.env);
    }
    /* what a server had besides (variables, x- fields) stays with its environment */
    const servers = a.servers.map((x) => compact({ env: x.env, url: x.url.trim(), description: x.description || undefined, realtime: x.realtime?.trim() || undefined, extra: api.servers?.find((y) => y.env === x.env)?.extra }));
    const next = compact({ ...api, servers: servers.length ? servers : undefined });
    if (JSON.stringify(next.servers) === JSON.stringify(api.servers)) throw new OpError("nothing_to_do", "The servers are those already.");
    return { state: withApi(s, next) };
  },
});

export const setApiInfo = op<{ title?: string | null; version?: string | null; description?: string | null; tags?: { name: string; description?: string }[] }>({
  name: "set_api_info",
  summary: "Sets the API's title, version and description (OpenAPI info), and the tags endpoints are grouped by, with words about each (the whole list).",
  args: S.obj({ title: NULLABLE_STR(), version: NULLABLE_STR("1.0.0"), description: NULLABLE_STR(), tags: S.arr(S.obj({ name: S.str(undefined, { minLength: 1 }), description: S.str() }, ["name"])) }),
  label: () => "API info",
  run(s, a) {
    const api = apiOf(s);
    const cur = api.info ?? {};
    const pick = (k: "title" | "version" | "description") => (a[k] === null ? undefined : (a[k] ?? cur[k]) || undefined);
    const info = compact({ title: pick("title"), version: pick("version"), description: pick("description"), extra: cur.extra });
    const tags = a.tags ? a.tags.map((t) => compact({ name: t.name, description: t.description || undefined, extra: api.tags?.find((x) => x.name === t.name)?.extra })) : api.tags;
    const next = compact({ ...api, info: Object.keys(info).length ? info : undefined, tags: tags?.length ? tags : undefined });
    if (JSON.stringify(next) === JSON.stringify(api)) throw new OpError("nothing_to_do", "The API's info is that already.");
    return { state: withApi(s, next) };
  },
});

/* ---------- import ---------- */

type ImportResult = { models: number; endpoints: number; channels: number; converted: string[]; kept: string[]; dropped: string[]; problems: string[] };

function imported(s: CoreState, text: string, format: "openapi" | "asyncapi", mode: ImportMode): { state: CoreState; result: ImportResult } {
  let read;
  try {
    read = format === "openapi" ? fromOpenApi(text) : fromAsyncApi(text);
  } catch (e) {
    if (e instanceof ApiImportError) throw new OpError("invalid_value", e.message, "text");
    throw e;
  }
  const mergedFile = mergeApi(s.doc.api, read.api, format, mode);
  /* the gameplay contract's operations are the game loop's, whatever a file of the author's says of the same ids */
  const theGames = (s.doc.api?.endpoints ?? []).filter((e) => gameMarkOf(e));
  const ids = new Set(theGames.map((e) => e.operationId));
  const keepProblem = theGames.length && !mergedFile?.models?.some((m) => m.name === PROBLEM_MODEL_NAME);
  const problem = s.doc.api?.models?.find((m) => m.name === PROBLEM_MODEL_NAME) ?? problemModel();
  const merged = theGames.length ? { ...mergedFile, models: [...(mergedFile?.models ?? []), ...(keepProblem ? [problem] : [])], endpoints: [...(mergedFile?.endpoints ?? []).filter((e) => !ids.has(e.operationId)), ...theGames] } : mergedFile;
  const next = merged ? (cleanApi(merged) ?? {}) : {};
  /* what the file brings is the file's: its problems are reported, not refused, but none may be made of what was here */
  const before = apiProblems(s.doc.api);
  const theirs = new Set(apiProblems(read.api).map((p) => `${p.at}: ${p.message}`));
  const fresh = newErrors(before, apiProblems(next)).filter((p) => !theirs.has(`${p.at}: ${p.message}`));
  if (fresh.length) throw new OpError("invalid_value", `Importing it ${mode === "merge" ? "beside" : "over"} what is here would make errors: ${fresh.slice(0, 5).map((p) => `${p.at}: ${p.message}`).join("; ")}. Try mode ${mode === "merge" ? '"replace"' : '"merge"'}, or fix those first.`);
  const r = read.report;
  return {
    state: withDoc(s, { api: isEmptyApi(next) ? undefined : next }),
    result: { models: r.models, endpoints: r.endpoints, channels: r.channels, converted: r.converted.slice(0, 40), kept: r.kept.slice(0, 40), dropped: r.dropped.slice(0, 40), problems: r.problems.slice(0, 40) },
  };
}

const IMPORT_ARGS = S.obj({ text: S.str("the file's text, YAML or JSON (one bundled file: references to other files are not followed)"), mode: S.enum(["merge", "replace"], "merge (the default): add and replace by name, keep the rest; replace: the file's half of the API becomes the file's") }, ["text"]);

export const importOpenApi = op<{ text: string; mode?: ImportMode }, ImportResult>({
  name: "import_openapi",
  summary:
    "Imports an OpenAPI 3.1 or 3.0 document (YAML or JSON): models from components.schemas, endpoints from paths, security schemes, servers, tags. merge (default) adds and replaces by name; replace makes the HTTP half the file's. Returns what was converted, what is kept verbatim for export (webhooks, reusable responses…), what was dropped, and the problems.",
  args: IMPORT_ARGS,
  label: () => "Import OpenAPI",
  run: (s, a) => imported(s, a.text, "openapi", a.mode ?? "merge"),
});

export const importAsyncApi = op<{ text: string; mode?: ImportMode }, ImportResult>({
  name: "import_asyncapi",
  summary: "Imports an AsyncAPI 3.0 document (YAML or JSON): channels with their messages and operations, models from components.schemas, the realtime URLs of its servers. merge (default) or replace (the channels become the file's).",
  args: IMPORT_ARGS,
  label: () => "Import AsyncAPI",
  run: (s, a) => imported(s, a.text, "asyncapi", a.mode ?? "merge"),
});

export type { ApiModel };
