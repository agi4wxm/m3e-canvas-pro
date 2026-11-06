/* The project file as text: laid out for version control, the same bytes every time it is written, and the same bytes
 * again when what was read back is written; pictures kept in the text or beside it in files. Runs in Node. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { makeItem, type Doc } from "../tokens";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import { guessMeasurer } from "./op";
import * as ops from "./ops";
import { attachFiles, base64ToBytes, bytesToBase64, FILE_REF, fileRefsIn, formatProject, isAssetPath, parseProject, projectNameFromFile, readProjectText, serializeProject, sortKeys } from "./projectFile";

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
