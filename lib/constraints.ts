import { partBySlug } from "../parts/registry";
import { axisValue, axisWrite, resizeOf } from "../parts/resize";
import { flowOf } from "./flow";
import { groupBounds, heldBy, holdsParts, type Group, type Item } from "./tokens";

/* Figma's constraints, for the parts in a box with no auto layout: when the box changes size, each part keeps its
 * distance to the left or the right edge (or both, and stretches), stays centred, or scales with it; the same on the
 * vertical. Parts that say nothing keep to the top left, as every part always has. A part in an auto layout is placed
 * by it and has no constraints. */

export type Constraint = NonNullable<Item["constraints"]>;
export const H_CONSTRAINTS = ["left", "right", "stretch", "center", "scale"] as const;
export const V_CONSTRAINTS = ["top", "bottom", "stretch", "center", "scale"] as const;

type Widths = Record<string, number>;
type Rect = { l: number; t: number; w: number; h: number };

/** a box that holds parts where they are put, which is what constraints are for */
export const holdsFreely = (g: Group) => holdsParts(g) && !flowOf(g);

/** what a part held by a box was, before the box changed: where it stood and how big it was */
export type HeldBase = { id: string; x: number; y: number; w: number; h: number };

/** the parts a box holds that have a constraint, as they stand now */
export function constrainedIn(box: Group, groups: Group[], widths: Widths): HeldBase[] {
  if (!holdsFreely(box)) return [];
  return heldBy(box, groups, widths)
    .filter((g) => g.items.length === 1 && g.items[0].constraints && !g.inFlow)
    .map((g) => {
      const b = groupBounds(g, widths);
      return { id: g.id, x: g.x, y: g.y, w: b.r - b.l, h: b.b - b.t };
    });
}

/** one axis of a part placed again in a box that went from `[from, from + was]` to `[to, to + now]` */
function along(rule: string, start: number, size: number, from: number, was: number, to: number, now: number): { at: number; size: number } {
  const lead = start - from;
  const trail = from + was - (start + size);
  switch (rule) {
    case "right":
    case "bottom":
      return { at: to + now - trail - size, size };
    case "stretch":
      return { at: to + lead, size: Math.max(1, now - lead - trail) };
    case "center":
      return { at: to + lead + (now - was) / 2, size };
    case "scale": {
      const k = was > 0 ? now / was : 1;
      return { at: to + lead * k, size: Math.max(1, size * k) };
    }
    default:
      return { at: to + lead, size };
  }
}

/** a part with another size, where it has a measure that can be set */
function resized(it: Item, w: number | undefined, h: number | undefined): Item {
  const ax = resizeOf(partBySlug(it.component), it.props);
  let props = it.props;
  if (w !== undefined && ax?.width && Math.round(axisValue(ax.width, props)) !== Math.round(w)) props = { ...props, [ax.width.key]: axisWrite(ax.width, Math.round(w)) };
  if (h !== undefined && ax?.height && Math.round(axisValue(ax.height, props)) !== Math.round(h)) props = { ...props, [ax.height.key]: axisWrite(ax.height, Math.round(h)) };
  return props === it.props ? it : { ...it, props };
}

/** The parts a box holds placed by their constraints, the box having gone from `was` to `now`. `bases` are the parts
 *  as they stood with the box at `was`. The same array comes back when nothing moves. */
export function withConstraints(groups: Group[], bases: HeldBase[], was: Rect, now: Rect): Group[] {
  if (!bases.length || (was.l === now.l && was.t === now.t && was.w === now.w && was.h === now.h)) return groups;
  const byId = new Map(bases.map((b) => [b.id, b]));
  let changed = false;
  const out = groups.map((g) => {
    const base = byId.get(g.id);
    const c = base && g.items[0]?.constraints;
    if (!base || !c) return g;
    const x = along(c.h ?? "left", base.x, base.w, was.l, was.w, now.l, now.w);
    const y = along(c.v ?? "top", base.y, base.h, was.t, was.h, now.t, now.h);
    const item = resized(g.items[0], c.h === "stretch" || c.h === "scale" ? x.size : undefined, c.v === "stretch" || c.v === "scale" ? y.size : undefined);
    const nx = Math.round(x.at);
    const ny = Math.round(y.at);
    if (nx === g.x && ny === g.y && item === g.items[0]) return g;
    changed = true;
    return { ...g, x: nx, y: ny, items: [item, ...g.items.slice(1)] };
  });
  return changed ? out : groups;
}

/** the box a container is drawn as with the measures its props give it, which is what it becomes once they are set */
export function boxWithProps(g: Group, it: Item, widths: Widths): Rect {
  const b = groupBounds(g, widths);
  const ax = resizeOf(partBySlug(it.component), it.props);
  return { l: b.l, t: b.t, w: ax?.width ? axisValue(ax.width, it.props) : b.r - b.l, h: ax?.height ? axisValue(ax.height, it.props) : b.b - b.t };
}
