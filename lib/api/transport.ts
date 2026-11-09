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
  /** the answer, as body.ts `readBody` reads one: JSON parsed, text as a string, a file (an attachment, or any type
   *  that is not text) as a `TransportFile`, undefined when there is none */
  body: unknown;
}

/** A message a realtime channel brought (AsyncAPI, docs/接口.md): which channel (its id), which of its messages, what
 *  it carries, and when it was sent, in ms on the back end's clock. */
export type ChannelMessage = { channel: string; message: string; payload: unknown; at: number };

/** A connection to a realtime channel: the app's messages to it, by name, and its end. */
export interface ChannelConnection {
  send(message: string, payload?: unknown): void;
  close(): void;
}

/** what a connection says of itself while it lasts: open, or closed by the other side (or never opened) */
export type ChannelStatus = "open" | "closed";

export interface Transport {
  request(request: TransportRequest): Promise<TransportResponse>;
  /** Opens a realtime channel of the contract: by its id or its address with its parameters filled in
   *  (`/rooms/r1`). The server's messages come to `onMessage`; `onStatus` hears when it opens and when it closes;
   *  `token` is the session's, for a back end that asks who connects. A
   *  transport with no realtime leaves this out, and a screen that subscribes reads nothing. */
  connect?(address: string, onMessage: (message: ChannelMessage) => void, o?: { onStatus?: (status: ChannelStatus) => void; token?: string }): ChannelConnection;
  /** The time now on the back end's clock, in ms: what the app reads as `now` and counts a countdown by
   *  (docs/边界与契约.md: the UI never takes its own wall clock for the domain's). The mock library's can stand
   *  still or run faster; a transport that leaves it out is read as the device's clock. */
  now?(): number;
}

/** a transport that answers every call with one response: for tests, and for the moment before mocks are set up */
export function constantTransport(response: TransportResponse): Transport {
  return { request: async () => response };
}
