/* How the editor talks to an API: the same shape as the `Transport` the exported product's packages/api is built on
 * (lib/export/targets/api.ts), so the preview, the exported web and mobile apps and a mini-program all call the
 * contract the same way. The preview's transport is the mock library (lib/mocks); the bindings (screens' data, forms,
 * taps that call an endpoint) only ever see this interface. No DOM and no `fetch` here: it runs in the editor, in
 * Node (MCP, evals) and, as generated code, in React Native and mini-programs. */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

/** what a caller can stop: an AbortSignal, or anything shaped like one */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

/** a file in a request or a response: the bytes as a data URL, with its name and type */
export type TransportFile = { name: string; type: string; dataUrl: string; size?: number };

export interface TransportRequest {
  /** the operation's id in the contract, when the call is one of its operations */
  operationId?: string;
  method: HttpMethod;
  /** the path with its parameters filled in, from the API's root: /products/42 */
  path: string;
  query?: Query;
  headers?: Readonly<Record<string, string>>;
  /** a JSON value, sent as JSON; multipart form fields as an object whose file fields are `TransportFile`s */
  body?: unknown;
  signal?: AbortSignalLike;
  /** told how much of the body has gone out, where the platform can say (an upload over XMLHttpRequest, Taro's uploadFile) */
  onUploadProgress?: (sent: number, total: number) => void;
}

export interface TransportResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  /** the answer: parsed JSON, else text, else undefined when there is none; a file as a `TransportFile` */
  body: unknown;
}

export interface Transport {
  request(request: TransportRequest): Promise<TransportResponse>;
}

/** a transport that answers every call with one response: for tests, and for the moment before mocks are set up */
export function constantTransport(response: TransportResponse): Transport {
  return { request: async () => response };
}
