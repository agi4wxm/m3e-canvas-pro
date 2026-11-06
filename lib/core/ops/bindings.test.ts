/* The operations that bind screens to the contract, headless and strict as the AI and MCP call them: what each writes,
 * what each refuses and why, one undo step each, a source renamed with the expressions that read it, a region's
 * designs on their panes, a form composed from a schema, the whole of it through a project file and back, and a
 * document without bindings left exactly as it was. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { openProject, projectFile } from "../../project";
import { formatProject } from "../projectFile";
import { REGION_STATES, type Doc } from "../../tokens";
import { shopDoc } from "../../bindings/fixture";
import { expandDoc } from "../../expand";
import { canvasView } from "../../expand";
import { outOfPane } from "../../flow";
import { counterIds, DocStore } from "../store";
import type { Op } from "../op";
import { guessMeasurer } from "../op";
import { savedDoc, stateOf } from "../state";
import * as ops from ".";
import { sourceNameFor } from "./bindings";

beforeAll(() => setGlobalLang("en"));

/** a store on the shop's API and screens with nothing bound, every call strict */
function shop() {
  const s = new DocStore(stateOf(shopDoc({ unwired: true })), { ids: counterIds("t"), measurer: guessMeasurer, lang: () => "en" });
  /* arguments as a model writes them: checked by the operation, not by TypeScript */
  const run = (o: Op<never, unknown> | object, args: Record<string, unknown>) => s.run(o as never, args as never, { origin: "mcp" });
  const doc = () => s.get().doc;
  const frame = (id: string) => doc().frames.find((f) => f.id === id)!;
  return { s, run, doc, frame };
}

const refused = (fn: () => unknown, words: RegExp) => {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err, `refused with ${words}`).toBeInstanceOf(Error);
  expect((err as Error).message).toMatch(words);
};

describe("data sources", () => {
  it("are added, named from the endpoint, given the screen's params for their path, changed, renamed and removed", () => {
    const { s, run, frame } = shop();
    expect(sourceNameFor("listProducts")).toBe("products");
    expect(sourceNameFor("getProduct", ["product"])).toBe("product2");
    const steps = s.history().length;
    const out = run(ops.addDataSource, { screen: "detail", operationId: "getProduct" }) as { name: string; addedParams: string[] };
    expect(out).toEqual({ name: "product", addedParams: [] });
    expect(frame("detail").data).toEqual([{ name: "product", operationId: "getProduct", params: { productId: "params.productId" } }]);
    expect(s.history().length).toBe(steps + 1);
    /* a screen without the param gets it declared */
    expect((run(ops.addDataSource, { screen: "create", operationId: "getProduct", name: "p" }) as { addedParams: string[] }).addedParams).toEqual(["productId"]);
    expect(frame("create").params).toEqual([{ name: "productId" }]);
    run(ops.updateDataSource, { screen: "detail", name: "product", load: "demand", pullToRefresh: true });
    expect(frame("detail").data![0]).toMatchObject({ load: "demand", pullToRefresh: true });
    run(ops.updateDataSource, { screen: "detail", name: "product", load: null });
    expect(frame("detail").data![0].load).toBeUndefined();
    run(ops.removeDataSource, { screen: "create", name: "p" });
    expect(frame("create").data).toBeUndefined();
    s.undo();
    expect(frame("create").data?.map((d) => d.name)).toEqual(["p"]);
  });

  it("refuses an endpoint, a param, an expression or paging that is not there", () => {
    const { run } = shop();
    refused(() => run(ops.addDataSource, { screen: "products", operationId: "listThings" }), /no endpoint "listThings".*listProducts/);
    refused(() => run(ops.addDataSource, { screen: "products", operationId: "listProducts", params: { sort: "1" } }), /takes no param "sort"/);
    refused(() => run(ops.addDataSource, { screen: "products", operationId: "listProducts", params: { limit: "1 +" } }), /no expression/);
    refused(() => run(ops.addDataSource, { screen: "products", operationId: "listProducts", params: { limit: "params.size" } }), /takes no param "size"/);
    refused(() => run(ops.addDataSource, { screen: "detail", operationId: "getProduct", paging: "scroll" }), /no pagination/);
    refused(() => run(ops.addDataSource, { screen: "products", operationId: "listProducts", name: "1st" }), /no name for data/);
    run(ops.addDataSource, { screen: "products", operationId: "listProducts" });
    refused(() => run(ops.addDataSource, { screen: "products", operationId: "listProducts", name: "products" }), /already/);
  });

  it("are renamed with every expression of the screen that reads them", () => {
    const { run, doc } = shop();
    run(ops.wireScreen, { screen: "products", operationId: "listProducts" });
    run(ops.updateDataSource, { screen: "products", name: "products", rename: "goods" });
    const region = doc().groups.find((g) => g.states)!;
    expect(region.repeat).toEqual({ data: "data.goods.items" });
    expect(region.states?.source).toBe("goods");
    const binds = doc().groups.flatMap((g) => g.items.flatMap((it) => Object.values(it.bind ?? {})));
    expect(binds.some((b) => b.includes("data.goods.error"))).toBe(true);
    expect(binds.some((b) => b.includes("data.products"))).toBe(false);
    const taps = JSON.stringify(doc().groups.flatMap((g) => g.items.map((it) => it.action)));
    expect(taps).toContain('"source":"goods"');
  });
});

describe("screens", () => {
  it("declare their params and whether they need a session; there is one sign-in screen", () => {
    const { run, frame, s } = shop();
    run(ops.setScreenParams, { screen: "detail", params: [{ name: "productId", type: "string", example: "p9" }, { name: "tab" }] });
    expect(frame("detail").params).toEqual([{ name: "productId", type: "string", example: "p9" }, { name: "tab" }]);
    refused(() => run(ops.setScreenParams, { screen: "detail", params: [{ name: "a b" }] }), /no param name/);
    refused(() => run(ops.setScreenParams, { screen: "detail", params: [{ name: "a" }, { name: "a" }] }), /twice/);
    run(ops.setScreenAuth, { screen: "products", auth: "required" });
    run(ops.setScreenAuth, { screen: "create", auth: "login" });
    expect(s.get().doc.frames.filter((f) => f.auth === "login").map((f) => f.id)).toEqual(["create"]);
    run(ops.setScreenAuth, { screen: "products", auth: null });
    expect(frame("products").auth).toBeUndefined();
  });
});

describe("props bound to expressions", () => {
  it("are checked where they are read, kept after '=', and unbound", () => {
    const { run, doc } = shop();
    run(ops.addDataSource, { screen: "detail", operationId: "getProduct" });
    run(ops.addPart, { slug: "text", id: "title", screen: "detail", at: { x: 16, y: 80 } });
    run(ops.bindExpression, { id: "title", prop: "text", expr: "data.product.value.name ?? 'Untitled'" });
    expect(doc().groups.flatMap((g) => g.items).find((it) => it.id === "title")!.bind).toEqual({ text: "=data.product.value.name ?? 'Untitled'" });
    refused(() => run(ops.bindExpression, { id: "title", prop: "words", expr: "1" }), /no prop "words"/);
    refused(() => run(ops.bindExpression, { id: "title", prop: "text", expr: "data.cart.value" }), /loads no data called "cart"/);
    refused(() => run(ops.bindExpression, { id: "title", prop: "text", expr: "item.name" }), /only inside a repeat over data/);
    refused(() => run(ops.bindExpression, { id: "title", prop: "text", expr: "params.nope" }), /takes no param "nope"/);
    refused(() => run(ops.bindExpression, { id: "title", prop: "text", expr: "window.alert(1)" }), /no expression/);
    run(ops.bindExpression, { id: "title", prop: "text", expr: null });
    expect(doc().groups.flatMap((g) => g.items).find((it) => it.id === "title")!.bind).toBeUndefined();
  });

  it("repeat over data, the rows reading item", () => {
    const { run, doc } = shop();
    run(ops.addDataSource, { screen: "products", operationId: "listProducts" });
    run(ops.addPart, { slug: "box", id: "list", screen: "products", at: { x: 16, y: 80 }, props: { layout: "column" } });
    run(ops.addPart, { slug: "text", id: "name", into: { container: "list" } });
    run(ops.setRepeat, { id: "list", repeat: { data: "data.products.items", sample: 4 } });
    run(ops.bindExpression, { id: "name", prop: "text", expr: "item.name + ' ' + currency(item.price)" });
    expect(doc().groups.find((g) => g.items[0].id === "list")!.repeat).toEqual({ data: "data.products.items", sample: 4 });
    refused(() => run(ops.setRepeat, { id: "list", repeat: { data: "data.orders.items" } }), /loads no data called "orders"/);
    refused(() => run(ops.setRepeat, { id: "list", repeat: { data: "data.products.items", collection: "x" } }), /collection or data/);
    /* the canvas draws the samples, the preview's document keeps the repeat for the data */
    const canvas = canvasView(doc(), {});
    expect([...canvas.drawn.values()].flat().length).toBeGreaterThan(0);
    expect(expandDoc(doc(), {}).groups.find((g) => g.items[0].id === "list")!.repeat).toEqual({ data: "data.products.items", sample: 4 });
  });
});

describe("regions", () => {
  it("get a design for each state on its own pane, show one at a time, and go back to a plain container", () => {
    const { run, doc, s } = shop();
    run(ops.addDataSource, { screen: "products", operationId: "listProducts" });
    run(ops.addPart, { slug: "box", id: "area", screen: "products", at: { x: 16, y: 80 }, props: { layout: "column" } });
    run(ops.addPart, { slug: "text", id: "inside", into: { container: "area" } });
    const out = run(ops.setRegion, { id: "area", source: "products" }) as { states: string[] };
    expect(out.states).toEqual([...REGION_STATES]);
    const host = () => doc().groups.find((g) => g.items[0].id === "area")!;
    const panes = () => doc().groups.filter((g) => g.inFlow === host().id).map((g) => g.pane ?? 0);
    expect(panes().sort()).toEqual([0, 1, 2, 3, 4]);
    /* the canvas shows the content, then the state asked for */
    expect(outOfPane(doc().groups, {}).has(doc().groups.find((g) => g.items[0].id === "inside")!.id)).toBe(false);
    const steps = s.history().length;
    run(ops.setRegion, { id: "area", show: "error" });
    expect(s.history().length).toBe(steps + 1);
    const off = outOfPane(doc().groups, {});
    expect(off.has(doc().groups.find((g) => g.items[0].id === "inside")!.id)).toBe(true);
    const shown = doc().groups.filter((g) => g.inFlow === host().id && !off.has(g.id));
    expect(shown.map((g) => g.pane)).toEqual([3]);
    /* the error design's button loads the source again */
    const errorTaps = doc().groups.filter((g) => !off.has(g.id)).flatMap((g) => g.items.map((it) => it.action)).filter(Boolean);
    expect(errorTaps).toContainEqual(expect.objectContaining({ effects: [{ do: "refresh", source: "products" }] }));
    refused(() => run(ops.setRegion, { id: "inside" }), /only a container/i);
    refused(() => run(ops.setRegion, { id: "area", source: "nope" }), /loads no data called "nope"/);
    run(ops.removeRegion, { id: "area" });
    expect(host().states).toBeUndefined();
    expect(panes()).toEqual([0]);
  });
});

describe("forms", () => {
  it("are composed from the body's schema, each input bound to its field, with a submit and an error line", () => {
    const { run, doc } = shop();
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    const out = run(ops.makeForm, { screen: "create", operationId: "createProduct", then: { to: "products" } }) as { formId: string; fields: { field: string; itemId?: string }[]; submitId?: string };
    expect(out.fields.map((f) => f.field)).toEqual(["name", "price", "email"]);
    expect(out.fields.every((f) => f.itemId)).toBe(true);
    const items = doc().groups.flatMap((g) => g.items);
    expect(items.filter((it) => it.field).map((it) => [it.field, it.component, it.props?.type])).toEqual([
      ["name", "input", "text"],
      ["price", "input", "number"],
      ["email", "input", "email"],
    ]);
    const form = doc().groups.find((g) => g.id === out.formId)!;
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    expect(form.form).toEqual({ operationId: "createProduct", then: { to: "products", transition: "slide" } });
    expect(items.find((it) => it.id === out.submitId)!.action?.effects).toEqual([{ do: "submit" }]);
    /* a second time composes only what is not bound yet */
    expect((run(ops.makeForm, { id: out.formId, operationId: "createProduct" }) as { fields: unknown[] }).fields).toEqual([]);
    refused(() => run(ops.makeForm, { screen: "create", operationId: "listProducts" }), /no fields a person writes/);
    refused(() => run(ops.makeForm, { screen: "create", operationId: "createProduct", fields: ["nope"] }), /no field "nope"/);
  });

  it("bind inputs to fields of their form's body, and refuse inputs outside a form or fields not in it", () => {
    const { run, doc } = shop();
    run(ops.addPart, { slug: "box", id: "f", screen: "create", at: { x: 16, y: 80 }, props: { layout: "column" } });
    run(ops.setForm, { id: "f", form: { operationId: "createProduct", values: { email: "auth.user.email" } } });
    run(ops.addPart, { slug: "input", id: "n", into: { container: "f" } });
    run(ops.bindField, { id: "n", field: "name" });
    expect(doc().groups.flatMap((g) => g.items).find((it) => it.id === "n")!.field).toBe("name");
    refused(() => run(ops.bindField, { id: "n", field: "colour" }), /no field "colour"/);
    run(ops.addPart, { slug: "input", id: "loose", screen: "create", at: { x: 16, y: 600 } });
    refused(() => run(ops.bindField, { id: "loose", field: "name" }), /in no form/);
    run(ops.addPart, { slug: "text", id: "words", into: { container: "f" } });
    refused(() => run(ops.bindField, { id: "words", field: "name" }), /no input/);
    refused(() => run(ops.setForm, { id: "f", form: { operationId: "listProducts" } }), /takes no request body/);
    run(ops.setForm, { id: "f", form: null });
    expect(doc().groups.find((g) => g.items[0].id === "f")!.form).toBeUndefined();
  });
});

describe("taps that reach the API", () => {
  it("are checked: the endpoint, the args' expressions, the source, the form, the screen's params", () => {
    const { run } = shop();
    run(ops.wireScreen, { screen: "products", operationId: "listProducts", detail: "detail" });
    run(ops.setScreenParams, { screen: "detail", params: [{ name: "productId" }] });
    run(ops.addPart, { slug: "button", id: "b", screen: "products", at: { x: 16, y: 700 } });
    const set = (action: unknown) => run(ops.setAction, { id: "b", action });
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    set({ to: "detail", params: { productId: "'p1'" }, effects: [{ do: "call", operationId: "createProduct", args: { name: "'x'", price: "1" }, then: { to: "none", effects: [{ do: "refresh", source: "products" }] }, catch: { to: "none", effects: [{ do: "snackbar", message: "{{error.title}}" }] } }] });
    refused(() => set({ to: "none", effects: [{ do: "call", operationId: "nope" }] }), /no endpoint "nope"/);
    refused(() => set({ to: "none", effects: [{ do: "call", operationId: "createProduct", args: { name: "(" } }] }), /args.name/);
    refused(() => set({ to: "none", effects: [{ do: "refresh", source: "cart" }] }), /no screen loads data called "cart"/);
    refused(() => set({ to: "none", effects: [{ do: "submit", form: "nowhere" }] }), /no form/);
    refused(() => set({ to: "detail", params: { id: "1" } }), /takes no param "id"/);
    refused(() => set({ to: "none", when: { expr: "a ==" }, effects: [{ do: "signOut" }] }), /no expression/);
    set({ to: "none", when: { expr: "auth.signedIn" }, effects: [{ do: "signOut" }, { do: "setVar", var: "v", value: 0 }].slice(0, 1) });
  });
});

describe("wire_screen", () => {
  it("binds a list screen in one step: source, region, row bound to the elements, designs, a tap to the detail", () => {
    const { run, doc, s, frame } = shop();
    run(ops.setScreenParams, { screen: "detail", params: [{ name: "productId" }] });
    const steps = s.history().length;
    const out = run(ops.wireScreen, { screen: "products", operationId: "listProducts", detail: "detail", paging: "button" }) as { source: string; states: string[]; template?: string };
    expect(s.history().length).toBe(steps + 1);
    expect(out.source).toBe("products");
    expect(out.states).toEqual([...REGION_STATES]);
    expect(frame("products").data).toEqual([{ name: "products", operationId: "listProducts", pullToRefresh: true, paging: "button", pageSize: 20 }]);
    const region = doc().groups.find((g) => g.states)!;
    const row = doc().groups.find((g) => g.items[0].id === out.template)!;
    expect(row.items[0].action).toMatchObject({ to: "detail", params: { productId: "item.id" } });
    const binds = doc().groups.flatMap((g) => g.items.flatMap((it) => Object.values(it.bind ?? {})));
    expect(binds).toEqual(expect.arrayContaining(["=item.name", "=item.description", "=currency(item.price)"]));
    expect(doc().groups.some((g) => g.inFlow === region.id && g.showWhen && "expr" in g.showWhen && g.showWhen.expr === "data.products.hasMore")).toBe(true);
    s.undo();
    expect(frame("products").data).toBeUndefined();
    expect(doc().groups.some((g) => g.states)).toBe(false);
  });

  it("binds a detail screen: the fields of the one thing, read from the source", () => {
    const { run, doc, frame } = shop();
    /* the screen declares the path's param already: the source reads it */
    const out = run(ops.wireScreen, { screen: "detail", operationId: "getProduct" }) as { addedParams: string[] };
    expect(out.addedParams).toEqual([]);
    expect(frame("detail").params).toEqual([{ name: "productId", type: "string", example: "p1" }]);
    expect(frame("detail").data?.[0].params).toEqual({ productId: "params.productId" });
    const binds = doc().groups.flatMap((g) => g.items.flatMap((it) => Object.values(it.bind ?? {})));
    expect(binds).toEqual(expect.arrayContaining(["=data.product.value.name", "=currency(data.product.value.price)", "=relative(data.product.value.createdAt)"]));
  });
});

describe("the document", () => {
  it("keeps its bindings through a project file, and reads a broken one without them breaking it", () => {
    const doc = shopDoc();
    const text = formatProject(projectFile(doc));
    const back = openProject(JSON.parse(text))!;
    expect(formatProject(projectFile(back))).toBe(text);
    expect(back.frames.find((f) => f.id === "products")!.data).toEqual(doc.frames.find((f) => f.id === "products")!.data);
    expect(back.groups.filter((g) => g.states || g.form || g.repeat).length).toBe(doc.groups.filter((g) => g.states || g.form || g.repeat).length);
    /* a hand-edited file: what has the wrong shape goes, the rest opens */
    const broken = JSON.parse(text);
    const d = broken.document as Doc & Record<string, unknown>;
    d.frames[1] = { ...d.frames[1], data: [{ name: "1bad", operationId: "x" }, { name: "ok", operationId: "listProducts", load: "sometimes", pageSize: 1e9 }], auth: "maybe", params: [{ name: "ok" }, { name: "" }] } as never;
    d.groups[0] = { ...d.groups[0], states: { source: 7, show: "dancing" }, form: { operationId: 3 }, repeat: { data: 42 } } as never;
    const g1 = d.groups.find((g) => g.items[0].action)!;
    // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
    g1.items[0].action = { to: "none", transition: "none", effects: [{ do: "call", operationId: "x", then: { to: "none", effects: [{ do: "call", operationId: "y", then: { to: "none", effects: [{ do: "call", operationId: "z", then: { to: "none", effects: [{ do: "call", operationId: "w", then: { to: "none", effects: [{ do: "call", operationId: "deep", then: { to: "none", effects: [{ do: "call", operationId: "deeper" }] } }] } }] } }] } }] } }, { do: "launch" }] } as never;
    const opened = openProject(broken)!;
    expect(opened.frames[1].data).toEqual([{ name: "ok", operationId: "listProducts" }]);
    expect(opened.frames[1].auth).toBeUndefined();
    expect(opened.frames[1].params).toEqual([{ name: "ok" }]);
    expect(opened.groups[0].states).toEqual({});
    expect(opened.groups[0].form).toBeUndefined();
    expect(opened.groups[0].repeat).toBeUndefined();
    const effects = JSON.stringify(opened.groups.find((g) => g.id === g1.id)!.items[0].action);
    expect(effects).not.toContain("launch");
    expect(effects).not.toContain("deeper");
  });

  it("without bindings is laid out, expanded and saved exactly as before", () => {
    const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("o"), measurer: guessMeasurer, lang: () => "en" });
    store.run(ops.addScreen, { id: "home", name: "Home" }, { origin: "mcp" });
    store.run(ops.addPart, { slug: "box", id: "rows", screen: "home", at: { x: 16, y: 40 }, props: { layout: "column" } }, { origin: "mcp" });
    store.run(ops.addPart, { slug: "text", id: "row", into: { container: "rows" }, props: { text: "{{name}}" } }, { origin: "mcp" });
    store.run(ops.addCollection, { id: "fruit", fields: ["name"], rows: [["Apple"], ["Pear"]] }, { origin: "mcp" });
    store.run(ops.setRepeat, { id: "rows", repeat: { collection: "fruit" } }, { origin: "mcp" });
    const doc = savedDoc(store.get());
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/"(data|params|auth|states|form|field|scope)":/);
    const host = doc.groups.find((g) => g.items[0].id === "rows")!;
    expect(expandDoc(doc, {}).groups.filter((g) => g.inFlow === host.id).length).toBe(2);
  });
});
