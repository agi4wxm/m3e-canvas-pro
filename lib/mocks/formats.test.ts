/* Every file format the mock library makes, opened by a real reader of it (dev dependencies only, never in the
 * exported code): libvips through sharp for the pictures, pdf.js through unpdf for PDF, SheetJS for spreadsheets and
 * CSV, mammoth for Word, the Khronos glTF validator, ical.js for calendars and contacts, the yaml package, fast-xml-
 * parser for every XML part (the deck's too, with each relationship's target there), fflate for archives and DEFLATE,
 * music-metadata for sound and video. The same seed makes the same bytes; a size limit makes a smaller file. */

import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync, inflateSync, unzipSync, unzlibSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import ICAL from "ical.js";
import mammoth from "mammoth";
import { parseBuffer } from "music-metadata";
import sharp from "sharp";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parse as parseYaml } from "yaml";
import { fromUtf8, parseDataUrl, utf8 } from "./bytes";
import { contentDisposition, extensionOf, kindOfType, typeOfName } from "./files";
import { FORMATS, formatOf, nearestFormat } from "./formats/table";
import { makeBytes, mockFile, placeholderFile } from "./formats";
import { deflateRaw, gzip, zlib } from "./formats/deflate";
import { encodeBmp, encodeGif, encodeJpeg, encodePng, encodeTiff, encodeWebp } from "./formats/codecs";
import { meshOf, SHAPES } from "./formats/mesh";
import { paintPicture } from "./formats/raster";
import { rngOf } from "./rng";

/* the Khronos validator has no types of its own */
const gltfValidator = (await import("gltf-validator" as string)).default as { validateBytes: (b: Uint8Array) => Promise<{ issues: { numErrors: number; numWarnings: number; messages: unknown[] } }> };

const ROWS = Array.from({ length: 12 }, (_, i) => ({
  id: `ord_${i + 1}`,
  title: i === 2 ? 'Order "three", with commas\nand a line' : `Order ${i + 1} · 订单`,
  customer: { name: i % 2 ? "Emma Smith" : "王小明", email: "emma@example.com" },
  total: 12.5 * i,
  paid: i % 3 === 0,
  placedAt: `2026-0${(i % 9) + 1}-1${i % 9}T10:00:00Z`,
  tags: ["gift", "express"],
  lat: 31.2 + i / 100,
  lng: 121.4 + i / 100,
}));
const RECORD = { id: "inv_7", title: "March rent", amount: 1250, currency: "EUR", paid: true, tenant: { name: "Ada Lovelace" }, dueDate: "2026-03-01" };
const bytesOf = (f: { data: string }) => parseDataUrl(f.data)!.bytes;
const make = (type: string, o: Partial<Parameters<typeof mockFile>[1]> = {}) => mockFile(type, { seed: `test:${type}`, title: "Orders 2026", rows: ROWS, model: "Order", ...o });
const OOXML = "application/vnd.openxmlformats-officedocument";

describe("every format", () => {
  it("is made, of its own type and extension, the same for the same seed and otherwise for another", () => {
    for (const f of FORMATS) {
      const a = make(f.type);
      expect(a.type, f.type).toBe(f.type);
      expect(a.name.endsWith(`.${f.ext}`), a.name).toBe(true);
      expect(bytesOf(a).length, f.type).toBeGreaterThan(16);
      expect(make(f.type).data, f.type).toBe(a.data);
      expect(formatOf(f.ext)).toBe(f);
      expect(extensionOf(f.type)).toBe(f.ext);
      expect(typeOfName(`x.${f.ext}`)).toBe(f.type);
    }
    /* the seed makes the content: a different seed, a different picture, table order aside */
    expect(mockFile("image/png", { seed: "a" }).data).not.toBe(mockFile("image/png", { seed: "b" }).data);
  });

  it("knows a format by its other names, and gives the nearest for one it does not make", () => {
    expect(formatOf("image/jpg")?.ext).toBe("jpg");
    expect(formatOf("report.XLSX")?.type).toBe(`${OOXML}.spreadsheetml.sheet`);
    expect(formatOf("text/csv; charset=utf-8")?.ext).toBe("csv");
    expect(nearestFormat("image/heic").type).toBe("image/png");
    expect(nearestFormat("video/quicktime").type).toBe("video/mp4");
    expect(nearestFormat("application/vnd.api+json").type).toBe("application/json");
    expect(nearestFormat("application/x-whatever").type).toBe("application/octet-stream");
    expect(mockFile("image/heic", { seed: "h" }).type).toBe("image/png");
    expect(kindOfType("model/gltf-binary")).toBe("model");
    expect(kindOfType(`${OOXML}.presentationml.presentation`)).toBe("presentation");
    expect(kindOfType("application/x-unknown")).toBe("file");
  });

  it("names a download in any language for the header", () => {
    expect(contentDisposition("report.pdf")).toBe('attachment; filename="report.pdf"');
    expect(contentDisposition("订单 2026.xlsx", true)).toBe(`inline; filename="__ 2026.xlsx"; filename*=UTF-8''%E8%AE%A2%E5%8D%95%202026.xlsx`);
  });

  it("is made smaller to fit the bytes it may take", () => {
    const png = formatOf("png")!;
    const big = makeBytes(png, { seed: "s", title: "Big" });
    const small = makeBytes(png, { seed: "s", title: "Big" }, 4000);
    expect(small.length).toBeLessThanOrEqual(4000);
    expect(small.length).toBeLessThan(big.length);
    const csv = makeBytes(formatOf("csv")!, { seed: "s", rows: ROWS }, 600);
    expect(csv.length).toBeLessThanOrEqual(600);
    expect(XLSX.read(fromUtf8(csv), { type: "string" }).Sheets.Sheet1).toBeDefined();
  });
});

describe("pictures", () => {
  it("decode with libvips, the lossless ones to the very pixels painted", async () => {
    const pic = paintPicture({ seed: "s1", title: "Sneaker Pro 42", w: 160, h: 120 });
    for (const [bytes, exact] of [
      [encodePng(pic, "Sneaker 运动鞋"), true],
      [encodeWebp(pic), true],
      [encodeTiff(pic, "Sneaker"), true],
      [encodeJpeg(pic), false],
      [encodeGif(pic), false],
    ] as const) {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([160, 120]);
      let worst = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const d = Math.abs(data[i] - pic.rgba[i]);
        worst = Math.max(worst, d);
        sum += d;
      }
      if (exact) expect(worst).toBe(0);
      else expect(sum / data.length).toBeLessThan(3);
    }
  });

  it("keep an avatar's transparency (PNG, WebP, GIF) and lay it over white where there is none (JPEG, BMP)", async () => {
    const av = paintPicture({ seed: "s2", title: "Emma Smith", avatar: true, w: 96 });
    for (const bytes of [encodePng(av), encodeWebp(av), encodeGif(av)]) {
      const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0);
      expect(data[(48 * 96 + 48) * 4 + 3]).toBe(255);
    }
    const { data } = await sharp(encodeJpeg(av)).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(245);
    const bmp = encodeBmp(av);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe("BM");
    expect(new DataView(bmp.buffer).getUint32(2, true)).toBe(bmp.length);
    /* bottom row first, BGR: the corner is white */
    expect([...bmp.subarray(54, 57)]).toEqual([255, 255, 255]);
  });

  it("are every picture format the library makes, an icon's PNG inside it", async () => {
    for (const f of FORMATS.filter((x) => x.family === "image")) {
      const bytes = bytesOf(make(f.type));
      if (f.ext === "bmp") continue;
      const inner = f.ext === "ico" ? bytes.subarray(22) : bytes;
      const meta = await sharp(inner).metadata();
      expect(meta.width, f.ext).toBeGreaterThan(0);
      expect(meta.format === "jpeg" ? "jpg" : meta.format === "heif" ? "avif" : meta.format === "tiff" ? "tif" : meta.format === "svg" ? "svg" : f.ext === "ico" ? "ico" : meta.format, f.ext).toBe(f.ext);
    }
  });
});

describe("documents", () => {
  it("make a PDF of several pages: pdf.js reads its pages, its text and its title in any language", async () => {
    const pdf = await getDocumentProxy(bytesOf(make("application/pdf", { title: "Orders 订单 2026" })));
    expect(pdf.numPages).toBeGreaterThanOrEqual(2);
    const { text } = await extractText(pdf, { mergePages: false });
    expect(text[0]).toContain("Orders");
    expect(text[0]).toContain("ord_12");
    expect(text[pdf.numPages - 1]).toContain(`${pdf.numPages} / ${pdf.numPages}`);
    const { info } = (await pdf.getMetadata()) as { info: { Title?: string } };
    expect(info.Title).toBe("Orders 订单 2026");
    const record = await getDocumentProxy(bytesOf(mockFile("application/pdf", { seed: "r", record: RECORD })));
    const first = (await extractText(record, { mergePages: false })).text[0];
    for (const v of ["March rent", "1250", "EUR", "Ada Lovelace", "2026-03-01"]) expect(first).toContain(v);
  });

  it("make a workbook SheetJS reads back, numbers as numbers and the head row first", () => {
    const wb = XLSX.read(bytesOf(make(`${OOXML}.spreadsheetml.sheet`)));
    expect(wb.SheetNames).toEqual(["Order"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Order);
    expect(rows).toHaveLength(12);
    expect(rows[3]).toMatchObject({ id: "ord_4", total: 37.5, paid: true, "customer.name": "Emma Smith", tags: "gift, express" });
    expect(rows[2].title).toBe(ROWS[2].title);
    const one = XLSX.utils.sheet_to_json<string[]>(XLSX.read(bytesOf(mockFile("xlsx", { seed: "r", record: RECORD }))).Sheets[XLSX.read(bytesOf(mockFile("xlsx", { seed: "r", record: RECORD }))).SheetNames[0]], { header: 1 });
    expect(one).toContainEqual(["amount", "1250"]);
  });

  it("make a Word document mammoth reads: the title, the fields and the paragraphs", async () => {
    const { value, messages } = await mammoth.extractRawText({ buffer: Buffer.from(bytesOf(mockFile("docx", { seed: "r", record: RECORD }))) });
    expect(messages).toEqual([]);
    for (const v of ["March rent", "amount", "1250", "tenant.name", "Ada Lovelace", "Notes"]) expect(value).toContain(v);
  });

  it("make a deck whose every part is well-formed XML, every relationship pointing at a part that is there", () => {
    const files = unzipSync(bytesOf(make(`${OOXML}.presentationml.presentation`)));
    const parser = new XMLParser({ ignoreAttributes: false });
    for (const [name, body] of Object.entries(files)) {
      expect(XMLValidator.validate(fromUtf8(body)), name).toBe(true);
      if (!name.endsWith(".rels")) continue;
      const dir = name.replace(/_rels\/[^/]*\.rels$/, "");
      const rels = parser.parse(fromUtf8(body)).Relationships.Relationship;
      for (const r of Array.isArray(rels) ? rels : [rels]) {
        const target = new URL(r["@_Target"], `http://x/${dir}`).pathname.slice(1);
        expect(files[target], `${name} → ${target}`).toBeDefined();
      }
    }
    const types = fromUtf8(files["[Content_Types].xml"]);
    for (const name of Object.keys(files)) if (!/\.rels$|^\[Content_Types\]/.test(name)) expect(types, name).toContain(`PartName="/${name}"`);
    expect(Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))).toHaveLength(1 + 12);
  });

  it("make RTF, plain text, Markdown and HTML of the rows", () => {
    const rtf = fromUtf8(bytesOf(make("application/rtf")));
    expect(rtf.startsWith("{\\rtf1")).toBe(true);
    expect([...rtf].filter((c) => c === "{").length).toBe([...rtf].filter((c) => c === "}").length);
    expect(rtf).toContain("\\u-29790?");
    const md = fromUtf8(bytesOf(make("text/markdown")));
    expect(md.split("\n").filter((l) => l.startsWith("| ")).length).toBe(2 + 12);
    const html = fromUtf8(bytesOf(make("text/html")));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html.match(/<tr>/g)).toHaveLength(13);
    expect(fromUtf8(bytesOf(make("text/plain")))).toContain("customer.name: 王小明");
  });
});

describe("tables and data", () => {
  it("make CSV that SheetJS reads back cell for cell, quotes and line breaks included, and TSV", () => {
    const csv = fromUtf8(bytesOf(make("text/csv")));
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(csv, { type: "string", raw: true }).Sheets.Sheet1, { raw: false });
    expect(rows).toHaveLength(12);
    expect(rows[2].title).toBe(ROWS[2].title);
    expect(rows[0]["customer.name"]).toBe("王小明");
    const tsv = fromUtf8(bytesOf(make("text/tab-separated-values"))).trimEnd().split("\n");
    expect(new Set(tsv.map((l) => l.split("\t").length)).size).toBe(1);
    expect(tsv).toHaveLength(13);
  });

  it("make JSON, NDJSON and YAML that read back to the same records", () => {
    expect(JSON.parse(fromUtf8(bytesOf(make("application/json"))))).toEqual(ROWS);
    expect(fromUtf8(bytesOf(make("application/x-ndjson"))).trimEnd().split("\n").map((l) => JSON.parse(l))).toEqual(ROWS);
    expect(parseYaml(fromUtf8(bytesOf(make("application/yaml"))))).toEqual(ROWS);
    expect(parseYaml(fromUtf8(bytesOf(mockFile("yaml", { seed: "r", record: { ...RECORD, empty: [], none: null, nested: [{ a: [1, [2, 3]] }], "odd key": "yes" } }))))).toEqual({ ...RECORD, empty: [], none: null, nested: [{ a: [1, [2, 3]] }], "odd key": "yes" });
  });

  it("make XML, GPX, KML and SVG that are well-formed, and GeoJSON with the records' own places", () => {
    for (const t of ["application/xml", "application/gpx+xml", "application/vnd.google-earth.kml+xml", "image/svg+xml"]) expect(XMLValidator.validate(fromUtf8(bytesOf(make(t)))), t).toBe(true);
    const xml = new XMLParser().parse(fromUtf8(bytesOf(make("application/xml"))));
    expect(xml.orders.order).toHaveLength(12);
    const geo = JSON.parse(fromUtf8(bytesOf(make("application/geo+json"))));
    expect(geo.type).toBe("FeatureCollection");
    expect(geo.features).toHaveLength(12);
    expect(geo.features[1].geometry).toEqual({ type: "Point", coordinates: [ROWS[1].lng, ROWS[1].lat] });
    const gpx = new XMLParser({ ignoreAttributes: false }).parse(fromUtf8(bytesOf(make("application/gpx+xml"))));
    expect(gpx.gpx.wpt).toHaveLength(12);
    expect(gpx.gpx.trk.trkseg.trkpt.length).toBeGreaterThan(10);
  });

  it("make iCalendar events and vCards that ical.js reads", () => {
    const cal = new ICAL.Component(ICAL.parse(fromUtf8(bytesOf(make("text/calendar")))));
    const events = cal.getAllSubcomponents("vevent");
    expect(events).toHaveLength(12);
    expect(new ICAL.Event(events[1]).summary).toBe("Order 2 · 订单");
    expect(new ICAL.Event(events[1]).startDate.toJSDate().toISOString()).toBe("2026-02-11T10:00:00.000Z");
    const cards = ICAL.parse(fromUtf8(bytesOf(mockFile("vcf", { seed: "p", rows: [{ name: "Ada Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000", company: "Analytical; Engines" }] }))));
    const card = new ICAL.Component(cards);
    expect(card.getFirstPropertyValue("fn")).toBe("Ada Lovelace");
    expect(card.getFirstPropertyValue("email")).toBe("ada@example.com");
    expect(card.getFirstPropertyValue("org")).toBe("Analytical; Engines");
    expect(new ICAL.Component(ICAL.parse(fromUtf8(bytesOf(mockFile("vcf", { seed: "q", locale: "zh" }))))).getFirstPropertyValue("fn")).toBeTruthy();
  });
});

describe("archives", () => {
  it("deflate what fflate inflates, compressible or not, and wrap it as zlib and gzip", () => {
    const rng = rngOf("noise");
    const noise = Uint8Array.from({ length: 70_000 }, () => Math.floor(rng.next() * 256));
    const text = utf8("the same words again and again, ".repeat(3000));
    for (const data of [new Uint8Array(0), utf8("a"), noise, text]) {
      expect(inflateSync(deflateRaw(data))).toEqual(data);
      expect(unzlibSync(zlib(data))).toEqual(data);
      expect(gunzipSync(gzip(data, "x.txt"))).toEqual(data);
    }
    expect(deflateRaw(text).length).toBeLessThan(text.length / 20);
    expect(deflateRaw(noise).length).toBeLessThan(noise.length + 20);
  });

  it("make a ZIP, a tar and a .gz of the content", () => {
    const files = unzipSync(bytesOf(make("application/zip")));
    expect(Object.keys(files)).toEqual(["Orders-2026/README.txt", "Orders-2026/data.json", "Orders-2026/data.csv", "Orders-2026/picture.png"]);
    expect(JSON.parse(fromUtf8(files["Orders-2026/data.json"]))).toEqual(ROWS);
    expect(JSON.parse(fromUtf8(gunzipSync(bytesOf(make("application/gzip")))))).toEqual(ROWS);
    const tarBytes = bytesOf(make("application/x-tar"));
    const head = tarBytes.subarray(0, 512);
    const sum = Number.parseInt(fromUtf8(head.subarray(148, 154)), 8);
    expect([...head].reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0)).toBe(sum);
    expect(fromUtf8(head.subarray(0, 100)).replace(/\0+$/, "")).toBe("Orders-2026/README.txt");
    expect(fromUtf8(head.subarray(257, 262))).toBe("ustar");
    expect(tarBytes.length % 512).toBe(0);
  });
});

describe("sound and video", () => {
  it("are clips music-metadata reads, with their codecs and lengths", async () => {
    const want: Record<string, [string, string]> = { wav: ["WAVE", "PCM"], mp3: ["MPEG", "MPEG 2 Layer 3"], ogg: ["Ogg", "Opus"], weba: ["EBML/webm", "OPUS"], m4a: ["M4A", "MPEG-4/AAC"], mp4: ["isom", "AVC"], webm: ["EBML/webm", "VP9"] };
    for (const [ext, [container, codec]] of Object.entries(want)) {
      const f = mockFile(ext, { seed: "clip" });
      const meta = await parseBuffer(bytesOf(f), { mimeType: f.type });
      expect(meta.format.container, ext).toContain(container);
      /* music-metadata names the codec of sound; of a clip, only its container */
      if (f.type.startsWith("audio/")) expect(meta.format.codec ?? "", ext).toContain(codec);
      expect(meta.format.duration ?? 0, ext).toBeGreaterThan(0.5);
    }
    /* each tone is a note of the seed's own */
    expect(mockFile("wav", { seed: "a" }).data).not.toBe(mockFile("wav", { seed: "x" }).data);
  });
});

describe("3D models", () => {
  it("are glTF the Khronos validator passes, without a warning, every shape", async () => {
    for (const shape of SHAPES) {
      const m = meshOf("s", shape, 1, shape);
      const { glbOf, gltfOf } = await import("./formats/mesh");
      for (const bytes of [glbOf(m), utf8(gltfOf(m))]) {
        const report = await gltfValidator.validateBytes(bytes);
        expect(report.issues.numErrors, `${shape} ${JSON.stringify(report.issues.messages)}`).toBe(0);
        expect(report.issues.numWarnings, `${shape} ${JSON.stringify(report.issues.messages)}`).toBe(0);
      }
    }
  });

  it("face outwards, with no triangle of no area", () => {
    for (const shape of SHAPES) {
      const m = meshOf("s", shape, 1, shape);
      const p = (i: number) => m.positions.slice(i * 3, i * 3 + 3);
      for (let t = 0; t < m.indices.length; t += 3) {
        const [a, b, c] = [p(m.indices[t]), p(m.indices[t + 1]), p(m.indices[t + 2])];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const normal = [0, 1, 2].map((k) => m.normals[m.indices[t] * 3 + k] + m.normals[m.indices[t + 1] * 3 + k] + m.normals[m.indices[t + 2] * 3 + k]);
        expect(Math.hypot(n[0], n[1], n[2]), shape).toBeGreaterThan(1e-9);
        expect(n[0] * normal[0] + n[1] * normal[1] + n[2] * normal[2], shape).toBeGreaterThan(0);
      }
    }
  });

  it("are OBJ, STL and PLY of the same mesh", () => {
    const m = meshOf("test:model/obj", "Orders 2026");
    const obj = fromUtf8(bytesOf(make("model/obj"))).split("\n");
    expect(obj.filter((l) => l.startsWith("v ")).length).toBe(m.positions.length / 3);
    expect(obj.filter((l) => l.startsWith("f ")).length).toBe(m.indices.length / 3);
    const stl = bytesOf(make("model/stl"));
    const tris = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
    expect(stl.length).toBe(84 + tris * 50);
    expect(fromUtf8(stl.subarray(0, 5))).not.toBe("solid");
    const ply = fromUtf8(bytesOf(make("model/x-ply")));
    const vertices = Number(/element vertex (\d+)/.exec(ply)![1]);
    const faces = Number(/element face (\d+)/.exec(ply)![1]);
    expect(ply.trimEnd().split("\n").length).toBe(ply.split("\n").indexOf("end_header") + 1 + vertices + faces);
  });
});

describe("placeholders", () => {
  it("of every kind are of the kind's format", () => {
    const want = { document: "docx", spreadsheet: "xlsx", presentation: "pptx", data: "json", text: "txt", archive: "zip", model: "glb", image: "svg", avatar: "svg", pdf: "pdf", audio: "wav", video: "mp4", file: "bin" } as const;
    for (const [kind, ext] of Object.entries(want)) expect(placeholderFile(kind as keyof typeof want, { seed: "k", title: "Kind" }).name, kind).toBe(`Kind.${ext}`);
  });
});

describe("the engine's purity", () => {
  it("leans on nothing a mini-program or React Native lacks: no DOM, no Node, no fetch, no TextEncoder, no atob", () => {
    const dir = new URL("./formats/", import.meta.url);
    for (const name of [...readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts")).map((n) => `formats/${n}`), "files.ts", "bytes.ts"]) {
      /* the code without its comments and its strings */
      const code = readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
        .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/g, '""');
      expect(code, name).not.toMatch(/\b(document|window|Buffer|fetch|TextEncoder|TextDecoder|atob|btoa|require|process)\b\s*[.(]/);
      expect(code, name).not.toMatch(/\bimport\(/);
    }
  });
});
