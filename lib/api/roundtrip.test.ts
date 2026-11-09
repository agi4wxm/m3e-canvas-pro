/* The spec files, both ways, on realistic fixtures: a shop (sign-in three ways, cursor and offset paging, an image
 * upload, problem+json errors, reusable responses and parameters, a webhook) and a chat (a WebSocket room whose
 * messages are defined in components, a presence feed, and the HTTP half sharing its models). What the model supports
 * comes back the same; what it does not is kept and written back; the project file holds it byte for byte. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiImportError, asyncApiObject, fromAsyncApi, fromOpenApi, mergeApi, openApiObject, parseYaml, toAsyncApi, toOpenApi, type ApiSpec } from ".";
import { parseProject, serializeProject } from "../core/projectFile";
import type { Doc } from "../tokens";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const SHOP = fixture("shop.openapi.yaml");
const CHAT = fixture("chat.asyncapi.yaml");
const CHAT_HTTP = fixture("chat.openapi.yaml");
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

type Rec = Record<string, unknown>;

describe("OpenAPI", () => {
  const read = fromOpenApi(SHOP);

  it("reads the shop: models, endpoints, auth, paging, servers, and says what it did", () => {
    const { api, report } = read;
    expect(report).toMatchObject({ format: "openapi", version: "3.1.0", models: 11, endpoints: 11, dropped: [], problems: [] });
    expect(report.converted).toEqual(["the parameters of the path /products/{productId} are listed on each of its operations"]);
    expect(report.kept).toEqual(["the path item fields of /products/{productId} (summary)", "the reusable responses, parameters of components (endpoints may refer to them)", "webhooks, x-logo, externalDocs"]);
    expect(api.servers!.map((s) => `${s.env} ${s.url}`)).toEqual(["dev http://localhost:8080/v1", "staging https://staging.shop.example/v1", "prod https://api.shop.example/v1"]);
    expect(api.auth).toMatchObject({ security: [{ bearerAuth: [] }], login: "login", refresh: "refreshToken", logout: "logout" });
    expect(Object.keys(api.auth!.schemes)).toEqual(["bearerAuth", "apiKey", "oauth"]);
    const byId = (id: string) => api.endpoints!.find((e) => e.operationId === id)!;
    expect(byId("listProducts").pagination).toEqual({ style: "cursor", items: "items" });
    expect(byId("listOrders").pagination).toEqual({ style: "offset", items: "data", totalField: "count" });
    expect(byId("getProduct").parameters).toEqual([{ name: "productId", in: "path", required: true, schema: { type: "string", format: "uuid" } }]);
    expect(byId("getProduct").security).toEqual([]);
    expect(byId("uploadProductImage").requestBody).toMatchObject({ content: { "multipart/form-data": { schema: { properties: { file: { type: "string", format: "binary" } } } } } });
    expect(byId("getProduct").responses["404"]).toEqual({ $ref: "#/components/responses/NotFound" });
    expect(api.info).toMatchObject({ title: "Shop API", version: "2.3.0", extra: { contact: { name: "Shop team", email: "api@shop.example" }, license: { name: "MIT", identifier: "MIT" } } });
  });

  it("writes what it read back as the same API, and the same text every time", () => {
    const text = toOpenApi({ api: read.api });
    const again = fromOpenApi(text);
    expect(again.api).toEqual(read.api);
    expect(again.report.converted).toEqual([]);
    expect(toOpenApi({ api: again.api })).toBe(text);
    expect(text.startsWith("openapi: 3.1.0\ninfo:\n  title: Shop API\n")).toBe(true);
  });

  it("writes every operation of the file with what it said, the path's parameters on each", () => {
    const original = parseYaml(SHOP) as Rec;
    const written = openApiObject({ api: read.api });
    const paths = original.paths as Rec;
    const out = written.paths as Rec;
    expect(Object.keys(out)).toEqual(Object.keys(paths));
    for (const [path, item] of Object.entries(paths) as [string, Rec][]) {
      const shared = (item.parameters as Rec[] | undefined) ?? [];
      for (const m of METHODS) {
        const op = item[m] as Rec | undefined;
        if (!op) continue;
        const w = (out[path] as Rec)[m] as Rec;
        expect(w.operationId, `${m} ${path}`).toBe(op.operationId);
        expect(w.responses).toEqual(op.responses);
        expect(w.requestBody).toEqual(op.requestBody);
        expect(w.security).toEqual(op.security);
        expect(w["x-m3e-pagination"]).toEqual(op["x-m3e-pagination"]);
        const own = (op.parameters as Rec[] | undefined) ?? [];
        expect(w.parameters ?? []).toEqual([...shared.filter((p) => !own.some((o) => o.name === p.name && o.in === p.in)), ...own]);
      }
    }
    expect((out["/products/{productId}"] as Rec).summary).toBe("One product");
    expect(written.webhooks).toEqual(original.webhooks);
    expect(written.externalDocs).toEqual(original.externalDocs);
    expect(written["x-logo"]).toEqual(original["x-logo"]);
    expect(written.security).toEqual(original.security);
    expect(written.tags).toEqual(original.tags);
    expect(written["x-m3e-auth"]).toEqual(original["x-m3e-auth"]);
    const comp = written.components as Rec;
    const orig = original.components as Rec;
    expect(Object.keys(comp)).toEqual(["schemas", "responses", "parameters", "securitySchemes"]);
    for (const k of Object.keys(orig)) expect(comp[k], k).toEqual(orig[k]);
    expect(written.servers).toEqual((original.servers as Rec[]).map((s, i) => ({ ...s, "x-m3e-env": ["dev", "staging", "prod"][i] })));
  });

  it("reads OpenAPI 3.0 as 3.1: nullable, boolean exclusive bounds", () => {
    const { api, report } = fromOpenApi({
      openapi: "3.0.3",
      info: { title: "Old", version: 1 },
      paths: { "/a": { get: { responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "integer", minimum: 0, exclusiveMinimum: true, nullable: true } } } } } } } },
      components: { schemas: { A: { type: "object", properties: { b: { $ref: "#/components/schemas/B", nullable: true }, c: { type: "string", nullable: true } } }, B: { type: "string" } } },
    });
    expect(report.converted[0]).toMatch(/OpenAPI 3.0 read as 3.1/);
    expect(report.converted[1]).toMatch(/GET \/a had no operationId: it is getA/);
    expect(api.info!.version).toBe("1");
    expect(api.models![0].schema).toEqual({ type: "object", properties: { b: { anyOf: [{ $ref: "#/components/schemas/B" }, { type: "null" }] }, c: { type: ["string", "null"] } } });
    expect(api.endpoints![0].responses["200"]).toEqual({ description: "OK", content: { "application/json": { schema: { type: ["integer", "null"], exclusiveMinimum: 0 } } } });
  });

  it("makes names it cannot use into ones it can, and their references follow", () => {
    const { api, report } = fromOpenApi({ openapi: "3.1.0", info: { title: "x", version: "1" }, paths: {}, components: { schemas: { "user-profile": { type: "object" }, Post: { properties: { by: { $ref: "#/components/schemas/user-profile" } } } } } });
    expect(api.models!.map((m) => m.name)).toEqual(["UserProfile", "Post"]);
    expect(api.models![1].schema).toEqual({ properties: { by: { $ref: "#/components/schemas/UserProfile" } } });
    expect(report.converted).toEqual(['model "user-profile" is called UserProfile (a model\'s name is an identifier)']);
  });

  it("refuses what is no OpenAPI 3 document, saying what it is", () => {
    expect(() => fromOpenApi("swagger: '2.0'\ninfo: {title: x}\n")).toThrow(ApiImportError);
    expect(() => fromOpenApi("swagger: '2.0'\n")).toThrow(/Swagger 2.0 is not supported/);
    expect(() => fromOpenApi(CHAT)).toThrow(/AsyncAPI document/);
    expect(() => fromOpenApi("a: [1,\n")).toThrow(/not YAML or JSON: line/);
    expect(() => fromOpenApi("- just a list\n")).toThrow(/not a spec/);
  });
});

describe("AsyncAPI", () => {
  const read = fromAsyncApi(CHAT);

  it("reads the chat: channels with their messages, operations from the server's side, servers, models", () => {
    const { api, report } = read;
    expect(report).toMatchObject({ format: "asyncapi", version: "3.0.0", models: 4, channels: 2, dropped: [], problems: [] });
    const room = api.channels![0];
    expect(room).toMatchObject({ id: "room", address: "/rooms/{roomId}", title: "A chat room", parameters: { roomId: { description: "The room's id" } } });
    expect(room.messages.map((m) => [m.name, m.payload])).toEqual([
      ["chatMessage", { $ref: "#/components/schemas/ChatMessage" }],
      ["typing", { $ref: "#/components/schemas/Typing" }],
    ]);
    expect(room.operations.map((o) => `${o.id} ${o.action} ${o.messages}`)).toEqual(["onChatMessage send chatMessage", "sendChatMessage receive chatMessage", "onTyping send typing"]);
    expect(api.channels![1].operations).toEqual([{ id: "onPresence", action: "send" }]);
    expect(api.servers!.map((s) => `${s.env} ${s.realtime}`)).toEqual(["dev ws://localhost:8081/realtime", "prod wss://rt.chat.example/realtime"]);
    expect(api.extra!.asyncapi).toEqual({ defaultContentType: "application/json", components: { securitySchemes: { token: { type: "httpApiKey", name: "token", in: "query" } } } });
  });

  it("writes what it read back as the same channels, and the same text every time", () => {
    const text = toAsyncApi({ api: read.api });
    const again = fromAsyncApi(text);
    expect(again.api).toEqual(read.api);
    expect(toAsyncApi({ api: again.api })).toBe(text);
    const written = asyncApiObject({ api: read.api });
    expect((written.operations as Rec).sendChatMessage).toEqual({ action: "receive", channel: { $ref: "#/channels/room" }, summary: "The user says something", messages: [{ $ref: "#/channels/room/messages/chatMessage" }] });
    expect((written.servers as Rec).prod).toEqual({ host: "rt.chat.example", protocol: "wss", pathname: "/realtime", description: "Production" });
  });

  it("refuses AsyncAPI 2", () => {
    expect(() => fromAsyncApi("asyncapi: 2.6.0\ninfo: {title: x, version: '1'}\nchannels: {}\n")).toThrow(/AsyncAPI 2 is not supported/);
  });
});

describe("both halves of one API", () => {
  it("puts the chat's HTTP and realtime halves together, models shared and servers by environment", () => {
    const http = fromOpenApi(CHAT_HTTP).api;
    const rt = fromAsyncApi(CHAT).api;
    const both = mergeApi(http, rt, "asyncapi", "merge")!;
    expect(both.models!.map((m) => m.name)).toEqual(["Room", "ChatUser", "ChatMessage", "Typing", "Presence"]);
    expect(both.endpoints!.map((e) => e.operationId)).toEqual(["listRooms", "listMessages"]);
    expect(both.servers).toEqual([
      { env: "prod", url: "https://api.chat.example", realtime: "wss://rt.chat.example/realtime", description: "Production" },
      { env: "dev", url: "/", realtime: "ws://localhost:8081/realtime", description: "Local" },
    ]);
    /* each half written out alone reads back as that half */
    expect(fromOpenApi(toOpenApi({ api: both })).api.endpoints).toEqual(both.endpoints);
    expect(fromAsyncApi(toAsyncApi({ api: both })).api.channels).toEqual(both.channels);
  });

  it("keeps the models the channels need when an OpenAPI file replaces the HTTP half", () => {
    const both = mergeApi(fromOpenApi(CHAT_HTTP).api, fromAsyncApi(CHAT).api, "asyncapi", "merge")!;
    const replaced = mergeApi(both, fromOpenApi(SHOP).api, "openapi", "replace")!;
    expect(replaced.endpoints!.length).toBe(11);
    expect(replaced.channels!.length).toBe(2);
    const names = replaced.models!.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["ChatMessage", "ChatUser", "Typing", "Presence", "Product"]));
    expect(names).not.toContain("Room");
  });
});

describe("the project file", () => {
  const doc = (api: ApiSpec): Doc => ({ groups: [], frames: [{ id: "home", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "Shop", brief: "", api, collections: [{ id: "p", name: "Products", fields: ["name"], rows: [["Sneaker"]], model: "Product" }] });

  it("holds an API byte for byte, its fields in the author's order, one model and endpoint a line", () => {
    const api = mergeApi(fromOpenApi(SHOP).api, fromAsyncApi(CHAT).api, "asyncapi", "merge")!;
    const { text } = serializeProject(doc(api));
    const back = parseProject(text)!.doc;
    expect(back.api).toEqual(api);
    expect(back.collections![0].model).toBe("Product");
    expect(serializeProject(back).text).toBe(text);
    /* properties keep their order (name before price), where the rest of the document sorts its keys */
    expect(text).toContain('{"name":"NewProduct","schema":{"type":"object","description":"What a product is made from","properties":{"name":');
    const lines = text.split("\n");
    const at = lines.indexOf('      "models": [');
    expect(at).toBeGreaterThan(0);
    expect(lines.slice(at + 1, at + 4).every((l) => l.startsWith('        {"name":'))).toBe(true);
    expect(lines.filter((l) => l.startsWith('        {"operationId":')).length).toBe(11);
  });

  it("writes a document without one exactly as before (under the format's version, 5 since the props' names)", () => {
    const plain: Doc = { groups: [], frames: [], paletteKey: "purple", frame: "phone", title: "", brief: "" };
    expect(serializeProject(plain).text).toBe('{\n  "format": "m3e-project",\n  "version": 5,\n  "document": {\n    "brief": "",\n    "frame": "phone",\n    "frames": [],\n    "groups": [],\n    "paletteKey": "purple",\n    "title": ""\n  }\n}\n');
  });
});
