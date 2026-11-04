import { carryFrame } from "./tidy";
import { rekeyedAll } from "./instances";
import { DESKTOP_W, FRAME_GAP, type Frame, type FramePreset, type Group, PHONE_W, TABLET_W, framePresetOf, framePresetPatch, frameOfPart, frameRect, frameSizeOf, uid } from "./tokens";

/* Responsive variants: sibling screens that are sizes of one screen. Each is a layout of its own, so
 * editing one leaves the others as they are. All they share is the link, which the preview follows
 * when its width is switched and the prompt names. */

type Widths = Record<string, number>;

const PRESET_W: Record<FramePreset, number> = { phone: PHONE_W, tablet: TABLET_W, desktop: DESKTOP_W };
export const PRESETS: FramePreset[] = ["phone", "tablet", "desktop"];

/** The screen a family hangs from. A link to a screen that is gone counts for nothing, and a loop from
 *  a file edited by hand stops where it closes. */
export function rootOf(frames: Frame[], f: Frame): Frame {
  let at = f;
  const seen = new Set([f.id]);
  while (at.variantOf) {
    const up = frames.find((x) => x.id === at.variantOf);
    if (!up || seen.has(up.id)) break;
    seen.add(up.id);
    at = up;
  }
  return at;
}

/** a screen and its other sizes, the root first and the rest in document order */
export function familyOf(frames: Frame[], id: string): Frame[] {
  const f = frames.find((x) => x.id === id);
  if (!f) return [];
  const root = rootOf(frames, f);
  return [root, ...frames.filter((x) => x !== root && rootOf(frames, x) === root)];
}

/** the screens in families, for a list that groups them */
export function familiesOf(frames: Frame[]): Frame[][] {
  const out = new Map<string, Frame[]>();
  for (const f of frames) {
    const root = rootOf(frames, f);
    out.set(root.id, [...(out.get(root.id) ?? []), f]);
  }
  return [...out.values()].map((list) => [...list].sort((a, b) => (a.variantOf && !b.variantOf ? 1 : !a.variantOf && b.variantOf ? -1 : 0)));
}

/** the sibling a width shows: the one of that size, or the nearest there is */
export function variantFor(frames: Frame[], id: string, preset: FramePreset): Frame | undefined {
  const family = familyOf(frames, id);
  const exact = family.find((f) => framePresetOf(f) === preset);
  if (exact) return exact;
  const want = PRESET_W[preset];
  return family.reduce<Frame | undefined>((best, f) => (!best || Math.abs(frameSizeOf(f).w - want) < Math.abs(frameSizeOf(best).w - want) ? f : best), undefined);
}

/** the sizes a screen has no sibling of yet */
export const missingSizes = (frames: Frame[], id: string): FramePreset[] => {
  const family = familyOf(frames, id);
  return PRESETS.filter((p) => !family.some((f) => framePresetOf(f) === p));
};

/** A copy of a screen at another size, standing beside its family: what stands further right moves
 *  over to make room, and the copy is carried to its new size by the same rules a screen changing size goes by. */
export function createVariant(groups: Group[], frames: Frame[], frameId: string, preset: FramePreset, widths: Widths, id: string = uid()): { groups: Group[]; frames: Frame[]; id: string } | null {
  const f = frames.find((x) => x.id === frameId);
  if (!f || !missingSizes(frames, frameId).includes(preset)) return null;
  const family = familyOf(frames, frameId);
  const anchor = family.reduce((a, b) => (frameRect(b).r > frameRect(a).r ? b : a));
  const x = frameRect(anchor).r + FRAME_GAP;
  const room = frameSizeOf(f).w + FRAME_GAP;
  const shifted = new Set(frames.filter((o) => o.x > anchor.x).map((o) => o.id));
  const owner = (g: Group) => frameOfPart(g, groups, frames, widths)?.id;
  const moved = groups.map((g) => {
    const o = owner(g);
    return o && shifted.has(o) ? { ...g, x: g.x + room } : g;
  });
  const own = groups.filter((g) => owner(g) === f.id);
  const copies = rekeyedAll(own, x - f.x, 0, false);
  /* the copy measures what the original does until it has been drawn */
  const measures = { ...widths };
  own.forEach((g, i) =>
    g.items.forEach((it, j) => {
      const to = copies[i].items[j].id;
      if (widths[it.id] !== undefined) measures[to] = widths[it.id];
      if (widths[`${it.id}:h`] !== undefined) measures[`${to}:h`] = widths[`${it.id}:h`];
    }),
  );
  const copy: Frame = { ...f, id, x, variantOf: rootOf(frames, f).id };
  const at = frames.indexOf(anchor);
  const placed = frames.map((o) => (shifted.has(o.id) ? { ...o, x: o.x + room } : o));
  placed.splice(at + 1, 0, copy);
  const sized = { ...copy, ...framePresetPatch(preset) };
  /* a screen no longer than its new device does not scroll any more */
  const to = sized.length !== undefined && sized.length <= frameSizeOf(sized).h ? { ...sized, length: undefined } : sized;
  const carried = carryFrame([...moved, ...copies], copy, to, placed, measures);
  return { groups: carried.groups, frames: carried.frames, id };
}

/** The screens without one of them. A family keeps together when its root goes: the next of them takes over. */
export function framesWithout(frames: Frame[], id: string): Frame[] {
  const gone = frames.find((f) => f.id === id);
  const rest = frames.filter((f) => f.id !== id);
  if (!gone) return frames;
  const heirs = rest.filter((f) => f.variantOf === id);
  if (!heirs.length) return rest;
  const heir = heirs[0];
  return rest.map((f) => {
    if (f === heir) {
      const { variantOf: _was, ...own } = f;
      return gone.variantOf && gone.variantOf !== heir.id ? { ...own, variantOf: gone.variantOf } : own;
    }
    return f.variantOf === id ? { ...f, variantOf: heir.id } : f;
  });
}
