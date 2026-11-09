/* The asset manifest: the file the asset pipeline writes and M3E only reads (docs/游戏阶段整改计划.md, “外部模块的接口约定”,
 * and docs/资产引用.md). It maps a stable asset id to the file that holds it, its type, its size, a variant for each
 * platform the pipeline builds for, where it came from and under what licence. A part names one as `asset:<id>`
 * (lib/assetRefs.ts) wherever it takes a picture, an icon or a video, the way it names one of the document's own icons
 * as `svg:<id>`.
 *
 * One author: the pipeline. M3E never writes it, never copies what it lists into the document, and never makes a
 * platform variant of its own: an export writes the reference and a lookup made from this file (lib/export/assets.ts).
 * The format is versioned and described by a JSON Schema (lib/assetManifest.schema.json); this reader holds a file to
 * the same rules, dropping what does not keep to them and saying why, so one bad entry never hides the others.
 *
 * Plain data: no DOM, no Node. */

/** what the `format` field of every manifest says */
export const ASSET_MANIFEST_FORMAT = "asset-manifest";
/** the version this reader reads; a manifest of a later one is refused, for the pipeline to say what changed */
export const ASSET_MANIFEST_VERSION = 1;
/** where a project looks for it when its configuration names no other place: beside the project file */
export const DEFAULT_ASSET_MANIFEST_PATH = "asset-manifest.json";

/** the kinds of asset the pipeline delivers */
export const ASSET_TYPES = ["image", "icon", "video", "audio", "model", "animation"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** what an asset id may be: words of letters and digits joined by single `-`, `_`, `.` or `/`, up to 128 characters */
export const ASSET_ID = /^(?=.{1,128}$)[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*$/;
/** a path inside the manifest's folder: `/`-separated names, none of them empty, `.` or `..`, no drive or backslash */
// eslint-disable-next-line no-control-regex -- the point is to keep control characters out of a path
export const ASSET_PATH = /^(?=.{1,512}$)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[^/\\:*?"<>|\u0000-\u001f]+(?:\/[^/\\:*?"<>|\u0000-\u001f]+)*$/;
/** what a platform's name may be (`web`, `ios`, `android`, `wechat`, `douyin`, `cocos`, `godot`… the pipeline's own) */
export const ASSET_PLATFORM = /^[a-z][a-z0-9-]{0,31}$/;
/** how many assets one manifest may list: the rest are dropped, and said to be */
export const MAX_ASSETS = 5000;

/** one file of an asset: the main one, or a platform's variant */
export type AssetFile = {
  /** the file, from the manifest's folder */
  file: string;
  /** its media type; when left out, the one its extension stands for (`mimeOf`) */
  mime?: string;
  /** its size in px (a picture, an icon, a video) */
  width?: number;
  height?: number;
  /** what it holds, as the pipeline hashes it (`sha256:<hex>`), for a reader to tell a changed file */
  hash?: string;
};

export type AssetEntry = AssetFile & {
  type: AssetType;
  /** the same asset as the pipeline built it for a platform, by the platform's name */
  variants?: Record<string, AssetFile>;
  /** where it came from: the artist, the tool, the library, the address */
  source?: string;
  /** under what licence it may be used (an SPDX id, or the licence's words) */
  license?: string;
  /** what it shows, for whoever picks one (a model, the editor's picker) */
  title?: string;
};

export type AssetManifest = {
  format: typeof ASSET_MANIFEST_FORMAT;
  version: number;
  /** what wrote it: the pipeline's name and version */
  generator?: string;
  assets: Record<string, AssetEntry>;
};

/** a manifest as read: what of it keeps to the format, and what was dropped and why */
export type ReadManifest = { manifest: AssetManifest | null; problems: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SIZE_MAX = 65_536;
const isSize = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= SIZE_MAX;
const MIME = /^[a-z]+\/[a-z0-9.+-]{1,100}$/i;
const HASH = /^[a-z0-9]+:[A-Za-z0-9+/=_-]{8,256}$/;
const TEXT_MAX = 2000;
const text = (v: unknown) => (typeof v === "string" && v.length <= TEXT_MAX ? v : undefined);

/** the media type a file's extension stands for, or "" */
export function mimeOf(file: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase() ?? "";
  return MIMES[ext] ?? "";
}
const MIMES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
  stl: "model/stl",
  json: "application/json",
  lottie: "application/zip",
};

/** one file entry as the format has it, or why it is not one */
function fileOf(v: unknown, at: string, problems: string[]): AssetFile | null {
  if (!isRecord(v)) {
    problems.push(`${at}: should be an object with a file`);
    return null;
  }
  if (typeof v.file !== "string" || !ASSET_PATH.test(v.file)) {
    problems.push(`${at}.file: should be a path inside the manifest's folder (names joined by /, no .. and no drive)`);
    return null;
  }
  const out: AssetFile = { file: v.file };
  if (v.mime !== undefined) {
    if (typeof v.mime === "string" && MIME.test(v.mime)) out.mime = v.mime.toLowerCase();
    else problems.push(`${at}.mime: should be a media type (image/png), left out`);
  }
  for (const k of ["width", "height"] as const) {
    if (v[k] === undefined) continue;
    if (isSize(v[k])) out[k] = v[k];
    else problems.push(`${at}.${k}: should be a whole number of px from 1 to ${SIZE_MAX}, left out`);
  }
  if (v.hash !== undefined) {
    if (typeof v.hash === "string" && HASH.test(v.hash)) out.hash = v.hash;
    else problems.push(`${at}.hash: should be <algorithm>:<digest>, left out`);
  }
  return out;
}

/** one asset as the format has it, or why it is not one */
function entryOf(id: string, v: unknown, problems: string[]): AssetEntry | null {
  const at = `assets[${JSON.stringify(id)}]`;
  if (!ASSET_ID.test(id)) {
    problems.push(`${at}: an id is words of letters and digits joined by single - _ . or /, up to 128 characters; dropped`);
    return null;
  }
  if (!isRecord(v)) {
    problems.push(`${at}: should be an object; dropped`);
    return null;
  }
  if (typeof v.type !== "string" || !(ASSET_TYPES as readonly string[]).includes(v.type)) {
    problems.push(`${at}.type: should be one of ${ASSET_TYPES.join(", ")}; dropped`);
    return null;
  }
  const file = fileOf(v, at, problems);
  if (!file) return null;
  const out: AssetEntry = { ...file, type: v.type as AssetType };
  if (v.variants !== undefined) {
    if (!isRecord(v.variants)) problems.push(`${at}.variants: should be an object of files by platform, left out`);
    else {
      const variants: Record<string, AssetFile> = {};
      for (const [platform, f] of Object.entries(v.variants)) {
        if (!ASSET_PLATFORM.test(platform)) {
          problems.push(`${at}.variants[${JSON.stringify(platform)}]: a platform is a lowercase name (web, ios, wechat), left out`);
          continue;
        }
        const one = fileOf(f, `${at}.variants.${platform}`, problems);
        if (one) variants[platform] = one;
      }
      if (Object.keys(variants).length) out.variants = variants;
    }
  }
  for (const k of ["source", "license", "title"] as const) {
    if (v[k] === undefined) continue;
    const t = text(v[k]);
    if (t !== undefined) out[k] = t;
    else problems.push(`${at}.${k}: should be text of at most ${TEXT_MAX} characters, left out`);
  }
  return out;
}

/** The manifest a file holds (parsed JSON), as far as it keeps to the format: entries that do not are dropped, and
 *  every drop is said in `problems`. Null (with the reason) for something that is no manifest of this version. */
export function readAssetManifest(json: unknown): ReadManifest {
  const problems: string[] = [];
  if (!isRecord(json) || json.format !== ASSET_MANIFEST_FORMAT) return { manifest: null, problems: [`not an asset manifest: "format" should be "${ASSET_MANIFEST_FORMAT}"`] };
  if (typeof json.version !== "number" || !Number.isInteger(json.version) || json.version < 1) return { manifest: null, problems: ['"version" should be a whole number from 1'] };
  if (json.version > ASSET_MANIFEST_VERSION) return { manifest: null, problems: [`written in version ${json.version} of the format; this version of M3E reads version ${ASSET_MANIFEST_VERSION}`] };
  if (!isRecord(json.assets)) return { manifest: null, problems: ['"assets" should be an object of assets by id'] };
  const assets: Record<string, AssetEntry> = {};
  let n = 0;
  for (const [id, v] of Object.entries(json.assets)) {
    if (n >= MAX_ASSETS) {
      problems.push(`more than ${MAX_ASSETS} assets: the rest are dropped`);
      break;
    }
    const entry = entryOf(id, v, problems);
    if (!entry) continue;
    /* defined, not assigned: an id such as `__proto__` stays a key */
    Object.defineProperty(assets, id, { value: entry, enumerable: true, writable: true, configurable: true });
    n++;
  }
  const generator = text(json.generator);
  return { manifest: { format: ASSET_MANIFEST_FORMAT, version: json.version, ...(generator ? { generator } : {}), assets }, problems };
}

/** the same, from a file's text */
export function parseAssetManifest(textOf: string): ReadManifest {
  try {
    return readAssetManifest(JSON.parse(textOf));
  } catch {
    return { manifest: null, problems: ["not JSON"] };
  }
}

/** the file of an asset a platform takes: its variant for the platform (the first of `platforms` it has), else the
 *  main file */
export function assetFileFor(entry: AssetEntry, platforms: readonly string[] = []): AssetFile {
  for (const p of platforms) {
    const v = entry.variants?.[p];
    if (v) return v;
  }
  return entry;
}

/** an asset's media type: the one it says, else its extension's */
export const assetMime = (f: AssetFile) => f.mime ?? mimeOf(f.file);

/** A path inside the folder of the manifest at `manifestPath` (both `/`-separated, from the same root): the folder
 *  of the manifest joined to the file. */
export function besideManifest(manifestPath: string, file: string): string {
  const dir = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1) : "";
  return `${dir}${file}`;
}
