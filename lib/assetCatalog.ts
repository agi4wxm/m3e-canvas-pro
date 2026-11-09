/* The asset manifest of the open project as it is drawn: read from where the project's configuration says it is
 * (`Doc.external.assetManifest`, beside the project file by default), with the file of each asset read into an address
 * the page can draw (a data: URL, or a blob: one for a clip). The editor reads it from the folder the project is bound to
 * (lib/projects/assetLink.ts) and reads it again whenever the manifest or one of its files changes; the MCP server's
 * file backend reads it from beside the project file on disk. Either way the same `loadAssetCatalog` reads it, through
 * a `AssetReader` over that place, and the parts draw what it holds (components/PartView.tsx, the icon component).
 *
 * Nothing of it goes into the document: the document names `asset:<id>` and this says what that is now. */

import { ASSET_PATH, DEFAULT_ASSET_MANIFEST_PATH, assetMime, besideManifest, parseAssetManifest, type AssetManifest } from "./assetManifest";
import type { Doc } from "./tokens";
import { ASSET_SET, assetIconName } from "../components/m3e/asset-icon-name";

/** the manifest of the open project, and what each of its assets is drawn from */
export type AssetCatalog = {
  /** the manifest's path from the project's folder */
  path: string;
  /** null when there is none there, or it is not a manifest of a version this one reads (`problems` says which) */
  manifest: AssetManifest | null;
  /** the address each asset is drawn from, by id; one whose file could not be read has none, and draws its placeholder */
  urls: Record<string, string>;
  /** what of the manifest was dropped, and the files that could not be read */
  problems: string[];
  /** what the manifest and its files were when read: another read with the same stamp holds the same */
  stamp: string;
};

/** the project's folder, as the catalog reads it */
export type AssetReader = {
  /** a file by its path from the project's folder, or null when it is not there */
  read(path: string): Promise<Uint8Array | null>;
  /** what tells whether a file changed (its size and time), or null when it is not there */
  stamp(path: string): Promise<string | null>;
};

/** the largest file drawn: one larger is left out, and said to be */
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;

/** where the project's manifest is: what its configuration says (a path inside its folder), else beside the project file */
export function assetManifestPathOf(doc: Pick<Doc, "external"> | null | undefined): string {
  const p = doc?.external?.assetManifest;
  return typeof p === "string" && ASSET_PATH.test(p) ? p : DEFAULT_ASSET_MANIFEST_PATH;
}

/** bytes as base64, in pieces (a large file in one call would overflow the stack) */
function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** a file as a data URL */
export const dataUrlOf = (bytes: Uint8Array, mime: string) => `data:${mime || "application/octet-stream"};base64,${base64(bytes)}`;

/** what tells whether the manifest at `path` or any of `files` changed: their stamps together */
async function stampOf(reader: AssetReader, path: string, files: readonly string[]): Promise<string> {
  const stamps = await Promise.all([path, ...files].map((p) => reader.stamp(p).catch(() => null)));
  return stamps.map((s) => s ?? "-").join("|");
}

/** the files a manifest lists that the canvas draws: each asset's main file */
const filesOf = (path: string, m: AssetManifest | null) => (m ? Object.values(m.assets).map((a) => besideManifest(path, a.file)) : []);

/** Reads the manifest at `path` and each asset's file. `url` makes the address a file is drawn from (a data URL by
 *  default). A manifest that is not there is a catalog without one (and says so); nothing here throws for what the
 *  folder holds. */
export async function loadAssetCatalog(reader: AssetReader, path: string, o: { url?: (bytes: Uint8Array, mime: string, type: string) => string } = {}): Promise<AssetCatalog> {
  const problems: string[] = [];
  const bytes = await reader.read(path).catch(() => null);
  if (!bytes) return { path, manifest: null, urls: {}, problems: [`no asset manifest at ${path}`], stamp: await stampOf(reader, path, []) };
  const read = parseAssetManifest(new TextDecoder().decode(bytes));
  problems.push(...read.problems.map((p) => `${path}: ${p}`));
  const urls: Record<string, string> = {};
  const manifest = read.manifest;
  for (const [id, a] of Object.entries(manifest?.assets ?? {})) {
    const at = besideManifest(path, a.file);
    const data = await reader.read(at).catch(() => null);
    if (!data) problems.push(`${id}: its file ${at} is not there`);
    else if (data.length > MAX_ASSET_BYTES) problems.push(`${id}: its file ${at} is larger than ${MAX_ASSET_BYTES / 1024 / 1024} MB and is not drawn`);
    else Object.defineProperty(urls, id, { value: (o.url ?? dataUrlOf)(data, assetMime(a), a.type), enumerable: true, writable: true, configurable: true });
  }
  return { path, manifest, urls, problems, stamp: await stampOf(reader, path, filesOf(path, manifest)) };
}

/** whether the manifest or a file it lists changed since `catalog` was read */
export async function assetCatalogChanged(reader: AssetReader, catalog: AssetCatalog): Promise<boolean> {
  return (await stampOf(reader, catalog.path, filesOf(catalog.path, catalog.manifest))) !== catalog.stamp;
}

/* ---------- the catalog the page draws with ---------- */

let current: AssetCatalog | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** The catalog the canvas, the preview and the screenshots draw with from now on (null: none); every part that names
 *  an asset is drawn again. */
export function setAssetCatalog(next: AssetCatalog | null) {
  if (next === current) return;
  if (next && current && next.stamp === current.stamp && next.path === current.path) return;
  current = next;
  version++;
  for (const l of listeners) l();
}

/** the catalog drawn with now */
export const assetCatalog = (): AssetCatalog | null => current;
/** a number that moves whenever the catalog does */
export const assetCatalogVersion = () => version;
export function subscribeAssetCatalog(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
/** the address an asset is drawn from now, or "" (its part draws the placeholder) */
export const drawnAssetUrl = (id: string): string => (current && Object.prototype.hasOwnProperty.call(current.urls, id) ? current.urls[id] : "");

/* ---------- drawn as icons ---------- */

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** One asset drawn as an icon: an Iconify icon whose body is its picture, in a box of its own size (24 when the
 *  manifest gives none). */
export function assetIcon(url: string, width = 24, height = width): { body: string; width: number; height: number } {
  return { body: `<image href="${attr(url)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`, width, height };
}

/** The pictures and icons of a catalog as the Iconify collection the icon component draws `asset:<id>` from, and
 *  what each is drawn with (its address), by id. */
export function assetIconSet(catalog: AssetCatalog | null): { drawn: Record<string, string>; set: { prefix: string; icons: Record<string, { body: string; width: number; height: number }> } } {
  const drawn: Record<string, string> = {};
  const icons: Record<string, { body: string; width: number; height: number }> = {};
  for (const [id, a] of Object.entries(catalog?.manifest?.assets ?? {})) {
    const url = catalog!.urls[id];
    if (!url || (a.type !== "icon" && a.type !== "image")) continue;
    drawn[id] = url;
    icons[assetIconName(id)] = assetIcon(url, a.width ?? 24, a.height ?? a.width ?? 24);
  }
  return { drawn, set: { prefix: ASSET_SET, icons } };
}
