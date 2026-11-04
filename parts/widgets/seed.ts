import { useCallback, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from "react";

/* What the app widgets share. Their state starts from props the author can still change: the canvas
 * keeps a widget mounted while its props are edited, and the preview moves a part's `selectKey` prop
 * from outside, so the state has to follow the seed whenever the seed itself changes. */

/** state that starts at `seed`, and starts over when `seed` becomes a different value */
export function useSeeded<T>(seed: T): [T, Dispatch<SetStateAction<T>>] {
  const key = JSON.stringify(seed);
  const [held, setHeld] = useState({ key, value: seed });
  if (held.key !== key) setHeld({ key, value: seed });
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => setHeld((h) => ({ key: h.key, value: typeof next === "function" ? (next as (v: T) => T)(h.value) : next })), []);
  return [held.key === key ? held.value : seed, set];
}

/** keeps a press on a control inside a part from also counting as a press on the part */
export const stop = (e: SyntheticEvent) => e.stopPropagation();

/** a cell as a number; text with no number in it counts as nothing */
export const amountOf = (cell: string | undefined) => {
  const n = Number(String(cell ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
