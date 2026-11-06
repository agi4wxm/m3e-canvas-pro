/* Operations on screens: adding one (blank or from a template), copying, removing, renaming and the rest of a
 * screen's fields, its size and its phone, how far it runs, its other sizes, where Tidy puts its body. */

import { instantiate, templateBySlug } from "../../../parts/templates";
import { metricsOf } from "../../styleLayout";
import { carryFrame, lengthToHold, minFrameLength, stretchFrame, tidyFrame } from "../../tidy";
import { actionToSibling, createVariant, familyOf, framesWithout } from "../../variants";
import { loosenedCopies } from "../../flow";
import { rekeyedAll } from "../../instances";
import {
  actionWithoutScreen,
  COLOR_TOKENS,
  FRAME_GAP,
  frameLengthOf,
  frameOfGroup,
  frameOfPart,
  frameRect,
  framePresetPatch,
  frameSizeOf,
  groupBounds,
  isPhoneFrame,
  isPlace,
  phoneFields,
  phoneSizeOf,
  PHONE_W,
  unionRect,
  type Action,
  type Frame,
  type FramePreset,
  type Group,
  type Place,
} from "../../tokens";
import { t } from "../../i18n";
import { op, OpError, S } from "../op";
import { withFrames, withGroups, withSession, type CoreState } from "../state";
import { frameById, freshId } from "./common";

const nextFrameX = (frames: Frame[]) => (frames.length ? Math.max(...frames.map((f) => frameRect(f).r)) + FRAME_GAP : 0);

const noDefinition = (s: CoreState) => {
  if (s.editing) throw new OpError("refused", "A component is being edited: finish editing it before changing the document's screens.");
};

/** a new blank screen beside the others, the same phone as them */
export const addScreen = op<{ id?: string; name?: string; preset?: FramePreset; w?: number; h?: number; x?: number; y?: number }, { id: string }>({
  name: "add_screen",
  summary: "Adds a blank screen to the right of the others: the document's phone unless a preset (tablet, desktop) or a size is given.",
  args: S.obj({ id: S.str(), name: S.str(), preset: S.enum(["phone", "tablet", "desktop"]), w: S.num(undefined, { minimum: 200, maximum: 3840 }), h: S.num(undefined, { minimum: 200, maximum: 3840 }), x: S.num(), y: S.num() }),
  label: () => "Add screen",
  run(s, a, ctx) {
    noDefinition(s);
    const frames = s.doc.frames;
    const id = freshId(s, a.id, ctx.newId);
    const base = frames[0];
    const size = a.w !== undefined || a.h !== undefined ? { w: a.w ?? frameSizeOf(base ?? { id: "", name: "", x: 0, y: 0 }).w, h: a.h ?? 892 } : undefined;
    const f: Frame = {
      id,
      name: a.name ?? `${t("screenN", ctx.lang)} ${frames.length + 1}`,
      x: a.x ?? nextFrameX(frames),
      y: a.y ?? base?.y ?? 0,
      /* a new screen is the same phone as the others */
      ...(size ? size : a.preset && a.preset !== "phone" ? framePresetPatch(a.preset) : phoneFields(phoneSizeOf(frames))),
    };
    return { state: withSession(withFrames(s, [...frames, f]), { frameId: id, selection: [] }), result: { id } };
  },
});

/** a template's screens beside the existing ones, in the editor's language */
export const addTemplate = op<{ slug: string; x?: number; y?: number }, { frames: string[] }>({
  name: "add_template",
  summary: "Adds the screens of a screen or flow template (see the template catalog) to the right of the others.",
  args: S.obj({ slug: S.str("the template"), x: S.num(), y: S.num() }, ["slug"]),
  label: (a) => `Add template ${a.slug}`,
  run(s, a, ctx) {
    noDefinition(s);
    const template = templateBySlug(a.slug);
    if (!template) throw new OpError("not_found", `There is no template "${a.slug}".`, a.slug);
    const fs = s.doc.frames;
    /* on a blank canvas it brings the screens back: they are what it adds */
    const shown = s.doc.frame === "phone" ? s : ensureScreen({ ...s, doc: { ...s.doc, frame: "phone" } }, ctx.widths, ctx.newId(), t("home", ctx.lang));
    const added = instantiate(template, ctx.lang, { x: a.x ?? nextFrameX(fs), y: a.y ?? fs[0]?.y ?? 0 }, fs.map((f) => f.name), phoneSizeOf(fs));
    const state = { ...shown, doc: { ...shown.doc, frames: [...shown.doc.frames, ...added.frames], groups: [...shown.doc.groups, ...added.groups] } };
    return { state: withSession(state, { selection: [], frameId: added.frames[0]?.id ?? null }), result: { frames: added.frames.map((f) => f.id) } };
  },
});

/** a screen's fields: its name, its background role, its description, where swipes go, the device's bars, a picture
 *  to trace */
export const patchScreen = op<{ id: string; patch: Partial<Frame> }>({
  name: "set_screen",
  summary: "Sets a screen's fields: name, bg (a color role), note (what it is for), swipe ({left|right|up|down: screen id}), deviceBars, backgroundImage, backgroundOpacity. null clears one.",
  args: S.obj({ id: S.str(), patch: S.any() }, ["id", "patch"]),
  label: () => "Edit screen",
  run(s, a, ctx) {
    const f = frameById(s, a.id);
    let patch = a.patch as Record<string, unknown>;
    if (ctx.strict) {
      const allowed = ["name", "bg", "note", "swipe", "deviceBars", "backgroundImage", "backgroundOpacity", "noteHistory"];
      for (const [k, v] of Object.entries(patch)) {
        if (!allowed.includes(k)) throw new OpError("invalid_value", `A screen has no field "${k}" to set here (it takes ${allowed.join(", ")}; size, length and place have operations of their own).`, k);
        if (v === null) continue;
        if (k === "name" && typeof v !== "string") throw new OpError("invalid_value", "name should be text.", k);
        if (k === "bg" && !COLOR_TOKENS.some((x) => x.key === v)) throw new OpError("invalid_value", `bg should be a color role: ${COLOR_TOKENS.map((x) => x.key).join(", ")}.`, k);
        if (k === "swipe" && (typeof v !== "object" || Object.entries(v as object).some(([d, to]) => !["left", "right", "up", "down"].includes(d) || !s.doc.frames.some((x) => x.id === to)))) throw new OpError("invalid_value", "swipe should be {left|right|up|down: an existing screen's id}.", k);
        if (k === "deviceBars" && typeof v !== "boolean") throw new OpError("invalid_value", "deviceBars should be true or false.", k);
      }
      patch = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v]));
    }
    return { state: withFrames(s, s.doc.frames.map((x) => (x.id === f.id ? { ...x, ...patch } : x))) };
  },
});

/** A screen changing size: the screens to its right move over, its parts take the sizes the new screen calls for, and
 *  it is laid out again by the tidy rules. */
export const resizeScreen = op<{ id: string; w?: number; h?: number; preset?: FramePreset }>({
  name: "resize_screen",
  summary: "Changes a screen's size (w and h in dp, or a preset: phone, tablet, desktop); its parts follow and it is laid out again.",
  args: S.obj({ id: S.str(), w: S.num(undefined, { minimum: 200, maximum: 3840 }), h: S.num(undefined, { minimum: 200, maximum: 3840 }), preset: S.enum(["phone", "tablet", "desktop"]) }, ["id"]),
  label: () => "Resize screen",
  run(s, a, ctx) {
    const current = frameById(s, a.id);
    const size = a.preset ? (a.preset === "phone" ? phoneFields(phoneSizeOf(s.doc.frames)) : framePresetPatch(a.preset)) : { w: a.w ?? frameSizeOf(current).w, h: a.h ?? frameSizeOf(current).h };
    const sized = { ...current, ...size };
    /* a screen no longer than its new device does not scroll any more */
    const next = sized.length !== undefined && sized.length <= frameSizeOf(sized).h ? { ...sized, length: undefined } : sized;
    const before = frameSizeOf(current);
    const after = frameSizeOf(next);
    if (before.w === after.w && before.h === after.h) throw new OpError("nothing_to_do", "The screen is that size already.");
    const laid = carryFrame(s.doc.groups, current, next, s.doc.frames, ctx.widths, metricsOf(s.doc.theme));
    return { state: { ...s, doc: { ...s.doc, frames: laid.frames, groups: laid.groups } } };
  },
});

/** every phone screen of the document at the size of one model, each kept upright or on its side */
export const setPhoneModel = op<{ w: number; h: number }, { frames: string[] }>({
  name: "set_phone_model",
  summary: "Puts every phone screen of the document on a phone of this size (portrait w×h; screens on their side stay so).",
  args: S.obj({ w: S.num(undefined, { minimum: 240, maximum: 1200 }), h: S.num(undefined, { minimum: 400, maximum: 2400 }) }, ["w", "h"]),
  label: () => "Phone model",
  run(s, a, ctx) {
    const size = { w: a.w, h: a.h };
    let frames = s.doc.frames;
    let groups = s.doc.groups;
    const ids: string[] = [];
    const m = metricsOf(s.doc.theme);
    for (const f of s.doc.frames) {
      if (!isPhoneFrame(f)) continue;
      const was = frames.find((x) => x.id === f.id)!;
      const sideways = frameSizeOf(was).w > frameSizeOf(was).h;
      /* a length the last phone called for is not this phone's: only one a person or a template set stays */
      const sized = { ...was, ...(sideways ? { w: size.h, h: size.w } : phoneFields(size)), ...(was.grownFrom !== undefined ? { length: undefined, grownFrom: undefined } : {}) };
      /* a screen no longer than its new device does not scroll any more */
      const fitted = sized.length !== undefined && sized.length <= frameSizeOf(sized).h ? { ...sized, length: undefined } : sized;
      const before = frameSizeOf(was);
      const after = frameSizeOf(fitted);
      if (before.w === after.w && before.h === after.h) continue;
      /* on a smaller phone what no longer fits makes the screen longer: a part left below its foot would be off the screen */
      const mine = groups.filter((g) => frameOfGroup(g, frames, ctx.widths)?.id === f.id);
      const need = Math.ceil(lengthToHold(mine, fitted, ctx.widths, m) / 4) * 4;
      const next = need > frameLengthOf(fitted) ? { ...fitted, length: need, grownFrom: after.h } : fitted;
      const laid = carryFrame(groups, was, next, frames, ctx.widths, m);
      frames = laid.frames;
      groups = laid.groups;
      ids.push(f.id);
    }
    if (!ids.length) throw new OpError("nothing_to_do", "Every phone screen is that phone already.");
    return { state: { ...s, doc: { ...s.doc, frames, groups } }, result: { frames: ids } };
  },
});

/** How far a screen runs, longer than its device or back: what stands at its foot goes with the foot. A stream of
 *  lengths (a slider, a handle) is worked out from where it began (`from`), so a part is never taken for one at the
 *  foot halfway through. */
export const setScreenLength = op<{ id: string; length: number; from?: { frames: Frame[]; groups: Group[] } }, { length: number }>({
  name: "set_screen_length",
  summary: "Makes a screen run longer than its device (it scrolls), or back; what stands at its foot goes with the foot.",
  args: S.obj({ id: S.str(), length: S.num("dp, from the device's height to four times it"), from: S.any() }, ["id", "length"]),
  label: () => "Screen length",
  run(s, a, ctx) {
    const from = a.from ?? { frames: s.doc.frames, groups: s.doc.groups };
    const start = from.frames.find((f) => f.id === a.id);
    const current = frameById(s, a.id);
    if (!start) throw new OpError("not_found", `There is no screen ${JSON.stringify(a.id)}.`, a.id);
    const to = Math.max(a.length, minFrameLength(from.groups, start, from.frames, ctx.widths));
    if (to === frameLengthOf(current)) throw new OpError("nothing_to_do", "The screen is that long already.");
    const laid = stretchFrame(from.groups, start, to, from.frames, ctx.widths);
    return { state: { ...s, doc: { ...s.doc, frames: laid.frames, groups: laid.groups } }, result: { length: to } };
  },
});

/** A screen gone with everything on it. A way to it from elsewhere goes to another size of it when one is left,
 *  and is dropped when none is. */
export const removeScreen = op<{ id: string }>({
  name: "remove_screen",
  summary: "Removes a screen with everything on it; taps that went to it go to another size of it, or nowhere.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete screen",
  run(s, a, ctx) {
    noDefinition(s);
    frameById(s, a.id);
    const id = a.id;
    const groups = s.doc.groups;
    const gone = new Set(groups.filter((g) => frameOfPart(g, groups, s.doc.frames, ctx.widths)?.id === id).map((g) => g.id));
    /* where another size of it is left, a way to it goes there instead of going altogether */
    const sibling = familyOf(s.doc.frames, id).find((f) => f.id !== id)?.id;
    const frames = framesWithout(s.doc.frames, id).map((f) => {
      if (!f.swipe) return f;
      const swipe = Object.fromEntries(Object.entries(f.swipe).flatMap(([dir, to]) => (to !== id ? [[dir, to]] : sibling ? [[dir, sibling]] : [])));
      return { ...f, swipe: Object.keys(swipe).length ? swipe : undefined };
    });
    const kept = (x: Action) => (sibling ? actionToSibling(x, id, sibling) : actionWithoutScreen(x, id));
    /* what a part or a definition's part said about that screen */
    const withoutLinks = (g: Group): Group => ({
      ...g,
      items: g.items.map((it) => {
        const next = { ...it };
        if (next.action) next.action = kept(next.action);
        if (next.actions) {
          const actions = Object.fromEntries(
            Object.entries(next.actions).flatMap(([slot, x]) => {
              const stays = kept(x);
              return stays ? [[slot, stays]] : [];
            }),
          );
          next.actions = Object.keys(actions).length ? actions : undefined;
        }
        return next;
      }),
    });
    const goneItems = new Set(groups.filter((g) => gone.has(g.id)).flatMap((g) => g.items.map((it) => it.id)));
    const components = s.doc.components?.map((c) => ({ ...c, groups: c.groups.map(withoutLinks) }));
    const doc = { ...s.doc, frames, groups: groups.filter((g) => !gone.has(g.id)).map(withoutLinks), ...(components ? { components } : {}) };
    return { state: { ...s, doc, session: { ...s.session, frameId: null, selection: s.session.selection.filter((x) => !goneItems.has(x)) } } };
  },
});

/** a copy of a screen beside the others, a screen of its own (not one more size of this one) */
export const duplicateScreen = op<{ id: string; newId?: string; name?: string }, { id: string }>({
  name: "duplicate_screen",
  summary: "Copies a screen with everything on it, to the right of the others.",
  args: S.obj({ id: S.str(), newId: S.str(), name: S.str() }, ["id"]),
  label: () => "Duplicate screen",
  run(s, a, ctx) {
    noDefinition(s);
    const f = frameById(s, a.id);
    const { variantOf: _size, ...own } = f;
    const id = freshId(s, a.newId, ctx.newId);
    const nf: Frame = { ...own, id, name: a.name ?? `${f.name}${t("copySuffix", ctx.lang)}`, x: nextFrameX(s.doc.frames) };
    const dx = nf.x - f.x;
    const copies = loosenedCopies(rekeyedAll(s.doc.groups.filter((g) => frameOfPart(g, s.doc.groups, s.doc.frames, ctx.widths)?.id === a.id), dx, 0, false));
    return { state: withSession({ ...s, doc: { ...s.doc, frames: [...s.doc.frames, nf], groups: [...s.doc.groups, ...copies] } }, { frameId: id }), result: { id } };
  },
});

/** another size of a screen, beside it: a copy carried to the new size */
export const createScreenVariant = op<{ id: string; preset: FramePreset; newId?: string }, { id: string }>({
  name: "create_screen_variant",
  summary: "Makes another size of a screen (tablet, desktop or phone) beside it; each size keeps a layout of its own and the preview switches between them by width.",
  args: S.obj({ id: S.str(), preset: S.enum(["phone", "tablet", "desktop"]), newId: S.str() }, ["id", "preset"]),
  label: () => "Screen size variant",
  run(s, a, ctx) {
    frameById(s, a.id);
    const made = createVariant(s.doc.groups, s.doc.frames, a.id, a.preset, ctx.widths, a.newId ?? ctx.newId());
    if (!made) throw new OpError("nothing_to_do", `That screen has a ${a.preset} size already.`, a.id);
    return { state: withSession({ ...s, doc: { ...s.doc, frames: made.frames, groups: made.groups } }, { selection: [], frameId: made.id }), result: { id: made.id } };
  },
});

/** where Tidy puts a screen's body, and the screen tidied that way */
export const setPlace = op<{ id: string; place: Place }, { tidied: boolean }>({
  name: "set_screen_place",
  summary: "Sets where Tidy puts a screen's body between its bars (top, center, bottom, spread), and tidies it that way.",
  args: S.obj({ id: S.str(), place: S.enum(["top", "center", "bottom", "spread"]) }, ["id", "place"]),
  label: () => "Screen body place",
  run(s, a, ctx) {
    const f = frameById(s, a.id);
    if (!isPlace(a.place)) throw new OpError("invalid_value", "place should be top, center, bottom or spread.", "place");
    const next: Frame = { ...f, place: a.place === "top" ? undefined : a.place };
    const frames = s.doc.frames.map((o) => (o.id === f.id ? next : o));
    const after = tidyFrame(s.doc.groups, next, frames, ctx.widths, metricsOf(s.doc.theme));
    return { state: withGroups(withFrames(s, frames), after ?? s.doc.groups), result: { tidied: !!after } };
  },
});

/** moves a screen with everything on it to a point on the canvas */
export const moveScreen = op<{ id: string; x: number; y: number }>({
  name: "move_screen",
  summary: "Moves a screen, with everything on it, to x, y on the canvas.",
  args: S.obj({ id: S.str(), x: S.num(), y: S.num() }, ["id", "x", "y"]),
  label: () => "Move screen",
  run(s, a, ctx) {
    const f = frameById(s, a.id);
    const dx = Math.round(a.x - f.x);
    const dy = Math.round(a.y - f.y);
    const carried = new Set(s.doc.groups.filter((g) => frameOfGroup(g, s.doc.frames, ctx.widths)?.id === f.id).map((g) => g.id));
    return { state: { ...s, doc: { ...s.doc, frames: s.doc.frames.map((x) => (x.id === f.id ? { ...x, x: x.x + dx, y: x.y + dy } : x)), groups: s.doc.groups.map((g) => (carried.has(g.id) ? { ...g, x: g.x + dx, y: g.y + dy } : g)) } } };
  },
});

/** Entering screens mode with no screens wraps the parts there in one. */
export function ensureScreen(s: CoreState, widths: Record<string, number>, id: string, name: string): CoreState {
  if (s.doc.frames.length > 0) return s;
  const gs = s.doc.groups;
  let x = 0;
  let y = 0;
  if (gs.length) {
    const { l, t: top, r } = unionRect(gs.map((g) => groupBounds(g, widths)));
    x = Math.round(Math.max(l - 24, r - PHONE_W + 24 > l ? l : l - 24));
    y = Math.round(top - 72);
    x = Math.min(x, l);
    y = Math.min(y, top);
  }
  return withFrames(s, [{ id, name, x, y }]);
}
