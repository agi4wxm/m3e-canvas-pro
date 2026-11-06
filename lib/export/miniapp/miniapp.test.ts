import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { normalizeTheme } from "../../tokens";
import { PARTS, partBySlug } from "../../../parts/registry";
import { NATIVE, kitPropName } from "../../../miniapp-kit/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../miniapp-kit/src/kit/parts.generated";
import { SET_ONLY, propValues } from "../rn/data";
import { isExportSource } from "../sourceList";
import { buildProduct } from "../product";
import { boundShopDoc } from "../product.fixture";
import { MINIAPP_KIT_DIR, MINIAPP_KIT_FILES, kitFileFor } from "./kitFiles";
import { miniThemeOf, themeCss } from "./theme";

/* The mini-program (lib/export/miniapp, lib/export/targets/miniapp.ts): the kit it copies is the kit's folder, its data
 * still says what the editor's registry says, its theme is a stylesheet a mini-program reads, and a document bound to
 * its contract comes out as one page per screen, its data, forms, sign-in and mocks on the shared runtime. */

beforeAll(() => setGlobalLang("en"));

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const fromDisk = (path: string) => readFile(join(ROOT, path), "utf8");
const parses = (path: string, text: string) => parse(text, { sourceType: "module", plugins: ["typescript", ...(path.endsWith(".tsx") ? (["jsx"] as const) : [])] });

/** every file under a folder, by its path from there */
function filesOf(dir: string, at = ""): string[] {
  return readdirSync(join(dir, at)).flatMap((n) => {
    const p = at ? `${at}/${n}` : n;
    return statSync(join(dir, p)).isDirectory() ? filesOf(dir, p) : [p];
  });
}

describe("the kit", () => {
  it("is copied whole: every file of its folder, each one an export may read", () => {
    expect([...MINIAPP_KIT_FILES].sort()).toEqual(filesOf(join(ROOT, MINIAPP_KIT_DIR)).sort());
    for (const f of MINIAPP_KIT_FILES) expect(isExportSource(`${MINIAPP_KIT_DIR}/${f}`), f).toBe(true);
  });

  it("reads the product's runtime package once copied", () => {
    expect(kitFileFor('import { useRuntime } from "@m3e/app-runtime";\nconst a = "@m3e/app-runtime";\n', "@shop/app-runtime")).toBe('import { useRuntime } from "@shop/app-runtime";\nconst a = "@m3e/app-runtime";\n');
  });

  it("covers only parts the registry has, with every default as the registry reads it (run bun run gen:miniapp when this fails)", () => {
    for (const slug of Object.keys(NATIVE)) expect(partBySlug(slug), slug).toBeDefined();
    for (const d of PARTS.filter((x) => Object.prototype.hasOwnProperty.call(NATIVE, x.slug))) {
      const own = Object.fromEntries(Object.entries(propValues(d, {})).filter(([k]) => !SET_ONLY.has(k)).map(([k, v]) => [kitPropName(d.slug, k), v]));
      expect(KIT_PARTS[d.slug]?.defaults, d.slug).toEqual(own);
    }
  });
});

describe("the theme", () => {
  it("is a stylesheet of class selectors only (WXSS has no :root, no element or universal selectors), light and dark", () => {
    const theme = miniThemeOf({ theme: normalizeTheme({ style: "wechat" }), paletteKey: "purple" });
    const css = themeCss(theme);
    const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\})\s*([^{}]+)\{/g)].map((m) => m[2].trim());
    expect(selectors.length).toBeGreaterThan(1);
    for (const s of selectors) expect(s, s).toMatch(/^\.[\w-]+(\.[\w-]+)?$/);
    expect(css).toMatch(/\.m3e-theme\s*\{[^}]*--md-sys-color-primary:/);
    expect(css).toMatch(/\.m3e-theme\.m3e-dark\s*\{[^}]*--md-sys-color-primary:/);
    expect(css).not.toMatch(/\brpx\b/);
  });
});

describe("the shop bound to its contract", () => {
  let files: Record<string, string> = {};
  beforeAll(async () => {
    const { doc, widths } = boundShopDoc();
    const product = await buildProduct(doc, widths, { lang: "en", read: fromDisk });
    files = Object.fromEntries(Object.entries(product.files).filter(([p]) => p.startsWith("apps/miniapp/")).map(([p, f]) => [p.slice("apps/miniapp/".length), typeof f.body === "string" ? f.body : ""]));
  }, 120_000);

  it("is a page for each screen, in app.config's pages, each drawing its screen in the app's providers", () => {
    const pages = JSON.parse(/"pages": (\[[^\]]*\])/.exec(files["src/app.config.ts"])![1]) as string[];
    expect(pages).toEqual(["pages/products/index", "pages/product/index", "pages/newProduct/index", "pages/signIn/index", "pages/orders/index", "pages/photo/index"]);
    for (const p of pages) {
      expect(files[`src/${p}.tsx`], p).toContain("<Root>");
      expect(files[`src/${p}.config.ts`], p).toContain('"navigationStyle":"custom"');
    }
    expect(files["src/pages/products/index.config.ts"]).toContain('"enablePullDownRefresh":true');
    expect(files["src/pages/product/index.config.ts"]).not.toContain("enablePullDownRefresh");
    expect(JSON.parse(files["src/generated/warnings.json"])).toEqual([]);
    for (const [p, text] of Object.entries(files)) if (/\.(ts|tsx)$/.test(p)) expect(() => parses(p, text), p).not.toThrow();
  });

  it("binds the screens through the shared runtime: a paged source, a param, a form kept by its id, the sign-in", () => {
    const list = files["src/generated/screens/ProductsScreen.tsx"];
    expect(list).toContain('paging: { style: "cursor"');
    expect(list).toContain("usePageData([{ source: products, pull: true, more: true }])");
    expect(list).toContain('$.list("data.products.items")');
    expect(list).toContain('{ to: "product", params: { productId: "item.id" } }');
    expect(files["src/generated/screens/ProductScreen.tsx"]).toContain('productId: $0.arg("params.productId")');
    const form = files["src/generated/screens/NewProductScreen.tsx"];
    expect(form).toContain('id: "newProduct/addAProductForm"');
    expect(form).toContain('send: (body, init) => CALLS["createProduct"]({}, body, init)');
    expect(files["src/generated/spec.ts"]).toContain('newProduct: { path: "pages/newProduct/index", auth: "required" }');
    expect(files["src/generated/spec.ts"]).toContain('login: "login"');
  });

  it("calls the API over Taro.request with the session in Taro's storage, and the mocks only in development", () => {
    const runtime = files["src/generated/runtime.ts"];
    expect(runtime).toContain("createTaroTransport({ baseUrl: API_BASE_URL })");
    expect(runtime).toContain("storage: taroStorage");
    expect(runtime).toContain('login: "login",');
    expect(runtime).toMatch(/if \(process\.env\.NODE_ENV !== "production" && process\.env\.TARO_APP_API_MOCKS !== "off"\) \{\n\s+const \{ startMocks \} = require\("\.\/mocks"\)/);
    expect(files["src/generated/mocks.ts"]).toContain("{ presumed: startsSignedIn(mock.scenario) }");
    expect(files["src/generated/calls.ts"]).toContain("export const api = createApi(runtime.transport);");
  });

  it("comes out the same each time", async () => {
    const { doc, widths } = boundShopDoc();
    const again = await buildProduct(doc, widths, { lang: "en", read: fromDisk });
    for (const [p, text] of Object.entries(files)) expect(again.files[`apps/miniapp/${p}`].body, p).toBe(text);
  }, 120_000);
});
