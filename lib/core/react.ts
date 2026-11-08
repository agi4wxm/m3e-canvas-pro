/* The document core seen from React. `useStore` reads the store's state and history, and draws again whenever either
 * changes, whoever changed them: what the editor's root does, which shows nearly all of it. A component that shows a
 * slice reads it with `useStoreSelector`, and draws again only when that slice changed: a selection, a measure or a
 * step of the history elsewhere leaves it alone. */

import { useRef, useSyncExternalStore } from "react";
import type { DocStore, StoreView } from "./store";

export function useStore(store: DocStore): StoreView {
  return useSyncExternalStore(store.subscribe, store.view, store.view);
}

/** what a selector last gave: the view and the selector it read, and the slice */
export type Picked<T> = { view: StoreView; select: (v: StoreView) => T; value: T };

/** The slice `select` takes of `view`, kept the same object while it is `equal` to the one before: the same view and
 *  selector give back what they gave, and a slice equal to the last one is the last one, so React sees no change. */
export function pick<T>(last: Picked<T> | null, view: StoreView, select: (v: StoreView) => T, equal: (a: T, b: T) => boolean): Picked<T> {
  if (last && last.view === view && last.select === select) return last;
  const value = select(view);
  return { view, select, value: last && equal(last.value, value) ? last.value : value };
}

/** A slice of the store, read again on each change and drawn again only when it changed (`Object.is`, or `equal`). The
 *  selector may close over props: a new one is read on the next render. */
export function useStoreSelector<T>(store: DocStore, select: (v: StoreView) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const last = useRef<Picked<T> | null>(null);
  const read = () => (last.current = pick(last.current, store.view(), select, equal)).value;
  return useSyncExternalStore(store.subscribe, read, read);
}
