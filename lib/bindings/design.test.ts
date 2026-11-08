/* The preview's data engine: lib/app's Runtime (its data sources' cache, form controllers and session) read from the
 * document by design.ts, against a fake back end (fixture.ts): a screen's data loading with its region in each state,
 * pages after pages, a detail by its params, a form checked by its schema and by the server, a session started by a
 * sign-in and ended by a 401, and errors (refused, failing, throwing transports) that never escape. Then the same
 * screens against the mock library, as the preview runs them; and side by side with an exported app's runtime, made
 * from what an export prints of the same contract, to show the two come to the same states. */

import { beforeAll, describe, expect, it } from "vitest";
import type { Transport, TransportRequest } from "../api/transport";
import { createRuntime, type Runtime } from "../app/runtime";
import { sourceKey, type SourceSpec } from "../app/sources";
import { FormController } from "../app/forms";
import { expandDoc } from "../expand";
import { setGlobalLang } from "../i18n";
import { liveGroups, startState, type FieldValue, type PreviewState } from "../interact";
import type { Doc, Frame, Group } from "../tokens";
import { formRulesOf, operationsOf } from "../export/rn/contract";
import { authSource } from "../export/targets/webSources";
import { ApiError, DesignRuntime, authConfigOf, steadyTransport, type ScreenAt } from "./design";
import { sampleProducts, shopDoc, shopTransport } from "./fixture";
import { boundScreen, formsOf, readForm } from "./view";
import { fallbackTransport, signedInAtStart } from "./transport";
import { screenParams, sourceView } from "./sources";
import { createMockTransport, defaultScenarios, type MockSpec } from "../mocks";

beforeAll(() => setGlobalLang("en"));

const NOW = Date.parse("2026-11-06T12:00:00Z");
const ctx = () => ({ lang: "en", now: NOW });

/** the groups laid out on a screen: everything in a container on it, by the containers' ids */
function screenGroupsOf(doc: Doc) {
  const expanded = expandDoc(doc, {});
  return (f: Frame): Group[] => {
    const ids = new Set<string>();
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
}

/** the preview's engine over a document and a transport: a runtime of lib/app, read from the document */
function harness(doc: Doc, transport: Transport, o: { presumed?: boolean } = {}) {
  const runtime = createRuntime({ transport: steadyTransport(() => transport), auth: authConfigOf(doc.api), lang: "en", now: () => NOW, ...(o.presumed ? { presumed: true } : {}) });
  const data = new DesignRuntime(runtime, () => doc);
  const frame = (id: string) => doc.frames.find((f) => f.id === id)!;
  const at = (f: Frame, params?: Record<string, unknown>): ScreenAt => ({ frame: f, params, vars: {}, now: NOW });
  const screenGroups = screenGroupsOf(doc);
  /** a source of a screen as the runtime's cache holds it */
  const source = (id: string, o: { name?: string; params?: Record<string, unknown> } = {}) => data.state(data.sourceOf(at(frame(id), o.params), o.name ?? (id === "detail" ? "product" : "products"))!);
  const bound = (id: string, o: { params?: Record<string, unknown>; fields?: Record<string, FieldValue> } = {}) => {
    const f = frame(id);
    return boundScreen({ groups: screenGroups(f), frame: f, doc, scope: data.scope(at(f, o.params)), form: (form, groups, owner) => data.formView({ form, groups, owner, fields: o.fields ?? {} }), vars: {}, widths: {}, ctx: ctx() });
  };
  /** what the screen shows once laid out: the live parts, with the context their expressions read */
  const shown = (id: string, o: Parameters<typeof bound>[1] = {}) => {
    const b = bound(id, o);
    const s: PreviewState = { ...startState(doc.vars), fields: (o.fields ?? {}) as PreviewState["fields"], ctx: b.ctx };
    return liveGroups(b.groups, s, doc, b.widths);
  };
  /** a form of a screen submitted with what its inputs hold */
  const submit = (id: string, form: Group, fields: Record<string, FieldValue>) => {
    const groups = screenGroups(frame(id));
    return data.submit({ form, groups, owner: formsOf(groups), fields }, { params: {} });
  };
  const formState = (form: Group) => runtime.form(form.id, {}).state.run;
  return { runtime, data, frame, at, bound, shown, submit, source, formState, enter: (f: Frame, params?: Record<string, unknown>) => data.enter(at(f, params)) };
}

const region = (groups: Group[]) => groups.find((g) => g.states)!;
const texts = (groups: Group[]) => groups.flatMap((g) => g.items).filter((it) => it.component === "text").map((it) => String(it.props?.text ?? ""));

describe("a list screen", () => {
  it("shows its loading design, then a row per product, page after page", async () => {
    const doc = shopDoc();
    const h = harness(doc, shopTransport({ products: sampleProducts(25) }));
    const f = h.frame("products");
    expect(region(h.bound("products").groups).states?.show).toBe("loading");
    const loading = h.enter(f);
    expect(h.source("products").status).toBe("loading");
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
    await h.data.load(h.at(f), "products", { more: true });
    const all = h.source("products");
    expect(all.items?.length).toBe(25);
    expect(all.hasMore).toBe(false);
    expect(texts(h.shown("products"))).toContain("Product 25");
    /* nothing more to load: no call goes out */
    const log: TransportRequest[] = [];
    const h2 = harness(doc, shopTransport({ log }));
    await h2.enter(f);
    await h2.data.load(h2.at(f), "products", { more: true });
    expect(log.map((r) => r.query?.cursor ?? null)).toEqual([null, "20"]);
  });

  it("shows its empty, error and forbidden designs as the server answers", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const empty = harness(doc, shopTransport({ products: [] }));
    await empty.enter(f);
    expect(region(empty.bound("products").groups).states?.show).toBe("empty");
    expect(texts(empty.shown("products"))).toContain("Nothing here yet");
    const failing = harness(doc, shopTransport({ fail: { listProducts: 500 } }));
    await failing.enter(f);
    expect(region(failing.bound("products").groups).states?.show).toBe("error");
    /* the error's own words, from the server */
    expect(texts(failing.shown("products"))).toContain("The server said no to listProducts.");
    const refused = harness(doc, shopTransport({ fail: { listProducts: 403 } }));
    await refused.enter(f);
    expect(region(refused.bound("products").groups).states?.show).toBe("forbidden");
  });

  it("keeps what it shows while it loads again, and drops an answer a later load overtook", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const t = shopTransport({ products: sampleProducts(3), delay: 5 });
    const h = harness(doc, t);
    await h.enter(f);
    t.products.splice(0, 3, ...sampleProducts(1));
    const again = h.data.load(h.at(f), "products");
    expect(h.source("products").loading).toBe(true);
    expect(region(h.bound("products").groups).states?.show).toBe("ready");
    const last = h.data.load(h.at(f), "products");
    await Promise.all([again, last]);
    expect(h.source("products").items?.length).toBe(1);
  });

  it("loads again behind what it shows when the screen is entered again", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const log: TransportRequest[] = [];
    const t = shopTransport({ products: sampleProducts(2), log });
    const h = harness(doc, t);
    await h.enter(f);
    t.products.unshift({ id: "new", name: "Fresh", price: 1 });
    const again = h.enter(f);
    /* what it held stays on show meanwhile */
    expect(region(h.bound("products").groups).states?.show).toBe("ready");
    /* entered twice at once (React's strict effects): one call */
    void h.enter(f);
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
    await h.enter(f);
    expect(region(h.bound("products").groups).states?.show).toBe("empty");
  });

  it("takes a row out at once and puts it back when the call fails", async () => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const h = harness(doc, shopTransport({ products: sampleProducts(3) }));
    await h.enter(f);
    const key = h.data.sourceOf(h.at(f), "products")!.key;
    const row = h.source("products").items![1];
    const undo = h.runtime.sources.optimistic(key, row, { remove: true });
    expect(h.source("products").items?.map((x) => (x as { id: string }).id)).toEqual(["p1", "p3"]);
    expect((h.source("products").value as { items: unknown[] }).items).toHaveLength(2);
    undo();
    expect(h.source("products").items).toHaveLength(3);
  });

  it("keys a source by its operation and what it is asked with, as an exported screen does", () => {
    const doc = shopDoc();
    const h = harness(doc, shopTransport());
    const f = h.frame("detail");
    const spec = h.data.sourceOf(h.at(f, { productId: "p7" }), "product")!;
    expect(spec.key).toBe(sourceKey("getProduct", { productId: "p7" }));
    expect(spec.args).toEqual({ productId: "p7" });
    /* the list pages as its endpoint says, by the field its answer holds the list in */
    const list = h.data.sourceOf(h.at(h.frame("products")), "products")!;
    expect(list).toMatchObject({ operation: "listProducts", list: { field: "items" }, paging: { style: "cursor", cursorParam: "cursor", limitParam: "limit" }, pageSize: 20 });
  });
});

describe("a detail screen", () => {
  it("loads the product its params name, and the example when opened straight", async () => {
    const doc = shopDoc();
    const log: TransportRequest[] = [];
    const h = harness(doc, shopTransport({ log }));
    const f = h.frame("detail");
    expect(screenParams(f.params, undefined)).toEqual({ productId: "p1" });
    await h.enter(f, { productId: "p7" });
    expect(log[0].path).toBe("/products/p7");
    expect(texts(h.shown("detail", { params: { productId: "p7" } }))).toEqual(expect.arrayContaining(["Product 7", "$16.00", "5 days ago"]));
    /* a product that is not there is the region's empty design */
    await h.enter(f, { productId: "nope" });
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
    /* nothing is sent while a field is wrong: the form shows why */
    expect(await h.submit("create", form, { [name.id]: "A" })).toBeNull();
    expect(h.bound("create", { fields: { [name.id]: "A" } }).ctx.forms[form.id].errors).toMatchObject({ name: "At least 2 characters", price: "Required" });
    /* the server's problem details as the back end writes them: errors[] with `in`; only the body's land on fields */
    const strict: Transport = { request: async () => ({ status: 422, headers: {}, body: { title: "Invalid", status: 422, errors: [{ pointer: "#/price", detail: "Too cheap", in: "body" }, { pointer: "#/limit", detail: "Bad limit", in: "query" }] } }) };
    const hs = harness(doc, strict);
    await hs.submit("create", form, { [name.id]: "Tea", [price.id]: "0" });
    expect(hs.formState(form).errors).toEqual({ price: "Too cheap" });
    expect(hs.formState(form).error?.errors).toEqual([{ pointer: "#/price", detail: "Too cheap", in: "body" }, { pointer: "#/limit", detail: "Bad limit", in: "query" }]);
    /* the server refuses a name: its pointer lands on the field */
    const refused = await h.submit("create", form, { [name.id]: "taken", [price.id]: "1" });
    expect(refused?.ok).toBe(false);
    expect(h.formState(form).errors).toEqual({ name: "That name is taken" });
    const shown = h.shown("create", { fields: { [name.id]: "taken", [price.id]: "1" } });
    const nameShown = shown.flatMap((g) => g.items).find((it) => it.id === name.id)!;
    expect(nameShown.props?.error).toBe(true);
    expect(texts(shown)).toContain("That name is taken");
    /* the field states (parts/fieldState.ts): the contract's required fields say so; the design shows the message in
       a helper line of its own (form.errors.name), so the input is not handed it again */
    expect(nameShown.props?.required).toBe(true);
    expect(shown.flatMap((g) => g.items).find((it) => it.id === email.id)!.props?.required).toBeUndefined();
    expect(nameShown.props?.errorText).toBeUndefined();
    expect(texts(shown).filter((t) => t === "That name is taken")).toHaveLength(1);
    /* with no line of its own for it, the input shows the message itself */
    const bare: Doc = { ...doc, groups: doc.groups.map((g) => ({ ...g, items: g.items.map((it) => (it.bind && Object.values(it.bind).some((b) => b.includes("form.errors")) ? { ...it, bind: undefined } : it)) })) };
    const hb = harness(bare, shopTransport());
    await hb.submit("create", form, { [name.id]: "taken", [price.id]: "1" });
    const own = hb.shown("create", { fields: { [name.id]: "taken", [price.id]: "1" } }).flatMap((g) => g.items).find((it) => it.id === name.id)!;
    expect(own.props?.error).toBe(true);
    expect(own.props?.errorText).toBe("That name is taken");
    /* the server's word on a field goes once that field is changed, as in an exported app (lib/app's form) */
    expect(hb.bound("create", { fields: { [name.id]: "taken again", [price.id]: "1" } }).ctx.forms[form.id].errors).toEqual({});
    const done = await h.submit("create", form, { [name.id]: "Tea", [price.id]: "12.5" });
    expect(done?.ok && (done.response as { name: string }).name).toBe("Tea");
    /* the status the back end gave, not only 200 */
    expect(done?.status).toBe(201);
    expect(h.formState(form).errors).toEqual({});
    expect(t.products[0].name).toBe("Tea");
  });

  it("is held while it submits", async () => {
    const doc = shopDoc();
    const h = harness(doc, shopTransport({ delay: 5 }));
    const form = formOf(doc, "createProduct");
    const fields = { [inputFor(doc, "name", "createProduct").id]: "Tea", [inputFor(doc, "price", "createProduct").id]: "1" };
    const going = h.submit("create", form, fields);
    const button = h.bound("create", { fields }).groups.flatMap((g) => g.items).find((it) => it.component === "button" && it.action?.effects?.some((e) => e.do === "submit"))!;
    expect(button.props?.disabled).toBe(true);
    expect(button.props?.loading).toBe(true);
    /* a second submit while the first goes is refused */
    expect(await h.submit("create", form, fields)).toBeNull();
    await going;
    expect(h.bound("create", { fields }).groups.flatMap((g) => g.items).find((it) => it.id === button.id)!.props?.disabled).toBeFalsy();
    expect(h.bound("create", { fields }).groups.flatMap((g) => g.items).find((it) => it.id === button.id)!.props?.loading).toBeFalsy();
  });

  it("counts an upload up while it goes, with a stand-in where the transport cannot say", async () => {
    const ticks: (() => void)[] = [];
    let answer: () => void = () => {};
    const slow: Transport = { request: () => new Promise((ok) => (answer = () => ok({ status: 201, headers: {}, body: { id: "f1" } }))) };
    const shop = shopDoc();
    /* the contact field taken for a file input: a file among what was entered, so the form asks how the upload goes */
    const file = inputFor(shop, "email", "createProduct");
    const doc: Doc = { ...shop, groups: shop.groups.map((g) => ({ ...g, items: g.items.map((it) => (it.id === file.id ? { ...it, component: "file-upload" } : it)) })) };
    const runtime = createRuntime({ transport: slow, auth: authConfigOf(doc.api), lang: "en" });
    const data = new DesignRuntime(runtime, () => doc, { tick: (fn) => (ticks.push(fn), () => ticks.splice(0)) });
    const form = formOf(doc, "createProduct");
    const groups = screenGroupsOf(doc)(doc.frames.find((f) => f.id === "create")!);
    const files = { [file.id]: [{ name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" }] };
    const at = { form, groups, owner: formsOf(groups), fields: { [inputFor(doc, "name", "createProduct").id]: "Tea", [inputFor(doc, "price", "createProduct").id]: "1" }, files };
    const going = data.submit(at, { params: {} });
    await Promise.resolve();
    expect(data.formView(at).progress).toBe(0);
    ticks.forEach((t) => t());
    ticks.forEach((t) => t());
    expect(data.formView(at).progress).toBe(14);
    answer();
    await going;
    expect(data.formView(at).progress).toBe(100);
    expect(ticks).toHaveLength(0);
  });
});

describe("the session", () => {
  it("starts with a sign-in, rides on later calls, and ends with a 401", async () => {
    const doc = shopDoc();
    const log: TransportRequest[] = [];
    const t = shopTransport({ requireAuth: true, log });
    const h = harness(doc, t);
    const f = h.frame("products");
    await h.enter(f);
    expect(h.source("products").error?.status).toBe(401);
    /* the wrong password: the login's own 401 names the field, and is no lost session */
    const wrong = await h.data.call("login", { body: { email: "ann@example.com", password: "nope" } });
    expect(wrong.ok || wrong.unauthorized).toBe(false);
    expect(!wrong.ok && wrong.error.errors?.[0]).toEqual({ pointer: "#/password", detail: "That password is not right" });
    const right = await h.data.call("login", { body: { email: "ann@example.com", password: "correct horse" } });
    expect(right.ok).toBe(true);
    expect(h.runtime.session.get().session).toMatchObject({ token: "t1", refreshToken: "rt1", user: { name: "ann" } });
    expect(h.data.scope(h.at(f)).auth).toEqual({ signedIn: true, user: { name: "ann" } });
    await h.data.load(h.at(f), "products");
    expect(log.at(-1)?.headers?.Authorization).toBe("Bearer t1");
    expect(h.source("products").status).toBe("ready");
    /* the login endpoint is public: it never carries the token */
    expect(log.filter((r) => r.operationId === "login").every((r) => !r.headers?.Authorization)).toBe(true);
    /* the server forgets the token: the next call is a 401, and the session ends */
    const fresh = harness(doc, shopTransport({ requireAuth: true }));
    const out = await fresh.data.call("listProducts", {});
    expect(!out.ok && out.unauthorized).toBe(true);
    h.data.signOut();
    expect(h.runtime.session.get().session).toBeNull();
  });

  it("is not begun by a sign-in answered after the runtime started over", async () => {
    const doc = shopDoc();
    let answer: () => void = () => {};
    const slow: Transport = { request: () => new Promise((ok) => (answer = () => ok({ status: 200, headers: {}, body: { accessToken: "late", user: { name: "ann" } } }))) };
    const h = harness(doc, slow);
    const going = h.data.call("login", { body: { email: "ann@example.com", password: "correct horse" } });
    await Promise.resolve();
    h.runtime.restart(false);
    answer();
    expect(await going).toMatchObject({ ok: false, dropped: true });
    expect(h.runtime.session.get().session).toBeNull();
    expect(h.data.signedIn).toBe(false);
  });
});

describe("errors never escape", () => {
  it("reads a transport that throws, answers garbage, or a missing endpoint as a problem", async () => {
    const doc = shopDoc();
    const throwing: Transport = { request: async () => { throw new Error("socket closed"); } };
    const h = harness(doc, throwing);
    const out = await h.data.call("listProducts", {});
    expect(out).toMatchObject({ ok: false, status: 0, error: { title: "Can't reach the server", detail: "socket closed" } });
    const garbage: Transport = { request: async () => ({ status: 200, headers: {}, body: "<html>" }) };
    const g = harness(doc, garbage);
    const f = g.frame("products");
    await g.enter(f);
    /* a list was promised and none came: the error design, saying so */
    expect(region(g.bound("products").groups).states?.show).toBe("error");
    expect(g.source("products").error?.detail).toContain("holds no list");
    const odd: Transport = { request: async () => undefined as never };
    expect((await harness(doc, odd).data.call("getProduct", { params: { productId: "x" } })).ok).toBe(false);
    expect(await h.data.call("nothingLikeThis", {})).toMatchObject({ ok: false, error: { title: "No endpoint nothingLikeThis" } });
    /* a source of an operation the contract does not have is the region's error, saying so */
    const lost: Doc = { ...doc, frames: doc.frames.map((x) => (x.id === "products" ? { ...x, data: x.data!.map((d) => ({ ...d, operationId: "gone" })) } : x)) };
    const l = harness(lost, shopTransport());
    await l.enter(l.frame("products"));
    expect(l.source("products")).toMatchObject({ status: "error", error: { title: "No endpoint gone" } });
  });
});

describe("against the mock library", () => {
  const spec: MockSpec = { seed: 1, locale: "en", scenarios: defaultScenarios("en") };
  /** the shop answered by the mocks with no wait, the runtime started over as the preview starts it for a session */
  function mocked() {
    const doc = shopDoc();
    const mock = createMockTransport({ api: doc.api, mocks: spec }, { latency: false });
    const h = harness(doc, mock);
    const start = () => h.runtime.restart(signedInAtStart(spec, mock.scenario));
    start();
    return { doc, mock, h, start, f: h.frame("products") };
  }
  const show = (h: ReturnType<typeof harness>) => region(h.bound("products").groups).states?.show;

  it("shows its data, then empty, then an error, as the scenario says", async () => {
    const { mock, h, start, f } = mocked();
    await h.enter(f);
    expect(show(h)).toBe("ready");
    expect(h.source("products").items).toHaveLength(20);
    mock.setScenario("new-user");
    start();
    await h.enter(f);
    expect(show(h)).toBe("empty");
    mock.setScenario("network-error");
    start();
    await h.enter(f);
    expect(show(h)).toBe("error");
    expect(h.source("products").error?.status).toBe(0);
  });

  it("drops what a call answers once the state has started over", async () => {
    const doc = shopDoc();
    let answer: (v: { status: number; headers: Record<string, string>; body: unknown }) => void = () => {};
    const slow: Transport = { request: () => new Promise((r) => (answer = r)) };
    const h = harness(doc, slow);
    const f = h.frame("products");
    const out = h.enter(f);
    h.runtime.restart();
    answer({ status: 200, headers: {}, body: { items: sampleProducts(3), nextCursor: null } });
    await out;
    expect(h.runtime.sources.store.get()).toEqual({});
  });

  it("starts signed in unless the scenario says not; a sign-out ends it, and a 401 sends the app to sign in", async () => {
    const { mock, h, start, f } = mocked();
    expect(h.data.scope(h.at(f)).auth).toEqual({ signedIn: true, user: null });
    /* signed out: the mocks' logout is told, and the secured list is then refused */
    h.data.signOut();
    expect(h.data.scope(h.at(f)).auth).toEqual({ signedIn: false, user: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(mock.log.at(-1)?.operationId).toBe("logout");
    let lost = 0;
    const stop = h.runtime.whenUnauthorized(() => lost++);
    await h.enter(f);
    stop();
    expect(lost).toBe(1);
    expect(show(h)).toBe("forbidden");
    /* the signed-out scenario starts so; a sign-in with the form's fields mends it */
    mock.setScenario("signed-out");
    start();
    expect(signedInAtStart(spec, "signed-out")).toBe(false);
    expect(h.data.scope(h.at(f)).auth).toMatchObject({ signedIn: false });
    const signIn = await h.data.call("login", { body: { email: "ann@example.com", password: "long enough" } });
    expect(signIn.ok).toBe(true);
    expect(h.runtime.session.get().session?.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    await h.enter(f);
    expect(show(h)).toBe("ready");
    expect(mock.log.at(-1)).toMatchObject({ operationId: "listProducts", status: 200 });
  });

  it("puts the mocks' validation errors on the form's fields", async () => {
    const { doc, h } = mocked();
    const form = doc.groups.find((g) => g.form?.operationId === "createProduct")!;
    const owner = formsOf(doc.groups);
    const input = (field: string) => doc.groups.flatMap((g) => (owner.get(g.id) === form.id ? g.items : [])).find((it) => it.field === field)!.id;
    /* past the form's own check (a body field without a rule of its own), the mocks' validation answers */
    const loose: Doc = { ...doc, api: { ...doc.api, models: doc.api!.models!.map((m) => (m.name === "NewProduct" ? { ...m, schema: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, email: { type: "string" } } } } : m)) } };
    const hl = harness(loose, createMockTransport({ api: doc.api, mocks: spec }, { latency: false }));
    const out = await hl.submit("create", form, { [input("name")]: "A", [input("price")]: "-1" });
    expect(out?.ok).toBe(false);
    expect(out && !out.ok && [400, 422]).toContain(out?.status);
    expect(Object.keys(hl.formState(form).errors).sort()).toEqual(["name", "price"]);
    expect(hl.formState(form).submitting).toBe(false);
    const ok = await h.submit("create", form, { [input("name")]: "Desk lamp", [input("price")]: "12" });
    expect(ok).toMatchObject({ ok: true, response: { name: "Desk lamp", price: 12 } });
    expect(h.formState(form).errors).toEqual({});
  });
});

/* ---------- side by side with an exported app ---------- */

/** An exported app's runtime over the same back end, made the way an export makes it: its AuthConfig as the web app
 *  prints it (`authSource`), each source's spec as a generated screen's hook writes it (lib/export/targets/mobile.ts
 *  `useSource`, lib/export/miniapp/print.ts `sourceHook`) from the operations the export writes down
 *  (lib/export/rn/contract.ts), and a form with the rules the export writes (`formRulesOf`), sent by the typed client. */
function exported(doc: Doc, transport: Transport, presumed: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the export's own printed literal, read back as data
  const auth = new Function(`return (${authSource(doc.api!)})`)();
  const runtime = createRuntime({ transport, auth, presumed, lang: "en", now: () => NOW });
  const ops = operationsOf(doc.api);
  /** the typed client's call: the path filled, the query, the body; an ApiError outside 2xx */
  const client = async (op: string, params: Record<string, unknown>, body?: unknown) => {
    const o = ops[op];
    let path = o.path;
    const query: Record<string, string | number | boolean> = {};
    for (const [k, at] of Object.entries(o.params)) {
      const v = params[k];
      if (at === "path") path = path.split(`{${k}}`).join(encodeURIComponent(v === undefined ? "" : String(v)));
      else if (at === "query" && v !== undefined && v !== null && v !== "") query[k] = v as string;
    }
    const res = await runtime.transport.request({ operationId: op, method: o.method as "GET", path, ...(Object.keys(query).length ? { query } : {}), ...(body !== undefined ? { body } : {}) });
    if (res.status < 200 || res.status > 299) throw new ApiError(res.status, res.body, op);
    return res.body;
  };
  const source = (f: Frame, name: string, args: Record<string, string | number | boolean>): SourceSpec => {
    const d = f.data!.find((x) => x.name === name)!;
    const o = ops[d.operationId];
    return { key: sourceKey(d.operationId, args), operation: d.operationId, ...(o.list ? { list: o.list } : {}), ...(o.paging ? { paging: o.paging } : {}), ...(d.pageSize ? { pageSize: d.pageSize } : {}), args, load: ({ page }) => client(d.operationId, { ...args, ...page }) };
  };
  const rules = formRulesOf(doc);
  const form = (g: Group, values: Record<string, unknown>) => new FormController(rules[g.form!.operationId] as never, { lang: () => "en", call: (fn) => runtime.call(fn), initial: values });
  return { runtime, source, form, client };
}

/** what a source's states come to, as `data.<name>` reads them */
const viewOf = (runtime: Runtime, spec: SourceSpec) => sourceView(runtime.sources.state(spec.key));

describe("the preview and an exported app, on one engine", () => {
  const spec: MockSpec = { seed: 7, locale: "en", scenarios: defaultScenarios("en") };

  it("hold the session's needs of the contract alike", () => {
    const doc = shopDoc();
    expect(new Function(`return (${authSource(doc.api!)})`)()).toEqual(authConfigOf(doc.api));
  });

  it.each(["", "new-user", "network-error", "signed-out", "lots", "slow"])("come to the same states of a paged list under the mocks' scenario %j", async (scenario) => {
    const doc = shopDoc();
    const f = doc.frames.find((x) => x.id === "products")!;
    const presumed = signedInAtStart(spec, scenario || undefined);
    const mocks = () => createMockTransport({ api: doc.api, mocks: spec }, { scenario, latency: false });
    const pv = mocks();
    const ex = mocks();
    const h = harness(doc, pv, { presumed });
    const app = exported(doc, ex, presumed);
    const pSpec = h.data.sourceOf(h.at(f), "products")!;
    const eSpec = app.source(f, "products", {});
    expect(pSpec.key).toBe(eSpec.key);
    const seen = { preview: [] as unknown[], app: [] as unknown[] };
    const step = () => {
      seen.preview.push(viewOf(h.runtime, pSpec));
      seen.app.push(viewOf(app.runtime, eSpec));
    };
    const loading = [h.runtime.sources.enter(pSpec), app.runtime.sources.enter(eSpec)];
    step();
    await Promise.all(loading);
    step();
    await Promise.all([h.runtime.sources.loadMore(pSpec), app.runtime.sources.loadMore(eSpec)]);
    step();
    await Promise.all([h.runtime.sources.refresh(pSpec), app.runtime.sources.refresh(eSpec)]);
    step();
    expect(seen.preview).toEqual(seen.app);
    /* and the same calls went out, with the same tokens on them */
    const sent = (t: typeof pv) => t.log.map((e) => `${e.method} ${e.path} ${e.status}`);
    expect(sent(pv)).toEqual(sent(ex));
  });

  it("check, send and fail a form alike, and start a session alike", async () => {
    const doc = shopDoc();
    const presumed = signedInAtStart(spec, "signed-out");
    const pv = createMockTransport({ api: doc.api, mocks: spec }, { scenario: "signed-out", latency: false });
    const ex = createMockTransport({ api: doc.api, mocks: spec }, { scenario: "signed-out", latency: false });
    const h = harness(doc, pv, { presumed });
    const app = exported(doc, ex, presumed);
    const login = doc.groups.find((g) => g.form?.operationId === "login")!;
    const groups = screenGroupsOf(doc)(doc.frames.find((x) => x.id === "login")!);
    const owner = formsOf(groups);
    const input = (field: string) => groups.flatMap((g) => (owner.get(g.id) === login.id ? g.items : [])).find((it) => it.field === field)!.id;
    const views: { preview: unknown[]; app: unknown[] } = { preview: [], app: [] };
    const tryWith = async (values: { email?: string; password?: string }) => {
      const fields: Record<string, FieldValue> = {};
      if (values.email !== undefined) fields[input("email")] = values.email;
      if (values.password !== undefined) fields[input("password")] = values.password;
      const at = { form: login, groups, owner, fields };
      const p = await h.data.submit(at, { params: {} });
      /* what each input holds, as the visitor left it: a blank text field holds no words */
      const c = app.form(login, { email: values.email ?? "", password: values.password ?? "" });
      const e = await c.submit((body) => app.client("login", {}, body));
      views.preview.push([p === null ? "invalid" : p.ok, h.data.formView(at)]);
      views.app.push(["invalid" in e ? "invalid" : e.ok, c.view()]);
    };
    await tryWith({ email: "not mail" });
    await tryWith({ email: "ann@example.com", password: "long enough" });
    expect(views.preview).toEqual(views.app);
    expect(h.data.signedIn).toBe(true);
    expect(app.runtime.session.signedIn).toBe(true);
    expect(h.runtime.session.get().session?.user).toEqual(app.runtime.session.get().session?.user);
  });
});
