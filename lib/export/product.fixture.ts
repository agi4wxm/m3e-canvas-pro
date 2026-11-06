/* A product to export in the tests and in scripts/check-product.ts: the proof document's screens (every kind of tap,
 * the shop flow) with a small contract beside them, so the client, the mocks, the server's routes and handlers and the
 * contract tests all have operations to be generated for: a path parameter, a query, a body, a 201, an example. */

import { proofDoc } from "../exportProject.fixture";
import type { Doc } from "../tokens";

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
