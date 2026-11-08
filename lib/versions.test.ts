import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { KITS, kitManifest, lockProblems, versionModule, versionTable } from "../scripts/gen-versions";
import { allPartsDoc } from "./codegen.fixture";
import { EXPO_PINS, EXPORT_ALWAYS, EXPORT_DEV, MOBILE_PACKAGES, PRODUCT_PINS, TARO_PINS } from "./exportPackages";
import { MOBILE_PINS } from "./export/targets/mobile";
import { miniappDependencies } from "./export/targets/miniapp";
import { rnDependencies } from "./export/rn/app";
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
        if ((path.startsWith("lib/export/files/") || path.startsWith("rn/src/app/")) && /^@m3e\/(api|app-runtime|mocks)$/.test(packageOf(spec))) continue;
        /* the mobile app's own files (rn/src/app, rn/src/custom) go into the app, which pins the Expo packages it needs
           beyond the kit's (lib/exportPackages.ts MOBILE_PACKAGES) */
        const table = /^rn\/src\/(app|custom)\//.test(path) ? { ...rn, ...MOBILE_PINS } : path.startsWith("rn/") ? rn : path.startsWith("miniapp-kit/") ? mini : path.startsWith("lib/export/files/") ? PRODUCT_VERSIONS : VERSIONS;
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

describe("one place for every version written by hand (lib/exportPackages.ts)", () => {
  it("writes the kits' manifests from it: each package at its line's pin, else at the product's", () => {
    for (const kit of KITS) {
      const text = readFileSync(new URL(`../${kit.dir}/package.json`, import.meta.url), "utf8");
      const out = kitManifest(text, kit.line);
      expect(out.unpinned, kit.dir).toEqual([]);
      expect(out.text, `${kit.dir}/package.json is behind: bun run gen:versions`).toBe(text);
    }
    /* what the mobile app and the mini-program pin is what the kits are checked with */
    expect(rnDependencies().devDependencies.typescript).toBe(PRODUCT_PINS.typescript);
    expect(miniappDependencies().dependencies["@tarojs/taro"]).toBe(TARO_PINS["@tarojs/taro"]);
    expect(MOBILE_PINS).toEqual(Object.fromEntries(MOBILE_PACKAGES.map((n) => [n, EXPO_PINS[n]])));
  });

  it("bumps a version with one edit: the manifest follows, and a lockfile that has not is told", () => {
    const manifest = JSON.stringify({ name: "kit", dependencies: { expo: "1.0.0", typescript: "1.0.0" }, devDependencies: { left: "1.0.0" } }, null, 2) + "\n";
    const out = kitManifest(manifest, { expo: "2.0.0" });
    expect(JSON.parse(out.text).dependencies).toEqual({ expo: "2.0.0", typescript: PRODUCT_PINS.typescript });
    expect(out.unpinned).toEqual(["left"]);
    const lock = (expo: string) => JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: { expo, typescript: PRODUCT_PINS.typescript } }, "node_modules/expo": { version: expo }, "node_modules/typescript": { version: PRODUCT_PINS.typescript } } });
    const bumped = JSON.stringify({ name: "kit", dependencies: { expo: "2.0.0", typescript: PRODUCT_PINS.typescript } });
    expect(lockProblems(bumped, lock("1.0.0"))).toEqual(["expo: the lockfile's dependencies have 1.0.0, the manifest 2.0.0", "expo: the lockfile installs 1.0.0, the manifest pins 2.0.0"]);
    expect(lockProblems(bumped, lock("2.0.0"))).toEqual([]);
  });

  it("writes each package once per line: a line's pin is only where it differs from the product's", () => {
    for (const line of [EXPO_PINS, TARO_PINS]) for (const [name, version] of Object.entries(line)) expect(PRODUCT_PINS[name] === version, name).toBe(false);
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
