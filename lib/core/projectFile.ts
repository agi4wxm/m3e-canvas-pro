/* A project file as text: what the editor writes when it saves a project, keeps a bound file up to date with, and what
 * any other tool (the MCP server, a script, a person with a text editor) reads and writes. Plain TypeScript with no DOM
 * and no Node APIs, so it runs anywhere; docs/项目文件.md describes the format.
 *
 * The text is made for version control: every object's keys in code-point order, two spaces of indentation, and one
 * line per screen, per part (group), per variable, per row of data, so a change to one part is a change to one line.
 * Pictures either stay in the text as data URLs (one file), or, beside a folder, go into files of their own that the
 * document refers to as `m3e-file:<path>`. Writing the same document twice gives the same bytes, and so does writing
 * what was read back. */

import { openProject, projectFile } from "../project";
import type { Doc } from "../tokens";

/** the file a project is kept in inside a folder of its own */
export const FOLDER_MAIN_FILE = "m3e-project.json";
/** where, beside it, its pictures are kept */
export const FOLDER_ASSET_DIR = "m3e-assets";
/** how the document refers to a picture kept in a file of its own, relative to the project file */
export const FILE_REF = "m3e-file:";
/** smaller pictures stay in the text: a file for each icon-sized picture is more noise than help */
export const FILE_MIN_CHARS = 2048;

/** a picture kept beside the project file */
export type ProjectAssetFile = { path: string; mime: string; bytes: Uint8Array };

/* ---------- the layout ---------- */

/** Sets an own, enumerable key the way JSON.parse makes one. A plain assignment would run the inherited setter of a
 *  key such as `__proto__` (changing the copy's prototype and losing the key) instead of keeping it as data. */
export function setOwn(out: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true });
}

/** A value with every object's keys in code-point order, as JSON would write it: a key whose value is undefined (or a
 *  function) is left out, and in a list it becomes null. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined || typeof v === "function" ? null : sortKeys(v)));
  if (value === null || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o).sort(byCodePoint)) {
    const v = o[k];
    if (v === undefined || typeof v === "function") continue;
    setOwn(out, k, sortKeys(v));
  }
  return out;
}

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A value as JSON would write it, its keys in their own order: what `sortKeys` does without the sorting. */
function plainJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined || typeof v === "function" ? null : plainJson(v)));
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined || typeof v === "function") continue;
    setOwn(out, k, plainJson(v));
  }
  return out;
}

/** the document with its keys sorted, but for the API section, whose keys keep their order */
function sortedDocument(document: unknown): unknown {
  if (document === null || typeof document !== "object" || Array.isArray(document) || !("api" in document)) return sortKeys(document);
  const { api, ...rest } = document as Record<string, unknown>;
  const sorted = sortKeys({ ...rest, api: null }) as Record<string, unknown>;
  if (api === undefined) delete sorted.api;
  else sorted.api = plainJson(api);
  return sorted;
}

/** the lists inside the document whose entries hold lists of their own, each entry written open */
const OPEN_ENTRIES = new Set(["components", "collections"]);
/** The mock library (lib/mocks): its lists and records written open, one model, scenario, file or script a line. */
const MOCKS = "mocks";
/** The API section (lib/api): its own lists and records written open, one model, endpoint, channel, server or security
 *  scheme a line. Its keys keep their order: the order of a schema's properties, of the responses, is the author's. */
const API = "api";

/** Whether a value at this place is written open (one member per line) rather than on one line. The envelope, the
 *  document, and the document's own lists and records are open; so are the entries of `components` and `collections`
 *  and their lists. Everything below is one line: a screen, a part, a variable, a style, a row of data. */
function isOpen(path: string[], value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const n = path.length;
  if (n === 0) return true;
  if (path[0] !== "document") return false;
  if (n <= 2) return true;
  if (path[1] === API || path[1] === MOCKS) return n === 3;
  if (n === 3) return OPEN_ENTRIES.has(path[1]) && !Array.isArray(value);
  if (n === 4) return OPEN_ENTRIES.has(path[1]) && Array.isArray(value);
  return false;
}

const isEmpty = (v: object) => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);

function write(value: unknown, path: string[], indent: string): string {
  if (!isOpen(path, value) || isEmpty(value as object)) return JSON.stringify(value) ?? "null";
  const inner = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((v) => inner + write(v, [...path, "[]"], inner)).join(",\n")}\n${indent}]`;
  const lines = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${write(v, [...path, k], inner)}`);
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

/** The text of a project file: the envelope's `format`, `version` and `document` in that order, everything inside
 *  the document with its keys sorted, laid out as `isOpen` says, ending with a newline. */
export function formatProject(file: { format: string; version: number; document: unknown }): string {
  const { format, version, document, ...rest } = file;
  const envelope: Record<string, unknown> = { format, version, document: sortedDocument(document) };
  for (const k of Object.keys(rest).sort(byCodePoint)) setOwn(envelope, k, sortKeys(rest[k as keyof typeof rest]));
  return write(envelope, [], "") + "\n";
}

/* ---------- pictures as files ---------- */

const MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };
/** the other files the mock library keeps (document.mocks.files), beside the pictures */
const MOCK_MIME_EXT: Record<string, string> = { "application/pdf": "pdf", "audio/wav": "wav", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a", "video/mp4": "mp4", "video/webm": "webm", "application/octet-stream": "bin" };
const EXT_MIME: Record<string, string> = Object.fromEntries([...Object.entries(MIME_EXT), ...Object.entries(MOCK_MIME_EXT)].map(([m, e]) => [e, m]));
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif|avif|svg\+xml));base64,([A-Za-z0-9+/]*={0,2})$/;
const MOCK_DATA_URL = /^data:(application\/pdf|audio\/(?:wav|mpeg|ogg|mp4)|video\/(?:mp4|webm)|application\/octet-stream);base64,([A-Za-z0-9+/]*={0,2})$/;
const ASSET_EXTS = [...Object.values(MIME_EXT), ...Object.values(MOCK_MIME_EXT)].join("|");
/** what a picture's path inside the folder may look like: nothing that climbs out of it */
const ASSET_PATH = new RegExp(`^${FOLDER_ASSET_DIR}/[a-z0-9]+\\.(?:${ASSET_EXTS})$`);
/** a file name in m3e-assets/ as the format gives one: what it holds, hashed, and an extension */
const ASSET_NAME = new RegExp(`^([a-z0-9]+)\\.(?:${ASSET_EXTS})$`);

/** whether a path a document refers to is one of the pictures beside it, and nothing else */
export const isAssetPath = (path: string) => ASSET_PATH.test(path);

/** How long a picture in m3e-assets/ that another program wrote is left alone: its own save may still be under way,
 *  its project file not yet written. */
export const ASSET_GRACE_MS = 60_000;

/** Whether a file in m3e-assets/ is one the format could have written: named by the hash of exactly what it holds. A
 *  file put there by hand (`logo.png`), or one whose bytes are not what its name says, is not, and a tool that tidies
 *  the folder leaves it alone. */
export function isFormatAsset(name: string, bytes: Uint8Array): boolean {
  const m = ASSET_NAME.exec(name);
  return !!m && digest(bytesToBase64(bytes)) === m[1];
}

/** whether a file name in m3e-assets/ has the shape of one the format writes (its bytes not looked at) */
export const isAssetFileName = (name: string) => ASSET_NAME.test(name);

/** a short, well-spread hash of a text (cyrb53), in base 36: the same picture always gets the same name */
export function digest(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** A picture that can go into a file of its own and come back as exactly the same text: a base64 image of a kind
 *  with a file extension, written the way it would be written again. Anything else stays in the document. */
function asFile(s: string, mock = false): ProjectAssetFile | null {
  if (s.length < FILE_MIN_CHARS || !s.startsWith("data:")) return null;
  const m = DATA_URL.exec(s) ?? (mock ? MOCK_DATA_URL.exec(s) : null);
  if (!m) return null;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(m[2]);
  } catch {
    return null;
  }
  if (bytesToBase64(bytes) !== m[2]) return null;
  return { path: `${FOLDER_ASSET_DIR}/${digest(m[2])}.${MIME_EXT[m[1]] ?? MOCK_MIME_EXT[m[1]]}`, mime: m[1], bytes };
}

/** the picture a file holds, as the data URL the document had */
export function dataUrlOf(path: string, bytes: Uint8Array): string {
  const ext = path.slice(path.lastIndexOf(".") + 1);
  return `data:${EXT_MIME[ext] ?? "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

/** every string in a value passed through `fn`, keys left alone; what does not change is the same object */
function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === "string") return fn(value) as T;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const next = mapStrings(v, fn);
      if (next !== v) changed = true;
      return next;
    });
    return (changed ? out : value) as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const next = mapStrings(v, fn);
      if (next !== v) changed = true;
      setOwn(out, k, next);
    }
    return (changed ? out : value) as T;
  }
  return value;
}

/** the pictures a document refers to by file, as paths relative to the project file */
export function fileRefsIn(doc: unknown): string[] {
  const refs = new Set<string>();
  mapStrings(doc, (s) => {
    if (s.startsWith(FILE_REF)) refs.add(s.slice(FILE_REF.length));
    return s;
  });
  return [...refs].sort(byCodePoint);
}

/* ---------- writing and reading ---------- */

export type SerializeOptions = {
  /** `inline` (the default): pictures stay in the text as data URLs, the whole project in one file. `files`: the
   *  larger ones go into files of their own under `m3e-assets/`, for a project kept in a folder. */
  assets?: "inline" | "files";
};

/** A document as the text of its project file, and in `files` mode the pictures to keep beside it. The document is
 *  written as it is: pictures the editor keeps by reference in the browser (`m3e-asset:`) must be put back first. */
export function serializeProject(doc: Doc, o: SerializeOptions = {}): { text: string; files: ProjectAssetFile[] } {
  const files = new Map<string, ProjectAssetFile>();
  const keep = (mock: boolean) => (s: string) => {
    const f = asFile(s, mock);
    if (!f) return s;
    files.set(f.path, f);
    return FILE_REF + f.path;
  };
  let body = o.assets === "files" ? mapStrings(doc, keep(false)) : doc;
  /* the mock library's PDFs, sounds and clips go beside the pictures too; nothing else in a document is one of them */
  if (o.assets === "files" && body.mocks?.files?.length) body = { ...body, mocks: { ...body.mocks, files: body.mocks.files.map((f) => ({ ...f, data: keep(true)(f.data) })) } };
  return { text: formatProject(projectFile(body)), files: [...files.values()].sort((a, b) => byCodePoint(a.path, b.path)) };
}

/** The document a project file's text holds, checked and brought up to this version (lib/project.ts `openProject`),
 *  and the pictures it refers to by file; null when it is not a project. Pictures by file are still references. */
export function parseProject(text: string): { doc: Doc; files: string[] } | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const doc = openProject(value);
  return doc ? { doc, files: fileRefsIn(doc) } : null;
}

/** The document with the pictures it refers to by file put back. A picture that is not there (or a path that is not
 *  one of the pictures beside it) leaves an empty picture, not a broken one. */
export function attachFiles(doc: Doc, files: ReadonlyMap<string, Uint8Array>): Doc {
  return mapStrings(doc, (s) => {
    if (!s.startsWith(FILE_REF)) return s;
    const path = s.slice(FILE_REF.length);
    const bytes = isAssetPath(path) ? files.get(path) : undefined;
    return bytes ? dataUrlOf(path, bytes) : "";
  });
}

/** Reads a project file's text, fetching the pictures it refers to by file with `load` (from the folder it is in);
 *  without `load` they come back empty. Null when it is not a project. */
export async function readProjectText(text: string, load?: (path: string) => Promise<Uint8Array | null | undefined>): Promise<Doc | null> {
  const parsed = parseProject(text);
  if (!parsed) return null;
  const files = new Map<string, Uint8Array>();
  if (load)
    await Promise.all(
      parsed.files.filter(isAssetPath).map(async (path) => {
        const bytes = await load(path).catch(() => null);
        if (bytes) files.set(path, bytes);
      }),
    );
  return parsed.files.length ? attachFiles(parsed.doc, files) : parsed.doc;
}

/** The name a project takes from the file it came from: the file's name without its extension and without the
 *  `m3e-canvas ` the editor puts before a saved project's name; null when that leaves nothing of the author's. */
export function projectNameFromFile(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/(\.m3e)?\.json$/i, "").replace(/\.m3e$/i, "");
  const name = base.replace(/^m3e-canvas(\s+|$)/i, "").trim();
  if (!name || /^m3e-project$/i.test(name)) return null;
  return name;
}
