/* The operations on the API section, headless: each does what it says, keeps the contract valid (paths and their
 * parameters in step, the problem response, paging parameters), refuses what would add an error with words a model can
 * act on, and is one undo step. Through the tool registry too: the read tools, and the removals the agent's guard and
 * the MCP confirmation ask about. */

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { apiProblems, type ApiEndpoint, type JsonSchemaObject } from "../api";
import { CORE_REGISTRY, executeTool, isDestructiveCall } from "../tools";
import { takesOf } from "../tools/removals";
import { guessMeasurer, OpError } from "./op";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

const store = () => new DocStore(stateOf({ groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const ai = { origin: "ai" as const };
const fails = (fn: () => unknown, code: string, words?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).code).toBe(code);
    if (words) expect((e as OpError).message).toMatch(words);
    return;
  }
  throw new Error("did not throw");
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const endpoint = (s: DocStore, id: string) => s.get().doc.api!.endpoints!.find((e) => e.operationId === id)!;
const product: JsonSchemaObject = { type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, price: { type: "number" } }, required: ["id", "name"] };

describe("models", () => {
  it("adds, changes, renames and removes a model, references following", () => {
    const s = store();
    s.run(ops.addModel, { name: "Product", schema: product }, ai);
    s.run(ops.addModel, { name: "Cart", schema: { type: "object", properties: { items: { type: "array", items: ref("Product") } } } }, ai);
    s.run(ops.addCollection, { id: "rows", fields: ["name"], rows: [["Sneaker"]], model: "Product" }, ai);
    s.run(ops.updateModel, { name: "Product", properties: { price: null, stock: { type: "integer", minimum: 0 } }, required: ["id", "name", "stock"], description: "A thing for sale" }, ai);
    expect(s.get().doc.api!.models![0].schema).toEqual({ type: "object", properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, stock: { type: "integer", minimum: 0 } }, required: ["id", "name", "stock"], description: "A thing for sale" });
    fails(() => s.run(ops.updateModel, { name: "Product", description: "A thing for sale" }, ai), "nothing_to_do");
    const out = s.run(ops.renameModel, { name: "Product", to: "Item" }, ai);
    expect(out.uses).toEqual(["model Cart"]);
    expect(s.get().doc.api!.models![1].schema).toEqual({ type: "object", properties: { items: { type: "array", items: ref("Item") } } });
    expect(s.get().doc.collections![0].model).toBe("Item");
    fails(() => s.run(ops.removeModel, { name: "Item" }, ai), "invalid_value", /used by model Cart: change those first, or give force: true/);
    s.run(ops.removeModel, { name: "Item", force: true }, ai);
    expect(s.get().doc.api!.models!.map((m) => m.name)).toEqual(["Cart"]);
    expect(s.get().doc.api!.models![0].schema).toEqual({ type: "object", properties: { items: { type: "array", items: {} } } });
    expect(s.get().doc.collections![0].model).toBeUndefined();
  });

  it("refuses a name that is no identifier, one taken, a reference to nothing, and a bad keyword", () => {
    const s = store();
    fails(() => s.run(ops.addModel, { name: "order item" }, ai), "invalid_value", /identifier/);
    s.run(ops.addModel, { name: "Order" }, ai);
    fails(() => s.run(ops.addModel, { name: "Order" }, ai), "invalid_value", /already: update_model changes it/);
    fails(() => s.run(ops.addModel, { name: "Line", schema: { type: "object", properties: { order: ref("Ordr") } } }, ai), "invalid_value", /there is no model "Ordr"/);
    fails(() => s.run(ops.updateModel, { name: "Order", properties: { total: { type: "money" } as never } }, ai), "invalid_value", /type should be one of/);
    fails(() => s.run(ops.renameModel, { name: "Nope", to: "X" }, ai), "not_found", /The models are: Order/);
    fails(() => s.run(ops.addCollection, { fields: ["a"], model: "Nope" }, ai), "not_found", /no model "Nope"/);
  });
});

describe("endpoints", () => {
  it("adds a REST endpoint as a valid operation: path parameters, the problem response and its model", () => {
    const s = store();
    s.run(ops.addModel, { name: "Product", schema: product }, ai);
    const out = s.run(ops.addEndpoint, { operationId: "getProduct", method: "get", path: "/products/{productId}", returns: ref("Product"), tags: ["Products"] }, ai);
    expect(out).toEqual({ operationId: "getProduct", parameters: ["path:productId"], responses: ["200", "default"] });
    const e = endpoint(s, "getProduct");
    expect(e).toEqual({
      operationId: "getProduct",
      method: "get",
      path: "/products/{productId}",
      tags: ["Products"],
      parameters: [{ name: "productId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: ref("Product") } } },
        default: { description: "Error", content: { "application/problem+json": { schema: ref("Problem") } } },
      },
    } satisfies ApiEndpoint);
    expect(s.get().doc.api!.models!.map((m) => m.name)).toEqual(["Product", "Problem"]);
    expect(apiProblems(s.get().doc.api)).toEqual([]);
  });

  it("makes a create, an upload and a paged list from the shortcuts", () => {
    const s = store();
    s.run(ops.addModel, { name: "Product", schema: product }, ai);
    s.run(ops.addEndpoint, { operationId: "createProduct", method: "post", path: "/products", body: ref("Product"), returns: ref("Product"), problem: false }, ai);
    expect(endpoint(s, "createProduct").requestBody).toEqual({ required: true, content: { "application/json": { schema: ref("Product") } } });
    expect(Object.keys(endpoint(s, "createProduct").responses)).toEqual(["201"]);
    s.run(ops.addEndpoint, { operationId: "uploadImage", method: "post", path: "/products/{id}/images", contentType: "multipart/form-data", body: { type: "object", properties: { file: { type: "string", format: "binary" } }, required: ["file"] } }, ai);
    expect(endpoint(s, "uploadImage").requestBody).toMatchObject({ content: { "multipart/form-data": { schema: { properties: { file: { format: "binary" } } } } } });
    expect(Object.keys(endpoint(s, "uploadImage").responses)).toEqual(["201", "default"]);
    s.run(ops.addEndpoint, { operationId: "listProducts", method: "get", path: "/products", security: [], pagination: { style: "cursor", items: "items" }, returns: { type: "object", properties: { items: { type: "array", items: ref("Product") }, nextCursor: { type: ["string", "null"] } } } }, ai);
    const list = endpoint(s, "listProducts");
    expect(list.parameters!.map((p) => ("name" in p ? `${p.in}:${p.name}` : ""))).toEqual(["query:cursor", "query:limit"]);
    expect(list.security).toEqual([]);
    s.run(ops.addEndpoint, { operationId: "deleteProduct", method: "delete", path: "/products/{id}" }, ai);
    expect(Object.keys(endpoint(s, "deleteProduct").responses)).toEqual(["204", "default"]);
    expect(apiProblems(s.get().doc.api).filter((p) => p.level === "error")).toEqual([]);
  });

  it("keeps the path parameters in step when the path changes, and renames with the auth following", () => {
    const s = store();
    s.run(ops.addEndpoint, { operationId: "signIn", method: "post", path: "/login", security: [] }, ai);
    s.run(ops.addEndpoint, { operationId: "getPost", method: "get", path: "/posts/{id}", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }, { name: "lang", in: "query", schema: { type: "string" } }] }, ai);
    s.run(ops.updateEndpoint, { operationId: "getPost", path: "/users/{userId}/posts/{id}" }, ai);
    expect(endpoint(s, "getPost").parameters).toEqual([{ name: "userId", in: "path", required: true, schema: { type: "string" } }, { name: "id", in: "path", required: true, schema: { type: "integer" } }, { name: "lang", in: "query", schema: { type: "string" } }]);
    s.run(ops.updateEndpoint, { operationId: "getPost", path: "/posts" }, ai);
    expect(endpoint(s, "getPost").parameters).toEqual([{ name: "lang", in: "query", schema: { type: "string" } }]);
    s.run(ops.setAuth, { schemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }, security: [{ bearerAuth: [] }], login: "signIn" }, ai);
    s.run(ops.updateEndpoint, { operationId: "signIn", rename: "login", responses: { "401": { description: "Wrong password" } } }, ai);
    expect(s.get().doc.api!.auth!.login).toBe("login");
    expect(Object.keys(endpoint(s, "login").responses)).toEqual(["201", "401", "default"]);
    s.run(ops.removeEndpoint, { operationId: "login" }, ai);
    expect(s.get().doc.api!.auth!.login).toBeUndefined();
  });

  it("refuses what would make the contract wrong, saying how to fix it", () => {
    const s = store();
    s.run(ops.addEndpoint, { operationId: "getPost", method: "get", path: "/posts/{id}" }, ai);
    fails(() => s.run(ops.addEndpoint, { operationId: "getPost", method: "get", path: "/x" }, ai), "invalid_value", /already: update_endpoint changes it/);
    fails(() => s.run(ops.addEndpoint, { operationId: "get post", method: "get", path: "/x" }, ai), "invalid_value", /cannot be an operationId/);
    fails(() => s.run(ops.addEndpoint, { operationId: "x", method: "get", path: "x" }, ai), "invalid_value", /starts with \//);
    fails(() => s.run(ops.addEndpoint, { operationId: "again", method: "get", path: "/posts/{postId}" }, ai), "invalid_value", /same route as getPost/);
    fails(() => s.run(ops.addEndpoint, { operationId: "x", method: "get", path: "/x/{a", problem: false }, ai), "invalid_value", /unbalanced braces/);
    fails(() => s.run(ops.addEndpoint, { operationId: "x", method: "get", path: "/x", parameters: [{ name: "id", in: "path", required: true }] }, ai), "invalid_value", /has no \{id\}/);
    fails(() => s.run(ops.addEndpoint, { operationId: "x", method: "get", path: "/x", security: [{ jwt: [] }] }, ai), "invalid_value", /names "jwt", which is no security scheme/);
    fails(() => s.run(ops.addEndpoint, { operationId: "x", method: "get", path: "/x", returns: ref("Nope") }, ai), "invalid_value", /there is no model "Nope"/);
    fails(() => s.run(ops.updateEndpoint, { operationId: "nope", summary: "x" }, ai), "not_found", /The endpoints are: getPost/);
    fails(() => s.run(ops.addEndpoint, { operationId: "x", method: "fetch", path: "/x" } as never, ai), "bad_args", /method should be one of/);
  });
});

describe("auth, channels, servers, info", () => {
  it("sets the sign-in and refuses a scheme taken away while it is still named", () => {
    const s = store();
    s.run(ops.addEndpoint, { operationId: "login", method: "post", path: "/auth/login", security: [] }, ai);
    s.run(ops.addEndpoint, { operationId: "refresh", method: "post", path: "/auth/refresh", security: [] }, ai);
    s.run(ops.setAuth, { schemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }, key: { type: "apiKey", in: "header", name: "X-API-Key" } }, security: [{ bearerAuth: [] }], login: "login", refresh: "refresh", tokenField: "token" }, ai);
    expect(s.get().doc.api!.auth).toEqual({ schemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }, key: { type: "apiKey", in: "header", name: "X-API-Key" } }, security: [{ bearerAuth: [] }], login: "login", refresh: "refresh", tokenField: "token" });
    fails(() => s.run(ops.setAuth, { schemes: { bearerAuth: null } }, ai), "invalid_value", /security names "bearerAuth"/);
    fails(() => s.run(ops.setAuth, { login: "nope" }, ai), "invalid_value", /login names the endpoint "nope"/);
    fails(() => s.run(ops.setAuth, { schemes: { o: { type: "oauth2" } } }, ai), "invalid_value", /needs flows/);
    s.run(ops.setAuth, { schemes: { key: null }, refresh: null }, ai);
    expect(Object.keys(s.get().doc.api!.auth!.schemes)).toEqual(["bearerAuth"]);
    expect(s.get().doc.api!.auth!.refresh).toBeUndefined();
  });

  it("adds a WebSocket channel with its parameters, changes and removes it", () => {
    const s = store();
    s.run(ops.addModel, { name: "Message", schema: { type: "object", properties: { text: { type: "string" } } } }, ai);
    s.run(ops.addChannel, { id: "room", address: "/rooms/{roomId}", messages: [{ name: "chatMessage", payload: ref("Message") }], operations: [{ id: "onMessage", action: "send" }, { id: "sendMessage", action: "receive", messages: ["chatMessage"] }] }, ai);
    const c = s.get().doc.api!.channels![0];
    expect(c.parameters).toEqual({ roomId: {} });
    s.run(ops.updateChannel, { id: "room", address: "/rooms/{roomId}/threads/{threadId}", transport: "websocket", summary: "A room" }, ai);
    expect(Object.keys(s.get().doc.api!.channels![0].parameters!)).toEqual(["roomId", "threadId"]);
    fails(() => s.run(ops.updateChannel, { id: "room", operations: [{ id: "x", action: "receive", messages: ["nope"] }] }, ai), "invalid_value", /no message "nope"/);
    fails(() => s.run(ops.addChannel, { id: "room", address: "/r" }, ai), "invalid_value", /already/);
    fails(() => s.run(ops.addChannel, { id: "x", address: "/x", operations: [{ id: "o", action: "publish" } as never] }, ai), "invalid_value", /action: "send" \| "receive"/);
    s.run(ops.removeChannel, { id: "room" }, ai);
    expect(s.get().doc.api!.channels).toBeUndefined();
  });

  it("sets the servers and the info", () => {
    const s = store();
    s.run(ops.setServers, { servers: [{ env: "dev", url: "http://localhost:3000" }, { env: "prod", url: "https://api.example.com/v1", realtime: "wss://rt.example.com" }] }, ai);
    fails(() => s.run(ops.setServers, { servers: [{ env: "dev", url: "x" }, { env: "dev", url: "/" }] }, ai), "invalid_value", /Two servers/);
    fails(() => s.run(ops.setServers, { servers: [{ env: "dev", url: "ftp://x" }] }, ai), "invalid_value", /not a base URL/);
    s.run(ops.setApiInfo, { title: "Shop", version: "1.0.0", tags: [{ name: "Products", description: "The catalog" }] }, ai);
    expect(s.get().doc.api).toMatchObject({ info: { title: "Shop", version: "1.0.0" }, tags: [{ name: "Products", description: "The catalog" }], servers: [{ env: "dev" }, { env: "prod", realtime: "wss://rt.example.com" }] });
    fails(() => s.run(ops.setApiInfo, { title: "Shop" }, ai), "nothing_to_do");
  });
});

describe("importing", () => {
  const SHOP = readFileSync(new URL("../api/fixtures/shop.openapi.yaml", import.meta.url), "utf8");
  const CHAT = readFileSync(new URL("../api/fixtures/chat.asyncapi.yaml", import.meta.url), "utf8");

  it("imports OpenAPI and AsyncAPI beside what is there, reporting what it did", () => {
    const s = store();
    s.run(ops.addModel, { name: "Note", schema: { type: "object" } }, ai);
    const out = s.run(ops.importOpenApi, { text: SHOP }, ai);
    expect(out).toMatchObject({ models: 11, endpoints: 11, channels: 0, problems: [] });
    expect(out.kept.length).toBe(3);
    const rt = s.run(ops.importAsyncApi, { text: CHAT }, ai);
    expect(rt).toMatchObject({ models: 4, channels: 2 });
    const api = s.get().doc.api!;
    expect(api.models!.map((m) => m.name)).toContain("Note");
    expect(api.channels!.length).toBe(2);
    expect(api.servers!.find((x) => x.env === "prod")).toEqual({ env: "prod", url: "https://api.shop.example/v1", description: "Production", realtime: "wss://rt.chat.example/realtime" });
  });

  it("replaces the HTTP half, and says why a file cannot be imported", () => {
    const s = store();
    s.run(ops.addEndpoint, { operationId: "ping", method: "get", path: "/ping" }, ai);
    s.run(ops.importOpenApi, { text: SHOP, mode: "replace" }, ai);
    expect(s.get().doc.api!.endpoints!.some((e) => e.operationId === "ping")).toBe(false);
    fails(() => s.run(ops.importOpenApi, { text: "swagger: '2.0'\n" }, ai), "invalid_value", /Swagger 2.0 is not supported/);
    fails(() => s.run(ops.importAsyncApi, { text: SHOP }, ai), "invalid_value", /OpenAPI document: import it as OpenAPI/);
  });
});

describe("history", () => {
  it("makes every operation one undo step", () => {
    const s = store();
    const before = JSON.stringify(savedDoc(s.get()));
    const calls: [unknown, unknown][] = [
      [ops.addModel, { name: "A" }],
      [ops.updateModel, { name: "A", properties: { x: { type: "string" } } }],
      [ops.renameModel, { name: "A", to: "B" }],
      [ops.addEndpoint, { operationId: "getB", method: "get", path: "/b", returns: ref("B") }],
      [ops.updateEndpoint, { operationId: "getB", summary: "Reads B" }],
      [ops.setAuth, { schemes: { k: { type: "apiKey", in: "header", name: "K" } } }],
      [ops.addChannel, { id: "c", address: "/c", messages: [{ name: "m" }] }],
      [ops.updateChannel, { id: "c", summary: "x" }],
      [ops.setServers, { servers: [{ env: "dev", url: "/" }] }],
      [ops.setApiInfo, { title: "T" }],
      [ops.removeChannel, { id: "c" }],
      [ops.removeEndpoint, { operationId: "getB" }],
      [ops.removeModel, { name: "B", force: true }],
    ];
    const states: string[] = [];
    for (const [o, args] of calls) {
      states.push(JSON.stringify(savedDoc(s.get())));
      const steps = s.history().length;
      s.run(o as never, args as never, ai);
      expect(s.history().length).toBe(steps + 1);
    }
    for (let i = calls.length - 1; i >= 0; i--) {
      s.undo();
      expect(JSON.stringify(savedDoc(s.get()))).toBe(states[i]);
    }
    expect(JSON.stringify(savedDoc(s.get()))).toBe(before);
  });
});

describe("through the tools", () => {
  it("reads the API, an endpoint, a model and the spec files", async () => {
    const s = store();
    await executeTool(s, "apply_ops", { ops: [{ op: "add_model", args: { name: "Product", schema: product } }, { op: "add_endpoint", args: { operationId: "getProduct", method: "get", path: "/products/{id}", returns: ref("Product") } }] }, { origin: "mcp" });
    const outline = await executeTool(s, "get_api", {}, { origin: "mcp" });
    expect(outline.ok && (outline.result as string)).toContain("GET /products/{id} getProduct → 200 Product");
    const e = await executeTool(s, "describe_endpoint", { operationId: "getProduct" }, { origin: "mcp" });
    expect(e.ok && Object.keys((e.result as { models: object }).models)).toEqual(["Product", "Problem"]);
    const m = await executeTool(s, "describe_model", { name: "Product" }, { origin: "mcp" });
    expect(m.ok && (m.result as { usedBy: string[] }).usedBy).toEqual(["endpoint getProduct"]);
    const spec = await executeTool(s, "get_spec", { kind: "openapi" }, { origin: "mcp" });
    expect(spec.ok && (spec.result as string)).toContain("operationId: getProduct");
    const ts = await executeTool(s, "get_spec", { kind: "typescript" }, { origin: "mcp" });
    expect(ts.ok && (ts.result as string)).toContain("export type Product = {");
    const missing = await executeTool(s, "describe_model", { name: "Nope" }, { origin: "mcp" });
    expect(missing).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("marks the removals and tells the guard what an update or a replacing import takes away", async () => {
    expect(["remove_model", "remove_endpoint", "remove_channel"].every((n) => isDestructiveCall(n, {}))).toBe(true);
    expect(CORE_REGISTRY.byName("remove_model")!.destructive).toBe(true);
    const s = store();
    s.run(ops.addModel, { name: "Product", schema: product }, ai);
    s.run(ops.addEndpoint, { operationId: "ping", method: "get", path: "/ping" }, ai);
    s.run(ops.setServers, { servers: [{ env: "dev", url: "/" }] }, ai);
    const registry = CORE_REGISTRY;
    expect(await takesOf(s, "update_model", { name: "Product", properties: { price: null } }, { registry })).toEqual([{ kind: "modelFields", of: "Product", names: ["price"] }]);
    expect(await takesOf(s, "rename_model", { name: "Product", to: "Item" }, { registry })).toEqual([]);
    expect(await takesOf(s, "update_endpoint", { operationId: "ping", rename: "health" }, { registry })).toEqual([]);
    expect(await takesOf(s, "set_servers", { servers: [{ env: "prod", url: "/" }] }, { registry })).toEqual([{ kind: "server", name: "dev" }]);
    const replaced = await takesOf(s, "import_openapi", { text: "openapi: 3.1.0\ninfo: {title: x, version: '1'}\npaths: {}\n", mode: "replace" }, { registry });
    expect(replaced).toEqual([{ kind: "model", name: "Product" }, { kind: "model", name: "Problem" }, { kind: "endpoint", name: "ping (GET /ping)" }]);
  });
});
