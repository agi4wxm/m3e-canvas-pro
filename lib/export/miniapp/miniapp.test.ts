import { readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { BACK_TARGET, STAY_TARGET, makeItem, normalizeTheme, type Doc, type Effect, type Group, type Item } from "../../tokens";
import { PARTS, partBySlug } from "../../../parts/registry";
import { NATIVE, kitPropName } from "../../../miniapp-kit/src/kit/coverage";
import { PARTS as KIT_PARTS } from "../../../miniapp-kit/src/kit/parts.generated";
import { SET_ONLY, propValues } from "../rn/data";
import { isExportSource } from "../sourceList";
import { importsIn } from "../../exportProject";
import { buildProduct } from "../product";
import { boundShopDoc } from "../product.fixture";
import { MINIAPP_KIT_DIR, MINIAPP_KIT_FILES, kitFileFor } from "./kitFiles";
import { miniThemeOf, themeCss } from "./theme";
import { callsModule } from "./app";
import { printMiniScreens } from "./print";

/* The mini-program (lib/export/miniapp, lib/export/targets/miniapp.ts): the kit it copies is the kit's folder, its data
 * still says what the editor's registry says, its theme is a stylesheet a mini-program reads, and a document bound to
 * its contract comes out as one page per screen, its data, forms, sign-in and mocks on the shared runtime. */

beforeAll(() => setGlobalLang("en"));

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const fromDisk = (path: string) => readFile(join(ROOT, path), "utf8");
/** a file's text, or a binary file's bytes in base64 (the pictures the design holds) */
const textOf = (body: string | Uint8Array) => (typeof body === "string" ? body : Buffer.from(body).toString("base64"));
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
    /* an import too long for one line, as Prettier writes it */
    expect(kitFileFor('import {\n  run,\n  type Tap,\n} from "@m3e/app-runtime";\nexport type { Action } from "@m3e/app-runtime";\n', "@shop/app-runtime")).toBe('import {\n  run,\n  type Tap,\n} from "@shop/app-runtime";\nexport type { Action } from "@shop/app-runtime";\n');
  });

  it("names no module of the kit's own app once copied: every import of the runtime is the product's package", async () => {
    for (const f of MINIAPP_KIT_FILES) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const copied = kitFileFor(await fromDisk(`${MINIAPP_KIT_DIR}/${f}`), "@shop/app-runtime");
      const sources = parses(f, copied).program.body.flatMap((s) => ("source" in s && s.source ? [s.source.value] : []));
      expect(sources.filter((m) => m.startsWith("@m3e/")), f).toEqual([]);
    }
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

describe("the screens", () => {
  const item = (slug: string, id: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
  const docOf = (frames: Doc["frames"], groups: Group[]): Doc => ({ groups, frames, paletteKey: "purple", frame: "phone", title: "T", brief: "" });
  const stay = (effects: Effect[]) => ({ to: STAY_TARGET, effects });

  it("show and hide every part a tap reaches, the ones that start on show too, by the group the part is in", () => {
    const doc = docOf(
      [{ id: "f", name: "Home", x: 0, y: 0 }],
      [
        { id: "g1", x: 16, y: 16, axis: "x", name: "Note", items: [item("text", "note", { text: "A note" })] },
        { id: "g2", x: 16, y: 80, axis: "x", items: [item("text", "left", { text: "Left" }), item("text", "right", { text: "Right" })] },
        { id: "g3", x: 16, y: 140, axis: "x", name: "Secret", hidden: true, items: [item("text", "secret", { text: "A secret" })] },
        { id: "g4", x: 16, y: 200, axis: "x", name: "Hide", items: [item("button", "hide", { label: "Hide" }, { action: stay([{ do: "hide", part: "note" }]) })] },
        { id: "g5", x: 16, y: 260, axis: "x", name: "Flip", items: [item("button", "flip", { label: "Flip" }, { action: stay([{ do: "toggle", part: "right" }, { do: "show", part: "secret" }]) })] },
      ],
    );
    const [home] = printMiniScreens(doc, {}).screens;
    const src = home.source;
    /* the note starts on show, and goes when a tap hides it */
    expect(src).toMatch(/<At x=\{16\} y=\{16\}>\n\s+\{s\.shows\("note"\) \? \(/);
    expect(src).toContain('{ do: "hide", part: "note" }');
    /* the pair goes as one, by its first part's name, whichever of them the tap names */
    expect(src).toContain('{ do: "toggle", part: "text" }');
    expect(src).toMatch(/\{s\.shows\("text"\) \? \(/);
    /* only what starts hidden starts hidden */
    expect(src).toContain('const s = useScreen("home", { hidden: ["secret"] });');
    expect(src).toContain('{ do: "show", part: "secret" }');
    /* a part no tap reaches is drawn as it is */
    expect(src).not.toContain('s.shows("hide")');
  });

  it("never names a screen's key where a tap goes beside a screen, nor its component as the kit's Screen", () => {
    const names = ["Home", "Back", "Link", "None", "Screen"];
    const frames = names.map((name, i) => ({ id: `f${i}`, name, x: i * 600, y: 0 }));
    const taps = names.slice(1).map((name, i) => ({ id: `t${i}`, x: 16, y: 16 + i * 60, axis: "x" as const, items: [item("button", `to${name}`, { label: `To ${name}` }, { action: { to: `f${i + 1}` } })] }));
    const back = { id: "tb", x: 16, y: 400, axis: "x" as const, items: [item("button", "goBack", { label: "Go back" }, { action: { to: BACK_TARGET } })] };
    const nowhere = { id: "tn", x: 16, y: 460, axis: "x" as const, items: [item("button", "stay", { label: "Stay" }, { action: stay([{ do: "snackbar", message: "Hi" }]) })] };
    const printed = printMiniScreens(docOf(frames, [...taps, back, nowhere]), {});
    expect(printed.screens.map((s) => [s.key, s.component, s.path])).toEqual([
      ["home", "HomeScreen", "pages/home/index"],
      ["back2", "BackScreen", "pages/back2/index"],
      ["link2", "LinkScreen", "pages/link2/index"],
      ["none2", "NoneScreen", "pages/none2/index"],
      ["screen", "Screen2", "pages/screen/index"],
    ]);
    const home = printed.screens[0].source;
    for (const key of ["back2", "link2", "none2", "screen"]) expect(home).toContain(`{ to: ${JSON.stringify(key)} }`);
    expect(home).toContain('{ to: "back" }');
    expect(home).toContain('{ to: "none", effects: [{ do: "snackbar", message: "Hi" }] }');
    /* the kit's Screen and the screen's own component are two names in its file */
    for (const s of printed.screens) expect(() => parses(`${s.component}.tsx`, s.source), s.component).not.toThrow();
    expect(printed.screens[4].source).toContain("export function Screen2()");
  });
});

describe("the shop bound to its contract", () => {
  let files: Record<string, string> = {};
  beforeAll(async () => {
    const { doc, widths } = boundShopDoc();
    const product = await buildProduct(doc, widths, { lang: "en", read: fromDisk });
    files = Object.fromEntries(Object.entries(product.files).filter(([p]) => p.startsWith("apps/miniapp/")).map(([p, f]) => [p.slice("apps/miniapp/".length), textOf(f.body)]));
  }, 120_000);

  it("is a page for each screen, in app.config's pages, each drawing its screen in the app's providers", () => {
    const pages = JSON.parse(/"pages": (\[[^\]]*\])/.exec(files["src/app.config.ts"])![1]) as string[];
    expect(pages).toEqual(["pages/products/index", "pages/product/index", "pages/newProduct/index", "pages/signIn/index", "pages/orders/index", "pages/photo/index"]);
    for (const p of pages) {
      expect(files[`src/${p}.tsx`], p).toContain("<Root>");
      expect(files[`src/${p}.config.ts`], p).toContain('"navigationStyle":"custom"');
    }
    /* light, as the design is (the device's mode only for a design drawn in both) */
    expect(files["src/generated/root.tsx"]).toContain("<ThemeProvider theme={theme} dark={false}>");
    expect(files["src/app.config.ts"]).not.toContain("darkmode");
    expect(files["src/pages/products/index.config.ts"]).toContain('"enablePullDownRefresh":true');
    expect(files["src/pages/product/index.config.ts"]).not.toContain("enablePullDownRefresh");
    expect(JSON.parse(files["src/generated/warnings.json"])).toEqual([]);
    for (const [p, text] of Object.entries(files)) if (/\.(ts|tsx)$/.test(p)) expect(() => parses(p, text), p).not.toThrow();
  });

  it("has every module its sources import: a file there, or a package its package.json names", () => {
    const pkg = JSON.parse(files["package.json"]);
    const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
    for (const path of Object.keys(files).filter((p) => p.startsWith("src/") && /\.(ts|tsx|css)$/.test(p))) {
      for (const spec of importsIn(files[path], path.endsWith(".css"))) {
        if (spec.startsWith(".")) {
          const stem = new URL(spec, `file:///${path}`).pathname.slice(1);
          expect([stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`, `${stem}/index.ts`].some((p) => p in files), `${path} imports ${spec}`).toBe(true);
        } else {
          const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          expect(declared.has(name), `${path} imports ${spec}`).toBe(true);
        }
      }
    }
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

  it("keeps a path parameter one segment of its path where it builds the path itself, as the typed client does", () => {
    /* a body the typed client does not type (no schema): the call writes its path itself */
    const openapi = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: { "/files/{name}": { put: { operationId: "putFile", parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/octet-stream": {} } }, responses: { "204": { description: "kept" } } } } } };
    const op = { name: "putFile", operationId: "putFile", method: "PUT" as const, path: "/files/{name}", params: ["name"], query: false, body: false, bodyType: "unknown", responseType: "void", status: 204 };
    const calls = callsModule({ openapi, asyncapi: null, types: "", operations: [op] }, { apiImport: "@t/api", kitImport: "../kit", runtimeFrom: "./runtime" });
    expect(calls).toContain('import { createApi, segment } from "@t/api";');
    expect(calls).toContain('path: "/files/" + segment(seg(a["name"]))');
    expect(calls).not.toContain("encodeURIComponent");
  });

  it("prints only the helpers its calls use, whatever its operations are called", () => {
    /* an operation called pick (or omit, headers) with no query: no helper of that name */
    const openapi = { openapi: "3.1.0", info: { title: "T", version: "1" }, paths: { "/pick": { post: { operationId: "pick", responses: { "204": { description: "picked" } } } }, "/omit": { post: { operationId: "omit", responses: { "204": { description: "left" } } } } } };
    const ops = ["pick", "omit"].map((name) => ({ name, operationId: name, method: "POST" as const, path: `/${name}`, params: [], query: false, body: false, bodyType: "void", responseType: "void", status: 204 }));
    const calls = callsModule({ openapi, asyncapi: null, types: "", operations: ops }, { apiImport: "@t/api", kitImport: "../kit", runtimeFrom: "./runtime" });
    expect(calls).toContain('"pick": (_a, _b, i) => api.pick(');
    expect(calls).not.toMatch(/const (pick|omit|seg|headers) = /);
  });

  it("comes out the same each time", async () => {
    const { doc, widths } = boundShopDoc();
    const again = await buildProduct(doc, widths, { lang: "en", read: fromDisk });
    for (const [p, text] of Object.entries(files)) expect(textOf(again.files[`apps/miniapp/${p}`].body), p).toBe(text);
  }, 120_000);
});
