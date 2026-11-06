/* A project kept in sync with a file or a folder, against handles that keep their files in memory the way the File
 * System Access API does: written a moment after a change, never over a change made elsewhere without asking, picked
 * up again after the browser asks for permission once more, pictures beside a folder's project file. */

import { describe, expect, it } from "vitest";
import { bytesToBase64, FOLDER_ASSET_DIR, FOLDER_MAIN_FILE, serializeProject } from "../core/projectFile";
import type { Doc } from "../tokens";
import type { FileRecord } from "./db";
import { FileLink, readFromDisk } from "./fileLink";

type Perm = "granted" | "prompt" | "denied";
let clock = 1_000;

class MemFile {
  kind = "file" as const;
  data: string | Uint8Array = "";
  modified = 0;
  writes = 0;
  perm: Perm = "granted";
  constructor(readonly name: string) {}
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
    let next: string | Uint8Array = "";
    return {
      write: async (d: string | Uint8Array) => {
        next = d;
      },
      close: async () => {
        this.data = next;
        this.modified = ++clock;
        this.writes++;
      },
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
      d = new MemDir(name);
      this.dirs.set(name, d);
    }
    return d;
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
  async *entries(): AsyncIterable<[string, MemFile | MemDir]> {
    for (const e of this.files) yield e;
    for (const e of this.dirs) yield e;
  }
}

const doc = (title: string, extra: Partial<Doc> = {}): Doc => ({ groups: [], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], title, paletteKey: "purple", frame: "phone", brief: "", theme: { style: "material" }, ...extra }) as unknown as Doc;
const picture = () => `data:image/png;base64,${bytesToBase64(new Uint8Array(4000).map((_, i) => i & 0xff))}`;
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

  it("reads a folder's project when it is the only project file there under another name", async () => {
    const dir = new MemDir("old");
    (await dir.getFileHandle("m3e-canvas Shop.json", { create: true })).touch(serializeProject(doc("Shop")).text);
    (await dir.getFileHandle("package.json", { create: true })).touch('{"name":"x"}');
    expect((await readFromDisk(dir as unknown as FileSystemHandle)).doc?.title).toBe("Shop");
  });
});
