/* The shapes the product export (export v2) is made of. A product is a monorepo: a set of files, each either
 * generated (rewritten on every export, recorded in .m3e/manifest.json with its hash) or seeded (written once when
 * missing and never touched again: the extension points custom code lives in, whoever writes it).
 *
 * Each workspace of the monorepo comes from a target (lib/export/targets): the web app, the API package, the mocks,
 * the server, the contract tests, and the slots of the mobile app and the mini-program. A later target plugs in by
 * implementing `ProductTarget` and taking its place in `PRODUCT_TARGETS`. */

import type { Lang } from "../i18n";
import type { Doc } from "../tokens";
import type { ApiModel } from "./api";

/** Where an app draws or does something other than the design says (a part drawn as the atoms it splits into, a
 *  placeholder, a tap that is not printed): what its printer reports, written beside its screens as
 *  `src/generated/warnings.json` and listed in the export's report. */
export type DesignDifference = {
  /** the app: `mobile` (React Native) or `miniapp` (Taro) */
  app: "mobile" | "miniapp";
  /** what kind of difference: placeholder, atoms, binding, trigger, look, style… (the printer's own word) */
  kind: string;
  /** the screen, by its name */
  screen?: string;
  /** what touches more than one screen (what of the style an app does not draw): every screen it touches */
  screens?: string[];
  /** the part */
  part?: string;
  detail: string;
};

/** generated: the export owns it and rewrites it; seeded: written once if missing, then it is the product's own */
export type FileKind = "generated" | "seeded";

/** `merge: "package.json"`: a generated package.json someone added to (a dependency, a script) is merged, not reported
 *  as a conflict: what the export names it sets, what else is there stays (lib/export/merge.ts) */
export type ProductFile = { body: string | Uint8Array; kind: FileKind; merge?: "package.json" };

/** files by their path from the product's root, `/`-separated */
export type ProductFiles = Record<string, ProductFile>;

export const generated = (body: string | Uint8Array): ProductFile => ({ body, kind: "generated" });
export const seeded = (body: string): ProductFile => ({ body, kind: "seeded" });

/** what every target is given */
export type ProductContext = {
  doc: Doc;
  /** the parts' measured widths, as the canvas has them (empty headless: parts fall back to their own sizes) */
  widths: Record<string, number>;
  lang: Lang;
  /** the product's npm name: lowercase letters, digits and `-` */
  name: string;
  /** the npm scope of its workspaces: `@<name>` */
  scope: string;
  /** the document's title on one line, for READMEs */
  title: string;
  /** the API contract (empty until the document has one) */
  api: ApiModel;
  /** the exact version a generated package.json pins a package at (lib/versions.generated.ts) */
  version: (pkg: string) => string;
  /** an editor source file's text by its path from the repo's root (lib/exportSources.ts in the browser) */
  read: (path: string) => Promise<string>;
  fetchIcons?: (ids: string[]) => Promise<{ icons?: Record<string, unknown>; aliases?: Record<string, { parent?: string }> }>;
  onProgress?: (done: number, total: number) => void;
  /** what is missing but did not stop the export */
  warnings: string[];
  /** where the apps differ from the design (each app also writes its own to src/generated/warnings.json) */
  differences: DesignDifference[];
};

/** One npm workspace of the product, or a folder that is only a placeholder (no package.json). Its files' paths are
 *  relative to `dir`. */
export type Workspace = {
  /** the folder from the root: `apps/web` */
  dir: string;
  /** its package name, `@scope/web`; absent for a placeholder folder that is no workspace yet */
  pkg?: string;
  /** which of the root scripts reach it (it has a script of that name) */
  scripts: { dev?: boolean; build?: boolean; typecheck?: boolean; test?: boolean };
  files: ProductFiles;
  /** one line for the root README's table */
  summary: { zh: string; en: string };
  /** its section of AGENTS.md (Markdown, starting with a `## ` heading): the rules for writing code in it */
  agents?: string;
};

export interface ProductTarget {
  /** a short name: web, api, mocks, server, contract-tests, mobile, miniapp */
  id: string;
  /** the workspace for this document, or null when the product has none of it */
  build(ctx: ProductContext): Promise<Workspace | null> | Workspace | null;
}

export type Product = {
  /** the npm name of the root package, and the zip's */
  name: string;
  /** every file but .m3e/manifest.json, which the writer makes (lib/export/merge.ts) */
  files: ProductFiles;
  warnings: string[];
  /** where the apps differ from the design, for the export's report */
  differences: DesignDifference[];
};
