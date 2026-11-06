/* A product to export in the tests and in scripts/check-product.ts: the proof document's screens (every kind of tap,
 * the shop flow) with a small contract beside them, so the client, the mocks, the server's routes and handlers and the
 * contract tests all have operations to be generated for: a path parameter, a query, a body, a 201, an example. */

import { readFileSync } from "node:fs";
import { proofDoc } from "../exportProject.fixture";
import { fromAsyncApi, fromOpenApi, mergeApi } from "../api";
import { fillMocks } from "../mocks/fill";
import { placeholderFile } from "../mocks/files";
import { DocStore, counterIds, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import type { ApiSpec, Doc } from "../tokens";

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

/** the sign-in the shop's mocks (and the handler scripts/check-product.ts writes) accept */
export const SHOP_SIGN_IN = { email: "ada@shop.example", password: "correct horse" };

/** The shop's screens bound to its contract, built only through operations the way the AI and MCP build them: a
 *  sign-in screen, a catalog that pages and pulls to refresh, an item opened by its id, a form that sells a product, and
 *  the orders, which need a session. */
export function bindShop(doc: Doc): Doc {
  const store = new DocStore(stateOf(doc), { ids: counterIds("shop"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Bind the shop", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "shop-signin", name: "Sign in" });
    tx.run(ops.addScreen, { id: "shop-catalog", name: "Catalog" });
    tx.run(ops.addScreen, { id: "shop-item", name: "Item" });
    tx.run(ops.addScreen, { id: "shop-sell", name: "Sell" });
    tx.run(ops.addScreen, { id: "shop-orders", name: "Orders" });
    tx.run(ops.setScreenAuth, { screen: "shop-signin", auth: "login" });
    tx.run(ops.setScreenAuth, { screen: "shop-orders", auth: "required" });
    tx.run(ops.wireScreen, { screen: "shop-item", operationId: "getProduct" });
    tx.run(ops.wireScreen, { screen: "shop-catalog", operationId: "listProducts", detail: "shop-item" });
    tx.run(ops.wireScreen, { screen: "shop-orders", operationId: "listOrders" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "shop-sell", operationId: "createProduct", fields: ["name", "price.amount", "category", "description"], values: { "price.currency": "'CNY'" }, then: { to: "shop-catalog", transition: "slide", effects: [{ do: "snackbar", message: "Added {{response.name}}" }] } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "shop-signin", operationId: "login", then: { to: "shop-catalog", transition: "fade" } });
    /* a picture of an item, uploaded with its progress (multipart/form-data) */
    tx.run(ops.addScreen, { id: "shop-photo", name: "Photo" });
    tx.run(ops.setScreenParams, { screen: "shop-photo", params: [{ name: "productId", type: "string" }] });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "shop-photo", operationId: "uploadProductImage", params: { productId: "params.productId" }, then: { to: "back", transition: "slide", effects: [{ do: "snackbar", message: "Photo added" }] } });
    tx.run(ops.addPart, { slug: "button", id: "shop-photo-button", screen: "shop-item", at: { x: 16, y: 800 }, props: { label: "Add a photo", variant: "tonal" } });
    tx.run(ops.setAction, { id: "shop-photo-button", action: { to: "shop-photo", transition: "slide", params: { productId: "params.productId" } } });
    tx.run(ops.addPart, { slug: "button", id: "shop-sell-button", screen: "shop-catalog", at: { x: 16, y: 800 }, props: { label: "Sell" } });
    tx.run(ops.setAction, { id: "shop-sell-button", action: { to: "shop-sell", transition: "slide" } });
    tx.run(ops.addPart, { slug: "button", id: "shop-orders-button", screen: "shop-catalog", at: { x: 220, y: 800 }, props: { label: "Orders", variant: "tonal" } });
    tx.run(ops.setAction, { id: "shop-orders-button", action: { to: "shop-orders", transition: "slide" } });
  });
  return savedDoc(store.get());
}

/** the proof document's screens with the shop's contract and its mocks as its own (Doc.api, Doc.mocks), and the shop's
 *  own screens bound to it: the product reads them from the document */
export function shopProductDoc(): { doc: Doc; widths: Record<string, number> } {
  const { doc, widths } = proofDoc();
  const api = shopApi();
  const mocks = shopMocks(api);
  /* a sign-in that wants the right password, and a scenario where the server turns a product's name down */
  const taken = { id: "name-taken", name: "Name taken", ops: { createProduct: { status: 422, body: { type: "about:blank", title: "The product is not valid", status: 422, errors: [{ pointer: "#/name", detail: "That name is taken" }] } } } };
  return { doc: bindShop({ ...doc, api, mocks: { ...mocks, auth: { ...mocks.auth, accept: [SHOP_SIGN_IN] }, scenarios: [...(mocks.scenarios ?? []), taken] } }), widths };
}
