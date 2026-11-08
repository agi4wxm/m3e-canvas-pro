import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES, instantiate } from "../parts/templates";
import { defaultMeasures } from "../parts/templates/kit";
import { buildCode } from "./codegen";
import { allPartsDoc } from "./codegen.fixture";
import { COUNTER, FORM, PICKED_PNG, proofDoc, systemsDoc } from "./exportProject.fixture";
import { buildProject, iconNamesIn, importClosure, importsIn, projectPath, zipProject, type ProjectFiles } from "./exportProject";
import { SOURCE_PATHS, readSource } from "./exportSources";
import { setGlobalLang } from "./i18n";
import { makeItem, type Doc, type Item } from "./tokens";

beforeAll(() => setGlobalLang("en"));

/* the files themselves: vitest empties a stylesheet it is asked to import, even as raw text */
const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/* no glyph is fetched in a unit test: every name asked for comes back as a blank */
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

const textOf = (files: ProjectFiles, path: string) => files[path] as string;
const sourcesIn = (files: ProjectFiles) => Object.keys(files).filter((p) => /\.(ts|tsx|css)$/.test(p) && p !== "vite.config.ts");

/** every module a project's files name has to be there: a file in it, or a package it declares */
function checkClosed(files: ProjectFiles) {
  const manifest = JSON.parse(textOf(files, "package.json"));
  const declared = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]);
  for (const path of sourcesIn(files)) {
    for (const spec of importsIn(textOf(files, path), path.endsWith(".css"))) {
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        const stem = spec.startsWith("@/") ? `src/${spec.slice(2)}` : new URL(spec, `file:///${path}`).pathname.slice(1);
        const hit = [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`].some((p) => p in files);
        expect(hit, `${path} imports ${spec}`).toBe(true);
      } else {
        const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        expect(declared.has(name), `${path} imports ${spec}: ${name} is not in package.json`).toBe(true);
      }
    }
  }
}

describe("a checkout with CRLF line endings", () => {
  it("exports the same files", async () => {
    const { doc, widths } = proofDoc();
    const lf = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const crlf = await buildProject(doc, widths, { read: async (path) => (await fromDisk(path)).replaceAll("\r\n", "\n").replaceAll("\n", "\r\n"), fetchIcons: noNetwork, lang: "en" });
    expect(Object.keys(crlf.files).sort()).toEqual(Object.keys(lf.files).sort());
    expect(crlf.files["src/App.tsx"]).toBe(lf.files["src/App.tsx"]);
  });
});

describe("sizes of one screen", () => {
  const twoSizes = (): Doc => ({ groups: [], frames: [{ id: "p", name: "Home", x: 0, y: 0 }, { id: "d", name: "Home", x: 500, y: 0, w: 1280, h: 800, variantOf: "p" }, { id: "o", name: "Other", x: 1900, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" });

  it("lets the window choose among them, and only them", async () => {
    const { files } = await buildProject(twoSizes(), {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const app = textOf(files, "src/App.tsx");
    expect(app).toContain("useSized(asked)");
    const table = /const SIZES[^=]*= \{([\s\S]*?)\n\}/.exec(app)![1];
    expect(table.trim().split("\n")).toHaveLength(2);
  });

  it("adds nothing to a document without any", async () => {
    const { doc, widths } = proofDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(textOf(files, "src/App.tsx")).not.toContain("useSized");
  });
});

describe("the project of a real document", () => {
  it("holds the files it has to, and only the sources its screens reach", async () => {
    const { doc, widths } = proofDoc();
    const { files, warnings, name } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(name).toBe("proof-app");
    expect(warnings).toEqual([]);
    for (const path of ["package.json", "vite.config.ts", "tsconfig.json", "index.html", "README.md", "LICENSE", "NOTICE", "src/main.tsx", "src/App.tsx", "src/runtime.tsx", "src/theme.tsx", "src/index.css", "src/styles/m3e.css", "src/styles/m3e.generated.css"]) expect(path in files, path).toBe(true);
    for (const s of ["MenuScreen", "FormScreen", "WelcomeScreen", "CounterScreen", "InputsScreen", "DockScreen", "ProductsScreen", "CartScreen"]) expect(`src/screens/${s}.tsx` in files, s).toBe(true);
    /* closed, and no wider than what the screens use */
    checkClosed(files);
    expect("src/components/widgets/AppParts.tsx" in files).toBe(true);
    expect("src/components/widgets/seed.ts" in files).toBe(true);
    expect("src/components/widgets/look.ts" in files).toBe(true);
    expect("src/components/icons.ts" in files).toBe(true);
    for (const unused of ["src/components/widgets/Draws.tsx", "src/components/widgets/load.tsx", "src/components/widgets/index.ts", "src/components/m3e/sidebar.tsx", "src/components/m3e/chart.tsx"]) expect(unused in files, unused).toBe(false);
    for (const path of Object.keys(files)) expect(path).not.toMatch(/\.test\./);
  });

  it("pins exact versions out of this repo's own", async () => {
    const { doc, widths } = proofDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork });
    const manifest = JSON.parse(textOf(files, "package.json"));
    const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    for (const [dep, version] of Object.entries<string>({ ...manifest.dependencies, ...manifest.devDependencies })) {
      expect(dep in own.dependencies || dep in own.devDependencies, `${dep} is not a dependency of this repo`).toBe(true);
      expect(version, dep).toMatch(/^(\d+\.\d+\.\d+\S*|npm:\S+@\d+\.\d+\.\d+\S*)$/);
    }
    expect(manifest.dependencies.react).toBe(own.dependencies.react);
    /* only what the code uses */
    expect(manifest.dependencies.recharts).toBeUndefined();
  });

  it("writes picked pictures as real files, at the paths the screens use", async () => {
    const { doc, widths } = proofDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork });
    const images = Object.keys(files).filter((p) => p.startsWith("public/images/"));
    expect(images).toHaveLength(1);
    expect(images[0]).toMatch(/\.png$/);
    const bytes = files[images[0]] as Uint8Array;
    expect(Array.from(bytes.slice(1, 4), (c) => String.fromCharCode(c)).join("")).toBe("PNG");
    const screen = textOf(files, "src/screens/CounterScreen.tsx");
    expect(screen).toContain(`src="${images[0].slice("public".length)}"`);
    expect(Object.values(files).some((f) => typeof f === "string" && f.includes(PICKED_PNG))).toBe(false);
    expect(screen).not.toContain("placeholder.svg");
  });

  it("takes a scene's picture along as a file, and leaves its prompt out of the code", async () => {
    const doc = { groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem("scene"), id: "s", props: { image: PICKED_PNG, prompt: "a secret forest prompt", style: "ink" } }] }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" } as Doc;
    const { files } = await buildProject(doc, {}, { read: fromDisk, fetchIcons: noNetwork });
    expect(Object.values(files).some((f) => typeof f === "string" && f.includes(PICKED_PNG))).toBe(false);
    expect(Object.keys(files).some((k) => /public\/.*\.(png|jpe?g)$/.test(k) || /assets\/.*\.(png|jpe?g)$/.test(k) || /images?\/.*\.(png|jpe?g)$/.test(k))).toBe(true);
    expect(Object.values(files).some((f) => typeof f === "string" && f.includes("a secret forest prompt"))).toBe(false);
    expect(Object.keys(files)).toContain("src/components/widgets/Scene.tsx");
  });

  it("writes an animated scene out as a real .gif", async () => {
    const gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const doc = { groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem("scene"), id: "s", props: { image: gif, motion: "animated" } }] }], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "T", brief: "" } as Doc;
    const { files } = await buildProject(doc, {}, { read: fromDisk, fetchIcons: noNetwork });
    expect(Object.keys(files).some((k) => k.endsWith(".gif"))).toBe(true);
    expect(Object.values(files).some((f) => typeof f === "string" && f.includes("R0lGODlh"))).toBe(false);
  });

  it("carries the theme the document was drawn in", async () => {
    const { doc, widths } = proofDoc();
    const { files } = await buildProject({ ...doc, paletteKey: "custom", customPalette: { ...({} as NonNullable<Doc["customPalette"]>), seed: "#336699", primary: "#336699" } }, widths, { read: fromDisk, fetchIcons: noNetwork });
    const theme = textOf(files, "src/theme.tsx");
    expect(theme).toContain(`primary: "#336699"`);
    expect(theme).toContain(`variant: "tonalSpot"`);
    expect(theme).toContain(`shapeScale: 1.6`);
    expect(theme).toContain(`motion: "expressive"`);
    expect(textOf(files, "src/App.tsx")).toContain("const SPRINGS = true");
    expect(textOf(files, "src/index.css")).toContain("font-family: Roboto");
  });

  it("zips to the same files, each in one piece", async () => {
    const { doc, widths } = proofDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork });
    const out = unzipSync(zipProject(files));
    expect(Object.keys(out).sort()).toEqual(Object.keys(files).sort());
    expect(strFromU8(out["src/runtime.tsx"])).toBe(files["src/runtime.tsx"]);
  });

  it("switches the app's colors with the variable that drives the dark mode", async () => {
    const { doc, widths } = proofDoc();
    const dark: Doc = { ...doc, vars: [...(doc.vars ?? []), { id: "v-dark", name: "Dark mode", type: "bool", value: false, drives: "dark" }] };
    const { files } = await buildProject(dark, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const runtime = textOf(files, "src/runtime.tsx");
    expect(runtime).toContain('import { useColorMode } from "@/components/m3e/color-mode-provider"');
    expect(runtime).toContain('darkMode: colorMode.resolvedMode === "dark"');
    expect(runtime).toContain('colorMode.setMode(darkOn ? "dark" : "light")');
    const plain = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(textOf(plain.files, "src/runtime.tsx")).not.toContain("useColorMode");
    checkClosed(files);
  });

  it("builds a document with variants, variables in modes and a prototype, closed, its bound fields read off the runtime", async () => {
    const { doc, widths } = systemsDoc();
    const { files, warnings } = await buildProject(doc, widths, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    checkClosed(files);
    expect(warnings).toEqual([]);
    /* the modes are the runtime's to pick, not a stylesheet's */
    expect("src/style.css" in files).toBe(false);
    const runtime = textOf(files, "src/runtime.tsx");
    expect(runtime).toContain('brand: { collection: "theme", values: { light: "#ffd8e4", dark: "#4a2532" } },');
    expect(runtime).toContain('dark: { theme: ["dark", "dark"] },');
    expect(runtime).toContain('brand: { css: "--m3e-v-brand-v-brand", kind: "color" },');
    const home = textOf(files, "src/screens/HomeScreen.tsx");
    expect(home).toContain("var(--m3e-v-brand-v-brand, #ffd8e4)");
    /* the screen pinned to the dark mode draws its own values until the runtime says otherwise */
    expect(textOf(files, "src/screens/DarkScreen.tsx")).toContain("var(--m3e-v-brand-v-brand, #4a2532)");
    /* the prototype's moves are the editor's own, copied */
    expect(files["src/lib/screenMotion.ts"]).toBe(await fromDisk("lib/screenMotion.ts"));
  });

  it("takes one screen, and a tap to a screen left out goes nowhere", async () => {
    const { doc, widths } = proofDoc();
    const { files } = await buildProject(doc, widths, { read: fromDisk, onlyFrameId: FORM, fetchIcons: noNetwork });
    expect(Object.keys(files).filter((p) => p.startsWith("src/screens/"))).toEqual(["src/screens/FormScreen.tsx"]);
    expect(textOf(files, "src/runtime.tsx")).toContain(`export type ScreenId = "form"`);
    expect(textOf(files, "src/screens/FormScreen.tsx")).not.toContain("go(");
    checkClosed(files);
  });

  it("draws its icons offline, out of the bundled sets", async () => {
    const { doc, widths } = proofDoc();
    const { files, warnings } = await buildProject(doc, widths, {
      read: fromDisk,
      fetchIcons: async () => {
        throw new Error("offline");
      },
    });
    expect(warnings).toEqual([]);
    const data = textOf(files, "src/components/m3e/icon-data.app.ts");
    for (const id of ["home-outline-rounded", "home-rounded", "inbox-outline-rounded"]) expect(data).toContain(`"${id}"`);
    /* what the widgets reach of the editor's loader has nothing to load there */
    expect(textOf(files, "src/components/m3e/icon-sets/load.ts")).not.toContain("import(");
    expect(Object.keys(files).some((p) => p.includes("icon-sets/data"))).toBe(false);
  });

  it("still exports when an icon no set bundles cannot be fetched, and says which", async () => {
    const { doc, widths } = proofDoc();
    const typed: Doc = { ...doc, groups: [...doc.groups, { id: "g-typed", x: 0, y: 700, axis: "x", items: [{ ...makeItem("button"), id: "typed", props: { label: "Sail", icon: "sailing" } }] }] };
    const { files, warnings } = await buildProject(typed, widths, {
      read: fromDisk,
      fetchIcons: async () => {
        throw new Error("offline");
      },
    });
    expect(warnings[0]).toMatch(/icons not fetched: sailing/);
    expect(textOf(files, "README.md")).toContain("could not be fetched");
  });

  it("carries the style's icon family, out of the bundled set", async () => {
    const { doc, widths } = proofDoc();
    const { files, warnings } = await buildProject({ ...doc, theme: { ...doc.theme, icons: "sf" } as Doc["theme"] }, widths, { read: fromDisk, fetchIcons: noNetwork });
    expect(warnings).toEqual([]);
    const styled = textOf(files, "src/style-icons.ts");
    /* the screens' home and inbox, and a dialog's close button inside the components */
    for (const glyph of ['"house"', '"house-fill"', '"tray"', '"xmark"']) expect(styled).toContain(glyph);
    expect(styled).toContain('"home": [\n    "f7:house",\n    "f7:house-fill"\n  ]');
    expect(styled).toContain("Framework7 Icons");
    expect(styled).not.toContain('"gear-alt"');
    const theme = textOf(files, "src/theme.tsx");
    expect(theme).toContain('registerIconMap("sf", styleIconMap)');
    expect(theme).toContain('setIconFamily("sf")');
    checkClosed(files);
  });

  it("builds from every template, closed", async () => {
    for (const template of TEMPLATES) {
      const { frames, groups } = instantiate(template, "en");
      const doc: Doc = { groups, frames, paletteKey: "purple", frame: "phone", title: template.name, brief: "" };
      const { files } = await buildProject(doc, defaultMeasures(groups), { read: fromDisk, fetchIcons: noNetwork });
      checkClosed(files);
      expect(Object.keys(files).filter((p) => p.startsWith("src/screens/")), template.slug).toHaveLength(frames.length);
    }
  }, 60000);

  it("builds with every part in it", async () => {
    const { files } = await buildProject(allPartsDoc(), {}, { read: fromDisk, fetchIcons: noNetwork });
    checkClosed(files);
  }, 30000);
});

describe("the walk over imports", () => {
  it("reads through comments, type imports and re-exports", () => {
    const found = importsIn(`
      // import { no } from "./comment"
      /* import { also } from "./block" */
      import type { A } from "./a"
      import { b,
        c } from "@/b"
      import "./side"
      export { d } from "./d"
      const later = () => import("./later")
    `);
    expect(found.sort()).toEqual(["./a", "./d", "./later", "./side", "@/b"]);
  });

  it("follows a widget's relative imports to where they land", async () => {
    const { files, packages } = await importClosure(["@/components/widgets/Rating"], readSource);
    for (const path of ["parts/widgets/Rating.tsx", "parts/widgets/look.ts", "parts/widgets/Tap.tsx", "components/m3e/ripple.tsx", "lib/m3e/cn.ts"]) expect(files.has(path), path).toBe(true);
    expect(packages.has("cn")).toBe(true);
    expect(projectPath("parts/widgets/Rating.tsx")).toBe("src/components/widgets/Rating.tsx");
    expect(projectPath("parts/icons.ts")).toBe("src/components/icons.ts");
    expect(projectPath("lib/m3e/cn.ts")).toBe("src/lib/m3e/cn.ts");
  });

  it("stops at a module nothing can answer for, rather than writing a broken project", async () => {
    const read = async (path: string) => {
      if (path === "components/m3e/a.ts") return `import { gone } from "./gone"`;
      throw new Error("no file");
    };
    await expect(importClosure(["@/components/m3e/a"], read)).rejects.toThrow(/\.\/gone .*imported by components\/m3e\/a\.ts/);
  });

  it("reaches the sources through the lazy glob, tests left out", async () => {
    expect(SOURCE_PATHS).toContain("components/m3e/button.tsx");
    expect(SOURCE_PATHS).toContain("parts/widgets/AppParts.tsx");
    expect(SOURCE_PATHS).toContain("LICENSE");
    expect(SOURCE_PATHS.some((p) => /\.test\./.test(p))).toBe(false);
    expect(await readSource("package.json")).toContain(`"name": "m3e-canvas-pro"`);
    expect(await readSource("LICENSE")).toMatch(/MIT/);
  });

  it("names the icons a source spells out", () => {
    const names = iconNamesIn(`<Icon name="home" /><NavigationBarItem icon="search" /><Field leadingIcon="mail" />{[{ label: "A", icon: "star" }]}<Icon name={open ? "expand_less" : "expand_more"} />`);
    expect([...names].sort()).toEqual(["expand_less", "expand_more", "home", "mail", "search", "star"]);
  });
});

/* ---------- what the code says a tap does ---------- */

const single = (items: Item[], extra: Partial<Doc> = {}, more: Partial<Doc["groups"][number]> = {}): Doc => ({
  groups: items.map((it, i) => ({ id: `g${i}`, x: 16, y: 80 + i * 80, axis: "x", items: [it], ...more })),
  frames: [
    { id: "home", name: "Home", x: 0, y: 0 },
    { id: "cart", name: "Your cart", x: 600, y: 0 },
  ],
  paletteKey: "purple",
  frame: "phone",
  title: "T",
  brief: "",
  ...extra,
});
const buttonWith = (action: Item["action"], label = "Go"): Item => ({ ...makeItem("button"), id: "b", props: { label, icon: "" }, action });

describe("printed behaviour", () => {
  it("leaves code with nothing to do alone: no runtime, no handler", () => {
    const { code } = buildCode(single([{ ...makeItem("button"), id: "b", props: { label: "Go", icon: "" } }, { ...makeItem("navigation-bar"), id: "n" }, { ...makeItem("switch"), id: "s" }]), {});
    expect(code).not.toContain("runtime");
    expect(code).not.toContain("useApp");
    expect(code).not.toContain("Pressable");
    expect(code).not.toContain("onClick");
    expect(code).not.toContain("data-tap");
  });

  it("goes to a screen by a plain name, on the button itself", () => {
    const { code } = buildCode(single([buttonWith({ to: "cart" })]), {});
    /* the tap is data, which the runtime runs with the editor's own interpreter (lib/actions) */
    expect(code).toContain(`import { type Action, useActions } from "@/runtime"`);
    expect(code).toContain(`const act = useActions("home")`);
    expect(code).toContain(`  go: { to: "yourCart" },\n} satisfies Record<string, Action>`);
    expect(code).toMatch(/<Button [^>]*onClick=\{\(\) => act\(homeScreenActions\.go, \{ part: "go" \}\)\}/);
    expect(code).toContain("src/runtime.tsx");
  });

  it("says a move only when it is not the default slide", () => {
    const { code } = buildCode(single([buttonWith({ to: "cart", motion: { kind: "dissolve", easing: "emphasized", ms: 300 } })]), {});
    expect(code).toContain(`go: { to: "yourCart", motion: { kind: "dissolve", easing: "emphasized", ms: 300 } }`);
    expect(buildCode(single([buttonWith({ to: "cart" })]), {}).code).toContain(`go: { to: "yourCart" }`);
    expect(buildCode(single([buttonWith({ to: "back" })]), {}).code).toContain(`go: { to: "back" }`);
    /* only a web page is ever opened: the address is read as the interpreter reads it */
    expect(buildCode(single([buttonWith({ to: "link", url: "example.com" })]), {}).code).toContain(`go: { to: "link", url: "https://example.com/" }`);
    expect(buildCode(single([buttonWith({ to: "link", url: "javascript:alert(1)" })]), {}).code).not.toContain("javascript");
  });

  it("runs effects in order, then goes", () => {
    const vars = [{ id: "c", name: "Count", type: "number" as const, value: 0 }, { id: "f", name: "Flag", type: "bool" as const, value: false }];
    const action: Item["action"] = {
      to: "cart", effects: [
        { do: "addVar", var: "c", by: 2 },
        { do: "toggleVar", var: "f" },
        { do: "setVar", var: "c", value: "5" },
        { do: "snackbar", message: "Done" },
      ],
    };
    const { code } = buildCode(single([buttonWith(action)], { vars }), {});
    /* in the document's order, each in the app's names; the interpreter runs them in that order, then goes */
    expect(code).toContain(`go: { to: "yourCart", effects: [{ do: "addVar", var: "count", by: 2 }, { do: "toggleVar", var: "flag" }, { do: "setVar", var: "count", value: "5" }, { do: "snackbar", message: "Done" }] },`);
    expect(code).not.toContain("= useApp()");
  });

  it("honours when and else", () => {
    const vars = [{ id: "c", name: "Count", type: "number" as const, value: 0 }];
    const action: Item["action"] = { to: "cart", when: { expr: "vars.Count != 3" }, else: { to: "none", effects: [{ do: "snackbar", message: "No" }] } };
    const { code } = buildCode(single([buttonWith(action)], { vars }), {});
    /* the interpreter reads the expression over the app's variables, by the design's names */
    expect(code).toContain(`go: { to: "yourCart", when: { expr: "vars.Count != 3" }, else: { to: "none", effects: [{ do: "snackbar", message: "No" }] } },`);
    /* a variable that is gone never held: version 4 wrote that as false */
    const gone: Item["action"] = { to: "cart", when: { expr: "false" } };
    expect(buildCode(single([buttonWith(gone)], { vars }), {}).code).toContain(`when: { expr: "false" }`);
  });

  it("does nothing for a reference that is gone, as the preview does", () => {
    const action: Item["action"] = { to: "nowhere", effects: [{ do: "show", part: "gone" }, { do: "setVar", var: "gone", value: 1 }] };
    const { code } = buildCode(single([buttonWith(action)]), {});
    expect(code).not.toContain("onClick");
    expect(code).not.toContain("useApp");
  });

  it("delegates a part's slots from around it, keeping the marks it tells them apart by", () => {
    const nav: Item = { ...makeItem("navigation-bar"), id: "n", actions: { "tab:1": { to: "cart" } } };
    const { code } = buildCode(single([nav]), {});
    expect(code).toContain(`import { Pressable, type Action, useActions, useApp } from "@/runtime"`);
    expect(code).toContain(`"tab:1": () => { leaveTab("navigationBar", 1, "yourCart"); act(homeScreenActions.navigationBarTab1, { part: "navigationBar" }) }`);
    expect(code).toContain(`data-tap="tab:1"`);
    expect(code).toContain(`active={tab("navigationBar", undefined, 0) === 1 || undefined}`);
  });

  it("sends each half of a split button its own way; the arrow of one with a menu only opens it", () => {
    const withMenu: Item = { ...makeItem("split-button"), id: "s", actions: { main: { to: "cart" } } };
    const code = buildCode(single([withMenu]), {}).code;
    expect(code).toMatch(/main: \(\) => act\(homeScreenActions\.splitButtonMain, \{ part: "splitButton" \}\)/);
    expect(code).toContain(`splitButtonMain: { to: "yourCart" },`);
    expect(code).toContain(`data-tap-lead="main"`);
    expect(code).toContain(`data-tap-trail="self"`);
    const noMenu: Item = { ...makeItem("split-button"), id: "s", props: { menu: false }, actions: { main: { to: "cart" }, more: { to: "back" } } };
    const both = buildCode(single([noMenu]), {}).code;
    expect(both).toMatch(/more: \(\) => act\(homeScreenActions\.splitButtonMore, \{ part: "splitButton" \}\)/);
    expect(both).toContain(`splitButtonMore: { to: "back" },`);
    expect(both).toContain(`data-tap-trail="more"`);
    /* with nothing to tell apart, the marks stay out of the code */
    expect(buildCode(single([{ ...makeItem("split-button"), id: "s" }]), {}).code).not.toContain("data-tap");
  });

  it("counts a press on a place with no action of its own as a press on the part, in the export as in the preview", () => {
    const source = readFileSync("lib/export/files/web/runtime.tsx", "utf8");
    expect(source).toMatch(/if \(row\) onTab\?\.\(Number\(row\[1\]\)\)\s+\/\*[^*]*\*\/\s+onPress\?\.\(\)/);
    expect(source).toContain(`if (slot === "self") return`);
  });

  it("gives a list row's icon the disc it asks for, and none by default", () => {
    const plain = buildCode(single([{ ...makeItem("item"), id: "i" }]), {}).code;
    expect(plain).not.toContain("rounded-full");
    const disc = buildCode(single([{ ...makeItem("item"), id: "i", props: { iconFill: "tertiary-container" } }]), {}).code;
    expect(disc).toContain("bg-tertiary-container text-on-tertiary-container");
    expect(disc).toContain("size-10 rounded-full");
  });

  it("keeps a modal rail modal while it is shut, and lets its scrim shut it with no menu button", () => {
    const rail: Item = { ...makeItem("navigation-rail"), id: "r", props: { modal: true, menu: false, expanded: true } };
    const live = buildCode(single([{ ...rail, actions: { "tab:0": { to: "cart" } } }]), {}).code;
    expect(live).toContain(`rail: () => setProp(`);
    expect(live).toContain(" modal");
  });

  it("gives the bars of the same destinations one choice across screens", () => {
    const items = [{ label: "A", icon: "home" }, { label: "B", icon: "star" }];
    const doc = single([]);
    doc.groups = [
      { id: "a", x: 0, y: 700, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "n1", props: { items, selected: 0 }, actions: { "tab:1": { to: "cart", motion: { kind: "instant" } } } }] },
      { id: "b", x: 600, y: 700, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "n2", props: { items, selected: 1 }, actions: { "tab:0": { to: "home", motion: { kind: "instant" } } } }] },
    ];
    const { code } = buildCode(doc, {});
    expect(code).toContain(`tab("navigationBar", 0)`);
    expect(code).toContain(`tab("navigationBar", 1)`);
    expect(code).not.toMatch(/tab\("navigationBar2"/);
  });

  it("turns hidden and showWhen into conditional rendering, on its own line", () => {
    const vars = [{ id: "on", name: "On", type: "bool" as const, value: false }];
    const doc = single([{ ...makeItem("text"), id: "t", props: { text: "Hi" } }, buttonWith({ to: "none", effects: [{ do: "toggle", part: "t" }] })], { vars });
    doc.groups[0] = { ...doc.groups[0], name: "Promo banner", hidden: true, showWhen: { expr: "vars.On == true" } };
    const { code } = buildCode(doc, {});
    expect(code).toMatch(/\n\s+\{visible\("promoBanner"\) && vars\.on && \(\n/);
    expect(code).toContain(`{ do: "toggle", part: "promoBanner" }`);
  });

  it("gates what a hidden container holds with it", () => {
    const box: Item = { ...makeItem("container"), id: "box", props: { label: "", width: 300, height: 300 } };
    const kid: Item = { ...makeItem("button"), id: "kid", props: { label: "Inside", icon: "" } };
    const doc = single([]);
    doc.groups = [
      { id: "g-box", x: 16, y: 16, axis: "x", hidden: true, items: [box] },
      { id: "g-kid", x: 40, y: 40, axis: "x", items: [kid] },
    ];
    const { code } = buildCode(doc, { box: 300, "box:h": 300, kid: 96, "kid:h": 40 });
    expect((code.match(/visible\("container"\) && \(/g) ?? []).length).toBe(2);
  });

  it("binds a value to a variable, and an input writes back", () => {
    const vars = [{ id: "n", name: "Name", type: "text" as const, value: "" }, { id: "on", name: "On", type: "bool" as const, value: true }, { id: "c", name: "Count", type: "number" as const, value: 3 }];
    const { code } = buildCode(
      single(
        [
          { ...makeItem("text"), id: "t", props: { text: "x" }, bind: { text: "=vars.Name" } },
          { ...makeItem("text-field"), id: "f", props: { label: "Name" }, bind: { value: "=vars.Name" } },
          { ...makeItem("switch"), id: "s", props: { label: "" }, bind: { checked: '=vars["on"]' } },
          { ...makeItem("slider"), id: "r", bind: { value: "=vars.Count" } },
          { ...makeItem("button"), id: "b", props: { label: "Hi", icon: "" }, bind: { label: "=vars.Name" } },
        ],
        { vars },
      ),
      {},
    );
    expect(code).toContain("{vars.name}");
    expect(code).toContain("value={vars.name}");
    expect(code).toContain(`onChange={(event) => setVar("name", event.target.value)}`);
    expect(code).toContain("checked={vars.on}");
    expect(code).toContain(`onCheckedChange={(on) => setVar("on", on)}`);
    expect(code).toContain("value={[vars.count]}");
    expect(code).not.toMatch(/defaultValue|defaultChecked/);
  });

  it("asks an input the document asks about through a variable of its own", () => {
    const action: Item["action"] = { to: "cart", when: { filled: "f" } };
    const { code } = buildCode(single([{ ...makeItem("input"), id: "f", props: { placeholder: "Email" } }, buttonWith(action)]), {});
    expect(code).toContain(`when: { filled: "email" }`);
    expect(code).toContain("value={vars.email}");
  });

  it("prints a value a tap changes as a read of the runtime", () => {
    const action: Item["action"] = { to: "none", effects: [{ do: "setProp", part: "t", prop: "text", value: "Later" }, { do: "setProp", part: "bb", prop: "variant", value: "tonal" }] };
    const doc = single([{ ...makeItem("text"), id: "t", props: { text: "Soon" } }, { ...makeItem("button"), id: "bb", props: { label: "B", icon: "", variant: "filled" } }, buttonWith(action)]);
    const { code } = buildCode(doc, {});
    expect(code).toContain(`{prop("soon", "text", "Soon")}`);
    expect(code).toContain(`[{ do: "setProp", part: "soon", prop: "text", value: "Later" }, { do: "setProp", part: "b", prop: "variant", value: "tonal" }]`);
    expect(code).toMatch(/prop\("b", "variant", "filled"\)/);
  });

  it("holds a dialog's open state in the runtime and takes its own button away", () => {
    const action: Item["action"] = { to: "none", effects: [{ do: "open", part: "d" }] };
    const dialog: Item = { ...makeItem("dialog"), id: "d", props: { title: "Sure?", dismiss: "No", confirm: "Yes" }, actions: { confirm: { to: "cart" } } };
    const { code } = buildCode(single([dialog, buttonWith(action)]), {});
    expect(code).toContain(`open={isOpen("sure")}`);
    expect(code).toContain(`onOpenChange={(next) => (next ? open("sure") : close("sure"))}`);
    expect(code).not.toContain("DialogTrigger");
    expect(code).toContain(`slots={{ confirm: () => act(homeScreenActions.sureConfirm, { part: "sure" }) }}`);
    expect(code).toContain(`{ do: "open", part: "sure" }`);
    expect(code).toContain(`data-tap="confirm"`);
  });

  it("leaves a dialog nothing reaches with its own button, in code for one screen", () => {
    const { code } = buildCode(single([{ ...makeItem("dialog"), id: "d" }]), {});
    expect(code).toContain("DialogTrigger");
    expect(code).not.toContain("useApp");
  });

  it("shows a dock's panes by the chosen tab", () => {
    const { doc, widths } = proofDoc();
    const { code } = buildCode(doc, widths);
    /* the button on the menu screen is called Dock too */
    expect(code).toMatch(/\{tab\("dock2", 0\) === 1 && \(/);
    expect(code).toMatch(/\{tab\("dock2", 0\) === 2 && \(/);
    expect(code).toContain("Content two");
  });

  it("is a pure function of the document", () => {
    const { doc, widths } = proofDoc();
    expect(buildCode(doc, widths).code).toBe(buildCode(proofDoc().doc, proofDoc().widths).code.replace(/$^/, ""));
    expect(buildCode(doc, widths, COUNTER).code).toContain("export function CounterScreen()");
  });
});
