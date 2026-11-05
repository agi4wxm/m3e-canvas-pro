import { FLOW_PROPS, GRID_PROPS } from "../flow";
import { h, ic, listSlots } from "../node";
import type { P, PartDef, PropDef } from "../types";

/* Containers: the ground other parts are put on. Dropped wholly inside one, a part moves with it,
 * and the prompt reads it as nested; see `heldBy` in lib/tokens.ts. What they hold is placed by hand,
 * or by the auto layout most of them offer (parts/flow.ts). The set follows JetSquirrel/gpui-kit-canvas
 * (MIT); each is drawn from scratch on M3E's roles. A split view is the shadcn M3E Resizable, which
 * holds parts too. */

const WIDTH = (value: number): PropDef => ({ key: "width", label: "Width", kind: "number", default: value, min: 40, max: 2400, step: 4, unit: "px" });
const HEIGHT = (value: number): PropDef => ({ key: "height", label: "Height", kind: "number", default: value, min: 40, max: 2400, step: 4, unit: "px" });
const LABEL = (value: string, zh: string): PropDef => ({ key: "label", label: "Label", kind: "text", default: value, defaults: { zh } });
const NOTE = (value: string, zh: string): PropDef => ({ key: "note", label: "Description", labels: { ja: "説明", zh: "说明", ko: "설명" }, kind: "text", default: value, defaults: { zh } });

const box = (p: P) => ({ width: Math.round(p.n("width")), height: Math.round(p.n("height")) });

/** every container has a size of its own, both ways, and holds */
function container(slug: string, name: string, labels: NonNullable<PartDef["labels"]>, icon: string, w: number, hh: number, props: PropDef[], tree: PartDef["tree"], flow?: PartDef["flow"]): PartDef {
  /* a plain container paints itself from its own props, the others take the part's look */
  return { slug, name, labels, category: "Layout", icon, w, h: hh, holds: true, flow, ...(slug === "container" ? {} : { appearance: { radius: 12 } }), props: [...props, ...(flow?.grid ? GRID_PROPS : flow ? FLOW_PROPS : []), WIDTH(w), HEIGHT(hh)], tree };
}

/** a container whose rows are tabs, each with content of its own. It flows from the start: what is
 *  dropped on a tab stacks up under the bar instead of landing in a heap to be placed by hand. */
const tabbed = (d: PartDef): PartDef => ({
  ...d,
  panes: true,
  selectKey: "selected",
  slots: (p) => listSlots(p.list("items")),
  props: d.props.map((x) => (x.key === "layout" ? ({ ...x, default: "column" } as PropDef) : x)),
});

const FILLS = ["none", "surface", "surface-container-low", "surface-container", "surface-container-high", "surface-container-highest", "primary-container", "secondary-container", "tertiary-container"];
const BORDER: Record<string, string> = { none: "", solid: "border border-outline-variant", dashed: "border border-dashed border-outline-variant" };

export const containers: PartDef[] = [
  container(
    "container",
    "Container",
    { ja: "コンテナ", zh: "容器", ko: "컨테이너" },
    "crop_square",
    380,
    200,
    [
      LABEL("Container", "容器"),
      NOTE("", ""),
      { key: "place", label: "Label place", labels: { ja: "ラベルの位置", zh: "标题位置", ko: "라벨 위치" }, kind: "enum", default: "center", options: ["center", "start"], when: (p) => p.s("layout") === "free" },
      { key: "fill", label: "Fill", labels: { ja: "塗り", zh: "填充", ko: "채우기" }, kind: "enum", default: "surface-container-low", options: FILLS },
      { key: "border", label: "Border", labels: { ja: "枠線", zh: "边框", ko: "테두리" }, kind: "enum", default: "dashed", options: Object.keys(BORDER) },
      { key: "radius", label: "Corner", labels: { ja: "角丸", zh: "圆角", ko: "모서리" }, kind: "number", default: 12, min: 0, max: 48, step: 2, unit: "px" },
        { key: "blur", label: "Background blur", labels: { ja: "背景のぼかし", zh: "背景模糊", ko: "배경 흐림" }, kind: "number", default: 0, min: 0, max: 40, step: 1, unit: "px" },
    ],
    (p) => {
      /* laying its parts out, it has no words of its own to place among them */
      const bare = p.s("layout") !== "free";
      return h(
        "div",
        {
          "data-slot": "layout-container",
          className: `${bare ? "" : `flex flex-col gap-1 p-4 ${p.s("place") === "start" ? "items-start justify-start" : "items-center justify-center"}`} overflow-hidden ${BORDER[p.s("border")] ?? ""}`.trim(),
          style: { ...box(p), borderRadius: p.n("radius") === 12 ? "var(--md-sys-shape-corner-medium)" : Math.round(p.n("radius")), background: p.s("fill") === "none" ? undefined : `var(--md-sys-color-${p.s("fill")})`, backdropFilter: p.n("blur") > 0 ? `blur(${Math.round(p.n("blur"))}px)` : undefined },
        },
        !bare && p.s("label") && h("div", { className: `truncate ${p.s("place") === "start" ? "text-title-small text-on-surface" : "text-label-large text-on-surface-variant"}` }, p.s("label")),
        !bare && p.s("note") && h("div", { className: "text-body-small text-on-surface-variant truncate" }, p.s("note")),
      );
    },
    {},
  ),
  container("stack", "Stack", { ja: "スタック", zh: "层叠", ko: "스택" }, "layers", 380, 200, [LABEL("Stack", "层叠"), NOTE("Layers, one over another", "一层叠着一层")], (p) =>
    h(
      "div",
      { "data-slot": "layout-stack", className: "bg-surface-container-low relative overflow-hidden rounded-xl", style: box(p) },
      h("div", { className: "bg-surface-container-high absolute inset-x-8 top-4 bottom-10 rounded-lg" }),
      h("div", { className: "bg-surface-container-highest absolute inset-x-5 top-7 bottom-7 rounded-lg" }),
      h("div", { className: "bg-surface-bright border-outline-variant absolute inset-x-2 top-10 bottom-2 flex flex-col justify-end rounded-lg border p-3" }, h("div", { className: "text-title-small text-on-surface truncate" }, p.s("label")), p.s("note") && h("div", { className: "text-body-small text-on-surface-variant truncate" }, p.s("note"))),
    ),
  ),
  container(
    "grid-view",
    "Grid",
    { ja: "グリッド", zh: "网格", ko: "격자" },
    "grid_view",
    380,
    280,
    [
      LABEL("Grid", "网格"),
      NOTE("Two columns", "两列"),
      { key: "columns", label: "Columns", labels: { ja: "列", zh: "列数", ko: "열" }, kind: "number", default: 2, min: 1, max: 12, step: 1 },
      { key: "rows", label: "Rows", labels: { ja: "行", zh: "行数", ko: "행" }, kind: "number", default: 2, min: 1, max: 12, step: 1 },
    ],
    (p) => {
      const columns = Math.round(p.n("columns"));
      const count = columns * Math.round(p.n("rows"));
      return h(
        "div",
        { "data-slot": "layout-grid-view", className: "bg-surface-container-low flex flex-col gap-2 overflow-hidden rounded-xl", style: { ...box(p), padding: `${Math.round(p.n("padY"))}px ${Math.round(p.n("padX"))}px` } },
        (p.s("label") || p.s("note")) && h("div", { className: "flex h-5 items-baseline gap-2" }, h("span", { className: "text-title-small text-on-surface truncate" }, p.s("label")), h("span", { className: "text-body-small text-on-surface-variant truncate" }, p.s("note"))),
        h("div", { "data-flow": "cells", className: "grid min-h-0 flex-1", style: { gap: Math.round(p.n("gap")), gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } }, ...Array.from({ length: count }, () => h("div", { className: "bg-surface-container-high rounded-lg" }))),
      );
    },
    { grid: true, inset: (p) => (p.s("label") || p.s("note") ? { t: 28 } : {}) },
  ),
  tabbed(
    container(
      "dock",
      "Dock",
      { ja: "ドック", zh: "停靠面板", ko: "도크" },
      "tab",
      640,
      360,
      [
        { key: "items", label: "Tabs", labels: { ja: "タブ", zh: "标签", ko: "탭" }, kind: "list", default: [{ label: "Overview" }, { label: "Activity" }, { label: "Settings" }], min: 1, max: 12 },
        { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 11, step: 1 },
      ],
      (p) => {
        const selected = Math.round(p.n("selected"));
        return h(
          "div",
          { "data-slot": "layout-dock", className: "bg-surface flex flex-col overflow-hidden rounded-lg", style: box(p) },
          h(
            "div",
            { className: "bg-surface-container border-outline-variant flex h-10 shrink-0 items-stretch overflow-hidden border-b" },
            ...p.list("items").map((tab, i) => h("Button", { variant: "text", "data-tap": `tab:${i}`, "data-active": i === selected ? "true" : undefined, className: `text-label-large h-full shrink-0 rounded-none border-0 border-b-2 px-3 ${i === selected ? "border-primary bg-surface text-on-surface" : "text-on-surface-variant border-transparent"}` }, tab.label)),
          ),
          h("div", { "data-flow": "body", className: "min-h-0 flex-1" }),
        );
      },
      { inset: () => ({ t: 40 }) },
    ),
  ),
  container(
    "supporting-pane",
    "Supporting pane",
    { ja: "サポートペイン", zh: "辅助面板", ko: "보조 창" },
    "right_panel_open",
    360,
    480,
    [LABEL("Details", "详情"), NOTE("More about what is selected.", "所选内容的补充信息。"), { key: "icon", label: "Icon", kind: "icon", default: "info" }],
    (p) =>
      h(
        "div",
        { "data-slot": "layout-supporting-pane", className: "bg-surface-container-low flex flex-col gap-2 overflow-hidden rounded-3xl p-5", style: box(p) },
        h("div", { className: "text-on-surface flex h-7 shrink-0 items-center gap-2" }, p.s("icon") && ic(p.s("icon"), { className: "size-5 shrink-0" }), h("span", { className: "text-title-medium truncate" }, p.s("label"))),
        p.s("note") && h("div", { className: "text-body-medium text-on-surface-variant h-10 shrink-0 overflow-hidden" }, p.s("note")),
        h("div", { "data-flow": "body", className: "min-h-0 flex-1" }),
      ),
    { inset: (p) => ({ t: p.s("note") ? 96 : 48 }) },
  ),
];
