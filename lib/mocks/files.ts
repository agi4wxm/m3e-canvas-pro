/* Files for the mock library: what kind of file a media type is, the extension and the headers it goes with, and the
 * placeholders a field or an endpoint gets when the library has no file of the right kind. A picture is the SVG
 * placeholder (a gradient with the record's title, or a face's initials for an avatar); one that names a format (an
 * OpenAPI media type, a schema's contentMediaType, a hint's type, a file name's extension) gets a real file of that
 * format, made from the record it belongs to (lib/mocks/formats: PNG, JPEG, PDF, XLSX, DOCX, CSV, ZIP, GLB…). Made
 * from a seed, so the same record gets the same file. Everything is bytes made here: no canvas, no network.
 *
 * Light on purpose: the editor's own bundle reads this; what makes the other formats loads with the engine. */

import { dataUrl, utf8 } from "./bytes";
import { CLIP_MP4, wavTone } from "./formats/media";
import { pdfDocument } from "./formats/pdf";
import { initialsOf, svgPicture } from "./formats/svg";
import { bareType, extOfName, formatOf, FORMATS, nearestFormat, type FileFamily, type FileFormat } from "./formats/table";
import { hash53, rngOf } from "./rng";
import type { MockFile } from "./types";

export { bareType, extOfName, formatOf, FORMATS, nearestFormat, CLIP_MP4, initialsOf, pdfDocument, svgPicture, wavTone, type FileFamily, type FileFormat };

/** the kinds of file the library holds, by what a field wants: a picture, an avatar, or a file of a family */
export const FILE_KINDS = ["image", "avatar", "pdf", "audio", "video", "document", "spreadsheet", "presentation", "data", "text", "archive", "model", "file"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** the format a kind's placeholder is made in */
export const KIND_TYPE: Record<FileKind, string> = {
  image: "image/svg+xml",
  avatar: "image/svg+xml",
  pdf: "application/pdf",
  audio: "audio/wav",
  video: "video/mp4",
  document: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  spreadsheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  presentation: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  data: "application/json",
  text: "text/plain",
  archive: "application/zip",
  model: "model/gltf-binary",
  file: "application/octet-stream",
};

/** the kind of a file by its media type */
export function kindOfType(type: string): Exclude<FileKind, "avatar"> {
  const t = bareType(type);
  const known = formatOf(t)?.family;
  if (known) return known;
  const top = t.split("/")[0];
  return top === "image" || top === "audio" || top === "video" || top === "model" || top === "text" ? top : "file";
}

/** the extension a media type is saved with */
export function extensionOf(type: string): string {
  const t = bareType(type);
  return formatOf(t)?.ext ?? ({ "video/ogg": "ogv", "video/quicktime": "mov", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[t] ?? "bin";
}

/** the media type of a file name, by its extension; undefined when the library does not know it */
export const typeOfName = (name: string): string | undefined => {
  const ext = extOfName(name);
  return ext ? formatOf(ext)?.type : undefined;
};

/** whether a media type is UTF-8 text (an answer carries `charset=utf-8` with it) */
export const isTextType = (type: string) => {
  const t = bareType(type);
  return !!formatOf(t)?.text || t.startsWith("text/") || /[+/](json|xml|yaml)$/.test(t);
};

/** a Content-Type header for a media type: text gets its charset */
export const contentTypeOf = (type: string) => (isTextType(type) && !/charset=/i.test(type) ? `${bareType(type)}; charset=utf-8` : type);

/** A Content-Disposition header (RFC 6266): the name in plain ASCII, and in UTF-8 for any language (RFC 8187). */
export function contentDisposition(name: string, inline = false): string {
  const ascii = [...name].map((c) => (c >= " " && c <= "~" && c !== '"' && c !== "\\" ? c : "_")).join("") || "file";
  const exact = [...utf8(name)].map((b) => (/[A-Za-z0-9!#$&+.^_`|~-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, "0")}`)).join("");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"${ascii === name ? "" : `; filename*=UTF-8''${exact}`}`;
}

/** words as a file's name: no separators, nothing a file system refuses */
export const fileBase = (s: string) =>
  [...s.replace(/[\s/\\:*?"<>|#%&{}$!'`@+=,;~^[\]()]+/g, "-").replace(/^[-.]+|[-.]+$/g, "")].slice(0, 40).join("");

/** a file's name: the one asked for when its extension is the format's, else the title with the format's extension */
export function fileNameFor(format: FileFormat, o: { name?: string; title?: string }): string {
  const asked = o.name?.trim();
  if (asked) {
    const ext = extOfName(asked);
    if (ext && formatOf(ext) === format) return asked.replace(/[\\/]/g, "-");
    return `${fileBase(ext ? asked.slice(0, -ext.length - 1) : asked) || "file"}.${format.ext}`;
  }
  return `${fileBase(o.title || format.family) || format.family}.${format.ext}`;
}

/** a few bytes that are plainly a placeholder: a line of text, then bytes from the seed */
export function binaryBlob(o: { seed: string; title?: string; size?: number }): Uint8Array {
  const head = utf8(`M3E mock file: ${o.title ?? o.seed}\n`);
  const size = Math.max(head.length, Math.min(4096, o.size ?? 256));
  const out = new Uint8Array(size);
  out.set(head.subarray(0, size));
  const rng = rngOf(`bin:${o.seed}`);
  for (let i = head.length; i < size; i++) out[i] = Math.floor(rng.next() * 256);
  return out;
}

/** the kinds whose placeholder is made here; the others' are made with the engine (lib/mocks/formats placeholderFile) */
export type BasicKind = "image" | "avatar" | "pdf" | "audio" | "video" | "file";

/** A placeholder of a basic kind, as a mock file: an SVG picture or avatar, a PDF of the record (or of a few
 *  paragraphs), a WAV tone, an MP4 clip, or bytes. */
export function placeholderFile(kind: BasicKind, o: { seed: string; title?: string; id?: string; record?: Record<string, unknown>; rows?: readonly Record<string, unknown>[] }): MockFile {
  const title = o.title ?? "";
  const id = o.id ?? `ph-${kind}-${hash53(o.seed).toString(36).slice(0, 8)}`;
  const base = fileBase(title || kind) || kind;
  switch (kind) {
    case "image":
    case "avatar":
      return { id, name: `${base}.svg`, type: "image/svg+xml", data: dataUrl("image/svg+xml", utf8(svgPicture({ seed: o.seed, title, avatar: kind === "avatar" }))), tags: [kind] };
    case "pdf":
      return { id, name: `${base}.pdf`, type: "application/pdf", data: dataUrl("application/pdf", pdfDocument({ seed: o.seed, title, record: o.record, rows: o.rows })), tags: ["document"] };
    case "audio":
      return { id, name: `${base}.wav`, type: "audio/wav", data: dataUrl("audio/wav", wavTone({ seed: o.seed })), tags: ["audio"] };
    case "video":
      return { id, name: `${base}.mp4`, type: "video/mp4", data: `data:video/mp4;base64,${CLIP_MP4}`, tags: ["video"] };
    default:
      return { id, name: `${base}.bin`, type: "application/octet-stream", data: dataUrl("application/octet-stream", binaryBlob({ seed: o.seed, title })), tags: ["file"] };
  }
}

/** the poster of a video: an SVG picture with its title */
export const posterOf = (seed: string, title?: string) => dataUrl("image/svg+xml", utf8(svgPicture({ seed: `poster:${seed}`, title, w: 640, h: 360 })));

/** whether a file of the library is of the kind a field wants (and of the media type it names, when it names one) */
export function fileFits(file: MockFile, kind: FileKind, type?: string): boolean {
  if (type) {
    const want = formatOf(type);
    return want ? formatOf(file.type) === want : bareType(file.type) === bareType(type);
  }
  const k = kindOfType(file.type);
  if (kind === "avatar") return k === "image" && (!file.tags?.length || file.tags.includes("avatar") || !file.tags.some((t) => t === "product" || t === "image"));
  if (kind === "file") return k !== "image" && k !== "audio" && k !== "video";
  return k === kind;
}
