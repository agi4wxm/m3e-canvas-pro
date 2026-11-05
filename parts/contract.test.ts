import { createElement } from "react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isProject } from "../lib/project";
import { makeItem, type Doc } from "../lib/tokens";
import { setGlobalLang } from "../lib/i18n";
import { COMPONENTS } from "./components";
import { EXTERNAL } from "./externals";
import { FILE_OF } from "./files.generated";
import { isNode, type PNode, type PValue } from "./node";
import { applyAppearance } from "./appearance";
import { CATEGORIES, CATEGORY_TIER, PARTS, defaultValues, partBySlug, reader, tierOf, treeOf } from "./registry";
import { KITS } from "./kits";
import { renderNode } from "./render";
import { loadWidgets } from "./widgets/load";
import { WIDGET_SOURCES } from "./widgets/sources";

/* The contract every part keeps (docs/组件规范.md), checked for all of them: a new part is
 * covered the moment it is in PARTS, with no test of its own to write. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadWidgets();
});

/** the component names a tree uses, in its children and in its props */
function componentsIn(node: PNode, into = new Set<string>()) {
  if (/^[A-Z]/.test(node.type)) into.add(node.type);
  const visit = (v: PValue): void => {
    if (isNode(v)) componentsIn(v, into);
    else if (Array.isArray(v)) v.forEach(visit);
  };
  Object.values(node.props ?? {}).forEach(visit);
  for (const c of node.children ?? []) if (typeof c !== "string") componentsIn(c, into);
  return into;
}

const draw = (slug: string, props?: Record<string, unknown>) => renderToStaticMarkup(createElement("div", null, renderNode(treeOf(partBySlug(slug)!, props))));

/** a value of the wrong type for every prop: a file edited by hand, or saved by another version */
const WRONG = [null, 7, "nope", true, [], {}, [{}], { columns: "x", rows: 1 }, { columns: ["a"], rows: [null, [1], "x"] }, { columns: [], rows: [] }];

const dir = new URL("./", import.meta.url);
const sourceFiles = (sub: string) => readdirSync(new URL(`${sub}/`, dir)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map((f) => ({ name: f, text: readFileSync(new URL(`${sub}/${f}`, dir), "utf8") }));

describe("the palette", () => {
  it("files every part it offers under a section, each by what the part is for", () => {
    for (const d of PARTS) expect(CATEGORIES as readonly string[], d.slug).toContain(d.category);
    for (const c of CATEGORIES) expect(PARTS.filter((d) => d.category === c).length, c).toBeGreaterThan(0);
  });

  it("puts every section in one tier, the atoms first", () => {
    for (const c of CATEGORIES) expect(["atom", "composite"], c).toContain(CATEGORY_TIER[c]);
    const tiers = CATEGORIES.map((c) => CATEGORY_TIER[c]);
    expect(tiers.indexOf("composite")).toBeGreaterThan(0);
    expect(tiers.slice(tiers.indexOf("composite"))).not.toContain("atom");
    /* among the atoms only the box holds other parts: anything else that does is made of more than itself */
    for (const d of PARTS.filter((x) => tierOf(x) === "atom")) expect(!!d.holds && d.slug !== "box", d.slug).toBe(false);
  });

  it("files every kit under a composite section, beside the parts there", () => {
    for (const k of KITS) {
      expect(CATEGORIES as readonly string[], k.slug).toContain(k.category);
      expect(tierOf(k), k.slug).toBe("composite");
      expect(partBySlug(k.slug), `${k.slug} takes a part's id`).toBeUndefined();
    }
    expect(new Set(KITS.map((k) => k.slug)).size).toBe(KITS.length);
  });

  it("offers each thing once: no two parts or kits by the same name in one section", () => {
    for (const c of CATEGORIES) {
      const names = [...PARTS.filter((d) => d.category === c).map((d) => d.name), ...KITS.filter((k) => k.category === c).map((k) => k.name)];
      expect(new Set(names).size, c).toBe(names.length);
    }
  });
});

describe("every part", () => {
  it("has a plain id of its own", () => {
    for (const d of PARTS) expect(d.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(new Set(PARTS.map((d) => d.slug)).size).toBe(PARTS.length);
  });

  it("is plain data: its definition loads no React", () => {
    for (const { name, text } of sourceFiles("defs")) {
      const imports = [...text.matchAll(/^import (?!type )[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
      for (const from of imports) expect(from, `defs/${name} imports ${from}`).toMatch(/^\.\.\/(node|labels|types|flow|atoms|svg)$/);
    }
  });

  it("draws every component it names with something that exists", () => {
    for (const d of PARTS)
      for (const name of componentsIn(treeOf(d, defaultValues(d)))) {
        expect(COMPONENTS[name], `${d.slug}: ${name}`).toBeTruthy();
        expect(FILE_OF[name] ?? EXTERNAL[name] ?? WIDGET_SOURCES[name], `${d.slug}: ${name} has nowhere to be imported from`).toBeTruthy();
      }
  });

  it("draws from its defaults", () => {
    for (const d of PARTS) {
      const out = draw(d.slug, defaultValues(d));
      expect(out, d.slug).not.toMatch(/undefined|\[object|did not load/);
    }
  });

  it("draws whatever a saved prop holds", () => {
    for (const d of PARTS)
      for (const p of d.props)
        for (const wrong of WRONG) expect(() => draw(d.slug, { [p.key]: wrong }), `${d.slug}.${p.key} = ${JSON.stringify(wrong)}`).not.toThrow();
    /* every prop of every part ten times over: its time grows with the catalog */
  }, 30000);

  it("takes a fill, a text color and corners, unless it has no surface of its own to paint", () => {
    /* a progress mark and a skeleton read through their own motion; a snackbar is the toast library's,
     * on the theme's inverse role; the rest paint themselves from their own props */
    const noSurface = new Set(["progress", "circular-progress", "loading-indicator", "spinner", "skeleton", "sonner", "icon", "container", "shape", "image"]);
    const look = { fill: "tertiaryContainer", corners: { tl: 3, tr: 3, br: 3, bl: 3 } } as const;
    const painted = (n: PNode): boolean => String(n.props?.className ?? "").includes("bg-tertiary-container") && /3px/.test(String((n.props?.style as { borderRadius?: string } | undefined)?.borderRadius)) ? true : (n.children ?? []).some((c) => typeof c !== "string" && painted(c));
    for (const d of PARTS) {
      if (noSurface.has(d.slug)) expect(d.appearance, `${d.slug} is listed as having no surface`).toBeUndefined();
      else {
        expect(d.appearance, `${d.slug} has no appearance`).toBeTruthy();
        const tree = (d.view ?? d.tree)(reader(d, defaultValues(d)));
        expect(painted(applyAppearance(tree, look, d.appearance?.target)), `${d.slug}: nothing in its tree is what it paints`).toBe(true);
      }
    }
  });

  it("carries that look through a widget to what it draws", () => {
    for (const d of PARTS) {
      if (!d.appearance || !(treeOf(d, defaultValues(d)).type in WIDGET_SOURCES)) continue;
      const out = renderToStaticMarkup(createElement("div", null, renderNode(treeOf(d, defaultValues(d), { fill: "tertiaryContainer", corners: { tl: 3, tr: 3, br: 3, bl: 3 } }))));
      expect(out, d.slug).toContain("bg-tertiary-container");
      expect(out, d.slug).toContain("border-radius:3px");
    }
  });

  it("survives a save and an open with its values", () => {
    for (const d of PARTS) {
      const item = { ...makeItem(d.slug), props: defaultValues(d) };
      const doc = { groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as Doc;
      const back = JSON.parse(JSON.stringify(doc));
      expect(isProject(back), d.slug).toBe(true);
      expect(back.groups[0].items[0].props).toEqual(defaultValues(d));
    }
  });
});

describe("one way of writing a part", () => {
  const widgets = sourceFiles("widgets");
  const defs = sourceFiles("defs");

  it("presses through Button or Tap, never a bare control", () => {
    for (const { name, text } of widgets) {
      if (name !== "Tap.tsx") expect(text, name).not.toMatch(/<button\b/);
      /* a file picker and a color well have no M3E counterpart: the browser's own is the control */
      if (name !== "ColorField.tsx" && name !== "Inputs.tsx") expect(text, name).not.toMatch(/<(input|select|textarea)\b/);
    }
    for (const { name, text } of defs) expect(text, name).not.toMatch(/h\("(button|input|select|textarea)"/);
  });

  it("colors by theme role, so a theme reaches every part", () => {
    /* words over a photo: its scrim and ink are the one place no theme role can answer for */
    const overPhoto = (text: string) => text.replace(/const SCRIM = \{[\s\S]*?\} as const;/, "").replace(/const (ink|body) = bg \? \(src \? "text-white[^\n]*/g, "");
    for (const { name, text } of [...widgets, ...defs]) expect(overPhoto(text), name).not.toMatch(/\b(text|bg|border|fill|stroke)-(white|black|gray|red|green|blue|yellow|slate|zinc|neutral|stone)\b|\b(text|bg|border)-\[#/);
    for (const { name, text } of widgets) if (!["ColorField.tsx", "Inputs.tsx"].includes(name)) expect(text, name).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });
});

describe("the widgets", () => {
  it("are all used by a part", () => {
    const used = new Set(PARTS.flatMap((d) => [...componentsIn(treeOf(d, defaultValues(d)))]));
    for (const name of Object.keys(WIDGET_SOURCES)) expect(used.has(name), `${name} is not used`).toBe(true);
  });

  it("do not take a name shadcn M3E or Recharts already has", () => {
    for (const name of Object.keys(WIDGET_SOURCES)) {
      expect(FILE_OF[name], name).toBeUndefined();
      expect(EXTERNAL[name], name).toBeUndefined();
    }
  });

  it("all arrive when loaded, from the file printed code names", async () => {
    const mod = await loadWidgets();
    for (const [name, from] of Object.entries(WIDGET_SOURCES)) {
      expect(mod[name], name).toBeTruthy();
      expect(existsSync(new URL(`widgets/${from.slice("@/components/widgets/".length)}.tsx`, dir)), from).toBe(true);
    }
  });
});
