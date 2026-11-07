/* The API section's model: what loading keeps and drops, what validation says, the field rows the editor shows, the
 * TypeScript the models become, the outline a model reads, and documents made to hurt whoever opens them. */

import { describe, expect, it } from "vitest";
import { apiOutline, apiProblems, cleanApi, describeModel, fieldRows, fieldSchema, followRef, holdsFile, itemsTypeKey, rowTypeKey, schemaToTs, schemaTypeTs, withFieldRows, withItemsType, withRowType, type ApiSpec, type FieldRow, type JsonSchemaObject } from ".";
import { openProject } from "../project";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const user = { name: "User", schema: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, name: { type: ["string", "null"] } }, required: ["id", "email"] } };
const ok = (r: string) => ({ "200": { description: "OK", content: { "application/json": { schema: ref(r) } } } });
const base = (): ApiSpec => ({
  models: [user as never],
  endpoints: [{ operationId: "getUser", method: "get", path: "/users/{id}", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: ok("User") }],
});
const errors = (api: ApiSpec) => apiProblems(api).filter((p) => p.level === "error").map((p) => `${p.at}: ${p.message}`);

describe("loading an API section", () => {
  it("keeps what has the model's shape, in its order, and drops what is unusable", () => {
    const api = cleanApi({
      info: { title: "T", version: 2 },
      models: [user, { name: "bad name", schema: {} }, { name: "User", schema: { type: "string" } }, { name: "NoSchema" }],
      endpoints: [
        { operationId: "getUser", method: "get", path: "/users/{id}", responses: { "200": { description: "OK" }, nope: { description: "x" } } },
        { operationId: "getUser", method: "post", path: "/users", responses: {} },
        { method: "GET", path: "/x" },
        { method: "get", path: "no-slash" },
        { method: "delete", path: "/users/{id}", responses: {} },
      ],
      channels: [{ id: "c", address: "/c", messages: [{ name: "m", payload: true }, { name: "m" }, { nope: 1 }], operations: [{ id: "o", action: "publish" }] }],
      tags: [{ name: "A" }, { name: "A" }, { name: "" }],
      extra: { openapi: { webhooks: {} } },
      junk: 1,
    })!;
    expect(api.info).toEqual({ title: "T" });
    expect(api.models!.map((m) => m.name)).toEqual(["User"]);
    expect(Object.keys((api.models![0].schema as { properties: object }).properties)).toEqual(["id", "email", "name"]);
    expect(api.endpoints!.map((e) => e.operationId)).toEqual(["getUser", "getUser_2", "deleteUsersById"]);
    expect(Object.keys(api.endpoints![0].responses)).toEqual(["200"]);
    expect(api.channels![0].messages.map((m) => m.name)).toEqual(["m"]);
    expect(api.channels![0].operations).toEqual([]);
    expect(api.tags).toEqual([{ name: "A" }]);
    expect("junk" in api).toBe(false);
    expect(cleanApi({})).toBeUndefined();
    expect(cleanApi("x")).toBeUndefined();
  });

  it("opens a document with an API through openProject, and one without as it was", () => {
    const doc = openProject({ frames: [], groups: [], paletteKey: "purple", frame: "phone", title: "", brief: "", api: { models: [user], endpoints: "nope" }, collections: [{ id: "c", name: "C", fields: ["a"], rows: [], model: "User" }] })!;
    expect(doc.api!.models![0].name).toBe("User");
    expect(doc.api!.endpoints).toBeUndefined();
    expect(doc.collections![0].model).toBe("User");
    const old = openProject({ frames: [], groups: [], paletteKey: "purple", frame: "phone", title: "", brief: "" })!;
    expect("api" in old).toBe(false);
  });
});

describe("what is wrong with an API", () => {
  it("finds nothing in a good one", () => {
    expect(apiProblems(base())).toEqual([]);
  });

  it("finds references that lead nowhere, outside ones included", () => {
    const api = base();
    api.models!.push({ name: "Post", schema: { type: "object", properties: { author: ref("Nobody"), other: { $ref: "other.yaml#/X" }, deep: { type: "array", items: ref("User") } } } });
    expect(errors(api)).toEqual(['models.Post/properties/author: there is no model "Nobody"', 'models.Post/properties/other: "other.yaml#/X" refers outside the document: import a bundled spec (one file), or define the model here']);
  });

  it("finds a path whose parameters disagree with it", () => {
    const api = base();
    api.endpoints![0].path = "/users/{userId}";
    expect(errors(api)).toEqual(['endpoints.getUser.parameters[0]: the path parameter "id" is not in the path "/users/{userId}"', "endpoints.getUser: {userId} in the path has no path parameter"]);
    api.endpoints![0].path = "/users/{id";
    expect(errors(api).join("\n")).toMatch(/unbalanced braces/);
  });

  it("finds two endpoints of one operationId or one route", () => {
    const api = base();
    api.endpoints!.push({ ...api.endpoints![0] }, { ...api.endpoints![0], operationId: "again", parameters: [{ name: "uid", in: "path", required: true }], path: "/users/{uid}" });
    const e = errors(api);
    expect(e).toContain('endpoints.getUser: two endpoints have the operationId "getUser"');
    expect(e).toContain("endpoints.again: GET /users/{uid} is the same route as getUser");
  });

  it("finds keywords of the wrong kind in a schema", () => {
    const api: ApiSpec = { models: [{ name: "X", schema: { type: "text", items: [{}], required: "a", pattern: "([", minLength: -1, exclusiveMinimum: true, examples: 3, nullable: true } as never }] };
    const all = apiProblems(api).map((p) => `${p.level}: ${p.message}`);
    expect(all).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/error: type should be one of/),
        expect.stringMatching(/error: items should be one schema \(a tuple is prefixItems/),
        expect.stringMatching(/error: required should be a list/),
        expect.stringMatching(/error: pattern "\(\[" is not a regular expression/),
        expect.stringMatching(/error: minLength should be a whole number/),
        expect.stringMatching(/error: exclusiveMinimum is a number in OpenAPI 3.1/),
        expect.stringMatching(/error: examples should be a list/),
        expect.stringMatching(/warning: nullable is OpenAPI 3.0/),
      ]),
    );
  });

  it("finds security and sign-in naming what is not there", () => {
    const api = base();
    api.endpoints![0].security = [{ jwt: [] }];
    api.auth = { schemes: { bearer: { type: "http" } }, login: "signIn" };
    expect(errors(api)).toEqual(['endpoints.getUser.security: security names "jwt", which is no security scheme of the API', 'auth.schemes.bearer: an http scheme needs scheme: "bearer" or "basic"', 'auth.login: login names the endpoint "signIn", which there is not']);
  });

  it("finds a channel's parameters and operations that do not match it", () => {
    const api: ApiSpec = {
      servers: [{ env: "prod", url: "ftp://x", realtime: "mailto:x" }],
      channels: [{ id: "room", address: "/rooms/{roomId}", transport: "sse", parameters: { other: {} }, messages: [{ name: "said" }], operations: [{ id: "in", action: "receive", messages: ["shout"] }] }],
    };
    const all = apiProblems(api).map((p) => `${p.level}: ${p.at}: ${p.message}`);
    expect(all).toEqual([
      'error: servers.prod: "ftp://x" is not a base URL (https://api.example.com/v1, or /api)',
      'error: servers.prod: "mailto:x" is not a realtime URL (wss://rt.example.com)',
      "error: channels.room: {roomId} in the address has no parameter",
      'error: channels.room: the parameter "other" is not in the address "/rooms/{roomId}"',
      'error: channels.room.operations.in: the channel has no message "shout"',
      "warning: channels.room.operations.in: server-sent events only go from the server: an SSE channel has nothing to receive",
    ]);
  });

  it("warns of a paged list whose response has no items field, and of missing paging parameters", () => {
    const api = base();
    api.endpoints!.push({ operationId: "listUsers", method: "get", path: "/users", pagination: { style: "cursor", items: "items" }, responses: ok("User") });
    const w = apiProblems(api).filter((p) => p.level === "warning").map((p) => p.message);
    expect(w).toEqual(['the success response has no field "items" for the page\'s items', "the query parameters cursor, limit that page it are not listed"]);
  });
});

describe("a model as rows of fields", () => {
  it("reads the rows of an object and writes them back, keeping what the rows do not show", () => {
    const schema: JsonSchemaObject = { type: "object", description: "A post", properties: { title: { type: "string", maxLength: 80, examples: ["Hi"] }, author: ref("User"), tags: { type: "array", items: { type: "string" } }, editor: { anyOf: [ref("User"), { type: "null" }] }, status: { type: "string", enum: ["draft", "live"] } }, required: ["title"] };
    const rows = fieldRows(schema);
    expect(rows).toEqual([
      { name: "title", type: "string", required: true, nullable: false, example: "Hi" },
      { name: "author", type: "ref", ref: "User", required: false, nullable: false },
      { name: "tags", type: "array", items: "string", required: false, nullable: false },
      { name: "editor", type: "ref", ref: "User", required: false, nullable: true },
      { name: "status", type: "string", enum: ["draft", "live"], required: false, nullable: false },
    ]);
    expect(withFieldRows(schema, rows)).toEqual(schema);
    const changed = withFieldRows(schema, [{ ...rows[0], format: "email", required: false }, { name: "count", type: "integer", required: true, nullable: true }]);
    expect(changed).toEqual({ type: "object", description: "A post", properties: { title: { type: "string", format: "email", examples: ["Hi"], maxLength: 80 }, count: { type: ["integer", "null"] } }, required: ["count"] });
  });

  it("names a file and the text formats that read as types of their own, and writes them back", () => {
    const schema: JsonSchemaObject = {
      type: "object",
      properties: { file: { type: "string", format: "binary", description: "A JPEG" }, photos: { type: "array", items: { type: "string", format: "binary" }, maxItems: 4 }, at: { type: "string", format: "date-time" }, mail: { type: "string", format: "email" }, site: { type: "string", format: "uri" }, id: { type: "string", format: "uuid" }, secret: { type: "string", format: "password" }, n: { type: "integer", format: "int32" } },
      required: ["file"],
    };
    const rows = fieldRows(schema);
    expect(rows.map(rowTypeKey)).toEqual(["format:binary", "array", "format:date-time", "format:email", "format:uri", "format:uuid", "string", "integer"]);
    expect(itemsTypeKey(rows[1])).toBe("format:binary");
    expect(withFieldRows(schema, rows)).toEqual(schema);
    expect(holdsFile(schema)).toBe(true);
    expect(holdsFile({ type: "object", properties: { alt: { type: "string" } } })).toBe(false);
    /* a text field made a file takes no choices or example; a file made text is no file; a number keeps its format */
    const word: FieldRow = { name: "kind", type: "string", required: false, nullable: false, enum: ["a", "b"], example: "a" };
    expect(withRowType(word, "format:binary")).toEqual({ name: "kind", type: "string", required: false, nullable: false, format: "binary" });
    expect(withRowType(rows[0], "string").format).toBeUndefined();
    expect(withRowType(rows[0], "number").format).toBeUndefined();
    expect(withRowType(rows[6], "string").format).toBe("password");
    expect(withRowType(rows[7], "number").format).toBe("int32");
    expect(fieldSchema(withRowType(rows[2], "format:date"))).toEqual({ type: "string", format: "date" });
    /* a list of files, and back to a list of words */
    const words = withItemsType(rows[1], "string");
    expect(fieldSchema(words, schema.properties!.photos)).toEqual({ type: "array", items: { type: "string" }, maxItems: 4 });
    expect(fieldSchema(withItemsType(words, "format:binary"), schema.properties!.photos)).toEqual({ type: "array", items: { type: "string", format: "binary" }, maxItems: 4 });
    expect(fieldSchema(withItemsType(words, "ref:User"))).toEqual({ type: "array", items: { $ref: "#/components/schemas/User" } });
  });

  it("follows a model's reference to what it is", () => {
    const api: ApiSpec = { models: [user as never, { name: "Alias", schema: ref("User") }, { name: "Loop", schema: ref("Loop") }] };
    expect(followRef(api, ref("Alias"))).toBe(user.schema);
    expect(followRef(api, ref("Loop"))).toEqual(ref("Loop"));
  });
});

describe("the models as TypeScript", () => {
  it("names models, writes objects, unions, nulls, lists, enums and files", () => {
    const api: ApiSpec = {
      models: [
        user as never,
        { name: "Node", schema: { type: "object", description: "A tree, */ safely", properties: { children: { type: "array", items: ref("Node") }, "data-id": { type: "integer" } }, required: ["children"] } },
        { name: "Shape", schema: { oneOf: [{ type: "object", properties: { r: { type: "number" } } }, ref("User")] } },
        { name: "Upload", schema: { type: "object", properties: { file: { type: "string", format: "binary" }, kind: { enum: ["a", 1, null] } } } },
        { name: "Mixed", schema: { allOf: [ref("User"), { type: "object", properties: { extra: true }, additionalProperties: { type: "string" } }] } },
      ],
    };
    const ts = schemaToTs(api);
    expect(ts).toContain("export type User = {\n  /** @format uuid */\n  id: string;\n  /** @format email */\n  email: string;\n  name?: string | null;\n};");
    expect(ts).toContain("/** A tree, *\\/ safely */\nexport type Node = {\n  children: Node[];\n  \"data-id\"?: number;\n};");
    expect(ts).toContain("export type Shape = {\n  r?: number;\n} | User;");
    expect(ts).toContain("  file?: Blob;\n  kind?: \"a\" | 1 | null;");
    expect(ts).toContain("export type Mixed = User & {\n  extra?: unknown;\n  [key: string]: unknown;\n};");
    expect(schemaTypeTs({ type: "string", format: "binary" }, { binary: "File" })).toBe("File");
    expect(schemaToTs(undefined)).toContain("export {};");
  });
});

describe("reading the API in short", () => {
  it("outlines models, endpoints by tag, channels and problems", () => {
    const api = base();
    api.endpoints![0].tags = ["Users"];
    api.channels = [{ id: "room", address: "/r", messages: [{ name: "said", payload: ref("User") }], operations: [{ id: "onSaid", action: "send" }] }];
    const text = apiOutline(api);
    expect(text).toContain("- User: id string(uuid), email string(email), name? string|null");
    expect(text).toContain("  [Users]\n- GET /users/{id} getUser → 200 User");
    expect(text).toContain("- room /r: messages said User; onSaid server sends said");
    expect(apiOutline(undefined)).toMatch(/no API yet/);
    expect(describeModel(api, "User", [{ id: "c", name: "People", model: "User" }])!.usedBy).toEqual(["endpoint getUser", "channel room", "data People"]);
  });
});

describe("hostile API sections", () => {
  it("opens one that asks for too much in bounded time and size", () => {
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 5000; i++) deep = { type: "object", properties: { x: deep } };
    const huge = {
      models: Array.from({ length: 5000 }, (_, i) => ({ name: `M${i}`, schema: { type: "object", properties: Object.fromEntries(Array.from({ length: 50 }, (_, j) => [`f${j}`, { type: "string", description: "x".repeat(10) }])) } })),
      endpoints: Array.from({ length: 50_000 }, (_, i) => ({ operationId: "same", method: "get", path: `/p/${i}/{a}/{a}`, responses: { "200": { description: "x" } } })),
      channels: [{ id: "c", address: "/{".repeat(1000), messages: [{ name: "m", payload: deep }], operations: [] }],
    };
    const t = performance.now();
    const doc = openProject({ frames: [], groups: [], paletteKey: "purple", frame: "phone", title: "", brief: "", api: huge })!;
    const api = doc.api!;
    expect(api.models!.length).toBeLessThanOrEqual(1000);
    expect(api.endpoints!.length).toBeLessThanOrEqual(2000);
    apiProblems(api);
    apiOutline(api);
    schemaToTs(api);
    expect(performance.now() - t).toBeLessThan(15_000);
    expect(JSON.stringify(api).length).toBeLessThan(20_000_000);
  }, 60_000);

  it("walks references that loop without hanging", () => {
    const api: ApiSpec = { models: [{ name: "A", schema: { allOf: [ref("B")] } }, { name: "B", schema: { allOf: [ref("A")] } }, { name: "C", schema: ref("C") }] };
    expect(apiProblems(api)).toEqual([]);
    expect(schemaToTs(api)).toContain("export type A = B;");
    expect(followRef(api, ref("C"))).toEqual(ref("C"));
  });
});
