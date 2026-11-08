/* Operations that lay parts out: a container's auto layout, Tidy for a screen and Tidy up for a selection, aligning
 * and spreading, nine spots in a screen's body, auto layout suggested from where parts stand, a composite split into
 * atoms, neighbouring buttons joined, and a style's layout put on every screen. */

import { partBySlug } from "../../../parts/registry";
import { FLOW_KEYS } from "../../../parts/flow";
import { roleOf } from "../../../parts/role";
import { alignParts, distributeParts, tidyUpParts, type AlignHow } from "../../align";
import { combineButtons } from "../../combine";
import { suggestAutoLayout, wrapInFlow } from "../../flow";
import { kitLookOf, splitIntoAtoms } from "../../kits";
import { layoutForStyle, metricsOf } from "../../styleLayout";
import { bodyRect, holdsEdgeBar, isScreenLayout, tidyFrame } from "../../tidy";
import { frameOfGroup, frameOfPart, frameRect, groupBounds, heldBy, type Group } from "../../tokens";
import { holdsFreely } from "../../constraints";
import { nudge } from "./nodes";
import { op, OpError, S } from "../op";
import { withGroups, withSession, type CoreState } from "../state";
import { frameById, itemById, laidOut, spacingScale } from "./common";
import { checkProps } from "./validate";
import { refusePanes } from "./split";

const changed = (s: CoreState, next: Group[] | null, what: string) => {
  if (!next) throw new OpError("nothing_to_do", what);
  return withGroups(s, next);
};

/** a container's auto layout: its direction, spacing, padding, alignment, distribution, wrapping, columns and hugging */
export const setLayout = op<{ id: string; layout?: "free" | "row" | "column" | "grid"; props?: Record<string, unknown> }>({
  name: "set_layout",
  summary:
    "Sets a container's auto layout: layout (free = off, row, column, grid) and its props: gap, gapY, padX, padY, padTop, padRight, padBottom, padLeft, align (start, center, end, stretch, baseline), justify (start, center, end, between, around, evenly), wrap, columns, hugWidth, hugHeight.",
  args: S.obj({ id: S.str("the container (a box)"), layout: S.enum(["free", "row", "column", "grid"]), props: S.any("the layout props to set") }, ["id"]),
  label: () => "Auto layout",
  run(s, a, ctx) {
    const { group, item } = itemById(s, a.id);
    const def = partBySlug(item.component);
    if (!def?.flow) throw new OpError("invalid_value", `${item.component} cannot lay out what it holds: use a box.`, a.id);
    const props = { ...(a.layout ? { layout: a.layout } : {}), ...a.props };
    for (const k of Object.keys(props)) if (!FLOW_KEYS.has(k) && ctx.strict) throw new OpError("invalid_value", `"${k}" is not a layout prop; set it with set_props.`, k);
    if (ctx.strict) checkProps(def, props, s);
    if (group.locked) throw new OpError("locked", "That part is locked.", a.id);
    const next = s.doc.groups.map((g) => (g.id === group.id ? { ...g, items: g.items.map((it) => (it.id === item.id ? { ...it, props: { ...it.props, ...props } } : it)) } : g));
    return { state: laidOut(withGroups(s, next), ctx.widths) };
  },
});

/** Tidy: a screen laid out by its structure, between its bars and margins */
export const tidyScreen = op<{ screen: string }, { before: Group[] }>({
  name: "tidy_screen",
  summary: "Tidies a screen: bars pinned, the body read as rows, columns and grids, spaced on the style's spacing scale.",
  args: S.obj({ screen: S.str() }, ["screen"]),
  label: () => "Tidy",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    const after = tidyFrame(s.doc.groups, f, s.doc.frames, ctx.widths, metricsOf(s.doc.theme));
    return { state: changed(s, after, "The screen is tidy already."), result: { before: s.doc.groups } };
  },
});

/** Tidy up (Figma's): the selected parts as an even row, column or grid, read off where they stand */
export const tidyUp = op<{ ids: string[] }>({
  name: "tidy_up",
  summary: "Arranges the given parts as an even row, column or grid read off where they stand, one gap each way; the top left stays.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 2 }) }, ["ids"]),
  label: () => "Tidy up",
  run(s, a, ctx) {
    return { state: changed(s, tidyUpParts(s.doc.groups, new Set(a.ids), ctx.widths, spacingScale(s)), "They are tidy already.") };
  },
});

export const align = op<{ ids: string[]; how: AlignHow }>({
  name: "align",
  summary: "Lines the given parts up against each other: left, centerH, right, top, centerV or bottom.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 2 }), how: S.enum(["left", "centerH", "right", "top", "centerV", "bottom"]) }, ["ids", "how"]),
  label: () => "Align",
  run(s, a, ctx) {
    return { state: changed(s, alignParts(s.doc.groups, new Set(a.ids), a.how, ctx.widths), "They are lined up already.") };
  },
});

/** the box a part stands in, for lining it up against: the smallest box with no auto layout that holds it, else its screen */
export function parentBoxOf(s: CoreState, g: Group, widths: Record<string, number>): { l: number; t: number; r: number; b: number } | null {
  const holders = s.doc.groups.filter((h) => h.id !== g.id && holdsFreely(h) && heldBy(h, s.doc.groups, widths).some((x) => x.id === g.id));
  const area = (h: Group) => {
    const b = groupBounds(h, widths);
    return (b.r - b.l) * (b.b - b.t);
  };
  const box = holders.sort((a, b) => area(a) - area(b))[0];
  if (box) return groupBounds(box, widths);
  const f = frameOfPart(g, s.doc.groups, s.doc.frames, widths);
  return f ? frameRect(f) : null;
}

/** One part lined up against the box it stands in, or its screen, as Figma's align buttons do for a single layer. */
export const alignToParent = op<{ id: string; how: AlignHow }>({
  name: "align_to_parent",
  summary: "Lines one part up against what it stands in: the box with no auto layout that holds it, else its screen (left, centerH, right, top, centerV, bottom). What it holds comes along.",
  args: S.obj({ id: S.str("the part"), how: S.enum(["left", "centerH", "right", "top", "centerV", "bottom"]) }, ["id", "how"]),
  label: () => "Align",
  run(s, a, ctx) {
    const { group } = itemById(s, a.id);
    if (group.inFlow && !(group.items.length === 1 && group.items[0].flowAbsolute)) throw new OpError("refused", "Its auto layout places it: set how it aligns in the layout instead.", a.id);
    const parent = parentBoxOf(s, group, ctx.widths);
    if (!parent) throw new OpError("refused", "It stands in nothing to line up against.", a.id);
    const b = groupBounds(group, ctx.widths);
    const dx = a.how === "left" ? parent.l - b.l : a.how === "right" ? parent.r - b.r : a.how === "centerH" ? (parent.l + parent.r) / 2 - (b.l + b.r) / 2 : 0;
    const dy = a.how === "top" ? parent.t - b.t : a.how === "bottom" ? parent.b - b.b : a.how === "centerV" ? (parent.t + parent.b) / 2 - (b.t + b.b) / 2 : 0;
    const mx = Math.round(dx);
    const my = Math.round(dy);
    if (!mx && !my) throw new OpError("nothing_to_do", "It is lined up there already.");
    return nudge.run(s, { ids: [a.id], dx: mx, dy: my }, ctx) as { state: CoreState };
  },
});

export const distribute = op<{ ids: string[]; axis: "x" | "y"; gap?: number }>({
  name: "distribute",
  summary: "Spreads the given parts out evenly along x or y; with gap, exactly that space between them.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 2 }), axis: S.enum(["x", "y"]), gap: S.num(undefined, { minimum: 0 }) }, ["ids", "axis"]),
  label: () => "Distribute",
  run(s, a, ctx) {
    return { state: changed(s, distributeParts(s.doc.groups, new Set(a.ids), a.axis, ctx.widths, a.gap), "They are spread evenly already.") };
  },
});

/** The parts in nested containers that keep them the way they stand: rows, columns and grids read off their places,
 *  as Figma suggests auto layout. A lone container takes the layout itself; a lone part goes in a row. */
export const autoLayout = op<{ ids: string[]; id?: string }, { itemId: string }>({
  name: "wrap_in_auto_layout",
  summary: "Puts the given parts into nested auto layout boxes that keep them where they stand (rows, columns, grids read off their places); one container takes a layout itself.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }), id: S.str("an id for the outermost new box (optional)") }, ["ids"]),
  label: () => "Auto layout",
  run(s, a, ctx) {
    const ids = new Set(a.ids);
    refusePanes(s, ids, "wrapped in another layout");
    const groupIds = new Set(s.doc.groups.filter((g) => g.items.some((it) => ids.has(it.id)) || ids.has(g.id)).map((g) => g.id));
    if (!groupIds.size) throw new OpError("not_found", "None of those parts is on the canvas.");
    if (a.id && s.doc.groups.some((g) => g.id === a.id || g.items.some((it) => it.id === a.id))) throw new OpError("invalid_value", `The id ${JSON.stringify(a.id)} is taken already.`, a.id);
    const made = suggestAutoLayout(s.doc.groups, groupIds, ctx.widths, ctx.newId, spacingScale(s)) ?? wrapInFlow(s.doc.groups, groupIds, ctx.newId(), ctx.widths);
    if (!made) throw new OpError("nothing_to_do", "Those parts cannot go into an auto layout.");
    /* the outermost new box by the id asked for: nothing refers to a part that new by its id */
    const itemId = a.id ?? made.itemId;
    const groups = a.id ? made.groups.map((g) => (g.items.some((it) => it.id === made.itemId) ? { ...g, items: g.items.map((it) => (it.id === made.itemId ? { ...it, id: itemId } : it)) } : g)) : made.groups;
    const state = withSession(withGroups(s, groups), { selection: [itemId] });
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths), result: { itemId } };
  },
});

/** The body of a screen in nested auto layouts: what stands at its edges (bars, a FAB, a dialog, a rail, its
 *  picture) and what is locked keep their places. */
export const autoLayoutScreen = op<{ screen: string }, { itemId: string }>({
  name: "auto_layout_screen",
  summary: "Turns a screen's body into nested auto layouts; bars, FABs, dialogs, rails, its picture and locked parts keep their places.",
  args: S.obj({ screen: S.str() }, ["screen"]),
  label: () => "Screen auto layout",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    const all = s.doc.groups;
    const pinned = new Set(["top", "bottom", "floatingBottom", "fab", "overlay", "rail", "backdrop"]);
    const body = all.filter((g) => !g.inFlow && !g.locked && !pinned.has(roleOf(g.items[0]) ?? "") && frameOfGroup(g, s.doc.frames, ctx.widths)?.id === f.id && !isScreenLayout(g, f, ctx.widths));
    const made = body.length > 1 ? suggestAutoLayout(all, new Set(body.map((g) => g.id)), ctx.widths, ctx.newId, spacingScale(s)) : null;
    if (!made) throw new OpError("nothing_to_do", "There is no structure on that screen to turn into an auto layout.");
    const state = withSession(withGroups(s, made.groups), { selection: [made.itemId], frameId: null });
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths), result: { itemId: made.itemId } };
  },
});

/** a composite replaced where it stands by the atoms it is made of, composed the way the document's look composes it */
export const split = op<{ id: string }, { rootItemId: string }>({
  name: "split_into_atoms",
  summary: "Replaces a composite part where it stands with the tree of atoms it is made of (boxes, text, icons…), composed the way the style composes it.",
  args: S.obj({ id: S.str("the item id of the one composite part to split (the outline and find_nodes give it)") }, ["id"]),
  label: () => "Split into atoms",
  run(s, a, ctx) {
    const { item } = itemById(s, a.id);
    if (!partBySlug(item.component)?.atoms) throw new OpError("refused", `${item.component} cannot be split into atoms.`, a.id);
    const out = splitIntoAtoms(s.doc.groups, a.id, ctx.lang, ctx.widths, kitLookOf(s.doc.theme));
    if (!out) throw new OpError("nothing_to_do", "That part cannot be split here.", a.id);
    const state = withSession(withGroups(s, out.groups), { selection: [out.rootItemId] });
    return { state: ctx.origin === "user" ? state : laidOut(state, ctx.widths), result: { rootItemId: out.rootItemId } };
  },
});

/** Puts parts at one of nine spots in their screen's body, as one block; a bar keeps to its edge, and what is already
 *  there is an obstacle the block slides past. */
export const placeInScreen = op<{ ids: string[]; col: "left" | "centerH" | "right"; row: "top" | "centerV" | "bottom" }>({
  name: "place_in_screen",
  summary: "Puts the given parts, as one block, at one of nine spots in their screen's body (between the bars, inside the margins), clear of what is there.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }), col: S.enum(["left", "centerH", "right"]), row: S.enum(["top", "centerV", "bottom"]) }, ["ids", "col", "row"]),
  label: () => "Place",
  run(s, a, ctx) {
    const ids = new Set(a.ids);
    const all = s.doc.groups;
    const widths = ctx.widths;
    const frames = s.doc.frames;
    /* a bar stays on the edge it belongs to, and the body it bounds is where the rest goes */
    const units = all.filter((x) => x.items.some((it) => ids.has(it.id)) && !holdsEdgeBar(x) && !x.inFlow);
    if (!units.length) throw new OpError("nothing_to_do", "Nothing there can be placed: bars keep to their edges and layouts place what they hold.");
    /* a locked group stays where it is, and the rest does not move without it */
    if (units.some((x) => x.locked)) throw new OpError("locked", "Some of those parts are locked.");
    const f = frameOfGroup(units[0], frames, widths);
    /* the block lines up inside one screen; parts spread over several have no one body to fill */
    if (!f || units.some((x) => frameOfGroup(x, frames, widths)?.id !== f.id)) throw new OpError("nothing_to_do", "Those parts are not on one screen.");
    const unitIds = new Set(units.map((x) => x.id));
    const rects = new Map(all.map((x) => [x.id, groupBounds(x, widths)]));
    const r = units.map((x) => rects.get(x.id)!).reduce((p, o) => ({ l: Math.min(p.l, o.l), t: Math.min(p.t, o.t), r: Math.max(p.r, o.r), b: Math.max(p.b, o.b) }));
    const w = r.r - r.l;
    const h = r.b - r.t;
    const bb = bodyRect(all, f, frames, widths, unitIds, metricsOf(s.doc.theme));
    const x = a.col === "left" ? bb.l : a.col === "right" ? bb.r - w : Math.round((bb.l + bb.r) / 2 - w / 2);
    const y0 = a.row === "top" ? bb.t : a.row === "bottom" ? bb.b - h : Math.round((bb.t + bb.b) / 2 - h / 2);
    const others = all
      .filter((o) => !unitIds.has(o.id) && !o.inFlow && frameOfGroup(o, frames, widths)?.id === f.id)
      .map((o) => rects.get(o.id)!)
      /* only parts in the same column can be in the way */
      .filter((o) => o.l < x + w && o.r > x);
    const hits = (y: number) => others.filter((o) => o.t < y + h && o.b > y);
    const free = (y: number) => y >= bb.t && y + h <= bb.b && hits(y).length === 0;
    const gap = 8;
    /* candidate rows: just below or just above every obstacle, nearest to the target first */
    const spots = [y0, ...others.flatMap((o) => [o.b + gap, o.t - gap - h])]
      .filter((y) => free(y))
      .sort((p, q) => {
        const dp = Math.abs(p - y0);
        const dq = Math.abs(q - y0);
        if (dp !== dq) return dp - dq;
        /* a tie breaks away from the edge the part was sent to */
        return a.row === "top" ? p - q : a.row === "bottom" ? q - p : 0;
      });
    const y = spots[0] ?? y0;
    const dx = x - r.l;
    const dy = y - r.t;
    if (!dx && !dy) throw new OpError("nothing_to_do", "They are there already.");
    return { state: withGroups(s, all.map((o) => (unitIds.has(o.id) ? { ...o, x: o.x + dx, y: o.y + dy } : o))) };
  },
});

/** neighbouring buttons on a screen joined into button groups */
export const combine = op<{ screen: string }>({
  name: "combine_buttons",
  summary: "Joins buttons that stand side by side on a screen into button groups.",
  args: S.obj({ screen: S.str() }, ["screen"]),
  label: () => "Combine buttons",
  run(s, a, ctx) {
    const f = frameById(s, a.screen);
    return { state: withSession(changed(s, combineButtons(s.doc.groups, f, s.doc.frames, ctx.widths), "There are no buttons side by side there."), { selection: [] }) };
  },
});

/** every screen laid out by the document's style (its margins, bars, navigation) */
export const relayout = op<Record<string, never>>({
  name: "relayout",
  summary: "Lays every screen out the way the document's style lays screens out.",
  args: S.obj({}),
  label: () => "Lay out by style",
  run(s, _a, ctx) {
    const laid = layoutForStyle(s.doc.groups, s.doc.frames, ctx.widths, s.doc.theme, { pick: true });
    if (!laid) throw new OpError("nothing_to_do", "The screens are laid out that way already.");
    return { state: { ...s, doc: { ...s.doc, groups: laid.groups, frames: laid.frames } } };
  },
});
