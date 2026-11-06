/* The server's generated runtime: the files of src/generated/ that are the same for every contract. They read the
 * contract's data (contract.ts, operations.ts, channels.ts) and types (types.ts, handlers.ts), which are generated per
 * contract (lib/export/targets/server.ts). Written with String.raw: what is between the backticks is the file, byte for
 * byte (no backtick and no `${` in them). */

import { GENERATED } from "../code";

const file = (body: string) => `${GENERATED}\n${body.replace(/^\n/, "")}`;

export const CONFIG = file(String.raw`
import { REALTIME_PREFIX } from "./contract"

/** what the server reads from its environment (a .env file beside it, see .env.example, fills in what is not set) */
export type Config = {
  port: number
  host: string
  /** fatal, error, warn, info, debug, trace or silent */
  logLevel: string
  /** the origins browsers may call the API from (CORS): the dev servers of the web and mobile apps by default, * for any */
  corsOrigins: string[]
  /** Swagger UI and the contract at /docs (development) */
  docs: boolean
  /** every answer and every realtime message checked against the contract before it goes out (development) */
  validateResponses: boolean
  /** the largest file an upload may carry, in bytes */
  uploadMaxBytes: number
  /** where the realtime channels are served: their addresses go under it */
  realtimePrefix: string
}

/** the dev servers of the web app (Vite: dev and preview) and of the mobile app (Expo) */
export const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
]

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

const flag = (v: string | undefined, fallback: boolean) => (v === undefined || v === "" ? fallback : !/^(0|false|off|no)$/i.test(v))

/** The configuration from the environment: production (NODE_ENV=production) turns off what is for development. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const production = env.NODE_ENV === "production"
  return {
    port: Number(env.PORT ?? 3001),
    host: env.HOST ?? "127.0.0.1",
    logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "test" ? "warn" : "info"),
    corsOrigins: env.CORS_ORIGINS !== undefined ? list(env.CORS_ORIGINS) : production ? [] : DEV_ORIGINS,
    docs: flag(env.API_DOCS, !production),
    validateResponses: flag(env.VALIDATE_RESPONSES, !production),
    uploadMaxBytes: Number(env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
    realtimePrefix: env.REALTIME_PREFIX ?? REALTIME_PREFIX,
  }
}
`);

export const ERRORS = file(String.raw`
import type { FastifyError, FastifyInstance, FastifyReply } from "fastify"
import { OPERATIONS } from "./operations"

/** the media type of RFC 9457 problem details */
export const PROBLEM_TYPE = "application/problem+json"

/** one thing wrong with a request: where it is (a JSON Pointer into the body, or the name of a parameter) and what */
export type ProblemError = { pointer: string; detail: string; in?: "body" | "query" | "path" | "header" }

/** RFC 9457 problem details: what every error of the API answers with */
export type Problem = {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: ProblemError[]
  [member: string]: unknown
}

const TITLES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  409: "Conflict",
  410: "Gone",
  412: "Precondition Failed",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
}

/** the words of a status */
export const titleOf = (status: number) => TITLES[status] ?? (status >= 500 ? "Server Error" : status >= 400 ? "Client Error" : "Error")

export type ProblemOptions = {
  /** a URI that names the kind of problem; about:blank when the status says it all */
  type?: string
  title?: string
  errors?: ProblemError[]
  /** headers the answer carries (WWW-Authenticate, Retry-After…) */
  headers?: Record<string, string>
  /** more members of the problem details */
  members?: Record<string, unknown>
}

/** An answer that is an error: throw it from a handler and the API answers with problem details of its status. */
export class HttpError extends Error {
  readonly status: number
  readonly problem: Problem
  readonly headers: Record<string, string>

  constructor(status: number, detail?: string, options: ProblemOptions = {}) {
    super(detail ?? titleOf(status))
    this.name = "HttpError"
    this.status = status
    this.headers = options.headers ?? {}
    this.problem = {
      ...options.members,
      type: options.type ?? "about:blank",
      title: options.title ?? titleOf(status),
      status,
      ...(detail !== undefined ? { detail } : {}),
      ...(options.errors?.length ? { errors: options.errors } : {}),
    }
  }
}

export const badRequest = (detail?: string, errors?: ProblemError[]) => new HttpError(400, detail, { errors })
export const unauthorized = (detail?: string) => new HttpError(401, detail)
export const forbidden = (detail?: string) => new HttpError(403, detail)
export const notFound = (detail?: string) => new HttpError(404, detail)
export const conflict = (detail?: string) => new HttpError(409, detail)
export const unprocessable = (detail?: string, errors?: ProblemError[]) => new HttpError(422, detail, { errors })

/** what a handler not written yet throws: the API answers 501 Not Implemented */
export class NotImplemented extends HttpError {
  readonly operation: string

  constructor(operation: string) {
    super(501, operation + " is not implemented yet: write it in server/src/handlers")
    this.name = "NotImplemented"
    this.operation = operation
  }
}

export const notImplemented = (operation: string) => new NotImplemented(operation)

/** answers with problem details */
export function sendProblem(reply: FastifyReply, problem: Problem, headers: Record<string, string> = {}) {
  return reply.code(problem.status).headers(headers).type(PROBLEM_TYPE).send(problem)
}

/** what ajv says of a value, as much of it as is read here */
export type SchemaError = { instancePath: string; keyword: string; message?: string; params: Record<string, unknown> }

const escapePointer = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1")

/** Each schema error as a problem's error: a pointer to the value (the missing or extra property included), what is
 *  wrong with it, and where in the request it is. */
export function problemErrors(errors: readonly SchemaError[], where?: ProblemError["in"], rename: (name: string) => string = (n) => n): ProblemError[] {
  const out: ProblemError[] = []
  const seen = new Set<string>()
  for (const e of errors) {
    let path = e.instancePath
    let detail = e.message ?? "is not valid"
    if (e.keyword === "required" && typeof e.params.missingProperty === "string") {
      path += "/" + escapePointer(e.params.missingProperty)
      detail = "is required"
    } else if (e.keyword === "additionalProperties" && typeof e.params.additionalProperty === "string") {
      path += "/" + escapePointer(e.params.additionalProperty)
      detail = "is not allowed here"
    } else if (e.keyword === "enum" && Array.isArray(e.params.allowedValues)) {
      detail = "must be one of " + e.params.allowedValues.map((v) => JSON.stringify(v)).join(", ")
    }
    if (path && where && where !== "body") {
      const [first, ...rest] = path.slice(1).split("/")
      path = "/" + [rename(first), ...rest].join("/")
    }
    const pointer = "#" + path
    if (seen.has(pointer + detail)) continue
    seen.add(pointer + detail)
    out.push({ pointer, detail, ...(where ? { in: where } : {}) })
  }
  return out
}

const PARTS: Record<string, ProblemError["in"]> = { body: "body", querystring: "query", params: "path", headers: "header" }

/** the operation a request was routed to */
export function operationOf(config: unknown): string | undefined {
  const name = (config as { operation?: unknown } | undefined)?.operation
  return typeof name === "string" ? name : undefined
}

/** Every error becomes problem details: an HttpError its own; a request the contract's schemas turn down 400, field
 *  by field; Fastify's own (a body that is no JSON, too large, of a type nobody reads) their status; anything else 500,
 *  logged with its stack and told nobody. A handler not written yet is one quiet line in the log. */
export function installErrorHandling(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    const operation = operationOf(request.routeOptions.config)
    let problem: Problem
    let headers: Record<string, string> = {}
    if (error instanceof HttpError) {
      problem = error.problem
      headers = error.headers
      if (error instanceof NotImplemented) request.log.info({ operation: error.operation }, "not implemented yet (501)")
      else if (error.status >= 500) request.log.error({ status: error.status, detail: error.message }, "answered " + error.status)
    } else if (Array.isArray(error.validation)) {
      const where = PARTS[error.validationContext ?? ""] ?? undefined
      const spec = operation ? OPERATIONS[operation] : undefined
      const rename = (key: string) => spec?.params.find((p) => p.key === key)?.name ?? key
      problem = {
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        detail: "The request does not match the contract.",
        errors: problemErrors(error.validation as SchemaError[], where, rename),
      }
    } else {
      const given = typeof error.statusCode === "number" ? error.statusCode : 500
      const status = error.code === "FST_INVALID_MULTIPART_CONTENT_TYPE" ? 415 : given >= 400 && given < 600 ? given : 500
      if (status >= 500) {
        request.log.error({ err: error }, "unhandled error")
        problem = { type: "about:blank", title: titleOf(500), status: 500 }
      } else problem = { type: "about:blank", title: titleOf(status), status, detail: error.message }
    }
    return sendProblem(reply, problem, headers)
  })
  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: request.method + " " + request.url.split("?")[0] + " is not an operation of the contract.",
    }),
  )
}
`);

export const AUTH = file(String.raw`
import type { FastifyRequest } from "fastify"
import { authenticate, type User } from "../custom/auth"
import { SECURITY_SCHEMES } from "./contract"
import { HttpError } from "./errors"

/** an OpenAPI security requirement: the schemes that must all hold, with their scopes; any one requirement will do */
export type SecurityRequirement = Record<string, string[]>

/** a security scheme of the contract, as much of it as is read here */
export type SchemeSpec = { type: string; scheme?: string; in?: string; name?: string }

/** A credential a request carries for one security scheme of the contract, as authenticate() (custom/auth.ts) is
 *  given it: a bearer token (http bearer, OAuth2, OpenID Connect), a user name and password (http basic) or an API
 *  key, with the scopes the operation asks of that scheme and the request itself. */
export type Credential =
  | { scheme: string; type: "bearer"; token: string; scopes: string[]; request: FastifyRequest }
  | { scheme: string; type: "basic"; username: string; password: string; scopes: string[]; request: FastifyRequest }
  | { scheme: string; type: "apiKey"; key: string; scopes: string[]; request: FastifyRequest }

const users = new WeakMap<FastifyRequest, User>()

/** who made a request, once it was authenticated */
export const userOf = (request: FastifyRequest): User | undefined => users.get(request)

function header(request: FastifyRequest, name: string): string | undefined {
  const v = request.headers[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

function cookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (header(request, "cookie") ?? "").split(";")) {
    const at = part.indexOf("=")
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim())
  }
  return undefined
}

function queryValue(request: FastifyRequest, name: string): string | undefined {
  const v = (request.query as Record<string, unknown> | undefined)?.[name]
  return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined
}

const isBearer = (s: SchemeSpec) => (s.type === "http" && (s.scheme ?? "").toLowerCase() === "bearer") || s.type === "oauth2" || s.type === "openIdConnect"

/** The credential a request carries for one scheme of the contract, or undefined. */
export function credentialFor(request: FastifyRequest, scheme: string, scopes: string[] = []): Credential | undefined {
  const spec: SchemeSpec | undefined = SECURITY_SCHEMES[scheme]
  if (!spec) return undefined
  if (spec.type === "apiKey") {
    const name = spec.name ?? ""
    const key = spec.in === "query" ? queryValue(request, name) : spec.in === "cookie" ? cookie(request, name) : header(request, name)
    return key ? { scheme, type: "apiKey", key, scopes, request } : undefined
  }
  const authorization = (header(request, "authorization") ?? "").trim()
  const space = authorization.indexOf(" ")
  const kind = space > 0 ? authorization.slice(0, space).toLowerCase() : ""
  const value = space > 0 ? authorization.slice(space + 1).trim() : ""
  if (spec.type === "http" && (spec.scheme ?? "").toLowerCase() === "basic") {
    if (kind !== "basic" || !value) return undefined
    const text = Buffer.from(value, "base64").toString("utf8")
    const colon = text.indexOf(":")
    return colon < 0 ? undefined : { scheme, type: "basic", username: text.slice(0, colon), password: text.slice(colon + 1), scopes, request }
  }
  if (isBearer(spec)) return kind === "bearer" && value ? { scheme, type: "bearer", token: value, scopes, request } : undefined
  return undefined
}

/** the challenge of a 401 (RFC 9110 WWW-Authenticate) for the schemes an operation takes */
function challenge(requirements: SecurityRequirement[], invalid: boolean): Record<string, string> {
  const names = new Set(requirements.flatMap((r) => Object.keys(r)))
  const out: string[] = []
  for (const name of names) {
    const spec = SECURITY_SCHEMES[name]
    if (!spec) continue
    if (isBearer(spec)) out.push(invalid ? 'Bearer error="invalid_token"' : "Bearer")
    else if (spec.type === "http" && (spec.scheme ?? "").toLowerCase() === "basic") out.push('Basic realm="api"')
  }
  const unique = [...new Set(out)]
  return unique.length ? { "www-authenticate": unique.join(", ") } : {}
}

/** The user a request is made by, under the operation's security requirements: the first requirement each of whose
 *  schemes has a credential that authenticate() takes. No credential at all is 401 (the operation needs
 *  authentication); credentials no requirement takes are 401 too. An empty requirement ({}) among them lets anyone in
 *  who brings no credential. authenticate() may throw forbidden() (403) itself, for scopes. */
export async function authenticateRequest(request: FastifyRequest, requirements: SecurityRequirement[]): Promise<User | undefined> {
  if (!requirements.length) return undefined
  let offered = false
  for (const requirement of requirements) {
    const names = Object.keys(requirement)
    if (!names.length) continue
    const credentials = names.map((name) => credentialFor(request, name, requirement[name] ?? []))
    if (credentials.some((c) => c)) offered = true
    if (credentials.some((c) => !c)) continue
    let user: User | undefined
    let all = true
    for (const credential of credentials as Credential[]) {
      const found = await authenticate(credential)
      if (!found) {
        all = false
        break
      }
      user ??= found
    }
    if (all && user) {
      users.set(request, user)
      return user
    }
  }
  if (!offered && requirements.some((r) => !Object.keys(r).length)) return undefined
  throw new HttpError(401, offered ? "The credentials are not valid." : "This operation needs authentication.", { headers: challenge(requirements, offered) })
}

/** The user of a realtime connection: a bearer token in the Authorization header, or in the access_token query
 *  parameter (RFC 6750) where a browser cannot set headers. None is no user; one authenticate() turns down is 401. */
export async function connectionUser(request: FastifyRequest): Promise<User | undefined> {
  const authorization = header(request, "authorization") ?? ""
  const token = /^bearer\s+/i.test(authorization) ? authorization.replace(/^bearer\s+/i, "").trim() : queryValue(request, "access_token")
  if (!token) return undefined
  const scheme = Object.keys(SECURITY_SCHEMES).find((name) => isBearer(SECURITY_SCHEMES[name])) ?? "bearer"
  const user = await authenticate({ scheme, type: "bearer", token, scopes: [], request })
  if (!user) throw new HttpError(401, "The credentials are not valid.")
  return user
}
`);

export const VALIDATION = file(String.raw`
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import type { FastifySchemaCompiler } from "fastify"
import { EXTRA_FORMATS, REQUEST_DEFINITIONS, RESPONSE_DEFINITIONS } from "./contract"
import type { SchemaError } from "./errors"

/* JSON Schema 2020-12, the dialect of OpenAPI 3.1 and of the contract's models. Parameters, query, headers and form
   fields come as text and are coerced to what their schema says; a JSON body is taken as it is; answers and realtime
   messages are only checked, never changed. Defaults the contract gives are filled in on what comes in. */
function validator(options: { coerce: boolean; defaults: boolean }) {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    allowUnionTypes: true,
    coerceTypes: options.coerce ? "array" : false,
    useDefaults: options.defaults,
  })
  addFormats(ajv)
  for (const name of EXTRA_FORMATS) ajv.addFormat(name, true)
  ajv.addSchema(REQUEST_DEFINITIONS)
  ajv.addSchema(RESPONSE_DEFINITIONS)
  return ajv
}

const VALIDATORS = {
  input: validator({ coerce: true, defaults: true }),
  body: validator({ coerce: false, defaults: true }),
  output: validator({ coerce: false, defaults: false }),
}

export type Check = keyof typeof VALIDATORS

type Validate = ((value: unknown) => boolean) & { errors?: unknown }

const compiled = { input: new WeakMap<object, Validate>(), body: new WeakMap<object, Validate>(), output: new WeakMap<object, Validate>() }

let warn: (message: string) => void = (message) => console.warn(message)

/** where a schema the validator cannot read is told about (the server's log) */
export function onSchemaProblem(log: (message: string) => void) {
  warn = log
}

const ANYTHING: Validate = () => true

/** the check of one schema, made once; a schema the validator cannot read checks nothing (and is logged) */
export function compile(check: Check, schema: object): Validate {
  const cache = compiled[check]
  let v = cache.get(schema)
  if (!v) {
    try {
      v = VALIDATORS[check].compile(schema) as Validate
    } catch (e) {
      warn("a schema of the contract cannot be checked: " + (e instanceof Error ? e.message : String(e)))
      v = ANYTHING
    }
    cache.set(schema, v)
  }
  return v
}

/** What is wrong with a value under a schema, or null when nothing is. */
export function check(kind: Check, schema: object | boolean | undefined, value: unknown): SchemaError[] | null {
  if (schema === undefined || schema === true) return null
  if (schema === false) return [{ instancePath: "", keyword: "false", message: "is not allowed", params: {} }]
  const validate = compile(kind, schema)
  return validate(value) ? null : ((validate.errors as SchemaError[] | null | undefined) ?? [])
}

/** how Fastify checks the path parameters, query and headers of every route against the contract */
export const validatorCompiler: FastifySchemaCompiler<unknown> = ({ schema }) => compile("input", schema as object) as ReturnType<FastifySchemaCompiler<unknown>>
`);

export const UPLOADS = file(String.raw`
import type { MultipartFile, MultipartValue } from "@fastify/multipart"
import type { FastifyRequest } from "fastify"
import { HttpError } from "./errors"

/** a file a request carried, read into memory */
export type UploadedFile = {
  /** the name the app gave it ("" when it gave none) */
  filename: string
  mimetype: string
  encoding: string
  size: number
  data: Buffer
}

const FILE = Symbol("file")

/** a file to answer with: made by fileReply() */
export type FileReply = {
  readonly [FILE]: true
  data: Buffer | Uint8Array | string | NodeJS.ReadableStream
  /** the media type; the contract's for the answer when left out */
  contentType?: string
  /** a download's name (Content-Disposition) */
  filename?: string
  /** shown in the browser rather than downloaded */
  inline?: boolean
}

/** An answer that is a file: its bytes or a stream, its type and, for a download, its name. */
export function fileReply(data: FileReply["data"], options: { contentType?: string; filename?: string; inline?: boolean } = {}): FileReply {
  return { [FILE]: true, data, ...options }
}

export const isFileReply = (v: unknown): v is FileReply => typeof v === "object" && v !== null && FILE in v

/** whether a media type is one of those accepted: exactly, or by a wildcard for its kind (image/ and a star) or for any */
export function accepts(accepted: readonly string[], type: string): boolean {
  const t = type.split(";")[0].trim().toLowerCase()
  return accepted.some((a) => a === t || a === "*/*" || (a.endsWith("/*") && t.startsWith(a.slice(0, -1))))
}

/** what a form's file fields are, from the contract */
export type FormFiles = { files: string[]; fileLists: string[]; accept: Record<string, string[]> }

const escapePointer = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1")

/** Reads a multipart/form-data request: file fields as UploadedFile (a list where the contract has a list of files),
 *  other fields as text (a list when a field comes more than once). A file larger than the server takes is 413; a
 *  file of a type the contract does not take for its field, 415. */
export async function readMultipart(request: FastifyRequest, form: FormFiles): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  const put = (name: string, value: unknown, list: boolean) => {
    const had = Object.prototype.hasOwnProperty.call(out, name) ? out[name] : undefined
    const next = list || had !== undefined ? [...(Array.isArray(had) ? had : had === undefined ? [] : [had]), value] : value
    Object.defineProperty(out, name, { value: next, enumerable: true, writable: true, configurable: true })
  }
  for await (const part of request.parts()) {
    if (part.type === "file") {
      const file = part as MultipartFile
      const data = await file.toBuffer()
      const accepted = form.accept[file.fieldname]
      if (accepted && !accepts(accepted, file.mimetype))
        throw new HttpError(415, "The file " + file.fieldname + " is of a type the contract does not take.", {
          errors: [{ pointer: "#/" + escapePointer(file.fieldname), detail: "must be " + accepted.join(" or "), in: "body" }],
        })
      put(file.fieldname, { filename: file.filename ?? "", mimetype: file.mimetype, encoding: file.encoding, size: data.length, data }, form.fileLists.includes(file.fieldname))
    } else {
      const field = part as MultipartValue
      put(field.fieldname, typeof field.value === "string" ? field.value : String(field.value), false)
    }
  }
  return out
}

/** A body sent as bytes (application/octet-stream, image/png…) as a file. */
export function bodyFile(request: FastifyRequest, data: Buffer): UploadedFile {
  const type = String(request.headers["content-type"] ?? "application/octet-stream").split(";")[0].trim()
  return { filename: "", mimetype: type, encoding: "binary", size: data.length, data }
}

/** Content-Disposition for a file's name (RFC 6266): an ASCII fallback and the name itself, encoded */
export function disposition(filename: string, inline = false): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_")
  return (inline ? "inline" : "attachment") + '; filename="' + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(filename)
}
`);

export const PAGINATION = file(String.raw`
import { badRequest } from "./errors"

/** how an operation pages, from the contract (x-m3e-pagination, names filled in) */
export type PaginationSpec =
  | { style: "cursor"; items: string; cursorParam: string; nextField: string; limitParam: string; limitDefault: number }
  | { style: "offset"; items: string; offsetParam: string; limitParam: string; totalField: string; limitDefault: number }

/** the page a request asks for: after a cursor (absent for the first page), and how many */
export type CursorPage = { style: "cursor"; cursor: string | undefined; limit: number }
/** the page a request asks for: how many to skip, and how many */
export type OffsetPage = { style: "offset"; offset: number; limit: number }
export type Page = CursorPage | OffsetPage

/** an opaque cursor for a position in a list */
export const encodeCursor = (position: number): string => Buffer.from("p" + position).toString("base64url")

/** the position an opaque cursor stands for (0 for none); a cursor this server did not make is 400 */
export function decodeCursor(cursor: string | undefined, param = "cursor"): number {
  if (cursor === undefined || cursor === "") return 0
  const text = Buffer.from(cursor, "base64url").toString("utf8")
  const position = /^p\d{1,15}$/.test(text) ? Number(text.slice(1)) : NaN
  if (!Number.isSafeInteger(position)) throw badRequest("The cursor is not one this server gave.", [{ pointer: "#/" + param, detail: "is not a cursor of this list", in: "query" }])
  return position
}

const numberOf = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

/** The page a request asks for, by the operation's convention (its own parameter names). */
export function pageOf(spec: PaginationSpec, query: Record<string, unknown>): Page {
  const limit = Math.max(1, numberOf(query[spec.limitParam], spec.limitDefault))
  if (spec.style === "cursor") {
    const cursor = query[spec.cursorParam]
    return { style: "cursor", cursor: typeof cursor === "string" && cursor !== "" ? cursor : undefined, limit }
  }
  return { style: "offset", offset: Math.max(0, numberOf(query[spec.offsetParam], 0)), limit }
}

/** A list in memory cut to a page: its items, the cursor of the next page (null on the last) and the count of all. */
export function slicePage<T>(all: readonly T[], page: Page, param = "cursor"): { items: T[]; next: string | null; total: number } {
  const start = page.style === "cursor" ? decodeCursor(page.cursor, param) : page.offset
  const items = all.slice(start, start + page.limit)
  const end = start + items.length
  return { items, next: end < all.length ? encodeCursor(end) : null, total: all.length }
}

/** The answer of a paged operation from a list in memory, under the field names its contract gives. */
export function pageAnswer(spec: PaginationSpec, all: readonly unknown[], page: Page): Record<string, unknown> {
  const cut = slicePage(all, page, spec.style === "cursor" ? spec.cursorParam : "offset")
  const out: Record<string, unknown> = {}
  const set = (k: string, v: unknown) => Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true })
  set(spec.items, cut.items)
  if (spec.style === "cursor") set(spec.nextField, cut.next)
  else set(spec.totalField, cut.total)
  return out
}
`);

export const RESPOND = file(String.raw`
/** An answer with a status the contract lists for an operation, other than the one it answers when it goes well:
 *  made by ctx.respond(status, body). */
export class Responded {
  readonly status: number
  readonly body: unknown
  readonly headers: Record<string, string>

  constructor(status: number, body: unknown, headers: Record<string, string> = {}) {
    this.status = status
    this.body = body
    this.headers = headers
  }
}
`);

export const ROUTES = file(String.raw`
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { authenticateRequest, userOf } from "./auth"
import type { Config } from "./config"
import { HttpError, NotImplemented, badRequest, problemErrors } from "./errors"
import type { Handlers } from "./handlers"
import { OPERATIONS, documented, responseFor, type BodySpec, type OperationSpec } from "./operations"
import { pageAnswer, pageOf } from "./pagination"
import { Responded } from "./respond"
import { bodyFile, disposition, isFileReply, readMultipart, type FileReply } from "./uploads"
import { check } from "./validation"

type Run = (ctx: unknown) => unknown

/** the media type of a request, without its parameters */
const typeOf = (request: FastifyRequest) => String(request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase()

const sameType = (listed: string, type: string) => listed === type || listed === "*/*" || (listed.endsWith("/*") && type.startsWith(listed.slice(0, -1)))

/** a form's fields (application/x-www-form-urlencoded) as an object: a field that comes more than once is a list */
function formFields(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of new URLSearchParams(text)) {
    const had = Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined
    Object.defineProperty(out, key, { value: had === undefined ? value : [...(Array.isArray(had) ? had : [had]), value], enumerable: true, writable: true, configurable: true })
  }
  return out
}

function invalid(errors: Parameters<typeof problemErrors>[0]): never {
  throw badRequest("The request does not match the contract.", problemErrors(errors, "body"))
}

/** The body of a request as the contract has it, checked against its schema: JSON, a form (its files read into
 *  memory), text, or bytes. A body of a type the operation does not take is 415; one it needs and lacks, 400. */
async function readBody(body: BodySpec | null, request: FastifyRequest): Promise<unknown> {
  if (!body) return undefined
  const type = typeOf(request)
  const raw = request.body
  if (body.kind === "multipart" && request.isMultipart()) {
    const value = await readMultipart(request, body)
    const errors = [...(check("input", body.fieldsSchema, value) ?? [])]
    for (const name of body.files) if (body.requiredFiles.includes(name) && !Object.prototype.hasOwnProperty.call(value, name)) errors.push({ instancePath: "", keyword: "required", params: { missingProperty: name } })
    if (errors.length) invalid(errors)
    return value
  }
  const present = raw !== undefined && raw !== null && !(Buffer.isBuffer(raw) && raw.length === 0) && raw !== ""
  if (!present) {
    if (body.required) throw badRequest("The request needs a body.", [{ pointer: "#", detail: "is required", in: "body" }])
    return undefined
  }
  if (type && !body.contentTypes.some((listed) => sameType(listed, type)))
    throw new HttpError(415, "Send the body as " + body.contentTypes.join(" or ") + ".")
  let value: unknown = raw
  if (body.kind === "json" && Buffer.isBuffer(raw)) {
    try {
      value = JSON.parse(raw.toString("utf8"))
    } catch {
      throw badRequest("The body is not JSON.")
    }
  } else if (body.kind === "form") value = formFields(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw))
  else if (body.kind === "text") return Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw)
  else if (body.kind === "binary") return bodyFile(request, Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
  else if (body.kind === "multipart") throw new HttpError(415, "Send the body as multipart/form-data.")
  const errors = check(body.kind === "form" ? "input" : "body", body.schema, value)
  if (errors) invalid(errors)
  return value
}

function sendFile(reply: FastifyReply, status: number, file: FileReply, listed: string | undefined) {
  const type = file.contentType ?? (listed && !listed.includes("*") ? listed : "application/octet-stream")
  reply.code(status).type(type)
  if (file.filename !== undefined) reply.header("content-disposition", disposition(file.filename, file.inline))
  return reply.send(typeof file.data === "string" ? Buffer.from(file.data) : file.data)
}

/** Sends what a handler returned: the success answer, or the status it chose with ctx.respond. In development every
 *  answer is checked against the contract first: one that does not keep to it is a 500 that says where it is wrong. */
function answer(spec: OperationSpec, reply: FastifyReply, out: unknown, config: Config) {
  const responded = out instanceof Responded ? out : null
  const status = responded?.status ?? spec.success
  const value = responded ? responded.body : out
  if (responded) reply.headers(responded.headers)
  const response = responseFor(spec, status)
  if (config.validateResponses && !documented(spec, status)) reply.log.warn({ operation: spec.name, status }, "answered a status the contract does not list for this operation")
  if (isFileReply(value)) return sendFile(reply, status, value, response?.contentType)
  if (!response || response.kind === "none") return reply.code(status).send()
  if (response.kind === "text") return reply.code(status).type(response.contentType ?? "text/plain").send(String(value ?? ""))
  if (response.kind === "file") throw new HttpError(500, spec.name + " answers a file: return fileReply(…) from its handler.")
  if (config.validateResponses) {
    const errors = check("output", response.schema, value)
    if (errors) {
      reply.log.error({ operation: spec.name, status, errors: problemErrors(errors) }, "the answer does not match the contract")
      throw new HttpError(500, "The answer of " + spec.name + " (" + status + ") does not match the contract.", { errors: problemErrors(errors) })
    }
  }
  return reply
    .code(status)
    .type(response.contentType ?? "application/json")
    .send(JSON.stringify(value ?? null))
}

async function run(spec: OperationSpec, handler: Run, request: FastifyRequest, reply: FastifyReply, config: Config) {
  const body = await readBody(spec.body, request)
  const query = (request.query ?? {}) as Record<string, unknown>
  const page = spec.pagination ? pageOf(spec.pagination, query) : undefined
  const params = request.params as Record<string, string>
  const ctx = {
    params: Object.fromEntries(spec.params.map((p) => [p.name, params[p.key]])),
    query,
    headers: request.headers,
    body,
    user: userOf(request),
    page,
    paginate: spec.pagination && page ? (all: readonly unknown[]) => pageAnswer(spec.pagination!, all, page) : undefined,
    respond: (status: number, value: unknown, headers?: Record<string, string>) => new Responded(status, value, headers),
    request,
    reply,
    log: request.log,
  }
  let out: unknown
  try {
    out = await handler(ctx)
  } catch (e) {
    /* an error the handler chose, of a status its contract does not list (development) */
    if (config.validateResponses && e instanceof HttpError && !(e instanceof NotImplemented) && !documented(spec, e.status))
      request.log.warn({ operation: spec.name, status: e.status }, "answered a status the contract does not list for this operation")
    throw e
  }
  if (reply.sent) return reply
  return answer(spec, reply, out, config)
}

/** Bodies of every type the contract names reach the operations as they came (JSON is Fastify's own): forms, files,
 *  JSON of another media type (application/merge-patch+json…). Each operation reads what it takes (readBody). */
export function installBodyParsers(app: FastifyInstance) {
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body))
}

/** Routes every operation of the contract to its handler: authentication first (before the body is read), then the
 *  path parameters, query and headers checked by Fastify against the contract's schemas, then the body, the handler
 *  and its answer. */
export function registerRoutes(app: FastifyInstance, handlers: Handlers, config: Config) {
  for (const spec of Object.values(OPERATIONS)) {
    if (!spec.url) continue
    const handler = (handlers as Record<string, unknown>)[spec.name] as Run
    app.route({
      method: spec.method,
      url: spec.url,
      schema: spec.schema,
      config: { operation: spec.name },
      onRequest: async (request) => {
        if (spec.security.length) await authenticateRequest(request, spec.security)
      },
      handler: (request, reply) => run(spec, handler, request, reply, config),
    })
  }
}
`);

export const REALTIME = file(String.raw`
import { randomUUID } from "node:crypto"
import websocket from "@fastify/websocket"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { ServerResponse } from "node:http"
import type { WebSocket } from "ws"
import type { User } from "../custom/auth"
import { connectionUser } from "./auth"
import { CHANNELS, type ChannelSpec } from "./channels"
import type { Config } from "./config"
import { HttpError, problemErrors } from "./errors"
import { check } from "./validation"

/** what goes over a channel: the parameters of its address, what the server sends, what it receives */
export type ChannelShape = { params: object; send: object; receive: object }

/** One app connected to a channel. */
export type Connection<C extends ChannelShape> = {
  readonly id: string
  readonly channel: string
  /** the parameters of the address it connected to */
  readonly params: C["params"]
  /** who it is (custom/auth.ts), when it brought a token */
  readonly user: User | undefined
  readonly request: FastifyRequest
  /** sends it one of the messages the contract says the server sends on this channel */
  send<M extends keyof C["send"] & string>(message: M, payload: C["send"][M]): void
  close(code?: number, reason?: string): void
}

/** a message the app sent, told apart from the others by its payload */
export type Received<C extends ChannelShape> = { [M in keyof C["receive"] & string]: { message: M; payload: C["receive"][M] } }[keyof C["receive"] & string]

/** What the server does on a channel: when an app connects (throw to turn it away), when it sends a message, when it
 *  goes. */
export type ChannelHandler<C extends ChannelShape> = {
  onConnect?(connection: Connection<C>): void | Promise<void>
  onMessage?(connection: Connection<C>, received: Received<C>): void | Promise<void>
  onClose?(connection: Connection<C>): void | Promise<void>
}

type Open = { channel: string; params: Record<string, string>; push(message: string, payload: unknown): void }

const open = new Set<Open>()

/** Sends a message to every app connected to a channel, or to those whose address had these parameters: from a
 *  handler, a timer, anywhere in the server. Says to how many. */
export function publishTo(channel: string, params: Record<string, string> | undefined, message: string, payload: unknown): number {
  let n = 0
  for (const o of open) {
    if (o.channel !== channel) continue
    if (params && Object.entries(params).some(([k, v]) => o.params[k] !== v)) continue
    o.push(message, payload)
    n++
  }
  return n
}

/** a contract's message checked before it goes out (development) */
function outgoing(spec: ChannelSpec, message: string, payload: unknown, config: Config) {
  if (!spec.send.includes(message)) throw new Error("the channel " + spec.id + " does not send " + message + " (see the contract)")
  if (!config.validateResponses) return
  const errors = check("output", spec.payloads[message], payload)
  if (errors) throw new HttpError(500, "The message " + message + " does not match the contract.", { errors: problemErrors(errors) })
}

/** the close code of an error: 4000 + its status (4401, 4403, 4501), 1011 for anything else */
function closeCode(error: unknown): [number, string] {
  if (error instanceof HttpError) return [4000 + error.status, error.message.slice(0, 120)]
  return [1011, "server error"]
}

function paramsOf(spec: ChannelSpec, request: FastifyRequest): Record<string, string> {
  const given = request.params as Record<string, string>
  return Object.fromEntries(spec.params.map((p) => [p.name, given[p.key]]))
}

function websocketRoute(app: FastifyInstance, spec: ChannelSpec, handler: ChannelHandler<ChannelShape>, url: string, config: Config) {
  app.get(url, { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    /* messages are listened for at once: the first may come before the connection is accepted */
    const waiting: { data: Buffer; binary: boolean }[] = []
    let ready = false
    let queue = Promise.resolve()
    const fail = (error: unknown) => {
      const [code, reason] = closeCode(error)
      if (code === 4501) request.log.info({ channel: spec.id }, "not implemented yet (closed 4501)")
      else if (code === 1011) request.log.error({ err: error, channel: spec.id }, "realtime error")
      if (socket.readyState === socket.OPEN) socket.close(code, reason)
    }
    let connection: Connection<ChannelShape> | undefined
    const take = async (data: Buffer, binary: boolean) => {
      if (!connection) return
      if (binary) return socket.close(1003, "this channel takes JSON text")
      let payload: unknown
      try {
        payload = JSON.parse(data.toString("utf8"))
      } catch {
        return socket.close(1007, "not JSON")
      }
      if (!spec.receive.length) return socket.close(1008, "this channel takes no messages")
      const message = spec.receive.find((name) => !check("input", spec.payloads[name], payload))
      if (!message) return socket.close(1007, "no message of the contract")
      try {
        await handler.onMessage?.(connection, { message, payload } as never)
      } catch (e) {
        fail(e)
      }
    }
    socket.on("message", (data: Buffer, binary: boolean) => {
      if (!ready) waiting.push({ data, binary })
      else queue = queue.then(() => take(data, binary))
    })
    const entry: Open = { channel: spec.name, params: paramsOf(spec, request), push: () => {} }
    socket.on("close", () => {
      open.delete(entry)
      if (connection && ready) Promise.resolve(handler.onClose?.(connection)).catch((e) => request.log.error({ err: e, channel: spec.id }, "realtime error"))
    })
    void (async () => {
      try {
        const user = await connectionUser(request)
        const send = (message: string, payload: unknown) => {
          outgoing(spec, message, payload, config)
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload))
        }
        connection = { id: randomUUID(), channel: spec.name, params: entry.params, user, request, send: send as never, close: (code, reason) => socket.close(code, reason) }
        entry.push = (message, payload) => {
          try {
            send(message, payload)
          } catch (e) {
            fail(e)
          }
        }
        await handler.onConnect?.(connection)
        ready = true
        open.add(entry)
        for (const w of waiting.splice(0)) queue = queue.then(() => take(w.data, w.binary))
      } catch (e) {
        fail(e)
      }
    })()
  })
}

function sseRoute(app: FastifyInstance, spec: ChannelSpec, handler: ChannelHandler<ChannelShape>, url: string, config: Config) {
  app.get(url, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await connectionUser(request)
    const early: string[] = []
    let raw: ServerResponse | null = null
    const write = (text: string) => (raw ? raw.write(text) : early.push(text))
    const send = (message: string, payload: unknown) => {
      outgoing(spec, message, payload, config)
      write("event: " + message.replace(/[\r\n]/g, "") + "\ndata: " + JSON.stringify(payload) + "\n\n")
    }
    const entry: Open = { channel: spec.name, params: paramsOf(spec, request), push: send }
    const connection: Connection<ChannelShape> = { id: randomUUID(), channel: spec.name, params: entry.params, user, request, send: send as never, close: () => raw?.end() }
    await handler.onConnect?.(connection)
    reply.hijack()
    raw = reply.raw
    const headers: Record<string, string | number | string[]> = {}
    for (const [k, v] of Object.entries(reply.getHeaders())) if (v !== undefined) headers[k] = v
    raw.writeHead(200, { ...headers, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" })
    raw.write(": connected\n\n")
    for (const text of early.splice(0)) raw.write(text)
    open.add(entry)
    const ping = setInterval(() => raw?.write(": ping\n\n"), 15000)
    request.raw.on("close", () => {
      clearInterval(ping)
      open.delete(entry)
      Promise.resolve(handler.onClose?.(connection)).catch((e) => request.log.error({ err: e, channel: spec.id }, "realtime error"))
    })
  })
}

/** Serves every realtime channel of the contract under the realtime prefix: WebSocket channels (each frame one
 *  message's JSON payload, told apart by which of the channel's messages it matches) and server-sent events (the
 *  message's name as the event, its payload as the data). */
export async function registerChannels(app: FastifyInstance, handlers: object, config: Config) {
  const specs = Object.values(CHANNELS).filter((c) => c.url)
  if (specs.some((c) => c.transport === "websocket")) await app.register(websocket, { options: { maxPayload: 1024 * 1024 } })
  for (const spec of specs) {
    const url = config.realtimePrefix.replace(/\/$/, "") + spec.url
    const handler = ((handlers as Record<string, unknown>)[spec.name] ?? {}) as ChannelHandler<ChannelShape>
    if (spec.transport === "sse") sseRoute(app, spec, handler, url, config)
    else websocketRoute(app, spec, handler, url, config)
  }
}
`);

export const DOCS = file(String.raw`
import swagger, { type SwaggerOptions } from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import type { FastifyInstance } from "fastify"
import type { Config } from "./config"
import { ASYNCAPI, DOCS_PATH, HEALTH_PATH, OPENAPI } from "./contract"

const started = Date.now()

/** The server's own routes beside the contract's: its health, and in development the contract to read and try
 *  (Swagger UI at /docs, the OpenAPI document at /docs/json, the AsyncAPI one at /docs/asyncapi.json). */
export async function registerDocs(app: FastifyInstance, config: Config) {
  app.get(HEALTH_PATH, async () => ({ status: "ok", uptime: Math.round((Date.now() - started) / 1000) }))
  if (!config.docs) return
  const servers = Array.isArray(OPENAPI.servers) ? OPENAPI.servers : []
  const document = { ...OPENAPI, servers: [{ url: "/", description: "this server" }, ...servers] }
  await app.register(swagger, { mode: "static", specification: { document } } as unknown as SwaggerOptions)
  await app.register(swaggerUi, { routePrefix: DOCS_PATH })
  app.get(DOCS_PATH + "/asyncapi.json", async () => ASYNCAPI)
}
`);

export const APP = file(String.raw`
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import Fastify, { type FastifyServerOptions } from "fastify"
import { setup } from "./custom/setup"
import { loadConfig, type Config } from "./generated/config"
import { registerDocs } from "./generated/docs"
import { installErrorHandling } from "./generated/errors"
import { channelHandlers, handlers } from "./generated/handlers"
import { registerChannels } from "./generated/realtime"
import { installBodyParsers, registerRoutes } from "./generated/routes"
import { onSchemaProblem, validatorCompiler } from "./generated/validation"

export type AppOptions = {
  /** what the environment says, changed */
  config?: Partial<Config>
  /** Fastify's own options (a logger of your own…) */
  fastify?: FastifyServerOptions
}

/** The server, ready to listen: errors as problem details, the contract's checks, CORS, uploads and the docs, then
 *  the custom setup (plugins, hooks, a database), then every operation and realtime channel of the contract. */
export async function buildApp(options: AppOptions = {}) {
  const config: Config = { ...loadConfig(), ...options.config }
  const app = Fastify({ logger: { level: config.logLevel }, exposeHeadRoutes: false, ...options.fastify })
  onSchemaProblem((message) => app.log.warn(message))
  app.setValidatorCompiler(validatorCompiler)
  installErrorHandling(app)
  installBodyParsers(app)
  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    methods: ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
  await app.register(multipart, { limits: { fileSize: config.uploadMaxBytes, files: 20, fields: 200 } })
  await registerDocs(app, config)
  await setup(app)
  registerRoutes(app, handlers, config)
  await registerChannels(app, channelHandlers, config)
  return app
}
`);

export const MAIN = file(String.raw`
import { existsSync } from "node:fs"
import { buildApp } from "./app"
import { loadConfig } from "./generated/config"

/* a .env file beside the server sets what the environment does not (see .env.example) */
if (existsSync(".env")) process.loadEnvFile(".env")

const config = loadConfig()
const app = await buildApp({ config })
await app.listen({ port: config.port, host: config.host })

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0))
  })
`);

export const ENV_EXAMPLE = `# The server's configuration. Copy this file to .env (never committed) and change what you need; what the
# environment sets wins over the file.
PORT=3001
HOST=127.0.0.1
# fatal, error, warn, info, debug, trace or silent
LOG_LEVEL=info
# The origins browsers may call the API from, comma-separated (* for any). Left out: the web and mobile dev servers.
# CORS_ORIGINS=https://app.example.com
# NODE_ENV=production turns off /docs and the checks of every answer against the contract (or set them apart):
# API_DOCS=off
# VALIDATE_RESPONSES=off
# The largest file an upload may carry, in bytes
UPLOAD_MAX_BYTES=10485760
# Where the realtime channels are served (the contract's realtime path by default)
# REALTIME_PREFIX=/realtime
`;
