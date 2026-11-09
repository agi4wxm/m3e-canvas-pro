import { arrangeFlows } from "../../lib/flow";
import type { Lang } from "../../lib/i18n";
import { MATERIAL_METRICS, fillRest, lengthToHold, tidyFrame } from "../../lib/tidy";
import { BACK_TARGET, DESKTOP_H, DESKTOP_W, FRAME_GAP, PHONE_H, PHONE_W, TABLET_H, TABLET_W, makeItem, uid, type Action, type ApiSpec, type ColorToken, type Condition, type DataSource, type DocVar, type Frame, type Group, type Item, type ItemLook, type Place, type Radii, type RegionBinding, type ScreenParam, type TextToken, type Transition } from "../../lib/tokens";
import { TRANSITION_MOTIONS } from "../../lib/screenMotion";
import type { MockSpec } from "../../lib/mocks/types";
import { mapAction } from "../../lib/refs";
import { partBySlug, reader } from "../registry";
import { axisValue, axisWrite, resizeOf } from "../resize";
import { fullWidth, roleOf } from "../role";

/* Screen templates are plain data: the parts of a screen in the order they read, standing on the screen as any part does,
 * so that Tidy and a style's layout reach them like everything else. What belongs together (a row, a grid, a panel) is a
 * real part in auto layout. The words carry all four languages and are picked when the screen is added, because most parts
 * only have a Chinese seed of their own and tables have none. */

export type Say = Record<Lang, string>;
export const say = (en: string, zh: string, ja: string, ko: string): Say => ({ en, zh, ja, ko });
/** words an action says (a snackbar's), in every language: the screen is added in one of them, and they read as it */
export const sayInAction = (en: string, zh: string, ja: string, ko: string): string => say(en, zh, ja, ko) as unknown as string;

export type TemplateFrame = "phone" | "landscape" | "tablet" | "desktop";
export type TemplateCategory = "flow" | "auth" | "shop" | "social" | "content" | "tools" | "game" | "desktop";

type Props = Record<string, unknown>;
/** What a tap does: where it goes (the id of a screen in the same template, or back), and its effects (a call, an
 *  invoke of a capability, a variable set) with their answers' bodies, whose screens are named the same way. */
type Link = Action;
/** a tap to a screen, coming in by one of the older moves: the motion that plays it (none for the default slide) */
export const go = (to: string, move: Transition = "slide"): Link => ({ to, ...(move === "slide" ? {} : { motion: TRANSITION_MOTIONS[move] }) });
export const back = (): Link => ({ to: BACK_TARGET });

/** The contract a template's screens lean on, added to the document with them where it has none of its own: the
 *  endpoints and models they call and load, the mock scenarios that show each outcome, the variables their states read.
 *  What the document has already (an endpoint, a model, a scenario or a variable of the same name) stays. */
export type TemplateContract = { api?: ApiSpec; mocks?: MockSpec; vars?: DocVar[] };

/** where a part stands on a picture, by its distance from the edges; with neither edge of an axis it is centered on it,
 *  with both it spans between them */
export type Anchor = { l?: number; r?: number; t?: number; b?: number };

/** One part in the tree, with what it holds. `fill: true` (or `grow`) has it take the room left along
 *  its layout's run; a fill role instead paints it, as `textColor`, `corners` and `look` do: the same
 *  look a person gives a part in the panel. */
export type Node = {
  slug: string;
  props: Props;
  name?: Say;
  fill?: boolean | ColorToken;
  grow?: boolean;
  textColor?: TextToken;
  corners?: Radii;
  look?: ItemLook;
  action?: Link;
  actions?: Record<string, Link | undefined>;
  note?: Say;
  at?: Anchor;
  screenMain?: boolean;
  /** shown only while this holds (an order's status, a variable a catch set) */
  showWhen?: Condition;
  /** a container whose content comes from data: its states' designs are the kids with a `pane` */
  states?: RegionBinding;
  /** the state of the region around it this design is for (REGION_STATES: 1 loading, 3 error…) */
  pane?: number;
  /** props bound to expressions, by prop: "=data.order.value.id" (in every language where it holds words) */
  bind?: Record<string, string | Say>;
  /** a box that draws its first child once per row of a data collection (`Group.repeat`), by the collection's id */
  repeat?: { collection: string };
  /** one of the two panes of the split view it is in (`split`) */
  splitPane?: "first" | "second";
  kids?: Node[];
};
type Extra = Pick<Node, "name" | "fill" | "grow" | "textColor" | "corners" | "look" | "action" | "actions" | "note" | "at" | "screenMain" | "showWhen" | "states" | "pane" | "bind">;

export const part = (slug: string, props: Props = {}, extra: Extra = {}): Node => ({ slug, props, ...extra });

const NAME = {
  screen: say("Screen", "屏幕", "画面", "화면"),
  main: say("Main", "主区域", "メイン", "메인"),
  column: say("Column", "竖排", "縦並び", "세로"),
  row: say("Row", "横排", "横並び", "가로"),
  grid: say("Grid", "网格", "グリッド", "격자"),
  panel: say("Panel", "面板", "パネル", "패널"),
  split: say("Split view", "分栏视图", "分割ビュー", "분할 보기"),
};

/* a container in a layout has no words or paint of its own unless a template asks for them */
const BARE = { label: "", fill: "", border: "none", radius: 0, padX: 0, padY: 0 };

/** parts one under another, each as wide as the column; as tall as they add up to */
export const col = (props: Props, kids: Node[], extra: Extra = {}): Node => ({ slug: "container", props: { ...BARE, layout: "column", gap: 12, align: "stretch", hugHeight: true, ...props }, name: NAME.column, ...extra, kids });
/** parts side by side, centered across; as tall as the tallest */
export const row = (props: Props, kids: Node[], extra: Extra = {}): Node => ({ slug: "container", props: { ...BARE, layout: "row", gap: 8, align: "center", hugHeight: true, ...props }, name: NAME.row, ...extra, kids });
/** equal columns; a part takes the width of its cell */
export const grid = (columns: number, props: Props, kids: Node[], extra: Extra = {}): Node => ({ slug: "container", props: { ...BARE, layout: "grid", columns, gap: 12, align: "stretch", hugHeight: true, ...props }, name: NAME.grid, ...extra, kids });
/** a column on a tinted, rounded ground */
export const panel = (props: Props, kids: Node[], extra: Extra = {}): Node => col({ fill: "surface-container-low", radius: 16, padX: 16, padY: 16, ...props }, kids, { name: NAME.panel, ...extra });

/** Two panes side by side (one over the other with `orientation: "vertical"`), both showing, with a divider the visitor
 *  drags: a split view, whose panes are the two containers given (`col`, `panel`…), each laying out what it holds. */
export const split = (props: Props, first: Node, second: Node, extra: Extra = {}): Node => {
  /* a pane is as big as the split gives it, never as what it holds */
  const pane = (n: Node, side: "first" | "second"): Node => ({ ...n, props: { ...n.props, hugWidth: false, hugHeight: false }, splitPane: side });
  return { slug: "split-view", props, name: NAME.split, ...extra, kids: [pane(first, "first"), pane(second, "second")] };
};

export const txt = (text: Say | string, style = "body", more: Props = {}, extra: Extra = {}): Node => part("text", { text, style, ...more }, extra);

/** one screen of a template: its parts in the order they read, and the data it loads, by what it is opened with */
export type ScreenSeed = { id: string; name: Say; frame: TemplateFrame; length?: number; note?: Say; bg?: ColorToken; place?: Place; data?: DataSource[]; params?: ScreenParam[]; roots: Node[] };

export type Template = {
  slug: string;
  name: string;
  labels: { ja: string; zh: string; ko: string };
  category: TemplateCategory;
  frame: TemplateFrame;
  /** icon the tile falls back on where a picture says little */
  icon: string;
  /** the screens it adds; every link in them points at one of them, or back */
  build: () => ScreenSeed[];
  /** what its screens call, load and read, in the language they are added in */
  contract?: (lang: Lang) => TemplateContract;
};

type Size = { w: number; h: number };
const SIZE: Record<Exclude<TemplateFrame, "landscape">, Size> = { phone: { w: PHONE_W, h: PHONE_H }, tablet: { w: TABLET_W, h: TABLET_H }, desktop: { w: DESKTOP_W, h: DESKTOP_H } };

/** the size of a template's screen, for the phone the document is drawn for */
const sizeIn = (frame: TemplateFrame, phone: Size): Size => (frame === "phone" ? phone : frame === "landscape" ? { w: phone.h, h: phone.w } : SIZE[frame]);

/** the frame fields a screen's size comes down to: the usual phone is what a frame is by default */
const frameFields = ({ w, h }: Size): Pick<Frame, "w" | "h"> => (w === PHONE_W && h === PHONE_H ? {} : { w, h });

type Screen = { id: string; name: Say; frame?: TemplateFrame; length?: number; note?: Say; bg?: ColorToken; place?: Place; data?: DataSource[]; params?: ScreenParam[]; scene?: Node; top?: Node[]; body?: Node[]; spots?: Node[]; bottom?: Node[] };

/** A screen: a picture behind it if it has one, the bars at its ends, the rows of its body between them, and what is
 *  placed on the picture by its edges. Bars and rows stand on the screen itself, so a style reaches them. */
export function screen({ id, name, frame = "phone", length, note, bg, place, data, params, scene, top = [], body = [], spots = [], bottom = [] }: Screen): ScreenSeed {
  return { id, name, frame, length, note, bg, place, ...(data ? { data } : {}), ...(params ? { params } : {}), roots: [...(scene ? [scene] : []), ...top, ...body, ...spots, ...bottom] };
}

/** A desktop screen: what stands at its side, and a main column beside it, in one layout as big as the window. */
export function deskScreen({ id, name, length, note, side, body, bodyProps }: { id: string; name: Say; length?: number; note?: Say; side?: Node; body: Node[]; bodyProps?: Props }): ScreenSeed {
  const { w, h } = SIZE.desktop;
  const main = col({ padX: 24, padY: 24, gap: 16, hugHeight: false, ...bodyProps }, body, { name: NAME.main, fill: true, screenMain: true });
  const root = row({ width: w, height: Math.max(length ?? 0, h), gap: 0, align: "stretch", hugHeight: false }, side ? [side, main] : [main], { name: NAME.screen });
  return { id, name, frame: "desktop", length, note, roots: [root] };
}

/* ---------- from seed to document ---------- */

/** a group as a template keeps it: words still in every language, links still by screen id */
export type SeedGroup = Omit<Group, "items" | "name"> & { name?: Say; at?: Anchor; items: (Omit<Item, "note" | "bind"> & { note?: Say; bind?: Record<string, string | Say> })[] };

/** The tree flattened into groups, outermost first: the array is the order a layout goes by, and a
 *  container has to be drawn under what it holds. Ids are stable within a build, not across adds. */
export function seedGroups(seed: ScreenSeed): SeedGroup[] {
  const out: SeedGroup[] = [];
  let n = 0;
  const visit = (node: Node, inFlow?: string) => {
    n += 1;
    const id = `${seed.id}-${n}`;
    const actions = Object.fromEntries(Object.entries(node.actions ?? {}).filter((e): e is [string, Link] => !!e[1]));
    const { note: _none, ...fresh } = makeItem(node.slug);
    const item = {
      ...fresh,
      id: `${id}-part`,
      props: node.props,
      ...(node.fill === true || node.grow ? { flowFill: true } : {}),
      ...(typeof node.fill === "string" ? { fill: node.fill } : {}),
      ...(node.textColor ? { textColor: node.textColor } : {}),
      ...(node.corners ? { corners: node.corners } : {}),
      ...(node.look ? { look: node.look } : {}),
      ...(node.action ? { action: node.action } : {}),
      ...(Object.keys(actions).length ? { actions } : {}),
      ...(node.note ? { note: node.note } : {}),
      ...(node.bind ? { bind: node.bind } : {}),
    };
    out.push({ id, x: 0, y: 0, axis: "x", ...(node.name ? { name: node.name } : {}), ...(inFlow ? { inFlow } : {}), ...(node.at ? { at: node.at } : {}), ...(node.screenMain ? { screenMain: true } : {}), ...(node.showWhen ? { showWhen: node.showWhen } : {}), ...(node.states ? { states: node.states } : {}), ...(node.pane !== undefined ? { pane: node.pane } : {}), ...(node.splitPane && inFlow ? { splitPane: node.splitPane } : {}), ...(node.repeat ? { repeat: { collection: node.repeat.collection } } : {}), items: [item] });
    for (const kid of node.kids ?? []) visit(kid, id);
  };
  for (const root of seed.roots) visit(root);
  return out;
}

const isSay = (v: object): v is Say => "en" in v && "zh" in v && "ja" in v && "ko" in v;

/** the words of a seed value in one language, at any depth: a prop, a row of a list, a cell of a table */
export function inLang<T>(value: T, lang: Lang): T {
  if (Array.isArray(value)) return value.map((v) => inLang(v, lang)) as T;
  if (typeof value !== "object" || value === null) return value;
  if (isSay(value)) return value[lang] as T;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inLang(v, lang)])) as T;
}

/** what a part measures before it has been drawn: the numbers it says itself, else its own guess */
export function defaultMeasures(groups: Group[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups)
    for (const it of g.items) {
      const def = partBySlug(it.component);
      if (!def) continue;
      const ax = resizeOf(def, it.props);
      /* what hugs its words has no number to say; it makes a guess of its own, from its words and its size */
      const guess = def.guess?.(reader(def, it.props));
      out[it.id] = guess?.w || (ax?.width && axisValue(ax.width, it.props)) || def.w;
      out[`${it.id}:h`] = guess?.h || (ax?.height && axisValue(ax.height, it.props)) || def.h;
    }
  return out;
}

/** a layout worked out from those guesses, so a new screen does not stand in a heap until it is measured */
export function arranged(groups: Group[]): Group[] {
  let at = groups;
  for (let i = 0; i < 4; i++) {
    const next = arrangeFlows(at, defaultMeasures(at));
    if (next === at) break;
    at = next;
  }
  return at;
}

const SCREEN_MARGIN = 16;

/** a part as big as a screen calls for: a bar or a picture spans it, a row of the body takes the width between the margins,
 *  and what a template sized for itself stays that size */
function sizedOnScreen(g: Group, size: Size, at: Anchor | undefined): Group {
  const it = g.items[0];
  const axes = resizeOf(partBySlug(it.component), it.props);
  const role = roleOf(it);
  const width = axes?.width;
  const height = axes?.height;
  const set = (props: Record<string, unknown>) => ({ ...g, items: [{ ...it, props: { ...it.props, ...props } }] });
  const fit = (ax: NonNullable<typeof width>, v: number) => ({ [ax.key]: axisWrite(ax, Math.max(ax.min, Math.min(ax.max, v))) });
  if (role === "backdrop") return set({ ...(width ? fit(width, size.w) : {}), ...(height ? fit(height, size.h) : {}) });
  if (at) {
    /* what stands by one edge keeps its size while the screen has room for it, with as much left at the far edge */
    const room = size.w - (at.l ?? at.r ?? 0) - (at.r ?? at.l ?? 0);
    const asked = width && it.props?.[width.key];
    return set({
      ...(width && at.l !== undefined && at.r !== undefined ? fit(width, size.w - at.l - at.r) : typeof asked === "number" && asked > room ? fit(width!, room) : {}),
      ...(height && at.t !== undefined && at.b !== undefined ? fit(height, size.h - at.t - at.b) : {}),
    });
  }
  if (!width || it.props?.[width.key] !== undefined) return g;
  if (role === "top" || role === "bottom" || fullWidth(it)) return set(fit(width, size.w));
  /* what floats keeps its own size */
  if (role === "fab" || role === "overlay" || role === "rail" || role === "floatingBottom") return g;
  return set(fit(width, size.w - SCREEN_MARGIN * 2));
}

/** where a screen's parts stand before anything has been drawn: the rows one under another, what has an anchor by its edges */
function standing(groups: Group[], anchors: Map<string, Anchor>, frame: Frame, size: Size): Group[] {
  const m = defaultMeasures(groups);
  let y = frame.y;
  return groups.map((g) => {
    if (g.inFlow) return g;
    const it = g.items[0];
    const w = m[it.id];
    const h = m[`${it.id}:h`];
    const at = anchors.get(g.id);
    if (at) {
      const x = at.l !== undefined ? at.l : at.r !== undefined ? size.w - at.r - w : (size.w - w) / 2;
      const top = at.t !== undefined ? at.t : at.b !== undefined ? size.h - at.b - h : (size.h - h) / 2;
      return { ...g, x: frame.x + Math.round(x), y: frame.y + Math.round(top) };
    }
    if (roleOf(it) === "backdrop") return { ...g, x: frame.x, y: frame.y };
    const here = { ...g, x: frame.x + (w >= size.w - 1 ? 0 : SCREEN_MARGIN), y };
    y += h + SCREEN_MARGIN;
    return here;
  });
}

/* a screen just built touches nothing by design: what meets here only met by a guess at its size */
const FRESH = { ...MATERIAL_METRICS, together: [] as string[][] };

/** A template as document data: new ids throughout, the words of `lang`, the screens side by side
 *  from (x, y), each named apart from the names in `taken`, for the phone the document is drawn for. */
export function instantiate(template: Pick<Template, "build">, lang: Lang, at: { x: number; y: number } = { x: 0, y: 0 }, taken: string[] = [], phone: Size = SIZE.phone): { frames: Frame[]; groups: Group[] } {
  const seeds = template.build();
  const frameIds = new Map(seeds.map((s) => [s.id, uid()]));
  const names = new Set(taken);
  const frames: Frame[] = [];
  const groups: Group[] = [];
  let x = at.x;
  for (const seed of seeds) {
    const base = seed.name[lang];
    let name = base;
    for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
    names.add(name);
    const size = sizeIn(seed.frame, phone);
    let frame: Frame = {
      id: frameIds.get(seed.id)!,
      name,
      x,
      y: at.y,
      ...frameFields(size),
      ...(seed.length && seed.length > size.h ? { length: seed.length } : {}),
      ...(seed.note ? { note: seed.note[lang] } : {}),
      ...(seed.bg ? { bg: seed.bg } : {}),
      ...(seed.place ? { place: seed.place } : {}),
      ...(seed.data?.length ? { data: seed.data } : {}),
      ...(seed.params?.length ? { params: seed.params } : {}),
    };
    const seeded = seedGroups(seed);
    const groupIds = new Map(seeded.map((g) => [g.id, uid()]));
    const anchors = new Map<string, Anchor>();
    /* a tap names screens of the template, in its answers' bodies too */
    const link = (a: Action): Action => mapAction(a, { screen: (to) => frameIds.get(to) ?? to });
    /* apart from each other until they are placed: a part let go on a layout is taken in by it */
    let apart = 0;
    let mine: Group[] = seeded.map((g) => {
      const { name: groupName, inFlow, items, at: anchor, ...rest } = g;
      const id = groupIds.get(g.id)!;
      if (anchor) anchors.set(id, anchor);
      if (!inFlow) apart += 8000;
      const made: Group = {
        ...rest,
        id,
        x,
        y: at.y + apart,
        ...(groupName ? { name: groupName[lang] } : {}),
        ...(inFlow ? { inFlow: groupIds.get(inFlow)! } : {}),
        items: items.map((it) => {
          const { note, bind, ...item } = it;
          return {
            ...item,
            id: uid(),
            props: inLang(it.props, lang),
            ...(bind ? { bind: inLang(bind, lang) as Record<string, string> } : {}),
            ...(note ? { note: note[lang] } : {}),
            /* an action's words (a snackbar's) come in every language too */
            ...(it.action ? { action: link(inLang(it.action, lang)) } : {}),
            ...(it.actions ? { actions: Object.fromEntries(Object.entries(it.actions).map(([k, a]) => [k, link(inLang(a, lang))])) } : {}),
          };
        }),
      };
      return inFlow ? made : sizedOnScreen(made, size, anchor);
    });
    mine = arranged(mine);
    /* on a smaller phone what does not fit makes the screen longer: a part left below its foot would be off the screen */
    {
      const placed = standing(mine, anchors, { ...frame, length: 100000 }, size);
      const need = Math.ceil(lengthToHold(placed, frame, defaultMeasures(placed), FRESH) / 4) * 4;
      if (need > size.h && !frame.length) frame = { ...frame, length: need, grownFrom: size.h };
    }
    frames.push(frame);
    mine = standing(mine, anchors, frame, size);
    const m = defaultMeasures(mine);
    mine = fillRest(mine, frame, [frame], m, FRESH);
    mine = tidyFrame(mine, frame, [frame], m, FRESH) ?? mine;
    groups.push(...arranged(mine));
    x += size.w + FRAME_GAP;
  }
  return { frames, groups };
}
