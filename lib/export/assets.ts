/* The asset pipeline's assets in an export (docs/资产引用.md). An exported app keeps the reference, never the asset:
 * where the design names `asset:<id>`, the code reads `asset("<id>")` from a lookup the export writes beside the screens,
 * made from the manifest (lib/assetManifest.ts) and holding, for each id the app names, the file of the variant its
 * platform takes (the main file where the pipeline built none), its type and its size. The files themselves are the
 * pipeline's: an app finds them under its asset base (where the pipeline's output is served or bundled), so a picture
 * swapped by the pipeline needs no export, and M3E never makes a variant of its own.
 *
 * An id the manifest does not have is left out of the lookup: the app draws the part's placeholder, and the export
 * lists the gap (lib/export/gaps.ts, `.m3e/gaps.json`, the report). */

import { isNode, isRaw, raw, type PNode, type PValue } from "../../parts/node";
import type { PartDef } from "../../parts/types";
import { assetFileFor, type AssetManifest } from "../assetManifest";
import { assetIdOf, assetSlotOf, assetUsesOf, isAssetName, type AssetSlot } from "../assetRefs";
import type { Doc } from "../tokens";
import { ASSET_SET, assetIconName } from "../../components/m3e/asset-icon-name";
import { str } from "./code";

/** the name the screens read an asset's address by, and the module of the web app that has it */
export const ASSET_FN = "asset";
export const WEB_ASSET_MODULE = "@/assets";

/** the platforms each app takes a variant for, first match first (the pipeline's own names) */
export const ASSET_PLATFORMS = { web: ["web"], ios: ["ios", "mobile"], android: ["android", "mobile"], wechat: ["wechat", "miniapp"], douyin: ["douyin", "miniapp"] } as const;

/** what the export says of one asset the app names: the file it takes on each platform, its type and size */
type LookupEntry = { type: string; file: string; width?: number; height?: number };

/** the ids a document names, each with what it is named as (a picture, an icon…) */
export function namedAssets(doc: Pick<Doc, "groups" | "frames" | "components">): Map<string, Set<AssetSlot>> {
  const out = new Map<string, Set<AssetSlot>>();
  for (const u of assetUsesOf(doc)) {
    const set = out.get(u.id) ?? new Set<AssetSlot>();
    if (u.slot) set.add(u.slot);
    out.set(u.id, set);
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** the lookup's entries for one platform: each id the document names that the manifest has */
export function lookupFor(doc: Pick<Doc, "groups" | "frames" | "components">, manifest: AssetManifest | null | undefined, platforms: readonly string[]): Record<string, LookupEntry> {
  const out: Record<string, LookupEntry> = {};
  for (const id of namedAssets(doc).keys()) {
    const a = manifest && Object.prototype.hasOwnProperty.call(manifest.assets, id) ? manifest.assets[id] : undefined;
    if (!a) continue;
    const f = assetFileFor(a, platforms);
    Object.defineProperty(out, id, { value: { type: a.type, file: f.file, ...(f.width ? { width: f.width } : {}), ...(f.height ? { height: f.height } : {}) }, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/* ---------- the web printer ---------- */

/** what a reference to an asset is printed through the tree as: an address no part's tree turns away (a video plays
 *  only a web address), taken out again once the tree is drawn (`unmarkAssets`) */
const MARK = "https://asset.m3e.invalid/";

/** A part's values with every asset it names as a picture or a media address marked, so the tree carries it to where
 *  the address goes. Icons stay names: the icon component draws `asset:<id>` from the registered lookup. */
export function markAssets(def: PartDef, values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!values) return values;
  let out: Record<string, unknown> | null = null;
  const mark = (v: string) => `${MARK}${encodeURIComponent(assetIdOf(v))}`;
  for (const d of def.props) {
    const v = values[d.key];
    const slot = assetSlotOf(def, d);
    if (slot && slot !== "icon" && isAssetName(v)) (out ??= { ...values })[d.key] = mark(v);
    else if (d.kind === "list" && Array.isArray(v) && v.some((r) => isAssetName((r as { image?: unknown } | null)?.image)))
      (out ??= { ...values })[d.key] = v.map((r) => (isAssetName((r as { image?: unknown }).image) ? { ...(r as object), image: mark((r as { image: string }).image) } : r));
  }
  return out ?? values;
}

/** whether a tree's string is a marked asset, and its id */
const markedId = (v: unknown): string | null => (typeof v === "string" && v.startsWith(MARK) ? decodeURIComponent(v.slice(MARK.length)) : null);

/** The tree with each marked asset read from the lookup at run time: `asset("<id>")`. */
export function unmarkAssets(node: PNode): PNode {
  let found = false;
  const value = (v: PValue): PValue => {
    const id = markedId(v);
    if (id !== null) {
      found = true;
      return raw(`${ASSET_FN}(${str(id)})`, ASSET_FN);
    }
    if (isRaw(v) || typeof v !== "object" || v === null) return v;
    if (isNode(v)) return tree(v);
    if (Array.isArray(v)) return v.map(value);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x as PValue)]));
  };
  const tree = (n: PNode): PNode => ({ ...n, ...(n.props ? { props: Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, value(v)])) } : {}), ...(n.children ? { children: n.children.map((c) => (typeof c === "string" ? c : tree(c))) } : {}) });
  const out = tree(node);
  return found ? out : node;
}

/** The web app's lookup (src/assets.ts): `asset(id)` gives the address of an asset's web variant under the asset
 *  base, and the assets named as icons are registered for the icon component. Undefined when the document names none. */
export function webAssetsFile(doc: Pick<Doc, "groups" | "frames" | "components">, manifest: AssetManifest | null | undefined): string | undefined {
  const named = namedAssets(doc);
  if (!named.size) return undefined;
  const lookup = lookupFor(doc, manifest, ASSET_PLATFORMS.web);
  const icons = [...named].filter(([id, slots]) => slots.has("icon") && lookup[id]).map(([id]) => id);
  const lines = [
    "// Generated by M3E Canvas. The asset pipeline's assets this app names, from its asset manifest: for each id, the",
    "// file of its web variant (its main file where the pipeline built none), its type and its size. The files are the",
    "// pipeline's: serve its output at ASSET_BASE (VITE_ASSET_BASE, /assets/ by default). An id the manifest did not have",
    "// is not here: the app draws the part's placeholder, and .m3e/gaps.json lists it.",
    ...(icons.length ? ['import { registerIcons } from "@/components/m3e/icon"', ""] : [""]),
    "export type Asset = { type: string; file: string; width?: number; height?: number }",
    "",
    "/** where the pipeline's files are served from */",
    'export const ASSET_BASE: string = import.meta.env.VITE_ASSET_BASE ?? "/assets/"',
    "",
    `export const ASSETS: Record<string, Asset> = ${JSON.stringify(lookup, null, 2)}`,
    "",
    "/** the address of an asset by its id, or \"\" for one the manifest did not have */",
    "export function asset(id: string): string {",
    "  const a = Object.prototype.hasOwnProperty.call(ASSETS, id) ? ASSETS[id] : undefined",
    '  return a ? `${ASSET_BASE}${a.file}` : ""',
    "}",
  ];
  if (icons.length) {
    lines.push(
      "",
      "/* the assets named where a part takes an icon (`asset:<id>`), drawn by the icon component as their pictures */",
      "const icon = (id: string, width: number, height: number) => ({",
      '  body: `<image href="${asset(id).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`,',
      "  width,",
      "  height,",
      "})",
      "",
      `registerIcons({ prefix: ${str(ASSET_SET)}, icons: {`,
      ...icons.map((id) => `  ${str(assetIconName(id))}: icon(${str(id)}, ${lookup[id].width ?? 24}, ${lookup[id].height ?? lookup[id].width ?? 24}),`),
      "} })",
    );
  }
  return `${lines.join("\n")}\n`;
}

/* ---------- the phone app and the mini-program ---------- */

/** The lookup of the phone app (src/generated/assets.ts): each id's file on iOS and on Android, read under its asset
 *  base. Undefined when the document names none. */
export function rnAssetsFile(doc: Pick<Doc, "groups" | "frames" | "components">, manifest: AssetManifest | null | undefined): string | undefined {
  if (!namedAssets(doc).size) return undefined;
  const ios = lookupFor(doc, manifest, ASSET_PLATFORMS.ios);
  const android = lookupFor(doc, manifest, ASSET_PLATFORMS.android);
  const both = Object.fromEntries(Object.keys(ios).map((id) => [id, { type: ios[id].type, ios: ios[id].file, android: android[id].file }]));
  return [
    "// Generated by M3E Canvas from the design. Do not edit: change the design and export again.",
    "// The asset pipeline's assets this app names, from its asset manifest: each id's file on iOS and on Android (the",
    "// main file where the pipeline built no variant). The files are the pipeline's: they are read under ASSET_BASE",
    "// (EXPO_PUBLIC_ASSET_BASE). An id the manifest did not have is not here: the part draws its placeholder.",
    'import { Platform } from "react-native";',
    "",
    "declare global {",
    "  namespace NodeJS {",
    "    interface ProcessEnv {",
    "      /** where the asset pipeline's files are (Expo inlines EXPO_PUBLIC_ variables) */",
    "      readonly EXPO_PUBLIC_ASSET_BASE?: string;",
    "    }",
    "  }",
    "}",
    "",
    'export const ASSET_BASE: string = process.env.EXPO_PUBLIC_ASSET_BASE ?? "";',
    "",
    `const ASSETS: Record<string, { type: string; ios: string; android: string }> = ${JSON.stringify(both, null, 2)};`,
    "",
    '/** the address of an asset by its id, or "" for one the manifest did not have */',
    "export function asset(id: string): string {",
    "  const a = Object.prototype.hasOwnProperty.call(ASSETS, id) ? ASSETS[id] : undefined;",
    '  return a ? `${ASSET_BASE}${Platform.OS === "android" ? a.android : a.ios}` : "";',
    "}",
    "",
  ].join("\n");
}

/** The lookup of the mini-program (src/generated/assets.ts): each id's file on WeChat and on Douyin. */
export function miniappAssetsFile(doc: Pick<Doc, "groups" | "frames" | "components">, manifest: AssetManifest | null | undefined): string | undefined {
  if (!namedAssets(doc).size) return undefined;
  const wechat = lookupFor(doc, manifest, ASSET_PLATFORMS.wechat);
  const douyin = lookupFor(doc, manifest, ASSET_PLATFORMS.douyin);
  const both = Object.fromEntries(Object.keys(wechat).map((id) => [id, { type: wechat[id].type, wechat: wechat[id].file, douyin: douyin[id].file }]));
  return [
    "// Generated by M3E Canvas from the design. Do not edit: change the design and export again.",
    "// The asset pipeline's assets this mini-program names, from its asset manifest: each id's file on WeChat and on",
    "// Douyin (the main file where the pipeline built no variant). The files are the pipeline's: they are read under",
    "// ASSET_BASE (TARO_APP_ASSET_BASE). An id the manifest did not have is not here: the part draws its placeholder.",
    "declare global {",
    "  namespace NodeJS {",
    "    interface ProcessEnv {",
    "      /** where the asset pipeline's files are (config/index.ts builds it in) */",
    "      TARO_APP_ASSET_BASE?: string;",
    "    }",
    "  }",
    "}",
    "",
    'export const ASSET_BASE: string = process.env.TARO_APP_ASSET_BASE ?? "";',
    "",
    `const ASSETS: Record<string, { type: string; wechat: string; douyin: string }> = ${JSON.stringify(both, null, 2)};`,
    "",
    '/** the address of an asset by its id, or "" for one the manifest did not have */',
    "export function asset(id: string): string {",
    "  const a = Object.prototype.hasOwnProperty.call(ASSETS, id) ? ASSETS[id] : undefined;",
    '  return a ? `${ASSET_BASE}${process.env.TARO_ENV === "tt" ? a.douyin : a.wechat}` : "";',
    "}",
    "",
  ].join("\n");
}
