//! Copied as it is (lib/export/copy.ts) into apps/mobile/src/generated/api.ts of every product with a mobile app (lib/export/targets/mobile.ts):
//! the mobile app's own code, typechecked and linted with the kit (rn/types/app.d.ts stands in for the Expo packages
//! the kit does not install). Written in the product's style (Prettier, no semicolons); the lines starting with //!
//! are the editor's only.
import { createApi, segment, type CallInit } from "@m3e/api"
import { OPERATIONS } from "./contract"
import { runtime } from "./runtime"

/** the API as the app calls it: one function per operation (packages/api), over the session's transport */
export const api = createApi(runtime.transport)

/** what a call is given: its parameters by name (path, query, header, as the contract places them) and its body */
export type CallInput = { params?: Record<string, unknown>; body?: unknown }

/** Calls an operation of the contract by its id, as the design names it: its path filled in, the other parameters in its
 *  query or headers, the body as its media type wants it. A 2xx answer's body, or an ApiError. A path parameter is one
 *  segment of the path, as the typed client keeps it (`segment`): one that is "." or ".." is refused, since it would
 *  send the call, and the session's token, to another address of the API. */
export async function call<T = unknown>(operationId: string, input: CallInput = {}, init: CallInit = {}): Promise<T> {
  const op = OPERATIONS[operationId]
  if (!op) throw new Error(`The contract has no operation ${operationId}`)
  let path = op.path
  const query: Record<string, string | number | boolean> = {}
  const headers: Record<string, string> = { ...init.headers }
  for (const [name, v] of Object.entries(input.params ?? {})) {
    const at = op.params[name] ?? "query"
    if (v === undefined || v === null || v === "") continue
    const value = typeof v === "number" || typeof v === "boolean" ? v : typeof v === "string" ? v : JSON.stringify(v)
    if (at === "path") path = path.split(`{${name}}`).join(segment(value))
    else if (at === "header") headers[name] = String(value)
    else query[name] = value
  }
  if (op.media && input.body !== undefined) headers["content-type"] = op.media
  return api.request<T>({
    operationId,
    method: op.method,
    path,
    ...(Object.keys(query).length ? { query } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(init.signal ? { signal: init.signal } : {}),
    ...(init.onUploadProgress ? { onUploadProgress: init.onUploadProgress } : {}),
  })
}
