import { arrangeFlows } from "../../lib/flow";
import type { Lang } from "../../lib/i18n";
import { BACK_TARGET, DESKTOP_H, DESKTOP_W, FRAME_GAP, PHONE_H, PHONE_W, TABLET_H, TABLET_W, makeItem, uid, type Action, type ColorToken, type Frame, type Group, type Item, type Transition } from "../../lib/tokens";
import { partBySlug } from "../registry";
import { axisValue, resizeOf } from "../resize";

/* Screen templates are plain data: a tree of real parts in auto layout containers, flattened into the
 * groups a document holds. The words carry all four languages and are picked when the screen is
 * added, because most parts only have a Chinese seed of their own and tables have none. */

export type Say = Record<Lang, string>;
export const say = (en: string, zh: string, ja: string, ko: string): Say => ({ en, zh, ja, ko });

export type TemplateFrame = "phone" | "tablet" | "desktop";
export type TemplateCategory = "flow" | "auth" | "shop" | "social" | "content" | "tools" | "desktop";

type Props = Record<string, unknown>;
/** where a tap goes: the id of a screen in the same template, or back */
type Link = { to: string; transition: Transition };
export const go = (to: string, transition: Transition = "slide"): Link => ({ to, transition });
export const back = (): Link => ({ to: BACK_TARGET, transition: "slide" });

/** one part in the tree, with what it holds */
export type Node = { slug: string; props: Props; name?: Say; fill?: boolean; action?: Link; actions?: Record<string, Link | undefined>; note?: Say; kids?: Node[] };
type Extra = Pick<Node, "name" | "fill" | "action" | "actions" | "note">;

export const part = (slug: string, props: Props = {}, extra: Extra = {}): Node => ({ slug, props, ...extra });

const NAME = {
  screen: say("Screen", "屏幕", "画面", "화면"),
  body: say("Body", "内容区", "本文", "본문"),
  main: say("Main", "主区域", "メイン", "메인"),
  column: say("Column", "竖排", "縦並び", "세로"),
  row: say("Row", "横排", "横並び", "가로"),
  grid: say("Grid", "网格", "グリッド", "격자"),
  panel: say("Panel", "面板", "パネル", "패널"),
};

/* a container in a layout has no words or paint of its own unless a template asks for them */
const BARE = { label: "", fill: "none", border: "none", radius: 0, padX: 0, padY: 0 };

/** parts one under another, each as wide as the column; as tall as they add up to */
export const col = (props: Props, kids: Node[], extra: Extra = {}): Node => ({ slug: "container", props: { ...BARE, layout: "column", gap: 12, align: "stretch", hugHeight: true, ...props }, name: NAME.column, ...extra, kids });
/** parts side by side, centered across; as tall as the tallest */
export const row = (props: Props, kids: Node[], extra: Extra = {}): Node => ({ slug: "container", props: { ...BARE, layout: "row", gap: 8, align: "center", hugHeight: true, ...props }, name: NAME.row, ...extra, kids });
/** equal columns; a part takes the width of its cell */
export const grid = (columns: number, props: Props, kids: Node[], extra: Extra = {}): Node => ({ slug: "container", props: { ...BARE, layout: "grid", columns, gap: 12, align: "stretch", hugHeight: true, ...props }, name: NAME.grid, ...extra, kids });
/** a column on a tinted, rounded ground */
export const panel = (props: Props, kids: Node[], extra: Extra = {}): Node => col({ fill: "surface-container-low", radius: 16, padX: 16, padY: 16, ...props }, kids, { name: NAME.panel, ...extra });

export const txt = (text: Say | string, style = "body", more: Props = {}, extra: Extra = {}): Node => part("text", { text, style, ...more }, extra);

/** one screen of a template, its positions still to be worked out */
export type ScreenSeed = { id: string; name: Say; frame: TemplateFrame; length?: number; note?: Say; bg?: ColorToken; root: Node };

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
};

const SIZE: Record<TemplateFrame, { w: number; h: number }> = { phone: { w: PHONE_W, h: PHONE_H }, tablet: { w: TABLET_W, h: TABLET_H }, desktop: { w: DESKTOP_W, h: DESKTOP_H } };

/** the frame fields a template's screen size comes down to: a phone is what a frame is by default */
const frameFields = (frame: TemplateFrame): Pick<Frame, "w" | "h"> => (frame === "phone" ? {} : SIZE[frame]);

type Screen = { id: string; name: Say; frame?: TemplateFrame; length?: number; note?: Say; bg?: ColorToken; top?: Node[]; bottom?: Node[]; body: Node[]; bodyProps?: Props };

/** A screen: a column the size of the device with the bars at its ends and a body that takes what is
 *  left between them. With no bars the body is the whole screen. */
export function screen({ id, name, frame = "phone", length, note, bg, top = [], bottom = [], body, bodyProps }: Screen): ScreenSeed {
  const { w, h } = SIZE[frame];
  const size = { width: w, height: Math.max(length ?? 0, h), hugHeight: false };
  const inner = { padX: 16, padY: 16, gap: 16, ...bodyProps };
  const root =
    top.length || bottom.length
      ? col({ ...size, gap: 0 }, [...top, col({ ...inner, hugHeight: false }, body, { name: NAME.body, fill: true }), ...bottom], { name: NAME.screen })
      : col({ ...inner, ...size }, body, { name: NAME.screen });
  return { id, name, frame, length, note, bg, root };
}

/** A desktop screen: what stands at its side, and a main column beside it. */
export function deskScreen({ id, name, length, note, side, body, bodyProps }: { id: string; name: Say; length?: number; note?: Say; side?: Node; body: Node[]; bodyProps?: Props }): ScreenSeed {
  const { w, h } = SIZE.desktop;
  const main = col({ padX: 24, padY: 24, gap: 16, hugHeight: false, ...bodyProps }, body, { name: NAME.main, fill: true });
  const root = row({ width: w, height: Math.max(length ?? 0, h), gap: 0, align: "stretch", hugHeight: false }, side ? [side, main] : [main], { name: NAME.screen });
  return { id, name, frame: "desktop", length, note, root };
}

/* ---------- from seed to document ---------- */

/** a group as a template keeps it: words still in every language, links still by screen id */
export type SeedGroup = Omit<Group, "items" | "name"> & { name?: Say; items: (Omit<Item, "note"> & { note?: Say })[] };

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
      ...(node.fill ? { flowFill: true } : {}),
      ...(node.action ? { action: node.action } : {}),
      ...(Object.keys(actions).length ? { actions } : {}),
      ...(node.note ? { note: node.note } : {}),
    };
    out.push({ id, x: 0, y: 0, axis: "x", ...(node.name ? { name: node.name } : {}), ...(inFlow ? { inFlow } : {}), items: [item] });
    for (const kid of node.kids ?? []) visit(kid, id);
  };
  visit(seed.root);
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
      out[it.id] = (ax?.width && axisValue(ax.width, it.props)) || def.w;
      out[`${it.id}:h`] = (ax?.height && axisValue(ax.height, it.props)) || def.h;
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

/** A template as document data: new ids throughout, the words of `lang`, the screens side by side
 *  from (x, y), each named apart from the names in `taken`. */
export function instantiate(template: Pick<Template, "build">, lang: Lang, at: { x: number; y: number } = { x: 0, y: 0 }, taken: string[] = []): { frames: Frame[]; groups: Group[] } {
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
    const size = SIZE[seed.frame];
    frames.push({
      id: frameIds.get(seed.id)!,
      name,
      x,
      y: at.y,
      ...frameFields(seed.frame),
      ...(seed.length && seed.length > size.h ? { length: seed.length } : {}),
      ...(seed.note ? { note: seed.note[lang] } : {}),
      ...(seed.bg ? { bg: seed.bg } : {}),
    });
    const seeded = seedGroups(seed);
    const groupIds = new Map(seeded.map((g) => [g.id, uid()]));
    const link = (a: Action): Action => ({ ...a, to: frameIds.get(a.to) ?? a.to });
    for (const g of seeded) {
      const { name: groupName, inFlow, items, ...rest } = g;
      groups.push({
        ...rest,
        id: groupIds.get(g.id)!,
        x: x + g.x,
        y: at.y + g.y,
        ...(groupName ? { name: groupName[lang] } : {}),
        ...(inFlow ? { inFlow: groupIds.get(inFlow)! } : {}),
        items: items.map((it) => {
          const { note, ...item } = it;
          return {
            ...item,
            id: uid(),
            props: inLang(it.props, lang),
            ...(note ? { note: note[lang] } : {}),
            ...(it.action ? { action: link(it.action) } : {}),
            ...(it.actions ? { actions: Object.fromEntries(Object.entries(it.actions).map(([k, a]) => [k, link(a)])) } : {}),
          };
        }),
      });
    }
    x += size.w + FRAME_GAP;
  }
  return { frames, groups: arranged(groups) };
}
