import { FLOW_PROPS } from "../flow";
import { h, ic, listSlots } from "../node";
import type { ListItem, P, PartDef, TableData } from "../types";

/* The parts that complete the set: what the source libraries have that nothing else here covered
 * (docs/组件盘点.md says which source each answers). Each is drawn on shadcn M3E components and
 * theme roles, or a widget that is. */

const WIDTH = (value: number, min = 120, max = 1280): Extract<PartDef["props"][number], { kind: "number" }> => ({ key: "width", label: "Width", kind: "number", default: value, min, max, step: 4, unit: "px" });
const px = (p: P, key = "width") => Math.round(p.n(key));
const words = (items: ListItem[]) => items.map((x) => x.label);

/** The title bar's own row (desktop.ts says why it is drawn so): the platform's controls, the title, and the two hooks a
 *  style may show, an app glyph and, behind the Mac's lights, a Windows app's caption buttons. */
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

const TEXT_STYLES: Record<string, string> = {
  display: "text-display-small",
  headline: "text-headline-small",
  title: "text-title-large",
  heading: "text-title-medium",
  subtitle: "text-title-small",
  lead: "text-body-large",
  body: "text-body-medium",
  label: "text-label-large",
  caption: "text-body-small",
  tiny: "text-label-small",
};
/** the size and the line height of each style, for a guess at how much room the words take */
const TEXT_METRICS: Record<string, [size: number, line: number]> = { display: [36, 44], headline: [24, 32], title: [22, 28], heading: [16, 24], subtitle: [14, 20], lead: [16, 24], body: [14, 20], label: [14, 20], caption: [12, 16], tiny: [11, 16] };
const TEXT_COLORS: Record<string, string> = {
  default: "text-on-surface",
  muted: "text-on-surface-variant",
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  error: "text-error",
  outline: "text-outline",
  "on-primary": "text-on-primary",
  inverse: "text-inverse-on-surface",
};
/* literal class names: Tailwind only sees what is written out */
const CLAMP: Record<number, string> = { 1: "line-clamp-1", 2: "line-clamp-2", 3: "line-clamp-3", 4: "line-clamp-4", 5: "line-clamp-5", 6: "line-clamp-6" };

/** how wide a line of words comes out at a size: a full-width character takes the size, any other about half of it */
const wordsWidth = (line: string, size: number) => [...line].reduce((w, ch) => w + (/[⺀-￯]/.test(ch) ? size : /[A-Z0-9@#%&wm]/.test(ch) ? size * 0.66 : /[\s.,:;'|!il]/.test(ch) ? size * 0.3 : size * 0.54), 0);

/** the room a text part that hugs its words takes before it is drawn: one line per line of words.
 *  One of a fixed width is as wide as it says, and is measured for its height. */
function textGuess(p: P) {
  if (p.s("fit") !== "auto") return {};
  const [size, line] = TEXT_METRICS[p.s("style")] ?? TEXT_METRICS.body;
  const lines = p.s("text").split("\n").map((l) => wordsWidth(l, size) * (p.b("bold") ? 1.05 : 1));
  return { w: Math.ceil(Math.max(8, ...lines)), h: line * lines.length };
}
const TEXT_ALIGN: Record<string, string> = { start: "text-left", center: "text-center", end: "text-right" };
const FIT: Record<string, string> = { cover: "object-cover", contain: "object-contain" };
const TRACK: Record<string, string> = { ok: "bg-primary", warn: "bg-tertiary", bad: "bg-error", none: "bg-surface-container-highest" };
const ICON_BUTTON_SIZES: Record<string, string> = { xs: "icon-xs", sm: "icon-sm", default: "icon", md: "icon-md", lg: "icon-lg", xl: "icon-xl" };
const ICON_BUTTON_DP: Record<string, number> = { xs: 32, sm: 40, default: 40, md: 56, lg: 96, xl: 136 };

const EVENTS: TableData = {
  columns: ["Time", "Title", "Detail"],
  rows: [
    ["09:00", "Order placed", "We have your order."],
    ["11:30", "Shipped", "It left the warehouse."],
    ["Today", "Out for delivery", "It arrives this evening."],
  ],
};

export const additions: PartDef[] = [
  /* ---------- the plainest things on a screen ---------- */
  {
    slug: "text",
    appearance: { radius: 4 },
    name: "Text",
    labels: { ja: "テキスト", zh: "文本", ko: "텍스트" },
    category: "Basics",
    icon: "title",
    w: 280,
    h: 24,
    props: [
      { key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "Text", defaults: { zh: "文字" }, multiline: true },
      { key: "style", label: "Style", labels: { ja: "種類", zh: "样式", ko: "유형" }, kind: "enum", default: "body", options: Object.keys(TEXT_STYLES) },
      { key: "color", label: "Color", kind: "enum", default: "default", options: Object.keys(TEXT_COLORS) },
      { key: "align", label: "Align", labels: { ja: "揃え", zh: "对齐", ko: "정렬" }, kind: "enum", default: "start", options: Object.keys(TEXT_ALIGN) },
      { key: "bold", label: "Bold", labels: { ja: "太字", zh: "粗体", ko: "굵게" }, kind: "bool", default: false },
      {
        key: "fit",
        label: "Sizing",
        labels: { ja: "幅の決め方", zh: "宽度方式", ko: "너비 방식" },
        kind: "enum",
        default: "fixed",
        options: [
          { value: "auto", label: "Hug the words", labels: { ja: "文字に合わせる", zh: "随文字", ko: "글자에 맞춤" } },
          { value: "fixed", label: "Fixed, wraps", labels: { ja: "固定・折り返す", zh: "固定宽度换行", ko: "고정·줄바꿈" } },
        ],
      },
      { ...WIDTH(280, 40, 1600), when: (p: P) => p.s("fit") !== "auto" },
      { key: "maxLines", label: "Most lines (0: any)", labels: { ja: "最大行数（0: 制限なし）", zh: "最多行数（0：不限）", ko: "최대 줄 수 (0: 제한 없음)" }, kind: "number", default: 0, min: 0, max: 6, step: 1, when: (p: P) => p.s("fit") !== "auto" },
    ],
    /* hugging its words it is as wide as its longest line, the way a text layer is in a design tool;
     *  fixed, it wraps in its width, which a stretching column sets for it */
    tree: (p) => {
      const auto = p.s("fit") === "auto";
      const className = [TEXT_STYLES[p.s("style")], TEXT_COLORS[p.s("color")], TEXT_ALIGN[p.s("align")], auto ? "w-max whitespace-pre" : "whitespace-pre-wrap", !auto && CLAMP[Math.round(p.n("maxLines"))], p.b("bold") && "font-bold"].filter(Boolean).join(" ");
      return h("div", { "data-slot": "text", className, style: auto ? undefined : { width: px(p) } }, p.s("text"));
    },
    guess: textGuess,
    seed: { fit: "auto" },
  },
  {
    slug: "image",
    name: "Image",
    labels: { ja: "画像", zh: "图片", ko: "이미지" },
    category: "Basics",
    icon: "image",
    w: 240,
    h: 160,
    props: [
      { key: "src", label: "Image", labels: { ja: "画像", zh: "图片", ko: "이미지" }, kind: "image" },
      { key: "alt", label: "Description", labels: { ja: "説明", zh: "说明", ko: "설명" }, kind: "text", default: "" },
      { key: "fit", label: "Fit", labels: { ja: "合わせ方", zh: "填充方式", ko: "맞춤" }, kind: "enum", default: "cover", options: Object.keys(FIT) },
      { key: "radius", label: "Corner", labels: { ja: "角丸", zh: "圆角", ko: "모서리" }, kind: "number", default: 12, min: 0, max: 120, step: 2, unit: "px" },
      WIDTH(240, 24, 1600),
      { key: "height", label: "Height", kind: "number", default: 160, min: 24, max: 1600, step: 4, unit: "px" },
    ],
    tree: (p) => {
      /* left as it comes, its corner is the theme's, which the shape scale and any style reach */
      const style = { width: px(p), height: px(p, "height"), borderRadius: p.n("radius") === 12 ? "var(--md-sys-shape-corner-medium)" : px(p, "radius") };
      return p.s("src")
        ? h("img", { "data-slot": "image", src: p.s("src"), alt: p.s("alt"), className: FIT[p.s("fit")], style })
        : h("div", { "data-slot": "image", role: "img", "aria-label": p.s("alt") || undefined, className: "bg-surface-container-high text-outline flex items-center justify-center", style }, ic("image", { className: "size-8" }));
    },
  },
  {
    slug: "icon-button",
    appearance: { radius: 20 },
    name: "Icon button",
    labels: { ja: "アイコンボタン", zh: "图标按钮", ko: "아이콘 버튼" },
    category: "Controls",
    icon: "radio_button_unchecked",
    w: 40,
    h: 40,
    props: [
      { key: "icon", label: "Icon", kind: "icon", default: "favorite" },
      { key: "label", label: "Name for screen readers", labels: { ja: "読み上げ名", zh: "读屏名称", ko: "스크린 리더 이름" }, kind: "text", default: "Favorite", defaults: { zh: "收藏" } },
      { key: "variant", label: "Variant", kind: "enum", default: "text", options: ["filled", "tonal", "elevated", "outlined", "text", "ghost"] },
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "default", options: Object.keys(ICON_BUTTON_SIZES) },
      { key: "disabled", label: "Disabled", labels: { zh: "禁用" }, kind: "bool", default: false },
      { key: "iconFill", label: "Filled icon", labels: { ja: "塗りのアイコン", zh: "实心图标", ko: "채운 아이콘" }, kind: "bool", default: false },
    ],
    tree: (p) => h("Button", { variant: p.s("variant"), size: ICON_BUTTON_SIZES[p.s("size")], "aria-label": p.s("label"), disabled: p.b("disabled") || undefined }, p.s("icon") ? ic(p.s("icon"), p.b("iconFill") ? { fill: true } : undefined) : null),
    guess: (p) => {
      const side = ICON_BUTTON_DP[p.s("size")] ?? 40;
      return { w: side, h: side };
    },
  },
  {
    slug: "custom",
    appearance: { radius: 12 },
    name: "Custom component",
    labels: { ja: "カスタムコンポーネント", zh: "自定义组件", ko: "사용자 정의 구성 요소" },
    category: "Layout",
    icon: "extension",
    w: 320,
    h: 160,
    holds: true,
    flow: { inset: (p) => ({ t: p.s("description") ? 56 : 32 }) },
    props: [
      { key: "name", label: "Name", labels: { ja: "名前", zh: "名称", ko: "이름" }, kind: "text", default: "Custom component", defaults: { zh: "自定义组件" } },
      { key: "description", label: "What it does", labels: { ja: "何をするか", zh: "它做什么", ko: "하는 일" }, kind: "text", default: "Describe what goes here.", defaults: { zh: "说明这里放什么。" }, multiline: true },
      ...FLOW_PROPS,
      WIDTH(320, 40, 2400),
      { key: "height", label: "Height", kind: "number", default: 160, min: 40, max: 2400, step: 4, unit: "px" },
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "custom", className: "border-primary bg-primary-container/30 flex flex-col items-start gap-1 overflow-hidden rounded-xl border-2 border-dashed p-3", style: { width: px(p), height: px(p, "height") } },
        h("div", { className: "text-title-small text-on-surface flex items-center gap-1" }, ic("extension", { className: "size-4" }), p.s("name")),
        p.s("description") && h("div", { className: "text-body-small text-on-surface-variant" }, p.s("description")),
      ),
  },
  {
    slug: "window",
    appearance: { radius: 12 },
    name: "Window",
    labels: { ja: "ウィンドウ", zh: "窗口", ko: "창" },
    category: "Desktop",
    icon: "web_asset",
    w: 640,
    h: 400,
    holds: true,
    flow: { inset: () => ({ t: 36 }) },
    props: [
      { key: "title", label: "Title", kind: "text", default: "Window", defaults: { zh: "窗口" } },
      { key: "controls", label: "Window controls", labels: { ja: "ウィンドウ操作", zh: "窗口按钮", ko: "창 버튼" }, kind: "enum", default: "mac", options: ["mac", "windows", "none"] },
      ...FLOW_PROPS,
      WIDTH(640, 200, 2400),
      { key: "height", label: "Height", kind: "number", default: 400, min: 120, max: 2400, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const controls = p.s("controls");
      return h(
        "div",
        { "data-slot": "window", className: "bg-surface border-outline-variant flex flex-col overflow-hidden rounded-xl border", style: { width: px(p), height: px(p, "height") } },
        h("div", { "data-slot": "title-bar", "data-controls": controls, className: "bg-surface-container flex h-9 shrink-0 items-center gap-3 px-3" }, ...windowBar(controls, p.s("title"))),
        h("div", { "data-flow": "body", className: "min-h-0 flex-1" }),
      );
    },
  },

  /* ---------- picking and entering ---------- */
  {
    slug: "tag-input",
    appearance: { radius: 12 },
    name: "Tag input",
    labels: { ja: "タグ入力", zh: "标签输入", ko: "태그 입력" },
    category: "Forms",
    icon: "new_label",
    w: 320,
    h: 104,
    props: [
      { key: "items", label: "Tags", labels: { ja: "タグ", zh: "标签", ko: "태그" }, kind: "list", default: [{ label: "Design" }, { label: "Prototype" }], max: 20 },
      { key: "placeholder", label: "Placeholder", labels: { ja: "プレースホルダー", zh: "占位文字", ko: "자리표시자" }, kind: "text", default: "Add a tag", defaults: { zh: "添加标签" } },
      WIDTH(320, 160),
    ],
    tree: (p) => h("TagInput", { items: words(p.list("items")), placeholder: p.s("placeholder"), width: px(p) }),
  },
  {
    slug: "phone-input",
    appearance: { radius: 4 },
    name: "Phone number",
    labels: { ja: "電話番号", zh: "手机号输入", ko: "전화번호" },
    category: "Forms",
    icon: "call",
    w: 320,
    h: 56,
    props: [
      { key: "code", label: "Country code", labels: { ja: "国番号", zh: "国家区号", ko: "국가 코드" }, kind: "text", default: "+86" },
      { key: "placeholder", label: "Placeholder", labels: { ja: "プレースホルダー", zh: "占位文字", ko: "자리표시자" }, kind: "text", default: "Phone number", defaults: { zh: "手机号" } },
      WIDTH(320, 160, 640),
    ],
    tree: (p) => h("InputGroup", { "data-slot": "phone-input", style: { width: px(p) } }, h("InputGroupAddon", null, h("InputGroupText", null, p.s("code"))), h("InputGroupInput", { type: "tel", placeholder: p.s("placeholder") || undefined })),
  },
  {
    slug: "file-upload",
    appearance: { radius: 16 },
    name: "File upload",
    labels: { ja: "ファイルアップロード", zh: "文件上传", ko: "파일 업로드" },
    category: "Forms",
    icon: "upload_file",
    w: 360,
    h: 176,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Drop files here", defaults: { zh: "把文件拖到这里" } },
      { key: "hint", label: "Hint", labels: { ja: "ヒント", zh: "提示", ko: "힌트" }, kind: "text", default: "Up to 10 MB each", defaults: { zh: "每个不超过 10 MB" } },
      { key: "action", label: "Button", labels: { ja: "ボタン", zh: "按钮文字", ko: "버튼" }, kind: "text", default: "Choose files", defaults: { zh: "选择文件" } },
      { key: "multiple", label: "Several files", labels: { ja: "複数ファイル", zh: "可选多个", ko: "여러 파일" }, kind: "bool", default: true },
      { key: "accept", label: "File types", labels: { ja: "ファイル形式", zh: "文件类型", ko: "파일 형식" }, kind: "text", default: "" },
      WIDTH(360, 200, 800),
    ],
    tree: (p) => h("FileUpload", { title: p.s("title"), hint: p.s("hint"), action: p.s("action"), multiple: p.b("multiple"), accept: p.s("accept"), width: px(p) }),
  },
  {
    slug: "item-picker",
    appearance: { radius: 12 },
    name: "Item picker",
    labels: { ja: "アイテムピッカー", zh: "图标选择", ko: "항목 선택" },
    category: "Pickers",
    icon: "apps",
    w: 320,
    h: 168,
    props: [
      { key: "items", label: "Options", labels: { zh: "选项" }, kind: "list", icons: true, default: [{ label: "Home", icon: "home" }, { label: "Work", icon: "work" }, { label: "Travel", icon: "flight" }, { label: "Food", icon: "restaurant" }], min: 1, max: 24 },
      { key: "columns", label: "Columns", labels: { ja: "列", zh: "列数", ko: "열" }, kind: "number", default: 4, min: 1, max: 8, step: 1 },
      { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 23, step: 1 },
      WIDTH(320, 120, 800),
    ],
    selectKey: "selected",
    tree: (p) => h("ItemPicker", { items: p.list("items").map((x) => ({ label: x.label, ...(x.icon ? { icon: x.icon } : {}) })), columns: Math.round(p.n("columns")), selected: Math.round(p.n("selected")), width: px(p) }),
  },
  {
    slug: "multi-select",
    appearance: { radius: 12 },
    name: "Multiple choice",
    labels: { ja: "複数選択", zh: "多选", ko: "다중 선택" },
    category: "Pickers",
    icon: "checklist",
    w: 320,
    h: 80,
    props: [
      { key: "items", label: "Options", labels: { zh: "选项" }, kind: "list", default: [{ label: "Email" }, { label: "Push" }, { label: "SMS" }], min: 1, max: 24 },
      { key: "selected", label: "Selected rows (1,3)", labels: { ja: "選択中の行（1,3）", zh: "选中第几项（如 1,3）", ko: "선택한 행 (1,3)" }, kind: "text", default: "1" },
      WIDTH(320, 120, 800),
    ],
    tree: (p) => h("MultiSelect", { items: words(p.list("items")), selected: p.s("selected").split(",").map((x) => Number(x) - 1).filter((n) => Number.isInteger(n) && n >= 0), width: px(p) }),
  },
  {
    slug: "color-palette",
    appearance: { radius: 12 },
    name: "Color palette",
    labels: { ja: "カラーパレット", zh: "调色板", ko: "색상 팔레트" },
    category: "Pickers",
    icon: "palette",
    w: 320,
    h: 96,
    props: [
      { key: "colors", label: "Colors (comma separated)", labels: { ja: "色（カンマ区切り）", zh: "颜色（逗号分隔）", ko: "색상 (쉼표로 구분)" }, kind: "text", default: "#6750A4,#625B71,#7D5260,#B3261E,#386A20,#006A6A" },
      { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 63, step: 1 },
      WIDTH(320, 120, 800),
    ],
    tree: (p) => h("ColorPalette", { colors: p.s("colors").split(",").map((x) => x.trim()), selected: Math.round(p.n("selected")), width: px(p) }),
  },
  {
    slug: "number-picker",
    appearance: { radius: 12 },
    name: "Number picker",
    labels: { ja: "数値ピッカー", zh: "数字选择器", ko: "숫자 선택기" },
    category: "Pickers",
    icon: "pin",
    w: 96,
    h: 200,
    props: [
      { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "number", default: 5, min: -100000, max: 100000, step: 1 },
      { key: "min", label: "Minimum", labels: { ja: "最小", zh: "最小值", ko: "최소" }, kind: "number", default: 0, min: -100000, max: 100000, step: 1 },
      { key: "max", label: "Maximum", labels: { ja: "最大", zh: "最大值", ko: "최대" }, kind: "number", default: 10, min: -100000, max: 100000, step: 1 },
      { key: "step", label: "Step", labels: { ja: "刻み", zh: "步长", ko: "단계" }, kind: "number", default: 1, min: 1, max: 1000, step: 1 },
      { key: "unit", label: "Unit", labels: { ja: "単位", zh: "单位", ko: "단위" }, kind: "text", default: "" },
      WIDTH(96, 56, 240),
    ],
    tree: (p) => h("NumberPicker", { value: Math.round(p.n("value")), min: Math.round(p.n("min")), max: Math.round(p.n("max")), step: Math.round(p.n("step")), unit: p.s("unit"), width: px(p) }),
  },

  /* ---------- getting around ---------- */
  {
    slug: "floating-nav",
    appearance: { radius: 999 },
    name: "Floating navigation",
    labels: { ja: "フローティングナビ", zh: "悬浮导航栏", ko: "플로팅 내비게이션" },
    category: "Navigation",
    icon: "bottom_navigation",
    role: "floatingBottom",
    w: 320,
    h: 64,
    props: [
      { key: "items", label: "Destinations", labels: { ja: "行き先", zh: "目的地", ko: "목적지" }, kind: "list", icons: true, default: [{ label: "Home", icon: "home" }, { label: "Search", icon: "search" }, { label: "Saved", icon: "favorite" }], min: 2, max: 5 },
      { key: "selected", label: "Selected", labels: { ja: "選択中", zh: "选中项", ko: "선택" }, kind: "number", default: 0, min: 0, max: 4, step: 1 },
      WIDTH(320, 200, 800),
    ],
    slots: (p) => listSlots(p.list("items")),
    selectKey: "selected",
    tree: (p) =>
      h(
        "NavigationBar",
        { "data-slot": "floating-nav", className: "shadow-elevation-3 overflow-hidden rounded-full", style: { width: px(p) } },
        ...p.list("items").map((it, i) => h("NavigationBarItem", { icon: it.icon || "circle", label: it.label, active: i === p.n("selected") || undefined, "data-tap": `tab:${i}` })),
      ),
  },
  {
    slug: "cascading-menu",
    appearance: { target: ["DropdownMenuContent", "DropdownMenuSubContent"], radius: 4 },
    name: "Cascading menu",
    labels: { ja: "カスケードメニュー", zh: "级联菜单", ko: "계단식 메뉴" },
    category: "Menus & search",
    icon: "subdirectory_arrow_right",
    w: 120,
    h: 40,
    props: [
      { key: "label", label: "Trigger label", labels: { ja: "トリガー", zh: "按钮文字", ko: "트리거" }, kind: "text", default: "Open menu", defaults: { zh: "打开菜单" } },
      { key: "items", label: "Items", labels: { ja: "項目", zh: "菜单项", ko: "항목" }, kind: "list", icons: true, default: [{ label: "Edit", icon: "edit" }, { label: "Share", icon: "share" }], min: 1, max: 8 },
      { key: "subLabel", label: "Submenu", labels: { ja: "サブメニュー", zh: "子菜单", ko: "하위 메뉴" }, kind: "text", default: "More", defaults: { zh: "更多" } },
      { key: "subItems", label: "Submenu items", labels: { ja: "サブメニュー項目", zh: "子菜单项", ko: "하위 메뉴 항목" }, kind: "list", default: [{ label: "Sort" }, { label: "Filter" }], min: 1, max: 8 },
    ],
    open: { box: (p) => ({ w: 460, h: 40 + 8 + (p.list("items").length + 1) * 44 + 28 }) },
    tree: (p) =>
      h(
        "DropdownMenu",
        null,
        h("DropdownMenuTrigger", { render: h("Button", { variant: "outlined" }) }, p.s("label")),
        h(
          "DropdownMenuContent",
          { className: "w-56" },
          ...p.list("items").map((it) => h("DropdownMenuItem", null, it.icon ? ic(it.icon) : null, it.label)),
          h("DropdownMenuSub", null, h("DropdownMenuSubTrigger", null, p.s("subLabel")), h("DropdownMenuSubContent", null, ...p.list("subItems").map((it) => h("DropdownMenuItem", null, it.label)))),
        ),
      ),
  },
  {
    slug: "mini-program-header",
    appearance: { radius: 0 },
    name: "Mini program header",
    labels: { ja: "ミニプログラムヘッダー", zh: "小程序导航栏", ko: "미니 프로그램 헤더" },
    category: "Navigation",
    icon: "more_horiz",
    role: "top",
    w: 412,
    h: 56,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Title", defaults: { zh: "标题" } },
      { key: "back", label: "Back button", labels: { ja: "戻るボタン", zh: "返回按钮", ko: "뒤로 버튼" }, kind: "bool", default: true },
      WIDTH(412, 240, 1280),
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "mini-program-header", className: "bg-surface text-on-surface relative flex h-14 items-center justify-between px-2", style: { width: px(p) } },
        p.b("back") ? h("Button", { variant: "text", size: "icon", "aria-label": p.say("Back") }, ic("arrow_back")) : h("span"),
        h("div", { "data-slot": "mini-program-header-title", className: "text-title-medium absolute inset-x-24 truncate text-center" }, p.s("title")),
        h("div", { "data-slot": "mini-program-header-capsule", className: "border-outline-variant flex h-8 items-center gap-2 rounded-full border px-2" }, ic("more_horiz", { className: "size-5" }), h("span", { className: "bg-outline-variant h-4 w-px" }), ic("radio_button_checked", { className: "size-5" })),
      ),
  },
  {
    slug: "toc",
    appearance: { radius: 12 },
    name: "Table of contents",
    labels: { ja: "目次", zh: "目录", ko: "목차" },
    category: "Navigation",
    icon: "toc",
    w: 220,
    h: 160,
    props: [
      { key: "title", label: "Title", kind: "text", default: "On this page", defaults: { zh: "本页内容" } },
      { key: "items", label: "Headings (two spaces: a level down)", labels: { ja: "見出し（空白 2 つで一段下）", zh: "标题（开头两个空格为下一级）", ko: "제목 (공백 두 칸: 한 단계 아래)" }, kind: "list", default: [{ label: "Overview" }, { label: "  Install" }, { label: "  Usage" }, { label: "API" }], min: 1, max: 40 },
      { key: "selected", label: "Current", labels: { ja: "現在", zh: "当前项", ko: "현재" }, kind: "number", default: 0, min: 0, max: 39, step: 1 },
      WIDTH(220, 120, 480),
    ],
    selectKey: "selected",
    slots: (p) => p.list("items").map((it, i) => ({ key: `tab:${i}`, label: it.label.trim() || `${i + 1}` })),
    tree: (p) =>
      h(
        "nav",
        { "data-slot": "toc", className: "flex flex-col gap-1", style: { width: px(p) } },
        p.s("title") && h("div", { className: "text-title-small text-on-surface" }, p.s("title")),
        ...p.list("items").map((it, i) => h("div", { "data-tap": `tab:${i}`, "data-active": i === p.n("selected") ? "true" : undefined, className: `text-body-medium truncate rounded py-1 ${it.label.startsWith("  ") ? "pl-6" : "pl-3"} ${i === p.n("selected") ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant"}` }, it.label.trim())),
      ),
  },
  {
    slug: "slide-group",
    appearance: { radius: 12 },
    name: "Slide group",
    labels: { ja: "スライドグループ", zh: "横向滑动组", ko: "슬라이드 그룹" },
    category: "Navigation",
    icon: "view_carousel",
    w: 320,
    h: 40,
    props: [
      { key: "items", label: "Items", labels: { ja: "項目", zh: "项目", ko: "항목" }, kind: "list", default: [{ label: "All" }, { label: "Music" }, { label: "Podcasts" }, { label: "Live" }, { label: "News" }, { label: "Sports" }], min: 1, max: 30 },
      WIDTH(320, 160),
    ],
    tree: (p) => h("SlideGroup", { items: words(p.list("items")), width: px(p) }),
  },

  /* ---------- saying what is going on ---------- */
  {
    slug: "pull-to-refresh",
    appearance: { radius: 12 },
    name: "Pull to refresh",
    labels: { ja: "引っ張って更新", zh: "下拉刷新", ko: "당겨서 새로고침" },
    category: "Feedback",
    icon: "refresh",
    w: 360,
    h: 200,
    props: [
      { key: "hint", label: "Hint", labels: { ja: "ヒント", zh: "提示", ko: "힌트" }, kind: "text", default: "Pull down to refresh", defaults: { zh: "下拉刷新" } },
      WIDTH(360, 160, 800),
      { key: "height", label: "Height", kind: "number", default: 200, min: 80, max: 1200, step: 4, unit: "px" },
    ],
    tree: (p) => h("PullToRefresh", { hint: p.s("hint"), width: px(p), height: px(p, "height") }),
  },
  {
    slug: "typing-indicator",
    appearance: { radius: 12 },
    name: "Typing indicator",
    labels: { ja: "入力中インジケーター", zh: "正在输入", ko: "입력 중 표시" },
    category: "Indicators",
    icon: "more_horiz",
    w: 72,
    h: 32,
    props: [{ key: "label", label: "Label", kind: "text", default: "" }],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "typing-indicator", role: "status", className: "bg-surface-container-high text-body-small text-on-surface-variant inline-flex h-8 items-center gap-1 rounded-full px-3" },
        ...[0, 200, 400].map((delay) => h("span", { className: "bg-on-surface-variant size-1.5 animate-pulse rounded-full", style: { animationDelay: `${delay}ms` } })),
        p.s("label") && h("span", { className: "ml-1" }, p.s("label")),
      ),
  },
  {
    slug: "number-ticker",
    appearance: { radius: 8 },
    name: "Number ticker",
    labels: { ja: "数値カウンター", zh: "数字滚动", ko: "숫자 카운터" },
    category: "Feedback",
    icon: "looks_one",
    w: 120,
    h: 40,
    props: [
      { key: "value", label: "Value", labels: { ja: "値", zh: "数值", ko: "값" }, kind: "number", default: 1280, min: -1000000000, max: 1000000000, step: 1 },
      { key: "prefix", label: "Before", labels: { ja: "前", zh: "前缀", ko: "앞" }, kind: "text", default: "" },
      { key: "suffix", label: "After", labels: { ja: "後", zh: "后缀", ko: "뒤" }, kind: "text", default: "" },
      { key: "size", label: "Size", labels: { zh: "尺寸" }, kind: "enum", default: "headline", options: ["title", "headline", "display"] },
    ],
    tree: (p) => h("NumberTicker", { value: Math.round(p.n("value")), prefix: p.s("prefix"), suffix: p.s("suffix"), size: p.s("size") }),
  },
  {
    slug: "timer",
    appearance: { radius: 16 },
    name: "Timer",
    labels: { ja: "タイマー", zh: "计时器", ko: "타이머" },
    category: "Feedback",
    icon: "timer",
    w: 200,
    h: 64,
    props: [
      { key: "seconds", label: "Seconds", labels: { ja: "秒", zh: "秒数", ko: "초" }, kind: "number", default: 60, min: 1, max: 86400, step: 1 },
      { key: "countdown", label: "Count down", labels: { ja: "カウントダウン", zh: "倒计时", ko: "카운트다운" }, kind: "bool", default: true },
      WIDTH(200, 160, 480),
    ],
    tree: (p) => h("Timer", { seconds: Math.round(p.n("seconds")), countdown: p.b("countdown"), width: px(p) }),
  },

  /* ---------- rows and records ---------- */
  {
    slug: "timeline",
    appearance: { radius: 12 },
    name: "Timeline",
    labels: { ja: "タイムライン", zh: "时间线", ko: "타임라인" },
    category: "Lists",
    icon: "timeline",
    w: 360,
    h: 220,
    props: [
      { key: "data", label: "Events", labels: { ja: "イベント", zh: "事件", ko: "이벤트" }, kind: "table", default: EVENTS },
      { key: "current", label: "Current event", labels: { ja: "現在のイベント", zh: "当前事件", ko: "현재 이벤트" }, kind: "number", default: 2, min: 0, max: 100, step: 1 },
      WIDTH(360, 160, 960),
    ],
    tree: (p) => {
      const { rows } = p.table("data");
      const current = Math.round(p.n("current"));
      return h(
        "ol",
        { "data-slot": "timeline", className: "flex flex-col", style: { width: px(p) } },
        ...rows.map((row, i) =>
          h(
            "li",
            { "data-current": i === current ? "true" : undefined, className: "flex gap-3" },
            h("div", { className: "flex flex-col items-center" }, h("span", { className: `mt-1 size-3 shrink-0 rounded-full ${i <= current ? "bg-primary" : "bg-outline-variant"}` }), i < rows.length - 1 && h("span", { className: `w-0.5 flex-1 ${i < current ? "bg-primary" : "bg-outline-variant"}` })),
            h("div", { className: "flex min-w-0 flex-1 flex-col pb-4" }, h("span", { className: "text-label-small text-on-surface-variant" }, row[0] ?? ""), h("span", { className: "text-body-large text-on-surface" }, row[1] ?? ""), row[2] ? h("span", { className: "text-body-small text-on-surface-variant" }, row[2]) : null),
          ),
        ),
      );
    },
  },
  {
    slug: "tracker",
    appearance: { radius: 12 },
    name: "Status tracker",
    labels: { ja: "ステータストラッカー", zh: "状态条", ko: "상태 트래커" },
    category: "Lists",
    icon: "bar_chart_4_bars",
    w: 360,
    h: 64,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Uptime", defaults: { zh: "运行状态" } },
      { key: "states", label: "States: ok, warn, bad, none", labels: { ja: "状態：ok, warn, bad, none", zh: "状态：ok、warn、bad、none", ko: "상태: ok, warn, bad, none" }, kind: "text", default: "ok,ok,ok,warn,ok,ok,bad,ok,ok,ok,ok,none" },
      WIDTH(360, 120, 1280),
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "tracker", className: "flex flex-col gap-2", style: { width: px(p) } },
        p.s("title") && h("div", { className: "text-title-small text-on-surface" }, p.s("title")),
        h("div", { className: "flex h-8 gap-1" }, ...p.s("states").split(",").map((state) => h("span", { className: `min-w-0 flex-1 rounded-sm ${TRACK[state.trim()] ?? TRACK.none}`, "data-state": state.trim() }))),
      ),
  },
  {
    slug: "code-block",
    appearance: { radius: 12 },
    name: "Code block",
    labels: { ja: "コードブロック", zh: "代码块", ko: "코드 블록" },
    category: "Desktop",
    icon: "code",
    w: 420,
    h: 160,
    props: [
      { key: "code", label: "Code", labels: { ja: "コード", zh: "代码", ko: "코드" }, kind: "text", default: "const greeting = \"Hello\";\nconsole.log(greeting);", multiline: true },
      { key: "language", label: "Language", labels: { ja: "言語", zh: "语言", ko: "언어" }, kind: "text", default: "TypeScript" },
      WIDTH(420, 200),
    ],
    tree: (p) => h("CodeBlock", { code: p.s("code"), language: p.s("language"), width: px(p) }),
  },
  {
    slug: "markdown",
    appearance: { radius: 12 },
    name: "Markdown",
    labels: { ja: "マークダウン", zh: "Markdown 文档", ko: "마크다운" },
    category: "Data & charts",
    icon: "article",
    w: 420,
    h: 200,
    props: [
      { key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "# Heading\n\nSome **bold** text with `code`.\n\n- First\n- Second\n\n> A note", multiline: true },
      WIDTH(420, 160, 1280),
    ],
    tree: (p) => h("Markdown", { text: p.s("text"), width: px(p) }),
  },
  {
    slug: "file-diff",
    appearance: { radius: 12 },
    name: "File diff",
    labels: { ja: "ファイル差分", zh: "文件差异", ko: "파일 차이" },
    category: "Desktop",
    icon: "difference",
    w: 420,
    h: 160,
    props: [
      { key: "file", label: "File", labels: { ja: "ファイル", zh: "文件", ko: "파일" }, kind: "text", default: "main.ts" },
      { key: "diff", label: "Lines (+ added, - removed)", labels: { ja: "行（+ 追加、- 削除）", zh: "内容（+ 新增，- 删除）", ko: "줄 (+ 추가, - 삭제)" }, kind: "text", default: " const a = 1;\n-const b = 2;\n+const b = 3;\n console.log(a + b);", multiline: true },
      WIDTH(420, 200),
    ],
    tree: (p) =>
      h(
        "div",
        { "data-slot": "file-diff", className: "border-outline-variant overflow-hidden rounded-xl border", style: { width: px(p) } },
        p.s("file") && h("div", { "data-slot": "file-diff-header", className: "bg-surface-container text-label-medium text-on-surface px-3 py-2" }, p.s("file")),
        h("pre", { className: "text-body-small overflow-x-auto font-mono" }, ...p.s("diff").split("\n").map((line) => h("div", { "data-slot": "file-diff-row", "data-kind": line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : "same", className: `px-3 ${line.startsWith("+") ? "bg-primary-container text-on-primary-container" : line.startsWith("-") ? "bg-error-container text-on-error-container" : "text-on-surface"}` }, line || " "))),
      ),
  },
  {
    slug: "sortable-list",
    appearance: { radius: 12 },
    name: "Sortable list",
    labels: { ja: "並べ替えリスト", zh: "可排序列表", ko: "정렬 가능한 목록" },
    category: "Lists",
    icon: "drag_indicator",
    w: 320,
    h: 176,
    props: [
      { key: "items", label: "Rows", labels: { ja: "行", zh: "行", ko: "행" }, kind: "list", default: [{ label: "First" }, { label: "Second" }, { label: "Third" }], min: 1, max: 30 },
      WIDTH(320, 160, 800),
    ],
    tree: (p) => h("SortableList", { items: words(p.list("items")), width: px(p) }),
  },
  {
    slug: "swipe-row",
    appearance: { radius: 12 },
    name: "Swipe row",
    labels: { ja: "スワイプ行", zh: "左滑操作行", ko: "스와이프 행" },
    category: "Lists",
    icon: "swipe_left",
    w: 360,
    h: 64,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Swipe me left", defaults: { zh: "向左滑动" } },
      { key: "note", label: "Description", labels: { ja: "説明", zh: "说明", ko: "설명" }, kind: "text", default: "" },
      { key: "action", label: "Action", labels: { ja: "操作", zh: "操作", ko: "작업" }, kind: "text", default: "Delete", defaults: { zh: "删除" } },
      WIDTH(360, 160, 800),
    ],
    tree: (p) => h("SwipeRow", { title: p.s("title"), note: p.s("note"), action: p.s("action"), width: px(p) }),
  },

  /* ---------- sound and movement ---------- */
  {
    slug: "audio-player",
    appearance: { radius: 16 },
    name: "Audio player",
    labels: { ja: "オーディオプレーヤー", zh: "音频播放器", ko: "오디오 플레이어" },
    category: "Media",
    icon: "music_note",
    w: 360,
    h: 96,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Song title", defaults: { zh: "歌曲名" } },
      { key: "artist", label: "Artist", labels: { ja: "アーティスト", zh: "艺术家", ko: "아티스트" }, kind: "text", default: "Artist", defaults: { zh: "艺术家" } },
      { key: "src", label: "Audio address", labels: { ja: "音声のアドレス", zh: "音频地址", ko: "오디오 주소" }, kind: "text", default: "" },
      { key: "seconds", label: "Length in seconds", labels: { ja: "長さ（秒）", zh: "时长（秒）", ko: "길이(초)" }, kind: "number", default: 180, min: 1, max: 36000, step: 1 },
      WIDTH(360, 200, 800),
    ],
    tree: (p) => h("AudioPlayer", { title: p.s("title"), artist: p.s("artist"), src: p.s("src"), seconds: Math.round(p.n("seconds")), width: px(p) }),
  },
  {
    slug: "marquee",
    appearance: { radius: 4 },
    name: "Marquee",
    labels: { ja: "マーキー", zh: "跑马灯", ko: "마키" },
    category: "Media",
    icon: "text_rotation_none",
    w: 320,
    h: 24,
    props: [
      { key: "text", label: "Text", labels: { ja: "テキスト", zh: "文字", ko: "텍스트" }, kind: "text", default: "A line that keeps moving past.", defaults: { zh: "一行不断滚动的文字。" } },
      { key: "seconds", label: "Seconds per pass", labels: { ja: "一周の秒数", zh: "每轮秒数", ko: "한 바퀴 초" }, kind: "number", default: 12, min: 2, max: 120, step: 1 },
      WIDTH(320, 80, 1600),
    ],
    tree: (p) => h("Marquee", { text: p.s("text"), seconds: Math.round(p.n("seconds")), width: px(p) }),
  },
];
