import { Group, groupBounds, heldBy, unionRect } from "./tokens";
import { alignIntent, alike, gapSnapper, gridBlock, gridMeasure, linesOf, median, offsetIn, rowOffsets, union, type Box, type Placed, type Rect } from "./structure";

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

/** how far past the selection's bounds Tidy up may reach: what putting its gaps on the scale can add */
const SLACK = 4;

/** the gap to use where `want` is the gap on the scale and `room` is what there is for one: `want` when it fits, else the
 *  widest that both fits and is its own place on the scale, so that tidying again chooses it again */
function fitGap(want: number, room: number, snap: (g: number) => number): number {
  if (want <= room) return want;
  for (let c = Math.floor(room / 4) * 4; c > 0; c -= 4) if (snap(c) === c) return c;
  return 0;
}

const w = (r: Rect) => r.r - r.l;
const h = (r: Rect) => r.b - r.t;

/** Lines that read as a grid: two or more of two or more, the same count in each but for a shorter last one, and each
 *  column of like boxes (or all of them alike). Three icons over a wide part, or a row with a button at its end over a
 *  plain row, are not one. */
function asGrid(lines: Box[][]): boolean {
  const n = lines[0]?.length ?? 0;
  if (lines.length < 2 || n < 2) return false;
  if (!lines.every((l, i) => l.length === n || (i === lines.length - 1 && l.length < n))) return false;
  const cols = Array.from({ length: n }, (_, c) => lines.flatMap((l) => (l[c] ? [l[c]] : [])));
  return alike(lines.flat()) || cols.every((col) => col.length < 2 || alike(col));
}

/** a grid made even within the bounds it had: one gap between its columns, one between its rows; null when its columns
 *  or rows overlap so far that they cannot be put side by side in that room */
function gridIn(lines: Box[][], at: Rect, snap: (g: number) => number): Placed | null {
  const m = gridMeasure(lines);
  const rowsH = lines.map((r) => rowOffsets(r, r.map((b) => ({ h: h(b), base: b.base }))).h);
  /* the gap between two columns is between what each spans, so a narrow cell does not count as a wide gap */
  const colGaps = Array.from({ length: m.cols - 1 }, (_, c) => Math.min(...lines.flatMap((r) => (r[c + 1] ? [r[c + 1].l] : []))) - Math.max(...lines.flatMap((r) => (r[c] ? [r[c].r] : []))));
  const roomX = (w(at) - m.colW.reduce((a, b) => a + b, 0)) / (m.cols - 1);
  const roomY = (h(at) - rowsH.reduce((a, b) => a + b, 0)) / (lines.length - 1);
  if (roomX < 0 || roomY < 0) return null;
  const rowGaps = lines.slice(1).map((r, i) => Math.min(...r.map((b) => b.t)) - Math.max(...lines[i].map((b) => b.b)));
  const out: Placed = new Map();
  gridBlock(lines, { snap }, { gx: gapIn(colGaps, roomX, snap), gy: gapIn(rowGaps, roomY, snap) }).place(at.l, at.t, out);
  return out;
}

/** the gap a run takes: the one on the scale its own gaps come to, where that fits in what it spans (with the little
 *  putting it on the scale may add); else the widest on the scale that fits */
const gapIn = (gaps: number[], room: number, snap: (g: number) => number) => {
  const want = snap(median(gaps));
  return want <= room + SLACK / Math.max(1, gaps.length) ? want : fitGap(want, room, snap);
};

/** Each line made even on its own, the lines one under another: one gap along each line and one between the lines,
 *  each on the scale where the room the line had allows it. A line whose parts overlap keeps them where they stand
 *  along it. Lines too tall together to stand one under another in the room they had stay where they are, each made
 *  even in place where no other line reaches into it, so that nothing reaches past the bounds or onto another part. */
function linesIn(lines: Box[][], at: Rect, snap: (g: number) => number): Placed {
  const laid = lines.map((l) => {
    const sum = l.reduce((n, b) => n + w(b), 0);
    const span = Math.max(...l.map((b) => b.r)) - l[0].l;
    const room = l.length > 1 ? (span - sum) / (l.length - 1) : 0;
    const packs = l.length > 1 && room >= 0;
    const gap = packs ? gapIn(l.slice(1).map((b, i) => b.l - l[i].r), room, snap) : 0;
    let x = 0;
    const xs = l.map((b) => {
      if (!packs) return b.l - l[0].l;
      const at = x;
      x += w(b) + gap;
      return at;
    });
    /* side by side they line up on what they come closest to sharing; overlapping, they keep how they stand */
    const top = Math.min(...l.map((b) => b.t));
    const { offsets, h: tall } = packs ? rowOffsets(l, l.map((b) => ({ h: h(b), base: b.base }))) : { offsets: l.map((b) => b.t - top), h: Math.max(...l.map((b) => b.b)) - top };
    return { xs, offsets, w: packs ? sum + gap * (l.length - 1) : span, h: tall };
  });
  const rects = lines.map((l) => union(l));
  const downGaps = rects.slice(1).map((r, i) => r.t - rects[i].b);
  const roomY = lines.length > 1 ? (h(at) - laid.reduce((n, l) => n + l.h, 0)) / (lines.length - 1) : 0;
  const stacks = lines.length > 1 && roomY >= 0;
  const down = stacks ? gapIn(downGaps, roomY, snap) : 0;
  const intent = alignIntent(rects, "x");
  const width = Math.max(...laid.map((l) => l.w));
  const out: Placed = new Map();
  let y = at.t;
  const apart = (i: number) => rects.every((r, j) => j === i || r.b <= rects[i].t || r.t >= rects[i].b);
  lines.forEach((l, i) => {
    if (!stacks && !apart(i)) {
      for (const b of l) out.set(b.id, { l: b.l, t: b.t });
      return;
    }
    const top = stacks ? y : rects[i].t;
    const left = stacks ? at.l + offsetIn(width, laid[i].w, intent) : rects[i].l;
    l.forEach((b, j) => out.set(b.id, { l: Math.round(left + laid[i].xs[j]), t: Math.round(top + laid[i].offsets[j]) }));
    y += laid[i].h + down;
  });
  return out;
}

/** how many times Tidy up reads its own result again before it is done */
const SETTLE = 4;

/** Figma's Tidy up: the selection as a clean row, column or grid, read off the lines it stands in, with one gap across
 *  and one down (the gaps it has, on the spacing scale), each part on the edge or centre its row and its column come
 *  closest to sharing. Lines that are no grid are each made even on their own, one under another. The top left of the
 *  selection stays put, nothing reaches past its bounds by more than putting the gaps on the scale adds, and a locked
 *  part stays out of it. Tidying up what was just tidied moves nothing. Null when nothing moves. */
export function tidyUpParts(groups: Group[], ids: Set<string>, widths: Widths, scale: number[] = [8, 16]): Group[] | null {
  let at = groups;
  for (let pass = 0; pass < SETTLE; pass++) {
    const next = tidyUpOnce(at, ids, widths, scale);
    if (!next) break;
    at = next;
  }
  return at !== groups && at.some((g, i) => g.x !== groups[i].x || g.y !== groups[i].y) ? at : null;
}

function tidyUpOnce(groups: Group[], ids: Set<string>, widths: Widths, scale: number[]): Group[] | null {
  const units = unitsOf(groups, ids, widths).filter((g) => !g.locked);
  if (units.length < 2) return null;
  const boxes: Box[] = units.map((g) => ({ id: g.id, ...groupBounds(g, widths), base: g.items.length === 1 ? widths[`${g.items[0].id}:base`] : undefined }));
  const at = unionRect(boxes);
  const snap = gapSnapper(scale);
  const lines = linesOf(boxes);
  const out = (asGrid(lines) && gridIn(lines, at, snap)) || linesIn(lines, at, snap);
  const deltas = new Map(boxes.map((b) => [b.id, { dx: out.get(b.id)!.l - b.l, dy: out.get(b.id)!.t - b.t }]));
  return moved(groups, deltas, widths);
}
