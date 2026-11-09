/* The gap file (`.m3e/gaps.json` in every exported product): what the design leans on that a module outside M3E does
 * not deliver (docs/游戏阶段整改计划.md, the hub's decision): an asset the design names that the asset manifest does not
 * have, and in time the contract's fields and events a binding names that the game-loop's contract lacks, a linked
 * data set gone stale. Machine-readable for the hub, which collects every module's gaps; each one is listed in the
 * export's report as well (lib/export/boundary.ts). Only its format is depended on, never where the hub lives.
 *
 * One gap is one thing missing (`kind`, the `module` that should deliver it and its `ref` there, why it is a gap),
 * with every place the design leans on it. A kind added later is one more kind: the file's shape stays. */

import { assetGapOf, assetUsesOf } from "../assetRefs";
import type { AssetManifest } from "../assetManifest";
import type { Doc } from "../tokens";

export const GAPS_PATH = ".m3e/gaps.json";
export const GAPS_FORMAT = "m3e-gaps";
export const GAPS_VERSION = 1;

/** where the design leans on what is missing: the screen (or the reusable component) and the part, by its name, and
 *  the prop */
export type GapPlace = { screen?: string; component?: string; part?: string; prop?: string };

export type Gap = {
  /** what is missing: `asset` (later also the contract's and the data's own kinds) */
  kind: string;
  /** the module that should deliver it: `asset-pipeline`, `game-loop`, `data`… */
  module: string;
  /** what it is called there: the asset's id */
  ref: string;
  /** why it is a gap, in a word the kind defines (`missing`, `no-manifest`, `wrong-type` for an asset) */
  reason: string;
  /** the same in a sentence */
  detail: string;
  where: GapPlace[];
};

export type GapsFile = { format: typeof GAPS_FORMAT; version: typeof GAPS_VERSION; generator: string; product: string; gaps: Gap[] };

/** what of the design's assets the manifest does not deliver, one gap per asset and reason */
export function assetGaps(doc: Pick<Doc, "groups" | "frames" | "components">, manifest: AssetManifest | null | undefined): Gap[] {
  const out = new Map<string, Gap>();
  for (const u of assetUsesOf(doc)) {
    const gap = assetGapOf(u, manifest);
    if (!gap) continue;
    const key = `${u.id}\n${gap.reason}`;
    const g = out.get(key) ?? { kind: "asset", module: "asset-pipeline", ref: u.id, reason: gap.reason, detail: gap.detail, where: [] };
    g.where.push({ ...(u.screen ? { screen: u.screen } : {}), ...(u.component ? { component: u.component } : {}), part: u.label || u.item, prop: u.prop });
    out.set(key, g);
  }
  return [...out.values()].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : a.reason < b.reason ? -1 : 1));
}

/** the gap file's text: written on every export, with no gaps as well, so the hub can tell "none" from "not looked" */
export function gapsFileText(product: string, gaps: Gap[], generator = "M3E Canvas Pro"): string {
  const file: GapsFile = { format: GAPS_FORMAT, version: GAPS_VERSION, generator, product, gaps };
  return `${JSON.stringify(file, null, 2)}\n`;
}
