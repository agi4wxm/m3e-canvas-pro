import { useCallback, useState, type Dispatch, type SetStateAction, type SyntheticEvent } from "react";
import type { Host } from "./host";

/* What the app widgets share: how a value the visitor enters is held (controlled, or a draft with a reset), how rows
 * keep who they are when the data moves, and how a time is read off the clock the other side names
 * (docs/组件规范.md "受控值和草稿"). */

/** State that starts at `seed`, and starts over when `seed` becomes a different value: the external reset of a draft.
 *  It is no controlled value: while the seed stays the same nothing here follows what the other side says, so a draft
 *  the other side turned down would still show. A controlled value reads the prop (`useValue`). */
export function useSeeded<T>(seed: T): [T, Dispatch<SetStateAction<T>>] {
  const key = JSON.stringify(seed);
  const [held, setHeld] = useState({ key, value: seed });
  if (held.key !== key) setHeld({ key, value: seed });
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => setHeld((h) => ({ key: h.key, value: typeof next === "function" ? (next as (v: T) => T)(h.value) : next })), []);
  return [held.key === key ? held.value : seed, set];
}

/** An input's value. While whoever draws the part takes the value (the preview, a bound variable, a form field) it is
 *  controlled: the prop is the value, a change only goes out, and a change turned down (the prop stays as it was)
 *  shows turned down. With nobody taking it (a gallery, a page with nothing bound) the prop is a default: the part
 *  keeps a draft that starts there and starts over whenever the prop changes. */
export function useValue<T>(given: T, host: Pick<Host, "controlled" | "input">): [T, (next: T) => void] {
  const [draft, setDraft] = useSeeded(given);
  const set = (next: T) => {
    if (!host.controlled) setDraft(next);
    host.input(next);
  };
  return [host.controlled ? given : draft, set];
}

/** keeps a press on a control inside a part from also counting as a press on the part */
export const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Keys rows keep while the data moves: what a row says (its first cell, its label), and which of the rows saying the
 *  same it is. A row that moves, or gains rows before it, keeps its key, so what was picked stays with it; a row that
 *  is gone takes its key with it. */
export function keysOf(words: string[]): string[] {
  const seen = new Map<string, number>();
  return words.map((w) => {
    const n = seen.get(w) ?? 0;
    seen.set(w, n + 1);
    return n ? `${w}\u0000${n}` : w;
  });
}

/** A set of picked rows by their keys, kept to the rows there are now: what was picked follows its row when rows are
 *  reordered, and drops out when its row goes. */
export function usePicked(keys: string[]): [string[], Dispatch<SetStateAction<string[]>>] {
  const [picked, setPicked] = useState<string[]>([]);
  const there = new Set(keys);
  return [picked.filter((k) => there.has(k)), setPicked];
}

/** the time now on the clock the other side keeps: the device's clock moved by how far that one is ahead (ms) */
export const clockNow = (skew = 0) => Date.now() + (Number.isFinite(skew) ? skew : 0);

/** whole seconds left until `endsAt` (ms on that clock), none once it has passed or with no end */
export const secondsLeft = (endsAt: number, skew = 0) => (endsAt > 0 ? Math.max(0, Math.ceil((endsAt - clockNow(skew)) / 1000)) : 0);

/** A number written with any of the usual marks: "$1,280.50", "+3,200.00", "€12,50", "1.234,50", "-86.40". The last
 *  mark is the decimal one when it is a point, or a comma with one or two digits after it; the others only group
 *  digits. Text with no number in it counts as nothing. For drawing (the length of a bar), never for an amount to pay. */
export const amountOf = (cell: string | undefined) => {
  const s = String(cell ?? "").replace(/[^\d.,+-]/g, "");
  if (!/\d/.test(s)) return 0;
  const sign = /^[^\d]*-/.test(s) ? -1 : 1;
  const digits = s.replace(/[+-]/g, "");
  const decimalComma = /,\d{1,2}$/.test(digits);
  const whole = decimalComma ? digits.replace(/\./g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "") : digits.replace(/,/g, "");
  /* of several points only the last can be the decimal one */
  const n = Number(whole.replace(/\.(?=.*\.)/g, ""));
  return Number.isFinite(n) ? sign * n : 0;
};
