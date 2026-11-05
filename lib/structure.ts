/* What a person meant by where they put things. Tidy, "Tidy up" on a selection and "Suggest auto layout" all
 * start from the same reading of a set of boxes:
 *
 * 1. Recursive XY-cut. A set that a straight horizontal line can pass between is a stack of bands; a band that a
 *    vertical line can pass through is a row of columns; each part is cut again the other way. What no line
 *    separates falls back to rows read top to bottom, the way a hand would group them.
 * 2. Grids. Rows of the same count of like boxes (the same component, or nearly the same size) are one grid, and so
 *    are columns of them.
 * 3. Arrangement. Inside a run the gaps become one gap on the spacing scale, and the run lines up on the edge, the
 *    centre or the text baseline its members already come closest to sharing, which is how Figma's Tidy up reads it.
 *    A row with a wide break in it (a title, then its actions) keeps its two ends apart.
 *
 * Pure geometry: no parts, no screens. Callers say what a box is and what the spacing scale is. */

export type Rect = { l: number; t: number; r: number; b: number };

/** one thing that moves as a whole: a part, or parts that stand on each other */
export type Box = Rect & {
  id: string;
  /** how far below its top the first line of text sits, when that is known */
  base?: number;
  /** what it is: two boxes of the same kind are alike whatever their sizes */
  kind?: string;
};

/** the structure read off a set of boxes */
export type Shape =
  | { kind: "leaf"; box: Box }
  /** one under another */
  | { kind: "stack"; kids: Shape[] }
  /** side by side */
  | { kind: "row"; kids: Shape[] }
  /** rows of like boxes in columns, read row by row; the last row may be short */
  | { kind: "grid"; cells: Box[][] };

export type Intent = "start" | "center" | "end" | "baseline";

const w = (r: Rect) => r.r - r.l;
const h = (r: Rect) => r.b - r.t;

export const union = (rects: Rect[]): Rect => ({
  l: Math.min(...rects.map((r) => r.l)),
  t: Math.min(...rects.map((r) => r.t)),
  r: Math.max(...rects.map((r) => r.r)),
  b: Math.max(...rects.map((r) => r.b)),
});

export function leavesOf(s: Shape): Box[] {
  if (s.kind === "leaf") return [s.box];
  if (s.kind === "grid") return s.cells.flat();
  return s.kids.flatMap(leavesOf);
}

export const boundsOf = (s: Shape): Rect => (s.kind === "leaf" ? s.box : union(leavesOf(s)));

export const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/* ---------- cutting ---------- */

/** The set split by straight lines across `axis`: groups whose extents on that axis do not overlap. Touching counts
 *  as apart. In reading order. */
function split(boxes: Box[], axis: "x" | "y"): Box[][] {
  const lo = axis === "x" ? "l" : "t";
  const hi = axis === "x" ? "r" : "b";
  const sorted = [...boxes].sort((a, b) => a[lo] - b[lo] || a[hi] - b[hi]);
  const out: Box[][] = [];
  let end = -Infinity;
  for (const b of sorted) {
    if (!out.length || b[lo] >= end - 0.5) {
      out.push([b]);
      end = b[hi];
    } else {
      out[out.length - 1].push(b);
      end = Math.max(end, b[hi]);
    }
  }
  return out;
}

/** What no straight line separates, read as rows: a box joins the row its middle falls in, if it stands beside what is
 *  there already. This is how Tidy has always grouped a screen. */
function rowsByHand(boxes: Box[]): Box[][] {
  const sorted = [...boxes].sort((a, b) => a.t - b.t || a.l - b.l);
  const out: Box[][] = [];
  for (const u of sorted) {
    const row = out[out.length - 1];
    if (row) {
      const rt = Math.min(...row.map((r) => r.t));
      const rb = Math.max(...row.map((r) => r.b));
      const cy = (u.t + u.b) / 2;
      const rcy = (rt + rb) / 2;
      const beside = row.every((r) => r.r <= u.l + 2 || r.l >= u.r - 2);
      if (beside && ((cy >= rt && cy <= rb) || (rcy >= u.t && rcy <= u.b))) {
        row.push(u);
        continue;
      }
    }
    out.push([u]);
  }
  for (const r of out) r.sort((a, b) => a.l - b.l);
  return out;
}

/** Boxes in lines, top to bottom, each line left to right: a box joins a line it shares half its height with. Tidy up
 *  reads a selection this way, as rows of a grid whatever their gaps. */
export function linesOf(boxes: Box[]): Box[][] {
  const sorted = [...boxes].sort((a, b) => (a.t + a.b) / 2 - (b.t + b.b) / 2 || a.l - b.l);
  const out: Box[][] = [];
  for (const b of sorted) {
    const line = out[out.length - 1];
    if (line) {
      const t = Math.min(...line.map((x) => x.t));
      const bt = Math.max(...line.map((x) => x.b));
      const shared = Math.min(bt, b.b) - Math.max(t, b.t);
      if (shared >= Math.min(bt - t, b.b - b.t) / 2) {
        line.push(b);
        continue;
      }
    }
    out.push([b]);
  }
  for (const line of out) line.sort((a, b) => a.l - b.l);
  return out;
}

/** Recursive XY-cut: the structure of a set of boxes, cut first across `prefer` ("y" makes a stack of bands). */
export function xyCut(boxes: Box[], prefer: "x" | "y" = "y"): Shape {
  if (boxes.length === 1) return { kind: "leaf", box: boxes[0] };
  for (const axis of prefer === "y" ? (["y", "x"] as const) : (["x", "y"] as const)) {
    const parts = split(boxes, axis);
    if (parts.length < 2) continue;
    const kids = parts.map((p) => xyCut(p, axis === "y" ? "x" : "y"));
    return axis === "y" ? { kind: "stack", kids: kids.flatMap((k) => (k.kind === "stack" ? k.kids : [k])) } : { kind: "row", kids: kids.flatMap((k) => (k.kind === "row" ? k.kids : [k])) };
  }
  /* boxes laid like a pinwheel, or overlapping in both directions: rows, the way a hand groups them */
  const rows = rowsByHand(boxes);
  if (rows.length === 1) return { kind: "row", kids: rows[0].map((box) => ({ kind: "leaf", box })) };
  return { kind: "stack", kids: rows.map((r) => (r.length === 1 ? { kind: "leaf", box: r[0] } : xyCut(r, "x"))) };
}

/* ---------- grids ---------- */

/** boxes that read as copies of one thing: one kind, or nearly one size */
export function alike(boxes: Box[]): boolean {
  if (boxes.length < 2) return false;
  if (boxes.every((b) => b.kind !== undefined && b.kind === boxes[0].kind)) {
    /* the same component, but a full-width one beside a small one is not a cell of the same grid */
    const mw = median(boxes.map(w));
    return boxes.every((b) => w(b) <= mw * 1.6 + 8 && w(b) >= mw / 1.6 - 8);
  }
  const mw = median(boxes.map(w));
  const mh = median(boxes.map(h));
  return boxes.every((b) => Math.abs(w(b) - mw) <= Math.max(6, mw * 0.2) && Math.abs(h(b) - mh) <= Math.max(6, mh * 0.2));
}

/** the leaves of a row, when it is nothing but leaves */
const leafRow = (s: Shape): Box[] | null => (s.kind === "row" && s.kids.every((k) => k.kind === "leaf") ? s.kids.map((k) => (k as { box: Box }).box) : null);
const leafStack = (s: Shape): Box[] | null => (s.kind === "stack" && s.kids.every((k) => k.kind === "leaf") ? s.kids.map((k) => (k as { box: Box }).box) : s.kind === "leaf" ? [s.box] : null);

/** a short last row still belongs to the grid when its boxes stand under the grid's first columns */
const fitsColumns = (row: Box[], first: Box[]) => row.length < first.length && row.every((b, i) => Math.abs(b.l - first[i].l) <= Math.max(12, w(first[i]) * 0.35));

/** Rows of like boxes become grids, and columns of them too, at every depth. */
export function withGrids(s: Shape): Shape {
  if (s.kind === "leaf" || s.kind === "grid") return s;
  const kids = s.kids.map(withGrids);
  if (s.kind === "row") {
    /* columns of like boxes, the same count in each: a grid read column by column */
    const cols = kids.map(leafStack);
    if (kids.length >= 2 && cols.every((c): c is Box[] => !!c)) {
      const n = cols[0].length;
      if (n >= 2 && cols.every((c) => c.length === n || (c.length === n - 1 && c === cols[cols.length - 1])) && alike(cols.flat())) {
        const cells = Array.from({ length: n }, (_, r) => cols.flatMap((c) => (c[r] ? [c[r]] : [])));
        return { kind: "grid", cells };
      }
    }
    return { kind: "row", kids };
  }
  /* consecutive rows of like boxes, the same count in each */
  const out: Shape[] = [];
  for (let i = 0; i < kids.length; ) {
    const first = leafRow(kids[i]);
    if (first && first.length >= 2) {
      const run: Box[][] = [first];
      let j = i + 1;
      for (; j < kids.length; j++) {
        const next = leafRow(kids[j]) ?? (kids[j].kind === "leaf" ? [(kids[j] as { box: Box }).box] : null);
        if (!next) break;
        if (next.length === first.length || fitsColumns(next, first)) {
          if (!alike([...run.flat(), ...next])) break;
          run.push(next);
          if (next.length < first.length) {
            j++;
            break;
          }
        } else break;
      }
      if (run.length >= 2) {
        out.push({ kind: "grid", cells: run });
        i = j;
        continue;
      }
    }
    out.push(kids[i]);
    i++;
  }
  return out.length === 1 ? out[0] : { kind: "stack", kids: out };
}

/** The structure of a set of boxes: cut, then grids found. */
export const structureOf = (boxes: Box[], prefer: "x" | "y" = "y"): Shape => withGrids(xyCut(boxes, prefer));

/* ---------- spacing and lining up ---------- */

/** A gap snapped to the spacing scale: within reach of one of its steps it is that step, else it lands on the 4dp grid.
 *  Butted parts stay butted. Snapping twice gives the same answer as snapping once. */
export function gapSnapper(scale: number[]): (gap: number) => number {
  const steps = [...new Set(scale.filter((s) => Number.isFinite(s) && s > 0))].sort((a, b) => a - b);
  return (gap) => {
    if (!(gap > 2)) return 0;
    const r = Math.max(4, Math.round(gap / 4) * 4);
    let best: number | null = null;
    for (const s of steps) if (Math.abs(r - s) <= Math.max(2, s * 0.15) && (best === null || Math.abs(r - s) < Math.abs(r - best))) best = s;
    return best ?? r;
  };
}

/** Which line a run shares, judged by how far apart its members stand on each: the one they are closest to sharing.
 *  `axis` "y" reads a row (tops, middles, bottoms, baselines), "x" a column (lefts, centres, rights). A line the run
 *  already shares exactly is kept. Otherwise a row centres unless another line is clearly nearer, and a column keeps
 *  to the nearest edge, its start on a tie: what a designer would do with a row of mixed heights and a column of text. */
export function alignIntent(rects: (Rect & { base?: number })[], axis: "x" | "y"): Intent {
  if (rects.length < 2) return axis === "y" ? "center" : "start";
  const lo = axis === "x" ? "l" : "t";
  const hi = axis === "x" ? "r" : "b";
  const spread = (vals: number[]) => Math.max(...vals) - Math.min(...vals);
  const s: Partial<Record<Intent, number>> = {
    start: spread(rects.map((r) => r[lo])),
    center: spread(rects.map((r) => (r[lo] + r[hi]) / 2)),
    end: spread(rects.map((r) => r[hi])),
  };
  const sizes = spread(rects.map(axis === "y" ? h : w));
  /* baselines say something only between parts that carry text and are not all one height */
  if (axis === "y" && rects.every((r) => r.base !== undefined) && sizes > 2) s.baseline = spread(rects.map((r) => r.t + r.base!));
  const order: Intent[] = axis === "y" ? ["center", "start", "baseline", "end"] : ["start", "center", "end"];
  const known = order.filter((k) => s[k] !== undefined);
  /* a line shared to the pixel (a baseline only estimated, to two) was meant */
  const exact = known.find((k) => s[k]! <= (k === "baseline" ? 2 : 1));
  if (exact) return exact;
  const best = known.reduce((a, b) => (s[b]! < s[a]! - 1 ? b : a));
  /* a row centres, a column keeps to its start, unless another line is clearly nearer */
  const usual = axis === "y" ? "center" : "start";
  if (s[usual]! - s[best]! <= Math.max(2, sizes * 0.25)) return usual;
  return best;
}

/** Runs of a row that belong together: a gap much wider than the narrowest one, and wide in itself, is a break
 *  between them (a title, then the icons of its actions). Indices of the kids in each run. */
export function runsOf(gaps: number[]): number[][] {
  const out: number[][] = [[0]];
  if (!gaps.length) return out;
  const small = Math.max(8, Math.min(...gaps.map((g) => Math.max(0, g))));
  gaps.forEach((g, i) => {
    if (g >= Math.max(32, small * 3)) out.push([i + 1]);
    else out[out.length - 1].push(i + 1);
  });
  return out;
}

/** where something of size `own` goes in `room` for an intent */
export const offsetIn = (room: number, own: number, intent: Intent) => (intent === "center" ? (room - own) / 2 : intent === "end" ? room - own : 0);

/* ---------- arranging ---------- */

export type Placed = Map<string, { l: number; t: number }>;

/** a shape arranged: how big it comes out, where its first text baseline is, and how to put it down */
export type Block = { w: number; h: number; base?: number; place: (l: number, t: number, out: Placed) => void };

export type ArrangeOptions = {
  /** a gap, snapped to the scale */
  snap: (gap: number) => number;
  /** a row this wide or wider keeps its ends apart rather than closing up */
  spreadGap?: number;
};

const gapsAlong = (rects: Rect[], axis: "x" | "y") =>
  rects.slice(1).map((r, i) => Math.max(0, axis === "x" ? r.l - rects[i].r : r.t - rects[i].b));

/** A stack of blocks: one gap between them all, lined up on the edge they come closest to sharing. */
function stackBlock(kids: Shape[], o: ArrangeOptions): Block {
  const sorted = [...kids].sort((a, b) => boundsOf(a).t - boundsOf(b).t);
  const rects = sorted.map(boundsOf);
  const blocks = sorted.map((k) => blockOf(k, o));
  const gap = o.snap(median(gapsAlong(rects, "y")));
  const intent = alignIntent(rects, "x");
  const width = Math.max(...blocks.map((b) => b.w));
  const height = blocks.reduce((n, b) => n + b.h, 0) + gap * (blocks.length - 1);
  return {
    w: width,
    h: height,
    base: blocks[0].base,
    place: (l, t, out) => {
      let y = t;
      for (const b of blocks) {
        b.place(l + offsetIn(width, b.w, intent), y, out);
        y += b.h + gap;
      }
    },
  };
}

/** The vertical place of each block in a row, by the line the row's members come closest to sharing. */
export function rowOffsets(rects: (Rect & { base?: number })[], blocks: { h: number; base?: number }[]): { offsets: number[]; h: number; base?: number } {
  const intent = alignIntent(rects.map((r, i) => ({ ...r, base: blocks[i].base })), "y");
  if (intent === "baseline") {
    const top = Math.max(...blocks.map((b) => b.base!));
    const offsets = blocks.map((b) => top - b.base!);
    return { offsets, h: Math.max(...blocks.map((b, i) => offsets[i] + b.h)), base: top };
  }
  const height = Math.max(...blocks.map((b) => b.h));
  const offsets = blocks.map((b) => offsetIn(height, b.h, intent));
  const first = blocks.findIndex((b) => b.base !== undefined);
  return { offsets, h: height, base: first < 0 ? undefined : offsets[first] + blocks[first].base! };
}

/** The x of each block of a row inside `width`: runs packed with one gap each, the runs spread to both ends. */
export function rowXs(blocks: { w: number }[], runs: number[][], gapIn: number[], width: number): number[] {
  const runW = runs.map((run, j) => run.reduce((n, i) => n + blocks[i].w, 0) + gapIn[j] * (run.length - 1));
  /* one run spread over the width is every member spaced evenly */
  if (runs.length === 1 && runs[0].length > 1 && width > runW[0]) {
    const run = runs[0];
    const each = (width - run.reduce((n, i) => n + blocks[i].w, 0)) / (run.length - 1);
    const xs: number[] = [];
    let x = 0;
    for (const i of run) {
      xs[i] = x;
      x += blocks[i].w + each;
    }
    return xs;
  }
  const between = runs.length > 1 ? Math.max(0, (width - runW.reduce((a, b) => a + b, 0)) / (runs.length - 1)) : 0;
  const xs: number[] = [];
  let x = 0;
  runs.forEach((run, j) => {
    for (const i of run) {
      xs[i] = x;
      x += blocks[i].w + gapIn[j];
    }
    x += between - gapIn[j];
  });
  return xs;
}

/** A row of blocks. Close together they pack with one gap; with a wide break, or spaced wide, the row keeps the
 *  width it has and its runs go to its ends. */
function rowBlock(kids: Shape[], o: ArrangeOptions): Block {
  const sorted = [...kids].sort((a, b) => boundsOf(a).l - boundsOf(b).l);
  const rects = sorted.map(boundsOf);
  const blocks = sorted.map((k) => blockOf(k, o));
  const gaps = gapsAlong(rects, "x");
  const runs = runsOf(gaps);
  const gapIn = runs.map((run) => o.snap(median(run.slice(1).map((i) => gaps[i - 1]))));
  const spreadGap = o.spreadGap ?? 32;
  const spread = runs.length > 1 || (gaps.length > 0 && Math.min(...gaps) >= spreadGap);
  const packed = blocks.reduce((n, b) => n + b.w, 0) + (spread ? 0 : gapIn[0] * (blocks.length - 1));
  const width = spread ? Math.max(rects[rects.length - 1].r - rects[0].l, packed + 8 * (blocks.length - 1)) : packed;
  const xs = spread ? rowXs(blocks, runs, gapIn, width) : rowXs(blocks, [blocks.map((_, i) => i)], [gapIn[0]], packed);
  const { offsets, h: height, base } = rowOffsets(rects, blocks);
  return {
    w: width,
    h: height,
    base,
    place: (l, t, out) => blocks.forEach((b, i) => b.place(l + xs[i], t + offsets[i], out)),
  };
}

/** The columns and rows of a grid: each column as wide as its widest cell, each row as tall as its tallest. */
export function gridMeasure(cells: Box[][]) {
  const cols = Math.max(...cells.map((r) => r.length));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(...cells.flatMap((r) => (r[c] ? [w(r[c])] : [0]))));
  const rowH = cells.map((r) => Math.max(...r.map(h)));
  const gx = median(cells.flatMap((r) => gapsAlong(r, "x")));
  const gy = median(cells.slice(1).map((r, i) => Math.max(0, Math.min(...r.map((b) => b.t)) - Math.max(...cells[i].map((b) => b.b)))));
  return { cols, colW, rowH, gx, gy };
}

/** A grid made even: one gap across, one gap down, each cell on the line its column and its row come closest to
 *  sharing. `gx` and `gy` say the gaps where the caller has decided them. */
export function gridBlock(cells: Box[][], o: ArrangeOptions, given: { gx?: number; gy?: number } = {}): Block {
  const m = gridMeasure(cells);
  const gx = given.gx ?? o.snap(m.gx);
  const gy = given.gy ?? o.snap(m.gy);
  const colIntent = Array.from({ length: m.cols }, (_, c) => alignIntent(cells.flatMap((r) => (r[c] ? [r[c]] : [])), "x"));
  const rowLay = cells.map((r) => rowOffsets(r, r.map((b) => ({ h: h(b), base: b.base }))));
  const width = m.colW.reduce((a, b) => a + b, 0) + gx * (m.cols - 1);
  const rowsH = rowLay.map((r) => r.h);
  return {
    w: width,
    h: rowsH.reduce((a, b) => a + b, 0) + gy * (cells.length - 1),
    base: rowLay[0].base,
    place: (l, t, out) => {
      let y = t;
      cells.forEach((row, ri) => {
        let x = l;
        row.forEach((b, c) => {
          out.set(b.id, { l: Math.round(x + offsetIn(m.colW[c], w(b), colIntent[c])), t: Math.round(y + rowLay[ri].offsets[c]) });
          x += m.colW[c] + gx;
        });
        y += rowsH[ri] + gy;
      });
    },
  };
}

/** A shape arranged by the rules above, at any depth. */
export function blockOf(s: Shape, o: ArrangeOptions): Block {
  switch (s.kind) {
    case "leaf":
      return { w: w(s.box), h: h(s.box), base: s.box.base, place: (l, t, out) => out.set(s.box.id, { l: Math.round(l), t: Math.round(t) }) };
    case "stack":
      return stackBlock(s.kids, o);
    case "row":
      return rowBlock(s.kids, o);
    case "grid":
      return gridBlock(s.cells, o);
  }
}
