/* packages/mocks: the API answered with made-up data, for development only (never in a production build). Two ways in,
 * over the same routes: a transport (works everywhere the client runs, a mini-program and the editor's preview
 * included, since it needs neither a DOM nor a network) and MSW handlers for the web and React Native dev servers.
 *
 * This is the slot the mock library fills (decision 4: data from the schemas, scenarios, latency and errors, files,
 * stateful CRUD, realtime scripts): it writes src/generated/fixtures.ts and src/generated/scenarios.ts. Until then an
 * operation answers with the contract's example, or 501. */

import type { ApiModel } from "../api";
import { GENERATED, jsonCode, jsonFile, str } from "../code";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

const ROUTES = (scope: string) => `${GENERATED}
import type { HttpMethod, TransportRequest, TransportResponse } from ${str(`${scope}/api`)}

/** what a mock answers: a status and a body, after a delay when one is given */
export type MockAnswer = { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number }

/** one operation of the contract as the mocks answer it */
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

/** the answer to a request: the first route that matches it, or 404 */
export async function answer(routes: readonly MockRoute[], request: TransportRequest): Promise<TransportResponse> {
  for (const route of routes) {
    if (route.method !== request.method) continue
    const params = matchPath(route.path, request.path)
    if (!params) continue
    const out = await route.answer(request, params)
    if (out.delayMs) await new Promise((resolve) => setTimeout(resolve, out.delayMs))
    return { status: out.status, headers: { "content-type": "application/json", ...out.headers }, body: out.body }
  }
  return { status: 404, headers: { "content-type": "application/json" }, body: { error: "Not Found", path: request.path } }
}
`;

const INDEX = (scope: string) => `${GENERATED}
import type { Transport } from ${str(`${scope}/api`)}
import { FIXTURES } from "./generated/fixtures"
import { SCENARIOS, type ScenarioName } from "./generated/scenarios"
import { answer, type MockRoute } from "./routes"

export { answer, matchPath, type MockAnswer, type MockRoute } from "./routes"
export { SCENARIOS, type ScenarioName } from "./generated/scenarios"

export type MockOptions = {
  /** a named scenario of the mock library: "default" */
  scenario?: ScenarioName
  /** routes answered before the generated ones */
  routes?: readonly MockRoute[]
}

/** the routes of a scenario: its own first, then every operation's fixture */
export const routesOf = (options: MockOptions = {}): MockRoute[] => [...(options.routes ?? []), ...SCENARIOS[options.scenario ?? "default"].routes, ...FIXTURES]

/** A transport that answers from the mocks: no network, no DOM. */
export function createMockTransport(options: MockOptions = {}): Transport {
  const routes = routesOf(options)
  return { request: (request) => answer(routes, request) }
}
`;

const MSW = `${GENERATED}
import { http, HttpResponse, type HttpHandler } from "msw"
import { answer, type MockRoute } from "./routes"
import { routesOf, type MockOptions } from "./index"

/** Mock Service Worker handlers of the same routes, under the API's base ("/api" in the web app). */
export function mswHandlers(options: MockOptions & { baseUrl?: string } = {}): HttpHandler[] {
  const base = (options.baseUrl ?? "/api").replace(/\\/$/, "")
  const routes: MockRoute[] = routesOf(options)
  return [
    http.all(\`\${base}/*\`, async ({ request }) => {
      const url = new URL(request.url)
      const text = await request.text()
      const out = await answer(routes, {
        method: request.method.toUpperCase() as MockRoute["method"],
        path: url.pathname.slice(new URL(base, url).pathname.length) || "/",
        query: Object.fromEntries(url.searchParams),
        body: text ? (JSON.parse(text) as unknown) : undefined,
      })
      return HttpResponse.json(out.body ?? null, { status: out.status, headers: out.headers })
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

function fixturesSource(api: ApiModel): string {
  const rows = api.operations.map(
    (op) =>
      `  { operationId: ${str(op.operationId)}, method: ${str(op.method)}, path: ${str(op.path)}, answer: () => (${"example" in op ? `{ status: ${op.status}, body: ${jsonCode(op.example)} }` : `{ status: 501, body: { error: "Not mocked", operation: ${str(op.operationId)} } }`}) },`,
  );
  return `${GENERATED}
import type { MockRoute } from "../routes"

/** what each operation answers by default: the contract's example, else 501 until the mock library gives it data */
export const FIXTURES: MockRoute[] = [
${rows.join("\n")}
]
`;
}

const SCENARIOS = `${GENERATED}
import type { MockRoute } from "../routes"

/** the named situations the mocks can play: the mock library adds new user, lots of data, network error, slow network */
export const SCENARIOS = {
  default: { routes: [] as MockRoute[] },
} satisfies Record<string, { routes: MockRoute[] }>

export type ScenarioName = keyof typeof SCENARIOS
`;

const TEST = (scope: string) => `${GENERATED}
import { describe, expect, it } from "vitest"
import { createApi } from ${str(`${scope}/api`)}
import { createMockTransport } from "./index"

describe("the mock transport", () => {
  it("answers through the API client without a network", async () => {
    const api = createApi(createMockTransport({ routes: [{ operationId: "ping", method: "GET", path: "/ping/{id}", answer: (_request, params) => ({ status: 200, body: { pong: params.id } }) }] }))
    await expect(api.request({ method: "GET", path: "/ping/7" })).resolves.toEqual({ pong: "7" })
  })

  it("answers what it has no route for with 404", async () => {
    const api = createApi(createMockTransport())
    await expect(api.request({ method: "GET", path: "/nothing-here" })).rejects.toMatchObject({ status: 404 })
  })
})
`;

const TSCONFIG = jsonFile({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM", "DOM.Iterable"], types: [], verbatimModuleSyntax: true }, include: ["src"] });

export const mocksTarget: ProductTarget = {
  id: "mocks",
  build(ctx: ProductContext): Workspace {
    return {
      dir: "packages/mocks",
      pkg: `${ctx.scope}/mocks`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "模拟库：传输层模拟和 MSW（只在开发时使用）", en: "the mocks: a mock transport and MSW handlers (development only)" },
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/mocks`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts", "./msw": "./src/msw.ts", "./browser": "./src/browser.ts", "./node": "./src/node.ts" },
              scripts: { typecheck: "tsc --noEmit -p .", test: "vitest run" },
              dependencies: { [`${ctx.scope}/api`]: "0.1.0", msw: ctx.version("msw") },
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
        "src/generated/fixtures.ts": generated(fixturesSource(ctx.api)),
        "src/generated/scenarios.ts": generated(SCENARIOS),
        "src/mocks.test.ts": generated(TEST(ctx.scope)),
      },
    };
  },
};
