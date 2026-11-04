import type { ListItem, PropValues, TableData } from "../types";
import type { DialectKind, LegacyKind } from "./types";

export type { DialectKind };

/* Reading parts as forks saved them. The shapes here come from fixtures/fork-items.json, which is
 * what each fork's own makeItem builds; a field a fork leaves out falls back to the part's default. */

type Saved = Record<string, unknown>;

export const text = (item: Saved, key: string) => (typeof item[key] === "string" && item[key] ? (item[key] as string) : undefined);
export const num = (item: Saved, key: string) => (typeof item[key] === "number" && Number.isFinite(item[key]) ? (item[key] as number) : undefined);

/** a text prop as it was saved, empty or not: an author's blank stays blank */
export const kept = (item: Saved, key: string) => (typeof item[key] === "string" ? (item[key] as string) : undefined);

/** the props with the ones a fork did not have left out */
export const defined = (props: PropValues): PropValues => Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));

/** the GPUI canvas names its icons after its Rust kit's set; where the names differ */
const LUCIDE: Record<string, string> = {
  "chart-pie": "pie_chart", "circle-check": "check_circle", "circle-user": "account_circle", "external-link": "open_in_new", "file-text": "description", "folder-closed": "folder", "folder-open": "folder_open", "layout-dashboard": "dashboard", "triangle-alert": "warning",
  copy: "content_copy", ellipsis: "more_horiz", file: "draft",
  /* a name Material Symbols has since retired, which draws nothing if asked for */
  emoji_events: "trophy",
};

/** SF Symbols the iOS forks use, in Material's words; another one is drawn without its icon */
const SF: Record<string, string> = {
  calendar: "calendar_month", tray: "inbox", gear: "settings", house: "home", "house.fill": "home", heart: "favorite", lightbulb: "lightbulb", magnifyingglass: "search", "music.note": "music_note", person: "person", "photo.on.rectangle": "photo_library", plus: "add", star: "star", textformat: "text_fields", trash: "delete", "arrow.up.arrow.down": "swap_vert", "chevron.left": "chevron_left", "square.and.arrow.up": "share",
};

/** forks name icons in their own sets (`sf:calendar`, `chart-pie`); only a Material Symbols name can be drawn here */
export const materialIcon = (icon: unknown) => {
  if (typeof icon !== "string") return undefined;
  if (icon.startsWith("sf:")) return SF[icon.slice(3)];
  const name = LUCIDE[icon] ?? icon;
  return /^[a-z0-9_]+$/.test(name) ? name : undefined;
};

/** the entries of a bar, a menu or a list */
export function rows(item: Saved): ListItem[] | undefined {
  if (!Array.isArray(item.tabs) || item.tabs.length === 0) return undefined;
  return item.tabs.map((t: { label?: unknown; icon?: unknown }) => {
    const icon = materialIcon(t?.icon);
    return { label: String(t?.label ?? ""), ...(icon ? { icon } : {}) };
  });
}

/** Three forks save a table three ways: GPUI has tab-separated rows in `tabs` and its names in
 *  `columns`, the desktop fork a whole tab-separated table in `supporting`, the dashboard fork only
 *  its column names in `tabs`, with no rows at all. */
export function tableOf(item: Saved): TableData | undefined {
  const tsv = (lines: string[]) => lines.map((l) => l.split("\t"));
  const supporting = text(item, "supporting");
  if (supporting?.includes("\t")) {
    const [columns, ...data] = tsv(supporting.split("\n"));
    return { columns, rows: data };
  }
  const labels = rows(item)?.map((r) => r.label);
  if (!labels) return undefined;
  if (labels.some((l) => l.includes("\t"))) {
    const data = tsv(labels);
    const names = Array.isArray(item.columns) ? item.columns.map((c: unknown) => String(typeof c === "object" && c !== null ? ((c as { label?: unknown }).label ?? "") : c)) : [];
    return { columns: data[0].map((_, i) => names[i] || `${i + 1}`), rows: data };
  }
  return { columns: labels, rows: [labels.map(() => "")] };
}

/* ---------- dialects ---------- */

/** the variants only the GPUI canvas saves */
const GPUI_VARIANTS = new Set(["default", "ghost", "outline", "danger", "success", "primary", "secondary", "warning", "info"]);

/** Which fork's vocabulary a saved part speaks, when the name alone cannot say. Miuix measures parts
 *  in `w` and `h`; everything GPUI saves has a variant of its own set. */
export function dialectOf(item: Saved): "gpui" | "miuix" | "swiftui" | undefined {
  /* a SwiftUI project says so when it is opened: its parts have no other mark of their own */
  if (item.dialect === "swiftui") return "swiftui";
  if (typeof item.w === "number" && typeof item.h === "number") return "miuix";
  return typeof item.variant === "string" && GPUI_VARIANTS.has(item.variant) ? "gpui" : undefined;
}

const iconOf = (it: Saved) => materialIcon(it.icon);
const bool = (it: Saved, key: string) => (typeof it[key] === "boolean" ? (it[key] as boolean) : undefined);
const GPUI_BUTTON: Record<string, string> = { default: "tonal", primary: "filled", secondary: "tonal", outline: "outlined", ghost: "text", danger: "filled", success: "filled", warning: "filled", info: "tonal" };
const gpuiButton = (it: Saved) => GPUI_BUTTON[String(it.variant)];

const GPUI: Record<string, DialectKind> = {
  button: { slug: "button", props: (it) => defined({ label: text(it, "label"), icon: iconOf(it), variant: gpuiButton(it), size: "sm" }) },
  iconButton: { slug: "button", props: (it) => defined({ label: "", icon: iconOf(it), variant: gpuiButton(it), size: "sm" }) },
  buttonGroup: { slug: "button-group", props: (it) => defined({ items: rows(it), buttonVariant: gpuiButton(it) }) },
  select: { slug: "select", props: (it) => defined({ placeholder: text(it, "label"), items: rows(it), selected: -1 }) },
  checkbox: { slug: "checkbox", props: (it) => defined({ label: text(it, "label"), checked: bool(it, "checked") }) },
  radio: { slug: "radio-group", props: (it) => defined({ items: rows(it), selected: num(it, "value") }) },
  switch: { slug: "switch", props: (it) => defined({ label: text(it, "label"), checked: bool(it, "checked") }) },
  slider: { slug: "slider", props: (it) => defined({ value: num(it, "value"), width: num(it, "size") }) },
  tabs: { slug: "tabs", props: (it) => defined({ items: rows(it), selected: num(it, "value"), width: num(it, "size") }) },
  toolbar: { slug: "toolbar", props: (it) => defined({ items: rows(it) }) },
  dialog: { slug: "dialog", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), confirm: text(it, "confirm"), dialogWidth: num(it, "size") }) },
  datePicker: { slug: "date-picker", props: (it) => defined({ placeholder: text(it, "label") }) },
  calendar: { slug: "calendar", props: () => ({}) },
  /* the part's seed text would read as the author's own */
  list: { slug: "item", props: (it) => defined({ items: rows(it), description: "", width: num(it, "size") }) },
  settings: { slug: "item", props: (it) => defined({ items: rows(it), description: "", trailing: "switch", width: num(it, "size") }) },
  icon: { slug: "icon", props: (it) => defined({ name: iconOf(it), size: num(it, "size") }) },
  tag: { slug: "chip", props: (it) => { const label = text(it, "label"); return label ? { items: [{ label }] } : {}; } },
  notification: { slug: "alert", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), icon: iconOf(it), width: num(it, "size") }) },
  hoverCard: { slug: "hover-card", props: (it) => defined({ trigger: text(it, "label"), title: text(it, "label"), description: text(it, "supporting") }) },
  command: { slug: "command", props: (it) => defined({ placeholder: text(it, "label"), items: rows(it), width: num(it, "size") }) },
  attachment: { slug: "attachment", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), icon: iconOf(it) }) },
  marker: { slug: "marker", props: (it) => defined({ text: text(it, "label") }) },
  bubble: { slug: "bubble", props: (it) => defined({ text: text(it, "label"), align: it.side === "right" ? "end" : "start", width: num(it, "size") }) },
  message: { slug: "message", props: (it) => defined({ header: text(it, "label"), text: text(it, "supporting"), align: it.side === "right" ? "end" : "start", width: num(it, "size") }) },
  messageScroller: { slug: "message-scroller", props: (it) => defined({ messages: rows(it), width: num(it, "size"), height: num(it, "size2") }) },
  stepper: { slug: "desktop/steps", props: (it) => defined({ items: rows(it), current: num(it, "value"), width: num(it, "size") }) },
  titleBar: { slug: "desktop/title-bar", props: (it) => defined({ title: text(it, "label"), controls: text(it, "controls"), width: num(it, "size") }) },
  statusBar: { slug: "desktop/status-bar", props: (it) => defined({ text: text(it, "label"), trailing: text(it, "supporting"), icon: iconOf(it) }) },
  tree: { slug: "desktop/tree", props: (it) => defined({ items: rows(it), selected: num(it, "value"), width: num(it, "size") }) },
  clipboard: { slug: "desktop/clipboard", props: (it) => defined({ text: text(it, "label") }) },
  shimmer: { slug: "desktop/shimmer", props: (it) => defined({ text: text(it, "label") }) },
  scrollbar: { slug: "desktop/scrollbar", props: (it) => defined({ length: num(it, "size2"), position: num(it, "value") }) },
  form: { slug: "basic/form", props: (it) => defined({ fields: rows(it), width: num(it, "size") }) },
  text: { kind: "text", fields: (it) => defined({ label: text(it, "label") ?? "", size: num(it, "size") }) },
  image: { kind: "image", fields: (it) => defined({ size: num(it, "size"), size2: num(it, "size2") }) },
};

/** Miuix saves a share as 0..1 */
const percent = (v: number | undefined) => (v === undefined ? undefined : v <= 1 ? Math.round(v * 100) : v);
const MIUIX_TEXT: Record<string, number> = { headline1: 28, headline2: 28, title1: 28, title2: 22, title3: 22, title4: 22, subtitle: 16, body1: 16, body2: 16, button: 16, footnote1: 12, footnote2: 12 };
const w = (it: Saved) => num(it, "w");
const pref = (trailing: string): LegacyKind => ({
  slug: "item",
  props: (it) => { const label = text(it, "label"); return defined({ items: label ? [{ label }] : undefined, description: text(it, "supporting") ?? text(it, "subtitle") ?? "", trailing, checked: bool(it, "checked"), width: w(it) }); },
});

const MIUIX: Record<string, DialectKind> = {
  button: { slug: "button", props: (it) => defined({ label: text(it, "label"), icon: iconOf(it), variant: it.variant === "secondary" ? "tonal" : "filled", width: w(it), disabled: it.enabled === false ? true : undefined }) },
  iconButton: { slug: "button", props: (it) => defined({ label: "", icon: iconOf(it), variant: "text", size: "sm" }) },
  fab: { slug: "fab", props: (it) => defined({ icon: iconOf(it), label: text(it, "label") }) },
  topAppBar: { slug: "app-bar", props: (it) => defined({ title: text(it, "largeTitle") ?? text(it, "label"), subtitle: text(it, "subtitle"), size: it.variant === "large" ? "large" : "small", leading: iconOf(it), width: w(it) }) },
  searchBar: { slug: "search", props: (it) => defined({ kind: "bar", placeholder: text(it, "label"), width: w(it) }) },
  card: { slug: "card", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), imagePos: "none", width: w(it), height: num(it, "h") }) },
  divider: { slug: "separator", props: (it) => defined({ orientation: it.variant === "vertical" ? "vertical" : "horizontal", length: it.variant === "vertical" ? num(it, "h") : w(it) }) },
  snackbar: { slug: "sonner", props: (it) => defined({ message: text(it, "label"), action: text(it, "actionLabel") }) },
  dialog: { slug: "dialog", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), dialogWidth: w(it) }) },
  bottomSheet: { slug: "sheet", props: (it) => defined({ side: "bottom", title: text(it, "label"), description: text(it, "supporting") }) },
  textField: { slug: "text-field", props: (it) => defined({ label: text(it, "label"), value: text(it, "supporting"), multiline: bool(it, "multiline"), width: w(it) }) },
  switch: { slug: "switch", props: (it) => defined({ label: text(it, "label"), checked: bool(it, "checked") }) },
  checkbox: { slug: "checkbox", props: (it) => defined({ label: text(it, "label"), checked: bool(it, "checked") }) },
  radio: { slug: "radio-group", props: (it) => { const label = text(it, "label"); return defined({ items: label ? [{ label }] : undefined, selected: it.checked === false ? -1 : 0 }); } },
  slider: { slug: "slider", props: (it) => defined({ value: percent(num(it, "value")), width: w(it) }) },
  rangeSlider: { slug: "slider", props: (it) => defined({ range: true, value: percent(num(it, "from")), end: percent(num(it, "value")), width: w(it) }) },
  navigationBar: { slug: "navigation-bar", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), width: w(it) }) },
  floatingNav: { slug: "navigation-bar", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), width: w(it) }) },
  navigationRail: { slug: "navigation-rail", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), height: num(it, "h") }) },
  tabRow: { slug: "tabs", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), width: w(it) }) },
  floatingToolbar: { slug: "toolbar", props: (it) => defined({ items: rows(it) }) },
  dropdown: { slug: "select", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), label: text(it, "label"), width: w(it) }) },
  dropdownMenu: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  iconDropdownMenu: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  listPopup: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  icon: { slug: "icon", props: (it) => defined({ name: iconOf(it) }) },
  basicPref: pref("none"),
  arrowPref: { slug: "item", props: (it) => { const label = text(it, "label"); return defined({ items: label ? [{ label }] : undefined, description: text(it, "supporting") ?? "", trailing: "icon", trailingIcon: "chevron_right", width: w(it) }); } },
  switchPref: pref("switch"),
  checkboxPref: pref("switch"),
  radioPref: pref("switch"),
  sliderPref: { slug: "slider", props: (it) => defined({ value: percent(num(it, "value")), width: w(it) }) },
  rangeSliderPref: { slug: "slider", props: (it) => defined({ range: true, value: percent(num(it, "from")), end: percent(num(it, "value")), width: w(it) }) },
  dropdownPref: { slug: "select", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), label: text(it, "label"), width: w(it) }) },
  spinnerPref: { slug: "select", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), label: text(it, "label"), width: w(it) }) },
  smallTitle: { kind: "text", fields: (it) => defined({ label: text(it, "label") ?? "", size: 16, bold: true }) },
  text: { kind: "text", fields: (it) => defined({ label: text(it, "label") ?? "", size: MIUIX_TEXT[String(it.textStyle)] ?? 16 }) },
  surface: { kind: "box", fields: (it) => defined({ size: w(it), size2: num(it, "h"), fill: "surfaceContainerHigh" }) },
  image: { kind: "image", fields: (it) => defined({ size: w(it), size2: num(it, "h"), src: typeof it.source === "string" && /^https?:\/\//.test(it.source) ? it.source : undefined }) },
  blur: { kind: "box", fields: (it) => defined({ size: w(it), size2: num(it, "h"), fill: "surfaceContainerHigh" }) },
  cascadingPopup: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  iconCascadingMenu: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  colorPalette: { slug: "basic/color-field", props: (it) => defined({ label: text(it, "label") ?? "" }) },
  numberPicker: { slug: "ios/wheel-picker", props: (it) => defined({ label: text(it, "label") ?? "", width: w(it) }) },
  pullToRefresh: { slug: "spinner", props: () => ({}) },
  scrollBar: { slug: "desktop/scrollbar", props: (it) => defined({ length: num(it, "h"), position: percent(num(it, "value")) }) },
};

/* The SwiftUI canvas keeps a part's rows in `options`; fromSwiftUIProject moves them to `tabs`. */
const SWIFTUI: Record<string, DialectKind> = {
  button: { slug: "button", props: (it) => defined({ label: text(it, "label"), icon: iconOf(it), variant: it.variant === "bordered" ? "outlined" : it.variant === "plain" || it.variant === "borderless" ? "text" : "filled", width: w(it) }) },
  iconButton: { slug: "button", props: (it) => defined({ label: "", icon: iconOf(it), variant: "text", size: "sm" }) },
  shareLink: { slug: "button", props: (it) => defined({ label: text(it, "label"), icon: iconOf(it) ?? "share", variant: "text" }) },
  toggle: { slug: "switch", props: (it) => defined({ label: text(it, "label"), checked: bool(it, "checked") }) },
  slider: { slug: "slider", props: (it) => defined({ value: percent(num(it, "value")), width: w(it) }) },
  segmented: { slug: "toggle-group", props: (it) => defined({ items: rows(it), selected: num(it, "selected") }) },
  picker: { slug: "select", props: (it) => defined({ label: text(it, "label"), items: rows(it), selected: num(it, "selected"), width: w(it) }) },
  textField: { slug: "text-field", props: (it) => defined({ label: text(it, "label"), value: text(it, "supporting"), width: w(it) }) },
  secureField: { slug: "input", props: (it) => defined({ placeholder: text(it, "label"), type: "password", width: w(it) }) },
  textEditor: { slug: "textarea", props: (it) => defined({ placeholder: text(it, "label"), width: w(it) }) },
  searchField: { slug: "search", props: (it) => defined({ kind: "bar", placeholder: text(it, "label"), width: w(it) }) },
  navBar: { slug: "app-bar", props: (it) => defined({ title: text(it, "label"), leading: iconOf(it), centered: true, width: w(it) }) },
  tabBar: { slug: "navigation-bar", props: (it) => defined({ items: rows(it), selected: num(it, "selected"), width: w(it) }) },
  list: { slug: "item", props: (it) => defined({ items: rows(it), description: text(it, "supporting") ?? "", width: w(it) }) },
  card: { slug: "card", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), imagePos: "none", width: w(it), height: num(it, "h") }) },
  alert: { slug: "alert-dialog", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  sheet: { slug: "sheet", props: (it) => defined({ side: "bottom", title: text(it, "label"), description: text(it, "supporting") }) },
  progress: { slug: "progress", props: (it) => defined({ value: percent(num(it, "value")), width: w(it) }) },
  gauge: { slug: "dashboard/gauge", props: (it) => defined({ label: text(it, "label"), value: percent(num(it, "value")) }) },
  menu: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  stepper: { slug: "game/quantity-stepper", props: (it) => defined({ value: num(it, "value"), width: w(it) }) },
  link: { slug: "basic/link", props: (it) => defined({ label: text(it, "label"), href: text(it, "supporting") }) },
  contentUnavailable: { slug: "empty", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), icon: iconOf(it) }) },
  disclosure: { slug: "collapsible", props: (it) => defined({ trigger: text(it, "label"), content: text(it, "supporting"), open: bool(it, "checked"), width: w(it) }) },
  labeledContent: { slug: "item", props: (it) => { const label = text(it, "label"); return defined({ items: label ? [{ label }] : undefined, description: "", trailing: "text", trailingText: text(it, "supporting") ?? "", width: w(it) }); } },
  chart: { slug: "dashboard/chart", props: (it) => defined({ type: it.variant === "line" ? "line" : "bar", title: text(it, "label") ?? "", subtitle: text(it, "supporting") ?? "", width: w(it), height: num(it, "h") }) },
  text: { kind: "text", fields: (it) => defined({ label: text(it, "label") ?? "", size: 16 }) },
  image: { kind: "image", fields: (it) => defined({ size: w(it), size2: num(it, "h") }) },
};

export const DIALECT_KINDS = { gpui: GPUI, miuix: MIUIX, swiftui: SWIFTUI };

/* The Ant Design fork saves one kind for all its parts: `component` says which, `props` holds that
   component's own values, and its lists are text, one entry per line. */
const native = (it: Saved) => (typeof it.props === "object" && it.props !== null ? (it.props as Saved) : {});
const lines = (p: Saved, key: string) => { const all = text(p, key)?.split("\n").map((l) => l.trim()).filter(Boolean); return all?.length ? all.map((label) => ({ label })) : undefined; };
const ant = (slug: string, props: (p: Saved, it: Saved) => PropValues): LegacyKind => ({ slug, props: (it) => defined(props(native(it), it)) });

export const ANT_COMPONENTS: Record<string, LegacyKind> = {
  Button: ant("antd/button", (p) => ({ label: text(p, "label"), type: text(p, "type"), size: text(p, "size"), danger: bool(p, "danger"), disabled: bool(p, "disabled") })),
  Input: ant("antd/input", (p, it) => ({ placeholder: text(p, "placeholder"), value: text(p, "value") ?? "", size: text(p, "size"), clear: bool(p, "allowClear"), disabled: bool(p, "disabled"), width: num(it, "size") })),
  Select: ant("antd/select", (p, it) => ({ items: lines(p, "options"), placeholder: text(p, "placeholder"), size: text(p, "size"), width: num(it, "size") })),
  Form: ant("antd/form", (p, it) => ({ fields: lines(p, "fields"), layout: text(p, "layout"), submit: p.showSubmit === false ? "" : text(p, "submitText"), width: num(it, "size") })),
  Card: ant("antd/card", (p, it) => ({ title: text(p, "title") ?? "", extra: text(p, "extra") ?? "", body: text(p, "body") ?? "", bordered: bool(p, "bordered"), hoverable: bool(p, "hoverable"), width: num(it, "size") })),
  Table: ant("antd/table", (p, it) => ({ columns: lines(p, "columns")?.map((c) => ({ label: c.label.split("|")[0] })), rows: num(p, "rows"), pagination: bool(p, "pagination"), bordered: bool(p, "bordered"), size: text(p, "size"), width: num(it, "size") })),
  Tabs: ant("antd/tabs", (p, it) => ({ items: lines(p, "items"), selected: num(p, "activeKey"), width: num(it, "size") })),
  Menu: ant("antd/menu", (p, it) => ({ items: lines(p, "items"), selected: num(p, "selectedKey"), mode: text(p, "mode"), width: num(it, "size") })),
  Breadcrumb: ant("antd/breadcrumb", (p) => ({ items: lines(p, "items"), separator: text(p, "separator") })),
  Pagination: ant("antd/pagination", (p) => ({ total: num(p, "total"), pageSize: num(p, "pageSize"), current: num(p, "current") })),
  Modal: ant("antd/modal", (p, it) => ({ title: text(p, "title") ?? "", content: text(p, "content") ?? "", ok: text(p, "okText") ?? "", cancel: text(p, "cancelText") ?? "", width: num(it, "size") })),
  Divider: ant("antd/divider", (p, it) => ({ text: text(p, "text") ?? "", dashed: bool(p, "dashed"), width: num(it, "size") })),
};

/* ---------- kinds that mean one thing in every fork that has them ---------- */

/* Kinds a shadcn M3E part already stands for. A name that means two things is settled by dialectOf
 * first; what is left of `calendar` (the game fork's daily check-in) is not one of these. */
export const CORE_LEGACY_KINDS: Record<string, LegacyKind> = {
  /* GPUI's split: the share is the pane on `side`, and the M3E part's is always the first */
  resizable: { slug: "resizable", props: (it) => { const v = num(it, "value"); const after = it.side === "right" || it.side === "bottom"; return defined({ orientation: it.side === "top" || it.side === "bottom" ? "vertical" : "horizontal", first: "", second: "", split: v === undefined ? undefined : after ? 100 - v : v, width: num(it, "size"), height: num(it, "size2") }); } },
  progressBar: { slug: "progress", props: (it) => defined({ value: num(it, "value"), width: num(it, "size") }) },
  disclosure: { slug: "collapsible", props: (it) => defined({ trigger: text(it, "label"), content: text(it, "supporting"), open: typeof it.checked === "boolean" ? it.checked : undefined, width: num(it, "size") }) },
  secureField: { slug: "input", props: (it) => defined({ placeholder: text(it, "label"), type: "password", width: num(it, "size") }) },
  textEditor: { slug: "textarea", props: (it) => defined({ placeholder: text(it, "label"), width: num(it, "size") }) },
  photosPicker: { slug: "button", props: (it) => defined({ label: text(it, "label"), icon: materialIcon(it.icon), variant: "tonal" }) },
  tabAccessory: { slug: "item", props: (it) => { const label = text(it, "label"); return defined({ items: label ? [{ label, ...(materialIcon(it.icon) ? { icon: materialIcon(it.icon) } : {}) }] : undefined, description: text(it, "supporting") ?? "", width: num(it, "size") }); } },
  tip: { slug: "alert", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), icon: materialIcon(it.icon), width: num(it, "size") }) },
  /* the template fork's iOS parts hold little but a name: the rest is each part's own defaults */
  iosAlert: { slug: "alert-dialog", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  iosList: { slug: "item", props: (it) => { const label = text(it, "label"); return defined({ items: label ? [{ label }] : undefined, description: "", width: num(it, "size") }); } },
  iosNavBar: { slug: "app-bar", props: (it) => defined({ title: text(it, "label"), leading: materialIcon(it.icon), trailing: materialIcon(it.icon2), centered: true }) },
  iosSearch: { slug: "search", props: (it) => defined({ kind: "bar", placeholder: text(it, "label") }) },
  iosSegment: { slug: "toggle-group", props: () => ({}) },
  iosSheet: { slug: "sheet", props: (it) => defined({ side: "bottom", title: text(it, "label") }) },
  iosTabBar: { slug: "navigation-bar", props: () => ({}) },
  iosToolbar: { slug: "toolbar", props: () => ({}) },
  miniProgramHeader: { slug: "app-bar", props: (it) => defined({ title: text(it, "label"), width: num(it, "size") }) },
  /* the two shadcn canvases' parts, by the fields every part of theirs has. They carry no license,
     so none of their code is here, and there is no sample of what they save: see NO_PLACE's note */
  shadcnButton: { slug: "button", props: (it) => defined({ label: text(it, "label") }) },
  shadcnCard: { slug: "card", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), imagePos: "none" }) },
  shadcnSelect: { slug: "select", props: (it) => defined({ placeholder: text(it, "label"), items: rows(it), selected: -1 }) },
  shadcnDialog: { slug: "dialog", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  shadcnPopover: { slug: "popover", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  shadcnBadge: { slug: "badge", props: (it) => defined({ label: text(it, "label") }) },
  shadcnInput: { slug: "input", props: (it) => defined({ placeholder: text(it, "label") }) },
  shadcnDropdownMenu: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  shadcnTooltip: { slug: "tooltip", props: (it) => defined({ text: text(it, "label") }) },
  shadcnCheckbox: { slug: "checkbox", props: (it) => defined({ label: text(it, "label"), checked: typeof it.checked === "boolean" ? it.checked : undefined }) },
  shadcnSwitch: { slug: "switch", props: (it) => defined({ label: text(it, "label"), checked: typeof it.checked === "boolean" ? it.checked : undefined }) },
  shadcnSlider: { slug: "slider", props: (it) => defined({ value: num(it, "value") }) },
  shadcnRadioGroup: { slug: "radio-group", props: (it) => defined({ items: rows(it) }) },
  shadcnLabel: { slug: "label", props: (it) => defined({ text: text(it, "label"), control: "none" }) },
  shadcnAvatar: { slug: "avatar", props: (it) => defined({ initials: text(it, "label") }) },
  shadcnSheet: { slug: "sheet", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  shadcnAccordion: { slug: "accordion", props: (it) => defined({ items: rows(it) }) },
  shadcnTabs: { slug: "tabs", props: (it) => defined({ items: rows(it) }) },
  shadcnAlert: { slug: "alert", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  shadcnTable: { slug: "dashboard/data-table", props: (it) => defined({ title: text(it, "label") ?? "", data: tableOf(it) }) },
  shadcnSkeleton: { slug: "skeleton", props: () => ({}) },
  shadcnProgress: { slug: "progress", props: (it) => defined({ value: num(it, "value") }) },
  shadcnBreadcrumb: { slug: "breadcrumb", props: (it) => defined({ items: rows(it) }) },
  /* the badge every older version threw away */
  badge: { slug: "badge", props: (it) => defined({ label: text(it, "label") }) },
  avatar: { slug: "avatar", props: (it) => { const s = num(it, "size"); return defined({ initials: text(it, "label"), size: s === undefined ? undefined : s <= 32 ? "sm" : s >= 56 ? "lg" : "default" }); } },
  segmentedButton: { slug: "toggle-group", props: (it) => defined({ items: rows(it), selected: num(it, "selected") }) },
  segmentedButtons: { slug: "toggle-group", props: (it) => defined({ items: rows(it), selected: num(it, "selected") }) },
  breadcrumb: { slug: "breadcrumb", props: (it) => defined({ items: rows(it) }) },
  breadcrumbs: { slug: "breadcrumb", props: (it) => defined({ items: rows(it) }) },
  skeleton: { slug: "skeleton", props: (it) => defined({ layout: "block", width: num(it, "size"), height: num(it, "size2") }) },
  banner: { slug: "alert", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), width: num(it, "size") }) },
  alert: { slug: "alert", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), width: num(it, "size") }) },
  tooltip: { slug: "tooltip", props: (it) => defined({ text: text(it, "label") }) },
  menu: { slug: "dropdown-menu", props: (it) => defined({ label: text(it, "label"), items: rows(it), destructive: "" }) },
  sideSheet: { slug: "side-sheet", props: (it) => defined({ title: text(it, "label"), content: text(it, "supporting"), width: num(it, "size") }) },
  sheet: { slug: "sheet", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting"), side: text(it, "side") }) },
  navDrawer: { slug: "sidebar", props: (it) => defined({ label: text(it, "label"), items: rows(it), width: num(it, "size") }) },
  sidebar: { slug: "sidebar", props: (it) => defined({ label: text(it, "label"), items: rows(it), width: num(it, "size"), height: num(it, "size2") }) },
  popover: { slug: "popover", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  emptyState: { slug: "empty", props: (it) => defined({ title: text(it, "label"), description: text(it, "supporting") }) },
  spinner: { slug: "spinner", props: () => ({}) },
  progress: {
    slug: "progress",
    /* Miuix saves 0..1, the others 0..100 */
    props: (it) => { const v = num(it, "value"); return defined({ value: v === undefined ? undefined : v > 0 && v <= 1 ? Math.round(v * 100) : v, width: num(it, "size") ?? num(it, "w") }); },
  },
  accordion: { slug: "accordion", props: (it) => defined({ items: rows(it), width: num(it, "size") }) },
  pagination: { slug: "pagination", props: (it) => defined({ current: num(it, "value"), width: num(it, "size") }) },
  label: { slug: "label", props: (it) => defined({ text: text(it, "label"), control: "none" }) },
  kbd: { slug: "kbd", props: (it) => { const keys = text(it, "label")?.split("-").map((label) => ({ label })); return defined({ keys }); } },
  input: { slug: "input", props: (it) => defined({ placeholder: text(it, "label"), value: text(it, "supporting") }) },
  textarea: { slug: "textarea", props: (it) => defined({ placeholder: text(it, "label"), value: text(it, "supporting") }) },
  separator: { slug: "separator", props: (it) => defined({ length: num(it, "size") }) },
  combobox: { slug: "combobox", props: (it) => defined({ placeholder: text(it, "label"), items: rows(it) }) },
  collapsible: { slug: "collapsible", props: (it) => defined({ trigger: text(it, "label"), content: text(it, "supporting"), open: typeof it.checked === "boolean" ? it.checked : undefined, width: num(it, "size") }) },
};

/** Props a part changed the shape of, read when a saved one opens. Safe to run again. */
export const PROP_UPGRADES: Partial<Record<string, (props: PropValues) => PropValues>> = {
  /* the shape had one `size`; an ellipse needs two */
  shape: (props) => {
    if (props.size === undefined) return props;
    const { size, ...rest } = props;
    return typeof size === "number" && rest.width === undefined ? { ...rest, width: size, height: size } : rest;
  },
};
