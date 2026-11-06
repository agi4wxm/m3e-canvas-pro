/* packages/app-runtime: the runtime every front end of the product runs on (the web app, the React Native app, the
 * Taro mini-program). React, but no DOM, React Native or Taro: the platform's pieces (where tokens are kept, the
 * transport, where a 401 goes) are handed in. It is the editor's own code, copied as it is into src/engine (the way
 * packages/mocks copies the mock library): the expression evaluator, the formats and the app's words in zh/en/ja/ko,
 * the rules forms are checked by, how a data source pages and what a region shows (lib/bindings), and the runtime made
 * of them (lib/app: data sources, forms, calls, the session, React hooks). So the exported apps and the editor's
 * preview behave alike, from one implementation. docs/导出.md lists its API. */

import { GENERATED, jsonFile } from "../code";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

/** the editor's files the runtime is made of: the bindings' pure pieces, the two of lib/api they read, and lib/app */
export const APP_RUNTIME_FILES = [
  ...["expr", "format", "messages", "rules", "sources", "form"].map((n) => `lib/bindings/${n}.ts`),
  ...["types", "transport"].map((n) => `lib/api/${n}.ts`),
  ...["store", "session", "sources", "forms", "scope", "runtime", "react", "index"].map((n) => `lib/app/${n}.ts`),
];

const INDEX = `${GENERATED}
/* The runtime of the product's front ends: see src/engine/app/index.ts, and docs/导出.md in the design editor. */
export * from "./engine/app/index"
`;

/* The runtime's own test, as the product runs it: no contract of its own, a back end made up here */
const TEST = `${GENERATED}
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  Bindings,
  FormController,
  RuntimeProvider,
  createRuntime,
  memoryStorage,
  regionOf,
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
    super(\`\${operationId} failed with status \${status}\`)
  }
}

/** one call as the generated client makes it: the answer's body, or an ApiError */
async function send<T>(t: Transport, r: TransportRequest): Promise<T> {
  const res = await t.request(r)
  if (res.status < 200 || res.status > 299) throw new ApiError(res.status, res.body, r.operationId)
  return res.body as T
}

const ITEMS = Array.from({ length: 25 }, (_, i) => ({ id: \`p\${i + 1}\`, name: \`Product \${i + 1}\` }))

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
      return createElement("p", null, \`\${list.status} \${session.signedIn} \${$.text("auth.signedIn")}\`)
    }
    expect(renderToString(createElement(RuntimeProvider, { runtime: rt }, createElement(Screen)))).toContain("idle true true")
  })
})
`;

const TSCONFIG = jsonFile({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022"], types: [], jsx: "react-jsx", verbatimModuleSyntax: true }, include: ["src"], exclude: ["src/**/*.test.ts"] });

/* the test sees what the code sees, and renders on the server (react-dom/server) */
const TSCONFIG_TEST = jsonFile({ extends: "./tsconfig.json", include: ["src"], exclude: [] });

const README = (scope: string) => `# ${scope}/app-runtime

The runtime the product's front ends share: data sources, forms, calls, the session, expressions and their formats,
the states of a region, as React hooks over plain TypeScript (no DOM, React Native or Taro). \`src/engine/\` is the
design editor's own code, copied as it is; never edit it here. See AGENTS.md.

前端（Web、React Native、小程序）共用的运行时：数据源、表单、调用、会话、表达式和格式化、区域的状态。\`src/engine/\`
是设计编辑器自己的代码，原样复制，不要在这里修改。
`;

const AGENTS = (scope: string) => `## The app runtime (packages/app-runtime)

\`${scope}/app-runtime\` is what the generated screens run on: \`createRuntime({ transport, auth, storage, presumed, lang })\`
holds the session (tokens kept in the platform's storage, put on the calls that need them, refreshed once on a 401, then
the app is sent to sign in), the data sources' cache and the language; \`RuntimeProvider\` puts it under the app and the
hooks (\`useDataSource\`, \`useForm\`, \`useSession\`, \`useBindings\`, \`useRegion\`, \`useRequireAuth\`, \`useCall\`) are what a
screen uses. Expressions are the design's own, evaluated by the design editor's evaluator (never \`eval\`). It is copied
from the design editor (\`src/engine/\`): **never edit it**. Custom code may use it (\`useRuntime()\`, \`useSession()\`), for
example to read the signed-in user in a third-party SDK's setup.
`;

export const appRuntimeTarget: ProductTarget = {
  id: "app-runtime",
  async build(ctx: ProductContext): Promise<Workspace> {
    const engine: Record<string, ReturnType<typeof generated>> = {};
    for (const path of APP_RUNTIME_FILES) engine[`src/engine/${path.slice("lib/".length)}`] = generated(await ctx.read(path));
    return {
      dir: "packages/app-runtime",
      pkg: `${ctx.scope}/app-runtime`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "前端共用的运行时：数据源、表单、调用、会话、表达式（React，不依赖 DOM）", en: "the front ends' shared runtime: data sources, forms, calls, the session, expressions (React, no DOM)" },
      agents: AGENTS(ctx.scope),
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/app-runtime`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts" },
              scripts: { typecheck: "tsc --noEmit -p . && tsc --noEmit -p tsconfig.test.json", test: "vitest run" },
              /* the app's own React: one copy, whichever front end it runs in */
              peerDependencies: { react: ">=18.3.0" },
              devDependencies: { "@types/react": ctx.version("@types/react"), "@types/react-dom": ctx.version("@types/react-dom"), "react-dom": ctx.version("react-dom"), typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(TSCONFIG),
        "tsconfig.test.json": generated(TSCONFIG_TEST),
        "README.md": generated(README(ctx.scope)),
        "src/index.ts": generated(INDEX),
        "src/runtime.test.ts": generated(TEST),
        ...engine,
      },
    };
  },
};
