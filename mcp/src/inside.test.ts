/* A project folder's pictures stay inside it: links that lead out of it (a file link, a link where m3e-assets/ should
 * be, a hard link) and a folder replaced since the project was opened are refused, so nothing outside is read, written
 * or taken away. Real folders and links on this system; Windows junctions are reported by Node as links and are
 * refused the same way, but cannot be made here. */

import { cpSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../../lib/core";
import { bytesToBase64, digest, FOLDER_ASSET_DIR, FOLDER_MAIN_FILE } from "../../lib/core/projectFile";
import type { Doc } from "../../lib/tokens";
import { OutsideFolder, ProjectFileStore } from "./fileStore";
import { scratchDir } from "./testkit";

const png = (n: number) => new Uint8Array(Array.from({ length: 3000 }, (_, i) => (i * n) % 256));
const dataUrl = (b: Uint8Array) => `data:image/png;base64,${bytesToBase64(b)}`;

/** a document with one picture */
function docWith(picture: Uint8Array): Doc {
  const store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => "en" });
  store.transact("Start", "mcp", (tx) => {
    tx.run(ops.addScreen, { id: "home", name: "Home" });
    tx.run(ops.addPart, { slug: "image", id: "hero", screen: "home", at: { x: 16, y: 80 }, props: { src: dataUrl(picture) } });
  });
  return savedDoc(store.get());
}

const heroSrc = (doc: Doc | null) => String(doc?.groups.flatMap((g) => g.items).find((it) => it.id === "hero")?.props?.src ?? "");

/** a project folder holding a document with one picture, and a folder outside it */
async function project() {
  const base = scratchDir();
  const dir = join(base, "project");
  const outside = join(base, "outside");
  mkdirSync(outside);
  const mine = png(37);
  mkdirSync(dir);
  const first = new ProjectFileStore(dir);
  await first.read();
  await first.write(docWith(mine));
  const name = readdirSync(join(dir, FOLDER_ASSET_DIR))[0];
  return { base, dir, outside, mine, name, asset: join(dir, FOLDER_ASSET_DIR, name) };
}

const SECRET = png(91);

describe.skipIf(process.platform === "win32")("a project folder's pictures", () => {
  it("are never read or written through a file link that leads outside the folder", async () => {
    const p = await project();
    writeFileSync(join(p.outside, "secret.png"), SECRET);
    rmSync(p.asset);
    symlinkSync(join(p.outside, "secret.png"), p.asset);
    const warned: string[] = [];
    const store = new ProjectFileStore(p.dir, undefined, (m) => warned.push(m));
    const doc = await store.read();
    expect(heroSrc(doc)).toBe("");
    expect(heroSrc(doc)).not.toContain(bytesToBase64(SECRET).slice(0, 60));
    expect(warned.join(" ")).toMatch(/is a link/);
    /* writing the picture back does not go through the link */
    await expect(store.write(docWith(p.mine))).rejects.toBeInstanceOf(OutsideFolder);
    expect(readFileSync(join(p.outside, "secret.png"))).toEqual(Buffer.from(SECRET));
    /* and taking pictures away leaves the link and what it leads to */
    expect(await store.prune(new Set())).toEqual([]);
    expect(existsSync(join(p.outside, "secret.png"))).toBe(true);
  });

  it("are never read, written or taken away through a link where m3e-assets/ should be", async () => {
    const p = await project();
    /* the folder of pictures swapped for a link to a folder outside, which holds a file under the picture's name and an
       old picture of the format's own (one a prune would take away) */
    renameSync(join(p.dir, FOLDER_ASSET_DIR), join(p.base, "moved-assets"));
    writeFileSync(join(p.outside, p.name), SECRET);
    const theirs = png(53);
    const theirsName = `${digest(bytesToBase64(theirs))}.png`;
    writeFileSync(join(p.outside, theirsName), theirs);
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(join(p.outside, theirsName), old, old);
    symlinkSync(p.outside, join(p.dir, FOLDER_ASSET_DIR));
    const before = readdirSync(p.outside).sort();

    const store = new ProjectFileStore(p.dir);
    expect(heroSrc(await store.read())).toBe("");
    await expect(store.write(docWith(png(61)))).rejects.toBeInstanceOf(OutsideFolder);
    expect(await store.prune(new Set())).toEqual([]);
    expect(readdirSync(p.outside).sort()).toEqual(before);
    expect(readFileSync(join(p.outside, p.name))).toEqual(Buffer.from(SECRET));
  });

  it("are not read through a hard link to a file elsewhere", async () => {
    const p = await project();
    writeFileSync(join(p.outside, "secret.png"), SECRET);
    rmSync(p.asset);
    linkSync(join(p.outside, "secret.png"), p.asset);
    expect(heroSrc(await new ProjectFileStore(p.dir).read())).toBe("");
  });

  it("are refused, with the project file, once the folder was replaced by a link to another", async () => {
    const p = await project();
    const store = new ProjectFileStore(p.dir);
    expect(heroSrc(await store.read())).toBe(dataUrl(p.mine));
    /* the folder moved away, a copy of its project file put in a folder outside, and a link to that one where it was */
    renameSync(p.dir, join(p.base, "project-moved"));
    cpSync(join(p.base, "project-moved", FOLDER_MAIN_FILE), join(p.outside, FOLDER_MAIN_FILE));
    symlinkSync(p.outside, p.dir);
    const before = readdirSync(p.outside).sort();
    await expect(store.write(docWith(png(71)))).rejects.toBeInstanceOf(OutsideFolder);
    expect(readdirSync(p.outside).sort()).toEqual(before);
    expect(readFileSync(join(p.outside, FOLDER_MAIN_FILE), "utf8")).toBe(readFileSync(join(p.base, "project-moved", FOLDER_MAIN_FILE), "utf8"));
    await expect(store.read()).rejects.toBeInstanceOf(OutsideFolder);
  });

  it("still read, write and take away what is the folder's own", async () => {
    const p = await project();
    const store = new ProjectFileStore(p.dir);
    expect(heroSrc(await store.read())).toBe(dataUrl(p.mine));
    /* the old picture is the format's own, written long enough ago to be taken away */
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(p.asset, old, old);
    const next = png(83);
    await store.write(docWith(next));
    const names = readdirSync(join(p.dir, FOLDER_ASSET_DIR));
    expect(names).toEqual([`${digest(bytesToBase64(next))}.png`]);
    expect(heroSrc(await new ProjectFileStore(p.dir).read())).toBe(dataUrl(next));
  });
});
