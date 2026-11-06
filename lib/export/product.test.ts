import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { allPartsDoc } from "../codegen.fixture";
import { proofDoc, reuseDoc, sweepDoc, systemsDoc } from "../exportProject.fixture";
import { buildProject, importsIn } from "../exportProject";
import { setGlobalLang } from "../i18n";
import type { Doc } from "../tokens";
import { PRODUCT_VERSIONS } from "../versions.generated";
import { MANIFEST_PATH, parseManifest } from "./merge";
import { buildProduct, productName, zipProduct, type ProductOptions } from "./product";
import { productDoc, shopProductDoc } from "./product.fixture";
import { GENERATED_DIRS } from "./targets/root";
import type { Product, ProductTarget } from "./types";

beforeAll(() => setGlobalLang("en"));

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
     before the product existed; one that changes on purpose is written again here. */
  const DIGESTS: Record<string, [number, string]> = {
    proof: [76, "cddc16c7811bd519beb16871591fe9266503d459c072cb9545f927221963d197"],
    systems: [39, "810b2dc110ed2c47ffbf0df5e5b26bbc0bd0a433981ce947e40c7a85882c367e"],
    reuse: [29, "8b240809b091d53a2016842fa88d05aa96350f5a73746e96b90b5a263f5aeec9"],
    sweep: [82, "0d3708d95d59cc6fc4d74a323aa3deb9d9eb8ee2b2f5b7c6f22487e839aa5dcc"],
    parts: [135, "c941b609111793b05c37a0ebf73206935edd244b2a3e09d249aecfbad73304c4"],
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
    expect(root.workspaces).toEqual(["packages/api", "packages/mocks", "apps/web", "server", "contract-tests"]);
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
    expect(text(proof, "server/src/generated/routes.ts")).toContain('url: "/products/:id"');
    expect(text(proof, "packages/api/openapi.yaml")).toContain('"/products/{id}":');
    expect(text(proof, "packages/mocks/src/generated/contract.ts")).toContain('"operationId": "getHealth"');
    expect(text(proof, "packages/mocks/src/engine/mocks/transport.ts")).toContain("export function createMockTransport");
    expect(text(proof, "packages/api/src/generated/types.ts")).toContain("export type Product");
  });

  it("is generated whole: every file is generated but the extension points, which are seeded", () => {
    const seededPaths = Object.entries(proof.files)
      .filter(([, f]) => f.kind === "seeded")
      .map(([p]) => p)
      .sort();
    expect(seededPaths).toEqual(["CLAUDE.md", "apps/web/src/custom/Providers.tsx", "apps/web/src/custom/setup.ts", "server/src/custom/setup.ts", ...["createProduct", "deleteProduct", "getHealth", "getProduct", "listProducts"].map((o) => `server/src/handlers/${o}.ts`)]);
  });

  it("pins every package it names, exactly", () => {
    for (const path of Object.keys(proof.files).filter((p) => p.endsWith("package.json"))) {
      const pkg = JSON.parse(text(proof, path));
      for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }) as [string, string][]) {
        if (name.startsWith("@proof-app/")) expect(version).toBe("0.1.0");
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
    expect(text(shop, "server/src/generated/routes.ts")).toContain('url: "/products/:productId/images"');
    /* a document without an API exports the empty contract it always did */
    const bare = await build(proofDoc().doc, proofDoc().widths);
    expect(text(bare, "packages/api/openapi.yaml")).not.toContain("/products");
  }, 60_000);
});
