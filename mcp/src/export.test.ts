/* export_product, the tool file mode adds: the project file exported as a whole product into a folder, and again into
 * the same folder without touching custom code; refused in a folder of other things, in a read-only session, and
 * where an editor tab holds the design. The sources it copies are the export's list (lib/export/sourceList.ts), the
 * very files the editor's export reads. */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { EXPORT_SOURCE_DIRS, EXPORT_SOURCE_GLOBS, isExportSource } from "../../lib/export/sourceList";
import { SOURCE_PATHS } from "../../lib/exportSources";
import { setGlobalLang } from "../../lib/i18n";
import { connect, errorOf, scratchDir, writeProject } from "./testkit";

beforeAll(() => setGlobalLang("en"));

let done: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of done) await d();
  done = [];
});

async function open(o: Parameters<typeof connect>[0] = {}) {
  const dir = scratchDir();
  const path = join(dir, "m3e-canvas Shop.json");
  writeProject(path);
  const s = await connect({ file: path, ...o });
  done.push(s.close);
  return { ...s, dir, path };
}

type Result = { folder: string; product: string; written: number; unchanged: number; customKept: string[]; conflicts: { path: string; copy: string }[] };
const resultOf = (r: { structuredContent?: unknown }) => (r.structuredContent as { result: Result }).result;

describe("export_product", () => {
  it("is listed in file mode, not in a read-only session", async () => {
    const { client } = await open();
    const tool = (await client.listTools()).tools.find((t) => t.name === "export_product");
    expect(tool?.inputSchema).toMatchObject({ required: ["dir"] });
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    const ro = await open({ readOnly: true });
    expect((await ro.client.listTools()).tools.some((t) => t.name === "export_product")).toBe(false);
  });

  it("exports the project into a folder beside it, then again without touching custom code", async () => {
    const { call, dir } = await open();
    const first = await call("export_product", { dir: "shop-product" });
    expect(first.isError).toBeFalsy();
    const out = join(dir, "shop-product");
    expect(resultOf(first)).toMatchObject({ folder: out, product: "shop", unchanged: 0, conflicts: [] });
    for (const p of ["package.json", ".m3e/manifest.json", "apps/web/src/generated/screens/HomeScreen.tsx", "packages/api/src/index.ts", "server/src/app.ts", "AGENTS.md"]) expect(existsSync(join(out, p)), p).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "package.json"), "utf8")).workspaces).toContain("apps/web");

    writeFileSync(join(out, "apps/web/src/custom/setup.ts"), "// custom\nexport async function setup() {}\n");
    writeFileSync(join(out, "apps/web/src/generated/routes.ts"), "// edited\n");
    const again = await call("export_product", { dir: out });
    const r = resultOf(again);
    expect(r.written).toBe(0);
    expect(r.customKept).toContain("apps/web/src/custom/setup.ts");
    expect(r.conflicts).toEqual([{ path: "apps/web/src/generated/routes.ts", copy: "apps/web/src/generated/routes.ts.m3e-new" }]);
    expect(readFileSync(join(out, "apps/web/src/custom/setup.ts"), "utf8")).toContain("// custom");
    expect(existsSync(join(out, "apps/web/src/generated/routes.ts.m3e-new"))).toBe(true);
  }, 60_000);

  it("refuses a folder of other things unless forced", async () => {
    const { call, dir } = await open();
    const out = join(dir, "busy");
    mkdirSync(out);
    writeFileSync(join(out, "notes.txt"), "mine");
    const refused = await call("export_product", { dir: out });
    expect(errorOf(refused)?.code).toBe("refused");
    const forced = await call("export_product", { dir: out, force: true });
    expect(forced.isError).toBeFalsy();
    expect(readFileSync(join(out, "notes.txt"), "utf8")).toBe("mine");
  }, 60_000);

  it("copies the files the editor's own export reads", () => {
    const text = readFileSync(new URL("../../lib/exportSources.ts", import.meta.url), "utf8");
    const literal = /import\.meta\.glob\(\s*\[([\s\S]*?)\]/.exec(text)![1];
    expect([...literal.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(EXPORT_SOURCE_GLOBS);
    const root = new URL("../../", import.meta.url);
    const listed = EXPORT_SOURCE_DIRS.flatMap((d) => readdirSync(new URL(d ? `${d}/` : "./", root)).map((n) => (d ? `${d}/${n}` : n))).filter(isExportSource);
    expect(listed.sort()).toEqual([...SOURCE_PATHS].sort());
  });
});
