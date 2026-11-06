import { readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import type { Doc } from "../../tokens";
import { buildProduct } from "../product";
import { shopProductDoc } from "../product.fixture";
import { contractTestsTarget } from "../targets/contractTests";
import { serverTarget } from "../targets/server";
import type { Product } from "../types";
import { commentLines, commentText } from "./comments";
import { routeOf, serverContract } from "./contract";
import { Examples } from "./examples";
import { DEFINITIONS_ID, ValidatorSchemas } from "./schemas";
import type { JsonSchema } from "../../api/types";
import { apiModelOf } from "../api";

/* The back end's skeleton (lib/export/targets/server.ts) and its contract tests (targets/contractTests.ts) as text: a
 * small contract's generated files are kept as snapshots (__snapshots__/small), every file of the shop's parses, and
 * the pieces that read the contract (routes, the server's own paths, examples, the validator's schemas, comments) are
 * checked one by one. scripts/check-product.ts installs, builds and runs them for real. */

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
const bare: Doc = { groups: [], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "Small", brief: "" };

const json = (schema: unknown, example?: unknown) => ({ content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const problem = { description: "Error", content: { "application/problem+json": { schema: ref("Problem") } } };
const itemId = { name: "itemId", in: "path", required: true, schema: { type: "string", format: "uuid" } };

/** a contract with one of everything the server generates for */
export const SMALL_OPENAPI: Record<string, unknown> = {
  openapi: "3.1.0",
  info: { title: "Small", version: "1.0.0" },
  servers: [{ url: "http://localhost:8080", "x-m3e-env": "dev", "x-m3e-realtime": "ws://localhost:8080/live" }],
  security: [{ bearer: [] }],
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        summary: "The items, newest first",
        security: [],
        "x-m3e-pagination": { style: "cursor", items: "items" },
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
        ],
        responses: { "200": { description: "A page", ...json(ref("ItemPage")) }, default: problem },
      },
      post: { operationId: "createItem", requestBody: { required: true, ...json(ref("NewItem")) }, responses: { "201": { description: "Made", ...json(ref("Item")) }, "422": problem, default: problem } },
    },
    "/items/{itemId}": {
      get: { operationId: "getItem", security: [], parameters: [itemId], responses: { "200": { description: "The item", ...json(ref("Item")) }, "404": problem } },
      delete: { operationId: "deleteItem", parameters: [itemId], responses: { "204": { description: "Gone" } } },
    },
    "/items/{itemId}/photo": {
      post: {
        operationId: "uploadPhoto",
        parameters: [itemId],
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { type: "object", properties: { photo: { type: "string", format: "binary" }, caption: { type: "string" } }, required: ["photo"] }, encoding: { photo: { contentType: "image/png" } } } },
        },
        responses: { "201": { description: "Stored", ...json({ type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"] }) } },
      },
    },
    "/items/{itemId}/sheet": {
      get: { operationId: "downloadSheet", security: [], parameters: [itemId], responses: { "200": { description: "The item as a PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } } } },
    },
  },
  components: {
    schemas: {
      NewItem: { type: "object", properties: { name: { type: "string", minLength: 1, examples: ["Lamp"] }, price: { type: "number", exclusiveMinimum: 0 } }, required: ["name", "price"] },
      Item: { allOf: [ref("NewItem"), { type: "object", properties: { id: { type: "string", format: "uuid", readOnly: true } }, required: ["id"] }] },
      ItemPage: { type: "object", properties: { items: { type: "array", items: ref("Item") }, nextCursor: { type: ["string", "null"] } }, required: ["items", "nextCursor"] },
      Problem: { type: "object", properties: { title: { type: "string" }, status: { type: "integer" }, errors: { type: "array", items: { type: "object", properties: { pointer: { type: "string" }, detail: { type: "string" } } } } }, required: ["title", "status"] },
    },
    securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
  },
};

export const SMALL_ASYNCAPI: Record<string, unknown> = {
  asyncapi: "3.0.0",
  info: { title: "Small realtime", version: "1.0.0" },
  channels: {
    updates: { address: "/items/{itemId}/updates", messages: { changed: { payload: ref("Item") }, ping: { payload: { type: "object", properties: { at: { type: "string" } }, required: ["at"] } } } },
    feed: { address: "/feed", "x-m3e-transport": "sse", messages: { changed: { payload: ref("Item") } } },
  },
  operations: {
    onChanged: { action: "send", channel: { $ref: "#/channels/updates" }, messages: [{ $ref: "#/channels/updates/messages/changed" }] },
    sendPing: { action: "receive", channel: { $ref: "#/channels/updates" }, messages: [{ $ref: "#/channels/updates/messages/ping" }] },
    onFeed: { action: "send", channel: { $ref: "#/channels/feed" } },
  },
  components: { schemas: SMALL_OPENAPI.components && (SMALL_OPENAPI.components as { schemas: unknown }).schemas },
};

let small: Product;
let shop: Product;
beforeAll(async () => {
  small = await buildProduct(bare, {}, { read: fromDisk, lang: "en", api: { openapi: SMALL_OPENAPI, asyncapi: SMALL_ASYNCAPI, types: "" }, targets: [serverTarget, contractTestsTarget] });
  const { doc, widths } = shopProductDoc();
  shop = await buildProduct(doc, widths, { read: fromDisk, lang: "en", targets: [serverTarget, contractTestsTarget] });
}, 60_000);

const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

describe("the server of a small contract", () => {
  /* the files that change with the contract; the runtime beside them (lib/export/server/runtime.ts) is the same for all */
  const SNAPSHOTS = [
    "server/src/generated/types.ts",
    "server/src/generated/handlers.ts",
    "server/src/generated/operations.ts",
    "server/src/generated/channels.ts",
    "server/src/handlers/listItems.ts",
    "server/src/handlers/createItem.ts",
    "server/src/handlers/uploadPhoto.ts",
    "server/src/handlers/downloadSheet.ts",
    "server/src/handlers/channels/updates.ts",
    "server/src/custom/auth.ts",
    "contract-tests/src/generated/cases.ts",
  ];
  it.each(SNAPSHOTS)("writes %s as it did", async (path) => {
    await expect(text(small, path)).toMatchFileSnapshot(`./__snapshots__/small/${path}.txt`);
  });

  it("has a handler stub per operation and per channel, seeded, and the rest generated", () => {
    const seeded = Object.entries(small.files)
      .filter(([, f]) => f.kind === "seeded")
      .map(([p]) => p)
      .sort();
    expect(seeded).toEqual([
      "CLAUDE.md",
      "server/src/custom/auth.ts",
      "server/src/custom/db.ts",
      "server/src/custom/setup.ts",
      "server/src/handlers/channels/feed.ts",
      "server/src/handlers/channels/updates.ts",
      "server/src/handlers/createItem.ts",
      "server/src/handlers/deleteItem.ts",
      "server/src/handlers/downloadSheet.ts",
      "server/src/handlers/getItem.ts",
      "server/src/handlers/listItems.ts",
      "server/src/handlers/uploadPhoto.ts",
    ]);
    for (const [path, f] of Object.entries(small.files)) if (path.startsWith("server/src/generated/") || path.startsWith("contract-tests/")) expect(f.kind, path).toBe("generated");
  });

  it("types each operation from the contract: its body, answers, user and page", () => {
    const types = text(small, "server/src/generated/types.ts");
    expect(types).toContain("export type Item = NewItem & {");
    expect(types).toMatch(/createItem: \{[\s\S]*?body: NewItem\n[\s\S]*?responses: \{ 201: Item; 422: Problem; "default": Problem \}\n\s+result: Item\n\s+secured: true/);
    expect(types).toMatch(/listItems: \{[\s\S]*?query: \{ "cursor"\?: string; "limit": number \}[\s\S]*?secured: false\n\s+page: CursorPage\n\s+paginate: \(all: readonly Item\[\]\) => \{ "items": Item\[\]; "nextCursor": string \| null \}/);
    expect(types).toMatch(/uploadPhoto: \{[\s\S]*?photo: UploadedFile;/);
    expect(types).toMatch(/downloadSheet: \{[\s\S]*?result: FileReply/);
    expect(types).toMatch(/deleteItem: \{[\s\S]*?result: void/);
    expect(types).toMatch(/updates: \{\n\s+params: \{ "itemId": string \}\n\s+send: \{ "changed": Item \}\n\s+receive: \{ "ping": \{/);
  });

  it("serves the realtime channels under the path of the contract's realtime server, and its own routes apart", () => {
    const contract = text(small, "server/src/generated/contract.ts");
    expect(contract).toContain('export const REALTIME_PREFIX = "/live"');
    expect(contract).toContain('export const HEALTH_PATH = "/health"');
    expect(contract).toContain('export const DOCS_PATH = "/docs"');
  });

  it("depends on what it imports, pinned", () => {
    const pkg = JSON.parse(text(small, "server/package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@fastify/cors", "@fastify/multipart", "@fastify/swagger", "@fastify/swagger-ui", "@fastify/websocket", "ajv", "ajv-formats", "fastify"]);
    for (const v of [...Object.values(pkg.dependencies), ...Object.values(pkg.devDependencies)]) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    const imported = new Set<string>();
    for (const [path, f] of Object.entries(small.files))
      if (path.startsWith("server/") && /\.(ts|mjs)$/.test(path)) for (const m of (f.body as string).matchAll(/^import .* from "([^."][^"]*)"/gm)) imported.add(m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0]);
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of imported) if (!name.startsWith("node:")) expect(name in declared || `@types/${name}` in declared, name).toBe(true);
  });

  it("writes the server's section of AGENTS.md", async () => {
    const full = await buildProduct(bare, {}, { read: fromDisk, lang: "en", api: { openapi: SMALL_OPENAPI, asyncapi: SMALL_ASYNCAPI, types: "" } });
    const agents = text(full, "AGENTS.md");
    expect(agents).toContain("## The server (server/)");
    expect(agents).toContain("npm run contract -w contract-tests -- --strict");
    expect(agents).toContain("### When the contract is wrong");
  }, 60_000);
});

describe("every file the server and the contract tests are", () => {
  it.each(["small", "shop"])("parses as TypeScript: %s", (which) => {
    const p = which === "small" ? small : shop;
    for (const [path, f] of Object.entries(p.files)) {
      if (!/\.(ts|mjs)$/.test(path)) continue;
      expect(() => parse(f.body as string, { sourceType: "module", plugins: ["typescript"] }), path).not.toThrow();
    }
  });

  it("has a stub for every operation of the shop, each answering 501", () => {
    for (const op of ["login", "refreshToken", "logout", "listProducts", "createProduct", "getProduct", "updateProduct", "deleteProduct", "uploadProductImage", "listOrders", "getMe"])
      expect(text(shop, `server/src/handlers/${op}.ts`)).toContain(`throw notImplemented("${op}")`);
    for (const ch of ["room", "presence"]) expect(text(shop, `server/src/handlers/channels/${ch}.ts`)).toContain(`throw notImplemented("${ch}")`);
  });
});

describe("the contract as the server reads it", () => {
  it("writes a contract path as a Fastify route, or none when Fastify cannot route it", () => {
    expect(routeOf("/a/{id}/b")).toEqual({ url: "/a/:id/b", params: [{ name: "id", key: "id" }] });
    expect(routeOf("/files/{name}.{ext}")).toEqual({ url: "/files/:name.:ext", params: [{ name: "name", key: "name" }, { name: "ext", key: "ext" }] });
    expect(routeOf("/a:b/{x}")?.url).toBe("/a::b/:x");
    expect(routeOf("/a/{user-id}/{user_id}")).toEqual({ url: "/a/:user_id/:user_id_2", params: [{ name: "user-id", key: "user_id" }, { name: "user_id", key: "user_id_2" }] });
    expect(routeOf("/a/*")).toBeNull();
    expect(routeOf("/a/{id}x")).toBeNull();
  });

  it("keeps the server's own routes and the operations apart", () => {
    const openapi = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: { "/health": { get: { responses: { "200": { description: "ok" } } } }, "/docs/{page}": { get: { responses: { "200": { description: "ok" } } } } } };
    const c = serverContract(apiModelOf("t", { openapi }));
    expect([c.healthPath, c.docsPath]).toEqual(["/healthz", "/_docs"]);
    expect(c.realtimePrefix).toBe("/realtime");
  });

  it("leaves out a second operation on the same route, and says so", () => {
    const openapi = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: { "/a/{x}": { get: { operationId: "one", responses: {} } }, "/a/{y}": { get: { operationId: "two", responses: {} } } } };
    const c = serverContract(apiModelOf("t", { openapi }));
    expect(c.operations.map((s) => s.url)).toEqual(["/a/:x", null]);
    expect(c.warnings.join("\n")).toContain("the same route");
  });

  it("reads who may call each operation: its own security, else the contract's", () => {
    const c = serverContract(apiModelOf("t", { openapi: SMALL_OPENAPI }));
    const security = Object.fromEntries(c.operations.map((s) => [s.op.name, s.security]));
    expect(security.listItems).toEqual([]);
    expect(security.createItem).toEqual([{ bearer: [] }]);
  });
});

describe("example values", () => {
  const ex = new Examples({ models: [{ name: "Node", schema: { type: "object", properties: { name: { type: "string" }, next: ref("Node") }, required: ["name", "next"] } }] });

  it("take the contract's own first, else come from the mock library's generator within the schema's bounds", () => {
    expect(ex.of({ type: "string", examples: ["given"] })).toBe("given");
    expect(["a", "b"]).toContain(ex.of({ type: "string", enum: ["a", "b"] }));
    expect(ex.of({ type: "string", minLength: 10 })).toMatch(/^.{10,}$/);
    expect(String(ex.of({ type: "string", maxLength: 3 })).length).toBeLessThanOrEqual(3);
    expect(ex.of({ type: "string", format: "uuid" })).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ex.of({ type: "integer", minimum: 5 })).toBeGreaterThanOrEqual(5);
    expect(ex.of({ type: "number", exclusiveMinimum: 0 })).toBeGreaterThan(0);
    expect(ex.of({ type: "integer", maximum: 0 })).toBeLessThanOrEqual(0);
    expect(ex.of({ type: "string", format: "email" })).toMatch(/@example\.(com|net|org)$/);
    /* only what is required, and what has an example of its own */
    const o = ex.of({ type: "object", properties: { a: { type: "string" }, b: { type: "integer", default: 3 }, c: { type: "string" } }, required: ["a"] }) as Record<string, unknown>;
    expect(Object.keys(o).sort()).toEqual(["a", "b"]);
    expect(o.b).toBe(3);
    expect(ex.of({ type: "object", properties: { id: { type: "string", readOnly: true }, n: { type: "string" } }, required: ["id", "n"] })).toEqual({ n: expect.any(String) });
    /* the same schema, the same value */
    expect(ex.of({ type: "string", format: "date-time" })).toBe(ex.of({ type: "string", format: "date-time" }));
  });

  it("end on a model that refers to itself", () => {
    const depth = (v: unknown, d = 0): number => (v && typeof v === "object" ? Math.max(d, ...Object.values(v).map((x) => depth(x, d + 1))) : d);
    const v = ex.of(ref("Node")) as { name: unknown };
    expect(typeof v.name).toBe("string");
    expect(depth(v)).toBeLessThan(6);
  });
});

describe("the schemas the validator checks against", () => {
  const spec = serverContract(apiModelOf("t", { openapi: SMALL_OPENAPI })).spec;

  it("point model references into the definitions of their view, and drop what leads nowhere", () => {
    const s = new ValidatorSchemas(spec);
    expect(s.schema(ref("Item"), "request")).toEqual({ $ref: `${DEFINITIONS_ID.request}#/$defs/Item` });
    expect(s.schema({ type: "object", properties: { a: ref("Nowhere"), b: { $ref: "other.yaml#/X" } } }, "response")).toEqual({ type: "object", properties: { a: {}, b: {} } });
    expect(s.schema({ type: "string", pattern: "([" }, "request")).toEqual({ type: "string" });
    expect(s.dropped).toEqual(["#/components/schemas/Nowhere", "other.yaml#/X", 'pattern "(["']);
  });

  it("do not ask the app for what is read-only, nor the server for what is write-only", () => {
    const s = new ValidatorSchemas(spec);
    const schema: JsonSchema = { type: "object", properties: { id: { type: "string", readOnly: true }, secret: { type: "string", writeOnly: true } }, required: ["id", "secret"] };
    expect(s.schema(schema, "request")).toMatchObject({ required: ["secret"] });
    expect(s.schema(schema, "response")).toMatchObject({ required: ["id"] });
  });

  it("name the formats the validator does not know, to accept them", () => {
    const s = new ValidatorSchemas(spec);
    s.schema({ type: "object", properties: { p: { type: "string", format: "phone" }, e: { type: "string", format: "email" } } }, "request");
    expect(s.unknownFormats()).toEqual(["phone"]);
  });
});

describe("words of the contract in comments", () => {
  it("are one line, without the characters that end a line comment or turn its text around", () => {
    expect(commentText("a\nb\r\nc\u2028d\u2029e")).toBe("a b c d e");
    expect(commentText("left\u202eright\u2066x\u2069")).toBe("left right x");
    expect(commentText("x".repeat(300), 10)).toHaveLength(10);
    expect(commentLines(["one", "", "two\nthree"])).toBe("// one\n//\n// two three");
  });
});
