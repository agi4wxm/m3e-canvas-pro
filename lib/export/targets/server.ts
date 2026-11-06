/* server: the back end's skeleton, Node + TypeScript on Fastify. The routes, their types and the table of handlers are
 * generated (src/generated/); the back end is written ONLY in src/handlers/ (one file per operation, created once,
 * answering 501 Not Implemented until someone writes it) and src/custom/setup.ts (plugins, hooks, a database).
 *
 * Validation from the contract's schemas is the slot `src/generated/validation.ts` (empty until the API model gives
 * schemas); the routes already pass it to Fastify. */

import type { ApiOperation } from "../api";
import { GENERATED, jsonFile, propKey, str } from "../code";
import { generated, seeded, type ProductContext, type ProductFiles, type ProductTarget, type Workspace } from "../types";

/** the Fastify URL of a contract path: `/a/{id}` is `/a/:id`, a parameter's name kept to letters, digits and `_` */
const fastifyUrl = (path: string) => path.replace(/\{([^{}/]+)\}/g, (_, name: string) => `:${name.replace(/[^A-Za-z0-9_]/g, "_")}`);
/** a URL that reaches the route, for checking it is there */
const sampleUrl = (path: string) => path.replace(/\{[^{}/]+\}/g, "1");

/** the name of an operation's handler type: getProduct is GetProductHandler */
const handlerType = (op: ApiOperation) => `${op.name[0].toUpperCase()}${op.name.slice(1)}Handler`;

function handlersSource(ops: ApiOperation[], scope: string): string {
  const types = [...new Set(ops.flatMap((op) => [op.bodyType, op.responseType]).filter((t) => !["unknown", "void", "never"].includes(t)))].sort();
  return `${GENERATED}
import type { FastifyReply, FastifyRequest } from "fastify"
${types.length ? `import type { ${types.join(", ")} } from ${str(`${scope}/api`)}\n` : ""}${ops.map((op) => `import ${op.name} from "../handlers/${op.name}"`).join("\n")}${ops.length ? "\n" : ""}
/** what a handler is given and gives back: the request with its typed parameters, query and body, and the answer */
export type Handler<Params = Record<string, string>, Query = Record<string, string | string[]>, Body = unknown, Result = unknown> = (
  request: FastifyRequest<{ Params: Params; Querystring: Query; Body: Body }>,
  reply: FastifyReply,
) => Result | Promise<Result>

${ops
  .map(
    (op) =>
      `export type ${handlerType(op)} = Handler<${op.params.length ? `{ ${op.params.map((p) => `${propKey(p.replace(/[^A-Za-z0-9_]/g, "_"))}: string`).join("; ")} }` : "Record<string, never>"}, Record<string, string | string[]>, ${op.body ? op.bodyType : "undefined"}, ${op.responseType}>`,
  )
  .join("\n")}${ops.length ? "\n\n" : ""}/** one handler per operation of the contract, from src/handlers/ */
export type Handlers = {
${ops.map((op) => `  ${op.name}: ${handlerType(op)}`).join("\n")}
}

/** the route types Fastify reads off a handler */
export type RouteOf<H> = H extends Handler<infer Params, infer Query, infer Body, unknown> ? { Params: Params; Querystring: Query; Body: Body } : never

export const handlers: Handlers = {
${ops.map((op) => `  ${op.name},`).join("\n")}
}
`;
}

function routesSource(ops: ApiOperation[]): string {
  return `${GENERATED}
import type { FastifyInstance } from "fastify"
import type { ${["Handlers", ...(ops.length ? ["RouteOf"] : [])].join(", ")} } from "./handlers"
import { VALIDATION } from "./validation"

/** every operation of the contract as Fastify routes it */
export const ROUTES = [
${ops.map((op) => `  { name: ${str(op.name)}, operationId: ${str(op.operationId)}, method: ${str(op.method)}, url: ${str(fastifyUrl(op.path))}, sample: ${str(sampleUrl(op.path))} },`).join("\n")}
] as const

/** Routes every operation to its handler, with what the contract says about its input. */
export function registerRoutes(app: FastifyInstance, handlers: Handlers) {
${ops.map((op) => `  app.route<RouteOf<Handlers[${str(op.name)}]>>({ method: ${str(op.method)}, url: ${str(fastifyUrl(op.path))}, schema: VALIDATION[${str(op.name)}], handler: handlers.${op.name} })`).join("\n")}${ops.length ? "" : "  void app\n  void handlers"}
}
`;
}

const VALIDATION = (ops: ApiOperation[]) => `${GENERATED}
import type { FastifySchema } from "fastify"

/** the JSON Schemas Fastify checks each operation's parameters, query and body against (from the contract's schemas) */
export const VALIDATION: Record<string, FastifySchema | undefined> = {
${ops.map((op) => `  ${propKey(op.name)}: undefined,`).join("\n")}
}
`;

const ERRORS = `${GENERATED}
/** the error a handler not written yet throws: Fastify answers it with 501 Not Implemented */
export function notImplemented(operationId: string): Error & { statusCode: number } {
  return Object.assign(new Error(\`\${operationId} is not implemented yet: write it in server/src/handlers\`), { statusCode: 501 })
}
`;

const APP = `${GENERATED}
import Fastify, { type FastifyServerOptions } from "fastify"
import { setup } from "./custom/setup"
import { handlers } from "./generated/handlers"
import { registerRoutes } from "./generated/routes"

/** the server, ready to listen: the custom setup first (plugins, hooks), then every route of the contract */
export async function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options)
  await setup(app)
  registerRoutes(app, handlers)
  return app
}
`;

const MAIN = `${GENERATED}
import { buildApp } from "./app"

const port = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? "127.0.0.1"

const app = await buildApp({ logger: true })
await app.listen({ port, host })
`;

const BUILD = (scope: string) => `${GENERATED}
// Bundles the server into dist/main.js: its own code and the workspace packages it imports; the npm packages it
// depends on stay imports, installed beside it.
import { readFileSync } from "node:fs"
import { build } from "esbuild"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
const external = Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies }).filter((name) => !name.startsWith(${str(`${scope}/`)}))

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  outfile: "dist/main.js",
  external,
  logLevel: "warning",
})
`;

const ROUTES_TEST = `${GENERATED}
import { describe, expect, it } from "vitest"
import { buildApp } from "../app"
import { ROUTES } from "./routes"

describe("the server", () => {
  it("routes every operation of the contract", async () => {
    const app = await buildApp()
    await app.ready()
    for (const route of ROUTES) expect(app.hasRoute({ method: route.method, url: route.url }), \`\${route.method} \${route.url}\`).toBe(true)
    await app.close()
  })

  it("answers what the contract does not have with 404", async () => {
    const app = await buildApp()
    const response = await app.inject({ method: "GET", url: "/no-such-route-in-the-contract" })
    expect(response.statusCode).toBe(404)
    await app.close()
  })
})
`;

/** a handler not written yet: it answers 501 */
const STUB = (op: ApiOperation) => `import { notImplemented } from "../generated/errors";
import type { ${handlerType(op)} } from "../generated/handlers";

/*
 * Custom code (written by people or AI): what the API does for this
 * operation. The export created this file once and never changes it again.
 * Until it is written, the operation answers 501 Not Implemented.
 */
const ${op.name}: ${handlerType(op)} = async () => {
  throw notImplemented(${str(op.name)});
};

export default ${op.name};
`;

const SETUP = `import type { FastifyInstance } from "fastify";

/*
 * Custom code (written by people or AI). The export created this file once and
 * never changes it again. setup() runs before the routes are added: register
 * plugins (CORS, auth, a database), hooks and routes the contract does not have.
 */
export async function setup(app: FastifyInstance): Promise<void> {
  void app;
}
`;

const TSCONFIG = jsonFile({ extends: "../tsconfig.base.json", compilerOptions: { lib: ["ES2022"], types: ["node"], verbatimModuleSyntax: true }, include: ["src"] });

export const serverTarget: ProductTarget = {
  id: "server",
  build(ctx: ProductContext): Workspace {
    const ops = ctx.api.operations;
    const files: ProductFiles = {
      "package.json": {
        ...generated(
          jsonFile({
            name: `${ctx.scope}/server`,
            version: "0.1.0",
            private: true,
            type: "module",
            exports: { ".": "./src/app.ts" },
            scripts: { dev: "tsx watch src/main.ts", build: "node build.mjs", start: "node dist/main.js", typecheck: "tsc --noEmit -p .", test: "vitest run" },
            dependencies: { [`${ctx.scope}/api`]: "0.1.0", fastify: ctx.version("fastify") },
            devDependencies: { "@types/node": ctx.version("@types/node"), esbuild: ctx.version("esbuild"), tsx: ctx.version("tsx"), typescript: ctx.version("typescript"), vitest: ctx.version("vitest") },
          }),
        ),
        merge: "package.json",
      },
      "tsconfig.json": generated(TSCONFIG),
      "build.mjs": generated(BUILD(ctx.scope)),
      "src/main.ts": generated(MAIN),
      "src/app.ts": generated(APP),
      "src/generated/routes.ts": generated(routesSource(ops)),
      "src/generated/handlers.ts": generated(handlersSource(ops, ctx.scope)),
      "src/generated/validation.ts": generated(VALIDATION(ops)),
      "src/generated/errors.ts": generated(ERRORS),
      "src/generated/routes.test.ts": generated(ROUTES_TEST),
      "src/custom/setup.ts": seeded(SETUP),
    };
    for (const op of ops) files[`src/handlers/${op.name}.ts`] = seeded(STUB(op));
    return { dir: "server", pkg: `${ctx.scope}/server`, scripts: { dev: true, build: true, typecheck: true, test: true }, files, summary: { zh: "后端骨架（Node + Fastify）：只在 src/handlers 和 src/custom 写代码", en: "the back end's skeleton (Node + Fastify): code goes only in src/handlers and src/custom" } };
  },
};
