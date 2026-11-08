/* What makes every kind of file the mock library knows (lib/mocks/formats/table.ts): pictures (PNG, JPEG, WebP, GIF,
 * SVG, BMP, ICO, TIFF, AVIF), PDF, Office (XLSX, DOCX, PPTX), tables and data (CSV, TSV, JSON, NDJSON, XML, YAML,
 * GeoJSON, GPX, KML, iCalendar, vCard), text (plain, Markdown, HTML, RTF), archives (ZIP, gzip, tar), sound and video
 * (WAV, MP3, Ogg, WebM, M4A, MP4) and 3D models (glTF binary and JSON, OBJ, STL, PLY). Each file is real and opens in
 * what reads its type, is made from a seed (the same seed, the same bytes) and, where that makes sense, from the
 * record it belongs to or the rows of a list. Pure TypeScript bytes: no DOM, no Node, no fetch. Loaded with the
 * engine (the generator, the transport), never with the editor's first bundle. */

import { dataUrl, fromBase64, utf8 } from "../bytes";
import { binaryBlob, fileBase, fileNameFor, KIND_TYPE, placeholderFile as basicPlaceholder, typeOfName, type FileKind } from "../files";
import { hash53 } from "../rng";
import type { MockFile } from "../types";
import { titleOf, type FileContent } from "./content";
import { gzip } from "./deflate";
import { encodeBmp, encodeGif, encodeIco, encodeJpeg, encodePng, encodeTiff, encodeWebp } from "./codecs";
import { CLIP_WEBM, STILL_AVIF, TONE_M4A, TONE_MP3, TONE_OGG, TONE_WEBA } from "./clips";
import { CLIP_MP4, wavTone } from "./media";
import { glbOf, gltfOf, meshOf, objOf, plyOf, stlOf } from "./mesh";
import { docxOf, pptxOf, xlsxOf } from "./office";
import { pdfDocument } from "./pdf";
import { paintPicture } from "./raster";
import { svgPicture } from "./svg";
import { formatOf, nearestFormat, type FileFormat } from "./table";
import { csvOf, geojsonOf, gpxOf, htmlOf, icsOf, jsonOf, kmlOf, markdownOf, ndjsonOf, rtfOf, tsvOf, txtOf, vcfOf, xmlOf, yamlOf } from "./text";
import { tar, zip } from "./zip";

export type { FileContent } from "./content";

/** what a file is made from: its content, and for a picture whether it is an avatar */
export type MakeInput = FileContent & { avatar?: boolean };
type Maker = (c: MakeInput) => Uint8Array | string;

const sized = (c: MakeInput, n: number) => Math.max(16, Math.round(n * Math.sqrt(Math.min(1, c.scale ?? 1))));
const titled = (c: MakeInput) => c.title ?? (c.record ? titleOf(c) : undefined);
const picture = (c: MakeInput, w: number, h: number) => (c.avatar ? paintPicture({ seed: c.seed, title: titled(c), avatar: true, w: sized(c, 128) }) : paintPicture({ seed: c.seed, title: titled(c), w: sized(c, w), h: sized(c, h) }));
const clip = (b64: string) => () => fromBase64(b64);
const model = (c: MakeInput) => meshOf(c.seed, titleOf(c), c.scale ?? 1);

/** what an archive holds: the content as JSON and CSV, a picture and a note, in a folder named after it */
function archiveEntries(c: MakeInput) {
  const base = fileBase(titleOf(c)) || "data";
  return [
    { name: `${base}/README.txt`, data: `${titleOf(c)}\n\nMock archive for the design preview: the data as JSON and CSV, and a picture.\n` },
    { name: `${base}/data.json`, data: jsonOf(c) },
    { name: `${base}/data.csv`, data: csvOf(c) },
    { name: `${base}/picture.png`, data: encodePng(picture({ ...c, avatar: false }, 160, 120)) },
  ];
}

/** the maker of each format, by its media type */
const MAKERS: Record<string, Maker> = {
  "image/png": (c) => encodePng(picture(c, 320, 240), titled(c)),
  "image/jpeg": (c) => encodeJpeg(picture(c, 480, 360), { comment: titled(c) }),
  "image/webp": (c) => encodeWebp(picture(c, 320, 240)),
  "image/gif": (c) => encodeGif(picture(c, 320, 240), titled(c)),
  "image/svg+xml": (c) => svgPicture({ seed: c.seed, title: titled(c), avatar: c.avatar, w: sized(c, 640), h: sized(c, 480) }),
  "image/bmp": (c) => encodeBmp(picture(c, 160, 120)),
  "image/x-icon": (c) => encodeIco(paintPicture({ seed: c.seed, title: titled(c), avatar: true, w: 64 })),
  "image/tiff": (c) => encodeTiff(picture(c, 160, 120), titled(c)),
  "image/avif": clip(STILL_AVIF),
  "application/pdf": (c) => pdfDocument(c),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": docxOf,
  "application/rtf": rtfOf,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": xlsxOf,
  "text/csv": csvOf,
  "text/tab-separated-values": tsvOf,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": pptxOf,
  "application/json": jsonOf,
  "application/x-ndjson": ndjsonOf,
  "application/xml": xmlOf,
  "application/yaml": yamlOf,
  "application/geo+json": geojsonOf,
  "application/gpx+xml": gpxOf,
  "application/vnd.google-earth.kml+xml": kmlOf,
  "text/calendar": icsOf,
  "text/vcard": vcfOf,
  "text/plain": txtOf,
  "text/markdown": markdownOf,
  "text/html": htmlOf,
  "application/zip": (c) => zip(archiveEntries(c)),
  "application/gzip": (c) => gzip(utf8(jsonOf(c)), `${fileBase(titleOf(c)) || "data"}.json`),
  "application/x-tar": (c) => tar(archiveEntries(c)),
  "audio/wav": (c) => wavTone({ seed: c.seed }),
  "audio/mpeg": clip(TONE_MP3),
  "audio/ogg": clip(TONE_OGG),
  "audio/webm": clip(TONE_WEBA),
  "audio/mp4": clip(TONE_M4A),
  "video/mp4": clip(CLIP_MP4),
  "video/webm": clip(CLIP_WEBM),
  "model/gltf-binary": (c) => glbOf(model(c)),
  "model/gltf+json": (c) => gltfOf(model(c)),
  "model/obj": (c) => objOf(model(c)),
  "model/stl": (c) => stlOf(model(c)),
  "model/x-ply": (c) => plyOf(model(c)),
  "application/octet-stream": (c) => binaryBlob({ seed: c.seed, title: c.title }),
};

/** the steps a file is made smaller by, until it fits the bytes it may take */
const SCALES = [1, 0.5, 0.25, 0.12, 0.06, 0.02];

/** A file of a format: its bytes, as small as needed to fit `maxBytes` (the smallest it can be when nothing fits). */
export function makeBytes(format: FileFormat, c: MakeInput, maxBytes?: number): Uint8Array {
  const make = MAKERS[format.type] ?? MAKERS["application/octet-stream"];
  let out: Uint8Array | undefined;
  for (const scale of SCALES) {
    const made = make({ ...c, scale: (c.scale ?? 1) * scale });
    out = typeof made === "string" ? utf8(made) : made;
    if (maxBytes === undefined || out.length <= maxBytes) break;
  }
  return out!;
}

/** A mock file of a media type, an extension or a file name ("text/csv", "xlsx", "scan.png"): the format itself when
 *  the library makes it, else the nearest of its family (image/heic → a PNG), made from the content and no larger
 *  than `maxBytes` allows when it can be made that small. Its `type` is what it really is. */
export function mockFile(what: string, o: MakeInput & { id?: string; name?: string; maxBytes?: number; tags?: string[] }): MockFile {
  const byName = what.includes("/") ? undefined : typeOfName(what);
  const format = formatOf(what) ?? nearestFormat(what.includes("/") ? what : byName);
  const bytes = makeBytes(format, o, o.maxBytes);
  const name = fileNameFor(format, { name: o.name ?? (byName ? what : undefined), title: o.title });
  return { id: o.id ?? `ph-${format.ext}-${hash53(o.seed).toString(36).slice(0, 8)}`, name, type: format.type, data: dataUrl(format.type, bytes), tags: o.tags ?? [format.family] };
}

/** A placeholder of any kind: the basic ones as lib/mocks/files.ts makes them (an SVG picture or avatar, a PDF, a WAV
 *  tone, an MP4 clip, bytes), the others in their kind's usual format (DOCX, XLSX, PPTX, JSON, text, ZIP, GLB). */
export function placeholderFile(kind: FileKind, o: { seed: string; title?: string; id?: string; record?: Record<string, unknown>; rows?: readonly Record<string, unknown>[] }): MockFile {
  if (kind === "image" || kind === "avatar" || kind === "pdf" || kind === "audio" || kind === "video" || kind === "file") return basicPlaceholder(kind, o);
  const id = o.id ?? `ph-${kind}-${hash53(o.seed).toString(36).slice(0, 8)}`;
  const base = fileBase(o.title || kind) || kind;
  return mockFile(KIND_TYPE[kind], { seed: o.seed, title: o.title || undefined, record: o.record, rows: o.rows, id, name: `${base}.${formatOf(KIND_TYPE[kind])!.ext}`, tags: [kind] });
}
