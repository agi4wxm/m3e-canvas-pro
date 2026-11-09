/* Screens in layers in the exported web apps (docs/交互规则.md “分层”, docs/世界宿主契约.md “分层”): the runtime keeps the
 * layer each screen is, the HUDs that stand over a page, the dialogs that pause, what of a HUD covers a world and where
 * the world views are; src/App.tsx draws the layers over the page, a HUD's covering parts marked to take touches; a
 * layer's screen has no ground of its own; a document with no layers is written as it was (the digests in
 * product.test.ts). The app as written typechecks. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { buildProject } from "../exportProject";
import { designDoc } from "../actions/consistency/design";
import type { Design } from "../actions/consistency/types";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const INSTANT = { kind: "instant" as const };

/** a world, the HUD that stands over it, a bag, a pause menu, a toast, and a screen laid over the old way */
const DESIGN: Design = {
  screens: [
    { id: "home", name: "Arena", layer: "world" },
    { id: "hud", name: "Hud", layer: "hud", over: "home" },
    { id: "bag", name: "Bag", layer: "dialog" },
    { id: "pause", name: "Pause", layer: "dialog", pauses: true },
    { id: "note", name: "Note", layer: "toast" },
    { id: "sheet", name: "Sheet" },
  ],
  parts: [
    { id: "arena", kind: "world", label: "Arena" },
    { id: "fire", label: "Hold fire", screen: "hud", action: { to: "none", effects: [{ do: "press", part: "arena", action: "attack" }] } },
    { id: "hp", kind: "text", label: "HP", screen: "hud" },
    { id: "openbag", label: "Open bag", screen: "hud", action: { to: "bag", motion: INSTANT } },
    { id: "menu", label: "Menu", screen: "hud", action: { to: "pause", motion: INSTANT } },
    { id: "shownote", label: "Show note", screen: "bag", action: { to: "note", motion: INSTANT } },
    { id: "laysheet", label: "Lay sheet", screen: "bag", action: { to: "sheet", motion: INSTANT, overlay: true } },
    { id: "resume", label: "Resume", screen: "pause", action: { to: "back" } },
  ],
};

describe("a prototype in layers over a world", () => {
  it("keeps the layers in its runtime, draws them over the page, and typechecks", async () => {
    const { doc, widths } = designDoc(DESIGN);
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const runtime = files["src/runtime.tsx"] as string;
    const app = files["src/App.tsx"] as string;
    expect(runtime).toContain('import { closeTop, covers, inputFloor, laidAs, layOver, pausesWorld, stood, type Laid, type Layer, type ScreenLayer } from "@/lib/world/layers"');
    expect(runtime).toContain('const LAYERS: Partial<Record<ScreenId, ScreenLayer>> = { hud: "hud", bag: "dialog", pause: "dialog", note: "toast" }');
    expect(runtime).toContain('const OVER: Partial<Record<ScreenId, readonly ScreenId[]>> = { arena: ["hud"] }');
    expect(runtime).toContain("const PAUSES: Partial<Record<ScreenId, true>> = { pause: true }");
    /* what of the HUD covers the world: its buttons, not its words; and where the world view is */
    expect(runtime).toContain("const COVERS: Partial<Record<ScreenId, readonly Box[]>> = { hud: [{ x: 16, y: 88, w: 96, h: 40 }, { x: 16, y: 216, w: 96, h: 40 }, { x: 16, y: 280, w: 96, h: 40 }] }");
    expect(runtime).toContain('const WORLD_BOXES: Partial<Record<ScreenId, readonly (Box & { part: string })[]>> = { arena: [{ part: "arena", x: 16, y: 88, w: 360, h: 240 }] }');
    /* a screen an action lays over is one more layer: the runtime keeps no overlay of its own */
    expect(runtime).not.toContain("openOverlay");
    expect(app).toContain("{layers.map((l, i) => {");
    expect(app).toContain('if (l.layer === "overlay")');
    expect(app).toContain("[&_[data-cover]]:pointer-events-auto");
    expect(app).toContain("onPointerDown={toWorld}");
    const hud = Object.entries(files).find(([k]) => /src\/screens\/Hud\w*Screen\.tsx$/.test(k))?.[1] as string;
    expect(hud).toContain("bg-transparent");
    expect(hud.match(/data-cover/g)?.length).toBe(3);
    const arena = Object.entries(files).find(([k]) => /src\/screens\/Arena\w*Screen\.tsx$/.test(k))?.[1] as string;
    expect(arena).not.toContain("bg-transparent");
    expect(arena).not.toContain("data-cover");

    /* the app as written: src/App.tsx, src/runtime.tsx and the screens, against the editor's own files it copies */
    const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), "m3e-layers-"));
    try {
      const written = Object.keys(files).filter((p) => /^src\/(App|runtime)\.tsx$|^src\/screens\/.*\.tsx$/.test(p));
      for (const f of written) {
        mkdirSync(join(dir, f, ".."), { recursive: true });
        writeFileSync(join(dir, f), files[f] as string);
      }
      const at = (x: string) => join(repo, x);
      const tsconfig = {
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "esnext"],
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          module: "esnext",
          moduleResolution: "bundler",
          types: [],
          isolatedModules: true,
          jsx: "react-jsx",
          paths: { "@/runtime": [join(dir, "src/runtime.tsx")], "@/components/widgets/*": [at("parts/widgets/*")], "@/*": [at("*")], "motion/react": [at("node_modules/motion/dist/react.d.ts")], "*": [at("node_modules/*"), at("node_modules/@types/*")], react: [at("node_modules/@types/react/index.d.ts")], "react/jsx-runtime": [at("node_modules/@types/react/jsx-runtime.d.ts")] },
        },
        files: written.map((f) => join(dir, f)),
      };
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
      const run = spawnSync(at("node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
      expect(`${run.stdout}${run.stderr}`.replaceAll(dir, "")).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
