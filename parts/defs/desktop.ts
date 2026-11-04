import { h, ic } from "../node";
import type { PartDef } from "../types";

/* The desktop chrome of JetSquirrel/gpui-kit-canvas (MIT): what a window has around its content, and
 * the small desktop controls shadcn M3E has no counterpart for. Written here on M3E's roles; the
 * Rust library that fork targets is not involved. */

export const desktop: PartDef[] = [
  {
    slug: "title-bar",
    name: "Title bar",
    labels: { ja: "タイトルバー", zh: "标题栏", ko: "제목 표시줄" },
    category: "Navigation",
    icon: "web_asset",
    role: "top",
    w: 640,
    h: 36,
    props: [
      { key: "title", label: "Title", kind: "text", default: "App", defaults: { zh: "应用" } },
      { key: "controls", label: "Window controls", labels: { ja: "ウィンドウ操作", zh: "窗口按钮", ko: "창 버튼" }, kind: "enum", default: "mac", options: ["mac", "windows", "none"] },
      { key: "width", label: "Width", kind: "number", default: 640, min: 240, max: 1920, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const controls = p.s("controls");
      const dot = h("span", { className: "bg-outline size-3 rounded-full" });
      return h(
        "div",
        { "data-slot": "title-bar", "data-controls": controls, className: "bg-surface-container flex h-9 items-center gap-3 px-3", style: { width: Math.round(p.n("width")) } },
        controls === "mac" && h("div", { className: "flex gap-2" }, dot, dot, dot),
        h("div", { className: `text-label-large text-on-surface flex-1 truncate ${controls === "mac" ? "text-center" : ""}` }, p.s("title")),
        controls === "windows" && h("div", { className: "text-on-surface-variant flex gap-3" }, ic("remove", { className: "size-4" }), ic("crop_square", { className: "size-4" }), ic("close", { className: "size-4" })),
      );
    },
  },
  {
    slug: "status-bar",
    name: "Status bar",
    labels: { ja: "ステータスバー", zh: "状态栏", ko: "상태 표시줄" },
    category: "Navigation",
    icon: "call_to_action",
    role: "bottom",
    w: 640,
    h: 28,
    props: [
      { key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "Ready", defaults: { zh: "就绪" } },
      { key: "icon", label: "Icon", kind: "icon", default: "check_circle" },
      { key: "trailing", label: "Trailing text", labels: { ja: "右側のテキスト", zh: "右侧文字", ko: "오른쪽 텍스트" }, kind: "text", default: "3 items", defaults: { zh: "3 项" } },
      { key: "width", label: "Width", kind: "number", default: 640, min: 240, max: 1920, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "status-bar", className: "bg-surface-container text-label-medium text-on-surface-variant flex h-7 items-center gap-2 px-3", style: { width: Math.round(p.n("width")) } },
        p.s("icon") && ic(p.s("icon"), { className: "size-4" }),
        h("span", { className: "flex-1 truncate" }, p.s("text")),
        p.s("trailing") && h("span", null, p.s("trailing")),
      ),
  },
  {
    slug: "tree",
    name: "Tree",
    labels: { ja: "ツリー", zh: "树形列表", ko: "트리" },
    category: "Data",
    icon: "account_tree",
    w: 260,
    h: 140,
    props: [
      /* two leading spaces make a row one level deeper, the way the GPUI canvas writes them */
      { key: "items", label: "Rows", labels: { ja: "行", zh: "行", ko: "행" }, kind: "list", icons: true, default: [{ label: "src", icon: "folder_open" }, { label: "  main.rs", icon: "draft" }, { label: "  ui", icon: "folder" }, { label: "Cargo.toml", icon: "draft" }], min: 1, max: 20 },
      { key: "selected", label: "Selected row", labels: { ja: "選択中の行", zh: "选中的行", ko: "선택한 행" }, kind: "number", default: 0, min: 0, max: 19, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 260, min: 120, max: 640, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "tree", role: "tree", className: "flex flex-col gap-0.5", style: { width: Math.round(p.n("width")) } },
        ...p.list("items").map((row, i) => {
          const depth = Math.floor((row.label.length - row.label.trimStart().length) / 2);
          const on = Math.round(p.n("selected")) === i;
          return h(
            "div",
            { role: "treeitem", className: `text-body-medium flex items-center gap-2 rounded-md py-1 pr-2 ${on ? "bg-secondary-container text-on-secondary-container" : "text-on-surface"}`, style: { paddingLeft: 8 + depth * 16 } },
            row.icon && ic(row.icon, { className: "size-4 shrink-0" }),
            h("span", { className: "truncate" }, row.label.trim()),
          );
        }),
      ),
  },
  {
    slug: "steps",
    name: "Steps",
    labels: { ja: "ステップ", zh: "步骤条", ko: "단계" },
    category: "Navigation",
    icon: "linear_scale",
    w: 420,
    h: 48,
    props: [
      { key: "items", label: "Steps", labels: { ja: "ステップ", zh: "步骤", ko: "단계" }, kind: "list", default: [{ label: "Details" }, { label: "Payment" }, { label: "Confirm" }], min: 2, max: 8 },
      { key: "current", label: "Current step", labels: { ja: "現在のステップ", zh: "当前步骤", ko: "현재 단계" }, kind: "number", default: 1, min: 0, max: 7, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 420, min: 160, max: 1200, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const current = Math.round(p.n("current"));
      return h(
        "ol",
        { "data-slot": "steps", className: "flex items-center gap-2", style: { width: Math.round(p.n("width")) } },
        ...p.list("items").map((step, i) =>
          h(
            "li",
            { "aria-current": i === current ? "step" : undefined, className: "flex min-w-0 flex-1 items-center gap-2" },
            h("span", { className: `text-label-medium flex size-6 shrink-0 items-center justify-center rounded-full ${i <= current ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}` }, String(i + 1)),
            h("span", { className: `text-label-large truncate ${i === current ? "text-on-surface" : "text-on-surface-variant"}` }, step.label),
          ),
        ),
      );
    },
  },
  {
    slug: "copy-row",
    name: "Copy row",
    labels: { ja: "コピー行", zh: "复制行", ko: "복사 행" },
    category: "Text inputs",
    icon: "content_copy",
    w: 280,
    h: 40,
    props: [
      { key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "npm run deploy" },
      { key: "width", label: "Width", kind: "number", default: 280, min: 120, max: 800, step: 4, unit: "px" },
    ],
    tree: (p) => h("ClipboardRow", { text: p.s("text"), width: Math.round(p.n("width")) }),
  },
  {
    slug: "shimmer-text",
    name: "Shimmer text",
    labels: { ja: "シマーテキスト", zh: "闪烁文字", ko: "반짝이는 텍스트" },
    category: "Feedback",
    icon: "auto_awesome",
    w: 160,
    h: 24,
    props: [{ key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "Thinking…", defaults: { zh: "思考中…" } }],
    tree: (p) => h("span", { "data-slot": "shimmer", className: "text-body-medium text-on-surface-variant animate-pulse" }, p.s("text")),
  },
];
