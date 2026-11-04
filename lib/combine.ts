import { partBySlug, reader } from "../parts/registry";
import type { ListItem } from "../parts/types";
import { flowHostAt } from "./flow";
import { Frame, Group, Item, groupBounds, groupsInFrame, listRowsPatch } from "./tokens";

/* Buttons that sit side by side, or on top of each other, are one button group in M3E: they share
 * a container and connect. A real Button is a part of its own, so Tidy leaves them be and this is
 * the explicit step that joins them. */

type Rect = { l: number; t: number; r: number; b: number };
type Cand = { g: Group; it: Item; bb: Rect; size: string; variant: string };

/** the farthest two buttons may be apart and still be joined: side by side, and stacked */
const JOIN_GAP_X = 24;
const JOIN_GAP_Y = 48;
/** M3 connects up to five buttons in a group */
const MAX_RUN = 5;

const share = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));
const overlap = (a: Rect, b: Rect) => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t);

/** the runs of candidates on one axis: each next to the last, lined up across, of one size, with nothing between */
function runsOf(cands: Cand[], axis: "x" | "y", others: Rect[]): Cand[][] {
  const used = new Set<Cand>();
  const out: Cand[][] = [];
  const start = (c: Cand) => (axis === "x" ? c.bb.l : c.bb.t);
  const sorted = [...cands].sort((a, b) => start(a) - start(b));
  for (const first of sorted) {
    if (used.has(first)) continue;
    const run = [first];
    for (;;) {
      const last = run[run.length - 1];
      if (run.length >= MAX_RUN) break;
      const next = sorted.find((c) => {
        if (used.has(c) || run.includes(c) || c.size !== first.size) return false;
        const gap = axis === "x" ? c.bb.l - last.bb.r : c.bb.t - last.bb.b;
        if (gap < -2 || gap > (axis === "x" ? JOIN_GAP_X : JOIN_GAP_Y)) return false;
        if ((axis === "x" ? share(last.bb.t, last.bb.b, c.bb.t, c.bb.b) : share(last.bb.l, last.bb.r, c.bb.l, c.bb.r)) < 0.5) return false;
        const between: Rect = axis === "x" ? { l: last.bb.r, t: Math.min(last.bb.t, c.bb.t), r: c.bb.l, b: Math.max(last.bb.b, c.bb.b) } : { l: Math.min(last.bb.l, c.bb.l), t: last.bb.b, r: Math.max(last.bb.r, c.bb.r), b: c.bb.t };
        return !others.some((o) => overlap(o, between));
      });
      if (!next) break;
      run.push(next);
    }
    if (run.length > 1) {
      run.forEach((c) => used.add(c));
      out.push(run);
    }
  }
  return out;
}

/** the one button group a run of buttons becomes: every button a row of it, its own look kept
 *  where it differs from the group's (the look most of them share) */
function mergeRun(run: Cand[], axis: "x" | "y"): Group {
  const button = partBySlug("button")!;
  const def = partBySlug("button-group")!;
  const counts = new Map<string, number>();
  for (const c of run) counts.set(c.variant, (counts.get(c.variant) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const items = run.map((c): ListItem => {
    const p = reader(button, c.it.props);
    const label = p.s("label");
    const icon = p.s("icon");
    const iconWidth = !label && icon ? p.s("iconWidth") : "default";
    return { label, ...(icon ? { icon } : {}), ...(c.variant !== common ? { variant: c.variant } : {}), ...(iconWidth !== "default" ? { width: iconWidth } : {}) };
  });
  const actions: NonNullable<Item["actions"]> = {};
  run.forEach((c, i) => {
    if (c.it.action) actions[`tab:${i}`] = c.it.action;
  });
  const note = run.map((c) => c.it.note).filter(Boolean).join("\n");
  const first = run[0];
  const item: Item = {
    id: first.it.id,
    kind: "component",
    label: def.name,
    icon: null,
    variant: first.it.variant,
    component: "button-group",
    props: { items, buttonVariant: common, size: first.size, ...(axis === "y" ? { orientation: "vertical" } : {}) },
    ...(Object.keys(actions).length ? { actions } : {}),
    ...(note ? { note } : {}),
  };
  const bb = run.reduce((u, c) => ({ l: Math.min(u.l, c.bb.l), t: Math.min(u.t, c.bb.t), r: Math.max(u.r, c.bb.r), b: Math.max(u.b, c.bb.b) }), first.bb);
  return { id: first.g.id, x: bb.l, y: bb.t, axis: "x", items: [item] };
}

/** how near a dropped button has to be to join: closer than the gap two separate buttons keep */
const TOUCH_GAP = 12;

type Join = { to: Group; axis: "x" | "y"; before: boolean };

/** what a lone button may be put together with: another lone button of its size, or a button group
 *  of its size with room and running the way the two meet */
function joinOf(groups: Group[], id: string, widths: Record<string, number>): Join | null {
  const button = partBySlug("button");
  const row = partBySlug("button-group");
  const g = groups.find((x) => x.id === id);
  /* inside a layout, buttons are moved past each other to reorder them */
  if (!button || !row || !g || g.locked || g.free || g.inFlow || g.items.length !== 1 || g.items[0].component !== "button") return null;
  const mine = reader(button, g.items[0].props);
  /* let go in a layout, it goes into that layout */
  if (mine.b("toggle") || flowHostAt(groups, id, widths)) return null;
  const bb = rectOf(g, widths);
  let best: (Join & { gap: number }) | null = null;
  for (const o of groups) {
    if (o.id === id || o.locked || o.free || o.inFlow || o.items.length !== 1) continue;
    const it = o.items[0];
    const isButton = it.component === "button" && !reader(button, it.props).b("toggle") && reader(button, it.props).s("size") === mine.s("size");
    const p = it.component === "button-group" ? reader(row, it.props) : null;
    if (!isButton && !(p && p.s("size") === mine.s("size") && p.list("items").length < MAX_RUN)) continue;
    const to = rectOf(o, widths);
    for (const axis of ["x", "y"] as const) {
      if (p && (p.s("orientation") === "vertical") !== (axis === "y")) continue;
      if ((axis === "x" ? share(bb.t, bb.b, to.t, to.b) : share(bb.l, bb.r, to.l, to.r)) < 0.5) continue;
      const before = axis === "x" ? bb.l + bb.r < to.l + to.r : bb.t + bb.b < to.t + to.b;
      const gap = axis === "x" ? (before ? to.l - bb.r : bb.l - to.r) : before ? to.t - bb.b : bb.t - to.b;
      const size = axis === "x" ? bb.r - bb.l : bb.b - bb.t;
      /* dropped up against it, or over its near half */
      if (gap > TOUCH_GAP || gap < -size * 0.75) continue;
      if (!best || gap < best.gap) best = { to: o, axis, before, gap };
    }
  }
  return best;
}

const rectOf = (g: Group, widths: Record<string, number>): Rect => groupBounds(g, widths);

/** where a button being carried would join, to show it before it is let go */
export function joinTargetOf(groups: Group[], id: string, widths: Record<string, number>): Rect | null {
  const join = joinOf(groups, id, widths);
  return join ? rectOf(join.to, widths) : null;
}

/** A lone button let go against another button, or against a button group, is one button group with
 *  it. Returns the groups as they then are and the id of the part it became, or null when it touches
 *  nothing it can join. */
export function joinDropped(groups: Group[], id: string, widths: Record<string, number>): { groups: Group[]; itemId: string } | null {
  const join = joinOf(groups, id, widths);
  if (!join) return null;
  const button = partBySlug("button")!;
  const row = partBySlug("button-group")!;
  const g = groups.find((x) => x.id === id)!;
  const bb = rectOf(g, widths);
  const to = rectOf(join.to, widths);
  const box = { l: Math.min(bb.l, to.l), t: Math.min(bb.t, to.t), r: Math.max(bb.r, to.r), b: Math.max(bb.b, to.b) };
  const cand = (x: Group): Cand => {
    const p = reader(button, x.items[0].props);
    return { g: x, it: x.items[0], bb: rectOf(x, widths), size: p.s("size"), variant: p.s("variant") };
  };
  const target = join.to.items[0];
  let joined: Group;
  if (target.component === "button") {
    joined = mergeRun(join.before ? [cand(g), cand(join.to)] : [cand(join.to), cand(g)], join.axis);
  } else {
    const p = reader(row, target.props);
    const rows = p.list("items");
    const added = cand(g);
    const { label, icon, variant } = { label: reader(button, added.it.props).s("label"), icon: reader(button, added.it.props).s("icon"), variant: added.variant };
    const entry: ListItem = { label, ...(icon ? { icon } : {}), ...(variant !== p.s("buttonVariant") ? { variant } : {}) };
    const order = join.before ? [-1, ...rows.map((_, i) => i)] : [...rows.map((_, i) => i), -1];
    const next = join.before ? [entry, ...rows] : [...rows, entry];
    const patch = listRowsPatch(target, "items", next, order);
    const at = join.before ? 0 : rows.length;
    const actions = added.it.action ? { ...(patch.actions ?? target.actions), [`tab:${at}`]: added.it.action } : patch.actions;
    const note = [target.note, added.it.note].filter(Boolean).join("\n");
    joined = { ...join.to, items: [{ ...target, ...patch, ...(actions ? { actions } : {}), ...(note ? { note } : {}) }] };
  }
  const placed: Group = { ...joined, x: box.l, y: box.t };
  return {
    groups: groups.filter((x) => x.id !== (joined.id === g.id ? join.to.id : g.id)).map((x) => (x.id === joined.id ? placed : x)),
    itemId: placed.items[0].id,
  };
}

/** The groups with every run of neighbouring buttons on this screen made one button group, or
 *  null when there is none. Toggle buttons, locked and hand-made groups and buttons of different
 *  sizes are left as they are. */
export function combineButtons(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>): Group[] | null {
  const button = partBySlug("button");
  if (!button) return null;
  const mine = groupsInFrame(groups, frame, frames, widths);
  const cands: Cand[] = [];
  for (const g of mine) {
    const it = g.items[0];
    if (g.locked || g.free || g.inFlow || g.items.length !== 1 || it.component !== "button") continue;
    const p = reader(button, it.props);
    if (p.b("toggle")) continue;
    cands.push({ g, it, bb: groupBounds(g, widths), size: p.s("size"), variant: p.s("variant") });
  }
  if (cands.length < 2) return null;
  /* what may not sit between two buttons of a run: every part that is not itself a candidate */
  const others = groups.filter((g) => !cands.some((c) => c.g === g)).map((g) => groupBounds(g, widths));
  const across = runsOf(cands, "x", others);
  const taken = new Set(across.flat());
  const down = runsOf(cands.filter((c) => !taken.has(c)), "y", others);
  if (!across.length && !down.length) return null;
  const merged = new Map<Group, Group>();
  const drop = new Set<Group>();
  const take = (runs: Cand[][], axis: "x" | "y") =>
    runs.forEach((run) => {
      merged.set(run[0].g, mergeRun(run, axis));
      run.slice(1).forEach((c) => drop.add(c.g));
    });
  take(across, "x");
  take(down, "y");
  return groups.filter((g) => !drop.has(g)).map((g) => merged.get(g) ?? g);
}
