import { settleSizes } from "../parts/atoms";
import { arranged, defaultMeasures, inLang, seedGroups, type Node, type ScreenSeed } from "../parts/templates/kit";
import { kitBySlug, pickVariant, type KitDef, type KitLook, type KitVariant } from "../parts/kits";
import { nameOf } from "../parts/labels";
import { partBySlug, reader } from "../parts/registry";
import { resizeOf } from "../parts/resize";
import { fullWidth, roleOf } from "../parts/role";
import { SPLIT_TAPS, nodesOf } from "../parts/defs/splits";
import { RETIRED_TAPS } from "../parts/defs/retired";
import type { P, PartDef } from "../parts/types";
import { childLayoutFields } from "./flow";
import type { Lang } from "./i18n";
import { collectionName, foldRows, retiredRows } from "./retire";
import { conformGroups } from "./styleRules";
import { recipesOf, styleOf, uxOf, type StyleContext } from "./styles";
import { barSlotOf } from "./tidy";
import { PHONE_MARGIN, frameOfGroup, frameOfPart, frameRect, frameSizeOf, groupBounds, isPhoneFrame, safeAreaOf, uid, type Action, type ActionBody, type Collection, type ComponentDef, type Condition, type Frame, type Group, type Item, type KitMark, type Theme } from "./tokens";

/* Trees of atoms on the canvas: a kit added from the palette, a composite split into what it is
 * made of. Both come down to the same thing: the tree flattened into groups, outermost first, each
 * box's contents named by `inFlow`, laid out once by a guess at their sizes so nothing stands in a
 * heap before it is drawn. The canvas lays them out again by what they measure. */

/** What the document's style is like, for choosing how a kit is composed. Read from the theme
 *  here, so that no kit has to know a style by name. */
export function kitLookOf(theme: Theme, styles?: StyleContext): KitLook {
  const r = recipesOf(theme, styles);
  const ux = uxOf(theme, styles);
  const pack = styleOf(theme.style, styles);
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

type KitOpts = { variant?: string; at?: At; screen?: Frame; theme?: Theme };

/** a kit composed for a look, with the variant it came as */
function composed(kit: KitDef, look: KitLook, lang: Lang, opts: KitOpts): { groups: Group[]; variant: KitVariant } {
  /* what suits is also a matter of the room there is: a one-row composition is not for a phone */
  const room = opts.screen ? (roomOn(opts.screen) ?? frameSizeOf(opts.screen).w) : undefined;
  const variant = pickVariant(kit, room === undefined ? look : { ...look, room }, opts.variant);
  const root = variant.build(look);
  const groups =
    variant.span === "screen" && opts.screen ? treeGroups({ ...root, props: { ...root.props, width: frameSizeOf(opts.screen).w } }, lang, opts.at) : treeGroups(root, lang, opts.at, roomOn(opts.screen));
  if (!groups.length) return { groups, variant };
  /* the box remembers what it is, and what it said, so a change of style can compose it again */
  const auto = !(opts.variant && kit.variants.some((v) => v.key === opts.variant));
  const mark: KitMark = { slug: kit.slug, variant: variant.key, auto, sig: kitSig(groups, groups[0].id, opts.theme) };
  return { groups: [{ ...groups[0], kit: mark }, ...groups.slice(1)], variant };
}

/** A kit as groups to add, in the variant asked for or the one that suits the look. On a phone (`screen`)
 *  it is brought down to the content width, or one that spans the screen is made as wide as it. The outermost
 *  box is marked with the kit (`Group.kit`), signed as the rules of `theme` leave it. */
export function kitGroups(kit: KitDef, look: KitLook, lang: Lang, opts: KitOpts = {}): Group[] {
  return composed(kit, look, lang, opts).groups;
}

/** What is on the canvas where a tree lands: the parts it may stand beside, as they measure, and the margin the
 *  style keeps (what floats at the foot keeps it from the bar below). */
export type Landing = { groups: Group[]; widths: Record<string, number>; margin?: number };

/** how far apart two bars may stand and still be one stack along an edge */
const STACKED = 4;

/** A tree whose outermost box is pinned to an edge of `frame` (a kit's top bar, tab bar, buy bar or sheet), put on
 *  that edge as a bar dropped there goes: beside the rails, inside the device's own bars, past the bars already
 *  stacked on that edge, and as wide as the room between the rails when it spans the screen. Null when it is not
 *  pinned. */
function onEdge(groups: Group[], frame: Frame, frames: Frame[], on: Landing): Group[] | null {
  const top = groups[0]?.items[0];
  const role = top && roleOf(top);
  if (role !== "top" && role !== "bottom" && role !== "floatingBottom") return null;
  const slot = barSlotOf(on.groups, frame, frames, on.widths);
  const width = top.props?.width;
  /* a bar spans the room the rails leave it; what it holds is laid out again for that width */
  const sized = fullWidth(top) && typeof width === "number" && width !== slot.w ? arranged([{ ...groups[0], items: [{ ...top, props: { ...top.props, width: slot.w } }] }, ...groups.slice(1)]) : groups;
  const { w, h } = treeSize(sized);
  const r = frameRect(frame);
  const safe = safeAreaOf(frame);
  const bars = on.groups.filter((g) => !g.inFlow && g.items.length === 1 && frameOfGroup(g, frames, on.widths)?.id === frame.id);
  const boundsOf = (roles: string[]) => bars.filter((g) => roles.includes(roleOf(g.items[0]) ?? "")).map((g) => groupBounds(g, on.widths));
  const x = Math.round(slot.x + Math.max(0, (slot.w - w) / 2));
  if (role === "top") {
    /* below the bars that already stand one under another from the head of the screen */
    let head = r.t + safe.t;
    const tops = boundsOf(["top"]);
    for (let more = true; more; ) {
      more = false;
      for (const b of tops)
        if (b.t <= head + STACKED && b.b > head) {
          head = b.b;
          more = true;
        }
    }
    return moveTo(sized, { x, y: Math.round(head) });
  }
  /* above the bars that already stand one over another from the foot */
  let foot = r.b - safe.b;
  const feet = boundsOf(["bottom", "floatingBottom"]);
  const gap = role === "floatingBottom" ? (on.margin ?? PHONE_MARGIN) : 0;
  for (let more = true; more; ) {
    more = false;
    for (const b of feet)
      if (b.b >= foot - (on.margin ?? PHONE_MARGIN) - STACKED && b.t < foot) {
        foot = b.t;
        more = true;
      }
  }
  return moveTo(sized, { x, y: Math.round(foot - gap - h) });
}

/** The place a tree lands with its top left near (x, y): on the screen under its middle, inside that
 *  screen's margins where it fits, on the screen's 4dp grid. One that spans the screen (`edge`) stands
 *  against its left edge, and one whose outermost box is pinned to an edge goes to that edge (`on` says
 *  what stands there already). Off any screen it stays where it is. */
export function landTree(groups: Group[], x: number, y: number, frames: Frame[], edge = false, on: Landing = { groups: [], widths: {} }): { groups: Group[]; frame?: Frame } {
  const { w, h } = treeSize(groups);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const frame = frames.find((f) => {
    const r = frameRect(f);
    return cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b;
  });
  if (!frame) return { groups: moveTo(groups, { x: Math.round(x), y: Math.round(y) }) };
  const pinned = onEdge(groups, frame, frames, on);
  if (pinned) return { groups: pinned, frame };
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
export function splitTaps(def: PartDef, p: P, tree: Node, it: Pick<Item, "actions" | "bind">): { actions: Map<Node, Action>; binds: Map<Node, Record<string, string>>; placed: Set<string> } {
  const map = SPLIT_TAPS[def.slug] ?? RETIRED_TAPS[def.slug];
  const nodes = nodesOf(tree).slice(1);
  const inside = new Set(nodes);
  const actions = new Map<Node, Action>();
  const binds = new Map<Node, Record<string, string>>();
  /* the slots whose taps found an atom: what is not among them is lost, and a printer says so */
  const placed = new Set<string>();
  const slots = def.slots?.(p) ?? [];
  const mapped = map?.slots?.(p, tree) ?? {};
  for (const [key, action] of Object.entries(it.actions ?? {})) {
    const slot = slots.find((s) => s.key === key);
    if (!action || !slot) continue;
    const said = (n: Node) => (TAPPABLE.has(n.slug) && ((!!slot.label && n.props.label === slot.label) || (!!slot.icon && n.props.icon === slot.icon))) || undefined;
    const to = key in mapped ? mapped[key] : onlyOne(nodes, said)?.[0];
    if (to && inside.has(to) && !actions.has(to)) {
      actions.set(to, action);
      placed.add(key);
    }
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
  return { actions, binds, placed };
}

/** The document with one composite replaced, in place, by the atoms it is made of: the same place on
 *  the screen and in the order things are drawn, as wide as it measured, under its name, with the tap
 *  it had on the outermost box, composed as `look` (the document's style) composes the part. The
 *  outermost box keeps the part's ids, so what selected it or laid it out still does. Null when the
 *  part cannot be split. */
/** the pin a split bar's box takes, by the screen role of the part it replaces */
const SPLIT_PIN: Record<string, string | undefined> = { top: "top", bottom: "bottom", floatingBottom: "floatingBottom" };

/** What a split of a retired list may make of its rows (lib/retire.ts): the id a new data collection takes, and the
 *  collections there are, so its name is one of its own. */
export type SplitData = { id: string; collections?: Collection[] };

export function splitIntoAtoms(groups: Group[], itemId: string, lang: Lang, widths: Record<string, number> = {}, look?: KitLook, data?: SplitData): { groups: Group[]; rootItemId: string; collection?: Collection } | null {
  const at = groups.findIndex((g) => g.items.length === 1 && g.items[0].id === itemId && !g.instanceOf && !g.free);
  if (at < 0) return null;
  const g = groups[at];
  const it = g.items[0];
  const def = partBySlug(it.component);
  if (!def?.atoms) return null;
  const p = reader(def, it.props);
  /* composed the way the document's style composes the part: the split looks like the part it replaces */
  const plain = def.atoms(p, look) as Node;
  /* the taps on its slots and the variables its props follow go to the atoms that now show them; the groups come
   * in the order of the tree, each node before what it holds */
  const found = splitTaps(def, p, plain, it);
  /* a retired list's rows, when they are alike, become one row repeated over a collection of their own */
  const rows = data ? retiredRows(def, p, lang) : null;
  const folded = rows && data ? foldRows(plain, rows, data.id, found) : null;
  const collection: Collection | undefined = folded && rows && data ? { id: data.id, name: collectionName(nameOf(def, lang), data.collections), fields: rows.fields, rows: rows.rows } : undefined;
  const tree = folded?.tree ?? plain;
  const taps = folded ?? found;
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
  const carriedRoot = carried(g, it, made[0], measured !== undefined ? Math.round(measured) : undefined, nameOf(def, lang));
  /* a bar keeps its place on the screen: standing on its own (not in a layout), the box it becomes is pinned to the
   * edge the part belonged to, so a style's layout keeps it there instead of taking it for a row of the body */
  const pin = !g.inFlow ? SPLIT_PIN[roleOf(it) ?? ""] : undefined;
  const root = pin && carriedRoot.items[0].component === "box" ? { ...carriedRoot, items: [{ ...carriedRoot.items[0], props: { ...carriedRoot.items[0].props, pin } }] } : carriedRoot;
  const inside = made.slice(1).map((x) => (x.inFlow === made[0].id ? { ...x, inFlow: g.id } : x));
  /* laid out again from the part's own corner, at its own width; the layout it stands in, if any, is not
   * among these, so it is set aside meanwhile rather than let go */
  const { inFlow, ...loose } = root;
  const laid = moveTo(arranged([loose, ...inside]), { x: g.x, y: g.y }).map((x, i) => (i === 0 && inFlow ? { ...x, inFlow } : x));
  return { groups: [...groups.slice(0, at), ...laid, ...groups.slice(at + 1)], rootItemId: it.id, ...(collection ? { collection } : {}) };
}

/* ---------- a kit composed again for another style ---------- */

/* A kit's variant is its composition, chosen for the style the document wore when it was added. When the document
 * changes style, mode or the recipes it builds by, a kit nobody has touched since is composed again for the new look,
 * the way a sealed part re-dresses: its outermost box keeps its place, its ids, its name and its taps, and everything
 * inside it is built anew. A kit a person has changed (a word, a part added or taken out, a color) is theirs and is
 * left exactly as it is. What a kit said when it was composed is kept as a signature on its box. */

/** what a layout writes on a part: its width and height where it has numbers for them. Being sized is not a change. */
function measureKeys(it: Item): Set<string> {
  const ax = resizeOf(partBySlug(it.component), it.props);
  return new Set([ax?.width, ax?.height].flatMap((a) => (a?.kind === "number" ? [a.key] : [])));
}

/** what the outermost box asks of the layout it stands in: its own, not the kit's */
const LAYOUT_ASKS = new Set(["flowFill", "flowSize", "alignSelf", "flowAbsolute", "flowMin", "flowMax", "flowSpan"]);
/** where the outermost box stands on its screen (a bar pinned to an edge): its place, not what the kit says */
const PLACE_PROPS = new Set(["pin"]);

/** a value with every object's keys in order and what is undefined left out, so equal content writes equal text */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => [k, stable(o[k])]),
  );
}

/** a short, well-spread hash of a text (cyrb53), in base 36 */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The groups of a kit: its outermost box, then what each box holds, each before what it holds, in the order its
 *  layout goes by. Whatever stands in its boxes counts, whether the kit put it there or a person did. */
export function kitTree(groups: Group[], rootId: string): Group[] {
  const root = groups.find((g) => g.id === rootId);
  if (!root) return [];
  const kids = new Map<string, Group[]>();
  for (const g of groups) if (g.inFlow && g.id !== rootId) kids.set(g.inFlow, [...(kids.get(g.inFlow) ?? []), g]);
  const out: Group[] = [];
  const seen = new Set<string>();
  const visit = (g: Group) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    out.push(g);
    for (const k of kids.get(g.id) ?? []) visit(k);
  };
  visit(root);
  return out;
}

/** What one group of a kit says: its parts, their props, paint and notes, and for one inside the box what it is called
 *  and whether it shows. Not its ids, where it stands or how big it is drawn, nor its taps (they are carried). The
 *  outermost box's place (on the canvas, and the edge it is pinned to), name, lock and visibility are its own and go
 *  with it, as do the taps on it. */
function said(g: Group, root: boolean, depth: number): unknown {
  const items = g.items.map((it) => {
    const sizes = measureKeys(it);
    const props = Object.fromEntries(Object.entries(it.props ?? {}).filter(([k]) => !sizes.has(k) && !(root && PLACE_PROPS.has(k))));
    const { id: _id, props: _props, action: _tap, actions: _taps, row: _row, noteHistory: _was, ...rest } = it;
    const own = root ? Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "note" && !LAYOUT_ASKS.has(k))) : rest;
    return { ...own, props };
  });
  const { id: _id, x: _x, y: _y, axis: _axis, items: _items, inFlow: _in, kit: _kit, pos: _pos, expandedFrom: _from, rowsOf: _rows, screenMain: _main, ...fields } = g;
  return { depth, items, ...(root ? { repeat: fields.repeat } : fields) };
}

/** The signature of what a kit says (see `said`), everything in its boxes, nested as it is: equal while nobody has
 *  changed the kit, however it was moved, sized, renumbered or tapped to. Read as the rules of `theme` leave the
 *  parts (a style held to its rules takes their corners and effects), so a kit those rules have dressed down is
 *  still the kit it was. */
export function kitSig(groups: Group[], rootId: string, theme?: Theme): string {
  const tree = kitTree(groups, rootId);
  const seen = theme ? conformGroups(tree, theme) : tree;
  const depth = new Map<string, number>([[rootId, 0]]);
  const parts = seen.map((g) => {
    const d = g.id === rootId ? 0 : (depth.get(g.inFlow ?? "") ?? 0) + 1;
    depth.set(g.id, d);
    return said(g, g.id === rootId, d);
  });
  return hash(JSON.stringify(stable(parts)));
}

/** whether two themes compose kits alike: the same look, as far as a kit can tell */
export function sameKitLook(a: Theme, b: Theme): boolean {
  return JSON.stringify(kitLookOf(a)) === JSON.stringify(kitLookOf(b));
}

/** every part something reaches for by its id: a tap's effects, a condition on a field, an instance's overrides.
 *  A part reached for inside an instance goes by `instance/part`; the part's own id is the last of it. */
function reachedFor(lists: Group[][]): Set<string> {
  const out = new Set<string>();
  const last = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  const test = (c: Condition | undefined) => {
    if (c && "filled" in c) out.add(last(c.filled));
  };
  const body = (b: ActionBody | undefined) => {
    for (const e of b?.effects ?? []) if ("part" in e) out.add(last(e.part));
  };
  const tap = (a: Action | undefined) => {
    if (!a) return;
    body(a);
    test(a.when);
    body(a.else);
  };
  for (const groups of lists)
    for (const g of groups) {
      test(g.showWhen);
      for (const key of Object.keys(g.overrides ?? {})) out.add(last(key.slice(0, key.lastIndexOf("/"))));
      for (const it of g.items) {
        tap(it.action);
        for (const a of Object.values(it.actions ?? {})) tap(a);
      }
    }
  return out;
}

/** What a part of a kit is known by from one composition to the next: a button by its words or else its glyph,
 *  a box by the words of everything in it, anything else by the words or the glyph it shows. */
function knownBy(g: Group, tree: Group[]): string | undefined {
  const it = g.items[0];
  if (!it) return undefined;
  const words = (x: Item, keys: string[]) => keys.map((k) => x.props?.[k]).filter((v): v is string => typeof v === "string" && !!v);
  if (TAPPABLE.has(it.component ?? "")) {
    const [w] = words(it, ["label", "icon"]);
    return w && `tap:${w}`;
  }
  if (it.component === "box") {
    const inside = kitTree(tree, g.id).flatMap((x) => (x.items[0] ? words(x.items[0], [...SHOWN, "icon", "name"]) : []));
    return inside.length ? `box:${inside.join("\n")}` : undefined;
  }
  const [w] = words(it, [...SHOWN, "icon", "name"]);
  return w && `${it.component}:${w}`;
}

/** The taps on the parts inside a kit, on the parts of its new composition that are known by the same words or glyph:
 *  a back button stays the back button, a row the row that says the same. Null when one has nowhere single to go,
 *  and the kit is then left as it is rather than lose it. */
function carriedTaps(tree: Group[], made: Group[]): Map<string, Pick<Item, "action" | "actions">> | null {
  const out = new Map<string, Pick<Item, "action" | "actions">>();
  const fresh = made.slice(1);
  for (const g of tree.slice(1)) {
    const it = g.items[0];
    if (!it || (!it.action && !Object.keys(it.actions ?? {}).length)) continue;
    const key = knownBy(g, tree);
    const to = key ? fresh.filter((x) => knownBy(x, made) === key) : [];
    if (to.length !== 1 || out.has(to[0].id)) return null;
    out.set(to[0].id, { ...(it.action ? { action: it.action } : {}), ...(it.actions ? { actions: it.actions } : {}) });
  }
  return out;
}

type Recompose = { from: Theme; to: Theme; fromLook: KitLook; toLook: KitLook; same: boolean; lang: Lang; reached: Set<string>; frames?: Frame[]; widths: Record<string, number> };

/** the kit's box signed again for the theme it is now under */
function signed(groups: Group[], rootId: string, theme: Theme | undefined): Group[] {
  const root = groups.find((g) => g.id === rootId);
  if (!root?.kit) return groups;
  const sig = kitSig(groups, rootId, theme);
  return sig === root.kit.sig ? groups : groups.map((g) => (g === root ? { ...g, kit: { ...root.kit!, sig } } : g));
}

/** one kit composed again where it stands, or `groups` (signed again, where the rules changed) when it is to be left */
function recomposeOne(groups: Group[], root: Group, c: Recompose): Group[] {
  const mark = root.kit!;
  const kit = kitBySlug(mark.slug);
  const tree = kitTree(groups, root.id);
  /* changed since it was composed: it is the person's now */
  if (!kit || kitSig(tree, root.id, c.from) !== mark.sig) return groups;
  /* the rules of the new theme may dress it down: it is still the kit it was */
  if (c.same) return signed(groups, root.id, c.to);
  /* something else reaches for a part inside it by its id: a new composition would leave that reaching for nothing */
  if (tree.slice(1).some((g) => g.items.some((it) => c.reached.has(it.id)))) return signed(groups, root.id, c.to);
  const screen = c.frames ? frameOfPart(root, groups, c.frames, c.widths) : undefined;
  const made = composed(kit, c.toLook, c.lang, { variant: mark.auto ? undefined : mark.variant, screen, theme: c.to });
  if (!made.groups.length) return groups;
  /* composed the same for the new look: nothing to do but sign it for the new rules */
  if (made.variant.key === mark.variant && kitSig(made.groups, made.groups[0].id, c.to) === kitSig(tree, root.id, c.to)) return signed(groups, root.id, c.to);
  const taps = carriedTaps(tree, made.groups);
  if (!taps) return signed(groups, root.id, c.to);
  /* how it was composed, to tell what the person set on its box from what the composition did */
  const was = composed(kit, c.fromLook, c.lang, { variant: mark.variant, screen }).groups[0];
  const [top, ...inside] = made.groups;
  const it = root.items[0];
  const props: Record<string, unknown> = { ...top.items[0].props };
  for (const key of ["width", "height"]) {
    const v = it.props?.[key];
    /* a box made wider or narrower than its composition keeps that measure */
    if (typeof v === "number" && typeof props[key] === "number" && v !== was?.items[0]?.props?.[key]) props[key] = v;
  }
  /* the edge it is pinned to is the composition's while nobody has said otherwise: a bar that floats in one look may
   * be docked in another. One pinned by hand, or unpinned (a kit added before boxes were pinned has no pin), stays so */
  for (const key of PLACE_PROPS) {
    const v = it.props?.[key];
    if (v === was?.items[0]?.props?.[key]) continue;
    if (v === undefined) delete props[key];
    else props[key] = v;
  }
  const keep = { pane: root.pane, hidden: root.hidden, showWhen: root.showWhen, locked: root.locked };
  const name = root.name !== undefined && root.name !== was?.name ? root.name : top.name;
  const { x: _x, y: _y, id: _id, items: _items, kit: _kit, name: _name, ...own } = top;
  const box: Group = {
    ...own,
    ...(Object.fromEntries(Object.entries(keep).filter(([, v]) => v !== undefined)) as Partial<Group>),
    ...(name !== undefined ? { name } : {}),
    id: root.id,
    x: root.x,
    y: root.y,
    items: [
      {
        ...top.items[0],
        id: it.id,
        props,
        ...(it.action ? { action: it.action } : {}),
        ...(it.actions ? { actions: it.actions } : {}),
        ...(it.note ? { note: it.note } : {}),
        ...childLayoutFields(it),
      },
    ],
  };
  const kids = inside.map((g) => {
    const tap = taps.get(g.id);
    const placed = g.inFlow === top.id ? { ...g, inFlow: root.id } : g;
    return tap ? { ...placed, items: [{ ...placed.items[0], ...tap }] } : placed;
  });
  /* laid out again from the box's corner; the layout it stands in is not among these, so it is set aside meanwhile.
   * A bar pinned to the foot of its screen keeps its foot there, however tall the new composition comes out */
  const fresh = arranged([box, ...kids]);
  const wasH = c.widths[`${it.id}:h`] ?? treeSize(tree).h;
  const atFoot = !root.inFlow && FOOT_ROLES.has(roleOf(box.items[0]) ?? "");
  /* one floating at the foot keeps its middle; one that comes to span the screen where it floated stands where a bar does */
  const wasW = c.widths[it.id] ?? treeSize(tree).w;
  const x =
    root.inFlow || !roleOf(box.items[0])
      ? root.x
      : roleOf(box.items[0]) === "floatingBottom"
        ? root.x + Math.round((wasW - treeSize(fresh).w) / 2)
        : fullWidth(box.items[0]) && !fullWidth(it) && screen && c.frames
          ? barSlotOf(groups, screen, c.frames, c.widths).x
          : root.x;
  const laid = moveTo(fresh, { x, y: atFoot ? root.y + Math.round(wasH - treeSize(fresh).h) : root.y }).map((g, i) => (i === 0 && root.inFlow ? { ...g, inFlow: root.inFlow } : g));
  laid[0] = { ...laid[0], kit: { slug: kit.slug, variant: made.variant.key, auto: mark.auto, sig: kitSig(laid, root.id, c.to) } };
  /* in the place the box had, among the others, and in the order things are drawn */
  const gone = new Set(tree.map((g) => g.id));
  const at = groups.indexOf(root);
  const placed = [...groups.slice(0, at).filter((g) => !gone.has(g.id)), ...laid, ...groups.slice(at + 1).filter((g) => !gone.has(g.id))];
  /* what stood under it on its screen moves with its foot, so a taller composition does not come to cover it */
  return root.inFlow || atFoot ? placed : makeRoom(placed, new Set(laid.map((g) => g.id)), root, wasH, treeSize(laid).h - wasH, c, screen);
}

/** the roles of what stands at the foot of a screen */
const FOOT_ROLES = new Set(["bottom", "floatingBottom"]);

/** What stands under a kit on its screen, moved by as much as the kit grew or shrank: a composition that comes out
 *  taller would otherwise cover what was below it, and a layout box would take it in. Only what stands free below the
 *  kit's foot and across its width moves, with whatever it holds; what a layout places is placed by it, and what stands
 *  at the screen's own foot (a bar) stays there. */
function makeRoom(groups: Group[], kit: Set<string>, root: Group, wasH: number, dy: number, c: Recompose, screen: Frame | undefined): Group[] {
  if (Math.abs(dy) < 1) return groups;
  const foot = root.y + wasH;
  const w = c.widths[root.items[0].id] ?? (typeof root.items[0].props?.width === "number" ? root.items[0].props.width : 0);
  const bottom = screen ? frameRect(screen).b : Infinity;
  const moving = new Set<string>();
  for (const g of groups) {
    if (kit.has(g.id) || g.inFlow) continue;
    const b = groupBounds(g, c.widths);
    if (b.t < foot - 1 || b.r <= root.x || b.l >= root.x + w || b.b >= bottom - 1) continue;
    if (screen && c.frames && frameOfPart(g, groups, c.frames, c.widths)?.id !== screen.id) continue;
    moving.add(g.id);
  }
  if (!moving.size) return groups;
  /* and what they hold, at any depth */
  for (let grew = true; grew; ) {
    grew = false;
    for (const g of groups)
      if (g.inFlow && moving.has(g.inFlow) && !moving.has(g.id)) {
        moving.add(g.id);
        grew = true;
      }
  }
  const by = Math.round(dy);
  return groups.map((g) => (moving.has(g.id) ? { ...g, y: g.y + by } : g));
}

/** every kit of a list composed again, in turn */
function recomposeAll(groups: Group[], c: Recompose): Group[] {
  let out = groups;
  for (const g of groups) {
    if (!g.kit) continue;
    const root = out.find((x) => x.id === g.id);
    if (root?.kit) out = recomposeOne(out, root, c);
  }
  return out;
}

/** The document's kits composed for a change of theme from `from` to `to`: on every screen and in every definition,
 *  each kit nobody has changed since it was composed takes the variant the new look calls for (or keeps the one chosen
 *  for it by hand, while the kit has it) and is built anew in place. One whose look is the same, or that cannot be
 *  built anew without losing a tap or a part something reaches for, is only signed again for the new rules. The same
 *  document comes back when nothing changed. */
export function recomposeKits<D extends { groups: Group[]; components?: ComponentDef[] }>(doc: D, from: Theme, to: Theme, lang: Lang, opts: { frames?: Frame[]; widths?: Record<string, number>; /** the look `from` came to, when it can no longer be read off `from`: a custom style edited in place keeps its key */ fromLook?: KitLook } = {}): D {
  const marked = (gs: Group[]) => gs.some((g) => g.kit);
  if (!marked(doc.groups) && !doc.components?.some((d) => marked(d.groups))) return doc;
  const fromLook = opts.fromLook ?? kitLookOf(from);
  const toLook = kitLookOf(to);
  const c: Recompose = {
    from,
    to,
    fromLook,
    toLook,
    same: JSON.stringify(fromLook) === JSON.stringify(toLook),
    lang,
    reached: reachedFor([doc.groups, ...(doc.components ?? []).map((d) => d.groups)]),
    frames: opts.frames,
    widths: opts.widths ?? {},
  };
  const groups = recomposeAll(doc.groups, c);
  /* a definition has no screen: its kits keep the room they were composed with */
  const components = doc.components?.map((d) => {
    const next = recomposeAll(d.groups, { ...c, frames: undefined });
    return next === d.groups ? d : { ...d, groups: next };
  });
  const same = groups === doc.groups && (components ?? []).every((d, i) => d === doc.components?.[i]);
  return same ? doc : { ...doc, groups, ...(components ? { components } : {}) };
}

/** The kits of `after`, signed again where in `before` they were still the kits they were added as: what changed
 *  between the two (words put in another language) was no one's change. */
export function resignKits(before: Group[], after: Group[], theme?: Theme): Group[] {
  let out = after;
  for (const g of after) {
    if (!g.kit || !before.some((b) => b.id === g.id)) continue;
    if (kitSig(before, g.id, theme) !== g.kit.sig) continue;
    out = signed(out, g.id, theme);
  }
  return out;
}
