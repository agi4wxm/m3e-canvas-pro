/* The product-layer tasks' graders on documents made with operations, no model: each task done the way a good turn
 * would do it (only through the tools' operations, so it is also proof the tools can do it) passes every check, and
 * the starting document fails the critical ones. The preview and the exported product are worked out as the harness
 * works them out after a turn (evals/product.ts). */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, opByName, savedDoc, stateOf, type CoreState, type Tx } from "../lib/core";
import { setGlobalLang } from "../lib/i18n";
import { emptyUsage } from "../lib/llm";
import type { Group } from "../lib/tokens";
import { fixtureDoc } from "./fixtures";
import { score } from "./graders";
import { previewsOf, productOf } from "./product";
import { taskById } from "./tasks";
import type { Observed } from "./types";

const run = (tx: Tx, name: string, args: Record<string, unknown>) => tx.run(opByName(name)! as never, args as never) as Record<string, unknown> | undefined;

/** the repeat's row on a screen made by wire_screen: the container repeating, and its first child */
function wiredRow(s: CoreState, screen: string): { region: string; row: string } {
  const host = s.doc.groups.find((g) => g.repeat?.data && g.states && s.doc.frames.some((f) => f.id === screen))!;
  const row = s.doc.groups.find((g) => g.inFlow === host.id && !g.pane)!;
  return { region: host.items[0].id, row: row.items[0].id };
}

/** a region's design texts on a pane, by reading order */
function designTexts(s: CoreState, region: string, pane: number): string[] {
  const host = s.doc.groups.find((g) => g.items[0]?.id === region)!;
  const design = s.doc.groups.find((g) => g.inFlow === host.id && g.pane === pane)!;
  const out: string[] = [];
  const visit = (g: Group) => {
    for (const c of s.doc.groups.filter((x) => x.inFlow === g.id)) {
      for (const it of c.items) if (it.component === "text") out.push(it.id);
      visit(c);
    }
  };
  visit(design);
  return out;
}

async function observe(taskId: string, change: (tx: Tx) => void): Promise<Observed> {
  const task = taskById(taskId)!;
  setGlobalLang(task.lang);
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("t"), measurer: guessMeasurer, lang: () => task.lang });
  store.load(fixtureDoc(task.fixture), true);
  const start = savedDoc(store.get());
  const startWidths = guessMeasurer.measure(store.get());
  store.transact("AI", "ai", change);
  const final = savedDoc(store.get());
  const widths = guessMeasurer.measure(store.get());
  return {
    task: taskId,
    lang: task.lang,
    request: task.request,
    model: "scripted",
    effort: "medium",
    start,
    final,
    startWidths,
    widths,
    calls: [],
    stop: "end_turn",
    text: "Done.",
    usage: { ...emptyUsage(), input: 1000, output: 100 },
    turnUsage: emptyUsage(),
    ms: 1000,
    steps: 3,
    drawings: 0,
    undo: { steps: 1, restores: true },
    shots: [],
    budget: task.budget,
    ...(final.api?.endpoints?.length ? { preview: await previewsOf(final, task.lang, widths), product: await productOf(final, widths, task.lang) } : {}),
  };
}

const failed = (o: Observed) =>
  score(taskById(o.task)!.checks, o)
    .verdicts.filter((v) => !v.pass)
    .map((v) => `${v.id}: ${v.detail}`);

const criticalFailed = (o: Observed) =>
  score(taskById(o.task)!.checks, o)
    .verdicts.filter((v) => !v.pass && v.critical)
    .map((v) => v.id);

const PRODUCT = {
  type: "object",
  properties: { id: { type: "string", format: "uuid", readOnly: true }, name: { type: "string" }, description: { type: "string" }, price: { type: "number" }, image: { type: "string", format: "uri" } },
  required: ["id", "name", "price"],
};
const page = (model: string) => ({ type: "object", properties: { items: { type: "array", items: { $ref: `#/components/schemas/${model}` } }, nextCursor: { type: ["string", "null"] } }, required: ["items"] });

const IDEAL: Record<string, (tx: Tx) => void> = {
  "shop-api-wire": (tx) => {
    run(tx, "add_model", { name: "Product", schema: PRODUCT });
    run(tx, "add_endpoint", { operationId: "listProducts", method: "get", path: "/products", returns: page("Product"), pagination: { style: "cursor", items: "items" } });
    run(tx, "add_endpoint", { operationId: "getProduct", method: "get", path: "/products/{productId}", returns: { $ref: "#/components/schemas/Product" } });
    run(tx, "add_data_source", { screen: "products", operationId: "listProducts", pullToRefresh: true, paging: "scroll" });
    run(tx, "remove_nodes", { ids: ["row-2", "row-2-image", "row-2-words", "row-2-name", "row-2-line", "row-2-price"] });
    run(tx, "set_repeat", { id: "product-list", repeat: { data: "data.products.items" } });
    for (const [id, prop, expr] of [["row-1-image", "src", "item.image"], ["row-1-name", "text", "item.name"], ["row-1-line", "text", "item.description"], ["row-1-price", "text", "currency(item.price)"]]) run(tx, "bind_expression", { id, prop, expr });
    run(tx, "set_region", { id: "product-list", source: "products" });
    run(tx, "fill_mocks", {});
  },
  "create-form": (tx) => {
    run(tx, "add_endpoint", {
      operationId: "createProduct",
      method: "post",
      path: "/products",
      body: { type: "object", properties: { name: { type: "string", minLength: 2, maxLength: 60 }, price: { type: "number", minimum: 0 }, description: { type: "string" } }, required: ["name", "price"] },
      returns: { $ref: "#/components/schemas/Product" },
    });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function
    run(tx, "make_form", { screen: "new-product", operationId: "createProduct", then: { to: "products" } });
  },
  "detail-params": (tx) => {
    run(tx, "wire_screen", { screen: "product", operationId: "getProduct" });
    const { row } = wiredRow(tx.state, "products");
    run(tx, "set_action", { id: row, action: { to: "product", params: { productId: "item.id" } } });
  },
  "login-guard": (tx) => {
    run(tx, "add_endpoint", {
      operationId: "login",
      method: "post",
      path: "/auth/login",
      body: { type: "object", properties: { email: { type: "string", format: "email" }, password: { type: "string", format: "password", minLength: 8 } }, required: ["email", "password"] },
      returns: { type: "object", properties: { accessToken: { type: "string" }, refreshToken: { type: "string" } }, required: ["accessToken"] },
      status: "200",
      security: [],
    });
    run(tx, "set_auth", { schemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }, security: [{ bearerAuth: [] }], login: "login" });
    run(tx, "add_screen", { id: "login", name: "Log in" });
    run(tx, "set_screen_auth", { screen: "login", auth: "login" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function
    run(tx, "make_form", { screen: "login", operationId: "login", then: { to: "orders" } });
    run(tx, "set_screen_auth", { screen: "orders", auth: "required" });
  },
  "import-openapi": (tx) => {
    run(tx, "import_openapi", { text: readFileSync(join(new URL(".", import.meta.url).pathname, "fixtures", "shop-backend.openapi.yaml"), "utf8") });
    run(tx, "wire_screen", { screen: "products", operationId: "listProducts" });
    run(tx, "wire_screen", { screen: "orders", operationId: "listOrders" });
  },
  "scenarios-states": (tx) => {
    run(tx, "add_mock_scenario", { id: "empty-shop", name: "Empty shop", all: { empty: true } });
    run(tx, "add_mock_scenario", { id: "server-error", name: "Server error", all: { status: 500 } });
    run(tx, "add_mock_scenario", { id: "slow", name: "Slow network", latency: { min: 2800, max: 3200 } });
    const { region } = wiredRow(tx.state, "products");
    const [emptyTitle, emptyLine] = designTexts(tx.state, region, 2);
    run(tx, "set_props", { id: emptyTitle, props: { text: "No products yet" } });
    run(tx, "set_props", { id: emptyLine, props: { text: "New arrivals show up here." } });
    run(tx, "set_props", { id: designTexts(tx.state, region, 3)[0], props: { text: "The shop is closed for a moment" } });
  },
  "chat-realtime": (tx) => {
    run(tx, "add_model", { name: "Message", schema: { type: "object", properties: { id: { type: "string", format: "uuid" }, author: { type: "string" }, text: { type: "string" }, sentAt: { type: "string", format: "date-time" } }, required: ["id", "author", "text"] } });
    run(tx, "add_endpoint", { operationId: "listMessages", method: "get", path: "/messages", returns: page("Message"), pagination: { style: "cursor", items: "items" } });
    run(tx, "add_endpoint", { operationId: "sendMessage", method: "post", path: "/messages", body: { type: "object", properties: { text: { type: "string", minLength: 1 } }, required: ["text"] }, returns: { $ref: "#/components/schemas/Message" } });
    run(tx, "add_channel", {
      id: "chat",
      address: "/chat",
      messages: [{ name: "message", payload: { $ref: "#/components/schemas/Message" } }],
      operations: [
        { id: "onMessage", action: "send", messages: ["message"] },
        { id: "postMessage", action: "receive", messages: ["message"] },
      ],
    });
    run(tx, "set_mock_realtime", { channel: "chat", trigger: { on: "call", operationId: "sendMessage" }, steps: [{ at: 1200, message: "message" }] });
    run(tx, "add_data_source", { screen: "chat", operationId: "listMessages" });
    run(tx, "remove_nodes", { ids: ["msg-2", "msg-2-author", "msg-2-text"] });
    run(tx, "set_repeat", { id: "messages", repeat: { data: "data.messages.items" } });
    run(tx, "bind_expression", { id: "msg-1-author", prop: "text", expr: "item.author" });
    run(tx, "bind_expression", { id: "msg-1-text", prop: "text", expr: "item.text" });
    run(tx, "set_region", { id: "messages", source: "messages" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function
    run(tx, "set_form", { id: "composer", form: { operationId: "sendMessage", then: { to: "none", effects: [{ do: "refresh", source: "messages" }] } } });
    run(tx, "bind_field", { id: "draft", field: "text" });
    run(tx, "set_action", { id: "send", action: { to: "none", effects: [{ do: "submit" }] } });
    run(tx, "fill_mocks", {});
  },
  "ledger-app-zh": (tx) => {
    run(tx, "add_model", {
      name: "Bill",
      schema: { type: "object", properties: { id: { type: "string", format: "uuid", readOnly: true }, title: { type: "string", title: "名称" }, amount: { type: "number", title: "金额" }, category: { type: "string", title: "分类", enum: ["餐饮", "交通", "购物", "其他"] }, date: { type: "string", format: "date", title: "日期" }, note: { type: "string", title: "备注" } }, required: ["id", "title", "amount", "date"] },
    });
    run(tx, "add_endpoint", { operationId: "listBills", method: "get", path: "/bills", returns: page("Bill"), pagination: { style: "cursor", items: "items" } });
    run(tx, "add_endpoint", { operationId: "getBill", method: "get", path: "/bills/{billId}", returns: { $ref: "#/components/schemas/Bill" } });
    run(tx, "add_endpoint", {
      operationId: "createBill",
      method: "post",
      path: "/bills",
      body: { type: "object", properties: { title: { type: "string", title: "名称", minLength: 1 }, amount: { type: "number", title: "金额", exclusiveMinimum: 0 }, category: { type: "string", title: "分类", enum: ["餐饮", "交通", "购物", "其他"] }, date: { type: "string", title: "日期", format: "date" } }, required: ["title", "amount", "date"] },
      returns: { $ref: "#/components/schemas/Bill" },
    });
    run(tx, "set_screen", { id: "home", patch: { name: "账单" } });
    run(tx, "add_screen", { id: "bill", name: "账单详情" });
    run(tx, "add_screen", { id: "new-bill", name: "记一笔" });
    run(tx, "add_part", { slug: "app-bar", screen: "home", at: { x: 0, y: 0 }, props: { title: "账单" } });
    run(tx, "add_part", { slug: "app-bar", screen: "bill", at: { x: 0, y: 0 }, props: { title: "账单详情", leading: "arrow_back" } });
    run(tx, "add_part", { slug: "app-bar", screen: "new-bill", at: { x: 0, y: 0 }, props: { title: "记一笔", leading: "close" } });
    run(tx, "wire_screen", { screen: "home", operationId: "listBills", detail: "bill" });
    run(tx, "wire_screen", { screen: "bill", operationId: "getBill" });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function
    run(tx, "make_form", { screen: "new-bill", operationId: "createBill", submitLabel: "保存", then: { to: "home" } });
    run(tx, "fill_mocks", {});
  },
};

describe("the product tasks, done the way a good turn would do them", () => {
  for (const [id, change] of Object.entries(IDEAL))
    it(`${id}: passes every check`, async () => {
      const o = await observe(id, change);
      expect(failed(o)).toEqual([]);
    }, 30_000);
});

describe("the product tasks' starting documents", () => {
  it("fail the critical checks", async () => {
    for (const id of Object.keys(IDEAL)) {
      const o = await observe(id, () => {});
      expect(criticalFailed(o).length, id).toBeGreaterThan(0);
    }
  }, 60_000);
});
