/* The asset pipeline's assets (lib/assetRefs.ts): a part names one as `asset:<id>` where it takes a picture, an icon or a
 * clip, and the project says where the pipeline's manifest is (`Doc.external.assetManifest`). The manifest itself is
 * the pipeline's, read from the project's folder (lib/assetCatalog.ts): nothing here writes it or copies from it. */

import { partBySlug } from "../../../parts/registry";
import type { PartDef, PropDef } from "../../../parts/types";
import { assetCatalog, assetManifestPathOf } from "../../assetCatalog";
import { ASSET_PATH, DEFAULT_ASSET_MANIFEST_PATH, type AssetType } from "../../assetManifest";
import { SLOT_TYPES, assetName, assetSlotOf, type AssetSlot } from "../../assetRefs";
import { op, OpError, S } from "../op";
import { withDoc } from "../state";
import type { ExternalFiles } from "../../tokens";
import { itemById } from "./common";
import { setProps } from "./nodes";

/** the props of a part that take an asset of a type, in the part's order */
function propsTaking(def: PartDef, type: AssetType): { d: PropDef; slot: AssetSlot }[] {
  return def.props.flatMap((d) => {
    const slot = assetSlotOf(def, d);
    return slot && SLOT_TYPES[slot].includes(type) ? [{ d, slot }] : [];
  });
}

export const setAsset = op<{ id: string; asset: string; prop?: string }, { id: string; prop: string; value: string }>({
  name: "set_asset",
  summary:
    "Puts one of the asset pipeline's assets on a part, by its id in the project's asset manifest (list_assets lists them): the part names it as asset:<id> and draws it from the manifest, so the pipeline swapping the file updates every part naming it, and the export writes the reference and a lookup, never a copy. `prop` is the prop it goes in (an image's src, a card's image, an icon's name, a video's src); left out, the part's first prop that takes the asset's type. A picture or an icon goes where a picture or an icon is taken, a video only in a video's address.",
  args: S.obj({ id: S.str("the part"), asset: S.str("the asset's id in the manifest (with or without asset:)"), prop: S.str("the prop it goes in") }, ["id", "asset"]),
  label: () => "Asset",
  run(s, a, ctx) {
    const catalog = assetCatalog();
    const manifest = catalog?.manifest;
    if (!manifest) throw new OpError("refused", `No asset manifest is in reach: the project looks for it at ${assetManifestPathOf(s.doc)} in its folder${catalog?.problems.length ? ` (${catalog.problems[0]})` : ""}. Bind the project to a folder that holds the pipeline's manifest, or point set_asset_manifest at it.`);
    const id = a.asset.startsWith("asset:") ? a.asset.slice(6) : a.asset;
    const entry = Object.prototype.hasOwnProperty.call(manifest.assets, id) ? manifest.assets[id] : undefined;
    if (!entry) throw new OpError("not_found", `The asset manifest has no asset ${JSON.stringify(id)}. list_assets lists the ${Object.keys(manifest.assets).length} it has.`, "asset");
    const { item } = itemById(s, a.id);
    const def = partBySlug(item.component);
    if (!def) throw new OpError("invalid_value", `${item.component} is not a known part.`, a.id);
    const fits = propsTaking(def, entry.type);
    const target = a.prop ? fits.find((x) => x.d.key === a.prop) : fits[0];
    if (!target) {
      const named = a.prop ? def.props.find((d) => d.key === a.prop) : undefined;
      throw new OpError(
        "invalid_value",
        a.prop && !named
          ? `${def.slug} has no prop "${a.prop}".`
          : `${def.slug}${a.prop ? `.${a.prop}` : ""} takes no ${entry.type}${fits.length ? `: its props that do are ${fits.map((x) => x.d.key).join(", ")}` : ""}. A picture or an icon goes in an image, avatar, card or icon; a video in a video's src.`,
        a.prop ?? a.id,
      );
    }
    const value = assetName(id);
    const done = setProps.run(s, { id: a.id, props: { [target.d.key]: value } }, ctx);
    return { state: done.state, result: { id: a.id, prop: target.d.key, value } };
  },
});

export const setAssetManifest = op<{ path: string }, { assetManifest: string }>({
  name: "set_asset_manifest",
  summary: `Says where the project's asset manifest (the asset pipeline's file of asset ids, files, sizes, platform variants, sources and licences) is: a path inside the project's folder, from the project file. "" goes back to the default, ${DEFAULT_ASSET_MANIFEST_PATH} beside the project file. Only the path is kept; the manifest stays the pipeline's.`,
  args: S.obj({ path: S.str("a path inside the project's folder, names joined by / (no ..), or \"\"") }, ["path"]),
  label: () => "Asset manifest",
  run(s, a) {
    const path = a.path.trim();
    if (path && !ASSET_PATH.test(path)) throw new OpError("invalid_value", `${JSON.stringify(a.path)} is not a path inside the project's folder: names joined by /, none of them . or .., no drive and no backslash.`, "path");
    const { assetManifest: _was, ...rest } = s.doc.external ?? {};
    const external: ExternalFiles = path && path !== DEFAULT_ASSET_MANIFEST_PATH ? { ...rest, assetManifest: path } : rest;
    const next = Object.keys(external).length ? external : undefined;
    if ((s.doc.external?.assetManifest ?? "") === (next?.assetManifest ?? "")) throw new OpError("nothing_to_do", `The project reads its asset manifest from ${assetManifestPathOf(s.doc)} already.`);
    return { state: withDoc(s, { external: next }), result: { assetManifest: path || DEFAULT_ASSET_MANIFEST_PATH } };
  },
});
