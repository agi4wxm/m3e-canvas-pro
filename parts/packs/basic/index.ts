import { h } from "../../node";
import { defined, num, text } from "../legacy";
import type { LegacyKind, PartPack } from "../types";

/* Small controls the shadcn M3E set does not have. What they do follows the forks that have them
 * (rating in MoonApp and the GPUI canvas); the code is written here, not copied from them. The
 * ellipse and the line of Endijuan33/m3e-canvas are the Shape and the Separator now. */

/** a fork's fill, by the name the shape and the separator give that color */
const COLOR: Record<string, string> = {
  primary: "primary",
  primaryContainer: "primary-container",
  secondaryContainer: "secondary-container",
  tertiaryContainer: "tertiary-container",
  surfaceContainer: "surface-container",
  surfaceContainerHigh: "surface-container-high",
  outline: "outline",
};

const ellipse = (width: unknown, height: unknown, fill: unknown): ReturnType<LegacyKind["props"]> =>
  defined({ name: "circle", color: COLOR[String(fill)] ?? "secondary-container", width: typeof width === "number" ? width : undefined, height: typeof height === "number" ? height : undefined });
const line = (length: unknown, thickness: unknown, fill: unknown): ReturnType<LegacyKind["props"]> =>
  defined({ color: COLOR[String(fill)] ?? "primary", length: typeof length === "number" ? length : undefined, thickness: typeof thickness === "number" ? thickness : undefined });

/** a link only leaves for the web: a saved `javascript:` address must not run */
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");

export const basic: PartPack = {
  id: "basic",
  version: "0.1.0",
  sources: {
    Rating: { from: "@/components/packs/basic/Rating" },
    ColorField: { from: "@/components/packs/basic/ColorField" },
  },
  load: () => import("./parts"),
  legacyKinds: {
    /* MoonApp saves the score in `selected`, GPUI in `value` */
    rating: { slug: "basic/rating", props: (it) => defined({ value: num(it, "value") ?? num(it, "selected"), count: num(it, "count") }) },
    colorPicker: {
      slug: "basic/color-field",
      /* GPUI's label is the color itself, the others' a caption */
      props: (it) => { const label = text(it, "label"); return label?.startsWith("#") ? { value: label } : defined({ label }); },
    },
    link: { slug: "basic/link", props: (it) => defined({ label: text(it, "label"), href: text(it, "supporting") }) },
    ellipse: { slug: "shape", props: (it) => ellipse(it.size, it.size2, it.fill) },
    line: { slug: "separator", props: (it) => line(it.size, it.size2, it.fill) },
  },
  retired: {
    "basic/ellipse": { slug: "shape", props: (o) => ellipse(o.width, o.height, o.fill) },
    "basic/line": { slug: "separator", props: (o) => line(o.length, o.thickness, o.fill) },
  },
  defs: [
    {
      slug: "basic/form",
      name: "Form",
      labels: { ja: "フォーム", zh: "表单", ko: "양식" },
      category: "Text inputs",
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
      slug: "basic/rating",
      name: "Rating",
      labels: { ja: "評価", zh: "评分", ko: "평점" },
      category: "Selection",
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
      slug: "basic/color-field",
      name: "Color field",
      labels: { ja: "カラー選択", zh: "颜色选择", ko: "색상 선택" },
      category: "Selection",
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
      slug: "basic/link",
      name: "Link",
      labels: { ja: "リンク", zh: "链接", ko: "링크" },
      category: "Actions",
      icon: "link",
      w: 120,
      h: 24,
      props: [
        { key: "label", label: "Label", kind: "text", default: "Learn more", defaults: { zh: "了解更多" } },
        { key: "href", label: "Address", labels: { ja: "アドレス", zh: "地址", ko: "주소" }, kind: "text", default: "https://example.com" },
      ],
      tree: (p) => h("a", { href: safeHref(p.s("href")), target: "_blank", rel: "noreferrer", className: "text-label-large text-primary underline" }, p.s("label")),
    },
  ],
};
