/* The tool that reads the asset pipeline's manifest of the project (lib/assetManifest.ts, lib/assetCatalog.ts): every
 * asset it lists, by id, with its type, size, platform variants, source and licence, where the document names each,
 * and what the document names that the manifest does not have. set_asset puts one on a part. */

import { assetCatalog, assetManifestPathOf } from "../assetCatalog";
import { ASSET_TYPES, type AssetType } from "../assetManifest";
import { assetGapOf, assetUsesOf } from "../assetRefs";
import { tool, type Tool } from "./types";

type Args = { type?: AssetType; query?: string };

const listAssets = tool<Args>({
  name: "list_assets",
  group: "read",
  description:
    "The asset pipeline's assets this project can use, from its asset manifest (read from the project's folder): each one's id, type (image, icon, video, audio, model, animation), size, title, the platforms the pipeline built a variant for, source and licence, and the parts that name it. A part names one as asset:<id> where it takes a picture, an icon or a video's address (set_asset puts one on a part): it is drawn from the manifest, never copied. Also lists what the document names that the manifest does not have (a gap the export reports). `type` and `query` (words of the id or title) narrow the list.",
  input: {
    type: "object",
    properties: { type: { type: "string", enum: [...ASSET_TYPES], description: "only assets of this type" }, query: { type: "string", description: "words the id or the title holds" } },
    required: [],
    additionalProperties: false,
  },
  output: "the manifest's assets as text",
  readOnly: true,
  destructive: false,
  run(a, env) {
    const doc = env.store.get().doc;
    const catalog = assetCatalog();
    const manifest = catalog?.manifest;
    const uses = assetUsesOf(doc);
    const head = manifest
      ? `Asset manifest ${catalog!.path}${manifest.generator ? ` (written by ${manifest.generator})` : ""}: ${Object.keys(manifest.assets).length} asset(s).`
      : `No asset manifest is in reach: the project looks for it at ${assetManifestPathOf(doc)} in its folder${catalog?.problems.length ? ` (${catalog.problems.slice(0, 3).join("; ")})` : " (the project is not bound to a folder)"}. set_asset_manifest names another path; the pipeline writes the file.`;
    const words = (a.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const lines = Object.entries(manifest?.assets ?? {})
      .filter(([id, x]) => (!a.type || x.type === a.type) && words.every((w) => id.toLowerCase().includes(w) || (x.title ?? "").toLowerCase().includes(w)))
      .slice(0, 200)
      .map(([id, x]) => {
        const named = uses.filter((u) => u.id === id).map((u) => `${u.item}.${u.prop}`);
        const size = x.width && x.height ? ` ${x.width}×${x.height}` : "";
        const variants = Object.keys(x.variants ?? {});
        return `- asset:${id} (${x.type}${size})${x.title ? ` ${JSON.stringify(x.title)}` : ""}${variants.length ? `; variants: ${variants.join(", ")}` : ""}${x.license ? `; licence ${x.license}` : ""}${x.source ? `; from ${x.source}` : ""}${catalog?.urls[id] ? "" : "; its file is not there"}${named.length ? `; named by ${named.slice(0, 6).join(", ")}${named.length > 6 ? ", …" : ""}` : ""}`;
      });
    const gaps = uses.flatMap((u) => {
      const g = assetGapOf(u, manifest);
      return g ? [`- ${u.item}.${u.prop}${u.screen ? ` on ${u.screen}` : ""}: ${g.detail}`] : [];
    });
    return {
      result: [head, ...(lines.length ? lines : manifest ? ["(none match)"] : []), ...(gaps.length ? ["", "Named by the document but not delivered (gaps):", ...gaps] : []), ...(catalog?.manifest && catalog.problems.length ? ["", "Problems reading the manifest:", ...catalog.problems.slice(0, 10).map((p) => `- ${p}`)] : [])].join("\n"),
    };
  },
});

export const ASSET_READ_TOOLS: Tool<never>[] = [listAssets as unknown as Tool<never>];
