import { settleSizes } from "../parts/atoms";
import { arranged, defaultMeasures, inLang, seedGroups, type Node, type ScreenSeed } from "../parts/templates/kit";
import { pickVariant, type KitDef, type KitLook } from "../parts/kits";
import { nameOf } from "../parts/labels";
import { partBySlug, reader } from "../parts/registry";
import { SPLIT_TAPS, nodesOf } from "../parts/defs/splits";
import type { P, PartDef } from "../parts/types";
import { childLayoutFields } from "./flow";
import type { Lang } from "./i18n";
import { recipesOf, styleOf, uxOf } from "./styles";
import { PHONE_MARGIN, frameRect, frameSizeOf, isPhoneFrame, uid, type Action, type Frame, type Group, type Item, type Theme } from "./tokens";

/* Trees of atoms on the canvas: a kit added from the palette, a composite split into what it is
 * made of. Both come down to the same thing: the tree flattened into groups, outermost first, each
 * box's contents named by `inFlow`, laid out once by a guess at their sizes so nothing stands in a
 * heap before it is drawn. The canvas lays them out again by what they measure. */

/** What the document's style is like, for choosing how a kit is composed. Read from the theme
 *  here, so that no kit has to know a style by name. */
export function kitLookOf(theme: Theme): KitLook {
  const r = recipesOf(theme);
  const ux = uxOf(theme);
  const pack = styleOf(theme.style);
  const group = pack?.group ?? "app";
  return {
    group,
    field: r.field,
    bar: r.bar,
    button: r.button,
    list: r.list,
    surface: r.surface,
    toggle: r.toggle,
    nav: r.nav,
    tabs: r.tabs,
    segmented: r.segmented,
    dialog: r.dialog,
    sheet: r.sheet,
    appbar: r.appbar,
    row: r.row,
    card: r.card,
    avatar: r.avatar,
    dialogue: r.dialogue,
    caption: captionOf(theme, group, !!pack),
    compact: !!pack?.compact,
    dark: !!theme.dark,
    margin: ux.margin,
    gap: ux.gap,
    tight: ux.tight,
  };
}

/** How a desktop window of this look is closed. A Mac's face says a Mac and a Windows face says Windows;
 *  otherwise a phone product's desktop app is the Mac one people picture, while desktop software, games and
 *  Material (Android, ChromeOS) put their caption buttons at the right. */
function captionOf(theme: Theme, group: KitLook["group"], styled: boolean): KitLook["caption"] {
  if (theme.font === "apple") return "lights";
  if (theme.font === "segoe") return "buttons";
  return styled && group === "app" ? "lights" : "buttons";
}

type At = { x: number; y: number };

/** The groups a tree of atoms comes to: new ids, the words of `lang`, the outermost box first with
 *  its top left at `at`, everything inside laid out by a guess at its size. A root wider than
 *  `maxWidth` is brought down to it, and what it holds follows. */
export function treeGroups(root: Node, lang: Lang, at: At = { x: 0, y: 0 }, maxWidth?: number): Group[] {
  const seed: ScreenSeed = { id: "tree", name: { en: "", zh: "", ja: "", ko: "" }, frame: "phone", roots: [settleSizes(root)] };
  const seeded = seedGroups(seed);
  const ids = new Map(seeded.map((g) => [g.id, uid()]));
  let groups: Group[] = seeded.map((g) => {
    const { name, inFlow, items, at: _anchor, screenMain: _main, ...rest } = g;
    return {
      ...rest,
      id: ids.get(g.id)!,
      x: 0,
      y: 0,
      ...(name ? { name: name[lang] } : {}),
      ...(inFlow ? { inFlow: ids.get(inFlow)! } : {}),
      items: items.map((it): Item => {
        const { note, ...item } = it;
        return { ...item, id: uid(), props: inLang(it.props, lang), ...(note ? { note: note[lang] } : {}) };
      }),
    };
  });
  if (maxWidth !== undefined) groups = narrowed(groups, maxWidth);
  groups = arranged(groups);
  return moveTo(groups, at);
}

/** the root brought down to a width, when it is wider and has a width of its own to give */
function narrowed(groups: Group[], maxWidth: number): Group[] {
  const [root, ...rest] = groups;
  const it = root?.items[0];
  const width = it?.props?.width;
  if (!it || typeof width !== "number" || width <= maxWidth) return groups;
  return [{ ...root, items: [{ ...it, props: { ...it.props, width: Math.max(0, Math.round(maxWidth)) } }] }, ...rest];
}

/** every group moved so that the first one's top left is at `at` */
export function moveTo(groups: Group[], at: At): Group[] {
  const root = groups[0];
  if (!root) return groups;
  const dx = Math.round(at.x - root.x);
  const dy = Math.round(at.y - root.y);
  return dx || dy ? groups.map((g) => ({ ...g, x: g.x + dx, y: g.y + dy })) : groups;
}

/** how big the outermost box comes out, by the same guesses it was laid out with */
export function treeSize(groups: Group[]): { w: number; h: number } {
  const root = groups[0];
  if (!root) return { w: 0, h: 0 };
  const m = defaultMeasures(groups);
  const it = root.items[0];
  return { w: m[it.id] ?? 0, h: m[`${it.id}:h`] ?? 0 };
}

/** the width a kit is brought down to on a screen: a phone's content width; any larger screen leaves it as composed */
export const roomOn = (frame: Frame | undefined): number | undefined => (frame && isPhoneFrame(frame) ? frameSizeOf(frame).w - PHONE_MARGIN * 2 : undefined);

/** whether a kit, in the variant it would be added as, runs from one edge of the screen to the other */
export const spansScreen = (kit: KitDef, look: KitLook, variant?: string) => pickVariant(kit, look, variant).span === "screen";

/** A kit as groups to add, in the variant asked for or the one that suits the look. On a phone (`screen`)
 *  it is brought down to the content width, or one that spans the screen is made as wide as it. */
export function kitGroups(kit: KitDef, look: KitLook, lang: Lang, opts: { variant?: string; at?: At; screen?: Frame } = {}): Group[] {
  /* what suits is also a matter of the room there is: a one-row composition is not for a phone */
  const room = opts.screen ? (roomOn(opts.screen) ?? frameSizeOf(opts.screen).w) : undefined;
  const variant = pickVariant(kit, room === undefined ? look : { ...look, room }, opts.variant);
  const root = variant.build(look);
  if (variant.span === "screen" && opts.screen) return treeGroups({ ...root, props: { ...root.props, width: frameSizeOf(opts.screen).w } }, lang, opts.at);
  return treeGroups(root, lang, opts.at, roomOn(opts.screen));
}

/** The place a tree lands with its top left near (x, y): on the screen under its middle, inside that
 *  screen's margins where it fits, on the screen's 4dp grid. One that spans the screen (`edge`) stands
 *  against its left edge. Off any screen it stays where it is. */
export function landTree(groups: Group[], x: number, y: number, frames: Frame[], edge = false): { groups: Group[]; frame?: Frame } {
  const { w, h } = treeSize(groups);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const frame = frames.find((f) => {
    const r = frameRect(f);
    return cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b;
  });
  if (!frame) return { groups: moveTo(groups, { x: Math.round(x), y: Math.round(y) }) };
  const r = frameRect(frame);
  const margin = Math.min(PHONE_MARGIN, Math.max(0, (r.r - r.l - w) / 2));
  const fit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const nx = edge ? r.l : fit(x, r.l + margin, Math.max(r.l + margin, r.r - margin - w));
  const ny = fit(y, r.t + (edge ? 0 : margin), Math.max(r.t + (edge ? 0 : margin), r.b - (edge ? 0 : margin) - h));
  const grid = (v: number, origin: number) => origin + Math.round((v - origin) / 4) * 4;
  return { groups: moveTo(groups, { x: grid(nx, r.l), y: grid(ny, r.t) }), frame };
}

/* ---------- a composite split into atoms ---------- */

/** whether a part can be split into atoms */
export const canSplit = (it: Item | undefined) => !!it && !!partBySlug(it.component)?.atoms;

/** What is kept of the part a split replaces: where it stands, what it is called, what a tap on it
 *  does, how it is painted, what it was said to be, and what it asks of the layout it stands in. */
function carried(g: Group, it: Item, root: Group, width: number | undefined, title: string): Group {
  const rootItem = root.items[0];
  const { x: _x, y: _y, id: _id, items: _items, ...own } = root;
  const keep = { inFlow: g.inFlow, pane: g.pane, hidden: g.hidden, showWhen: g.showWhen, locked: g.locked, name: g.name ?? root.name ?? title };
  const defined = Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined));
  const props = typeof width === "number" && typeof rootItem.props?.width === "number" ? { ...rootItem.props, width } : rootItem.props;
  return {
    ...own,
    ...defined,
    id: g.id,
    x: g.x,
    y: g.y,
    items: [
      {
        ...rootItem,
        id: it.id,
        props,
        ...(it.action ? { action: it.action } : {}),
        ...(it.note ? { note: it.note } : {}),
        ...(it.fill ? { fill: it.fill } : {}),
        ...(it.textColor ? { textColor: it.textColor } : {}),
        ...(it.corners ? { corners: it.corners } : {}),
        ...(it.look ? { look: it.look } : {}),
        ...childLayoutFields(it),
      },
    ],
  };
}

/** atoms a tap is meant for: what a slot's words or icon on one of them say is that slot */
const TAPPABLE = new Set(["button", "icon-button"]);
/** the props an atom shows words under */
const SHOWN = ["text", "label", "placeholder", "value"];

/** the one node of `nodes` that `pick` takes, with what it took; none when no node or several do */
function onlyOne<T>(nodes: Node[], pick: (n: Node) => T | undefined): [Node, T] | undefined {
  let found: [Node, T] | undefined;
  for (const n of nodes) {
    const v = pick(n);
    if (v === undefined) continue;
    if (found) return undefined;
    found = [n, v];
  }
  return found;
}

/** What a part's slots and variables come to on the atoms of the tree it splits into: each tap of a slot on the atom
 *  that now takes it, each bound prop on the atom that now shows it. The split's own map says it where it can
 *  (parts/defs/splits.ts `SPLIT_TAPS`); else a slot goes to the one button saying its words or showing its icon, and a
 *  variable to the one atom showing the prop's words. What finds no single atom is not kept. The root is never one:
 *  it keeps the part's own tap. */
export function splitTaps(def: PartDef, p: P, tree: Node, it: Pick<Item, "actions" | "bind">): { actions: Map<Node, Action>; binds: Map<Node, Record<string, string>> } {
  const map = SPLIT_TAPS[def.slug];
  const nodes = nodesOf(tree).slice(1);
  const inside = new Set(nodes);
  const actions = new Map<Node, Action>();
  const binds = new Map<Node, Record<string, string>>();
  const slots = def.slots?.(p) ?? [];
  const mapped = map?.slots?.(p, tree) ?? {};
  for (const [key, action] of Object.entries(it.actions ?? {})) {
    const slot = slots.find((s) => s.key === key);
    if (!action || !slot) continue;
    const said = (n: Node) => (TAPPABLE.has(n.slug) && ((!!slot.label && n.props.label === slot.label) || (!!slot.icon && n.props.icon === slot.icon))) || undefined;
    const to = key in mapped ? mapped[key] : onlyOne(nodes, said)?.[0];
    if (to && inside.has(to) && !actions.has(to)) actions.set(to, action);
  }
  const named = map?.binds?.(p, tree) ?? {};
  for (const [key, id] of Object.entries(it.bind ?? {})) {
    if (typeof id !== "string") continue;
    const d = def.props.find((x) => x.key === key);
    /* words shown as they are, or a count shown in words */
    const words = d?.kind === "text" ? p.s(key) : d?.kind === "number" ? String(Math.round(p.n(key))) : "";
    const shows = (n: Node) => SHOWN.find((k) => typeof n.props[k] === "string" && n.props[k] === words);
    const to = key in named ? named[key] : words ? onlyOne(nodes, shows) : undefined;
    if (!to || !inside.has(to[0])) continue;
    binds.set(to[0], { ...binds.get(to[0]), [to[1]]: id });
  }
  return { actions, binds };
}

/** The document with one composite replaced, in place, by the atoms it is made of: the same place on
 *  the screen and in the order things are drawn, as wide as it measured, under its name, with the tap
 *  it had on the outermost box. The outermost box keeps the part's ids, so what selected it or laid it
 *  out still does. Null when the part cannot be split. */
export function splitIntoAtoms(groups: Group[], itemId: string, lang: Lang, widths: Record<string, number> = {}): { groups: Group[]; rootItemId: string } | null {
  const at = groups.findIndex((g) => g.items.length === 1 && g.items[0].id === itemId && !g.instanceOf && !g.free);
  if (at < 0) return null;
  const g = groups[at];
  const it = g.items[0];
  const def = partBySlug(it.component);
  if (!def?.atoms) return null;
  const p = reader(def, it.props);
  const tree = def.atoms(p) as Node;
  /* the taps on its slots and the variables its props follow go to the atoms that now show them; the groups come
   * in the order of the tree, each node before what it holds */
  const taps = splitTaps(def, p, tree, it);
  const order = nodesOf(tree);
  const laidOut = treeGroups(tree, lang, { x: g.x, y: g.y });
  const made = laidOut.map((x, i) => {
    const node = laidOut.length === order.length ? order[i] : undefined;
    const action = node && taps.actions.get(node);
    const bind = node && taps.binds.get(node);
    return action || bind ? { ...x, items: [{ ...x.items[0], ...(action ? { action } : {}), ...(bind ? { bind } : {}) }] } : x;
  });
  const measured = widths[it.id];
  /* the box is called what the part was, so it can still be found by that in the layers */
  const root = carried(g, it, made[0], measured !== undefined ? Math.round(measured) : undefined, nameOf(def, lang));
  const inside = made.slice(1).map((x) => (x.inFlow === made[0].id ? { ...x, inFlow: g.id } : x));
  /* laid out again from the part's own corner, at its own width; the layout it stands in, if any, is not
   * among these, so it is set aside meanwhile rather than let go */
  const { inFlow, ...loose } = root;
  const laid = moveTo(arranged([loose, ...inside]), { x: g.x, y: g.y }).map((x, i) => (i === 0 && inFlow ? { ...x, inFlow } : x));
  return { groups: [...groups.slice(0, at), ...laid, ...groups.slice(at + 1)], rootItemId: it.id };
}
