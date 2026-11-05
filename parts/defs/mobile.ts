import { h, ic } from "../node";
import type { PartDef } from "../types";

/* What iOS screens have and Material does not, after greycode/m3e-canvas (MIT). Drawn on M3E's roles
 * like everything else: this says what the part is on a screen, it does not imitate Apple's look,
 * and a brand button carries no logo. */

export const mobile: PartDef[] = [
  {
    slug: "page-dots",
    appearance: { radius: 999 },
    name: "Page dots",
    labels: { ja: "ページドット", zh: "页面圆点", ko: "페이지 점" },
    category: "Indicators",
    icon: "more_horiz",
    w: 96,
    h: 24,
    props: [
      { key: "count", label: "Pages", labels: { ja: "ページ数", zh: "页数", ko: "페이지 수" }, kind: "number", default: 4, min: 1, max: 12, step: 1 },
      { key: "current", label: "Current page", labels: { ja: "現在のページ", zh: "当前页", ko: "현재 페이지" }, kind: "number", default: 0, min: 0, max: 11, step: 1 },
    ],
    tree: (p) => h("div", { "data-slot": "page-dots", role: "img", "aria-label": `${Math.round(p.n("current")) + 1} / ${Math.round(p.n("count"))}`, className: "inline-flex h-6 items-center gap-2 px-2" }, ...Array.from({ length: Math.round(p.n("count")) }, (_, i) => h("span", { className: `size-2 rounded-full ${i === Math.round(p.n("current")) ? "bg-primary" : "bg-outline-variant"}` }))),
  },
  {
    slug: "photo-grid",
    appearance: { radius: 8 },
    name: "Photo grid",
    labels: { ja: "写真グリッド", zh: "照片网格", ko: "사진 격자" },
    category: "Media",
    icon: "photo_library",
    w: 380,
    h: 250,
    props: [
      { key: "count", label: "Photos", labels: { ja: "枚数", zh: "照片数", ko: "사진 수" }, kind: "number", default: 9, min: 1, max: 30, step: 1 },
      { key: "columns", label: "Columns", labels: { ja: "列", zh: "列数", ko: "열" }, kind: "number", default: 3, min: 1, max: 6, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 380, min: 120, max: 800, step: 4, unit: "px" },
    ],
    tree: (p) => h("div", { "data-slot": "photo-grid", className: "grid gap-0.5", style: { width: Math.round(p.n("width")), gridTemplateColumns: `repeat(${Math.round(p.n("columns"))}, minmax(0, 1fr))` } }, ...Array.from({ length: Math.round(p.n("count")) }, () => h("div", { className: "bg-surface-container-high text-outline flex aspect-square items-center justify-center" }, ic("image", { className: "size-6" })))),
  },
  {
    slug: "brand-button",
    appearance: { radius: 20 },
    name: "Sign-in or pay button",
    labels: { ja: "サインイン・支払いボタン", zh: "登录或支付按钮", ko: "로그인·결제 버튼" },
    category: "Actions",
    icon: "payments",
    w: 380,
    h: 48,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Continue", defaults: { zh: "继续" } },
      { key: "width", label: "Width", kind: "number", default: 380, min: 120, max: 800, step: 4, unit: "px" },
    ],
    tree: (p) => h("Button", { variant: "filled", "data-slot": "brand-button", className: "bg-inverse-surface text-inverse-on-surface", style: { width: Math.round(p.n("width")) } }, p.s("label")),
  },
  {
    slug: "action-sheet",
    appearance: { radius: 16 },
    name: "Action sheet",
    labels: { ja: "アクションシート", zh: "操作表", ko: "작업 시트" },
    category: "Overlays",
    icon: "vertical_split",
    w: 380,
    h: 200,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Delete this note?", defaults: { zh: "删除这条笔记？" } },
      { key: "message", label: "Message", labels: { ja: "メッセージ", zh: "说明", ko: "메시지" }, kind: "text", default: "This cannot be undone.", defaults: { zh: "此操作无法撤销。" } },
      { key: "actions", label: "Actions", labels: { ja: "操作", zh: "操作项", ko: "작업" }, kind: "list", default: [{ label: "Delete" }, { label: "Archive" }], min: 1, max: 8 },
      { key: "cancel", label: "Cancel", labels: { ja: "キャンセル", zh: "取消文字", ko: "취소" }, kind: "text", default: "Cancel", defaults: { zh: "取消" } },
      { key: "width", label: "Width", kind: "number", default: 380, min: 200, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "action-sheet", className: "flex flex-col gap-2", style: { width: Math.round(p.n("width")) } },
        h(
          "div",
          { "data-slot": "action-sheet-group", className: "bg-surface-container-high divide-outline-variant flex flex-col divide-y overflow-hidden rounded-2xl" },
          h("div", { "data-slot": "action-sheet-header", className: "p-3 text-center" }, h("div", { "data-slot": "action-sheet-title", className: "text-label-large text-on-surface" }, p.s("title")), p.s("message") && h("div", { "data-slot": "action-sheet-message", className: "text-body-small text-on-surface-variant" }, p.s("message"))),
          ...p.list("actions").map((a) => h("Button", { variant: "text", "data-slot": "action-sheet-action", className: "w-full rounded-none" }, a.label)),
        ),
        p.s("cancel") && h("Button", { variant: "tonal", "data-slot": "action-sheet-cancel", className: "w-full" }, p.s("cancel")),
      ),
  },
  {
    slug: "subscription",
    appearance: { radius: 16 },
    name: "Subscription plans",
    labels: { ja: "サブスクリプション", zh: "订阅方案", ko: "구독 요금제" },
    category: "Commerce",
    icon: "workspace_premium",
    w: 380,
    h: 240,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Premium", defaults: { zh: "高级版" } },
      { key: "description", label: "Description", labels: { ja: "説明", zh: "说明", ko: "설명" }, kind: "text", default: "Every feature, unlocked.", defaults: { zh: "解锁全部功能" } },
      { key: "plans", label: "Plans", labels: { ja: "プラン", zh: "方案", ko: "요금제" }, kind: "list", default: [{ label: "Monthly" }, { label: "Yearly" }], min: 1, max: 6 },
      { key: "action", label: "Button", labels: { ja: "ボタン", zh: "按钮文字", ko: "버튼" }, kind: "text", default: "Subscribe", defaults: { zh: "订阅" } },
      { key: "width", label: "Width", kind: "number", default: 380, min: 200, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "subscription", className: "bg-surface-container-low flex flex-col gap-2 rounded-2xl p-4", style: { width: Math.round(p.n("width")) } },
        h("div", { "data-slot": "subscription-title", className: "text-title-large text-on-surface" }, p.s("title")),
        p.s("description") && h("div", { "data-slot": "subscription-description", className: "text-body-medium text-on-surface-variant" }, p.s("description")),
        ...p.list("plans").map((plan) => h("div", { "data-slot": "subscription-plan", className: "border-outline-variant text-body-large text-on-surface rounded-xl border p-3" }, plan.label)),
        p.s("action") && h("Button", { variant: "filled", "data-slot": "subscription-action", className: "w-full" }, p.s("action")),
      ),
  },
  {
    slug: "wheel-picker",
    appearance: { radius: 12 },
    name: "Wheel picker",
    labels: { ja: "ホイールピッカー", zh: "滚轮选择器", ko: "휠 선택기" },
    category: "Pickers",
    icon: "unfold_more",
    w: 380,
    h: 160,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Minutes", defaults: { zh: "分钟" } },
      { key: "items", label: "Options", labels: { ja: "選択肢", zh: "选项", ko: "옵션" }, kind: "list", default: [{ label: "5" }, { label: "10" }, { label: "15" }, { label: "30" }, { label: "60" }], min: 1, max: 20 },
      { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 2, min: 0, max: 19, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 380, min: 120, max: 640, step: 4, unit: "px" },
    ],
    selectKey: "selected",
    tree: (p) => {
      const selected = Math.round(p.n("selected"));
      return h(
        "div",
        { "data-slot": "wheel-picker", className: "flex flex-col gap-1", style: { width: Math.round(p.n("width")) } },
        p.s("label") && h("div", { className: "text-label-large text-on-surface-variant" }, p.s("label")),
        h("div", { className: "flex flex-col" }, ...p.list("items").map((it, i) => { const d = Math.abs(i - selected); return h("div", { className: `text-body-large rounded-md py-1 text-center ${d === 0 ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant"}`, style: { opacity: Math.max(0.25, 1 - d * 0.3) } }, it.label); })),
      );
    },
  },
];
