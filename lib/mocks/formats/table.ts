/* The file formats the mock library knows, as data: each one's media type, extension, family and the other names it
 * goes by. Light on purpose: the editor's own bundle reads this (a file's kind, its extension, a download's headers)
 * while what makes the files (lib/mocks/formats/index.ts) loads with the rest of the engine. */

/** what a file is, broadly: what a field of the kind takes and how the editor previews it */
export type FileFamily = "image" | "pdf" | "audio" | "video" | "document" | "spreadsheet" | "presentation" | "data" | "text" | "archive" | "model" | "file";

export type FileFormat = {
  /** the media type the file is served as */
  type: string;
  /** the extension it is saved with */
  ext: string;
  family: FileFamily;
  /** other media types and extensions that name it */
  also?: string[];
  exts?: string[];
  /** whether its bytes are UTF-8 text */
  text?: boolean;
};

const OOXML = "application/vnd.openxmlformats-officedocument";

export const FORMATS: readonly FileFormat[] = [
  { type: "image/png", ext: "png", family: "image" },
  { type: "image/jpeg", ext: "jpg", family: "image", also: ["image/jpg", "image/pjpeg"], exts: ["jpeg", "jpe", "jfif"] },
  { type: "image/webp", ext: "webp", family: "image" },
  { type: "image/gif", ext: "gif", family: "image" },
  { type: "image/svg+xml", ext: "svg", family: "image", text: true },
  { type: "image/bmp", ext: "bmp", family: "image", also: ["image/x-ms-bmp", "image/x-bmp"] },
  { type: "image/x-icon", ext: "ico", family: "image", also: ["image/vnd.microsoft.icon", "image/ico"] },
  { type: "image/tiff", ext: "tif", family: "image", exts: ["tiff"] },
  { type: "image/avif", ext: "avif", family: "image" },
  { type: "application/pdf", ext: "pdf", family: "pdf" },
  { type: `${OOXML}.wordprocessingml.document`, ext: "docx", family: "document" },
  { type: "application/rtf", ext: "rtf", family: "document", also: ["text/rtf"], text: true },
  { type: `${OOXML}.spreadsheetml.sheet`, ext: "xlsx", family: "spreadsheet" },
  { type: "text/csv", ext: "csv", family: "spreadsheet", also: ["application/csv"], text: true },
  { type: "text/tab-separated-values", ext: "tsv", family: "spreadsheet", text: true },
  { type: `${OOXML}.presentationml.presentation`, ext: "pptx", family: "presentation" },
  { type: "application/json", ext: "json", family: "data", also: ["text/json"], text: true },
  { type: "application/x-ndjson", ext: "ndjson", family: "data", also: ["application/ndjson", "application/jsonl", "application/jsonlines", "application/x-jsonlines"], exts: ["jsonl"], text: true },
  { type: "application/xml", ext: "xml", family: "data", also: ["text/xml"], text: true },
  { type: "application/yaml", ext: "yaml", family: "data", also: ["text/yaml", "application/x-yaml", "text/x-yaml"], exts: ["yml"], text: true },
  { type: "application/geo+json", ext: "geojson", family: "data", text: true },
  { type: "application/gpx+xml", ext: "gpx", family: "data", text: true },
  { type: "application/vnd.google-earth.kml+xml", ext: "kml", family: "data", text: true },
  { type: "text/calendar", ext: "ics", family: "data", exts: ["ical", "ifb"], text: true },
  { type: "text/vcard", ext: "vcf", family: "data", also: ["text/x-vcard", "text/directory"], exts: ["vcard"], text: true },
  { type: "text/plain", ext: "txt", family: "text", exts: ["text", "log"], text: true },
  { type: "text/markdown", ext: "md", family: "text", also: ["text/x-markdown"], exts: ["markdown"], text: true },
  { type: "text/html", ext: "html", family: "text", exts: ["htm"], text: true },
  { type: "application/zip", ext: "zip", family: "archive", also: ["application/x-zip-compressed", "application/x-zip"] },
  { type: "application/gzip", ext: "gz", family: "archive", also: ["application/x-gzip"], exts: ["gzip"] },
  { type: "application/x-tar", ext: "tar", family: "archive" },
  { type: "audio/wav", ext: "wav", family: "audio", also: ["audio/x-wav", "audio/wave", "audio/vnd.wave"] },
  { type: "audio/mpeg", ext: "mp3", family: "audio", also: ["audio/mp3", "audio/mpeg3"] },
  { type: "audio/ogg", ext: "ogg", family: "audio", also: ["audio/opus", "application/ogg"], exts: ["oga", "opus"] },
  { type: "audio/webm", ext: "weba", family: "audio" },
  { type: "audio/mp4", ext: "m4a", family: "audio", also: ["audio/x-m4a", "audio/aac", "audio/m4a"], exts: ["aac"] },
  { type: "video/mp4", ext: "mp4", family: "video", also: ["application/mp4", "video/x-m4v"], exts: ["m4v"] },
  { type: "video/webm", ext: "webm", family: "video" },
  { type: "model/gltf-binary", ext: "glb", family: "model" },
  { type: "model/gltf+json", ext: "gltf", family: "model", text: true },
  { type: "model/obj", ext: "obj", family: "model", also: ["application/x-tgif", "text/x-obj"], text: true },
  { type: "model/stl", ext: "stl", family: "model", also: ["application/sla", "application/vnd.ms-pki.stl", "model/x.stl-binary", "application/x-stl"] },
  { type: "model/x-ply", ext: "ply", family: "model", also: ["application/x-ply", "model/ply"], text: true },
  { type: "application/octet-stream", ext: "bin", family: "file" },
];

const BY_TYPE = new Map<string, FileFormat>();
const BY_EXT = new Map<string, FileFormat>();
for (const f of FORMATS) {
  for (const t of [f.type, ...(f.also ?? [])]) BY_TYPE.set(t, f);
  for (const e of [f.ext, ...(f.exts ?? [])]) BY_EXT.set(e, f);
}

/** a media type without its parameters, in lowercase: "Text/CSV; charset=utf-8" → "text/csv" */
export const bareType = (type: string) => type.split(";")[0].trim().toLowerCase();

/** the extension of a file name, in lowercase, without the dot ("" when it has none) */
export const extOfName = (name: string) => /\.([A-Za-z0-9]{1,8})$/.exec(name.trim())?.[1].toLowerCase() ?? "";

/** The format of a media type, an extension or a file name ("csv", ".csv", "report.xlsx", "model/gltf-binary"), when
 *  the library makes it. */
export function formatOf(what: string | undefined): FileFormat | undefined {
  if (!what) return undefined;
  const w = what.trim();
  if (w.includes("/")) return BY_TYPE.get(bareType(w));
  return BY_EXT.get(w.toLowerCase()) ?? BY_EXT.get(w.replace(/^.*\./, "").toLowerCase());
}

/** The format closest to a media type the library does not make: another of its family (image/heic → PNG,
 *  video/quicktime → MP4, model/fbx → glTF, application/vnd.foo+json → JSON), else plain bytes. */
export function nearestFormat(type: string | undefined): FileFormat {
  const t = bareType(type ?? "");
  const own = formatOf(t);
  if (own) return own;
  const top = t.split("/")[0];
  const near = t.endsWith("+json") ? "application/json" : t.endsWith("+xml") ? "application/xml" : t.endsWith("+zip") ? "application/zip" : ({ image: "image/png", audio: "audio/wav", video: "video/mp4", model: "model/gltf-binary", text: "text/plain" } as Record<string, string>)[top];
  return formatOf(near) ?? BY_TYPE.get("application/octet-stream")!;
}
