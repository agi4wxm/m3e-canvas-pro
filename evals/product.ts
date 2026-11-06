/* What a product-layer run left, worked out once after the turn so the graders stay pure functions of the observation
 * (types.ts `Observed.preview`, `Observed.product`): each screen that loads data as the preview shows it, under the
 * normal answers and every scenario of the mock library (lib/bindings/headless.ts); the sign-in, tried on the mocks;
 * and the exported product (lib/export/product.ts `buildProduct`) written to a temporary folder and its generated
 * code type-checked: packages/api on its own, apps/web against this repository's node_modules with the dev-only mock
 * library and the environment's ambient types stubbed (the real install, build and contract tests are
 * `bun run check:product`). */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { previewScreen, type PreviewReport } from "../lib/bindings/headless";
import { authFields } from "../lib/bindings/contract";
import { buildProduct } from "../lib/export/product";
import type { Lang } from "../lib/i18n";
import type { Doc } from "../lib/tokens";

const ROOT = join(new URL(".", import.meta.url).pathname, "..");

/** the screens as the preview showed them, and the sign-in tried */
export type PreviewObserved = { reports: PreviewReport[]; errors: string[]; login?: { operationId: string; status: number; token: boolean } };

/** the exported product: built, and its generated code type-checked */
export type ProductObserved = {
  ok: boolean;
  error?: string;
  files: number;
  screens: string[];
  ms: number;
  typecheck: Record<"api" | "web", { errors: number; sample: string[] } | { skipped: string }>;
};

/** The preview of every screen that loads data (at most 8), under the normal answers and each scenario (at most 8). */
export async function previewsOf(doc: Doc, lang: Lang, widths: Record<string, number>): Promise<PreviewObserved> {
  const out: PreviewObserved = { reports: [], errors: [] };
  if (!doc.api?.endpoints?.length) return out;
  const screens = doc.frames.filter((f) => f.data?.length).slice(0, 8);
  const scenarios = ["", ...(doc.mocks?.scenarios ?? []).map((s) => s.id).slice(0, 8)];
  /* the same moment every time, so the same document gives the same data */
  const now = Date.UTC(2026, 10, 6, 12);
  for (const f of screens)
    for (const scenario of scenarios) {
      try {
        out.reports.push((await previewScreen(doc, f.id, { scenario, lang, widths, now })).report);
      } catch (e) {
        out.errors.push(`${f.id}/${scenario || "normal"}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  const login = doc.api.auth?.login ? doc.api.endpoints.find((e) => e.operationId === doc.api!.auth!.login) : undefined;
  if (login) {
    const { createMockTransport, fakeClock } = await import("../lib/mocks");
    const t = createMockTransport({ api: doc.api, mocks: doc.mocks, collections: doc.collections }, { scenario: "", latency: false, clock: fakeClock(now), locale: lang as "en" });
    const body = { email: "ada@example.com", username: "ada", phone: "+15550100", password: "correct-horse-9", code: "123456" };
    const res = await t.request({ operationId: login.operationId, method: login.method.toUpperCase() as "POST", path: login.path, body });
    t.close();
    const field = authFields(doc.api.auth).token;
    out.login = { operationId: login.operationId, status: res.status, token: !!res.body && typeof res.body === "object" && typeof (res.body as Record<string, unknown>)[field] === "string" };
  }
  return out;
}

const tsc = join(ROOT, "node_modules", ".bin", "tsc");

/** the errors tsc reports for a project, the first few of them */
function typecheck(dir: string, project: string): { errors: number; sample: string[] } | { skipped: string } {
  if (!existsSync(tsc)) return { skipped: "no tsc in node_modules" };
  const r = spawnSync(tsc, ["--noEmit", "-p", project], { cwd: dir, encoding: "utf8", timeout: 120_000 });
  const lines = `${r.stdout ?? ""}${r.stderr ?? ""}`.split("\n").filter((l) => /error TS\d+/.test(l));
  return { errors: lines.length, sample: lines.slice(0, 6).map((l) => l.slice(0, 240)) };
}

/** The product exported from the document and its generated code type-checked, in a folder of its own that is taken
 *  away afterwards. */
export async function productOf(doc: Doc, widths: Record<string, number>, lang: Lang): Promise<ProductObserved> {
  const t0 = Date.now();
  const empty: ProductObserved = { ok: false, files: 0, screens: [], ms: 0, typecheck: { api: { skipped: "not built" }, web: { skipped: "not built" } } };
  let product: Awaited<ReturnType<typeof buildProduct>>;
  try {
    product = await buildProduct(doc, widths, { lang, read: async (p) => readFileSync(join(ROOT, p), "utf8"), fetchIcons: async (ids) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) }) });
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
  const dir = mkdtempSync(join(tmpdir(), "m3e-eval-product-"));
  try {
    for (const [path, f] of Object.entries(product.files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), f.body);
    }
    const scope = `@${product.name}`;
    const modules = join(ROOT, "node_modules");
    /* what only an install would bring: the dev-only mock library (msw), Vite's ambient types, CSS imports */
    writeFileSync(
      join(dir, "apps/web/src/m3e-eval-check.d.ts"),
      [`declare module "${scope}/mocks/*";`, 'declare module "cn/config";', 'declare module "cn/engine";', 'declare module "*.css";', "interface ImportMeta { readonly env: Record<string, any> }", ""].join("\n"),
    );
    writeFileSync(
      join(dir, "apps/web/tsconfig.eval.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: {
          types: [],
          typeRoots: [join(modules, "@types")],
          paths: { "@/*": ["./src/*"], [`${scope}/api`]: ["../../packages/api/src/index.ts"], [`${scope}/app-runtime`]: ["../../packages/app-runtime/src/index.ts"], [`${scope}/mocks`]: ["../../packages/mocks/src/index.ts"], "*": [join(modules, "@types", "*"), join(modules, "*")] },
        },
        include: ["src"],
      }),
    );
    const screens = Object.keys(product.files)
      .filter((p) => /^apps\/web\/src\/generated\/screens\/[^/]+Screen\.tsx$/.test(p))
      .map((p) => p.replace(/^.*\//, "").replace(/\.tsx$/, ""));
    return {
      ok: true,
      files: Object.keys(product.files).length,
      screens,
      typecheck: { api: typecheck(join(dir, "packages/api"), "tsconfig.json"), web: typecheck(join(dir, "apps/web"), "tsconfig.eval.json") },
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
