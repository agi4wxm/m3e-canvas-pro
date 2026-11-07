/* Files for the mock library when it has none of the right kind: an SVG picture (a gradient with the record's title,
 * or a face's initials for an avatar), a one-page PDF with the title, a short tone as WAV, a short clip as MP4 with an
 * SVG poster, and a few bytes for any other file. Made from a seed, so the same record gets the same file; small, so a
 * list of a thousand avatars costs little. Everything is bytes made here: no canvas, no network. */

import { dataUrl, utf8 } from "./bytes";
import { hash53, rngOf } from "./rng";
import type { MockFile } from "./types";

/** the kinds of file the library holds, by what the field wants */
export type FileKind = "image" | "avatar" | "pdf" | "audio" | "video" | "file";

/** the kind of a file by its media type */
export function kindOfType(type: string): Exclude<FileKind, "avatar"> {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  return "file";
}

/** the extension a media type is saved with */
export function extensionOf(type: string): string {
  const known: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/webm": "weba",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogv",
    "video/quicktime": "mov",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/json": "json",
    "application/zip": "zip",
  };
  return known[type] ?? "bin";
}

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

/** two colors that go together, from a seed */
function colorsOf(seed: string): [string, string] {
  const h = hash53(seed) % 360;
  return [`hsl(${h} 62% 58%)`, `hsl(${(h + 48) % 360} 68% 42%)`];
}

/** the first letters of a name: two for a Latin name, one character otherwise */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const latin = /^[A-Za-z]/.test(words[0]);
  if (latin) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  /* a Chinese, Japanese or Korean name: its first character, the family name */
  return [...words[0]][0];
}

/** an SVG picture: a gradient with soft shapes and a title, or (avatar) a face's initials on a circle */
export function svgPicture(o: { seed: string; title?: string; avatar?: boolean; w?: number; h?: number }): string {
  const [a, b] = colorsOf(o.seed);
  const rng = rngOf(`svg:${o.seed}`);
  if (o.avatar) {
    const s = 128;
    const text = xml(initialsOf(o.title ?? "?"));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${s}" height="${s}" rx="${s / 2}" fill="url(#g)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${text.length > 1 ? 48 : 56}" font-weight="600" fill="#fff">${text}</text></svg>`;
  }
  const w = o.w ?? 640;
  const h = o.h ?? 480;
  const circles = Array.from({ length: 3 }, () => `<circle cx="${rng.int(0, w)}" cy="${rng.int(0, h)}" r="${rng.int(Math.round(h / 6), Math.round(h / 2))}" fill="#fff" fill-opacity="${(0.08 + rng.next() * 0.14).toFixed(2)}"/>`).join("");
  const title = o.title ? `<text x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.9)}" font-family="system-ui, sans-serif" font-size="${Math.round(h / 12)}" font-weight="600" fill="#fff">${xml([...o.title].slice(0, 40).join(""))}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${circles}${title}</svg>`;
}

/** the PDF string of a text: only printable ASCII, escaped */
const pdfText = (s: string) => s.replace(/[^\x20-\x7e]/g, "").replace(/[\\()]/g, (c) => `\\${c}`);
/** text as a PDF text string in UTF-16BE (any language, for the document's title) */
function pdfUtf16(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** A one-page PDF: a colored band, the title (in Latin letters on the page; in any language as the document's own
 *  title), and grey lines where the text would be. Valid: every object's offset is where the table says. */
export function pdfDocument(o: { seed: string; title?: string }): Uint8Array {
  const title = (o.title ?? "Document").slice(0, 120);
  const onPage = pdfText(title).trim() || "Document";
  const rng = rngOf(`pdf:${o.seed}`);
  const hue = hash53(o.seed) % 360;
  /* hsl to rgb, for the band */
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const l = 0.5;
    const s = 0.55;
    return (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))).toFixed(3);
  };
  const lines = Array.from({ length: 14 }, (_, i) => `0.85 0.85 0.85 rg 72 ${640 - i * 26} ${rng.int(260, 450)} 9 re f`).join("\n");
  const content = `${f(0)} ${f(8)} ${f(4)} rg 0 742 595 100 re f\nBT /F1 26 Tf 1 1 1 rg 72 780 Td (${onPage.slice(0, 40)}) Tj ET\nBT /F1 11 Tf 0.4 0.4 0.4 rg 72 700 Td (Mock document for the design preview) Tj ET\n${lines}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Title ${pdfUtf16(title)} /Producer (M3E Canvas Pro mocks) >>`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  /* every character above is ASCII, so its UTF-8 bytes are its offsets */
  return utf8(out);
}

/** A short tone as a WAV file (8 kHz, 8-bit, mono): a note of a pentatonic scale chosen by the seed, faded in and out. */
export function wavTone(o: { seed: string; ms?: number }): Uint8Array {
  const rate = 8000;
  const n = Math.round((rate * Math.min(5000, Math.max(100, o.ms ?? 900))) / 1000);
  const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  const freq = notes[hash53(o.seed) % notes.length];
  const out = new Uint8Array(44 + n);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + n, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, n, true);
  const fade = Math.min(400, n / 4);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - i) / fade);
    out[44 + i] = Math.round(128 + 90 * env * Math.sin((2 * Math.PI * freq * i) / rate));
  }
  return out;
}

/** a two-second clip (96×54, H.264 baseline, a moving gradient): the same for every video, which is all a
 *  placeholder needs; made once with ffmpeg and kept here as base64 */
export const CLIP_MP4 =
  "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";

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

/** words as a file's name: no separators, nothing a file system refuses */
export const fileBase = (s: string) =>
  [...s.replace(/[\s/\\:*?"<>|#%&{}$!'`@+=,;~^[\]()]+/g, "-").replace(/^[-.]+|[-.]+$/g, "")].slice(0, 40).join("");

/** A placeholder of a kind, as a mock file: an SVG picture or avatar, a PDF, a WAV tone, an MP4 clip, or bytes. */
export function placeholderFile(kind: FileKind, o: { seed: string; title?: string; id?: string }): MockFile {
  const title = o.title ?? "";
  const id = o.id ?? `ph-${kind}-${hash53(o.seed).toString(36).slice(0, 8)}`;
  const base = fileBase(title || kind) || kind;
  switch (kind) {
    case "image":
    case "avatar":
      return { id, name: `${base}.svg`, type: "image/svg+xml", data: dataUrl("image/svg+xml", utf8(svgPicture({ seed: o.seed, title, avatar: kind === "avatar" }))), tags: [kind] };
    case "pdf":
      return { id, name: `${base}.pdf`, type: "application/pdf", data: dataUrl("application/pdf", pdfDocument({ seed: o.seed, title })), tags: ["document"] };
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

/** whether a file of the library is of the kind a field wants */
export function fileFits(file: MockFile, kind: FileKind): boolean {
  const k = kindOfType(file.type);
  if (kind === "avatar") return k === "image" && (!file.tags?.length || file.tags.includes("avatar") || !file.tags.some((t) => t === "product" || t === "image"));
  if (kind === "file") return k === "pdf" || k === "file";
  return k === kind;
}
