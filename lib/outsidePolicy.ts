/* The open project's choice about pictures from other sites (lib/outside.ts says which those are): held back or
 * loaded. A module of its own, with nothing in it, so the projects store can set it while the tab opens, before the
 * document is drawn, without bringing in the parts registry. */

let blocked = false;
const listeners = new Set<() => void>();

/** whether outside pictures are held back in this tab now */
export const outsideBlocked = () => blocked;

/** Holds outside pictures back, or lets them load; everything drawing parts draws again. */
export function setOutsideBlocked(v: boolean) {
  if (v === blocked) return;
  blocked = v;
  for (const fn of listeners) fn();
}

/** hears the choice change; returns the unsubscribe (for `useSyncExternalStore`) */
export function subscribeOutside(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
