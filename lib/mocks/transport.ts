/* The API answered by the mock library: a `Transport` (lib/api/transport.ts) that needs no network and no DOM, so the
 * editor's preview, the exported apps in development, their tests and a mini-program can all call the contract and
 * get answers that look real. Within one session it remembers: what is made with POST is there on the next GET,
 * PATCH changes it, DELETE takes it away. Lists page the way their endpoint says (cursor, offset, page), filter by
 * their query parameters, search and sort. Requests are checked against the contract (400 problem+json, a pointer
 * per field), files can be uploaded and downloaded (a download is a real file of the type the operation says, or the
 * request's Accept picks among those it offers: a CSV or an XLSX of a list, a PDF of a record), secured endpoints
 * want a token the sign-in endpoint gave (and that expires, so refreshing can be tried), and a scenario can make
 * anything slow, empty or failing. Every call is logged. It never throws: whatever goes wrong is an answer (status 0
 * is a network failure).
 *
 * docs/模拟库.md describes what each endpoint does; lib/mocks/routes.ts reads that from the contract. */

import { isRecord } from "../api/schema";
import { authFields, type ApiSecurityScheme, type ApiSpec, type JsonSchema, type JsonSchemaObject } from "../api/types";
import type { Transport, TransportFile, TransportRequest, TransportResponse } from "../api/transport";
import { dataUrlSize, fromBase64, toBase64, utf8 } from "./bytes";
import { checkValue, isFileValue, paramValue, type FieldError } from "./check";
import { realClock, type MockClock } from "./clock";
import { clone, MockData, modelShape, type MockSource } from "./data";
import { inferHint, wordsOf } from "./hints";
import { bareType, contentDisposition, contentTypeOf, extensionOf, formatOf, kindOfType, typeOfName } from "./files";
import { mockFile } from "./formats";
import { titleOfRecord } from "./formats/content";
import { Realtime, type MockConnection, type MockMessage } from "./realtime";
import { base36Of, rngOf, uuidOf } from "./rng";
import { compileRoutes, matchRoute, type Route } from "./routes";
import { MOCK_FILES_PATH, type MockFile, type MockLocale, type MockOpRule, type MockScenario, type MockStep } from "./types";

/** a marker the exported web app's production build is checked not to hold (scripts/check-product.ts) */
export const MOCK_ENGINE = "m3e-mock-engine";

export type MockOptions = {
  /** the scenario to play (an id of MockSpec.scenarios); the document's own choice when left out, none for "" */
  scenario?: string;
  seed?: number;
  locale?: MockLocale;
  /** the moment data is made around, in ms; the clock's day by default */
  now?: number;
  clock?: MockClock;
  /** how long answers take: false for no wait at all, a number of ms, or a range; the document's own by default */
  latency?: false | number | { min: number; max: number };
  /** told of every call when it is answered */
  onLog?: (entry: MockLogEntry) => void;
  /** how a file is handed out in an answer: its data URL by default */
  fileUrl?: (file: MockFile) => string;
};

/** one call, as the request log shows it */
export type MockLogEntry = {
  id: number;
  /** when it was asked (ms) */
  at: number;
  method: string;
  path: string;
  operationId?: string;
  status: number;
  /** how long it took to answer, the latency included */
  ms: number;
  scenario?: string;
  /** what it was about, in a few words: "3 of 24", "validation", "no token" */
  note?: string;
};

export interface MockTransport extends Transport {
  /** the scenario playing, or undefined */
  readonly scenario: string | undefined;
  /** plays another scenario (or none) from a fresh session: the data, the tokens and the counters start over */
  setScenario(id: string | undefined): void;
  /** starts the session over in the same scenario */
  reset(): void;
  /** the calls so far, the latest last (the last 200) */
  readonly log: readonly MockLogEntry[];
  /** a model's records as this session has them now */
  records(model: string): Record<string, unknown>[];
  /** opens a realtime channel by its id, its address or a URL ending in it; the server's messages come to `onMessage`,
   *  each with its `frame` as it goes over the wire (lib/mocks/realtime.ts) */
  connect(address: string, onMessage: (message: MockMessage) => void): MockConnection;
  /** stops every timer and closes every connection */
  close(): void;
}

const LOG_MAX = 200;
const DEFAULT_LATENCY = { min: 150, max: 450 };

type Session = {
  scenario?: MockScenario;
  data: MockData;
  stores: Map<string, Record<string, unknown>[]>;
  singletons: Map<string, unknown>;
  calls: Map<string, number>;
  tokens: Map<string, { kind: "access" | "refresh"; exp: number; sub: string; pair?: string }>;
  signedIn: boolean;
  user?: Record<string, unknown>;
  uploads: Map<string, MockFile>;
  /** models that start empty, or with their pinned records only (some ids, or all) */
  empty: Set<string>;
  pinnedOnly: Map<string, "all" | string[]>;
  requests: number;
  created: number;
};

const WORDS: Record<MockLocale, Record<"notFound" | "noRoute" | "method" | "unauthorized" | "expired" | "invalidToken" | "credentials" | "invalid" | "network" | "server" | "refresh" | "mockError", string>> = {
  zh: { notFound: "没有找到这条记录", noRoute: "接口里没有这个地址", method: "这个地址不接受这种请求方法", unauthorized: "请先登录", expired: "登录已过期，请重新登录", invalidToken: "令牌无效", credentials: "账号或密码不对", invalid: "请求里有字段不对", network: "网络连接失败", server: "服务器出错了，请稍后再试", refresh: "刷新令牌无效或已过期", mockError: "模拟库出错" },
  en: { notFound: "There is no such record.", noRoute: "The API has no such address.", method: "This address does not take that method.", unauthorized: "Please sign in first.", expired: "Your session has expired. Please sign in again.", invalidToken: "The token is not valid.", credentials: "The email or the password is wrong.", invalid: "Some fields of the request are not right.", network: "The network failed.", server: "Something went wrong on the server. Please try again later.", refresh: "The refresh token is not valid or has expired.", mockError: "The mocks went wrong." },
  ja: { notFound: "該当するデータがありません。", noRoute: "API にこのアドレスはありません。", method: "このアドレスはこのメソッドを受け付けません。", unauthorized: "先にログインしてください。", expired: "ログインの有効期限が切れました。もう一度ログインしてください。", invalidToken: "トークンが無効です。", credentials: "メールアドレスまたはパスワードが違います。", invalid: "リクエストに正しくない項目があります。", network: "ネットワークに接続できませんでした。", server: "サーバーでエラーが起きました。しばらくしてからもう一度お試しください。", refresh: "リフレッシュトークンが無効か期限切れです。", mockError: "モックでエラーが起きました。" },
  ko: { notFound: "해당 데이터가 없습니다.", noRoute: "API에 이 주소가 없습니다.", method: "이 주소는 이 메서드를 받지 않습니다.", unauthorized: "먼저 로그인해 주세요.", expired: "로그인이 만료되었습니다. 다시 로그인해 주세요.", invalidToken: "토큰이 올바르지 않습니다.", credentials: "이메일 또는 비밀번호가 틀렸습니다.", invalid: "요청에 올바르지 않은 항목이 있습니다.", network: "네트워크에 연결하지 못했습니다.", server: "서버에서 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", refresh: "리프레시 토큰이 올바르지 않거나 만료되었습니다.", mockError: "목업에서 오류가 발생했습니다." },
};

const REASON: Record<number, string> = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 413: "Content Too Large", 415: "Unsupported Media Type", 422: "Unprocessable Content", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status, headers: body === undefined ? headers : { "content-type": "application/json", ...headers }, body });

const isJsonType = (type: string) => /^application\/(?:[\w.-]+\+)?json\b/i.test(type) || type === "*/*";

/** The media type a request's Accept header prefers among those an operation offers: each offered type takes the
 *  quality of the most specific range that matches it (RFC 9110 12.5.1), the first offered wins a tie. Undefined
 *  when the header accepts none of them. */
export function negotiate(accept: string | undefined, offered: readonly string[]): string | undefined {
  if (!offered.length) return undefined;
  if (!accept?.trim()) return offered[0];
  const ranges = accept.split(",").flatMap((part) => {
    const [range, ...params] = part.split(";").map((x) => x.trim().toLowerCase());
    const q = params.find((x) => x.startsWith("q="));
    const quality = q ? Number(q.slice(2)) : 1;
    return range && Number.isFinite(quality) ? [{ range, q: quality }] : [];
  });
  let best: string | undefined;
  let bestQ = 0;
  for (const type of offered) {
    const t = bareType(type);
    let q = -1;
    let spec = -1;
    for (const r of ranges) {
      const s = r.range === t ? 2 : r.range.endsWith("/*") && t.startsWith(r.range.slice(0, -1)) ? 1 : r.range === "*/*" ? 0 : -1;
      if (s > spec) {
        spec = s;
        q = r.q;
      }
    }
    if (q > bestQ) {
      best = type;
      bestQ = q;
    }
  }
  return best;
}

function problem(status: number, detail: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): TransportResponse {
  return { status, headers: { "content-type": "application/problem+json", ...headers }, body: { type: "about:blank", title: REASON[status] ?? (status >= 500 ? "Server Error" : "Error"), status, detail, ...extra } };
}

/** a header of a request, whatever its case */
const header = (req: TransportRequest, name: string) => Object.entries(req.headers ?? {}).find(([k]) => k.toLowerCase() === name)?.[1];

/** the query of a request: its own, and what its path carries after "?" */
function queryOf(req: TransportRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const q = req.path.indexOf("?");
  if (q >= 0)
    for (const part of req.path.slice(q + 1).split("&")) {
      if (!part) continue;
      const [k, v = ""] = part.split("=");
      try {
        const key = decodeURIComponent(k.replace(/\+/g, " "));
        const val = decodeURIComponent(v.replace(/\+/g, " "));
        out[key] = out[key] === undefined ? val : [...(Array.isArray(out[key]) ? (out[key] as unknown[]) : [out[key]]), val];
      } catch {
        /* a part that is not escaped right is left out */
      }
    }
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined).map(String) : String(v);
  }
  return out;
}

/** a JWT-shaped token (unsigned: the mocks keep the tokens they gave) */
function tokenOf(kind: string, sub: string, iat: number, exp: number, n: number): string {
  const b64url = (s: string) => toBase64(utf8(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify({ sub, iat: Math.floor(iat / 1000), exp: Math.floor(exp / 1000), jti: `${kind}-${n}`, iss: "m3e-mock" }))}.${b64url(`mock-${kind}-${n}`)}`;
}

/** an RFC 7396 merge patch: null takes a field away, an object merges, anything else replaces */
function mergePatch(target: unknown, patch: unknown, depth = 0): unknown {
  if (!isRecord(patch) || depth > 20) return patch;
  const out: Record<string, unknown> = isRecord(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = mergePatch(out[k], v, depth + 1);
  }
  return out;
}

const SEARCH = ["q", "query", "search", "keyword", "keywords", "term", "s"];
const SORT = ["sort", "sortBy", "sort_by", "orderBy", "order_by", "ordering"];
const ORDER = ["order", "direction", "dir", "sortOrder", "sort_order", "sortDirection"];

/** the value at a dotted path of a record */
const at = (rec: unknown, path: string): unknown => path.split(".").reduce<unknown>((v, k) => (isRecord(v) ? v[k] : undefined), rec);

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (isRecord(a) && typeof a.amount === "number" && isRecord(b) && typeof b.amount === "number") return a.amount - b.amount;
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : 1;
  if (b === undefined || b === null) return -1;
  return String(a).localeCompare(String(b));
}

/** all the text in a record, for a search */
function textOf(v: unknown, depth = 0): string {
  if (typeof v === "string") return v.startsWith("data:") ? "" : v;
  if (typeof v === "number") return String(v);
  if (depth > 3) return "";
  if (Array.isArray(v)) return v.map((x) => textOf(x, depth + 1)).join(" ");
  if (isRecord(v)) return Object.values(v).map((x) => textOf(x, depth + 1)).join(" ");
  return "";
}

/** an opaque cursor for an offset, and back */
const cursorOf = (offset: number) => toBase64(utf8(`o:${offset}`)).replace(/=+$/, "");
function offsetOfCursor(cursor: unknown): number {
  if (typeof cursor !== "string" || !cursor) return 0;
  if (/^\d+$/.test(cursor)) return Number(cursor);
  try {
    const text = String.fromCharCode(...fromBase64(cursor));
    const m = /^o:(\d+)$/.exec(text);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

const intOf = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};

/** Makes the mock transport of a document: its API (Doc.api), its mock settings (Doc.mocks) and its collections. */
export function createMockTransport(source: MockSource, options: MockOptions = {}): MockTransport {
  const api: ApiSpec = source.api ?? {};
  const spec = source.mocks ?? {};
  const clock = options.clock ?? realClock;
  const locale: MockLocale = options.locale ?? spec.locale ?? "en";
  const seed = options.seed ?? spec.seed ?? 1;
  const words = WORDS[locale] ?? WORDS.en;
  const routes = compileRoutes(api, spec);
  const fields = authFields(api.auth);
  const log: MockLogEntry[] = [];
  let logId = 0;
  let scenarioId = options.scenario === undefined ? spec.scenario : options.scenario || undefined;
  let session = start();
  const realtime = new Realtime({ api, spec, clock, data: () => session.data });

  function start(): Session {
    const scenario = spec.scenarios?.find((s) => s.id === scenarioId);
    const day = Math.floor(clock.now() / 86_400_000) * 86_400_000;
    const data = new MockData(source, { seed, locale, now: options.now ?? (options.clock ? clock.now() : day), counts: scenario?.counts, fileUrl: options.fileUrl });
    const empty = new Set<string>();
    const pinnedOnly = new Map<string, "all" | string[]>();
    for (const r of routes) {
      if (!r.model || !["list", "get"].includes(r.kind)) continue;
      const rule = ruleOf(scenario, r.operationId);
      if (rule.empty) empty.add(r.model);
      if (rule.fixtures) pinnedOnly.set(r.model, rule.fixtures);
    }
    return { scenario, data, stores: new Map(), singletons: new Map(), calls: new Map(), tokens: new Map(), signedIn: scenario?.signedIn ?? spec.auth?.signedIn ?? true, uploads: new Map(), empty, pinnedOnly, requests: 0, created: 0 };
  }

  function ruleOf(scenario: MockScenario | undefined, operationId: string): MockOpRule {
    return { ...scenario?.all, ...scenario?.ops?.[operationId] };
  }

  function store(model: string): Record<string, unknown>[] {
    let list = session.stores.get(model);
    if (!list) {
      if (session.empty.has(model)) list = [];
      else if (session.pinnedOnly.has(model)) {
        const which = session.pinnedOnly.get(model)!;
        const idField = routes.find((r) => r.model === model)?.idField;
        const pinned = session.data.pinned(model);
        list = which === "all" ? pinned : pinned.filter((r) => idField && which.includes(String(r[idField])));
      } else list = clone(session.data.records(model));
      session.stores.set(model, list);
    }
    return list;
  }

  const fileUrl = (f: MockFile) => (options.fileUrl ? options.fileUrl(f) : f.data);

  /** a file a request carried, kept for this session; its address in answers */
  function keepFile(v: { name?: string; type?: string; dataUrl: string }, kept?: { url: string; name: string }[]): string {
    const id = `upload-${++session.created}`;
    const type = v.type || /^data:([^;,]+)/.exec(v.dataUrl)?.[1] || "application/octet-stream";
    const f: MockFile = { id, name: v.name || `${id}.${extensionOf(type)}`, type, data: v.dataUrl };
    session.uploads.set(id, f);
    const url = fileUrl(f);
    kept?.push({ url, name: f.name });
    return url;
  }

  /** a request's body with every file in it kept and turned into its address */
  function withFiles(v: unknown, kept: { url: string; name: string }[], depth = 0): unknown {
    if (isFileValue(v)) return keepFile(v, kept);
    if (depth > 10) return v;
    if (Array.isArray(v)) return v.map((x) => withFiles(x, kept, depth + 1));
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withFiles(x, kept, depth + 1)]));
    return v;
  }

  /* ---------- auth ---------- */

  function issue(sub: string): Record<string, string | number> {
    const now = clock.now();
    const ttl = (spec.auth?.tokenTtl ?? 3600) * 1000;
    const rttl = (spec.auth?.refreshTtl ?? 30 * 86400) * 1000;
    const n = session.tokens.size + 1;
    const access = tokenOf("access", sub, now, now + ttl, n);
    const refresh = tokenOf("refresh", sub, now, now + rttl, n);
    session.tokens.set(access, { kind: "access", exp: now + ttl, sub, pair: refresh });
    session.tokens.set(refresh, { kind: "refresh", exp: now + rttl, sub, pair: access });
    return { [fields.token]: access, [fields.refreshToken]: refresh, expiresIn: Math.round(ttl / 1000) };
  }

  /** whether the request may call a secured route: null when it may, else the 401 to answer */
  function denied(route: Route, req: TransportRequest, query: Record<string, unknown>): TransportResponse | null {
    const reqs = route.endpoint.security ?? api.auth?.security ?? [];
    if (!reqs.length || reqs.some((r) => !Object.keys(r).length)) return null;
    const schemes = api.auth?.schemes ?? {};
    const auth = header(req, "authorization");
    const bearer = auth && /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : undefined;
    const challenge = { "www-authenticate": 'Bearer realm="api"' };
    if (bearer) {
      const t = session.tokens.get(bearer);
      if (!t || t.kind !== "access") return problem(401, words.invalidToken, {}, { "www-authenticate": 'Bearer error="invalid_token"' });
      if (t.exp <= clock.now()) return problem(401, words.expired, { code: "token_expired" }, { "www-authenticate": 'Bearer error="invalid_token", error_description="The access token expired"' });
      return null;
    }
    const keyGiven = (s: ApiSecurityScheme) => {
      if (s.type === "apiKey") {
        const name = (s.name ?? "").toLowerCase();
        if (s.in === "query") return typeof query[s.name ?? ""] === "string" && query[s.name ?? ""] !== "";
        if (s.in === "cookie") return (header(req, "cookie") ?? "").split(/;\s*/).some((c) => c.toLowerCase().startsWith(`${name}=`));
        return !!header(req, name);
      }
      if (s.type === "http" && /^basic$/i.test(s.scheme ?? "")) return !!auth && /^basic\s+/i.test(auth);
      return false;
    };
    const ok = reqs.some((r) => Object.keys(r).every((name) => !schemes[name] || keyGiven(schemes[name])));
    if (ok || session.signedIn) return null;
    return problem(401, words.unauthorized, {}, challenge);
  }

  /** the model the signed-in user is a record of: what GET /me answers, else a model named like a person */
  function userModel(): string | undefined {
    const me = routes.find((r) => r.kind === "singleton" && r.method === "GET" && !r.params.length && r.model);
    if (me?.model) return me.model;
    return api.models?.find((m) => /^(user|member|account|profile|customer|person)$/i.test(m.name))?.name;
  }

  /* ---------- answers ---------- */

  /** the answer for a route's records: the record itself, or the response's object with the record in its place */
  function shaped(route: Route, record: unknown, key: string): unknown {
    const schema = route.success?.schema;
    if (!isRecord(schema) || !route.model) return record;
    const s = schema as JsonSchemaObject;
    const direct = (x: JsonSchemaObject) => x.$ref === `#/components/schemas/${route.model}` || (Array.isArray(x.anyOf) && x.anyOf.some((y) => isRecord(y) && (y as JsonSchemaObject).$ref === `#/components/schemas/${route.model}`)) || (Array.isArray(x.allOf) && x.allOf.some((y) => isRecord(y) && (y as JsonSchemaObject).$ref === `#/components/schemas/${route.model}`));
    if (direct(s)) return record;
    const props = isRecord(s.properties) ? (s.properties as Record<string, JsonSchema>) : {};
    const holder = Object.entries(props).find(([, p]) => isRecord(p) && direct(p as JsonSchemaObject));
    if (!holder) return record;
    const wrapper = session.data.value(schema, `${route.operationId}:${key}`);
    return isRecord(wrapper) ? { ...wrapper, [holder[0]]: record } : record;
  }

  function findIndex(route: Route, params: Record<string, string>): number {
    const list = store(route.model!);
    const id = route.idParam ? params[route.idParam] : undefined;
    if (id === undefined) return -1;
    const field = route.idField;
    if (field) return list.findIndex((r) => String(r[field]) === id);
    return /^\d+$/.test(id) ? Number(id) - 1 : -1;
  }

  /** the path parameters besides the record's own that name fields of it: /users/{userId}/posts keeps userId */
  function parentFilter(route: Route, params: Record<string, string>): [string, string][] {
    const shape = route.model ? modelShape(api, route.model) : undefined;
    const props = isRecord(shape?.properties) ? Object.keys(shape!.properties as object) : [];
    return route.params.filter((p) => p !== route.idParam && props.includes(p)).map((p) => [p, params[p]]);
  }

  /** server fields of a new or changed record: its id, when it was made and changed */
  function stamp(route: Route, rec: Record<string, unknown>, isNew: boolean) {
    const shape = route.model ? modelShape(api, route.model) : undefined;
    const props = isRecord(shape?.properties) ? (shape!.properties as Record<string, JsonSchemaObject>) : {};
    const now = new Date(clock.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
    for (const [name, p] of Object.entries(props)) {
      if (!isRecord(p)) continue;
      const kind = inferHint(name, p, route.model).kind;
      if (kind !== "dateTime" && kind !== "date") continue;
      const isCreated = /^(created|inserted|added|placed|registered|joined)/i.test(name);
      const isUpdated = /^(updated|modified|changed|edited)/i.test(name);
      const value = p.type === "integer" || p.type === "number" ? Math.floor(clock.now() / 1000) : p.format === "date" ? now.slice(0, 10) : now;
      if ((isNew && (isCreated || isUpdated)) || (!isNew && isUpdated)) rec[name] = value;
    }
  }

  function newId(route: Route, list: Record<string, unknown>[]): string | number {
    const shape = route.model ? modelShape(api, route.model) : undefined;
    const p = route.idField && isRecord(shape?.properties) ? ((shape!.properties as Record<string, JsonSchemaObject>)[route.idField] ?? {}) : {};
    const rng = rngOf(`${seed}:new:${route.model}:${session.created}`);
    if (p.type === "integer" || p.type === "number") return Math.max(0, ...list.map((r) => (typeof r[route.idField!] === "number" ? (r[route.idField!] as number) : 0))) + 1;
    if (p.format === "uuid") return uuidOf(rng);
    return `${(route.model ?? "id").slice(0, 3).toLowerCase()}_${base36Of(rng, 10)}`;
  }

  /** the fields of a body the model has (all of them when it takes any) */
  function ownFields(route: Route, body: unknown): Record<string, unknown> {
    if (!isRecord(body)) return {};
    const shape = route.model ? modelShape(api, route.model) : undefined;
    if (!isRecord(shape?.properties) || shape!.additionalProperties !== false) return { ...body };
    const props = shape!.properties as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).filter(([k]) => k in props));
  }

  /** A new record from what was posted: the fields given, and what the server fills in itself (what a request may not
   *  set, and required fields left out); an optional field not given is not there, as a real server would store it. */
  function created(route: Route, body: unknown): Record<string, unknown> {
    const shape = modelShape(api, route.model!);
    const props = isRecord(shape?.properties) ? (shape!.properties as Record<string, JsonSchemaObject>) : {};
    const required = new Set(Array.isArray(shape?.required) ? shape!.required : []);
    const base = session.data.value(api.models?.find((m) => m.name === route.model)?.schema, `${route.model}:new:${session.created}`, { model: route.model });
    const given = ownFields(route, body);
    const rec: Record<string, unknown> = {};
    for (const k of Object.keys(props)) {
      if (given[k] !== undefined) rec[k] = given[k];
      else if (isRecord(base) && base[k] !== undefined && (required.has(k) || props[k]?.readOnly)) rec[k] = base[k];
      else if (props[k]?.default !== undefined) rec[k] = clone(props[k].default);
    }
    for (const [k, v] of Object.entries(given)) if (!(k in rec)) rec[k] = v;
    return rec;
  }

  function list(route: Route, params: Record<string, string>, query: Record<string, unknown>, step: MockStep): { body: unknown; note: string } {
    let rows = step.empty ? [] : store(route.model!);
    for (const [field, value] of parentFilter(route, params)) rows = rows.filter((r) => String(r[field]) === value);
    const p = route.pagination;
    const reserved = new Set([...SEARCH, ...SORT, ...ORDER, "page", "limit", "offset", "cursor", "fields", "include", "expand"]);
    if (p) for (const k of Object.values(p)) if (typeof k === "string") reserved.add(k);
    const shape = modelShape(api, route.model!);
    const props = isRecord(shape?.properties) ? (shape!.properties as Record<string, JsonSchemaObject>) : {};
    /* filters: a parameter named like a field; min and max of a number */
    for (const [k, raw] of Object.entries(query)) {
      if (reserved.has(k) || raw === "" || raw === undefined) continue;
      const values = (Array.isArray(raw) ? raw : String(raw).split(",")).map(String);
      const range = /^(min|max)([A-Z].*)$/.exec(k) ?? /^(.*?)[_.]?(Min|Max|_min|_max|From|To)$/.exec(k);
      if (k in props) {
        rows = rows.filter((r) => {
          const v = r[k];
          if (Array.isArray(v)) return v.some((x) => values.includes(String(x)));
          if (isRecord(v)) return values.includes(String(v.id ?? v.code ?? v.name ?? ""));
          return values.includes(String(v));
        });
      } else if (range) {
        const [field, side] = /^(min|max)/.test(range[1]) ? [range[2].charAt(0).toLowerCase() + range[2].slice(1), range[1]] : [range[1], range[2].toLowerCase().replace(/^_/, "")];
        if (!(field in props)) continue;
        const n = Number(values[0]);
        if (!Number.isFinite(n)) continue;
        rows = rows.filter((r) => {
          const v = r[field];
          const x = typeof v === "number" ? v : isRecord(v) && typeof v.amount === "number" ? v.amount : NaN;
          return Number.isNaN(x) ? true : side === "min" || side === "from" ? x >= n : x <= n;
        });
      }
    }
    const search = SEARCH.map((k) => query[k]).find((v) => typeof v === "string" && v.trim());
    if (typeof search === "string") {
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((r) => {
        const text = textOf(r).toLowerCase();
        return words.every((w) => text.includes(w));
      });
    }
    const sortKey = SORT.map((k) => query[k]).find((v) => typeof v === "string" && v);
    if (typeof sortKey === "string") {
      let field = sortKey.trim();
      let desc = field.startsWith("-");
      field = field.replace(/^[-+]/, "");
      const m = /^(.*?)[:,\s](asc|desc)$/i.exec(field);
      if (m) {
        field = m[1];
        desc = m[2].toLowerCase() === "desc";
      }
      const order = ORDER.map((k) => query[k]).find((v) => typeof v === "string");
      if (typeof order === "string") desc = /^desc/i.test(order);
      rows = [...rows].sort((a, b) => compare(at(a, field), at(b, field)) * (desc ? -1 : 1));
    }
    const total = rows.length;
    const limitParam = p && "limitParam" in p ? p.limitParam : "limit";
    const limitSchema = route.parameters.find((x) => x.name === limitParam)?.schema as JsonSchemaObject | undefined;
    const maxLimit = typeof limitSchema?.maximum === "number" ? limitSchema.maximum : 100;
    const limit = Math.max(1, Math.min(maxLimit, intOf(query[limitParam], typeof limitSchema?.default === "number" ? limitSchema.default : 20)));
    let pageRows = rows;
    const extra: Record<string, unknown> = {};
    let note = `${total}`;
    if (p?.style === "cursor") {
      const from = Math.min(offsetOfCursor(query[p.cursorParam]), total);
      pageRows = rows.slice(from, from + limit);
      extra[p.nextField] = from + limit < total ? cursorOf(from + limit) : null;
      note = total ? `${from + 1}–${from + pageRows.length} / ${total}` : "0";
    } else if (p?.style === "offset") {
      const from = Math.max(0, intOf(query[p.offsetParam], 0));
      pageRows = rows.slice(from, from + limit);
      extra[p.totalField] = total;
      note = total ? `${from + 1}–${from + pageRows.length} / ${total}` : "0";
    } else if (p?.style === "page") {
      const page = Math.max(1, intOf(query[p.pageParam], 1));
      pageRows = rows.slice((page - 1) * limit, page * limit);
      if (p.totalField) extra[p.totalField] = total;
      note = `p${page} ${pageRows.length} / ${total}`;
    }
    const schema = route.success?.schema;
    const target = isRecord(schema) && typeof (schema as JsonSchemaObject).$ref === "string" ? modelShape(api, ((schema as JsonSchemaObject).$ref as string).split("/").pop()!) : (schema as JsonSchemaObject | undefined);
    if (!isRecord(target) || target.type === "array") return { body: pageRows, note };
    const wrapper = session.data.value(schema, `${route.operationId}:list`);
    const out: Record<string, unknown> = isRecord(wrapper) ? { ...wrapper } : {};
    const items = p?.items ?? Object.keys(target.properties ?? {}).find((k) => Array.isArray(out[k])) ?? "items";
    out[items] = pageRows;
    Object.assign(out, extra);
    const tprops = isRecord(target.properties) ? (target.properties as Record<string, JsonSchemaObject>) : {};
    for (const k of Object.keys(tprops)) {
      if (k in extra || k === items) continue;
      if (/^(total|count|totalCount|total_count|totalItems|total_items)$/.test(k)) out[k] = total;
      else if (/^(hasMore|has_more|hasNext|has_next)$/.test(k)) out[k] = pageRows.length < total && rows.indexOf(pageRows[pageRows.length - 1]) < total - 1;
      else if (/^(next|nextCursor|next_cursor|nextPageToken|next_page_token)$/.test(k) && p?.style !== "cursor") out[k] = null;
    }
    return { body: out, note };
  }

  async function answer(req: TransportRequest): Promise<{ response: TransportResponse; route?: Route; latency: number; note?: string }> {
    const method = req.method.toUpperCase();
    const path = req.path.split("?")[0] || "/";
    const query = queryOf(req);
    session.requests++;
    const scenario = session.scenario;

    /* the library's own files, and those uploaded in this session */
    if (path.startsWith(`${MOCK_FILES_PATH}/`) && (method === "GET" || method === "HEAD")) {
      const id = decodeURIComponent(path.slice(MOCK_FILES_PATH.length + 1));
      const f = session.uploads.get(id) ?? spec.files?.find((x) => x.id === id);
      if (!f) return { response: problem(404, words.notFound), latency: 0 };
      const file: TransportFile = { name: f.name, type: f.type, dataUrl: f.data, size: dataUrlSize(f.data) };
      return { response: { status: 200, headers: { "content-type": contentTypeOf(f.type), "content-disposition": contentDisposition(f.name, true) }, body: method === "HEAD" ? undefined : file }, latency: 0 };
    }

    const match = matchRoute(routes, method, path, req.operationId);
    const latencyFor = (step: MockStep) => {
      if (options.latency === false) return 0;
      if (typeof step.latencyMs === "number") return Math.max(0, step.latencyMs);
      const range = scenario?.latency ?? (typeof options.latency === "number" ? { min: options.latency, max: options.latency } : options.latency) ?? spec.latency ?? DEFAULT_LATENCY;
      const rng = rngOf(`${seed}:latency:${session.requests}`);
      return Math.round(rng.float(Math.max(0, range.min), Math.max(range.min, range.max)));
    };
    if (!match.route) {
      if (match.allowed.length) return { response: problem(405, words.method, {}, { allow: match.allowed.join(", ") }), latency: latencyFor({}) };
      return { response: problem(404, words.noRoute, { path }), latency: latencyFor({}), note: "no route" };
    }
    const route = match.route;
    const params = match.params;
    const rule = ruleOf(scenario, route.operationId);
    const n = session.calls.get(route.operationId) ?? 0;
    session.calls.set(route.operationId, n + 1);
    const seqStep = rule.sequence?.length ? rule.sequence[Math.min(n, rule.sequence.length - 1)] : undefined;
    const step: MockStep = seqStep ? { ...seqStep } : { status: rule.status, body: rule.body, latencyMs: rule.latencyMs, network: rule.network };
    const latency = latencyFor(step);
    const done = (response: TransportResponse, note?: string) => ({ response, route, latency, note });

    if (step.network) return done({ status: 0, headers: {}, body: undefined }, words.network);
    const rate = scenario?.errorRate ?? spec.errorRate ?? 0;
    if (rate > 0 && rngOf(`${seed}:error:${session.requests}`).chance(rate)) return done(problem(500, words.server), "random error");
    if (typeof step.status === "number" && (step.status < 200 || step.status > 299)) {
      const status = Math.max(100, Math.min(599, Math.floor(step.status)));
      if (step.body !== undefined) return done({ status, headers: { "content-type": isRecord(step.body) && "title" in step.body ? "application/problem+json" : "application/json" }, body: clone(step.body) }, "scenario");
      return done(problem(status, status === 401 ? words.unauthorized : status === 404 ? words.notFound : status >= 500 ? words.server : words.invalid), "scenario");
    }

    const no = denied(route, req, query);
    if (no) return done(no, "no token");

    /* the request, checked against the contract */
    const errors: FieldError[] = [];
    for (const p of route.parameters) {
      const raw = p.in === "path" ? params[p.name] : p.in === "query" ? query[p.name] : p.in === "header" ? header(req, p.name.toLowerCase()) : undefined;
      if (raw === undefined || raw === "") {
        if (p.required && p.in !== "path") errors.push({ pointer: `#/${p.in}/${p.name}`, detail: checkValue(api, { type: "object", required: ["x"] }, {}, { locale })[0]?.detail ?? "required" });
        continue;
      }
      const found = checkValue(api, p.schema, paramValue(raw, p.schema), { locale, direction: "request" }, `#/${p.in}/${p.name}`);
      /* a record's id that is not a UUID is just not found */
      if (p.in === "path" && found.length && p.name === route.idParam && ["get", "update", "replace", "delete"].includes(route.kind)) return done(problem(404, words.notFound), "not found");
      errors.push(...found);
    }
    const bodySchema = route.body?.schema;
    const required = isRecord(route.endpoint.requestBody) && (route.endpoint.requestBody as { required?: boolean }).required;
    if (route.body && req.body === undefined && required) errors.push({ pointer: "#", detail: checkValue(api, { type: "object", required: ["x"] }, {}, { locale })[0]?.detail ?? "required" });
    else if (route.body && req.body !== undefined && bodySchema !== undefined && !/octet-stream|^(image|audio|video)\//.test(route.body.type)) errors.push(...checkValue(api, bodySchema, req.body, { locale, direction: "request", partial: route.method === "PATCH" }));
    if (errors.length) {
      const declared = Object.keys(route.endpoint.responses);
      const status = declared.includes("422") && !declared.includes("400") ? 422 : 400;
      return done(problem(status, words.invalid, { errors }), "validation");
    }

    realtime.called(route.operationId);
    const kept: { url: string; name: string }[] = [];
    const body = withFiles(req.body, kept);
    const status = typeof step.status === "number" ? step.status : route.status;
    /* a GET whose answer also comes in another type (a list as CSV or XLSX) answers in the one the request prefers */
    const offered = route.types.filter((t) => t !== "*/*");
    const wanted = route.method === "GET" ? negotiate(header(req, "accept"), offered) : undefined;
    const asFile = wanted && !isJsonType(wanted) && route.success && isJsonType(route.success.type) ? wanted : undefined;
    const answerOf = (v: unknown): TransportResponse => {
      if (asFile) return fileAnswer(route, path, status, asFile, v);
      /* text the operation answers with (text/plain) goes as text, under its own type */
      if (route.success && !isJsonType(route.success.type)) return { status, headers: { "content-type": contentTypeOf(route.success.type) }, body: typeof v === "string" ? v : JSON.stringify(v) };
      return json(status, v);
    };
    const withBody = (v: unknown, note?: string) => done(step.body !== undefined ? json(status, clone(step.body)) : route.success ? answerOf(v) : { status: status === 200 && route.method === "DELETE" ? 204 : status, headers: {}, body: undefined }, note);

    switch (route.kind) {
      case "list": {
        const out = list(route, params, query, step);
        return withBody(out.body, out.note);
      }
      case "get": {
        if (step.empty) return done(problem(404, words.notFound), "empty");
        const i = findIndex(route, params);
        if (i < 0) return done(problem(404, words.notFound), "not found");
        return withBody(shaped(route, clone(store(route.model!)[i]), "get"));
      }
      case "create": {
        const list = store(route.model!);
        session.created++;
        const rec = created(route, body);
        for (const [field, value] of parentFilter(route, params)) rec[field] = value;
        if (route.idField) rec[route.idField] = newId(route, list);
        stamp(route, rec, true);
        list.unshift(rec);
        const location = route.idField ? `${route.collection.replace(/\{([^{}]+)\}/g, (_, p: string) => encodeURIComponent(params[p] ?? ""))}/${encodeURIComponent(String(rec[route.idField]))}` : undefined;
        const r = withBody(shaped(route, clone(rec), "create"), "created");
        if (location && r.response.status >= 200 && r.response.status < 300) r.response = { ...r.response, headers: { ...r.response.headers, location } };
        return r;
      }
      case "update":
      case "replace": {
        const list = store(route.model!);
        const i = findIndex(route, params);
        if (i < 0) return done(problem(404, words.notFound), "not found");
        const old = list[i];
        let next: Record<string, unknown>;
        if (route.kind === "update") next = mergePatch(old, ownFields(route, body)) as Record<string, unknown>;
        else {
          next = { ...ownFields(route, body) };
          /* what the server owns stays: the id, when it was made, what a request may not set */
          const shape = modelShape(api, route.model!);
          for (const [k, p] of Object.entries((shape?.properties ?? {}) as Record<string, JsonSchemaObject>)) if (next[k] === undefined && old[k] !== undefined && (k === route.idField || p?.readOnly || /^(created|inserted)/i.test(k))) next[k] = old[k];
        }
        if (route.idField) next[route.idField] = old[route.idField];
        stamp(route, next, false);
        list[i] = next;
        return withBody(shaped(route, clone(next), "update"), "updated");
      }
      case "delete": {
        const list = store(route.model!);
        const i = findIndex(route, params);
        if (i < 0) return done(problem(404, words.notFound), "not found");
        const [gone] = list.splice(i, 1);
        return withBody(shaped(route, clone(gone), "delete"), "deleted");
      }
      case "singleton": {
        const key = path;
        const um = userModel();
        const isUser = !!um && route.model === um && !route.params.length;
        let value = isUser && session.user ? session.user : session.singletons.get(key);
        if (value === undefined) {
          value = route.model && isUser ? clone(session.data.records(um!)[0]) : undefined;
          if (value === undefined) value = session.data.value(route.success?.schema, `${route.operationId}:${key}`);
          session.singletons.set(key, value);
        }
        if (route.method === "PATCH" || route.method === "PUT") {
          value = route.method === "PATCH" ? mergePatch(value, body) : { ...(isRecord(value) ? value : {}), ...(isRecord(body) ? body : {}) };
          session.singletons.set(key, value);
          if (isUser) session.user = value as Record<string, unknown>;
          /* the GET of the same path sees it */
        }
        return withBody(clone(value));
      }
      case "upload": {
        if (typeof req.body === "string" || req.body instanceof Uint8Array) {
          const type = route.body?.type ?? "application/octet-stream";
          const bytes = typeof req.body === "string" ? utf8(req.body) : req.body;
          keepFile({ type, dataUrl: `data:${type};base64,${toBase64(bytes)}` }, kept);
        }
        const urls = kept.map((k) => k.url);
        const fileNames = kept.map((k) => k.name);
        /* the record the upload belongs to (/products/{id}/images) gets the file */
        const parent = routes.find((r) => r.kind === "get" && r.model && route.path.startsWith(`${r.path}/`));
        if (parent && urls.length) {
          const list = store(parent.model!);
          const id = parent.idParam ? params[parent.idParam] ?? params[route.params[route.params.length - 1]] : undefined;
          const i = parent.idField && id !== undefined ? list.findIndex((r) => String(r[parent.idField!]) === id) : -1;
          if (i >= 0) {
            const tail = route.path.split("/").pop() ?? "";
            const shape = modelShape(api, parent.model!);
            const props = (shape?.properties ?? {}) as Record<string, JsonSchemaObject>;
            const field = props[tail] ? tail : Object.keys(props).find((k) => ["image", "file", "audio", "video", "avatar"].includes(inferHint(k, props[k], parent.model).kind));
            if (field) {
              const p = props[field];
              list[i] = { ...list[i], [field]: p?.type === "array" ? [...(Array.isArray(list[i][field]) ? (list[i][field] as unknown[]) : []), ...urls] : urls[0] };
            }
          }
        }
        let out = route.success ? session.data.value(route.success.schema, `${route.operationId}:${session.created}`) : undefined;
        if (isRecord(out)) {
          const shape = route.success?.schema && isRecord(route.success.schema) && typeof (route.success.schema as JsonSchemaObject).$ref === "string" ? modelShape(api, ((route.success.schema as JsonSchemaObject).$ref as string).split("/").pop()!) : (route.success?.schema as JsonSchemaObject | undefined);
          const props = (shape?.properties ?? {}) as Record<string, JsonSchemaObject>;
          out = { ...out };
          for (const [k, p] of Object.entries(props)) {
            if (!isRecord(p)) continue;
            const kind = inferHint(k, p, undefined).kind;
            if (p.type === "array" && urls.length && ["image", "file", "url", "audio", "video"].includes(inferHint(k, (p.items as JsonSchema) ?? {}, undefined).kind)) (out as Record<string, unknown>)[k] = urls;
            else if (["url", "image", "file", "audio", "video", "avatar"].includes(kind) && urls.length) (out as Record<string, unknown>)[k] = urls[0];
            else if (/^(name|filename|fileName|file_name)$/.test(k) && fileNames[0]) (out as Record<string, unknown>)[k] = fileNames[0];
          }
        }
        return withBody(out, `${urls.length} file${urls.length === 1 ? "" : "s"}`);
      }
      case "download": {
        /* the record the file is of (/invoices/{id}/pdf, /files/{id}), or the list it is an export of (/orders/export) */
        const owner = routes.find((r) => r.kind === "get" && r.model && route.path.startsWith(`${r.path}/`)) ?? (route.idParam ? routes.find((r) => r.kind === "list" && r.model && r.path === route.collection) : undefined);
        let record: Record<string, unknown> | undefined;
        if (owner?.model && owner.idField) {
          const id = owner.kind === "get" && owner.idParam ? params[owner.idParam] : route.idParam ? params[route.idParam] : undefined;
          record = id === undefined ? undefined : store(owner.model).find((r) => String(r[owner.idField!]) === id);
          if (id !== undefined && !record) return done(problem(404, words.notFound), "not found");
        }
        const lister = record ? undefined : routes.filter((r) => r.kind === "list" && r.model && route.path.startsWith(`${r.path}/`)).sort((a, b) => b.path.length - a.path.length)[0];
        const rows = lister ? store(lister.model!).slice(0, 1000) : undefined;
        const f = fileOf(route, req, path, params, record, rows, lister?.model ?? owner?.model);
        const file: TransportFile = { name: f.name, type: f.type, dataUrl: f.data, size: dataUrlSize(f.data) };
        return done({ status: 200, headers: { "content-type": contentTypeOf(f.type), "content-disposition": contentDisposition(f.name) }, body: method === "HEAD" ? undefined : file }, f.name);
      }
      case "login": {
        const accept = spec.auth?.accept;
        const given = isRecord(req.body) ? (req.body as Record<string, unknown>) : {};
        if (accept?.length && !accept.some((c) => Object.entries(c).every(([k, v]) => String(given[k] ?? "") === v))) return done(problem(401, words.credentials), "wrong credentials");
        const um = userModel();
        const user = um ? clone(session.data.records(um)[0]) : undefined;
        if (user) {
          for (const k of ["email", "username", "phone", "mobile", "name"]) if (typeof given[k] === "string" && k in user) user[k] = given[k];
          session.user = user;
        }
        const sub = String(user?.id ?? given.email ?? given.username ?? "user");
        const tokens = issue(sub);
        session.signedIn = true;
        let out = route.success ? session.data.value(route.success.schema, `${route.operationId}:${session.tokens.size}`) : {};
        if (!isRecord(out)) out = {};
        out = { ...(out as Record<string, unknown>), ...tokens };
        const shape = isRecord(route.success?.schema) && typeof (route.success!.schema as JsonSchemaObject).$ref === "string" ? modelShape(api, ((route.success!.schema as JsonSchemaObject).$ref as string).split("/").pop()!) : (route.success?.schema as JsonSchemaObject | undefined);
        const props = (shape?.properties ?? {}) as Record<string, unknown>;
        if (!("expiresIn" in props)) delete (out as Record<string, unknown>).expiresIn;
        if ("tokenType" in props) (out as Record<string, unknown>).tokenType = "Bearer";
        if ("token_type" in props) (out as Record<string, unknown>).token_type = "Bearer";
        if ("user" in props && user) (out as Record<string, unknown>).user = user;
        return withBody(out, "signed in");
      }
      case "refresh": {
        const given = isRecord(req.body) ? (req.body as Record<string, unknown>) : {};
        const candidate = [given[fields.refreshToken], given.refreshToken, given.refresh_token, ...Object.values(given)].find((v) => typeof v === "string" && session.tokens.has(v)) as string | undefined;
        const t = candidate ? session.tokens.get(candidate) : undefined;
        if (!t || t.kind !== "refresh" || t.exp <= clock.now()) return done(problem(401, words.refresh), "refresh refused");
        /* the old pair is spent */
        session.tokens.delete(candidate!);
        if (t.pair) session.tokens.delete(t.pair);
        const tokens = issue(t.sub);
        let out = route.success ? session.data.value(route.success.schema, `${route.operationId}:${session.tokens.size}`) : {};
        if (!isRecord(out)) out = {};
        out = { ...(out as Record<string, unknown>), ...tokens };
        const shape = isRecord(route.success?.schema) && typeof (route.success!.schema as JsonSchemaObject).$ref === "string" ? modelShape(api, ((route.success!.schema as JsonSchemaObject).$ref as string).split("/").pop()!) : (route.success?.schema as JsonSchemaObject | undefined);
        if (!("expiresIn" in ((shape?.properties ?? {}) as Record<string, unknown>))) delete (out as Record<string, unknown>).expiresIn;
        return withBody(out, "refreshed");
      }
      case "logout": {
        const auth = header(req, "authorization");
        const bearer = auth?.replace(/^bearer\s+/i, "").trim();
        const t = bearer ? session.tokens.get(bearer) : undefined;
        if (bearer && t) {
          session.tokens.delete(bearer);
          if (t.pair) session.tokens.delete(t.pair);
        }
        session.signedIn = false;
        session.user = undefined;
        return withBody(route.success ? session.data.value(route.success.schema, `${route.operationId}:out`) : undefined, "signed out");
      }
      default: {
        /* an action: made-up data of its answer's shape, a new one each time it is posted to */
        let out: unknown = route.success ? session.data.value(route.success.schema, `${route.operationId}:${route.method === "GET" ? path : n}`) : undefined;
        if (step.empty) out = emptied(out);
        return withBody(out);
      }
    }
  }

  /** The file a download answers with: of the type the request accepts among those the operation offers; for one
   *  that says only "bytes", the type the record's file name or media type names, else the operation's words
   *  (exportCsv); the library's file of that type when it has one, else one made from the record or the rows, as
   *  small as the response's schema allows. */
  function fileOf(route: Route, req: TransportRequest, path: string, params: Record<string, string>, record: Record<string, unknown> | undefined, rows: Record<string, unknown>[] | undefined, model: string | undefined): MockFile {
    const offered = route.types.filter((t) => t !== "*/*");
    let type = negotiate(header(req, "accept"), offered) ?? offered[0];
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const fileName = record ? [record.fileName, record.filename, record.file_name, record.name].map(text).find((v) => typeOfName(v)) : undefined;
    if (!type || type === "application/octet-stream" || !formatOf(type)) {
      const named = (fileName ? typeOfName(fileName) : undefined) ?? (record ? [record.mimeType, record.contentType, record.mediaType, record.mime].map(text).find((v) => formatOf(v)) : undefined) ?? wordsOf(`${route.operationId} ${route.path.replace(/[{}]/g, "")}`).map((w) => formatOf(w)).find((f) => f && f.family !== "file")?.type;
      if (named && (!type || type === "application/octet-stream" || kindOfType(named) === kindOfType(type))) type = named;
    }
    type ??= "application/octet-stream";
    const fromLibrary = spec.files?.find((f) => bareType(f.type) === bareType(type!)) ?? (kindOfType(type) !== "file" ? spec.files?.find((f) => kindOfType(f.type) === kindOfType(type!)) : undefined);
    if (fromLibrary) return fromLibrary;
    const schema = route.success?.schema;
    const maxBytes = isRecord(schema) && typeof (schema as JsonSchemaObject).maxLength === "number" ? (schema as JsonSchemaObject).maxLength : undefined;
    const title = titleOfRecord(record) ?? (Object.values(params).join(" ") || route.operationId);
    return mockFile(type, { seed: `${seed}:${route.operationId}:${path}`, title, record, rows, model, locale, name: fileName && formatOf(typeOfName(fileName)) === formatOf(type) ? fileName : undefined, maxBytes });
  }

  /** an answer in another type than JSON, made from what the JSON answer would have been: a list's rows, a record */
  function fileAnswer(route: Route, path: string, status: number, type: string, v: unknown): TransportResponse {
    const listed = isRecord(v) ? Object.values(v).find((x) => Array.isArray(x) && x.length > 0 && x.every(isRecord)) : undefined;
    const rows = Array.isArray(v) ? v.filter(isRecord) : (listed as Record<string, unknown>[] | undefined);
    const record = !rows && isRecord(v) ? v : undefined;
    const f = mockFile(type, { seed: `${seed}:${route.operationId}:${path}:${type}`, title: titleOfRecord(record) ?? route.endpoint.summary ?? route.operationId, rows, record, model: route.model, locale });
    return { status, headers: { "content-type": contentTypeOf(f.type), "content-disposition": contentDisposition(f.name) }, body: { name: f.name, type: f.type, dataUrl: f.data, size: dataUrlSize(f.data) } satisfies TransportFile };
  }

  /** a value with its lists emptied: an empty result of an action */
  function emptied(v: unknown): unknown {
    if (Array.isArray(v)) return [];
    if (isRecord(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? [] : /^(total|count)$/i.test(k) && typeof x === "number" ? 0 : x]));
    return v;
  }

  const transport: MockTransport = {
    get scenario() {
      return scenarioId;
    },
    setScenario(id) {
      scenarioId = id || undefined;
      realtime.closeAll();
      session = start();
    },
    reset() {
      realtime.closeAll();
      session = start();
    },
    get log() {
      return log;
    },
    records: (model) => clone(store(model)),
    connect: (address, onMessage) => realtime.connect(address, onMessage),
    close: () => realtime.closeAll(),
    async request(req: TransportRequest): Promise<TransportResponse> {
      const asked = clock.now();
      const which = session;
      let out: { response: TransportResponse; route?: Route; latency: number; note?: string };
      try {
        if (req.signal?.aborted) out = { response: { status: 0, headers: {}, body: undefined }, latency: 0, note: "aborted" };
        else out = await answer(req);
      } catch (e) {
        out = { response: problem(500, words.mockError, { error: e instanceof Error ? e.message : String(e) }), latency: 0, note: "mock error" };
      }
      if (out.latency > 0) await clock.sleep(out.latency, req.signal);
      /* a call stopped while it waited, or answered by a session that has since been started over, never arrives */
      if (req.signal?.aborted) out = { ...out, response: { status: 0, headers: {}, body: undefined }, note: "aborted" };
      const entry: MockLogEntry = {
        id: ++logId,
        at: asked,
        method: req.method.toUpperCase(),
        path: req.path,
        ...(out.route ? { operationId: out.route.operationId } : {}),
        status: out.response.status,
        ms: Math.max(out.latency, clock.now() - asked),
        ...(which.scenario ? { scenario: which.scenario.id } : {}),
        ...(out.note ? { note: out.note } : {}),
      };
      log.push(entry);
      if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
      try {
        options.onLog?.(entry);
      } catch {
        /* a listener's mistake is not the caller's */
      }
      const headers: Record<string, string> = { ...out.response.headers, "x-request-id": `mock-${entry.id}`, ...(which.scenario ? { "x-mock-scenario": which.scenario.id } : {}) };
      return { status: out.response.status, headers: out.response.status === 0 ? {} : headers, body: out.response.body };
    },
  };
  return transport;
}

/** an answer's body as text, for the request log and the tools: JSON, a file's name and size, or nothing */
export function bodyText(body: unknown, max = 4000): string {
  if (body === undefined) return "";
  if (isFileValue(body)) return `[file ${body.name ?? ""} ${body.type ?? ""} ${body.size ?? dataUrlSize(body.dataUrl)} bytes]`;
  const text = JSON.stringify(body, (_k, v) => (typeof v === "string" && v.startsWith("data:") && v.length > 120 ? `${v.slice(0, 60)}…(${v.length} chars)` : v), 2) ?? "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
