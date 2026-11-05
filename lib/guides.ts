/* Smart guides, the way Figma draws them while something is dragged or resized:
 *
 * - its edges and centre snap to the edges and centres of the parts on the same screen, and to the screen's margins
 *   and middle, and a line is drawn across what lines up;
 * - placed at the gap two of its neighbours already keep (or halfway between two), it snaps to that gap and every
 *   equal gap is marked;
 * - the distance to the nearest part on each side is written beside it.
 *
 * What the parts are is worked out once, when the drag starts (`guideTargets`); each move of the pointer only reads
 * it (`snapRect`), so a drag over a document of forty screens stays smooth. Pure geometry, in canvas units. */

export type Rect = { l: number; t: number; r: number; b: number };

/** a line to draw: across x at `at` from y `from` to `to` (axis "x"), or across y */
export type GuideLine = { axis: "x" | "y"; at: number; from: number; to: number };
/** a measured space: along `axis` from `from` to `to`, drawn at `at` on the other axis, labelled with its size */
export type GuideGap = { axis: "x" | "y"; from: number; to: number; at: number; kind: "equal" | "distance" };

export type Guides = { dx: number; dy: number; snapX: boolean; snapY: boolean; lines: GuideLine[]; gaps: GuideGap[] };

type Screen = { rect: Rect; margin: number };
/** a line something can snap to; `screen` when it is a screen's own (an edge, a margin, the middle) */
type Mark = { v: number; rect: Rect; screen?: boolean };

/** what a drag can line up with, screen by screen */
export type GuideTargets = { screens: Screen[]; rects: Rect[][]; xs: Mark[][]; ys: Mark[][]; loose: { rects: Rect[]; xs: Mark[]; ys: Mark[] } };

const cx = (r: Rect) => (r.l + r.r) / 2;
const cy = (r: Rect) => (r.t + r.b) / 2;
const overlapX = (a: Rect, b: Rect) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0;
const overlapY = (a: Rect, b: Rect) => Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0;
const inside = (x: number, y: number, r: Rect) => x >= r.l && x <= r.r && y >= r.t && y <= r.b;

const marks = (rects: Rect[], axis: "x" | "y"): Mark[] =>
  rects.flatMap((r) => (axis === "x" ? [r.l, cx(r), r.r] : [r.t, cy(r), r.b]).map((v) => ({ v, rect: r }))).sort((a, b) => a.v - b.v);

/** The parts and screens a drag can line up with, sorted for quick lookup. `rects` is every part not being dragged. */
export function guideTargets(rects: Rect[], screens: Screen[]): GuideTargets {
  const own: Rect[][] = screens.map(() => []);
  const loose: Rect[] = [];
  for (const r of rects) {
    const i = screens.findIndex((s) => inside(cx(r), cy(r), s.rect));
    (i >= 0 ? own[i] : loose).push(r);
  }
  /* a screen offers its edges, its margins and its middle */
  const screenX = (s: Screen): Mark[] => [s.rect.l, s.rect.l + s.margin, cx(s.rect), s.rect.r - s.margin, s.rect.r].map((v) => ({ v, rect: s.rect, screen: true }));
  const screenY = (s: Screen): Mark[] => [s.rect.t, s.rect.t + s.margin, cy(s.rect), s.rect.b - s.margin, s.rect.b].map((v) => ({ v, rect: s.rect, screen: true }));
  return {
    screens,
    rects: own,
    xs: own.map((rs, i) => [...marks(rs, "x"), ...screenX(screens[i])].sort((a, b) => a.v - b.v)),
    ys: own.map((rs, i) => [...marks(rs, "y"), ...screenY(screens[i])].sort((a, b) => a.v - b.v)),
    loose: { rects: loose, xs: marks(loose, "x"), ys: marks(loose, "y") },
  };
}

/** the marks within `tol` of `v`, found by halving a sorted list */
function near(list: Mark[], v: number, tol: number): Mark[] {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].v < v - tol) lo = mid + 1;
    else hi = mid;
  }
  const out: Mark[] = [];
  for (let i = lo; i < list.length && list[i].v <= v + tol; i++) out.push(list[i]);
  return out;
}

type Hit = { d: number; at: number; equal?: GuideGap[] };

/** where a rect's edges and centre come closest to a mark, on one axis */
function alignHit(r: Rect, list: Mark[], axis: "x" | "y", tol: number, edges: ("lo" | "mid" | "hi")[]): Hit | null {
  const lo = axis === "x" ? r.l : r.t;
  const hi = axis === "x" ? r.r : r.b;
  const own = { lo, mid: (lo + hi) / 2, hi };
  let best: Hit | null = null;
  for (const e of edges)
    for (const m of near(list, own[e], tol)) {
      const d = m.v - own[e];
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, at: m.v };
    }
  return best;
}

/** The gap the rect would keep to its neighbours on one axis if it matched a gap they keep already, or stood halfway
 *  between two of them: the move that takes it there, and the gaps to mark. */
function equalHit(r: Rect, rects: Rect[], axis: "x" | "y", tol: number): Hit | null {
  const lo = axis === "x" ? "l" : "t";
  const hi = axis === "x" ? "r" : "b";
  const across = axis === "x" ? overlapY : overlapX;
  /* only what shares the rect's row (or column) counts as its neighbour */
  const row = rects.filter((o) => across(o, r)).sort((a, b) => a[lo] - b[lo]);
  const before = row.filter((o) => o[hi] <= r[lo] + tol).sort((a, b) => b[hi] - a[hi]);
  const after = row.filter((o) => o[lo] >= r[hi] - tol).sort((a, b) => a[lo] - b[lo]);
  /* a gap is marked across the middle of what its two sides share, or of the rect itself where they share nothing */
  const pLo = axis === "x" ? "t" : "l";
  const pHi = axis === "x" ? "b" : "r";
  const at = (a: Rect, b: Rect) => {
    const s = Math.max(a[pLo], b[pLo]);
    const e = Math.min(a[pHi], b[pHi]);
    return e > s ? (s + e) / 2 : (r[pLo] + r[pHi]) / 2;
  };
  const gap = (a: Rect, b: Rect): GuideGap => ({ axis, from: a[hi], to: b[lo], at: at(a, b), kind: "equal" });
  const hits: Hit[] = [];
  const size = r[hi] - r[lo];
  const A = before[0];
  const B = after[0];
  /* halfway between the two it stands between */
  if (A && B) {
    const space = (B[lo] - A[hi] - size) / 2;
    if (space > 0) {
      const d = A[hi] + space - r[lo];
      const moved = { ...r, [lo]: r[lo] + d, [hi]: r[hi] + d } as Rect;
      hits.push({ d, at: A[hi] + space, equal: [gap(A, moved), gap(moved, B)] });
    }
  }
  /* the gap its neighbour keeps to the one beyond it */
  const A2 = A && before.find((o) => o !== A && o[hi] <= A[lo]);
  if (A && A2) {
    const g = A[lo] - A2[hi];
    const d = A[hi] + g - r[lo];
    const moved = { ...r, [lo]: r[lo] + d, [hi]: r[hi] + d } as Rect;
    hits.push({ d, at: A[hi] + g, equal: [gap(A2, A), gap(A, moved)] });
  }
  const B2 = B && after.find((o) => o !== B && o[lo] >= B[hi]);
  if (B && B2) {
    const g = B2[lo] - B[hi];
    const d = B[lo] - g - r[hi];
    const moved = { ...r, [lo]: r[lo] + d, [hi]: r[hi] + d } as Rect;
    hits.push({ d, at: B[lo] - g, equal: [gap(moved, B), gap(B, B2)] });
  }
  const best = hits.filter((h) => Math.abs(h.d) <= tol).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
  return best ?? null;
}

/** the lines that show what a rect now lines up with: every mark it shares on that axis, drawn across them all */
function linesFor(r: Rect, list: Mark[], axis: "x" | "y"): GuideLine[] {
  const own = axis === "x" ? [r.l, cx(r), r.r] : [r.t, cy(r), r.b];
  const out: GuideLine[] = [];
  for (const v of own) {
    const hit = near(list, v, 0.5);
    if (!hit.length) continue;
    /* drawn across the part and everything it lines up with; a screen's own line only where nothing else shares it */
    const parts = hit.filter((m) => !m.screen);
    const span = [r, ...(parts.length ? parts : hit).map((m) => m.rect)];
    out.push(axis === "x" ? { axis, at: v, from: Math.min(...span.map((p) => p.t)), to: Math.max(...span.map((p) => p.b)) } : { axis, at: v, from: Math.min(...span.map((p) => p.l)), to: Math.max(...span.map((p) => p.r)) });
  }
  return out;
}

/** The distance from a rect to the nearest part on each side of it within its screen, or to the screen's edge. */
export function distances(r: Rect, rects: Rect[], screen?: Rect): GuideGap[] {
  const out: GuideGap[] = [];
  const left = rects.filter((o) => overlapY(o, r) && o.r <= r.l).sort((a, b) => b.r - a.r)[0];
  const right = rects.filter((o) => overlapY(o, r) && o.l >= r.r).sort((a, b) => a.l - b.l)[0];
  const up = rects.filter((o) => overlapX(o, r) && o.b <= r.t).sort((a, b) => b.b - a.b)[0];
  const down = rects.filter((o) => overlapX(o, r) && o.t >= r.b).sort((a, b) => a.t - b.t)[0];
  const y = cy(r);
  const x = cx(r);
  const lx = left ? left.r : screen?.l;
  const rx = right ? right.l : screen?.r;
  const ty = up ? up.b : screen?.t;
  const by = down ? down.t : screen?.b;
  if (lx !== undefined && r.l - lx > 0) out.push({ axis: "x", from: lx, to: r.l, at: y, kind: "distance" });
  if (rx !== undefined && rx - r.r > 0) out.push({ axis: "x", from: r.r, to: rx, at: y, kind: "distance" });
  if (ty !== undefined && r.t - ty > 0) out.push({ axis: "y", from: ty, to: r.t, at: x, kind: "distance" });
  if (by !== undefined && by - r.b > 0) out.push({ axis: "y", from: r.b, to: by, at: x, kind: "distance" });
  return out;
}

/** What a rect being moved snaps to: the move on each axis that brings it onto a line or an even gap, and what to draw.
 *  `edges` limits which of its lines may snap, for a resize that moves only one edge. */
export function snapRect(r: Rect, t: GuideTargets, tol: number, edges: { x?: ("lo" | "mid" | "hi")[]; y?: ("lo" | "mid" | "hi")[] } = {}): Guides {
  const i = t.screens.findIndex((s) => inside(cx(r), cy(r), s.rect));
  const rects = i >= 0 ? t.rects[i] : t.loose.rects;
  const xs = i >= 0 ? t.xs[i] : t.loose.xs;
  const ys = i >= 0 ? t.ys[i] : t.loose.ys;
  const ex = edges.x ?? ["lo", "mid", "hi"];
  const ey = edges.y ?? ["lo", "mid", "hi"];
  const pick = (a: Hit | null, e: Hit | null) => (!a ? e : !e ? a : Math.abs(e.d) < Math.abs(a.d) - 0.5 ? e : a);
  /* an even gap moves the whole rect: a resize only lines its one edge up */
  const whole = ex.length === 3 && ey.length === 3;
  const hx = pick(ex.length ? alignHit(r, xs, "x", tol, ex) : null, whole ? equalHit(r, rects, "x", tol) : null);
  const hy = pick(ey.length ? alignHit(r, ys, "y", tol, ey) : null, whole ? equalHit(r, rects, "y", tol) : null);
  const dx = hx?.d ?? 0;
  const dy = hy?.d ?? 0;
  const moved = { l: r.l + dx, r: r.r + dx, t: r.t + dy, b: r.b + dy };
  const lines = [...(hx && !hx.equal ? linesFor(moved, xs, "x") : []), ...(hy && !hy.equal ? linesFor(moved, ys, "y") : [])];
  const equal = [...(hx?.equal ?? []), ...(hy?.equal ?? [])];
  /* the distances to its neighbours, but not twice where an even gap is already marked */
  const apart = distances(moved, rects, i >= 0 ? t.screens[i].rect : undefined).filter((d) => !equal.some((g) => g.axis === d.axis && Math.abs(g.from - d.from) < 1 && Math.abs(g.to - d.to) < 1));
  return { dx, dy, snapX: !!hx, snapY: !!hy, lines, gaps: [...equal, ...apart] };
}

/** Alt held over another part: the distances between two rects, or from a rect to the edges of the one around it. */
export function measureBetween(a: Rect, b: Rect): GuideGap[] {
  const contains = b.l <= a.l && b.t <= a.t && b.r >= a.r && b.b >= a.b;
  if (contains) return distances(a, [], b);
  const out: GuideGap[] = [];
  if (b.l >= a.r) out.push({ axis: "x", from: a.r, to: b.l, at: overlapY(a, b) ? (Math.max(a.t, b.t) + Math.min(a.b, b.b)) / 2 : cy(a), kind: "distance" });
  else if (b.r <= a.l) out.push({ axis: "x", from: b.r, to: a.l, at: overlapY(a, b) ? (Math.max(a.t, b.t) + Math.min(a.b, b.b)) / 2 : cy(a), kind: "distance" });
  if (b.t >= a.b) out.push({ axis: "y", from: a.b, to: b.t, at: overlapX(a, b) ? (Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2 : cx(a), kind: "distance" });
  else if (b.b <= a.t) out.push({ axis: "y", from: b.b, to: a.t, at: overlapX(a, b) ? (Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2 : cx(a), kind: "distance" });
  /* overlapping: how far in each edge stands */
  if (!out.length) {
    if (a.l !== b.l) out.push({ axis: "x", from: Math.min(a.l, b.l), to: Math.max(a.l, b.l), at: cy(a), kind: "distance" });
    if (a.r !== b.r) out.push({ axis: "x", from: Math.min(a.r, b.r), to: Math.max(a.r, b.r), at: cy(a), kind: "distance" });
    if (a.t !== b.t) out.push({ axis: "y", from: Math.min(a.t, b.t), to: Math.max(a.t, b.t), at: cx(a), kind: "distance" });
    if (a.b !== b.b) out.push({ axis: "y", from: Math.min(a.b, b.b), to: Math.max(a.b, b.b), at: cx(a), kind: "distance" });
  }
  return out;
}

/* ---------- a drop into an auto layout ---------- */

/** how an auto layout runs its parts, as far as where a new one goes */
export type RunOf = { dir: "row" | "column" | "grid"; wrap: boolean; gap: number };

/** Two parts whose tops are this close stand on one line of a wrapping row or a grid, as the layout reads them. */
const SAME_LINE = 16;

/** whether `a` comes before `b` in the order a layout reads its parts (lib/flow.ts), by their top-left corners */
function readsBefore(a: { x: number; y: number }, b: { x: number; y: number }, run: RunOf): boolean {
  if (run.dir === "row" && !run.wrap) return a.x <= b.x;
  if (run.dir === "column") return a.y <= b.y;
  return Math.abs(a.y - b.y) < SAME_LINE ? a.x <= b.x : a.y < b.y;
}

/** Where a part let go in an auto layout goes, as Figma shows it: its place among the parts already there (`kids`, in the
 *  layout's order), found by its top-left corner `at` the way the layout itself orders them, and a short line across the
 *  run at that place. `room` is the layout's inside, where a first part goes. No distances: the layout spaces it. */
export function insertionMark(kids: Rect[], at: { x: number; y: number }, run: RunOf, room: Rect): { index: number; line: GuideLine } {
  const index = kids.filter((k) => readsBefore({ x: k.l, y: k.t }, at, run)).length;
  const prev = kids[index - 1];
  const next = kids[index];
  const half = Math.max(2, run.gap / 2);
  const across = (rs: Rect[], axis: "x" | "y") => (axis === "x" ? { from: Math.min(...rs.map((r) => r.t)), to: Math.max(...rs.map((r) => r.b)) } : { from: Math.min(...rs.map((r) => r.l)), to: Math.max(...rs.map((r) => r.r)) });
  /* across a column the line lies flat; along a row, or a line of a grid, it stands */
  if (run.dir === "column") {
    if (!kids.length) return { index, line: { axis: "y", at: room.t, from: room.l, to: room.r } };
    const y = prev && next ? (prev.b + next.t) / 2 : prev ? prev.b + half : next.t - half;
    return { index, line: { axis: "y", at: y, ...across(kids, "y") } };
  }
  if (!kids.length) return { index, line: { axis: "x", at: room.l, from: room.t, to: room.b } };
  if (run.dir === "row" && !run.wrap) {
    const x = prev && next ? (prev.r + next.l) / 2 : prev ? prev.r + half : next.l - half;
    return { index, line: { axis: "x", at: x, ...across(kids, "x") } };
  }
  /* a wrapping row or a grid: between two on one line, else at the end of the line it joins or the start of the next */
  if (prev && next && Math.abs(prev.t - next.t) < SAME_LINE) return { index, line: { axis: "x", at: (prev.r + next.l) / 2, ...across([prev, next], "x") } };
  const own = prev && (!next || Math.abs(prev.t - at.y) < SAME_LINE) ? prev : undefined;
  if (own) return { index, line: { axis: "x", at: own.r + half, from: own.t, to: own.b } };
  return { index, line: { axis: "x", at: next.l - half, from: next.t, to: next.b } };
}

/* ---------- where a distance's number is written ---------- */

/** Where the number of a measured gap goes, so it does not sit on another part's words: the middle of its line where that
 *  is clear, else further along the line, else beside it. `size` is the label's, in canvas units; a rect around the
 *  whole line (the box being measured inside) is no obstacle. */
export function labelSpot(g: GuideGap, size: { w: number; h: number }, avoid: Rect[]): { x: number; y: number } {
  const along = g.axis === "x";
  const line: Rect = along ? { l: g.from, r: g.to, t: g.at, b: g.at } : { l: g.at, r: g.at, t: g.from, b: g.to };
  const blocks = avoid.filter((r) => !(r.l <= line.l && r.r >= line.r && r.t <= line.t && r.b >= line.b));
  const blockAt = (p: { x: number; y: number }) => {
    const box = { l: p.x - size.w / 2, r: p.x + size.w / 2, t: p.y - size.h / 2, b: p.y + size.h / 2 };
    return blocks.find((r) => r.l < box.r && r.r > box.l && r.t < box.b && r.b > box.t);
  };
  const point = (f: number) => (along ? { x: g.from + (g.to - g.from) * f, y: g.at } : { x: g.at, y: g.from + (g.to - g.from) * f });
  for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const p = point(f);
    if (!blockAt(p)) return p;
  }
  /* nowhere on the line: beside its middle, just past what covers it, on the nearer side */
  const mid = point(0.5);
  const past = (dir: -1 | 1) => {
    let p = mid;
    for (let i = 0; i < 8; i++) {
      const r = blockAt(p);
      if (!r) return p;
      p = along ? { x: p.x, y: dir < 0 ? r.t - size.h / 2 - 2 : r.b + size.h / 2 + 2 } : { x: dir < 0 ? r.l - size.w / 2 - 2 : r.r + size.w / 2 + 2, y: p.y };
    }
    return null;
  };
  const away = (p: { x: number; y: number } | null) => (p ? Math.abs(p.x - mid.x) + Math.abs(p.y - mid.y) : Infinity);
  const [a, b] = [past(-1), past(1)];
  return (away(a) <= away(b) ? a : b) ?? mid;
}

/** every part a drag can line up with, on every screen: what the numbers it writes keep clear of */
export const targetRects = (t: GuideTargets): Rect[] => [...t.rects.flat(), ...t.loose.rects];
