/* A small shop bound to its contract, built only through operations the way the AI and MCP build one: a product model,
 * a paged list, a detail by id, a form that creates a product, a sign-in, screens wired to them. The tests of the
 * bindings (unit and end to end) start from it, and a fake transport (`shopTransport`) answers its calls. */

import type { Transport, TransportRequest, TransportResponse } from "../api/transport";
import type { JsonSchemaObject } from "../api/types";
import { DocStore, counterIds, guessMeasurer, savedDoc, stateOf, ops } from "../core";
import type { Lang } from "../i18n";
import type { Doc } from "../tokens";

const product: JsonSchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 2, maxLength: 60 },
    price: { type: "number", minimum: 0 },
    description: { type: "string" },
    createdAt: { type: "string", format: "date-time", readOnly: true },
  },
  required: ["id", "name", "price"],
};

/** the shop: its API, a sign-in screen, a list, a detail and a form, wired. `origin` "mcp" checks every call strictly. */
export function shopDoc(o: { lang?: Lang; paging?: "scroll" | "button"; /** the API and the screens only, nothing bound */ unwired?: boolean } = {}): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => o.lang ?? "en" });
  store.transact("Build the shop", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Shop" });
    tx.run(ops.addModel, { name: "Product", schema: product });
    tx.run(ops.addModel, {
      name: "NewProduct",
      schema: { type: "object", properties: { name: { type: "string", minLength: 2, maxLength: 60, title: "Name" }, price: { type: "number", minimum: 0, title: "Price" }, email: { type: "string", format: "email", title: "Contact email" } }, required: ["name", "price"] },
    });
    tx.run(ops.addEndpoint, {
      operationId: "listProducts",
      method: "get",
      path: "/products",
      summary: "Products",
      returns: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Product" } }, nextCursor: { type: ["string", "null"] } }, required: ["items"] },
      pagination: { style: "cursor", items: "items" },
    });
    tx.run(ops.addEndpoint, { operationId: "getProduct", method: "get", path: "/products/{productId}", returns: { $ref: "#/components/schemas/Product" } });
    tx.run(ops.addEndpoint, { operationId: "createProduct", method: "post", path: "/products", summary: "Add product", body: { $ref: "#/components/schemas/NewProduct" }, returns: { $ref: "#/components/schemas/Product" } });
    tx.run(ops.addEndpoint, {
      operationId: "login",
      method: "post",
      path: "/auth/login",
      summary: "Sign in",
      body: { type: "object", properties: { email: { type: "string", format: "email", title: "Email" }, password: { type: "string", format: "password", minLength: 8, title: "Password" } }, required: ["email", "password"] },
      returns: { type: "object", properties: { accessToken: { type: "string" }, refreshToken: { type: "string" }, user: { type: "object", properties: { name: { type: "string" } } } }, required: ["accessToken"] },
      status: "200",
      security: [],
    });
    tx.run(ops.addEndpoint, { operationId: "logout", method: "post", path: "/auth/logout", status: "204" });
    tx.run(ops.setAuth, { schemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }, security: [{ bearerAuth: [] }], login: "login", logout: "logout" });

    tx.run(ops.addScreen, { id: "login", name: "Sign in" });
    tx.run(ops.addScreen, { id: "products", name: "Products" });
    tx.run(ops.addScreen, { id: "detail", name: "Product" });
    tx.run(ops.addScreen, { id: "create", name: "New product" });
    tx.run(ops.setScreenAuth, { screen: "login", auth: "login" });
    tx.run(ops.setScreenParams, { screen: "detail", params: [{ name: "productId", type: "string", example: "p1" }] });

    if (o.unwired) return;
    tx.run(ops.wireScreen, { screen: "detail", operationId: "getProduct" });
    tx.run(ops.wireScreen, { screen: "products", operationId: "listProducts", detail: "detail", ...(o.paging ? { paging: o.paging } : {}) });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "create", operationId: "createProduct", then: { to: "products", transition: "slide", effects: [{ do: "snackbar", message: "Added {{response.name}}" }] } });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    tx.run(ops.makeForm, { screen: "login", operationId: "login", then: { to: "products", transition: "fade" } });
    tx.run(ops.addPart, { slug: "button", id: "add", screen: "products", at: { x: 16, y: 800 }, props: { label: "Add product" } });
    tx.run(ops.setAction, { id: "add", action: { to: "create", transition: "slide" } });
  });
  return savedDoc(store.get());
}

export type ShopProduct = { id: string; name: string; price: number; description?: string; createdAt?: string };

/** products to answer with: `n` of them, ids p1… */
export const sampleProducts = (n: number): ShopProduct[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Product ${i + 1}`, price: 10 + i, description: `The ${i + 1}th product`, createdAt: "2026-11-01T10:00:00Z" }));

const json = (status: number, body?: unknown): TransportResponse => ({ status, headers: body === undefined ? {} : { "content-type": status >= 400 ? "application/problem+json" : "application/json" }, body });

/** A fake back end for the shop, in memory: pages of products by cursor, one by id, a created one checked like a
 *  server would, a sign-in that wants the right password, and every other call needing its token. `delay` waits
 *  before answering; `fail` answers an operation with a status; `log` keeps every request. */
export function shopTransport(o: { products?: ShopProduct[]; pageSize?: number; delay?: number; fail?: Record<string, number>; requireAuth?: boolean; log?: TransportRequest[] } = {}): Transport & { products: ShopProduct[] } {
  const products = [...(o.products ?? sampleProducts(25))];
  const tokens = new Set<string>();
  return {
    products,
    async request(req) {
      o.log?.push(req);
      if (o.delay) await new Promise((r) => setTimeout(r, o.delay));
      const op = req.operationId ?? "";
      if (o.fail?.[op]) return json(o.fail[op], { type: "about:blank", title: o.fail[op] === 403 ? "Forbidden" : "Server error", status: o.fail[op], detail: `The server said no to ${op}.` });
      if (op === "login") {
        const b = (req.body ?? {}) as { email?: string; password?: string };
        if (b.password !== "correct horse") return json(401, { title: "Wrong email or password", status: 401, errors: [{ pointer: "#/password", detail: "That password is not right" }] });
        const token = `t${tokens.size + 1}`;
        tokens.add(token);
        return json(200, { accessToken: token, refreshToken: `r${token}`, user: { name: b.email?.split("@")[0] ?? "you" } });
      }
      const auth = req.headers?.Authorization ?? req.headers?.authorization;
      if (o.requireAuth && !(auth && tokens.has(auth.replace(/^Bearer /, "")))) return json(401, { title: "Sign in first", status: 401 });
      if (op === "listProducts") {
        const size = Number(req.query?.limit ?? o.pageSize ?? 10);
        const from = req.query?.cursor ? Number(req.query.cursor) : 0;
        const items = products.slice(from, from + size);
        return json(200, { items, nextCursor: from + size < products.length ? String(from + size) : null });
      }
      if (op === "getProduct") {
        const id = decodeURIComponent(req.path.split("/").pop() ?? "");
        const p = products.find((x) => x.id === id);
        return p ? json(200, p) : json(404, { title: "Not found", status: 404 });
      }
      if (op === "createProduct") {
        const b = (req.body ?? {}) as { name?: string; price?: number };
        if (typeof b.name === "string" && b.name.toLowerCase().includes("taken")) return json(422, { title: "Unprocessable", status: 422, errors: [{ pointer: "#/name", detail: "That name is taken" }] });
        const p = { id: `p${products.length + 1}`, name: String(b.name), price: Number(b.price), createdAt: "2026-11-06T10:00:00Z" };
        products.unshift(p);
        return json(201, p);
      }
      if (op === "logout") return json(204);
      return json(404, { title: "No such route", status: 404 });
    },
  };
}
