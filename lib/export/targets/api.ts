/* packages/api: the contract and the typed client the web app, the mobile app and the mini-program share. The client
 * runs over a small `Transport` (decision 5b): fetch by default, React Native's fetch, a mini-program's request, or the
 * mocks. Nothing in this package assumes a DOM or a global `fetch`: its tsconfig has neither, so a use of one does not
 * typecheck.
 *
 * Everything here is generated. The transport, the client and fetch's transport are this repo's lib/export/files/api,
 * copied as they are; the operations come from the contract (lib/export/api.ts), the types from its schemas (lib/api's
 * schemaToTs, once there is one); with an empty contract the client has only `request`. */

import type { ApiModel, ApiOperation } from "../api";
import type { ApiSpec, JsonSchema } from "../../api/types";
import { resolved } from "../../bindings/contract";
import { GENERATED, jsonCode, jsonFile, str } from "../code";
import { copiedFile } from "../copy";
import { toYaml } from "../yaml";
import { generated, type ProductContext, type ProductTarget, type Workspace } from "../types";

/** the editor's file every transport reads an answer with, copied into packages/api (and packages/app-runtime) */
export const BODY_SOURCE = "lib/api/body.ts";

/* the client every product has, before its operations: real files of this repo, copied as they are (lib/export/copy.ts) */
const COPIED = { "src/transport.ts": "api/transport.ts", "src/client.ts": "api/client.ts", "src/fetch.ts": "api/fetch.ts", "src/realtime.ts": "api/realtime.ts" } as const;

/** The contract's realtime channels as the client tells their messages apart (src/realtime.ts `RealtimeChannel`): the
 *  messages the server sends over each, with the fields each payload must have and those fixed to one value; and
 *  where they are by default (the contract's dev server's realtime address, else none: the app says). */
export function channelsSource(api: ApiSpec | undefined): string {
  const channels = (api?.channels ?? []).map((c) => {
    const sent = new Set(c.operations.filter((o) => o.action === "send").flatMap((o) => o.messages ?? c.messages.map((m) => m.name)));
    const messages = c.messages
      .filter((m) => sent.has(m.name))
      .map((m) => {
        const schema = api ? resolved(api, m.payload) : undefined;
        const required = Array.isArray(schema?.required) ? schema.required.filter((k): k is string => typeof k === "string") : [];
        const fixed: Record<string, unknown> = {};
        for (const [k, p] of Object.entries(schema?.properties ?? {})) {
          const one = api ? resolved(api, p as JsonSchema) : undefined;
          if (one && "const" in one) fixed[k] = one.const;
          else if (Array.isArray(one?.enum) && one.enum.length === 1) fixed[k] = one.enum[0];
        }
        return { name: m.name, ...(required.length ? { required } : {}), ...(Object.keys(fixed).length ? { fixed } : {}) };
      });
    return { id: c.id, address: c.address, ...(c.transport === "sse" ? { transport: "sse" } : {}), messages };
  });
  const servers = api?.servers ?? [];
  const url = (servers.find((x) => x.env === "dev") ?? servers.find((x) => x.realtime))?.realtime ?? "";
  return `${GENERATED}
import type { RealtimeChannel } from "../realtime"

/** the realtime channels of the contract (asyncapi.yaml), as the client tells their messages apart */
export const CHANNELS: RealtimeChannel[] = ${jsonCode(channels)}

/** where the realtime channels are, as the contract's dev server has it ("" when it says nothing) */
export const REALTIME_URL = ${str(url)}
`;
}

/** the input type of one operation: its path parameters, its body, its query */
function inputType(op: ApiOperation): string | null {
  const parts: string[] = [];
  if (op.params.length) parts.push(`params: { ${op.params.map((p) => `readonly ${str(p)}: string | number`).join("; ")} }`);
  if (op.body) parts.push(`body: ${op.bodyType}`);
  if (op.query) parts.push("query?: Query");
  return parts.length ? `{ ${parts.join("; ")} }` : null;
}

/** the path of an operation as code: its fixed pieces as strings, its parameters as encoded segments */
function pathCode(op: ApiOperation): string {
  const pieces: string[] = [];
  let at = 0;
  for (const m of op.path.matchAll(/\{([^{}/]+)\}/g)) {
    if (m.index! > at) pieces.push(str(op.path.slice(at, m.index)));
    pieces.push(`segment(input.params[${str(m[1])}])`);
    at = m.index! + m[0].length;
  }
  if (at < op.path.length) pieces.push(str(op.path.slice(at)));
  return pieces.join(" + ") || str("/");
}

function operationsSource(api: ApiModel): string {
  const ops = api.operations;
  const methods = ops.map((op) => {
    const input = inputType(op);
    const call = [`operationId: ${str(op.operationId)}`, `method: ${str(op.method)}`, `path: ${pathCode(op)}`, ...(op.query ? ["query: input?.query"] : []), ...(op.body ? ["body: input.body"] : []), ...(op.multipart ? ['headers: { "content-type": "multipart/form-data" }'] : [])].join(", ");
    const arg = input ? (op.params.length || op.body ? `input: ${input}` : `input?: ${input}`) : "";
    return `    ${op.name}: (${arg}${arg ? ", " : ""}init?: CallInit) => send<${op.responseType}>(transport, { ${call} }, init),`;
  });
  const typeNames = ops.flatMap((op) => [op.bodyType, op.responseType]).filter((t) => !["unknown", "void", "never"].includes(t) && /^[A-Za-z_$][\w$]*$/.test(t));
  return `${GENERATED}
import { send, type CallInit${ops.some((op) => op.params.length) ? ", segment" : ""} } from "../client"
import type { ${ops.some((op) => op.query) ? "Query, " : ""}Transport, TransportRequest } from "../transport"
${typeNames.length ? `import type { ${[...new Set(typeNames)].sort().join(", ")} } from "./types"\n` : ""}
/** every operation of the contract: its id, method and path as the contract writes it */
export const OPERATIONS = [
${ops.map((op) => `  { name: ${str(op.name)}, operationId: ${str(op.operationId)}, method: ${str(op.method)}, path: ${str(op.path)}, status: ${op.status} },`).join("\n")}
] as const

export type OperationName = (typeof OPERATIONS)[number]["name"]

/** The API over a transport: one function per operation, and \`request\` for a call the contract does not name. */
export function createApi(transport: Transport) {
  return {
${methods.join("\n")}
    request: <T = unknown>(request: TransportRequest) => send<T>(transport, request, { headers: request.headers, signal: request.signal, onUploadProgress: request.onUploadProgress }),
  }
}

export type Api = ReturnType<typeof createApi>
`;
}

const INDEX = `${GENERATED}
export * from "./transport"
export * from "./client"
export * from "./fetch"
export { readBody, textBody, type RawResponse, type ResponseFile } from "./body"
export * from "./generated/types"
export * from "./generated/operations"
export { CONTRACT, ASYNC_CONTRACT } from "./generated/contract"
export * from "./realtime"
export { CHANNELS, REALTIME_URL } from "./generated/channels"
`;

const CLIENT_TEST = `${GENERATED}
import { describe, expect, it } from "vitest"
import { ApiError, CHANNELS, createApi, createFetchTransport, messageOf, queryString, withRealtime, type Transport, type TransportRequest } from "../index"
import { segment } from "../client"
import { OPERATIONS } from "./operations"

/** a transport that answers every call with what it is given, and remembers what it was asked */
function answering(status: number, body: unknown) {
  const asked: TransportRequest[] = []
  const transport: Transport = {
    async request(request) {
      asked.push(request)
      return { status, headers: {}, body }
    },
  }
  return { transport, asked }
}

describe("the API client", () => {
  it("has a function for every operation of the contract", () => {
    const api = createApi(answering(200, null).transport) as Record<string, unknown>
    for (const op of OPERATIONS) expect(typeof api[op.name]).toBe("function")
  })

  it("sends a call through its transport and gives back what a 2xx answer holds", async () => {
    const { transport, asked } = answering(200, { ok: true })
    const api = createApi(transport)
    await expect(api.request({ method: "GET", path: "/anything", query: { page: 2, tag: ["a", "b"] } })).resolves.toEqual({ ok: true })
    expect(asked[0]).toMatchObject({ method: "GET", path: "/anything" })
    expect(queryString(asked[0].query)).toBe("page=2&tag=a&tag=b")
  })

  it("throws what is not 2xx as an ApiError with its status", async () => {
    const api = createApi(answering(501, { error: "Not Implemented" }).transport)
    await expect(api.request({ method: "POST", path: "/anything", body: {} })).rejects.toBeInstanceOf(ApiError)
    await expect(api.request({ method: "POST", path: "/anything" })).rejects.toMatchObject({ status: 501 })
  })

  it("keeps a path parameter one segment of its own path, whatever the data gives it", () => {
    expect(segment("a/b?c#d")).toBe("a%2Fb%3Fc%23d")
    expect(segment(42)).toBe("42")
    /* "." and ".." are steps along the path to every URL parser (fetch too): /orders/{id}/cancel with ".." would be
       sent to /cancel, with the session's token */
    for (const step of [".", ".."]) expect(() => segment(step)).toThrow()
    expect(segment("%2e%2e")).toBe("%252e%252e")
    expect(segment("...")).toBe("...")
  })

  it("reads an answer over fetch by its bytes: a file whole, JSON parsed, text as text, nothing for a HEAD", async () => {
    type Init = { status: number; headers: Record<string, string> }
    const { Response } = globalThis as unknown as { Response: new (body: Uint8Array | string | null, init: Init) => never }
    const over = (body: Uint8Array | string | null, headers: Record<string, string>) => createFetchTransport({ baseUrl: "https://api.example.com", fetch: async () => new Response(body, { status: 200, headers }) })
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80])
    const file = await over(pdf, { "content-type": "application/pdf", "content-disposition": 'attachment; filename="r.pdf"' }).request({ method: "GET", path: "/orders/1/receipt" })
    expect(file.body).toEqual({ name: "r.pdf", type: "application/pdf", dataUrl: "data:application/pdf;base64,JVBERgD/gA==", size: 7 })
    expect((await over('{"a":1}', { "content-type": "application/json" }).request({ method: "GET", path: "/a" })).body).toEqual({ a: 1 })
    expect((await over("id,name", { "content-type": "text/csv" }).request({ method: "GET", path: "/a.csv" })).body).toBe("id,name")
    expect((await over(null, { "content-type": "application/pdf" }).request({ method: "HEAD", path: "/r" })).body).toBeUndefined()
  })

  it("connects to every realtime channel of the contract over a socket, and hands on the server's messages by name", () => {
    for (const c of CHANNELS) {
      const opened: string[] = []
      let text: (t: string) => void = () => {}
      const t = withRealtime(answering(200, null).transport, {
        url: "wss://rt.example.com/realtime",
        channels: CHANNELS,
        open: (url) => (opened.push(url), { send: () => {}, close: () => {}, onOpen: () => {}, onText: (fn) => void (text = fn), onClose: () => {} }),
      })
      const got: string[] = []
      if (c.transport === "sse") continue
      t.connect!(c.address.replace(/\\{[^{}]+\\}/g, "1"), (m) => got.push(m.message), { token: "t" })
      expect(opened[0]).toBe(\`wss://rt.example.com/realtime\${c.address.replace(/\\{[^{}]+\\}/g, "1")}?access_token=t\`)
      for (const m of c.messages) {
        const payload = Object.fromEntries([...(m.required ?? []).map((k) => [k, "x"]), ...Object.entries(m.fixed ?? {})])
        if (messageOf(c, payload) !== m.name) continue
        text(JSON.stringify(payload))
        expect(got.at(-1)).toBe(m.name)
      }
    }
  })
})
`;

const TSCONFIG = jsonFile({
  extends: "../../tsconfig.base.json",
  compilerOptions: { lib: ["ES2022"], types: [], verbatimModuleSyntax: true },
  include: ["src"],
  exclude: ["src/**/*.test.ts"],
});

/* the tests see what the code sees, and vitest */
const TSCONFIG_TEST = jsonFile({ extends: "./tsconfig.json", include: ["src"], exclude: [] });

export const apiTarget: ProductTarget = {
  id: "api",
  async build(ctx: ProductContext): Promise<Workspace> {
    const api = ctx.api;
    const asyncapi = api.asyncapi ?? { asyncapi: "3.0.0", info: { title: ctx.title, version: "0.1.0" }, channels: {} };
    return {
      dir: "packages/api",
      pkg: `${ctx.scope}/api`,
      scripts: { typecheck: true, test: true },
      summary: { zh: "接口契约（OpenAPI、AsyncAPI）、类型和与平台无关的客户端", en: "the contract (OpenAPI, AsyncAPI), its types and the platform-neutral client" },
      files: {
        "package.json": {
          ...generated(
            jsonFile({
              name: `${ctx.scope}/api`,
              version: "0.1.0",
              private: true,
              type: "module",
              exports: { ".": "./src/index.ts", "./openapi.yaml": "./openapi.yaml", "./asyncapi.yaml": "./asyncapi.yaml" },
              scripts: { typecheck: "tsc --noEmit -p . && tsc --noEmit -p tsconfig.test.json", test: "vitest run" },
              devDependencies: { typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
            }),
          ),
          merge: "package.json",
        },
        "tsconfig.json": generated(TSCONFIG),
        "tsconfig.test.json": generated(TSCONFIG_TEST),
        "openapi.yaml": generated(toYaml(api.openapi)),
        "asyncapi.yaml": generated(toYaml(asyncapi)),
        "src/index.ts": generated(INDEX),
        ...Object.fromEntries(await Promise.all(Object.entries(COPIED).map(async ([at, from]) => [at, generated(await copiedFile(ctx, from))] as const))),
        /* how every transport reads an answer: the editor's own lib/api/body.ts, as it is */
        "src/body.ts": generated(await ctx.read(BODY_SOURCE)),
        "src/generated/types.ts": generated(`${GENERATED}\n${api.types.trim() ? `${api.types.trim()}\n` : "/* the contract has no schemas yet */\nexport {}\n"}`),
        "src/generated/operations.ts": generated(operationsSource(api)),
        "src/generated/channels.ts": generated(channelsSource(ctx.doc.api)),
        "src/generated/contract.ts": generated(`${GENERATED}\n/** the OpenAPI 3.1 document of the API, as data (openapi.yaml is the same) */\nexport const CONTRACT: Record<string, unknown> = ${jsonCode(api.openapi)}\n\n/** the AsyncAPI 3.0 document of its realtime channels (asyncapi.yaml is the same) */\nexport const ASYNC_CONTRACT: Record<string, unknown> = ${jsonCode(asyncapi)}\n`),
        "src/generated/client.test.ts": generated(CLIENT_TEST),
      },
    };
  },
};
