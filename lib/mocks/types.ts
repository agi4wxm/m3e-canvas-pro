import type { MockCapabilityRule } from "../capabilities/types";
import type { WorldScript } from "../world/script";

/* The mock library of a document (`Doc.mocks`): how the API (Doc.api) is answered while the product is designed, with
 * no back end. Everything here is optional: a document with an API and no mock settings is answered with data made
 * from its schemas, seed 1, in the editor's language. What is kept is only what the author (or the AI) chose: a seed
 * and a locale, hints for fields whose names say too little, how many records each model has, records pinned by hand,
 * named scenarios (new user, lots of data, network error, slow network, signed out…), a library of files of every
 * kind, scripts of realtime messages, scripts of mock worlds for world views with no engine, and how signing in
 * behaves. docs/模拟库.md describes it.
 *
 * Plain data, no imports but the API's and the capabilities' types: the editor, the MCP server and the exported
 * packages/mocks read it. */

/** the languages made-up words, names, addresses and phone numbers come in */
export const MOCK_LOCALES = ["zh", "en", "ja", "ko"] as const;
export type MockLocale = (typeof MOCK_LOCALES)[number];

/** What a field is made of, beyond what its schema says. Inferred from the field's name, format and enum when the
 *  author gave none (lib/mocks/hints.ts); `auto` asks for exactly that. */
export const MOCK_KINDS = [
  "auto",
  "id",
  "uuid",
  "personName",
  "firstName",
  "lastName",
  "username",
  "avatar",
  "email",
  "phone",
  "address",
  "street",
  "city",
  "region",
  "country",
  "postcode",
  "latitude",
  "longitude",
  "company",
  "jobTitle",
  "productName",
  "category",
  "tag",
  "price",
  "currency",
  "quantity",
  "rating",
  "percent",
  "age",
  "title",
  "sentence",
  "paragraph",
  "word",
  "slug",
  "code",
  "color",
  "url",
  "image",
  "file",
  "audio",
  "video",
  "fileName",
  "mimeType",
  "date",
  "dateTime",
  "time",
  "boolean",
  "number",
  "integer",
  "enum",
  "status",
  "token",
  "password",
  "ip",
  "version",
  "constant",
] as const;
export type MockKind = (typeof MOCK_KINDS)[number];

/** How one field is made. Only `kind` is needed; the rest narrows it. */
export type MockHint = {
  kind: MockKind;
  /** numbers: the smallest and the largest */
  min?: number;
  max?: number;
  /** dates: the range, as ISO dates or relative to now: "-30d", "+7d", "-2h", "now" */
  from?: string;
  to?: string;
  /** enum and status: how often each value comes up, by value (the rest weigh 1) */
  weights?: Record<string, number>;
  /** words to pick from in place of the locale's own */
  values?: unknown[];
  /** constant: the one value */
  value?: unknown;
  /** image, file, audio, video: the mock files (ids) to draw from; any of the right kind when left out */
  files?: string[];
  /** image, file, audio, video: the format of the file, as a media type or an extension (text/csv, xlsx,
   *  model/gltf-binary); the schema's contentMediaType, else the kind's usual one, when left out */
  type?: string;
  /** how often an optional or nullable field is left empty, 0–1 */
  nullRate?: number;
};

/** The mock settings of one data model: how many records it has, how its fields are made, the records pinned by hand. */
export type MockModelConfig = {
  /** the model's name (Doc.api.models) */
  name: string;
  /** how many records there are, pinned ones included */
  count?: number;
  /** a number mixed into the seed: "regenerate" moves it on, so this model's records change and no other's do */
  seed?: number;
  /** by field path from the model: "name", "price.amount", "images[]", "items[].quantity" */
  hints?: Record<string, MockHint>;
  /** records picked by hand: they come first, exactly as written, before the generated ones */
  fixtures?: Record<string, unknown>[];
};

/** One answer an operation gives under a scenario. Left out, a field leaves the answer as the mocks would give it. */
export type MockStep = {
  /** answer with this status (an error injected: 401, 404, 500…); the body is `body`, else problem details */
  status?: number;
  /** the body to answer with, in place of the generated one */
  body?: unknown;
  /** fields laid over the answer as it would be (an order's `status` in a scenario of its own), when it is an object */
  patch?: Record<string, unknown>;
  /** how long it takes, in ms, in place of the scenario's latency */
  latencyMs?: number;
  /** the network fails: no answer arrives (status 0) */
  network?: boolean;
  /** an empty result: lists have no items, one record is not found */
  empty?: boolean;
};

/** How one operation answers under a scenario. */
export type MockOpRule = MockStep & {
  /** only the pinned records: all of them ("all"), or these ids */
  fixtures?: "all" | string[];
  /** answers in turn, for retries: the first call gets the first, the second the second…; the last one repeats */
  sequence?: MockStep[];
};

/** A named situation the app is seen in. */
export type MockScenario = {
  /** a short identifier: new-user, lots, network-error */
  id: string;
  name: string;
  description?: string;
  /** what every operation does, unless `ops` says otherwise for it */
  all?: MockOpRule;
  /** by operationId */
  ops?: Record<string, MockOpRule>;
  /** how long answers take, in ms, in place of the mocks' own */
  latency?: { min: number; max: number };
  /** how often a call fails with a 500, 0–1 */
  errorRate?: number;
  /** how many records the models have: "*" for every model, or by model name */
  counts?: Record<string, number>;
  /** whether the session starts signed in, in place of the auth setting */
  signedIn?: boolean;
  /** how the platform capabilities answer in this situation, by capability (lib/capabilities): a payment cancelled,
   *  the location denied; over the document's own `capabilities` */
  capabilities?: Record<string, MockCapabilityRule>;
};

/** A file of the mock library: a picture, a PDF, an Office file, a table, data, text, an archive, audio, video, a 3D
 *  model or any other bytes, as a data URL. Kept like the project's pictures: large ones are stored apart in the
 *  browser (`m3e-asset:`) and beside a project folder (`m3e-assets/`). */
export type MockFile = {
  id: string;
  name: string;
  /** its media type: image/png, application/pdf, text/csv, model/gltf-binary, audio/wav, video/mp4… */
  type: string;
  /** data:<type>;base64,… */
  data: string;
  /** words to pick it by: avatar, product, receipt… */
  tags?: string[];
};

/** One message a realtime script sends: when, after the script starts, which message of the channel, and what it
 *  carries (made from the message's payload schema when left out; an object is laid over the made one). */
export type MockRealtimeStep = { at: number; message: string; payload?: unknown };

export type MockRealtimeTrigger = { on: "connect" } | { on: "call"; operationId: string } | { on: "message"; message: string };

/** A timeline of messages the server sends over a channel, from when it is triggered: when the app connects (the
 *  default), when the app calls an operation, or when it sends a message itself (an auto-reply). */
export type MockRealtimeScript = {
  id: string;
  /** the channel's id (Doc.api.channels) */
  channel: string;
  trigger?: MockRealtimeTrigger;
  steps: MockRealtimeStep[];
  /** play the steps again every `every` ms, `times` times more (for as long as the connection is open when left out) */
  repeat?: { every: number; times?: number };
};

/** A mock world's timeline (lib/world/script.ts): the snapshots and events a world view with no engine shows and sends,
 *  with the words and the picture (a mock file: a picture or a 3D model) of its scene, held to a world's contract. */
export type MockWorldScript = WorldScript;

/** How signing in behaves. */
export type MockAuth = {
  /** a session starts signed in: secured calls work without a token (true by default); false answers them 401
   *  until the app signs in */
  signedIn?: boolean;
  /** the credentials signing in accepts (the login body's fields, compared as text); any when left out */
  accept?: Record<string, string>[];
  /** how long an access token lasts, in seconds (3600) */
  tokenTtl?: number;
  /** how long a refresh token lasts, in seconds (30 days) */
  refreshTtl?: number;
};

/** what an operation does to the mock data, when its method and path do not say it plainly */
export const MOCK_ROUTE_KINDS = ["auto", "list", "get", "create", "update", "replace", "delete", "singleton", "upload", "download", "login", "refresh", "logout", "action"] as const;
export type MockRouteKind = (typeof MOCK_ROUTE_KINDS)[number];

/** an operation's own way of being answered, in place of the one read from REST conventions */
export type MockRouteRule = { operationId: string; kind?: MockRouteKind; model?: string };

/** The mock library of a document. Every field may be left out. */
export type MockSpec = {
  /** what every made-up value is made from: the same seed, the same data (1) */
  seed?: number;
  /** the language of names, words, addresses and phone numbers (the editor's when left out) */
  locale?: MockLocale;
  /** the scenario the preview starts in; none: everything answers as it should */
  scenario?: string;
  /** how long answers take, in ms */
  latency?: { min: number; max: number };
  /** how often a call fails with a 500, 0–1 */
  errorRate?: number;
  models?: MockModelConfig[];
  scenarios?: MockScenario[];
  files?: MockFile[];
  realtime?: MockRealtimeScript[];
  /** the mock worlds' scripts, for world views with no engine behind them */
  worlds?: MockWorldScript[];
  /** the world script the preview starts with (one of `worlds`, or one the library has: battle, meadow); none: the
   *  world views play M3E's example engine in a prototype and show the design's state otherwise */
  world?: string;
  auth?: MockAuth;
  routes?: MockRouteRule[];
  /** how the platform capabilities answer, by capability, in every scenario that says nothing of its own */
  capabilities?: Record<string, MockCapabilityRule>;
};

/** the most records a model may have */
export const MAX_COUNT = 5000;

/** where the files of the mock library are downloaded from, under the API's root */
export const MOCK_FILES_PATH = "/__mocks/files";
