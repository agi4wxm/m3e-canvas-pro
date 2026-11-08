/* A PDF of a record or a list, of as many A4 pages as it needs (two at least): a colored band with the title, the
 * record's fields, a table of the rows with its head on every page, paragraphs, and a footer with page numbers. The
 * standard Helvetica in WinAnsi encoding, so the page shows Latin text (letters outside it are left out of the page);
 * the title in any language is the document's own (/Title, in UTF-16). Valid: every object's offset is where the
 * cross-reference table says. */

import { utf8 } from "../bytes";
import { hash53 } from "../rng";
import { fieldsOf, hslRgb, paragraphsOf, tableOf, textOf, titleOf, type FileContent, type Table } from "./content";

/** the WinAnsi code of a character, or undefined for one the encoding has not */
const WIN_ANSI_EXTRA: Record<string, number> = { "€": 0x80, "‚": 0x82, ƒ: 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, ˆ: 0x88, "‰": 0x89, Š: 0x8a, "‹": 0x8b, Œ: 0x8c, Ž: 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, š: 0x9a, "›": 0x9b, œ: 0x9c, ž: 0x9e, Ÿ: 0x9f };
function winAnsi(ch: string): number | undefined {
  const c = ch.codePointAt(0)!;
  if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) return c;
  return WIN_ANSI_EXTRA[ch];
}

/** the part of a text the page can show */
export const onPage = (s: string) => [...s.replace(/\s+/g, " ")].filter((c) => winAnsi(c) !== undefined).join("").trim();

/** a PDF string of a text: literal when it is plain ASCII, else the WinAnsi bytes in hex */
function pdfString(s: string): string {
  const chars = [...s];
  if (chars.every((c) => c >= " " && c <= "~")) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  return `<${chars.map((c) => (winAnsi(c) ?? 0x20).toString(16).padStart(2, "0")).join("")}>`;
}

/** text as a PDF text string in UTF-16BE (any language, for the document's title) */
function pdfUtf16(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** about how wide a text is in Helvetica, in points */
function widthOf(s: string, size: number): number {
  let w = 0;
  for (const c of s) w += /[ijlt.,'!|:;I ]/.test(c) ? 0.28 : /[fr()-]/.test(c) ? 0.34 : /[mwMW]/.test(c) ? 0.85 : /[A-Z]/.test(c) ? 0.68 : /\d/.test(c) ? 0.56 : 0.52;
  return w * size;
}

/** a text cut to a width, with an ellipsis when it was cut */
function fit(s: string, size: number, width: number): string {
  if (widthOf(s, size) <= width) return s;
  let out = "";
  for (const c of s) {
    if (widthOf(`${out}${c}…`, size) > width) break;
    out += c;
  }
  return `${out}…`;
}

/** a text broken into lines of a width */
function wrap(s: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (widthOf(next, size) <= width || !line) line = widthOf(next, size) <= width ? next : fit(next, size, width);
    else {
      lines.push(line);
      line = fit(word, size, width);
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const W = 595;
const H = 842;
const M = 56;

/** The PDF of a record, a list or (with neither) a few paragraphs, the record's title on top. */
export function pdfDocument(o: FileContent & { subtitle?: string; minPages?: number }): Uint8Array {
  const title = titleOf(o).slice(0, 120);
  const shown = onPage(title) || "Document";
  const hue = hash53(o.seed) % 360;
  const [r, g, b] = hslRgb(hue, 0.55, 0.5).map((v) => (v / 255).toFixed(3));
  const pages: string[][] = [[]];
  let y = 0;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push([]);
    y = H - M;
  };
  const room = (h: number) => {
    if (y - h < M + 24) newPage();
  };
  const text = (s: string, x: number, at: number, size: number, bold = false, gray = 0.15) => page().push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${gray} ${gray} ${gray} rg ${x} ${at} Td ${pdfString(s)} Tj ET`);
  /* the band and the title */
  page().push(`${r} ${g} ${b} rg 0 ${H - 100} ${W} 100 re f`);
  page().push(`BT /F2 26 Tf 1 1 1 rg ${M} ${H - 62} Td ${pdfString(fit(shown, 26, W - 2 * M))} Tj ET`);
  text(onPage(o.subtitle ?? "") || "Mock document for the design preview", M, H - 130, 11, false, 0.4);
  y = H - 160;
  const scale = Math.min(1, o.scale ?? 1);
  /* the record's fields, a label and its value */
  const fields = o.record ? fieldsOf(o) : [];
  for (const [label, value] of fields.slice(0, Math.max(4, Math.round(60 * scale)))) {
    const lines = wrap(onPage(value) || (value ? "—" : ""), 10, W - 2 * M - 150).slice(0, 6);
    room(lines.length * 14 + 4);
    text(fit(onPage(label) || "—", 9, 140), M, y, 9, true, 0.35);
    lines.forEach((l, i) => text(l, M + 150, y - i * 14, 10));
    y -= lines.length * 14 + 6;
  }
  /* a table of the rows, its head again on each page */
  const table: Table | undefined = o.rows?.length ? tableOf(o.rows.slice(0, Math.max(1, Math.round(o.rows.length * scale))), 500) : undefined;
  if (table && table.columns.length) {
    const cols = table.columns.slice(0, 6);
    const cw = (W - 2 * M) / cols.length;
    const head = () => {
      room(40);
      page().push(`0.93 0.93 0.93 rg ${M} ${y - 6} ${W - 2 * M} 20 re f`);
      cols.forEach((c, i) => text(fit(onPage(c) || "—", 9, cw - 8), M + 4 + i * cw, y, 9, true, 0.25));
      y -= 20;
    };
    y -= 10;
    head();
    table.rows.forEach((row, n) => {
      if (y - 18 < M + 24) {
        newPage();
        head();
      }
      if (n % 2) page().push(`0.97 0.97 0.97 rg ${M} ${y - 6} ${W - 2 * M} 18 re f`);
      cols.forEach((_, i) => text(fit(onPage(textOf(row[i])), 9, cw - 8), M + 4 + i * cw, y, 9));
      y -= 18;
    });
  }
  /* paragraphs, until there are as many pages as wanted */
  const minPages = Math.max(1, o.minPages ?? 2);
  let k = 0;
  const paragraphs = paragraphsOf(o.seed, 40);
  y -= 12;
  room(40);
  text("Notes", M, y, 13, true, 0.2);
  y -= 22;
  do {
    for (const line of wrap(paragraphs[k % paragraphs.length], 11, W - 2 * M)) {
      room(15);
      text(line, M, y, 11, false, 0.25);
      y -= 15;
    }
    y -= 8;
    k++;
  } while ((pages.length < minPages || k < 2) && k < 200);
  /* the footer, now that the pages are counted */
  const n = pages.length;
  pages.forEach((ops, i) => ops.push(`BT /F1 8 Tf 0.55 0.55 0.55 rg ${M} 30 Td ${pdfString(`${fit(shown, 8, 300)}  -  ${i + 1} / ${n}`)} Tj ET`));
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", `<< /Title ${pdfUtf16(title)} /Producer (M3E Canvas Pro mocks) >>`];
  const kids: string[] = [];
  for (const ops of pages) {
    const content = `${ops.join("\n")}\n`;
    const at = objects.length + 1;
    kids.push(`${at} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${at + 1} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((v) => `${String(v).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  /* every character above is ASCII, so its UTF-8 bytes are its offsets */
  return utf8(out);
}
