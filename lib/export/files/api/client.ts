//! Copied as it is (lib/export/copy.ts) into packages/api/src/client.ts of every product (lib/export/targets/api.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
import type { HttpMethod, Query, Transport, TransportRequest, TransportResponse } from "./transport"

/** an answer outside 2xx: its status and what came with it */
export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  readonly operationId: string | undefined

  constructor(response: TransportResponse, operationId?: string) {
    super(`${operationId ?? "request"} failed with status ${response.status}`)
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
