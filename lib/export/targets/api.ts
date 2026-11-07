/* packages/api: the contract and the typed client the web app, the mobile app and the mini-program share. The client
 * runs over a small `Transport` (decision 5b): fetch by default, React Native's fetch, a mini-program's request, or the
 * mocks. Nothing in this package assumes a DOM or a global `fetch`: its tsconfig has neither, so a use of one does not
 * typecheck.
 *
 * Everything here is generated. The operations come from the contract (lib/export/api.ts), the types from its schemas
 * (lib/api's schemaToTs, once there is one); with an empty contract the client has only `request`. */

import type { ApiModel, ApiOperation } from "../api";
import { GENERATED, jsonCode, jsonFile, str } from "../code";
import { toYaml } from "../yaml";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

const TRANSPORT = `${GENERATED}
/* The one thing the client needs from the platform: a way to send a request and read the answer. fetch, React
 * Native, a mini-program's request API and the mocks each make one (see fetch.ts). No DOM or fetch types here. */

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"

export type QueryValue = string | number | boolean
export type Query = Readonly<Record<string, QueryValue | readonly QueryValue[] | null | undefined>>

/** the little of an AbortSignal a transport may read */
export interface AbortSignalLike {
  readonly aborted: boolean
}

export interface TransportRequest {
  /** the operation's id in the contract, when the call is one of its operations */
  operationId?: string
  method: HttpMethod
  /** the path with its parameters filled in, from the API's root: /products/42 */
  path: string
  query?: Query
  headers?: Readonly<Record<string, string>>
  /** a JSON value, sent as JSON; or the bytes of a file */
  body?: unknown
  signal?: AbortSignalLike
  /** told how much of the body has gone out, where the platform can say (an upload over XMLHttpRequest, Taro's uploadFile) */
  onUploadProgress?: (sent: number, total: number) => void
}

export interface TransportResponse {
  status: number
  headers: Readonly<Record<string, string>>
  /** the answer: parsed JSON, else text, else undefined when there is none */
  body: unknown
}

export interface Transport {
  request(request: TransportRequest): Promise<TransportResponse>
}

/** the query as a URL's search string, without the "?": keys in the order given, arrays as repeated keys */
export function queryString(query: Query | undefined): string {
  if (!query) return ""
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    for (const one of Array.isArray(value) ? value : [value]) parts.push(\`\${encodeURIComponent(key)}=\${encodeURIComponent(String(one))}\`)
  }
  return parts.join("&")
}
`;

const CLIENT = `${GENERATED}
import type { HttpMethod, Query, Transport, TransportRequest, TransportResponse } from "./transport"

/** an answer outside 2xx: its status and what came with it */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly operationId: string | undefined

  constructor(response: TransportResponse, operationId?: string) {
    super(\`\${operationId ?? "request"} failed with status \${response.status}\`)
    this.name = "ApiError"
    this.status = response.status
    this.body = response.body
    this.operationId = operationId
  }
}

/** what any call may add: headers, a signal that cancels it, and what hears how an upload goes */
export type CallInit = Pick<TransportRequest, "headers" | "signal" | "onUploadProgress">

export type Call = { operationId?: string; method: HttpMethod; path: string; query?: Query; body?: unknown; headers?: Readonly<Record<string, string>> }

/** A path parameter as one segment of the path. "." and ".." would be steps along the path to every URL parser (fetch
 *  included): data that held one would send the call, and the session's token, to another address of the API. */
export function segment(value: string | number | boolean): string {
  const s = encodeURIComponent(String(value))
  if (s === "." || s === "..") throw new TypeError("A path parameter cannot be " + JSON.stringify(s) + ".")
  return s
}

/** Sends one call and gives back what a 2xx answer holds; anything else is thrown as an ApiError. */
export async function send<T>(transport: Transport, call: Call, init: CallInit = {}): Promise<T> {
  const response = await transport.request({ ...call, ...init, ...(call.headers || init.headers ? { headers: { ...call.headers, ...init.headers } } : {}) })
  if (response.status < 200 || response.status > 299) throw new ApiError(response, call.operationId)
  return response.body as T
}
`;

const FETCH = `${GENERATED}
import { queryString, type Transport, type TransportRequest, type TransportResponse } from "./transport"

/** the little of fetch this transport uses, so the package needs no DOM types */
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | Uint8Array | ArrayBuffer; signal?: unknown },
) => Promise<{
  status: number
  headers: { forEach(fn: (value: string, key: string) => void): void; get(name: string): string | null }
  text(): Promise<string>
}>

export type FetchTransportOptions = {
  /** where the API is: "/api", "https://api.example.com" */
  baseUrl: string
  /** the fetch to use; by default the platform's own (browsers, React Native, Node 18+) */
  fetch?: FetchLike
  /** headers every call sends */
  headers?: Readonly<Record<string, string>>
}

/** a file as the transport carries one (a data URL) */
type DataFile = { name: string; type: string; dataUrl: string }

type FormDataLike = { append(name: string, value: unknown, fileName?: string): void }
type BlobLike = { size: number; type: string }

const isBlob = (v: unknown): v is BlobLike => !!v && typeof v === "object" && typeof (v as BlobLike).size === "number" && typeof (v as BlobLike).type === "string"
const isDataFile = (v: unknown): v is DataFile => !!v && typeof v === "object" && typeof (v as DataFile).dataUrl === "string"

/** a data URL's bytes as a Blob, where the platform has Blob */
function blobOf(file: DataFile): unknown {
  const Blob = (globalThis as { Blob?: new (parts: unknown[], o: { type: string }) => unknown }).Blob
  const atob = (globalThis as { atob?: (s: string) => string }).atob
  if (!Blob || !atob) return file.dataUrl
  const bin = atob(file.dataUrl.slice(file.dataUrl.indexOf(",") + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: file.type })
}

/** A multipart body as a FormData: files as they are (a data URL made a blob), lists as repeated fields, objects as
 *  JSON, the rest as words. Undefined where the platform has no FormData. */
export function formDataOf(body: Record<string, unknown>): unknown {
  const FormData = (globalThis as { FormData?: new () => FormDataLike }).FormData
  if (!FormData) return undefined
  const form = new FormData()
  const add = (key: string, v: unknown) => {
    if (v === undefined || v === null) return
    if (isDataFile(v)) form.append(key, blobOf(v), v.name)
    else if (isBlob(v)) form.append(key, v, (v as { name?: string }).name)
    else if (typeof v === "object") form.append(key, JSON.stringify(v))
    else form.append(key, String(v))
  }
  for (const [key, v] of Object.entries(body)) for (const one of Array.isArray(v) ? v : [v]) add(key, one)
  return form
}

/** whether a request's body goes as multipart/form-data */
export const isMultipart = (request: TransportRequest) => Object.entries(request.headers ?? {}).some(([k, v]) => k.toLowerCase() === "content-type" && /multipart\\/form-data/i.test(v))

/** A transport over fetch. JSON goes out as JSON; bytes go out as they are; a multipart body as form data. */
export function createFetchTransport(options: FetchTransportOptions): Transport {
  return {
    async request(request: TransportRequest): Promise<TransportResponse> {
      const fetchNow = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch
      if (!fetchNow) throw new Error("There is no fetch here: give createFetchTransport one, or use another transport")
      const search = queryString(request.query)
      const binary = request.body instanceof Uint8Array || request.body instanceof ArrayBuffer
      const form = isMultipart(request) && request.body && typeof request.body === "object" && !binary ? formDataOf(request.body as Record<string, unknown>) : undefined
      const headers: Record<string, string> = { accept: "application/json", ...options.headers, ...request.headers }
      /* fetch writes a form's content type itself, with its boundary */
      if (form) for (const k of Object.keys(headers)) if (k.toLowerCase() === "content-type") delete headers[k]
      if (request.body !== undefined && !binary && !form) headers["content-type"] ??= "application/json"
      const response = await fetchNow(\`\${options.baseUrl.replace(/\\/$/, "")}\${request.path}\${search ? \`?\${search}\` : ""}\`, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : form ? (form as string) : binary ? (request.body as Uint8Array | ArrayBuffer) : JSON.stringify(request.body),
        signal: request.signal,
      })
      const out: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        out[key] = value
      })
      const text = await response.text()
      let body: unknown = text === "" ? undefined : text
      if (text !== "" && /json/i.test(response.headers.get("content-type") ?? "")) body = JSON.parse(text)
      return { status: response.status, headers: out, body }
    },
  }
}
`;

/** the input type of one operation: its path parameters, its body, its query */
function inputType(op: ApiOperation): string | null {
  const parts: string[] = [];
  if (op.params.length) parts.push(`params: { ${op.params.map((p) => `readonly ${str(p)}: string | number`).join("; ")} }`);
  if (op.body) parts.push(`body: ${op.bodyType}`);
  if (op.query) parts.push("query?: Query");
  return parts.length ? `{ ${parts.join("; ")} }` : null;
}

/** the path of an operation as code: its fixed pieces as strings, its parameters as encoded segments */
function pathCode(op: ApiOperation): string {
  const pieces: string[] = [];
  let at = 0;
  for (const m of op.path.matchAll(/\{([^{}/]+)\}/g)) {
    if (m.index! > at) pieces.push(str(op.path.slice(at, m.index)));
    pieces.push(`segment(input.params[${str(m[1])}])`);
    at = m.index! + m[0].length;
  }
  if (at < op.path.length) pieces.push(str(op.path.slice(at)));
  return pieces.join(" + ") || str("/");
}

function operationsSource(api: ApiModel): string {
  const ops = api.operations;
  const methods = ops.map((op) => {
    const input = inputType(op);
    const call = [`operationId: ${str(op.operationId)}`, `method: ${str(op.method)}`, `path: ${pathCode(op)}`, ...(op.query ? ["query: input?.query"] : []), ...(op.body ? ["body: input.body"] : []), ...(op.multipart ? ['headers: { "content-type": "multipart/form-data" }'] : [])].join(", ");
    const arg = input ? (op.params.length || op.body ? `input: ${input}` : `input?: ${input}`) : "";
    return `    ${op.name}: (${arg}${arg ? ", " : ""}init?: CallInit) => send<${op.responseType}>(transport, { ${call} }, init),`;
  });
  const typeNames = ops.flatMap((op) => [op.bodyType, op.responseType]).filter((t) => !["unknown", "void", "never"].includes(t) && /^[A-Za-z_$][\w$]*$/.test(t));
  return `${GENERATED}
import { send, type CallInit${ops.some((op) => op.params.length) ? ", segment" : ""} } from "../client"
import type { ${ops.some((op) => op.query) ? "Query, " : ""}Transport, TransportRequest } from "../transport"
${typeNames.length ? `import type { ${[...new Set(typeNames)].sort().join(", ")} } from "./types"\n` : ""}
/** every operation of the contract: its id, method and path as the contract writes it */
export const OPERATIONS = [
${ops.map((op) => `  { name: ${str(op.name)}, operationId: ${str(op.operationId)}, method: ${str(op.method)}, path: ${str(op.path)}, status: ${op.status} },`).join("\n")}
] as const

export type OperationName = (typeof OPERATIONS)[number]["name"]

/** The API over a transport: one function per operation, and \`request\` for a call the contract does not name. */
export function createApi(transport: Transport) {
  return {
${methods.join("\n")}
    request: <T = unknown>(request: TransportRequest) => send<T>(transport, request, { headers: request.headers, signal: request.signal, onUploadProgress: request.onUploadProgress }),
  }
}

export type Api = ReturnType<typeof createApi>
`;
}

const INDEX = `${GENERATED}
export * from "./transport"
export * from "./client"
export * from "./fetch"
export * from "./generated/types"
export * from "./generated/operations"
export { CONTRACT, ASYNC_CONTRACT } from "./generated/contract"
`;

const CLIENT_TEST = `${GENERATED}
import { describe, expect, it } from "vitest"
import { ApiError, createApi, queryString, type Transport, type TransportRequest } from "../index"
import { segment } from "../client"
import { OPERATIONS } from "./operations"

/** a transport that answers every call with what it is given, and remembers what it was asked */
function answering(status: number, body: unknown) {
  const asked: TransportRequest[] = []
  const transport: Transport = {
    async request(request) {
      asked.push(request)
      return { status, headers: {}, body }
    },
  }
  return { transport, asked }
}

describe("the API client", () => {
  it("has a function for every operation of the contract", () => {
    const api = createApi(answering(200, null).transport) as Record<string, unknown>
    for (const op of OPERATIONS) expect(typeof api[op.name]).toBe("function")
  })

  it("sends a call through its transport and gives back what a 2xx answer holds", async () => {
    const { transport, asked } = answering(200, { ok: true })
    const api = createApi(transport)
    await expect(api.request({ method: "GET", path: "/anything", query: { page: 2, tag: ["a", "b"] } })).resolves.toEqual({ ok: true })
    expect(asked[0]).toMatchObject({ method: "GET", path: "/anything" })
    expect(queryString(asked[0].query)).toBe("page=2&tag=a&tag=b")
  })

  it("throws what is not 2xx as an ApiError with its status", async () => {
    const api = createApi(answering(501, { error: "Not Implemented" }).transport)
    await expect(api.request({ method: "POST", path: "/anything", body: {} })).rejects.toBeInstanceOf(ApiError)
    await expect(api.request({ method: "POST", path: "/anything" })).rejects.toMatchObject({ status: 501 })
  })

  it("keeps a path parameter one segment of its own path, whatever the data gives it", () => {
    expect(segment("a/b?c#d")).toBe("a%2Fb%3Fc%23d")
    expect(segment(42)).toBe("42")
    /* "." and ".." are steps along the path to every URL parser (fetch too): /orders/{id}/cancel with ".." would be
       sent to /cancel, with the session's token */
    for (const step of [".", ".."]) expect(() => segment(step)).toThrow()
    expect(segment("%2e%2e")).toBe("%252e%252e")
    expect(segment("...")).toBe("...")
  })
})
`;

const TSCONFIG = jsonFile({
  extends: "../../tsconfig.base.json",
  compilerOptions: { lib: ["ES2022"], types: [], verbatimModuleSyntax: true },
  include: ["src"],
  exclude: ["src/**/*.test.ts"],
});

/* the tests see what the code sees, and vitest */
const TSCONFIG_TEST = jsonFile({ extends: "./tsconfig.json", include: ["src"], exclude: [] });

export const apiTarget: ProductTarget = {
  id: "api",
  build(ctx: ProductContext): Workspace {
    const api = ctx.api;
    const asyncapi = api.asyncapi ?? { asyncapi: "3.0.0", info: { title: ctx.title, version: "0.1.0" }, channels: {} };
    return {
      dir: "packages/api",
      pkg: `${ctx.scope}/api`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "接口契约（OpenAPI、AsyncAPI）、类型和与平台无关的客户端", en: "the contract (OpenAPI, AsyncAPI), its types and the platform-neutral client" },
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/api`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts", "./openapi.yaml": "./openapi.yaml", "./asyncapi.yaml": "./asyncapi.yaml" },
              scripts: { typecheck: "tsc --noEmit -p . && tsc --noEmit -p tsconfig.test.json", test: "vitest run" },
              devDependencies: { typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(TSCONFIG),
        "tsconfig.test.json": generated(TSCONFIG_TEST),
        "openapi.yaml": generated(toYaml(api.openapi)),
        "asyncapi.yaml": generated(toYaml(asyncapi)),
        "src/index.ts": generated(INDEX),
        "src/transport.ts": generated(TRANSPORT),
        "src/client.ts": generated(CLIENT),
        "src/fetch.ts": generated(FETCH),
        "src/generated/types.ts": generated(`${GENERATED}\n${api.types.trim() ? `${api.types.trim()}\n` : "/* the contract has no schemas yet */\nexport {}\n"}`),
        "src/generated/operations.ts": generated(operationsSource(api)),
        "src/generated/contract.ts": generated(`${GENERATED}\n/** the OpenAPI 3.1 document of the API, as data (openapi.yaml is the same) */\nexport const CONTRACT: Record<string, unknown> = ${jsonCode(api.openapi)}\n\n/** the AsyncAPI 3.0 document of its realtime channels (asyncapi.yaml is the same) */\nexport const ASYNC_CONTRACT: Record<string, unknown> = ${jsonCode(asyncapi)}\n`),
        "src/generated/client.test.ts": generated(CLIENT_TEST),
      },
    };
  },
};
