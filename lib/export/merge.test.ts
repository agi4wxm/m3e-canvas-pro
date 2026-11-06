import { describe, expect, it } from "vitest";
import { CONFLICT_SUFFIX, MANIFEST_PATH, formatManifest, mergedPackageJson, ownedKeys, parseManifest, pathsToHash, pathsToRead, planExport, planSummary, type DiskHashes, type ExportPlan, type Manifest } from "./merge";
import { sha256 } from "./sha256";
import { generated, seeded, type ProductFiles } from "./types";

/* The merge is the promise that exporting again never destroys custom code: each rule of lib/export/merge.ts, and the
 * folder it leaves, played over several exports in a row. */

/** a folder in memory: what the plan reads, and what carrying it out leaves */
class Folder {
  files = new Map<string, string | Uint8Array>();
  hashes(paths: string[]): DiskHashes {
    return Object.fromEntries(paths.filter((p) => this.files.has(p)).map((p) => [p, sha256(this.files.get(p)!)]));
  }
  text(path: string) {
    const v = this.files.get(path);
    return typeof v === "string" ? v : undefined;
  }
  manifest(): Manifest | null {
    return parseManifest(this.text(MANIFEST_PATH));
  }
  /** plans an export of `next` into this folder and carries it out */
  export(next: ProductFiles, product = "app"): ExportPlan {
    const previous = this.manifest();
    const texts = Object.fromEntries(pathsToRead(next).map((p) => [p, this.text(p)]));
    const plan = planExport({ product, next, disk: this.hashes(pathsToHash(next, previous)), texts, previous });
    for (const w of plan.writes) this.files.set(w.path, w.body);
    for (const d of plan.deletes) this.files.delete(d);
    return plan;
  }
}

const pkg = (deps: Record<string, string>, extra: Record<string, unknown> = {}) => ({ ...generated(`${JSON.stringify({ name: "@app/web", version: "0.1.0", scripts: { build: "vite build" }, dependencies: deps, ...extra }, null, 2)}\n`), merge: "package.json" as const });

const product = (over: ProductFiles = {}): ProductFiles => ({
  "apps/web/src/generated/App.tsx": generated("export const App = 1\n"),
  "apps/web/src/custom/setup.ts": seeded("export async function setup() {}\n"),
  "server/src/handlers/getHealth.ts": seeded("// stub\n"),
  "apps/web/public/images/a.png": generated(new Uint8Array([1, 2, 3])),
  "apps/web/package.json": pkg({ react: "19.3.0" }),
  ...over,
});

describe("a first export", () => {
  it("writes every file and a manifest listing each with its hash and kind", () => {
    const folder = new Folder();
    const plan = folder.export(product());
    expect(plan.writes.map((w) => w.why).sort()).toEqual(["manifest", "new", "new", "new", "seed", "seed"]);
    expect(plan.writes.at(-1)!.path).toBe(MANIFEST_PATH);
    expect(plan.conflicts).toEqual([]);
    const m = folder.manifest()!;
    expect(Object.keys(m.files).sort()).toEqual(Object.keys(product()).sort());
    expect(m.files["apps/web/src/generated/App.tsx"]).toEqual({ kind: "generated", sha256: sha256("export const App = 1\n") });
    expect(m.files["apps/web/src/custom/setup.ts"].kind).toBe("seeded");
    expect(m.files["apps/web/public/images/a.png"].sha256).toBe(sha256(new Uint8Array([1, 2, 3])));
    expect(m.files["apps/web/package.json"].keys).toContain("dependencies.react");
  });

  it("writes the same manifest for the same product, keys in order", () => {
    const a = new Folder();
    const b = new Folder();
    a.export(product());
    const reversed = Object.fromEntries(Object.entries(product()).reverse());
    b.export(reversed);
    expect(a.text(MANIFEST_PATH)).toBe(b.text(MANIFEST_PATH));
    expect(a.text(MANIFEST_PATH)).toBe(formatManifest(parseManifest(a.text(MANIFEST_PATH))!));
  });

  it("into a folder that has a file of the same name: theirs stays, ours goes beside it", () => {
    const folder = new Folder();
    folder.files.set("apps/web/src/generated/App.tsx", "mine\n");
    const plan = folder.export(product());
    expect(plan.conflicts).toEqual([{ path: "apps/web/src/generated/App.tsx", copy: `apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}` }]);
    expect(folder.text("apps/web/src/generated/App.tsx")).toBe("mine\n");
    expect(folder.text(`apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}`)).toBe("export const App = 1\n");
  });

  it("into a folder that already has a file as the export makes it: unchanged, no conflict", () => {
    const folder = new Folder();
    folder.files.set("apps/web/src/generated/App.tsx", "export const App = 1\n");
    const plan = folder.export(product());
    expect(plan.unchanged).toEqual(["apps/web/src/generated/App.tsx"]);
    expect(plan.conflicts).toEqual([]);
  });
});

describe("exporting again", () => {
  it("writes nothing when nothing changed, not even the manifest", () => {
    const folder = new Folder();
    folder.export(product());
    const plan = folder.export(product());
    expect(plan.writes).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.unchanged.sort()).toEqual(["apps/web/package.json", "apps/web/public/images/a.png", "apps/web/src/generated/App.tsx"]);
    expect(plan.kept.sort()).toEqual(["apps/web/src/custom/setup.ts", "server/src/handlers/getHealth.ts"]);
    expect(planSummary(plan)).toMatchObject({ written: 0, conflicts: 0, removed: 0 });
  });

  it("rewrites a generated file nobody changed", () => {
    const folder = new Folder();
    folder.export(product());
    const plan = folder.export(product({ "apps/web/src/generated/App.tsx": generated("export const App = 2\n") }));
    expect(plan.writes.filter((w) => w.why === "update").map((w) => w.path)).toEqual(["apps/web/src/generated/App.tsx"]);
    expect(folder.text("apps/web/src/generated/App.tsx")).toBe("export const App = 2\n");
  });

  it("never touches a seeded file that is there, whatever it holds, and writes one that is missing", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("server/src/handlers/getHealth.ts", "// implemented\n");
    folder.files.delete("apps/web/src/custom/setup.ts");
    const plan = folder.export(product({ "server/src/handlers/getHealth.ts": seeded("// a newer stub\n") }));
    expect(folder.text("server/src/handlers/getHealth.ts")).toBe("// implemented\n");
    expect(plan.kept).toEqual(["server/src/handlers/getHealth.ts"]);
    expect(plan.writes.find((w) => w.path === "apps/web/src/custom/setup.ts")?.why).toBe("seed");
  });

  it("reports a generated file someone edited, writes the new version beside it, and keeps reporting it", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("apps/web/src/generated/App.tsx", "export const App = 1 // tweaked\n");
    const copy = `apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}`;
    const plan = folder.export(product({ "apps/web/src/generated/App.tsx": generated("export const App = 2\n") }));
    expect(plan.conflicts).toEqual([{ path: "apps/web/src/generated/App.tsx", copy }]);
    expect(folder.text("apps/web/src/generated/App.tsx")).toBe("export const App = 1 // tweaked\n");
    expect(folder.text(copy)).toBe("export const App = 2\n");
    expect(folder.manifest()!.pending[copy]).toBe(sha256("export const App = 2\n"));
    /* the same export again: still a conflict, the copy already there is not written again */
    const again = folder.export(product({ "apps/web/src/generated/App.tsx": generated("export const App = 2\n") }));
    expect(again.conflicts.map((c) => c.path)).toEqual(["apps/web/src/generated/App.tsx"]);
    expect(again.writes.map((w) => w.path)).toEqual([]);
  });

  it("settles a conflict once the new version is taken: the copy goes, the file is the export's again", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("apps/web/src/generated/App.tsx", "edited\n");
    const copy = `apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}`;
    folder.export(product({ "apps/web/src/generated/App.tsx": generated("v2\n") }));
    /* the person takes the new version, and leaves the copy where it is */
    folder.files.set("apps/web/src/generated/App.tsx", folder.files.get(copy)!);
    const plan = folder.export(product({ "apps/web/src/generated/App.tsx": generated("v2\n") }));
    expect(plan.conflicts).toEqual([]);
    expect(plan.deletes).toEqual([copy]);
    expect(folder.files.has(copy)).toBe(false);
    expect(folder.manifest()!.pending).toEqual({});
    const next = folder.export(product({ "apps/web/src/generated/App.tsx": generated("v3\n") }));
    expect(next.writes.find((w) => w.path === "apps/web/src/generated/App.tsx")?.why).toBe("update");
  });

  it("leaves a conflict's copy someone edited", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("apps/web/src/generated/App.tsx", "edited\n");
    const copy = `apps/web/src/generated/App.tsx${CONFLICT_SUFFIX}`;
    folder.export(product({ "apps/web/src/generated/App.tsx": generated("v2\n") }));
    folder.files.set(copy, "notes of mine\n");
    folder.files.set("apps/web/src/generated/App.tsx", "v2\n");
    const plan = folder.export(product({ "apps/web/src/generated/App.tsx": generated("v2\n") }));
    expect(plan.orphaned).toEqual([copy]);
    expect(folder.text(copy)).toBe("notes of mine\n");
  });

  it("deletes a generated file the product no longer has, unless someone changed it", () => {
    const folder = new Folder();
    folder.export(product({ "apps/web/src/generated/screens/Old.tsx": generated("old\n"), "apps/web/src/generated/screens/Kept.tsx": generated("kept\n") }));
    folder.files.set("apps/web/src/generated/screens/Kept.tsx", "kept, and changed\n");
    const plan = folder.export(product());
    expect(plan.removed).toEqual(["apps/web/src/generated/screens/Old.tsx"]);
    expect(plan.orphaned).toEqual(["apps/web/src/generated/screens/Kept.tsx"]);
    expect(folder.files.has("apps/web/src/generated/screens/Old.tsx")).toBe(false);
    expect(folder.text("apps/web/src/generated/screens/Kept.tsx")).toBe("kept, and changed\n");
    expect(folder.manifest()!.files["apps/web/src/generated/screens/Kept.tsx"]).toBeUndefined();
  });

  it("never deletes a seeded file the product no longer seeds: it is custom code, reported as an orphan", () => {
    const folder = new Folder();
    folder.export(product());
    const next = product();
    delete next["server/src/handlers/getHealth.ts"];
    const plan = folder.export(next);
    expect(plan.deletes).toEqual([]);
    expect(plan.customOrphans).toEqual(["server/src/handlers/getHealth.ts"]);
    expect(planSummary(plan).customOrphans).toBe(1);
    expect(folder.text("server/src/handlers/getHealth.ts")).toBe("// stub\n");
  });

  it("reports an orphan of custom code at every export until someone deletes it, and takes it back when it returns", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("server/src/handlers/getHealth.ts", "// implemented\n");
    const next = product();
    delete next["server/src/handlers/getHealth.ts"];
    folder.export(next);
    /* still in the manifest, so the next export still knows it is custom code of this product */
    expect(folder.manifest()!.files["server/src/handlers/getHealth.ts"]?.kind).toBe("seeded");
    expect(folder.export(next).customOrphans).toEqual(["server/src/handlers/getHealth.ts"]);
    /* the operation comes back: its handler is the one written, kept */
    const back = folder.export(product());
    expect(back.customOrphans).toEqual([]);
    expect(back.kept).toContain("server/src/handlers/getHealth.ts");
    expect(folder.text("server/src/handlers/getHealth.ts")).toBe("// implemented\n");
    /* deleted while it was an orphan: no longer reported, gone from the manifest */
    folder.export(next);
    folder.files.delete("server/src/handlers/getHealth.ts");
    const gone = folder.export(next);
    expect(gone.customOrphans).toEqual([]);
    expect(folder.manifest()!.files["server/src/handlers/getHealth.ts"]).toBeUndefined();
  });

  it("seeds the handler of a new operation and leaves every other one as it is", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("server/src/handlers/getHealth.ts", "// implemented\n");
    const plan = folder.export(product({ "server/src/handlers/listThings.ts": seeded("// stub\n") }));
    expect(plan.writes.filter((w) => w.why === "seed").map((w) => w.path)).toEqual(["server/src/handlers/listThings.ts"]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.customOrphans).toEqual([]);
    expect(folder.text("server/src/handlers/getHealth.ts")).toBe("// implemented\n");
  });

  it("says when the folder held another product", () => {
    const folder = new Folder();
    folder.export(product(), "first");
    expect(folder.export(product(), "second").notes[0]).toContain('"first"');
  });

  it("treats a manifest it cannot trust as none: more conflicts, never a lost edit", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("apps/web/src/generated/App.tsx", "edited\n");
    folder.files.set(MANIFEST_PATH, "{ not json");
    const plan = folder.export(product({ "apps/web/src/generated/App.tsx": generated("v2\n") }));
    expect(plan.conflicts.map((c) => c.path)).toEqual(["apps/web/src/generated/App.tsx"]);
    expect(folder.text("apps/web/src/generated/App.tsx")).toBe("edited\n");
  });
});

describe("a generated package.json", () => {
  it("keeps the dependencies and scripts someone added, and the export's pins win", () => {
    const folder = new Folder();
    folder.export(product());
    const theirs = JSON.parse(folder.text("apps/web/package.json")!);
    theirs.dependencies["left-pad"] = "1.3.0";
    theirs.dependencies.react = "18.0.0";
    theirs.scripts.storybook = "storybook dev";
    theirs.description = "mine";
    folder.files.set("apps/web/package.json", `${JSON.stringify(theirs, null, 2)}\n`);
    const plan = folder.export(product({ "apps/web/package.json": pkg({ react: "19.3.0", motion: "13.5.1" }) }));
    expect(plan.conflicts).toEqual([]);
    expect(plan.merged).toEqual(["apps/web/package.json"]);
    const after = JSON.parse(folder.text("apps/web/package.json")!);
    expect(after.dependencies).toEqual({ "left-pad": "1.3.0", motion: "13.5.1", react: "19.3.0" });
    expect(after.scripts).toEqual({ build: "vite build", storybook: "storybook dev" });
    expect(after.description).toBe("mine");
    /* and exported again as it is: nothing to write */
    expect(folder.export(product({ "apps/web/package.json": pkg({ react: "19.3.0", motion: "13.5.1" }) })).writes).toEqual([]);
  });

  it("takes out what the export wrote before and no longer does, never what someone added", () => {
    const folder = new Folder();
    folder.export(product({ "apps/web/package.json": pkg({ react: "19.3.0", recharts: "3.8.0" }, { overrides: { a: "1" } }) }));
    const theirs = JSON.parse(folder.text("apps/web/package.json")!);
    theirs.dependencies.zod = "4.0.0";
    folder.files.set("apps/web/package.json", `${JSON.stringify(theirs, null, 2)}\n`);
    folder.export(product());
    const after = JSON.parse(folder.text("apps/web/package.json")!);
    expect(after.dependencies).toEqual({ react: "19.3.0", zod: "4.0.0" });
    expect(after.overrides).toBeUndefined();
  });

  it("is a conflict like any file when what is there is not JSON", () => {
    const folder = new Folder();
    folder.export(product());
    folder.files.set("apps/web/package.json", "{ broken");
    const plan = folder.export(product());
    expect(plan.conflicts.map((c) => c.path)).toEqual(["apps/web/package.json"]);
  });

  it("merges workspaces someone listed into the root's", () => {
    const ours = `${JSON.stringify({ name: "app", workspaces: ["packages/api", "apps/web"] })}\n`;
    const theirs = JSON.stringify({ name: "app", workspaces: ["packages/api", "apps/web", "tools/seed"] });
    expect(JSON.parse(mergedPackageJson(theirs, ours, ownedKeys(ours))!).workspaces).toEqual(["packages/api", "apps/web", "tools/seed"]);
    expect(mergedPackageJson("[1]", ours)).toBeNull();
    expect(mergedPackageJson(undefined, ours)).toBeNull();
  });
});

describe("what a plan refuses", () => {
  const plan = (next: ProductFiles) => planExport({ product: "x", next, disk: {}, previous: null });
  it.each(["../escape.ts", "/etc/passwd", "a/../../b", "C:/x", "a\\b", "a/./b", "a//b", "con.txt", "x/aux", "dir/name.", "dir/name ", "a\u0000b"])("a path that leaves the folder or cannot be a file: %j", (path) => {
    expect(() => plan({ [path]: generated("x") })).toThrow(/refusing/);
  });

  it("two paths that are one file where case does not count", () => {
    expect(() => plan({ "a/Home.tsx": generated("1"), "a/home.tsx": generated("2") })).toThrow(/case/);
  });

  it("the manifest's folder, and the conflict copies' names", () => {
    expect(() => plan({ ".m3e/manifest.json": generated("{}") })).toThrow(/manifest/);
    expect(() => plan({ "a.ts.m3e-new": generated("x") })).toThrow(/m3e-new/);
  });

  it("a manifest that names a path outside the folder is no manifest", () => {
    const m = JSON.parse(formatManifest({ format: "m3e-product-manifest", version: 1, generator: "", product: "x", files: { "a.ts": { kind: "generated", sha256: sha256("a") } }, pending: {} }));
    expect(parseManifest(JSON.stringify(m))).not.toBeNull();
    m.files["../../outside.ts"] = { kind: "generated", sha256: sha256("a") };
    expect(parseManifest(JSON.stringify(m))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...m, files: { "a.ts": { kind: "generated", sha256: "nothex" } } }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...m, files: {}, pending: { "x.ts": sha256("a") } }))).toBeNull();
  });
});
