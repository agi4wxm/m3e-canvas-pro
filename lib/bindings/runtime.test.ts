/* The bindings at run time against a fake back end (lib/bindings/fixture.ts): a screen's data loading with its region in
 * each state, pages after pages, a detail by its params, a form checked by its schema and by the server, a session
 * started by a sign-in and ended by a 401, and errors (refused, failing, throwing transports) that never escape. */

import { beforeAll, describe, expect, it } from "vitest";
import type { Transport, TransportRequest } from "../api/transport";
import { expandDoc } from "../expand";
import { setGlobalLang } from "../i18n";
import { liveGroups, startState, type PreviewState } from "../interact";
import type { Doc, Frame, Group } from "../tokens";
import { sampleProducts, shopDoc, shopTransport } from "./fixture";
import { BindingEngine, emptyBindings, paramsFor, screenScope, sourceKey, type BindingState, type CallOutcome } from "./runtime";
import { boundScreen, formsOf, readForm } from "./view";
import { fallbackTransport } from "./transport";

beforeAll(() => setGlobalLang("en"));

const NOW = Date.parse("2026-11-06T12:00:00Z");
const ctx = () => ({ lang: "en", now: NOW });

/** an engine over a document and a transport, its state kept in a variable as the preview keeps it in React */
function harness(doc: Doc, transport: Transport) {
  let state: BindingState = emptyBindings();
  const engine = new BindingEngine({ doc: () => doc, transport, get: () => state, set: (s) => (state = s), ctx });
  const frame = (id: string) => doc.frames.find((f) => f.id === id)!;
  const scope = (f: Frame, params?: Record<string, unknown>) => screenScope({ frame: f, state, params, vars: {}, now: NOW });
  const expanded = expandDoc(doc, {});
  const screenGroups = (f: Frame): Group[] => {
    const ids = new Set<string>();
    /* the groups laid out on the screen: everything in a container on it, by the containers' ids */
    const roots = expanded.groups.filter((g) => !g.inFlow && g.x >= f.x && g.x < f.x + 412 && g.y >= f.y && g.y < f.y + 2000);
    for (const r of roots) ids.add(r.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of expanded.groups)
        if (g.inFlow && ids.has(g.inFlow) && !ids.has(g.id)) {
          ids.add(g.id);
          grew = true;
        }
    }
    return expanded.groups.filter((g) => ids.has(g.id));
  };
  const bound = (id: string, o: { params?: Record<string, unknown>; fields?: Record<string, string | number | boolean> } = {}) =>
    boundScreen({ groups: screenGroups(frame(id)), frame: frame(id), doc, state, params: o.params, vars: {}, fields: o.fields ?? {}, widths: {}, ctx: ctx() });
  /** what the screen shows once laid out: the live parts, with the context their expressions read */
  const shown = (id: string, o: Parameters<typeof bound>[1] = {}) => {
    const b = bound(id, o);
    const s: PreviewState = { ...startState(doc.vars), fields: o.fields ?? {}, ctx: b.ctx };
    return liveGroups(b.groups, s, doc, b.widths);
  };
  return { engine, frame, scope, bound, shown, get state() { return state; } };
}

const region = (groups: Group[]) => groups.find((g) => g.states)!;
const texts = (groups: Group[]) => groups.flatMap((g) => g.items).filter((it) => it.component === "text").map((it) => String(it.props?.text ?? ""));

describe("a list screen", () => {
  it("shows its loading design, then a row per product, page after page", async () => {
    const doc = shopDoc();
    const h = harness(doc, shopTransport({ products: sampleProducts(25) }));
    const f = h.frame("products");
    expect(region(h.bound("products").groups).states?.show).toBe("loading");
    const loading = h.engine.enter(f, h.scope(f));
    expect(h.state.sources[sourceKey("products", "products")].status).toBe("loading");
    expect(region(h.bound("products").groups).states?.show).toBe("loading");
    await loading;
    const first = h.bound("products");
    expect(region(first.groups).states?.show).toBe("ready");
    /* the page size the source asks for is 20 */
    expect(first.groups.filter((g) => g.items[0]?.scope?.item !== undefined && g.items[0].component === "box" && g.inFlow === region(first.groups).id).length).toBe(20);
    const words = texts(h.shown("products"));
    expect(words).toContain("Product 1");
    expect(words).toContain("$10.00");
    expect(words).toContain("Product 20");
    expect(words).not.toContain("Product 21");
    await h.engine.load(f, f.data![0], h.scope(f), { more: true });
    const all = h.state.sources[sourceKey("products", "products")];
    expect(all.items?.length).toBe(25);
    expect(all.hasMore).toBe(false);
    expect(texts(h.shown("products"))).toContain("Product 25");
    /* nothing more to load: no call goes out */
    const log: TransportRequest[] = [];
    const h2 = harness(doc, shopTransport({ log }));
    await h2.engine.enter(f, h2.scope(f));
    await h2.engine.load(f, f.data![0], h2.scope(f), { more: true });
    expect(log.map((r) => r.query?.cursor ?? null)).toEqual([null, "20"]);
  });

  it("shows its empty, error and forbidden designs as the server answers", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const empty = harness(doc, shopTransport({ products: [] }));
    await empty.engine.enter(f, empty.scope(f));
    expect(region(empty.bound("products").groups).states?.show).toBe("empty");
    expect(texts(empty.shown("products"))).toContain("Nothing here yet");
    const failing = harness(doc, shopTransport({ fail: { listProducts: 500 } }));
    await failing.engine.enter(f, failing.scope(f));
    expect(region(failing.bound("products").groups).states?.show).toBe("error");
    /* the error's own words, from the server */
    expect(texts(failing.shown("products"))).toContain("The server said no to listProducts.");
    const refused = harness(doc, shopTransport({ fail: { listProducts: 403 } }));
    await refused.engine.enter(f, refused.scope(f));
    expect(region(refused.bound("products").groups).states?.show).toBe("forbidden");
  });

  it("keeps what it shows while it loads again, and drops an answer a later load overtook", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const t = shopTransport({ products: sampleProducts(3), delay: 5 });
    const h = harness(doc, t);
    await h.engine.enter(f, h.scope(f));
    t.products.splice(0, 3, ...sampleProducts(1));
    const again = h.engine.load(f, f.data![0], h.scope(f), { force: true });
    expect(h.state.sources[sourceKey("products", "products")].loading).toBe(true);
    expect(region(h.bound("products").groups).states?.show).toBe("ready");
    const last = h.engine.load(f, f.data![0], h.scope(f), { force: true });
    await Promise.all([again, last]);
    expect(h.state.sources[sourceKey("products", "products")].items?.length).toBe(1);
  });

  it("loads again behind what it shows when the screen is entered again", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const log: TransportRequest[] = [];
    const t = shopTransport({ products: sampleProducts(2), log });
    const h = harness(doc, t);
    await h.engine.enter(f, h.scope(f));
    t.products.unshift({ id: "new", name: "Fresh", price: 1 });
    const again = h.engine.enter(f, h.scope(f));
    /* what it held stays on show meanwhile */
    expect(region(h.bound("products").groups).states?.show).toBe("ready");
    /* entered twice at once (React's strict effects): one call */
    void h.engine.enter(f, h.scope(f));
    await again;
    expect(log.filter((r) => r.operationId === "listProducts")).toHaveLength(2);
    expect(texts(h.shown("products"))).toContain("Fresh");
  });

  it("answers from the contract's examples, and a list with nothing, until the mock library does", async () => {
    const doc = shopDoc();
    const out = await fallbackTransport(doc).request({ operationId: "listProducts", method: "GET", path: "/products" });
    expect(out).toMatchObject({ status: 200, body: { items: [] } });
    const h = harness(doc, fallbackTransport(doc));
    const f = h.frame("products");
    await h.engine.enter(f, h.scope(f));
    expect(region(h.bound("products").groups).states?.show).toBe("empty");
  });

  it("takes a row out at once and puts it back when the call fails", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const h = harness(doc, shopTransport({ products: sampleProducts(3) }));
    await h.engine.enter(f, h.scope(f));
    const row = h.state.sources[sourceKey("products", "products")].items![1];
    const undo = h.engine.optimistic("products", { source: "products", remove: true }, row, {});
    expect(h.state.sources[sourceKey("products", "products")].items?.map((x) => (x as { id: string }).id)).toEqual(["p1", "p3"]);
    expect((h.state.sources[sourceKey("products", "products")].value as { items: unknown[] }).items).toHaveLength(2);
    undo();
    expect(h.state.sources[sourceKey("products", "products")].items).toHaveLength(3);
  });
});

describe("a detail screen", () => {
  it("loads the product its params name, and the example when opened straight", async () => {
    const doc = shopDoc();
    const log: TransportRequest[] = [];
    const h = harness(doc, shopTransport({ log }));
    const f = h.frame("detail");
    expect(paramsFor(f, undefined)).toEqual({ productId: "p1" });
    await h.engine.enter(f, h.scope(f, { productId: "p7" }));
    expect(log[0].path).toBe("/products/p7");
    expect(texts(h.shown("detail", { params: { productId: "p7" } }))).toEqual(expect.arrayContaining(["Product 7", "$16.00", "5 days ago"]));
    /* a product that is not there is the region's empty design */
    await h.engine.enter(f, h.scope(f, { productId: "nope" }));
    expect(region(h.bound("detail", { params: { productId: "nope" } }).groups).states?.show).toBe("empty");
  });
});

describe("a form", () => {
  const formOf = (doc: Doc, op: string) => doc.groups.find((g) => g.form?.operationId === op)!;
  const inputFor = (doc: Doc, field: string, op: string) => {
    const owner = formsOf(doc.groups);
    return doc.groups.flatMap((g) => (owner.get(g.id) === formOf(doc, op).id ? g.items : [])).find((it) => it.field === field)!;
  };

  it("is checked by the schema, then by the server, its errors on its fields", async () => {
    const doc = shopDoc();
    const t = shopTransport();
    const h = harness(doc, t);
    const form = formOf(doc, "createProduct");
    const name = inputFor(doc, "name", "createProduct");
    const price = inputFor(doc, "price", "createProduct");
    const email = inputFor(doc, "email", "createProduct");
    const read = (fields: Record<string, string>) => readForm({ form, groups: doc.groups, owner: formsOf(doc.groups), doc, fields, scope: {}, ctx: ctx() });
    expect(read({}).errors).toEqual({ name: "Required", price: "Required" });
    expect(read({ [name.id]: "A", [price.id]: "-1", [email.id]: "not mail" }).errors).toEqual({ name: "At least 2 characters", price: "At least 0", email: "Enter an email address" });
    const ok = read({ [name.id]: "Tea", [price.id]: "12.5" });
    expect(ok.errors).toEqual({});
    expect(ok.body).toEqual({ name: "Tea", price: 12.5 });
    /* the server refuses a name: its pointer lands on the field */
    /* the server's problem details as the back end writes them: errors[] with `in`; only the body's land on fields */
    const strict: Transport = { request: async () => ({ status: 422, headers: {}, body: { title: "Invalid", status: 422, errors: [{ pointer: "#/price", detail: "Too cheap", in: "body" }, { pointer: "#/limit", detail: "Bad limit", in: "query" }] } }) };
    const hs = harness(doc, strict);
    await hs.engine.submit(form.id, "createProduct", { body: { name: "Tea", price: 0 } });
    expect(hs.state.forms[form.id].errors).toEqual({ price: "Too cheap" });
    expect(hs.state.forms[form.id].error?.errors).toEqual([{ pointer: "#/price", detail: "Too cheap", in: "body" }, { pointer: "#/limit", detail: "Bad limit", in: "query" }]);
    const refused = await h.engine.submit(form.id, "createProduct", { body: { name: "taken", price: 1 } });
    expect(refused.ok).toBe(false);
    expect(h.state.forms[form.id].errors).toEqual({ name: "That name is taken" });
    const shown = h.shown("create", { fields: { [name.id]: "taken", [price.id]: "1" } });
    const nameShown = shown.flatMap((g) => g.items).find((it) => it.id === name.id)!;
    expect(nameShown.props?.error).toBe(true);
    expect(texts(shown)).toContain("That name is taken");
    const done = await h.engine.submit(form.id, "createProduct", { body: ok.body });
    expect(done.ok && (done.body as { name: string }).name).toBe("Tea");
    expect(h.state.forms[form.id].errors).toEqual({});
    expect(t.products[0].name).toBe("Tea");
  });

  it("is held while it submits", async () => {
    const doc = shopDoc();
    const h = harness(doc, shopTransport({ delay: 5 }));
    const form = formOf(doc, "createProduct");
    const going = h.engine.submit(form.id, "createProduct", { body: { name: "Tea", price: 1 } });
    const button = h.bound("create").groups.flatMap((g) => g.items).find((it) => it.component === "button" && it.action?.effects?.some((e) => e.do === "submit"))!;
    expect(button.props?.disabled).toBe(true);
    /* a second submit while the first goes is refused */
    expect((await h.engine.submit(form.id, "createProduct", { body: {} })).ok).toBe(false);
    await going;
    expect(h.bound("create").groups.flatMap((g) => g.items).find((it) => it.id === button.id)!.props?.disabled).toBeFalsy();
  });
});

describe("the session", () => {
  it("starts with a sign-in, rides on later calls, and ends with a 401", async () => {
    const doc = shopDoc();
    const log: TransportRequest[] = [];
    const t = shopTransport({ requireAuth: true, log });
    const h = harness(doc, t);
    const f = h.frame("products");
    await h.engine.enter(f, h.scope(f));
    expect(h.state.sources[sourceKey("products", "products")].error?.status).toBe(401);
    /* the wrong password: the login's own 401 names the field, and is no lost session */
    const wrong: CallOutcome = await h.engine.call("login", { body: { email: "ann@example.com", password: "nope" } });
    expect(wrong.ok || wrong.unauthorized).toBe(false);
    expect(!wrong.ok && wrong.problem.errors?.[0]).toEqual({ pointer: "#/password", detail: "That password is not right" });
    const right = await h.engine.call("login", { body: { email: "ann@example.com", password: "correct horse" } });
    expect(right.ok).toBe(true);
    expect(h.state.session).toMatchObject({ token: "t1", refreshToken: "rt1", user: { name: "ann" } });
    expect(screenScope({ frame: f, state: h.state }).auth).toEqual({ signedIn: true, user: { name: "ann" } });
    await h.engine.load(f, f.data![0], h.scope(f), { force: true });
    expect(log.at(-1)?.headers?.Authorization).toBe("Bearer t1");
    expect(h.state.sources[sourceKey("products", "products")].status).toBe("ready");
    /* the login endpoint is public: it never carries the token */
    expect(log.filter((r) => r.operationId === "login").every((r) => !r.headers?.Authorization)).toBe(true);
    /* the server forgets the token: the next call is a 401, and the session ends */
    const fresh = harness(doc, shopTransport({ requireAuth: true }));
    const out = await fresh.engine.call("listProducts", {});
    expect(!out.ok && out.unauthorized).toBe(true);
    h.engine.signOut();
    expect(h.state.session).toBeNull();
  });
});

describe("errors never escape", () => {
  it("reads a transport that throws, answers garbage, or a missing endpoint as a problem", async () => {
    const doc = shopDoc();
    const throwing: Transport = { request: async () => { throw new Error("socket closed"); } };
    const h = harness(doc, throwing);
    const out = await h.engine.call("listProducts", {});
    expect(out).toMatchObject({ ok: false, status: 0, problem: { title: "Can't reach the server", detail: "socket closed" } });
    const garbage: Transport = { request: async () => ({ status: 200, headers: {}, body: "<html>" }) };
    const g = harness(doc, garbage);
    const f = g.frame("products");
    await g.engine.enter(f, g.scope(f));
    /* a list was promised and none came: the error design, saying so */
    expect(region(g.bound("products").groups).states?.show).toBe("error");
    expect(g.state.sources[sourceKey("products", "products")].error?.detail).toContain("holds no list");
    const odd: Transport = { request: async () => undefined as never };
    expect((await harness(doc, odd).engine.call("getProduct", { params: { productId: "x" } })).ok).toBe(false);
    expect(await h.engine.call("nothingLikeThis", {})).toMatchObject({ ok: false, problem: { title: "No endpoint nothingLikeThis" } });
  });
});
