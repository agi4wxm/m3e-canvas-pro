/* The world view in the exported product (docs/边界与契约.md “实时玩法”, docs/组件规范.md “世界视口”): every app draws
 * it with a slot written once (src/custom/slots/<Name>.tsx), handed the world's state from the design, its size, the
 * channel its input actions come in on and `onEvent` for the world's events, the design's stand-in until an engine is
 * plugged in; M3E's example engine is written beside it (src/generated/exampleWorld.tsx: a canvas and a frame loop on
 * the web, a timer and the kit's stand-in on a phone and in a mini-program); the taps' input actions run through the
 * interpreter on every app. No platform capability is involved: a world view is the engine's. */

import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { buildProduct } from "./product";
import { buildProject } from "../exportProject";
import { slotsOf } from "./appCapabilities";
import { worldDoc } from "./rn/fixture";
import type { Product } from "./types";

beforeAll(() => setGlobalLang("en"));

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
const text = (p: Product, path: string) => {
  const body = p.files[path]?.body;
  if (typeof body !== "string") throw new Error(`${path} is not a text file of the product`);
  return body;
};

describe("a product with a world view", () => {
  let p: Product;
  beforeAll(async () => {
    const { doc, widths } = worldDoc();
    p = await buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
  }, 60_000);

  it("draws it with a slot written once, where the engine goes, and the example engine beside it", () => {
    expect(slotsOf(worldDoc().doc).map((s) => [s.name, s.view])).toEqual([["Arena", "world"]]);
    for (const app of ["web", "mobile", "miniapp"]) {
      const slot = p.files[`apps/${app}/src/custom/slots/Arena.tsx`];
      expect(slot?.kind, app).toBe("seeded");
      expect(slot.body as string, app).toContain("type Props = WorldSlotProps<ReactNode>;\n\nexport default function Arena({ children }: Props) {\n  return <>{children}</>;\n}");
      expect(slot.body as string, app).toContain('import type { WorldSlotProps } from "@world/app-runtime";');
      expect(slot.body as string, app).toContain("connectWorld(world, channel, onEvent)");
      expect(p.files[`apps/${app}/src/generated/exampleWorld.tsx`]?.kind, app).toBe("generated");
      expect(text(p, `apps/${app}/src/generated/exampleWorld.tsx`), app).toContain("createExampleWorld(");
    }
    /* the world's contract beside them: the data, and the types generated from its JSON Schemas */
    for (const app of ["web", "mobile", "miniapp"]) {
      const c = text(p, `apps/${app}/src/generated/worldContract.ts`);
      expect(c, app).toContain("export const WORLD_CONTRACT: WorldContract = {");
      expect(c, app).toMatch(/export type WorldEventPayloads = \{\n {2}hit: \{\s*id: string;\s*by: string;?\s*\}/);
      expect(c, app).toContain("move: Vec2");
      expect(c, app).toContain("attack: boolean");
    }
    /* the example engine is spoken to only through World: mounted, connected, read, unmounted, its time the app's clock */
    for (const app of ["web", "mobile", "miniapp"]) {
      const ex = text(p, `apps/${app}/src/generated/exampleWorld.tsx`);
      expect(ex, app).toContain("world.mount(");
      expect(ex, app).not.toContain(".step(");
      expect(ex, app).toMatch(/createExampleWorld\(JSON\.parse\(start\) as WorldState, \{ now: (domainNow|kitNow) \}\)/);
    }
    /* the web's example draws on a canvas, a frame at a time; a phone's and a mini-program's with the kit's stand-in */
    expect(text(p, "apps/web/src/generated/exampleWorld.tsx")).toContain("requestAnimationFrame(draw)");
    expect(text(p, "apps/web/src/generated/exampleWorld.tsx")).toContain("<canvas ref={canvas}");
    expect(text(p, "apps/mobile/src/generated/exampleWorld.tsx")).toContain('import { kitNow, WorldStandIn } from "../kit"');
  });

  it("is no platform capability: the product has no capabilities package for it", () => {
    expect(Object.keys(p.files).some((f) => f.startsWith("packages/capabilities/"))).toBe(false);
    /* the channel, the contract and the example engine are the app runtime's */
    for (const f of ["types", "contract", "hostContract", "channel", "example", "layers"]) expect(p.files[`packages/app-runtime/src/engine/world/${f}.ts`]?.kind, f).toBe("generated");
  });

  it("hands the slot the world's state, the channel and the world's events on every app", () => {
    const web = text(p, "apps/web/src/generated/screens/ArenaScreen.tsx");
    const slot = web.slice(web.indexOf("<Arena"), web.indexOf("</Arena>"));
    expect(slot).toContain('channel={worldChannel("arena")}');
    expect(slot).toContain('entities={[{ id: "hero", kind: "player", x: 20, y: 40, label: "Hero" }');
    expect(slot).toContain("onEvent=");
    expect(slot).toContain("<WorldView");
    expect(text(p, "apps/web/src/generated/runtime.tsx")).toContain("worldInput: (part, action, value) => worlds.send(part, action, value),");
    for (const app of ["mobile", "miniapp"]) {
      const screen = text(p, `apps/${app}/src/generated/screens/ArenaScreen.tsx`);
      const slot = screen.slice(screen.indexOf("<Arena"), screen.indexOf("</Arena>"));
      expect(slot, app).toMatch(/channel=\{(app|s)\.world\("arena"\)\}/);
      expect(slot, app).toContain("<WorldStandIn");
      expect(screen, app).toContain('do: "move", part: "arena", vector: "event"');
      expect(screen, app).toContain('do: "press", part: "arena", action: "attack"');
      /* the pad's pushes are its `move` event */
      expect(screen, app).toMatch(/<Joystick[^>]*onMove=/);
    }
  });

  it("says where the engine is still to plug in", () => {
    const left = p.differences.filter((d) => d.kind === "world");
    expect(left.map((d) => d.app).sort()).toEqual(["miniapp", "mobile", "web"]);
    expect(left[0].detail).toContain("src/custom/slots/Arena.tsx");
    /* the stand-in sends no events of its own: the slot's engine sends them, so no app reports them as not sent */
    expect(p.differences.filter((d) => d.kind === "event" && /hit|collected|ended/.test(d.detail))).toEqual([]);
  });
});

describe("a prototype with a world view", () => {
  it("plays the example engine on the widget, its channel kept by the runtime", async () => {
    const { doc, widths } = worldDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const screen = Object.entries(files).find(([k]) => k.endsWith("src/screens/ArenaScreen.tsx"))?.[1] as string;
    expect(screen).toContain('channel={worldChannel("arena")}');
    expect(screen).toMatch(/<WorldView[^>]*demo/);
    expect(files["src/runtime.tsx"] as string).toContain('import { createWorlds } from "@/lib/world/channel"');
    for (const f of ["src/lib/world/channel.ts", "src/lib/world/example.ts", "src/lib/world/types.ts", "src/components/widgets/World.tsx"]) expect(f in files, f).toBe(true);
  }, 60_000);
});

describe("the web app's world view code", () => {
  /* the phone's and the mini-program's are typechecked and linted in the kits' test beds (rn/src/printed/world,
     miniapp-kit/src/printed/world); the web's example engine and slot are typechecked here, as the web app's */
  it("typechecks: the example engine on a canvas, and the slot written once", async () => {
    const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const { doc, widths } = worldDoc();
    const p = await buildProduct(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const dir = mkdtempSync(join(tmpdir(), "m3e-world-"));
    try {
      for (const f of ["src/generated/exampleWorld.tsx", "src/generated/worldContract.ts", "src/custom/slots/Arena.tsx"]) {
        mkdirSync(join(dir, f, ".."), { recursive: true });
        writeFileSync(join(dir, f), text(p, `apps/web/${f}`));
      }
      const at = (x: string) => join(repo, x);
      const tsconfig = {
        compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], skipLibCheck: true, strict: true, noEmit: true, module: "esnext", moduleResolution: "bundler", types: [], isolatedModules: true, jsx: "react-jsx", paths: { "@world/app-runtime": [at("lib/export/files/appRuntime/index.ts")], "@/components/widgets/*": [at("parts/widgets/*")], "@/*": [at("*")], react: [at("node_modules/@types/react/index.d.ts")], "react/jsx-runtime": [at("node_modules/@types/react/jsx-runtime.d.ts")] } },
        files: [join(dir, "src/generated/exampleWorld.tsx"), join(dir, "src/generated/worldContract.ts"), join(dir, "src/custom/slots/Arena.tsx")],
      };
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
      const run = spawnSync(at("node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
      expect(`${run.stdout}${run.stderr}`.replaceAll(dir, "")).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("the app runtime's world files", () => {
  /* packages/app-runtime types no DOM (lib ES2022, no types): the world's files have to stand on that */
  it("typecheck with no DOM", async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), "m3e-world-runtime-"));
    try {
      const files = ["types", "contract", "hostContract", "channel", "example", "layers"].map((f) => join(repo, `lib/world/${f}.ts`));
      writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022"], types: [], strict: true, noEmit: true, module: "esnext", moduleResolution: "bundler", skipLibCheck: true, verbatimModuleSyntax: true }, files }));
      const run = spawnSync(join(repo, "node_modules/.bin/tsc"), ["--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
      expect(`${run.stdout}${run.stderr}`).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
