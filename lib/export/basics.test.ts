import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apiModelOf, operationsOf, safeTypes } from "./api";
import { FIXTURE_OPENAPI, FIXTURE_TYPES } from "./product.fixture";
import { assertSafePaths, identifierOf, isSafePath, kebab, npmSlug, pathProblem, safeSegment } from "./paths";
import { sha256 } from "./sha256";
import { toYaml } from "./yaml";

/* The small pieces of the product export: the hash the manifest records, the path and name rules, the YAML of the
 * contract files and the operations read off a contract. */

describe("sha256", () => {
  it("is SHA-256: the same as Node's for text and bytes of every length around a block's edges", () => {
    const node = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
    for (const n of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 70_000]) {
      const bytes = new Uint8Array(randomBytes(n));
      expect(sha256(bytes), `${n} bytes`).toBe(node(bytes));
    }
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    for (const text of ["中文的屏幕", "emoji 🎉 and \u2028 separators", "a".repeat(5000)]) expect(sha256(text)).toBe(node(text));
  });
});

describe("paths", () => {
  it("lets through the paths of a product", () => {
    for (const p of ["apps/web/src/generated/App.tsx", "server/src/handlers/getHealth.ts", ".m3e/manifest.json", "apps/web/public/images/r3f.png", ".gitignore", "中文/文件.md"]) expect(pathProblem(p), p).toBeNull();
  });

  it("refuses what leaves the folder or cannot be a file everywhere", () => {
    for (const p of ["", "/abs", "../x", "a/../../x", "a/./x", "a//x", "a\\x", "C:/x", "c:x", "a:b", "x/CON", "x/con.ts", "lpt1", "x/nul.txt", "a/b.", "a/b ", "a\nb", "a\u0000b", "a|b", "a*b", "a?b", "a<b", 'a"b', "x".repeat(500), `${"y".repeat(130)}/z`]) expect(isSafePath(p), JSON.stringify(p)).toBe(false);
  });

  it("refuses two paths that differ only in case", () => {
    expect(() => assertSafePaths(["a/B.ts", "a/b.ts"])).toThrow(/case/);
    expect(() => assertSafePaths(["a/B.ts", "a/C.ts"])).not.toThrow();
  });

  it("makes names out of words that cannot name another folder", () => {
    expect(safeSegment("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(safeSegment("购物 车", "x")).toBe("购物-车");
    expect(safeSegment("CON", "fallback")).toBe("fallback");
    expect(safeSegment("", "fallback")).toBe("fallback");
    expect(safeSegment(42, "fallback")).toBe("fallback");
    expect(npmSlug("My Shop: 2.0!", "x")).toBe("my-shop-2-0");
    expect(npmSlug("商店", "m3e-app")).toBe("m3e-app");
    expect(npmSlug(`${"a".repeat(80)}`, "x").length).toBe(50);
    expect(identifierOf("get user by id", "x")).toBe("getUserById");
    expect(identifierOf("delete", "op")).toBe("op");
    expect(identifierOf("9lives", "op")).toBe("op");
    expect(identifierOf('"+evil+"', "op")).toBe("evil");
    expect(kebab("orderDetails2")).toBe("order-details2");
  });
});

describe("toYaml", () => {
  it("writes every string quoted, so no word becomes structure", () => {
    const yaml = toYaml({ openapi: "3.1.0", info: { title: "a: b\n- c # d", description: "\u2028x" }, "/p/{id}": { yes: true, n: 1, none: null }, list: [{ a: 1, b: [] }, "s", {}], empty: {} });
    expect(yaml).toBe(
      [
        'openapi: "3.1.0"',
        "info:",
        '  title: "a: b\\n- c # d"',
        '  description: "\\u2028x"',
        '"/p/{id}":',
        '  "yes": true',
        '  "n": 1',
        "  none: null",
        "list:",
        "  - a: 1",
        "    b: []",
        '  - "s"',
        "  - {}",
        "empty: {}",
        "",
      ].join("\n"),
    );
  });
});

describe("the operations of a contract", () => {
  it("are read with their parameters, bodies and the types the schemas declare", () => {
    const ops = operationsOf(FIXTURE_OPENAPI, FIXTURE_TYPES);
    expect(ops.map((o) => `${o.method} ${o.path} ${o.name}`)).toEqual(["GET /health getHealth", "GET /products listProducts", "POST /products createProduct", "GET /products/{id} getProduct", "DELETE /products/{id} deleteProduct"]);
    expect(ops.find((o) => o.name === "getProduct")).toMatchObject({ params: ["id"], responseType: "Product", body: false });
    expect(ops.find((o) => o.name === "createProduct")).toMatchObject({ body: true, bodyType: "NewProduct", status: 201 });
    expect(ops.find((o) => o.name === "listProducts")).toMatchObject({ query: true, example: { items: [{ id: "p1", name: "Lamp", price: 25 }], next: null } });
    expect(ops.find((o) => o.name === "deleteProduct")).toMatchObject({ responseType: "void", status: 204 });
    /* without the declarations, every type is unknown */
    expect(operationsOf(FIXTURE_OPENAPI).find((o) => o.name === "getProduct")!.responseType).toBe("unknown");
  });

  it("make names of any operationId, unique where case does not count, and leave out paths that are none", () => {
    const ops = operationsOf({
      paths: {
        "/a": { get: { operationId: '"; process.exit(1); "', responses: {} }, post: { operationId: "GetA", responses: {} }, put: { operationId: "geta", responses: {} } },
        "/b": { get: { operationId: "getA", responses: {} } },
        "no-slash": { get: { responses: {} } },
        "/with space": { get: { responses: {} } },
        "/q?x=1": { get: { responses: {} } },
        "/c/{id}": { get: { responses: {} } },
      },
    });
    /* methods are read GET, PUT, POST: "geta" comes before "GetA", which is the same name where case does not count */
    expect(ops.map((o) => o.name)).toEqual(["processExit1", "geta", "getA2", "getA3", "getCId"]);
    for (const o of ops) expect(o.name).toMatch(/^[A-Za-z_$][\w$]{0,31}$/);
  });

  it("is an empty contract when the document has none", () => {
    const model = apiModelOf("Shop");
    expect(model.operations).toEqual([]);
    expect(model.openapi).toMatchObject({ openapi: "3.1.0", info: { title: "Shop" } });
  });

  it("keeps type declarations only when they are nothing else", () => {
    expect(safeTypes(FIXTURE_TYPES)).toBe(FIXTURE_TYPES);
    expect(safeTypes(`${FIXTURE_TYPES}import fs from "node:fs"\n`)).toBe("");
    expect(safeTypes(`${FIXTURE_TYPES}const x = await import("x")\n`)).toBe("");
  });
});
