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
import { CATEGORIES, OFFERED_PARTS, PARTS, defaultValues, partBySlug, treeOf } from "../registry";
import { renderNode } from "../render";
import { PACKS, isDrawnKind } from "./index";
import { ANT_COMPONENTS, CORE_LEGACY_KINDS, DIALECT_KINDS } from "./legacy";
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

  it("does not let two packs claim one component name or one saved kind", () => {
    const names = PACKS.flatMap((p) => Object.keys(p.sources));
    expect(new Set(names).size).toBe(names.length);
    const kinds = PACKS.flatMap((p) => Object.keys(p.legacyKinds ?? {}));
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("has a folder for every pack and a pack for every folder", () => {
    const folders = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(folders.toSorted()).toEqual(PACKS.map((p) => p.id).toSorted());
  });
});

describe("the kinds shadcn M3E parts stand for", () => {
  it("point at parts that exist, and only write props those parts have", () => {
    for (const [kind, legacy] of Object.entries(CORE_LEGACY_KINDS)) {
      expect(KIND_ORDER as readonly string[], kind).not.toContain(kind);
      const def = partBySlug(legacy.slug);
      expect(def, `${kind} -> ${legacy.slug}`).toBeTruthy();
      const props = legacy.props({ kind, id: "x", label: "L", supporting: "S", size: 100, size2: 50, value: 1, selected: 1, checked: true, side: "left", tabs: [{ label: "A" }] });
      const keys = new Set(def!.props.map((p) => p.key));
      for (const key of Object.keys(props)) expect(keys.has(key), `${kind} writes ${key}`).toBe(true);
    }
  });

  it("from the Ant Design fork write only what its parts have", () => {
    const props = { label: "L", type: "default", size: "middle", danger: true, disabled: true, placeholder: "P", value: "V", allowClear: true, options: "A", fields: "A", layout: "vertical", submitText: "S", showSubmit: true, title: "T", extra: "E", body: "B", bordered: true, hoverable: true, columns: "A|a", rows: 2, pagination: true, items: "A", activeKey: 0, selectedKey: 0, mode: "inline", separator: "/", total: 9, pageSize: 3, current: 1, content: "C", okText: "O", cancelText: "N", open: true, text: "X", dashed: true };
    for (const [component, known] of Object.entries(ANT_COMPONENTS)) {
      const def = partBySlug(known.slug);
      expect(def, `${component} -> ${known.slug}`).toBeTruthy();
      const keys = new Set(def!.props.map((p) => p.key));
      for (const key of Object.keys(known.props({ kind: "dsComponent", id: "x", size: 300, component, props }))) expect(keys.has(key), `${component} writes ${key}`).toBe(true);
    }
  });

  it.each(Object.entries(DIALECT_KINDS))("in the %s dialect point at things that exist", (_name, table) => {
    const sample = { kind: "x", id: "x", label: "L", supporting: "S", size: 100, size2: 50, w: 100, h: 50, value: 1, from: 0, selected: 1, checked: true, side: "left", icon: "add", tabs: [{ label: "A" }], variant: "default", confirm: "OK" };
    for (const [kind, known] of Object.entries(table)) {
      if (!isDrawnKind(known)) {
        expect(KIND_ORDER as readonly string[], `${kind} -> ${known.kind}`).toContain(known.kind);
        continue;
      }
      const def = partBySlug(known.slug);
      expect(def, `${kind} -> ${known.slug}`).toBeTruthy();
      const keys = new Set(def!.props.map((p) => p.key));
      for (const key of Object.keys(known.props(sample))) expect(keys.has(key), `${kind} writes ${key}`).toBe(true);
    }
  });

  it("do not also belong to a pack", () => {
    for (const p of PACKS) for (const kind of Object.keys(p.legacyKinds ?? {})) expect(Object.keys(CORE_LEGACY_KINDS), kind).not.toContain(kind);
  });
});

describe("the palette", () => {
  it("files every part it offers under a section, each by what the part is for", () => {
    for (const d of OFFERED_PARTS) expect(CATEGORIES as readonly string[], d.slug).toContain(d.category);
    for (const c of CATEGORIES) expect(OFFERED_PARTS.filter((d) => d.category === c).length, c).toBeGreaterThan(0);
  });

  it("offers each thing once: no two parts by the same name in one section", () => {
    for (const c of CATEGORIES) {
      const names = OFFERED_PARTS.filter((d) => d.category === c).map((d) => d.name);
      expect(new Set(names).size, c).toBe(names.length);
    }
  });
});

describe("the parts merged into others", () => {
  const retired = PACKS.flatMap((p) => Object.entries(p.retired ?? {}));

  it("no longer exist, and each became something that does", () => {
    const old = { title: "T", message: "M", confirm: "C", cancel: "N", label: "L", value: "V", text: "X", width: 200, height: 100, length: 80, thickness: 2, fill: "primary", columns: [{ label: "A" }, { label: "B" }], rows: 2, caption: "C", selected: 1, bars: 3, series: 1, style: "footer", radius: 8, note: "N", split: 30, side: "left" };
    expect(retired.length).toBeGreaterThan(0);
    for (const [slug, now] of retired) {
      expect(PARTS.map((d) => d.slug), slug).not.toContain(slug);
      if (!isDrawnKind(now)) {
        expect(KIND_ORDER as readonly string[], slug).toContain(now.kind);
        continue;
      }
      const def = partBySlug(now.slug);
      expect(def, `${slug} -> ${now.slug}`).toBeTruthy();
      const keys = new Set(def!.props.map((p) => p.key));
      for (const key of Object.keys(now.props(old))) expect(keys.has(key), `${slug} writes ${key}`).toBe(true);
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
    for (const from of imports) expect(from, `${id}/index.ts imports ${from}`).toMatch(/^(\.\.\/\.\.\/(node|labels)|\.\.\/legacy)$/);
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

  it("takes over only kinds the editor does not have, and only with props the part has", () => {
    for (const [kind, legacy] of Object.entries(pack.legacyKinds ?? {})) {
      expect(KIND_ORDER as readonly string[]).not.toContain(kind);
      if (!isDrawnKind(legacy)) {
        expect(KIND_ORDER as readonly string[], `${kind} -> ${legacy.kind}`).toContain(legacy.kind);
        continue;
      }
      const def = partBySlug(legacy.slug);
      expect(def, `${kind} -> ${legacy.slug}`).toBeTruthy();
      const props = legacy.props({ kind, id: "x", label: "L", size: 100, value: 1, tabs: [{ label: "A" }] });
      const keys = new Set(def!.props.map((p) => p.key));
      for (const key of Object.keys(props)) expect(keys.has(key), `${kind} writes ${key}`).toBe(true);
    }
  });
});
