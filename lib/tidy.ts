import { Frame, Group, Item, PHONE_MARGIN, RAIL_COLLAPSED_W, railExpansionSide, railWidth, carryItemSize, frameOfGroup, frameRect, frameSizeOf, frameLengthOf, groupBounds, layoutOf, isExpanded, safeAreaOf } from "./tokens";
import { partBySlug } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import { fullWidth, roleOf } from "../parts/role";

/* Rule-based layout for one screen. Nothing here is guessed by a model.
 *
 * 1. Bars stick to the edges they belong to (app bar and tabs at the top, the
 *    navigation bar at the bottom, toolbars and snackbars hovering above it,
 *    a bottom sheet on the bottom edge), a FAB takes the bottom-right corner,
 *    a dialog is centered.
 * 2. Everything else is stacked between the bars on the 16dp layout margins, from
 *    the top unless the screen asks for the body centered, at the bottom or spread. Rows,
 *    hand-made groups and intentional overlaps (a badge on an icon, parts on a
 *    container) are kept as one unit, and a part keeps the side it was on. A group
 *    nearly as wide as the content sits on the margin; a text with a switch,
 *    checkbox or radio beside it spans the row, the control on the right.
 *
 * 3. Inside one unit (parts on a container, a hand-made group) edges that are almost
 *    aligned snap to the common line. This only acts on differences a hand would
 *    call a slip, never on a gap someone clearly meant.
 *
 * Only positions change; sizes, order and contents stay. */

/** the farthest two edges may be apart and still count as meant to line up */
const SNAP = 6;

type Rect = { l: number; t: number; r: number; b: number };

/** how a screen is spaced: a style has its own, and Material's is the default */
export type LayoutMetrics = {
  /** between the screen's edge and its body */
  margin: number;
  /** vertical distance between stacked rows */
  gap: number;
  /** a tighter gap after a heading and between list-like rows of one kind */
  tight: number;
  /** a part that runs from edge to edge under this style, whatever its own kind */
  flush?: (it: Item) => boolean;
  /** which parts stand on each other, when their sizes have just changed and touching no longer says so */
  together?: string[][];
  /** only what stands on another counts as being on it, not what grazes its edge: under a style's rules that is a slip to mend */
  sitsOn?: boolean;
};
export const MATERIAL_METRICS: LayoutMetrics = { margin: PHONE_MARGIN, gap: 16, tight: 8 };
/** horizontal distance between parts packed into one row */
const ROW_ITEM_GAP = 8;

/** one movable unit: a group plus everything nested inside or overlapping it */
type Unit = { ids: string[]; bb: Rect; /** the family rows of one kind tighten against */ family: string; /** the first part, for family and role checks */ probe: Item };

/** the family a part belongs to: the component it is — two of a kind stack tight */
const familyOf = (it: Item) => (it.component === "separator" ? "divider" : `c:${it.component}`);

const overlap = (a: Rect, b: Rect) => Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t);
const union = (a: Rect, b: Rect): Rect => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
/** how much of the smaller extent two spans share, 0..1 */
const share = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));

/* ---------- place ---------- */

const area = (r: Rect) => Math.max(0, r.r - r.l) * Math.max(0, r.b - r.t);

/** Groups that touch each other stay together, so a badge on an icon or parts on a box move as one.
 *  Bars, FABs and dialogs never join a cluster: they have their own place and are often drawn over content. */
function clusters(groups: Group[], widths: Record<string, number>, m?: Pick<LayoutMetrics, "together" | "sitsOn">): Unit[] {
  const units: Unit[] = groups.map((g) => ({ ids: [g.id], bb: groupBounds(g, widths), family: familyOf(g.items[0]), probe: g.items[0] }));
  const setOf = m?.together && new Map(m.together.flatMap((set, i) => set.map((id) => [id, i] as const)));
  const middleIn = (a: Rect, b: Rect) => {
    const x = (a.l + a.r) / 2;
    const y = (a.t + a.b) / 2;
    return x > b.l && x < b.r && y > b.t && y < b.b;
  };
  const touch = (a: Unit, b: Unit) => {
    if (setOf) return setOf.has(a.ids[0]) && setOf.get(a.ids[0]) === setOf.get(b.ids[0]);
    if (!overlap(a.bb, b.bb)) return false;
    if (!m?.sitsOn) return true;
    const [small, big] = area(a.bb) <= area(b.bb) ? [a.bb, b.bb] : [b.bb, a.bb];
    return middleIn(small, big);
  };
  for (;;) {
    let merged = false;
    outer: for (let i = 0; i < units.length; i++) {
      if (isAnchored(units[i])) continue;
      for (let j = i + 1; j < units.length; j++) {
        if (isAnchored(units[j]) || !touch(units[i], units[j])) continue;
        /* the larger member names the cluster: it is the container, the rest sits on it */
        const big = area(units[i].bb) >= area(units[j].bb) ? units[i] : units[j];
        units[i] = { ...big, ids: [...units[i].ids, ...units[j].ids], bb: union(units[i].bb, units[j].bb) };
        units.splice(j, 1);
        merged = true;
        break outer;
      }
    }
    if (!merged) return units;
  }
}

/** Which parts stand on each other as things are now: asked before a change of size, what grows into its neighbour
 *  after it has not been put on it. */
export function standingTogether(groups: Group[], frames: Frame[], widths: Record<string, number>, m?: Pick<LayoutMetrics, "sitsOn">): string[][] {
  return frames.flatMap((f) => {
    const mine = groups.filter((g) => !g.inFlow && roleOf(g.items[0]) !== "backdrop" && frameOfGroup(g, frames, widths)?.id === f.id);
    return clusters(mine, widths, m).filter((u) => u.ids.length > 1).map((u) => u.ids);
  });
}

/** Where the parts on a picture stand. A screen on a picture is a composition, like a game's HUD, not rows: each part stays
 *  in the corner or along the edge it was put by, on the style's margins, whole-numbered, and clear of the others. */
function settleOnScene(units: Unit[], target: Map<Unit, { l: number; t: number }>, box: Rect, left: number, frameW: number, m: LayoutMetrics) {
  const near = 24;
  const midX = (box.l + box.r) / 2;
  const on4 = (v: number) => Math.round(v / 4) * 4;
  const spots = units.map((u) => {
    const w = u.bb.r - u.bb.l;
    const h = u.bb.b - u.bb.t;
    let l = on4(u.bb.l);
    let t = on4(u.bb.t);
    if (fullWidth(u.probe) && w >= frameW - 1) l = left;
    else if (w >= box.r - box.l - 8 || u.bb.l - box.l <= near) l = box.l;
    else if (box.r - u.bb.r <= near) l = box.r - w;
    else if (Math.abs((u.bb.l + u.bb.r) / 2 - midX) <= 12) l = Math.round(midX - w / 2);
    if (u.bb.t - box.t <= near) t = box.t;
    else if (box.b - u.bb.b <= near) t = box.b - h;
    if (!(fullWidth(u.probe) && w >= frameW - 1)) l = Math.max(box.l, Math.min(l, Math.max(box.l, box.r - w)));
    t = Math.max(box.t, Math.min(t, Math.max(box.t, box.b - h)));
    return { u, l, t, w, h };
  });
  /* the upper half keeps clear downward from the head, the lower half upward from the foot */
  const midY = (box.t + box.b) / 2;
  const crosses = (a: { l: number; w: number }, b: { l: number; w: number }) => a.l < b.l + b.w && b.l < a.l + a.w;
  const upper = spots.filter((s) => s.t + s.h / 2 < midY).sort((a, b) => a.t - b.t);
  const lower = spots.filter((s) => s.t + s.h / 2 >= midY).sort((a, b) => b.t + b.h - (a.t + a.h));
  upper.forEach((s, i) => {
    for (const o of upper.slice(0, i)) if (crosses(s, o) && s.t < o.t + o.h + m.tight && o.t < s.t + s.h) s.t = o.t + o.h + m.tight;
  });
  lower.forEach((s, i) => {
    for (const o of lower.slice(0, i)) if (crosses(s, o) && s.t + s.h > o.t - m.tight && o.t + o.h > s.t) s.t = o.t - m.tight - s.h;
  });
  for (const s of spots) target.set(s.u, { l: s.l, t: s.t });
}

/** what a game keeps counted at the head of its screen: its coins and lives, its health */
const COUNTERS = new Set(["asset-pill", "stat-bar"]);

/** Units whose vertical extents overlap and that sit side by side form one row. */
function rowsOf(units: Unit[]): Unit[][] {
  const sorted = [...units].sort((a, b) => a.bb.t - b.bb.t || a.bb.l - b.bb.l);
  const out: Unit[][] = [];
  for (const u of sorted) {
    const row = out[out.length - 1];
    if (row) {
      const rt = Math.min(...row.map((r) => r.bb.t));
      const rb = Math.max(...row.map((r) => r.bb.b));
      const cy = (u.bb.t + u.bb.b) / 2;
      const rcy = (rt + rb) / 2;
      const beside = row.every((r) => r.bb.r <= u.bb.l + 2 || r.bb.l >= u.bb.r - 2);
      if (beside && ((cy >= rt && cy <= rb) || (rcy >= u.bb.t && rcy <= u.bb.b))) {
        row.push(u);
        continue;
      }
    }
    out.push([u]);
  }
  for (const r of out) r.sort((a, b) => a.bb.l - b.bb.l);
  return out;
}

const role = (u: Unit) => roleOf(u.probe);
const isRail = (u: Unit) => role(u) === "rail";
const isTop = (u: Unit) => role(u) === "top";
const isBottomBar = (u: Unit) => role(u) === "bottom";
/** the group holds one of the bars Tidy pins to a screen's edge; lining parts up leaves it there */
export const holdsEdgeBar = (g: Group) => g.items.some((it) => { const r = roleOf(it); return r === "top" || r === "bottom" || r === "rail"; });
const isFloatingBottom = (u: Unit) => role(u) === "floatingBottom";
const isFab = (u: Unit) => role(u) === "fab";
const isOverlay = (u: Unit) => role(u) === "overlay";
/** a line of text, and the small controls that pair with one across a row */
const isLabel = (u: Unit) => role(u) === "label";
const isControl = (u: Unit) => role(u) === "control";
/* rows of one list-like family (list items, fields, chips, dividers, the small controls)
 * stack tighter than the row gap */
const isListLike = (u: Unit) => role(u) === "listLike" || role(u) === "control";
const isAnchored = (u: Unit) => isRail(u) || isTop(u) || isBottomBar(u) || isFloatingBottom(u) || isFab(u) || isOverlay(u);
const holdsFixedPart = (g: Group) => ["rail", "top", "bottom", "floatingBottom", "fab", "overlay"].includes(roleOf(g.items[0]) ?? "");

/** where a unit sits horizontally, so tidying keeps a right-aligned part on the right.
 *  Judged from the edges, so a part already on the margin reads the same way after tidying. */
function align(bb: Rect, fr: Rect, margin: number): "left" | "center" | "right" | "fill" {
  const w = bb.r - bb.l;
  if (w >= fr.r - fr.l - margin * 2 - 8) return "fill";
  const near = margin + 12;
  const gapL = bb.l - fr.l;
  const gapR = fr.r - bb.r;
  /* on a wide screen a part well off the margin can still plainly stand to one side */
  const left = gapL <= near || gapL * 3 < gapR;
  const right = gapR <= near || gapR * 3 < gapL;
  if (left && !right) return "left";
  if (right && !left) return "right";
  return "center";
}

/** the gap above a row, from what came before it */
function gapBefore(prev: Unit[] | null, row: Unit[], m: LayoutMetrics): number {
  if (!prev) return 0;
  const pu = prev.length === 1 ? prev[0] : null;
  const ku = row.length === 1 ? row[0] : null;
  if (pu && role(pu) === "label") return m.tight;
  if (pu && (pu.family === "divider" || ku?.family === "divider")) return m.tight;
  if (pu && ku && pu.family === ku.family && isListLike(ku)) return m.tight;
  return m.gap;
}

/** A group moved the least distance that puts it inside a screen; an edge-to-edge
 *  part sits on the left edge. A group that fits already is returned as is. */
export function pullInto(g: Group, frame: Frame, widths: Record<string, number>): Group {
  const fr = frameRect(frame);
  const bb = groupBounds(g, widths);
  let dx = bb.r > fr.r ? Math.max(fr.l - bb.l, fr.r - bb.r) : bb.l < fr.l ? fr.l - bb.l : 0;
  const dy = bb.b > fr.b ? Math.max(fr.t - bb.t, fr.b - bb.b) : bb.t < fr.t ? fr.t - bb.t : 0;
  /* a bar as wide as the screen sits on its left edge; a narrower one keeps its place */
  if (g.items.length === 1 && fullWidth(g.items[0]) && bb.r - bb.l >= fr.r - fr.l) dx = fr.l - bb.l;
  return dx || dy ? { ...g, x: g.x + Math.round(dx), y: g.y + Math.round(dy) } : g;
}

/** A screen changing size, and everything that follows from it: the screens to its
 *  right move over with their parts so nothing overlaps, the parts of the screen
 *  take the sizes the new screen calls for, anything that fell outside is pulled
 *  back in, and the screen is laid out again by the rules above. */
export function carryFrame(groups: Group[], frame: Frame, to: Frame, frames: Frame[], widths: Record<string, number>, m: LayoutMetrics = MATERIAL_METRICS): { frames: Frame[]; groups: Group[] } {
  const from = frameSizeOf(frame);
  const after = frameSizeOf(to);
  /* the rail runs the whole length of the screen, which may be longer than the device */
  const fromLength = { w: from.w, h: frameLengthOf(frame) };
  const toLength = { w: after.w, h: frameLengthOf(to) };
  const owner = new Map(groups.map((g) => [g.id, frameOfGroup(g, frames, widths)?.id] as const));
  /* screens whose left edge is past the old right edge keep their distance from it */
  const shift = after.w - from.w;
  const moved = new Map(frames.filter((f) => f.id !== frame.id && f.x >= frame.x + from.w).map((f) => [f.id, shift] as const));
  const nextFrames = frames.map((f) => (f.id === to.id ? to : moved.has(f.id) ? { ...f, x: f.x + shift } : f));
  /* The navigation bar of a compact screen is the rail of an expanded one, and back: M3 has
   * no rail below 840dp and no bar above it, so a rail placed on a phone becomes a bar too.
   * Only a bar or rail standing on its own is swapped, and only the first of them: one
   * inside a hand-made group is part of that group's drawing. Other standalone rails keep their kind. */
  const expanded = isExpanded(after.w);
  const mine = groups.filter((g) => owner.get(g.id) === frame.id);
  const isNavBar = (it: Item) => it.component === "navigation-bar";
  const isNavRail = (it: Item) => it.component === "navigation-rail";
  /* a bar a layout holds stays what it is: a column has no room for a rail, and takes the bar to the new width itself */
  const navGroup = mine.find((g) => !g.inFlow && g.items.length === 1 && (isNavBar(g.items[0]) || isNavRail(g.items[0])));
  const swapNav = (g: Group, it: Item): Item => {
    if (g !== navGroup) return it;
    if (expanded && isNavBar(it)) return { ...it, component: "navigation-rail", props: { items: it.props?.items, selected: it.props?.selected, height: toLength.h } };
    if (!expanded && isNavRail(it)) {
      const { [railExpansionSide]: _side, ...bar } = it;
      return { ...bar, component: "navigation-bar", props: { items: it.props?.items, selected: it.props?.selected, width: after.w } };
    }
    return it;
  };
  /* a rail keeps the side it stood on; one that grows out of a bar starts on the left */
  const side = navGroup && isNavRail(navGroup.items[0]) ? railSide(navGroup, frame, widths) : "left";
  const railSlots = (swap: boolean) => mine.reduce((slot, g) => {
    if (g.items.length !== 1) return slot;
    const item = swap ? swapNav(g, g.items[0]) : g.items[0];
    if (!isNavRail(item)) return slot;
    const w = railWidth(item);
    const right = isNavRail(g.items[0]) && railSide(g, frame, widths) === "right";
    return { total: slot.total + w, left: slot.left + (right ? 0 : w) };
  }, { total: 0, left: 0 });
  const beforeSlots = railSlots(false);
  const afterSlots = railSlots(true);
  /* parts live in the body beside the rail: their widths follow the body, and their
   * positions are measured from its left edge, on both ends of the change */
  const fromBody = { w: from.w - beforeSlots.total, h: from.h };
  const toBody = { w: after.w - afterSlots.total, h: after.h };
  /* a rail that ran the length of the screen keeps running it; one as tall as the device takes the new device */
  const carryRail = (it: Item) => {
    const byLength = carryItemSize(it, fromLength, toLength);
    return byLength !== it ? byLength : carryItemSize(it, from, after);
  };
  /* a layout as tall as the screen is the screen's: left at the old height, a bar at its foot would
   * stand in the middle of a taller screen, or off the end of a shorter one */
  const carryLayoutHeight = (it: Item): Item => {
    const def = partBySlug(it.component);
    const ax = def?.holds ? resizeOf(def, it.props)?.height : undefined;
    return ax && axisValue(ax, it.props) === fromLength.h ? { ...it, props: { ...it.props, [ax.key]: axisWrite(ax, toLength.h) } } : it;
  };
  /* what was measured is of the old size: what has just been given a new one goes by that until it is
   * drawn, or a layout the size of the screen would seem to fit inside it, and be moved */
  const measures = { ...widths };
  const remember = (it: Item) => {
    const ax = resizeOf(partBySlug(it.component), it.props);
    if (ax?.width) measures[it.id] = axisValue(ax.width, it.props);
    if (ax?.height) measures[`${it.id}:h`] = axisValue(ax.height, it.props);
  };
  const resized = groups.map((g) => {
    const o = owner.get(g.id);
    if (o === frame.id) {
      const toRail = g === navGroup && expanded;
      const items = g.items.map((it) => swapNav(g, carryLayoutHeight(spansScreen(g, frame, widths) ? carryRail(it) : carryItemSize(it, toRail ? from : fromBody, toRail ? after : toBody))));
      items.forEach((it, i) => {
        if (it !== g.items[i]) remember(it);
      });
      const x = toRail ? (side === "right" ? to.x + after.w - railWidth(items[0]) : to.x) : g.x + afterSlots.left - beforeSlots.left;
      return pullInto({ ...g, x, items }, to, measures);
    }
    const dx = o ? moved.get(o) : undefined;
    return dx ? { ...g, x: g.x + dx } : g;
  });
  return { frames: nextFrames, groups: tidyFrame(resized, to, nextFrames, measures, m) ?? resized };
}

/** a rail standing on its own from the head of the screen */
const railAtHead = (g: Group, frame: Frame, widths: Record<string, number>) =>
  g.items.length === 1 && roleOf(g.items[0]) === "rail" && groupBounds(g, widths).t <= frame.y + 1;

/** a rail from the head of the screen down to the foot of the device or of the whole screen: it
 *  runs the length of the screen, and a change of length takes it along. A rail the author drew to
 *  some other height keeps it. */
const spansScreen = (g: Group, frame: Frame, widths: Record<string, number>) => {
  if (!railAtHead(g, frame, widths)) return false;
  const b = groupBounds(g, widths).b - frame.y;
  return Math.abs(b - frameSizeOf(frame).h) <= 1 || Math.abs(b - frameLengthOf(frame)) <= 1;
};

/** a part that stays put and stands nearer the foot of the screen than its head: it goes with the foot */
const atFoot = (g: Group, bb: Rect, fr: Rect) => holdsFixedPart(g) && fr.b - bb.b < bb.t - fr.t;

/** How a part rides on a screen whose body scrolls: "head" keeps its place on the glass, "foot"
 *  keeps its distance from the foot of the screen, and null scrolls with the body. A rail running
 *  the length stays on the glass; another part that stays put goes with the end it stands nearer,
 *  the same end a change of length carries it with, as long as it stands within a screenful of it. */
export function pinOf(g: Group, frame: Frame, widths: Record<string, number>): "head" | "foot" | null {
  if (!holdsFixedPart(g)) return null;
  if (railAtHead(g, frame, widths)) return "head";
  const fr = frameRect(frame);
  const bb = groupBounds(g, widths);
  const viewH = frameSizeOf(frame).h;
  if (atFoot(g, bb, fr)) return bb.t >= fr.b - viewH ? "foot" : null;
  return bb.b <= fr.t + viewH ? "head" : null;
}

/** A screen made longer or shorter, so that its body scrolls or stops scrolling. What stands at
 *  its foot -- the navigation bar, a FAB above it -- goes with the foot, a rail runs to the new
 *  foot, the screens and loose parts below it move by as much so the screen neither runs into them
 *  nor takes them in, and the rest stays where the author put it. */
export function stretchFrame(groups: Group[], frame: Frame, length: number, frames: Frame[], widths: Record<string, number>): { frames: Frame[]; groups: Group[] } {
  const fr = frameRect(frame);
  /* whoever sets the length now owns it: no style gives back what it did not take */
  const { grownFrom: _taken, ...was } = frame;
  const to: Frame = { ...was, length: length > frameSizeOf(frame).h ? length : undefined };
  const d = frameLengthOf(to) - frameLengthOf(frame);
  const across = (r: Rect) => r.l < fr.r && r.r > fr.l;
  const below = new Set(frames.filter((f) => f.id !== frame.id && frameRect(f).t >= fr.b && across(frameRect(f))).map((f) => f.id));
  return {
    frames: frames.map((f) => (below.has(f.id) ? { ...f, y: f.y + d } : f.id === frame.id ? to : f)),
    groups: groups.map((g) => {
      const owner = frameOfGroup(g, frames, widths)?.id;
      const bb = groupBounds(g, widths);
      if (owner === frame.id && spansScreen(g, frame, widths)) {
        const item = g.items[0];
        const height = frameLengthOf(to) - (bb.t - fr.t);
        return { ...g, items: [{ ...item, props: { ...item.props, height } }] };
      }
      /* a loose part is judged by its middle, the way a screen takes parts in */
      const moves = owner ? below.has(owner) || (owner === frame.id && atFoot(g, bb, fr)) : (bb.t + bb.b) / 2 >= fr.b && across(bb);
      return moves ? { ...g, y: g.y + d } : g;
    }),
  };
}

/** How long a screen has to be for every row of its body to stand between its bars under these metrics;
 *  0 when a locked bar at its foot says how long it is. Tidy leaves a row that does not fit where it was. */
export function lengthToHold(mine: Group[], frame: Frame, widths: Record<string, number>, m: LayoutMetrics = MATERIAL_METRICS): number {
  const long: Frame = { ...frame, length: 100000, place: undefined };
  const laid = tidyFrame(mine, long, [long], widths, m) ?? mine;
  const end = frameRect(long).b;
  let rows = frame.y;
  let foot = end - safeAreaOf(frame).b;
  for (const g of laid) {
    if (g.inFlow) continue;
    const role = roleOf(g.items[0]);
    const bb = groupBounds(g, widths);
    if (role === "bottom" || role === "floatingBottom") {
      if (g.locked) return 0;
      foot = Math.min(foot, bb.t);
    } else if (role !== "top" && role !== "rail" && role !== "fab" && role !== "overlay" && role !== "backdrop") rows = Math.max(rows, bb.b);
  }
  return rows - frame.y + m.margin + end - foot;
}

/** The shortest a screen can be made: the device, or as much as its body needs with what stands at
 *  its foot still below it. Never longer than the screen already is, so a body that already runs
 *  under its bars does not hold the length where it is. */
export function minFrameLength(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>): number {
  const fr = frameRect(frame);
  let body = 0;
  let foot = 0;
  for (const g of groups) {
    /* a rail running the length follows it, so it never holds the screen long */
    if (frameOfGroup(g, frames, widths)?.id !== frame.id || spansScreen(g, frame, widths)) continue;
    const bb = groupBounds(g, widths);
    if (atFoot(g, bb, fr)) foot = Math.max(foot, fr.b - bb.t);
    else body = Math.max(body, bb.b - fr.t);
  }
  return Math.max(frameSizeOf(frame).h, Math.min(frameLengthOf(frame), Math.ceil((body + foot) / 4) * 4));
}

/** The longest a screen can be made from its panel or its handle: four times its device, or longer
 *  where it already is. */
export const maxFrameLength = (frame: Frame) => Math.max(frameLengthOf(frame), frameSizeOf(frame).h * 4);

/** Keep the expanded rail's collapsed footprint on its original edge until moved across the midpoint. */
export function railSide(g: Group, frame: Frame, widths: Record<string, number>): "left" | "right" {
  const item = g.items[0];
  const fr = frameRect(frame);
  const placed = g.items.length === 1 ? layoutOf(g, widths)[0] : undefined;
  const bb = placed ? { l: placed.x, r: placed.x + placed.w } : groupBounds(g, widths);
  const side = item[railExpansionSide];
  const expandedItem = item.props?.expanded === true;
  if (g.items.length === 1 && expandedItem && side) {
    const middle = side === "right" ? bb.r - RAIL_COLLAPSED_W / 2 : bb.l + RAIL_COLLAPSED_W / 2;
    return middle > (fr.l + fr.r) / 2 ? "right" : "left";
  }
  return (bb.l + bb.r) / 2 > (fr.l + fr.r) / 2 ? "right" : "left";
}

/** where a bar dropped on a screen goes: the screen's width less its rails, starting after a rail on the left */
export function barSlotOf(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>): { x: number; w: number } {
  const { w } = frameSizeOf(frame);
  const rails = groups.filter((g) => frameOfGroup(g, frames, widths)?.id === frame.id && g.items.length === 1 && roleOf(g.items[0]) === "rail");
  const left = rails.filter((g) => railSide(g, frame, widths) === "left").reduce((sum, g) => sum + railWidth(g.items[0]), 0);
  return { x: frame.x + left, w: w - rails.reduce((sum, g) => sum + railWidth(g.items[0]), 0) };
}

/** The value most of a set share, within `tol`: the biggest cluster wins; `prefer` breaks a tie, else the first seen. */
function commonValue(values: number[], tol: number, prefer?: number): number | null {
  let best: { v: number; n: number } | null = null;
  for (const v of values) {
    const n = values.filter((w) => Math.abs(w - v) <= tol).length;
    if (!best || n > best.n || (n === best.n && v === prefer && best.v !== prefer)) best = { v, n };
  }
  return best && best.n >= 2 ? best.v : null;
}

/** Runs inside one unit whose left, right or top edges nearly agree move to the shared line.
 *  A run is only ever nudged by up to SNAP, so the picture stays what the author drew. */
function snapEdges(unit: Unit, groups: Map<string, Group>, widths: Record<string, number>): boolean {
  if (unit.ids.length < 2) return false;
  const runs = unit.ids.map((id) => groups.get(id)!);
  const rects = new Map(runs.map((g) => [g.id, groupBounds(g, widths)]));
  /* the container (the biggest run) sets the line; the parts on it follow */
  const container = runs.reduce((a, b) => (area(rects.get(a.id)!) >= area(rects.get(b.id)!) ? a : b));
  const others = runs.filter((g) => g !== container);
  if (!others.length) return false;
  let moved = false;
  const nudge = (g: Group, dx: number, dy: number) => {
    if (!dx && !dy) return;
    groups.set(g.id, { ...groups.get(g.id)!, x: groups.get(g.id)!.x + dx, y: groups.get(g.id)!.y + dy });
    moved = true;
  };
  const lefts = commonValue(others.map((g) => rects.get(g.id)!.l), SNAP);
  const rights = commonValue(others.map((g) => rects.get(g.id)!.r), SNAP);
  for (const g of others) {
    const r = rects.get(g.id)!;
    /* a run already on one shared line is left alone, so a left snap never turns into a right snap later */
    if (r.l === lefts || r.r === rights) continue;
    const dl = lefts === null ? Infinity : Math.abs(r.l - lefts);
    const dr = rights === null ? Infinity : Math.abs(r.r - rights);
    if (dl <= SNAP && dl <= dr) nudge(g, Math.round(lefts! - r.l), 0);
    else if (dr <= SNAP) nudge(g, Math.round(rights! - r.r), 0);
  }
  /* parts side by side that nearly share a top edge: the neighbours set the line, not the part itself */
  for (const g of others) {
    const r = groupBounds(groups.get(g.id)!, widths);
    const beside = others.filter((o) => o !== g && share(r.t, r.b, rects.get(o.id)!.t, rects.get(o.id)!.b) > 0.5).map((o) => groupBounds(groups.get(o.id)!, widths).t);
    const tops = beside.length === 1 ? beside[0] : commonValue(beside, SNAP);
    if (tops !== null && r.t !== tops && Math.abs(r.t - tops) <= SNAP) nudge(g, 0, Math.round(tops - r.t));
  }
  return moved;
}

/** The tidied groups of the document, or null when `frame` is already tidy. */
/** The area Tidy fills with body rows: inside the layout margins, beside the rails, between
 *  the top bars and the bottom bars. Aligning a part on the screen uses the same box, so
 *  it lands where Tidy would put it and not under a bar. */
export function bodyRect(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>, except: Set<string> = new Set(), m: LayoutMetrics = MATERIAL_METRICS): Rect {
  const screen = frameRect(frame);
  /* `except` names groups being moved: a bar that is itself being aligned must not shape the body */
  const mine = groups.filter((g) => !except.has(g.id) && !g.inFlow && roleOf(g.items[0]) !== "backdrop" && frameOfGroup(g, frames, widths)?.id === frame.id);
  const units = clusters(mine, widths);
  const onRight = (u: Unit) => railSide(mine.find((g) => g.id === u.ids[0])!, frame, widths) === "right";
  const rails = units.filter(isRail);
  const leftRails = rails.filter((u) => !onRight(u)).reduce((sum, u) => sum + railWidth(u.probe), 0);
  const rightRails = rails.filter(onRight).reduce((sum, u) => sum + railWidth(u.probe), 0);
  const safe = safeAreaOf(frame);
  let top = screen.t + safe.t;
  for (const u of units.filter(isTop)) top += u.bb.b - u.bb.t;
  let bottom = screen.b - safe.b;
  for (const u of units.filter(isBottomBar)) bottom -= u.bb.b - u.bb.t;
  for (const u of units.filter(isFloatingBottom)) bottom -= m.margin + (u.bb.b - u.bb.t);
  /* a crowded short screen must not turn the box inside out */
  const l = screen.l + leftRails + m.margin;
  const t = top + m.margin;
  return { l, t, r: Math.max(l, screen.r - rightRails - m.margin), b: Math.max(t, bottom - m.margin) };
}

export function tidyFrame(groups: Group[], frame: Frame, frames: Frame[], widths: Record<string, number>, m: LayoutMetrics = MATERIAL_METRICS): Group[] | null {
  const screen: Rect = frameRect(frame);
  /* what a container lays out goes where the container is, not into the screen's rows */
  const mineIds = new Set(groups.filter((g) => !g.inFlow && roleOf(g.items[0]) !== "backdrop" && frameOfGroup(g, frames, widths)?.id === frame.id).map((g) => g.id));
  if (!mineIds.size) return null;

  /* Locked groups are finished sections: they never cluster or move, but they keep the room
   * they stand in, so the rest is laid out around them. */
  const mine = groups.filter((g) => mineIds.has(g.id) && !g.locked);
  const fixed = clusters(groups.filter((g) => mineIds.has(g.id) && !!g.locked), widths, m);
  const fixedRails = fixed.filter(isRail);
  const fixedTops = fixed.filter(isTop);
  const fixedBottoms = fixed.filter((u) => isBottomBar(u) || isFloatingBottom(u));
  const fixedFabs = fixed.filter(isFab);
  /* the bands of body height a locked section takes, which the rows flow around */
  const bands = fixed.filter((u) => !isAnchored(u)).map((u) => u.bb).sort((a, b) => a.t - b.t);

  const units = clusters(mine, widths, m);
  const target = new Map<Unit, { l: number; t: number }>();

  /* a navigation rail stands on the edge it is nearer to, left or right (a second one beside it);
   * the rest of the screen is the body between them */
  const onRight = (u: Unit) => railSide(groups.find((g) => g.id === u.ids[0]) ?? mine.find((g) => g.id === u.ids[0])!, frame, widths) === "right";
  const slotLeft = (u: Unit) => onRight(u) ? u.bb.r - railWidth(u.probe) : u.bb.l;
  const rails = units.filter(isRail).sort((a, b) => slotLeft(a) - slotLeft(b) || a.bb.t - b.bb.t);
  const leftRails = rails.filter((u) => !onRight(u));
  const rightRails = rails.filter(onRight).reverse();
  /* locked rails keep their place; the others line up outside them */
  let leftWidth = Math.max(0, ...fixedRails.filter((u) => !onRight(u)).map((u) => u.bb.r - screen.l));
  let rightWidth = Math.max(0, ...fixedRails.filter(onRight).map((u) => screen.r - u.bb.l));
  leftRails.forEach((u) => {
    target.set(u, { l: screen.l + leftWidth, t: screen.t });
    leftWidth += railWidth(u.probe);
  });
  rightRails.forEach((u) => {
    target.set(u, { l: screen.r - rightWidth - railWidth(u.probe), t: screen.t });
    rightWidth += railWidth(u.probe);
  });
  const fr: Rect = { ...screen, l: screen.l + leftWidth, r: screen.r - rightWidth };
  const frameW = fr.r - fr.l;

  /* locked bars keep their place too; the others stack beyond them, and inside the device's own bars */
  const safe = safeAreaOf(frame);
  let top = Math.max(fr.t + safe.t, ...fixedTops.map((u) => u.bb.b));
  for (const u of units.filter(isTop).sort((a, b) => a.bb.t - b.bb.t)) {
    target.set(u, { l: fr.l, t: top });
    top += u.bb.b - u.bb.t;
  }
  let bottom = Math.min(fr.b - safe.b, ...fixedBottoms.map((u) => u.bb.t));
  for (const u of units.filter(isBottomBar).sort((a, b) => b.bb.t - a.bb.t)) {
    bottom -= u.bb.b - u.bb.t;
    target.set(u, { l: fr.l + Math.max(0, Math.round((frameW - (u.bb.r - u.bb.l)) / 2)), t: bottom });
  }
  for (const u of units.filter(isFloatingBottom).sort((a, b) => b.bb.t - a.bb.t)) {
    const h = u.bb.b - u.bb.t;
    const w = u.bb.r - u.bb.l;
    bottom -= m.margin + h;
    target.set(u, { l: fr.l + Math.round((frameW - w) / 2), t: bottom });
  }
  let fabBottom = Math.min(bottom, ...fixedFabs.map((u) => u.bb.t));
  for (const u of units.filter(isFab).sort((a, b) => b.bb.t - a.bb.t)) {
    const h = u.bb.b - u.bb.t;
    const w = u.bb.r - u.bb.l;
    fabBottom -= m.margin + h;
    target.set(u, { l: fr.r - m.margin - w, t: fabBottom });
  }
  /* a dialog is centered on the device: on a screen that runs further, that is its first screenful */
  const viewH = frameSizeOf(frame).h;
  for (const u of units.filter(isOverlay)) {
    target.set(u, { l: fr.l + Math.round((frameW - (u.bb.r - u.bb.l)) / 2), t: fr.t + Math.round((viewH - (u.bb.b - u.bb.t)) / 2) });
  }

  /* everything else flows in rows between the top and bottom bars, on the layout margins;
   * rows that would not fit are left where they are rather than pushed off the screen.
   * The rows are measured first, then the whole block is placed the way the screen asks:
   * from the top, centered, against the bottom, or spread out with equal gaps. */
  /* unless the author has said where the body gathers, what stands on a picture stays where it was put */
  const onScene = !frame.place && !bands.length && groups.some((g) => !g.inFlow && roleOf(g.items[0]) === "backdrop" && frameOfGroup(g, frames, widths)?.id === frame.id);
  if (onScene) settleOnScene(units.filter((u) => !target.has(u)), target, { l: fr.l + m.margin, t: top + m.margin, r: fr.r - m.margin, b: bottom - m.margin }, fr.l, frameW, m);
  const rows = rowsOf(units.filter((u) => !target.has(u)));
  const limit = bottom - m.margin;
  /* a list a style runs edge to edge hangs from the bar above it */
  const hangs = !!m.flush && !!rows[0]?.length && rows[0].every((u) => m.flush!(u.probe));
  const start = top + (hangs ? 0 : m.margin);
  const laid: { row: Unit[]; y: number; rowH: number }[] = [];
  let y = start;
  let prev: Unit[] | null = null;
  for (const row of rows) {
    y += gapBefore(prev, row, m);
    const rowH = Math.max(...row.map((u) => u.bb.b - u.bb.t));
    /* a row that would land on a locked section goes below it instead */
    for (const band of bands) if (y < band.b + m.gap && y + rowH > band.t - m.gap) y = band.b + m.gap;
    if (y + rowH > limit) break;
    laid.push({ row, y, rowH });
    y += rowH;
    prev = row;
  }
  const used = laid.length ? y - start : 0;
  const spare = Math.max(0, limit - start - used);
  const place = frame.place ?? "top";
  /* spreading shares all the free height equally above, between and below the rows,
   * in place of the rows' own gaps; a lone row spreads to the middle, like centering */
  const heights = laid.map((r) => r.rowH);
  /* when some rows did not fit they stay where they were, below the block, so the block
   * stays at the top rather than moving down onto them */
  const fits = laid.length === rows.length;
  /* rows flowed around a locked section stay where the flow put them: shifting the block
   * to the center or the bottom would put them back onto it */
  const spreading = fits && !bands.length && place === "spread" && laid.length > 1;
  const even = spreading ? (spare + used - heights.reduce((a, h) => a + h, 0)) / (laid.length + 1) : 0;
  const offset = !fits || bands.length ? 0 : place === "center" || (place === "spread" && laid.length <= 1) ? Math.round(spare / 2) : place === "bottom" ? spare : 0;
  let stacked = 0;
  laid.forEach(({ row, y: rowY, rowH }, index) => {
    /* what a game keeps counted at the head of its screen stays there, whatever gathers below it */
    const counted = offset > 0 && index === 0 && row.every((u) => COUNTERS.has(u.probe.component ?? ""));
    const yy = spreading ? start + Math.round(even * (index + 1)) + stacked : counted ? rowY : rowY + offset;
    stacked += rowH;
    const inner = frameW - m.margin * 2;
    /* a part that spans the screen -- a carousel, a bar laid in the flow, a list a style runs edge to edge -- is
     * edge to edge, and the margin is not its to keep, whatever else shares its line */
    const isFull = (u: Unit) => (fullWidth(u.probe) || !!m.flush?.(u.probe)) && u.bb.r - u.bb.l >= frameW - 1;
    for (const u of row) if (isFull(u)) target.set(u, { l: fr.l, t: yy });
    row = row.filter((u) => !isFull(u));
    if (row.length === 0) return;
    if (row.length === 1) {
      const u = row[0];
      const w = u.bb.r - u.bb.l;
      const a = align(u.bb, fr, m.margin);
      /* a run nearly as wide as the content (a button row, a chip row) sits on the left margin,
       * so its edge lines up with the cards and lists above and below it */
      const wide = w >= inner * 0.7;
      const l = wide || a === "left" ? fr.l + m.margin : a === "right" ? fr.r - m.margin - w : fr.l + Math.round((frameW - w) / 2);
      target.set(u, { l, t: yy });
    } else if (row.length === 2 && row.some(isLabel) && row.some(isControl)) {
      /* a label with its control: the label on the left margin, the control on the right, like a settings row */
      const label = row.find(isLabel)!;
      const control = row.find(isControl)!;
      const cw = control.bb.r - control.bb.l;
      target.set(label, { l: fr.l + m.margin, t: yy + Math.round((rowH - (label.bb.b - label.bb.t)) / 2) });
      target.set(control, { l: fr.r - m.margin - cw, t: yy + Math.round((rowH - (control.bb.b - control.bb.t)) / 2) });
    } else {
      const ws = row.map((u) => u.bb.r - u.bb.l);
      const total = ws.reduce((s, w) => s + w, 0);
      const gaps = row.slice(1).map(() => ROW_ITEM_GAP);
      const minPacked = total + gaps.reduce((s, g) => s + g, 0);
      const span = row[row.length - 1].bb.r - row[0].bb.l;
      const spread = span >= inner * 0.7 && minPacked <= inner;
      const packed = spread ? inner : minPacked;
      const extra = spread ? (inner - minPacked) / gaps.length : 0;
      const a = spread ? "left" : align({ l: row[0].bb.l, t: 0, r: row[row.length - 1].bb.r, b: 0 }, fr, m.margin);
      let x = a === "right" ? fr.r - m.margin - packed : a === "center" ? fr.l + (frameW - packed) / 2 : fr.l + m.margin;
      row.forEach((u, i) => {
        const h = u.bb.b - u.bb.t;
        target.set(u, { l: Math.round(x), t: yy + Math.round((rowH - h) / 2) });
        x += ws[i] + (gaps[i] ?? 0) + extra;
      });
    }
  });

  /* apply each unit's shift to every group it holds */
  const shift = new Map<string, { dx: number; dy: number }>();
  for (const [u, to] of target) {
    const dx = Math.round(to.l - u.bb.l);
    const dy = Math.round(to.t - u.bb.t);
    for (const id of u.ids) shift.set(id, { dx, dy });
  }
  let moved = false;
  const placed = new Map(
    mine.map((g) => {
      const s = shift.get(g.id);
      if (!s || (s.dx === 0 && s.dy === 0)) return [g.id, g] as const;
      moved = true;
      const x = g.x + s.dx;
      return [g.id, { ...g, x, y: g.y + s.dy }] as const;
    }),
  );
  for (const u of units) if (snapEdges(u, placed, widths)) moved = true;
  if (!moved) return null;
  /* a locked group, and another screen's, keeps its position and its slot untouched */
  return groups.map((g) => placed.get(g.id) ?? g);
}
