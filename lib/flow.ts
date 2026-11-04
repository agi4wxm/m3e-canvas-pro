import { partBySlug, reader } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import type { FlowValues } from "../parts/flow";
import { Group, Item, groupBounds, heldBy, holdsParts, liesInside, makeItem, ownerIdOf, unionRect } from "./tokens";

/* Auto layout on the canvas. Parts stay where the document says they are, so everything else (the
 * preview, the guides, the layers) keeps working; a container with a layout rewrites those places.
 * What belongs to it is named on the part (`Group.inFlow`), because what overflows a container must
 * not fall out of it. Dropping a part in or out is all it takes, and the order is where it was let go. */

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
  return {
    dir,
    gap: Math.round(p.n("gap")),
    padX: Math.round(p.n("padX")),
    padY: Math.round(p.n("padY")),
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
  for (const g of groups) {
    if (!g.inFlow || !flows.has(g.inFlow) || g.locked || g.inFlow === g.id) continue;
    /* another tab's content takes no room here; it is laid out when its tab is chosen */
    const panes = panesOf(work.get(g.inFlow)!.items[0]);
    if (panes && paneIn(g, panes) !== panes.shown) continue;
    kidsOf.set(g.inFlow, [...(kidsOf.get(g.inFlow) ?? []), g]);
  }

  /** a measure of a part, where the part has a number for it */
  const setAxis = (id: string, axis: "width" | "height", v: number) => {
    const g = work.get(id)!;
    /* an instance is as big as what its definition comes to; a layout places it but does not size it */
    if (g.items.length !== 1 || g.instanceOf || g.expandedFrom) return;
    const it = g.items[0];
    const ax = resizeOf(partBySlug(it.component), it.props)?.[axis];
    if (!ax || ax.kind !== "number") return;
    const next = axisWrite(ax, Math.round(v)) as number;
    sizes.set(id, { ...sizeOf(id), [axis === "width" ? "w" : "h"]: next });
    if (Math.abs(axisValue(ax, it.props) - next) < 1) return;
    work.set(id, { ...g, items: [{ ...it, props: { ...it.props, [ax.key]: next } }] });
  };

  const ordered = (id: string) => (kidsOf.get(id) ?? []).map((g) => work.get(g.id)!);

  /** the axis its layout decides for a part (stretched across, or filling along the run): hugging its
   *  own contents on that axis would fight it for good */
  const givenByParent = (id: string, axis: "width" | "height") => {
    const g = work.get(id)!;
    const parent = g.inFlow ? flows.get(g.inFlow) : undefined;
    if (!parent) return false;
    const fills = g.items.length === 1 && !!g.items[0].flowFill;
    if (parent.dir === "grid") return axis === "width" && (parent.align === "stretch" || fills) && !parent.hugW;
    const main = parent.dir === "row" ? "width" : "height";
    const hugsMain = parent.dir === "row" ? parent.hugW : parent.hugH;
    const hugsCross = parent.dir === "row" ? parent.hugH : parent.hugW;
    return axis === main ? fills && !hugsMain : parent.align === "stretch" && !hugsCross;
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

  /* inside first: a container that hugs its contents has to know them */
  const hug = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const f0 = flows.get(id)!;
    const kids = ordered(id);
    for (const k of kids) if (flows.has(k.id)) hug(k.id);
    const f = { ...f0, hugW: f0.hugW && !givenByParent(id, "width"), hugH: f0.hugH && !givenByParent(id, "height") };
    if (!kids.length || (!f.hugW && !f.hugH) || !kids.every((k) => measured(k, widths))) return;
    const s = kids.map((k) => sizeOf(k.id));
    const gaps = f.gap * (kids.length - 1);
    const across = f.padX * 2 + f.inset.l + f.inset.r;
    const down = f.padY * 2 + f.inset.t + f.inset.b;
    if (f.dir === "grid") {
      const rows = Math.ceil(kids.length / f.columns);
      if (f.hugW) setAxis(id, "width", across + Math.max(...s.map((x) => x.w)) * f.columns + f.gap * (f.columns - 1));
      if (f.hugH) setAxis(id, "height", down + Math.max(...s.map((x) => x.h)) * rows + f.gap * (rows - 1));
      return;
    }
    if (f.dir === "row") {
      if (f.hugW) setAxis(id, "width", across + s.reduce((n, x) => n + x.w, 0) + gaps);
      if (f.hugH) {
        const lines = f.wrap && !f.hugW ? linesOf(kids, f, sizeOf(id).w - across) : [kids];
        const tall = lines.map((l) => Math.max(...l.map((k) => sizeOf(k.id).h)));
        setAxis(id, "height", down + tall.reduce((n, x) => n + x, 0) + f.gap * (lines.length - 1));
      }
      return;
    }
    if (f.hugW) setAxis(id, "width", across + Math.max(...s.map((x) => x.w)));
    if (f.hugH) setAxis(id, "height", down + s.reduce((n, x) => n + x.h, 0) + gaps);
  };
  for (const id of flows.keys()) hug(id);

  /** a part put in its place; what a free container holds comes along */
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
  };
  const fills = (k: Group) => k.items.length === 1 && !!k.items[0].flowFill;

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
    const left = host.x + f.inset.l + f.padX;
    const top = host.y + f.inset.t + f.padY;
    const roomW = Math.max(0, size.w - f.inset.l - f.inset.r - f.padX * 2);
    const roomH = Math.max(0, size.h - f.inset.t - f.inset.b - f.padY * 2);
    const crossAt = (room: number, own: number) => (f.align === "center" ? (room - own) / 2 : f.align === "end" ? room - own : 0);

    if (f.dir === "grid") {
      const cellW = (roomW - f.gap * (f.columns - 1)) / f.columns;
      /* a grid that says how many rows it has divides its height among them */
      const given = f.rows && !f.hugH ? (roomH - f.gap * (f.rows - 1)) / f.rows : 0;
      let y = top;
      for (let i = 0; i < kids.length; i += f.columns) {
        const row = kids.slice(i, i + f.columns);
        for (const k of row) if (f.align === "stretch" || fills(k)) setAxis(k.id, "width", cellW);
        const tall = given || Math.max(...row.map((k) => sizeOf(k.id).h));
        row.forEach((k, c) => {
          const s = sizeOf(k.id);
          put(k.id, left + c * (cellW + f.gap) + crossAt(cellW, s.w), y + (f.align === "center" ? (tall - s.h) / 2 : f.align === "end" ? tall - s.h : 0));
        });
        y += tall + f.gap;
      }
    } else if (f.dir === "row") {
      const lines = f.wrap ? linesOf(kids, f, roomW) : kids.length ? [kids] : [];
      let y = top;
      for (const line of lines) {
        const gaps = f.gap * (line.length - 1);
        const fixed = line.filter((k) => !fills(k)).reduce((n, k) => n + sizeOf(k.id).w, 0);
        const fillers = line.filter(fills);
        if (fillers.length && !f.hugW) for (const k of fillers) setAxis(k.id, "width", Math.max(0, (roomW - fixed - gaps) / fillers.length));
        const lineH = !f.wrap && !f.hugH ? roomH : Math.max(...line.map((k) => sizeOf(k.id).h));
        if (f.align === "stretch" && !f.hugH) for (const k of line) setAxis(k.id, "height", lineH);
        const used = line.reduce((n, k) => n + sizeOf(k.id).w, 0) + gaps;
        const spare = Math.max(0, roomW - used);
        const between = f.justify === "between" && line.length > 1 ? f.gap + spare / (line.length - 1) : f.gap;
        let x = left + (f.justify === "center" ? spare / 2 : f.justify === "end" ? spare : 0);
        for (const k of line) {
          const s = sizeOf(k.id);
          put(k.id, x, y + crossAt(lineH, s.h));
          x += s.w + between;
        }
        y += lineH + f.gap;
      }
    } else {
      const gaps = f.gap * Math.max(0, kids.length - 1);
      const fixed = kids.filter((k) => !fills(k)).reduce((n, k) => n + sizeOf(k.id).h, 0);
      const fillers = kids.filter(fills);
      if (fillers.length && !f.hugH) for (const k of fillers) setAxis(k.id, "height", Math.max(0, (roomH - fixed - gaps) / fillers.length));
      if (f.align === "stretch" && !f.hugW) for (const k of kids) setAxis(k.id, "width", roomW);
      const used = kids.reduce((n, k) => n + sizeOf(k.id).h, 0) + gaps;
      const spare = Math.max(0, roomH - used);
      const between = f.justify === "between" && kids.length > 1 ? f.gap + spare / (kids.length - 1) : f.gap;
      let y = top + (f.justify === "center" ? spare / 2 : f.justify === "end" ? spare : 0);
      for (const k of kids) {
        const s = sizeOf(k.id);
        put(k.id, left + crossAt(roomW, s.w), y);
        y += s.h + between;
      }
    }
    for (const k of kids) if (flows.has(k.id)) place(k.id);
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
    return groups.map((x) => (x.id === id ? rest : x));
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
