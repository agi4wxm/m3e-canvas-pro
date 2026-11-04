import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buildCode } from "../../lib/codegen";
import { FOREIGN_PREFIX, PROJECT_FORMAT, PROJECT_VERSION, adoptForeignItem, openProject, packsOfDoc, projectFile, unknownDocFields } from "../../lib/project";
import { revertPatch } from "../../lib/migrate";
import { shareable } from "../../lib/share";
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
const forkItem = (kind: string, extra: Record<string, unknown> = {}) => ({ id: "x", kind, label: "L", icon: null, variant: "filled", ...extra }) as unknown as Item;
const first = (doc: Doc | null) => doc!.groups[0].items[0];

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

  it("opens the envelopes two forks write", () => {
    const doc = json(docOf([makeItem("button")]));
    expect(openProject({ format: "m3e-project", version: 1, document: doc })).toEqual(doc);
    expect(openProject({ format: "web-canvas-project", version: 1, doc })).toEqual(doc);
  });

  it("refuses a file from a later version rather than half understanding it", () => {
    expect(openProject({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1, document: json(docOf([makeItem("button")])) })).toBeNull();
  });

  it("refuses an envelope with nothing in it", () => {
    expect(openProject({ format: PROJECT_FORMAT, version: 1 })).toBeNull();
  });

  it("opens a fork's own target, and keeps it", () => {
    const doc = openProject({ ...json(docOf([makeItem("button")])), platform: "ios" }) as Doc & { foreignPlatform?: string; platform?: string };
    expect(doc.foreignPlatform).toBe("ios");
    expect(doc.platform).toBeUndefined();
  });

  it("carries the fields it does not know through to the next save", () => {
    const doc = { ...json(docOf([makeItem("button")])), customParts: [{ id: 1 }], designSystem: "antd" };
    expect(unknownDocFields(openProject(doc)!)).toEqual({ customParts: [{ id: 1 }], designSystem: "antd" });
  });
});

describe("parts nothing here can draw", () => {
  it("opens a fork's joystick and table as the pack's parts and keeps the originals", () => {
    const joystick = forkItem("joystick", { id: "j", size: 180, value: 45, joystickReturn: false });
    const table = forkItem("dataTable", { id: "t", label: "Orders", size: 380, tabs: [{ icon: "", label: "Id" }, { icon: "", label: "Total" }] });
    const doc = openProject(json(docOf([joystick, table])))!;
    const [j, t] = doc.groups.map((g) => g.items[0]);
    expect(j).toMatchObject({ id: "j", kind: "component", component: "game/joystick", props: { size: 180, angle: 45, autoCenter: false } });
    expect(t).toMatchObject({ kind: "component", component: "dashboard/data-table", props: { title: "Orders", width: 380, data: { columns: ["Id", "Total"] } } });
    expect(j.foreign).toEqual(json(joystick));
  });

  it("keeps the badge every older version threw away", () => {
    expect(first(openProject(json(docOf([forkItem("badge", { label: "New" })]))))).toMatchObject({ component: "badge", props: { label: "New" } });
  });

  it("no longer costs the whole file: a kind nobody knows becomes a stand-in of its size", () => {
    const unknown = forkItem("noSuchPart", { size: 170, size2: 210, prizes: [{ a: 1 }] });
    const doc = openProject(json(docOf([makeItem("button"), unknown])))!;
    expect(doc.groups[0].items[0].kind).toBe("button");
    const standIn = doc.groups[1].items[0];
    expect(standIn).toMatchObject({ id: "x", kind: "component", component: `${FOREIGN_PREFIX}noSuchPart`, size: 170, size2: 210, label: "L" });
    expect(standIn.foreign).toEqual(json(unknown));
    expect(partBySlug(standIn.component)).toBeUndefined();
  });

  it("gives the part back when its file comes round again", () => {
    const standIn = adoptForeignItem(json(forkItem("noSuchPart", { prizes: [1] }))) as Item;
    expect(adoptForeignItem(standIn)).toBe(standIn);
    /* the same stand-in, opened by a version whose pack knows this kind */
    const later = { ...standIn, component: `${FOREIGN_PREFIX}joystick`, foreign: { ...standIn.foreign, kind: "joystick", value: 90 } };
    expect(adoptForeignItem(later)).toMatchObject({ component: "game/joystick", props: { angle: 90 } });
  });

  it("does not offer to revert to a kind that cannot be drawn", () => {
    expect(revertPatch(adoptForeignItem(json(forkItem("joystick"))) as Item)).toBeNull();
  });

  it("leaves a part this editor knows exactly as it was", () => {
    const button = makeItem("button");
    expect(adoptForeignItem(button)).toBe(button);
    const part = makeItem("component", "future/thing");
    expect(adoptForeignItem(part)).toBe(part);
  });

  it("still refuses what is not a part at all", () => {
    expect(openProject(json(docOf([forkItem("")])))).toBeNull();
    expect(openProject(json(docOf([{ ...forkItem("noSuchPart"), id: 7 } as unknown as Item])))).toBeNull();
  });

  it("keeps a fork's part out of a link's weight", () => {
    const item = adoptForeignItem(json(forkItem("noSuchPart", { src: "data:image/png;base64,AAAA" }))) as Item;
    expect(shareable(docOf([item])).groups[0].items[0].foreign!.src).toBeUndefined();
    expect(item.foreign!.src).toBe("data:image/png;base64,AAAA");
  });
});
