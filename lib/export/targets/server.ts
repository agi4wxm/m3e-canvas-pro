/* server: the back end's skeleton, Node + TypeScript on Fastify, generated from the contract.
 *
 *   src/generated/   the export's, rewritten on every export: the contract as data (contract.ts, operations.ts,
 *                    channels.ts) and as types (types.ts, handlers.ts), and the runtime that serves it (routes with
 *                    JSON Schema checks of every request and, in development, of every answer; problem+json errors;
 *                    authentication from the contract's security; pagination; uploads and file answers; realtime
 *                    channels over WebSocket or SSE; CORS, config, health and docs) — lib/export/server/runtime.ts
 *   src/handlers/    custom code: one file per operation (and per realtime channel under channels/), seeded once
 *                    with a typed stub that answers 501 and shows the contract it answers to
 *   src/custom/      custom code: auth.ts (who a credential stands for), db.ts (the data layer), setup.ts (plugins,
 *                    hooks)
 *
 * The contract is read by lib/export/server/contract.ts; words of it reach code only as JSON data, escaped strings
 * and identifiers, and comments only through lib/export/server/comments.ts. */

import { isRecord } from "../../api/schema";
import { schemaTypeTs } from "../../api/typescript";
import type { JsonSchema } from "../../api/types";
import { GENERATED, jsonCode, jsonFile, str } from "../code";
import { commentLines, commentText } from "../server/comments";
import { serverContract, type ServerChannel, type ServerContract, type ServerOperation } from "../server/contract";
import { Examples } from "../server/examples";
import { APP, AUTH, CONFIG, DOCS, ENV_EXAMPLE, ERRORS, MAIN, PAGINATION, REALTIME, RESPOND, ROUTES, UPLOADS, VALIDATION } from "../server/runtime";
import { ValidatorSchemas, withoutProperties } from "../server/schemas";
import { TypePrinter, typeNames } from "../server/typesSource";
import { generated, seeded, type ProductContext, type ProductFiles, type ProductTarget, type Workspace } from "../types";

/** JSON as code: an object literal, or JSON.parse of a string when it has a key an object literal would read as its
 *  prototype (`__proto__`) */
export const dataCode = (v: unknown) => {
  const json = JSON.stringify(v ?? null);
  return json.includes('"__proto__"') ? `JSON.parse(${str(json)})` : jsonCode(v);
};

const escapePointer = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1");

/** a path with its parameters filled in with example values, ready for a URL */
function samplePath(s: ServerOperation, ex: Examples): string {
  return s.op.path.replace(/\{([^{}/]+)\}/g, (_, name: string) => {
    const p = s.params.find((x) => x.in === "path" && x.name === name);
    const v = p ? (p.example ?? ex.of(p.schema)) : "1";
    return encodeURIComponent(typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : "1");
  });
}

/** the query string of an operation's required parameters, with example values */
function sampleQuery(s: ServerOperation, ex: Examples, extra: Record<string, string> = {}): string {
  const parts: string[] = [];
  for (const p of s.params.filter((x) => x.in === "query" && x.required && !(x.name in extra))) {
    const v = p.example ?? ex.of(p.schema);
    parts.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : String(v))}`);
  }
  for (const [k, v] of Object.entries(extra)) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

const isPublic = (s: ServerOperation) => !s.security.length || s.security.some((r) => !Object.keys(r).length);

/** the server's data of one operation (operations.ts) */
function operationSpec(s: ServerOperation, schemas: ValidatorSchemas, ex: Examples) {
  const req = (schema: JsonSchema | undefined) => schemas.schema(schema, "request");
  const group = (where: "path" | "query" | "header") => {
    const list = s.params.filter((p) => p.in === where);
    if (!list.length) return undefined;
    const key = (name: string) => (where === "path" ? (s.routeParams.find((r) => r.name === name)?.key ?? name) : where === "header" ? name.toLowerCase() : name);
    const properties: Record<string, unknown> = {};
    for (const p of list) Object.defineProperty(properties, key(p.name), { value: req(p.schema), enumerable: true, writable: true, configurable: true });
    const required = list.filter((p) => p.required).map((p) => key(p.name));
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  };
  let body: Record<string, unknown> | null = null;
  if (s.body) {
    const b = s.body;
    const files: string[] = [];
    const fileLists: string[] = [];
    let fieldsSchema: JsonSchema | undefined;
    let requiredFiles: string[] = [];
    if (b.kind === "multipart") {
      const top = ex.resolve(b.schema);
      const props = isRecord(top) && isRecord(top.properties) ? top.properties : {};
      for (const [name, sub] of Object.entries(props)) {
        if (ex.isFile(sub as JsonSchema)) files.push(name);
        else {
          const r = ex.resolve(sub as JsonSchema);
          if (isRecord(r) && r.type === "array" && ex.isFile(r.items as JsonSchema)) fileLists.push(name);
        }
      }
      const req2 = isRecord(top) && Array.isArray(top.required) ? (top.required as string[]) : [];
      requiredFiles = req2.filter((n) => files.includes(n) || fileLists.includes(n));
      fieldsSchema = req(top ? withoutProperties(top, [...files, ...fileLists]) : true);
    }
    body = {
      kind: b.kind,
      contentType: b.contentType,
      contentTypes: b.contentTypes,
      required: b.required,
      ...(b.schema !== undefined && b.kind !== "multipart" ? { schema: req(b.schema) } : {}),
      ...(fieldsSchema !== undefined ? { fieldsSchema } : {}),
      files,
      fileLists,
      requiredFiles,
      accept: b.accept ?? {},
    };
  }
  const responses: Record<string, unknown> = {};
  for (const r of s.responses)
    Object.defineProperty(responses, r.status, {
      value: { kind: r.kind, ...(r.contentType ? { contentType: r.contentType } : {}), ...(r.schema !== undefined && r.kind === "json" ? { schema: schemas.schema(r.schema, "response") } : {}) },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  let pagination: Record<string, unknown> | null = null;
  if (s.pagination) {
    const limit = s.params.find((p) => p.in === "query" && p.name === s.pagination!.limitParam);
    const d = limit && isRecord(limit.schema) && typeof limit.schema.default === "number" ? limit.schema.default : 20;
    pagination = { ...s.pagination, limitDefault: d };
  }
  const schema: Record<string, unknown> = {};
  const params = group("path");
  const querystring = group("query");
  const headers = group("header");
  if (params) schema.params = params;
  if (querystring) schema.querystring = querystring;
  if (headers) schema.headers = headers;
  return {
    name: s.op.name,
    operationId: s.op.operationId,
    method: s.op.method,
    path: s.op.path,
    url: s.url,
    params: s.routeParams,
    security: s.security,
    schema,
    body,
    success: s.successStatus,
    responses,
    pagination,
  };
}

/** requests the server's own tests send: to a secured operation without credentials (401), and requests its
 *  contract turns down (400, at a pointer) */
function selfChecks(c: ServerContract, ex: Examples) {
  const secured: { name: string; method: string; url: string }[] = [];
  const invalid: { name: string; method: string; url: string; payload?: unknown; pointer: string }[] = [];
  for (const s of c.operations) {
    if (!s.url) continue;
    const path = samplePath(s, ex);
    if (!isPublic(s)) {
      if (secured.length < 20) secured.push({ name: s.op.name, method: s.op.method, url: path + sampleQuery(s, ex) });
      continue;
    }
    if (invalid.length >= 20) continue;
    const body = s.body;
    if (body?.kind === "json") {
      const top = ex.resolve(body.schema);
      const required = isRecord(top) && Array.isArray(top.required) ? (top.required as string[]).filter((n) => !(isRecord(top.properties) && isRecord(top.properties[n]) && top.properties[n].readOnly === true)) : [];
      if (required.length && (top as Record<string, unknown>).type === "object") invalid.push({ name: s.op.name, method: s.op.method, url: path + sampleQuery(s, ex), payload: {}, pointer: `#/${escapePointer(required[0])}` });
    }
    const low = s.params.find((p) => p.in === "query" && isRecord(p.schema) && p.schema.type === "integer" && typeof p.schema.minimum === "number");
    if (low && isRecord(low.schema)) invalid.push({ name: s.op.name, method: s.op.method, url: path + sampleQuery(s, ex, { [low.name]: String((low.schema.minimum as number) - 1) }), ...(body?.required && body.kind === "json" ? { payload: ex.of(body.schema) } : {}), pointer: `#/${escapePointer(low.name)}` });
  }
  return { secured, invalid };
}

const SPEC_TYPES = `import type { SecurityRequirement } from "./auth"
import type { PaginationSpec } from "./pagination"

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"

/** how an operation's body comes: JSON, a form with files, a plain form, bytes or text */
export type BodySpec = {
  kind: "json" | "multipart" | "form" | "binary" | "text"
  contentType: string
  contentTypes: string[]
  required: boolean
  schema?: object | boolean
  /** a multipart form: its fields without the files, its file fields, those that hold a list, those it needs */
  fieldsSchema?: object | boolean
  files: string[]
  fileLists: string[]
  requiredFiles: string[]
  /** the media types each file field takes */
  accept: Record<string, string[]>
}

export type ResponseSpec = { kind: "json" | "file" | "text" | "none"; contentType?: string; schema?: object | boolean }

export type OperationSpec = {
  name: string
  operationId: string
  method: HttpMethod
  path: string
  /** Fastify's route, null when it cannot route the contract's path */
  url: string | null
  /** each path parameter's name in the contract and its key in Fastify's route */
  params: { name: string; key: string }[]
  security: SecurityRequirement[]
  /** what Fastify checks before the handler: path parameters, query, headers */
  schema: { params?: object; querystring?: object; headers?: object }
  body: BodySpec | null
  /** the status it answers when it goes well */
  success: number
  /** its answers by status: "200", "4XX", "default" */
  responses: Record<string, ResponseSpec>
  pagination: PaginationSpec | null
}`;

const SPEC_HELPERS = `/** the answer the contract gives an operation for a status: by its number, its class (4XX) or default */
export function responseFor(spec: OperationSpec, status: number): ResponseSpec | undefined {
  const r = spec.responses
  const own = (k: string) => (Object.prototype.hasOwnProperty.call(r, k) ? r[k] : undefined)
  return own(String(status)) ?? own(String(status)[0] + "XX") ?? own("default")
}

/** whether the contract lists a status for an operation */
export const documented = (spec: OperationSpec, status: number) => responseFor(spec, status) !== undefined`;

function operationsSource(c: ServerContract, schemas: ValidatorSchemas, ex: Examples): string {
  const specs: Record<string, unknown> = {};
  for (const s of c.operations) specs[s.op.name] = operationSpec(s, schemas, ex);
  return `${GENERATED}
${SPEC_TYPES}

/** every operation of the contract, as the server routes and checks it */
export const OPERATIONS: Record<string, OperationSpec> = ${dataCode(specs)}

${SPEC_HELPERS}

/** requests the server's own tests (server.test.ts) send: without credentials to secured operations, and some the
 *  contract turns down */
export const SELF_CHECKS: { secured: { name: string; method: HttpMethod; url: string }[]; invalid: { name: string; method: HttpMethod; url: string; payload?: unknown; pointer: string }[] } = ${dataCode(selfChecks(c, ex))}
`;
}

function channelsSource(c: ServerContract, schemas: ValidatorSchemas): string {
  const specs: Record<string, unknown> = {};
  for (const ch of c.channels) {
    const payloads: Record<string, unknown> = {};
    for (const m of ch.messages)
      Object.defineProperty(payloads, m.name, { value: schemas.schema(m.payload, ch.receive.includes(m.name) ? "request" : "response"), enumerable: true, writable: true, configurable: true });
    specs[ch.name] = { id: ch.id, name: ch.name, address: ch.address, url: ch.url ? ch.url.slice(c.realtimePrefix.length) || "/" : null, params: ch.routeParams, transport: ch.transport, send: ch.send, receive: ch.receive, payloads };
  }
  return `${GENERATED}
/** a realtime channel of the contract, as the server serves it */
export type ChannelSpec = {
  /** its id in the contract, and its name in code */
  id: string
  name: string
  address: string
  /** its route under the realtime prefix, null when it cannot be routed */
  url: string | null
  params: { name: string; key: string }[]
  transport: "websocket" | "sse"
  /** the messages the server sends, and those it receives */
  send: string[]
  receive: string[]
  /** each message's payload schema */
  payloads: Record<string, object | boolean>
}

export const CHANNELS: Record<string, ChannelSpec> = ${dataCode(specs)}
`;
}

function contractSource(c: ServerContract, ctx: ProductContext, schemas: ValidatorSchemas): string {
  const asyncapi = ctx.api.asyncapi ?? { asyncapi: "3.0.0", info: { title: ctx.title, version: "0.1.0" }, channels: {} };
  const schemes: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(c.schemes))
    if (isRecord(s)) Object.defineProperty(schemes, name, { value: { type: s.type, ...(typeof s.scheme === "string" ? { scheme: s.scheme } : {}), ...(typeof s.in === "string" ? { in: s.in } : {}), ...(typeof s.name === "string" ? { name: s.name } : {}) }, enumerable: true, writable: true, configurable: true });
  /* the definitions first: building them collects the formats the contract names */
  const request = schemas.definitions("request");
  const response = schemas.definitions("response");
  return `${GENERATED}
import type { SchemeSpec } from "./auth"

/** the OpenAPI 3.1 document of the API (packages/api/openapi.yaml is the same) */
export const OPENAPI: Record<string, unknown> = ${dataCode(ctx.api.openapi)}

/** the AsyncAPI 3.0 document of its realtime channels (packages/api/asyncapi.yaml is the same) */
export const ASYNCAPI: Record<string, unknown> = ${dataCode(asyncapi)}

/** the contract's models as the validator reads them: what comes in, and what goes out */
export const REQUEST_DEFINITIONS: Record<string, unknown> = ${dataCode(request)}

export const RESPONSE_DEFINITIONS: Record<string, unknown> = ${dataCode(response)}

/** formats the contract names that the validator does not check */
export const EXTRA_FORMATS: string[] = ${dataCode(schemas.unknownFormats())}

/** the contract's security schemes, as authentication reads them */
export const SECURITY_SCHEMES: Record<string, SchemeSpec> = ${dataCode(schemes)}

/** where the realtime channels are served by default (the path of the contract's realtime server) */
export const REALTIME_PREFIX = ${str(c.realtimePrefix)}

/** the server's own routes, apart from the contract's paths */
export const HEALTH_PATH = ${str(c.healthPath)}
export const DOCS_PATH = ${str(c.docsPath)}
`;
}

function handlersSource(c: ServerContract, names: ReturnType<typeof typeNames>): string {
  const ops = c.operations;
  const chs = c.channels;
  return `${GENERATED}
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify"
import type { User } from "../custom/auth"
import { publishTo, type ChannelHandler, type ChannelShape, type Connection } from "./realtime"
import type { Responded } from "./respond"
import type { ${names.channels === "Channels" ? "Channels" : `${names.channels} as Channels`}, ${names.operations === "Operations" ? "Operations" : `${names.operations} as Operations`} } from "./types"
${ops.map((s) => `import op_${s.op.name} from ${str(`../handlers/${s.op.name}`)}`).join("\n")}
${chs.map((ch) => `import channel_${ch.name} from ${str(`../handlers/channels/${ch.name}`)}`).join("\n")}

export type OperationName = keyof Operations
export type ChannelName = keyof Channels

/** the statuses an operation answers by number (not 4XX or default) */
type Numbered<R> = Extract<keyof R, number>

/** What a handler is given: the request as the contract types it, already checked against the contract. */
export type Context<K extends OperationName> = {
  /** the path parameters, by their names in the contract */
  params: Operations[K]["params"]
  /** the query, with the defaults the contract gives filled in */
  query: Operations[K]["query"]
  headers: Operations[K]["headers"]
  /** the body: JSON, a form (files as UploadedFile), text or a file */
  body: Operations[K]["body"]
  /** who is calling (custom/auth.ts): always there when the operation needs authentication */
  user: Operations[K]["secured"] extends true ? User : User | undefined
  /** a paged operation: the page asked for, by its own parameter names */
  page: Operations[K]["page"]
  /** a paged operation: a list in memory cut to that page, under its own field names */
  paginate: Operations[K]["paginate"]
  /** an answer with another status the contract lists for the operation */
  respond: <S extends Numbered<Operations[K]["responses"]>>(status: S, body: Operations[K]["responses"][S], headers?: Record<string, string>) => Responded
  request: FastifyRequest
  reply: FastifyReply
  log: FastifyBaseLogger
}

/** what a handler returns: the answer when it goes well, or ctx.respond(…) */
export type Result<K extends OperationName> = Operations[K]["result"] | Responded

/** The handler of an operation: Handler<"getProduct">. For a name the contract no longer has, anything: nothing
 *  calls it any more (the export reports its file). */
export type Handler<K extends string> = K extends OperationName ? (ctx: Context<K>) => Result<K> | Promise<Result<K>> : OrphanHandler

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrphanHandler = (ctx: any) => unknown

export type Handlers = { [K in OperationName]: Handler<K> }

/** one handler per operation of the contract, from src/handlers/ */
export const handlers: Handlers = {
${ops.map((s) => `  ${s.op.name}: op_${s.op.name},`).join("\n")}
}

/** What the server does on a realtime channel: Channel<"room">. */
export type Channel<K extends string> = K extends ChannelName ? ChannelHandler<Channels[K]> : ChannelHandler<ChannelShape>

/** one connection to a channel, typed */
export type ChannelConnection<K extends ChannelName> = Connection<Channels[K]>

export const channelHandlers: { [K in ChannelName]: Channel<K> } = {
${chs.map((ch) => `  ${ch.name}: channel_${ch.name},`).join("\n")}
}

/** Sends a message to every app on a realtime channel, or to those whose address had these parameters. */
export function publish<K extends ChannelName, M extends keyof Channels[K]["send"] & string>(channel: K, params: Partial<Channels[K]["params"]> | undefined, message: M, payload: Channels[K]["send"][M]): number {
  return publishTo(channel, params as Record<string, string> | undefined, message, payload)
}
`;
}

const SERVER_TEST = `${GENERATED}
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "../app"
import { cookieValue } from "./auth"
import { redactedUrl } from "./config"
import { DOCS_PATH, HEALTH_PATH } from "./contract"
import { OPERATIONS, SELF_CHECKS } from "./operations"
import { closeReason } from "./realtime"
import { fileHeaders } from "./uploads"

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp({ config: { logLevel: "silent", docs: true } })
  await app.ready()
})

afterAll(() => app.close())

const problem = (response: { headers: Record<string, unknown>; json(): unknown }) => {
  expect(String(response.headers["content-type"])).toContain("application/problem+json")
  return response.json() as { status: number; title: string; errors?: { pointer: string }[] }
}

describe("the server", () => {
  it("routes every operation of the contract", () => {
    for (const spec of Object.values(OPERATIONS)) if (spec.url) expect(app.hasRoute({ method: spec.method, url: spec.url }), spec.method + " " + spec.path).toBe(true)
  })

  it("answers what the contract does not have with 404 problem details", async () => {
    const response = await app.inject({ method: "GET", url: "/no-such-route-in-the-contract" })
    expect(response.statusCode).toBe(404)
    expect(problem(response).status).toBe(404)
  })

  it("answers its health", async () => {
    const response = await app.inject({ method: "GET", url: HEALTH_PATH })
    expect(response.statusCode).toBe(200)
  })

  it("serves the contract in development", async () => {
    const response = await app.inject({ method: "GET", url: DOCS_PATH + "/json" })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toHaveProperty("openapi")
  })

  it.each(SELF_CHECKS.secured)("asks $method $url for credentials: 401", async ({ method, url }) => {
    const response = await app.inject({ method, url })
    expect(response.statusCode).toBe(401)
    expect(problem(response).status).toBe(401)
  })

  it.each(SELF_CHECKS.invalid)("turns down $method $url as the contract says: 400 at $pointer", async ({ method, url, payload, pointer }) => {
    const response = await app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) })
    expect(response.statusCode).toBe(400)
    expect(problem(response).errors?.map((e) => e.pointer)).toContain(pointer)
  })
})

describe("the server's safe defaults", () => {
  it("answers browsers of other sites only as CORS_ORIGINS says, and any origin (*) never with cookies", async () => {
    const elsewhere = { origin: "https://elsewhere.example" }
    expect((await app.inject({ method: "GET", url: HEALTH_PATH, headers: elsewhere })).headers["access-control-allow-origin"]).toBeUndefined()
    const open = await buildApp({ config: { logLevel: "silent", corsOrigins: ["*"] } })
    try {
      const response = await open.inject({ method: "OPTIONS", url: HEALTH_PATH, headers: { ...elsewhere, "access-control-request-method": "GET", "access-control-request-headers": "authorization" } })
      expect(response.headers["access-control-allow-origin"]).toBe("*")
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined()
    } finally {
      await open.close()
    }
  })

  it("has every answer taken as the type it says, and sandboxes a file a browser would run scripts in", async () => {
    for (const url of [HEALTH_PATH, "/no-such-route-in-the-contract"]) expect((await app.inject({ method: "GET", url })).headers["x-content-type-options"]).toBe("nosniff")
    expect(fileHeaders("image/svg+xml", "logo.svg")["content-security-policy"]).toContain("sandbox")
    expect(fileHeaders("text/html; charset=utf-8")["content-security-policy"]).toContain("sandbox")
    expect(fileHeaders("image/png", "a.png")).toMatchObject({ "content-type": "image/png", "x-content-type-options": "nosniff" })
    expect(fileHeaders("application/pdf")["content-security-policy"]).toBeUndefined()
  })

  it("keeps a credential sent in a query out of the log", () => {
    expect(redactedUrl("/realtime/rooms/1?x=1&access_token=secret")).toBe("/realtime/rooms/1?x=1&access_token=[redacted]")
    expect(redactedUrl("/products?limit=2")).toBe("/products?limit=2")
  })

  it("reads a cookie that is no valid encoding as it is, never failing the request", () => {
    expect(cookieValue("a=1; key=%E0%A4%A", "key")).toBe("%E0%A4%A")
    expect(cookieValue("a=1; key=x%20y", "key")).toBe("x y")
  })

  it("closes a realtime connection with a reason the WebSocket library takes, however long the handler's words", () => {
    const reason = closeReason("您没有权限进入这个聊天室，请先加入该群组后再尝试连接。如果您认为这是一个错误，请联系管理员。")
    expect(Buffer.byteLength(reason)).toBeLessThanOrEqual(123)
    expect(reason.length).toBeGreaterThan(30)
    expect(closeReason("not implemented")).toBe("not implemented")
  })
})
`;

/* ---------- the seeded files ---------- */

/** a schema as type text for a comment: a model's name, or the shape in a few lines */
function commentType(schema: JsonSchema | undefined): string[] {
  if (schema === undefined) return ["unknown"];
  return schemaTypeTs(schema, { comments: false, binary: "UploadedFile", maxDepth: 3 }, "").split("\n");
}

/** the contract of an operation, as lines of a comment */
function contractLines(s: ServerOperation, schemes: ServerContract["schemes"]): string[] {
  const out = [`  ${s.op.method} ${commentText(s.op.path, 200)}  (operationId ${commentText(s.op.operationId, 80)})`];
  if (s.summary) out.push(`  summary: ${commentText(s.summary)}`);
  if (s.description) out.push(`  description: ${commentText(s.description)}`);
  if (s.deprecated) out.push("  deprecated");
  out.push(
    `  security: ${
      s.security.length
        ? s.security
            .map((r) =>
              Object.keys(r).length
                ? Object.keys(r)
                    .map((k) => `${commentText(k, 40)}${schemes[k] ? ` (${commentText(schemes[k].type, 20)}${schemes[k].scheme ? ` ${commentText(schemes[k].scheme, 20)}` : ""})` : ""}`)
                    .join(" + ")
                : "anyone",
            )
            .join(" or ")
        : "none (anyone may call it)"
    }`,
  );
  const typed = (label: string, schema: JsonSchema | undefined) => {
    const lines = commentType(schema);
    out.push(`  ${label}${lines[0]}`, ...lines.slice(1).map((l) => `  ${l}`));
  };
  for (const p of s.params) typed(`${p.in} ${commentText(p.name, 60)}${p.required ? "" : "?"}: `, p.schema);
  if (s.body) typed(`body (${commentText(s.body.contentType, 60)}${s.body.required ? "" : ", optional"}): `, s.body.kind === "binary" ? { type: "string", format: "binary" } : s.body.schema);
  if (s.pagination) {
    const p = s.pagination;
    out.push(`  pages by ${p.style}: items in ${commentText(p.items, 40)}, ${p.style === "cursor" ? `next cursor in ${commentText(p.nextField, 40)}` : `total in ${commentText(p.totalField, 40)}`} (ctx.page, ctx.paginate)`);
  }
  for (const r of s.responses) {
    const head = `answer ${r.status}${r.contentType ? ` (${commentText(r.contentType, 60)})` : ""}`;
    if (r.kind === "json") typed(`${head}: `, r.schema);
    else out.push(`  ${head}: ${r.kind === "none" ? "no body" : r.kind === "file" ? "a file (fileReply)" : "text"}`);
  }
  return out;
}

function stubSource(s: ServerOperation, c: ServerContract): string {
  const ok = s.success ? s.success.status : String(s.successStatus);
  return `import { notImplemented } from "../generated/errors";
import type { Handler } from "../generated/handlers";

${commentLines([
  "Custom code (written by people or AI): what the server does for this operation. The export",
  "created this file once and never changes it again. Until it is written, the operation answers",
  "501 Not Implemented. The contract it answers to, as the design had it when this file was made",
  "(../generated/types.ts always has the current one):",
  "",
  ...contractLines(s, c.schemes),
  "",
  "The handler gets ctx: params, query, headers and body, already checked against the contract;",
  `ctx.user, who is calling. It returns the ${commentText(ok, 10)} answer, or ctx.respond(status, body) for another`,
  "status the contract lists, or throws notFound(), badRequest()… from ../generated/errors.",
])}
const ${s.op.name}: Handler<"${s.op.name}"> = async () => {
  throw notImplemented("${s.op.name}");
};

export default ${s.op.name};
`;
}

function channelStubSource(ch: ServerChannel, c: ServerContract): string {
  const payload = (name: string) => {
    const p = ch.messages.find((m) => m.name === name)?.payload;
    return p === undefined ? "unknown" : schemaTypeTs(p, { comments: false, maxDepth: 1 }).replace(/\s+/g, " ");
  };
  const list = (names: string[]) => (names.length ? names.map((n) => `${commentText(n, 60)} (${commentText(payload(n), 80)})`).join(", ") : "nothing");
  return `import { notImplemented } from "../../generated/errors";
import type { Channel } from "../../generated/handlers";

${commentLines([
  "Custom code (written by people or AI): what the server does on this realtime channel. The",
  "export created this file once and never changes it again. Until it is written, an app that",
  "connects is turned away (the connection closes with 4501). The channel, as the design had it",
  "when this file was made (../../generated/types.ts always has the current contract):",
  "",
  `  ${ch.transport} ${commentText(c.realtimePrefix, 60)}${commentText(ch.address, 200)}  (channel ${commentText(ch.id, 60)})`,
  ...(ch.summary ? [`  summary: ${commentText(ch.summary)}`] : []),
  ...(ch.description ? [`  description: ${commentText(ch.description)}`] : []),
  `  the server sends: ${list(ch.send)}`,
  `  the server receives: ${list(ch.receive)}`,
  "",
  "onConnect(connection) may turn an app away (throw unauthorized()…); onMessage(connection,",
  "{ message, payload }) gets each message the app sends, checked against the contract;",
  "connection.send(message, payload) answers it, and publish(…) from ../../generated/handlers",
  "sends to every app on the channel.",
])}
const ${ch.name}: Channel<"${ch.name}"> = {
  onConnect() {
    throw notImplemented("${ch.name}");
  },
};

export default ${ch.name};
`;
}

function authSource(c: ServerContract): string {
  const schemes = Object.entries(c.schemes).map(([name, s]) => {
    const how = s.type === "apiKey" ? `an API key in the ${commentText(s.in, 20)} ${commentText(s.name, 60)}` : s.type === "http" ? `http ${commentText(s.scheme, 20)}${s.bearerFormat ? ` (${commentText(s.bearerFormat, 20)})` : ""}` : commentText(s.type, 30);
    return `  scheme ${commentText(name, 60)}: ${how}`;
  });
  return `import type { Credential } from "../generated/auth";
import { notImplemented } from "../generated/errors";

${commentLines([
  "Custom code (written by people or AI). The export created this file once and never changes it",
  "again; the generated code uses only what it exports: the type User and authenticate().",
  "",
  "The contract says which operations need a user and how one proves who it is (its security",
  "schemes). The generated code reads the credential a request carries and calls authenticate()",
  "with it: return the user it stands for, or null when it stands for no one (the request gets",
  "401). Throw forbidden() from ../generated/errors when the user may not do this (scopes): 403.",
  "Realtime connections bring a bearer token (header, or ?access_token=) the same way.",
  ...(schemes.length ? ["", ...schemes] : ["", "  The contract has no security schemes yet: every operation is open."]),
])}

/** who is calling: handlers read it as ctx.user */
export type User = {
  id: string;
};

export async function authenticate(credential: Credential): Promise<User | null> {
  throw notImplemented("authenticate (" + credential.scheme + ")");
}
`;
}

const DB = `${commentLines([
  "Custom code (written by people or AI). The export created this file once and never changes it",
  "again, and nothing generated uses it: it is where the data layer goes. Open the database here",
  "and export what the handlers need (AGENTS.md, Persistence, lists the choices). Until then,",
  "handlers can keep their data in memory with table(): enough to make them real, gone on restart.",
])}

/** rows in memory, by id */
export function table<Row extends { id: string }>(rows: Row[] = []) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    all: (): Row[] => [...byId.values()],
    get: (id: string): Row | undefined => byId.get(id),
    put: (row: Row): Row => {
      byId.set(row.id, row);
      return row;
    },
    delete: (id: string): boolean => byId.delete(id),
  };
}
`;

const SETUP = `import type { FastifyInstance } from "fastify";

${commentLines([
  "Custom code (written by people or AI). The export created this file once and never changes it",
  "again. setup() runs before the contract's routes are added: register plugins, hooks, a database",
  "connection (close it in an onClose hook), and routes the contract does not have.",
])}
export async function setup(app: FastifyInstance): Promise<void> {
  void app;
}
`;

const TSCONFIG = jsonFile({ extends: "../tsconfig.base.json", compilerOptions: { lib: ["ES2022"], types: ["node"], verbatimModuleSyntax: true }, include: ["src"] });

const BUILD = (scope: string) => `${GENERATED}
// Bundles the server into dist/main.js: its own code and the workspace packages it imports; the npm packages it
// depends on stay imports, installed beside it.
import { readFileSync } from "node:fs"
import { build } from "esbuild"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
const external = Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).filter((name) => !name.startsWith(${str(`${scope}/`)}))

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  outfile: "dist/main.js",
  external,
  logLevel: "warning",
  // the mark src/main.ts reads: this is the built server, so it runs as production unless NODE_ENV says otherwise
  banner: { js: "globalThis.m3eBuilt = true;" },
})
`;

/** the server's runtime dependencies, and what it is built and checked with */
export const SERVER_DEPENDENCIES = ["@fastify/cors", "@fastify/multipart", "@fastify/swagger", "@fastify/swagger-ui", "@fastify/websocket", "ajv", "ajv-formats", "fastify"];
const SERVER_DEV = ["@types/node", "@types/ws", "esbuild", "tsx", "typescript", "vitest"];

/** the contract as the server reads it, made once per product */
const read = new WeakMap<object, ServerContract>();
export function contractFor(ctx: ProductContext): ServerContract {
  let c = read.get(ctx.api);
  if (!c) {
    c = serverContract(ctx.api);
    read.set(ctx.api, c);
  }
  return c;
}

export const serverTarget: ProductTarget = {
  id: "server",
  build(ctx: ProductContext): Workspace {
    const c = contractFor(ctx);
    for (const w of c.warnings) ctx.warnings.push(`server: ${w}`);
    const schemas = new ValidatorSchemas(c.spec);
    const names = typeNames(c);
    const printer = new TypePrinter(c, names);
    const ex = printer.examples;
    const pins = (list: string[]) => Object.fromEntries(list.map((d) => [d, ctx.version(d)]));
    const files: ProductFiles = {
      "package.json": {
        ...generated(
          jsonFile({
            name: `${ctx.scope}/server`,
            version: "0.1.0",
            private: true,
            type: "module",
            exports: { ".": "./src/app.ts" },
            scripts: { dev: "tsx watch src/main.ts", build: "node build.mjs", start: "node dist/main.js", typecheck: "tsc --noEmit -p .", test: "vitest run" },
            dependencies: pins(SERVER_DEPENDENCIES),
            devDependencies: pins(SERVER_DEV),
          }),
        ),
        merge: "package.json",
      },
      "tsconfig.json": generated(TSCONFIG),
      "build.mjs": generated(BUILD(ctx.scope)),
      ".env.example": generated(ENV_EXAMPLE),
      "src/main.ts": generated(MAIN),
      "src/app.ts": generated(APP),
      "src/generated/operations.ts": generated(operationsSource(c, schemas, ex)),
      "src/generated/channels.ts": generated(channelsSource(c, schemas)),
      "src/generated/types.ts": generated(printer.source()),
      "src/generated/handlers.ts": generated(handlersSource(c, names)),
      "src/generated/config.ts": generated(CONFIG),
      "src/generated/errors.ts": generated(ERRORS),
      "src/generated/auth.ts": generated(AUTH),
      "src/generated/validation.ts": generated(VALIDATION),
      "src/generated/uploads.ts": generated(UPLOADS),
      "src/generated/pagination.ts": generated(PAGINATION),
      "src/generated/respond.ts": generated(RESPOND),
      "src/generated/routes.ts": generated(ROUTES),
      "src/generated/realtime.ts": generated(REALTIME),
      "src/generated/docs.ts": generated(DOCS),
      "src/generated/server.test.ts": generated(SERVER_TEST),
      "src/custom/setup.ts": seeded(SETUP),
      "src/custom/auth.ts": seeded(authSource(c)),
      "src/custom/db.ts": seeded(DB),
    };
    /* the contract last: its definitions are what the operations' and channels' schemas refer to */
    files["src/generated/contract.ts"] = generated(contractSource(c, ctx, schemas));
    for (const s of c.operations) files[`src/handlers/${s.op.name}.ts`] = seeded(stubSource(s, c));
    for (const ch of c.channels) files[`src/handlers/channels/${ch.name}.ts`] = seeded(channelStubSource(ch, c));
    for (const d of schemas.dropped.slice(0, 5)) ctx.warnings.push(`server: the validator leaves out ${d} (it leads nowhere it can check)`);
    return {
      dir: "server",
      pkg: `${ctx.scope}/server`,
      scripts: { dev: true, build: true, typecheck: true, test: true },
      files,
      summary: { zh: "后端骨架（Node + Fastify）：只在 src/handlers 和 src/custom 写代码", en: "the back end's skeleton (Node + Fastify): code goes only in src/handlers and src/custom" },
      agents: serverAgents(c),
    };
  },
};

/** the server's section of AGENTS.md */
function serverAgents(c: ServerContract): string {
  const any = c.operations[0]?.op.name ?? "getThing";
  return `## The server (server/)

The back end is Node + TypeScript on Fastify. Everything in \`server/src/generated/\`, and \`src/app.ts\`,
\`src/main.ts\`, \`build.mjs\`, \`.env.example\`, is generated from the API contract (\`packages/api/openapi.yaml\`,
\`packages/api/asyncapi.yaml\`) and rewritten by every export: **never edit it**. You write only in:

| File | What |
| --- | --- |
| \`server/src/handlers/<operationId>.ts\` | One per operation of the contract: what the server does for it. |
| \`server/src/handlers/channels/<channel>.ts\` | One per realtime channel: what the server does when an app connects and sends a message. |
| \`server/src/custom/auth.ts\` | \`authenticate(credential)\`: who a token, key or password stands for (\`User\`). |
| \`server/src/custom/db.ts\` | The data layer (nothing is imposed). |
| \`server/src/custom/setup.ts\` | Fastify plugins, hooks, a database connection, routes outside the contract. |

Each of these files is created once by the export and never touched again. Their exports are what the generated code
uses (\`export default\` of a handler, \`User\` and \`authenticate\`, \`setup\`): keep those names and signatures.

### Handlers

A new handler throws \`notImplemented()\` (the API answers 501) and its comment shows the contract it answers to. Write
it like this:

\`\`\`ts
import { notFound } from "../generated/errors";
import type { Handler } from "../generated/handlers";

const ${any}: Handler<"${any}"> = async (ctx) => {
  // ctx.params, ctx.query, ctx.headers, ctx.body: typed from the contract and already checked against it
  // ctx.user: who is calling (always there when the operation needs authentication)
  // return the success answer; ctx.respond(status, body) for another status the contract lists;
  // throw notFound(), badRequest(detail, errors), conflict(), forbidden()… for errors (problem+json)
};

export default ${any};
\`\`\`

- The types are in \`server/src/generated/types.ts\` (\`Operations["${any}"]\`): \`body\`, \`params\`, \`query\`,
  \`responses\` by status, \`result\`. A handler that returns something the contract does not allow does not typecheck,
  and in development the answer is also checked at run time (a mismatch is a 500 that says where).
- Errors are RFC 9457 problem details (\`application/problem+json\`): throw \`HttpError\` or a helper of
  \`../generated/errors\`; give \`errors: [{ pointer: "#/field", detail }]\` for field-by-field problems. Anything else
  thrown is a 500 that tells the client nothing and logs the stack.
- Paged operations: \`ctx.page\` is the page asked for (the contract's own parameter names and default size);
  \`ctx.paginate(list)\` answers from a list in memory; \`encodeCursor\` / \`decodeCursor\` in
  \`../generated/pagination\` make opaque cursors for a database query.
- Uploads (\`multipart/form-data\`): file fields arrive as \`UploadedFile\` (\`filename\`, \`mimetype\`, \`size\`,
  \`data\`: a Buffer), checked against the contract's types and \`UPLOAD_MAX_BYTES\`. Answer a file with
  \`fileReply(data, { contentType, filename })\` from \`../generated/uploads\`.
- Realtime: \`Channel<"name">\` handlers get \`connection.send(message, payload)\`; \`publish(channel, params, message,
  payload)\` from \`../generated/handlers\` reaches every app on a channel (from an HTTP handler too). WebSocket frames
  are the messages' JSON payloads exactly as the contract has them; SSE events carry the message's name.

### Authentication

The contract's security schemes and each operation's requirements decide who may call what. The generated code reads
the credential (\`Authorization: Bearer …\`, \`Basic …\`, an API key in a header, query or cookie) and calls
\`authenticate(credential)\` in \`server/src/custom/auth.ts\`, which returns a \`User\` or null. No credential, or one it
turns down, is 401 before the handler runs; throw \`forbidden()\` there for missing scopes (403). Signing in is an
operation of the contract (its handler issues the token, in the fields the contract names); verify that token in
\`authenticate\`. Extend \`User\` with what handlers need.

### Persistence

No database or ORM is imposed. Start with \`table()\` from \`server/src/custom/db.ts\` (in memory) to make handlers
real, then choose: SQLite (\`better-sqlite3\`, or \`node:sqlite\`), PostgreSQL (\`pg\` or \`postgres\`) with a query
builder (Kysely, Drizzle) or Prisma. Install with \`npm install <package> -w server\` (the export keeps it), open the
connection in \`custom/db.ts\` / \`custom/setup.ts\` (close it in an \`onClose\` hook), read settings from \`process.env\`
(add them to your \`.env\`), and keep migrations and schema files in folders of your own under \`server/\`. Map rows to
the contract's types from \`../generated/types\`.

### Running and checking

\`\`\`bash
npm run dev -w server                               # http://127.0.0.1:3001, Swagger UI at ${c.docsPath}, health at ${c.healthPath}
npm test -w server                                  # the server's own checks (routing, 401, 400, problem+json)
npm run contract -w contract-tests                  # every operation against the contract: implemented / pending / failing
npm run contract -w contract-tests -- --strict      # pending (501) fails too
npm run contract -w contract-tests -- --strict --only ${any}
\`\`\`

Before you finish: \`--strict --only <every operation and channel you wrote>\` must pass (and \`--strict\` alone once the
whole back end is written), besides the root's \`npm run typecheck && npm run lint && npm test && npm run build\`.

The contract tests start the server themselves (or test a running one: \`--base-url http://127.0.0.1:3001\`). Secured
operations need a credential: \`CONTRACT_TOKEN\` (bearer), \`CONTRACT_API_KEY\`, \`CONTRACT_BASIC=user:password\`,
which your \`authenticate\` must accept. Configuration is read from the environment or \`server/.env\` (see
\`server/.env.example\`): \`PORT\`, \`HOST\`, \`LOG_LEVEL\`, \`CORS_ORIGINS\`, \`UPLOAD_MAX_BYTES\`, \`REALTIME_PREFIX\`;
\`NODE_ENV=production\` turns off the docs and the answer checks. The built server (\`npm start\`) runs as production
unless \`NODE_ENV\` says otherwise; \`npm run dev\` runs as development.

### Security

What the skeleton already does, and must keep doing: every operation the contract secures is authenticated before its
body is read, and \`authenticate\` starts out answering 501, so nothing gets in until you write it; requests are checked
against the contract (400); errors other than \`HttpError\` answer 500 with no detail (the stack goes to the log only);
CORS allows the web and mobile dev servers in development and nothing in production until \`CORS_ORIGINS\` lists the
app's origins (\`*\` allows any origin but never with cookies); every answer is \`X-Content-Type-Options: nosniff\`, and
a file answer of a type a browser would run scripts in (SVG, HTML, XML) is sandboxed by its Content-Security-Policy;
a credential in a query (\`access_token\` of the realtime channels, an API key in the query) is left out of the log.

What is yours to do:

- \`authenticate\`: verify tokens properly (signature, expiry, audience; a library such as \`jose\`), never trust what a
  token says without checking it, and compare secrets in constant time (\`crypto.timingSafeEqual\`). Store passwords
  only as slow hashes (\`argon2\` or \`bcrypt\`). Never log a token, a password or a whole request body.
- Authorization is per record: \`ctx.user\` says who calls, not what they may touch. Check that the record a handler
  reads or changes belongs to that user (or their role allows it) before answering; a 404 is better than a 403 for
  someone else's record.
- Uploads: \`mimetype\` is what the client said. Check the bytes when it matters (a picture is a picture), store files
  outside the code under names you make (never the client's \`filename\` as a path), and answer them with
  \`fileReply\`, giving a \`filename\` for downloads.
- Realtime: \`onConnect\` decides who may listen; a connection without a token has no \`user\`. Turn away who may not
  (\`throw unauthorized()\` / \`forbidden()\`) and check the channel's parameters (a room id) against the user.
- There is no rate limit: add one before the API is public (\`@fastify/rate-limit\` in \`custom/setup.ts\`), at least on
  signing in and anything that sends mail or costs money. The request body is limited to 1 MB (uploads to
  \`UPLOAD_MAX_BYTES\`, 20 files, 200 fields).
- A \`pattern\` of the contract is checked against every request: a pattern that repeats something that itself
  repeats with an optional part (\`^([a-z0-9]+[._-]?)*$\`) can take exponential time on a string it does not match.
  Keep patterns simple and give the field a \`maxLength\`; change them in the design, not here.
- Secrets live in the environment (\`server/.env\` is never committed); set \`NODE_ENV=production\` (or run
  \`npm start\`), \`HOST=0.0.0.0\` behind a reverse proxy that terminates TLS, and \`CORS_ORIGINS\` to the app's origins.

### When the contract is wrong

Do not work around it: no statuses, fields or routes the contract does not have, and no edits under \`generated/\`
(the next export reports them as conflicts). Stop and report the change the contract needs (the operation, the field
or status, why) so it is made in the design in M3E Canvas Pro (its API tab, its AI, or the MCP tools
\`update_endpoint\`, \`update_model\`, \`add_endpoint\`), then exported again. The export rewrites the types and routes,
adds a stub for each new operation and leaves every handler you wrote as it is; a handler whose operation is gone stays
(the export reports it) until you delete it.
`;
}
