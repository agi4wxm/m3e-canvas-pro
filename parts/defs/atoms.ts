import { FLOW_PROPS } from "../flow";
import { h, type PNode } from "../node";
import { SVG_PRESETS, SVG_PRESET_KEYS, cleanPath, sanitizeSvg } from "../svg";
import type { P, PartDef, PropDef } from "../types";

/* The atoms nothing else covered: the box everything is composed in, a vector drawing, a single
 * radio button and a status dot. A box is a frame with auto layout and no words of its own; what it
 * looks like comes from its surface role, so a style dresses a field box as its own fields and a
 * card box as its own cards, and a composite built of boxes follows the style. */

const px = (p: P, key: string) => Math.round(p.n(key));

/** what a box is, for a style to dress: its look by default, before any style or any paint */
const SURFACES: Record<string, string> = {
  none: "",
  card: "bg-surface-container-low text-on-surface rounded-md shadow-elevation-1",
  panel: "bg-surface-container text-on-surface rounded-lg",
  field: "bg-surface-container-high text-on-surface rounded-lg",
  bar: "bg-surface-container text-on-surface",
  chip: "border border-outline-variant text-on-surface-variant rounded-sm",
  button: "bg-primary text-on-primary rounded-full",
  sheet: "bg-surface-container-low text-on-surface rounded-t-2xl",
  overlay: "bg-surface-container-high text-on-surface rounded-2xl shadow-elevation-3",
  well: "bg-surface-container-highest text-on-surface rounded-md",
};

/** what each surface is called */
const SURFACE_WORDS: Record<string, { ja: string; zh: string; ko: string }> = {
  none: { ja: "なし", zh: "无", ko: "없음" },
  card: { ja: "カード", zh: "卡片", ko: "카드" },
  panel: { ja: "パネル", zh: "面板", ko: "패널" },
  field: { ja: "入力欄", zh: "输入框", ko: "입력란" },
  bar: { ja: "バー", zh: "栏", ko: "바" },
  chip: { ja: "チップ", zh: "标签", ko: "칩" },
  button: { ja: "ボタン", zh: "按钮", ko: "버튼" },
  sheet: { ja: "シート", zh: "底部面板", ko: "시트" },
  overlay: { ja: "オーバーレイ", zh: "浮层", ko: "오버레이" },
  well: { ja: "くぼみ", zh: "凹槽", ko: "오목한 영역" },
};

const SURFACE_CHOICES = [
  { value: "none", label: "None" },
  { value: "card", label: "Card" },
  { value: "panel", label: "Panel" },
  { value: "field", label: "Field" },
  { value: "bar", label: "Bar" },
  { value: "chip", label: "Chip" },
  { value: "button", label: "Button" },
  { value: "sheet", label: "Sheet" },
  { value: "overlay", label: "Overlay" },
  { value: "well", label: "Well" },
].map((c) => ({ ...c, labels: SURFACE_WORDS[c.value] }));

/* the box's own defaults over the shared auto layout: on from the start, close-set, hugging */
const BOX_FLOW: Record<string, string | number | boolean> = { layout: "column", gap: 8, padX: 12, padY: 12, hugWidth: true, hugHeight: true };
const boxFlow = FLOW_PROPS.map((d): PropDef => (d.key in BOX_FLOW ? ({ ...d, default: BOX_FLOW[d.key] } as PropDef) : d));

/** what the vector part paints with when the markup does not say: the text role, so a text color reaches it */
const INK: Record<string, string> = {
  current: "",
  default: "text-on-surface",
  muted: "text-on-surface-variant",
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  error: "text-error",
  outline: "text-outline",
  "primary-container": "text-primary-container",
  "secondary-container": "text-secondary-container",
  "tertiary-container": "text-tertiary-container",
  "surface-container-high": "text-surface-container-high",
  "on-primary": "text-on-primary",
};

/** the drawing of the vector part: a shape of the library, one path, or cleaned markup */
function svgTree(p: P): PNode {
  const mode = p.s("mode");
  const own = { "data-slot": "svg", role: "img", "aria-label": p.s("label") || undefined, className: INK[p.s("color")] || undefined, width: px(p, "width"), height: px(p, "height"), preserveAspectRatio: p.b("stretch") ? "none" : undefined };
  const stroke = (w: number) => ({ fill: "none", stroke: "currentColor", strokeWidth: w, strokeLinecap: "round", strokeLinejoin: "round" });
  if (mode === "markup") {
    const clean = sanitizeSvg(p.s("markup"));
    if (clean) return h("svg", { ...clean.attrs, fill: clean.attrs.fill ?? "currentColor", ...own, viewBox: clean.viewBox }, ...clean.children);
  }
  if (mode === "path") {
    const d = cleanPath(p.s("path"));
    const vb = /^-?[\d.]+(\s+-?[\d.]+){3}$/.test(p.s("viewBox").trim()) ? p.s("viewBox").trim() : "0 0 24 24";
    if (d) return h("svg", { viewBox: vb, ...(p.b("outline") ? stroke(p.n("strokeWidth")) : { fill: "currentColor" }), ...own }, h("path", { d }));
  }
  const shape = SVG_PRESETS[p.s("preset")] ?? SVG_PRESETS.sparkle;
  const outlined = shape.stroke !== undefined || p.b("outline");
  return h("svg", { viewBox: shape.viewBox, ...(outlined ? stroke(shape.stroke ?? p.n("strokeWidth")) : { fill: "currentColor" }), ...own }, ...shape.d.map((d) => h("path", { d })));
}

const DOT_COLORS: Record<string, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary",
  tertiary: "bg-tertiary",
  error: "bg-error",
  outline: "bg-outline",
  muted: "bg-on-surface-variant",
  surface: "bg-surface-container-highest",
};

export const atoms: PartDef[] = [
  {
    slug: "box",
    name: "Box",
    labels: { ja: "ボックス", zh: "盒子", ko: "박스" },
    category: "Basics",
    icon: "check_box_outline_blank",
    w: 160,
    h: 96,
    holds: true,
    flow: {},
    appearance: { radius: 12 },
    props: [
      { key: "surface", label: "Surface", labels: { ja: "面の役割", zh: "表面角色", ko: "표면 역할" }, kind: "enum", default: "none", options: SURFACE_CHOICES },
      ...boxFlow,
      { key: "width", label: "Width", kind: "number", default: 160, min: 0, max: 2400, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 96, min: 0, max: 2400, step: 4, unit: "px" },
    ],
    /* one added by hand starts as a panel, so there is something to see and drop into; one in a
     *  composition is whatever surface it is given, and none unless it is */
    seed: { surface: "panel" },
    /* no words and no frame of its own: what it holds is its content, its surface is its look */
    tree: (p) => h("div", { "data-slot": "box", "data-surface": p.s("surface"), className: SURFACES[p.s("surface")] || undefined, style: { width: px(p, "width"), height: px(p, "height") } }),
  },
  {
    slug: "svg",
    name: "Vector",
    labels: { ja: "ベクター", zh: "矢量图形", ko: "벡터" },
    category: "Basics",
    icon: "shape_line",
    w: 48,
    h: 48,
    appearance: { radius: 0 },
    props: [
      {
        key: "mode",
        label: "Source",
        labels: { ja: "元", zh: "来源", ko: "원본" },
        kind: "enum",
        default: "preset",
        options: [
          { value: "preset", label: "Library", labels: { ja: "ライブラリ", zh: "图形库", ko: "라이브러리" } },
          { value: "markup", label: "SVG markup", labels: { ja: "SVG コード", zh: "SVG 代码", ko: "SVG 코드" } },
          { value: "path", label: "Path", labels: { ja: "パス", zh: "路径", ko: "경로" } },
        ],
      },
      { key: "preset", label: "Shape", labels: { ja: "形", zh: "形状", ko: "모양" }, kind: "enum", default: "sparkle", options: SVG_PRESET_KEYS.map((k) => ({ value: k, label: SVG_PRESETS[k].label, labels: { zh: SVG_PRESETS[k].zh, ja: SVG_PRESETS[k].ja, ko: SVG_PRESETS[k].ko } })), when: (p) => p.s("mode") === "preset" },
      { key: "markup", label: "SVG markup", labels: { ja: "SVG コード", zh: "SVG 代码", ko: "SVG 코드" }, kind: "text", default: "", multiline: true, when: (p) => p.s("mode") === "markup" },
      { key: "path", label: "Path data", labels: { ja: "パスデータ", zh: "路径数据", ko: "경로 데이터" }, kind: "text", default: "M12 2L15 9H22L16.5 13.5L18.5 21L12 16.5L5.5 21L7.5 13.5L2 9H9Z", when: (p) => p.s("mode") === "path" },
      { key: "viewBox", label: "View box", labels: { ja: "ビューボックス", zh: "视图框", ko: "뷰 박스" }, kind: "text", default: "0 0 24 24", when: (p) => p.s("mode") === "path" },
      { key: "outline", label: "Outline only", labels: { ja: "線のみ", zh: "仅描边", ko: "선만" }, kind: "bool", default: false, when: (p) => p.s("mode") !== "markup" },
      { key: "strokeWidth", label: "Line width", labels: { ja: "線の太さ", zh: "线宽", ko: "선 두께" }, kind: "number", default: 2, min: 0.5, max: 24, step: 0.5, when: (p) => p.s("mode") !== "markup" && p.b("outline") },
      { key: "color", label: "Color", kind: "enum", default: "current", options: Object.keys(INK) },
      { key: "stretch", label: "Stretch to fit", labels: { ja: "引き伸ばす", zh: "拉伸填满", ko: "늘여 채우기" }, kind: "bool", default: false },
      { key: "label", label: "Name for screen readers", labels: { ja: "読み上げ名", zh: "读屏名称", ko: "스크린 리더 이름" }, kind: "text", default: "" },
      { key: "width", label: "Width", kind: "number", default: 48, min: 4, max: 1600, step: 4, unit: "px" },
      { key: "height", label: "Height", kind: "number", default: 48, min: 4, max: 1600, step: 4, unit: "px" },
    ],
    tree: svgTree,
  },
  {
    slug: "radio",
    appearance: { radius: 8 },
    name: "Radio button",
    labels: { ja: "ラジオボタン", zh: "单选按钮", ko: "라디오 버튼" },
    category: "Controls",
    icon: "radio_button_checked",
    role: "control",
    w: 120,
    h: 24,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Option A" },
      { key: "checked", label: "Checked", kind: "bool", default: true },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
    ],
    tree: (p) =>
      h(
        "RadioGroup",
        { defaultValue: p.b("checked") ? "on" : "", disabled: p.b("disabled") || undefined, className: "w-fit" },
        h("Label", null, h("RadioGroupItem", { value: "on", "aria-label": p.s("label") ? undefined : p.say("Option") }), p.s("label")),
      ),
    guess: (p) => ({ w: 32 + Math.ceil(p.s("label").length * 8), h: 24 }),
  },
  {
    slug: "dot",
    appearance: { radius: 999 },
    name: "Status dot",
    labels: { ja: "ステータスドット", zh: "状态圆点", ko: "상태 점" },
    category: "Indicators",
    icon: "fiber_manual_record",
    w: 8,
    h: 8,
    props: [
      { key: "color", label: "Color", kind: "enum", default: "primary", options: Object.keys(DOT_COLORS) },
      { key: "size", label: "Size", kind: "number", default: 8, min: 4, max: 32, step: 2, unit: "px" },
      { key: "ring", label: "Ring", labels: { ja: "縁取り", zh: "外圈", ko: "테두리" }, kind: "bool", default: false },
    ],
    tree: (p) =>
      h("span", {
        "data-slot": "dot",
        role: "status",
        className: `inline-block shrink-0 rounded-full ${DOT_COLORS[p.s("color")] ?? "bg-primary"} ${p.b("ring") ? "ring-2 ring-surface" : ""}`.trim(),
        style: { width: px(p, "size"), height: px(p, "size") },
      }),
    guess: (p) => ({ w: px(p, "size"), h: px(p, "size") }),
  },
];
