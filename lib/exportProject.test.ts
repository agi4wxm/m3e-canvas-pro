import { unzipSync, strFromU8 } from "fflate";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES, instantiate } from "../parts/templates";
import { defaultMeasures } from "../parts/templates/kit";
import { buildCode } from "./codegen";
import { allPartsDoc } from "./codegen.fixture";
import { COUNTER, FORM, PICKED_PNG, proofDoc } from "./exportProject.fixture";
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
    const { code } = buildCode(single([buttonWith({ to: "cart", transition: "slide" })]), {});
    expect(code).toContain(`import { useApp } from "@/runtime"`);
    expect(code).toContain("const { go } = useApp()");
    expect(code).toMatch(/<Button [^>]*onClick=\{\(\) => go\("yourCart"\)\}/);
    expect(code).toContain("src/runtime.tsx");
  });

  it("says a transition only when it is not the usual one", () => {
    const { code } = buildCode(single([buttonWith({ to: "cart", transition: "fade" })]), {});
    expect(code).toContain(`go("yourCart", "fade")`);
    expect(buildCode(single([buttonWith({ to: "back", transition: "slide" })]), {}).code).toContain("onClick={() => back()}");
    expect(buildCode(single([buttonWith({ to: "link", transition: "none", url: "example.com" })]), {}).code).toContain(`openLink("https://example.com/")`);
  });

  it("runs effects in order, then goes", () => {
    const vars = [{ id: "c", name: "Count", type: "number" as const, value: 0 }, { id: "f", name: "Flag", type: "bool" as const, value: false }];
    const action: Item["action"] = {
      to: "cart",
      transition: "slide",
      effects: [
        { do: "addVar", var: "c", by: 2 },
        { do: "toggleVar", var: "f" },
        { do: "setVar", var: "c", value: "5" },
        { do: "snackbar", message: "Done" },
      ],
    };
    const { code } = buildCode(single([buttonWith(action)], { vars }), {});
    expect(code).toContain(`addVar("count", 2); toggleVar("flag"); setVar("count", 5); snackbar("Done"); go("yourCart")`);
    for (const name of ["addVar", "go", "setVar", "snackbar", "toggleVar"]) expect(code).toMatch(new RegExp(`const \\{[^}]*\\b${name}\\b[^}]*\\} = useApp`));
  });

  it("honours when and else", () => {
    const vars = [{ id: "c", name: "Count", type: "number" as const, value: 0 }];
    const action: Item["action"] = { to: "cart", transition: "slide", when: { var: "c", op: "neq", value: "3" }, else: { to: "none", transition: "none", effects: [{ do: "snackbar", message: "No" }] } };
    const { code } = buildCode(single([buttonWith(action)], { vars }), {});
    expect(code).toContain(`if (vars.count !== 3) { go("yourCart") } else { snackbar("No") }`);
    /* an answer of the wrong type is simply never the same */
    const wrong: Item["action"] = { to: "cart", transition: "slide", when: { var: "c", op: "eq", value: "abc" } };
    expect(buildCode(single([buttonWith(wrong)], { vars }), {}).code).toContain("if (false)");
  });

  it("does nothing for a reference that is gone, as the preview does", () => {
    const action: Item["action"] = { to: "nowhere", transition: "slide", effects: [{ do: "show", part: "gone" }, { do: "setVar", var: "gone", value: 1 }] };
    const { code } = buildCode(single([buttonWith(action)]), {});
    expect(code).not.toContain("onClick");
    expect(code).not.toContain("useApp");
  });

  it("delegates a part's slots from around it, keeping the marks it tells them apart by", () => {
    const nav: Item = { ...makeItem("navigation-bar"), id: "n", actions: { "tab:1": { to: "cart", transition: "slide" } } };
    const { code } = buildCode(single([nav]), {});
    expect(code).toContain(`import { Pressable, useApp } from "@/runtime"`);
    expect(code).toContain(`"tab:1": () => { leaveTab("navigationBar", 1, "yourCart"); go("yourCart") }`);
    expect(code).toContain(`data-tap="tab:1"`);
    expect(code).toContain(`active={tab("navigationBar", undefined, 0) === 1 || undefined}`);
  });

  it("sends each half of a split button its own way; the arrow of one with a menu only opens it", () => {
    const withMenu: Item = { ...makeItem("split-button"), id: "s", actions: { main: { to: "cart", transition: "slide" } } };
    const code = buildCode(single([withMenu]), {}).code;
    expect(code).toContain(`main: () => go("yourCart")`);
    expect(code).toContain(`data-tap-lead="main"`);
    expect(code).toContain(`data-tap-trail="self"`);
    const noMenu: Item = { ...makeItem("split-button"), id: "s", props: { menu: false }, actions: { main: { to: "cart", transition: "slide" }, more: { to: "back", transition: "slide" } } };
    const both = buildCode(single([noMenu]), {}).code;
    expect(both).toContain(`more: () => back()`);
    expect(both).toContain(`data-tap-trail="more"`);
    /* with nothing to tell apart, the marks stay out of the code */
    expect(buildCode(single([{ ...makeItem("split-button"), id: "s" }]), {}).code).not.toContain("data-tap");
  });

  it("counts a press on a place with no action of its own as a press on the part, in the export as in the preview", () => {
    const source = readFileSync("lib/runtimeSource.ts", "utf8");
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
    const live = buildCode(single([{ ...rail, actions: { "tab:0": { to: "cart", transition: "slide" } } }]), {}).code;
    expect(live).toContain(`rail: () => setProp(`);
    expect(live).toContain(" modal");
  });

  it("gives the bars of the same destinations one choice across screens", () => {
    const items = [{ label: "A", icon: "home" }, { label: "B", icon: "star" }];
    const doc = single([]);
    doc.groups = [
      { id: "a", x: 0, y: 700, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "n1", props: { items, selected: 0 }, actions: { "tab:1": { to: "cart", transition: "none" } } }] },
      { id: "b", x: 600, y: 700, axis: "x", items: [{ ...makeItem("navigation-bar"), id: "n2", props: { items, selected: 1 }, actions: { "tab:0": { to: "home", transition: "none" } } }] },
    ];
    const { code } = buildCode(doc, {});
    expect(code).toContain(`tab("navigationBar", 0)`);
    expect(code).toContain(`tab("navigationBar", 1)`);
    expect(code).not.toContain("navigationBar2");
  });

  it("turns hidden and showWhen into conditional rendering, on its own line", () => {
    const vars = [{ id: "on", name: "On", type: "bool" as const, value: false }];
    const doc = single([{ ...makeItem("text"), id: "t", props: { text: "Hi" } }, buttonWith({ to: "none", transition: "none", effects: [{ do: "toggle", part: "t" }] })], { vars });
    doc.groups[0] = { ...doc.groups[0], name: "Promo banner", hidden: true, showWhen: { var: "on", op: "eq", value: true } };
    const { code } = buildCode(doc, {});
    expect(code).toMatch(/\n\s+\{visible\("promoBanner"\) && vars\.on && \(\n/);
    expect(code).toContain(`toggle("promoBanner")`);
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
          { ...makeItem("text"), id: "t", props: { text: "x" }, bind: { text: "n" } },
          { ...makeItem("text-field"), id: "f", props: { label: "Name" }, bind: { value: "n" } },
          { ...makeItem("switch"), id: "s", props: { label: "" }, bind: { checked: "on" } },
          { ...makeItem("slider"), id: "r", bind: { value: "c" } },
          { ...makeItem("button"), id: "b", props: { label: "Hi", icon: "" }, bind: { label: "n" } },
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
    const action: Item["action"] = { to: "cart", transition: "slide", when: { filled: "f" } };
    const { code } = buildCode(single([{ ...makeItem("input"), id: "f", props: { placeholder: "Email" } }, buttonWith(action)]), {});
    expect(code).toContain(`if (hasValue(vars.email)) { go("yourCart") }`);
    expect(code).toContain("value={vars.email}");
  });

  it("prints a value a tap changes as a read of the runtime", () => {
    const action: Item["action"] = { to: "none", transition: "none", effects: [{ do: "setProp", part: "t", prop: "text", value: "Later" }, { do: "setProp", part: "bb", prop: "variant", value: "tonal" }] };
    const doc = single([{ ...makeItem("text"), id: "t", props: { text: "Soon" } }, { ...makeItem("button"), id: "bb", props: { label: "B", icon: "", variant: "filled" } }, buttonWith(action)]);
    const { code } = buildCode(doc, {});
    expect(code).toContain(`{prop("soon", "text", "Soon")}`);
    expect(code).toContain(`setProp("soon", "text", "Later"); setProp("b", "variant", "tonal")`);
    expect(code).toMatch(/prop\("b", "variant", "filled"\)/);
  });

  it("holds a dialog's open state in the runtime and takes its own button away", () => {
    const action: Item["action"] = { to: "none", transition: "none", effects: [{ do: "open", part: "d" }] };
    const dialog: Item = { ...makeItem("dialog"), id: "d", props: { title: "Sure?", dismiss: "No", confirm: "Yes" }, actions: { confirm: { to: "cart", transition: "slide" } } };
    const { code } = buildCode(single([dialog, buttonWith(action)]), {});
    expect(code).toContain(`open={isOpen("sure")}`);
    expect(code).toContain(`onOpenChange={(next) => (next ? open("sure") : close("sure"))}`);
    expect(code).not.toContain("DialogTrigger");
    expect(code).toContain(`slots={{ confirm: () => go("yourCart") }}`);
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
