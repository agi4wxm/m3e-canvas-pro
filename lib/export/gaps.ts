/* The gap file (`.m3e/gaps.json` in every exported product): what the design leans on that a module outside M3E does
 * not deliver (docs/游戏阶段整改计划.md, the hub's decision; docs/导出.md “缺口文件”). Machine-readable for the hub,
 * which collects every module's gaps; each one is listed in the export's report as well (lib/export/boundary.ts). Only
 * its format is depended on, never where the hub lives. The kinds:
 *
 * - `asset` (module `asset-pipeline`): an asset the design names that the asset manifest does not have (lib/assetRefs.ts);
 * - `game-*` (module `game-loop`): what the design calls, branches on, sends, acts on or reads that the gameplay contract
 *   does not have (lib/game/gaps.ts): `game-command`, `game-param`, `game-rejection`, `game-input`, `game-event`,
 *   `game-fact`, and `game-snapshot` / `game-payload` for a path of the world's snapshot or of an event's payload;
 * - `data` (module `data`): a linked data set whose table changed since the design read it, or is gone (`stale`,
 *   `missing`); the data module's linked collections (the plan's J4) say so through `LinkedData` below;
 * - `contract-version`: a contract the design is written to that the hub's contract index (lib/hub/contractIndex.ts)
 *   has at another version, or not at all.
 *
 * One gap is one thing missing (`kind`, the `module` that should deliver it and its `ref` there, why it is a gap),
 * with every place the design leans on it (none: the whole design). A kind added later is one more kind: the file's
 * shape stays. */

import { assetGapOf, assetUsesOf } from "../assetRefs";
import type { AssetManifest } from "../assetManifest";
import type { Doc } from "../tokens";
import { gameHubGaps } from "../game/gaps";
import { contractIndexGaps, linkedContractsOf, type ContractIndex } from "../hub/contractIndex";

export const GAPS_PATH = ".m3e/gaps.json";
export const GAPS_FORMAT = "m3e-gaps";
export const GAPS_VERSION = 1;

/** where the design leans on what is missing: the screen (or the reusable component) and the part, by its name, and
 *  the prop */
export type GapPlace = { screen?: string; component?: string; part?: string; prop?: string };

export type Gap = {
  /** what is missing: `asset`, `game-<kind>`, `data`, `contract-version` (the file's head says each) */
  kind: string;
  /** the module that should deliver it: `asset-pipeline`, `game-loop`, `data`… */
  module: string;
  /** what it is called there: the asset's id */
  ref: string;
  /** why it is a gap, in a word the kind defines (`missing`, `no-manifest`, `wrong-type` for an asset; `stale`,
   *  `missing` for data; `mismatch`, `not-indexed` for a contract's version) */
  reason: string;
  /** the same in a sentence */
  detail: string;
  /** every place the design leans on it; none for what the whole design leans on (a contract's version) */
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

/* ---------- linked data (the plan's J4) ---------- */

/** What a linked data set says of itself, for the gap report: the collection of the document's that is linked, the
 *  table (or schema) of the data module's it names (`ref`, as the module names it: its path), the hash of the table as
 *  the design last read it and the hash of it now (null: it is gone). The data module's linked collections (J4) give
 *  one each, read from where the project's configuration says; nothing here reads a file. `module` is `data` unless it
 *  says another; `where` is every place the design uses the collection (the collection itself when left out). */
export type LinkedData = { collection: string; ref: string; read: string; now: string | null; module?: string; where?: GapPlace[] };

/** whoever knows the document's linked data and how it stands now: J4's linked collections, a test's stub */
export type LinkedDataSource = (doc: Doc) => LinkedData[] | Promise<LinkedData[]>;

/** what of the linked data changed since the design read it, or is gone: one gap per table and reason */
export function dataGaps(linked: readonly LinkedData[] | undefined): Gap[] {
  const out = new Map<string, Gap>();
  for (const d of linked ?? []) {
    if (d.now !== null && d.now === d.read) continue;
    const reason = d.now === null ? "missing" : "stale";
    const module = d.module || "data";
    const key = `${module}\n${d.ref}\n${reason}`;
    const g =
      out.get(key) ??
      ({
        kind: "data",
        module,
        ref: d.ref,
        reason,
        detail: reason === "missing" ? `the table ${d.ref} the design reads is gone from the ${module} module` : `the table ${d.ref} changed since the design read it: read it again`,
        where: [],
      } satisfies Gap);
    g.where.push(...(d.where?.length ? d.where : [{ prop: `collection ${d.collection}` }]));
    out.set(key, g);
  }
  return [...out.values()];
}

/** the linked data a source gives for a document, none when there is no source or it fails (a failing reader never
 *  stops an export: what it would have said is just not said) */
export async function linkedDataOf(doc: Doc, source: LinkedDataSource | undefined): Promise<LinkedData[]> {
  if (!source) return [];
  try {
    const got = await source(doc);
    return Array.isArray(got) ? got : [];
  } catch {
    return [];
  }
}

/* ---------- every gap ---------- */

/** What an export knows of the modules outside M3E: the asset manifest (null: none was read, and every asset is a
 *  gap), the linked data as it stands now, the hub's contract index (none: nothing to compare the contracts with). */
export type HubInputs = { assets?: AssetManifest | null; linkedData?: readonly LinkedData[]; contractIndex?: ContractIndex | null };

const KIND_ORDER = (k: string) => (k === "asset" ? 0 : k.startsWith("game-") ? 1 : k === "data" ? 2 : k === "contract-version" ? 3 : 4);

/** Everything the design leans on that a module outside M3E does not deliver, as the gap file lists it: assets,
 *  the gameplay contract's commands, events and snapshot, linked data, contract versions. In one order whatever the
 *  order they were found in: by kind, then as each kind sorts its own. */
export function hubGaps(doc: Doc, inputs: HubInputs = {}, widths: Record<string, number> = {}): Gap[] {
  const all = [...assetGaps(doc, inputs.assets), ...gameHubGaps(doc, widths), ...dataGaps(inputs.linkedData), ...contractIndexGaps(linkedContractsOf(doc), inputs.contractIndex)];
  return all.map((g, i) => [g, i] as const).sort((a, b) => KIND_ORDER(a[0].kind) - KIND_ORDER(b[0].kind) || a[1] - b[1]).map(([g]) => g);
}
