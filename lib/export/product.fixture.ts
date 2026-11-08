/* A product to export in the tests and in scripts/check-product.ts: the proof document's screens (every kind of tap,
 * the shop flow) with a small contract beside them, so the client, the mocks, the server's routes and handlers and the
 * contract tests all have operations to be generated for: a path parameter, a query, a body, a 201, an example. */

import { readFileSync } from "node:fs";
import { proofDoc } from "../exportProject.fixture";
import { fromAsyncApi, fromOpenApi, mergeApi } from "../api";
import { fillMocks } from "../mocks/fill";
import { placeholderFile } from "../mocks/files";
import type { ApiEndpoint, ApiSpec, Doc } from "../tokens";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import type { Lang } from "../i18n";

export const FIXTURE_TYPES = `export type Health = { status: string }
export type Product = { id: string; name: string; price: number }
export type NewProduct = { name: string; price: number }
export type ProductList = { items: Product[]; next: string | null }
`;

const json = (schema: unknown, example?: unknown) => ({ content: { "application/json": { schema, ...(example === undefined ? {} : { example }) } } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const FIXTURE_OPENAPI: Record<string, unknown> = {
  openapi: "3.1.0",
  info: { title: "Proof app", version: "0.1.0" },
  paths: {
    "/health": { get: { operationId: "getHealth", responses: { "200": { description: "up", ...json(ref("Health"), { status: "ok" }) } } } },
    "/products": {
      get: { operationId: "listProducts", parameters: [{ name: "page", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "a page of products", ...json(ref("ProductList"), { items: [{ id: "p1", name: "Lamp", price: 25 }], next: null }) } } },
      post: { operationId: "createProduct", requestBody: { required: true, ...json(ref("NewProduct")) }, responses: { "201": { description: "made", ...json(ref("Product")) } } },
    },
    "/products/{id}": {
      get: { operationId: "getProduct", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "the product", ...json(ref("Product")) }, "404": { description: "no such product" } } },
      delete: { operationId: "deleteProduct", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "gone" } } },
    },
  },
  components: {
    schemas: {
      Health: { type: "object", properties: { status: { type: "string" } }, required: ["status"] },
      Product: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, price: { type: "number" } }, required: ["id", "name", "price"] },
      NewProduct: { type: "object", properties: { name: { type: "string" }, price: { type: "number" } }, required: ["name", "price"] },
      ProductList: { type: "object", properties: { items: { type: "array", items: ref("Product") }, next: { type: ["string", "null"] } }, required: ["items", "next"] },
    },
  },
};

export function productDoc(): { doc: Doc; widths: Record<string, number>; api: { openapi: Record<string, unknown>; types: string } } {
  const { doc, widths } = proofDoc();
  return { doc, widths, api: { openapi: FIXTURE_OPENAPI, types: FIXTURE_TYPES } };
}

const spec = (name: string) => readFileSync(new URL(`../api/fixtures/${name}`, import.meta.url), "utf8");

/** A real contract, read from the API's own fixtures (lib/api/fixtures): the shop's OpenAPI (sign-in three ways,
 *  cursor and offset paging, an image upload, problem+json errors, reusable responses) with the chat's AsyncAPI
 *  channels beside it, as Doc.api holds them once imported. */
export function shopApi(): ApiSpec {
  return mergeApi(fromOpenApi(spec("shop.openapi.yaml")).api, fromAsyncApi(spec("chat.asyncapi.yaml")).api, "asyncapi", "merge")!;
}

/** the shop's mock library as "fill the mocks" makes it, with a picture and a PDF in its files */
export function shopMocks(api: ApiSpec = shopApi()) {
  const filled = fillMocks(api, undefined, { locale: "en" });
  return { ...filled, files: [placeholderFile("image", { seed: "shop", title: "Sneaker", id: "sneaker" }), placeholderFile("pdf", { seed: "shop", title: "Receipt", id: "receipt" })] };
}

/** the proof document's screens with the shop's contract and its mocks as its own (Doc.api, Doc.mocks): the product
 *  reads them from the document */
export function shopProductDoc(): { doc: Doc; widths: Record<string, number> } {
  const { doc, widths } = proofDoc();
  const api = shopApi();
  return { doc: { ...doc, api, mocks: shopMocks(api) }, widths };
}

/** the sign-in the shop's mocks accept (and the handler scripts/check-mobile.ts writes): any other is turned down */
export const SHOP_SIGN_IN = { email: "ada@example.com", password: "correct horse" };

/** the shop's logo, a 24 × 24 PNG the document holds as data (a picture the author picked from a file) */
export const SHOP_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATElEQVR42mNgGAwgPWDJf2yYJoZSxTJSDSfJEnINJ8oSSg3Hawm1DMdpydC2gNqGY1gyasEIsGA0o9G9PBq44pouFQ5dqky6VPrUAgA4n4cu8KHOCAAAAABJRU5ErkJggg==";

/** a scenario of the shop's mocks where the server turns a new product's name down, on its field */
export const NAME_TAKEN = { id: "name-taken", name: "Name taken", ops: { createProduct: { status: 422, body: { type: "about:blank", title: "Unprocessable Content", status: 422, detail: "That name is taken.", errors: [{ pointer: "#/name", detail: "That name is taken" }] } } } };

/** A file the shop answers with: an order's receipt as a PDF (the mocks give the "Receipt" of their library), so the
 *  exported apps have a download whose bytes must arrive whole (scripts/check-product.ts reads it in the web app). */
export const RECEIPT_DOWNLOAD: ApiEndpoint = {
  operationId: "getOrderReceipt",
  method: "get",
  path: "/orders/{orderId}/receipt",
  summary: "The receipt of an order, as a PDF",
  tags: ["Orders"],
  parameters: [{ name: "orderId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
  responses: { "200": { description: "The receipt", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } } },
};

/** an order the receipt is asked for in the checks */
export const RECEIPT_ORDER = "00000000-0000-4000-8000-0000000000aa";

/** The shop bound to its own contract (lib/api/fixtures/shop.openapi.yaml, and an order's receipt to download beside
 *  it), built only through operations the way the AI and MCP build one: a sign-in screen, a paged product list with
 *  pull to refresh and its loading, empty, error and forbidden designs, a product's detail by its id in the screen's
 *  params, a form that adds a product (it needs a session) checked by the schema and by the server, the orders (they
 *  need a session too) and a picture of a product uploaded from a form. scripts/check-product.ts exports it and drives
 *  the web app and the mobile app. */
export function boundShopDoc(lang: Lang = "en"): { doc: Doc; widths: Record<string, number> } {
  const shop = shopApi();
  const api: ApiSpec = { ...shop, endpoints: [...(shop.endpoints ?? []), RECEIPT_DOWNLOAD] };
  const mocks = shopMocks(api);
  const store = new DocStore(stateOf({ groups: [], frames: [], api, mocks: { ...mocks, auth: { ...mocks.auth, accept: [SHOP_SIGN_IN] }, scenarios: [...(mocks.scenarios ?? []), NAME_TAKEN] } }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => lang });
  store.transact("Build the shop", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Shop" });
    tx.run(ops.addScreen, { id: "products", name: "Products" });
    tx.run(ops.addScreen, { id: "detail", name: "Product" });
    tx.run(ops.addScreen, { id: "create", name: "New product" });
    tx.run(ops.addScreen, { id: "login", name: "Sign in" });
    tx.run(ops.setScreenAuth, { screen: "login", auth: "login" });
    tx.run(ops.setScreenAuth, { screen: "create", auth: "required" });
    tx.run(ops.setScreenParams, { screen: "detail", params: [{ name: "productId", type: "string", example: "00000000-0000-4000-8000-000000000000" }] });
    tx.run(ops.wireScreen, { screen: "detail", operationId: "getProduct" });
    tx.run(ops.wireScreen, { screen: "products", operationId: "listProducts", detail: "detail", paging: "scroll" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "create", operationId: "createProduct", then: { to: "products", transition: "slide", effects: [{ do: "snackbar", message: "Added {{response.name}}" }] } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "login", operationId: "login", then: { to: "products", transition: "fade" } });
    /* the shop's logo under the sign-in form: a picture held as data, which each app writes as a file of its own */
    tx.run(ops.addPart, { slug: "image", id: "logo", screen: "login", at: { x: 174, y: 420 }, props: { src: SHOP_LOGO, alt: "Shop logo", width: 64, height: 64 } });
    tx.run(ops.addPart, { slug: "button", id: "add", screen: "products", at: { x: 16, y: 820 }, props: { label: "Add product" } });
    tx.run(ops.setAction, { id: "add", action: { to: "create", transition: "slide" } });
    /* the orders, which need a session; a picture of a product, uploaded with its progress (multipart/form-data) */
    tx.run(ops.addScreen, { id: "orders", name: "Orders" });
    tx.run(ops.setScreenAuth, { screen: "orders", auth: "required" });
    tx.run(ops.wireScreen, { screen: "orders", operationId: "listOrders" });
    /* who is signed in, loaded beside the orders: an operation that takes no input (GET /me), which the typed client
       calls with its init alone */
    tx.run(ops.addDataSource, { screen: "orders", operationId: "getMe" });
    tx.run(ops.addPart, { slug: "button", id: "to-orders", screen: "products", at: { x: 220, y: 820 }, props: { label: "Orders", variant: "tonal" } });
    tx.run(ops.setAction, { id: "to-orders", action: { to: "orders", transition: "slide" } });
    tx.run(ops.addScreen, { id: "photo", name: "Photo" });
    tx.run(ops.setScreenParams, { screen: "photo", params: [{ name: "productId", type: "string", example: "00000000-0000-4000-8000-000000000000" }] });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "photo", operationId: "uploadProductImage", params: { productId: "params.productId" }, then: { to: "back", transition: "slide", effects: [{ do: "snackbar", message: "Photo added" }] } });
    tx.run(ops.addPart, { slug: "button", id: "add-photo", screen: "detail", at: { x: 16, y: 820 }, props: { label: "Add a photo", variant: "tonal" } });
    tx.run(ops.setAction, { id: "add-photo", action: { to: "photo", transition: "slide", params: { productId: "params.productId" } } });
  });
  return { doc: savedDoc(store.get()), widths: {} };
}
