import { partBySlug, reader } from "../parts/registry";
import { roleOf } from "../parts/role";
import { stretchFrame } from "./tidy";
import { Frame, Group, frameLengthOf, frameOfGroup, groupBounds, heldBy } from "./tokens";

/* A model writes a screen without seeing it: it has to guess how tall each part comes out, and a low
 * guess lays one part over the next. Once the parts have been measured, the ones that ran into each
 * other move down. Whatever is not in the way stays where the model put it. */

const GAP = 16;
/** what stands on the screen rather than in its body; the body keeps clear of the bars, and a FAB or an overlay floats over it */
const AT_HEAD = new Set(["top", "rail"]);
const AT_FOOT = new Set(["bottom", "floatingBottom"]);
const FLOATS = new Set(["fab", "overlay"]);

type Box = { l: number; t: number; r: number; b: number };

/** where a part really is: a menu measures as big as the box it is drawn open in, and stands where its button does */
function boxOf(g: Group, widths: Record<string, number>): Box {
  const bb = groupBounds(g, widths);
  const def = g.items.length === 1 ? partBySlug(g.items[0].component) : undefined;
  if (!def?.open || def.open.trigger === "hide") return bb;
  const { ax, ay } = def.open.box(reader(def, g.items[0].props));
  const w = Math.min(def.w, bb.r - bb.l);
  const h = Math.min(def.h, bb.b - bb.t);
  const l = ax === "end" ? bb.r - w : bb.l;
  const t = ay === "end" ? bb.b - h : bb.t;
  return { l, t, r: l + w, b: t + h };
}

const across = (a: Box, b: Box) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1;
const overlaps = (a: Box, b: Box) => across(a, b) && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;

/** The groups moved so nothing in a screen's body lies over anything else, and the frames with any
 *  screen made long enough to hold what moved; null when nothing was in the way. Parts that show at
 *  different times (a tab's, one hidden until asked for) may share a place, and what a container holds
 *  moves with it. */
export function pushApart(groups: Group[], frames: Frame[], widths: Record<string, number>): { groups: Group[]; frames: Frame[] } | null {
  let nextGroups = groups;
  let nextFrames = frames;
  let any = false;
  for (const frame of frames) {
    const mine = nextGroups.filter((g) => !g.inFlow && frameOfGroup(g, nextFrames, widths)?.id === frame.id);
    const heldIds = new Set(mine.flatMap((g) => heldBy(g, nextGroups, widths).map((k) => k.id)));
    const taken: Box[] = [];
    const body: Group[] = [];
    let foot = Infinity;
    for (const g of mine) {
      if (heldIds.has(g.id)) continue;
      const role = roleOf(g.items[0]) ?? "";
      if (AT_HEAD.has(role)) taken.push(boxOf(g, widths));
      else if (AT_FOOT.has(role)) foot = Math.min(foot, boxOf(g, widths).t);
      else if (!FLOATS.has(role) && !g.hidden && !g.showWhen && g.pane === undefined && !g.locked) body.push(g);
    }
    const moved = new Map<string, number>();
    let lowest = -Infinity;
    for (const g of [...body].sort((a, b) => boxOf(a, widths).t - boxOf(b, widths).t || boxOf(a, widths).l - boxOf(b, widths).l)) {
      const box = boxOf(g, widths);
      let dy = 0;
      for (;;) {
        const now = { ...box, t: box.t + dy, b: box.b + dy };
        const hits = taken.filter((o) => overlaps(now, o));
        if (!hits.length) break;
        dy = Math.max(...hits.map((o) => o.b)) + GAP - box.t;
      }
      if (dy) moved.set(g.id, dy);
      taken.push({ ...box, t: box.t + dy, b: box.b + dy });
      lowest = Math.max(lowest, box.b + dy);
    }
    if (!moved.size) continue;
    any = true;
    /* what a moved container holds moves with it */
    const heldMoves = new Map<string, number>();
    for (const h of mine) if (moved.has(h.id)) for (const k of heldBy(h, nextGroups, widths)) heldMoves.set(k.id, moved.get(h.id)!);
    /* What moved past the bar at the foot is more than the screen holds: its body scrolls. The screen
     * is made longer first, while every part is still on it, so the bar goes with the foot and no more moves. */
    if (Number.isFinite(foot) && lowest + GAP > foot) {
      const length = frameLengthOf(frame) + Math.ceil(lowest + GAP - foot);
      const stretched = stretchFrame(nextGroups, frame, Math.ceil(length / 4) * 4, nextFrames, widths);
      nextGroups = stretched.groups;
      nextFrames = stretched.frames;
    }
    nextGroups = nextGroups.map((g) => {
      const dy = moved.get(g.id) ?? heldMoves.get(g.id);
      return dy ? { ...g, y: g.y + dy } : g;
    });
  }
  return any ? { groups: nextGroups, frames: nextFrames } : null;
}
