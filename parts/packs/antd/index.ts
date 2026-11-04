import { h } from "../../node";
import type { PartPack } from "../types";

/* Real Ant Design components beside the shadcn M3E ones, after HK-hub/design-canvas (MIT).
 * AntSelect shows what a button cannot: where a popup of another library goes. */

const SIZES = ["small", "middle", "large"];

export const antd: PartPack = {
  id: "antd",
  version: "0.1.0",
  category: { key: "Ant Design", icon: "widgets", labels: {} },
  sources: {
    AntButton: { from: "antd", export: "Button" },
    AntSelect: { from: "antd", export: "Select" },
  },
  load: () => import("./parts"),
  defs: [
    {
      slug: "antd/button",
      name: "Ant Button",
      labels: { ja: "Ant ボタン", zh: "Ant 按钮", ko: "Ant 버튼" },
      category: "Ant Design",
      icon: "smart_button",
      w: 88,
      h: 32,
      props: [
        { key: "label", label: "Label", labels: { zh: "文字" }, kind: "text", default: "Button" },
        { key: "type", label: "Type", labels: { zh: "类型" }, kind: "enum", default: "primary", options: ["primary", "default", "dashed", "text", "link"] },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "middle", options: SIZES },
        { key: "danger", label: "Danger", labels: { ja: "危険", zh: "危险", ko: "위험" }, kind: "bool", default: false },
        { key: "disabled", label: "Disabled", labels: { zh: "禁用" }, kind: "bool", default: false },
      ],
      tree: (p) => h("AntButton", { type: p.s("type"), size: p.s("size"), danger: p.b("danger") || undefined, disabled: p.b("disabled") || undefined }, p.s("label")),
    },
    {
      slug: "antd/select",
      name: "Ant Select",
      labels: { ja: "Ant セレクト", zh: "Ant 下拉选择", ko: "Ant 선택" },
      category: "Ant Design",
      icon: "arrow_drop_down_circle",
      w: 200,
      h: 32,
      props: [
        { key: "items", label: "Options", labels: { zh: "选项" }, kind: "list", default: [{ label: "Apple" }, { label: "Banana" }, { label: "Cherry" }], min: 1, max: 8 },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "middle", options: SIZES },
        { key: "width", label: "Width", kind: "number", default: 200, min: 120, max: 480, step: 4, unit: "px" },
      ],
      tree: (p) => {
        const options = p.list("items").map((x) => ({ value: x.label, label: x.label }));
        return h("AntSelect", { size: p.s("size"), defaultValue: options[0]?.value, options, style: { width: Math.round(p.n("width")) } });
      },
    },
  ],
};
