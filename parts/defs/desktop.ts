import { h, ic } from "../node";
import type { PartDef } from "../types";

/* The desktop chrome, after JetSquirrel/gpui-kit-canvas (MIT): what a window has around its content,
 * and the small desktop controls shadcn M3E has no counterpart for. Written here on M3E's roles. */

/** What stands along a window's top: the controls of the platform the author picked, the title, and two hooks a style
 *  may show, an app glyph before the title and, where the author picked the Mac's lights, the caption buttons of a
 *  Windows app instead. The window part (additions.ts) draws the same bar, from a copy: a definition file imports no
 *  other. */
function windowBar(controls: string, title: string) {
  const dot = h("span", { className: "bg-outline size-3 rounded-full" });
  const glyphs = [ic("remove", { className: "size-4" }), ic("crop_square", { className: "size-4" }), ic("close", { className: "size-4" })];
  return [
    controls === "mac" && h("div", { "data-slot": "title-bar-controls", className: "flex gap-2" }, dot, dot, dot),
    h("span", { "data-slot": "title-bar-icon", "aria-hidden": true, className: "hidden" }, ic("web_asset", { className: "size-4" })),
    h("div", { "data-slot": "title-bar-title", className: `text-label-large text-on-surface flex-1 truncate ${controls === "mac" ? "text-center" : ""}` }, title),
    controls === "windows" && h("div", { "data-slot": "title-bar-controls", className: "text-on-surface-variant flex gap-3" }, ...glyphs),
    controls === "mac" && h("div", { "data-slot": "title-bar-caption", "aria-hidden": true, className: "text-on-surface-variant hidden gap-3" }, ...glyphs),
  ];
}

export const desktop: PartDef[] = [
  {
    slug: "title-bar",
    appearance: { radius: 0 },
    name: "Title bar",
    labels: { ja: "タイトルバー", zh: "标题栏", ko: "제목 표시줄" },
    category: "Desktop",
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
      return h(
        "div",
        { "data-slot": "title-bar", "data-controls": controls, className: "bg-surface-container flex h-9 items-center gap-3 px-3", style: { width: Math.round(p.n("width")) } },
        ...windowBar(controls, p.s("title")),
      );
    },
  },
  {
    slug: "status-bar",
    appearance: { radius: 0 },
    name: "Status bar",
    labels: { ja: "ステータスバー", zh: "状态栏", ko: "상태 표시줄" },
    category: "Desktop",
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
        h("span", { "data-slot": "status-bar-label", className: "flex-1 truncate" }, p.s("text")),
        p.s("trailing") && h("span", { "data-slot": "status-bar-value" }, p.s("trailing")),
      ),
  },
  {
    slug: "tree",
    appearance: { radius: 12 },
    name: "Tree",
    labels: { ja: "ツリー", zh: "树形列表", ko: "트리" },
    category: "Desktop",
    icon: "account_tree",
    w: 260,
    h: 140,
    props: [
      /* two leading spaces make a row one level deeper */
      { key: "items", label: "Rows", labels: { ja: "行", zh: "行", ko: "행" }, kind: "list", icons: true, default: [{ label: "src", icon: "folder_open" }, { label: "  main.rs", icon: "draft" }, { label: "  ui", icon: "folder" }, { label: "Cargo.toml", icon: "draft" }], min: 1, max: 20 },
      { key: "selected", label: "Selected row", labels: { ja: "選択中の行", zh: "选中的行", ko: "선택한 행" }, kind: "number", default: 0, min: 0, max: 19, step: 1 },
      { key: "width", label: "Width", kind: "number", default: 260, min: 120, max: 640, step: 4, unit: "px" },
    ],
    selectKey: "selected",
    tree: (p) =>
      h(
        "div",
        { "data-slot": "tree", role: "tree", className: "flex flex-col gap-0.5", style: { width: Math.round(p.n("width")) } },
        ...p.list("items").map((row, i, rows) => {
          const depthOf = (label = "") => Math.floor((label.length - label.trimStart().length) / 2);
          const depth = depthOf(row.label);
          const on = Math.round(p.n("selected")) === i;
          /* a row with deeper rows under it is open; a folder with none is closed; anything else is a leaf. The twisty
             that says so is a hook: hidden unless a style draws it. */
          const open = i + 1 < rows.length && depthOf(rows[i + 1].label) > depth;
          const twisty = open ? "expand_more" : /folder/.test(row.icon ?? "") ? "chevron_right" : "";
          return h(
            "div",
            { role: "treeitem", "data-slot": "tree-row", "data-active": on ? "" : undefined, "data-depth": depth, className: `text-body-medium flex items-center gap-2 rounded-md py-1 pr-2 ${on ? "bg-secondary-container text-on-secondary-container" : "text-on-surface"}`, style: { paddingLeft: 8 + depth * 16 } },
            h("span", { "data-slot": "tree-twisty", "aria-hidden": true, className: "hidden" }, twisty && ic(twisty, { className: "size-4" })),
            row.icon && ic(row.icon, { className: "size-4 shrink-0" }),
            h("span", { "data-slot": "tree-label", className: "truncate" }, row.label.trim()),
          );
        }),
      ),
  },
  {
    slug: "steps",
    appearance: { radius: 12 },
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
            { "data-slot": "steps-item", "data-state": i < current ? "done" : i === current ? "current" : "todo", "aria-current": i === current ? "step" : undefined, className: "flex min-w-0 flex-1 items-center gap-2" },
            /* a step that is done may show a check in place of its number, and a line may run on to the next step:
               both hooks, hidden unless a style draws them */
            h("span", { "data-slot": "steps-number", className: `text-label-medium flex size-6 shrink-0 items-center justify-center rounded-full ${i <= current ? "bg-primary text-on-primary" : "bg-surface-container-highest text-on-surface-variant"}` }, h("span", { "data-slot": "steps-digit" }, String(i + 1)), i < current && h("span", { "data-slot": "steps-check", "aria-hidden": true, className: "hidden" }, ic("check", { className: "size-4" }))),
            h("span", { "data-slot": "steps-label", className: `text-label-large truncate ${i === current ? "text-on-surface" : "text-on-surface-variant"}` }, step.label),
            i < p.list("items").length - 1 && h("span", { "data-slot": "steps-tail", "aria-hidden": true, className: "hidden" }),
          ),
        ),
      );
    },
  },
  {
    slug: "copy-row",
    appearance: { radius: 6 },
    name: "Copy row",
    labels: { ja: "コピー行", zh: "复制行", ko: "복사 행" },
    category: "Forms",
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
    appearance: { radius: 4 },
    name: "Shimmer text",
    labels: { ja: "シマーテキスト", zh: "闪烁文字", ko: "반짝이는 텍스트" },
    category: "AI",
    icon: "auto_awesome",
    w: 160,
    h: 24,
    props: [{ key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "Thinking…", defaults: { zh: "思考中…" } }],
    tree: (p) => h("span", { "data-slot": "shimmer", className: "text-body-medium text-on-surface-variant animate-pulse" }, p.s("text")),
  },
];
