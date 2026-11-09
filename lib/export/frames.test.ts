/* Bindings per frame in the exported web apps (lib/bindings/frame.ts, docs/数据绑定.md “每帧绑定”): a screen hands its
 * table of them to the runtime's frame loop (`useFrames`), which runs on requestAnimationFrame over the world a view
 * connected to its channel and writes each value into the element its part is marked with (`data-part`): no state of
 * the app's, no render. The prototype copies the loop from the editor (src/lib/app/frame.ts), the product has it in
 * packages/app-runtime. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { buildProduct } from "./product";
import { buildProject } from "../exportProject";
import { hudDoc } from "./rn/fixture";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

describe("a prototype bound per frame", () => {
  it("hands each screen's table to the runtime's frame loop and marks the parts it writes", async () => {
    const { doc, widths } = hudDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const screen = Object.entries(files).find(([k]) => k.endsWith("src/screens/ArenaScreen.tsx"))?.[1] as string;
    expect(screen).toContain("useFrames(arenaScreenFrames)");
    expect(screen).toContain(`const arenaScreenFrames = [\n  { part: "health", prop: "value", expr: "world.byId.hero.x", kind: "number", min: 0, max: 1000000, slug: "stat-bar" },\n  { part: "score", prop: "text", expr: "'Score ' + world.score", kind: "text", slug: "text" },`);
    expect(screen).toContain("] satisfies ScreenFrame[]");
    expect(screen).toContain('data-part="score"');
    expect(screen).toContain('data-part="health"');
    const runtime = files["src/runtime.tsx"] as string;
    expect(runtime).toContain('import { createFrameLoop, type FrameLoop, type FrameSpec } from "@/lib/app/frame"');
    expect(runtime).toContain("window.requestAnimationFrame(fn)");
    for (const f of ["src/lib/app/frame.ts", "src/lib/bindings/frame.ts", "src/lib/world/root.ts", "src/lib/world/frameTargets.ts"]) expect(f in files, f).toBe(true);
  }, 60_000);

  it("prints nothing of it for a document with none", async () => {
    const { doc, widths } = hudDoc();
    const plain = { ...doc, groups: doc.groups.map((g) => ({ ...g, items: g.items.map(({ frame: _f, ...it }) => it) })) };
    const { files } = await buildProject(plain, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(files["src/runtime.tsx"] as string).not.toContain("createFrameLoop");
    expect("src/lib/app/frame.ts" in files).toBe(false);
  }, 60_000);
});

describe("a product bound per frame", () => {
  it("runs the loop of packages/app-runtime in the web app, the table beside the screen", async () => {
    const { doc, widths } = hudDoc();
    const p = await buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const runtime = p.files["apps/web/src/generated/runtime.tsx"]?.body as string;
    expect(runtime).toMatch(/import \{ createFrameLoop, writeFrameDom, type FrameLoop, type FrameNode, type FrameSpec \} from "@[\w-]+\/app-runtime"/);
    const screen = Object.entries(p.files).find(([k]) => /apps\/web\/src\/generated\/screens\/Arena\w*\.tsx$/.test(k))?.[1].body as string;
    expect(screen).toContain("useFrames(");
    expect(screen).toContain('data-part="score"');
    for (const f of ["lib/app/frame.ts", "lib/bindings/frame.ts", "lib/world/root.ts", "lib/world/frameTargets.ts"]) expect(p.files[`packages/app-runtime/src/engine/${f.slice(4)}`], f).toBeDefined();
  }, 60_000);
});

describe("the prototype's code bound per frame", () => {
  it("typechecks: the screen's table and its runtime, as the exported app's", async () => {
    const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const { doc, widths } = hudDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const dir = mkdtempSync(join(tmpdir(), "m3e-frames-"));
    try {
      const screen = Object.keys(files).find((k) => k.endsWith("src/screens/ArenaScreen.tsx"))!;
      for (const f of ["src/runtime.tsx", screen]) {
        mkdirSync(join(dir, f, ".."), { recursive: true });
        writeFileSync(join(dir, f), files[f] as string);
      }
      const at = (x: string) => join(repo, x);
      const tsconfig = {
        compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], skipLibCheck: true, strict: true, noEmit: true, module: "esnext", moduleResolution: "bundler", types: [], isolatedModules: true, jsx: "react-jsx", paths: { "@/runtime": [join(dir, "src/runtime.tsx")], "@/components/widgets/*": [at("parts/widgets/*")], "@/*": [at("*")], react: [at("node_modules/@types/react/index.d.ts")], "react/jsx-runtime": [at("node_modules/@types/react/jsx-runtime.d.ts")] } },
        files: [join(dir, "src/runtime.tsx"), join(dir, screen)],
      };
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
      const run = spawnSync(at("node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
      expect(`${run.stdout}${run.stderr}`.replaceAll(dir, "")).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
