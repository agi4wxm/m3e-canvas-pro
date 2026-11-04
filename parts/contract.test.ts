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
import { CATEGORIES, PARTS, defaultValues, partBySlug, treeOf } from "./registry";
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

  it("offers each thing once: no two parts by the same name in one section", () => {
    for (const c of CATEGORIES) {
      const names = PARTS.filter((d) => d.category === c).map((d) => d.name);
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
      for (const from of imports) expect(from, `defs/${name} imports ${from}`).toMatch(/^\.\.\/(node|labels|types)$/);
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
  });

  it("survives a save and an open with its values", () => {
    for (const d of PARTS) {
      const item = { ...makeItem("component", d.slug), props: defaultValues(d) };
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
