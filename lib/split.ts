import { partBySlug, reader } from "../parts/registry";
import type { Lang } from "./i18n";
import { holdsParts, makeItem, type Group, type Item } from "./tokens";

/* A split view (`split-view`): two panes side by side, or one over the other, both showing at once, and a divider
 * between them. Each pane is a real container of its own: a group whose `inFlow` is the split view and whose
 * `splitPane` says which pane it is, laid out by its own auto layout, so it holds any parts, another split view among
 * them. The split view decides only how long each pane is along its axis (`splitSizes`); lib/flow.ts gives the panes
 * those sizes and the panes lay out what they hold. A pane is no tab: a dock's `pane` shows one tab at a time, and
 * nothing here hides a pane for the other.
 *
 * What a split's numbers mean: `split` is the design's share of the first pane, in percent of the room the divider
 * leaves, written by the canvas's divider handle and the panel, and kept in the document. A visitor dragging the
 * divider in the preview or an exported app changes their own share (UI state, the part's `input`): it starts from the
 * design each time the screen is opened, unless `persist` asks the app to remember it on that device. */

export const SPLIT_SLUG = "split-view";
export type PaneSide = "first" | "second";
export const PANE_SIDES: readonly PaneSide[] = ["first", "second"];

/** the room the divider takes between the panes: a hairline, or a gap the grip stands in */
export const DIVIDER_SIZE: Record<string, number> = { line: 1, gap: 8 };

/** A split view's numbers, read safely: a file edited by hand may say anything. */
export type Split = {
  /** one pane over the other (a divider across), rather than side by side */
  vertical: boolean;
  /** the first pane's share of the room, 0–100 */
  share: number;
  /** the least and most each pane may be along the axis, in px; 0 is no limit */
  min: [number, number];
  max: [number, number];
  /** which pane folds away, if either */
  collapsible: "none" | PaneSide;
  /** what the folded pane keeps: nothing, or a strip of icons (56–80) */
  collapsedSize: number;
  /** the folding pane starts folded */
  collapsed: boolean;
  /** the divider's own thickness along the axis */
  divider: number;
};

/** whether a part is a split view */
export const isSplitItem = (it: Item | undefined): boolean => it?.component === SPLIT_SLUG;

/** A split view's numbers, or null for any other part. Narrower than its breakpoint, a split that stacks lays its panes
 *  one over the other, as every platform does at that width (the part's `compact`). */
export function splitOfItem(it: Item | undefined): Split | null {
  if (!it || !isSplitItem(it)) return null;
  const def = partBySlug(it.component);
  if (!def) return null;
  const p = reader(def, it.props);
  const stacks = p.s("compact") === "stack" && p.n("width") < p.n("breakpoint");
  const collapsible = p.s("collapsible");
  return {
    vertical: p.s("orientation") === "vertical" || stacks,
    share: Math.max(0, Math.min(100, p.n("split"))),
    min: [Math.max(0, p.n("minFirst")), Math.max(0, p.n("minSecond"))],
    max: [Math.max(0, p.n("maxFirst")), Math.max(0, p.n("maxSecond"))],
    collapsible: collapsible === "first" || collapsible === "second" ? collapsible : "none",
    collapsedSize: Math.max(0, p.n("collapsedSize")),
    collapsed: collapsible !== "none" && p.b("collapsed"),
    divider: DIVIDER_SIZE[p.s("divider")] ?? DIVIDER_SIZE.line,
  };
}

/** a group's split, when it is a split view that holds its panes */
export const splitOf = (g: Group | undefined): Split | null => (g && holdsParts(g) ? splitOfItem(g.items[0]) : null);

/** The least a pane may be: its own limit, and for the pane that folds more than its folded size (the divider's
 *  library folds a pane dragged below its least). */
export const leastOf = (s: Split, i: 0 | 1): number => {
  const own = s.min[i];
  return s.collapsible === PANE_SIDES[i] ? Math.max(own, s.collapsedSize + 1) : own;
};

/** How long each pane is along the axis of a split `length` long, the divider between them: the share, kept inside
 *  both panes' limits, or the folding pane folded (by the design, or dragged below half way to its least). */
export function splitSizes(s: Split, length: number): { first: number; second: number; collapsed: PaneSide | null } {
  const room = Math.max(0, length - s.divider);
  const most = (v: number) => (v > 0 ? v : Infinity);
  const raw = (s.share / 100) * room;
  const sizes = (first: number, collapsed: PaneSide | null) => ({ first, second: room - first, collapsed });
  const folds = (i: 0 | 1, own: number) => s.collapsible === PANE_SIDES[i] && (s.collapsed || own < (s.collapsedSize + leastOf(s, i)) / 2);
  if (folds(0, raw)) return sizes(Math.min(room, s.collapsedSize), "first");
  if (folds(1, room - raw)) return sizes(room - Math.min(room, s.collapsedSize), "second");
  const lo = Math.max(leastOf(s, 0), room - most(s.max[1]));
  const hi = Math.min(most(s.max[0]), room - leastOf(s, 1));
  /* limits that cannot all hold: the first pane keeps its least */
  const first = lo <= hi ? Math.max(lo, Math.min(hi, raw)) : Math.min(room, lo);
  return sizes(Math.max(0, first), null);
}

/** The share a split can take, from the least of the first pane to its most, in percent of `length`'s room. */
export function shareRange(s: Split, length: number): { min: number; max: number } {
  const room = Math.max(1, length - s.divider);
  const most = (v: number) => (v > 0 ? v : Infinity);
  const lo = Math.max(leastOf(s, 0), room - most(s.max[1]));
  const hi = Math.min(most(s.max[0]), room - leastOf(s, 1));
  const pct = (v: number) => Math.max(0, Math.min(100, (v / room) * 100));
  return { min: pct(Math.max(0, lo)), max: pct(Math.max(lo, hi)) };
}

/** A split view's panes, by side: the first group of each side whose layout is the split's. */
export function panesOfSplit(groups: Group[], splitId: string): Partial<Record<PaneSide, Group>> {
  const out: Partial<Record<PaneSide, Group>> = {};
  for (const g of groups) if (g.inFlow === splitId && g.splitPane && !out[g.splitPane] && canBePane(g)) out[g.splitPane] = g;
  return out;
}

/** a container that lays out what it holds (a box, a plain container) can be a pane */
export const canBePane = (g: Group): boolean => holdsParts(g) && !!partBySlug(g.items[0]?.component)?.flow;

/** the pane a group is, when it is one of a split view's panes */
export function paneSideOf(g: Group | undefined, groups: Group[]): PaneSide | undefined {
  if (!g?.splitPane || !g.inFlow) return undefined;
  const host = groups.find((x) => x.id === g.inFlow);
  return host && splitOf(host) && panesOfSplit(groups, host.id)[g.splitPane] === g ? g.splitPane : undefined;
}

/** what a new pane is called in the layers */
export const PANE_NAMES: Record<PaneSide, Record<Lang, string>> = {
  first: { en: "First pane", zh: "第一栏", ja: "第 1 ペイン", ko: "첫째 창" },
  second: { en: "Second pane", zh: "第二栏", ja: "第 2 ペイン", ko: "둘째 창" },
};

/** a new pane: a bare box laying out what it is given in a column, as big as its split gives it */
export function newPane(side: PaneSide, host: Group, id: string, itemId: string, lang: Lang): Group {
  const it: Item = { ...makeItem("box"), id: itemId, props: { surface: "none", layout: "column", gap: 8, padX: 16, padY: 16, align: "stretch", hugWidth: false, hugHeight: false } };
  return { id, x: host.x, y: host.y, axis: "x", inFlow: host.id, splitPane: side, name: PANE_NAMES[side][lang] ?? PANE_NAMES[side].en, items: [it] };
}

/** Every split view with its two panes, each right after it in the order the layouts go by, and nothing else laid out
 *  by it: a pane missing (a split just added, a file edited by hand) is made, empty; what names the split as its
 *  layout without being one of its panes is its own again, and a group marked as a pane of nothing is a plain box.
 *  The same array when every split is whole. */
export function withSplitPanes(groups: Group[], newId: () => string, lang: Lang): Group[] {
  const splits = groups.filter((g) => !!splitOf(g));
  const splitIds = new Set(splits.map((g) => g.id));
  let out = groups;
  /* what is marked as a pane where there is no split, or is a second pane of a side, or cannot lay anything out */
  const kept = new Set(splits.flatMap((g) => Object.values(panesOfSplit(groups, g.id)).map((p) => p!.id)));
  if (groups.some((g) => (g.splitPane !== undefined || (g.inFlow !== undefined && splitIds.has(g.inFlow))) && !kept.has(g.id)))
    out = groups.map((g) => {
      if (kept.has(g.id) || (g.splitPane === undefined && !(g.inFlow !== undefined && splitIds.has(g.inFlow)))) return g;
      const { splitPane: _was, ...rest } = g;
      if (rest.inFlow !== undefined && splitIds.has(rest.inFlow)) delete rest.inFlow;
      return rest;
    });
  for (const host of splits) {
    const panes = panesOfSplit(out, host.id);
    if (panes.first && panes.second) continue;
    const at = out.findIndex((g) => g.id === host.id);
    const made = PANE_SIDES.filter((side) => !panes[side]).map((side) => newPane(side, host, newId(), newId(), lang));
    const first = panes.first ? [] : made.filter((g) => g.splitPane === "first");
    const second = made.filter((g) => g.splitPane === "second");
    out = [...out.slice(0, at + 1), ...first, ...out.slice(at + 1)];
    if (second.length) {
      /* after the first pane and what it holds, before anything the second already holds (there is none) */
      const firstPane = panesOfSplit(out, host.id).first!;
      const inside = descendantsOf(out, firstPane.id);
      let pos = out.findIndex((g) => g.id === firstPane.id) + 1;
      while (pos < out.length && inside.has(out[pos].id)) pos++;
      out = [...out.slice(0, pos), ...second, ...out.slice(pos)];
    }
  }
  return out;
}

/** what lies inside a group through the layouts, at any depth */
function descendantsOf(groups: Group[], id: string, into = new Set<string>()): Set<string> {
  for (const g of groups)
    if (g.inFlow === id && !into.has(g.id)) {
      into.add(g.id);
      descendantsOf(groups, g.id, into);
    }
  return into;
}
