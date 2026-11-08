/* A project kept in sync with a file or a folder, against handles that keep their files in memory the way the File
 * System Access API does: written a moment after a change, never over a change made elsewhere without asking, picked
 * up again after the browser asks for permission once more, pictures beside a folder's project file. */

import { beforeEach, describe, expect, it } from "vitest";
import { bytesToBase64, FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, serializeProject } from "../core/projectFile";
import type { Doc } from "../tokens";
import type { FileRecord } from "./db";
import { FileLink, readFromDisk } from "./fileLink";

type Perm = "granted" | "prompt" | "denied";
let clock = 1_000;

/** Steps made to fail, by where: `asset:` or `main:` and `open` (createWritable), `write` or `close`; `dir:create`
 *  (making m3e-assets/); `remove` (taking a file away). A file's bytes change only on a close that goes through, as
 *  with the real API's write aside and swap. */
const faults = new Set<string>();
const fault = (what: string) => {
  if (faults.has(what)) throw new DOMException(`${what} failed`, "UnknownError");
};
beforeEach(() => faults.clear());

class MemFile {
  kind = "file" as const;
  data: string | Uint8Array = "";
  modified = 0;
  writes = 0;
  perm: Perm = "granted";
  constructor(readonly name: string) {}
  private get role() {
    return this.name.endsWith(".json") ? "main" : "asset";
  }
  async queryPermission() {
    return this.perm;
  }
  async requestPermission() {
    this.perm = "granted";
    return this.perm;
  }
  async getFile() {
    return new File([this.data as BlobPart], this.name, { lastModified: this.modified });
  }
  async createWritable() {
    fault(`${this.role}:open`);
    let next: string | Uint8Array = "";
    return {
      write: async (d: string | Uint8Array) => {
        fault(`${this.role}:write`);
        next = d;
      },
      close: async () => {
        fault(`${this.role}:close`);
        this.data = next;
        this.modified = ++clock;
        this.writes++;
      },
      abort: async () => {},
    };
  }
  /** a change made by another program */
  touch(text: string) {
    this.data = text;
    this.modified = ++clock;
  }
}

class MemDir {
  kind = "directory" as const;
  files = new Map<string, MemFile>();
  dirs = new Map<string, MemDir>();
  perm: Perm = "granted";
  constructor(readonly name: string) {}
  async queryPermission() {
    return this.perm;
  }
  async requestPermission() {
    this.perm = "granted";
    return this.perm;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    let f = this.files.get(name);
    if (!f) {
      if (!o?.create) throw new DOMException("missing", "NotFoundError");
      f = new MemFile(name);
      this.files.set(name, f);
    }
    return f;
  }
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    let d = this.dirs.get(name);
    if (!d) {
      if (!o?.create) throw new DOMException("missing", "NotFoundError");
      fault("dir:create");
      d = new MemDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async removeEntry(name: string) {
    fault("remove");
    this.files.delete(name);
  }
  /** a file put here by something other than the editor */
  place(name: string, data: Uint8Array, modified = ++clock) {
    const f = new MemFile(name);
    f.data = data;
    f.modified = modified;
    this.files.set(name, f);
    return f;
  }
  async *entries(): AsyncIterable<[string, MemFile | MemDir]> {
    for (const e of this.files) yield e;
    for (const e of this.dirs) yield e;
  }
}

const doc = (title: string, extra: Partial<Doc> = {}): Doc => ({ groups: [], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], title, paletteKey: "purple", frame: "phone", brief: "", theme: { style: "material" }, ...extra }) as unknown as Doc;
const pictureBytes = (seed = 0) => new Uint8Array(4000).map((_, i) => (i * (seed + 1) + seed) & 0xff);
const picture = (seed = 0) => `data:image/png;base64,${bytesToBase64(pictureBytes(seed))}`;
const withPicture = (d: Doc, src: string): Doc => ({ ...d, groups: [{ id: "g", x: 0, y: 0, axis: "y", items: [{ id: "i", kind: "component", component: "image", label: "Image", icon: null, variant: "filled", props: { src } }] }] }) as Doc;

function linked(handle: MemFile | MemDir, kind: "file" | "folder") {
  const saved: FileRecord[] = [];
  const rec: FileRecord = { id: "p", kind, handle: handle as unknown as FileSystemHandle, name: handle.name };
  const link = new FileLink(rec, { resolve: async (d) => d, save: async (r) => void saved.push({ ...r }) });
  return { link, rec, saved };
}

const text = (f: MemFile) => (typeof f.data === "string" ? f.data : new TextDecoder().decode(f.data));

describe("a file kept in sync", () => {
  it("is written a moment after a change, the project file's own text, and not again for the same document", async () => {
    const f = new MemFile("shop.json");
    const { link, saved } = linked(f, "file");
    link.schedule(doc("Shop"));
    expect(link.state.status).toBe("pending");
    await link.flush();
    expect(text(f)).toBe(serializeProject(doc("Shop")).text);
    expect(link.state.status).toBe("saved");
    expect(saved.at(-1)?.written?.size).toBe(text(f).length);
    link.schedule(doc("Shop"));
    await link.flush();
    expect(f.writes).toBe(1);
  });

  it("is not written over when something else changed it: the person chooses which version stands", async () => {
    const f = new MemFile("shop.json");
    const { link } = linked(f, "file");
    link.schedule(doc("Shop"));
    await link.flush();
    const theirs = serializeProject(doc("Theirs")).text;
    f.touch(theirs);
    link.schedule(doc("Mine"));
    await link.flush();
    expect(link.state.status).toBe("conflict");
    expect(text(f)).toBe(theirs);
    /* the file's version, brought in: writing it back is no conflict */
    const loaded = await link.loadDisk();
    expect(loaded?.title).toBe("Theirs");
    link.schedule(loaded!);
    await link.flush();
    expect(link.state.status).toBe("saved");

    f.touch(serializeProject(doc("Again")).text);
    link.schedule(doc("Mine"));
    await link.flush();
    expect(link.state.status).toBe("conflict");
    await link.keepMine(doc("Mine"));
    expect(text(f)).toBe(serializeProject(doc("Mine")).text);
    expect(link.state.status).toBe("saved");
  });

  it("waits for the person after a reload, keeping the latest document, and writes it once allowed", async () => {
    const f = new MemFile("shop.json");
    f.perm = "prompt";
    const { link } = linked(f, "file");
    await link.check();
    expect(link.state.status).toBe("reconnect");
    link.schedule(doc("Later"));
    await link.flush();
    expect(f.writes).toBe(0);
    expect(await link.reconnect()).toBe(true);
    await link.flush();
    expect(text(f)).toBe(serializeProject(doc("Later")).text);
  });

  it("finds on opening a file changed while the editor was away", async () => {
    const f = new MemFile("shop.json");
    const first = linked(f, "file");
    first.link.schedule(doc("Shop"));
    await first.link.flush();
    f.touch(serializeProject(doc("Edited elsewhere")).text);
    const again = new FileLink({ ...first.rec }, { resolve: async (d) => d, save: async () => {} });
    await again.check();
    expect(again.state.status).toBe("conflict");
  });
});

describe("a folder kept in sync", () => {
  it("holds the project file and its pictures as files of their own, and lets go of a picture no longer used", async () => {
    const dir = new MemDir("design");
    const { link } = linked(dir, "folder");
    const pic = picture();
    link.schedule(withPicture(doc("Shop"), pic));
    await link.flush();
    const main = dir.files.get(FOLDER_MAIN_FILE)!;
    expect(text(main)).toContain("m3e-file:m3e-assets/");
    const assets = dir.dirs.get(FOLDER_ASSET_DIR)!;
    expect([...assets.files.keys()]).toHaveLength(1);
    const back = await readFromDisk(dir as unknown as FileSystemHandle);
    expect(back.doc?.groups[0].items[0].props?.src).toBe(pic);

    link.schedule(doc("Shop"));
    await link.flush();
    expect([...assets.files.keys()]).toHaveLength(0);
  });

  /** what the folder holds read back: its title and its pictures ("" for one that is missing) */
  const onDisk = async (dir: MemDir) => {
    const back = await readFromDisk(dir as unknown as FileSystemHandle);
    return { title: back.doc?.title, pictures: (back.doc?.groups ?? []).flatMap((g) => g.items.map((it) => it.props?.src)) };
  };
  const assetName = (src: string) => serializeProject(withPicture(doc("x"), src), { assets: "files" }).files[0].path.slice(FOLDER_ASSET_DIR.length + 1);
  const assetsOf = (dir: MemDir) => dir.dirs.get(FOLDER_ASSET_DIR)!;
  const A = picture(1);
  const B = picture(2);

  it("never takes away a file put in m3e-assets/ by hand, nor one whose bytes are not what its name says", async () => {
    const dir = new MemDir("design");
    const assets = await dir.getDirectoryHandle(FOLDER_ASSET_DIR, { create: true });
    assets.place("logo.png", pictureBytes(7));
    assets.place("notes.txt", new TextEncoder().encode("mine"));
    /* named the way the format names its pictures, but holding something else */
    assets.place(assetName(picture(8)), pictureBytes(9));
    const { link } = linked(dir, "folder");
    link.schedule(withPicture(doc("One"), A));
    await link.flush();
    link.schedule(withPicture(doc("Two"), B));
    await link.flush();
    expect(link.state.status).toBe("saved");
    expect([...assets.files.keys()].sort()).toEqual([assetName(B), assetName(picture(8)), "logo.png", "notes.txt"].sort());
    expect(await onDisk(dir)).toEqual({ title: "Two", pictures: [B] });
  });

  it("takes away another program's picture only once it is no longer new and holds what its name says", async () => {
    const dir = new MemDir("design");
    const assets = await dir.getDirectoryHandle(FOLDER_ASSET_DIR, { create: true });
    const C = picture(3);
    const D = picture(4);
    /* written by the MCP server long ago, and a moment ago (its own save may still be under way) */
    assets.place(assetName(C), pictureBytes(3), 5);
    assets.place(assetName(D), pictureBytes(4), Date.now());
    const { link } = linked(dir, "folder");
    link.schedule(withPicture(doc("One"), A));
    await link.flush();
    expect([...assets.files.keys()].sort()).toEqual([assetName(A), assetName(D)].sort());
  });

  it.each(["asset:open", "asset:write", "asset:close", "main:open", "main:write", "main:close"])("a save that fails at %s leaves the version before it whole on disk, and goes through once it can", async (stage) => {
    const dir = new MemDir("design");
    const { link } = linked(dir, "folder");
    link.schedule(withPicture(doc("One"), A));
    await link.flush();
    expect(await onDisk(dir)).toEqual({ title: "One", pictures: [A] });

    faults.add(stage);
    link.schedule(withPicture(doc("Two"), B));
    await link.flush();
    expect(link.state.status).toBe("error");
    expect(await onDisk(dir)).toEqual({ title: "One", pictures: [A] });

    /* the document waits for the next try, and the folder ends up holding it and only what it needs */
    faults.clear();
    await link.flush();
    expect(link.state.status).toBe("saved");
    expect(await onDisk(dir)).toEqual({ title: "Two", pictures: [B] });
    expect([...assetsOf(dir).files.keys()]).toEqual([assetName(B)]);
  });

  it("does not write a project file that refers to pictures when their folder cannot be made", async () => {
    const dir = new MemDir("design");
    const { link } = linked(dir, "folder");
    link.schedule(doc("Plain"));
    await link.flush();
    faults.add("dir:create");
    link.schedule(withPicture(doc("Pictured"), A));
    await link.flush();
    expect(link.state.status).toBe("error");
    expect(await onDisk(dir)).toEqual({ title: "Plain", pictures: [] });
    faults.clear();
    await link.flush();
    expect(await onDisk(dir)).toEqual({ title: "Pictured", pictures: [A] });
  });

  it("keeps a picture it could not take away for the next save, which takes it", async () => {
    const dir = new MemDir("design");
    const { link } = linked(dir, "folder");
    link.schedule(withPicture(doc("One"), A));
    await link.flush();
    faults.add("remove");
    link.schedule(withPicture(doc("Two"), B));
    await link.flush();
    expect(link.state.status).toBe("saved");
    expect(await onDisk(dir)).toEqual({ title: "Two", pictures: [B] });
    expect([...assetsOf(dir).files.keys()].sort()).toEqual([assetName(A), assetName(B)].sort());
    faults.clear();
    link.schedule(withPicture(doc("Three"), B));
    await link.flush();
    expect([...assetsOf(dir).files.keys()]).toEqual([assetName(B)]);
  });

  it("knows a picture written for a save that then failed as its own, after a reload too", async () => {
    const dir = new MemDir("design");
    const first = linked(dir, "folder");
    first.link.schedule(withPicture(doc("One"), A));
    await first.link.flush();
    faults.add("main:close");
    first.link.schedule(withPicture(doc("Two"), B));
    await first.link.flush();
    faults.clear();
    /* the tab closed; the next one starts from the record the browser kept, and goes back to the first version */
    const kept = first.saved.at(-1)!;
    expect(kept.assets?.[assetName(B)]?.own).toBe(true);
    const again = new FileLink({ ...kept }, { resolve: async (d) => d, save: async () => {} });
    again.schedule(withPicture(doc("One again"), A));
    await again.flush();
    expect([...assetsOf(dir).files.keys()]).toEqual([assetName(A)]);
  });

  it("finds a picture of the right name holding the wrong bytes, and writes it again", async () => {
    const dir = new MemDir("design");
    const assets = await dir.getDirectoryHandle(FOLDER_ASSET_DIR, { create: true });
    /* a broken copy left by an earlier tool, before the first save */
    assets.place(assetName(A), pictureBytes(1).slice(0, 100));
    const { link } = linked(dir, "folder");
    link.schedule(withPicture(doc("One"), A));
    await link.flush();
    expect(await onDisk(dir)).toEqual({ title: "One", pictures: [A] });
    /* broken again after the editor wrote it, the same size this time */
    const bad = pictureBytes(1);
    bad[10] ^= 0xff;
    assets.place(assetName(A), bad);
    link.schedule(withPicture(doc("One, renamed"), A));
    await link.flush();
    expect(await onDisk(dir)).toEqual({ title: "One, renamed", pictures: [A] });
  });

  it("reads a folder's project when it is the only project file there under another name", async () => {
    const dir = new MemDir("old");
    (await dir.getFileHandle("m3e-canvas Shop.json", { create: true })).touch(serializeProject(doc("Shop")).text);
    (await dir.getFileHandle("package.json", { create: true })).touch('{"name":"x"}');
    expect((await readFromDisk(dir as unknown as FileSystemHandle)).doc?.title).toBe("Shop");
  });
});
