/* The asset manifest of a project bound to a folder, read through the File System Access API: files found by their
 * path inside the folder and nowhere else, and the manifest read again when the pipeline writes one of them anew. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { folderReader, AssetWatch } from "./assetLink";
import type { DirHandle } from "./fileLink";
import type { AssetCatalog } from "../assetCatalog";

let clock = 1;

/** a folder in memory, the little of a directory handle the reader uses */
function dir(name: string, tree: Record<string, Uint8Array | Record<string, unknown>>): DirHandle {
  const files = new Map<string, { data: Uint8Array; modified: number }>();
  const dirs = new Map<string, DirHandle>();
  for (const [k, v] of Object.entries(tree)) {
    if (v instanceof Uint8Array) files.set(k, { data: v, modified: clock++ });
    else dirs.set(k, dir(k, v as Record<string, Uint8Array>));
  }
  const missing = () => Promise.reject(new DOMException("missing", "NotFoundError"));
  return {
    kind: "directory",
    name,
    getFileHandle: async (n: string) => {
      const f = files.get(n);
      if (!f) return missing();
      return { kind: "file", name: n, getFile: async () => new File([f.data as BlobPart], n, { lastModified: f.modified }), write: (d: Uint8Array) => files.set(n, { data: d, modified: clock++ }) };
    },
    getDirectoryHandle: async (n: string) => dirs.get(n) ?? missing(),
    removeEntry: async () => {},
    entries: async function* () {},
  } as unknown as DirHandle;
}

const fixture = (p: string) => new Uint8Array(readFileSync(new URL(`../fixtures/assets/${p}`, import.meta.url)));

describe("a folder's asset manifest", () => {
  it("is read by paths inside the folder only", async () => {
    const root = dir("project", { "asset-manifest.json": fixture("asset-manifest.json"), ui: { "hero.png": fixture("ui/hero.png") } });
    const r = folderReader(root);
    expect(await r.read("ui/hero.png")).toEqual(fixture("ui/hero.png"));
    expect(await r.read("ui/none.png")).toBeNull();
    expect(await r.read("../ui/hero.png")).toBeNull();
    expect(await r.read("/ui/hero.png")).toBeNull();
    expect(await r.stamp("ui/hero.png")).toMatch(/^74:\d+$/);
  });

  it("is read again when the pipeline writes a file anew, and the new picture is drawn", async () => {
    const root = dir("project", { "asset-manifest.json": fixture("asset-manifest.json"), ui: { "hero.png": fixture("ui/hero.png"), "coin.svg": fixture("ui/coin.svg") } });
    const seen: AssetCatalog[] = [];
    const watch = new AssetWatch(folderReader(root), "asset-manifest.json", (c) => seen.push(c), 0);
    await watch.start();
    expect(seen[0].urls["ui/hero"]).toMatch(/^data:image\/png;base64,/);
    await watch.check();
    expect(seen.length).toBe(1);
    const ui = await root.getDirectoryHandle("ui");
    ((await ui.getFileHandle("hero.png")) as unknown as { write(d: Uint8Array): void }).write(fixture("ui/hero-night.png"));
    await watch.check();
    expect(seen.length).toBe(2);
    expect(seen[1].urls["ui/hero"]).not.toBe(seen[0].urls["ui/hero"]);
    /* configured elsewhere: read from there, and a place with none is a catalog without a manifest */
    await watch.setPath("art/asset-manifest.json");
    expect(seen[2].manifest).toBeNull();
    watch.close();
  });
});
