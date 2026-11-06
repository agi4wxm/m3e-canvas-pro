/* What a drag in the layers panel does: a layer taken to another place in the tree. Into a box with an auto layout it
 * takes a place in the run; anywhere else it takes a place in what is drawn over what, and it is moved where it has
 * to be for the tree to read it there (inside the box it was dropped in, or clear of a box it was taken out of).
 * Not in the tools' list: a model says the same with `move_into`, `move_node` and `z_order`. */

import { flowOf, inRun } from "../../flow";
import { parentGroups } from "../../layerTree";
import { frameOfPart, groupBounds, heldBy, holdsParts, liesInside, type Group } from "../../tokens";
import { op, OpError, S } from "../op";
import { withGroups, type Widths } from "../state";
import { groupById, laidOut, unlocked } from "./common";
import { intoFlow } from "./nodes";

export type MoveLayerArgs = {
  /** the group to move */
  id: string;
  /** the container it goes into, or null for the top of its screen */
  parent: string | null;
  /** its place among what the parent lists, in the panel's order (a layout's run; front first elsewhere), counted
   *  without it */
  index: number;
};

const screenKey = (groups: Group[], widths: Widths, frames: Parameters<typeof frameOfPart>[2]) => (g: Group) => frameOfPart(g, groups, frames, widths)?.id;

/** a group and everything under it in the tree, in document order */
function blockOf(groups: Group[], id: string, parent: Map<string, string>): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of groups)
      if (!out.has(g.id)) {
        const p = parent.get(g.id);
        if (p && out.has(p)) {
          out.add(g.id);
          grew = true;
        }
      }
  }
  return out;
}

const shifted = (g: Group, dx: number, dy: number): Group => (dx || dy ? { ...g, x: g.x + dx, y: g.y + dy } : g);

export const moveLayer = op<MoveLayerArgs>({
  name: "move_layer",
  summary: "Moves a layer to another place in the layers tree: into a box (its run, or over what it holds) or to the top of its screen.",
  args: S.obj({ id: S.str(), parent: { type: ["string", "null"] }, index: S.int() }, ["id", "parent", "index"]),
  label: () => "Move layer",
  run(s, a, ctx) {
    const groups = s.doc.groups;
    const g = unlocked(groupById(s, a.id), "That layer");
    const keyOf = screenKey(groups, ctx.widths, s.doc.frames);
    const parent = parentGroups(groups, ctx.widths, keyOf);
    const block = blockOf(groups, g.id, parent);
    const host = a.parent === null ? null : groupById(s, a.parent);
    if (host && (block.has(host.id) || heldBy(g, groups, ctx.widths).some((x) => x.id === host.id))) throw new OpError("refused", "A layer cannot go inside itself.", a.parent ?? undefined);
    if (host && !holdsParts(host)) throw new OpError("refused", "Only a box or a container holds other layers.", host.id);

    /* into a layout: a place in its run, which counts only what the layout places */
    if (host && flowOf(host)) {
      const kids = groups.filter((x) => parent.get(x.id) === host.id && !block.has(x.id));
      const before = kids.slice(0, Math.max(0, Math.min(kids.length, a.index)));
      const runIndex = before.filter((x) => x.inFlow === host.id && !(x.items.length === 1 && x.items[0].flowAbsolute)).length;
      const carried = groups.filter((x) => block.has(x.id) && x.id !== g.id);
      const rest = groups.filter((x) => !block.has(x.id) || x.id === g.id);
      const placed = intoFlow(rest, g, host.id, runIndex);
      const at = placed.findIndex((x) => x.id === g.id);
      return { state: laidOut(withGroups(s, [...placed.slice(0, at + 1), ...carried, ...placed.slice(at + 1)]), ctx.widths) };
    }

    /* anywhere else: a place in what is drawn over what, out of any layout it was in */
    const screen = keyOf(g);
    const siblingsOf = (p: Map<string, string>) => groups.filter((x) => !block.has(x.id) && (host ? p.get(x.id) === host.id : !p.has(x.id) && keyOf(x) === screen));
    const front = [...siblingsOf(parent)].reverse();
    const k = Math.max(0, Math.min(front.length, a.index));
    const moving = groups.filter((x) => block.has(x.id)).map((x) => {
      if (x.id !== g.id || x.inFlow === undefined) return x;
      const { inFlow: _left, ...own } = x;
      return inRun(own);
    });
    let rest = groups.filter((x) => !block.has(x.id));
    let pos: number;
    if (k < front.length) {
      /* in front of the k-th sibling, behind the one before it: just after the k-th and all it holds */
      const target = front[k];
      const under = blockOf(groups, target.id, parent);
      pos = Math.max(...rest.map((x, i) => (under.has(x.id) ? i : -1))) + 1;
    } else if (front.length) {
      /* at the back: just before the hindmost sibling */
      pos = rest.findIndex((x) => x.id === front[front.length - 1].id);
    } else if (host) pos = rest.findIndex((x) => x.id === host.id) + 1;
    else pos = groups.slice(0, groups.indexOf(g)).filter((x) => !block.has(x.id)).length;
    rest = [...rest.slice(0, pos), ...moving, ...rest.slice(pos)];

    /* where it stands has to agree with the tree: inside the box it went into, or clear of a box that would claim it */
    let dx = 0;
    let dy = 0;
    const me = rest.find((x) => x.id === g.id)!;
    const mine = groupBounds(me, ctx.widths);
    if (host) {
      const hb = groupBounds(host, ctx.widths);
      if (!liesInside(me, hb, ctx.widths)) {
        const w = mine.r - mine.l;
        const h = mine.b - mine.t;
        dx = Math.round(Math.max(hb.l, hb.l + (hb.r - hb.l - w) / 2) - mine.l);
        dy = Math.round(Math.max(hb.t, hb.t + (hb.b - hb.t - h) / 2) - mine.t);
      }
    } else {
      const claimed = parentGroups(rest, ctx.widths, keyOf).get(g.id);
      const by = claimed ? rest.find((x) => x.id === claimed) : undefined;
      if (by) dy = Math.round(groupBounds(by, ctx.widths).b + 16 - mine.t);
    }
    if (dx || dy) rest = rest.map((x) => (block.has(x.id) ? shifted(x, dx, dy) : x));
    return { state: laidOut(withGroups(s, rest), ctx.widths) };
  },
});
