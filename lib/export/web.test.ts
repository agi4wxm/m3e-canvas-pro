/* The product's web app of a document bound to its contract (lib/printBindings.ts): what the screens print for their
 * data, expressions, repeats, forms, regions, taps and params, what the app's runtime keeps for them (the session,
 * the guards, the params in the address), and that a document's expressions only ever come out as strings, whatever
 * they hold. scripts/check-product.ts shop runs the same app in a browser. */

import { readFile } from "node:fs/promises";
import { parse } from "@babel/parser";
import { beforeAll, describe, expect, it } from "vitest";
import { buildProject } from "../exportProject";
import { systemsDoc } from "../exportProject.fixture";
import { setGlobalLang } from "../i18n";
import type { Doc } from "../tokens";
import { buildProduct } from "./product";
import { boundShopDoc } from "./product.fixture";
import type { Product } from "./types";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const build = (doc: Doc) => buildProduct(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};
const web = (p: Product, path: string) => text(p, `apps/web/src/generated/${path}`);

let shop: Product;
beforeAll(async () => {
  shop = await build(boundShopDoc().doc);
}, 60_000);

describe("the web app of a document bound to its contract", () => {
  it("gives each screen a hook per data source, named after it, on the typed client", () => {
    const data = web(shop, "screens/ProductsScreen.data.ts");
    expect(data).toContain("export function useProducts()");
    expect(data).toContain('key: sourceKey("listProducts")');
    expect(data).toContain('paging: { style: "cursor", items: "items", cursorParam: "cursor", nextField: "nextCursor", limitParam: "limit" }');
    expect(data).toContain("load: ({ page, signal }) => api.listProducts({ query: page }, { signal })");
    const detail = web(shop, "screens/ProductScreen.data.ts");
    expect(detail).toContain("export function useProduct($: Bindings)");
    expect(detail).toContain('const path = { productId: $.path("params.productId") }');
    expect(detail).toContain("api.getProduct({ params: path }, { signal })");
    expect(web(shop, "screens/ProductsScreen.tsx")).toContain('import { useProducts } from "./ProductsScreen.data"');
  });

  it("draws a list from its data, keyed by id, each state of its region in a branch of its own", () => {
    const screen = web(shop, "screens/ProductsScreen.tsx");
    expect(screen).toContain("const products = useProducts()");
    expect(screen).toContain("const productsState = useRegion(products)");
    expect(screen).toContain('{productsState === "ready" && $.list("data.products.items").map((item, index) => {');
    expect(screen).toContain("const row = $.with({ item, index })");
    expect(screen).toContain("<Fragment key={keyOf(item, index)}>");
    for (const state of ["loading", "empty", "error", "forbidden"]) expect(screen, state).toContain(`{productsState === "${state}" && (`);
    expect(screen).toContain('{$.text("data.products.error.detail ?? data.products.error.title")}');
    /* a tap on a row opens the detail with the row's id; the body pulls to refresh and pages at its end */
    expect(screen).toContain('row: { to: "product", transition: "slide", params: { productId: "item.id" } },');
    expect(screen).toContain('onPress={() => act(productsScreenActions.row, { part: "row", item, index })}');
    expect(screen).toContain("sources: { products },");
    expect(screen).toContain("<DataScroll");
    expect(screen).toContain("onRefresh={() => { void products.refresh() }}");
    expect(screen).toContain("onEnd={() => { void products.loadMore() }}");
    expect(screen).toContain('row.text("item.name")');
  });

  it("makes a form controlled, checked by the rules the contract's schema gives its fields, its errors on them", () => {
    const data = web(shop, "screens/NewProductScreen.data.ts");
    expect(data).toContain("export const CREATE_PRODUCT_FIELDS: FormFields = {");
    expect(data).toContain('name: { kind: "text", required: true, schema: { type: "string", minLength: 1, maxLength: 120 } },');
    expect(data).toContain('"price.amount": { kind: "number", required: true, schema: { type: "number", exclusiveMinimum: 0 } },');
    expect(data).toContain('category: { kind: "select", required: true, schema: { type: "string", enum: ["shoes", "shirts", "bags"] } },');
    const screen = web(shop, "screens/NewProductScreen.tsx");
    expect(screen).toContain("const createProductForm = useForm({");
    expect(screen).toContain('id: "NewProductScreen/createProductForm"');
    expect(screen).toContain("send: (body, init) => api.createProduct({ body: body as NewProduct }, init)");
    expect(screen).toContain("status: 201");
    /* what follows the answer is the design's, run by the interpreter (lib/actions) as a call's then is */
    expect(screen).toContain('createProductFormThen: { to: "products", transition: "slide", effects: [{ do: "snackbar", message: "Added {{response.name}}" }] },');
    expect(screen).toContain('createProductForm: { handle: createProductForm, operationId: "createProduct", then: newProductScreenActions.createProductFormThen },');
    expect(screen).toMatch(/\{ do: "submit", form: "createProductForm" \}/);
    expect(screen).toContain('value={createProductForm.text("name")}');
    expect(screen).toContain('onChange={(event) => createProductForm.set("name", event.target.value)}');
    expect(screen).toContain('aria-invalid={!!createProductForm.error("name") || undefined}');
    /* a select's error where its supporting words stand: tested by truth alone, with no redundant !! (ESLint) */
    expect(screen).toContain('supporting={createProductForm.error("category") ? "" : undefined}');
    expect(screen).not.toMatch(/!![\w.]+\([^)]*\) \?/);
    expect(screen).toContain("const $form = $.with({ form: createProductForm.view })");
    /* the form's own error shows while there is one: its condition is read, never taken as holding */
    expect(screen).toContain('{$form.holds("form.error") && (');
    expect(screen).toContain('onClick={() => act(newProductScreenActions.addAProduct2, { part: "addAProduct2", form: "createProductForm" })}');
  });

  it("opens a link and lends the parts' own copy buttons the app's capabilities, the browser's way where it has no adapter", () => {
    const runtime = web(shop, "runtime.tsx");
    expect(runtime).toContain('void runtime.invoke("link.open", { url: page.href })');
    expect(runtime).toContain("<PartHostContext.Provider value={parts}>{children}</PartHostContext.Provider>");
    expect(runtime).toContain('!out.ok && out.error.type === "not-implemented" ? browserCapability(name, args) : out');
    expect(runtime).not.toContain("window.open");
  });

  it("signs in through the contract's sign-in and goes back to where it was sent from", () => {
    const screen = web(shop, "screens/SignInScreen.tsx");
    expect(screen).toContain("send: (body, init) => api.login({ body: body as LoginRequest }, init)");
    expect(screen).toContain('loginFormThen: { to: "products", transition: "fade" },');
    /* once the sign-in answers, the app goes back where it was sent from instead (lib/actions: Host.afterSignIn) */
    expect(web(shop, "runtime.tsx")).toContain("afterSignIn: (operation) => operation === LOGIN && app().afterSignIn(),");
    expect(web(shop, "runtime.tsx")).toContain('const LOGIN: string | undefined = "login"');
    const runtime = web(shop, "runtime.tsx");
    expect(runtime).toContain("const NEEDS_SIGN_IN: Partial<Record<ScreenId, true>> = { newProduct: true, orders: true }");
    expect(runtime).toContain('const SIGN_IN: ScreenId | undefined = "signIn"');
    expect(runtime).toContain('product: [{ name: "productId", type: "string", example: "00000000-0000-4000-8000-000000000000" }],');
    expect(runtime).toContain("runtime.whenUnauthorized(");
    const api = web(shop, "api.ts");
    expect(api).toContain('login: "login",');
    expect(api).toContain('refresh: { operationId: "refreshToken", method: "POST", path: "/auth/refresh" },');
    expect(api).toContain('createProduct: { header: "Authorization", prefix: "Bearer " },');
    expect(api).toContain("listProducts: null,");
    expect(api).toContain('storageKey: "shop:session"');
  });

  it("puts a screen's params in its address, and reads them back", () => {
    expect(web(shop, "routes.ts")).toContain('product: "/product/:productId",');
    expect(web(shop, "router.ts")).toContain("navigate(asked.screen, asked.params");
    expect(text(shop, "apps/web/package.json")).toContain('"@shop/app-runtime": "0.1.0"');
  });

  it("starts where the runtime does: the first flow's screen, which need not be the first screen", async () => {
    /* the systems document's first screen (Intro) starts no flow; Home starts the first, Main */
    const p = await build(systemsDoc().doc);
    const routes = web(p, "routes.ts");
    const runtime = web(p, "runtime.tsx");
    const first = /^export const FLOWS = \{\n {2}\w+: \{ name: "Main", screen: "(\w+)" \},$/m.exec(runtime)?.[1];
    expect(first).toBe("home");
    expect(routes).toContain(`export const START: ScreenId = "${first}"`);
    expect(routes).toContain('  home: "/home",');
    expect(/^export type ScreenId = "intro" \| /m.test(runtime)).toBe(true);
    /* without a flow, the first screen */
    expect(web(shop, "routes.ts")).toContain('export const START: ScreenId = "products"');
  }, 60_000);

  it("starts the mocks signed in as their session does, a scenario chosen by the address, never in a production build", () => {
    const mocks = web(shop, "mocks.ts");
    expect(mocks).toContain('new URLSearchParams(window.location.search).get("scenario") ?? import.meta.env.VITE_MOCK_SCENARIO');
    expect(mocks).toContain("setTransport(withDataFiles(mock), { presumed: startsSignedIn(mock.scenario) })");
    expect(text(shop, "packages/mocks/src/index.ts")).toContain("export function startsSignedIn(scenario?: string): boolean");
    expect(text(shop, "apps/web/src/main.tsx")).toContain('import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== "off" ? await (await import("./generated/mocks")).startMocks(');
  });

  it("asks every ESLint rule of the generated screens, data hooks and the rest, but the prototype's shell and runtime", () => {
    const eslint = text(shop, "eslint.config.js");
    expect(eslint).toContain('files: ["apps/web/src/generated/App.tsx", "apps/web/src/generated/runtime.tsx"],');
    expect(eslint).not.toContain('files: ["apps/web/src/generated/**"]');
  });

  it("prints the document's expressions only as strings, whatever they hold", async () => {
    const { doc } = boundShopDoc();
    const evil = `item.name + "\\"); markA(\`\${markB}\`); //*/ markC"`;
    const groups = doc.groups.map((g) => ({ ...g, items: g.items.map((it) => (it.bind?.text?.startsWith("=item.name") ? { ...it, bind: { ...it.bind, text: `=${evil}` } } : it)) }));
    const frames = doc.frames.map((f) => (f.data?.length ? { ...f, data: f.data.map((d) => ({ ...d, params: { ...d.params, q: `"markD" + params.x` } })) } : f));
    const p = await build({ ...doc, groups, frames });
    const screen = web(p, "screens/ProductsScreen.tsx");
    expect(screen).toContain("markA");
    for (const path of Object.keys(p.files).filter((x) => x.startsWith("apps/web/src/generated/screens/"))) {
      const ast = parse(text(p, path), { sourceType: "module", plugins: ["typescript", ...(path.endsWith(".tsx") ? (["jsx"] as const) : [])] });
      const names: string[] = [];
      const visit = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(visit);
        if (!n || typeof n !== "object") return;
        const node = n as { type?: string; name?: unknown };
        if ((node.type === "Identifier" || node.type === "JSXIdentifier") && typeof node.name === "string" && /^mark[A-D]$/.test(node.name)) names.push(node.name);
        for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "extra") visit(v);
      };
      visit(ast);
      expect(names, path).toEqual([]);
    }
    expect(Object.values(p.files).some((f) => typeof f.body === "string" && /\beval\(|new Function\(/.test(f.body))).toBe(false);
  });
});

describe("a condition over an expression in the prototype export", () => {
  it("is read by the runtime over the variables, no longer taken as holding", async () => {
    const { doc } = boundShopDoc();
    const { files } = await buildProject(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const screen = files["src/screens/NewProductScreen.tsx"] as string;
    expect(screen).toContain('{holds("form.error") && (');
    const runtime = files["src/runtime.tsx"] as string;
    expect(runtime).toContain('import { holds as holdsExpr } from "@/lib/bindings/expr"');
    expect(runtime).toContain("holds: (expr) => holdsExpr(expr,");
    expect(files["src/lib/bindings/expr.ts"]).toBeTruthy();
  });
});
