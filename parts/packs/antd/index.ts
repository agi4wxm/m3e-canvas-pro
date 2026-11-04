import { h } from "../../node";
import type { PropDef } from "../../types";
import type { PartPack } from "../types";

/* Real Ant Design components beside the shadcn M3E ones, after HK-hub/design-canvas (MIT): the twelve
 * it lets an author use, with its props in this editor's words. */

const SIZES = ["small", "middle", "large"];
const WIDTH = (value: number): PropDef => ({ key: "width", label: "Width", kind: "number", default: value, min: 120, max: 960, step: 4, unit: "px" });
/** Ant's lists find their selected entry by key */
const keyed = (items: { label: string }[]) => items.map((x, i) => ({ key: String(i), label: x.label }));

export const antd: PartPack = {
  id: "antd",
  version: "0.1.0",
  sources: {
    AntButton: { from: "antd", export: "Button" },
    AntSelect: { from: "antd", export: "Select" },
    AntInput: { from: "antd", export: "Input" },
    AntCard: { from: "antd", export: "Card" },
    AntTable: { from: "antd", export: "Table" },
    AntTabs: { from: "antd", export: "Tabs" },
    AntMenu: { from: "antd", export: "Menu" },
    AntBreadcrumb: { from: "antd", export: "Breadcrumb" },
    AntPagination: { from: "antd", export: "Pagination" },
    AntDivider: { from: "antd", export: "Divider" },
    AntForm: { from: "@/components/packs/antd/parts" },
    AntModal: { from: "@/components/packs/antd/parts" },
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
        { key: "items", label: "Options", labels: { zh: "选项" }, kind: "list", default: [{ label: "Apple" }, { label: "Banana" }, { label: "Cherry" }], min: 1, max: 40 },
        { key: "placeholder", label: "Placeholder", labels: { ja: "プレースホルダー", zh: "占位文字", ko: "자리표시자" }, kind: "text", default: "" },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "middle", options: SIZES },
        WIDTH(200),
      ],
      tree: (p) => {
        const options = p.list("items").map((x) => ({ value: x.label, label: x.label }));
        /* an author's prompt stands until something is picked; without one the first option is showing */
        return h("AntSelect", { size: p.s("size"), defaultValue: p.s("placeholder") ? undefined : options[0]?.value, placeholder: p.s("placeholder") || undefined, options, style: { width: Math.round(p.n("width")) } });
      },
    },
    {
      slug: "antd/input",
      name: "Ant Input",
      labels: { ja: "Ant 入力", zh: "Ant 输入框", ko: "Ant 입력" },
      category: "Ant Design",
      icon: "input",
      w: 240,
      h: 32,
      props: [
        { key: "placeholder", label: "Placeholder", labels: { ja: "プレースホルダー", zh: "占位文字", ko: "자리표시자" }, kind: "text", default: "Please input", defaults: { zh: "请输入" } },
        { key: "value", label: "Value", labels: { ja: "値", zh: "内容", ko: "값" }, kind: "text", default: "" },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "middle", options: SIZES },
        { key: "clear", label: "Clear button", labels: { ja: "クリアボタン", zh: "清除按钮", ko: "지우기 버튼" }, kind: "bool", default: false },
        { key: "disabled", label: "Disabled", labels: { zh: "禁用" }, kind: "bool", default: false },
        WIDTH(240),
      ],
      tree: (p) => h("AntInput", { placeholder: p.s("placeholder"), defaultValue: p.s("value") || undefined, size: p.s("size"), allowClear: p.b("clear") || undefined, disabled: p.b("disabled") || undefined, style: { width: Math.round(p.n("width")) } }),
    },
    {
      slug: "antd/form",
      name: "Ant Form",
      labels: { ja: "Ant フォーム", zh: "Ant 表单", ko: "Ant 폼" },
      category: "Ant Design",
      icon: "dynamic_form",
      w: 360,
      h: 320,
      props: [
        { key: "fields", label: "Fields", labels: { ja: "項目", zh: "字段", ko: "필드" }, kind: "list", default: [{ label: "Name" }, { label: "Email" }, { label: "Role" }], min: 1, max: 12 },
        { key: "layout", label: "Layout", labels: { ja: "配置", zh: "布局", ko: "배치" }, kind: "enum", default: "vertical", options: ["vertical", "horizontal", "inline"] },
        { key: "submit", label: "Submit button", labels: { ja: "送信ボタン", zh: "提交按钮", ko: "제출 버튼" }, kind: "text", default: "Submit", defaults: { zh: "提交" } },
        WIDTH(360),
      ],
      tree: (p) => h("AntForm", { fields: p.list("fields").map((f) => f.label), layout: p.s("layout"), submit: p.s("submit"), width: Math.round(p.n("width")) }),
    },
    {
      slug: "antd/card",
      name: "Ant Card",
      labels: { ja: "Ant カード", zh: "Ant 卡片", ko: "Ant 카드" },
      category: "Ant Design",
      icon: "dashboard_customize",
      w: 360,
      h: 220,
      props: [
        { key: "title", label: "Title", kind: "text", default: "Card title", defaults: { zh: "卡片标题" } },
        { key: "extra", label: "Corner link", labels: { ja: "右上のリンク", zh: "右上角链接", ko: "오른쪽 위 링크" }, kind: "text", default: "More", defaults: { zh: "更多" } },
        { key: "body", label: "Content", labels: { ja: "内容", zh: "内容", ko: "내용" }, kind: "text", default: "Card content", defaults: { zh: "卡片内容" } },
        { key: "bordered", label: "Border", labels: { ja: "枠線", zh: "边框", ko: "테두리" }, kind: "bool", default: true },
        { key: "hoverable", label: "Lifts on hover", labels: { ja: "ホバーで浮く", zh: "悬停浮起", ko: "호버 시 떠오름" }, kind: "bool", default: false },
        WIDTH(360),
      ],
      tree: (p) => h("AntCard", { title: p.s("title") || undefined, extra: p.s("extra") || undefined, variant: p.b("bordered") ? "outlined" : "borderless", hoverable: p.b("hoverable") || undefined, style: { width: Math.round(p.n("width")) } }, p.s("body")),
    },
    {
      slug: "antd/table",
      name: "Ant Table",
      labels: { ja: "Ant テーブル", zh: "Ant 表格", ko: "Ant 테이블" },
      category: "Ant Design",
      icon: "table_chart",
      w: 560,
      h: 260,
      props: [
        { key: "columns", label: "Columns", labels: { ja: "列", zh: "列", ko: "열" }, kind: "list", default: [{ label: "Name" }, { label: "Status" }, { label: "Owner" }], min: 1, max: 12 },
        { key: "rows", label: "Rows", labels: { ja: "行数", zh: "行数", ko: "행 수" }, kind: "number", default: 3, min: 1, max: 50, step: 1 },
        { key: "pagination", label: "Pagination", labels: { ja: "ページ送り", zh: "分页", ko: "페이지 이동" }, kind: "bool", default: true },
        { key: "bordered", label: "Border", labels: { ja: "枠線", zh: "边框", ko: "테두리" }, kind: "bool", default: false },
        { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "middle", options: SIZES },
        WIDTH(560),
      ],
      tree: (p) => {
        const columns = p.list("columns").map((c, i) => ({ title: c.label, dataIndex: `c${i}`, key: `c${i}` }));
        /* a sketch's rows: the column's name and a number, until the app has its own data */
        const dataSource = Array.from({ length: Math.round(p.n("rows")) }, (_, r) => ({ key: String(r), ...Object.fromEntries(columns.map((c) => [c.dataIndex, `${c.title} ${r + 1}`])) }));
        return h("AntTable", { columns, dataSource, pagination: p.b("pagination") ? undefined : false, bordered: p.b("bordered") || undefined, size: p.s("size"), style: { width: Math.round(p.n("width")) } });
      },
    },
    {
      slug: "antd/tabs",
      name: "Ant Tabs",
      labels: { ja: "Ant タブ", zh: "Ant 标签页", ko: "Ant 탭" },
      category: "Ant Design",
      icon: "tab",
      w: 360,
      h: 60,
      props: [
        { key: "items", label: "Tabs", labels: { ja: "タブ", zh: "标签", ko: "탭" }, kind: "list", default: [{ label: "Overview" }, { label: "Activity" }, { label: "Settings" }], min: 1, max: 12 },
        { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 11, step: 1 },
        WIDTH(360),
      ],
      tree: (p) => h("AntTabs", { items: keyed(p.list("items")), defaultActiveKey: String(Math.round(p.n("selected"))), style: { width: Math.round(p.n("width")) } }),
    },
    {
      slug: "antd/menu",
      name: "Ant Menu",
      labels: { ja: "Ant メニュー", zh: "Ant 菜单", ko: "Ant 메뉴" },
      category: "Ant Design",
      icon: "menu",
      w: 220,
      h: 200,
      props: [
        { key: "items", label: "Items", labels: { ja: "項目", zh: "菜单项", ko: "항목" }, kind: "list", default: [{ label: "Dashboard" }, { label: "Users" }, { label: "Settings" }], min: 1, max: 20 },
        { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 19, step: 1 },
        { key: "mode", label: "Mode", labels: { ja: "モード", zh: "模式", ko: "모드" }, kind: "enum", default: "inline", options: ["inline", "vertical", "horizontal"] },
        WIDTH(220),
      ],
      tree: (p) => h("AntMenu", { items: keyed(p.list("items")), defaultSelectedKeys: [String(Math.round(p.n("selected")))], mode: p.s("mode"), style: { width: Math.round(p.n("width")) } }),
    },
    {
      slug: "antd/breadcrumb",
      name: "Ant Breadcrumb",
      labels: { ja: "Ant パンくず", zh: "Ant 面包屑", ko: "Ant 브레드크럼" },
      category: "Ant Design",
      icon: "chevron_right",
      w: 240,
      h: 24,
      props: [
        { key: "items", label: "Items", labels: { ja: "項目", zh: "层级", ko: "항목" }, kind: "list", default: [{ label: "Home" }, { label: "List" }, { label: "Detail" }], min: 1, max: 8 },
        { key: "separator", label: "Separator", labels: { ja: "区切り", zh: "分隔符", ko: "구분자" }, kind: "text", default: "/" },
      ],
      tree: (p) => h("AntBreadcrumb", { items: p.list("items").map((x) => ({ title: x.label })), separator: p.s("separator") }),
    },
    {
      slug: "antd/pagination",
      name: "Ant Pagination",
      labels: { ja: "Ant ページネーション", zh: "Ant 分页", ko: "Ant 페이지네이션" },
      category: "Ant Design",
      icon: "last_page",
      w: 320,
      h: 32,
      props: [
        { key: "total", label: "Total items", labels: { ja: "総数", zh: "总条数", ko: "전체 수" }, kind: "number", default: 120, min: 1, max: 100000, step: 1 },
        { key: "pageSize", label: "Items per page", labels: { ja: "1ページの数", zh: "每页条数", ko: "페이지당 수" }, kind: "number", default: 10, min: 1, max: 200, step: 1 },
        { key: "current", label: "Current page", labels: { ja: "現在のページ", zh: "当前页", ko: "현재 페이지" }, kind: "number", default: 1, min: 1, max: 10000, step: 1 },
      ],
      tree: (p) => h("AntPagination", { total: Math.round(p.n("total")), pageSize: Math.round(p.n("pageSize")), defaultCurrent: Math.round(p.n("current")), showSizeChanger: false }),
    },
    {
      slug: "antd/modal",
      name: "Ant Modal",
      labels: { ja: "Ant モーダル", zh: "Ant 弹窗", ko: "Ant 모달" },
      category: "Ant Design",
      icon: "picture_in_picture",
      w: 520,
      h: 200,
      props: [
        { key: "title", label: "Title", kind: "text", default: "Modal title", defaults: { zh: "弹窗标题" } },
        { key: "content", label: "Content", labels: { ja: "内容", zh: "内容", ko: "내용" }, kind: "text", default: "Modal content", defaults: { zh: "弹窗内容" } },
        { key: "ok", label: "OK button", labels: { ja: "OK ボタン", zh: "确定按钮", ko: "확인 버튼" }, kind: "text", default: "OK", defaults: { zh: "确定" } },
        { key: "cancel", label: "Cancel button", labels: { ja: "キャンセルボタン", zh: "取消按钮", ko: "취소 버튼" }, kind: "text", default: "Cancel", defaults: { zh: "取消" } },
        WIDTH(520),
      ],
      tree: (p) => h("AntModal", { title: p.s("title"), content: p.s("content"), ok: p.s("ok"), cancel: p.s("cancel"), width: Math.round(p.n("width")) }),
    },
    {
      slug: "antd/divider",
      name: "Ant Divider",
      labels: { ja: "Ant 区切り線", zh: "Ant 分割线", ko: "Ant 구분선" },
      category: "Ant Design",
      icon: "horizontal_rule",
      w: 360,
      h: 24,
      props: [
        { key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "" },
        { key: "dashed", label: "Dashed", labels: { ja: "破線", zh: "虚线", ko: "점선" }, kind: "bool", default: false },
        WIDTH(360),
      ],
      tree: (p) => h("div", { style: { width: Math.round(p.n("width")) } }, h("AntDivider", { variant: p.b("dashed") ? "dashed" : "solid" }, p.s("text") || undefined)),
    },
  ],
};
