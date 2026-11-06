/* packages/mocks: the API answered with made-up data, for development only (never in a production build). Two ways in,
 * over one engine: a transport (works everywhere the client runs, a mini-program and the editor's preview included,
 * since it needs neither a DOM nor a network) and Mock Service Worker handlers for the web (msw/browser), tests
 * (msw/node) and React Native (msw/native) dev servers.
 *
 * The engine is the editor's own mock library (lib/mocks, docs/模拟库.md), copied as it is into src/engine with the
 * three pieces of lib/api it reads, so the exported app answers exactly as the preview does: the same generator, the
 * same routes and checks, the same scenarios. What the design says is data beside it: the contract (src/generated/
 * contract.ts), the mock settings (settings.ts), the pinned records (fixtures.ts), the scenarios (scenarios.ts) and the
 * library's files (files.ts, and the files themselves under files/). */

import { fromOpenApi, type ApiSpec } from "../../api";
import type { MockFile, MockModelConfig, MockScenario, MockSpec } from "../../mocks/types";
import { GENERATED, jsonCode, jsonFile, sortedObject, str } from "../code";
import { safeSegment } from "../paths";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

/** the files of the editor's mock library the engine is made of, and of lib/api what they read */
export const MOCK_ENGINE_FILES = ["types", "rng", "bytes", "locales", "hints", "pattern", "shape", "generate", "data", "files", "routes", "check", "clock", "realtime", "transport"].map((n) => `lib/mocks/${n}.ts`);
export const MOCK_ENGINE_API_FILES = ["types", "schema", "transport"].map((n) => `lib/api/${n}.ts`);

const ROUTES = (scope: string) => `${GENERATED}
import type { HttpMethod, TransportRequest, TransportResponse } from ${str(`${scope}/api`)}

/** what a route of your own answers: a status and a body, after a delay when one is given */
export type MockAnswer = { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number }

/** a route of your own, answered before the generated mocks (for a call the contract does not name yet) */
export type MockRoute = {
  operationId: string
  method: HttpMethod
  /** the contract's path: /products/{id} */
  path: string
  answer: (request: TransportRequest, params: Record<string, string>) => MockAnswer | Promise<MockAnswer>
}

/** the path parameters of a request, when its path is the route's */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split("/")
  const got = path.split("?")[0].split("/")
  if (want.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    const name = /^\\{(.+)\\}$/.exec(want[i])?.[1]
    if (name !== undefined) params[name] = decodeURIComponent(got[i])
    else if (want[i] !== got[i]) return null
  }
  return params
}

/** the answer of the first route that matches a request, or null when none does */
export async function answer(routes: readonly MockRoute[], request: TransportRequest): Promise<TransportResponse | null> {
  for (const route of routes) {
    if (route.method !== request.method) continue
    const params = matchPath(route.path, request.path)
    if (!params) continue
    const out = await route.answer(request, params)
    if (out.delayMs) await new Promise((resolve) => setTimeout(resolve, out.delayMs))
    return { status: out.status, headers: { "content-type": "application/json", ...out.headers }, body: out.body }
  }
  return null
}
`;

const INDEX = (scope: string) => `${GENERATED}
import type { Transport } from ${str(`${scope}/api`)}
import { createMockTransport as createEngine, type MockOptions as EngineOptions, type MockTransport as EngineTransport } from "./engine/mocks/transport"
import { API, COLLECTIONS } from "./generated/contract"
import { FIXTURES } from "./generated/fixtures"
import { FILES } from "./generated/files"
import { SCENARIOS, type ScenarioName } from "./generated/scenarios"
import { SETTINGS } from "./generated/settings"
import type { MockSpec } from "./engine/mocks/types"
import { answer, type MockRoute } from "./routes"

export { answer, matchPath, type MockAnswer, type MockRoute } from "./routes"
export { SCENARIOS, type ScenarioName } from "./generated/scenarios"
export type { MockLogEntry } from "./engine/mocks/transport"
export type { MockConnection, MockMessage } from "./engine/mocks/realtime"
export { fakeClock, type MockClock } from "./engine/mocks/clock"

/** the mock settings of the design, as the engine reads them */
export const MOCKS: MockSpec = {
  ...SETTINGS,
  models: SETTINGS.models?.map((m) => ({ ...m, ...(FIXTURES[m.name] ? { fixtures: FIXTURES[m.name] } : {}) })),
  scenarios: [...SCENARIOS],
  files: FILES,
}

export type MockOptions = Omit<EngineOptions, "scenario"> & {
  /** a named scenario of the design (new-user, lots, network-error…); the design's own choice when left out, none for "" */
  scenario?: ScenarioName | ""
  /** routes of your own, answered before the generated ones */
  routes?: readonly MockRoute[]
}

export type MockTransport = EngineTransport & Transport

/** A transport that answers from the mocks: no network, no DOM. Within it, what is made is there on the next call. */
export function createMockTransport(options: MockOptions = {}): MockTransport {
  const { routes = [], ...rest } = options
  const engine = createEngine({ api: API, mocks: MOCKS, collections: COLLECTIONS }, rest)
  if (!routes.length) return engine
  return Object.assign(Object.create(engine) as MockTransport, {
    request: async (request: Parameters<Transport["request"]>[0]) => (await answer(routes, request)) ?? engine.request(request),
  })
}
`;

const MSW = `${GENERATED}
import { http, HttpResponse, sse, ws, type HttpHandler, type WebSocketHandler } from "msw"
import { fromBase64, toBase64 } from "./engine/mocks/bytes"
import { channelPattern } from "./engine/mocks/realtime"
import { API } from "./generated/contract"
import { createMockTransport, type MockOptions } from "./index"

/** a file the app sent, as the transport carries one */
async function fileOf(file: File) {
  return { name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl: \`data:\${file.type || "application/octet-stream"};base64,\${toBase64(new Uint8Array(await file.arrayBuffer()))}\` }
}

const isFile = (v: unknown): v is { name: string; type: string; dataUrl: string } => !!v && typeof v === "object" && typeof (v as { dataUrl?: unknown }).dataUrl === "string"

/** Mock Service Worker handlers that answer the API under its base ("/api" in the web app) from one mock session, and
 *  its realtime channels wherever their URLs end in the channel's address: a WebSocket's frames are the JSON payloads
 *  alone (the message an app sends is the one it fits), server-sent events carry the message's name as the event and
 *  its JSON payload as the data, as the exported server sends them. */
export function mswHandlers(options: MockOptions & { baseUrl?: string } = {}): (HttpHandler | WebSocketHandler)[] {
  const { baseUrl = "/api", ...rest } = options
  const base = baseUrl.replace(/\\/$/, "")
  const transport = createMockTransport(rest)
  const realtime = (API.channels ?? [])
    .filter((c) => c.address)
    .map((c): HttpHandler | WebSocketHandler => {
      const pattern = new RegExp(\`/\${channelPattern(c).replace(/^\\\\?\\//, "")}\`)
      if (c.transport === "sse")
        return sse(pattern, ({ request, client }) => {
          const connection = transport.connect(new URL(request.url).pathname, (m) => client.send({ event: m.message, data: JSON.stringify(m.payload ?? null) } as never))
          request.signal.addEventListener("abort", () => connection.close())
        })
      return ws.link(pattern).addEventListener("connection", ({ client }) => {
        const connection = transport.connect(client.url.pathname, (m) => client.send(m.frame))
        client.addEventListener("message", (event) => {
          if (typeof event.data === "string") connection.receive(event.data)
        })
        client.addEventListener("close", () => connection.close())
      })
    })
  return [
    ...realtime,
    http.all(\`\${base}/*\`, async ({ request }) => {
      const url = new URL(request.url)
      const query: Record<string, string | string[]> = {}
      url.searchParams.forEach((value, key) => {
        const was = query[key]
        query[key] = was === undefined ? value : [...(Array.isArray(was) ? was : [was]), value]
      })
      const type = request.headers.get("content-type") ?? ""
      let body: unknown
      if (/multipart\\/form-data/i.test(type)) {
        const form = await request.formData()
        const fields: Record<string, unknown> = {}
        for (const [key, value] of form.entries()) fields[key] = typeof value === "string" ? value : await fileOf(value)
        body = fields
      } else if (/json/i.test(type)) {
        const text = await request.text()
        try {
          body = text ? (JSON.parse(text) as unknown) : undefined
        } catch {
          body = text
        }
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        const bytes = new Uint8Array(await request.arrayBuffer())
        body = bytes.length ? bytes : undefined
      }
      const headers: Record<string, string> = {}
      request.headers.forEach((value, key) => {
        headers[key] = value
      })
      const out = await transport.request({
        method: request.method.toUpperCase() as Parameters<typeof transport.request>[0]["method"],
        path: url.pathname.slice(new URL(base, url).pathname.length) || "/",
        query,
        headers,
        body,
      })
      if (out.status === 0) return HttpResponse.error()
      if (isFile(out.body)) return new HttpResponse(fromBase64(out.body.dataUrl.slice(out.body.dataUrl.indexOf(",") + 1)), { status: out.status, headers: out.headers })
      if (out.body === undefined || out.status === 204 || out.status === 304) return new HttpResponse(null, { status: out.status, headers: out.headers })
      return HttpResponse.json(out.body, { status: out.status, headers: out.headers })
    }),
  ]
}
`;

const BROWSER = `${GENERATED}
import { setupWorker } from "msw/browser"
import { mswHandlers } from "./msw"
import type { MockOptions } from "./index"

/** Serves the mocks from a service worker in the browser (the web app's dev server serves the worker script). */
export async function startWorker(options: MockOptions & { baseUrl?: string } = {}) {
  const worker = setupWorker(...mswHandlers(options))
  await worker.start({ onUnhandledFrame: "bypass", quiet: true })
  return worker
}
`;

const NODE = `${GENERATED}
import { setupServer } from "msw/node"
import { mswHandlers } from "./msw"
import type { MockOptions } from "./index"

/** the mocks for code running in Node (tests): answer fetch calls to the API's base */
export const mockServer = (options: MockOptions & { baseUrl?: string } = {}) => setupServer(...mswHandlers(options))
`;

const NATIVE = `${GENERATED}
import { FetchInterceptor } from "@mswjs/interceptors/fetch/web"
import { XMLHttpRequestInterceptor } from "@mswjs/interceptors/XMLHttpRequest/web"
import { defineNetwork, InterceptorSource } from "msw/experimental"
import { mswHandlers } from "./msw"
import type { MockOptions } from "./index"

/** The mocks in a React Native app's development build (MSW over React Native's fetch and XMLHttpRequest, what
 *  msw/native was before MSW 3): its calls to \`baseUrl\` (the API's full address, as the app calls it) are answered
 *  here. Call it before the app renders, in development only. */
export async function startNative(options: MockOptions & { baseUrl: string }) {
  const network = defineNetwork({
    /* the web interceptors' declarations name their own copy of the Interceptor class: the same at run time */
    sources: [new InterceptorSource({ interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()] as unknown as ConstructorParameters<typeof InterceptorSource>[0]["interceptors"] })],
    handlers: mswHandlers(options),
    onUnhandledFrame: "bypass",
  })
  await network.enable()
  return network
}
`;

const TEST = (scope: string) => `${GENERATED}
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApi } from ${str(`${scope}/api`)}
import { compileRoutes } from "./engine/mocks/routes"
import { API } from "./generated/contract"
import { SCENARIOS, type ScenarioName } from "./generated/scenarios"
import { createMockTransport, fakeClock } from "./index"
import { mockServer } from "./node"

/* the operations a test can call with nothing but their path: a GET with no path or required query parameters */
const plain = compileRoutes(API).filter((r) => r.method === "GET" && !r.params.length && !r.parameters.some((p) => p.required && p.in !== "header"))

describe("the mock transport", () => {
  it("answers through the API client without a network", async () => {
    const api = createApi(createMockTransport({ latency: false, routes: [{ operationId: "ping", method: "GET", path: "/ping/{id}", answer: (_request, params) => ({ status: 200, body: { pong: params.id } }) }] }))
    await expect(api.request({ method: "GET", path: "/ping/7" })).resolves.toEqual({ pong: "7" })
  })

  it("answers what it has no route for with 404", async () => {
    const api = createApi(createMockTransport({ latency: false }))
    await expect(api.request({ method: "GET", path: "/nothing-here" })).rejects.toMatchObject({ status: 404 })
  })

  it("answers every plain operation of the contract, the same for the same seed", async () => {
    for (const route of plain) {
      const one = await createMockTransport({ latency: false, scenario: "" }).request({ method: "GET", path: route.path })
      const two = await createMockTransport({ latency: false, scenario: "" }).request({ method: "GET", path: route.path })
      /* a secured one may want a token when the design starts signed out */
      expect(one.status < 300 || one.status === 401, \`\${route.operationId} \${one.status}\`).toBe(true)
      expect(JSON.stringify(one.body)).toBe(JSON.stringify(two.body))
    }
  })

  it("plays every scenario of the design", async () => {
    for (const scenario of SCENARIOS) {
      const transport = createMockTransport({ latency: false, scenario: scenario.id as ScenarioName })
      expect(transport.scenario).toBe(scenario.id)
      for (const route of plain.slice(0, 3)) expect(typeof (await transport.request({ method: "GET", path: route.path })).status).toBe("number")
    }
  })
})

describe("the realtime channels", () => {
  it("send what the exported server sends: the JSON payload alone over a WebSocket, the name as the event over SSE", async () => {
    const clock = fakeClock()
    const transport = createMockTransport({ latency: false, clock, scenario: "" })
    const got: { frame: string; payload: unknown; transport: string }[] = []
    for (const c of API.channels ?? []) if (c.address) transport.connect(c.address.replace(/\\{[^{}]+\\}/g, "1"), (m) => got.push(m))
    await clock.advance(20_000)
    for (const m of got) {
      if (m.transport === "sse") expect(m.frame).toBe(\`event: \${m.frame.slice(7, m.frame.indexOf("\\n"))}\\ndata: \${JSON.stringify(m.payload ?? null)}\\n\\n\`)
      else expect(JSON.parse(m.frame)).toEqual(m.payload ?? null)
    }
    transport.close()
  })
})

describe("the MSW handlers", () => {
  const server = mockServer({ baseUrl: "http://localhost/api", latency: false, scenario: "" })
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }))
  afterAll(() => server.close())

  it("answer fetch calls with the same data", async () => {
    for (const route of plain.slice(0, 5)) {
      const res = await fetch(\`http://localhost/api\${route.path}\`)
      expect(res.status < 300 || res.status === 401, route.operationId).toBe(true)
    }
  })
})
`;

const TSCONFIG = jsonFile({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM", "DOM.Iterable"], types: [], verbatimModuleSyntax: true }, include: ["src"] });

/** The API section a product's mocks answer: the document's own, else the one the export was given, read back. */
function specOf(ctx: ProductContext): ApiSpec {
  if (ctx.doc.api) return ctx.doc.api;
  try {
    return fromOpenApi(ctx.api.openapi).api;
  } catch {
    return {};
  }
}

const extOf = (type: string) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "application/pdf": "pdf", "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "video/mp4": "mp4", "video/webm": "webm" })[type] ?? "bin";

/** a file's bytes from its data URL; null when it holds none (a reference the editor could not resolve) */
function bytesOf(f: MockFile): Uint8Array | null {
  const m = /^data:[^;,]*(;[^,]*)?,([\s\S]*)$/.exec(f.data);
  if (!m || !/;base64/i.test(m[1] ?? "")) return null;
  try {
    return Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** the mocks' section of AGENTS.md: what the package is, how to use it, and that none of it is edited by hand */
const AGENTS = (scope: string) => `## The mocks (packages/mocks)

\`${scope}/mocks\` answers the API with made-up data while the app is developed: data made from the contract's schemas,
the design's scenarios (new user, lots of data, network error, slow network, signed out…), its mock files, realtime
scripts and a sign-in with tokens that expire. It is the design editor's own mock library: \`src/engine/\` is copied
from it and \`src/generated/\` holds the design's mock settings. **Never edit any of it**: the data, the scenarios and
the files are changed in the design (the Mocks tab) and exported again. Development only: never import it from
production code (\`import.meta.env.DEV\` keeps it out of the web build).

- \`createMockTransport({ scenario, seed, latency, routes })\` is a \`Transport\` for \`createApi\`: no network, no DOM,
  works in tests, React Native and a mini-program. \`routes\` are answers of your own, tried first (an endpoint the
  contract does not have yet).
- \`${scope}/mocks/browser\` (\`startWorker\`), \`/node\` (\`mockServer\`, for tests) and \`/native\` (\`startNative({ baseUrl })\`,
  React Native) answer real fetch calls the same way through Mock Service Worker.
- A status 0 answer is a network failure; every other failure is RFC 9457 problem details.
`;

/** a TypeScript literal type of a scenario's id */
const scenarioType = (scenarios: MockScenario[]) => (scenarios.length ? scenarios.map((s) => str(s.id)).join(" | ") : "never");

export const mocksTarget: ProductTarget = {
  id: "mocks",
  async build(ctx: ProductContext): Promise<Workspace> {
    const spec = specOf(ctx);
    const mocks: MockSpec = ctx.doc.mocks ?? {};
    const { models, scenarios = [], files = [], ...settings } = mocks;
    const collections = (ctx.doc.collections ?? []).filter((c) => c.model);
    /* the files with their bytes beside them; one that has none (an unresolved reference) is left out */
    const kept = files.filter((f) => bytesOf(f) !== null);
    const fileNames = new Map(kept.map((f, i) => [f.id, `${safeSegment(f.id, `file-${i + 1}`)}.${extOf(f.type)}`]));
    const engine: Record<string, ReturnType<typeof generated>> = {};
    for (const path of [...MOCK_ENGINE_FILES, ...MOCK_ENGINE_API_FILES]) engine[`src/engine/${path.slice(4)}`] = generated(await ctx.read(path));
    const assets: Record<string, ReturnType<typeof generated>> = {};
    for (const f of kept) assets[`files/${fileNames.get(f.id)}`] = generated(bytesOf(f)!);
    const fixtures = Object.fromEntries((models ?? []).filter((m) => m.fixtures?.length).map((m) => [m.name, m.fixtures!]));
    const settingsData: MockSpec = { ...settings, ...(models?.length ? { models: models.map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== "fixtures")) as MockModelConfig) } : {}) };
    return {
      dir: "packages/mocks",
      pkg: `${ctx.scope}/mocks`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "模拟库：传输层模拟和 MSW（只在开发时使用），和编辑器预览同一套生成器和场景", en: "the mocks: a mock transport and MSW handlers (development only), the editor preview's own generator and scenarios" },
      agents: AGENTS(ctx.scope),
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/mocks`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts", "./msw": "./src/msw.ts", "./browser": "./src/browser.ts", "./node": "./src/node.ts", "./native": "./src/native.ts" },
              scripts: { typecheck: "tsc --noEmit -p .", test: "vitest run" },
              /* in the order npm writes them, so an install leaves the file as the export wrote it */
              dependencies: sortedObject({ [`${ctx.scope}/api`]: "0.1.0", "@mswjs/interceptors": ctx.version("@mswjs/interceptors"), msw: ctx.version("msw") }),
              devDependencies: { typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(TSCONFIG),
        "src/index.ts": generated(INDEX(ctx.scope)),
        "src/routes.ts": generated(ROUTES(ctx.scope)),
        "src/msw.ts": generated(MSW),
        "src/browser.ts": generated(BROWSER),
        "src/node.ts": generated(NODE),
        "src/native.ts": generated(NATIVE),
        ...engine,
        "src/generated/contract.ts": generated(`${GENERATED}
import type { ApiSpec } from "../engine/api/types"
import type { MockCollection } from "../engine/mocks/data"

/** the API the mocks answer: the design's contract (packages/api/openapi.yaml is the same) */
export const API: ApiSpec = ${jsonCode(spec)}

/** the design's data collections that hold examples of a model: their rows come first in its records */
export const COLLECTIONS: MockCollection[] = ${jsonCode(collections.map((c) => ({ id: c.id, name: c.name, fields: c.fields, rows: c.rows, model: c.model })))}
`),
        "src/generated/settings.ts": generated(`${GENERATED}
import type { MockSpec } from "../engine/mocks/types"

/** the design's mock settings: seed, language, latency, how each model's fields are made and how many records it has, realtime scripts, sign-in */
export const SETTINGS: MockSpec = ${jsonCode(settingsData)}
`),
        "src/generated/fixtures.ts": generated(`${GENERATED}
/** the records pinned by hand in the design, by model: they come first, exactly as written */
export const FIXTURES: Record<string, Record<string, unknown>[]> = ${jsonCode(fixtures)}
`),
        "src/generated/scenarios.ts": generated(`${GENERATED}
import type { MockScenario } from "../engine/mocks/types"

/** the named situations the design is looked at in: new user, lots of data, network error, slow network, signed out… */
export const SCENARIOS: readonly MockScenario[] = ${jsonCode(scenarios)}

export type ScenarioName = ${scenarioType(scenarios)}
`),
        "src/generated/files.ts": generated(`${GENERATED}
import type { MockFile } from "../engine/mocks/types"

/** the design's mock files (pictures, PDFs, sounds, clips), as data URLs so they work without a file loader; the same
 *  files are in packages/mocks/files */
export const FILES: MockFile[] = ${jsonCode(kept.map((f) => ({ ...f, name: f.name })))}
`),
        ...assets,
        "src/mocks.test.ts": generated(TEST(ctx.scope)),
      },
    };
  },
};
