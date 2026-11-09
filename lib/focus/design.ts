/* The focus of a design as the document has it, before anything is drawn (lib/focus/model.ts): which parts take it, and
 * for each screen where it starts and where each direction goes from each part, worked out from where the parts stand
 * on the canvas, with the parts' own overrides. What the editor's tools show and set, and what the exported apps that
 * cannot measure a page are given as data (the phone app's, an engine's focus neighbours). */

import { groupsInFrame, layoutOf, type Doc, type Frame, type Group, type Item } from "../tokens";
import { partBySlug } from "../../parts/registry";
import { INPUT_PROP } from "../interact";
import { eventOfKey } from "../actions/model";
import { FOCUS_DIRS, firstOf, neighbourOf, readingOrder, type FocusDir, type FocusLayer, type FocusTarget, type FrameFocus, type ItemFocus } from "./model";

/** Whether a part does something a press can start: a tap of its own (not one that starts on the pointer or on time), a
 *  place with a tap, places that pick themselves (tabs), an input, a menu with a trigger of its own. */
export function doesSomething(it: Item): boolean {
  const def = partBySlug(it.component);
  if (it.action && !it.action.trigger) return true;
  if (it.actions && Object.keys(it.actions).some((k) => eventOfKey(k) === null)) return true;
  if (!def) return false;
  if (INPUT_PROP[def.slug] !== undefined) return true;
  if (def.selectKey && def.slots) return true;
  return !!def.open && def.open.trigger !== "hide";
}

/** whether a part takes the focus: its own say (`focus.focusable`), else whether it does something */
export const takesFocus = (it: Item): boolean => it.focus?.focusable ?? doesSomething(it);

/** one part of a screen as the focus reads it: where it stands on the screen (its own pixels), where each way goes */
export type FocusPart = { id: string; label: string; box: { x: number; y: number; w: number; h: number }; next: Partial<Record<FocusDir, string>> };

/** A screen's focus as data: where it starts, what cancel runs, whether it wraps, and its parts in reading order. */
export type FocusMap = { screen: string; first: string | null; cancel?: string; wrap?: boolean; parts: FocusPart[] };

/** the words a part is known by in a map: its label, its words, its slug */
function labelOf(it: Item): string {
  const p = it.props ?? {};
  for (const k of ["label", "text", "title"]) if (typeof p[k] === "string" && p[k]) return (p[k] as string).slice(0, 60);
  return it.label || it.component || it.id;
}

/** the parts of a screen that take the focus, each where it stands on the screen */
export function focusTargetsOf(groups: Group[], frame: Frame, widths: Record<string, number>): { targets: FocusTarget[]; items: Map<string, Item> } {
  const targets: FocusTarget[] = [];
  const items = new Map<string, Item>();
  for (const g of groups) {
    /* a part hidden at the start (an overlay before it is opened) is not there to move to */
    if (g.hidden) continue;
    for (const pl of layoutOf(g, widths)) {
      if (!takesFocus(pl.item)) continue;
      items.set(pl.item.id, pl.item);
      targets.push({ key: pl.item.id, part: pl.item.id, box: { x: pl.x - frame.x, y: pl.y - frame.y, w: pl.w, h: pl.h } });
    }
  }
  return { targets, items };
}

/** the layer a screen is, read from the document */
export function designLayer(doc: Pick<Doc, "groups" | "frames">, frame: Frame, widths: Record<string, number>): { layer: FocusLayer; items: Map<string, Item> } {
  const { targets, items } = focusTargetsOf(groupsInFrame(doc.groups, frame, doc.frames, widths), frame, widths);
  const own = new Map<string, ItemFocus | undefined>([...items].map(([id, it]) => [id, it.focus]));
  return { layer: { key: frame.id, targets, screen: frame.focus, part: (id) => own.get(id) }, items };
}

/** A screen's focus, every move worked out: what the editor's tools show, what an app that cannot measure is given. */
export function focusMap(doc: Pick<Doc, "groups" | "frames">, frame: Frame, widths: Record<string, number>): FocusMap {
  const { layer, items } = designLayer(doc, frame, widths);
  const parts = readingOrder(layer.targets).map((t) => {
    const next: FocusPart["next"] = {};
    for (const d of FOCUS_DIRS) {
      const to = neighbourOf(layer, t.key, d);
      if (to) next[d] = to;
    }
    return { id: t.key, label: labelOf(items.get(t.key)!), box: { x: Math.round(t.box.x), y: Math.round(t.box.y), w: Math.round(t.box.w), h: Math.round(t.box.h) }, next };
  });
  const f: FrameFocus = frame.focus ?? {};
  return { screen: frame.id, first: firstOf(layer), ...(f.cancel && items.has(f.cancel) ? { cancel: f.cancel } : {}), ...(f.wrap ? { wrap: true } : {}), parts };
}

/** whether a document says anything about the focus: an exported web app that does carries the focus with it */
export const usesFocus = (doc: Pick<Doc, "groups" | "frames" | "components">): boolean =>
  doc.frames.some((f) => !!f.focus) || [...doc.groups, ...(doc.components ?? []).flatMap((c) => c.groups)].some((g) => g.items.some((it) => !!it.focus));


/** What an app that cannot measure its page is given of the focus (`src/generated/focus.json` of the phone app and the
 *  mini-program; an engine's focus neighbours, batch 9): every screen's map, by the design's item ids. Nothing for a
 *  document that says nothing of the focus. */
export function focusData(doc: Pick<Doc, "groups" | "frames" | "components">, widths: Record<string, number>): { version: 1; screens: (FocusMap & { name: string })[] } | null {
  if (!usesFocus(doc)) return null;
  return { version: 1, screens: doc.frames.map((f) => ({ ...focusMap(doc, f, widths), name: f.name })) };
}
