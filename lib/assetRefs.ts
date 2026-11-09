/* References to the asset pipeline's assets (lib/assetManifest.ts): a part names one as `asset:<id>` wherever it takes
 * a picture (an image prop, a list row's picture), an icon (an icon prop, a list row's icon) or a media address (a
 * video's or an audio player's `src`), the way it names one of the document's own icons as `svg:<id>`.
 *
 * The document holds only the reference: what it stands for is looked up in the manifest each time it is drawn, so
 * a picture swapped in the manifest is the new one in every part that names it, and one taken out of it is a gap
 * (the canvas draws the part's placeholder, the export lists it: lib/export/gaps.ts). Plain data: no DOM here. */

import { partBySlug } from "../parts/registry";
import type { PartDef, PropDef } from "../parts/types";
import { ASSET_ID, type AssetManifest, type AssetType } from "./assetManifest";
import { groupsInFrame, type Doc, type Group, type Item } from "./tokens";

/** what a reference starts with */
export const ASSET_REF_PREFIX = "asset:";

/** whether a value is a reference to an asset of the manifest */
export const isAssetName = (v: unknown): v is string => typeof v === "string" && v.startsWith(ASSET_REF_PREFIX) && ASSET_ID.test(v.slice(ASSET_REF_PREFIX.length));
/** the id a reference names */
export const assetIdOf = (name: string) => name.slice(ASSET_REF_PREFIX.length);
/** the reference to an id */
export const assetName = (id: string) => `${ASSET_REF_PREFIX}${id}`;

/** What takes an asset, and which types of asset it takes: a picture is drawn from an image or an icon, an icon from
 *  an icon or a picture, a media address plays its own type. */
export type AssetSlot = "image" | "icon" | "video" | "audio";
export const SLOT_TYPES: Record<AssetSlot, readonly AssetType[]> = { image: ["image", "icon"], icon: ["icon", "image"], video: ["video"], audio: ["audio"] };

/** the media addresses that take an asset, by part: text props that play a file */
const MEDIA: Record<string, Record<string, AssetSlot>> = { video: { src: "video" }, "audio-player": { src: "audio" } };

/** what a prop of a part takes an asset as, if anything; `row` for the fields of a list prop's rows */
export function assetSlotOf(def: PartDef | undefined, d: PropDef, row?: "image" | "icon"): AssetSlot | null {
  if (row) return d.kind === "list" ? row : null;
  if (d.kind === "image") return "image";
  if (d.kind === "icon") return "icon";
  return (def && MEDIA[def.slug]?.[d.key]) ?? null;
}

/** One place a document names an asset: the part (and the screen it is on, when it is on one), the prop, and what the
 *  prop takes it as. */
export type AssetUse = { id: string; slot: AssetSlot | null; item: string; label?: string; prop: string; screen?: string; component?: string };

/** the references in a part's own values: its props, the rows of its list props and its legacy icon */
export const assetUsesOfItem = (it: Item, where: { screen?: string; component?: string } = {}): AssetUse[] => {
  const out: AssetUse[] = [];
  usesOfItem(it, out, where);
  return out;
};

function usesOfItem(it: Item, into: AssetUse[], where: { screen?: string; component?: string }) {
  const def = partBySlug(it.component);
  const add = (v: unknown, prop: string, slot: AssetSlot | null) => {
    if (isAssetName(v)) into.push({ id: assetIdOf(v), slot, item: it.id, ...(it.label ? { label: it.label } : {}), prop, ...where });
  };
  if (isAssetName(it.icon)) add(it.icon, "icon", "icon");
  for (const [key, v] of Object.entries(it.props ?? {})) {
    const d = def?.props.find((x) => x.key === key);
    if (Array.isArray(v)) {
      v.forEach((row, i) => {
        if (!row || typeof row !== "object") return;
        for (const [field, x] of Object.entries(row as Record<string, unknown>)) add(x, `${key}[${i}].${field}`, d && (field === "image" || field === "icon") ? assetSlotOf(def, d, field) : null);
      });
      continue;
    }
    add(v, key, d ? assetSlotOf(def, d) : null);
  }
}

/** the references an instance's overrides give its definition's parts */
function usesOfOverrides(g: Group, doc: Pick<Doc, "components">, into: AssetUse[], where: { screen?: string }) {
  for (const [key, v] of Object.entries(g.overrides ?? {})) {
    if (!isAssetName(v)) continue;
    const [itemId, prop] = key.split("/");
    const def = doc.components?.find((c) => c.id === g.instanceOf);
    const it = def?.groups.flatMap((x) => x.items).find((x) => x.id === itemId);
    const part = partBySlug(it?.component);
    const d = part?.props.find((x) => x.key === prop);
    into.push({ id: assetIdOf(v), slot: d ? assetSlotOf(part, d) : null, item: itemId ?? key, ...(it?.label ? { label: it.label } : {}), prop: prop ?? key, ...where });
  }
}

/** Every place the document names an asset: the parts on each screen (and parts off every screen), the instances'
 *  overrides, and the parts of the reusable components. */
export function assetUsesOf(doc: Pick<Doc, "groups" | "frames" | "components">, widths: Record<string, number> = {}): AssetUse[] {
  const out: AssetUse[] = [];
  const placed = new Set<string>();
  for (const f of doc.frames) {
    for (const g of groupsInFrame(doc.groups, f, doc.frames, widths)) {
      placed.add(g.id);
      for (const it of g.items) usesOfItem(it, out, { screen: f.name });
      usesOfOverrides(g, doc, out, { screen: f.name });
    }
  }
  for (const g of doc.groups) {
    if (placed.has(g.id)) continue;
    for (const it of g.items) usesOfItem(it, out, {});
    usesOfOverrides(g, doc, out, {});
  }
  for (const c of doc.components ?? []) for (const g of c.groups) for (const it of g.items) usesOfItem(it, out, { component: c.name });
  return out;
}

/** the ids a document names, each once */
export const assetIdsOf = (doc: Pick<Doc, "groups" | "frames" | "components">) => [...new Set(assetUsesOf(doc).map((u) => u.id))].sort();

/** Why a use is a gap in the manifest, or null when it is not: the manifest is not there, does not list the id, or
 *  lists it as a type the prop does not take. */
export function assetGapOf(use: Pick<AssetUse, "id" | "slot">, manifest: AssetManifest | null | undefined): { reason: "no-manifest" | "missing" | "wrong-type"; detail: string } | null {
  if (!manifest) return { reason: "no-manifest", detail: `asset:${use.id} is named, but no asset manifest was read (the project's external.assetManifest, asset-manifest.json by default)` };
  const entry = Object.prototype.hasOwnProperty.call(manifest.assets, use.id) ? manifest.assets[use.id] : undefined;
  if (!entry) return { reason: "missing", detail: `asset:${use.id} is not in the asset manifest (removed, or not delivered yet)` };
  if (use.slot && !SLOT_TYPES[use.slot].includes(entry.type)) return { reason: "wrong-type", detail: `asset:${use.id} is a ${entry.type}, which a ${use.slot} prop does not take (it takes ${SLOT_TYPES[use.slot].join(" or ")})` };
  return null;
}

/** A part's values with every asset it names as a picture or a media address put as the address it is drawn from
 *  (`urlOf`: "" for one that is not there, which draws the part's placeholder). Icons stay names: the icon component
 *  draws `asset:<id>` itself (components/m3e/icon.tsx). The values given come back when nothing is named. */
export function withAssetUrls(def: PartDef, values: Record<string, unknown> | undefined, urlOf: (id: string, slot: AssetSlot) => string): Record<string, unknown> | undefined {
  if (!values) return values;
  let out: Record<string, unknown> | null = null;
  const put = (k: string, v: unknown) => {
    out ??= { ...values };
    out[k] = v;
  };
  for (const d of def.props) {
    const v = values[d.key];
    const slot = assetSlotOf(def, d);
    if (slot && slot !== "icon" && isAssetName(v)) put(d.key, urlOf(assetIdOf(v), slot));
    else if (d.kind === "list" && Array.isArray(v) && v.some((r) => isAssetName((r as { image?: unknown } | null)?.image)))
      put(
        d.key,
        v.map((r) => {
          const row = r as { image?: unknown };
          return isAssetName(row?.image) ? { ...row, image: urlOf(assetIdOf(row.image), "image") } : r;
        }),
      );
  }
  return out ?? values;
}
