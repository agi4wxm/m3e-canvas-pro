import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FOREIGN_PREFIX, openProject } from "../../lib/project";
import { KIND_ORDER, type Doc, type Item } from "../../lib/tokens";
import { setGlobalLang } from "../../lib/i18n";
import { partBySlug, viewOf } from "../registry";
import { renderNode } from "../render";
import { preloadPacks } from "./load";

/* fixtures/fork-items.json holds what each fork's own `makeItem` builds for every kind it has, made
 * by running that fork's lib/tokens.ts: the real shape of what those forks save. */

type Fork = { kinds: number; items: Record<string, Record<string, unknown>> };
const FORKS: Record<string, Fork> = JSON.parse(readFileSync(new URL("../../fixtures/fork-items.json", import.meta.url), "utf8"));
const NAMES = Object.keys(FORKS).filter((n) => Object.keys(FORKS[n].items).length > 0);

const docOf = (items: Record<string, unknown>[]) => ({
  groups: items.map((it, i) => ({ id: `g${i}`, x: 0, y: i * 80, axis: "x", items: [it] })),
  frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
  paletteKey: "purple",
  frame: "phone",
  title: "",
  brief: "",
});

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await preloadPacks();
});

describe("every part every fork can save", () => {
  it("has real data to check", () => {
    expect(NAMES.length).toBeGreaterThan(40);
  });

  it.each(NAMES)("%s opens with nothing lost", (name) => {
    const raws = Object.values(FORKS[name].items);
    const opened = openProject(JSON.parse(JSON.stringify(docOf(raws)))) as Doc | null;
    expect(opened, `${name} did not open`).not.toBeNull();
    const items = opened!.groups.flatMap((g) => g.items) as Item[];
    expect(items.length).toBe(raws.length);
    items.forEach((item, i) => {
      const raw = raws[i];
      expect(item.id).toBe(raw.id);
      if ((KIND_ORDER as readonly string[]).includes(String(raw.kind))) return;
      /* a kind this editor does not have: the part as saved is still all there */
      expect(item.foreign, String(raw.kind)).toEqual(JSON.parse(JSON.stringify(raw)));
      /* and it opens as a part that exists, or as a stand-in for one that does not */
      expect(item.kind !== "component" || item.component!.startsWith(FOREIGN_PREFIX) || !!partBySlug(item.component), `${raw.kind} -> ${item.kind}/${item.component}`).toBe(true);
    });
  });

  it.each(NAMES)("%s draws what it brought over", (name) => {
    const raws = Object.values(FORKS[name].items);
    const opened = openProject(JSON.parse(JSON.stringify(docOf(raws)))) as Doc;
    for (const item of opened.groups.flatMap((g) => g.items) as Item[]) {
      const def = partBySlug(item.component);
      if (!def || !item.foreign) continue;
      const html = renderToStaticMarkup(createElement("div", null, renderNode(viewOf(def, item.props))));
      expect(html.length, `${name}: ${item.foreign.kind}`).toBeGreaterThan(20);
      expect(html, `${name}: ${item.foreign.kind}`).not.toMatch(/undefined|\[object/);
    }
  });
});

describe("what a fork's part says comes across", () => {
  const item = (fork: string, kind: string) => (openProject(JSON.parse(JSON.stringify(docOf([FORKS[fork].items[kind]])))) as Doc).groups[0].items[0] as Item;

  it("reads all three ways a fork saves a table", () => {
    const dashboard = item("表格与图表/仪表盘组件", "dataTable").props as { data: { columns: string[]; rows: string[][] } };
    expect(dashboard.data.columns.length).toBe(4);
    const desktop = item("导航与桌面布局/桌面布局与Tauri", "dataTable").props as { data: { columns: string[]; rows: string[][] } };
    expect(desktop.data.columns.length).toBe(3);
    expect(desktop.data.rows.length).toBe(3);
    const gpui = item("导航与桌面布局/GPUI组件画布", "dataTable").props as { data: { columns: string[]; rows: string[][] } };
    expect(gpui.data.rows.length).toBe(3);
    expect(gpui.data.rows[0].length).toBe(4);
  });

  it("takes a stat card's figure as its value", () => {
    expect(item("表格与图表/仪表盘组件", "statCard").props?.value).toBe(FORKS["表格与图表/仪表盘组件"].items.statCard.supporting);
  });

  it("brings the entries of a segmented button and a menu", () => {
    expect((item("基础控件/头像与反馈控件", "segmentedButton").props?.items as unknown[]).length).toBe(3);
    expect((item("风格与平台/iOS与自定义组件", "menu").props?.items as { icon?: string }[]).every((e) => !e.icon?.startsWith("sf:"))).toBe(true);
  });

  it("scales Miuix's progress, which runs from 0 to 1", () => {
    expect(item("风格与平台/Miuix原型画布", "progress").props?.value).toBe(45);
    expect(item("导航与桌面布局/GPUI组件画布", "progress").props?.value).toBe(60);
  });

  it("tells a name that means two things apart by its dialect", () => {
    expect(item("游戏界面/游戏控件与组合市场", "stepper").component).toBe("game/quantity-stepper");
    expect(item("风格与平台/iOS与自定义组件", "stepper").component).toBe("game/quantity-stepper");
    expect(item("导航与桌面布局/GPUI组件画布", "stepper").component).toBe("desktop/steps");
    expect(item("导航与桌面布局/GPUI组件画布", "calendar").component).toBe("calendar");
    /* the game fork's daily check-in is not a date grid, and nothing here stands for it yet */
    expect(item("游戏界面/游戏控件与组合市场", "calendar").component).toBe(`${FOREIGN_PREFIX}calendar`);
  });

  it("opens a same-named part of another dialect as what it means there", () => {
    expect(item("导航与桌面布局/GPUI组件画布", "button")).toMatchObject({ component: "button", props: { label: FORKS["导航与桌面布局/GPUI组件画布"].items.button.label, variant: "tonal" } });
    expect(item("风格与平台/Miuix原型画布", "fab")).toMatchObject({ component: "fab", props: { icon: "add" } });
    expect(item("导航与桌面布局/GPUI组件画布", "text")).toMatchObject({ kind: "text", size: 20 });
  });

  it("does not fill a converted row with a part's seed text", () => {
    expect(item("导航与桌面布局/GPUI组件画布", "settings").props?.description).toBe("");
    expect(item("导航与桌面布局/GPUI组件画布", "list").props?.description).toBe("");
  });

  it("names GPUI's icons in Material's words", () => {
    const rows = item("导航与桌面布局/GPUI组件画布", "tree").props?.items as { icon?: string }[];
    expect(rows.map((r) => r.icon)).toEqual(["folder_open", "draft", "folder", "draft"]);
  });
});

describe("a Miuix project", () => {
  const miuix = FORKS["风格与平台/Miuix原型画布"].items;
  const part = (kind: string, extra: Record<string, unknown>) => ({ ...miuix[kind], x: 16, y: 40, label: "", ...extra });
  const file = () => ({
    version: 3,
    title: "M",
    brief: "b",
    platform: "cmp",
    theme: { mode: "dark", seed: "#3482FF", monet: true },
    screens: [
      { id: "s1", name: "One", x: 100, y: 50, preset: "phone", items: [part("button", { id: "b1", label: "Go", to: "s2", transition: "fade" }), part("gacha", { id: "unknown", kind: "pullToRefresh" })] },
      { id: "s2", name: "Two", x: 700, y: 50, preset: "desktop", note: "n", items: [part("navigationBar", { id: "n1", tabs: [{ icon: "home", label: "Home", to: "s1" }, { icon: "star", label: "Star" }] })] },
    ],
  });

  it("opens with its screens, places, colors and flow", () => {
    const doc = openProject(JSON.parse(JSON.stringify(file()))) as Doc & { foreignPlatform?: string };
    expect(doc).not.toBeNull();
    expect(doc.frames.map((f) => f.id)).toEqual(["s1", "s2"]);
    expect(doc.frames[1]).toMatchObject({ w: 1280, note: "n" });
    expect(doc.groups[0]).toMatchObject({ x: 116, y: 90 });
    expect(doc.title).toBe("M");
    expect(doc.paletteKey).toBe("custom");
    expect(doc.customPalette?.seed?.toUpperCase()).toBe("#3482FF");
    expect(doc.theme?.dark).toBe(true);
    expect(doc.foreignPlatform).toBe("cmp");
    const [button, unknown, nav] = doc.groups.map((g) => g.items[0]);
    expect(button).toMatchObject({ component: "button", props: { label: "Go" }, action: { to: "s2", transition: "fade" } });
    expect(unknown.component).toBe(`${FOREIGN_PREFIX}pullToRefresh`);
    expect(nav).toMatchObject({ component: "navigation-bar", actions: { "tab:0": { to: "s1" } } });
    expect((nav.props?.items as unknown[]).length).toBe(2);
  });

  it("refuses what only looks like one", () => {
    expect(openProject({ title: "x", screens: [{ id: "a", parts: [] }] })).toBeNull();
  });
});

describe("what comes across when a part is converted", () => {
  /* Every word and row a fork's part holds should be somewhere in what it opens as. These are the
     ones with no place in the part they open as: still whole in `foreign`, not shown. */
  const NO_PLACE: Record<string, string[]> = {
    sideSheet: ["tabs"],
    banner: ["tabs"],
    settings: ["label"],
    stepper: ["label"],
    /* a caption for a stand-in that shows its address */
    webView: ["supporting"],
    /* the plot's series names: its points are placeholders until the author gives their own */
    scatterChart: ["tabs"],
  };
  const inside = (hay: unknown, needle: string) => JSON.stringify(hay).includes(JSON.stringify(needle).slice(1, -1));

  it.each(NAMES)("%s keeps its words", (name) => {
    const lost: string[] = [];
    for (const raw of Object.values(FORKS[name].items)) {
      const opened = openProject(JSON.parse(JSON.stringify(docOf([raw])))) as Doc;
      const item = opened.groups[0].items[0] as Item;
      if (!item.foreign || item.component?.startsWith(FOREIGN_PREFIX)) continue;
      const kind = String(raw.kind);
      const { foreign: _foreign, ...shown } = item;
      const allowed = NO_PLACE[kind] ?? [];
      for (const field of ["label", "supporting"]) {
        const value = raw[field];
        if (typeof value === "string" && value && !value.includes("\t") && !allowed.includes(field) && !inside(shown, value)) lost.push(`${kind}.${field}`);
      }
      if (Array.isArray(raw.tabs) && !allowed.includes("tabs"))
        for (const t of raw.tabs as { label?: string }[]) for (const cell of String(t.label ?? "").split("\t")) if (cell.trim() && !inside(shown, cell.trim())) lost.push(`${kind}.tabs`);
    }
    expect([...new Set(lost)]).toEqual([]);
  });
});
