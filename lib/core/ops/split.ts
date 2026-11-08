/* Operations on split views (lib/split.ts): the design's share and fold, a legacy `resizable` turned into a split view
 * with what lay on its panels moved into the panes, and the guard every other operation uses so that a pane stays the
 * pane of its split. A split view is added like any part (add_part, add_tree, a template): its panes come with it. */

import { partBySlug, reader } from "../../../parts/registry";
import { listTextOf } from "../../../parts/labels";
import { childLayoutOf } from "../../flow";
import { newPane, PANE_SIDES, panesOfSplit, paneSideOf, SPLIT_SLUG, splitOf, type PaneSide } from "../../split";
import { groupBounds, heldBy, makeItem, type Group, type Item } from "../../tokens";
import { op, OpError, S } from "../op";
import { withGroups, withSession, type CoreState, type Widths } from "../state";
import { freshId, itemById, laidOut, unlocked } from "./common";

/** the groups that are a split view's panes */
export function paneGroups(groups: Group[]): Set<string> {
  return new Set(groups.filter((g) => paneSideOf(g, groups)).map((g) => g.id));
}

/** Refuses to do `what` to a pane on its own: a pane is its split view's, made with it and gone with it. `ids` names
 *  parts or groups. */
export function refusePanes(s: CoreState, ids: Iterable<string>, what: string): void {
  const panes = paneGroups(s.doc.groups);
  if (!panes.size) return;
  for (const id of ids) {
    const g = s.doc.groups.find((x) => x.id === id || x.items.some((it) => it.id === id));
    if (g && panes.has(g.id)) throw new OpError("refused", `${JSON.stringify(id)} is a pane of a split view: it cannot be ${what} on its own. Change the split view (set_split, set_props), or what the pane holds.`, id);
  }
}

/** a split view by the id of its part or its group */
function splitById(s: CoreState, id: string): { group: Group; item: Item } {
  const g = s.doc.groups.find((x) => x.id === id) ?? s.doc.groups.find((x) => x.items.some((it) => it.id === id));
  if (!g) throw new OpError("not_found", `There is no part ${JSON.stringify(id)} on the canvas.`, id);
  if (!splitOf(g)) throw new OpError("invalid_value", `${JSON.stringify(id)} is ${g.items[0]?.component ?? "no part"}, not a split view.`, id);
  return { group: g, item: g.items[0] };
}

/** The design's share of a split view's first pane, and which of its panes starts folded. */
export const setSplit = op<{ id: string; split?: number; collapsed?: boolean }>({
  name: "set_split",
  summary:
    "Sets a split view's design: split (the first pane's share, 0–100, of the room the divider leaves) and collapsed (its folding pane starts folded; the pane that folds is its `collapsible` prop). Limits and the rest are props (set_props: minFirst, maxFirst, minSecond, maxSecond in px, collapsible, collapsedSize, orientation, divider, compact, breakpoint, persist).",
  args: S.obj({ id: S.str("the split view's part id"), split: S.num("the first pane's share in percent", { minimum: 0, maximum: 100 }), collapsed: S.bool("its folding pane starts folded") }, ["id"]),
  label: () => "Split",
  run(s, a, ctx) {
    const { group, item } = splitById(s, a.id);
    unlocked(group, "That split view");
    if (a.split === undefined && a.collapsed === undefined) throw new OpError("nothing_to_do", "Give split, collapsed or both.");
    const sp = splitOf(group)!;
    if (a.collapsed !== undefined && sp.collapsible === "none") throw new OpError("refused", 'Neither pane of that split view folds: set its collapsible prop to "first" or "second" first.', a.id);
    const props = { ...item.props, ...(a.split !== undefined ? { split: Math.round(a.split * 100) / 100 } : {}), ...(a.collapsed !== undefined ? { collapsed: a.collapsed } : {}) };
    const groups = s.doc.groups.map((g) => (g === group ? { ...g, items: [{ ...item, props }] } : g));
    return { state: laidOut(withGroups(s, groups), ctx.widths) };
  },
});

/** where a part stands, by its centre */
const centreOf = (g: Group, widths: Widths) => {
  const b = groupBounds(g, widths);
  return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
};

/** A legacy `resizable` (two panels of words, with parts laid over them) turned into a split view of the same size,
 *  orientation and share: what lay over each panel, by its centre, goes into that pane's layout in reading order, and
 *  a panel's own words, where they were changed, stay as a line of text in its pane. One step; undo puts it back. */
export const convertToSplitView = op<{ id: string }, { itemId: string; groupId: string }>({
  name: "convert_to_split_view",
  summary:
    "Turns a legacy resizable into a split view (two panes that hold parts): the same size, orientation and share; the parts lying over each panel (by their centre) move into that pane's layout, in reading order.",
  args: S.obj({ id: S.str("the resizable's part id") }, ["id"]),
  label: () => "Convert to split view",
  run(s, a, ctx) {
    const { group, item } = itemById(s, a.id);
    if (item.component !== "resizable" || group.items.length !== 1) throw new OpError("invalid_value", `${JSON.stringify(a.id)} is not a resizable.`, a.id);
    unlocked(group, "That resizable");
    const def = partBySlug("resizable")!;
    const p = reader(def, item.props);
    const vertical = p.s("orientation") === "vertical";
    const width = Math.round(p.n("width"));
    const height = Math.round(p.n("height"));
    const split = Math.round(p.n("split"));
    const lang = ctx.lang;
    /* the panels as the resizable drew them: shares of its size, the 1px handle between */
    const firstEnd = (vertical ? group.y + (height - 1) * (split / 100) : group.x + (width - 1) * (split / 100)) + 0.5;
    const held = heldBy(group, s.doc.groups, ctx.widths).filter((g) => !g.locked);
    /* what lay over it directly: what those hold goes with them */
    const nested = new Set(held.flatMap((g) => heldBy(g, s.doc.groups, ctx.widths).map((x) => x.id)));
    const units = held.filter((g) => !nested.has(g.id) && !(g.inFlow && g.inFlow !== group.id));
    const sideOf = (g: Group): PaneSide => ((vertical ? centreOf(g, ctx.widths).y : centreOf(g, ctx.widths).x) < firstEnd ? "first" : "second");
    const groupId = freshId(s, undefined, ctx.newId);
    const splitItem: Item = {
      ...makeItem(SPLIT_SLUG),
      id: item.id,
      ...(item.fill ? { fill: item.fill } : {}),
      ...(item.corners ? { corners: item.corners } : {}),
      ...(item.look ? { look: item.look } : {}),
      props: { orientation: vertical ? "vertical" : "horizontal", split, width, height, handle: p.b("handle"), compact: "keep" },
    };
    const host: Group = { ...group, id: groupId, items: [splitItem] };
    const panes = { first: newPane("first", host, ctx.newId(), ctx.newId(), lang), second: newPane("second", host, ctx.newId(), ctx.newId(), lang) };
    /* the words a panel showed, where the author changed them from the seed */
    const words = (key: "first" | "second") => {
      const v = p.s(key);
      const seed = def.props.find((d) => d.key === key)?.default;
      return v && typeof seed === "string" && v !== seed && v !== listTextOf(seed, lang) ? v : "";
    };
    const textOf = (side: PaneSide): Group[] => {
      const w = words(side);
      return w ? [{ id: ctx.newId(), x: group.x, y: group.y, axis: "x", inFlow: panes[side].id, items: [{ ...makeItem("text"), id: ctx.newId(), props: { text: w, style: "body" } }] }] : [];
    };
    /* each unit with what it holds, into its pane in reading order */
    const reading = (x: Group, y: Group) => (vertical ? x.y - y.y || x.x - y.x : x.x - y.x || x.y - y.y);
    const carried = new Set(held.map((g) => g.id));
    const intoPane = (side: PaneSide): Group[] =>
      units
        .filter((g) => sideOf(g) === side)
        .sort(reading)
        .flatMap((u) => {
          const { flowAbsolute: _loose, ...it } = u.items[0] ?? {};
          const moved: Group = { ...u, inFlow: panes[side].id, ...(u.items.length === 1 && childLayoutOf(u.items[0]).absolute ? { items: [it as Item] } : {}) };
          return [moved, ...held.filter((x) => nested.has(x.id) && heldBy(u, s.doc.groups, ctx.widths).some((h) => h.id === x.id))];
        });
    const block = [host, panes.first, ...textOf("first"), ...intoPane("first"), panes.second, ...textOf("second"), ...intoPane("second")];
    const at = s.doc.groups.indexOf(group);
    const rest = s.doc.groups.filter((g) => g !== group && !carried.has(g.id));
    const before = s.doc.groups.slice(0, at).filter((g) => !carried.has(g.id)).length;
    const groups = [...rest.slice(0, before), ...block, ...rest.slice(before)];
    const state = withSession(withGroups(s, groups), { selection: [item.id] });
    return { state: laidOut(state, ctx.widths), result: { itemId: item.id, groupId } };
  },
});

/** the parts of a split's panes, for a caller that reads them back */
export const panesOf = (groups: Group[], splitGroupId: string) => {
  const p = panesOfSplit(groups, splitGroupId);
  return Object.fromEntries(PANE_SIDES.flatMap((side) => (p[side] ? [[side, p[side]!.items[0].id]] : []))) as Partial<Record<PaneSide, string>>;
};
