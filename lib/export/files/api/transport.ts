//! Copied as it is (lib/export/copy.ts) into packages/api/src/transport.ts of every product (lib/export/targets/api.ts).
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
/* The one thing the client needs from the platform: a way to send a request and read the answer. fetch, React
 * Native, a mini-program's request API and the mocks each make one (see fetch.ts). No DOM or fetch types here. */

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS"

export type QueryValue = string | number | boolean
export type Query = Readonly<Record<string, QueryValue | readonly QueryValue[] | null | undefined>>

/** the little of an AbortSignal a transport may read */
export interface AbortSignalLike {
  readonly aborted: boolean
}

/** a file in a request or an answer: its bytes as a data URL, with its name and type */
export type TransportFile = { name: string; type: string; dataUrl: string; size?: number }

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
  /** the answer (body.ts readBody): JSON parsed, text as a string, a file (an attachment, or any type that is not
   *  text) as a TransportFile, undefined when there is none */
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
    for (const one of Array.isArray(value) ? value : [value]) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(one))}`)
  }
  return parts.join("&")
}
