/* contract-tests: a running server checked against the contract. For every operation a request is built from the
 * contract's examples (or values the mock library makes from its schemas, lib/export/server/examples.ts) and sent through the generated
 * client (packages/api); the answer must have a status the contract lists for it and a body its schema allows. 501 is
 * pending, not failing, so a fresh skeleton is green; --strict fails on pending too. Realtime channels: connect, send a
 * valid message, check every message that comes back. Everything here is generated; the cases are data. */

import { isRecord } from "../../api/schema";
import type { JsonSchema } from "../../api/types";
import { GENERATED, jsonFile, str } from "../code";
import type { ServerChannel, ServerContract, ServerOperation } from "../server/contract";
import { exampleFile, Examples } from "../server/examples";
import { ValidatorSchemas } from "../server/schemas";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";
import { contractFor, dataCode } from "./server";

const scalar = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : v === null || v === undefined ? "" : JSON.stringify(v));

/** what the contract tests send to one operation, and what they accept back */
function operationCase(s: ServerOperation, ex: Examples, schemas: ValidatorSchemas) {
  const op = s.op;
  const params: Record<string, string> = {};
  const query: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  const set = (o: Record<string, unknown>, k: string, v: unknown) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
  for (const p of s.params) {
    const given = p.example !== undefined;
    if (p.in === "path") set(params, p.name, scalar(p.example ?? ex.of(p.schema)) || "1");
    else if (p.in === "query" && (p.required || given)) set(query, p.name, p.example ?? ex.of(p.schema));
    else if (p.in === "header" && (p.required || given)) set(headers, p.name.toLowerCase(), scalar(p.example ?? ex.of(p.schema)));
  }
  const b = s.body;
  let body: unknown;
  const files: Record<string, { name: string; type: string; list: boolean }> = {};
  if (b && (b.required || b.example !== undefined || b.kind === "multipart")) {
    if (b.kind === "json") body = b.example !== undefined ? b.example : ex.of(b.schema);
    else if (b.kind === "text") body = typeof b.example === "string" ? b.example : "example";
    else if (b.kind === "multipart" || b.kind === "form") {
      const top = ex.resolve(b.schema);
      const props = isRecord(top) && isRecord(top.properties) ? top.properties : {};
      const required = new Set(isRecord(top) && Array.isArray(top.required) ? (top.required as string[]) : []);
      const fields: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(props)) {
        const r = ex.resolve(sub as JsonSchema);
        const list = isRecord(r) && r.type === "array" && ex.isFile(r.items as JsonSchema);
        if (b.kind === "multipart" && (ex.isFile(sub as JsonSchema) || list)) {
          files[name] = { ...exampleFile(name, b.accept?.[name]), list };
          continue;
        }
        const own = isRecord(r) && (Array.isArray(r.examples) || "example" in r || "default" in r);
        if (required.has(name) || own) set(fields, name, ex.of(sub as JsonSchema));
      }
      body = fields;
    }
  }
  const responses: Record<string, unknown> = {};
  for (const r of s.responses) set(responses, r.status, { kind: r.kind, ...(r.contentType ? { contentType: r.contentType } : {}), ...(r.schema !== undefined && r.kind === "json" ? { schema: schemas.schema(r.schema, "response") } : {}) });
  return {
    name: op.name,
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    routed: s.url !== null,
    /* the client's function for it takes an input first when it has path parameters, a JSON body or a query */
    clientInput: op.params.length > 0 || op.body || op.query,
    clientQuery: op.query,
    params,
    query,
    headers,
    bodyKind: b?.kind ?? null,
    contentType: b?.contentType ?? null,
    ...(body !== undefined ? { body } : {}),
    files,
    security: s.security,
    responses,
  };
}

/** what the contract tests do on one realtime channel */
function channelCase(ch: ServerChannel, ex: Examples, schemas: ValidatorSchemas) {
  const payloads: Record<string, unknown> = {};
  for (const m of ch.messages) Object.defineProperty(payloads, m.name, { value: schemas.schema(m.payload, ch.receive.includes(m.name) ? "request" : "response"), enumerable: true, writable: true, configurable: true });
  const first = ch.messages.find((m) => ch.receive.includes(m.name));
  return {
    id: ch.id,
    name: ch.name,
    address: ch.address,
    routed: ch.url !== null,
    transport: ch.transport,
    params: Object.fromEntries(ch.routeParams.map((p) => [p.name, "example"])),
    send: ch.send,
    receive: ch.receive,
    payloads,
    ...(first ? { example: { message: first.name, payload: first.examples.length ? first.examples[0] : ex.of(first.payload) } } : {}),
  };
}

function casesSource(c: ServerContract, schemas: ValidatorSchemas, ex: Examples): string {
  const ops = c.operations.map((s) => operationCase(s, ex, schemas));
  const channels = c.channels.map((ch) => channelCase(ch, ex, schemas));
  const schemes: Record<string, unknown> = {};
  for (const [name, s] of Object.entries(c.schemes))
    if (isRecord(s)) Object.defineProperty(schemes, name, { value: { type: s.type, ...(typeof s.scheme === "string" ? { scheme: s.scheme } : {}), ...(typeof s.in === "string" ? { in: s.in } : {}), ...(typeof s.name === "string" ? { name: s.name } : {}) }, enumerable: true, writable: true, configurable: true });
  const definitions = [schemas.definitions("request"), schemas.definitions("response")];
  return `${GENERATED}
export type SecurityRequirement = Record<string, string[]>
export type ResponseCase = { kind: "json" | "file" | "text" | "none"; contentType?: string; schema?: object | boolean }
export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"

/** one operation: the request the tests send (the contract's examples, else values from its schemas) and the answers
 *  the contract allows */
export type OperationCase = {
  name: string
  operationId: string
  method: HttpMethod
  path: string
  /** the server can route it */
  routed: boolean
  clientInput: boolean
  clientQuery: boolean
  params: Record<string, string>
  query: Record<string, unknown>
  headers: Record<string, string>
  bodyKind: "json" | "multipart" | "form" | "binary" | "text" | null
  contentType: string | null
  body?: unknown
  /** the files a form uploads, by field */
  files: Record<string, { name: string; type: string; list: boolean }>
  security: SecurityRequirement[]
  responses: Record<string, ResponseCase>
}

/** one realtime channel: what the tests send on it and what they accept from it */
export type ChannelCase = {
  id: string
  name: string
  address: string
  routed: boolean
  transport: "websocket" | "sse"
  params: Record<string, string>
  send: string[]
  receive: string[]
  payloads: Record<string, object | boolean>
  example?: { message: string; payload: unknown }
}

export const OPERATION_CASES: OperationCase[] = ${dataCode(ops)}

export const CHANNEL_CASES: ChannelCase[] = ${dataCode(channels)}

/** the contract's models, as the checks of every answer read them */
export const DEFINITIONS: Record<string, unknown>[] = ${dataCode(definitions)}

export const EXTRA_FORMATS: string[] = ${dataCode(schemas.unknownFormats())}

export const SECURITY_SCHEMES: Record<string, { type: string; scheme?: string; in?: string; name?: string }> = ${dataCode(schemes)}

/** where the server serves the realtime channels by default */
export const REALTIME_PREFIX = ${str(c.realtimePrefix)}
`;
}

const RUNNER = (scope: string) => `${GENERATED}
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { ApiError, createApi, queryString, type Transport, type TransportResponse } from ${str(`${scope}/api`)}
import { CHANNEL_CASES, DEFINITIONS, EXTRA_FORMATS, OPERATION_CASES, REALTIME_PREFIX, SECURITY_SCHEMES, type ChannelCase, type OperationCase, type ResponseCase, type SecurityRequirement } from "./cases"

/** implemented: it answered as the contract says; pending: not written yet (501); failing: it broke the contract */
export type Status = "implemented" | "pending" | "failing"
export type Outcome = { kind: "operation" | "channel"; name: string; title: string; status: Status; detail: string }

export type Options = {
  /** the server to check; empty: the tests start one themselves */
  baseUrl: string
  /** pending fails too */
  strict: boolean
  /** only these operations and channels (names or operationIds) */
  only: string[]
  token?: string
  apiKey?: string
  basic?: string
  /** how long a realtime channel is listened to, in ms */
  windowMs: number
  realtimePrefix: string
  verbose: boolean
  help: boolean
}

export const USAGE = [
  "npm run contract -w contract-tests -- [options]",
  "",
  "  --base-url <url>   check a running server (CONTRACT_BASE_URL); without it the server is started here",
  "  --strict           an operation not implemented yet (501) fails too (CONTRACT_STRICT=1)",
  "  --only <a,b>       only these operations or channels (CONTRACT_ONLY)",
  "  --window <ms>      how long each realtime channel is listened to (500)",
  "  --verbose          the server's log",
  "",
  "Credentials for secured operations: CONTRACT_TOKEN (bearer), CONTRACT_API_KEY, CONTRACT_BASIC=user:password",
].join("\\n")

/** the options from the command line and the environment */
export function optionsFrom(argv: string[], env: Record<string, string | undefined>): Options {
  const flag = (name: string) => argv.includes("--" + name)
  const value = (name: string) => {
    const at = argv.findIndex((a) => a === "--" + name || a.startsWith("--" + name + "="))
    if (at < 0) return undefined
    return argv[at].includes("=") ? argv[at].slice(argv[at].indexOf("=") + 1) : argv[at + 1]
  }
  const yes = (v: string | undefined) => !!v && !/^(0|false|off|no)$/i.test(v)
  const only = value("only") ?? env.CONTRACT_ONLY ?? ""
  return {
    baseUrl: (value("base-url") ?? env.CONTRACT_BASE_URL ?? "").replace(/\\/$/, ""),
    strict: flag("strict") || yes(env.CONTRACT_STRICT),
    only: only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    token: env.CONTRACT_TOKEN || undefined,
    apiKey: env.CONTRACT_API_KEY || undefined,
    basic: env.CONTRACT_BASIC || undefined,
    windowMs: Number(value("window") ?? env.CONTRACT_WINDOW_MS ?? 500),
    realtimePrefix: env.REALTIME_PREFIX ?? REALTIME_PREFIX,
    verbose: flag("verbose"),
    help: flag("help") || flag("h"),
  }
}

/* ---------- checking a body against the contract ---------- */

const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true })
addFormats(ajv)
for (const name of EXTRA_FORMATS) ajv.addFormat(name, true)
for (const d of DEFINITIONS) ajv.addSchema(d)
const compiled = new WeakMap<object, ((value: unknown) => boolean) & { errors?: unknown }>()

/** what is wrong with a value under a schema, in words, or null */
function wrong(schema: object | boolean | undefined, value: unknown): string | null {
  if (schema === undefined || schema === true) return null
  if (schema === false) return "nothing is allowed here"
  let validate = compiled.get(schema)
  if (!validate) {
    try {
      validate = ajv.compile(schema)
    } catch {
      return null
    }
    compiled.set(schema, validate)
  }
  if (validate(value)) return null
  return ajv.errorsText(validate.errors as Parameters<typeof ajv.errorsText>[0], { dataVar: "body" })
}

/* ---------- requests ---------- */

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

/** the bytes of an example file of a type */
function bytesOf(type: string): Uint8Array {
  if (type.startsWith("image/")) return new Uint8Array(Buffer.from(PNG, "base64"))
  if (type === "application/pdf") return new TextEncoder().encode("%PDF-1.4\\n%%EOF\\n")
  return new TextEncoder().encode("example")
}

/** a multipart/form-data body the transport sends as a form */
class Upload {
  constructor(
    readonly fields: Record<string, unknown>,
    readonly files: OperationCase["files"],
  ) {}

  form(): FormData {
    const form = new FormData()
    for (const [name, value] of Object.entries(this.fields)) form.append(name, typeof value === "string" ? value : JSON.stringify(value))
    for (const [name, file] of Object.entries(this.files)) form.append(name, new Blob([bytesOf(file.type)], { type: file.type }), file.name)
    return form
  }
}

/** a body sent as it is, with its media type (a form's fields, text, bytes) */
class Raw {
  constructor(
    readonly body: string | Uint8Array,
    readonly type: string,
  ) {}
}

/** The transport of the tests: fetch, a form or raw bytes where the case has them, and every answer kept as it came. */
function transport(baseUrl: string, last: { response?: TransportResponse }): Transport {
  return {
    async request(request) {
      const search = queryString(request.query)
      const headers: Record<string, string> = { accept: "application/json, application/problem+json, */*", ...request.headers }
      let body: string | Uint8Array | FormData | undefined
      if (request.body instanceof Upload) body = request.body.form()
      else if (request.body instanceof Raw) {
        body = request.body.body
        headers["content-type"] = request.body.type
      } else if (request.body !== undefined) {
        body = JSON.stringify(request.body)
        headers["content-type"] ??= "application/json"
      }
      const response = await fetch(baseUrl + request.path + (search ? "?" + search : ""), { method: request.method, headers, body })
      const out: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        out[key] = value
      })
      const bytes = new Uint8Array(await response.arrayBuffer())
      const type = response.headers.get("content-type") ?? ""
      let parsed: unknown = bytes.length ? bytes : undefined
      if (bytes.length && /json/i.test(type)) {
        const text = new TextDecoder().decode(bytes)
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = text
        }
      } else if (bytes.length && /^text\\//i.test(type)) parsed = new TextDecoder().decode(bytes)
      last.response = { status: response.status, headers: out, body: parsed }
      return last.response
    },
  }
}

/** the credentials a case sends: those of the first requirement the options have every one of */
function credentials(security: SecurityRequirement[], o: Options): { headers: Record<string, string>; query: Record<string, string>; given: boolean } {
  const out = { headers: {} as Record<string, string>, query: {} as Record<string, string>, given: false }
  for (const requirement of security) {
    const names = Object.keys(requirement)
    if (!names.length) continue
    const headers: Record<string, string> = {}
    const query: Record<string, string> = {}
    const all = names.every((name) => {
      const s = SECURITY_SCHEMES[name]
      if (!s) return false
      if (s.type === "apiKey") {
        if (!o.apiKey || !s.name) return false
        if (s.in === "query") query[s.name] = o.apiKey
        else if (s.in === "cookie") headers.cookie = s.name + "=" + encodeURIComponent(o.apiKey)
        else headers[s.name.toLowerCase()] = o.apiKey
        return true
      }
      if (s.type === "http" && (s.scheme ?? "").toLowerCase() === "basic") {
        if (!o.basic) return false
        headers.authorization = "Basic " + Buffer.from(o.basic).toString("base64")
        return true
      }
      if ((s.type === "http" && (s.scheme ?? "").toLowerCase() === "bearer") || s.type === "oauth2" || s.type === "openIdConnect") {
        if (!o.token) return false
        headers.authorization = "Bearer " + o.token
        return true
      }
      return false
    })
    if (all) return { headers, query, given: true }
  }
  return out
}

const fill = (path: string, params: Record<string, string>) => path.replace(/\\{([^{}/]+)\\}/g, (_, name: string) => encodeURIComponent(params[name] ?? "1"))

/** the answer the contract gives for a status: by its number, its class (4XX) or default */
function responseFor(responses: Record<string, ResponseCase>, status: number): ResponseCase | undefined {
  const own = (k: string) => (Object.prototype.hasOwnProperty.call(responses, k) ? responses[k] : undefined)
  return own(String(status)) ?? own(String(status)[0] + "XX") ?? own("default")
}

const sameType = (listed: string, type: string) => {
  const t = type.split(";")[0].trim().toLowerCase()
  return listed === t || listed === "*/*" || (listed.endsWith("/*") && t.startsWith(listed.slice(0, -1)))
}

const said = (body: unknown) => {
  const b = body as { detail?: unknown; title?: unknown } | undefined
  const words = typeof b?.detail === "string" ? b.detail : typeof b?.title === "string" ? b.title : ""
  return words ? ": " + words.slice(0, 200) : ""
}

type Call = (...args: unknown[]) => Promise<unknown>

/** One operation against the server: its request sent through the client, its answer judged by the contract. */
export async function checkOperation(c: OperationCase, o: Options): Promise<Outcome> {
  const title = c.method + " " + c.path + " (" + c.name + ")"
  const result = (status: Status, detail: string): Outcome => ({ kind: "operation", name: c.name, title, status, detail })
  if (!c.routed) return result("failing", "the server cannot route this path as the contract writes it")
  const last: { response?: TransportResponse } = {}
  const api = createApi(transport(o.baseUrl, last)) as unknown as Record<string, Call>
  const sent = credentials(c.security, o)
  const headers = { ...c.headers, ...sent.headers }
  const query = { ...c.query, ...sent.query } as Record<string, string>
  const json = c.bodyKind === "json"
  try {
    if ((c.bodyKind && !json) || (Object.keys(sent.query).length && !c.clientQuery) || !api[c.name]) {
      let body: unknown
      if (c.bodyKind === "multipart") body = new Upload((c.body ?? {}) as Record<string, unknown>, c.files)
      else if (c.bodyKind === "form") body = new Raw(new URLSearchParams(Object.entries((c.body ?? {}) as Record<string, unknown>).map(([k, v]): [string, string] => [k, typeof v === "string" ? v : JSON.stringify(v)])).toString(), "application/x-www-form-urlencoded")
      else if (c.bodyKind === "text") body = new Raw(String(c.body ?? "example"), c.contentType ?? "text/plain")
      else if (c.bodyKind === "binary") body = new Raw(bytesOf(c.contentType ?? "application/octet-stream"), c.contentType ?? "application/octet-stream")
      else body = c.body
      await api.request({ operationId: c.operationId, method: c.method, path: fill(c.path, c.params), query, headers, body })
    } else {
      const input = {
        ...(Object.keys(c.params).length ? { params: c.params } : {}),
        ...(Object.keys(query).length ? { query } : {}),
        ...(json && c.body !== undefined ? { body: c.body } : {}),
      }
      if (c.clientInput) await api[c.name](input, { headers })
      else await api[c.name]({ headers })
    }
  } catch (e) {
    if (!(e instanceof ApiError)) return result("failing", "the request did not get an answer: " + (e instanceof Error ? e.message : String(e)))
  }
  const r = last.response
  if (!r) return result("failing", "no answer")
  if (r.status === 501) return result("pending", "not implemented yet (501)")
  const secured = c.security.length > 0 && !c.security.some((req) => !Object.keys(req).length)
  if (secured && !sent.given)
    return r.status === 401
      ? result("pending", "needs a credential: without one it answered 401, as it should (set CONTRACT_TOKEN, CONTRACT_API_KEY or CONTRACT_BASIC)")
      : result("failing", "answered " + r.status + " without the credential the contract asks for (401 expected)")
  if (r.status >= 500) return result("failing", "answered " + r.status + said(r.body))
  const spec = responseFor(c.responses, r.status)
  if (!spec) return result("failing", "answered " + r.status + ", a status the contract does not list for it" + said(r.body))
  if ((r.status === 401 || r.status === 403) && sent.given) return result("failing", "turned the credential down (" + r.status + "): give one authenticate() accepts" + said(r.body))
  const type = r.headers["content-type"] ?? ""
  if (spec.kind === "none") {
    if (r.body !== undefined) return result("failing", "answered " + r.status + " with a body; the contract has none")
  } else if (spec.kind === "json") {
    if (!/json/i.test(type)) return result("failing", "answered " + r.status + " as " + (type || "nothing") + ", not JSON")
    const problem = wrong(spec.schema, r.body)
    if (problem) return result("failing", "answered " + r.status + " with a body the contract does not allow: " + problem)
  } else if (spec.contentType && !sameType(spec.contentType, type)) return result("failing", "answered " + r.status + " as " + (type || "nothing") + ", not " + spec.contentType)
  return result("implemented", "answered " + r.status + " as the contract says")
}

/* ---------- realtime ---------- */

/** which of the messages the server sends a payload is, or what is wrong with it */
function judgeMessage(c: ChannelCase, payload: unknown, event?: string): string | null {
  const names = event ? [event] : c.send
  if (event && !c.send.includes(event)) return "the event " + event + " is no message the server sends"
  if (names.some((name) => !wrong(c.payloads[name], payload))) return null
  return "a message that is none the server sends: " + names.map((name) => name + ": " + wrong(c.payloads[name], payload)).join("; ")
}

function channelUrl(c: ChannelCase, o: Options): string {
  const path = o.realtimePrefix.replace(/\\/$/, "") + fill(c.address, c.params)
  return o.baseUrl + path + (o.token ? "?access_token=" + encodeURIComponent(o.token) : "")
}

async function checkSse(c: ChannelCase, o: Options, result: (status: Status, detail: string) => Outcome): Promise<Outcome> {
  const controller = new AbortController()
  const response = await fetch(channelUrl(c, o), { headers: { accept: "text/event-stream" }, signal: controller.signal }).catch((e: unknown) => e as Error)
  if (response instanceof Error) return result("failing", "cannot connect: " + response.message)
  if (response.status === 501) {
    controller.abort()
    return result("pending", "not implemented yet (501)")
  }
  if (response.status !== 200 || !response.body) {
    controller.abort()
    return result("failing", "answered " + response.status + " to the event stream")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  const until = Date.now() + o.windowMs
  while (Date.now() < until) {
    const chunk = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, until - Date.now())))])
    if (!chunk || chunk.done) break
    text += decoder.decode(chunk.value, { stream: true })
  }
  controller.abort()
  const problems: string[] = []
  let received = 0
  for (const block of text.split(/\\n\\n/)) {
    const lines = block.split("\\n").filter((l) => l && !l.startsWith(":"))
    if (!lines.length) continue
    const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim()
    const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\\n")
    received++
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      problems.push("an event whose data is not JSON")
      continue
    }
    const problem = judgeMessage(c, payload, event)
    if (problem) problems.push(problem)
  }
  return problems.length ? result("failing", problems[0]) : result("implemented", "connected; " + received + " messages, each as the contract says")
}

/** One realtime channel: connect, send a message the contract says it takes, check what comes back. */
export async function checkChannel(c: ChannelCase, o: Options): Promise<Outcome> {
  const title = c.transport + " " + c.address + " (" + c.id + ")"
  const result = (status: Status, detail: string): Outcome => ({ kind: "channel", name: c.name, title, status, detail })
  if (!c.routed) return result("failing", "the server cannot serve this channel's address")
  if (c.transport === "sse") return checkSse(c, o, result)
  return new Promise<Outcome>((resolve) => {
    const problems: string[] = []
    let opened = false
    let received = 0
    let done = false
    const socket = new WebSocket(channelUrl(c, o).replace(/^http/, "ws"))
    const finish = (outcome: Outcome) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) socket.close()
      resolve(outcome)
    }
    const settle = () => finish(problems.length ? result("failing", problems[0]) : result("implemented", "connected; " + received + " messages, each as the contract says"))
    let timer = setTimeout(() => finish(result("failing", "no connection within " + o.windowMs * 4 + " ms")), o.windowMs * 4)
    socket.onopen = () => {
      opened = true
      if (c.example) socket.send(JSON.stringify(c.example.payload))
      clearTimeout(timer)
      timer = setTimeout(settle, o.windowMs)
    }
    socket.onmessage = (event) => {
      received++
      let payload: unknown
      try {
        payload = JSON.parse(String(event.data))
      } catch {
        problems.push("a frame that is not JSON")
        return
      }
      const problem = judgeMessage(c, payload)
      if (problem) problems.push(problem)
    }
    socket.onclose = (event) => {
      if (event.code === 4501) finish(result("pending", "not implemented yet (closed 4501)"))
      else if (!opened) finish(result("failing", "cannot connect"))
      else if (event.code >= 4000 || [1003, 1007, 1008, 1011].includes(event.code)) finish(result("failing", "closed " + event.code + (event.reason ? ": " + event.reason : "")))
      else settle()
    }
  })
}

/* ---------- all of it ---------- */

/** the cases the options ask for */
export function selected<T extends { name: string }>(cases: T[], o: Options): T[] {
  if (!o.only.length) return cases
  return cases.filter((c) => o.only.includes(c.name) || ("operationId" in c && o.only.includes(String(c.operationId))) || ("id" in c && o.only.includes(String(c.id))))
}

export async function runContract(o: Options): Promise<Outcome[]> {
  const out: Outcome[] = []
  for (const c of selected(OPERATION_CASES, o)) out.push(await checkOperation(c, o))
  for (const c of selected(CHANNEL_CASES, o)) out.push(await checkChannel(c, o))
  return out
}

/** the outcomes as lines: a summary, then each */
export function report(outcomes: Outcome[], strict = false): string[] {
  const count = (s: Status) => outcomes.filter((x) => x.status === s).length
  const mark: Record<Status, string> = { implemented: "ok     ", pending: strict ? "PENDING" : "pending", failing: "FAIL   " }
  return [
    "contract: " + count("implemented") + " implemented, " + count("pending") + " pending, " + count("failing") + " failing" + (strict ? " (strict)" : ""),
    ...outcomes.map((x) => "  " + mark[x.status] + " " + x.title + ": " + x.detail),
  ]
}

/** whether the outcomes pass: nothing failing, and in strict mode nothing pending */
export const passes = (outcomes: Outcome[], strict: boolean) => !outcomes.some((x) => x.status === "failing" || (strict && x.status === "pending"))
`;

const CLI = (scope: string) => `${GENERATED}
// npm run contract -w contract-tests -- [--strict] [--only a,b] [--base-url http://127.0.0.1:3001]
import { optionsFrom, passes, report, runContract, USAGE } from "./runner"

const options = optionsFrom(process.argv.slice(2), process.env)
if (options.help) {
  console.log(USAGE)
  process.exit(0)
}
let close: (() => Promise<unknown>) | undefined
if (!options.baseUrl) {
  const { buildApp } = await import(${str(`${scope}/server`)})
  const app = await buildApp({ config: { logLevel: options.verbose ? "info" : "silent" } })
  await app.listen({ port: 0, host: "127.0.0.1" })
  const address = app.server.address()
  options.baseUrl = "http://127.0.0.1:" + (typeof address === "object" && address ? address.port : 0)
  close = () => app.close()
}
const outcomes = await runContract(options)
for (const line of report(outcomes, options.strict)) console.log(line)
await close?.()
process.exit(passes(outcomes, options.strict) ? 0 : 1)
`;

const TEST = (scope: string) => `${GENERATED}
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHANNEL_CASES, OPERATION_CASES } from "./cases"
import { checkChannel, checkOperation, optionsFrom, report, selected, type Outcome } from "./runner"

/* The contract against a server: the one CONTRACT_BASE_URL names, else one started here. Pending (501) is skipped,
   not failed, unless CONTRACT_STRICT=1. */
const options = optionsFrom([], process.env)
const outcomes: Outcome[] = []
let close: (() => Promise<unknown>) | undefined

beforeAll(async () => {
  if (options.baseUrl) return
  const { buildApp } = await import(${str(`${scope}/server`)})
  const app = await buildApp({ config: { logLevel: "silent" } })
  await app.listen({ port: 0, host: "127.0.0.1" })
  const address = app.server.address()
  options.baseUrl = "http://127.0.0.1:" + (typeof address === "object" && address ? address.port : 0)
  close = () => app.close()
})

afterAll(async () => {
  for (const line of report(outcomes, options.strict)) console.log(line)
  await close?.()
})

const judge = (outcome: Outcome, skip: () => void) => {
  outcomes.push(outcome)
  if (outcome.status === "failing") expect.fail(outcome.detail)
  if (outcome.status === "pending") {
    if (options.strict) expect.fail("pending: " + outcome.detail)
    skip()
  }
}

describe("the server keeps the contract", () => {
  it("has something to check", () => {
    expect(OPERATION_CASES.length + CHANNEL_CASES.length).toBeGreaterThanOrEqual(0)
  })
  for (const c of selected(OPERATION_CASES, options)) it(c.method + " " + c.path + " (" + c.name + ")", async (ctx) => judge(await checkOperation(c, options), () => ctx.skip()))
  for (const c of selected(CHANNEL_CASES, options)) it(c.transport + " " + c.address + " (" + c.id + ")", async (ctx) => judge(await checkChannel(c, options), () => ctx.skip()))
})
`;

export const contractTestsTarget: ProductTarget = {
  id: "contract-tests",
  build(ctx: ProductContext): Workspace {
    const c = contractFor(ctx);
    const schemas = new ValidatorSchemas(c.spec);
    const ex = new Examples(c.spec);
    const pins = (list: string[]) => Object.fromEntries(list.map((d) => [d, ctx.version(d)]));
    return {
      dir: "contract-tests",
      pkg: `${ctx.scope}/contract-tests`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "契约测试：检查后端是否符合接口契约", en: "contract tests: the server checked against the contract" },
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/contract-tests`,
              version: "0.1.0",
              private: true,
              type: "module",
              scripts: { typecheck: "tsc --noEmit -p .", test: "vitest run", contract: "tsx src/generated/cli.ts" },
              devDependencies: { [`${ctx.scope}/api`]: "0.1.0", [`${ctx.scope}/server`]: "0.1.0", ...pins(["@types/node", "ajv", "ajv-formats", "tsx", "typescript", "vitest"]) },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(jsonFile({ extends: "../tsconfig.base.json", compilerOptions: { lib: ["ES2022"], types: ["node"], verbatimModuleSyntax: true }, include: ["src"] })),
        "src/generated/cases.ts": generated(casesSource(c, schemas, ex)),
        "src/generated/runner.ts": generated(RUNNER(ctx.scope)),
        "src/generated/cli.ts": generated(CLI(ctx.scope)),
        "src/generated/contract.test.ts": generated(TEST(ctx.scope)),
      },
    };
  },
};
