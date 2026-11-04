import { createElement } from "react";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { isProject } from "../../lib/project";
import { KIND_ORDER, makeItem, type Doc } from "../../lib/tokens";
import { setGlobalLang } from "../../lib/i18n";
import { COMPONENTS } from "../components";
import { EXTERNAL } from "../externals";
import { FILE_OF } from "../files.generated";
import { isNode, type PNode, type PValue } from "../node";
import { CATEGORIES, PARTS, defaultValues, partBySlug, treeOf } from "../registry";
import { renderNode } from "../render";
import { PACKS } from "./index";
import { preloadPacks } from "./load";

/* The contract every pack keeps (文档/组件包接入规范.md), checked for every pack in PACKS: a new
 * pack is covered the moment it is on that list, with no test of its own to write. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await preloadPacks();
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

describe("the list of packs", () => {
  it("gives each pack an id of its own", () => {
    expect(new Set(PACKS.map((p) => p.id)).size).toBe(PACKS.length);
  });

  it("does not let two packs claim one component name", () => {
    const names = PACKS.flatMap((p) => Object.keys(p.sources));
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a folder for every pack and a pack for every folder", () => {
    const folders = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(folders.toSorted()).toEqual(PACKS.map((p) => p.id).toSorted());
  });
});

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

describe.each(PACKS.map((p) => [p.id, p] as const))("pack %s", (id, pack) => {
  it("has a version", () => {
    expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("keeps React out of its definitions", () => {
    const source = readFileSync(new URL(`${id}/index.ts`, dir), "utf8");
    const imports = [...source.matchAll(/^import (?!type )[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
    for (const from of imports) expect(from, `${id}/index.ts imports ${from}`).toMatch(/^\.\.\/\.\.\/(node|labels)$/);
  });

  it("names its parts under its id", () => {
    for (const d of pack.defs) expect(d.slug).toMatch(new RegExp(`^${id}/[a-z][a-z0-9-]*$`));
  });

  it("draws every component its parts name with something that exists", () => {
    const own = new Set(Object.keys(pack.sources));
    const used = new Set<string>();
    for (const d of pack.defs) for (const name of componentsIn(treeOf(d, defaultValues(d)))) {
      used.add(name);
      expect(COMPONENTS[name], `${d.slug}: ${name}`).toBeTruthy();
      expect(FILE_OF[name] ?? EXTERNAL[name] ?? pack.sources[name], `${d.slug}: ${name} has nowhere to be imported from`).toBeTruthy();
    }
    for (const name of own) expect(used.has(name), `${id} declares ${name} and no part uses it`).toBe(true);
  });

  it("does not take a name the shadcn M3E components or Recharts already have", () => {
    for (const name of Object.keys(pack.sources)) {
      expect(FILE_OF[name], name).toBeUndefined();
      expect(EXTERNAL[name], name).toBeUndefined();
    }
  });

  it("delivers every component it declares when loaded", async () => {
    const names = Object.keys(pack.sources);
    if (!names.length) return;
    expect(pack.load, `${id} declares components and has no load`).toBeTruthy();
    const mod = await pack.load!();
    for (const name of names) expect(mod[name], name).toBeTruthy();
  });

  it("ships the file printed code tells people to copy", () => {
    for (const { from } of Object.values(pack.sources)) {
      if (!from.startsWith("@/")) continue;
      expect(from.startsWith(`@/components/packs/${id}/`), from).toBe(true);
      expect(existsSync(new URL(`${from.slice("@/components/packs/".length)}.tsx`, dir)), from).toBe(true);
    }
  });

  it("draws every part from its defaults", () => {
    for (const d of pack.defs) {
      const out = draw(d.slug, defaultValues(d));
      expect(out.length, d.slug).toBeGreaterThan(20);
      expect(out, d.slug).not.toMatch(/undefined|\[object|did not load/);
    }
  });

  it("draws every part whatever a saved prop holds", () => {
    for (const d of pack.defs)
      for (const p of d.props)
        for (const wrong of WRONG) expect(() => draw(d.slug, { [p.key]: wrong }), `${d.slug}.${p.key} = ${JSON.stringify(wrong)}`).not.toThrow();
  });

  it("survives a save and an open with its values", () => {
    for (const d of pack.defs) {
      const item = { ...makeItem("component", d.slug), props: defaultValues(d) };
      const doc = { groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item] }], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as Doc;
      const back = JSON.parse(JSON.stringify(doc));
      expect(isProject(back), d.slug).toBe(true);
      expect(back.groups[0].items[0].props).toEqual(defaultValues(d));
    }
  });
});
