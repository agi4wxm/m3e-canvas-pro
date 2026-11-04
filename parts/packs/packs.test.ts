import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildCode } from "../../lib/codegen";
import { PROJECT_FORMAT, PROJECT_VERSION, openProject, packsOfDoc, projectFile } from "../../lib/project";
import { KIND_ORDER, makeItem, type Doc, type Group, type Item } from "../../lib/tokens";
import { setGlobalLang } from "../../lib/i18n";
import { importLines, namesIn, packagesOf, printNode } from "../print";
import { partBySlug, treeOf } from "../registry";
import { renderNode } from "../render";
import { preloadPacks } from "./load";

/* What is particular to these packs, and the file format around them. What every pack must do is in contract.test.ts. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await preloadPacks();
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

describe("dashboard/data-table", () => {
  it("draws the author's own rows", () => {
    const out = html("dashboard/data-table", { data: { columns: ["订单", "金额"], rows: [["A-1", "¥12"]] } });
    expect(out).toContain("订单");
    expect(out).toContain("¥12");
    expect(out).not.toContain("INV-001");
  });

  it("falls back to its sample rows for a malformed value", () => {
    expect(html("dashboard/data-table", { data: "nope" })).toContain("INV-001");
  });

  it("does not paint a short row with undefined", () => {
    expect(html("dashboard/data-table", { data: { columns: ["a", "b"], rows: [["only"]] } })).not.toContain("undefined");
  });
});

describe("game/joystick", () => {
  it("draws its knob, placed from the angle", () => {
    expect(html("game/joystick", { angle: 90 })).toContain('data-angle="90"');
    expect(html("game/joystick", { angle: 90 })).toContain("calc(50% + 42px)");
  });
});

describe("printed code", () => {
  it("imports an Ant Design part from antd, under the name it is drawn with", () => {
    const names = namesIn(treeOf(partBySlug("antd/button")!));
    expect(importLines(names)).toEqual([`import { Button as AntButton } from "antd"`]);
    expect(packagesOf(names)).toEqual(["antd"]);
    expect(printNode(treeOf(partBySlug("antd/button")!)).join("")).toContain("<AntButton");
  });

  it("never asks to install a pack's local file as an npm package", () => {
    expect(packagesOf(namesIn(treeOf(partBySlug("game/joystick")!)))).toEqual([]);
  });

  it("builds a whole screen that mixes the libraries", () => {
    const items = ["button", "dashboard/data-table", "game/joystick", "antd/button"].map((s) => makeItem("component", s));
    const { code } = buildCode(docOf(items), {});
    expect(code).toContain(`from "@/components/m3e/button"`);
    expect(code).toContain(`import { Button as AntButton } from "antd"`);
    expect(code).toContain(`from "@/components/packs/game/Joystick"`);
    expect(code).toContain("bun add antd");
    expect(code).not.toContain("bun add @/");
    /* the import above has to resolve in the reader's project */
    expect(code).toContain("Copy parts/packs/game/Joystick.tsx");
  });
});

describe("the file format", () => {
  it("still opens a sketch holding every original kind, unchanged", () => {
    const kinds = KIND_ORDER.filter((k) => k !== "component");
    expect(kinds.length).toBe(36);
    const doc = json(docOf(kinds.map((k) => makeItem(k))));
    expect(openProject(doc)).toEqual(doc);
  });

  it("opens a document with no envelope, which is what every older version saved", () => {
    const doc = json(docOf([makeItem("button")]));
    expect(openProject(doc)).toEqual(doc);
  });

  it("opens the file it saves, naming the packs it needs", () => {
    const doc = docOf([makeItem("component", "game/joystick"), makeItem("component", "button"), makeItem("component", "future/thing")]);
    const file = json(projectFile(doc));
    expect(file).toMatchObject({ format: PROJECT_FORMAT, version: PROJECT_VERSION, packs: { game: "0.1.0" } });
    expect(Object.keys(file.packs)).toEqual(["game"]);
    expect(openProject(file)).toEqual(json(doc));
    expect(packsOfDoc(doc)).toEqual({ game: "0.1.0" });
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

  it("refuses a file from a later version rather than half understanding it", () => {
    expect(openProject({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1, document: json(docOf([makeItem("button")])) })).toBeNull();
  });

  it("refuses an envelope with nothing in it", () => {
    expect(openProject({ format: PROJECT_FORMAT, version: 1 })).toBeNull();
  });

});

describe("what is not this editor's", () => {
  const part = (kind: string, id: unknown = "x") => ({ id, kind, label: "L", icon: null, variant: "filled" }) as unknown as Item;

  it("refuses a file with a kind it does not have", () => {
    expect(openProject(json(docOf([makeItem("button"), part("noSuchPart")])))).toBeNull();
    expect(openProject(json(docOf([part("")])))).toBeNull();
    expect(openProject(json(docOf([part("button", 7)])))).toBeNull();
  });

  it("keeps a part whose definition is not here, to say so when it draws", () => {
    const item = makeItem("component", "future/thing");
    expect(openProject(json(docOf([item])))!.groups[0].items[0]).toEqual(json(item));
  });
});
