import { Group, groupBounds, heldBy, unionRect } from "./tokens";
import { gapSnapper, gridBlock, linesOf, type Box, type Placed } from "./structure";

/* Lining selected parts up against each other, as opposed to placing them in the screen. Each group
 * moves as a whole, a container with what it holds, and a locked group is what the others line up to. */

export type AlignHow = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";
export type Spread = "x" | "y";
type Widths = Record<string, number>;

const unitsOf = (groups: Group[], ids: Set<string>, widths: Widths) => {
  /* a layout places what it holds */
  const units = groups.filter((g) => !g.inFlow && g.items.some((it) => ids.has(it.id)));
  /* what a selected container holds moves with it: it is not lined up on its own */
  const carried = new Set(units.flatMap((g) => heldBy(g, groups, widths).map((x) => x.id)));
  return units.filter((g) => !carried.has(g.id));
};

function moved(groups: Group[], deltas: Map<string, { dx: number; dy: number }>, widths: Widths): Group[] | null {
  const all = new Map<string, { dx: number; dy: number }>();
  for (const [id, d] of deltas) {
    if (!d.dx && !d.dy) continue;
    all.set(id, d);
    const g = groups.find((x) => x.id === id)!;
    for (const held of heldBy(g, groups, widths)) all.set(held.id, d);
  }
  if (!all.size) return null;
  return groups.map((g) => {
    const d = all.get(g.id);
    return d ? { ...g, x: Math.round(g.x + d.dx), y: Math.round(g.y + d.dy) } : g;
  });
}

/** every selected group brought to one edge or centre of what the selection covers; null when nothing moves */
export function alignParts(groups: Group[], ids: Set<string>, how: AlignHow, widths: Widths): Group[] | null {
  const units = unitsOf(groups, ids, widths);
  if (units.length < 2) return null;
  const boxes = units.map((g) => groupBounds(g, widths));
  /* a locked group cannot come to the others, so they go to it */
  const fixed = units.flatMap((g, i) => (g.locked ? [boxes[i]] : []));
  const { l, t, r, b: bt } = unionRect(fixed.length ? fixed : boxes);
  const deltas = new Map<string, { dx: number; dy: number }>();
  units.forEach((g, i) => {
    if (g.locked) return;
    const b = boxes[i];
    deltas.set(g.id, {
      dx: how === "left" ? l - b.l : how === "right" ? r - b.r : how === "centerH" ? (l + r) / 2 - (b.l + b.r) / 2 : 0,
      dy: how === "top" ? t - b.t : how === "bottom" ? bt - b.b : how === "centerV" ? (t + bt) / 2 - (b.t + b.b) / 2 : 0,
    });
  });
  return moved(groups, deltas, widths);
}

/** The selected groups spread out with equal space between them: the first and last stay where they
 *  are, unless `gap` says what that space is, and then the first stays and the rest follow. */
export function distributeParts(groups: Group[], ids: Set<string>, axis: Spread, widths: Widths, gap?: number): Group[] | null {
  const units = unitsOf(groups, ids, widths).filter((g) => !g.locked);
  if (units.length < (gap === undefined ? 3 : 2)) return null;
  const size = (b: ReturnType<typeof groupBounds>) => (axis === "x" ? b.r - b.l : b.b - b.t);
  const start = (b: ReturnType<typeof groupBounds>) => (axis === "x" ? b.l : b.t);
  const sorted = units.map((g) => ({ g, b: groupBounds(g, widths) })).sort((a, c) => start(a.b) - start(c.b));
  const first = sorted[0].b;
  const last = sorted[sorted.length - 1].b;
  const taken = sorted.reduce((n, u) => n + size(u.b), 0);
  const space = gap ?? (start(last) + size(last) - start(first) - taken) / (sorted.length - 1);
  let at = start(first);
  const deltas = new Map<string, { dx: number; dy: number }>();
  for (const u of sorted) {
    const d = at - start(u.b);
    deltas.set(u.g.id, axis === "x" ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    at += size(u.b) + space;
  }
  return moved(groups, deltas, widths);
}

/** Figma's Tidy up: the selection as a clean row, column or grid, read off the lines it stands in, with one gap across
 *  and one down (the gaps it has, on the spacing scale), each part on the edge or centre its row and its column come
 *  closest to sharing. The top left of the selection stays put; a locked part stays out of it. Null when nothing moves. */
export function tidyUpParts(groups: Group[], ids: Set<string>, widths: Widths, scale: number[] = [8, 16]): Group[] | null {
  const units = unitsOf(groups, ids, widths).filter((g) => !g.locked);
  if (units.length < 2) return null;
  const boxes: Box[] = units.map((g) => ({ id: g.id, ...groupBounds(g, widths), base: g.items.length === 1 ? widths[`${g.items[0].id}:base`] : undefined }));
  const at = unionRect(boxes);
  const out: Placed = new Map();
  gridBlock(linesOf(boxes), { snap: gapSnapper(scale) }).place(at.l, at.t, out);
  const deltas = new Map(boxes.map((b) => [b.id, { dx: out.get(b.id)!.l - b.l, dy: out.get(b.id)!.t - b.t }]));
  return moved(groups, deltas, widths);
}
