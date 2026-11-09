/* The clock the kit's parts read the domain's time off (a countdown to `endsAt`, a call's time from `startedAt`): the
 * back end's, as the app's transport tells it (the exported app hands in its runtime's `now`: the mocks' clock in
 * development, which can stand still or run faster), the device's only until one is handed in (a screen drawn on its
 * own, the gallery). docs/边界与契约.md: a part never takes its own wall clock for the domain's. */

let source: (() => number) | null = null;

/** Hands in the clock the parts read (the app's runtime's `now`); what it gives back hands back the one before. */
export function setClock(now: () => number): () => void {
  const was = source;
  source = now;
  return () => {
    if (source === now) source = was;
  };
}

/** the time now on the app's clock (`setClock`), in ms */
export function kitNow(): number {
  const n = source?.();
  return typeof n === "number" && Number.isFinite(n) ? n : Date.now();
}

/** the time on the other side's clock: the app's, and how far that one is ahead of it (ms) */
export const clockNow = (skew = 0) => kitNow() + (Number.isFinite(skew) ? skew : 0);
