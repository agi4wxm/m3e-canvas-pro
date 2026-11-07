/* Export v2: a document as a whole product, an npm workspaces monorepo (apps/web, packages/api, packages/mocks, server,
 * contract-tests, the slots of apps/mobile and apps/miniapp), with the manifest that lets it be exported again into
 * the same folder without destroying custom code (lib/export/merge.ts). Headless: the same function runs in the
 * editor, in scripts/export.ts and in the MCP server. The single-app "prototype" export (lib/exportProject.ts) is
 * unchanged beside it. */

import { strToU8, zipSync } from "fflate";
import type { Doc } from "../tokens";
import { getLang, type Lang } from "../i18n";
import { PRODUCT_VERSIONS } from "../versions.generated";
import { asyncApiObject, openApiObject, schemaToTs } from "../api";
import { apiModelOf, type ApiModel } from "./api";
import { MANIFEST_PATH, planExport } from "./merge";
import { assertSafePaths, npmSlug, pathProblem } from "./paths";
import { PRODUCT_TARGETS } from "./targets";
import { rootFiles } from "./targets/root";
import type { Product, ProductContext, ProductFiles, ProductTarget, Workspace } from "./types";

export type ProductOptions = {
  lang?: Lang;
  /** an editor source file's text by its path from the repo's root; the editor's own bundled sources by default */
  read?: (path: string) => Promise<string>;
  fetchIcons?: ProductContext["fetchIcons"];
  onProgress?: (done: number, total: number) => void;
  /** the API contract in place of the document's own (Doc.api); a document without one gets an empty one */
  api?: { openapi?: Record<string, unknown>; asyncapi?: Record<string, unknown> | null; types?: string } | ApiModel;
  /** the targets to build, PRODUCT_TARGETS by default */
  targets?: readonly ProductTarget[];
};

/** words of the author's as one line of plain text */
// eslint-disable-next-line no-control-regex -- the point is to take them out
const oneLine = (s: unknown) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim() : "");

/** the exact version a product pins a package at */
export function productVersion(name: string): string {
  const version = PRODUCT_VERSIONS[name];
  if (!version) throw new Error(`no version of ${name} for a product: add it to PRODUCT_PINS (lib/exportPackages.ts) and run bun run gen:versions`);
  return version;
}

/** The contract a document carries (Doc.api, lib/api) as the product reads it: its OpenAPI 3.1 document, its AsyncAPI
 *  3.0 one when it has realtime channels, and its models as TypeScript. Undefined for a document without an API. */
export function contractOf(doc: Doc, title: string): { openapi: Record<string, unknown>; asyncapi: Record<string, unknown> | null; types: string } | undefined {
  if (!doc.api) return undefined;
  const source = { api: doc.api, title };
  return { openapi: openApiObject(source), asyncapi: doc.api.channels?.length ? asyncApiObject(source) : null, types: doc.api.models?.length ? schemaToTs(doc.api, { comments: false }) : "" };
}

/** the npm name of a document's product */
export const productName = (doc: Doc) => npmSlug(doc.title, "m3e-app");

export async function buildProduct(doc: Doc, widths: Record<string, number>, o: ProductOptions = {}): Promise<Product> {
  const readAny = o.read ?? (await import("../exportSources")).readSource;
  const name = productName(doc);
  const title = oneLine(doc.title) || "App";
  const api = o.api && "operations" in o.api ? o.api : apiModelOf(title, o.api ?? contractOf(doc, title));
  const ctx: ProductContext = {
    doc,
    widths,
    lang: o.lang ?? getLang(),
    name,
    scope: `@${name}`,
    title,
    api,
    version: productVersion,
    /* a checkout on Windows may have every source in CRLF; what is written is the same either way */
    read: async (path) => (await readAny(path)).replaceAll("\r\n", "\n"),
    fetchIcons: o.fetchIcons,
    onProgress: o.onProgress,
    warnings: [],
    differences: [],
  };
  const files: ProductFiles = {};
  const workspaces: Workspace[] = [];
  for (const target of o.targets ?? PRODUCT_TARGETS) {
    const ws = await target.build(ctx);
    if (!ws) continue;
    const problem = pathProblem(ws.dir);
    if (problem) throw new Error(`the ${target.id} target's folder ${JSON.stringify(ws.dir)}: ${problem}`);
    for (const [path, file] of Object.entries(ws.files)) {
      const at = `${ws.dir}/${path}`;
      if (at in files) throw new Error(`two targets both write ${at}`);
      files[at] = file;
    }
    workspaces.push(ws);
  }
  for (const [path, file] of Object.entries(await rootFiles(ctx, workspaces, files))) {
    if (path in files) throw new Error(`two targets both write ${path}`);
    files[path] = file;
  }
  assertSafePaths(Object.keys(files));
  return { name, files, warnings: ctx.warnings, differences: ctx.differences };
}

/** The product as a zip, with the manifest a first export into an empty folder writes: unpacked and exported into
 *  again, it merges like any folder the export wrote. */
export function zipProduct(product: Product): Uint8Array {
  const plan = planExport({ product: product.name, next: product.files, disk: {}, previous: null });
  const manifest = plan.writes.find((w) => w.path === MANIFEST_PATH)!.body;
  const entries: Record<string, Uint8Array> = {};
  for (const [path, f] of Object.entries(product.files)) entries[path] = typeof f.body === "string" ? strToU8(f.body) : f.body;
  entries[MANIFEST_PATH] = typeof manifest === "string" ? strToU8(manifest) : manifest;
  return zipSync(entries);
}
