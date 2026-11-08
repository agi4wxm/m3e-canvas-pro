//! Copied as it is (lib/export/copy.ts) into packages/api/src/fetch.ts of every product (lib/export/targets/api.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
import { readBody, utf8Bytes } from "./body"
import { queryString, type Transport, type TransportRequest, type TransportResponse } from "./transport"

/** the little of fetch this transport uses, so the package needs no DOM types */
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | Uint8Array | ArrayBuffer; signal?: unknown },
) => Promise<{
  status: number
  headers: { forEach(fn: (value: string, key: string) => void): void; get(name: string): string | null }
  /* the bytes as they came: a file (a PDF, a picture) read as text would be broken */
  arrayBuffer?(): Promise<ArrayBuffer>
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
export const isMultipart = (request: TransportRequest) => Object.entries(request.headers ?? {}).some(([k, v]) => k.toLowerCase() === "content-type" && /multipart\/form-data/i.test(v))

/** A transport over fetch. JSON goes out as JSON; bytes go out as they are; a multipart body as form data. The answer
 *  is read as its bytes, then as body.ts says: JSON, text, or a file. */
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
      const response = await fetchNow(`${options.baseUrl.replace(/\/$/, "")}${request.path}${search ? `?${search}` : ""}`, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : form ? (form as string) : binary ? (request.body as Uint8Array | ArrayBuffer) : JSON.stringify(request.body),
        signal: request.signal,
      })
      const out: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        out[key] = value
      })
      const bytes = response.arrayBuffer ? new Uint8Array(await response.arrayBuffer()) : utf8Bytes(await response.text())
      return { status: response.status, headers: out, body: readBody({ method: request.method, path: request.path, status: response.status, headers: out, bytes }) }
    },
  }
}
