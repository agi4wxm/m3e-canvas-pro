/* The contract as the back end's generator reads it. The product's contract is an OpenAPI 3.1 document (and an AsyncAPI
 * 3.0 one for realtime): read back into the API model (lib/api's fromOpenApi / fromAsyncApi), so the same readers the
 * editor uses resolve it here (endpointParams, bodyOf-like media types, successOf, paginationOf), whether the contract
 * came from the document (Doc.api) or was handed to the export. Each operation of the client (lib/export/api.ts) is
 * matched to its endpoint by method and path, so the server's handlers have the client's names.
 *
 * What comes out is data: the generator prints it as JSON, as escaped strings, as identifiers or as TypeScript types
 * (schemaTypeTs), never as code of its own. */

import { endpointParams, fromAsyncApi, fromOpenApi, paginationOf, pointerRoot, resolvePointer, successOf } from "../../api";
import { isRecord } from "../../api/schema";
import type { ApiChannel, ApiEndpoint, ApiPagination, ApiSecurityScheme, ApiSpec, JsonSchema, SecurityRequirement } from "../../api";
import type { ApiModel, ApiOperation } from "../api";
import { identifierOf } from "../paths";

export type BodyKind = "json" | "multipart" | "form" | "binary" | "text";
export type ResponseKind = "json" | "file" | "text" | "none";

export type ServerParam = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: JsonSchema;
  /** the contract's own example of it, when it gives one (a parameter's, or its schema's examples/default) */
  example?: unknown;
};

export type ServerBody = {
  kind: BodyKind;
  /** the media type the server reads it as, and every one the contract lists */
  contentType: string;
  contentTypes: string[];
  required: boolean;
  schema?: JsonSchema;
  example?: unknown;
  /** multipart: the content types each file field accepts (its Encoding object's contentType) */
  accept?: Record<string, string[]>;
};

export type ServerResponse = { status: string; kind: ResponseKind; contentType?: string; schema?: JsonSchema; example?: unknown };

export type ServerOperation = {
  op: ApiOperation;
  /** the route as Fastify writes it (`/products/:productId`), or null when Fastify cannot route the path */
  url: string | null;
  /** each path parameter: its name in the contract and the key Fastify gives it */
  routeParams: { name: string; key: string }[];
  summary?: string;
  description?: string;
  deprecated: boolean;
  params: ServerParam[];
  body?: ServerBody;
  responses: ServerResponse[];
  /** the status it answers when it goes well, and that answer */
  successStatus: number;
  success?: ServerResponse;
  /** who may call it: the operation's own requirements, else the contract's default ([] for anyone) */
  security: SecurityRequirement[];
  pagination?: Required<ApiPagination>;
};

export type ServerMessage = { name: string; payload?: JsonSchema; examples: unknown[]; summary?: string };

export type ServerChannel = {
  /** the channel's id in the contract, and its name in code */
  id: string;
  name: string;
  address: string;
  /** the route under the realtime prefix, as Fastify writes it, or null when it cannot be routed */
  url: string | null;
  routeParams: { name: string; key: string }[];
  transport: "websocket" | "sse";
  messages: ServerMessage[];
  /** the names of the messages the server sends (AsyncAPI `send`) and receives (`receive`) */
  send: string[];
  receive: string[];
  summary?: string;
  description?: string;
};

export type ServerContract = {
  /** the contract as the API model reads it: models (identifiers), auth, the reusable objects */
  spec: ApiSpec;
  operations: ServerOperation[];
  channels: ServerChannel[];
  schemes: Record<string, ApiSecurityScheme>;
  /** where the realtime channels are served: the path of the dev server's realtime URL, else /realtime */
  realtimePrefix: string;
  /** the paths of the server's own routes, kept clear of the contract's */
  healthPath: string;
  docsPath: string;
  warnings: string[];
};

const JSON_TYPE = /^application\/(?:[\w.+-]*\+)?json(?:;|$)/i;
export const isJsonType = (type: string) => JSON_TYPE.test(type.trim());

function bodyKind(type: string, schema: JsonSchema | undefined): BodyKind {
  const t = type.toLowerCase();
  if (isJsonType(t)) return "json";
  if (t.startsWith("multipart/form-data")) return "multipart";
  if (t.startsWith("application/x-www-form-urlencoded")) return "form";
  if (t.startsWith("text/") && !(isRecord(schema) && schema.format === "binary")) return "text";
  return "binary";
}

function responseKind(type: string | undefined, schema: JsonSchema | undefined): ResponseKind {
  if (!type) return "none";
  if (isJsonType(type)) return "json";
  if (type.toLowerCase().startsWith("text/") && !(isRecord(schema) && schema.format === "binary")) return "text";
  return "file";
}

/** a reference to a reusable object followed (a few steps), or the object itself */
function deref(root: Record<string, unknown>, v: unknown): unknown {
  let at = v;
  for (let i = 0; i < 8 && isRecord(at) && typeof at.$ref === "string"; i++) at = resolvePointer(root, at.$ref);
  return at;
}

/** the example a media type gives: `example`, else the first of `examples` (an Example object's value) */
function mediaExample(root: Record<string, unknown>, media: Record<string, unknown>): { found: boolean; value?: unknown } {
  if ("example" in media) return { found: true, value: media.example };
  if (isRecord(media.examples)) {
    const first = deref(root, Object.values(media.examples)[0]);
    if (isRecord(first) && "value" in first) return { found: true, value: first.value };
  }
  return { found: false };
}

/** the media type a body is read as: JSON first, then a form, then the first the contract lists */
function pickMedia(content: Record<string, unknown>): [string, Record<string, unknown>] | undefined {
  const entries = Object.entries(content).filter(([, m]) => isRecord(m)) as [string, Record<string, unknown>][];
  return entries.find(([t]) => isJsonType(t)) ?? entries.find(([t]) => /^multipart\/form-data/i.test(t)) ?? entries.find(([t]) => /^application\/x-www-form-urlencoded/i.test(t)) ?? entries[0];
}

function readBody(root: Record<string, unknown>, e: ApiEndpoint): ServerBody | undefined {
  const rb = deref(root, e.requestBody);
  if (!isRecord(rb) || !isRecord(rb.content)) return undefined;
  const picked = pickMedia(rb.content);
  if (!picked) return undefined;
  const [contentType, media] = picked;
  const schema = media.schema as JsonSchema | undefined;
  const kind = bodyKind(contentType, schema);
  const ex = mediaExample(root, media);
  const accept: Record<string, string[]> = {};
  if (kind === "multipart" && isRecord(media.encoding))
    for (const [field, enc] of Object.entries(media.encoding))
      if (isRecord(enc) && typeof enc.contentType === "string") {
        const types = enc.contentType
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => /^[\w.+-]+\/[\w.+*-]+$/.test(t));
        if (types.length) accept[field] = types;
      }
  return {
    kind,
    contentType: contentType.toLowerCase(),
    contentTypes: Object.keys(rb.content).map((t) => t.toLowerCase()),
    required: rb.required === true,
    ...(schema !== undefined ? { schema } : {}),
    ...(ex.found ? { example: ex.value } : {}),
    ...(Object.keys(accept).length ? { accept } : {}),
  };
}

function readResponses(root: Record<string, unknown>, e: ApiEndpoint): ServerResponse[] {
  const out: ServerResponse[] = [];
  for (const [status, raw] of Object.entries(e.responses ?? {})) {
    if (!/^([1-5](\d\d|XX)|default)$/.test(status)) continue;
    const r = deref(root, raw);
    const content = isRecord(r) && isRecord(r.content) ? r.content : {};
    const picked = pickMedia(content);
    if (!picked) {
      out.push({ status, kind: "none" });
      continue;
    }
    const [contentType, media] = picked;
    const schema = media.schema as JsonSchema | undefined;
    const ex = mediaExample(root, media);
    out.push({ status, kind: responseKind(contentType, schema), contentType: contentType.toLowerCase(), ...(schema !== undefined ? { schema } : {}), ...(ex.found ? { example: ex.value } : {}) });
  }
  return out;
}

function readParams(spec: ApiSpec, e: ApiEndpoint): ServerParam[] {
  const seen = new Set<string>();
  const out: ServerParam[] = [];
  for (const p of endpointParams(spec, e)) {
    if (!["path", "query", "header", "cookie"].includes(p.in)) continue;
    const key = `${p.in}:${p.in === "header" ? p.name.toLowerCase() : p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const schema: JsonSchema = p.schema ?? {};
    const s = isRecord(schema) ? schema : {};
    const example =
      "example" in p ? p.example : isRecord(p.examples) && isRecord(Object.values(p.examples)[0]) && "value" in (Object.values(p.examples)[0] as object) ? (Object.values(p.examples)[0] as { value: unknown }).value : Array.isArray(s.examples) && s.examples.length ? s.examples[0] : "example" in s ? s.example : "default" in s ? s.default : undefined;
    out.push({ name: p.name, in: p.in, required: p.in === "path" || p.required === true, schema, ...(example !== undefined ? { example } : {}) });
  }
  return out;
}

/** A contract path as a Fastify route: `{name}` becomes `:key` (letters, digits and `_`, distinct), a colon of the
 *  path is escaped. Null when Fastify cannot route it as written: a `*`, or a parameter run into letters after it. */
export function routeOf(path: string): { url: string; params: { name: string; key: string }[] } | null {
  const params: { name: string; key: string }[] = [];
  const keys = new Set<string>();
  let url = "";
  let at = 0;
  const literal = (s: string) => (/[*()]/.test(s) ? null : s.replace(/:/g, "::"));
  for (const m of path.matchAll(/\{([^{}/]+)\}/g)) {
    const fixed = literal(path.slice(at, m.index));
    if (fixed === null) return null;
    let key = m[1].replace(/[^A-Za-z0-9_]/g, "_") || "param";
    for (let i = 2; keys.has(key); i++) key = `${m[1].replace(/[^A-Za-z0-9_]/g, "_")}_${i}`;
    keys.add(key);
    params.push({ name: m[1], key });
    url += `${fixed}:${key}`;
    at = m.index! + m[0].length;
    if (/^[A-Za-z0-9_(]/.test(path.slice(at))) return null;
  }
  const rest = literal(path.slice(at));
  if (rest === null) return null;
  return { url: url + rest, params };
}

/** the path of a URL (`ws://host/realtime` → /realtime), or "" */
function pathnameOf(url: string | undefined): string {
  if (!url) return "";
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i.exec(url);
  const path = m?.[1] ?? (url.startsWith("/") ? url.split(/[?#]/)[0] : "");
  return /^(\/[A-Za-z0-9._~-]+)+$/.test(path.replace(/\/$/, "")) ? path.replace(/\/$/, "") : "";
}

/** the first of the candidates no path of the contract is or starts under */
function freePath(candidates: string[], paths: string[]): string {
  return candidates.find((c) => !paths.some((p) => p === c || p.startsWith(`${c}/`))) ?? candidates.at(-1)!;
}

function readChannels(spec: ApiSpec, prefix: string, taken: Set<string>, warnings: string[]): ServerChannel[] {
  const out: ServerChannel[] = [];
  const names = new Set<string>();
  for (const c of spec.channels ?? []) {
    if (!isRecord(c) || typeof c.id !== "string" || typeof c.address !== "string") continue;
    const ch = c as ApiChannel;
    let name = identifierOf(ch.id, "channel").slice(0, 30);
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${identifierOf(ch.id, "channel").slice(0, 30)}${i}`;
    names.add(name.toLowerCase());
    const address = ch.address.startsWith("/") ? ch.address : `/${ch.address}`;
    // eslint-disable-next-line no-control-regex -- an address with control characters is no address
    const route = /[\u0000-\u001f\u007f\s#?\\]/.test(address) ? null : routeOf(address);
    let url = route ? `${prefix}${route.url}` : null;
    if (url && taken.has(`GET ${url.replace(/:[A-Za-z0-9_]+/g, ":")}`)) url = null;
    if (!url) warnings.push(`the realtime channel ${JSON.stringify(ch.id)} cannot be served at ${JSON.stringify(address)}: the server has no route for it`);
    else taken.add(`GET ${url.replace(/:[A-Za-z0-9_]+/g, ":")}`);
    const messages: ServerMessage[] = (ch.messages ?? [])
      .filter((m) => isRecord(m) && typeof m.name === "string")
      .map((m) => ({ name: m.name, ...(m.payload !== undefined ? { payload: m.payload } : {}), examples: (m.examples ?? []).filter((x) => isRecord(x) && "payload" in x).map((x) => x.payload), ...(m.summary ? { summary: m.summary } : {}) }));
    const all = messages.map((m) => m.name);
    const of = (action: "send" | "receive") => [...new Set((ch.operations ?? []).filter((o) => o.action === action).flatMap((o) => (o.messages?.length ? o.messages : all)))].filter((n) => all.includes(n));
    const transport = ch.transport === "sse" ? "sse" : "websocket";
    out.push({
      id: ch.id,
      name,
      address,
      url,
      routeParams: route?.params ?? [],
      transport,
      messages,
      send: of("send"),
      /* an SSE channel only ever goes from the server to the app */
      receive: transport === "sse" ? [] : of("receive"),
      ...(ch.summary ? { summary: ch.summary } : {}),
      ...(ch.description ? { description: ch.description } : {}),
    });
  }
  return out;
}

/** The contract as the server reads it. */
export function serverContract(model: ApiModel): ServerContract {
  const warnings: string[] = [];
  let spec: ApiSpec = {};
  try {
    spec = fromOpenApi(model.openapi).api;
  } catch (e) {
    warnings.push(`the server reads no schemas from the contract: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (model.asyncapi) {
    try {
      const rt = fromAsyncApi(model.asyncapi).api;
      const have = new Set((spec.models ?? []).map((m) => m.name));
      spec = { ...spec, channels: rt.channels, servers: spec.servers ?? rt.servers, models: [...(spec.models ?? []), ...(rt.models ?? []).filter((m) => !have.has(m.name))] };
    } catch (e) {
      warnings.push(`the server reads no realtime channels from the contract: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const root = pointerRoot(spec);
  const byRoute = new Map<string, ApiEndpoint>();
  for (const e of spec.endpoints ?? []) byRoute.set(`${e.method.toUpperCase()} ${e.path}`, e);
  const defaultSecurity = spec.auth?.security ?? [];
  const taken = new Set<string>();
  const operations: ServerOperation[] = model.operations.map((op) => {
    const e = byRoute.get(`${op.method} ${op.path}`);
    let route = routeOf(op.path);
    const shape = route ? `${op.method} ${route.url.replace(/:[A-Za-z0-9_]+/g, ":")}` : "";
    if (route && taken.has(shape)) {
      warnings.push(`${op.method} ${op.path} (${op.name}) is the same route as another operation: the server leaves it out`);
      route = null;
    } else if (route) taken.add(shape);
    else warnings.push(`${op.method} ${op.path} (${op.name}) cannot be routed by Fastify as written: the server leaves it out`);
    const responses = e ? readResponses(root, e) : [];
    const body = e ? readBody(root, e) : undefined;
    const okStatus = e ? successOf(e) : undefined;
    const success = responses.find((r) => r.status === okStatus && okStatus.startsWith("2")) ?? responses.find((r) => r.status.startsWith("2")) ?? responses.find((r) => r.status === "default");
    const successStatus = success && /^\d{3}$/.test(success.status) ? Number(success.status) : success?.status === "2XX" ? 200 : op.status;
    return {
      op,
      url: route?.url ?? null,
      routeParams: route?.params ?? [],
      ...(e?.summary ? { summary: e.summary } : {}),
      ...(e?.description ? { description: e.description } : {}),
      deprecated: e?.deprecated === true,
      params: e ? readParams(spec, e) : op.params.map((name) => ({ name, in: "path" as const, required: true, schema: { type: "string" } })),
      ...(body ? { body } : {}),
      responses,
      successStatus,
      ...(success ? { success } : {}),
      security: (e?.security ?? defaultSecurity).filter(isRecord),
      ...(e?.pagination ? { pagination: paginationOf(e.pagination) } : {}),
    };
  });
  /* path parameters the contract does not declare are still strings in the path */
  for (const s of operations) for (const p of s.routeParams) if (!s.params.some((x) => x.in === "path" && x.name === p.name)) s.params.unshift({ name: p.name, in: "path", required: true, schema: { type: "string" } });
  const paths = operations.map((s) => s.op.path);
  const healthPath = freePath(["/health", "/healthz", "/_health"], paths);
  const docsPath = freePath(["/docs", "/_docs", "/__docs"], paths);
  for (const p of [healthPath, docsPath]) taken.add(`GET ${p}`);
  const servers = spec.servers ?? [];
  const rtServer = servers.find((s) => s.env === "dev" && s.realtime) ?? servers.find((s) => s.realtime);
  const realtimePrefix = pathnameOf(rtServer?.realtime) || "/realtime";
  const channels = readChannels(spec, realtimePrefix, taken, warnings);
  return { spec, operations, channels, schemes: spec.auth?.schemes ?? {}, realtimePrefix, healthPath, docsPath, warnings };
}
