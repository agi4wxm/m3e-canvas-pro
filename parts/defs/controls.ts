import { h } from "../node";
import type { PartDef } from "../types";

/* Small controls the shadcn M3E set does not have. */

/** a link only leaves for the web: a saved `javascript:` address must not run */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");

export const controls: PartDef[] = [
  {
    slug: "form",
    appearance: { radius: 12 },
    name: "Form",
    labels: { ja: "フォーム", zh: "表单", ko: "양식" },
    category: "Forms",
    icon: "dynamic_form",
    w: 360,
    h: 240,
    props: [
      { key: "fields", label: "Fields", labels: { ja: "項目", zh: "字段", ko: "필드" }, kind: "list", default: [{ label: "Name" }, { label: "Email" }, { label: "Role" }], min: 1, max: 12 },
      { key: "submit", label: "Submit button", labels: { ja: "送信ボタン", zh: "提交按钮", ko: "제출 버튼" }, kind: "text", default: "Submit", defaults: { zh: "提交" } },
      { key: "width", label: "Width", kind: "number", default: 360, min: 200, max: 800, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "form",
        { "data-slot": "form", className: "flex flex-col gap-3", style: { width: Math.round(p.n("width")) } },
        ...p.list("fields").map((f) => h("label", { className: "text-label-large text-on-surface flex flex-col gap-1" }, f.label, h("Input", null))),
        p.s("submit") && h("Button", { variant: "filled", size: "sm", type: "button" }, p.s("submit")),
      ),
  },
  {
    slug: "rating",
    input: { prop: "value", kind: "number" },
    appearance: { radius: 8 },
    name: "Rating",
    labels: { ja: "評価", zh: "评分", ko: "평점" },
    category: "Controls",
    icon: "star_rate",
    w: 160,
    h: 32,
    props: [
      { key: "value", label: "Score", labels: { ja: "スコア", zh: "分数", ko: "점수" }, kind: "number", default: 4, min: 0, max: 10, step: 1 },
      { key: "count", label: "Stars", labels: { ja: "星の数", zh: "星数", ko: "별 개수" }, kind: "number", default: 5, min: 1, max: 10, step: 1 },
      { key: "readOnly", label: "Read only", labels: { ja: "読み取り専用", zh: "只读", ko: "읽기 전용" }, kind: "bool", default: false },
    ],
    tree: (p) => h("Rating", { value: Math.round(p.n("value")), count: Math.round(p.n("count")), readOnly: p.b("readOnly") || undefined }),
  },
  {
    slug: "color-field",
    /* the color is what the visitor enters, from the well or the screen */
    input: { prop: "value", kind: "text" },
    appearance: { radius: 12 },
    name: "Color field",
    labels: { ja: "カラー選択", zh: "颜色选择", ko: "색상 선택" },
    category: "Pickers",
    icon: "colorize",
    w: 220,
    h: 56,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Theme color", defaults: { zh: "主题色" } },
      { key: "value", label: "Color", labels: { ja: "色", zh: "颜色", ko: "색상" }, kind: "text", default: "#6750A4" },
    ],
    tree: (p) => h("ColorField", { label: p.s("label"), value: p.s("value") }),
  },
  {
    slug: "link",
    appearance: { radius: 4 },
    name: "Link",
    labels: { ja: "リンク", zh: "链接", ko: "링크" },
    category: "Controls",
    icon: "link",
    w: 120,
    h: 24,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Learn more", defaults: { zh: "了解更多" } },
      { key: "href", label: "Address", labels: { ja: "アドレス", zh: "地址", ko: "주소" }, kind: "text", default: "https://example.com" },
    ],
    tree: (p) => h("a", { href: safeHref(p.s("href")), target: "_blank", rel: "noreferrer", className: "text-label-large text-primary underline" }, p.s("label")),
  },
];
