import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildCode } from "../lib/codegen";
import { PROJECT_FORMAT, PROJECT_VERSION, loadDocument, newerVersionOf, openProject, projectFile } from "../lib/project";
import { makeItem, type Doc, type Group, type Item } from "../lib/tokens";
import { setGlobalLang } from "../lib/i18n";
import { PARTS, partBySlug, treeOf } from "./registry";
import { renderNode } from "./render";
import { loadAllModules } from "./components";

/* What is particular to some widgets, the printed code, and the file format. What every part must do is in contract.test.ts. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadAllModules();
});

const docOf = (items: Item[]): Doc =>
  ({
    groups: items.map((it, i): Group => ({ id: `g${i}`, x: 0, y: i * 80, axis: "x", items: [it] })),
    frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
    paletteKey: "purple",
    frame: "phone",
    title: "",
    brief: "",
  }) as Doc;

const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const html = (slug: string, props?: Record<string, unknown>) => renderToStaticMarkup(createElement("div", null, renderNode(treeOf(partBySlug(slug)!, props))));

describe("table", () => {
  it("draws the author's own rows", () => {
    const out = html("table", { data: { columns: ["订单", "金额"], rows: [["A-1", "¥12"]] } });
    expect(out).toContain("订单");
    expect(out).toContain("¥12");
    expect(out).not.toContain("INV-001");
  });

  it("falls back to its sample rows for a malformed value", () => {
    expect(html("table", { data: "nope" })).toContain("INV-001");
  });

  it("does not paint a short row with undefined", () => {
    expect(html("table", { data: { columns: ["a", "b"], rows: [["only"]] } })).not.toContain("undefined");
  });
});

describe("joystick", () => {
  it("draws its knob, placed from the angle", () => {
    expect(html("joystick", { angle: 90 })).toContain('data-angle="90"');
    expect(html("joystick", { angle: 90 })).toContain("calc(50% + 42px)");
  });
});

describe("printed code", () => {
  it("builds a whole screen that mixes shadcn M3E and widgets", () => {
    const items = ["button", "table", "joystick"].map((s) => makeItem(s));
    const { code } = buildCode(docOf(items), {});
    expect(code).toContain(`from "@/components/m3e/button"`);
    expect(code).toContain(`from "@/components/widgets/Joystick"`);
    expect(code).not.toContain("bun add @/");
    /* the import above has to resolve in the reader's project */
    expect(code).toContain("Copy parts/widgets/Joystick.tsx");
  });
});

describe("the file format", () => {
  it("still opens a sketch holding every part, unchanged", () => {
    expect(PARTS.length).toBeGreaterThan(0);
    const doc = json(docOf(PARTS.map((d) => makeItem(d.slug))));
    expect(openProject(doc)).toEqual(doc);
  });

  it("opens a document with no envelope, which is what every older version saved", () => {
    const doc = json(docOf([makeItem("button")]));
    expect(openProject(doc)).toEqual(doc);
  });

  it("opens the file it saves", () => {
    const doc = docOf([makeItem("joystick"), makeItem("button"), makeItem("future-thing")]);
    const file = json(projectFile(doc));
    expect(file).toMatchObject({ format: PROJECT_FORMAT, version: PROJECT_VERSION });
    expect(openProject(file)).toEqual(json(doc));
  });

  it("opens the first version of its own envelope, and refuses another editor's", () => {
    const doc = json(docOf([makeItem("button")]));
    expect(openProject({ format: "m3e-project", version: 1, document: doc })).toEqual(doc);
    expect(openProject({ format: "web-canvas-project", version: 1, doc })).toBeNull();
  });

  it("refuses a project in another editor's shape", () => {
    expect(openProject({ version: 3, title: "M", screens: [{ id: "s", items: [] }] })).toBeNull();
    expect(openProject({ title: "S", screens: [], parts: [] })).toBeNull();
  });

  it("opens a file from a later version as it understands it, marked so that nothing writes it back", () => {
    const later = { format: PROJECT_FORMAT, version: PROJECT_VERSION + 1, document: json(docOf([makeItem("button")])) };
    const loaded = loadDocument(later)!;
    expect(loaded.newer).toBe(PROJECT_VERSION + 1);
    expect(newerVersionOf(loaded.doc)).toBe(PROJECT_VERSION + 1);
    /* saved, it is the file as it came, under its own version: a copy loses nothing this version does not know */
    expect(projectFile(loaded.doc)).toEqual(later);
    expect(newerVersionOf(openProject(json(docOf([makeItem("button")]))))).toBeUndefined();
  });

  it("refuses an envelope with nothing in it", () => {
    expect(openProject({ format: PROJECT_FORMAT, version: 1 })).toBeNull();
  });

});

describe("what is not this editor's", () => {
  const part = (kind: string, id: unknown = "x") => ({ id, kind, component: "button", label: "L", icon: null, variant: "filled" }) as unknown as Item;

  it("refuses a file with a kind it does not have", () => {
    expect(openProject(json(docOf([makeItem("button"), part("noSuchPart")])))).toBeNull();
    expect(openProject(json(docOf([part("")])))).toBeNull();
    expect(openProject(json(docOf([part("component", 7)])))).toBeNull();
  });

  it("keeps a part whose definition is not here, to say so when it draws", () => {
    const item = makeItem("future-thing");
    expect(openProject(json(docOf([item])))!.groups[0].items[0]).toEqual(json(item));
  });
});
