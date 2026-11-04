import type { Labels, PartDef, PropValues } from "../types";

/* The contract a pack keeps with the editor. See 文档/组件包接入规范.md. */

/** where printed code imports a pack's component from; `export` is its name there, when it is imported under another */
export type PackSource = { from: string; export?: string };

/** a kind a fork saved under its own name, which a pack now stands for: a sketch that holds it opens as this part */
export type LegacyKind = { slug: string; props: (item: Record<string, unknown>) => PropValues };

export type PartPack = {
  /** the first half of every slug in the pack: `<id>/<name>` */
  id: string;
  /** written into project files beside the pack's id */
  version: string;
  /** the palette section the pack's parts stand under */
  category: { key: string; icon: string; labels: Labels };
  /** data, no React: lib/tokens.ts reads these without drawing anything */
  defs: PartDef[];
  /** the components the defs name that are neither shadcn M3E nor Recharts */
  sources: Record<string, PackSource>;
  /** the components named in `sources`, fetched the first time one is drawn */
  load?: () => Promise<Record<string, unknown>>;
  legacyKinds?: Record<string, LegacyKind>;
};
