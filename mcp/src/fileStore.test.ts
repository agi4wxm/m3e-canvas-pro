/* A project folder written by the file backend, on real folders: every file the document refers to is in m3e-assets/
 * holding what it should before the project file refers to it (a broken copy under its name is written again), and
 * only the format's own files are taken away afterwards, pictures and the mock library's files of every format alike;
 * a file someone put there by hand stays, whatever its name. */

import { readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../../lib/core";
import { bytesToBase64, digest, FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, parseProject } from "../../lib/core/projectFile";
import { dataUrl } from "../../lib/mocks/bytes";
import { mockFile } from "../../lib/mocks/formats";
import type { MockFile } from "../../lib/mocks/types";
import type { Doc } from "../../lib/tokens";
import { ProjectFileStore } from "./fileStore";
import { scratchDir } from "./testkit";

const bytesOf = (n: number, length = 3000) => new Uint8Array(Array.from({ length }, (_, i) => (i * n) % 256));
const png = (b: Uint8Array) => dataUrl("image/png", b);
const nameOf = (b: Uint8Array, ext: string) => `${digest(bytesToBase64(b))}.${ext}`;

/** a document with a picture (or none), its mock library holding these files */
function docWith(picture: Uint8Array | null, files: MockFile[] = [], screens = 1): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => "en" });
  store.transact("Start", "mcp", (tx) => {
    for (let i = 0; i < screens; i++) tx.run(ops.addScreen, { id: i ? `s${i}` : "home", name: i ? `Screen ${i}` : "Home" });
    if (picture) tx.run(ops.addPart, { slug: "image", id: "hero", screen: "home", at: { x: 16, y: 80 }, props: { src: png(picture) } });
  });
  const doc = savedDoc(store.get());
  return files.length ? { ...doc, mocks: { files } } : doc;
}

const assets = (dir: string) => readdirSync(join(dir, FOLDER_ASSET_DIR)).sort();
const age = (path: string, ms = 10 * 60_000) => {
  const old = new Date(Date.now() - ms);
  utimesSync(path, old, old);
};

const ROWS = Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, name: `Product ${i}`, price: i * 2.5, note: "words enough to make the file larger" }));

describe("a project folder's files", () => {
  it("are written again when a file of that name holds something else, before the project file refers to it", async () => {
    const dir = scratchDir();
    const picture = bytesOf(37);
    const name = nameOf(picture, "png");
    const first = new ProjectFileStore(dir);
    await first.read();
    await first.write(docWith(picture));
    expect(assets(dir)).toEqual([name]);

    /* broken under its own name, the same size (a copy cut short and padded, a bad sync), long ago */
    const asset = join(dir, FOLDER_ASSET_DIR, name);
    writeFileSync(asset, new Uint8Array(picture.length).fill(7));
    age(asset);
    /* another server, which never wrote it, saves the document that refers to it */
    const other = new ProjectFileStore(dir);
    await other.read();
    await other.write(docWith(picture, [], 2));
    expect(new Uint8Array(readFileSync(asset))).toEqual(picture);

    /* cut short (another size), under the server that wrote it: written again too */
    writeFileSync(asset, picture.subarray(0, 100));
    await other.write(docWith(picture, [], 3));
    expect(new Uint8Array(readFileSync(asset))).toEqual(picture);
    expect(parseProject(readFileSync(join(dir, FOLDER_MAIN_FILE), "utf8"))!.files).toEqual([`${FOLDER_ASSET_DIR}/${name}`]);
  });

  it("leave alone a same-name file that already holds the right bytes", async () => {
    const dir = scratchDir();
    const picture = bytesOf(41);
    const store = new ProjectFileStore(dir);
    await store.read();
    await store.write(docWith(picture));
    const asset = join(dir, FOLDER_ASSET_DIR, assets(dir)[0]);
    age(asset);
    const again = new ProjectFileStore(dir);
    await again.read();
    await again.write(docWith(picture, [], 2));
    /* not written again: its time is still the old one */
    expect(Date.now() - statSync(asset).mtimeMs).toBeGreaterThan(5 * 60_000);
    expect(new Uint8Array(readFileSync(asset))).toEqual(picture);
  });

  it("never take away a file put there by hand, whatever its name, even one under a name this server once wrote", async () => {
    const dir = scratchDir();
    const a = bytesOf(37);
    const b = bytesOf(43);
    const store = new ProjectFileStore(dir);
    await store.read();
    await store.write(docWith(a, [{ id: "pic", name: "b.png", type: "image/png", data: png(b) }]));
    const folder = join(dir, FOLDER_ASSET_DIR);
    expect(assets(dir)).toEqual([nameOf(a, "png"), nameOf(b, "png")].sort());
    /* someone's own files: named their way, named like the format's but holding something else, and one this server
       wrote, replaced by hand since */
    writeFileSync(join(folder, "Logo.png"), "mine");
    writeFileSync(join(folder, "report.xlsx"), "my sheet");
    writeFileSync(join(folder, "abc123.png"), "not the hash of this");
    writeFileSync(join(folder, nameOf(b, "png")), "my own picture now");
    for (const n of ["Logo.png", "report.xlsx", "abc123.png", nameOf(b, "png")]) age(join(folder, n));

    /* neither picture is referred to any more */
    await store.write(docWith(null));
    expect(assets(dir)).toEqual(["Logo.png", "abc123.png", nameOf(b, "png"), "report.xlsx"].sort());
    expect(readFileSync(join(folder, nameOf(b, "png")), "utf8")).toBe("my own picture now");
  });

  it("of the mock library, in every format, are kept and taken away like pictures", async () => {
    const dir = scratchDir();
    const library = ["pdf", "xlsx", "glb", "csv", "docx", "zip", "wav"].map((ext, i) => mockFile(ext, { seed: `store:${ext}`, title: "Receipt", rows: ROWS, id: `f${i}` }));
    const store = new ProjectFileStore(dir);
    await store.read();
    await store.write(docWith(null, library));
    const written = assets(dir);
    expect(written.map((n) => n.slice(n.indexOf(".") + 1)).sort()).toEqual(["csv", "docx", "glb", "pdf", "wav", "xlsx", "zip"]);
    expect(readFileSync(join(dir, FOLDER_MAIN_FILE), "utf8")).not.toContain(";base64,");
    /* read back by another server, the library is the same */
    const reader = new ProjectFileStore(dir);
    expect((await reader.read())!.mocks!.files).toEqual(library);

    /* beside them, another program's spreadsheet and model of the format's own, left long ago, and a fresh one */
    const sheet = bytesOf(59);
    const model = bytesOf(61);
    const fresh = bytesOf(67);
    const folder = join(dir, FOLDER_ASSET_DIR);
    writeFileSync(join(folder, nameOf(sheet, "xlsx")), sheet);
    writeFileSync(join(folder, nameOf(model, "glb")), model);
    writeFileSync(join(folder, nameOf(fresh, "csv")), fresh);
    age(join(folder, nameOf(sheet, "xlsx")));
    age(join(folder, nameOf(model, "glb")));

    /* the library goes from the document: its files go, and the old ones of the format's; the fresh one waits */
    await store.write(docWith(null, [library[0]]));
    expect(assets(dir)).toEqual([written.find((n) => n.endsWith(".pdf"))!, nameOf(fresh, "csv")].sort());
  });
});
