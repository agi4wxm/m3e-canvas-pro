import type { Choice, P, PropDef } from "./types";

/* Auto layout. A container whose `layout` is not "free" arranges what it holds: a row, a column or a
 * grid, with a gap, padding, alignment and distribution, and can size itself to its contents. The
 * props are the same on every container that offers it. lib/flow.ts does the arranging on the canvas;
 * the printed code says the same thing in flex and grid classes (`flowClasses`). */

const choice = (value: string, label: string, zh: string, ja: string, ko: string): Choice => ({ value, label, labels: { zh, ja, ko } });

const isFlow = (p: P) => p.s("layout") !== "free";

/** gap, padding and alignment: what a grid and a row or column have in common */
const SPACING: PropDef[] = [
  { key: "gap", label: "Gap", labels: { ja: "間隔", zh: "间距", ko: "간격" }, kind: "number", default: 8, min: 0, max: 96, step: 4, unit: "px" },
  { key: "padX", label: "Padding, sides", labels: { ja: "左右の余白", zh: "左右内边距", ko: "좌우 여백" }, kind: "number", default: 16, min: 0, max: 96, step: 4, unit: "px" },
  { key: "padY", label: "Padding, ends", labels: { ja: "上下の余白", zh: "上下内边距", ko: "상하 여백" }, kind: "number", default: 16, min: 0, max: 96, step: 4, unit: "px" },
  {
    key: "align",
    label: "Align",
    labels: { ja: "揃え", zh: "对齐", ko: "정렬" },
    kind: "enum",
    default: "start",
    options: [choice("start", "Start", "靠起点", "先頭", "시작"), choice("center", "Center", "居中", "中央", "가운데"), choice("end", "End", "靠终点", "末尾", "끝"), choice("stretch", "Stretch", "拉伸", "引き伸ばす", "늘이기")],
  },
];

/** the props of a container that can lay out what it holds, placed before its width and height */
export const FLOW_PROPS: PropDef[] = [
  {
    key: "layout",
    label: "Auto layout",
    labels: { ja: "自動レイアウト", zh: "自动布局", ko: "자동 레이아웃" },
    kind: "enum",
    default: "free",
    options: [choice("free", "Off", "关闭", "オフ", "끔"), choice("row", "Row", "横排", "横並び", "가로"), choice("column", "Column", "竖排", "縦並び", "세로"), choice("grid", "Grid", "网格", "グリッド", "격자")],
  },
  ...SPACING.map((d): PropDef => ({ ...d, when: isFlow })),
  {
    key: "justify",
    label: "Distribute",
    labels: { ja: "配分", zh: "分布", ko: "분배" },
    kind: "enum",
    default: "start",
    options: [choice("start", "Start", "靠起点", "先頭", "시작"), choice("center", "Center", "居中", "中央", "가운데"), choice("end", "End", "靠终点", "末尾", "끝"), choice("between", "Space between", "两端分布", "両端揃え", "양끝 맞춤")],
    when: (p) => p.s("layout") === "row" || p.s("layout") === "column",
  },
  { key: "wrap", label: "Wrap", labels: { ja: "折り返す", zh: "自动换行", ko: "줄바꿈" }, kind: "bool", default: false, when: (p) => p.s("layout") === "row" },
  { key: "columns", label: "Columns", labels: { ja: "列", zh: "列数", ko: "열" }, kind: "number", default: 2, min: 1, max: 12, step: 1, when: (p) => p.s("layout") === "grid" },
  { key: "hugWidth", label: "Width hugs contents", labels: { ja: "幅を内容に合わせる", zh: "宽度随内容", ko: "너비를 내용에 맞춤" }, kind: "bool", default: false, when: isFlow },
  { key: "hugHeight", label: "Height hugs contents", labels: { ja: "高さを内容に合わせる", zh: "高度随内容", ko: "높이를 내용에 맞춤" }, kind: "bool", default: false, when: isFlow },
];

/** the props of a container that is always a grid: its columns are its own */
export const GRID_PROPS: PropDef[] = SPACING.map((d): PropDef => (d.kind === "number" && (d.key === "padX" || d.key === "padY") ? { ...d, default: 12 } : d));

const ALIGN: Record<string, string> = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" };
const JUSTIFY: Record<string, string> = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" };

export type FlowValues = { dir: "row" | "column" | "grid"; gap: number; padX: number; padY: number; align: string; justify: string; wrap: boolean; columns: number };

/** the classes that make the same arrangement in the browser, for printed code */
export function flowClasses(f: FlowValues): string {
  const pad = `px-[${f.padX}px] py-[${f.padY}px]`;
  const gap = `gap-[${f.gap}px]`;
  if (f.dir === "grid") return `grid grid-cols-[repeat(${f.columns},minmax(0,1fr))] ${gap} ${pad} ${ALIGN[f.align] ?? ""}`.trim();
  return [`flex ${f.dir === "row" ? "flex-row" : "flex-col"}`, f.wrap ? "flex-wrap" : "", gap, pad, ALIGN[f.align] ?? "", JUSTIFY[f.justify] ?? ""].filter(Boolean).join(" ");
}
