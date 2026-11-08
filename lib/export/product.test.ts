import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { allPartsDoc } from "../codegen.fixture";
import { PICKED_PNG, proofDoc, reuseDoc, sweepDoc, systemsDoc } from "../exportProject.fixture";
import { buildProject, importsIn } from "../exportProject";
import { setGlobalLang } from "../i18n";
import { makeItem, type Doc } from "../tokens";
import { PRODUCT_VERSIONS } from "../versions.generated";
import { MANIFEST_PATH, parseManifest } from "./merge";
import { differenceCounts, differenceLines } from "./differences";
import { buildProduct, productName, zipProduct, type ProductOptions } from "./product";
import { boundShopDoc, productDoc, shopProductDoc } from "./product.fixture";
import { GENERATED_DIRS } from "./targets/root";
import { MOCK_ENGINE_API_FILES, MOCK_ENGINE_FILES } from "./targets/mocks";
import { APP_RUNTIME_FILES } from "./targets/appRuntime";
import { miniappDependencies } from "./targets/miniapp";
import { MOBILE_PINS } from "./targets/mobile";
import rnPackage from "../../rn/package.json";
import { KIT_FILES } from "./rn/kitFiles.generated";
import type { Product, ProductTarget } from "./types";

beforeAll(() => setGlobalLang("en"));

/** what the kit is built and checked with (rn/package.json): the mobile app pins the same */
const RN_VERSIONS: Record<string, string> = { ...rnPackage.dependencies, ...rnPackage.devDependencies };

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const build = (doc: Doc, widths: Record<string, number> = {}, api?: ProductOptions["api"]) => buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en", api });
const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

let proof: Product;
beforeAll(async () => {
  const { doc, widths, api } = productDoc();
  proof = await build(doc, widths, api);
}, 60_000);

describe("the prototype export", () => {
  /* The single-app export stays as it was, to the byte, beside the product. These digests were taken from the export
     before the product existed; one that changes on purpose is written again here (last: the field states and the
     accessible names, docs/组件规范.md: the M3E button's own loading spinner (spinner.tsx copied beside it), the widgets'
     arrow keys (parts/widgets/roving.ts) and a rating named in the page's language, icon-only controls named by what
     their icon means, a picture with no name kept from a screen reader, a field's line of help in its frame; before them
     retired parts, parts/types.ts,
     which ships, saying what `retired` is and what replaces one, and the shop template's cart as the atoms the retired
     cart-list splits into; before them the split view, whose
     widget contract copied beside the widgets says whether a part may keep the visitor's UI state on the device
     (parts/widgets/host.ts `remember`) and which design props an input's value takes over from (parts/types.ts
     `PartInput.resets`), and in parts the split view itself, its widget file and react-resizable-panels 4.19.1; before it: the reward track and the leaderboard copied with the widgets, a
     claim the demo made kept by its reward and the open row only the one given; before them the widgets' state and
     outlets, report 3.3 and 3.4: inputs controlled through the host, demos printed where a part acts out a result, the
     sweep's parts with a selectKey now including the level map, the side tabs and the review summary; before them the icons reading their
     family from a root's provider and drawn again when it changes, components/m3e/icon.tsx and symbols.tsx, and the
     loader asking for each root's family; with it the widgets' host contract, parts/widgets/host.ts, copied beside
     them, and a rating an input wired to its variable; before them an icon counted as drawn only with both its glyphs, the components saying their own words in Chinese, Japanese and Korean too, the
     icons asking again and the ripple under reduced motion; in parts, form fields keyed by their item and resizable
     sizes as percentages). */
  const DIGESTS: Record<string, [number, string]> = {
    proof: [81, "33caf468eb854c97af88a142d5c411002c2e4fab537495248f1faf32fb284d11"],
    systems: [41, "992987b9634db0e617a98539279765cae5163f7caa5fe8ecdbc9aa5dc3ca56cb"],
    reuse: [31, "bf3a590479d5cbc75c4c9fcd91fa094350452f6190f2690665cefe7aecff44aa"],
    sweep: [92, "d2e47c82757941cd1c1113db78d3ec2592d26227271612859a4ce587948b0328"],
    parts: [139, "3ba2290b41447bd85ebe11bd6571c0904338a2f672e735f5996e4f165ed01e60"],
  };
  const DOCS: Record<string, () => { doc: Doc; widths: Record<string, number> }> = { proof: proofDoc, systems: systemsDoc, reuse: reuseDoc, sweep: sweepDoc, parts: () => ({ doc: allPartsDoc(), widths: {} }) };
  it.each(Object.keys(DIGESTS))("is byte for byte what it was: %s", async (name) => {
    const { doc, widths } = DOCS[name]();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const h = createHash("sha256");
    for (const p of Object.keys(files).sort()) {
      h.update(p).update("\0").update(typeof files[p] === "string" ? Buffer.from(files[p] as string) : Buffer.from(files[p] as Uint8Array)).update("\0");
    }
    expect([Object.keys(files).length, h.digest("hex")]).toEqual(DIGESTS[name]);
  }, 60_000);
});

describe("the product of a document", () => {
  it("is a monorepo of workspaces, with the root's settings", () => {
    const root = JSON.parse(text(proof, "package.json"));
    expect(proof.name).toBe("proof-app");
    expect(root.workspaces).toEqual(["packages/api", "packages/mocks", "packages/app-runtime", "apps/web", "server", "contract-tests", "apps/mobile", "apps/miniapp"]);
    expect(Object.keys(root.scripts)).toEqual(expect.arrayContaining(["dev", "build", "typecheck", "lint", "test"]));
    for (const ws of root.workspaces) expect(JSON.parse(text(proof, `${ws}/package.json`)).name).toMatch(/^@proof-app\//);
    for (const path of ["tsconfig.base.json", "eslint.config.js", ".prettierrc.json", ".prettierignore", ".gitignore", "README.md", "AGENTS.md", "CLAUDE.md", "LICENSE", "NOTICE", "scripts/dev.mjs", "apps/mobile/README.md", "apps/miniapp/README.md"]) expect(proof.files[path], path).toBeTruthy();
    expect(text(proof, "README.md")).toContain("## English");
  });

  it("puts the web app's screens in files of their own under src/generated, with a router, and the custom code beside", () => {
    for (const s of ["MenuScreen", "FormScreen", "CartScreen", "ProductsScreen"]) expect(proof.files[`apps/web/src/generated/screens/${s}.tsx`]?.kind, s).toBe("generated");
    for (const p of ["App.tsx", "runtime.tsx", "theme.tsx", "index.css", "routes.ts", "router.ts", "api.ts", "mocks.ts"]) expect(proof.files[`apps/web/src/generated/${p}`]?.kind, p).toBe("generated");
    expect(proof.files["apps/web/src/custom/setup.ts"].kind).toBe("seeded");
    expect(proof.files["apps/web/src/custom/Providers.tsx"].kind).toBe("seeded");
    expect(Object.keys(proof.files).some((p) => p.startsWith("apps/web/src/screens/") || p === "apps/web/src/App.tsx")).toBe(false);
    expect(text(proof, "apps/web/src/generated/screens/FormScreen.tsx")).toContain('from "@/generated/runtime"');
    expect(text(proof, "apps/web/src/generated/index.css")).toContain('@import "../styles/m3e.css";');
    expect(text(proof, "apps/web/src/generated/routes.ts")).toContain('menu: "/menu"');
    expect(text(proof, "apps/web/src/main.tsx")).toContain("import.meta.env.DEV");
  });

  it("generates the client, the mocks, the server routes and a stub per operation of the contract", () => {
    const ops = text(proof, "packages/api/src/generated/operations.ts");
    for (const op of ["getHealth", "listProducts", "createProduct", "getProduct", "deleteProduct"]) {
      expect(ops).toContain(`${op}: (`);
      expect(proof.files[`server/src/handlers/${op}.ts`]?.kind, op).toBe("seeded");
      expect(text(proof, `server/src/handlers/${op}.ts`)).toContain(`throw notImplemented("${op}")`);
    }
    expect(text(proof, "server/src/generated/operations.ts")).toContain('"url": "/products/:id"');
    expect(text(proof, "packages/api/openapi.yaml")).toContain('"/products/{id}":');
    expect(text(proof, "packages/mocks/src/generated/contract.ts")).toContain('"operationId": "getHealth"');
    expect(text(proof, "packages/mocks/src/engine/mocks/transport.ts")).toContain("export function createMockTransport");
    expect(text(proof, "packages/api/src/generated/types.ts")).toContain("export type Product");
  });

  it("puts the editor's own mock library in packages/mocks, with the design's mocks as data and its files beside", async () => {
    const { doc, widths } = shopProductDoc();
    const shop = await build(doc, widths);
    for (const path of MOCK_ENGINE_FILES) expect(text(shop, `packages/mocks/src/engine/${path.slice(4)}`), path).toBe(await fromDisk(path));
    for (const path of MOCK_ENGINE_API_FILES) expect(text(shop, `packages/mocks/src/engine/${path.slice(4)}`), path).toBe(await fromDisk(path));
    expect(text(shop, "packages/mocks/src/generated/scenarios.ts")).toContain('export type ScenarioName = "new-user" | "lots" | "network-error" | "slow" | "signed-out"');
    expect(text(shop, "packages/mocks/src/generated/settings.ts")).toContain('"kind": "email"');
    expect(text(shop, "packages/mocks/src/generated/files.ts")).toContain('"id": "receipt"');
    const pdf = shop.files["packages/mocks/files/receipt.pdf"]?.body;
    expect(pdf instanceof Uint8Array && String.fromCharCode(...pdf.slice(0, 5))).toBe("%PDF-");
    expect(shop.files["packages/mocks/files/sneaker.svg"]?.kind).toBe("generated");
    const pkg = JSON.parse(text(shop, "packages/mocks/package.json"));
    expect(Object.keys(pkg.exports)).toEqual([".", "./msw", "./browser", "./node", "./native"]);
    expect(Object.keys(pkg.dependencies)).toEqual(Object.keys(pkg.dependencies).sort());
    /* the engine is the editor's code, checked there: ESLint leaves it alone, as the copied components */
    expect(text(shop, "eslint.config.js")).toContain('"packages/mocks/src/engine/"');
  });

  it("puts the editor's own runtime in packages/app-runtime, for every front end: React and no platform", async () => {
    for (const path of APP_RUNTIME_FILES) expect(text(proof, `packages/app-runtime/src/engine/${path.slice(4)}`), path).toBe(await fromDisk(path));
    const pkg = JSON.parse(text(proof, "packages/app-runtime/package.json"));
    expect(pkg).toMatchObject({ name: "@proof-app/app-runtime", exports: { ".": "./src/index.ts" }, peerDependencies: { react: ">=18.3.0" } });
    expect(pkg.dependencies).toBeUndefined();
    expect(JSON.parse(text(proof, "packages/app-runtime/tsconfig.json")).compilerOptions.lib).toEqual(["ES2022"]);
    /* nothing of a platform: no DOM, React Native, Taro or fetch, and every module it names is its own or React */
    for (const path of APP_RUNTIME_FILES) {
      const source = text(proof, `packages/app-runtime/src/engine/${path.slice(4)}`);
      for (const spec of importsIn(source)) expect(spec.startsWith(".") || spec === "react", `${path} imports ${spec}`).toBe(true);
      /* the code, without its comments and the words of its strings (a media type such as …wordprocessingml.document) */
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
      expect(code, path).not.toMatch(/\b(window|document|localStorage|sessionStorage|navigator|fetch|XMLHttpRequest)\b|react-native|@tarojs/);
    }
    expect(text(proof, "AGENTS.md")).toContain("## The app runtime (packages/app-runtime)");
    expect(text(proof, "eslint.config.js")).toContain('"packages/app-runtime/src/engine/"');
  });

  it("is generated whole: every file is generated but the extension points, which are seeded", () => {
    const seededPaths = Object.entries(proof.files)
      .filter(([, f]) => f.kind === "seeded")
      .map(([p]) => p)
      .sort();
    expect(seededPaths).toEqual([
      "CLAUDE.md",
      "apps/miniapp/project.config.json",
      "apps/miniapp/project.tt.json",
      "apps/miniapp/src/custom/Providers.tsx",
      "apps/miniapp/src/custom/setup.ts",
      "apps/mobile/src/custom/Providers.tsx",
      "apps/mobile/src/custom/setup.ts",
      "apps/web/src/custom/Providers.tsx",
      "apps/web/src/custom/setup.ts",
      "server/src/custom/auth.ts",
      "server/src/custom/db.ts",
      "server/src/custom/setup.ts",
      ...["createProduct", "deleteProduct", "getHealth", "getProduct", "listProducts"].map((o) => `server/src/handlers/${o}.ts`),
    ]);
  });

  it("pins every package it names, exactly", () => {
    /* the mini-program is built with what its kit is checked with (Taro, React 18: miniapp-kit/package.json) */
    const mini = miniappDependencies();
    for (const path of Object.keys(proof.files).filter((p) => p.endsWith("package.json"))) {
      const pkg = JSON.parse(text(proof, path));
      for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }) as [string, string][]) {
        if (name.startsWith("@proof-app/")) expect(version).toBe("0.1.0");
        else if (path === "apps/mobile/package.json") expect(version, `${path}: ${name}`).toBe(MOBILE_PINS[name] ?? RN_VERSIONS[name] ?? PRODUCT_VERSIONS[name]);
        else if (path === "apps/miniapp/package.json" && (mini.dependencies[name] || mini.devDependencies[name])) expect(version, `${path}: ${name}`).toBe(mini.dependencies[name] ?? mini.devDependencies[name]);
        else expect(version, `${path}: ${name}`).toBe(PRODUCT_VERSIONS[name]);
      }
    }
    expect(JSON.parse(text(proof, "package.json")).devDependencies.typescript).toBe("6.0.3");
  });

  it("has every module the web app's sources import: a file there, or a package its package.json names", () => {
    const pkg = JSON.parse(text(proof, "apps/web/package.json"));
    const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
    for (const path of Object.keys(proof.files).filter((p) => p.startsWith("apps/web/src/") && /\.(ts|tsx|css)$/.test(p))) {
      for (const spec of importsIn(text(proof, path), path.endsWith(".css"))) {
        if (spec.startsWith("@/") || spec.startsWith(".")) {
          const stem = spec.startsWith("@/") ? `apps/web/src/${spec.slice(2)}` : new URL(spec, `file:///${path}`).pathname.slice(1);
          expect([stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`].some((p) => p in proof.files), `${path} imports ${spec}`).toBe(true);
        } else {
          const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          if (!["node:url"].includes(spec)) expect(declared.has(name), `${path} imports ${spec}`).toBe(true);
        }
      }
    }
  });

  it("is the same files, byte for byte, every time", async () => {
    const { doc, widths, api } = productDoc();
    const again = await build(doc, widths, api);
    expect(Object.keys(again.files).sort()).toEqual(Object.keys(proof.files).sort());
    for (const [path, f] of Object.entries(proof.files)) expect(again.files[path].body, path).toEqual(f.body);
  });

  it("leaves every generated file out of Prettier, and formats the custom code", () => {
    const ignore = text(proof, ".prettierignore").split("\n");
    const covered = (path: string) => GENERATED_DIRS.some((d) => (d.startsWith("**/") ? path.includes(`/${d.slice(3)}`) : path.startsWith(d))) || ignore.includes(`/${path}`);
    for (const [path, f] of Object.entries(proof.files)) expect(covered(path), path).toBe(f.kind === "generated");
  });

  it("downloads as a zip with its manifest", () => {
    const zip = unzipSync(zipProduct(proof));
    const manifest = parseManifest(strFromU8(zip[MANIFEST_PATH]))!;
    expect(Object.keys(manifest.files).sort()).toEqual(Object.keys(proof.files).sort());
    expect(Object.keys(zip).length).toBe(Object.keys(proof.files).length + 1);
  });

  it("names screens that differ only in case apart, so they are two files everywhere", async () => {
    const doc: Doc = { groups: [], frames: [{ id: "a", name: "HOME", x: 0, y: 0 }, { id: "b", name: "Home", x: 500, y: 0 }], paletteKey: "purple", frame: "phone", title: "Case", brief: "" };
    const p = await build(doc);
    const screens = Object.keys(p.files).filter((f) => f.startsWith("apps/web/src/generated/screens/"));
    expect(screens.sort()).toEqual(["apps/web/src/generated/screens/HOMEScreen.tsx", "apps/web/src/generated/screens/HomeScreen-2.tsx"]);
    expect(text(p, "apps/web/src/generated/App.tsx")).toContain('import { HomeScreen } from "./screens/HomeScreen-2"');
  });

  it("is named after the title as npm accepts it, or m3e-app", () => {
    expect(productName({ title: "My Shop!" } as Doc)).toBe("my-shop");
    expect(productName({ title: "商店" } as Doc)).toBe("m3e-app");
  });

  it("takes a target in place of one of its own: where a later target plugs in", async () => {
    const mobile: ProductTarget = { id: "mobile", build: (ctx) => ({ dir: "apps/mobile", pkg: `${ctx.scope}/mobile`, scripts: { typecheck: true }, summary: { zh: "移动", en: "mobile" }, files: { "package.json": { body: '{"name":"x"}\n', kind: "generated" } } }) };
    const { PRODUCT_TARGETS } = await import("./targets");
    const p = await buildProduct(proofDoc().doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en", targets: PRODUCT_TARGETS.map((t) => (t.id === "mobile" ? mobile : t)) });
    expect(JSON.parse(text(p, "package.json")).workspaces).toContain("apps/mobile");
    expect(p.files["apps/mobile/README.md"]).toBeUndefined();
  });

  it("reads the document's own contract (Doc.api): its operations, models, channels and servers come out", async () => {
    const { doc, widths } = shopProductDoc();
    const shop = await build(doc, widths);
    const ops = text(shop, "packages/api/src/generated/operations.ts");
    for (const op of ["login", "refreshToken", "listProducts", "createProduct", "getProduct", "updateProduct", "deleteProduct", "uploadProductImage", "listOrders", "getMe"]) {
      expect(ops).toContain(`${op}: (`);
      expect(text(shop, `server/src/handlers/${op}.ts`)).toContain(`throw notImplemented("${op}")`);
    }
    const openapi = text(shop, "packages/api/openapi.yaml");
    expect(openapi).toContain('"/products/{productId}/images":');
    expect(openapi).toContain("x-m3e-pagination:");
    expect(openapi).toContain('"application/problem+json":');
    expect(text(shop, "packages/api/asyncapi.yaml")).toContain('"/rooms/{roomId}"');
    const types = text(shop, "packages/api/src/generated/types.ts");
    for (const t of ["Product", "NewProduct", "Order", "Tokens", "Problem", "ChatMessage"]) expect(types).toContain(`export type ${t} = `);
    expect(text(shop, "server/src/generated/operations.ts")).toContain('"url": "/products/:productId/images"');
    for (const ch of ["room", "presence"]) expect(text(shop, `server/src/handlers/channels/${ch}.ts`)).toContain(`throw notImplemented("${ch}")`);
    /* a document without an API exports the empty contract it always did */
    const bare = await build(proofDoc().doc, proofDoc().widths);
    expect(text(bare, "packages/api/openapi.yaml")).not.toContain("/products");
  }, 60_000);
});

describe("the mobile app", () => {
  let shop: Product;
  beforeAll(async () => {
    const { doc, widths } = boundShopDoc();
    shop = await build(doc, widths);
  }, 60_000);

  it("is an Expo app on Expo Router: a route per screen, its params in its path, a screen that needs a session guarded", () => {
    const pkg = JSON.parse(text(shop, "apps/mobile/package.json"));
    expect(pkg).toMatchObject({ name: "@shop/mobile", main: "expo-router/entry" });
    expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(["expo", "expo-router", "expo-secure-store", "expo-image-picker", "expo-document-picker", "nativewind", "@shop/api", "@shop/app-runtime"]));
    expect(pkg.devDependencies["@shop/mocks"]).toBe("0.1.0");
    expect(pkg.dependencies["@shop/mocks"]).toBeUndefined();
    for (const path of ["src/app/_layout.tsx", "src/app/index.tsx", "src/app/products.tsx", "src/app/product/[productId].tsx", "src/app/new-product.tsx", "src/app/sign-in.tsx", "src/app/orders.tsx", "src/app/photo/[productId].tsx"]) expect(shop.files[`apps/mobile/${path}`]?.kind, path).toBe("generated");
    const routing = text(shop, "apps/mobile/src/generated/routing.tsx");
    expect(routing).toContain('Product: {"path":"/product/[productId]","params":["productId"]');
    expect(routing).toContain('Orders: {"path":"/orders","params":[],"spec":[],"auth":"required"}');
    expect(routing).toContain('export const LOGIN: string | undefined = "SignIn"');
    expect(JSON.parse(text(shop, "apps/mobile/app.json")).expo).toMatchObject({ slug: "shop", plugins: [["expo-router", { asyncRoutes: false }]], web: { bundler: "metro", output: "single" } });
  });

  it("puts a navigation bar's destinations in tabs, the router drawing no bar of its own", () => {
    expect(text(proof, "apps/mobile/src/app/(tabs)/_layout.tsx")).toContain("<Tabs tabBar={() => null}");
    expect(proof.files["apps/mobile/src/app/(tabs)/bars.tsx"]?.kind).toBe("generated");
    expect(text(proof, "apps/mobile/src/app/_layout.tsx")).toContain('<Stack.Screen name="(tabs)" />');
  });

  it("copies the kit whole, and prints its screens on it with their bindings", async () => {
    for (const path of KIT_FILES) expect(text(shop, `apps/mobile/src/kit/${path}`), path).toBe(await fromDisk(`rn/src/kit/${path}`));
    const list = text(shop, "apps/mobile/src/generated/screens/ProductsScreen.tsx");
    expect(list).toContain('const S1: SourceDef = { name: "products", operationId: "listProducts", pageSize: 20 };');
    expect(list).toContain("const products = useSource(S1, $0);");
    expect(list).toContain('data={$.list("data.products.items")}');
    expect(list).toContain("onEndReached={() => void products.loadMore()}");
    expect(list).toContain("onRefresh={() => void products.refresh()}");
    expect(list).toMatch(/r1 === "loading" \?/);
    expect(list).toContain('const A1: Action = { to: "Product", params: { productId: "item.id" } };');
    expect(list).toContain('text={$1.text("item.name")}');
    const detail = text(shop, "apps/mobile/src/generated/screens/ProductScreen.tsx");
    expect(detail).toContain("export function ProductScreen({ params: given }: { params?: Record<string, unknown> })");
    expect(detail).toContain('params: { productId: "params.productId" }');
    const form = text(shop, "apps/mobile/src/generated/screens/NewProductScreen.tsx");
    expect(form).toContain('fields: ["name", "price.amount", "price.currency", "category", "description", "stock"]');
    expect(form).toContain('onChangeText={(v: string) => form1.set("price.amount", v)}');
    expect(form).toContain('onSelect={(_i: number, label: string) => form1.set("category", label)}');
    expect(form).toContain("disabled={form1.submitting}");
    const photo = text(shop, "apps/mobile/src/generated/screens/PhotoScreen.tsx");
    expect(photo).toContain('onPress={() => void pickFile("").then((file) => file && form1.set("file", file))}');
    expect(photo).toContain('params: { productId: "params.productId" }');
    expect(text(shop, "apps/mobile/src/generated/screens/SignInScreen.tsx")).toContain("login: true");
    expect(text(shop, "apps/mobile/src/generated/contract.ts")).toContain('"media": "multipart/form-data"');
  });

  it("keeps a path parameter one segment of its path, as the typed client does: '.' and '..' are refused", async () => {
    /* the printed modules run as they are: the app's api.ts over its contract.ts, with packages/api's client (its
       segment()) and a runtime whose transport only remembers what it was asked */
    const dir = mkdtempSync(join(tmpdir(), "m3e-mobile-api-"));
    try {
      writeFileSync(join(dir, "api.ts"), text(shop, "apps/mobile/src/generated/api.ts").replace('from "@shop/api"', 'from "./shopApi"'));
      writeFileSync(join(dir, "contract.ts"), text(shop, "apps/mobile/src/generated/contract.ts"));
      writeFileSync(join(dir, "client.ts"), text(shop, "packages/api/src/client.ts"));
      writeFileSync(join(dir, "shopApi.ts"), 'export { segment } from "./client"\nexport type CallInit = object\nexport const createApi = (t: { request(r: unknown): unknown }) => ({ request: (r: unknown) => t.request(r) })\n');
      writeFileSync(join(dir, "runtime.ts"), "export const asked: { path: string }[] = []\nexport const runtime = { transport: { request: async (r: { path: string }) => (asked.push(r), { status: 200, headers: {}, body: {} }) } }\n");
      const { call } = (await import(pathToFileURL(join(dir, "api.ts")).href)) as { call: (op: string, input: { params: Record<string, unknown> }) => Promise<unknown> };
      const { asked } = (await import(pathToFileURL(join(dir, "runtime.ts")).href)) as { asked: { path: string }[] };
      for (const step of ["..", "."]) await expect(call("getProduct", { params: { productId: step } })).rejects.toThrow(TypeError);
      expect(asked).toEqual([]);
      await call("getProduct", { params: { productId: "../me" } });
      await call("uploadProductImage", { params: { productId: "%2e%2e" } });
      expect(asked.map((r) => r.path)).toEqual(["/products/..%2Fme", "/products/%252e%252e/images"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes a picture the document holds as a file the app bundles, and the screen draws that file", () => {
    /* the proof's Counter screen has a picture the author picked from a file (lib/exportProject.fixture.ts PICKED_PNG) */
    const png = proof.files["apps/mobile/assets/images/image1.png"]?.body;
    expect(png instanceof Uint8Array && Buffer.from(png).toString("base64")).toBe(PICKED_PNG.slice(PICKED_PNG.indexOf(",") + 1));
    const images = text(proof, "apps/mobile/src/generated/images.ts");
    expect(images).toContain('  image1: require("../../assets/images/image1.png"),');
    /* each require names a file of the app: Metro bundles it from there */
    for (const m of images.matchAll(/require\("([^"]+)"\)/g)) expect(proof.files[new URL(m[1], "file:///apps/mobile/src/generated/images.ts").pathname.slice(1)]?.kind, m[1]).toBe("generated");
    const counter = text(proof, "apps/mobile/src/generated/screens/CounterScreen.tsx");
    expect(counter).toContain('import { IMAGES } from "../images";');
    expect(counter).toContain('<Image src={IMAGES.image1} alt="Picked"');
    expect(proof.differences.some((d) => d.app === "mobile" && d.kind === "image")).toBe(false);
  });

  it("writes each picture once, and leaves out (and reports) one an app does not bundle", async () => {
    const doc: Doc = { ...proofDoc().doc, frames: [{ id: "f", name: "Pictures", x: 0, y: 0 }], groups: [] };
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")}`;
    doc.groups = [
      { id: "a", x: 16, y: 16, axis: "x", items: [{ ...makeItem("image"), id: "a1", props: { src: PICKED_PNG, alt: "One" } }] },
      { id: "b", x: 16, y: 200, axis: "x", items: [{ ...makeItem("avatar"), id: "b1", props: { image: PICKED_PNG } }] },
      { id: "c", x: 16, y: 300, axis: "x", items: [{ ...makeItem("image"), id: "c1", props: { src: svg, alt: "Two" } }] },
    ];
    const p = await build(doc);
    expect(Object.keys(p.files).filter((f) => f.startsWith("apps/mobile/assets/"))).toEqual(["apps/mobile/assets/images/image1.png"]);
    const screen = text(p, "apps/mobile/src/generated/screens/PicturesScreen.tsx");
    expect(screen.match(/IMAGES\.image1/g)).toHaveLength(2);
    expect(screen).toContain('<Image alt="Two" />');
    expect(p.differences.filter((d) => d.app === "mobile" && d.kind === "image")).toEqual([expect.objectContaining({ part: "image2", detail: expect.stringContaining("left out") })]);
    /* a document with no picture the app bundles has no images module */
    const bare = await build({ ...doc, groups: doc.groups.slice(2) });
    expect(Object.keys(bare.files).filter((f) => f.startsWith("apps/mobile/assets/") || f.endsWith("/images.ts"))).toEqual([]);
    expect(text(bare, "apps/mobile/src/generated/screens/PicturesScreen.tsx")).not.toContain("IMAGES");
  });

  it("lists where it draws something other than the design says beside its screens, and in the export's report", async () => {
    /* the proof document has parts the kit draws as their atoms or as a placeholder */
    const listed = JSON.parse(text(proof, "apps/mobile/src/generated/warnings.json")) as { kind: string }[];
    expect(listed.length).toBeGreaterThan(0);
    expect(proof.differences.filter((d) => d.app === "mobile").map(({ app: _app, ...d }) => d)).toEqual(listed);
    expect(proof.differences.filter((d) => d.app === "miniapp").map(({ app: _app, ...d }) => d)).toEqual(JSON.parse(text(proof, "apps/miniapp/src/generated/warnings.json")));
    const counts = differenceCounts(proof.differences);
    /* the web lists the product cards' prototype demo (a heart and a cart count they act out), which a product never runs */
    expect(counts.map((c) => c.app)).toEqual(["web", "mobile", "miniapp"]);
    expect(proof.differences.filter((d) => d.app === "web").map((d) => d.kind)).toEqual(expect.arrayContaining(["demo"]));
    expect(counts[1]).toMatchObject({ total: listed.length, file: "apps/mobile/src/generated/warnings.json" });
    expect(counts[1].kinds.reduce((n, [, k]) => n + k, 0)).toBe(listed.length);
    expect(differenceLines(proof.differences)[1]).toMatch(/^mobile: \d+ drawn differently from the design \(\d+ \w+/);
    /* a product with nothing drawn differently says so with an empty list */
    expect(JSON.parse(text(shop, "apps/mobile/src/generated/warnings.json"))).toEqual(shop.differences.filter((d) => d.app === "mobile").map(({ app: _app, ...d }) => d));
  });

  it("keeps the mocks out of a production build: the app requires them only in development", () => {
    const root = text(shop, "apps/mobile/src/generated/root.tsx");
    expect(root).toContain('if (__DEV__ && process.env.EXPO_PUBLIC_API_MOCKS !== "off") {');
    for (const [path, f] of Object.entries(shop.files)) {
      if (!path.startsWith("apps/mobile/src/") || path.endsWith(".test.tsx") || path.endsWith("mocks.ts") || path.endsWith("DevMenu.tsx") || path.endsWith("root.tsx") || typeof f.body !== "string") continue;
      expect(importsIn(f.body).some((s) => s.includes("/mocks")), path).toBe(false);
    }
  });

  it("has every module its sources import: a file there, or a package its package.json names", () => {
    const pkg = JSON.parse(text(shop, "apps/mobile/package.json"));
    const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies), "react-native", "react"]);
    for (const path of Object.keys(shop.files).filter((p) => p.startsWith("apps/mobile/src/") && /\.(ts|tsx)$/.test(p))) {
      for (const spec of importsIn(text(shop, path))) {
        if (spec.startsWith(".")) {
          const stem = new URL(spec, `file:///${path}`).pathname.slice(1);
          expect([stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`, `${stem}/index.ts`].some((p) => p in shop.files) || stem.endsWith(".css"), `${path} imports ${spec}`).toBe(true);
        } else {
          const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          expect(declared.has(name), `${path} imports ${spec}`).toBe(true);
        }
      }
    }
  });
});
