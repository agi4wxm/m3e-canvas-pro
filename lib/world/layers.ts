/* Screens in layers (docs/交互规则.md “分层”, docs/世界宿主契约.md “分层”): a page on show (a world, or any screen) and
 * the layers stood over it, from the bottom up: the HUDs that stand with it (`over`), then what the visitor opened (a
 * HUD, a dialog, a toast, a screen laid over by `overlay`). This file is what every host keeps the same: what opening a
 * screen does to the layers, what going back closes, which layers take input, when the worlds under them are let go of
 * and asked to pause, what of a HUD covers a world view and where a pointer goes. Each host keeps the layers in its own
 * state and draws them its own way. Plain TypeScript and no imports beyond the types, so it goes into an exported app's
 * runtime as it is, and an engine-side host can follow it. */

import { WORLD_HOST_CONTRACT, type ScreenLayer } from "./hostContract";
import type { WorldRect } from "./types";

export type { ScreenLayer };

/** How a screen stands over the page once opened: as the layer it is marked as, or laid over by an action's `overlay`
 *  (`overlay`: one at a time, modal, as an overlay always was). */
export type Laid = Exclude<ScreenLayer, "world"> | "overlay";

/** a screen standing over the page: how it stands, and the host's own entry for it (its id, params, motion…) */
export type Layer<E> = { layer: Laid; entry: E };

/** What a host knows of a screen to lay it: its layer, the page a HUD stands with, whether a dialog pauses the world. */
export type LayeredScreen = { id: string; layer?: ScreenLayer; over?: string; pauses?: boolean };

/** how high each stands: a toast over a dialog over a HUD, whatever order they opened in */
export const LAID_RANK: Record<Laid, number> = { hud: 1, overlay: 2, dialog: 2, toast: 3 };

/** what a layer takes of the input (hostContract.ts `layers.input`); a screen laid over is modal, as a dialog is */
export const layerInput = (l: Laid) => (l === "overlay" ? "modal" : WORLD_HOST_CONTRACT.layers.input[l]);

/** a layer that takes everything, and leaves nothing under it any */
export const isModal = (l: Laid) => layerInput(l) === "modal";

/** How a screen goes on show when it is opened: laid over the page as its layer (a HUD, a dialog, a toast), laid over
 *  by the action's `overlay`, or (null) as a page of its own, which a world is. */
export function laidAs(layer: ScreenLayer | undefined, overlay?: boolean): Laid | null {
  if (layer === "hud" || layer === "dialog" || layer === "toast") return layer;
  return overlay && layer !== "world" ? "overlay" : null;
}

/** The layers once a screen is laid over them: the same screen up already gives way to it, as another screen laid over
 *  by `overlay` does (one at a time, as always); it goes over every layer of its height or lower, under the higher. */
export function layOver<E>(layers: readonly Layer<E>[], next: Layer<E>, same: (a: E, b: E) => boolean): Layer<E>[] {
  const kept = layers.filter((l) => !same(l.entry, next.entry) && !(next.layer === "overlay" && l.layer === "overlay"));
  const at = kept.findIndex((l) => LAID_RANK[l.layer] > LAID_RANK[next.layer]);
  return at < 0 ? [...kept, next] : [...kept.slice(0, at), next, ...kept.slice(at)];
}

/** the layers once going back has closed the topmost (what goes back closes first); the same when none is up */
export const closeTop = <E>(layers: readonly Layer<E>[]): Layer<E>[] => layers.slice(0, -1);

/** The HUDs that stand with a page whenever it is on show (`over` the page's id), in the order of the screens. */
export function standingWith<S extends LayeredScreen>(screens: readonly S[], page: string | undefined): S[] {
  return page === undefined ? [] : screens.filter((s) => s.layer === "hud" && s.over === page && s.id !== page);
}

/** What stands over a page, from the bottom up: its own HUDs (`standingWith`, not closed by going back), then the
 *  layers opened over it, each where its height puts it. */
export function stood<E>(own: readonly E[], opened: readonly Layer<E>[]): Layer<E>[] {
  let out: Layer<E>[] = own.map((entry) => ({ layer: "hud" as const, entry }));
  for (const l of opened) out = layOver(out, l, () => false);
  return out;
}

/** Where input stops: the place in `layers` (bottom up over the page) of the topmost modal layer, below which nothing
 *  takes input; -1 when none is up, and the page takes what its layers let through. */
export function inputFloor(layers: readonly { layer: Laid }[]): number {
  for (let i = layers.length - 1; i >= 0; i--) if (isModal(layers[i].layer)) return i;
  return -1;
}

/** whether the layer at `index` (or the page, at -1) takes input now */
export const takesInput = (layers: readonly { layer: Laid }[], index: number): boolean => index >= inputFloor(layers);

/** Whether the worlds under the layers are let go of (every held input released, and no more sent until it closes):
 *  a modal layer is up (hostContract.ts `overlay.release`), or an overlay part is open on a screen on show (a dialog,
 *  a sheet, a menu: `overlayOpen`). */
export function covers(layers: readonly { layer: Laid }[], overlayOpen = false): boolean {
  return WORLD_HOST_CONTRACT.overlay.release && (overlayOpen || layers.some((l) => isModal(l.layer)));
}

/** Whether the worlds under the layers are asked to pause: a modal layer is up whose screen says so (`pauses`, the
 *  design's choice: a pause menu), or one is up at all when the host's overlay policy pauses (today it does not). */
export function pausesWorld<E>(layers: readonly Layer<E>[], pauses: (entry: E) => boolean, overlayOpen = false): boolean {
  if (WORLD_HOST_CONTRACT.overlay.pause && covers(layers, overlayOpen)) return true;
  return layers.some((l) => isModal(l.layer) && pauses(l.entry));
}

/** a box on the screen, in the screen's own pixels */
export type Box = { x: number; y: number; w: number; h: number };

/** The parts of a HUD over a world view, in the view's own pixels (what `World.occlude` is told): each box a part of the
 *  HUD that covers the world takes, cut to the view, those left with nothing dropped. */
export function occlusionOf(view: Box, boxes: readonly Box[]): WorldRect[] {
  const out: WorldRect[] = [];
  for (const b of boxes) {
    const x = Math.max(view.x, b.x);
    const y = Math.max(view.y, b.y);
    const r = Math.min(view.x + view.w, b.x + b.w);
    const d = Math.min(view.y + view.h, b.y + b.h);
    if (r > x && d > y) out.push({ x: Math.round(x - view.x), y: Math.round(y - view.y), w: Math.round(r - x), h: Math.round(d - y) });
  }
  return out;
}

/** whether two lists of rectangles are the same: a host tells the world only when what the HUD covers changed */
export const sameRects = (a: readonly WorldRect[], b: readonly WorldRect[]) => a.length === b.length && a.every((r, i) => r.x === b[i].x && r.y === b[i].y && r.w === b[i].w && r.h === b[i].h);

/** What a pointer can land on, from the top down: a layer's control (by its layer's place), or a world view of the page
 *  (by its part), or nothing that takes it. */
export type PointerOwner = { layer: number; control: string } | { world: string } | null;

/** The layers as a pointer meets them: each with the boxes of its controls (what of it takes input) and how it takes
 *  input; the page under them with its own controls and its world views. */
export type PointerStage = {
  layers: readonly { layer: Laid; controls: readonly (Box & { id: string })[] }[];
  page: { controls: readonly (Box & { id: string })[]; worlds: readonly (Box & { id: string })[] };
};

const inside = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** Who a pointer that lands here belongs to (hostContract.ts `input.priority` "hud"): the topmost layer's control under
 *  it; a modal layer takes it whether or not a control is (as its own background, `control` ""); what lands on no
 *  control of a layer that takes only its controls falls through; on the page a control first, then a world view. */
export function pointerOwner(stage: PointerStage, x: number, y: number): PointerOwner {
  for (let i = stage.layers.length - 1; i >= 0; i--) {
    const l = stage.layers[i];
    const hit = l.controls.find((c) => inside(c, x, y));
    if (hit) return { layer: i, control: hit.id };
    if (isModal(l.layer)) return { layer: i, control: "" };
  }
  const c = stage.page.controls.find((b) => inside(b, x, y));
  if (c) return { layer: -1, control: c.id };
  const w = stage.page.worlds.find((b) => inside(b, x, y));
  return w ? { world: w.id } : null;
}

/** A pointer's way through the layers with capture (hostContract.ts `input.capture`): where it went down decides who
 *  has it, and every move and the lift after go there too, wherever they land, until it is lifted. */
export function createPointerRouter(owner: (x: number, y: number) => PointerOwner) {
  const held = new Map<number, PointerOwner>();
  return {
    down(id: number, x: number, y: number): PointerOwner {
      const o = owner(x, y);
      held.set(id, o);
      return o;
    },
    move: (id: number): PointerOwner => held.get(id) ?? null,
    up(id: number): PointerOwner {
      const o = held.get(id) ?? null;
      held.delete(id);
      return o;
    },
  };
}
