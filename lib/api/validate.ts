/* What is wrong with an API section, said so a person and a model can fix it: references that lead nowhere, a path
 * whose {params} and path parameters disagree, two endpoints of one operationId, keywords of the wrong kind in a
 * schema, a security requirement naming no scheme. Errors are what makes the specs invalid or the generated code
 * wrong; warnings are worth a look. An operation may not add an error (lib/core/ops/api.ts); a document that comes with
 * some still opens, and the editor lists them. Every walk is bounded (lib/api/schema.ts). */

import { API_ID, MODEL_NAME } from "./clean";
import { eachSubschema, isRecord, JSON_TYPES, LIST_SCHEMAS, MAP_SCHEMAS, ONE_SCHEMA, pathParams, pointerRoot, resolvePointer, schemaModels } from "./schema";
import { HTTP_METHODS, refModel, type ApiEndpoint, type ApiParameter, type ApiSpec, type JsonSchema } from "./types";

export type ApiProblem = { level: "error" | "warning"; at: string; message: string };

const NUMBER_KEYS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"] as const;
const COUNT_KEYS = ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "minContains", "maxContains"] as const;

/** the problems of one schema, its path under `at` */
export function schemaProblems(schema: JsonSchema | undefined, at: string, root: unknown, out: ApiProblem[], budget = { left: 50_000 }) {
  if (schema === undefined || typeof schema === "boolean") return;
  if (!isRecord(schema)) return void out.push({ level: "error", at, message: "a schema should be an object (or true / false)" });
  eachSubschema(
    schema,
    (s, path) => {
      const here = `${at}${path}`;
      const err = (message: string) => out.push({ level: "error", at: here, message });
      if (s.$ref !== undefined) {
        if (typeof s.$ref !== "string") err("$ref should be a string");
        else if (!s.$ref.startsWith("#")) err(`${JSON.stringify(s.$ref)} refers outside the document: import a bundled spec (one file), or define the model here`);
        else if (resolvePointer(root, s.$ref) === undefined) err(refModel(s.$ref) ? `there is no model ${JSON.stringify(refModel(s.$ref))}` : `${JSON.stringify(s.$ref)} leads nowhere`);
      }
      if (s.type !== undefined) {
        const types = Array.isArray(s.type) ? s.type : [s.type];
        const bad = types.filter((t) => !JSON_TYPES.includes(t as never));
        if (bad.length || !types.length) err(`type should be one of ${JSON_TYPES.join(", ")} (or a list of them), not ${JSON.stringify(s.type)}`);
        if (new Set(types).size !== types.length) err("type lists a type twice");
      }
      for (const k of MAP_SCHEMAS) if (s[k] !== undefined && !isRecord(s[k])) err(`${k} should map names to schemas`);
      for (const k of LIST_SCHEMAS) if (s[k] !== undefined && (!Array.isArray(s[k]) || !(s[k] as unknown[]).length)) err(`${k} should be a list of schemas`);
      for (const k of ONE_SCHEMA) if (s[k] !== undefined && typeof s[k] !== "boolean" && !isRecord(s[k])) err(k === "items" && Array.isArray(s.items) ? "items should be one schema (a tuple is prefixItems in JSON Schema 2020-12)" : `${k} should be a schema`);
      if (s.required !== undefined) {
        if (!Array.isArray(s.required) || !s.required.every((x) => typeof x === "string")) err("required should be a list of property names");
        else if (isRecord(s.properties)) {
          const missing = s.required.filter((r) => !(r in (s.properties as object)));
          if (missing.length) out.push({ level: "warning", at: here, message: `required names ${missing.map((m) => JSON.stringify(m)).join(", ")}, which properties does not list` });
        }
      }
      if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length)) err("enum should be a list of at least one value");
      for (const k of NUMBER_KEYS) if (s[k] !== undefined && (typeof s[k] !== "number" || !Number.isFinite(s[k]))) err(k.startsWith("exclusive") && typeof s[k] === "boolean" ? `${k} is a number in OpenAPI 3.1 (the bound itself), not a boolean` : `${k} should be a number`);
      if (typeof s.multipleOf === "number" && s.multipleOf <= 0) err("multipleOf should be more than 0");
      for (const k of COUNT_KEYS) if (s[k] !== undefined && !(typeof s[k] === "number" && Number.isInteger(s[k]) && (s[k] as number) >= 0)) err(`${k} should be a whole number, 0 or more`);
      if (s.format !== undefined && typeof s.format !== "string") err("format should be a string");
      if (s.pattern !== undefined) {
        if (typeof s.pattern !== "string" || s.pattern.length > 1000) err("pattern should be a regular expression of up to 1000 characters");
        else
          try {
            new RegExp(s.pattern, "u");
          } catch {
            err(`pattern ${JSON.stringify(s.pattern)} is not a regular expression`);
          }
      }
      if (s.examples !== undefined && !Array.isArray(s.examples)) err("examples should be a list (JSON Schema 2020-12); one example is `example`");
      if (s.nullable !== undefined) out.push({ level: "warning", at: here, message: 'nullable is OpenAPI 3.0: in 3.1 add "null" to type' });
      if (s.discriminator !== undefined && !(isRecord(s.discriminator) && typeof s.discriminator.propertyName === "string")) err("discriminator should be {propertyName, mapping?}");
      for (const k of ["description", "title"] as const) if (s[k] !== undefined && typeof s[k] !== "string") err(`${k} should be a string`);
      for (const k of ["readOnly", "writeOnly", "deprecated", "uniqueItems"] as const) if (s[k] !== undefined && typeof s[k] !== "boolean") err(`${k} should be true or false`);
    },
    budget,
  );
}

const isRef = (v: unknown): v is { $ref: string } => isRecord(v) && typeof v.$ref === "string";

/** a reference to a reusable object, checked; the object it leads to */
function refTarget(v: unknown, root: unknown, at: string, out: ApiProblem[]): Record<string, unknown> | undefined {
  if (!isRef(v)) return isRecord(v) ? v : undefined;
  const target = v.$ref.startsWith("#") ? resolvePointer(root, v.$ref) : undefined;
  if (!v.$ref.startsWith("#")) out.push({ level: "error", at, message: `${JSON.stringify(v.$ref)} refers outside the document: import a bundled spec` });
  else if (!isRecord(target)) out.push({ level: "error", at, message: `${JSON.stringify(v.$ref)} leads nowhere` });
  return isRecord(target) ? target : undefined;
}

function contentProblems(content: unknown, at: string, root: unknown, out: ApiProblem[], budget: { left: number }) {
  if (content === undefined) return;
  if (!isRecord(content)) return void out.push({ level: "error", at, message: "content should map media types (application/json) to {schema}" });
  for (const [type, media] of Object.entries(content)) {
    if (!/^[\w.+-]+\/[\w.+*-]+(?:\s*;.*)?$|^\*\/\*$/.test(type)) out.push({ level: "error", at: `${at}.${type}`, message: `${JSON.stringify(type)} is not a media type` });
    if (!isRecord(media)) {
      out.push({ level: "error", at: `${at}.${type}`, message: "a media type should be {schema, example?}" });
      continue;
    }
    schemaProblems(media.schema as JsonSchema | undefined, `${at}.${type}.schema`, root, out, budget);
  }
}

/** the parameters of an endpoint as they are once references are followed */
export function endpointParams(api: ApiSpec, e: ApiEndpoint): ApiParameter[] {
  const root = pointerRoot(api);
  return (e.parameters ?? []).map((p) => (isRef(p) ? resolvePointer(root, p.$ref) : p)).filter((p): p is ApiParameter => isRecord(p) && typeof p.name === "string" && typeof p.in === "string");
}

const SUCCESS = /^2(?:\d\d|XX)$/;

function endpointProblems(api: ApiSpec, e: ApiEndpoint, root: unknown, out: ApiProblem[], budget: { left: number }) {
  const at = `endpoints.${e.operationId}`;
  const err = (message: string, where = at) => out.push({ level: "error", at: where, message });
  const warn = (message: string, where = at) => out.push({ level: "warning", at: where, message });
  if (!(HTTP_METHODS as readonly string[]).includes(e.method)) err(`method should be one of ${HTTP_METHODS.join(", ")}`);
  if (!e.path.startsWith("/")) err("path should start with /");
  const depthOk = !/\{[^}]*\{|\}[^{]*\}/.test(e.path.replace(/\{[^{}]*\}/g, ""));
  if (!depthOk || (e.path.match(/\{/g) ?? []).length !== (e.path.match(/\}/g) ?? []).length) err(`the path ${JSON.stringify(e.path)} has unbalanced braces`);
  const names = pathParams(e.path);
  if (new Set(names).size !== names.length) err("the path names a parameter twice");
  for (const n of names) if (!/^[A-Za-z_][\w.-]*$/.test(n)) err(`{${n}} is not a parameter name: letters, digits and _ . -`);
  /* parameters, references followed */
  const seen = new Set<string>();
  (e.parameters ?? []).forEach((p, i) => {
    const where = `${at}.parameters[${i}]`;
    const target = refTarget(p, root, where, out);
    if (!target) return;
    if (typeof target.name !== "string" || !target.name) return err("a parameter needs a name", where);
    if (!["path", "query", "header", "cookie"].includes(target.in as string)) return err("in should be path, query, header or cookie", where);
    const key = `${target.in}:${target.name}`;
    if (seen.has(key)) err(`the ${target.in} parameter ${JSON.stringify(target.name)} is listed twice`, where);
    seen.add(key);
    if (target.in === "path") {
      if (!names.includes(target.name)) err(`the path parameter ${JSON.stringify(target.name)} is not in the path ${JSON.stringify(e.path)}`, where);
      if (target.required !== true) err(`the path parameter ${JSON.stringify(target.name)} should be required: true`, where);
    }
    if (target.schema === undefined && target.content === undefined) warn(`the parameter ${JSON.stringify(target.name)} has no schema (a string is assumed)`, where);
    if (!isRef(p)) schemaProblems(target.schema as JsonSchema | undefined, `${where}.schema`, root, out, budget);
  });
  for (const n of names) if (!seen.has(`path:${n}`)) err(`{${n}} in the path has no path parameter`);
  if (e.requestBody !== undefined) {
    const body = refTarget(e.requestBody, root, `${at}.requestBody`, out);
    if (body) {
      if (!isRecord(body.content) || !Object.keys(body.content).length) err("requestBody should have content: {\"application/json\": {schema}}", `${at}.requestBody`);
      else if (!isRef(e.requestBody)) contentProblems(body.content, `${at}.requestBody.content`, root, out, budget);
    }
    if (e.method === "get" || e.method === "head" || e.method === "delete") warn(`a ${e.method.toUpperCase()} request with a body is not read by every client and server`, `${at}.requestBody`);
  }
  const codes = Object.keys(e.responses ?? {});
  if (!codes.length) err("an endpoint needs at least one response");
  for (const code of codes) {
    const where = `${at}.responses.${code}`;
    if (!/^(?:[1-5](?:\d\d|XX)|default)$/.test(code)) err(`${JSON.stringify(code)} is not a status code (200, 4XX or default)`, where);
    const r = refTarget(e.responses[code], root, where, out);
    if (!r) continue;
    if (typeof r.description !== "string") err("a response needs a description", where);
    if (!isRef(e.responses[code])) contentProblems(r.content, `${where}.content`, root, out, budget);
  }
  if (codes.length && !codes.some((c) => SUCCESS.test(c) || /^[13]/.test(c))) warn("no success response (2XX)");
  for (const req of e.security ?? []) for (const name of Object.keys(req)) if (!api.auth?.schemes[name]) err(`security names ${JSON.stringify(name)}, which is no security scheme of the API`, `${at}.security`);
  if (e.pagination) {
    const p = e.pagination;
    if (e.method !== "get") warn("a paginated endpoint is usually a GET", `${at}.pagination`);
    const ok = codes.filter((c) => SUCCESS.test(c)).map((c) => refTarget(e.responses[c], root, `${at}.responses.${c}`, []));
    const schema = ok.map((r) => (isRecord(r?.content) ? (Object.values(r.content)[0] as Record<string, unknown> | undefined)?.schema : undefined)).find((s) => s !== undefined);
    let target = schema;
    for (let i = 0; i < 8 && isRef(target); i++) target = resolvePointer(root, target.$ref);
    const items = isRecord(target) && isRecord(target.properties) ? (target.properties as Record<string, unknown>)[p.items] : undefined;
    if (schema !== undefined && items === undefined) warn(`the success response has no field ${JSON.stringify(p.items)} for the page's items`, `${at}.pagination`);
    const queryNames = new Set(endpointParams(api, e).filter((x) => x.in === "query").map((x) => x.name));
    const params = p.style === "cursor" ? [p.cursorParam ?? "cursor", p.limitParam ?? "limit"] : [p.offsetParam ?? "offset", p.limitParam ?? "limit"];
    const missing = params.filter((x) => !queryNames.has(x));
    if (missing.length) warn(`the query parameters ${missing.join(", ")} that page it are not listed`, `${at}.pagination`);
  }
}

/** Everything wrong with an API section, errors first. `collections` (the document's data) are checked for the models
 *  they name. Bounded: a huge section is checked as far as the budget goes. */
export function apiProblems(api: ApiSpec | undefined, o: { collections?: { id: string; name: string; model?: string }[] } = {}): ApiProblem[] {
  const out: ApiProblem[] = [];
  if (!api) return out;
  const root = pointerRoot(api);
  const budget = { left: 200_000 };
  const models = new Set<string>();
  for (const m of api.models ?? []) {
    const at = `models.${m.name}`;
    if (!MODEL_NAME.test(m.name)) out.push({ level: "error", at, message: "a model's name is an identifier: a letter, then letters, digits or _ (User, OrderItem)" });
    if (models.has(m.name)) out.push({ level: "error", at, message: `two models are called ${JSON.stringify(m.name)}` });
    models.add(m.name);
    schemaProblems(m.schema, at, root, out, budget);
  }
  const ids = new Set<string>();
  const routes = new Map<string, string>();
  for (const e of api.endpoints ?? []) {
    if (ids.has(e.operationId)) out.push({ level: "error", at: `endpoints.${e.operationId}`, message: `two endpoints have the operationId ${JSON.stringify(e.operationId)}` });
    ids.add(e.operationId);
    /* a gameplay contract's operations are named in its namespace (game.pull, lib/game): that is their name, not a slip */
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.operationId) && !e.extra?.["x-m3e-game"]) out.push({ level: "warning", at: `endpoints.${e.operationId}`, message: "an operationId that is an identifier (getUser) names the generated function as it is; this one is made into one" });
    const route = `${e.method} ${e.path.replace(/\{[^}]*\}/g, "{}")}`;
    if (routes.has(route)) out.push({ level: "error", at: `endpoints.${e.operationId}`, message: `${e.method.toUpperCase()} ${e.path} is the same route as ${routes.get(route)}` });
    routes.set(route, e.operationId);
    endpointProblems(api, e, root, out, budget);
  }
  const auth = api.auth;
  if (auth) {
    for (const [name, s] of Object.entries(auth.schemes)) {
      const at = `auth.schemes.${name}`;
      if (s.type === "http" && typeof s.scheme !== "string") out.push({ level: "error", at, message: 'an http scheme needs scheme: "bearer" or "basic"' });
      if (s.type === "apiKey" && (typeof s.name !== "string" || !["header", "query", "cookie"].includes(s.in as string))) out.push({ level: "error", at, message: 'an apiKey scheme needs in (header, query or cookie) and name ("X-API-Key")' });
      if (s.type === "oauth2" && (!isRecord(s.flows) || !Object.keys(s.flows).length)) out.push({ level: "error", at, message: "an oauth2 scheme needs flows: {authorizationCode: {authorizationUrl, tokenUrl, scopes}}" });
      if (s.type === "openIdConnect" && typeof s.openIdConnectUrl !== "string") out.push({ level: "error", at, message: "an openIdConnect scheme needs openIdConnectUrl" });
    }
    for (const req of auth.security ?? []) for (const name of Object.keys(req)) if (!auth.schemes[name]) out.push({ level: "error", at: "auth.security", message: `security names ${JSON.stringify(name)}, which is no security scheme` });
    for (const k of ["login", "refresh", "logout"] as const) if (auth[k] && !ids.has(auth[k]!)) out.push({ level: "error", at: `auth.${k}`, message: `${k} names the endpoint ${JSON.stringify(auth[k])}, which there is not` });
  }
  const envs = new Set<string>();
  for (const s of api.servers ?? []) {
    const at = `servers.${s.env}`;
    if (envs.has(s.env)) out.push({ level: "error", at, message: `two servers are called ${JSON.stringify(s.env)}` });
    envs.add(s.env);
    if (!API_ID.test(s.env)) out.push({ level: "error", at, message: "a server's environment is a short name: dev, staging, prod" });
    if (!/^(?:https?:\/\/[^\s/]+|\/|\{)\S*$/.test(s.url)) out.push({ level: "error", at, message: `${JSON.stringify(s.url)} is not a base URL (https://api.example.com/v1, or /api)` });
    if (s.realtime !== undefined && !/^(?:wss?|https?):\/\/[^\s/]+\S*$/.test(s.realtime)) out.push({ level: "error", at, message: `${JSON.stringify(s.realtime)} is not a realtime URL (wss://rt.example.com)` });
  }
  const channelIds = new Set<string>();
  const opIds = new Set<string>();
  for (const c of api.channels ?? []) {
    const at = `channels.${c.id}`;
    if (channelIds.has(c.id)) out.push({ level: "error", at, message: `two channels are called ${JSON.stringify(c.id)}` });
    channelIds.add(c.id);
    if (!API_ID.test(c.id)) out.push({ level: "error", at, message: "a channel's id is a short name: letters, digits and _ . -, starting with a letter" });
    const params = pathParams(c.address);
    for (const p of params) if (!c.parameters?.[p]) out.push({ level: "error", at, message: `{${p}} in the address has no parameter` });
    for (const p of Object.keys(c.parameters ?? {})) if (!params.includes(p)) out.push({ level: "error", at, message: `the parameter ${JSON.stringify(p)} is not in the address ${JSON.stringify(c.address)}` });
    const names = new Set(c.messages.map((m) => m.name));
    if (!c.messages.length) out.push({ level: "warning", at, message: "a channel with no messages carries nothing" });
    c.messages.forEach((m) => {
      schemaProblems(m.payload, `${at}.messages.${m.name}.payload`, root, out, budget);
      schemaProblems(m.headers, `${at}.messages.${m.name}.headers`, root, out, budget);
    });
    for (const o of c.operations) {
      const where = `${at}.operations.${o.id}`;
      if (opIds.has(o.id)) out.push({ level: "error", at: where, message: `two channel operations are called ${JSON.stringify(o.id)}` });
      opIds.add(o.id);
      if (!API_ID.test(o.id)) out.push({ level: "error", at: where, message: "an operation's id is a short name: letters, digits and _ . -" });
      for (const m of o.messages ?? []) if (!names.has(m)) out.push({ level: "error", at: where, message: `the channel has no message ${JSON.stringify(m)}` });
      if (c.transport === "sse" && o.action === "receive") out.push({ level: "warning", at: where, message: "server-sent events only go from the server: an SSE channel has nothing to receive" });
    }
  }
  for (const c of o.collections ?? []) if (c.model && !models.has(c.model)) out.push({ level: "warning", at: `collections.${c.id}`, message: `the data ${JSON.stringify(c.name || c.id)} names the model ${JSON.stringify(c.model)}, which there is not` });
  return [...out.filter((p) => p.level === "error"), ...out.filter((p) => p.level === "warning")];
}

/** what an error is, as a key: two lists of problems are compared by these */
export const problemKey = (p: ApiProblem) => `${p.at}: ${p.message}`;

/** the errors `after` has that `before` did not */
export function newErrors(before: ApiProblem[], after: ApiProblem[]): ApiProblem[] {
  const had = new Set(before.filter((p) => p.level === "error").map(problemKey));
  return after.filter((p) => p.level === "error" && !had.has(problemKey(p)));
}

/** where a model is used: the other models, endpoints and channels that refer to it */
export function modelUses(api: ApiSpec | undefined, name: string): string[] {
  if (!api) return [];
  const out: string[] = [];
  const ref = `"#/components/schemas/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
  const refers = (v: unknown) => {
    const text = JSON.stringify(v ?? null);
    return text.includes(`${ref}"`) || text.includes(`${ref}/`);
  };
  for (const m of api.models ?? []) if (m.name !== name && schemaModels(m.schema).includes(name)) out.push(`model ${m.name}`);
  for (const e of api.endpoints ?? []) if (refers({ p: e.parameters, b: e.requestBody, r: e.responses })) out.push(`endpoint ${e.operationId}`);
  for (const c of api.channels ?? []) if (refers(c.messages)) out.push(`channel ${c.id}`);
  if (refers(api.extra?.openapi?.components)) out.push("reusable components");
  return out;
}

export { API_ID, MODEL_NAME, isRef };
