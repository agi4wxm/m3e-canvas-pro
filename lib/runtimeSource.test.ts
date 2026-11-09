/* The web app's runtime is a real file (lib/export/files/web/runtime.tsx) the export fills in for a document
 * (lib/runtimeSource.ts, lib/export/regions.ts). It is typechecked and linted with the editor as it stands, which is one
 * configuration of it; here it is filled in for the others, and each is typechecked the way an exported app is. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { proofDoc, systemsDoc } from "./exportProject.fixture";
import { buildScreens } from "./codegen";
import { apiModelOf } from "./export/api";
import { editorNotesOut } from "./export/copy";
import { contractOf } from "./export/product";
import { productDoc } from "./export/product.fixture";
import { fillRegions, namesIn } from "./export/regions";
import type { RuntimeSpec } from "./printBehaviour";
import { RUNTIME_TEMPLATE, runtimeFlags, runtimeSource } from "./runtimeSource";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const code = readFileSync(join(REPO, RUNTIME_TEMPLATE), "utf8");

/** the configuration the file is written in */
const REFERENCE = { proto: true, overlay: true, scroll: true, hover: true, delay: true, modes: true, boundFields: true, flows: true, product: true, page: true, varNames: true, colorMode: true, acts: true, families: true, worlds: true, layers: true, exprs: false, dark: false, mocks: false };

describe("the web app's runtime as it stands in the repo", () => {
  it("names exactly the flags the export gives it", () => {
    expect(namesIn(code).flags).toEqual(Object.keys(runtimeFlags({ screens: [], vars: [], parts: [], hidden: [], opened: [], current: {} })).sort());
  });

  it("is its reference configuration: filled in for it, nothing changes but the marks going (no dormant line wakes)", () => {
    const { values } = namesIn(code);
    /* each value's placeholder stands for itself */
    const kept = (text: string) => text.replace(/\/\*\$(\w+)\*\/[\s\S]*?\/\*\$\*\//g, (_, n: string) => `<${n}>`).replace(/@@(\w+)@@/g, (_, n: string) => `<${n}>`);
    const filled = fillRegions(kept(code), REFERENCE, Object.fromEntries(values.map((n) => [n, `<${n}>`])));
    const bare = kept(code)
      .split("\n")
      .filter((line) => !/^\s*\/\/(#(if|elif|else|end)\b|\|)/.test(line))
      .join("\n")
      .replace(/\/\*#else [\s\S]*?#end\*\//g, "")
      .replace(/\/\*#(if [^*]*|end)\*\//g, "");
    expect(filled).toBe(bare);
  });
});

/* ---------- filled in, and typechecked as an exported app's ---------- */

const base: RuntimeSpec = {
  screens: ["home", "login"],
  vars: [
    { key: "count", type: "number", start: 0 },
    { key: "title", type: "text", start: "Hi" },
  ],
  parts: ["menu", "nav", "card"],
  hidden: ["card"],
  opened: [],
  current: { name: "Apple" },
};
const acts = { parts: { menu: { overlay: "menu" as const }, card: { shows: "card" } }, tabs: { nav: "selected" } };
const proto = { overlay: true, scroll: true, hover: true, delay: true };
const modes = { collections: ["theme"], screens: { home: { theme: ["light", "dark"] as [string, string] }, login: { theme: ["light", "light"] as [string, string] } }, values: { count: { collection: "theme", values: { light: 1, dark: 2 } } }, bound: [{ key: "count", css: "count", kind: "number" as const }], followsDark: true };
const bound = { runtime: "@m3e/app-runtime", params: { home: [{ name: "id", type: "string", example: "7" }] }, auth: ["home"], signIn: "login", login: "signIn" };
const layers = { of: { login: "dialog" as const }, over: { home: ["login"] }, pauses: ["login"], covers: { login: [{ x: 0, y: 0, w: 40, h: 40 }] }, worlds: { home: [{ part: "arena", x: 0, y: 100, w: 360, h: 240 }] } };
const darkVars = [...base.vars, { key: "night", type: "bool" as const, start: false }];

/** the configurations: synthetic ones that cross the features, and the fixtures' own */
function configurations(): Record<string, RuntimeSpec> {
  const binds = (doc: Parameters<typeof contractOf>[0]) => ({ runtime: "@m3e/app-runtime", api: doc.api ?? {}, operations: apiModelOf("T", contractOf(doc, "T")).operations });
  const product = productDoc();
  return {
    "a still prototype": base,
    "a prototype with no parts and no variables": { ...base, vars: [], parts: [], hidden: [] },
    "a prototype's taps, one variable, mocks, its own expressions": { ...base, vars: [base.vars[0]], acts: { ...acts, mocks: { locale: "en" } }, exprs: { vars: { count: ["Count", "v1"] } } },
    "a prototype with every move, flows and a variable for the dark mode": { ...base, vars: darkVars, dark: "night", proto, flows: [{ key: "main", name: "Main", screen: "home" }], acts, exprs: { vars: {} } },
    "a prototype whose taps reach a world view": { ...base, worlds: true, acts, exprs: { vars: {} } },
    "a prototype that draws a world view and has no taps": { ...base, worlds: true },
    "a product whose taps reach a world view": { ...base, worlds: true, bound, acts, exprs: { vars: {} } },
    "a prototype in layers over a world, with taps and moves": { ...base, worlds: true, overlayOn: { menu: "home" }, layers, proto, acts, exprs: { vars: {} } },
    "a prototype in layers, no world, no moves": { ...base, layers: { ...layers, covers: {}, worlds: {} }, acts, exprs: { vars: {} } },
    "a prototype in layers that draws a world and has no taps": { ...base, worlds: true, layers },
    "a product in layers over a world": { ...base, worlds: true, overlayOn: { menu: "home" }, layers, bound, acts, proto, exprs: { vars: {} } },
    "a product in layers, no moves": { ...base, layers, worlds: true, bound, acts, exprs: { vars: {} } },
    "a prototype in modes, taps but no overlay": { ...base, families: true, proto: { overlay: false, scroll: false, hover: false, delay: true }, modes, acts, exprs: { vars: { count: ["Count"] } } },
    "a prototype with bound fields and no collections": { ...base, modes: { ...modes, collections: [], screens: {}, values: {}, followsDark: false } },
    "a product with no taps": { ...base, bound, exprs: { vars: {} } },
    "a product with taps, no prototype": { ...base, bound, acts, exprs: { vars: { count: ["Count"] } } },
    "a product with everything and a dark variable": { ...base, families: true, vars: darkVars, dark: "night", bound, acts, proto, modes, flows: [{ key: "main", name: "Main", screen: "home" }], exprs: { vars: { count: ["Count"] } } },
    "the systems prototype": buildScreens(systemsDoc().doc, systemsDoc().widths, { live: true }).runtime,
    "the proof prototype": buildScreens(proofDoc().doc, proofDoc().widths, { live: true }).runtime,
    "the proof product": buildScreens(product.doc, product.widths, { live: true, binds: binds(product.doc) }).runtime,
  };
}

const dir = mkdtempSync(join(tmpdir(), "m3e-runtime-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the web app's runtime filled in for a document", () => {
  it("leaves no mark behind in any configuration", () => {
    for (const [name, spec] of Object.entries(configurations())) {
      const out = runtimeSource(spec, code);
      expect(out, name).not.toMatch(/\/\/#|\/\/\||\/\*#|#end\*\/|\/\*\$|@@|\/\/!/);
      expect(out.startsWith("// Generated by M3E Canvas."), name).toBe(true);
    }
  });

  it("typechecks in every configuration, as an exported app's src/runtime.tsx", () => {
    const files = Object.entries(configurations()).map(([name, spec], i) => {
      const at = join(dir, `runtime${i}.tsx`);
      writeFileSync(at, `// ${name}\n${runtimeSource(spec, code)}`);
      return at;
    });
    const at = (p: string) => join(REPO, p);
    /* an exported app's tsconfig (lib/exportProject.ts), its src/ being the editor's own files */
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        types: [],
        typeRoots: [at("node_modules/@types")],
        isolatedModules: true,
        jsx: "react-jsx",
        paths: {
          "@/components/widgets/*": [at("parts/widgets/*")],
          "@/*": [at("*")],
          "@m3e/app-runtime": [at("lib/export/files/appRuntime/index.ts")],
          react: [at("node_modules/@types/react/index.d.ts")],
          "react/jsx-runtime": [at("node_modules/@types/react/jsx-runtime.d.ts")],
        },
      },
      files,
    };
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
    const run = spawnSync(at("node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
    expect(`${run.stdout}${run.stderr}`.replaceAll(dir, "")).toBe("");
    expect(run.status).toBe(0);
  }, 120_000);

  it("drops what a document does not use: a still prototype has no interpreter, no session, no overlay", () => {
    const still = runtimeSource(base, code);
    for (const gone of ["useCallback", "lib/actions", "useRuntime", "openOverlay", "FLOWS", "varsOn", "useColorMode", "ScreenContext"]) expect(still, gone).not.toContain(gone);
    expect(editorNotesOut(code)).toContain("useRuntime");
  });
});
