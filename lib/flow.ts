import { partBySlug, reader } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import type { FlowValues } from "../parts/flow";
import { Group, Item, groupBounds, heldBy, holdsParts, liesInside, makeItem, ownerIdOf, unionRect, type FlowAlign, type FlowSizing } from "./tokens";
import { alignIntent, boundsOf, gapSnapper, gridMeasure, median, runsOf, structureOf, union, type Box, type Rect, type Shape } from "./structure";

/* Auto layout on the canvas. Parts stay where the document says they are, so everything else (the
 * preview, the guides, the layers) keeps working; a container with a layout rewrites those places.
 * What belongs to it is named on the part (`Group.inFlow`), because what overflows a container must
 * not fall out of it. Dropping a part in or out is all it takes, and the order is where it was let go.
 *
 * Each part in a layout may say how it is sized on each axis (its own measure, its contents, or the
 * room it is given), where it stands across the run, the least and most it may be made, how many
 * columns of a grid it takes, and that it stays where it was put (absolute), as in Figma. */

type Size = { w: number; h: number };
type Widths = Record<string, number>;
export type Flow = FlowValues & { hugW: boolean; hugH: boolean; rows?: number; inset: { t: number; r: number; b: number; l: number } };

/** the arrangement a group's part asks for, or null when it has none */
export function flowOf(g: Group): Flow | null {
  return holdsParts(g) ? flowOfItem(g.items[0]) : null;
}

/** the arrangement a container asks for, or null when it has none */
export function flowOfItem(it: Item): Flow | null {
  const def = partBySlug(it.component);
  if (!def?.flow) return null;
  const p = reader(def, it.props);
  const has = (key: string) => def.props.some((d) => d.key === key);
  const dir = def.flow.grid ? "grid" : p.s("layout");
  if (dir !== "row" && dir !== "column" && dir !== "grid") return null;
  /* a value that is only there when it was set: left out, the linked form says it */
  const own = (key: string) => {
    const v = it.props?.[key];
    return has(key) && typeof v === "number" && Number.isFinite(v) ? Math.round(p.n(key)) : undefined;
  };
  const gap = Math.round(p.n("gap"));
  const padX = Math.round(p.n("padX"));
  const padY = Math.round(p.n("padY"));
  return {
    dir,
    gap,
    gapY: own("gapY") ?? gap,
    padX,
    padY,
    pad: { t: own("padTop") ?? padY, r: own("padRight") ?? padX, b: own("padBottom") ?? padY, l: own("padLeft") ?? padX },
    align: p.s("align"),
    justify: has("justify") ? p.s("justify") : "start",
    wrap: has("wrap") && p.b("wrap"),
    columns: Math.max(1, Math.round(p.n("columns"))),
    hugW: has("hugWidth") && p.b("hugWidth"),
    hugH: has("hugHeight") && p.b("hugHeight"),
    rows: def.flow.grid ? Math.max(1, Math.round(p.n("rows"))) : undefined,
    inset: { t: 0, r: 0, b: 0, l: 0, ...def.flow.inset?.(p) },
  };
}

/* ---------- a part in a layout ---------- */

const SIZINGS = new Set<FlowSizing>(["fixed", "hug", "fill"]);
const ALIGNS = new Set<FlowAlign>(["start", "center", "end", "stretch", "baseline"]);
const isSize = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** the one part a group in a layout is, when it is one */
const lone = (g: Group): Item | undefined => (g.items.length === 1 ? g.items[0] : undefined);

/** what a part asks of the layout it is in, read safely: a file edited by hand may say anything */
export type ChildLayout = {
  /** set on the part itself, rather than read off the container */
  size: { w?: FlowSizing; h?: FlowSizing };
  self?: FlowAlign;
  absolute: boolean;
  min: { w?: number; h?: number };
  max: { w?: number; h?: number };
  span: number;
};

export function childLayoutOf(it: Item | undefined): ChildLayout {
  const size = it?.flowSize && typeof it.flowSize === "object" ? it.flowSize : {};
  const pick = (v: unknown) => (SIZINGS.has(v as FlowSizing) ? (v as FlowSizing) : undefined);
  const lim = (o: unknown) => (o && typeof o === "object" ? { w: isSize((o as Size).w) ? (o as Size).w : undefined, h: isSize((o as Size).h) ? (o as Size).h : undefined } : {});
  const span = it?.flowSpan;
  return {
    size: { w: pick(size.w), h: pick(size.h) },
    self: ALIGNS.has(it?.alignSelf as FlowAlign) ? it!.alignSelf : undefined,
    absolute: it?.flowAbsolute === true,
    min: lim(it?.flowMin),
    max: lim(it?.flowMax),
    span: typeof span === "number" && Number.isFinite(span) ? Math.max(1, Math.min(12, Math.round(span))) : 1,
  };
}

/** a part's own way of sizing itself on an axis, with no layout around it: its contents when it is a layout that hugs them */
function ownSizing(it: Item | undefined, axis: "w" | "h"): FlowSizing {
  const f = it && flowOfItem(it);
  return f && (axis === "w" ? f.hugW : f.hugH) ? "hug" : "fixed";
}

/** where a part stands across the run of its layout */
export const crossAlignOf = (it: Item | undefined, parent: Flow): string => childLayoutOf(it).self ?? parent.align;

/** How a part in a layout is sized on an axis: what it says itself, else, along the run, `flowFill`; across it, the
 *  container's stretch; and failing those, its own way. In a grid the width is the cell's. */
export function sizingOf(it: Item | undefined, parent: Flow, axis: "w" | "h"): FlowSizing {
  const c = childLayoutOf(it);
  const set = c.size[axis];
  if (set) return set;
  const across = c.self ?? parent.align;
  if (parent.dir === "grid") return axis === "w" && (across === "stretch" || !!it?.flowFill) ? "fill" : axis === "h" && c.self === "stretch" ? "fill" : ownSizing(it, axis);
  const main = parent.dir === "row" ? "w" : "h";
  if (axis === main) return it?.flowFill ? "fill" : ownSizing(it, axis);
  return across === "stretch" ? "fill" : ownSizing(it, axis);
}

/** a measure kept inside the least and most the part allows */
export function withinLimits(it: Item | undefined, axis: "w" | "h", v: number): number {
  const c = childLayoutOf(it);
  const lo = c.min[axis] ?? 0;
  const hi = c.max[axis] ?? Infinity;
  return Math.max(lo, Math.min(Math.max(lo, hi), v));
}

/** Room shared among parts that fill it, each kept inside its limits: one held back by its limit leaves the rest to the others. */
export function shareOut(room: number, items: (Item | undefined)[], axis: "w" | "h"): number[] {
  const out = items.map(() => 0);
  let left = Math.max(0, room);
  let open = items.map((_, i) => i);
  while (open.length) {
    const each = left / open.length;
    const held = open.filter((i) => withinLimits(items[i], axis, each) !== each);
    if (!held.length) {
      for (const i of open) out[i] = each;
      break;
    }
    for (const i of held) {
      out[i] = withinLimits(items[i], axis, each);
      left = Math.max(0, left - out[i]);
    }
    open = open.filter((i) => !held.includes(i));
  }
  return out;
}

/** how far below its top a part's first line of text sits; a part with none sits on its foot, as in the browser */
export const baselineOf = (g: Group, h: number, widths: Widths): number => {
  const it = lone(g);
  const base = it ? widths[`${it.id}:base`] : undefined;
  return typeof base === "number" && Number.isFinite(base) && base > 0 && base <= h ? base : h;
};

/** the tab a container with tabs is showing, and how many it has; null for any other part */
function panesOf(it: Item): { shown: number; count: number } | null {
  const def = partBySlug(it.component);
  if (!def?.panes || !def.selectKey || !def.slots) return null;
  const p = reader(def, it.props);
  const count = def.slots(p).length;
  return { count, shown: Math.max(0, Math.min(count - 1, Math.round(p.n(def.selectKey)))) };
}

/** a part's tab under a host, kept to the tabs there are: removing a tab must not lose its content */
const paneIn = (g: Group, panes: { count: number }) => Math.max(0, Math.min(panes.count - 1, g.pane ?? 0));

/** what its dock's chosen tab is not showing, and what those parts hold in turn */
export function outOfPane(groups: Group[], widths: Widths): Set<string> {
  const out = new Set<string>();
  for (const host of groups) {
    const panes = holdsParts(host) ? panesOf(host.items[0]) : null;
    if (!panes) continue;
    const held = heldBy(host, groups, widths);
    /* only what the dock holds directly has a tab; the rest goes with what it stands in */
    const nested = new Set(held.flatMap((g) => heldBy(g, groups, widths).map((x) => x.id)));
    for (const g of held) {
      if (nested.has(g.id) || paneIn(g, panes) === panes.shown) continue;
      out.add(g.id);
      for (const inner of heldBy(g, groups, widths)) out.add(inner.id);
    }
  }
  return out;
}

/** The docks brought round to the tabs the parts given stand on, the outermost dock first: what is
 *  picked out in the layers has to be on the canvas to be worked on. The same array when all of it is
 *  showing already. */
export function showingGroups(source: Group[], ids: Set<string>, widths: Widths): Group[] {
  let groups = source;
  /* one dock a pass, since a dock on a tab of another only counts once that tab is showing */
  for (let pass = 0; pass < 8; pass++) {
    const off = outOfPane(groups, widths);
    if (![...ids].some((id) => off.has(id))) break;
    const next = groups.find((host) => {
      const panes = holdsParts(host) ? panesOf(host.items[0]) : null;
      return panes && offTabHolding(host, panes, groups, ids, widths) !== null;
    });
    if (!next) break;
    const it = next.items[0];
    const pane = offTabHolding(next, panesOf(it)!, groups, ids, widths)!;
    groups = groups.map((g) => (g === next ? { ...g, items: [{ ...it, props: { ...it.props, [partBySlug(it.component)!.selectKey!]: pane } }] } : g));
  }
  return groups;
}

/** the tab of a dock, other than the one showing, that holds one of the parts given */
function offTabHolding(host: Group, panes: { shown: number; count: number }, groups: Group[], ids: Set<string>, widths: Widths): number | null {
  const held = heldBy(host, groups, widths);
  const nested = new Set(held.flatMap((g) => heldBy(g, groups, widths).map((x) => x.id)));
  for (const g of held) {
    if (nested.has(g.id) || paneIn(g, panes) === panes.shown) continue;
    if (ids.has(g.id) || heldBy(g, groups, widths).some((x) => ids.has(x.id))) return paneIn(g, panes);
  }
  return null;
}

/** A part let go takes the tab showing on the dock it landed on, and gives it up anywhere else. */
function settlePane(groups: Group[], id: string, widths: Widths): Group[] {
  const g = groups.find((x) => x.id === id);
  if (!g) return groups;
  const b = groupBounds(g, widths);
  const cx = (b.l + b.r) / 2;
  const cy = (b.t + b.b) / 2;
  const inside = flowDescendants(id, groups);
  const off = outOfPane(groups, widths);
  let holder: Group | undefined;
  for (let i = groups.length - 1; i >= 0 && !holder; i--) {
    const o = groups[i];
    if (o.id === id || inside.has(o.id) || off.has(o.id) || !holdsParts(o)) continue;
    const s = ownSize(o, widths);
    if (cx >= o.x && cx <= o.x + s.w && cy >= o.y && cy <= o.y + s.h) holder = o;
  }
  const shown = holder ? panesOf(holder.items[0])?.shown : undefined;
  if (g.pane === shown) return groups;
  const { pane: _was, ...rest } = g;
  const next: Group = shown === undefined ? rest : { ...rest, pane: shown };
  return groups.map((x) => (x === g ? next : x));
}

/** The tabs of a dock put in a new order: `order` holds, for each new tab, the index it had (-1 for
 *  a new one). What the dock holds stays with its tab; what stood on a removed tab moves to the one
 *  taking its place, rather than being lost with it. */
export function panesAfterReorder(groups: Group[], hostId: string, order: number[], widths: Widths): Group[] {
  const host = groups.find((g) => g.id === hostId);
  if (!host || !panesOf(host.items[0])) return groups;
  const held = heldBy(host, groups, widths);
  const nested = new Set(held.flatMap((g) => heldBy(g, groups, widths).map((x) => x.id)));
  const direct = new Set(held.filter((g) => !nested.has(g.id)).map((g) => g.id));
  return groups.map((g) => {
    if (!direct.has(g.id)) return g;
    const was = g.pane ?? 0;
    const at = order.indexOf(was);
    const pane = at >= 0 ? at : Math.min(was, Math.max(0, order.length - 1));
    return pane === was ? g : { ...g, pane };
  });
}

/** a part's own measure when it says it itself (a container, an instance), else what was measured */
export function ownSize(g: Group, widths: Widths): Size {
  const b = groupBounds(g, widths);
  const size = { w: b.r - b.l, h: b.b - b.t };
  if (g.items.length !== 1) return size;
  const it = g.items[0];
  const ax = resizeOf(partBySlug(it.component), it.props);
  if (!(holdsParts(g) || g.instanceOf) || !ax) return size;
  return { w: ax.width ? axisValue(ax.width, it.props) : size.w, h: ax.height ? axisValue(ax.height, it.props) : size.h };
}

/** a part has been drawn and measured, or says its measure itself */
const measured = (g: Group, widths: Widths) => holdsParts(g) || !!g.instanceOf || g.items.every((it) => widths[it.id] !== undefined);

/** the order a layout reads parts in, from where they stand */
function readingOrder(f: Flow): (a: Group, b: Group) => number {
  if (f.dir === "row" && !f.wrap) return (a, b) => a.x - b.x;
  if (f.dir === "column") return (a, b) => a.y - b.y;
  /* row by row: tops close enough are one row */
  return (a, b) => (Math.abs(a.y - b.y) < 16 ? a.x - b.x : a.y - b.y);
}

/** the parts of a layout put in reading order, in the places in the array that they already take:
 *  a layout goes by the order of the array, so that nothing but a drop can reorder it */
function sortKids(groups: Group[], hostId: string, f: Flow): Group[] {
  const at = groups.flatMap((g, i) => (g.inFlow === hostId ? [i] : []));
  const sorted = at.map((i) => groups[i]).sort(readingOrder(f));
  if (sorted.every((g, i) => g === groups[at[i]])) return groups;
  const out = [...groups];
  at.forEach((i, n) => (out[i] = sorted[n]));
  return out;
}

/** Who belongs to which layout, kept true: a part whose layout is gone or switched off is its own
 *  again, and what lies inside a layout with nothing nearer around it (a container whose layout was
 *  just switched on, a part added by tapping) belongs to it. */
function membership(groups: Group[], widths: Widths): Group[] {
  const flowing = new Map(groups.flatMap((g) => {
    const f = flowOf(g);
    return f ? [[g.id, f] as const] : [];
  }));
  const joined = new Set<string>();
  const out = groups.map((g, i) => {
    if (g.inFlow !== undefined) {
      if (typeof g.inFlow === "string" && flowing.has(g.inFlow) && g.inFlow !== g.id) return g;
      const { inFlow: _gone, ...rest } = g;
      return rest;
    }
    /* what an instance or a repeated row expanded to belongs to it, wherever it happens to lie */
    if (!flowing.size || g.locked || !measured(g, widths) || ownerIdOf(g.id) !== undefined) return g;
    let near: Group | null = null;
    let area = Infinity;
    for (let j = 0; j < i; j++) {
      const o = groups[j];
      if (!holdsParts(o)) continue;
      const b = groupBounds(o, widths);
      const size = (b.r - b.l) * (b.b - b.t);
      if (size < area && liesInside(g, b, widths)) {
        near = o;
        area = size;
      }
    }
    if (!near || !flowing.has(near.id)) return g;
    joined.add(near.id);
    /* added by a tap, it goes on the tab that is showing */
    const panes = panesOf(near.items[0]);
    return { ...g, inFlow: near.id, ...(panes ? { pane: panes.shown } : {}) };
  });
  return [...joined].reduce((gs, id) => sortKids(gs, id, flowing.get(id)!), out);
}

/** the cells a grid puts its parts in, row by row: a part spanning more columns than a row has left starts the next */
export function gridRows<T>(kids: T[], columns: number, spanOf: (k: T) => number): { k: T; col: number; span: number }[][] {
  const rows: { k: T; col: number; span: number }[][] = [];
  let col = 0;
  for (const k of kids) {
    const span = Math.max(1, Math.min(columns, spanOf(k)));
    if (!rows.length || col + span > columns) {
      rows.push([]);
      col = 0;
    }
    rows[rows.length - 1].push({ k, col, span });
    col += span;
  }
  return rows;
}

/** where the first part of a run starts and how far apart the parts stand, for what is spare along it */
export function distribute(justify: string, spare: number, count: number, gap: number): { start: number; step: number } {
  if (spare <= 0 || count === 0) return { start: 0, step: gap };
  switch (justify) {
    case "center":
      return { start: spare / 2, step: gap };
    case "end":
      return { start: spare, step: gap };
    case "between":
      return count > 1 ? { start: 0, step: gap + spare / (count - 1) } : { start: 0, step: gap };
    case "around":
      return { start: spare / count / 2, step: gap + spare / count };
    case "evenly":
      return { start: spare / (count + 1), step: gap + spare / (count + 1) };
    default:
      return { start: 0, step: gap };
  }
}

/** Everything a layout decides, written back only where it differs: the same array when nothing
 *  does, so this can run after every change without causing another. */
export function arrangeFlows(source: Group[], widths: Widths): Group[] {
  const groups = source.some((g) => g.inFlow !== undefined || holdsParts(g)) ? membership(source, widths) : source;
  const flows = new Map<string, Flow>();
  for (const g of groups) {
    /* a locked container is finished: it stays as it is, with what is in it */
    const f = g.locked ? null : flowOf(g);
    if (f) flows.set(g.id, f);
  }
  if (!flows.size) return groups.every((g, i) => g === source[i]) ? source : groups;
  const work = new Map(groups.map((g) => [g.id, g]));
  const sizes = new Map<string, Size>();
  const sizeOf = (id: string) => sizes.get(id) ?? ownSize(work.get(id)!, widths);
  const kidsOf = new Map<string, Group[]>();
  /* what stands where it was put: it takes no place in the run, and goes where its container goes */
  const looseOf = new Map<string, Group[]>();
  for (const g of groups) {
    if (!g.inFlow || !flows.has(g.inFlow) || g.locked || g.inFlow === g.id) continue;
    /* another tab's content takes no room here; it is laid out when its tab is chosen */
    const panes = panesOf(work.get(g.inFlow)!.items[0]);
    if (panes && paneIn(g, panes) !== panes.shown) continue;
    const into = childLayoutOf(lone(g)).absolute ? looseOf : kidsOf;
    into.set(g.inFlow, [...(into.get(g.inFlow) ?? []), g]);
  }

  /** a measure of a part, where the part has a number for it, kept to the least and most it allows in its layout */
  const setAxis = (id: string, axis: "width" | "height", v: number) => {
    const g = work.get(id)!;
    /* an instance is as big as what its definition comes to; a layout places it but does not size it */
    if (g.items.length !== 1 || g.instanceOf || g.expandedFrom) return;
    const it = g.items[0];
    const ax = resizeOf(partBySlug(it.component), it.props)?.[axis];
    if (!ax || ax.kind !== "number") return;
    const limited = g.inFlow && flows.has(g.inFlow) ? withinLimits(it, axis === "width" ? "w" : "h", v) : v;
    const next = axisWrite(ax, Math.round(limited)) as number;
    sizes.set(id, { ...sizeOf(id), [axis === "width" ? "w" : "h"]: next });
    if (Math.abs(axisValue(ax, it.props) - next) < 1) return;
    work.set(id, { ...g, items: [{ ...it, props: { ...it.props, [ax.key]: next } }] });
  };

  const ordered = (id: string) => (kidsOf.get(id) ?? []).map((g) => work.get(g.id)!);
  const loose = (id: string) => (looseOf.get(id) ?? []).map((g) => work.get(g.id)!);
  /** the layout that places a part, when one does */
  const parentOf = (g: Group) => (g.inFlow && !childLayoutOf(lone(g)).absolute ? flows.get(g.inFlow) : undefined);

  /** the axis its layout decides for a part (filled, along the run or across it): hugging its own contents on that
   *  axis would fight it for good. A layout that hugs that axis itself has no room to give. */
  const givenByParent = (id: string, axis: "w" | "h", depth = 0): boolean => {
    const g = work.get(id)!;
    const parent = parentOf(g);
    if (!parent || depth > 32 || sizingOf(lone(g), parent, axis) !== "fill") return false;
    if (!hugsOn(g.inFlow!, axis, depth + 1)) return true;
    /* a layout sized by its contents still gives what fills across it the size the others give it, as Figma's "fill
     * container" in a hugging frame; along the run, or with nothing else to go by, there is nothing to give */
    if (axis !== (parent.dir === "row" ? "h" : "w")) return false;
    return ordered(g.inFlow!).some((k) => k.id !== id && sizingOf(lone(k), parent, axis) !== "fill");
  };
  /** whether a container takes the size of its contents on an axis, all said: its own prop, unless its layout fills it
   *  or the part says otherwise */
  function hugsOn(id: string, axis: "w" | "h", depth = 0): boolean {
    const g = work.get(id)!;
    const f = flows.get(id)!;
    if (givenByParent(id, axis, depth)) return false;
    const set = parentOf(g) ? childLayoutOf(lone(g)).size[axis] : undefined;
    return set === "hug" ? true : set === "fixed" ? false : axis === "w" ? f.hugW : f.hugH;
  }
  /** the parts that say how big a layout comes out across: not those it stretches, unless that is all of them */
  const measuring = (kids: Group[], axis: "w" | "h") => {
    const own = kids.filter((k) => !givenByParent(k.id, axis));
    return own.length ? own : kids;
  };

  /** a line of a row (or a row of a grid): how tall it comes out, and how far each part stands below its top when it
   *  lines up on the text baseline */
  const lineLay = (line: Group[], f: Flow) => {
    const hs = line.map((k) => sizeOf(k.id).h);
    const bases = line.map((k, i) => (crossAlignOf(lone(k), f) === "baseline" ? baselineOf(k, hs[i], widths) : undefined));
    const top = Math.max(0, ...bases.map((b) => b ?? 0));
    const offs = bases.map((b) => (b === undefined ? 0 : top - b));
    return { h: Math.max(0, ...line.map((_, i) => offs[i] + hs[i])), offs };
  };

  const seen = new Set<string>();
  /** the rows a wrapping row breaks into within `room` */
  const linesOf = (kids: Group[], f: Flow, room: number) => {
    const lines: Group[][] = [];
    let at = 0;
    for (const k of kids) {
      const w = sizeOf(k.id).w;
      if (f.wrap && lines.length && at + w > room) {
        lines.push([k]);
        at = w + f.gap;
      } else {
        if (!lines.length) lines.push([]);
        lines[lines.length - 1].push(k);
        at += w + f.gap;
      }
    }
    return lines;
  };
  const spanOf = (k: Group) => childLayoutOf(lone(k)).span;

  /* inside first: a container that hugs its contents has to know them */
  const hug = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const f = flows.get(id)!;
    const kids = ordered(id);
    for (const k of [...kids, ...loose(id)]) if (flows.has(k.id)) hug(k.id);
    const hugW = hugsOn(id, "w");
    const hugH = hugsOn(id, "h");
    if (!kids.length || (!hugW && !hugH) || !kids.every((k) => measured(k, widths))) return;
    const s = kids.map((k) => sizeOf(k.id));
    const gaps = f.gap * (kids.length - 1);
    const across = f.pad.l + f.pad.r + f.inset.l + f.inset.r;
    const down = f.pad.t + f.pad.b + f.inset.t + f.inset.b;
    if (f.dir === "grid") {
      const rows = gridRows(kids, f.columns, spanOf);
      const sizing = new Set(measuring(kids, "w").map((k) => k.id));
      const cellW = Math.max(...rows.flat().filter((c) => sizing.has(c.k.id)).map((c) => (sizeOf(c.k.id).w - f.gap * (c.span - 1)) / c.span));
      if (hugW) setAxis(id, "width", across + cellW * f.columns + f.gap * (f.columns - 1));
      if (hugH) setAxis(id, "height", down + rows.reduce((n, r) => n + lineLay(r.map((c) => c.k), f).h, 0) + f.gapY * (rows.length - 1));
      return;
    }
    if (f.dir === "row") {
      if (hugW) setAxis(id, "width", across + s.reduce((n, x) => n + x.w, 0) + gaps);
      if (hugH) {
        const lines = f.wrap && !hugW ? linesOf(kids, f, sizeOf(id).w - across) : [kids];
        setAxis(id, "height", down + lines.reduce((n, l) => n + lineLay(measuring(l, "h"), f).h, 0) + f.gapY * (lines.length - 1));
      }
      return;
    }
    if (hugW) setAxis(id, "width", across + Math.max(...measuring(kids, "w").map((k) => sizeOf(k.id).w)));
    if (hugH) setAxis(id, "height", down + s.reduce((n, x) => n + x.h, 0) + gaps);
  };
  for (const id of flows.keys()) hug(id);

  /** a part put in its place; what a free container holds comes along, and so does what stands loose in a layout */
  const put = (id: string, x: number, y: number) => {
    const g = work.get(id)!;
    const nx = Math.round(x);
    const ny = Math.round(y);
    const dx = nx - g.x;
    const dy = ny - g.y;
    if (!dx && !dy) return;
    if (holdsParts(g) && !flows.has(id))
      for (const held of heldBy(g, [...work.values()], widths)) {
        const h = work.get(held.id)!;
        work.set(held.id, { ...h, x: h.x + dx, y: h.y + dy });
      }
    work.set(id, { ...g, x: nx, y: ny });
    if (flows.has(id)) for (const a of loose(id)) put(a.id, a.x + dx, a.y + dy);
  };

  const placed = new Set<string>();
  /* outside next: where a container stands, and the room it has, are its children's to go by */
  const place = (id: string) => {
    if (placed.has(id)) return;
    placed.add(id);
    const f = flows.get(id)!;
    const kids = ordered(id);
    /* what has not been measured yet would be placed by a guess */
    if (!kids.every((k) => measured(k, widths))) return;
    const host = work.get(id)!;
    const size = sizeOf(id);
    const hugW = hugsOn(id, "w");
    const hugH = hugsOn(id, "h");
    const left = host.x + f.inset.l + f.pad.l;
    const top = host.y + f.inset.t + f.pad.t;
    const roomW = Math.max(0, size.w - f.inset.l - f.inset.r - f.pad.l - f.pad.r);
    const roomH = Math.max(0, size.h - f.inset.t - f.inset.b - f.pad.t - f.pad.b);
    const at = (k: Group, room: number, own: number) => {
      const a = crossAlignOf(lone(k), f);
      return a === "center" ? (room - own) / 2 : a === "end" ? room - own : 0;
    };
    const fills = (k: Group, axis: "w" | "h") => sizingOf(lone(k), f, axis) === "fill";

    if (f.dir === "grid") {
      const cellW = (roomW - f.gap * (f.columns - 1)) / f.columns;
      /* a grid that says how many rows it has divides its height among them */
      const given = f.rows && !hugH ? (roomH - f.gapY * (f.rows - 1)) / f.rows : 0;
      let y = top;
      for (const row of gridRows(kids, f.columns, spanOf)) {
        const spanW = (c: { span: number }) => cellW * c.span + f.gap * (c.span - 1);
        for (const c of row) if (givenByParent(c.k.id, "w")) setAxis(c.k.id, "width", spanW(c));
        const own = row.filter((c) => !fills(c.k, "h"));
        const tall = given || Math.max(0, ...(own.length ? own : row).map((c) => sizeOf(c.k.id).h));
        for (const c of row) if (fills(c.k, "h")) setAxis(c.k.id, "height", tall);
        const lay = lineLay(row.map((c) => c.k), f);
        const rowH = given || Math.max(tall, lay.h);
        row.forEach((c, i) => {
          const s = sizeOf(c.k.id);
          const a = crossAlignOf(lone(c.k), f);
          put(c.k.id, left + c.col * (cellW + f.gap) + at(c.k, spanW(c), s.w), y + (a === "baseline" ? lay.offs[i] : at(c.k, rowH, s.h)));
        });
        y += rowH + f.gapY;
      }
    } else if (f.dir === "row") {
      const lines = f.wrap ? linesOf(kids, f, roomW) : kids.length ? [kids] : [];
      let y = top;
      for (const line of lines) {
        const gaps = f.gap * (line.length - 1);
        const fillers = line.filter((k) => fills(k, "w"));
        const fixed = line.filter((k) => !fills(k, "w")).reduce((n, k) => n + sizeOf(k.id).w, 0);
        if (fillers.length && !hugW) {
          const shares = shareOut(roomW - fixed - gaps, fillers.map(lone), "w");
          fillers.forEach((k, i) => setAxis(k.id, "width", shares[i]));
        }
        const lineH = !f.wrap && !hugH ? roomH : lineLay(measuring(line, "h"), f).h;
        for (const k of line) if (givenByParent(k.id, "h")) setAxis(k.id, "height", lineH);
        const lay = lineLay(line, f);
        const used = line.reduce((n, k) => n + sizeOf(k.id).w, 0) + gaps;
        const { start, step } = distribute(f.justify, Math.max(0, roomW - used), line.length, f.gap);
        let x = left + start;
        line.forEach((k, i) => {
          const s = sizeOf(k.id);
          put(k.id, x, y + (crossAlignOf(lone(k), f) === "baseline" ? lay.offs[i] : at(k, lineH, s.h)));
          x += s.w + step;
        });
        y += lineH + f.gapY;
      }
    } else {
      const gaps = f.gap * Math.max(0, kids.length - 1);
      const fillers = kids.filter((k) => fills(k, "h"));
      const fixed = kids.filter((k) => !fills(k, "h")).reduce((n, k) => n + sizeOf(k.id).h, 0);
      if (fillers.length && !hugH) {
        const shares = shareOut(roomH - fixed - gaps, fillers.map(lone), "h");
        fillers.forEach((k, i) => setAxis(k.id, "height", shares[i]));
      }
      for (const k of kids) if (givenByParent(k.id, "w")) setAxis(k.id, "width", roomW);
      const used = kids.reduce((n, k) => n + sizeOf(k.id).h, 0) + gaps;
      const { start, step } = distribute(f.justify, Math.max(0, roomH - used), kids.length, f.gap);
      let y = top + start;
      for (const k of kids) {
        const s = sizeOf(k.id);
        put(k.id, left + at(k, roomW, s.w), y);
        y += s.h + step;
      }
    }
    for (const k of [...kids, ...loose(id)]) if (flows.has(k.id)) place(k.id);
  };
  /* from the outermost: a container in another is placed by it first */
  for (const id of flows.keys()) {
    const parent = work.get(id)!.inFlow;
    if (!parent || !flows.has(parent)) place(id);
  }
  /* a loop of containers each in the other, from a file edited by hand, has no outermost */
  for (const id of flows.keys()) place(id);

  /* a measure written twice over may have come back to what it was: that is no change */
  const propsOf = (g: Group) => JSON.stringify(g.items.map((it) => it.props));
  const out = groups.map((g) => {
    const next = work.get(g.id)!;
    return next === g || (next.x === g.x && next.y === g.y && propsOf(next) === propsOf(g)) ? g : next;
  });
  return out.every((g, i) => g === source[i]) ? source : out;
}

/** what lies inside a part through the layouts, at any depth */
function flowDescendants(id: string, groups: Group[], into = new Set<string>()): Set<string> {
  for (const g of groups)
    if (g.inFlow === id && !into.has(g.id)) {
      into.add(g.id);
      flowDescendants(g.id, groups, into);
    }
  return into;
}

/** the container a part let go here goes into: the topmost with a layout under its centre */
export function flowHostAt(groups: Group[], id: string, widths: Widths): Group | null {
  const g = groups.find((x) => x.id === id);
  if (!g) return null;
  const b = groupBounds(g, widths);
  const cx = (b.l + b.r) / 2;
  const cy = (b.t + b.b) / 2;
  const inside = flowDescendants(id, groups);
  const off = outOfPane(groups, widths);
  for (let i = groups.length - 1; i >= 0; i--) {
    const o = groups[i];
    if (o.id === id || o.locked || inside.has(o.id) || off.has(o.id) || !flowOf(o)) continue;
    const s = ownSize(o, widths);
    if (cx >= o.x && cx <= o.x + s.w && cy >= o.y && cy <= o.y + s.h) return o;
  }
  return null;
}

/** A part let go joins the layout it was let go in, at the place it was let go, and leaves the one it
 *  was carried out of. It is drawn over the container it is in, with whatever it holds. */
export function settleInFlow(groups: Group[], id: string, widths: Widths): Group[] {
  return settlePane(joinFlow(groups, id, widths), id, widths);
}

function joinFlow(groups: Group[], id: string, widths: Widths): Group[] {
  const g = groups.find((x) => x.id === id);
  if (!g) return groups;
  const host = flowHostAt(groups, id, widths);
  if (!host) {
    if (g.inFlow === undefined) return groups;
    const { inFlow: _left, ...rest } = g;
    /* standing loose was its place in that layout: in the next it takes its turn in the run, as in Figma */
    const items = g.items.map((it) => {
      if (!it.flowAbsolute) return it;
      const { flowAbsolute: _loose, ...keep } = it;
      return keep;
    });
    return groups.map((x) => (x.id === id ? { ...rest, items } : x));
  }
  const next: Group = g.inFlow === host.id ? g : { ...g, inFlow: host.id };
  let out = groups.map((x) => (x.id === id ? next : x));
  if (groups.indexOf(g) < groups.indexOf(host)) {
    const block = new Set([id, ...heldBy(g, groups, widths).map((x) => x.id)]);
    const moved = out.filter((x) => block.has(x.id));
    out = out.filter((x) => !block.has(x.id));
    out.splice(out.findIndex((x) => x.id === host.id) + 1, 0, ...moved);
  }
  out = sortKids(out, host.id, flowOf(host)!);
  return out.every((x, i) => x === groups[i]) ? groups : out;
}

/** One step forward (1) or back (-1) in what is drawn over what, among the parts on the same level of
 *  the same screen: a unit passes a whole neighbour and takes along what it holds, so that a container
 *  never ends up over its own contents. In a layout the order is also the place, so there it moves one
 *  along the run. A locked unit stays. */
export function stepLayers(groups: Group[], ids: Set<string>, dir: 1 | -1, widths: Widths, screenOf: (g: Group) => string | undefined): Group[] {
  const parent = new Map<string, string | undefined>();
  groups.forEach((g, i) => {
    if (g.inFlow) return void parent.set(g.id, g.inFlow);
    let near: string | undefined;
    let area = Infinity;
    for (let j = 0; j < i; j++) {
      if (!holdsParts(groups[j])) continue;
      const b = groupBounds(groups[j], widths);
      const size = (b.r - b.l) * (b.b - b.t);
      if (size < area && liesInside(g, b, widths)) {
        near = groups[j].id;
        area = size;
      }
    }
    parent.set(g.id, near);
  });
  const blockOf = (id: string, into = new Set<string>()) => {
    into.add(id);
    for (const g of groups) if (parent.get(g.id) === id && !into.has(g.id)) blockOf(g.id, into);
    return into;
  };
  const movers = groups.filter((g) => ids.has(g.id) && !g.locked);
  let out = groups;
  /* the one furthest along goes first, so that neighbours stepping together keep their order */
  for (const g of dir === 1 ? [...movers].reverse() : movers) {
    const level = out.filter((o) => parent.get(o.id) === parent.get(g.id) && screenOf(o) === screenOf(g));
    const other = level[level.findIndex((o) => o.id === g.id) + dir];
    if (!other || ids.has(other.id)) continue;
    const mine = blockOf(g.id);
    const theirs = blockOf(other.id);
    const rest = out.filter((o) => !mine.has(o.id));
    const edge = rest.map((o) => theirs.has(o.id));
    rest.splice(dir === 1 ? edge.lastIndexOf(true) + 1 : edge.indexOf(true), 0, ...out.filter((o) => mine.has(o.id)));
    out = rest;
  }
  return out.every((g, i) => g === groups[i]) ? groups : out;
}

/** The selection, in a new container that lays it out the way it already stands: a row if it runs
 *  across, a column if it runs down. Hugging its contents, it changes nothing until asked to. */
export function wrapInFlow(groups: Group[], ids: Set<string>, id: string, widths: Widths): { groups: Group[]; itemId: string } | null {
  const units = groups.filter((g) => ids.has(g.id) && !g.locked);
  if (!units.length) return null;
  const b = units.map((g) => groupBounds(g, widths));
  const { l, t, r, b: bt } = unionRect(b);
  const across = units.length < 2 || r - l >= bt - t;
  const sorted = [...b].sort((x, y) => (across ? x.l - y.l : x.t - y.t));
  const spaces = sorted.slice(1).map((x, i) => (across ? x.l - sorted[i].r : x.t - sorted[i].b));
  const gap = spaces.length ? Math.min(96, Math.max(0, Math.round(spaces.reduce((n, s) => n + s, 0) / spaces.length / 4) * 4)) : 8;
  const item: Item = { ...makeItem("container"), props: { layout: across ? "row" : "column", gap, padX: 0, padY: 0, label: "", fill: "none", border: "none", hugWidth: true, hugHeight: true, width: Math.round(r - l), height: Math.round(bt - t) } };
  const host: Group = { id, x: l, y: t, axis: "x", items: [item] };
  const first = groups.findIndex((g) => ids.has(g.id));
  const out = groups.map((g) => (ids.has(g.id) && !g.locked ? { ...g, inFlow: id } : g));
  out.splice(first, 0, host);
  return { groups: sortKids(out, id, flowOf(host)!), itemId: item.id };
}

/* ---------- suggest auto layout ---------- */

/** The part a suggested layout is built of, and the props that make it bare: no words, no paint, no padding, sizing
 *  itself to what it holds. Said once here, so the whole suggestion can move to another part (a `box`) in one line. */
export const LAYOUT_BOX = { slug: "box", bare: { surface: "none", padX: 0, padY: 0, hugWidth: true, hugHeight: true } } as const;

const layoutBox = (props: Record<string, unknown>): Item => ({ ...makeItem(LAYOUT_BOX.slug), props: { ...LAYOUT_BOX.bare, ...props } });

const on4 = (v: number) => Math.max(0, Math.round(v / 4) * 4);

/** One container of a suggestion: what it holds in order (a group id or another container), its props, and how it is
 *  sized in the container around it. */
type Suggested = { id: string; rect: Rect; props: Record<string, unknown>; kids: (string | Suggested)[]; size?: Item["flowSize"] };

/** The containers a structure comes to: a stack is a column, a row a row (its runs nested, its ends apart when it has
 *  a break), a grid a grid. Gaps on the scale, alignment by what the parts already come closest to sharing. */
function suggest(s: Shape, snap: (g: number) => number, newId: () => string): string | Suggested {
  if (s.kind === "leaf") return s.box.id;
  const rect = boundsOf(s);
  if (s.kind === "grid") {
    const m = gridMeasure(s.cells);
    const gx = snap(m.gx);
    const gy = snap(m.gy);
    return { id: newId(), rect, props: { layout: "grid", columns: m.cols, gap: gx, ...(gy !== gx ? { gapY: gy } : {}), align: "start" }, kids: s.cells.flat().map((b) => b.id) };
  }
  if (s.kind === "stack") {
    const kids = [...s.kids].sort((a, b) => boundsOf(a).t - boundsOf(b).t);
    const rects = kids.map(boundsOf);
    const gaps = rects.slice(1).map((r, i) => Math.max(0, r.t - rects[i].b));
    const runs = runsOf(gaps);
    /* a row that keeps its ends apart takes the column's width, as Figma's "fill container" */
    const filled = (k: string | Suggested) => (typeof k !== "string" && k.props.justify === "between" ? { ...k, size: { w: "fill" as const } } : k);
    const column = (members: number[], gap: number): Suggested => {
      const rs = members.map((i) => rects[i]);
      return { id: newId(), rect: union(rs), props: { layout: "column", gap, align: alignIntent(rs, "x") }, kids: members.map((i) => filled(suggest(kids[i], snap, newId))) };
    };
    if (runs.length === 1) return column(runs[0], snap(median(gaps)));
    /* sections well apart: a column of them, each section a column of its own with its own gap */
    const sections = runs.map((run) => (run.length === 1 ? filled(suggest(kids[run[0]], snap, newId)) : column(run, snap(median(run.slice(1).map((i) => gaps[i - 1]))))));
    const between = snap(median(runs.slice(1).map((run) => gaps[run[0] - 1])));
    return { id: newId(), rect, props: { layout: "column", gap: between, align: alignIntent(runs.map((run) => union(run.map((i) => rects[i]))), "x") }, kids: sections };
  }
  const kids = [...s.kids].sort((a, b) => boundsOf(a).l - boundsOf(b).l);
  const rects = kids.map(boundsOf);
  const gaps = rects.slice(1).map((r, i) => Math.max(0, r.l - rects[i].r));
  const runs = runsOf(gaps);
  const align = alignIntent(rects.map((r, i) => ({ ...r, base: kids[i].kind === "leaf" ? (kids[i] as { box: Box }).box.base : undefined })), "y");
  const spread = runs.length > 1 || (gaps.length > 0 && Math.min(...gaps) >= 32);
  if (!spread) return { id: newId(), rect, props: { layout: "row", gap: snap(median(gaps)), align }, kids: kids.map((k) => suggest(k, snap, newId)) };
  /* ends apart: a row as wide as it is now; a run of several packed inside it, spaced evenly when it is all one run */
  const parts =
    runs.length === 1
      ? kids.map((k) => suggest(k, snap, newId))
      : runs.map((run): string | Suggested => {
          if (run.length === 1) return suggest(kids[run[0]], snap, newId);
          return { id: newId(), rect: union(run.map((i) => rects[i])), props: { layout: "row", gap: snap(median(run.slice(1).map((i) => gaps[i - 1]))), align }, kids: run.map((i) => suggest(kids[i], snap, newId)) };
        });
  return { id: newId(), rect, props: { layout: "row", gap: 0, align, justify: "between", hugWidth: false }, kids: parts };
}

/** The selection, or what a container holds, turned into nested auto layouts that keep it the way it stands, as in
 *  Figma's "Suggest auto layout": rows, columns and grids read off where the parts are, with gaps on the spacing scale.
 *  `ids` names groups. One container without a layout of its own takes the layout itself, with the padding its
 *  contents leave. Returns the groups and the item to select, or null when there is nothing to lay out. */
export function suggestAutoLayout(groups: Group[], ids: Set<string>, widths: Widths, newId: () => string, scale: number[] = [8, 16]): { groups: Group[]; itemId: string } | null {
  const picked = groups.filter((g) => ids.has(g.id) && !g.locked && !g.inFlow);
  /* what a selected container holds goes with it, not into the layout beside it */
  const carried = new Set(picked.flatMap((g) => heldBy(g, groups, widths).map((x) => x.id)));
  let units = picked.filter((g) => !carried.has(g.id));
  const snap = gapSnapper(scale);
  /* a lone container takes the layout itself, for what it holds */
  const host = units.length === 1 && holdsParts(units[0]) && !flowOf(units[0]) && !!partBySlug(units[0].items[0].component)?.flow ? units[0] : null;
  if (host) {
    const held = heldBy(host, groups, widths);
    const nested = new Set(held.flatMap((g) => heldBy(g, groups, widths).map((x) => x.id)));
    units = held.filter((g) => !nested.has(g.id) && !g.locked);
  }
  if (!units.length || (!host && units.length < 2)) return null;
  const boxes: Box[] = units.map((g) => ({ id: g.id, ...groupBounds(g, widths), kind: g.items.length === 1 ? g.items[0].component : undefined, base: g.items.length === 1 ? widths[`${g.items[0].id}:base`] : undefined }));
  const shape = structureOf(boxes);
  const read = suggest(shape, snap, newId);
  const top: Suggested = typeof read === "string" ? { id: newId(), rect: boundsOf(shape), props: { layout: "column", gap: 0, align: "start" }, kids: [read] } : read;

  /* the containers, outermost first, each followed by what it holds: the array is the order a layout goes by */
  const made = new Map<string, Group>();
  const member = new Map<string, string>();
  const order: string[] = [];
  const visit = (node: Suggested, parent?: string) => {
    const size = { width: Math.round(node.rect.r - node.rect.l), height: Math.round(node.rect.b - node.rect.t) };
    made.set(node.id, { id: node.id, x: Math.round(node.rect.l), y: Math.round(node.rect.t), axis: "x", items: [{ ...layoutBox({ ...size, ...node.props }), ...(node.size ? { flowSize: node.size } : {}) }], ...(parent ? { inFlow: parent } : {}) });
    order.push(node.id);
    for (const k of node.kids) {
      if (typeof k !== "string") visit(k, node.id);
      else {
        member.set(k, node.id);
        order.push(k);
      }
    }
  };
  visit(top);
  let itemId = made.get(top.id)!.items[0].id;
  if (host) {
    /* the container keeps its own look and size, and pads its contents as far in as they stand */
    const b = groupBounds(host, widths);
    const inside = boundsOf(shape);
    const it = host.items[0];
    const inset = flowOfItem({ ...it, props: { ...it.props, layout: "column" } })?.inset ?? { t: 0, r: 0, b: 0, l: 0 };
    const sides = { padTop: on4(inside.t - b.t - inset.t), padRight: on4(b.r - inside.r - inset.r), padBottom: on4(b.b - inside.b - inset.b), padLeft: on4(inside.l - b.l - inset.l) };
    const even = sides.padTop === sides.padBottom && sides.padLeft === sides.padRight;
    const { hugWidth: _w, hugHeight: _h, ...laid } = top.props;
    made.delete(top.id);
    order[0] = host.id;
    for (const [k, v] of member) if (v === top.id) member.set(k, host.id);
    for (const g of made.values()) if (g.inFlow === top.id) made.set(g.id, { ...g, inFlow: host.id });
    made.set(host.id, { ...host, items: [{ ...it, props: { ...it.props, ...laid, ...(even ? { padX: sides.padLeft, padY: sides.padTop } : sides) } }] });
    itemId = it.id;
  }

  /* each unit keeps what it holds right behind it: a container is drawn under its contents */
  const blocks = new Map(units.map((g) => [g.id, [g, ...heldBy(g, groups, widths)]] as const));
  const moving = new Set([...blocks.values()].flat().map((g) => g.id));
  if (host) moving.add(host.id);
  /* everything before the first of them stays before it */
  const first = groups.findIndex((x) => moving.has(x.id));
  const sequence = order.flatMap((id) => made.get(id) ?? (blocks.get(id) ?? []).map((g) => (g.id === id ? { ...g, inFlow: member.get(id)! } : g)));
  const out = groups.filter((g) => !moving.has(g.id));
  out.splice(Math.min(first, out.length), 0, ...sequence);
  return { groups: out, itemId };
}
