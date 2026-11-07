import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { DirHandle } from "../projects/fileLink";
import { exportToDirectory, folderState } from "./fsAccess";
import { CONFLICT_SUFFIX, MANIFEST_PATH } from "./merge";
import { exportToFolder, FolderRefused } from "./nodeWriter";
import { generated, seeded, type Product, type ProductFiles } from "./types";

/* The two writers carry out the same plan: on a real folder from Node (scripts/export.ts, MCP), and through a folder's
 * handle in the browser (File System Access), here a folder in memory with the same handle methods. */

const product = (files: ProductFiles): Product => ({ name: "app", files, warnings: [], differences: [] });
const base = (): ProductFiles => ({
  "apps/web/src/generated/App.tsx": generated("export const App = 1\n"),
  "apps/web/src/generated/screens/Old.tsx": generated("old\n"),
  "apps/web/src/custom/setup.ts": seeded("export async function setup() {}\n"),
  "apps/web/public/images/a.png": generated(new Uint8Array([137, 80, 78, 71])),
});

const temps: string[] = [];
afterAll(async () => {
  for (const t of temps) await rm(t, { recursive: true, force: true });
});
const temp = async () => {
  const dir = await mkdtemp(join(tmpdir(), "m3e-export-"));
  temps.push(dir);
  return dir;
};

describe("exporting into a folder from Node", () => {
  it("writes the product, then on a second export keeps custom code and reports what someone edited", async () => {
    const dir = join(await temp(), "out");
    const first = await exportToFolder(dir, product(base()));
    expect(first.conflicts).toEqual([]);
    expect(await readFile(join(dir, "apps/web/src/generated/App.tsx"), "utf8")).toBe("export const App = 1\n");
    expect(new Uint8Array(await readFile(join(dir, "apps/web/public/images/a.png")))).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(JSON.parse(await readFile(join(dir, MANIFEST_PATH), "utf8")).files["apps/web/src/custom/setup.ts"].kind).toBe("seeded");

    await writeFile(join(dir, "apps/web/src/custom/setup.ts"), "// mine\n");
    await writeFile(join(dir, "apps/web/src/generated/App.tsx"), "// edited\n");
    const next = base();
    next["apps/web/src/generated/App.tsx"] = generated("export const App = 2\n");
    delete next["apps/web/src/generated/screens/Old.tsx"];
    const second = await exportToFolder(dir, product(next));
    expect(await readFile(join(dir, "apps/web/src/custom/setup.ts"), "utf8")).toBe("// mine\n");
    expect(await readFile(join(dir, "apps/web/src/generated/App.tsx"), "utf8")).toBe("// edited\n");
    expect(await readFile(join(dir, `apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}`), "utf8")).toBe("export const App = 2\n");
    expect(second.conflicts.map((c) => c.path)).toEqual(["apps/web/src/generated/App.tsx"]);
    /* the removed screen, and the folder it leaves empty */
    expect(second.removed).toEqual(["apps/web/src/generated/screens/Old.tsx"]);
    expect(existsSync(join(dir, "apps/web/src/generated/screens"))).toBe(false);
  });

  it("refuses a folder that holds other things and no export, unless forced", async () => {
    const dir = await temp();
    await writeFile(join(dir, "notes.txt"), "mine");
    await expect(exportToFolder(dir, product(base()))).rejects.toBeInstanceOf(FolderRefused);
    const forced = await exportToFolder(dir, product(base()), { force: true });
    expect(forced.writes.length).toBeGreaterThan(0);
    expect(await readFile(join(dir, "notes.txt"), "utf8")).toBe("mine");
  });

  /* export_product takes any folder an MCP client names, and force: words an agent read somewhere could otherwise have
     a product's files (package.json, AGENTS.md, server/…) put straight into someone's home folder */
  it("never exports into the home folder or a folder holding it, forced or not", async () => {
    const home = await temp();
    await mkdir(join(home, "work"));
    const was = process.env.HOME;
    process.env.HOME = home;
    try {
      for (const dir of [home, join(home, "work", ".."), dirname(home)]) await expect(exportToFolder(dir, product(base()), { force: true })).rejects.toBeInstanceOf(FolderRefused);
      expect(existsSync(join(home, MANIFEST_PATH))).toBe(false);
      /* a folder in it is fine */
      expect((await exportToFolder(join(home, "work", "app"), product(base()))).writes.length).toBeGreaterThan(0);
    } finally {
      process.env.HOME = was;
    }
  });

  it("never writes through a link out of the folder", async () => {
    const dir = await temp();
    const outside = await temp();
    await mkdir(join(dir, ".m3e"), { recursive: true });
    await writeFile(join(dir, ".m3e/manifest.json"), "{}");
    await mkdir(join(dir, "apps"), { recursive: true });
    await symlink(outside, join(dir, "apps/web"));
    await expect(exportToFolder(dir, product(base()))).rejects.toThrow(/link/);
    expect(existsSync(join(outside, "src"))).toBe(false);
  });
});

/* ---------- a folder handle in memory ---------- */

type Node = Map<string, Node | Uint8Array>;
function memoryDir(root: Node = new Map(), name = "out"): DirHandle {
  const err = (n: string) => new DOMException(n, "NotFoundError");
  const handle = {
    kind: "directory",
    name,
    async getDirectoryHandle(child: string, o?: { create?: boolean }) {
      if (child.includes("/") || child === ".." || child === ".") throw new TypeError("bad name");
      let at = root.get(child);
      if (!at && o?.create) root.set(child, (at = new Map()));
      if (!(at instanceof Map)) throw err(child);
      return memoryDir(at, child);
    },
    async getFileHandle(child: string, o?: { create?: boolean }) {
      if (child.includes("/") || child === ".." || child === ".") throw new TypeError("bad name");
      if (!root.has(child) && o?.create) root.set(child, new Uint8Array());
      const at = root.get(child);
      if (!(at instanceof Uint8Array)) throw err(child);
      return {
        kind: "file",
        name: child,
        getFile: async () => new File([root.get(child) as Uint8Array as BlobPart], child),
        createWritable: async () => {
          const parts: Uint8Array[] = [];
          return {
            write: async (d: string | BufferSource) => void parts.push(typeof d === "string" ? new TextEncoder().encode(d) : new Uint8Array(d as ArrayBuffer)),
            close: async () => void root.set(child, new Uint8Array(parts.flatMap((p) => [...p]))),
          };
        },
      };
    },
    async removeEntry(child: string) {
      if (!root.delete(child)) throw err(child);
    },
    async *entries() {
      for (const [k, v] of root) yield [k, { kind: v instanceof Map ? "directory" : "file", name: k }];
    },
  };
  return handle as unknown as DirHandle;
}
const read = (root: Node, path: string) => {
  let at: Node | Uint8Array | undefined = root;
  for (const piece of path.split("/")) at = at instanceof Map ? at.get(piece) : undefined;
  return at instanceof Uint8Array ? new TextDecoder().decode(at) : undefined;
};

describe("exporting into a folder the browser picked", () => {
  it("does what the Node writer does, through the folder's handle", async () => {
    const tree: Node = new Map();
    const dir = memoryDir(tree);
    expect(await folderState(dir)).toEqual({ empty: true, exported: false });
    const seen: number[] = [];
    await exportToDirectory(dir, product(base()), (done) => seen.push(done));
    expect(seen.length).toBeGreaterThan(0);
    expect(await folderState(dir)).toEqual({ empty: false, exported: true });
    expect(read(tree, "apps/web/src/generated/App.tsx")).toBe("export const App = 1\n");

    const custom = (tree.get("apps") as Node).get("web") as Node;
    ((custom.get("src") as Node).get("custom") as Node).set("setup.ts", new TextEncoder().encode("// mine\n"));
    ((custom.get("src") as Node).get("generated") as Node).set("App.tsx", new TextEncoder().encode("// edited\n"));
    const next = base();
    next["apps/web/src/generated/App.tsx"] = generated("export const App = 2\n");
    delete next["apps/web/src/generated/screens/Old.tsx"];
    const plan = await exportToDirectory(dir, product(next));
    expect(read(tree, "apps/web/src/custom/setup.ts")).toBe("// mine\n");
    expect(read(tree, "apps/web/src/generated/App.tsx")).toBe("// edited\n");
    expect(read(tree, `apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}`)).toBe("export const App = 2\n");
    expect(plan.conflicts.map((c) => c.path)).toEqual(["apps/web/src/generated/App.tsx"]);
    expect(plan.removed).toEqual(["apps/web/src/generated/screens/Old.tsx"]);
    expect(((custom.get("src") as Node).get("generated") as Node).has("screens")).toBe(false);
  });

  it("refuses a path that would leave the folder before asking the handle for it", async () => {
    await expect(exportToDirectory(memoryDir(), product({ "../x.ts": generated("x") }))).rejects.toThrow(/refusing/);
  });
});
