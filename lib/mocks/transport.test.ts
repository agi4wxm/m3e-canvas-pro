/* The mock transport on a real contract (the shop's OpenAPI and the chat's AsyncAPI): routing, the life of a record
 * from POST to DELETE, the three ways of paging, filters and search and sort, requests checked with a pointer per
 * field, uploads and downloads, signing in with tokens that expire and refresh, scenarios (empty, network error, slow,
 * retries, random errors, lots of data, signed out), latency on a clock that moves only when told, the log, realtime
 * scripts, and never a throw. */

import { describe, expect, it } from "vitest";
import { FIXTURE_OPENAPI, shopApi } from "../export/product.fixture";
import { fromOpenApi } from "../api";
import type { ApiSpec } from "../api/types";
import type { TransportRequest, TransportResponse } from "../api/transport";
import { fakeClock } from "./clock";
import { defaultScenarios } from "./fill";
import { createMockTransport, type MockOptions } from "./transport";
import { MOCK_FILES_PATH, type MockSpec } from "./types";

const api = shopApi();
const make = (mocks: MockSpec = {}, o: MockOptions = {}, src: ApiSpec = api) => createMockTransport({ api: src, mocks }, { latency: false, clock: fakeClock(), ...o });
type Body = Record<string, unknown> & { items?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
const call = async (t: ReturnType<typeof make>, method: string, path: string, more: Partial<TransportRequest> = {}): Promise<TransportResponse & { body: Body }> => (await t.request({ method: method as "GET", path, ...more })) as TransportResponse & { body: Body };
const NEW = { name: "Desk lamp", price: { amount: 25, currency: "USD" }, category: "bags" };

describe("routes", () => {
  it("finds the endpoint by method and path, its parameters filled in", async () => {
    const t = make();
    const list = await call(t, "GET", "/products");
    const id = list.body.items![0].id as string;
    expect((await call(t, "GET", `/products/${id}`)).body.id).toBe(id);
    expect((await call(t, "GET", `/products/${id}?ignored=1`)).status).toBe(200);
    expect((await call(t, "GET", "/no/such/thing")).status).toBe(404);
    const wrong = await call(t, "PUT", "/products");
    expect(wrong.status).toBe(405);
    expect(wrong.headers.allow).toContain("GET");
    expect(wrong.headers["content-type"]).toBe("application/problem+json");
  });

  it("reads REST conventions into what each endpoint does", async () => {
    const { compileRoutes } = await import("./routes");
    const kinds = Object.fromEntries(compileRoutes(api).map((r) => [r.operationId, `${r.kind}${r.model ? ` ${r.model}` : ""}`]));
    expect(kinds).toMatchObject({ listProducts: "list Product", createProduct: "create Product", getProduct: "get Product", updateProduct: "update Product", deleteProduct: "delete Product", listOrders: "list Order", getMe: "singleton User", login: "login", refreshToken: "refresh", logout: "logout", uploadProductImage: "upload" });
  });
});

describe("a record's life within a session", () => {
  it("is made, read, changed and taken away, and the list follows", async () => {
    const t = make();
    const before = await call(t, "GET", "/products", { query: { limit: 100 } });
    expect(before.body.items).toHaveLength(24);
    const made = await call(t, "POST", "/products", { body: NEW });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(made.body).toMatchObject(NEW);
    expect(Date.parse(String(made.body.createdAt))).toBeGreaterThan(0);
    expect(made.headers.location).toBe(`/products/${id}`);
    const after = await call(t, "GET", "/products", { query: { limit: 100 } });
    expect(after.body.items).toHaveLength(25);
    expect(after.body.items![0].id).toBe(id);
    const patched = await call(t, "PATCH", `/products/${id}`, { body: { name: "Floor lamp" } });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ id, name: "Floor lamp", price: NEW.price });
    expect((await call(t, "GET", `/products/${id}`)).body.name).toBe("Floor lamp");
    const gone = await call(t, "DELETE", `/products/${id}`);
    expect(gone.status).toBe(204);
    expect(gone.body).toBeUndefined();
    expect((await call(t, "GET", `/products/${id}`)).status).toBe(404);
    expect((await call(t, "GET", "/products", { query: { limit: 100 } })).body.items).toHaveLength(24);
    /* a fresh session starts from the same data */
    t.reset();
    expect((await call(t, "GET", "/products", { query: { limit: 100 } })).body.items).toHaveLength(24);
  });

  it("replaces with PUT, keeping what the server owns", async () => {
    const small = fromOpenApi({
      openapi: "3.1.0",
      info: { title: "Notes", version: "1" },
      paths: {
        "/notes": { get: { operationId: "listNotes", responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Note" } } } } } } } },
        "/notes/{id}": { put: { operationId: "putNote", parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } } } }, responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Note" } } } } } } },
      },
      components: { schemas: { Note: { type: "object", properties: { id: { type: "integer", readOnly: true }, text: { type: "string" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }, required: ["id", "text"] } } },
    }).api;
    const t = make({}, {}, small);
    const notes = (await call(t, "GET", "/notes")).body as unknown as { id: number; createdAt?: string }[];
    expect(notes.map((n) => n.id)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    const put = await call(t, "PUT", "/notes/3", { body: { text: "new" } });
    expect(put.body).toMatchObject({ id: 3, text: "new" });
    expect(put.body.updatedAt).toBeTruthy();
    expect((await call(t, "PUT", "/notes/999", { body: { text: "x" } })).status).toBe(404);
  });
});

describe("paging, filters, search and sort", () => {
  it("pages by cursor to the end, each record once", async () => {
    const t = make();
    const seen: string[] = [];
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await call(t, "GET", "/products", { query: { limit: 7, ...(cursor ? { cursor } : {}) } });
      seen.push(...page.body.items!.map((p) => p.id as string));
      cursor = page.body.nextCursor as string | null;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(4);
    expect(new Set(seen).size).toBe(24);
  });

  it("pages by offset with the total", async () => {
    const t = make();
    const page = await call(t, "GET", "/orders", { query: { offset: 20, limit: 10 } });
    expect(page.body.data).toHaveLength(4);
    expect(page.body.count).toBe(24);
  });

  it("pages by page number when the endpoint takes one", async () => {
    const proof = fromOpenApi(FIXTURE_OPENAPI).api;
    const t = make({}, {}, proof);
    const p1 = await call(t, "GET", "/products", { query: { page: 1, limit: 10 } });
    const p3 = await call(t, "GET", "/products", { query: { page: 3, limit: 10 } });
    expect(p1.body.items).toHaveLength(10);
    expect(p3.body.items).toHaveLength(4);
    expect(p1.body.next).toBeNull();
  });

  it("filters by a field, searches the words, sorts by a field", async () => {
    const t = make();
    const shoes = await call(t, "GET", "/products", { query: { category: "shoes", limit: 100 } });
    expect(shoes.body.items!.length).toBeGreaterThan(0);
    expect(shoes.body.items!.every((p) => p.category === "shoes")).toBe(true);
    const all = (await call(t, "GET", "/products", { query: { limit: 100 } })).body.items!;
    const word = String(all[3].name).split(" ")[0];
    const found = await call(t, "GET", "/products", { query: { q: word, limit: 100 } });
    expect(found.body.items!.length).toBeGreaterThan(0);
    expect(found.body.items!.every((p) => JSON.stringify(p).includes(word))).toBe(true);
    const sorted = (await call(t, "GET", "/products", { query: { sort: "-createdAt", limit: 100 } })).body.items!.map((p) => String(p.createdAt));
    expect(sorted).toEqual([...sorted].sort().reverse());
  });
});

describe("requests checked against the contract", () => {
  it("answers problem details with a pointer per field", async () => {
    const t = make({ locale: "zh" });
    const bad = await call(t, "POST", "/products", { body: { name: "", price: { amount: -1, currency: "XXX" } } });
    /* the shop says 422 for this endpoint and no 400 */
    expect(bad.status).toBe(422);
    expect(bad.headers["content-type"]).toBe("application/problem+json");
    const errors = bad.body.errors as { pointer: string; detail: string }[];
    expect(errors.map((e) => e.pointer).sort()).toEqual(["#/category", "#/name", "#/price/amount", "#/price/currency"]);
    expect(errors.find((e) => e.pointer === "#/category")!.detail).toBe("必填");
    const login = await call(t, "POST", "/auth/login", { body: { email: "not an email", password: "short" } });
    expect(login.status).toBe(400);
    expect((login.body.errors as { pointer: string }[]).map((e) => e.pointer).sort()).toEqual(["#/email", "#/password"]);
    const limit = await call(t, "GET", "/products", { query: { limit: "lots" } });
    expect(limit.status).toBe(400);
    expect((limit.body.errors as { pointer: string }[])[0].pointer).toBe("#/query/limit");
    /* a record's id that is not even a UUID is simply not there */
    expect((await call(t, "GET", "/products/42")).status).toBe(404);
    /* PATCH is a merge patch: a part of the record is enough */
    const id = (await call(t, "GET", "/products")).body.items![0].id as string;
    expect((await call(t, "PATCH", `/products/${id}`, { body: { stock: 3 } })).status).toBe(200);
    expect((await call(t, "PATCH", `/products/${id}`, { body: { stock: -3 } })).status).toBe(400);
  });
});

describe("files", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  it("takes an upload, answers with its address, and the record it belongs to shows it", async () => {
    const t = make();
    const id = (await call(t, "GET", "/products")).body.items![0].id as string;
    const up = await call(t, "POST", `/products/${id}/images`, { body: { file: { name: "lamp.png", type: "image/png", dataUrl: PNG }, alt: "A lamp" } });
    expect(up.status).toBe(201);
    expect(up.body.url).toBe(PNG);
    expect((await call(t, "GET", `/products/${id}`)).body.images).toContain(PNG);
    expect((await call(t, "POST", `/products/${id}/images`, { body: { alt: "no file" } })).status).toBe(400);
  });

  it("hands out the library's files, and a placeholder for a download it has none for", async () => {
    const t = make({ files: [{ id: "receipt", name: "receipt.pdf", type: "application/pdf", data: "data:application/pdf;base64,JVBERi0xLjQK" }] });
    const got = await call(t, "GET", `${MOCK_FILES_PATH}/receipt`);
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toBe("application/pdf");
    expect(got.body).toMatchObject({ name: "receipt.pdf", type: "application/pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQK" });
    const dl = fromOpenApi({ openapi: "3.1.0", info: { title: "D", version: "1" }, paths: { "/invoices/{id}/pdf": { get: { operationId: "invoicePdf", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "the PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } } } } } } }).api;
    const file = await call(make({}, {}, dl), "GET", "/invoices/INV-7/pdf");
    expect(file.headers["content-type"]).toBe("application/pdf");
    expect(String((file.body as unknown as { dataUrl: string }).dataUrl)).toMatch(/^data:application\/pdf;base64,JVBERi0x/);
  });
});

describe("files of every format", () => {
  const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const id = { name: "id", in: "path", required: true, schema: { type: "string" } };
  const binary = (type: string) => ({ "200": { description: "the file", content: { [type]: { schema: { type: "string", format: "binary" } } } } });
  const files = fromOpenApi({
    openapi: "3.1.0",
    info: { title: "Files", version: "1" },
    paths: {
      "/orders": { get: { operationId: "listOrders", responses: { "200": { description: "the orders", content: { "application/json": { schema: { type: "array", items: ref("Order") } }, "text/csv": { schema: { type: "string" } }, [XLSX_TYPE]: { schema: { type: "string", format: "binary" } } } } } } },
      "/orders/{id}": { get: { operationId: "getOrder", parameters: [id], responses: { "200": { description: "an order", content: { "application/json": { schema: ref("Order") } } } } } },
      "/orders/export": { get: { operationId: "exportOrders", responses: binary("text/csv") } },
      "/orders/{id}/invoice": { get: { operationId: "orderInvoice", parameters: [id], responses: binary("application/pdf") } },
      "/attachments": { get: { operationId: "listAttachments", responses: { "200": { description: "the attachments", content: { "application/json": { schema: { type: "array", items: ref("Attachment") } } } } } } },
      "/attachments/{id}": { get: { operationId: "getAttachment", parameters: [id], responses: { "200": { description: "one", content: { "application/json": { schema: ref("Attachment") } } } } } },
      "/attachments/{id}/download": { get: { operationId: "downloadAttachment", parameters: [id], responses: binary("application/octet-stream") } },
      "/models/{id}/mesh": { get: { operationId: "modelMesh", parameters: [id], responses: binary("model/gltf-binary") } },
      "/readme": { get: { operationId: "readme", responses: { "200": { description: "words", content: { "text/plain": { schema: { type: "string" } } } } } } },
    },
    components: {
      schemas: {
        Order: { type: "object", required: ["id", "title", "total"], properties: { id: { type: "string" }, title: { type: "string" }, total: { type: "number" } } },
        Attachment: { type: "object", required: ["id", "fileName"], properties: { id: { type: "string" }, fileName: { type: "string" } } },
      },
    },
  }).api;
  const mocks: MockSpec = { models: [{ name: "Attachment", fixtures: [{ id: "att-1", fileName: "plan 平面图.glb" }, { id: "att-2", fileName: "budget.xlsx" }] }] };
  const asFile = (r: TransportResponse) => r.body as { name: string; type: string; dataUrl: string; size: number };
  const text = (r: TransportResponse) => atob(asFile(r).dataUrl.split(",")[1]);

  it("answers a list in the type the request accepts among those it offers: JSON by default, else CSV or XLSX of the same rows", async () => {
    const t = make(mocks, {}, files);
    const rows = (await call(t, "GET", "/orders")).body as unknown as Record<string, unknown>[];
    expect(Array.isArray(rows)).toBe(true);
    expect((await call(t, "GET", "/orders", { headers: { accept: "application/json" } })).headers["content-type"]).toBe("application/json");
    const csv = await call(t, "GET", "/orders", { headers: { Accept: "text/csv" } });
    expect(csv.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(csv.headers["content-disposition"]).toMatch(/^attachment; filename=".+\.csv"/);
    expect(text(csv).split("\r\n")[0]).toBe("id,title,total");
    expect(text(csv)).toContain(String(rows[0].id));
    const xlsx = await call(t, "GET", "/orders", { headers: { accept: `${XLSX_TYPE}, application/json;q=0.5` } });
    expect(asFile(xlsx).type).toBe(XLSX_TYPE);
    expect(asFile(xlsx).name.endsWith(".xlsx")).toBe(true);
    /* asking for what the operation does not offer gets JSON */
    expect((await call(t, "GET", "/orders", { headers: { accept: "image/png, */*;q=0.1" } })).headers["content-type"]).toBe("application/json");
  });

  it("exports a list as the file its operation answers with, a record's document from the record, a 404 for none", async () => {
    const t = make(mocks, {}, files);
    const order = ((await call(t, "GET", "/orders")).body as unknown as Record<string, unknown>[])[2];
    const exp = await call(t, "GET", "/orders/export");
    expect(exp.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(text(exp).trimEnd().split("\r\n")).toHaveLength(1 + 24);
    const inv = await call(t, "GET", `/orders/${order.id}/invoice`);
    expect(inv.headers["content-type"]).toBe("application/pdf");
    expect(asFile(inv).name).toBe(`${String(order.title).replace(/\s+/g, "-")}.pdf`);
    expect(text(inv)).toContain(String(order.id));
    expect((await call(t, "GET", "/orders/nope/invoice")).status).toBe(404);
    const mesh = await call(t, "GET", "/models/m1/mesh");
    expect(asFile(mesh).type).toBe("model/gltf-binary");
    expect(text(mesh).slice(0, 4)).toBe("glTF");
  });

  it("gives bytes the type its record's file name says, under that name, in any language", async () => {
    const t = make(mocks, {}, files);
    const glb = await call(t, "GET", "/attachments/att-1/download");
    expect(glb.headers["content-type"]).toBe("model/gltf-binary");
    expect(glb.headers["content-disposition"]).toBe(`attachment; filename="plan ___.glb"; filename*=UTF-8''plan%20%E5%B9%B3%E9%9D%A2%E5%9B%BE.glb`);
    expect(text(glb).slice(0, 4)).toBe("glTF");
    const xlsx = await call(t, "GET", "/attachments/att-2/download");
    expect(asFile(xlsx).type).toBe(XLSX_TYPE);
    expect(asFile(xlsx).name).toBe("budget.xlsx");
    /* the library's file of the type comes first */
    const lib = make({ ...mocks, files: [{ id: "deck", name: "deck.glb", type: "model/gltf-binary", data: "data:model/gltf-binary;base64,Z2xURgIAAAA=" }] }, {}, files);
    expect(asFile(await call(lib, "GET", "/attachments/att-1/download")).name).toBe("deck.glb");
  });

  it("answers text as text under its own type, and serves the library's files inline", async () => {
    const t = make({ files: [{ id: "doc", name: "说明.txt", type: "text/plain", data: "data:text/plain;base64,aGk=" }] }, {}, files);
    const r = await call(t, "GET", "/readme");
    expect(r.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(typeof r.body).toBe("string");
    const f = await call(t, "GET", `${MOCK_FILES_PATH}/doc`);
    expect(f.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(f.headers["content-disposition"]).toBe(`inline; filename="__.txt"; filename*=UTF-8''%E8%AF%B4%E6%98%8E.txt`);
  });
});

describe("signing in", () => {
  const login = (t: ReturnType<typeof make>, body = { email: "demo@example.com", password: "demo12345" }) => call(t, "POST", "/auth/login", { body });
  const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

  it("starts signed in by default, and signed out when told", async () => {
    expect((await call(make(), "GET", "/orders")).status).toBe(200);
    const out = make({ auth: { signedIn: false } });
    const denied = await call(out, "GET", "/orders");
    expect(denied.status).toBe(401);
    expect(denied.headers["www-authenticate"]).toContain("Bearer");
    /* a public endpoint does not care */
    expect((await call(out, "GET", "/products")).status).toBe(200);
  });

  it("gives tokens the secured endpoints take, that expire, refresh and end with signing out", async () => {
    const clock = fakeClock();
    const t = make({ auth: { signedIn: false, tokenTtl: 60 } }, { clock });
    const signed = await login(t);
    expect(signed.status).toBe(200);
    const access = signed.body.accessToken as string;
    const refresh = signed.body.refreshToken as string;
    expect(access.split(".")).toHaveLength(3);
    expect(signed.body.expiresIn).toBe(60);
    const me = await call(t, "GET", "/me", bearer(access));
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("demo@example.com");
    expect((await call(t, "GET", "/orders", bearer("made-up"))).status).toBe(401);
    await clock.advance(61_000);
    const expired = await call(t, "GET", "/orders", bearer(access));
    expect(expired.status).toBe(401);
    expect(expired.body.code).toBe("token_expired");
    const renewed = await call(t, "POST", "/auth/refresh", { body: { refreshToken: refresh } });
    expect(renewed.status).toBe(200);
    expect(renewed.body.accessToken).not.toBe(access);
    expect((await call(t, "GET", "/orders", bearer(renewed.body.accessToken as string))).status).toBe(200);
    /* a refresh token is good once */
    expect((await call(t, "POST", "/auth/refresh", { body: { refreshToken: refresh } })).status).toBe(401);
    expect((await call(t, "POST", "/auth/logout", bearer(renewed.body.accessToken as string))).status).toBe(204);
    expect((await call(t, "GET", "/orders", bearer(renewed.body.accessToken as string))).status).toBe(401);
    expect((await call(t, "GET", "/orders")).status).toBe(401);
  });

  it("takes only the accounts it is told to", async () => {
    const t = make({ auth: { accept: [{ email: "demo@example.com", password: "demo12345" }] } });
    expect((await login(t, { email: "demo@example.com", password: "wrong-one" })).status).toBe(401);
    expect((await login(t)).status).toBe(200);
  });
});

describe("scenarios", () => {
  const scenarios = defaultScenarios("en");
  const inScenario = (id: string, o: MockOptions = {}, extra: MockSpec = {}) => make({ scenarios: [...scenarios, ...(extra.scenarios ?? [])], ...extra, scenario: id }, o);

  it("plays a new user: empty lists that fill as the user makes things", async () => {
    const t = inScenario("new-user");
    expect((await call(t, "GET", "/products")).body.items).toEqual([]);
    expect((await call(t, "GET", "/orders")).body).toMatchObject({ data: [], count: 0 });
    await call(t, "POST", "/products", { body: NEW });
    expect((await call(t, "GET", "/products")).body.items).toHaveLength(1);
    expect((await call(t, "GET", "/me")).status).toBe(200);
  });

  it("plays lots of data, a network down, signed out", async () => {
    expect((await call(inScenario("lots"), "GET", "/orders", { query: { limit: 1 } })).body.count).toBe(240);
    const down = await call(inScenario("network-error"), "GET", "/products");
    expect(down.status).toBe(0);
    expect(down.body).toBeUndefined();
    expect((await call(inScenario("signed-out"), "GET", "/orders")).status).toBe(401);
  });

  it("switches from data to empty to an error in one transport, each a fresh session", async () => {
    const t = make({ scenarios });
    expect((await call(t, "GET", "/products")).body.items!.length).toBeGreaterThan(0);
    t.setScenario("new-user");
    expect(t.scenario).toBe("new-user");
    expect((await call(t, "GET", "/products")).body.items).toEqual([]);
    t.setScenario("network-error");
    expect((await call(t, "GET", "/products")).status).toBe(0);
    t.setScenario(undefined);
    expect((await call(t, "GET", "/products")).status).toBe(200);
  });

  it("answers an operation in turn for retries, injects errors, and pins records", async () => {
    const t = inScenario("flaky", {}, {
      scenarios: [{ id: "flaky", name: "Flaky", ops: { listOrders: { sequence: [{ network: true }, { status: 503 }, {}] }, getMe: { status: 500, body: { title: "Down", status: 500 } } }, errorRate: 0 }],
    });
    expect((await call(t, "GET", "/orders")).status).toBe(0);
    expect((await call(t, "GET", "/orders")).status).toBe(503);
    expect((await call(t, "GET", "/orders")).status).toBe(200);
    expect((await call(t, "GET", "/orders")).status).toBe(200);
    const me = await call(t, "GET", "/me");
    expect(me.status).toBe(500);
    expect(me.body).toEqual({ title: "Down", status: 500 });
    const failing = inScenario("chaos", {}, { scenarios: [{ id: "chaos", name: "Chaos", errorRate: 1 }] });
    expect((await call(failing, "GET", "/products")).status).toBe(500);
    const pinned = inScenario("pins", {}, { models: [{ name: "Product", fixtures: [{ id: "00000000-0000-4000-8000-000000000001", name: "Pinned lamp", price: { amount: 9, currency: "USD" }, category: "bags", createdAt: "2026-01-01T00:00:00Z" }] }], scenarios: [{ id: "pins", name: "Pins", ops: { listProducts: { fixtures: "all" } } }] });
    const items = (await call(pinned, "GET", "/products")).body.items!;
    expect(items.map((p) => p.name)).toEqual(["Pinned lamp"]);
  });

  it("puts pinned records and collection rows first in the normal data", async () => {
    const t = createMockTransport(
      { api, mocks: { models: [{ name: "Product", count: 5, fixtures: [{ id: "00000000-0000-4000-8000-000000000001", name: "Pinned", price: { amount: 1, currency: "USD" }, category: "bags", createdAt: "2026-01-01T00:00:00Z" }] }] }, collections: [{ id: "c", name: "Rows", fields: ["id", "name", "stock"], rows: [["00000000-0000-4000-8000-000000000002", "From the canvas", "7"]], model: "Product" }] },
      { latency: false, clock: fakeClock() },
    );
    const items = (await call(t as ReturnType<typeof make>, "GET", "/products")).body.items!;
    expect(items).toHaveLength(5);
    expect(items[0].name).toBe("Pinned");
    expect(items[1]).toMatchObject({ name: "From the canvas", stock: 7 });
  });
});

describe("latency, aborting and the log", () => {
  it("waits as long as the scenario says, on the clock given", async () => {
    const clock = fakeClock();
    const t = createMockTransport({ api, mocks: { scenarios: defaultScenarios("en"), scenario: "slow" } }, { clock });
    let done = false;
    const pending = t.request({ method: "GET", path: "/products" }).then((r) => {
      done = true;
      return r;
    });
    await clock.advance(1900);
    expect(done).toBe(false);
    await clock.advance(1500);
    expect(done).toBe(true);
    expect((await pending).status).toBe(200);
    expect(t.log.at(-1)!.ms).toBeGreaterThanOrEqual(2000);
    expect(t.log.at(-1)!.scenario).toBe("slow");
  });

  it("takes the document's latency by default, none when told", async () => {
    const clock = fakeClock();
    const t = createMockTransport({ api, mocks: { latency: { min: 300, max: 300 } } }, { clock });
    const p = t.request({ method: "GET", path: "/products" });
    await clock.advance(299);
    expect(clock.pending).toBe(1);
    await clock.advance(1);
    expect((await p).status).toBe(200);
  });

  it("answers a call aborted while it waited with no answer", async () => {
    const clock = fakeClock();
    const t = createMockTransport({ api, mocks: { latency: { min: 500, max: 500 } } }, { clock });
    const signal = { aborted: false };
    const p = t.request({ method: "GET", path: "/products", signal });
    signal.aborted = true;
    await clock.advance(500);
    expect((await p).status).toBe(0);
  });

  it("logs every call, and tells the listener", async () => {
    const seen: string[] = [];
    const t = make({}, { onLog: (e) => seen.push(`${e.method} ${e.path} ${e.status}`) });
    await call(t, "GET", "/products", { query: { limit: 3 } });
    await call(t, "POST", "/products", { body: {} });
    await call(t, "GET", "/nowhere");
    expect(seen).toEqual(["GET /products 200", "POST /products 422", "GET /nowhere 404"]);
    expect(t.log.map((e) => [e.operationId, e.note])).toEqual([
      ["listProducts", "1–3 / 24"],
      ["createProduct", "validation"],
      [undefined, "no route"],
    ]);
  });
});

describe("never throws", () => {
  it("answers whatever it is asked", async () => {
    const t = make();
    const odd: TransportRequest[] = [
      { method: "GET", path: "" },
      { method: "GET", path: "/products/%E0%A4%A" },
      { method: "POST", path: "/products", body: "not json" },
      { method: "POST", path: "/products", body: { name: { deep: [1, 2, { x: null }] }, price: [], category: 7 } },
      { method: "GET", path: "/products", query: { limit: ["1", "2"], cursor: "%%%" } },
      { method: "DELETE", path: "/products/../../etc" },
      { method: "POST", path: "/auth/refresh", body: null },
      { method: "OPTIONS" as "GET", path: "/products" },
      { method: "GET", path: `/${"a/".repeat(5000)}` },
    ];
    for (const r of odd) {
      const out = await t.request(r);
      expect(typeof out.status).toBe("number");
    }
    const broken = createMockTransport({ api: { endpoints: [{ operationId: "x", method: "get", path: "/x", responses: { "200": { description: "ok", content: { "application/json": { schema: { $ref: "#/components/schemas/Missing" } } } } } }] } }, { latency: false });
    expect((await broken.request({ method: "GET", path: "/x" })).status).toBe(200);
  });

  /* A shared document's mocks may ask for the most records a model can have (5000), each as wide as its schema can make
     it: every record used to be made with a budget of 4000 values, so one list took half a minute and 180 MB in the
     preview the document opens with. A model's records now share a budget, so many records are each smaller. */
  it("makes the records of a huge, wide model in bounded time and size", async () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) wide[`f${i}`] = { type: "array", minItems: 50, items: { type: "object", properties: { a: { type: "string" }, b: { type: "array", minItems: 50, items: { type: "string" } } } } };
    const api: ApiSpec = {
      models: [{ name: "Wide", schema: { type: "object", properties: { id: { type: "string" }, ...wide } } }],
      endpoints: [{ operationId: "listWide", method: "get", path: "/wide", responses: { "200": { description: "all", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Wide" } } } } } } }],
    };
    const t = createMockTransport({ api, mocks: { models: [{ name: "Wide", count: 5000 }] } }, { latency: false });
    const started = performance.now();
    const out = await t.request({ method: "GET", path: "/wide", operationId: "listWide" });
    expect(out.status).toBe(200);
    expect(out.body as unknown[]).toHaveLength(5000);
    expect(JSON.stringify(out.body).length).toBeLessThan(20_000_000);
    expect(performance.now() - started).toBeLessThan(8000);
    /* a model of the usual size keeps its whole budget: its records are as they were */
    const few = createMockTransport({ api, mocks: { models: [{ name: "Wide", count: 3 }] } }, { latency: false });
    const small = (await few.request({ method: "GET", path: "/wide", operationId: "listWide" })).body as Record<string, unknown>[];
    expect(JSON.stringify(small[0]).length).toBeGreaterThan(20_000);
  }, 120_000);
});

describe("realtime", () => {
  it("plays the channels' default scripts, answers what the app sends, and stops when closed", async () => {
    const clock = fakeClock();
    const t = createMockTransport({ api }, { clock, latency: false });
    const got: string[] = [];
    const room = t.connect("/rooms/r1", (m) => got.push(`${m.channel}:${m.message}`));
    expect(room.channel).toBe("room");
    await clock.advance(1300);
    expect(got).toEqual(["room:chatMessage"]);
    await clock.advance(1500);
    expect(got).toEqual(["room:chatMessage", "room:typing"]);
    room.send("chatMessage", { text: "hi" });
    await clock.advance(1000);
    expect(got.filter((x) => x === "room:chatMessage")).toHaveLength(2);
    room.close();
    await clock.advance(60_000);
    expect(got).toHaveLength(3);
    expect(clock.pending).toBe(0);
  });

  it("sends frames as the exported server does: the JSON payload alone over a WebSocket, the name as the event over SSE", async () => {
    const clock = fakeClock();
    const sseApi: ApiSpec = { ...api, channels: [...(api.channels ?? []), { id: "news", address: "/news", transport: "sse", messages: [{ name: "headline", payload: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } }], operations: [{ id: "onHeadline", action: "send" }] }] };
    const t = createMockTransport({ api: sseApi }, { clock, latency: false });
    const frames: string[] = [];
    const room = t.connect("wss://rt.chat.example/realtime/rooms/r1", (m) => frames.push(m.frame));
    expect(room.channel).toBe("room");
    expect(room.transport).toBe("websocket");
    const news = t.connect("http://localhost/api/news", (m) => frames.push(m.frame));
    expect(news.transport).toBe("sse");
    await clock.advance(1300);
    const ws = frames.find((f) => f.startsWith("{"))!;
    expect(Object.keys(JSON.parse(ws))).toEqual(expect.arrayContaining(["id", "roomId", "text", "author", "sentAt"]));
    expect(frames.find((f) => f.startsWith("event: "))).toMatch(/^event: headline\ndata: \{"title":".+"\}\n\n$/);
    /* what the app sends is the message it fits; a reply follows */
    const said = { id: "3f0c8a5e-1d2b-4c3a-9e8f-7a6b5c4d3e2f", roomId: "r1", author: { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", name: "Ann" }, text: "hi", sentAt: "2026-11-06T10:00:00Z" };
    expect(room.receive(JSON.stringify(said))).toBe("chatMessage");
    expect(room.receive(JSON.stringify({ text: 1 }))).toBeUndefined();
    expect(room.receive("not json")).toBeUndefined();
    const before = frames.length;
    await clock.advance(1000);
    expect(frames.length).toBeGreaterThan(before);
    t.close();
  });

  it("plays a script of the author's when an operation is called, with the payload laid over the made one", async () => {
    const clock = fakeClock();
    const t = createMockTransport({ api, mocks: { realtime: [{ id: "push", channel: "room", trigger: { on: "call", operationId: "createProduct" }, steps: [{ at: 200, message: "chatMessage", payload: { text: "A new product!" } }] }] } }, { clock, latency: false });
    const got: unknown[] = [];
    t.connect("room", (m) => got.push(m.payload));
    await clock.advance(5000);
    expect(got).toEqual([]);
    await t.request({ method: "POST", path: "/products", body: NEW });
    await clock.advance(200);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ text: "A new product!" });
    expect(Object.keys(got[0] as object).length).toBeGreaterThan(1);
  });
});

describe("determinism", () => {
  it("answers the same for the same seed, otherwise for another", async () => {
    const a = await call(make(), "GET", "/products");
    const b = await call(make(), "GET", "/products");
    const c = await call(make({ seed: 9 }), "GET", "/products");
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
    expect(JSON.stringify(c.body)).not.toBe(JSON.stringify(a.body));
  });
});
