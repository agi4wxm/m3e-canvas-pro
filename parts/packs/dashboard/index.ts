import { h, type PNode } from "../../node";
import type { P, PartDef, TableData } from "../../types";
import type { PartPack } from "../types";

/* The dashboard parts of Skufu/m3e-canvas feat/dashboard-kit (MIT), and the chart kinds of
 * greycode/m3e-canvas (MIT). Those forks draw from values made up from the title; here every part
 * draws the author's own rows, with the shadcn M3E Table and Recharts. No component of its own, so
 * no `load`. */

const COLUMNS = ["Invoice", "Status", "Amount"];
const ROWS = [
  ["INV-001", "Paid", "$250.00"],
  ["INV-002", "Pending", "$150.00"],
  ["INV-003", "Unpaid", "$350.00"],
];

const CHART_TYPES = ["bar", "line", "area", "stacked-bar", "pie"] as const;
const MONTHLY: TableData = {
  columns: ["Month", "Desktop", "Mobile"],
  rows: [
    ["Jan", "186", "80"],
    ["Feb", "305", "200"],
    ["Mar", "237", "120"],
    ["Apr", "173", "190"],
    ["May", "209", "130"],
    ["Jun", "214", "140"],
  ],
};

/** a cell as a number; text a chart cannot draw counts as nothing */
const value = (cell: string | undefined) => {
  const n = Number(String(cell ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const EDGE_ROOM = { left: 16, right: 16 };

/** the color of series `i`: M3E's chart roles, five in all */
const chartColor = (i: number) => `var(--chart-${(i % 5) + 1})`;

function chartTree(p: P): PNode {
  const type = p.s("type");
  const { columns, rows } = p.table("data");
  const series = columns.slice(1);
  const key = (i: number) => `s${i}`;
  const data = rows.map((row) => Object.fromEntries([["name", row[0] ?? ""], ...series.map((_, i) => [key(i), value(row[i + 1])])]));
  const config = Object.fromEntries(series.map((label, i) => [key(i), { label, color: chartColor(i) }]));
  const axes = [h("CartesianGrid", { vertical: false }), h("XAxis", { dataKey: "name", tickLine: false, axisLine: false }), h("ChartTooltip", { content: h("ChartTooltipContent") })];
  const plot = (): PNode => {
    switch (type) {
      /* these two draw from edge to edge: without a margin the first and last names on the axis are cut off */
      case "line":
        return h("LineChart", { data, margin: EDGE_ROOM }, ...axes, ...series.map((_, i) => h("Line", { dataKey: key(i), stroke: `var(--color-${key(i)})`, strokeWidth: 2, dot: false })));
      case "area":
        return h("AreaChart", { data, margin: EDGE_ROOM }, ...axes, ...series.map((_, i) => h("Area", { dataKey: key(i), fill: `var(--color-${key(i)})`, stroke: `var(--color-${key(i)})`, fillOpacity: 0.3 })));
      case "pie":
        return h("PieChart", null, h("ChartTooltip", { content: h("ChartTooltipContent") }), h("Pie", { data, dataKey: key(0), nameKey: "name", innerRadius: "50%" }, ...data.map((_, i) => h("Cell", { fill: chartColor(i) }))));
      case "stacked-bar":
        return h("BarChart", { data }, ...axes, ...series.map((_, i) => h("Bar", { dataKey: key(i), stackId: "all", fill: `var(--color-${key(i)})` })));
      default:
        return h("BarChart", { data }, ...axes, ...series.map((_, i) => h("Bar", { dataKey: key(i), fill: `var(--color-${key(i)})`, radius: 4 })));
    }
  };
  return h(
    "div",
    { "data-slot": "dashboard-chart", className: "flex flex-col gap-1", style: { width: Math.round(p.n("width")) } },
    p.s("title") && h("div", { className: "text-title-medium text-on-surface" }, p.s("title")),
    p.s("subtitle") && h("div", { className: "text-body-small text-on-surface-variant" }, p.s("subtitle")),
    h("ChartContainer", { config, style: { width: "100%", height: Math.round(p.n("height")) } }, plot()),
  );
}

export const dashboard: PartPack = {
  id: "dashboard",
  version: "0.1.0",
  sources: {},
  defs: [
    {
      slug: "dashboard/chart",
      name: "Chart",
      labels: { ja: "グラフ", zh: "图表", ko: "차트" },
      category: "Data",
      icon: "bar_chart",
      w: 420,
      h: 280,
      props: [
        { key: "type", label: "Type", labels: { ja: "種類", zh: "类型", ko: "유형" }, kind: "enum", default: "bar", options: [...CHART_TYPES] },
        { key: "title", label: "Title", kind: "text", default: "Visitors", defaults: { zh: "访问量" } },
        { key: "subtitle", label: "Subtitle", labels: { ja: "サブタイトル", zh: "副标题", ko: "부제목" }, kind: "text", default: "Last 6 months", defaults: { zh: "最近 6 个月" } },
        { key: "data", label: "Data", labels: { ja: "データ", zh: "数据", ko: "데이터" }, kind: "table", default: MONTHLY },
        { key: "width", label: "Width", kind: "number", default: 420, min: 200, max: 1200, step: 4, unit: "px" },
        { key: "height", label: "Height", kind: "number", default: 220, min: 120, max: 600, step: 4, unit: "px" },
      ],
      tree: chartTree,
    },
    {
      slug: "dashboard/scatter",
      name: "Scatter plot",
      labels: { ja: "散布図", zh: "散点图", ko: "산점도" },
      category: "Data",
      icon: "scatter_plot",
      w: 320,
      h: 240,
      props: [
        { key: "title", label: "Title", kind: "text", default: "Steps and sleep", defaults: { zh: "步数与睡眠" } },
        { key: "subtitle", label: "Subtitle", labels: { ja: "サブタイトル", zh: "副标题", ko: "부제목" }, kind: "text", default: "" },
        { key: "data", label: "Data", labels: { ja: "データ", zh: "数据", ko: "데이터" }, kind: "table", default: { columns: ["X", "Y"], rows: [["10", "30"], ["22", "48"], ["35", "41"], ["48", "66"], ["60", "58"], ["74", "82"], ["88", "76"]] } },
        { key: "width", label: "Width", kind: "number", default: 320, min: 160, max: 960, step: 4, unit: "px" },
        { key: "height", label: "Height", kind: "number", default: 200, min: 96, max: 600, step: 4, unit: "px" },
      ],
      tree: (p) => {
        const pts = p.table("data").rows.map((r) => [value(r[0]), value(r[1])]);
        const span = (axis: 0 | 1) => {
          const all = pts.map((q) => q[axis]);
          const lo = Math.min(...all, 0);
          const hi = Math.max(...all, lo + 1);
          return (v: number) => ((v - lo) / (hi - lo)) * 100;
        };
        const [sx, sy] = [span(0), span(1)];
        return h(
          "div",
          { "data-slot": "dashboard-scatter", className: "flex flex-col gap-1", style: { width: Math.round(p.n("width")) } },
          p.s("title") && h("div", { className: "text-title-medium text-on-surface" }, p.s("title")),
          p.s("subtitle") && h("div", { className: "text-body-small text-on-surface-variant" }, p.s("subtitle")),
          h("svg", { viewBox: "-4 -4 108 108", preserveAspectRatio: "none", className: "border-outline-variant border-b border-l", style: { width: "100%", height: Math.round(p.n("height")) } }, ...pts.map((q) => h("ellipse", { cx: sx(q[0]), cy: 100 - sy(q[1]), rx: 1.6, ry: 2.2, className: "fill-primary" }))),
        );
      },
    },
    {
      slug: "dashboard/heatmap",
      name: "Heatmap",
      labels: { ja: "ヒートマップ", zh: "热力图", ko: "히트맵" },
      category: "Data",
      icon: "grid_on",
      w: 320,
      h: 200,
      props: [
        { key: "title", label: "Title", kind: "text", default: "Activity", defaults: { zh: "活跃度" } },
        { key: "subtitle", label: "Subtitle", labels: { ja: "サブタイトル", zh: "副标题", ko: "부제목" }, kind: "text", default: "" },
        { key: "data", label: "Data", labels: { ja: "データ", zh: "数据", ko: "데이터" }, kind: "table", default: { columns: ["Mon", "Tue", "Wed", "Thu", "Fri"], rows: [["2", "5", "1", "7", "4"], ["6", "3", "8", "2", "5"], ["1", "9", "4", "6", "3"], ["7", "2", "5", "8", "6"]] } },
        { key: "width", label: "Width", kind: "number", default: 320, min: 160, max: 960, step: 4, unit: "px" },
      ],
      tree: (p) => {
        const { columns, rows } = p.table("data");
        const top = Math.max(1, ...rows.flat().map(value));
        const grid = { display: "grid", gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`, gap: 4 };
        return h(
          "div",
          { "data-slot": "dashboard-heatmap", className: "flex flex-col gap-1", style: { width: Math.round(p.n("width")) } },
          p.s("title") && h("div", { className: "text-title-medium text-on-surface" }, p.s("title")),
          p.s("subtitle") && h("div", { className: "text-body-small text-on-surface-variant" }, p.s("subtitle")),
          h("div", { style: grid }, ...columns.map((c) => h("div", { className: "text-label-small text-on-surface-variant text-center" }, c))),
          ...rows.map((row) => h("div", { style: grid }, ...columns.map((_, i) => h("div", { className: "bg-primary h-6 rounded-xs", title: row[i] ?? "", style: { opacity: 0.1 + (value(row[i]) / top) * 0.9 } })))),
        );
      },
    },
    {
      slug: "dashboard/gauge",
      name: "Gauge",
      labels: { ja: "ゲージ", zh: "仪表", ko: "게이지" },
      category: "Data",
      icon: "speed",
      w: 160,
      h: 112,
      props: [
        { key: "label", label: "Label", kind: "text", default: "Battery", defaults: { zh: "电量" } },
        { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "number", default: 72, min: 0, max: 100, step: 1, unit: "%" },
      ],
      tree: (p) => {
        const arc = "M 10 60 A 50 50 0 0 1 110 60";
        return h(
          "div",
          { "data-slot": "dashboard-gauge", className: "flex w-40 flex-col items-center" },
          h("svg", { viewBox: "0 0 120 66", className: "w-full" }, h("path", { d: arc, fill: "none", strokeWidth: 10, strokeLinecap: "round", className: "stroke-surface-container-highest" }), h("path", { d: arc, fill: "none", strokeWidth: 10, strokeLinecap: "round", pathLength: 100, strokeDasharray: `${Math.round(p.n("value"))} 100`, className: "stroke-primary" })),
          h("div", { className: "text-title-large text-on-surface" }, `${Math.round(p.n("value"))}%`),
          p.s("label") && h("div", { className: "text-label-medium text-on-surface-variant" }, p.s("label")),
        );
      },
    },
    {
      slug: "dashboard/filter-bar",
      name: "Filter bar",
      labels: { ja: "フィルターバー", zh: "筛选栏", ko: "필터 바" },
      category: "Data",
      icon: "filter_list",
      w: 420,
      h: 56,
      props: [
        { key: "placeholder", label: "Placeholder", kind: "text", default: "Search invoices", defaults: { zh: "搜索发票" } },
        { key: "filters", label: "Filters", labels: { ja: "フィルター", zh: "筛选项", ko: "필터" }, kind: "list", default: [{ label: "Status" }, { label: "Due date" }, { label: "Currency" }], min: 0, max: 6 },
        { key: "width", label: "Width", kind: "number", default: 420, min: 200, max: 1200, step: 4, unit: "px" },
      ],
      tree: (p) =>
        h(
          "div",
          { "data-slot": "dashboard-filter-bar", className: "flex flex-wrap items-center gap-2", style: { width: Math.round(p.n("width")) } },
          h("div", { className: "min-w-40 flex-1" }, h("Input", { placeholder: p.s("placeholder"), type: "search" })),
          ...p.list("filters").map((f) => h("FilterChip", null, f.label)),
        ),
    },
    {
      slug: "dashboard/description-list",
      name: "Description list",
      labels: { ja: "説明リスト", zh: "描述列表", ko: "설명 목록" },
      category: "Data",
      icon: "view_list",
      w: 320,
      h: 120,
      props: [
        { key: "data", label: "Data", labels: { ja: "データ", zh: "数据", ko: "데이터" }, kind: "table", default: { columns: ["Name", "Value"], rows: [["Status", "Running"], ["Owner", "Ada"], ["Updated", "3 days ago"]] } },
        { key: "width", label: "Width", kind: "number", default: 320, min: 160, max: 960, step: 4, unit: "px" },
      ],
      tree: (p) =>
        h(
          "dl",
          { "data-slot": "dashboard-description-list", className: "grid grid-cols-[auto_1fr] gap-x-4 gap-y-2", style: { width: Math.round(p.n("width")) } },
          ...p.table("data").rows.flatMap((r) => [h("dt", { className: "text-label-large text-on-surface-variant" }, r[0] ?? ""), h("dd", { className: "text-body-medium text-on-surface" }, r[1] ?? "")]),
        ),
    },
    {
      slug: "dashboard/stat-card",
      name: "Stat card",
      labels: { ja: "KPI カード", zh: "统计卡片", ko: "통계 카드" },
      category: "Data",
      icon: "monitoring",
      w: 190,
      h: 120,
      props: [
        { key: "title", label: "Title", labels: { zh: "标题" }, kind: "text", default: "Revenue", defaults: { zh: "收入" } },
        { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "text", default: "$48,200" },
        { key: "trend", label: "Trend", labels: { ja: "推移", zh: "趋势", ko: "추세" }, kind: "text", default: "+12.5%" },
        { key: "direction", label: "Direction", labels: { ja: "方向", zh: "方向", ko: "방향" }, kind: "enum", default: "up", options: ["up", "down", "flat"] },
        { key: "width", label: "Width", kind: "number", default: 190, min: 120, max: 480, step: 4, unit: "px" },
      ],
      tree: (p) => {
        const color = { up: "text-primary", down: "text-error", flat: "text-on-surface-variant" }[p.s("direction")];
        return h(
          "div",
          { "data-slot": "stat-card", className: "bg-surface-container-low flex flex-col gap-1 rounded-xl p-4", style: { width: Math.round(p.n("width")) } },
          h("div", { className: "text-label-large text-on-surface-variant" }, p.s("title")),
          h("div", { className: "text-headline-medium text-on-surface" }, p.s("value")),
          h("div", { className: `text-label-medium ${color}` }, p.s("trend")),
        );
      },
    },
    {
      slug: "dashboard/data-table",
      name: "Table",
      labels: { ja: "テーブル", zh: "表格", ko: "표" },
      category: "Data",
      icon: "table_chart",
      w: 420,
      h: 200,
      props: [
        { key: "title", label: "Title", labels: { zh: "标题" }, kind: "text", default: "Invoices", defaults: { zh: "发票列表" } },
        { key: "data", label: "Data", labels: { ja: "データ", zh: "数据", ko: "데이터" }, kind: "table", default: { columns: COLUMNS, rows: ROWS } },
        { key: "caption", label: "Caption", labels: { ja: "キャプション", zh: "说明文字", ko: "캡션" }, kind: "text", default: "" },
        { key: "selected", label: "Selected row (0 for none)", kind: "number", default: 0, min: 0, max: 100, step: 1 },
        { key: "alignLast", label: "Right-align the last column", labels: { ja: "最後の列を右揃え", zh: "最后一列右对齐", ko: "마지막 열 오른쪽 정렬" }, kind: "bool", default: false },
        { key: "width", label: "Width", kind: "number", default: 420, min: 200, max: 960, step: 4, unit: "px" },
      ],
      tree: (p) => {
        const { columns, rows } = p.table("data");
        const align = (c: number) => (p.b("alignLast") && c === columns.length - 1 ? "text-right" : undefined);
        return h(
          "div",
          { style: { width: Math.round(p.n("width")) } },
          p.s("title") && h("div", { className: "text-title-medium text-on-surface px-4 py-2" }, p.s("title")),
          h(
            "Table",
            null,
            p.s("caption") && h("TableCaption", null, p.s("caption")),
            h("TableHeader", null, h("TableRow", null, ...columns.map((c, i) => h("TableHead", { className: align(i) }, c)))),
            h("TableBody", null, ...rows.map((row, r) => h("TableRow", { "data-state": p.n("selected") === r + 1 ? "selected" : undefined }, ...columns.map((_, i) => h("TableCell", { className: align(i) }, row[i] ?? ""))))),
          ),
        );
      },
    },
  ],
};
