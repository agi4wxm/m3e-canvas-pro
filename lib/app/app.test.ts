/* The runtime the exported front ends share (packages/app-runtime is these files), against the shop's fake back end
 * (lib/bindings/fixture.ts) and a typed-client stand-in that throws what the generated client throws: data sources that
 * page, cancel what is stale, keep a cache by their arguments and reload behind it; a session that puts its token on
 * the calls that need one, refreshes once on a 401 and then sends the app to sign in; forms checked by their schema
 * and by the server; calls with then, catch and an optimistic change put back on failure; the expressions; and the
 * hooks drawn once in React. */

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Transport, TransportRequest, TransportResponse } from "../api/transport";
import { paginationOf } from "../api/types";
import { sampleProducts, shopTransport } from "../bindings/fixture";
import { Bindings, RuntimeProvider, callKey, createRuntime, keyOf, memoryStorage, sourceKey, useBindings, useDataSource, useForm, useRegion, useSession, type AuthConfig, type SourceSpec } from "./index";

/** what the generated client throws for an answer outside 2xx */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly operationId?: string,
  ) {
    super(`${operationId} failed with status ${status}`);
  }
}

/** one call as the generated client makes it: the answer's body, or an ApiError */
async function send<T>(t: Transport, r: TransportRequest): Promise<T> {
  const res = await t.request(r);
  if (res.status < 200 || res.status > 299) throw new ApiError(res.status, res.body, r.operationId);
  return res.body as T;
}

const AUTH: AuthConfig = {
  login: "login",
  logout: { operationId: "logout", method: "POST", path: "/auth/logout" },
  refresh: { operationId: "refreshToken", method: "POST", path: "/auth/refresh" },
  security: { listProducts: { header: "Authorization", prefix: "Bearer " }, createProduct: { header: "Authorization", prefix: "Bearer " }, login: null, refreshToken: null, logout: { header: "Authorization", prefix: "Bearer " } },
};

const PAGING = paginationOf({ style: "cursor", items: "items" });

/** the list source of the shop, as the generated hook describes it */
const productsSpec = (t: Transport, args: Record<string, unknown> = {}): SourceSpec => ({
  key: sourceKey("listProducts", args),
  operation: "listProducts",
  args,
  list: { field: "items" },
  paging: PAGING,
  pageSize: 10,
  load: ({ page, signal }) => send(t, { operationId: "listProducts", method: "GET", path: "/products", query: { ...args, ...page } as Record<string, string | number>, signal }),
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("data sources", () => {
  it("load, page by cursor and keep what each page brought", async () => {
    const rt = createRuntime({ transport: shopTransport({ products: sampleProducts(25) }), lang: "en" });
    const spec = productsSpec(rt.transport);
    const done = rt.sources.enter(spec);
    expect(rt.sources.state(spec.key).status).toBe("loading");
    await done;
    let s = rt.sources.state(spec.key);
    expect(s.status).toBe("ready");
    expect(s.items).toHaveLength(10);
    expect(s.hasMore).toBe(true);
    await rt.sources.loadMore(spec);
    await rt.sources.loadMore(spec);
    s = rt.sources.state(spec.key);
    expect(s.items).toHaveLength(25);
    expect(s.hasMore).toBe(false);
    expect((s.value as { items: unknown[] }).items).toHaveLength(25);
  });

  it("drop an answer a newer load has replaced, and cancel it where the platform can", async () => {
    const signals: { aborted: boolean }[] = [];
    let answer = 0;
    const slow: Transport = {
      async request(r) {
        if (r.signal) signals.push(r.signal);
        const mine = ++answer;
        await new Promise((res) => setTimeout(res, mine === 1 ? 30 : 5));
        return { status: 200, headers: {}, body: { items: [{ id: `answer${mine}` }], nextCursor: null } };
      },
    };
    const rt = createRuntime({ transport: slow });
    const spec = productsSpec(rt.transport);
    const first = rt.sources.load(spec);
    const second = rt.sources.load(spec, { force: true });
    await Promise.all([first, second]);
    expect(rt.sources.state(spec.key).items).toEqual([{ id: "answer2" }]);
    expect(signals[0]?.aborted).toBe(true);
  });

  it("keep a cache by arguments, and load again behind what is shown when a screen is entered again", async () => {
    const log: TransportRequest[] = [];
    const rt = createRuntime({ transport: shopTransport({ log }) });
    const a = productsSpec(rt.transport, { category: "a" });
    const b = productsSpec(rt.transport, { category: "b" });
    await rt.sources.enter(a);
    await rt.sources.enter(b);
    expect(a.key).not.toBe(b.key);
    const again = rt.sources.enter(a);
    /* what it held stays on show while it loads */
    expect(rt.sources.state(a.key)).toMatchObject({ status: "ready", loading: true });
    await again;
    expect(log.filter((r) => r.operationId === "listProducts")).toHaveLength(3);
  });

  it("read as data.<name> and choose the region's state as the preview does", async () => {
    const rt = createRuntime({ transport: shopTransport({ products: [] }) });
    const spec = productsSpec(rt.transport);
    await rt.sources.enter(spec);
    const failing = createRuntime({ transport: shopTransport({ fail: { listProducts: 500 } }) });
    const forbidden = createRuntime({ transport: shopTransport({ fail: { listProducts: 403 } }) });
    await failing.sources.enter(productsSpec(failing.transport));
    await forbidden.sources.enter(productsSpec(forbidden.transport));
    const { regionOf, sourceView } = await import("../bindings/sources");
    expect(regionOf(sourceView(rt.sources.state(spec.key)))).toBe("empty");
    expect(regionOf(sourceView(failing.sources.state(spec.key)))).toBe("error");
    expect(failing.sources.state(spec.key).error).toMatchObject({ status: 500, detail: "The server said no to listProducts." });
    expect(regionOf(sourceView(forbidden.sources.state(spec.key)))).toBe("forbidden");
    expect(regionOf(sourceView(undefined))).toBe("loading");
  });

  it("call a body with no list where the contract promised one an error, and a throw a network failure", async () => {
    const odd = createRuntime({ transport: { request: async () => ({ status: 200, headers: {}, body: { nothing: true } }) } });
    await odd.sources.enter(productsSpec(odd.transport));
    expect(odd.sources.state(productsSpec(odd.transport).key)).toMatchObject({ status: "error", error: { detail: 'The answer of listProducts holds no list at "items".' } });
    const down = createRuntime({ transport: { request: () => Promise.reject(new Error("offline")) }, lang: "zh" });
    await down.sources.enter(productsSpec(down.transport));
    expect(down.sources.state(productsSpec(down.transport).key).error).toMatchObject({ status: 0, title: "无法连接服务器", detail: "offline" });
  });
});

describe("the session", () => {
  const login = (t: Transport, password = "correct horse") => send(t, { operationId: "login", method: "POST", path: "/auth/login", body: { email: "ada@example.com", password } });

  it("keeps the tokens a sign-in gives and puts them on the calls that need one", async () => {
    const log: TransportRequest[] = [];
    const storage = memoryStorage();
    const rt = createRuntime({ transport: shopTransport({ requireAuth: true, log }), auth: AUTH, storage, storageKey: "shop:session" });
    await login(rt.transport);
    expect(rt.session.get().session).toMatchObject({ token: "t1", refreshToken: "rt1", user: { name: "ada" } });
    await send(rt.transport, { operationId: "listProducts", method: "GET", path: "/products" });
    expect(log.at(-1)?.headers?.Authorization).toBe("Bearer t1");
    expect(log.find((r) => r.operationId === "login")?.headers?.Authorization).toBeUndefined();
    /* kept where the platform keeps it, and read back by the next visit */
    expect(JSON.parse(String(await storage.get("shop:session")))).toMatchObject({ token: "t1" });
    const next = createRuntime({ transport: shopTransport(), auth: AUTH, storage, storageKey: "shop:session" });
    await next.session.ready;
    expect(next.session.signedIn).toBe(true);
  });

  it("refreshes once on a 401, then ends the session and sends the app to sign in", async () => {
    let refreshed = 0;
    const tokens = new Set(["old"]);
    const back: Transport = {
      async request(r): Promise<TransportResponse> {
        if (r.operationId === "refreshToken") {
          refreshed++;
          if ((r.body as { refreshToken?: string }).refreshToken !== "good") return { status: 401, headers: {}, body: { title: "Expired", status: 401 } };
          tokens.add("new");
          return { status: 200, headers: {}, body: { accessToken: "new", refreshToken: "good2" } };
        }
        const auth = r.headers?.Authorization?.replace("Bearer ", "");
        return auth && tokens.has(auth) && auth !== "old" ? { status: 200, headers: {}, body: { items: [], nextCursor: null } } : { status: 401, headers: {}, body: { title: "Sign in first", status: 401 } };
      },
    };
    const rt = createRuntime({ transport: back, auth: AUTH });
    rt.session.signIn({ token: "old", refreshToken: "good" });
    const sent: string[] = [];
    rt.onUnauthorized = (r) => sent.push(r.operationId ?? "");
    await expect(send(rt.transport, { operationId: "listProducts", method: "GET", path: "/products" })).resolves.toEqual({ items: [], nextCursor: null });
    expect(refreshed).toBe(1);
    expect(rt.session.token).toBe("new");
    /* a refresh token that no longer works: signed out, and the app is told */
    rt.session.signIn({ token: "old", refreshToken: "bad" });
    const out = await rt.call(() => send(rt.transport, { operationId: "listProducts", method: "GET", path: "/products" }), { catch: () => sent.push("catch") });
    expect(out).toMatchObject({ ok: false, status: 401, unauthorized: true });
    expect(rt.session.signedIn).toBe(false);
    expect(sent).toEqual(["listProducts"]);
  });

  it("does not count a wrong password as a lost session", async () => {
    const rt = createRuntime({ transport: shopTransport(), auth: AUTH });
    const sent: string[] = [];
    rt.onUnauthorized = () => sent.push("sign in");
    const out = await rt.call(() => login(rt.transport, "wrong"), { catch: (e) => sent.push(e.title) });
    expect(out).toMatchObject({ ok: false, unauthorized: false });
    expect(sent).toEqual(["Wrong email or password"]);
  });

  it("signs out, telling the contract's sign-out operation with the token", async () => {
    const log: TransportRequest[] = [];
    const rt = createRuntime({ transport: shopTransport({ log }), auth: AUTH });
    await login(rt.transport);
    rt.signOut();
    expect(rt.session.signedIn).toBe(false);
    await tick();
    expect(log.at(-1)).toMatchObject({ operationId: "logout", headers: { Authorization: "Bearer t1" } });
  });

  it("starts presumed signed in when the mocks' session does, and over again with another back end", async () => {
    const rt = createRuntime({ transport: shopTransport(), auth: AUTH, presumed: true });
    expect(rt.session.signedIn).toBe(true);
    const spec = productsSpec(rt.transport);
    await rt.sources.enter(spec);
    rt.setTransport(shopTransport({ products: [] }), { presumed: false });
    expect(rt.session.signedIn).toBe(false);
    expect(rt.sources.state(spec.key).status).toBe("idle");
    expect(rt.epoch.get()).toBe(1);
  });
});

describe("forms", () => {
  const fields = {
    name: { kind: "text", required: true, schema: { type: "string", minLength: 2, maxLength: 60 } },
    price: { kind: "number", required: true, schema: { type: "number", minimum: 0 } },
    email: { kind: "email", required: false, schema: { type: "string", format: "email" } },
  } as const;

  it("send nothing while the schema says a field is wrong, then follow what is typed", async () => {
    const log: TransportRequest[] = [];
    const rt = createRuntime({ transport: shopTransport({ log }), lang: "en" });
    const { FormController } = await import("./forms");
    const form = new FormController(fields, { lang: () => rt.lang, call: (fn) => rt.call(fn) });
    form.set("name", "x");
    const out = await form.submit((body) => send(rt.transport, { operationId: "createProduct", method: "POST", path: "/products", body }));
    expect(out).toEqual({ ok: false, invalid: true });
    expect(log).toHaveLength(0);
    expect(form.view().errors).toEqual({ name: "At least 2 characters", price: "Required" });
    form.set("name", "Lamp");
    form.set("price", "12.5");
    form.set("email", "nope");
    expect(form.view().errors).toEqual({ email: "Enter an email address" });
    form.set("email", "");
    const sent = await form.submit((body) => send(rt.transport, { operationId: "createProduct", method: "POST", path: "/products", body }), { description: "made here" });
    expect(sent).toMatchObject({ ok: true, response: { name: "Lamp", price: 12.5 } });
    expect(log[0].body).toEqual({ name: "Lamp", price: 12.5, description: "made here" });
  });

  it("put the server's errors on the fields their pointers name, and its problem on the form", async () => {
    const rt = createRuntime({ transport: shopTransport(), lang: "en" });
    const { FormController } = await import("./forms");
    const form = new FormController(fields, { lang: () => rt.lang, call: (fn) => rt.call(fn) });
    form.set("name", "Taken name");
    form.set("price", 3);
    const out = await form.submit((body) => send(rt.transport, { operationId: "createProduct", method: "POST", path: "/products", body }));
    expect(out).toMatchObject({ ok: false, status: 422 });
    expect(form.view()).toMatchObject({ errors: { name: "That name is taken" }, error: { status: 422, title: "Couldn't submit. Check the fields and try again." }, submitting: false });
    /* the server's word goes with what it was about */
    form.set("name", "Another");
    expect(form.view().errors).toEqual({});
  });

  it("count an upload's progress where the platform reports it", async () => {
    const rt = createRuntime({ transport: shopTransport() });
    const { FormController } = await import("./forms");
    const form = new FormController({ file: { kind: "file", required: true, schema: { type: "string", format: "binary" } } }, { lang: () => "en", call: (fn) => rt.call(fn) });
    form.set("file", { name: "a.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,AAAA" });
    const seen: (number | null)[] = [];
    form.store.subscribe(() => seen.push(form.state.run.progress));
    await form.submit(async (_body, init) => {
      init.onUploadProgress?.(2, 4);
      return { url: "x" };
    });
    expect(seen).toContain(50);
    expect(form.state.run.progress).toBe(100);
  });
});

describe("calls", () => {
  it("run then with the answer, or put an optimistic change back and run catch", async () => {
    const rt = createRuntime({ transport: shopTransport({ products: sampleProducts(3) }) });
    const spec = productsSpec(rt.transport);
    await rt.sources.enter(spec);
    const row = rt.sources.state(spec.key).items![1];
    const said: string[] = [];
    const failed = await rt.call(() => Promise.reject(new ApiError(500, { title: "Server error", status: 500 })), {
      optimistic: () => rt.sources.optimistic(spec.key, row, { remove: true }),
      // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
      then: () => said.push("then"),
      catch: (e) => said.push(`catch ${e.status}`),
    });
    expect(failed.ok).toBe(false);
    expect(rt.sources.state(spec.key).items).toHaveLength(3);
    const ok = await rt.call(async () => ({ done: true }), {
      optimistic: () => rt.sources.optimistic(spec.key, row, { remove: true }),
      // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
      then: (r) => said.push(`then ${JSON.stringify(r)}`),
      status: 204,
    });
    expect(ok).toMatchObject({ ok: true, status: 204 });
    expect(rt.sources.state(spec.key).items).toHaveLength(2);
    expect(said).toEqual(["catch 500", 'then {"done":true}']);
  });
});

describe("late answers (docs/交互规则.md, 迟到的回答)", () => {
  /** an answer held until it is let go */
  const held = <T>() => {
    let let_go: (v: T) => void = () => {};
    const p = new Promise<T>((r) => (let_go = r));
    return { p, answer: (v: T) => let_go(v) };
  };

  it("drop every answer after a restart, undoing nothing, and say so", async () => {
    const rt = createRuntime({ transport: shopTransport() });
    const said: string[] = [];
    const undone: string[] = [];
    const a = held<{ ok: true }>();
    // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
    const out = rt.call(() => a.p, { optimistic: () => () => undone.push("undo"), then: () => said.push("then") });
    rt.restart();
    a.answer({ ok: true });
    expect(await out).toMatchObject({ ok: false, dropped: true });
    const failing = held<never>();
    const lost = rt.call(() => failing.p.then(() => Promise.reject(new ApiError(500, {}))), { optimistic: () => () => undone.push("undo"), catch: () => said.push("catch") });
    rt.restart();
    failing.answer(undefined as never);
    expect(await lost).toMatchObject({ ok: false, dropped: true });
    expect(said).toEqual([]);
    expect(undone).toEqual([]);
  });

  it("let the newest call of a kind speak for it: an older answer runs nothing and undoes nothing", async () => {
    const rt = createRuntime({ transport: shopTransport() });
    const said: string[] = [];
    const undone: string[] = [];
    const key = callKey("home", "like", "like");
    const first = held<string>();
    const second = held<string>();
    // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
    const one = rt.call(() => first.p, { key, optimistic: () => () => undone.push("one"), then: (r) => said.push(r) });
    // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
    const two = rt.call(() => second.p, { key, then: (r) => said.push(r) });
    /* another part's call of the same operation is another kind */
    // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
    const other = rt.call(async () => "other", { key: callKey("home", "save", "like"), then: (r) => said.push(r) });
    second.answer("second");
    await two;
    await other;
    first.answer("first");
    expect(await one).toMatchObject({ ok: false, dropped: true });
    expect(said).toEqual(["other", "second"]);
    expect(undone).toEqual([]);
    /* an invoke likewise */
    const answers = [held<string>(), held<string>()];
    let n = 0;
    rt.setCapabilities({ invoke: async () => ({ ok: true, result: await answers[n++].p }) });
    // eslint-disable-next-line unicorn/no-thenable -- an invoke's options, never awaited
    const older = rt.invoke("scan.code", {}, { key: "scan", then: (r) => said.push(`scan ${String(r)}`) });
    // eslint-disable-next-line unicorn/no-thenable -- an invoke's options, never awaited
    const newest = rt.invoke("scan.code", {}, { key: "scan", then: (r) => said.push(`scan ${String(r)}`) });
    await tick();
    answers[1].answer("new");
    await newest;
    answers[0].answer("old");
    expect(await older).toMatchObject({ ok: false, dropped: true });
    expect(said).toEqual(["other", "second", "scan new"]);
  });

  it("tell an answer whether the visitor is still where the tap left them, the tap's own move not counted", async () => {
    const rt = createRuntime({ transport: shopTransport() });
    const seen: boolean[] = [];
    const a = held<string>();
    // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
    const stayed = rt.call(() => a.p, { then: (_r, _s, at) => seen.push(at.here) });
    /* the tap goes where it goes after making the call: still the tap */
    rt.moved();
    await tick();
    a.answer("x");
    await stayed;
    const b = held<string>();
    // eslint-disable-next-line unicorn/no-thenable -- a call's options, never awaited
    const left = rt.call(() => b.p.then(() => Promise.reject(new ApiError(500, {}))), { catch: (_e, _s, at) => seen.push(at.here) });
    await tick();
    rt.moved();
    b.answer("x");
    await left;
    expect(seen).toEqual([true, false]);
  });

  it("run a form's then and catch only for the session that sent it", async () => {
    const rt = createRuntime({ transport: shopTransport(), lang: "en" });
    const said: string[] = [];
    let handle: ReturnType<typeof useForm> | undefined;
    const a = held<{ id: string }>();
    function Screen() {
      // eslint-disable-next-line unicorn/no-thenable -- a form's options, never awaited
      handle = useForm({ fields: {}, send: () => a.p, then: () => said.push("then"), catch: () => said.push("catch") });
      return null;
    }
    renderToString(createElement(RuntimeProvider, { runtime: rt }, createElement(Screen)));
    const sent = handle!.submit();
    rt.restart();
    a.answer({ id: "1" });
    await sent;
    expect(said).toEqual([]);
  });
});

describe("expressions", () => {
  const $ = new Bindings({ data: { product: { value: { name: "Lamp", price: 12.5, tags: ["a", "b"] } } }, params: { productId: "p1" } }, { lang: "zh", now: Date.parse("2026-11-06T12:00:00Z") });

  it("read each kind of value a part takes, as the preview reads it", () => {
    expect($.text("data.product.value.name")).toBe("Lamp");
    expect($.text("currency(data.product.value.price)")).toBe("¥12.50");
    expect($.text("data.product.value.missing.deeper")).toBe("");
    expect($.num("data.product.value.price * 2", 0, 0, 20)).toBe(20);
    expect($.num("data.product.value.name", 7)).toBe(7);
    expect($.bool("data.product.value.tags", false)).toBe(true);
    expect($.bool("data.nothing")).toBe(false);
    expect($.pick("'error'", ["error", "muted"] as const, "muted")).toBe("error");
    expect($.pick("'loud'", ["error", "muted"] as const, "muted")).toBe("muted");
    expect($.fill("{{len(data.product.value.tags)}} tags, {{current.x}}")).toBe("2 tags, {{current.x}}");
    expect($.list("data.product.value.tags")).toEqual(["a", "b"]);
    expect($.path("params.productId")).toBe("p1");
    expect($.arg("data.product.value")).toBeUndefined();
    const row = $.with({ item: { id: "p9", name: "Mug" }, index: 3 });
    expect(row.text("item.name + ' #' + (index + 1)")).toBe("Mug #4");
    expect(keyOf({ id: "p9" }, 3)).toBe("p9");
    expect(keyOf("x", 3)).toBe(3);
  });

  it("never runs what the data holds", () => {
    const evil = new Bindings({ item: { constructor: { name: "x" }, toString: () => "ran" } }, { lang: "en" });
    expect(evil.text("item.constructor.name")).toBe("");
    expect(evil.text("item.toString")).toBe("");
  });
});

describe("the hooks", () => {
  it("draw a screen's first state: its source loading, its region on loading, the session, a form", () => {
    const rt = createRuntime({ transport: shopTransport(), presumed: true, lang: "en" });
    function Screen() {
      const products = useDataSource(productsSpec(rt.transport));
      const session = useSession();
      const $ = useBindings({ data: { products } });
      const form = useForm({ fields: { name: { kind: "text", required: true, schema: { type: "string" } } }, initial: { name: "Lamp" }, send: async () => ({}) });
      const region = useRegion(products);
      return createElement("p", null, `${region} ${products.status} ${session.signedIn} ${$.text("auth.signedIn")} ${form.text("name")} ${$.with({ form: form.view }).text("form.name")}`);
    }
    const html = renderToString(createElement(RuntimeProvider, { runtime: rt }, createElement(Screen)));
    expect(html).toContain("loading idle true true Lamp Lamp");
  });
});
