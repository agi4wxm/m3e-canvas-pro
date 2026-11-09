/* The project file as text: laid out for version control, the same bytes every time it is written, and the same bytes
 * again when what was read back is written; pictures kept in the text or beside it in files. Runs in Node. */

import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { dataUrl } from "../mocks/bytes";
import { placeholderFile } from "../mocks/files";
import { mockFile } from "../mocks/formats";
import { FORMATS } from "../mocks/formats/table";
import type { MockFile } from "../mocks/types";
import { makeItem, type Doc } from "../tokens";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import { guessMeasurer } from "./op";
import * as ops from "./ops";
import { attachFiles, base64ToBytes, bytesToBase64, dataUrlOf, FILE_MIN_CHARS, FILE_REF, fileRefsIn, formatProject, isAssetFileName, isAssetPath, isFormatAsset, parseProject, projectNameFromFile, readProjectText, serializeProject, sortKeys } from "./projectFile";

beforeAll(() => setGlobalLang("en"));

/** a two-screen app built only through operations, as the MCP server would, with a definition and an instance */
function fromOps(): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  store.transact("Build", "mcp", (tx) => {
    tx.run(ops.setTitle, { title: "Shop" });
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addScreen, { id: "list", name: "List" });
    tx.run(ops.addKit, { slug: "search-bar", screen: "home", at: { x: 16, y: 40 } });
    tx.run(ops.addPart, { slug: "box", id: "card", screen: "home", at: { x: 16, y: 140 }, props: { surface: "card", padX: 16, padY: 16 } });
    tx.run(ops.setLayout, { id: "card", layout: "column", props: { gap: 8 } });
    tx.run(ops.addPart, { slug: "text", id: "title", into: { container: "card" }, props: { text: "Fresh fruit", style: "title" } });
    tx.run(ops.makeComponentOp, { ids: ["card"], name: "Product card", id: "product" });
    tx.run(ops.addInstance, { component: "product", id: "copy", screen: "list", at: { x: 16, y: 100 } });
    tx.run(ops.addCollection, { id: "fruit", name: "Fruit", fields: ["name", "price"], rows: [["Apple", "1"], ["Pear", "2"]] });
    tx.run(ops.addVar, { id: "count", name: "count", type: "number", value: 0 });
    tx.run(ops.applyStyle, { style: "ios" });
  });
  return savedDoc(store.get());
}

/** The same app as a document is once it has been opened: `openProject` gives an instance the stand-in its
 *  definition makes, so a document straight from the store may change once on its first read, never after. */
const builtDoc = (): Doc => parseProject(serializeProject(fromOps()).text)!.doc;

/** a small PNG-looking picture, long enough to go into a file of its own */
const picture = (seed: number) => {
  const bytes = new Uint8Array(3000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + seed * 17) & 0xff;
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
};

const withPictures = (doc: Doc, pics: string[]): Doc => ({
  ...doc,
  groups: [...doc.groups, ...pics.map((src, i) => ({ id: `pic${i}`, x: 0, y: 900 + i * 10, axis: "y" as const, items: [{ ...makeItem("image"), id: `img${i}`, props: { src } }] }))],
});

describe("the layout", () => {
  it("sorts every key inside the document, keeps the envelope's order, and ends with a newline", () => {
    const text = formatProject({ format: "m3e-project", version: 2, document: { title: "A", groups: [{ y: 2, x: 1, id: "g" }], frames: [] } });
    expect(text).toBe('{\n  "format": "m3e-project",\n  "version": 2,\n  "document": {\n    "frames": [],\n    "groups": [\n      {"id":"g","x":1,"y":2}\n    ],\n    "title": "A"\n  }\n}\n');
  });

  it("writes one line per screen, per part, per variable and per row of data, and opens definitions and collections", () => {
    const doc = builtDoc();
    const { text } = serializeProject(doc);
    const lines = text.split("\n");
    /* every group and every screen is one line of its own, six spaces in */
    for (const g of doc.groups) expect(lines.filter((l) => l.startsWith(`      {"axis":`) && l.includes(`"id":"${g.id}"`))).toHaveLength(1);
    for (const f of doc.frames) expect(lines.some((l) => l.startsWith("      {") && l.includes(`"id":"${f.id}"`) && l.includes(`"name":"${f.name}"`))).toBe(true);
    /* a definition is open, its groups one per line deeper in; a collection's rows one per line */
    expect(text).toContain('    "components": [\n      {\n        "groups": [\n          {');
    expect(text).toContain('        "rows": [\n          ["Apple","1"],\n          ["Pear","2"]\n        ]');
    expect(text).toMatch(/\n {4}"theme": \{\n/);
    /* two spaces a level, no tabs */
    expect(text).not.toContain("\t");
    for (const l of lines) expect((/^ */.exec(l)![0].length) % 2).toBe(0);
  });

  it("does not depend on the order fields were set in", () => {
    const doc = builtDoc();
    const shuffled = JSON.parse(JSON.stringify(doc, (_, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v))) as Doc;
    expect(serializeProject(shuffled).text).toBe(serializeProject(doc).text);
  });

  it("leaves out what JSON leaves out", () => {
    expect(sortKeys({ b: undefined, a: [undefined, 1], c: () => 1 })).toEqual({ a: [null, 1] });
  });
});

describe("writing what was read", () => {
  it("reaches the form it keeps after one read at most, for a document straight from the store", () => {
    const once = serializeProject(parseProject(serializeProject(fromOps()).text)!.doc).text;
    expect(serializeProject(parseProject(once)!.doc).text).toBe(once);
    /* one without instances does not change at all */
    const plain = { ...fromOps(), components: undefined, groups: fromOps().groups.filter((g) => !g.instanceOf) };
    const text = serializeProject(plain).text;
    expect(serializeProject(parseProject(text)!.doc).text).toBe(text);
  });

  it("gives the same bytes: serialize, parse, serialize", () => {
    const doc = builtDoc();
    const first = serializeProject(doc).text;
    const read = parseProject(first);
    expect(read).not.toBeNull();
    expect(serializeProject(read!.doc).text).toBe(first);
    /* and again, from what that gave */
    expect(serializeProject(parseProject(serializeProject(read!.doc).text)!.doc).text).toBe(first);
  });

  it("reads a file written the way earlier versions wrote it, and writes it the new way from then on", () => {
    const doc = builtDoc();
    const old = JSON.stringify({ format: "m3e-project", version: 2, document: doc }, null, 2);
    const read = parseProject(old)!;
    expect(read.doc.groups.map((g) => g.id)).toEqual(doc.groups.map((g) => g.id));
    const text = serializeProject(read.doc).text;
    expect(serializeProject(parseProject(text)!.doc).text).toBe(text);
  });

  it("refuses what is not a project", () => {
    expect(parseProject("not json")).toBeNull();
    expect(parseProject('{"format":"other","document":{}}')).toBeNull();
    expect(parseProject('{"groups":"nope","frames":[]}')).toBeNull();
  });
});

describe("pictures", () => {
  it("stay in the text in one file", () => {
    const doc = withPictures(builtDoc(), [picture(1)]);
    const { text, files } = serializeProject(doc);
    expect(files).toEqual([]);
    expect(text).toContain(picture(1));
    expect(serializeProject(parseProject(text)!.doc).text).toBe(text);
  });

  it("go into files of their own beside a folder's project, named by what they hold, and come back exactly", async () => {
    const pics = [picture(1), picture(2), picture(1)];
    const doc = withPictures(builtDoc(), pics);
    const { text, files } = serializeProject(doc, { assets: "files" });
    /* the same picture twice is one file */
    expect(files).toHaveLength(2);
    for (const f of files) {
      expect(isAssetPath(f.path)).toBe(true);
      expect(f.mime).toBe("image/png");
      expect(text).toContain(`"${FILE_REF}${f.path}"`);
    }
    expect(text).not.toContain("data:image/png;base64");
    expect(fileRefsIn(parseProject(text)!.doc)).toEqual(files.map((f) => f.path));

    const disk = new Map(files.map((f) => [f.path, f.bytes]));
    const back = await readProjectText(text, async (path) => disk.get(path));
    expect(back!.groups.find((g) => g.id === "pic0")!.items[0].props?.src).toBe(pics[0]);
    expect(back!.groups.find((g) => g.id === "pic1")!.items[0].props?.src).toBe(pics[1]);
    /* written again, the same text and the same files */
    const again = serializeProject(back!, { assets: "files" });
    expect(again.text).toBe(text);
    expect(again.files.map((f) => [f.path, bytesToBase64(f.bytes)])).toEqual(files.map((f) => [f.path, bytesToBase64(f.bytes)]));
  });

  it("keeps small pictures and pictures it could not write back exactly in the text", () => {
    const small = `data:image/png;base64,${bytesToBase64(new Uint8Array([1, 2, 3]))}`;
    const odd = `data:image/png;name=x;base64,${picture(3).split(",")[1]}`;
    const svg = `data:image/svg+xml;utf8,${"<svg xmlns='http://www.w3.org/2000/svg'/>".repeat(100)}`;
    const doc = withPictures(builtDoc(), [small, odd, svg]);
    const { files, text } = serializeProject(doc, { assets: "files" });
    expect(files).toEqual([]);
    expect(serializeProject(parseProject(text)!.doc, { assets: "files" }).text).toBe(text);
  });

  it("is empty where a file is missing, and never reads a path outside its folder", () => {
    const doc = withPictures(builtDoc(), [`${FILE_REF}m3e-assets/abc.png`, `${FILE_REF}../secret.png`]);
    const out = attachFiles(doc, new Map([["../secret.png", new Uint8Array([1])]]));
    expect(out.groups.find((g) => g.id === "pic0")!.items[0].props?.src).toBe("");
    expect(out.groups.find((g) => g.id === "pic1")!.items[0].props?.src).toBe("");
    expect(isAssetPath("../secret.png")).toBe(false);
    expect(isAssetPath("m3e-assets/../x.png")).toBe(false);
  });

  it("round-trips bytes through base64", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) & 0xff);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

/** a document whose mock library holds these files */
const withMockFiles = (doc: Doc, files: MockFile[]): Doc => ({ ...doc, mocks: { files } });

/** bytes enough for a file of their own, different for each seed */
const bytesOf = (seed: number, n = 3000) => new Uint8Array(n).map((_, i) => (i * 13 + seed * 7) & 0xff);

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** rows enough to make a table or a document larger than what stays in the text */
const ROWS = Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, name: `Product ${i}`, price: i * 3.5, note: "a row long enough to make the file larger" }));

describe("the mock library's files", () => {
  it("go beside a folder's project in every format the library makes, and come back as the same data URL", async () => {
    /* one of each format by its own media type, as the library makes it (lib/mocks/formats/table.ts) */
    const files = FORMATS.map((f, i): MockFile => ({ id: `f${i}`, name: `file.${f.ext}`, type: f.type, data: dataUrl(f.type, bytesOf(i)) }));
    const doc = withMockFiles(builtDoc(), files);
    const { text, files: written } = serializeProject(doc, { assets: "files" });
    expect(text).not.toContain(";base64,");
    expect(written.map((f) => f.path.slice(f.path.lastIndexOf(".") + 1)).sort()).toEqual(FORMATS.map((f) => f.ext).sort());
    for (const f of written) {
      expect(isAssetPath(f.path)).toBe(true);
      expect(isFormatAsset(f.path.slice("m3e-assets/".length), f.bytes)).toBe(true);
      expect(dataUrlOf(f.path, f.bytes)).toBe(dataUrl(f.mime, f.bytes));
    }
    const disk = new Map(written.map((f) => [f.path, f.bytes]));
    const back = await readProjectText(text, async (p) => disk.get(p));
    expect(back!.mocks!.files).toEqual(files);
    expect(serializeProject(back!, { assets: "files" }).text).toBe(text);
  });

  it("go beside it as the library really makes them: a spreadsheet, a model, a table, a document", async () => {
    const made = ["xlsx", "glb", "csv", "docx", "pptx", "zip", "json"].map((ext, i) => mockFile(ext, { seed: `asset:${ext}`, title: "Receipt", rows: ROWS, id: `m${i}` }));
    for (const f of made) expect(f.data.length).toBeGreaterThanOrEqual(FILE_MIN_CHARS);
    const { text, files } = serializeProject(withMockFiles(builtDoc(), made), { assets: "files" });
    expect(files.map((f) => f.mime).sort()).toEqual(made.map((f) => f.type).sort());
    const back = await readProjectText(text, async (p) => files.find((f) => f.path === p)?.bytes);
    expect(back!.mocks!.files).toEqual(made);
  });

  it("stay in the text when they would not come back the same: another name for the type, parameters, small, unknown", () => {
    const sheet = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const files: MockFile[] = [
      { id: "alias", name: "a.zip", type: "application/x-zip-compressed", data: dataUrl("application/x-zip-compressed", bytesOf(1)) },
      { id: "params", name: "b.csv", type: "text/csv", data: `data:text/csv;charset=utf-8;base64,${bytesToBase64(bytesOf(2))}` },
      { id: "small", name: "c.xlsx", type: sheet, data: dataUrl(sheet, bytesOf(3, 100)) },
      { id: "unknown", name: "d.foo", type: "application/x-foo", data: dataUrl("application/x-foo", bytesOf(4)) },
    ];
    const { text, files: written } = serializeProject(withMockFiles(builtDoc(), files), { assets: "files" });
    expect(written).toEqual([]);
    for (const f of files) expect(text).toContain(f.data);
  });

  it("leave a project without the new formats as it was, to the byte", () => {
    /* pictures, and the files earlier versions already kept beside the project (PDF, WAV, MP4, bytes, a picture):
       these digests were taken before the library's other formats went into files of their own (and moved once since,
       when the format's version went to 3, and again to 4 and 5: the bytes are the same but for that number) */
    const library = [placeholderFile("pdf", { seed: "s", title: "Receipt" }), placeholderFile("audio", { seed: "s" }), placeholderFile("video", { seed: "s" }), placeholderFile("file", { seed: "s" }), placeholderFile("image", { seed: "s" })];
    const doc = withMockFiles(withPictures(builtDoc(), [picture(1), picture(2)]), library);
    const folder = serializeProject(doc, { assets: "files" });
    const asAt3 = (text: string) => text.replace('"version": 5,', '"version": 3,');
    expect([sha(asAt3(folder.text)), folder.files.map((f) => f.path).join(" ")]).toEqual(["a18862cb0c5d40c569bfe054f6628dd31c84ed00570fc874ccddc20bd20bd268", "m3e-assets/1e41tg2xf7q.mp4 m3e-assets/1y1bf5v6vc7.png m3e-assets/25db4hja7vr.pdf m3e-assets/f4ylufh7t8.png m3e-assets/rxttrpxzqt.wav"]);
    expect(sha(asAt3(serializeProject(doc).text))).toBe("34cfc3b683c175747ee07254fd7fb859d5668e4020a7fa476bdf0c320f420c7d");
  });

  it("are read from a project an earlier version wrote: a spreadsheet kept in the text, a PDF beside it", async () => {
    const xlsx = mockFile("xlsx", { seed: "old", title: "Sheet", rows: ROWS, id: "xlsx" });
    const pdf = { ...placeholderFile("pdf", { seed: "old", title: "Receipt" }), id: "pdf" };
    const pdfBytes = base64ToBytes(pdf.data.slice(pdf.data.indexOf(",") + 1));
    const pdfPath = serializeProject(withMockFiles(builtDoc(), [pdf]), { assets: "files" }).files[0].path;
    /* as an earlier version wrote it: the PDF by reference, the spreadsheet as its data URL */
    const old = serializeProject(withMockFiles(builtDoc(), [{ ...pdf, data: `${FILE_REF}${pdfPath}` }, xlsx])).text;
    const back = await readProjectText(old, async (p) => (p === pdfPath ? pdfBytes : null));
    expect(back!.mocks!.files).toEqual([pdf, xlsx]);
    /* saved again, the spreadsheet goes beside it too */
    const again = serializeProject(back!, { assets: "files" });
    expect(again.files.map((f) => f.mime).sort()).toEqual(["application/pdf", xlsx.type].sort());
    expect(isAssetFileName(again.files.find((f) => f.mime === xlsx.type)!.path.slice("m3e-assets/".length))).toBe(true);
  });
});

describe("keys that mean something to JavaScript", () => {
  /* JSON.parse makes `__proto__` an own key like any other; rebuilding an object by assignment instead sets the
     copy's prototype and loses the key */
  const special = () => JSON.parse('{"zeta":1,"__proto__":{"b":1,"__proto__":{"deep":true},"a":2},"constructor":{"prototype":{"x":1}},"prototype":3,"日本語":{"é":1,"🎨":2},"alpha":[{"__proto__":0}]}') as Record<string, unknown>;
  const ownKeys = (o: unknown) => Object.keys(o as object);

  it("are kept as keys, sorted with the rest, at every depth", () => {
    const sorted = sortKeys(special()) as Record<string, unknown>;
    expect(ownKeys(sorted)).toEqual(["__proto__", "alpha", "constructor", "prototype", "zeta", "日本語"]);
    expect(Object.getPrototypeOf(sorted)).toBe(Object.prototype);
    const proto = Object.getOwnPropertyDescriptor(sorted, "__proto__")?.value as Record<string, unknown>;
    expect(ownKeys(proto)).toEqual(["__proto__", "a", "b"]);
    expect(Object.getOwnPropertyDescriptor(proto, "__proto__")?.value).toEqual({ deep: true });
    expect(ownKeys((sorted.alpha as unknown[])[0])).toEqual(["__proto__"]);
    expect(JSON.parse(JSON.stringify(sorted))).toEqual(special());
    expect(({} as Record<string, unknown>).deep).toBeUndefined();
  });

  it("go into a project file and come back out of it the same", () => {
    const extra = special();
    const text = formatProject({ format: "m3e-project", version: 2, document: { frames: [], groups: [], extra }, ...JSON.parse('{"__proto__":{"envelope":1}}') });
    const back = JSON.parse(text) as { document: { extra: Record<string, unknown> } } & Record<string, unknown>;
    expect(back.document.extra).toEqual(extra);
    expect(ownKeys(back.document.extra)[0]).toBe("__proto__");
    expect(ownKeys(back)).toEqual(["format", "version", "document", "__proto__"]);
  });

  it("keep the API's own order, special or not", () => {
    const api = JSON.parse('{"models":[{"name":"M","schema":{"type":"object","properties":{"zeta":{"type":"string"},"__proto__":{"type":"string"},"constructor":{"type":"number"},"alpha":{"type":"string"}}}}]}') as unknown;
    const text = formatProject({ format: "m3e-project", version: 2, document: { frames: [], groups: [], api } });
    expect(text).toContain('"properties":{"zeta":{"type":"string"},"__proto__":{"type":"string"},"constructor":{"type":"number"},"alpha":{"type":"string"}}');
    expect((JSON.parse(text) as { document: { api: unknown } }).document.api).toEqual(api);
  });

  it("survive a folder's pictures being taken out and put back", async () => {
    const pic = picture(9);
    const doc = withPictures(builtDoc(), [pic]);
    const props = JSON.parse(`{"src":${JSON.stringify(pic)},"__proto__":{"src":${JSON.stringify(pic)}},"constructor":{"prototype":"x"}}`) as Record<string, unknown>;
    doc.groups.find((g) => g.id === "pic0")!.items[0].props = props;
    const { text, files } = serializeProject(doc, { assets: "files" });
    expect(text).toContain('"__proto__":{"src":"m3e-file:m3e-assets/');
    const back = await readProjectText(text, async (p) => files.find((f) => f.path === p)?.bytes ?? null);
    const got = back!.groups.find((g) => g.id === "pic0")!.items[0].props!;
    expect(ownKeys(got).sort()).toEqual(["__proto__", "constructor", "src"]);
    expect(Object.getOwnPropertyDescriptor(got, "__proto__")?.value).toEqual({ src: pic });
    expect(serializeProject(back!, { assets: "files" }).text).toBe(text);
  });
});

describe("a project's name from its file", () => {
  it.each([
    ["m3e-canvas Shop.json", "Shop"],
    ["m3e-canvas.json", null],
    ["design/My app.m3e.json", "My app"],
    ["m3e-project.json", null],
    ["Mail.json", "Mail"],
  ])("%s → %s", (file, name) => {
    expect(projectNameFromFile(file)).toBe(name);
  });
});
