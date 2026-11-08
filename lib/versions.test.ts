import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { versionModule, versionTable } from "../scripts/gen-versions";
import { allPartsDoc } from "./codegen.fixture";
import { EXPORT_ALWAYS, EXPORT_DEV } from "./exportPackages";
import { proofDoc } from "./exportProject.fixture";
import { buildProject, importsIn, type ProjectFiles } from "./exportProject";
import { SOURCE_PATHS } from "./exportSources";
import { setGlobalLang } from "./i18n";
import { PRODUCT_VERSIONS, VERSIONS } from "./versions.generated";
import rnPackage from "../rn/package.json";
import miniPackage from "../miniapp-kit/package.json";

/* The export pins the versions this repo runs. It used to read them off the lockfile, which the editor then carried
 * whole; it now reads a table written from the lockfile when the editor is built. These hold the table to the lockfile,
 * and an exported project to what the lockfile pinned. */

beforeAll(() => setGlobalLang("en"));

const root = new URL("../", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), "utf8");
const pkg = JSON.parse(text("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const lock = text("bun.lock");

/** how the export read a version before the table: kept here as the reference the table has to agree with */
function fromLockfile(name: string): string {
  const declared: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
  if (declared[name]?.startsWith("npm:")) return declared[name];
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const at = new RegExp(`"${escaped}": \\["${escaped}@([^"]+)"`).exec(lock);
  if (!at) throw new Error(`no version of ${name} in this repo`);
  return at[1];
}

const packageOf = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
const fromDisk = (path: string) => readFile(new URL(path, root), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const manifestOf = (files: ProjectFiles) => JSON.parse(files["package.json"] as string) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

describe("the version table", () => {
  it("is what package.json and bun.lock say: bun run gen:versions writes it again", () => {
    expect(text("lib/versions.generated.ts"), "lib/versions.generated.ts is behind package.json or bun.lock: run bun run gen:versions").toBe(versionModule(versionTable(pkg, lock)));
  });

  it("agrees with the lockfile on every package, an alias as package.json gives it", () => {
    for (const [name, version] of Object.entries(VERSIONS)) expect(version, name).toBe(fromLockfile(name));
    expect(VERSIONS.vite).toBe(pkg.devDependencies.vite);
    expect(VERSIONS.react).toBe(pkg.dependencies.react);
  });

  it("has every package a file the export may copy imports, and what a project always needs", () => {
    /* the React Native kit goes into the mobile app, which pins what the kit is built with (rn/package.json); the
       mini-program's kit likewise into the mini-program (miniapp-kit/package.json) */
    const rn: Record<string, string> = { ...rnPackage.dependencies, ...rnPackage.devDependencies };
    const mini: Record<string, string> = { ...miniPackage.dependencies, ...miniPackage.devDependencies, "@m3e/app-runtime": "0.1.0" };
    for (const path of SOURCE_PATHS.filter((p) => /\.(ts|tsx)$/.test(p)))
      for (const spec of importsIn(text(path))) {
        if (spec.startsWith("@/") || spec.startsWith(".")) continue;
        /* the files a product copies as they are (lib/export/copy.ts) name its own packages, and what it pins */
        if (path.startsWith("lib/export/files/") && /^@m3e\/(api|app-runtime|mocks)$/.test(packageOf(spec))) continue;
        const table = path.startsWith("rn/") ? rn : path.startsWith("miniapp-kit/") ? mini : path.startsWith("lib/export/files/") ? PRODUCT_VERSIONS : VERSIONS;
        expect(table[packageOf(spec)], `${path} imports ${spec}`).toBeTruthy();
      }
    for (const name of [...EXPORT_ALWAYS, ...EXPORT_DEV]) expect(VERSIONS[name], name).toBeTruthy();
  });

  it("keeps only what an export may name, not the lockfile's hundreds", () => {
    expect(Object.keys(VERSIONS).length).toBeLessThan(60);
    expect(VERSIONS["@iconify-json/lucide"]).toBeUndefined();
  });

  it("leaves the lockfile out of what the editor can read", () => {
    expect(SOURCE_PATHS).not.toContain("bun.lock");
  });
});

describe("an exported project", () => {
  it("pins every package at the version the lockfile pinned", async () => {
    const { doc, widths } = proofDoc();
    for (const [d, w] of [
      [doc, widths],
      [allPartsDoc(), {}],
    ] as const) {
      const { files } = await buildProject(d, w, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
      const manifest = manifestOf(files);
      const all = { ...manifest.dependencies, ...manifest.devDependencies };
      expect(Object.keys(all).length).toBeGreaterThan(8);
      for (const [name, version] of Object.entries(all)) expect(version, name).toBe(fromLockfile(name));
      expect(Object.keys(manifest.devDependencies).sort()).toEqual([...EXPORT_DEV].sort());
      for (const name of EXPORT_ALWAYS.filter((n) => !EXPORT_DEV.includes(n))) expect(manifest.dependencies[name], name).toBe(fromLockfile(name));
    }
  }, 60000);
});
