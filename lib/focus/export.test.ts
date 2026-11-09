/* The focus in the exported web app (lib/printBehaviour.ts, lib/export/files/web/runtime.tsx): a document that says
 * something about the focus carries the keyboard's and the gamepad's focus with it (the driver copied from lib/focus,
 * the screens' and parts' focus as tables by their keys in the app, every part marked as the preview marks it), and the
 * app typechecks as exported; a document that says nothing exports as it always did. The behaviour itself is the
 * preview's own code, walked in the browser by e2e/focus.e2e.ts. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildProject } from "../exportProject";
import { buildProduct } from "../export/product";
import { setGlobalLang } from "../i18n";
import { instantiate, defaultMeasures } from "../../parts/templates/kit";
import { templateBySlug } from "../../parts/templates";
import { makeItem, type Doc } from "../tokens";

beforeAll(() => setGlobalLang("en"));

const REPO = join(dirname(new URL(import.meta.url).pathname), "../..");
const fromDisk = async (path: string) => readFileSync(join(REPO, path), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

const menus = (slug = "game-menu-flow") => {
  const { frames, groups } = instantiate(templateBySlug(slug)!, "en");
  const doc: Doc = { frames, groups, paletteKey: "purple", frame: "phone", title: "Menus", brief: "" };
  return { doc, widths: defaultMeasures(groups) };
};

const dir = mkdtempSync(join(tmpdir(), "m3e-focus-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the exported web app's focus", () => {
  it("carries the focus of a document that says one: the driver, the tables, the marks", async () => {
    const { doc, widths } = menus();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const runtime = files["src/runtime.tsx"] as string;
    expect(runtime).toContain('import { startFocus } from "@/lib/focus/dom"');
    /* the lobby starts on play and cancels to its menu, the pause menu wraps: by the parts' keys in the app */
    const screens = /const FOCUS_SCREENS[^=]*= (\{.*\})/.exec(runtime)?.[1] ?? "";
    expect(screens).toMatch(/first: "play"/);
    expect(screens).toMatch(/cancel: "menu"/);
    expect(screens).toMatch(/wrap: true/);
    expect(runtime).toMatch(/const FOCUS_PARTS[^=]*= \{.*focusable: true/);
    /* the driver and the model it reads are copied beside the app, as the interpreter is */
    for (const f of ["src/lib/focus/dom.ts", "src/lib/focus/model.ts", "src/lib/focus/gamepad.ts"]) expect(typeof files[f], f).toBe("string");
    /* every part marked the way the preview marks its own: the lobby's play and the bar, the pause menu's buttons */
    const all = Object.entries(files).filter(([p]) => p.startsWith("src/screens/")).map(([, t]) => t as string).join("\n");
    expect(all).toMatch(/focus="play"/);
    expect(all).toMatch(/focus="navigationBar"|focus="nav\w*"/);
    expect(all).toMatch(/focus="restart"|data-focus="restart"/);
    /* the pages say which screen they are, which the focus finds its layers by */
    expect(files["src/App.tsx"] as string).toContain("data-page={screen}");

    /* and it typechecks as the exported app's own code */
    const src = join(dir, "src");
    for (const [p, t] of Object.entries(files)) {
      if (!p.startsWith("src/") || typeof t !== "string" || !/\.(ts|tsx)$/.test(p)) continue;
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), t);
    }
    const at = (p: string) => join(REPO, p);
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
          "@/*": [`${src}/*`, at("*")],
          react: [at("node_modules/@types/react/index.d.ts")],
          "react/jsx-runtime": [at("node_modules/@types/react/jsx-runtime.d.ts")],
        },
      },
      files: [join(src, "runtime.tsx"), join(src, "lib/focus/dom.ts")],
    };
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
    const run = spawnSync(at("node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
    expect(`${run.stdout}${run.stderr}`.replaceAll(dir, "")).toBe("");
  }, 120_000);

  it("hands the phone app and the mini-program the focus as data, and says what each draws of it", async () => {
    const { doc, widths } = menus();
    const product = await buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    for (const app of ["apps/mobile", "apps/miniapp"]) {
      const body = product.files[`${app}/src/generated/focus.json`]?.body;
      expect(typeof body, app).toBe("string");
      const data = JSON.parse(body as string) as { version: number; screens: { name: string; first: string | null; cancel?: string; parts: { label: string }[] }[] };
      expect(data.version).toBe(1);
      const lobby = data.screens.find((x) => x.name === "Lobby")!;
      expect(lobby.parts.find((p) => p.label === "Play")).toBeTruthy();
      expect(lobby.cancel).toBeTruthy();
    }
    expect(product.differences.filter((d) => d.kind === "focus").map((d) => d.app).sort()).toEqual(["miniapp", "mobile"]);
    const plain = await buildProduct(menus("game-flow").doc, menus("game-flow").widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(Object.keys(plain.files).some((p) => p.endsWith("focus.json"))).toBe(false);
  }, 180_000);

  it("drives a world view's input actions from the keys in the app, by its table", async () => {
    const { doc, widths } = menus("game-flow");
    const lobby = doc.frames[1];
    const world = { id: "gw", x: lobby.x + 16, y: lobby.y + 200, axis: "x" as const, items: [{ ...makeItem("world-view"), id: "arena", props: { label: "Arena", inputs: "move: vec2, attack: bool" } }] };
    const withWorld: Doc = { ...doc, groups: [...doc.groups, world], inputs: { actions: { attack: { keys: ["f"] } }, ui: { confirm: { keyboard: ["e"] } } } };
    const { files } = await buildProject(withWorld, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const runtime = files["src/runtime.tsx"] as string;
    const worlds = /const FOCUS_WORLDS[^=]*= (\{.*\})/.exec(runtime)?.[1] ?? "";
    expect(worlds).toMatch(/name: "move", type: "vec2"/);
    expect(worlds).toMatch(/name: "attack", type: "bool", keys: \["f"\]/);
    expect(runtime).toMatch(/const FOCUS_UI[^=]*= \{ confirm: \{ keyboard: \["e"\] \} \}/);
    expect(runtime).toContain("worldInput: (part, action, value) => worlds.send(part, action, value)");
    expect(typeof files["src/lib/focus/inputs.ts"]).toBe("string");
  }, 120_000);

  it("leaves a document that says nothing of the focus as it was", async () => {
    const { doc, widths } = menus("game-flow");
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(files["src/runtime.tsx"] as string).not.toContain("focus");
    expect(Object.keys(files).some((p) => p.includes("lib/focus/"))).toBe(false);
    const all = Object.entries(files).filter(([p]) => p.startsWith("src/screens/")).map(([, t]) => t as string).join("\n");
    expect(all).not.toMatch(/focus=/);
  }, 120_000);
});
