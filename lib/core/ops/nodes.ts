/* Operations on the parts of the canvas: adding them (one part, a part dropped where a pointer let it go, an
 * instance of a component), removing, copying and pasting, their props and their own fields, their groups' fields,
 * moving them (by a step, to a point, into a layout, along it, over and under each other), grouping and locking. */

import { kitBySlug } from "../../../parts/kits";
import { partBySlug } from "../../../parts/registry";
import { roleOf } from "../../../parts/role";
import { defaultMeasures } from "../../../parts/templates/kit";
import { kitGroups, kitLookOf, landTree, moveTo, spansScreen, treeSize } from "../../kits";
import { metricsOf } from "../../styleLayout";
import type { Lang } from "../../i18n";
import { joinDropped } from "../../combine";
import { childLayoutOf, flowOf, inRun, loosenedCopies, outOfPane, settleInFlow, showingGroups, stepLayers } from "../../flow";
import { canNest, rekeyedAll, standIn } from "../../instances";
import { tidyLook } from "../../look";
import { updateRail } from "../../rail";
import { boxWithProps, constrainedIn, holdsFreely, withConstraints } from "../../constraints";
import { onScreenAsBackdrop } from "../../settle";
import { retiredRefusal } from "../../retire";
import {
  collapseFree,
  explodeGroup,
  frameOfGroup,
  frameOfPart,
  frameRect,
  frameSizeOf,
  GAP,
  groupBounds,
  heldBy,
  sizeOf,
  underWhatItHolds,
  unionRect,
  type Condition,
  type Frame,
  type Group,
  type Item,
} from "../../tokens";
import { op, OpError, S } from "../op";
import { withGroups, withSession, type CoreState, type Widths } from "../state";
import { componentById, copiedIds, freshId, freshPart, frameById, groupById, groupOfItem, itemById, itemRects, landNewPart, laidOut, onItsEdge, selectionUnits, spotOn, unlocked, withHeld } from "./common";
import { checkItemPatch, checkProps, cleanedLook, conditionError } from "./validate";
import { paneGroups, panesOf, refusePanes } from "./split";
import { SPLIT_SLUG, splitOf, withSplitPanes, type PaneSide } from "../../split";
import { arrangeFlows } from "../../flow";
import { propsPatch } from "./rows";
import { conditionValue } from "../../converge";

/** the groups whose anchor moved, for a canvas that draws them there at once rather than easing them */
export const movedGroups = (before: Group[], after: Group[]): string[] => {
  const was = new Map(before.map((g) => [g.id, g]));
  return after.filter((g) => {
    const b = was.get(g.id);
    return !!b && b !== g && (b.x !== g.x || b.y !== g.y);
  }).map((g) => g.id);
};

/** what lies inside a part through its layouts, at any depth, in document order */
const flowSubtree = (groups: Group[], id: string): Set<string> => {
  const out = new Set<string>();
  const walk = (host: string) => {
    for (const g of groups)
      if (g.inFlow === host && !out.has(g.id)) {
        out.add(g.id);
        walk(g.id);
      }
  };
  walk(id);
  return out;
};

/** A group put into a container's auto layout at a place in its run (the run is the document's order): after the
 *  `index`-th part already in it, with what that part holds, or first. */
export function intoFlow(groups: Group[], g: Group, hostId: string, index: number | undefined): Group[] {
  const host = groups.find((x) => x.id === hostId);
  if (host && splitOf(host)) throw new OpError("invalid_value", `${hostId} is a split view: put it into one of its panes (the outline lists them as its first and second pane).`, hostId);
  if (!host || !flowOf(host)) throw new OpError("invalid_value", `${hostId} is not a container with an auto layout: turn its layout on (layout: "column", "row" or "grid") first.`, hostId);
  const rest = groups.filter((x) => x.id !== g.id);
  const kids = rest.filter((x) => x.inFlow === hostId && !(x.items.length === 1 && childLayoutOf(x.items[0]).absolute));
  const at = index === undefined ? kids.length : Math.max(0, Math.min(kids.length, Math.round(index)));
  const joined: Group = inRun({ ...g, inFlow: hostId, x: host.x, y: host.y });
  let pos: number;
  if (at === 0) pos = rest.indexOf(host) + 1;
  else {
    const before = kids[at - 1];
    const inside = flowSubtree(rest, before.id);
    pos = rest.indexOf(before) + 1;
    while (pos < rest.length && inside.has(rest[pos].id)) pos++;
  }
  return [...rest.slice(0, pos), joined, ...rest.slice(pos)];
}

/* ---------- adding ---------- */

export type AddPartArgs = {
  /** the part (parts/registry slug) */
  slug: string;
  /** values over its defaults */
  props?: Record<string, unknown>;
  /** the new part's id, and its group's */
  id?: string;
  groupId?: string;
  /** the screen it goes on; with `at`, the point is from the screen's top left */
  screen?: string;
  /** where its top left lands, in canvas coordinates (or from the screen's corner with `screen`) */
  at?: { x: number; y: number };
  /** a container with an auto layout to put it in, at a place in its run */
  into?: { container: string; index?: number };
  /** what a part added from the palette starts with (`PartDef.seed`): the editor's panel says yes */
  seed?: boolean;
  /** a scene lands as the picture of this screen, or of the one nearest this point */
  backdrop?: { screen?: string; x: number; y: number };
};

export const addPart = op<AddPartArgs, { itemId: string; groupId: string; panes?: Partial<Record<PaneSide, string>> }>({
  name: "add_part",
  summary: "Adds a part (an atom or a composite) to a screen: at a point, into a container's auto layout at a place in its run, or where there is room.",
  args: S.obj(
    {
      slug: S.str("the part, as the parts catalog names it (box, text, button, app-bar…)"),
      props: S.any("prop values over the part's defaults"),
      id: S.str("an id for the new part (optional)"),
      groupId: S.str("an id for the part's group (optional)"),
      screen: S.str("the screen it goes on"),
      at: S.point("where its top left lands, from the screen's top left (canvas coordinates without a screen)"),
      into: S.obj({ container: S.str("a part with an auto layout (a box)"), index: S.int("its place in the run, 0 first; the end when left out") }, ["container"]),
      seed: S.bool("start the part the way the palette adds it"),
      backdrop: S.obj({ screen: S.str(), x: S.num(), y: S.num() }, ["x", "y"]),
    },
    ["slug"],
  ),
  label: (a) => `Add ${a.slug}`,
  run(s, a, ctx) {
    const def = partBySlug(a.slug);
    if (!def) throw new OpError("not_found", `There is no part "${a.slug}". The parts catalog lists every slug.`, a.slug);
    if (def.retired) throw new OpError("refused", retiredRefusal(def), a.slug);
    if (a.props && ctx.strict) checkProps(def, a.props, s);
    const id = freshId(s, a.id, ctx.newId);
    const base = freshPart(a.slug, !!a.seed);
    const item: Item = { ...base, id, ...(a.props ? { props: { ...base.props, ...a.props } } : {}) };
    const groupId = freshId(s, a.groupId, ctx.newId);
    const done = (state: CoreState) => {
      if (a.slug !== SPLIT_SLUG) return { state: withSession(state, { selection: [id], frameId: null }), result: { itemId: id, groupId } };
      /* a split view comes with its two panes (lib/split.ts), made here rather than after the operation so that the
         caller is told what to put parts into */
      const whole = withGroups(state, arrangeFlows(withSplitPanes(state.doc.groups, ctx.newId, ctx.lang), ctx.widths));
      return { state: withSession(whole, { selection: [id], frameId: null }), result: { itemId: id, groupId, panes: panesOf(whole.doc.groups, groupId) } };
    };
    if (a.into) {
      const host = groupById(s, a.into.container);
      const groups = intoFlow(s.doc.groups, { id: groupId, x: host.x, y: host.y, axis: "x", items: [item] }, host.id, a.into.index);
      return done(laidOut(withGroups(s, groups), ctx.widths));
    }
    const frame = a.screen !== undefined ? frameById(s, a.screen) : undefined;
    let at = a.at && frame ? { x: frame.x + a.at.x, y: frame.y + a.at.y } : a.at;
    if (!at) {
      const f = frame ?? s.doc.frames.find((x) => x.id === s.session.frameId) ?? s.doc.frames[0];
      if (!f) throw new OpError("invalid_value", "There is no screen to put it on: add a screen first, or give `at`.");
      const size = sizeOf(item, ctx.widths);
      at = spotOn(s, f, size, ctx.widths);
    }
    const dropped = landNewPart(s, item, at.x, at.y, () => false, ctx.widths, groupId);
    const landed = a.at ? dropped : onItsEdge(s, dropped, ctx.widths);
    if (roleOf(item) === "backdrop") {
      /* a scene is its screen's picture: it fills the screen, behind everything on it */
      const on = a.backdrop?.screen !== undefined ? s.doc.frames.find((f) => f.id === a.backdrop!.screen) : frame;
      const placed = onScreenAsBackdrop(landed, on, s.doc.frames, a.backdrop?.x ?? at.x, a.backdrop?.y ?? at.y);
      return done(withGroups(s, [placed, ...s.doc.groups]));
    }
    const groups = underWhatItHolds([...s.doc.groups, landed], landed.id, ctx.widths);
    return done(ctx.origin === "user" ? withGroups(s, groups) : laidOut(withGroups(s, groups), ctx.widths));
  },
});

export type AddKitArgs = {
  slug: string;
  /** one of the kit's variants; the one the style calls for when left out */
  variant?: string;
  screen?: string;
  /** where its top left lands (from the screen's top left with `screen`, else on the canvas) */
  at?: { x: number; y: number };
  into?: { container: string; index?: number };
  /** the kit as it was built when a drag picked it up, its top left at 0,0: what the editor's drag carries */
  built?: Group[];
};

/** A kit's groups for the document as it is: in the variant asked for or the one its style calls for, in the editor's
 *  language, no wider than a phone's content. */
export function buildKit(s: CoreState, slug: string, variant: string | undefined, screen: Frame | undefined, lang: Lang): Group[] | null {
  const kit = kitBySlug(slug);
  return kit ? kitGroups(kit, kitLookOf(s.doc.theme), lang, { variant, screen, theme: s.doc.theme }) : null;
}

/** A kit put down as the tree of atoms it is: inside the screen under it, brought to that screen's width, taken into
 *  the layout it was let go in; a bar goes straight to its edge. Selected as one: its outermost box. */
export const addKit = op<AddKitArgs, { itemId: string; groupId: string }>({
  name: "add_kit",
  summary: "Adds a kit: a composite made of atoms in nested auto layouts (search bar, list row, prompt box…), composed the way the style composes it; a bar goes to its edge of the screen.",
  args: S.obj(
    {
      slug: S.str("the kit, as the kit catalog names it"),
      variant: S.str("one of its variants (the style's choice when left out)"),
      screen: S.str(),
      at: S.point("where its top left lands, from the screen's top left"),
      into: S.obj({ container: S.str(), index: S.int() }, ["container"]),
      built: S.arr(S.any()),
    },
    ["slug"],
  ),
  label: (a) => `Add ${a.slug}`,
  run(s, a, ctx) {
    const def = kitBySlug(a.slug);
    if (!def) throw new OpError("not_found", `There is no kit "${a.slug}". The kit catalog lists every slug.`, a.slug);
    if (a.variant !== undefined && !def.variants.some((v) => v.key === a.variant)) throw new OpError("invalid_value", `The kit ${a.slug} has no variant "${a.variant}" (${def.variants.map((v) => v.key).join(", ")}).`, a.variant);
    const frames = s.doc.frames;
    const frame = a.screen !== undefined ? frameById(s, a.screen) : undefined;
    const built = a.built ?? buildKit(s, a.slug, a.variant, frame ?? frames[0], ctx.lang);
    if (!built?.length) throw new OpError("nothing_to_do", "The kit came out empty.", a.slug);
    const root = built[0];
    const select = (state: CoreState, groupId: string) => {
      const itemId = state.doc.groups.find((g) => g.id === groupId)?.items[0]?.id ?? root.items[0].id;
      return { state: withSession(state, { selection: [itemId], frameId: null }), result: { itemId, groupId } };
    };
    if (a.into) {
      const host = groupById(s, a.into.container);
      const placed = moveTo(built, { x: host.x, y: host.y });
      const rest = placed.slice(1);
      const withRoot = intoFlow(s.doc.groups, placed[0], host.id, a.into.index);
      const at = withRoot.findIndex((g) => g.id === placed[0].id);
      return select(laidOut(withGroups(s, [...withRoot.slice(0, at + 1), ...rest, ...withRoot.slice(at + 1)]), { ...ctx.widths, ...defaultMeasures(placed) }), placed[0].id);
    }
    let x: number;
    let y: number;
    if (a.at) {
      x = (frame?.x ?? 0) + a.at.x;
      y = (frame?.y ?? 0) + a.at.y;
    } else {
      const f = frame ?? frames.find((o) => o.id === s.session.frameId) ?? frames[0];
      if (!f) throw new OpError("invalid_value", "There is no screen to put it on: add a screen first, or give `at`.");
      ({ x, y } = spotOn(s, f, treeSize(built), ctx.widths));
    }
    const size = treeSize(built);
    const under = frames.find((f) => {
      const r = frameRect(f);
      return x + size.w / 2 >= r.l && x + size.w / 2 <= r.r && y + size.h / 2 >= r.t && y + size.h / 2 <= r.b;
    });
    /* a kit carried onto a screen of another width is laid out again for that one */
    const first = frames[0];
    const fresh = under && first && frameSizeOf(under).w !== frameSizeOf(first).w ? buildKit(s, a.slug, a.variant, under, ctx.lang) : null;
    const edge = spansScreen(def, kitLookOf(s.doc.theme), a.variant);
    /* a bar (a box pinned to an edge) goes straight to its edge, beside the rails and past the bars already there */
    const { groups: landed } = landTree(fresh ?? built, x, y, frames, edge, { groups: s.doc.groups, widths: ctx.widths, margin: metricsOf(s.doc.theme).margin });
    if (!landed.length) throw new OpError("nothing_to_do", "The kit came out empty.", a.slug);
    const top = landed[0];
    const groups = settleInFlow([...s.doc.groups, ...landed], top.id, { ...ctx.widths, ...defaultMeasures(landed) });
    const state = withGroups(s, groups);
    return select(ctx.origin === "user" ? state : laidOut(state, { ...ctx.widths, ...defaultMeasures(landed) }), top.id);
  },
});

export type AddInstanceArgs ={ component: string; id?: string; groupId?: string; screen?: string; at?: { x: number; y: number }; into?: { container: string; index?: number } };

export const addInstance = op<AddInstanceArgs, { itemId: string; groupId: string }>({
  name: "add_instance",
  summary: "Adds an instance of a reusable component: at a point on a screen, into a container's auto layout, or where there is room.",
  args: S.obj(
    {
      component: S.str("the component's id"),
      id: S.str(),
      groupId: S.str(),
      screen: S.str(),
      at: S.point("its top left, from the screen's top left"),
      into: S.obj({ container: S.str(), index: S.int() }, ["container"]),
    },
    ["component"],
  ),
  label: () => "Add instance",
  run(s, a, ctx) {
    const def = componentById(s, a.component);
    if (!canNest(s.doc.components, s.editing?.id ?? null, def.id)) throw new OpError("refused", "A component cannot go inside itself.", def.id);
    const groupId = freshId(s, a.groupId, ctx.newId);
    const made = standIn(def, 0, 0, groupId);
    const id = freshId(s, a.id, ctx.newId);
    const item: Item = { ...made.items[0], id };
    const done = (state: CoreState) => ({ state: withSession(state, { selection: [id], frameId: null }), result: { itemId: id, groupId } });
    if (a.into) {
      const host = groupById(s, a.into.container);
      return done(laidOut(withGroups(s, intoFlow(s.doc.groups, { ...made, items: [item] }, host.id, a.into.index)), ctx.widths));
    }
    const frame = a.screen !== undefined ? frameById(s, a.screen) : undefined;
    let at = a.at && frame ? { x: frame.x + a.at.x, y: frame.y + a.at.y } : a.at;
    if (!at) {
      const f = frame ?? s.doc.frames[0];
      if (!f) throw new OpError("invalid_value", "There is no screen to put it on.");
      at = spotOn(s, f, { w: def.w, h: def.h }, ctx.widths);
    }
    const landed = { ...landNewPart(s, item, at.x, at.y, () => false, ctx.widths, groupId), instanceOf: def.id };
    const groups = underWhatItHolds([...s.doc.groups, landed], landed.id, ctx.widths);
    return done(ctx.origin === "user" ? withGroups(s, groups) : laidOut(withGroups(s, groups), ctx.widths));
  },
});

export type DropPartArgs = {
  /** the part carried: from the palette, or taken out of the canvas when the drag began */
  item: Item;
  x: number;
  y: number;
  /** the axes a guide held, which keep their whole pixel */
  heldX?: boolean;
  heldY?: boolean;
  /** Ctrl held: it lands where it is let go, joining nothing */
  loose?: boolean;
  /** it lands as an instance of this definition */
  instanceOf?: string;
  /** where the pointer was let go, for a scene */
  pointer: { x: number; y: number };
};

/** A part let go on the canvas: on the 4dp grid of the screen under it, joined to a button it was let go against, or
 *  into the layout it was let go in. What the editor's drag does when the pointer comes up. */
export const dropPart = op<DropPartArgs, { itemId: string; joined: boolean }>({
  name: "drop_part",
  summary: "Lands a part carried by a pointer where it was let go (the editor's drag and drop).",
  args: S.obj({ item: S.any(), x: S.num(), y: S.num(), heldX: S.bool(), heldY: S.bool(), loose: S.bool(), instanceOf: S.str(), pointer: S.point() }, ["item", "x", "y", "pointer"]),
  label: () => "Drop",
  run(s, a, ctx) {
    const { item } = a;
    const landed = landNewPart(s, item, a.x, a.y, (axis) => !!a.loose || (axis === "x" ? !!a.heldX : !!a.heldY), ctx.widths, ctx.newId());
    const ng: Group = a.instanceOf ? { ...landed, instanceOf: a.instanceOf } : landed;
    const groups = s.doc.groups;
    const has = (gs: Group[]) => gs.some((g) => g.items.some((it) => it.id === item.id));
    const joined = a.loose || a.instanceOf ? null : joinDropped([...groups.filter((g) => !g.items.some((it) => it.id === item.id)), ng], ng.id, ctx.widths);
    if (joined) return { state: withGroups(s, joined.groups), result: { itemId: joined.itemId, joined: true } };
    if (roleOf(item) === "backdrop") {
      /* a scene dropped on a screen is that screen's picture */
      const placed = onScreenAsBackdrop(ng, undefined, s.doc.frames, a.pointer.x, a.pointer.y);
      return { state: withGroups(s, has(groups) ? groups.map((g) => (g.id === ng.id ? placed : g)) : [placed, ...groups]), result: { itemId: item.id, joined: false } };
    }
    const next = has(groups) ? groups : settleInFlow(underWhatItHolds([...groups, ng], ng.id, ctx.widths), ng.id, ctx.widths);
    return { state: withGroups(s, next), result: { itemId: item.id, joined: false } };
  },
});

/** A group carried whole (a container with what it holds, an instance, a hand-made group) let go where it stands
 *  now: against a button it joins it, in a layout it takes its place there, over parts it goes behind them. */
export const settleGroup = op<{ id: string; loose?: boolean }, { itemId?: string; joined: boolean }>({
  name: "settle_group",
  summary: "Settles a group moved by a drag where it was let go: joining a button, entering the layout under it, or going behind what it now holds.",
  args: S.obj({ id: S.str(), loose: S.bool() }, ["id"]),
  label: () => "Move",
  run(s, a, ctx) {
    const joined = a.loose ? null : joinDropped(s.doc.groups, a.id, ctx.widths);
    if (joined) return { state: withGroups(s, joined.groups), result: { itemId: joined.itemId, joined: true } };
    return { state: withGroups(s, settleInFlow(underWhatItHolds(s.doc.groups, a.id, ctx.widths), a.id, ctx.widths)), result: { joined: false } };
  },
});

/* ---------- removing ---------- */

/** Removes parts. A part taken out of a run leaves the run where it was; a locked group keeps its parts. */
export const removeNodes = op<{ ids: string[] }, { kept: boolean; panesKept?: boolean }>({
  name: "remove_nodes",
  summary: "Removes parts from the canvas (what a container holds stays where it is). Parts in a locked group are kept, and so is a split view's pane (it goes with its split view).",
  args: S.obj({ ids: S.arr(S.str(), "the parts' ids", { minItems: 1 }) }, ["ids"]),
  label: () => "Delete",
  run(s, a, ctx) {
    const groups = s.doc.groups;
    /* a pane goes with its split view, never by itself: it is kept, as a locked group's parts are */
    const panes = paneGroups(groups);
    const asked = new Set(a.ids);
    const ids = new Set([...asked].filter((id) => !groups.some((g) => panes.has(g.id) && g.items.some((it) => it.id === id))));
    if (asked.size && !ids.size) refusePanes(s, asked, "removed");
    if (groups.every((g) => g.locked || !g.items.some((it) => ids.has(it.id)))) {
      if (groups.some((g) => g.items.some((it) => ids.has(it.id)))) throw new OpError("locked", "Every one of those parts is in a locked group.");
      throw new OpError("not_found", `There is no part ${[...ids].map((x) => JSON.stringify(x)).join(", ")} on the canvas.`);
    }
    const panesKept = ids.size < asked.size;
    const kept = panesKept || groups.some((g) => g.locked && g.items.some((it) => ids.has(it.id)));
    const next = groups
      .map((g) => {
        /* Delete / Backspace leaves a locked group and its parts alone */
        if (g.locked) return g;
        if (g.free) return collapseFree({ ...g, items: g.items.filter((it) => !ids.has(it.id)) }, ctx.widths);
        let x = g.x;
        let y = g.y;
        let items = g.items;
        while (items.length && ids.has(items[0].id)) {
          const sz = sizeOf(items[0], ctx.widths);
          if (g.axis === "x") x += sz.w + GAP;
          else y += sz.h + GAP;
          items = items.slice(1);
        }
        return { ...g, x, y, items: items.filter((it) => !ids.has(it.id)) };
      })
      .filter((g) => g.items.length > 0);
    const state = withSession(withGroups(s, next), { selection: [] });
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths), result: { kept, ...(panesKept ? { panesKept } : {}) } };
  },
});

/** Removes whole groups, with nothing left of them: what a drag onto the parts panel does. */
export const removeGroups = op<{ ids: string[] }>({
  name: "remove_groups",
  summary: "Removes whole groups by their ids.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }) }, ["ids"]),
  label: () => "Delete",
  run(s, a) {
    const gone = new Set(a.ids);
    return { state: withSession(withGroups(s, s.doc.groups.filter((x) => !gone.has(x.id))), { selection: [] }) };
  },
});

/* ---------- copies ---------- */

/** Duplicates parts a step aside, with what each holds, and selects the copies. */
export const duplicateNodes = op<{ ids: string[]; primary?: string; dx?: number; dy?: number }, { ids: string[] }>({
  name: "duplicate_nodes",
  summary: "Duplicates parts (a container with what it holds) a step aside and selects the copies.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }), primary: S.str("the part whose copy the panel shows"), dx: S.num(), dy: S.num() }, ["ids"]),
  label: () => "Duplicate",
  run(s, a, ctx) {
    /* a pane comes with a copy of its split view; on its own it would be a third pane */
    const panes = paneGroups(s.doc.groups);
    const chosen = selectionUnits(s.doc.groups, new Set(a.ids), ctx.widths);
    const units = chosen.filter((u) => !panes.has(u.id) || !chosen.some((o) => o.id === s.doc.groups.find((g) => g.id === u.id)?.inFlow));
    if (units.some((u) => panes.has(u.id))) refusePanes(s, units.filter((u) => panes.has(u.id)).map((u) => u.id), "duplicated");
    if (!units.length) throw new OpError("not_found", "None of those parts is on the canvas.");
    const whole = withHeld(units, s.doc.groups, ctx.widths);
    const copies = rekeyedAll(whole, a.dx ?? 24, a.dy ?? 24);
    const primaryAt = units.flatMap((u) => u.items.map((it) => it.id)).indexOf(a.primary ?? "");
    const ids = copiedIds(copies.filter((_, i) => units.includes(whole[i])), primaryAt);
    const state = withSession(withGroups(s, [...s.doc.groups, ...copies]), { selection: ids });
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths), result: { ids } };
  },
});

/** what a copy keeps: the units with what they hold, the ones selected, and where they stood on their screen */
export type Clip = { groups: Group[]; top: Set<string>; dx: number; dy: number; frameId: string | null; primaryAt: number };

/** The selection as the in-app clipboard keeps it: whole groups where the selection covers them, with their offset
 *  inside their screen, so a paste can put them at the same spot on another screen, or a step aside on the same one. */
export function clipOf(s: CoreState, ids: string[], primary: string, widths: Widths): Clip | null {
  const g = groupOfItem(s.doc.groups, primary);
  if (!g) return null;
  const groups = selectionUnits(s.doc.groups, new Set(ids), widths);
  if (!groups.length) return null;
  const x = Math.min(...groups.map((u) => u.x));
  const y = Math.min(...groups.map((u) => u.y));
  /* a selection on no screen keeps its canvas position; one on a screen keeps its offset there */
  const f = frameOfGroup(g, s.doc.frames, widths);
  const primaryAt = groups.flatMap((u) => u.items.map((it) => it.id)).indexOf(primary);
  return { groups: withHeld(groups, s.doc.groups, widths), top: new Set(groups.map((u) => u.id)), dx: f ? x - f.x : x, dy: f ? y - f.y : y, frameId: f?.id ?? null, primaryAt };
}

/** Pastes a clip: on the selected screen, else the selection's, else the one it was copied from, at the same spot
 *  there; onto a spot already taken it steps aside like a duplicate. */
export const pasteClip = op<{ clip: Clip; selected?: string }, { ids: string[] }>({
  name: "paste",
  summary: "Pastes what was copied.",
  args: S.obj({ clip: S.any(), selected: S.str() }, ["clip"]),
  label: () => "Paste",
  run(s, a, ctx) {
    const { clip } = a;
    /* pasted into a definition, an instance must not put that definition inside itself */
    const host = s.editing?.id ?? null;
    if (clip.groups.some((g) => g.instanceOf && !canNest(s.doc.components, host, g.instanceOf))) throw new OpError("refused", "A component cannot go inside itself.");
    const fs = s.doc.frames;
    let target = s.session.frameId ? fs.find((f) => f.id === s.session.frameId) : undefined;
    if (!target && a.selected) {
      const g = groupOfItem(s.doc.groups, a.selected);
      if (g) target = frameOfGroup(g, fs, ctx.widths) ?? undefined;
    }
    if (!target) target = fs.find((f) => f.id === clip.frameId);
    const x0 = Math.min(...clip.groups.map((u) => u.x));
    const y0 = Math.min(...clip.groups.map((u) => u.y));
    let dx = target && clip.frameId ? target.x + clip.dx - x0 : 0;
    let dy = target && clip.frameId ? target.y + clip.dy - y0 : 0;
    const taken = new Set([...s.doc.groups.map((g) => `${g.x},${g.y}`), ...itemRects(s.doc.groups, ctx.widths).map((r) => `${r.l},${r.t}`)]);
    while (clip.groups.some((u) => taken.has(`${u.x + dx},${u.y + dy}`))) {
      dx += 24;
      dy += 24;
    }
    /* a copy whose layout stayed behind on another screen no longer stands loose in it */
    const copies = loosenedCopies(rekeyedAll(clip.groups, dx, dy, !target || target.id === clip.frameId));
    const ids = copiedIds(copies.filter((_, i) => clip.top.has(clip.groups[i].id)), clip.primaryAt);
    return { state: withSession(withGroups(s, [...s.doc.groups, ...copies]), { selection: ids, frameId: null }), result: { ids } };
  },
});

/* ---------- a part's own fields ---------- */

/** Changes a part's own fields (props, colors, corners, look, note, tap, layout in its container…). A locked part is
 *  not changed. A rail's state resizes it, and the body beside it follows. */
export const setItem = op<{ id: string; patch: Partial<Item> }>({
  name: "set_item",
  summary: "Changes a part's own fields: props, fill, textColor, corners, look, note, action/actions, bind, and how it sits in an auto layout (flowSize, alignSelf, flowAbsolute, flowMin, flowMax, flowSpan).",
  args: S.obj({ id: S.str("the part's id"), patch: S.any("the fields to set; a field set to null is cleared") }, ["id", "patch"]),
  label: () => "Edit",
  run(s, a, ctx) {
    const { group, item } = itemById(s, a.id);
    unlocked(group, "That part");
    let patch = a.patch as Record<string, unknown>;
    if (ctx.strict) {
      patch = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v]));
      for (const k of ["id", "kind", "component"]) if (k in patch) throw new OpError("invalid_value", `A part's ${k} cannot change.`, k);
      checkItemPatch(item, patch, s);
      if ("look" in patch) patch = { ...patch, look: cleanedLook(patch.look) };
    }
    const railProps = item.component === "navigation-rail" && "props" in patch && ((patch.props as Item["props"])?.expanded !== item.props?.expanded || (patch.props as Item["props"])?.narrow !== item.props?.narrow);
    /* a look with nothing left in it is no look: the part goes back to having none, not an empty one */
    if ("look" in patch) patch = { ...patch, look: tidyLook(patch.look as Item["look"]) };
    const p = patch as Partial<Item>;
    let groups = railProps ? updateRail(s.doc.groups, s.doc.frames, ctx.widths, a.id, p) : s.doc.groups.map((g) => (g.items.some((it) => it.id === a.id) ? { ...g, items: g.items.map((it) => (it.id === a.id ? { ...it, ...p } : it)) } : g));
    /* a box with no auto layout changing size places what it holds by their constraints */
    if ("props" in p && group.items.length === 1 && holdsFreely(group)) {
      const bases = constrainedIn(group, s.doc.groups, ctx.widths);
      if (bases.length) groups = withConstraints(groups, bases, boxWithProps(group, item, ctx.widths), boxWithProps(group, { ...item, ...p }, ctx.widths));
    }
    const state = withGroups(s, groups);
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths) };
  },
});

/** Sets props of a part over what it has; a prop set to null goes back to its default. */
export const setProps = op<{ id: string; props: Record<string, unknown> }>({
  name: "set_props",
  summary: "Sets prop values of a part (checked against its PropDefs); null resets one to its default. A list's rows given again in another order take their taps (slot \"tab:N\") and the part's choice with them, as set_rows does.",
  args: S.obj({ id: S.str(), props: S.any() }, ["id", "props"]),
  label: () => "Edit",
  run(s, a, ctx) {
    const { item } = itemById(s, a.id);
    const def = partBySlug(item.component);
    if (!def) throw new OpError("invalid_value", `${item.component} is not a known part.`, a.id);
    const set = Object.fromEntries(Object.entries(a.props).filter(([, v]) => v !== null));
    if (ctx.strict) checkProps(def, set, s);
    const cleared = Object.entries(a.props).flatMap(([k, v]) => (v === null ? [k] : []));
    /* rows given again in another order take their taps and the part's choice with them, as set_rows does */
    return setItem.run(s, { id: a.id, patch: propsPatch(item, set, cleared) }, { ...ctx, strict: false });
  },
});

/** A group's own fields: its name in the layers, hidden at the start of the preview, locked, shown only while a
 *  condition holds, the tab of a dock it is on. A field set to null is cleared. */
export type GroupPatch = { name?: string | null; hidden?: boolean | null; locked?: boolean | null; showWhen?: Condition | null; pane?: number | null };

export const setGroup = op<{ id: string; patch: GroupPatch }>({
  name: "set_group",
  summary: "Sets a group's fields (by the group's or one of its parts' id): name, hidden (at the start of the preview), locked, showWhen (a condition), pane. null clears one.",
  args: S.obj(
    {
      id: S.str("the group's id, or the id of a part in it"),
      patch: S.obj({ name: { type: ["string", "null"] }, hidden: { type: ["boolean", "null"] }, locked: { type: ["boolean", "null"] }, showWhen: { type: ["object", "null"] }, pane: { type: ["integer", "null"] } }),
    },
    ["id", "patch"],
  ),
  label: () => "Edit",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    if (ctx.strict) {
      const p = a.patch;
      if (p.name !== undefined && p.name !== null && typeof p.name !== "string") throw new OpError("invalid_value", "name should be text.", "name");
      if (p.showWhen) {
        const e = conditionError(p.showWhen, s);
        if (e) throw new OpError("invalid_value", `showWhen: ${e}.`, "showWhen");
      }
      if (g.locked && Object.keys(p).some((k) => k !== "locked")) unlocked(g, "That group");
    }
    const next = { ...g } as Record<string, unknown>;
    for (const [k, v] of Object.entries(a.patch)) {
      if (v === null) delete next[k];
      /* a condition's value is written as what it is compared as (lib/converge.ts) */
      else next[k] = k === "showWhen" && v && typeof v === "object" ? conditionValue(s.doc.vars)(v as Record<string, unknown>) : v;
    }
    return { state: withGroups(s, s.doc.groups.map((x) => (x.id === g.id ? (next as unknown as Group) : x))) };
  },
});

/** Locks every group holding one of the parts, or unlocks them all when they already are. */
export const toggleLock = op<{ ids: string[] }, { locked: boolean }>({
  name: "toggle_lock",
  summary: "Locks the groups of the given parts, or unlocks them when all already are.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }) }, ["ids"]),
  label: () => "Lock",
  run(s, a) {
    const ids = new Set(a.ids);
    const held = s.doc.groups.filter((g) => g.items.some((it) => ids.has(it.id)));
    if (!held.length) throw new OpError("not_found", "None of those parts is on the canvas.");
    const next = !held.every((g) => !!g.locked);
    return { state: withGroups(s, s.doc.groups.map((g) => (g.items.some((it) => ids.has(it.id)) ? { ...g, locked: next || undefined } : g))), result: { locked: next } };
  },
});

/* ---------- moving ---------- */

/** Moves parts by a step, with what each holds; or, with `screen`, a screen with everything on it. A layout places
 *  what it holds, all but what stands loose in it, and a locked group stays. */
export const nudge = op<{ ids?: string[]; screen?: string; dx: number; dy: number }, { moved: string[] }>({
  name: "nudge",
  summary: "Moves parts (or a screen with everything on it) by dx, dy.",
  args: S.obj({ ids: S.arr(S.str()), screen: S.str(), dx: S.num(), dy: S.num() }, ["dx", "dy"]),
  label: () => "Move",
  run(s, a, ctx) {
    if (a.screen !== undefined) {
      const f = frameById(s, a.screen);
      const carried = new Set(s.doc.groups.filter((g) => frameOfGroup(g, s.doc.frames, ctx.widths)?.id === f.id).map((g) => g.id));
      return {
        state: { ...s, doc: { ...s.doc, frames: s.doc.frames.map((x) => (x.id === f.id ? { ...x, x: x.x + a.dx, y: x.y + a.dy } : x)), groups: s.doc.groups.map((g) => (carried.has(g.id) ? { ...g, x: g.x + a.dx, y: g.y + a.dy } : g)) } },
        result: { moved: [...carried] },
      };
    }
    const ids = new Set(a.ids ?? []);
    const groups = s.doc.groups;
    const moving = new Set(
      groups
        /* a layout places what it holds, all but what stands loose in it */
        .filter((g) => !g.locked && (!g.inFlow || (g.items.length === 1 && childLayoutOf(g.items[0]).absolute)) && g.items.some((it) => ids.has(it.id)))
        /* a container takes what it holds along */
        .flatMap((g) => [g, ...heldBy(g, groups, ctx.widths)])
        .map((g) => g.id),
    );
    if (moving.size === 0) throw new OpError("nothing_to_do", "Nothing there can move: it is locked, or a layout places it.");
    return { state: withGroups(s, groups.map((g) => (moving.has(g.id) ? { ...g, x: g.x + a.dx, y: g.y + a.dy } : g))), result: { moved: [...moving] } };
  },
});

/** Moves a part (with what it holds) so its top left is at a point: out of the layout it was in, behind what it now
 *  stands over when it is a container. */
export const moveNode = op<{ id: string; x: number; y: number; screen?: string }>({
  name: "move_node",
  summary: "Moves a part, with what it holds, so its top left is at x, y (from the screen's top left with `screen`); it leaves any auto layout it was in.",
  args: S.obj({ id: S.str(), x: S.num(), y: S.num(), screen: S.str("the screen x and y are measured from") }, ["id", "x", "y"]),
  label: () => "Move",
  run(s, a, ctx) {
    refusePanes(s, [a.id], "moved");
    const g = unlocked(groupById(s, a.id), "That part");
    const f = a.screen !== undefined ? frameById(s, a.screen) : undefined;
    const b = groupBounds(g, ctx.widths);
    const dx = Math.round((f ? f.x : 0) + a.x - b.l);
    const dy = Math.round((f ? f.y : 0) + a.y - b.t);
    const held = new Set(heldBy(g, s.doc.groups, ctx.widths).map((x) => x.id));
    let groups = s.doc.groups.map((x) => {
      if (x.id === g.id) {
        const { inFlow: _left, ...rest } = x;
        return inRun({ ...rest, x: x.x + dx, y: x.y + dy } as Group);
      }
      return held.has(x.id) ? { ...x, x: x.x + dx, y: x.y + dy } : x;
    });
    groups = underWhatItHolds(groups, g.id, ctx.widths);
    return { state: laidOut(withGroups(s, groups), ctx.widths) };
  },
});

/** Puts a part into a container's auto layout, at a place in its run (or moves it along the run it is in). */
export const moveInto = op<{ id: string; container: string; index?: number }>({
  name: "move_into",
  summary: "Puts a part (with what it holds) into a container's auto layout at a place in its run; index 0 is first, the end when left out.",
  args: S.obj({ id: S.str(), container: S.str(), index: S.int() }, ["id", "container"]),
  label: () => "Move",
  run(s, a, ctx) {
    refusePanes(s, [a.id], "moved");
    const g = unlocked(groupById(s, a.id), "That part");
    const host = groupById(s, a.container);
    if (host.id === g.id || heldBy(g, s.doc.groups, ctx.widths).some((x) => x.id === host.id)) throw new OpError("refused", "A part cannot go inside itself.", a.container);
    /* what it holds through its own layout comes along, in its order, right behind it */
    const inside = flowSubtree(s.doc.groups, g.id);
    const carried = s.doc.groups.filter((x) => inside.has(x.id));
    const rest = s.doc.groups.filter((x) => !inside.has(x.id));
    const placed = intoFlow(rest, g, host.id, a.index);
    const at = placed.findIndex((x) => x.id === g.id);
    return { state: laidOut(withGroups(s, [...placed.slice(0, at + 1), ...carried, ...placed.slice(at + 1)]), ctx.widths) };
  },
});

/** One step forward or back in what is drawn over what (in a layout, along its run); or all the way. */
export const zOrder = op<{ ids: string[]; to: "forward" | "backward" | "front" | "back" }>({
  name: "z_order",
  summary: "Moves parts forward or backward in what is drawn over what, one step or all the way (front/back); in an auto layout this moves them along its run.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }), to: S.enum(["forward", "backward", "front", "back"]) }, ["ids", "to"]),
  label: () => "Arrange",
  run(s, a, ctx) {
    const ids = new Set(a.ids);
    const units = new Set(s.doc.groups.filter((g) => g.items.some((it) => ids.has(it.id)) || ids.has(g.id)).map((g) => g.id));
    if (!units.size) throw new OpError("not_found", "None of those parts is on the canvas.");
    const dir = a.to === "forward" || a.to === "front" ? 1 : -1;
    let groups = s.doc.groups;
    for (let i = 0; i < (a.to === "front" || a.to === "back" ? 500 : 1); i++) {
      const all = groups;
      const next = stepLayers(all, units, dir, ctx.widths, (g) => frameOfPart(g, all, s.doc.frames, ctx.widths)?.id);
      if (next === all) break;
      groups = next;
    }
    if (groups === s.doc.groups) throw new OpError("nothing_to_do", "They are as far as they go.");
    const state = withGroups(s, groups);
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths) };
  },
});

/** The layers of a screen in a new order, top first: what the layers panel's drag does. */
export const reorderLayers = op<{ order: string[] }>({
  name: "reorder_layers",
  summary: "Puts the groups of one screen in a new order, top first.",
  args: S.obj({ order: S.arr(S.str(), "group ids, the one drawn on top first", { minItems: 1 }) }, ["order"]),
  label: () => "Reorder layers",
  run(s, a) {
    const inFrame = new Set(a.order);
    const byId = new Map(s.doc.groups.map((g) => [g.id, g]));
    const ordered = [...a.order].reverse().map((id) => byId.get(id)).filter((g): g is Group => !!g);
    if (ordered.length !== inFrame.size) throw new OpError("not_found", "Some of those groups are not on the canvas.");
    return { state: withGroups(s, [...s.doc.groups.filter((g) => !inFrame.has(g.id)), ...ordered]) };
  },
});

/** The parts of one group in a new order: reading order for a run, back to front for a hand-made group. */
export const reorderItems = op<{ group: string; order: string[] }>({
  name: "reorder_items",
  summary: "Puts the parts of one group in a new order.",
  args: S.obj({ group: S.str(), order: S.arr(S.str()) }, ["group", "order"]),
  label: () => "Reorder",
  run(s, a) {
    const g = s.doc.groups.find((x) => x.id === a.group);
    if (!g) throw new OpError("not_found", `There is no group ${JSON.stringify(a.group)}.`, a.group);
    if (g.locked) throw new OpError("locked", "That group is locked.", a.group);
    const byId = new Map(g.items.map((it) => [it.id, it]));
    const items = a.order.map((id) => byId.get(id)).filter((it): it is Item => !!it);
    if (items.length !== g.items.length || new Set(a.order).size !== a.order.length) throw new OpError("invalid_value", "The order has to name every part of the group once.");
    return { state: withGroups(s, s.doc.groups.map((x) => (x.id === a.group ? { ...x, items } : x))) };
  },
});

/** A dock comes round to the tab the given parts are on, so they can be seen and worked on. */
export const showNodes = op<{ ids: string[] }>({
  name: "show_nodes",
  summary: "Turns the docks that hold the given parts to the tab they are on.",
  args: S.obj({ ids: S.arr(S.str()) }, ["ids"]),
  label: () => "Show",
  run(s, a, ctx) {
    const picked = new Set(s.doc.groups.filter((g) => g.items.some((it) => a.ids.includes(it.id))).map((g) => g.id));
    const showing = showingGroups(s.doc.groups, picked, ctx.widths);
    if (showing === s.doc.groups) throw new OpError("nothing_to_do", "They are showing already.");
    return { state: withGroups(s, showing) };
  },
});

/** whether a part stands on a dock's other tab */
export const isOffTab = (s: CoreState, groupId: string, widths: Widths) => outOfPane(s.doc.groups, widths).has(groupId);

/* ---------- groups ---------- */

/** Pulls parts out of their runs into one hand-made group that keeps their positions, in the layer slot of the
 *  topmost run involved. */
export const groupNodes = op<{ ids: string[]; id?: string }, { ids: string[]; groupId: string }>({
  name: "group_nodes",
  summary: "Groups two or more parts into one hand-made group that keeps where they stand (not an auto layout: use wrap_in_auto_layout for that).",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 2 }), id: S.str() }, ["ids"]),
  label: () => "Group",
  run(s, a, ctx) {
    const ids = new Set(a.ids);
    if (ids.size < 2) throw new OpError("nothing_to_do", "Grouping takes two parts or more.");
    refusePanes(s, ids, "grouped");
    const groups = s.doc.groups;
    /* regrouping would carry a locked group's parts into an unlocked group */
    if (groups.some((g) => g.locked && g.items.some((it) => ids.has(it.id)))) throw new OpError("locked", "Some of those parts are in a locked group.");
    /* a group keeps items and nothing else of the groups they came from: an instance or a repeat would be lost in it */
    if (groups.some((g) => (g.instanceOf || g.repeat) && g.items.some((it) => ids.has(it.id)))) throw new OpError("refused", "An instance or a repeated layout cannot be grouped: use an auto layout, or detach it first.");
    const rects = new Map(itemRects(groups, ctx.widths).map((r) => [r.id, r]));
    const picked: Item[] = [];
    let top = -1;
    groups.forEach((g, i) => {
      for (const it of g.items)
        if (ids.has(it.id)) {
          picked.push(it);
          top = i;
        }
    });
    if (picked.length < 2) throw new OpError("nothing_to_do", "Grouping takes two parts or more on the canvas.");
    const { l, t } = unionRect(picked.map((it) => rects.get(it.id)!));
    const pos: Record<string, { x: number; y: number }> = {};
    for (const it of picked) pos[it.id] = { x: rects.get(it.id)!.l - l, y: rects.get(it.id)!.t - t };
    const ng: Group = { id: a.id ?? ctx.newId(), x: l, y: t, axis: "x", items: picked, free: true, pos };
    const out: Group[] = [];
    groups.forEach((g, i) => {
      if (g.free) {
        const rest = g.items.filter((it) => !ids.has(it.id));
        if (rest.length) out.push(collapseFree({ ...g, items: rest }, ctx.widths));
      } else {
        let x = g.x;
        let y = g.y;
        let items = g.items;
        while (items.length && ids.has(items[0].id)) {
          const sz = sizeOf(items[0], ctx.widths);
          if (g.axis === "x") x += sz.w + GAP;
          else y += sz.h + GAP;
          items = items.slice(1);
        }
        items = items.filter((it) => !ids.has(it.id));
        if (items.length) out.push({ ...g, x, y, items });
      }
      if (i === top) out.push(ng);
    });
    const sel = picked.map((it) => it.id);
    return { state: withSession(withGroups(s, out), { selection: sel }), result: { ids: sel, groupId: ng.id } };
  },
});

/** A hand-made group back into single parts at their current positions, in the same layer slot. */
export const ungroup = op<{ id: string }, { ids: string[] }>({
  name: "ungroup",
  summary: "Splits a hand-made group back into single parts where they stand.",
  args: S.obj({ id: S.str("the group's id, or a part in it") }, ["id"]),
  label: () => "Ungroup",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    if (!g.free) throw new OpError("nothing_to_do", "That is not a hand-made group.", a.id);
    unlocked(g, "That group");
    const singles: Group[] = explodeGroup(g, ctx.widths).map((run) => ({ ...run, id: ctx.newId() }));
    return { state: withGroups(s, s.doc.groups.flatMap((x) => (x.id === g.id ? singles : [x]))), result: { ids: singles.map((x) => x.id) } };
  },
});
