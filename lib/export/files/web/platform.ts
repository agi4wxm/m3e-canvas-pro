//! Copied as it is (lib/export/copy.ts) into apps/web/src/generated/platform.ts of every product with a web app (lib/export/targets/web.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
import type { ChangeEvent } from "react"
import { queryString, readBody, type Transport, type TransportRequest, type TransportResponse } from "@m3e/api"
import type { TokenStorage } from "@m3e/app-runtime"

/** the session's tokens in this tab's sessionStorage: kept across reloads, gone when the tab is closed */
export function webStorage(): TokenStorage {
  return {
    get: (key) => {
      try {
        return window.sessionStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value)
      } catch {
        /* storage refused (a private window): the session lasts as long as the page */
      }
    },
    remove: (key) => {
      try {
        window.sessionStorage.removeItem(key)
      } catch {
        /* nothing kept to remove */
      }
    },
  }
}

const isFile = (v: unknown): v is Blob => typeof Blob !== "undefined" && v instanceof Blob

/** whether a request's body goes as a multipart form: its content type says so, or files are in it */
function multipart(request: TransportRequest): boolean {
  const type = Object.entries(request.headers ?? {}).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? ""
  if (/multipart\/form-data/i.test(type)) return true
  const body = request.body
  return !!body && typeof body === "object" && Object.values(body).some((v) => isFile(v) || (Array.isArray(v) && v.some(isFile)))
}

/** a multipart body as form data: files as they are, lists as repeated fields, objects as JSON, the rest as words */
function formData(body: unknown): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries((body ?? {}) as Record<string, unknown>))
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one === undefined || one === null) continue
      if (isFile(one)) form.append(key, one, (one as File).name)
      else form.append(key, typeof one === "object" ? JSON.stringify(one) : String(one))
    }
  return form
}

/** Sends what carries files over XMLHttpRequest, so the upload's progress can be told (`onUploadProgress`); everything
 *  else goes through `inner`. */
export function withUploads(inner: Transport, baseUrl: string): Transport {
  return {
    request(request) {
      if (!multipart(request)) return inner.request(request)
      return new Promise<TransportResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const search = queryString(request.query)
        xhr.open(request.method, `${baseUrl.replace(/\/$/, "")}${request.path}${search ? `?${search}` : ""}`)
        for (const [k, v] of Object.entries(request.headers ?? {})) if (k.toLowerCase() !== "content-type") xhr.setRequestHeader(k, v)
        xhr.setRequestHeader("accept", "application/json")
        xhr.upload.onprogress = (event) => request.onUploadProgress?.(event.loaded, event.lengthComputable ? event.total : 0)
        xhr.onerror = () => reject(new Error("The network failed"))
        /* the answer's bytes as they came, read as the fetch transport reads every answer (JSON, text or a file) */
        xhr.responseType = "arraybuffer"
        xhr.onload = () => {
          const headers: Record<string, string> = {}
          for (const line of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
            const at = line.indexOf(":")
            if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
          }
          const bytes = xhr.response instanceof ArrayBuffer ? new Uint8Array(xhr.response) : new Uint8Array(0)
          resolve({ status: xhr.status, headers, body: readBody({ method: request.method, path: request.path, status: xhr.status, headers, bytes }) })
        }
        xhr.send(formData(request.body))
      })
    },
  }
}

/** what a file input inside a part picked, handed to `take`: its file, or its files for one that takes several */
export const pickFiles = (many: boolean, take: (files: File | File[]) => void) => (event: ChangeEvent<HTMLElement>) => {
  const input = event.target as HTMLInputElement
  if (input.type !== "file" || !input.files?.length) return
  take(many ? [...input.files] : input.files[0])
}

/** a date and time the contract writes (ISO 8601) as a datetime-local input shows it, in this place's time */
export function localDateTime(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** what a datetime-local input holds, as the contract writes a date and time */
export function isoDateTime(local: string): string {
  const d = new Date(local)
  return !local || Number.isNaN(d.getTime()) ? "" : d.toISOString()
}

