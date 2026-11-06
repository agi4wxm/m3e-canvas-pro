/* The API section of a document (`Doc.api`): the contract between the app and its back end, kept so that it maps one
 * to one onto the standard formats. Data models are JSON Schema 2020-12, HTTP endpoints are OpenAPI 3.1 operations,
 * realtime channels are AsyncAPI 3.0 channels and operations. The containers are lists with ids (one line each in the
 * project file, an order the author chose); what they hold is the standard objects themselves, so a schema, a
 * parameter, a request body or a response is written into openapi.yaml exactly as it is stored. What the standards
 * carry that this model does not use is kept verbatim (`extra`) and written back.
 *
 * Our own additions are OpenAPI / AsyncAPI extensions named `x-m3e-*` (pagination, the endpoints that sign in and
 * refresh, a server's environment, a channel's transport): docs/接口.md lists them. Plain data, no imports, so the
 * exporters, the mock library and the back-end generator can read it anywhere. */

/** the seven JSON Schema types */
export type JsonType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

/** A JSON Schema 2020-12 schema as OpenAPI 3.1 and AsyncAPI 3.0 carry it: an object of keywords, or a boolean schema
 *  (true takes anything, false nothing). `$ref: "#/components/schemas/<model>"` names a model of the document. The
 *  keywords listed are the ones the editor, the validation and the generators understand; any other keyword (an
 *  annotation, an `x-` extension, a keyword of a later draft) is kept as it is. */
export type JsonSchema = boolean | JsonSchemaObject;

export type JsonSchemaObject = {
  $ref?: string;
  type?: JsonType | JsonType[];
  title?: string;
  description?: string;
  /** date-time, date, time, uuid, email, uri, binary (a file in multipart/form-data or an octet stream), int32… */
  format?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  /** JSON Schema's list of examples; OpenAPI's single `example` is read too and kept */
  examples?: unknown[];
  example?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  not?: JsonSchema;
  /** OpenAPI's: which property tells the shapes of a oneOf / anyOf apart */
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  contentMediaType?: string;
  contentEncoding?: string;
  [keyword: string]: unknown;
};

/** A data model: a named schema, `components.schemas.<name>` in both specs. Names are what TypeScript types are named
 *  after, so they are identifiers: a letter, then letters, digits and `_` (User, OrderItem, Problem). */
export type ApiModel = { name: string; schema: JsonSchema };

export const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** an OpenAPI reference to a reusable object (`#/components/parameters/Page`), kept as it came */
export type ApiRef = { $ref: string; summary?: string; description?: string };

/** OpenAPI 3.1 Parameter object: in the path (always required), the query, a header or a cookie */
export type ApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  deprecated?: boolean;
  schema?: JsonSchema;
  example?: unknown;
  examples?: Record<string, unknown>;
  style?: string;
  explode?: boolean;
  [field: string]: unknown;
};

/** OpenAPI 3.1 Media Type object: what a body of one content type holds */
export type ApiMediaType = { schema?: JsonSchema; example?: unknown; examples?: Record<string, unknown>; encoding?: Record<string, unknown>; [field: string]: unknown };

/** OpenAPI 3.1 Request Body object. An upload is `multipart/form-data` whose schema has `format: binary` fields. */
export type ApiRequestBody = { description?: string; required?: boolean; content: Record<string, ApiMediaType>; [field: string]: unknown };

/** OpenAPI 3.1 Response object */
export type ApiResponse = { description: string; content?: Record<string, ApiMediaType>; headers?: Record<string, unknown>; links?: Record<string, unknown>; [field: string]: unknown };

/** How a list endpoint pages (`x-m3e-pagination`): the field of the response that holds the items, and the names of
 *  the parameters and fields that move through the pages. Left out, a name is the default shown. */
export type ApiPagination =
  | {
      style: "cursor";
      /** the response field holding the page's items (an array) */
      items: string;
      /** the query parameter that asks for the page after a cursor; "cursor" */
      cursorParam?: string;
      /** the response field holding the next page's cursor (absent or null on the last page); "nextCursor" */
      nextField?: string;
      /** the query parameter for the page size; "limit" */
      limitParam?: string;
    }
  | {
      style: "offset";
      items: string;
      /** "offset" */
      offsetParam?: string;
      /** "limit" */
      limitParam?: string;
      /** the response field with the count of every item; "total" */
      totalField?: string;
    };

/** OpenAPI security requirement: scheme name → scopes (empty for a bearer token or a key) */
export type SecurityRequirement = Record<string, string[]>;

/** One HTTP endpoint: an OpenAPI 3.1 Operation object with the method and path it is under. */
export type ApiEndpoint = {
  /** unique in the document; the endpoint's id, the client function's name and the server handler's */
  operationId: string;
  method: HttpMethod;
  /** OpenAPI path template, from the server's base URL: /users/{id} */
  path: string;
  summary?: string;
  description?: string;
  /** the first tag groups it in the editor and names the generated client's module */
  tags?: string[];
  deprecated?: boolean;
  /** path, query, header and cookie parameters; each `{name}` of the path has a path parameter */
  parameters?: (ApiParameter | ApiRef)[];
  requestBody?: ApiRequestBody | ApiRef;
  /** by status code ("200", "201", "404", "4XX") or "default" */
  responses: Record<string, ApiResponse | ApiRef>;
  /** who may call it: [] for anyone, left out for the API's default (`ApiAuth.security`) */
  security?: SecurityRequirement[];
  pagination?: ApiPagination;
  /** the Operation's other fields (servers, callbacks, externalDocs, x-…), written back as they were */
  extra?: Record<string, unknown>;
};

/** OpenAPI 3.1 Security Scheme object: a bearer JWT (`{type: "http", scheme: "bearer", bearerFormat: "JWT"}`), an API
 *  key (`{type: "apiKey", in: "header", name: "X-API-Key"}`), OAuth2 with the authorization code flow, OpenID Connect */
export type ApiSecurityScheme = {
  type: "http" | "apiKey" | "oauth2" | "openIdConnect" | "mutualTLS";
  description?: string;
  scheme?: string;
  bearerFormat?: string;
  in?: "header" | "query" | "cookie";
  name?: string;
  flows?: {
    authorizationCode?: { authorizationUrl: string; tokenUrl: string; refreshUrl?: string; scopes: Record<string, string> };
    clientCredentials?: { tokenUrl: string; refreshUrl?: string; scopes: Record<string, string> };
    implicit?: { authorizationUrl: string; refreshUrl?: string; scopes: Record<string, string> };
    password?: { tokenUrl: string; refreshUrl?: string; scopes: Record<string, string> };
  };
  openIdConnectUrl?: string;
  [field: string]: unknown;
};

/** How the app proves who it is. `schemes` and `security` are OpenAPI's `components.securitySchemes` and top-level
 *  `security`; the rest (`x-m3e-auth`) says which endpoints sign in, refresh and sign out, and where their responses
 *  carry the tokens, so the client and the mock know how a session starts and goes on. */
export type ApiAuth = {
  schemes: Record<string, ApiSecurityScheme>;
  /** what every endpoint needs unless it says otherwise; left out or [] for nothing */
  security?: SecurityRequirement[];
  /** operationId of the endpoint that signs in and answers with the tokens */
  login?: string;
  /** operationId of the endpoint that trades the refresh token for a new access token */
  refresh?: string;
  logout?: string;
  /** the response field holding the access token; "accessToken" */
  tokenField?: string;
  /** the response field holding the refresh token; "refreshToken" */
  refreshTokenField?: string;
};

/** One environment the API runs in: an OpenAPI server (`url`, `x-m3e-env`) and, when it has realtime channels, the
 *  AsyncAPI server of the same name (`realtime`, a ws:// or wss:// URL; an SSE channel uses `url`). */
export type ApiServer = {
  /** dev, staging, prod, or a name of the author's */
  env: string;
  /** base URL of the HTTP API: https://api.example.com/v1 (relative "/api" is allowed) */
  url: string;
  description?: string;
  /** base URL of the realtime channels: wss://rt.example.com */
  realtime?: string;
  /** the OpenAPI Server object's other fields (variables, x-…) */
  extra?: Record<string, unknown>;
};

/** an AsyncAPI 3.0 Message object: what goes over a channel */
export type ApiMessage = {
  /** its key in the channel's messages */
  name: string;
  title?: string;
  summary?: string;
  description?: string;
  /** application/json unless it says */
  contentType?: string;
  payload?: JsonSchema;
  headers?: JsonSchema;
  examples?: { name?: string; summary?: string; payload?: unknown; headers?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
};

/** An AsyncAPI 3.0 Operation on its channel. The AsyncAPI document describes the back end, as the OpenAPI one does:
 *  `send` is a message the server sends to the app, `receive` one the server takes from the app. */
export type ApiChannelOperation = {
  /** unique among the operations of the document */
  id: string;
  action: "send" | "receive";
  /** the names of the channel's messages it carries; every one of them when left out */
  messages?: string[];
  summary?: string;
  description?: string;
  extra?: Record<string, unknown>;
};

/** A realtime channel (AsyncAPI 3.0): an address on the realtime server, the messages that go over it, and who sends
 *  which. */
export type ApiChannel = {
  /** its key in AsyncAPI `channels` */
  id: string;
  /** /rooms/{roomId}; parameters in braces */
  address: string;
  title?: string;
  summary?: string;
  description?: string;
  /** `x-m3e-transport`: a WebSocket (the default) or server-sent events, which only the server sends over */
  transport?: "websocket" | "sse";
  /** AsyncAPI 3.0 Parameter objects for the braces of the address */
  parameters?: Record<string, { description?: string; enum?: string[]; default?: string; examples?: string[]; location?: string }>;
  messages: ApiMessage[];
  operations: ApiChannelOperation[];
  extra?: Record<string, unknown>;
};

/** an OpenAPI tag: the name endpoints are grouped by, with words about it */
export type ApiTag = { name: string; description?: string; extra?: Record<string, unknown> };

/** OpenAPI `info` */
export type ApiInfo = { title?: string; version?: string; description?: string; extra?: Record<string, unknown> };

/** The API section of a document. Every field may be left out; a document without one has no API. */
export type ApiSpec = {
  info?: ApiInfo;
  servers?: ApiServer[];
  models?: ApiModel[];
  endpoints?: ApiEndpoint[];
  tags?: ApiTag[];
  auth?: ApiAuth;
  channels?: ApiChannel[];
  /** What an imported spec held that the model has no place for, written back as it came: OpenAPI's webhooks,
   *  externalDocs, top-level x- fields, the reusable components other than schemas and security schemes (responses,
   *  parameters, requestBodies, headers, examples, links, callbacks, pathItems: endpoints may `$ref` them), and a path
   *  item's own fields (`paths`: summary, description, servers by path); AsyncAPI's top-level fields likewise. */
  extra?: { openapi?: Record<string, unknown>; asyncapi?: Record<string, unknown> };
};

/** where a model is referred to from */
export const MODEL_REF = "#/components/schemas/";
/** the reference to a model */
export const modelRef = (name: string) => `${MODEL_REF}${name}`;
/** the model a reference names, or undefined for another kind of reference */
export const refModel = (ref: unknown): string | undefined => (typeof ref === "string" && ref.startsWith(MODEL_REF) && !ref.slice(MODEL_REF.length).includes("/") ? decodePointer(ref.slice(MODEL_REF.length)) : undefined);

/** a JSON Pointer token read back (~1 is a slash, ~0 a tilde) */
export const decodePointer = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");
/** a name written as a JSON Pointer token */
export const encodePointer = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

/** the default page parameter and field names, filled in */
export function paginationOf(p: ApiPagination): Required<ApiPagination> {
  return p.style === "cursor"
    ? { style: "cursor", items: p.items, cursorParam: p.cursorParam ?? "cursor", nextField: p.nextField ?? "nextCursor", limitParam: p.limitParam ?? "limit" }
    : { style: "offset", items: p.items, offsetParam: p.offsetParam ?? "offset", limitParam: p.limitParam ?? "limit", totalField: p.totalField ?? "total" };
}

/** the token fields of the sign-in response, filled in */
export const authFields = (a: ApiAuth | undefined) => ({ token: a?.tokenField ?? "accessToken", refreshToken: a?.refreshTokenField ?? "refreshToken" });
