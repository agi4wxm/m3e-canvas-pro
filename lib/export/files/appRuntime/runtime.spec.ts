//! Copied as it is (lib/export/copy.ts) into packages/app-runtime/src/runtime.test.ts of every product (lib/export/targets/appRuntime.ts), where it tests the runtime as the product runs it; here it tests lib/app and setup.ts the same way.
//! Written in the product's style (Prettier, no semicolons); the lines starting with //! are the editor's only.
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  Bindings,
  FormController,
  RuntimeProvider,
  SetupGate,
  createRuntime,
  memoryStorage,
  regionOf,
  runSetup,
  sourceKey,
  sourceView,
  useBindings,
  useDataSource,
  useSession,
  type AuthConfig,
  type SourceSpec,
  type Transport,
  type TransportRequest,
} from "./index"

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly operationId?: string,
  ) {
    super(`${operationId} failed with status ${status}`)
  }
}

/** one call as the generated client makes it: the answer's body, or an ApiError */
async function send<T>(t: Transport, r: TransportRequest): Promise<T> {
  const res = await t.request(r)
  if (res.status < 200 || res.status > 299) throw new ApiError(res.status, res.body, r.operationId)
  return res.body as T
}

const ITEMS = Array.from({ length: 25 }, (_, i) => ({ id: `p${i + 1}`, name: `Product ${i + 1}` }))

/** a back end of products in pages, a sign-in, and a list that wants its token */
function backEnd(log: TransportRequest[] = []): Transport {
  return {
    async request(r) {
      log.push(r)
      if (r.operationId === "login") {
        const ok = (r.body as { password?: string }).password === "secret"
        return ok ? { status: 200, headers: {}, body: { accessToken: "t1", refreshToken: "r1", user: { name: "ada" } } } : { status: 401, headers: {}, body: { title: "Wrong password", status: 401 } }
      }
      if (r.operationId === "create") return { status: 422, headers: {}, body: { title: "Unprocessable Content", status: 422, errors: [{ pointer: "#/name", detail: "That name is taken" }] } }
      if (r.headers?.Authorization !== "Bearer t1") return { status: 401, headers: {}, body: { title: "Unauthorized", status: 401 } }
      const from = Number(r.query?.cursor ?? 0)
      const size = Number(r.query?.limit ?? 10)
      return { status: 200, headers: {}, body: { items: ITEMS.slice(from, from + size), nextCursor: from + size < ITEMS.length ? String(from + size) : null } }
    },
  }
}

const AUTH: AuthConfig = { login: "login", security: { list: { header: "Authorization", prefix: "Bearer " }, login: null, create: null } }

const listSpec = (t: Transport): SourceSpec => ({
  key: sourceKey("list"),
  operation: "list",
  list: { field: "items" },
  paging: { style: "cursor", items: "items", cursorParam: "cursor", nextField: "nextCursor", limitParam: "limit" },
  pageSize: 10,
  load: ({ page, signal }) => send(t, { operationId: "list", method: "GET", path: "/items", query: page as Record<string, string | number>, signal }),
})

describe("the app runtime", () => {
  it("signs in, puts the token on the calls that need one, and pages a list", async () => {
    const log: TransportRequest[] = []
    const rt = createRuntime({ transport: backEnd(log), auth: AUTH, storage: memoryStorage() })
    const spec = listSpec(rt.transport)
    await rt.sources.enter(spec)
    expect(regionOf(sourceView(rt.sources.state(spec.key)))).toBe("forbidden")
    await send(rt.transport, { operationId: "login", method: "POST", path: "/login", body: { password: "secret" } })
    expect(rt.session.signedIn).toBe(true)
    await rt.sources.refresh(spec)
    await rt.sources.loadMore(spec)
    expect(rt.sources.state(spec.key).items).toHaveLength(20)
    expect(log.at(-1)?.headers?.Authorization).toBe("Bearer t1")
  })

  it("checks a form by its rules and puts the server's errors on its fields", async () => {
    const rt = createRuntime({ transport: backEnd(), auth: AUTH, lang: "zh" })
    const form = new FormController({ name: { kind: "text", required: true, schema: { type: "string", minLength: 2 } } }, { lang: () => rt.lang, call: (fn) => rt.call(fn) })
    expect(await form.submit((body) => send(rt.transport, { operationId: "create", method: "POST", path: "/items", body }))).toEqual({ ok: false, invalid: true })
    expect(form.view().errors).toEqual({ name: "必填" })
    form.set("name", "Lamp")
    await form.submit((body) => send(rt.transport, { operationId: "create", method: "POST", path: "/items", body }))
    expect(form.view().errors).toEqual({ name: "That name is taken" })
  })

  it("reads expressions as the design editor's preview does", () => {
    const $ = new Bindings({ item: { price: 12.5, name: "Lamp" } }, { lang: "en" })
    expect($.text("currency(item.price, 'USD')")).toBe("$12.50")
    expect($.fill("{{upper(item.name)}}!")).toBe("LAMP!")
    expect($.text("item.constructor")).toBe("")
  })

  it("draws a screen's first state with its hooks", () => {
    const rt = createRuntime({ transport: backEnd(), auth: AUTH, presumed: true })
    function Screen() {
      const list = useDataSource(listSpec(rt.transport))
      const session = useSession()
      const $ = useBindings({ data: { list } })
      return createElement("p", null, `${list.status} ${session.signedIn} ${$.text("auth.signedIn")}`)
    }
    expect(renderToString(createElement(RuntimeProvider, { runtime: rt }, createElement(Screen)))).toContain("idle true true")
  })
})

describe("the app's setup", () => {
  /** a setup that ends when the test says */
  function held() {
    let finish: (error?: unknown) => void = () => {}
    let runs = 0
    const setup = () => {
      runs++
      return new Promise<void>((resolve, reject) => (finish = (error) => (error ? reject(error) : resolve())))
    }
    return { setup, finish: (error?: unknown) => finish(error), runs: () => runs }
  }
  const app = (setup: () => void | Promise<void>) => renderToString(createElement(SetupGate, { setup }, createElement("p", null, "the app")))

  it("draws nothing before setup has finished, then the app; setup runs once however often it is drawn", async () => {
    const s = held()
    expect(app(s.setup)).toBe("")
    expect(app(s.setup)).toBe("")
    s.finish()
    expect(await runSetup(s.setup).done).toEqual({ status: "ready" })
    expect(app(s.setup)).toContain("the app")
    expect(s.runs()).toBe(1)
  })

  it("reports a setup that fails, once, and draws the app all the same", async () => {
    const s = held()
    const told: unknown[] = []
    const run = runSetup(s.setup, { report: (e) => told.push(e) })
    s.finish(new Error("no SDK"))
    expect((await run.done).status).toBe("failed")
    expect(told).toHaveLength(1)
    expect(app(s.setup)).toContain("the app")
  })

  it("draws the app at once after a setup with no promise, and after one that throws", () => {
    expect(app(() => {})).toContain("the app")
    const thrown = () => {
      throw new Error("bad key")
    }
    const told: unknown[] = []
    expect(runSetup(thrown, { report: (e) => told.push(e) }).state().status).toBe("failed")
    expect(app(thrown)).toContain("the app")
    expect(told).toHaveLength(1)
  })
})
