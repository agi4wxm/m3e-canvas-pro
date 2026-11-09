import { FLOW_PROPS, GRID_PROPS } from "../flow";
import { h, ic, listSlots } from "../node";
import type { Choice, P, PartDef, PropDef } from "../types";
import { cssColor } from "../color";

/* Containers: the ground other parts are put on. Dropped wholly inside one, a part moves with it,
 * and the prompt reads it as nested; see `heldBy` in lib/tokens.ts. What they hold is placed by hand,
 * or by the auto layout most of them offer (parts/flow.ts). The set follows JetSquirrel/gpui-kit-canvas
 * (MIT); each is drawn from scratch on M3E's roles. A split view lays out two panes of its own, drawn with the
 * shadcn M3E Resizable (react-resizable-panels). */

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

const opt = (value: string, label: string, zh: string, ja: string, ko: string): Choice => ({ value, label, labels: { zh, ja, ko } });
const px = (key: string, label: string, labels: NonNullable<PropDef["labels"]>, when?: PropDef["when"]): PropDef => ({ key, label, labels, kind: "number", default: 0, min: 0, max: 2400, step: 4, unit: "px", ...(when ? { when } : {}) });
const folds = (p: P) => p.s("collapsible") !== "none";

/** Two panes side by side, or one over the other, both showing, with a divider the visitor drags (lib/split.ts). The
 *  panes are boxes of their own, made with it, that hold any parts; the split view says only how long each is. */
const splitView: PartDef = {
  slug: "split-view",
  name: "Split view",
  labels: { ja: "分割ビュー", zh: "分栏视图", ko: "분할 보기" },
  category: "Layout",
  icon: "vertical_split",
  holds: true,
  w: 640,
  h: 360,
  appearance: { radius: 0 },
  /* the visitor's own share of the first pane, which a drag changes (UI state, never the design's `split`) */
  input: { prop: "split", kind: "number", resets: ["collapsed"] },
  events: [{ name: "resize", label: "Divider moved", labels: { ja: "区切りを動かした", zh: "拖动了分隔条", ko: "구분선을 옮김" }, payload: { split: "number", collapsed: "bool" } }],
  props: [
    { key: "orientation", label: "Orientation", labels: { ja: "向き", zh: "方向", ko: "방향" }, kind: "enum", default: "horizontal", options: [opt("horizontal", "Side by side", "左右并排", "横に並べる", "나란히"), opt("vertical", "One over the other", "上下排列", "上下に並べる", "위아래로")] },
    { key: "split", label: "First pane share", labels: { ja: "第 1 ペインの割合", zh: "第一栏占比", ko: "첫째 창 비율" }, kind: "number", default: 50, min: 0, max: 100, step: 1, unit: "%" },
    px("minFirst", "First pane at least", { ja: "第 1 ペインの最小", zh: "第一栏最小", ko: "첫째 창 최소" }),
    px("maxFirst", "First pane at most", { ja: "第 1 ペインの最大", zh: "第一栏最大", ko: "첫째 창 최대" }),
    px("minSecond", "Second pane at least", { ja: "第 2 ペインの最小", zh: "第二栏最小", ko: "둘째 창 최소" }),
    px("maxSecond", "Second pane at most", { ja: "第 2 ペインの最大", zh: "第二栏最大", ko: "둘째 창 최대" }),
    {
      key: "collapsible",
      label: "Folds away",
      labels: { ja: "折りたためる", zh: "可折叠", ko: "접기" },
      kind: "enum",
      default: "none",
      options: [opt("none", "Neither", "不可折叠", "なし", "없음"), opt("first", "First pane", "第一栏", "第 1 ペイン", "첫째 창"), opt("second", "Second pane", "第二栏", "第 2 ペイン", "둘째 창")],
    },
    { key: "collapsedSize", label: "Size folded", labels: { ja: "折りたたみ時の大きさ", zh: "折叠后尺寸", ko: "접었을 때 크기" }, kind: "number", default: 0, min: 0, max: 80, step: 4, unit: "px", when: folds },
    { key: "collapsed", label: "Starts folded", labels: { ja: "最初は折りたたむ", zh: "开始时折叠", ko: "처음에 접힘" }, kind: "bool", default: false, when: folds },
    { key: "divider", label: "Divider", labels: { ja: "区切り", zh: "分隔条", ko: "구분선" }, kind: "enum", default: "line", options: [opt("line", "Hairline", "细线", "細線", "가는 선"), opt("gap", "Gap", "间隙", "すき間", "간격")] },
    { key: "handle", label: "Grip on the divider", labels: { ja: "区切りのつまみ", zh: "分隔条握把", ko: "구분선 손잡이" }, kind: "bool", default: true },
    {
      key: "compact",
      label: "When narrow",
      labels: { ja: "狭いとき", zh: "窄屏时", ko: "좁을 때" },
      kind: "enum",
      default: "stack",
      options: [opt("stack", "One over the other", "上下堆叠", "上下に重ねる", "위아래로 쌓기"), opt("keep", "As it is", "保持不变", "そのまま", "그대로")],
    },
    { key: "breakpoint", label: "Narrow below", labels: { ja: "狭いとみなす幅", zh: "窄屏断点", ko: "좁은 너비 기준" }, kind: "number", default: 600, min: 0, max: 2400, step: 8, unit: "px", when: (p) => p.s("compact") !== "keep" },
    { key: "persist", label: "Remember the visitor's share", labels: { ja: "訪問者の割合を記憶", zh: "记住访客拖动的比例", ko: "방문자 비율 기억" }, kind: "bool", default: false },
    WIDTH(640),
    HEIGHT(360),
  ],
  tree: (p) =>
    h("SplitView", {
      orientation: p.s("orientation") === "vertical" ? "vertical" : undefined,
      defaultSplit: Math.round(p.n("split") * 100) / 100,
      minFirst: Math.round(p.n("minFirst")) || undefined,
      maxFirst: Math.round(p.n("maxFirst")) || undefined,
      minSecond: Math.round(p.n("minSecond")) || undefined,
      maxSecond: Math.round(p.n("maxSecond")) || undefined,
      collapsible: folds(p) ? p.s("collapsible") : undefined,
      collapsedSize: folds(p) && p.n("collapsedSize") ? Math.round(p.n("collapsedSize")) : undefined,
      defaultCollapsed: folds(p) && p.b("collapsed") ? true : undefined,
      divider: p.s("divider") === "gap" ? "gap" : undefined,
      handle: p.b("handle") ? undefined : false,
      compact: p.s("compact") === "stack" ? undefined : p.s("compact"),
      breakpoint: p.s("compact") === "keep" || p.n("breakpoint") === 600 ? undefined : Math.round(p.n("breakpoint")),
      /* where the visitor's share is kept on their device: the same name wherever the part is printed */
      persist: p.b("persist") && p.scope ? `m3e-split:${p.scope}` : undefined,
      label: p.say("Resize panes"),
      style: box(p),
    }),
};

/* the fills it was designed around, by the one color value (parts/color.ts); "" is none */
const FILLS = ["surface", "surface-container-low", "surface-container", "surface-container-high", "surface-container-highest", "primary-container", "secondary-container", "tertiary-container"];
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
      { key: "fill", label: "Fill", labels: { ja: "塗り", zh: "填充", ko: "채우기" }, kind: "color", default: "surface-container-low", roles: FILLS, none: "none" },
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
          style: { ...box(p), borderRadius: p.s("fill") === "" && p.s("border") === "none" ? 0 : p.n("radius") === 12 ? "var(--md-sys-shape-corner-medium)" : Math.round(p.n("radius")), background: cssColor(p.s("fill")), backdropFilter: p.n("blur") > 0 ? `blur(${Math.round(p.n("blur"))}px)` : undefined },
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
  splitView,
];
