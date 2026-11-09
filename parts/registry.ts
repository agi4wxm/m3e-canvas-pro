import { actions } from "./defs/actions";
import { chat } from "./defs/chat";
import { communication } from "./defs/communication";
import { containment } from "./defs/containment";
import { content } from "./defs/content";
import { menus } from "./defs/menus";
import { navigation } from "./defs/navigation";
import { pickers } from "./defs/pickers";
import { selection } from "./defs/selection";
import { textInputs } from "./defs/text-inputs";
import { additions } from "./defs/additions";
import { app } from "./defs/app";
import { containers } from "./defs/containers";
import { controls } from "./defs/controls";
import { data } from "./defs/data";
import { desktop } from "./defs/desktop";
import { game } from "./defs/game";
import { media } from "./defs/media";
import { mobile } from "./defs/mobile";
import { more } from "./defs/more";
import { atoms } from "./defs/atoms";
import { SPLITS } from "./defs/splits";
import { RETIRED, RETIRED_SPLITS } from "./defs/retired";
import type { Labels, ListItem, P, PartDef, PropDef, PropValues, Screen, TableColumn, TableData } from "./types";
import type { KitLook } from "./kits/types";
import { applyAppearance, type Appearance } from "./appearance";
import { h, mapNodes, type PNode } from "./node";
import { COMMON_TEXT, choiceValueOf, defaultTextOf, listTextOf } from "./labels";
import { getLang, type Lang } from "../lib/i18n";
import { fieldProps } from "./fieldState";
import { TABLE_COLUMNS } from "./tableColumns";
import { lineUp } from "./tables";
import { colorRowsOf, colorValue } from "./color";
import { holdsRows, rowsOf } from "./rows";

/* ---------- what a part is for, and what it is made of ----------
 * Parts come in two tiers. An atom cannot be split any further: a box, a line of text, an icon, a
 * bare field, a button. A composite is made of atoms: a search bar, a list row, a card. The palette
 * shows the tiers apart, each in sections by what the part is for. Other code reads the sections
 * from here and never names one itself. */

/** the palette's sections, in the order it shows them: the atoms first */
export const CATEGORIES = [
  "Basics",
  "Controls",
  "Indicators",
  "Actions",
  "Forms",
  "Pickers",
  "Navigation",
  "Menus & search",
  "Overlays",
  "Feedback",
  "Layout",
  "Lists",
  "Data & charts",
  "Commerce",
  "Social & chat",
  "AI",
  "Media",
  "Game",
  "Desktop",
] as const;
export type PartCategory = (typeof CATEGORIES)[number];

/** an atom cannot be split; a composite is built of atoms */
export type PartTier = "atom" | "composite";
export const TIERS: PartTier[] = ["atom", "composite"];

export const CATEGORY_TIER: Record<PartCategory, PartTier> = {
  Basics: "atom",
  Controls: "atom",
  Indicators: "atom",
  Actions: "composite",
  Forms: "composite",
  Pickers: "composite",
  Navigation: "composite",
  "Menus & search": "composite",
  Overlays: "composite",
  Feedback: "composite",
  Layout: "composite",
  Lists: "composite",
  "Data & charts": "composite",
  Commerce: "composite",
  "Social & chat": "composite",
  AI: "composite",
  Media: "composite",
  Game: "composite",
  Desktop: "composite",
};

/** the tier a part (or anything filed under a section, a kit too) belongs to */
export const tierOf = (d: { category: string }): PartTier => CATEGORY_TIER[d.category as PartCategory] ?? "composite";

/** the sections of one tier, in order */
export const categoriesOf = (tier: PartTier): PartCategory[] => CATEGORIES.filter((c) => CATEGORY_TIER[c] === tier);

/** what each section is called: `en` is what the docs and the AI guide call it */
export const CATEGORY_TEXT: Record<PartCategory, Required<Labels>> = {
  Basics: { en: "Basics", zh: "基础", ja: "基本", ko: "기본" },
  Controls: { en: "Controls", zh: "控件", ja: "コントロール", ko: "컨트롤" },
  Indicators: { en: "Indicators", zh: "指示", ja: "インジケーター", ko: "표시" },
  Actions: { en: "Actions", zh: "操作", ja: "操作", ko: "동작" },
  Forms: { en: "Forms", zh: "表单", ja: "フォーム", ko: "양식" },
  Pickers: { en: "Pickers", zh: "选择器", ja: "ピッカー", ko: "선택기" },
  Navigation: { en: "Bars & navigation", zh: "栏与导航", ja: "バーとナビゲーション", ko: "바와 내비게이션" },
  "Menus & search": { en: "Menus & search", zh: "菜单与搜索", ja: "メニューと検索", ko: "메뉴와 검색" },
  Overlays: { en: "Overlays", zh: "弹出层", ja: "オーバーレイ", ko: "오버레이" },
  Feedback: { en: "Feedback", zh: "反馈", ja: "フィードバック", ko: "피드백" },
  Layout: { en: "Layout", zh: "布局容器", ja: "レイアウト", ko: "레이아웃" },
  Lists: { en: "Lists", zh: "列表", ja: "リスト", ko: "목록" },
  "Data & charts": { en: "Data & charts", zh: "数据与图表", ja: "データとグラフ", ko: "데이터와 차트" },
  Commerce: { en: "Commerce", zh: "电商与支付", ja: "コマース", ko: "커머스" },
  "Social & chat": { en: "Social & chat", zh: "社交与聊天", ja: "ソーシャルとチャット", ko: "소셜과 채팅" },
  AI: { en: "AI", zh: "AI 对话", ja: "AI チャット", ko: "AI 대화" },
  Media: { en: "Media", zh: "媒体", ja: "メディア", ko: "미디어" },
  Game: { en: "Game", zh: "游戏", ja: "ゲーム", ko: "게임" },
  Desktop: { en: "Desktop", zh: "桌面软件", ja: "デスクトップ", ko: "데스크톱" },
};

/** the icon a section is shown with */
export const CATEGORY_ICON: Record<PartCategory, string> = {
  Basics: "category",
  Controls: "toggle_on",
  Indicators: "radio_button_checked",
  Actions: "touch_app",
  Forms: "edit_note",
  Pickers: "event",
  Navigation: "explore",
  "Menus & search": "search",
  Overlays: "web_asset",
  Feedback: "campaign",
  Layout: "dashboard",
  Lists: "list",
  "Data & charts": "bar_chart",
  Commerce: "shopping_bag",
  "Social & chat": "forum",
  AI: "auto_awesome",
  Media: "image",
  Game: "sports_esports",
  Desktop: "desktop_windows",
};

export const TIER_TEXT: Record<PartTier, Required<Labels>> = {
  atom: { en: "Atoms", zh: "原子组件", ja: "アトム", ko: "원자 구성 요소" },
  composite: { en: "Composites", zh: "组合组件", ja: "コンポジット", ko: "조합 구성 요소" },
};

export const categoryName = (c: PartCategory, lang: Lang) => CATEGORY_TEXT[c][lang];

/* the composites that split are handed their trees of atoms here, where the two meet, and the retired parts what
 * replaces them (parts/defs/retired.ts); an input is handed the props of the field states it declares and does not
 * write itself (parts/fieldState.ts), and a table prop the column structure its part reads it by (parts/tableColumns.ts) */
export const PARTS: PartDef[] = [...atoms, ...actions, ...selection, ...textInputs, ...communication, ...containment, ...navigation, ...menus, ...pickers, ...content, ...chat, ...controls, ...containers, ...media, ...data, ...desktop, ...game, ...mobile, ...additions, ...app, ...more].map((given) => {
  const states = fieldProps(given);
  const withColumns = given.props.some((x) => x.kind === "table" && !x.columns && TABLE_COLUMNS[`${given.slug}.${x.key}`])
    ? given.props.map((x) => (x.kind === "table" && !x.columns && TABLE_COLUMNS[`${given.slug}.${x.key}`] ? { ...x, columns: TABLE_COLUMNS[`${given.slug}.${x.key}`] } : x))
    : given.props;
  const d = states.length || withColumns !== given.props ? { ...given, props: [...withColumns, ...states] } : given;
  const split = (SPLITS[d.slug] ?? RETIRED_SPLITS[d.slug]) as (typeof SPLITS)[string] | undefined;
  const retired = RETIRED[d.slug];
  /* the look a split is handed is the document's KitLook, which PartDef cannot name */
  const atomsOf = split && !d.atoms ? { atoms: (p: P, look?: object) => split(p, look as KitLook | undefined) } : {};
  return split || retired ? { ...d, ...atomsOf, ...(retired ? { retired } : {}) } : d;
});

const BY_SLUG = new Map(PARTS.map((d) => [d.slug, d]));
export const partBySlug = (slug: string | undefined): PartDef | undefined => (slug ? BY_SLUG.get(slug) : undefined);

/** Whether a part with these props holds the parts in it now: a container always, one that holds only laid out
 *  (`PartDef.holds` "laidOut": a dialog, a sheet) while its auto layout is on. */
export const holdsNow = (def: Pick<PartDef, "holds"> | undefined, props: PropValues | undefined): boolean =>
  def?.holds === true || (def?.holds === "laidOut" && typeof props?.layout === "string" && props.layout !== "free");
/** whether a part is retired: still drawn, no longer offered (`PartDef.retired`) */
export const isRetired = (d: PartDef | undefined): boolean => !!d?.retired;

/** The parts there are to build with: every part but the retired ones. The palette, the AI's catalog and the add
 *  operations read this; what draws, opens, splits or prints a part reads `PARTS`, so an old document is unchanged. */
export const OFFERED_PARTS: PartDef[] = PARTS.filter((d) => !d.retired);

/** the fields of a row a tree reads. A row comes from the document, so one that holds anything but words
 *  there (a node, code to print) is read with those fields left out. */
const ROW_FIELDS = ["icon", "variant", "width", "image", "color"] as const;
function rowOf(row: ListItem): ListItem {
  if (ROW_FIELDS.every((k) => row[k] === undefined || typeof row[k] === "string")) return row;
  const out: ListItem = { label: row.label };
  for (const k of ROW_FIELDS) if (typeof row[k] === "string") out[k] = row[k];
  return out;
}

/** the values of a prop: the author's, or the part's default when it has none (or the wrong
 *  type). A default the author never touched is seeded in the editor's language. */
function read(def: PropDef, values: PropValues | undefined): unknown {
  const v = values?.[def.key];
  switch (def.kind) {
    case "text":
      return typeof v === "string" ? v : defaultTextOf(def, getLang());
    case "icon":
      return typeof v === "string" ? v : def.default;
    case "enum":
      return typeof v === "string" && def.options.some((o) => choiceValueOf(o) === v) ? v : def.default;
    case "bool":
      return typeof v === "boolean" ? v : def.default;
    case "image":
      return typeof v === "string" ? v : (def.default ?? "");
    case "color":
      /* one reader of a color (parts/color.ts): anything else is the part's default */
      return colorValue(v) ?? def.default;
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? Math.min(def.max, Math.max(def.min, v)) : def.default;
    case "list": {
      /* a list of colors may be given as their words (a tap sets words, never rows) */
      if (def.colors && typeof v === "string") return colorRowsOf(v);
      if (!Array.isArray(v) || !v.every((x) => typeof x === "object" && x !== null && typeof (x as ListItem).label === "string")) return def.default.map((x) => ({ ...x, label: listTextOf(x.label, getLang()) }));
      const rows = (v as ListItem[]).map(rowOf);
      return rows.every((r, i) => r === v[i]) ? v : rows;
    }
    case "table": {
      const t = v as Partial<TableData> | undefined;
      if (!Array.isArray(t?.columns) || !Array.isArray(t?.rows)) {
        const lang = getLang();
        return { columns: def.default.columns.map((c) => listTextOf(c, lang)), rows: def.default.rows.map((r) => r.map((c) => listTextOf(c, lang))) };
      }
      /* the author's column structure, where it is one: records with a key each */
      const spec = Array.isArray(t.spec) && t.spec.every((c) => !!c && typeof c === "object" && typeof (c as { key?: unknown }).key === "string") ? { spec: t.spec as TableColumn[] } : {};
      /* read by key: an author's structure is lined up with the columns the part reads */
      return lineUp({ columns: t.columns.map(String), rows: t.rows.filter(Array.isArray).map((r) => r.map(String)), ...spec }, def.columns);
    }
  }
}

/** a reader over the part's prop values, with the defaults filled in */
export function reader(def: PartDef, values: PropValues | undefined, scope = ""): P {
  const byKey = new Map(def.props.map((d) => [d.key, d]));
  const get = (key: string) => {
    const d = byKey.get(key);
    if (!d) throw new Error(`${def.slug} has no prop "${key}"`);
    return read(d, values);
  };
  return {
    s: (key) => get(key) as string,
    n: (key) => get(key) as number,
    b: (key) => get(key) as boolean,
    list: (key) => get(key) as ListItem[],
    table: (key) => get(key) as TableData,
    rows: (key) => {
      const d = byKey.get(key);
      if (!holdsRows(d)) throw new Error(`${def.slug} has no rows "${key}"`);
      return rowsOf(d, read(d, values));
    },
    say: (words) => listTextOf(words, getLang()),
    scope,
  };
}

/** the JSX tree of a part with the given prop values, painted with its appearance when it has one */
export const treeOf = (def: PartDef, values?: PropValues, appearance?: Appearance, scope?: string): PNode =>
  applyAppearance(def.tree(reader(def, values, scope)), appearance, def.appearance?.target);

/** the components that open something: while the part is drawn open they are held open (a click on the canvas must not dismiss them), and are not modal */
export const OVERLAY_ROOTS = new Set(["Dialog", "AlertDialog", "Sheet", "SideSheet", "Drawer", "Popover", "HoverCard", "Tooltip", "DropdownMenu", "ContextMenu", "Select", "Combobox"]);

const hasTrigger = (n: PNode) => !!n.children?.some((c) => typeof c !== "string" && c.type === "NavigationMenuTrigger");

/** `node` as it is when drawn open; `first` remembers which menu of a bar is the one that is open */
function opened(node: PNode, open: NonNullable<PartDef["open"]>, first: { menu: boolean; nav: boolean }): PNode {
  const props = node.props ?? {};
  switch (true) {
    /* a menubar has one menu open at a time: the first */
    case node.type === "MenubarMenu" && first.menu:
      first.menu = false;
      return { ...node, props: { ...props, open: true } };
    /* a navigation menu opens the item named by its `defaultValue` */
    case node.type === "NavigationMenu":
      return { ...node, props: { ...props, defaultValue: "open" } };
    case node.type === "NavigationMenuItem" && hasTrigger(node) && first.nav:
      first.nav = false;
      return { ...node, props: { ...props, value: "open" } };
    case OVERLAY_ROOTS.has(node.type):
      return {
        ...node,
        props: { ...props, open: true, modal: false, ...open.root },
        children: open.trigger === "hide" ? node.children?.filter((c) => typeof c === "string" || !c.type.endsWith("Trigger")) : node.children,
      };
    default:
      return node;
  }
}

/** a drawn-open overlay is not modal (a click on the canvas must not be trapped); in the live
 *  preview the same flag keeps a menu the visitor opens from capturing the screen */
const modalOff = (n: PNode): PNode => (OVERLAY_ROOTS.has(n.type) ? { ...n, props: { ...n.props, modal: false } } : n);

/** What the canvas draws for a part: its tree, and for a part that opens something, that thing
 *  drawn open inside a box (see `PartDef.open`). The code printed is always `treeOf`. `screen`
 *  is the size of the frame the part sits on: the box stands in for a screen, so it is never
 *  larger than the real one.
 *
 *  `live` is the preview: a part whose trigger is drawn opens and closes itself there, so its
 *  tree stands unopened in the box that keeps its place (the overlay still opens inside the
 *  box, spilling past it). A hidden-trigger overlay has nothing to open it with, so it stays
 *  held open exactly as on the canvas. */
export function viewOf(def: PartDef, values?: PropValues, appearance?: Appearance, screen?: Screen, live = false, scope?: string): PNode {
  const p = reader(def, values, scope);
  const open = def.open;
  const selfOpens = live && !!open && open.trigger !== "hide";
  /* a canvas view that only draws the part open (a date picker's calendar) gives way to the real part in the preview */
  const ownView = def.view && !selfOpens && !(live && LIVE_TREE.has(def.slug));
  const tree = applyAppearance(ownView ? def.view!(p, screen) : def.tree(p), appearance, def.appearance?.target);
  if (!open) return tree;
  const { w, h: height, ax, ay } = open.box(p);
  const box = { width: screen ? Math.min(w, screen.w) : w, height: screen ? Math.min(height, screen.h) : height, ax, ay };
  /* hanging off its trigger, the open drawing stands on the part drawn closed: that is the part's size (`Overhang`) */
  const hang = (n: PNode) => (overhangs(def, values) ? h("Overhang", { live: live || undefined }, applyAppearance(def.tree(p), appearance, def.appearance?.target), n) : n);
  if (selfOpens) return hang(h("Contained", { ...box, live: true }, mapNodes(tree, modalOff)));
  const first = { menu: true, nav: true };
  const renamed = open.rename ? mapNodes(tree, (n) => ({ ...n, type: open.rename!(n.type) })) : tree;
  return hang(h("Contained", { ...box, fit: open.fit || undefined }, mapNodes(renamed, (n) => opened(n, open, first))));
}

/** parts whose canvas view draws them open with no `open` box of their own, and whose real tree opens on a tap */
const LIVE_TREE = new Set(["date-picker"]);

/** A part drawn open off a trigger that it hangs from the top left of (a select, a dropdown menu, a menubar, a search with
 *  its suggestions): it stands, is measured and is laid out at its closed size, and the open drawing overhangs. One whose
 *  menu opens around the trigger (a tooltip, a popover) keeps the box it is drawn in, as before. */
export function overhangs(def: PartDef | undefined, values?: PropValues): boolean {
  const open = def?.open;
  if (!open || open.trigger === "hide") return false;
  const b = open.box(reader(def, values));
  return (b.ax ?? "start") === "start" && (b.ay ?? "start") === "start";
}

/** the default value of every prop */
export const defaultValues = (def: PartDef): PropValues => Object.fromEntries(def.props.map((d) => [d.key, d.default]));

const picked = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:");

/** The values with every picture that is a picked file's data (an image prop, or a row of a list
 *  that takes pictures) swapped for `swap`, or dropped without one: a shared link has no room for
 *  them and printed code should not carry them. A web address stays. */
export function withoutPickedImages(def: PartDef, values: PropValues, swap?: string | ((data: string) => string)): PropValues {
  let out = values;
  const put = (key: string, v: unknown) => {
    if (out === values) out = { ...values };
    if (v === undefined) delete out[key];
    else out[key] = v;
  };
  const swapped = (data: string) => (typeof swap === "function" ? swap(data) : swap);
  for (const d of def.props) {
    const v = values[d.key];
    if (d.kind === "image" && picked(v)) put(d.key, swapped(v));
    if (d.kind === "list" && d.images && Array.isArray(v) && v.some((row) => picked((row as ListItem | null)?.image)))
      put(
        d.key,
        v.map((row: ListItem) => {
          if (!picked(row?.image)) return row;
          const { image, ...rest } = row;
          const path = swapped(image!);
          return path ? { ...rest, image: path } : rest;
        }),
      );
  }
  return out;
}

/* -- language ----------------------------------------------------------------- */

/** the seed `label` is a translation of, or itself when it is none of them */
const seedKey = (s: string): string | undefined => Object.keys(COMMON_TEXT).find((k) => k === s || Object.values(COMMON_TEXT[k]).includes(s));

/** a text value that still holds a seed — in any language — becomes the seed of `lang`;
 *  a value the author wrote stays. */
function translateSeed(value: string, d: Extract<PropDef, { kind: "text" }>, lang: Lang): string {
  if (value === d.default || Object.values(d.defaults ?? {}).includes(value)) return defaultTextOf(d, lang);
  const key = seedKey(value);
  return key ? (COMMON_TEXT[key][lang] ?? key) : value;
}

/** the props of a `component` item re-seeded for a language change (see `translateSnapshot`) */
export function translateComponentProps(component: string | undefined, props: PropValues | undefined, lang: Lang): PropValues | undefined {
  const def = partBySlug(component);
  if (!def || !props) return props;
  let changed = false;
  const next: PropValues = { ...props };
  for (const d of def.props) {
    if (d.kind === "text") {
      const v = next[d.key];
      if (typeof v === "string" && v) {
        const t = translateSeed(v, d, lang);
        if (t !== v) {
          next[d.key] = t;
          changed = true;
        }
      }
    } else if (d.kind === "list") {
      const v = next[d.key];
      if (Array.isArray(v)) {
        const rows = (v as ListItem[]).map((x) => {
          const key = seedKey(x.label);
          const label = key ? (COMMON_TEXT[key][lang] ?? key) : x.label;
          return label !== x.label ? { ...x, label } : x;
        });
        if (rows.some((x, i) => x !== (v as ListItem[])[i])) {
          next[d.key] = rows;
          changed = true;
        }
      }
    }
  }
  return changed ? next : props;
}
