/* What the operations share: finding things by id with errors that say what is missing, the parts a person adds,
 * and where a new part lands on a screen. */

import { partBySlug } from "../../../parts/registry";
import { defaultMeasures } from "../../../parts/templates/kit";
import { fullWidth } from "../../../parts/role";
import { canvasView } from "../../expand";
import { metricsOf } from "../../styleLayout";
import { barSlotOf, pullInto } from "../../tidy";
import {
  carryItemSize,
  fitHeight,
  frameRect,
  frameSizeOf,
  groupBounds,
  heldBy,
  layoutOf,
  makeItem,
  PHONE_H,
  PHONE_W,
  sizeOf,
  uid,
  type Collection,
  type ComponentDef,
  type Frame,
  type Group,
  type Item,
} from "../../tokens";
import { OpError } from "../op";
import { withGroups, type CoreState, type Widths } from "../state";

/* ---------- finding ---------- */

export const groupOfItem = (groups: Group[], itemId: string) => groups.find((g) => g.items.some((it) => it.id === itemId));

/** a part by its id, with the group it stands in */
export function itemById(s: CoreState, id: string): { group: Group; item: Item; index: number } {
  for (const group of s.doc.groups) {
    const index = group.items.findIndex((it) => it.id === id);
    if (index >= 0) return { group, item: group.items[index], index };
  }
  throw new OpError("not_found", `There is no part ${JSON.stringify(id)} on the canvas.`, id);
}

/** a group by its own id, or the group of the part with that id */
export function groupById(s: CoreState, id: string): Group {
  const g = s.doc.groups.find((x) => x.id === id) ?? groupOfItem(s.doc.groups, id);
  if (!g) throw new OpError("not_found", `There is no part or group ${JSON.stringify(id)} on the canvas.`, id);
  return g;
}

export function frameById(s: CoreState, id: string): Frame {
  const f = s.doc.frames.find((x) => x.id === id);
  if (!f) throw new OpError("not_found", `There is no screen ${JSON.stringify(id)}${s.editing ? " while a component is being edited" : ""}.`, id);
  return f;
}

export function componentById(s: CoreState, id: string): ComponentDef {
  const c = s.doc.components?.find((x) => x.id === id);
  if (!c) throw new OpError("not_found", `There is no component ${JSON.stringify(id)}.`, id);
  return c;
}

export function collectionById(s: CoreState, id: string): Collection {
  const c = s.doc.collections?.find((x) => x.id === id);
  if (!c) throw new OpError("not_found", `There is no data collection ${JSON.stringify(id)}.`, id);
  return c;
}

/** refuses a change to a locked group */
export function unlocked(g: Group, what = "It"): Group {
  if (g.locked) throw new OpError("locked", `${what} is locked: unlock it in the layers first.`, g.id);
  return g;
}

/** an id the caller gave, unless it is taken already */
export function freshId(s: CoreState, given: string | undefined, newId: () => string): string {
  if (given === undefined) return newId();
  const taken = s.doc.groups.some((g) => g.id === given || g.items.some((it) => it.id === given)) || s.doc.frames.some((f) => f.id === given);
  if (taken) throw new OpError("invalid_value", `The id ${JSON.stringify(given)} is taken already.`, given);
  return given;
}

/* ---------- the parts a person adds ---------- */

/** a part a person adds from the palette, with what such a part starts with (`PartDef.seed`) */
export const freshPart = (slug: string, seed = true): Item => {
  const def = partBySlug(slug);
  const item = makeItem(slug);
  return seed && def?.seed ? { ...item, props: { ...def.seed } } : item;
};

/** how big a part fresh from the palette comes out before it is drawn: what it says itself, else its own guess */
export const freshSize = (it: Item) => {
  const m = defaultMeasures([{ id: "", x: 0, y: 0, axis: "x", items: [it] }]);
  return { w: m[it.id] ?? 120, h: m[`${it.id}:h`] ?? 40 };
};

/** Material's 4dp grid: a coordinate rounded to it, measured from the screen's corner */
const GRID = 4;
export const onGrid = (v: number, origin: number) => origin + Math.round((v - origin) / GRID) * GRID;

/** The group a new part becomes when it lands with its top-left at rawX/rawY, on the screen under its centre if
 *  there is one. A bar spans that screen beside its rail; any other part keeps its phone-sized default, but no
 *  taller than the screen. Off any guide the part settles on the 4dp grid of the screen it lands on; `held` names the
 *  axes that keep their whole pixel instead (a guide's hold, or a Ctrl drop). A part that grew to the screen's width
 *  is kept inside it, then settles back on the grid. */
export function landNewPart(s: CoreState, item: Item, rawX: number, rawY: number, held: (axis: "x" | "y") => boolean, widths: Widths, id: string = uid()): Group {
  const sz = sizeOf(item, widths);
  const frames = s.doc.frames;
  const targetFrame = frames.find((f) => {
    const r = frameRect(f);
    const cx = rawX + sz.w / 2;
    const cy = rawY + sz.h / 2;
    return cx >= r.l && cx <= r.r && cy >= r.t && cy <= r.b;
  });
  const slot = targetFrame ? barSlotOf(s.doc.groups, targetFrame, frames, widths) : null;
  const isBar = fullWidth(item);
  const placedItem = targetFrame && slot ? (isBar ? carryItemSize(item, { w: PHONE_W, h: PHONE_H }, { w: slot.w, h: frameSizeOf(targetFrame).h }) : fitHeight(item, frameSizeOf(targetFrame).h)) : item;
  const origin = targetFrame ?? { x: 0, y: 0 };
  const settle = (axis: "x" | "y", pos: number) => (held(axis) ? Math.round(pos) : onGrid(pos, origin[axis]));
  const landed: Group = {
    id,
    x: isBar && slot ? Math.round(slot.x) : settle("x", rawX),
    y: settle("y", rawY),
    axis: "x",
    items: [placedItem],
  };
  const pulled = targetFrame ? pullInto(landed, targetFrame, widths) : landed;
  if (pulled === landed) return pulled;
  return { ...pulled, x: held("x") ? pulled.x : onGrid(pulled.x, origin.x), y: held("y") ? pulled.y : onGrid(pulled.y, origin.y) };
}

/** every part on the canvas with where it is drawn */
export function itemRects(groups: Group[], widths: Widths, skip?: Set<string>) {
  const out: { id: string; l: number; t: number; r: number; b: number }[] = [];
  for (const g of groups) {
    if (skip?.has(g.id)) continue;
    for (const pl of layoutOf(g, widths)) out.push({ id: pl.item.id, l: pl.x, t: pl.y, r: pl.x + pl.w, b: pl.y + pl.h });
  }
  return out;
}

/** Where a part of this size goes on a screen when nobody says: the screen's middle, inside its margins, moved down
 *  while what is already there is in the way, as the editor adds a part where the view is looking. */
export function spotOn(s: CoreState, f: Frame, size: { w: number; h: number }, widths: Widths, at?: { x: number; y: number }) {
  const margin = metricsOf(s.doc.theme).margin ?? 16;
  const { w } = frameSizeOf(f);
  const h = Math.max(f.length ?? 0, frameSizeOf(f).h);
  let x = at ? at.x : f.x + w / 2 - size.w / 2;
  let y = at ? at.y : f.y + margin;
  const lx = f.x + Math.min(margin, (w - size.w) / 2);
  const ly = f.y + Math.min(margin, (h - size.h) / 2);
  x = Math.min(Math.max(x, lx), Math.max(lx, f.x + w - margin - size.w));
  y = Math.min(Math.max(y, ly), Math.max(ly, f.y + h - margin - size.h));
  if (at) return { x, y };
  const rects = itemRects(s.doc.groups, widths);
  const taken = (yy: number) => rects.some((o) => o.l < x + size.w && o.r > x && o.t < yy + size.h && o.b > yy);
  let tries = 0;
  while (taken(y) && y + size.h * 2 < f.y + h && tries++ < 40) y += 8;
  return { x, y };
}

/** the units with what each holds, each once: a container is copied whole */
export const withHeld = (units: Group[], groups: Group[], widths: Widths) => {
  const whole = new Map<string, Group>();
  for (const u of units) if (!whole.has(u.id)) whole.set(u.id, u);
  for (const u of units) for (const held of heldBy(u, groups, widths)) if (!whole.has(held.id)) whole.set(held.id, held);
  return [...whole.values()];
};

/** the ids of the copies, with the copy of the part that was primary last, so it stays the one the panel shows */
export function copiedIds(copies: Group[], primaryAt: number): string[] {
  const ids = copies.flatMap((c) => c.items.map((it) => it.id));
  if (primaryAt < 0 || primaryAt >= ids.length) return ids;
  return [...ids.slice(0, primaryAt), ...ids.slice(primaryAt + 1), ids[primaryAt]];
}

/** The selection as units that can be copied: a group whose parts are all selected goes whole, keeping its layout; a
 *  part picked out of a larger group goes on its own, at its place on the canvas. A copy starts unlocked; the lock
 *  belongs to the original. */
export function selectionUnits(groups: Group[], ids: Set<string>, widths: Widths): Group[] {
  const rects = new Map(itemRects(groups, widths).map((r) => [r.id, r]));
  const out: Group[] = [];
  for (const g of groups) {
    const picked = g.items.filter((it) => ids.has(it.id));
    if (!picked.length) continue;
    if (picked.length === g.items.length) {
      out.push({ ...structuredClone(g), locked: undefined });
      continue;
    }
    for (const it of picked) {
      const r = rects.get(it.id);
      if (r) out.push({ id: g.id, x: r.l, y: r.t, axis: "x", items: [structuredClone(it)] });
    }
  }
  return out;
}

/** the spacing scale of the document's style: the gaps Tidy up and a suggested layout snap to */
export const spacingScale = (s: CoreState) => {
  const m = metricsOf(s.doc.theme);
  return [m.tight, m.gap];
};

/** The canvas laid out as the editor lays it out after every change: what auto layouts hold is put in its place.
 *  The editor does this as it draws; a document changed with no editor drawing it (an agent, a file) is laid out
 *  here, so what is saved is what would be seen. */
export function laidOut(s: CoreState, widths: Widths): CoreState {
  const view = canvasView({ groups: s.doc.groups, components: s.doc.components, collections: s.doc.collections }, widths);
  return withGroups(s, view.groups);
}

/** the bounds of a group, for errors and placement */
export const boundsOf = (g: Group, widths: Widths) => groupBounds(g, widths);
