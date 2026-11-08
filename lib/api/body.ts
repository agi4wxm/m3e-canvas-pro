/* What an answer's bytes are to the code that called: one rule for every transport of the exported product (the
 * fetch transport of packages/api, which the web and React Native apps use; their uploads over XMLHttpRequest; the
 * mini-program's Taro.request), and the shapes the mock library answers with (lib/mocks/transport.ts), so a
 * download reads the same in the preview, on the mocks in development and against the real server:
 *
 * - a HEAD, a 204 or 304, an empty body: undefined;
 * - a body the server says is a file (Content-Disposition `attachment`, or one with a file name), and any body of a
 *   type that is not text (a picture, a sound, a clip, a model or a font always is one, SVG and glTF too): a
 *   `TransportFile` (its name from Content-Disposition, else from the path; its bytes as a data URL);
 * - JSON (application/json, text/json, any `+json` such as problem+json): parsed, or the text when it is not JSON;
 * - text (text/*, XML, YAML, CSV, JavaScript, NDJSON, `+xml`, `+yaml`…): a string;
 * - no Content-Type: a string when the bytes are UTF-8 text, else a file.
 *
 * No DOM, no Node `Buffer` and no imports: the file is copied as it is into packages/api and packages/app-runtime and
 * runs in browsers, Node, Hermes and mini-program runtimes, which differ in what they have (btoa, TextDecoder), so
 * each is used where it exists and done by hand where it does not. */

/** a file in an answer: its name, its media type, its bytes as a data URL, and how many there are */
export type ResponseFile = { name: string; type: string; dataUrl: string; size: number };

/** an answer as the platform handed it over */
export type RawResponse = {
  /** the request's method: the answer to a HEAD has no body */
  method: string;
  /** the request's path (a query after it is ignored): where a file's name comes from when the answer gives none */
  path: string;
  status: number;
  /** the answer's headers (any case) */
  headers: Readonly<Record<string, string>>;
  bytes: Uint8Array;
};

/** a header's value, its name in any case */
export function headerOf(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) if (key.toLowerCase() === want) return headers[key];
  return undefined;
}

/** a media type without its parameters, in lower case: "Text/CSV; charset=utf-8" → "text/csv" */
export const bareMediaType = (type: string | undefined) => (type ?? "").split(";")[0].trim().toLowerCase();

/** a picture, a sound, a clip, a 3D model or a font is a file, whatever its syntax (image/svg+xml, model/gltf+json) */
const isMediaFile = (t: string) => /^(?:image|audio|video|model|font)\//.test(t);

/** JSON: application/json, text/json, and any other type with the +json suffix (application/problem+json) */
export function isJsonMediaType(type: string): boolean {
  const t = bareMediaType(type);
  return !isMediaFile(t) && (t === "application/json" || t === "text/json" || t.endsWith("+json"));
}

/** the types beside text/* whose bodies are text */
const TEXTUAL = new Set([
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/csv",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
  "application/x-ndjson",
  "application/ndjson",
  "application/jsonl",
  "application/x-jsonlines",
  "application/x-www-form-urlencoded",
  "application/graphql",
  "application/sql",
  "application/toml",
  "application/x-sh",
]);

/** text: text/*, the textual types beside it, and any other type with the +xml or +yaml suffix */
export function isTextMediaType(type: string): boolean {
  const t = bareMediaType(type);
  return !isMediaFile(t) && (t.startsWith("text/") || TEXTUAL.has(t) || t.endsWith("+xml") || t.endsWith("+yaml"));
}

/** the extensions of the types whose subtype is not one */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/tiff": "tif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/x-ndjson": "ndjson",
  "application/geo+json": "geojson",
  "application/gpx+xml": "gpx",
  "application/vnd.google-earth.kml+xml": "kml",
  "application/gzip": "gz",
  "application/x-7z-compressed": "7z",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/calendar": "ics",
  "text/vcard": "vcf",
  "text/tab-separated-values": "tsv",
  "text/javascript": "js",
  "audio/mpeg": "mp3",
  "audio/webm": "weba",
  "audio/mp4": "m4a",
  "video/quicktime": "mov",
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
};

/** the extension a file of a media type is saved with: application/pdf → pdf, image/jpeg → jpg; else "bin" */
export function extensionOfType(type: string): string {
  const t = bareMediaType(type);
  return EXTENSIONS[t] ?? /^(?:application|image|audio|video|model|text|font)\/(?:x-)?([a-z0-9]{1,5})$/.exec(t)?.[1] ?? "bin";
}

/** A file's name as a name and nothing more: the last piece of a path, without control characters or the
 *  characters file systems refuse, not "." or "..". Empty when nothing is left. */
function cleanName(name: string): string {
  let out = "";
  for (const ch of name.slice(Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\")) + 1)) {
    const c = ch.codePointAt(0)!;
    out += c < 0x20 || c === 0x7f || '<>:"|?*'.includes(ch) ? "_" : ch;
  }
  out = out.trim();
  return out === "." || out === ".." ? "" : out.slice(0, 200);
}

/** UTF-8 (or Latin-1) bytes written as %XX, as RFC 8187 has them, made text */
function percentDecoded(value: string, latin1: boolean): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "%" && /^[0-9a-fA-F]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else for (const b of utf8Bytes(value[i])) bytes.push(b);
  }
  return latin1 ? String.fromCharCode(...bytes) : utf8Text(Uint8Array.from(bytes));
}

/** a Content-Disposition's type and parameters (RFC 6266): `attachment; filename="a.pdf"` */
function parseDisposition(value: string): { type: string; params: Record<string, string> } {
  const at = value.indexOf(";");
  const type = (at < 0 ? value : value.slice(0, at)).trim().toLowerCase();
  const params: Record<string, string> = {};
  const re = /;\s*([!#$%&'*+.^_`|~0-9A-Za-z-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;
  for (const m of value.slice(Math.max(at, 0)).matchAll(re)) {
    const raw = m[2].trim();
    params[m[1].toLowerCase()] = raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw;
  }
  return { type, params };
}

/** the file name a Content-Disposition gives: `filename*` (UTF-8 or Latin-1, RFC 8187) before `filename` */
export function dispositionFileName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const { params } = parseDisposition(value);
  const star = /^(utf-8|iso-8859-1)'[^']*'(.*)$/i.exec(params["filename*"] ?? "");
  const name = cleanName(star ? percentDecoded(star[2], star[1].toLowerCase() === "iso-8859-1") : (params.filename ?? ""));
  return name || undefined;
}

/** whether a Content-Disposition says the body is a file to keep: an attachment, or one with a name */
export function isFileDisposition(value: string | undefined): boolean {
  if (!value) return false;
  const { type, params } = parseDisposition(value);
  return type === "attachment" || "filename" in params || "filename*" in params;
}

/** the name of a file an answer carries: Content-Disposition's, else the last piece of the path, with the type's
 *  extension when that piece has none: /orders/42/receipt as application/pdf → receipt.pdf */
export function responseFileName(headers: Readonly<Record<string, string>>, path: string, type: string): string {
  const given = dispositionFileName(headerOf(headers, "content-disposition"));
  if (given) return given;
  const last = path.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "";
  let piece = "";
  try {
    piece = cleanName(decodeURIComponent(last));
  } catch {
    piece = cleanName(last);
  }
  const base = piece || "file";
  return /\.[A-Za-z0-9]{1,8}$/.test(base) ? base : `${base}.${extensionOfType(type)}`;
}

/* ---------- bytes ---------- */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** bytes as base64: the platform's btoa where it has one, else by hand (a mini-program has none) */
export function bytesToBase64(bytes: Uint8Array): string {
  const btoa = (globalThis as { btoa?: (s: string) => string }).btoa;
  const parts: string[] = [];
  if (typeof btoa === "function") {
    for (let i = 0; i < bytes.length; i += 0x6000) parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 0x6000))));
    return parts.join("");
  }
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "="));
  }
  return parts.join("");
}

/** text as UTF-8 bytes */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

type Decoder = new (label?: string, o?: { fatal?: boolean }) => { decode(b: Uint8Array): string };

/** UTF-8 bytes as text, without a byte-order mark: the platform's TextDecoder where it has one (Hermes and some
 *  mini-program runtimes do not), else by hand. A byte that is not UTF-8 reads as U+FFFD. */
export function utf8Text(bytes: Uint8Array): string {
  const TextDecoder = (globalThis as { TextDecoder?: Decoder }).TextDecoder;
  if (typeof TextDecoder === "function") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      /* by hand, then */
    }
  }
  /* the WHATWG decoder's steps, so the text is the same either way: a sequence cut short is one U+FFFD */
  const parts: string[] = [];
  let need = 0;
  let seen = 0;
  let code = 0;
  let lower = 0x80;
  let upper = 0xbf;
  for (let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (need === 0) {
      if (b < 0x80) parts.push(String.fromCharCode(b));
      else if (b >= 0xc2 && b <= 0xdf) [need, code] = [1, b & 0x1f];
      else if (b >= 0xe0 && b <= 0xef) [need, code, lower, upper] = [2, b & 0xf, b === 0xe0 ? 0xa0 : 0x80, b === 0xed ? 0x9f : 0xbf];
      else if (b >= 0xf0 && b <= 0xf4) [need, code, lower, upper] = [3, b & 0x7, b === 0xf0 ? 0x90 : 0x80, b === 0xf4 ? 0x8f : 0xbf];
      else parts.push("\ufffd");
      continue;
    }
    if (b < lower || b > upper) {
      /* the sequence so far is one bad character; this byte starts again */
      [need, seen, lower, upper] = [0, 0, 0x80, 0xbf];
      parts.push("\ufffd");
      i--;
      continue;
    }
    [lower, upper, code, seen] = [0x80, 0xbf, (code << 6) | (b & 0x3f), seen + 1];
    if (seen === need) {
      parts.push(String.fromCodePoint(code));
      [need, seen] = [0, 0];
    }
  }
  if (need) parts.push("\ufffd");
  return parts.join("");
}

/** whether bytes are UTF-8 text (no NUL, nothing that is not UTF-8) */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  const TextDecoder = (globalThis as { TextDecoder?: Decoder }).TextDecoder;
  if (typeof TextDecoder === "function") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  return !utf8Text(bytes).includes("\ufffd");
}

/** the text of an answer read as its type says: JSON parsed (the text itself when it is not JSON), else the text */
export function textBody(text: string, type: string): unknown {
  if (text === "") return undefined;
  if (!isJsonMediaType(type)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** What an answer's body is, by the rule at the top of this file. */
export function readBody(r: RawResponse): unknown {
  if (r.method.toUpperCase() === "HEAD" || r.status === 204 || r.status === 304 || !r.bytes.length) return undefined;
  const type = bareMediaType(headerOf(r.headers, "content-type"));
  const file = isFileDisposition(headerOf(r.headers, "content-disposition")) || (type ? !isJsonMediaType(type) && !isTextMediaType(type) : !looksLikeText(r.bytes));
  if (file) {
    const t = type || "application/octet-stream";
    return { name: responseFileName(r.headers, r.path, t), type: t, dataUrl: `data:${t};base64,${bytesToBase64(r.bytes)}`, size: r.bytes.length } satisfies ResponseFile;
  }
  return textBody(utf8Text(r.bytes), type);
}
