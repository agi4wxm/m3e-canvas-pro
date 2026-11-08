/* What the measure pass (src/editor/useMeasure.ts) remembers between passes: what each part was last measured from, the
 * baseline read with it, the size of its box in the measuring layer, and which parts are due a measure. Plain data, so
 * the rules are tested without a browser (measureBook.test.ts).
 *
 * A part is due a measure when it is new, when it is drawn from another item or on a screen of another size, when its
 * box changed size by itself (a picture, a lazy component, a stylesheet), when an overlay it floats settled, and all of
 * them when a face loaded or the measures were reset. Anything else — a selection, a panel opened, a pointer moving —
 * measures nothing. */

import type { Item } from "@/lib/tokens";

export type ScreenSize = { w: number; h: number };
type Input = { item: Item; sw?: number; sh?: number };
type Base = { w: number; h: number; base: number | undefined };

export class MeasureBook {
  /** what each part drawn now was last measured from */
  private inputs = new Map<string, Input>();
  /** each part's text baseline, with the size it was read at */
  private bases = new Map<string, Base>();
  /** the size of each part's own box in the layer when it was last measured: what a resize is told against */
  private boxes = new Map<string, ScreenSize>();
  /** parts drawn in a fit box, or still waiting for their components: measured again when an overlay settles */
  private fits = new Set<string>();
  /** parts due a measure */
  private due = new Set<string>();
  /** the lists the last `sync` read: the same lists again are nothing new */
  private items: readonly Item[] | null = null;
  private screens: ReadonlyMap<string, ScreenSize> | null = null;

  /** The parts the layer draws now. A new part, or one drawn from another item or on a screen of another size, is due;
   *  one no longer drawn is forgotten. Returns the ids forgotten. Nothing to do for the same two lists again. */
  sync(items: readonly Item[], screens: ReadonlyMap<string, ScreenSize>): string[] {
    if (items === this.items && screens === this.screens) return [];
    this.items = items;
    this.screens = screens;
    const drawn = new Set<string>();
    for (const item of items) {
      drawn.add(item.id);
      const s = screens.get(item.id);
      const was = this.inputs.get(item.id);
      if (was && was.item === item && was.sw === s?.w && was.sh === s?.h) continue;
      this.inputs.set(item.id, { item, sw: s?.w, sh: s?.h });
      this.due.add(item.id);
    }
    const gone = [...this.inputs.keys()].filter((id) => !drawn.has(id));
    for (const id of gone) this.forget(id);
    return gone;
  }

  private forget(id: string) {
    this.inputs.delete(id);
    this.bases.delete(id);
    this.boxes.delete(id);
    this.fits.delete(id);
    this.due.delete(id);
  }

  /** Every part due, its baseline read afresh: a face that loaded can move a baseline inside a box of the same size. */
  invalidateAll() {
    for (const id of this.inputs.keys()) this.due.add(id);
    this.bases.clear();
  }

  /** a part whose box was put in the layer afresh */
  touch(id: string) {
    if (this.inputs.has(id)) this.due.add(id);
  }

  /** an overlay settled: the parts drawn in a fit box, or waiting for their components, are due */
  overlaysMoved() {
    for (const id of this.fits) this.due.add(id);
  }

  /** A part's box changed size by itself (a ResizeObserver says so): due when that is not the size it was measured at.
   *  Returns whether it is now due. */
  resized(id: string, w: number, h: number): boolean {
    if (!this.inputs.has(id)) return false;
    const box = this.boxes.get(id);
    if (box && box.w === w && box.h === h) return false;
    this.due.add(id);
    return true;
  }

  /** the parts due a measure, taken: the next pass measures them */
  take(): string[] {
    const ids = [...this.due];
    this.due.clear();
    return ids;
  }

  /** whether any part is due */
  get pending(): boolean {
    return this.due.size > 0;
  }

  /** The baseline of a part that came out `w`×`h`: the one read before at that size, else `read()`'s. */
  baseline(id: string, w: number, h: number, read: () => number | undefined): number | undefined {
    const known = this.bases.get(id);
    if (known && known.w === w && known.h === h) return known.base;
    const base = read();
    this.bases.set(id, { w, h, base });
    return base;
  }

  /** what a measure of a part found: its own box in the layer, and whether it is drawn in a fit box or waiting */
  measured(id: string, box: ScreenSize, fit: boolean) {
    this.boxes.set(id, box);
    if (fit) this.fits.add(id);
    else this.fits.delete(id);
  }

  /** the most entries any of its caches holds: they follow the parts drawn, never more */
  get size(): number {
    return Math.max(this.inputs.size, this.bases.size, this.boxes.size, this.fits.size, this.due.size);
  }
}

/** The measures with what a pass found put in (an undefined value takes the key out) and the parts gone taken out,
 *  each with its height and baseline. The same object when nothing changed, so the store is told only of a change. */
export function withMeasures(cur: Readonly<Record<string, number>>, found: Readonly<Record<string, number | undefined>>, gone: readonly string[]): Record<string, number> {
  let next: Record<string, number> | null = null;
  const put = (k: string, v: number | undefined) => {
    if (v === undefined ? !(k in cur) : cur[k] === v) return;
    next ??= { ...cur };
    if (v === undefined) delete next[k];
    else next[k] = v;
  };
  for (const [k, v] of Object.entries(found)) put(k, v);
  for (const id of gone) for (const k of [id, `${id}:h`, `${id}:base`]) if (!(k in found)) put(k, undefined);
  return next ?? (cur as Record<string, number>);
}
