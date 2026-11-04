import type { PartDef, PropValues } from "../types";

/* The contract a pack keeps with the editor. See 文档/组件包接入规范.md. */

/** where printed code imports a pack's component from; `export` is its name there, when it is imported under another */
export type PackSource = { from: string; export?: string };

/** a kind a fork saved under its own name, which a pack now stands for: a sketch that holds it opens as this part */
export type LegacyKind = { slug: string; props: (item: Record<string, unknown>) => PropValues };

/** What a saved part opens as: a part, or a kind the editor has itself (text and pictures). */
export type DialectKind = LegacyKind | { kind: string; fields: (item: Record<string, unknown>) => Record<string, unknown> };

export type PartPack = {
  /** the first half of every slug in the pack: `<id>/<name>` */
  id: string;
  /** written into project files beside the pack's id */
  version: string;
  /** data, no React: lib/tokens.ts reads these without drawing anything */
  defs: PartDef[];
  /** the components the defs name that are neither shadcn M3E nor Recharts */
  sources: Record<string, PackSource>;
  /** the components named in `sources`, fetched the first time one is drawn */
  load?: () => Promise<Record<string, unknown>>;
  /** A fork's kind, what it opens as. May be a part of any pack or none: a pack names what it takes over. */
  legacyKinds?: Record<string, DialectKind>;
  /** Parts that were merged into another, by their old slug. `props` here reads the old part's props. */
  retired?: Record<string, DialectKind>;
};
