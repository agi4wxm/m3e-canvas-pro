//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/transport.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code that is the same in every app, typechecked and linted with the kit. Written in the product's
//! style (Prettier, no semicolons); the lines starting with //! are the editor's only.
import { Platform } from "react-native"
import { createFetchTransport, queryString, readBody, type Transport, type TransportRequest, type TransportResponse } from "@m3e/api"

/** a file a picker gave (./files): what the transport sends for a file field, as the mocks read one too */
export type PickedFile = { name: string; type: string; size?: number; dataUrl: string; uri?: string }

const isFile = (v: unknown): v is PickedFile => !!v && typeof v === "object" && typeof (v as PickedFile).dataUrl === "string"

const multipart = (r: TransportRequest) => /multipart\/form-data/i.test(r.headers?.["content-type"] ?? "") && !!r.body && typeof r.body === "object"

/** the headers of an answer, by their names in lower case */
function headersOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const at = line.indexOf(":")
    if (at > 0) out[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return out
}

/** A multipart form sent with XMLHttpRequest, which tells how far the upload has gone: a file field is the file the
 *  picker gave (its uri on a phone, its bytes on the web), any other field its words. */
async function upload(baseUrl: string, r: TransportRequest): Promise<TransportResponse> {
  const form = new FormData()
  for (const [key, value] of Object.entries(r.body as Record<string, unknown>)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one === undefined || one === null) continue
      if (isFile(one)) {
        if (Platform.OS === "web") form.append(key, await (await fetch(one.uri ?? one.dataUrl)).blob(), one.name)
        else form.append(key, { uri: one.uri ?? one.dataUrl, name: one.name, type: one.type } as unknown as Blob)
      } else form.append(key, typeof one === "object" ? JSON.stringify(one) : String(one))
    }
  }
  const search = queryString(r.query)
  const url = `${baseUrl.replace(/\/$/, "")}${r.path}${search ? `?${search}` : ""}`
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(r.method, url)
    xhr.setRequestHeader("accept", "application/json")
    for (const [h, v] of Object.entries(r.headers ?? {})) if (h.toLowerCase() !== "content-type") xhr.setRequestHeader(h, v)
    if (r.onUploadProgress) xhr.upload.onprogress = (e) => r.onUploadProgress?.(e.loaded, e.total)
    /* the answer's bytes as they came, read as packages/api reads every answer (JSON, text or a file) */
    xhr.responseType = "arraybuffer"
    xhr.onload = () => {
      const headers = headersOf(xhr.getAllResponseHeaders())
      const bytes = xhr.response ? new Uint8Array(xhr.response as ArrayBuffer) : new Uint8Array(0)
      resolve({ status: xhr.status, headers, body: readBody({ method: r.method, path: r.path, status: xhr.status, headers, bytes }) })
    }
    xhr.onerror = () => reject(new Error("Network request failed"))
    xhr.send(form)
  })
}

/** The API over React Native's fetch: JSON as JSON, a multipart form (an upload) with its progress; every answer read
 *  the same way (JSON, text, or a file such as a PDF as its bytes). */
export function createNativeTransport(options: { baseUrl: string }): Transport {
  const json = createFetchTransport({ baseUrl: options.baseUrl })
  return { request: (r) => (multipart(r) ? upload(options.baseUrl, r) : json.request(r)) }
}
