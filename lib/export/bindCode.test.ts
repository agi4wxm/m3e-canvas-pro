import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { endpointOf, formFields } from "../bindings/contract";
import { setGlobalLang } from "../i18n";
import { answerShape, fieldRule, formRules, holdsCode, isApiEffect, listCode, okStatus, pageSizeOf, paneState, paramPlaces, placeArgs, readCode, readOf, regionOptions } from "./bindCode";
import { buildProduct } from "./product";
import { boundShopDoc, shopApi } from "./product.fixture";

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

setGlobalLang("en");

describe("what every front end prints of the bindings", () => {
  const api = shopApi();
  const ep = (id: string) => endpointOf(api, id)!;

  it("places a call's arguments as the contract does, and reads how an answer lists and pages", () => {
    const places = paramPlaces(api, ep("listOrders"));
    expect(Object.fromEntries(places)).toEqual({ offset: "query", limit: "query", "X-Request-Id": "header" });
    expect(placeArgs({ limit: "10", "X-Request-Id": "'r1'", note: "form.note" }, places)).toEqual({ query: [["limit", "10"]], headers: [["X-Request-Id", "'r1'"]], fields: [["note", "form.note"]] });
    expect(answerShape(api, ep("listProducts"))).toEqual({ list: { field: "items" }, paging: { style: "cursor", items: "items", cursorParam: "cursor", nextField: "nextCursor", limitParam: "limit" } });
    expect(answerShape(api, ep("getProduct"))).toEqual({});
    expect(pageSizeOf({ pageSize: 20.7 }, true)).toBe(20);
    expect(pageSizeOf({ pageSize: 20 }, false)).toBeUndefined();
    expect(okStatus(ep("createProduct"))).toBe(201);
    expect(okStatus({ ...ep("getProduct"), responses: { "4XX": { description: "no" } } })).toBe(200);
  });

  it("checks a form's fields by the same rules everywhere, whole or only what the check reads", () => {
    const e = ep("createProduct");
    const spec = formFields(api, e).find((f) => f.name === "name")!;
    expect(fieldRule(spec)).toEqual({ kind: spec.kind, required: true, schema: { type: "string", minLength: 1, maxLength: 120 } });
    expect(fieldRule(spec, true).schema).toBe(spec.schema);
    expect(fieldRule(undefined)).toEqual({ kind: "text", required: false, schema: {} });
    expect(Object.keys(formRules(api, e))).toEqual(formFields(api, e).map((f) => f.name));
    expect(Object.keys(formRules(api, e, { only: new Set(["price.amount", "name"]) }))).toEqual(["name", "price.amount"]);
  });

  it("says which state a region's design is for, how its state is chosen, and how the scope reads", () => {
    expect([0, 1, 2, 3, 4, 9, -1, undefined].map((pane) => paneState({ pane }))).toEqual(["ready", "loading", "empty", "error", "forbidden", "forbidden", "ready", "ready"]);
    expect(regionOptions(undefined, undefined, "$", true)).toEqual(['load: "enter"']);
    expect(regionOptions(undefined, "len(data.cart.items) == 0", "$1", false)).toEqual(['emptyWhen: () => $1.holds("len(data.cart.items) == 0")']);
    expect(regionOptions("demand", undefined, "$", false)).toEqual(['load: "demand"']);
    expect(["text", "image", "color", "number", "bool", "enum", "list", "table"].map((k) => readOf(k as never))).toEqual(["text", "text", "text", "num", "bool", "pick", "rows", null]);
    expect(readCode("num", "$", "item.count", ["0", "1", "9"])).toBe('$.num("item.count", 0, 1, 9)');
    expect(readCode("rows", "$r1", "item.tags", ["[]", "50"])).toBe('rowsOf($r1.ev("item.tags"), [], 50)');
    expect(holdsCode("$form", "form.error")).toBe('$form.holds("form.error")');
    expect(listCode("$", "data.products.items", 2.6)).toBe('$.list("data.products.items").slice(0, 2)');
    expect(listCode("$", "data.products.items", 0)).toBe('$.list("data.products.items").slice(0, 0)');
    expect(listCode("$", "data.products.items", undefined)).toBe('$.list("data.products.items")');
    expect(["call", "refresh", "loadMore", "submit", "signOut", "show", "setVar", "snackbar"].map((d) => isApiEffect({ do: d } as never))).toEqual([true, true, true, true, true, false, false, false]);
  });

  it("gives the web, the phone and the mini-program the same rules, scope reads and region choices for the bound shop", async () => {
    const { doc, widths } = boundShopDoc();
    const p = await buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const text = (path: string) => String(p.files[path].body);
    const web = text("apps/web/src/generated/screens/ProductsScreen.tsx") + text("apps/web/src/generated/screens/NewProductScreen.data.ts");
    const mobile = text("apps/mobile/src/generated/screens/ProductsScreen.tsx");
    const miniapp = text("apps/miniapp/src/generated/screens/ProductsScreen.tsx") + text("apps/miniapp/src/generated/screens/NewProductScreen.tsx");
    /* the rules of the new product's form: the web keeps what its check reads, the others the whole schema */
    for (const [field, rule] of Object.entries(formRules(doc.api!, endpointOf(doc.api, "createProduct")!, { whole: true }))) {
      const key = /^[A-Za-z]\w*$/.test(field) ? field : JSON.stringify(field);
      expect(web).toContain(`${key}: { kind: ${JSON.stringify(rule.kind)}, required: ${rule.required}`);
      expect(miniapp).toContain(`${key}: { kind: ${JSON.stringify(rule.kind)}, required: ${rule.required}`);
    }
    for (const code of [web, mobile, miniapp]) {
      expect(code).toContain('.text("item.name")');
      expect(code).toContain('.list("data.products.items")');
    }
    expect(mobile).toContain('regionOf(products, { load: "enter" })');
    expect(miniapp).toContain('regionOf(products, { load: "enter" })');
    expect(web).toContain("useRegion(products)");
  });
});
