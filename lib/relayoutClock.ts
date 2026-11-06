/* After a style is picked, the screens are laid out its way in a couple of passes, each run once what the pass before
 * resized has been measured. A pass that changes no size is never measured again, so a pass still due must not be
 * waited for for ever: each one waits only so long, and the style's rules (which hold back while passes are due) come
 * back once the last has run or its time is up. Pure, so the timing can be tested without a canvas. */

export type Relayout = { left: number; until: number; together: string[][] };

/** how long all the passes after a pick may take */
export const RELAYOUT_MAX_MS = 5000;
/** how long the next pass waits for what the last one resized to be measured */
export const RELAYOUT_QUIET_MS = 1500;

/** the passes a pick sets off */
export const startRelayout = (together: string[][], now: number, passes = 2): Relayout => ({ left: passes, until: now + RELAYOUT_MAX_MS, together });

/** the passes still due once one has run: none when that was the last or the time is up, and the next waits only a while */
export function afterPass(r: Relayout, now: number): Relayout | null {
  if (r.left <= 1 || now >= r.until) return null;
  return { ...r, left: r.left - 1, until: Math.min(r.until, now + RELAYOUT_QUIET_MS) };
}

/** whether passes are still due: the rules wait for them, but never past their time */
export const relayoutDue = (r: Relayout | null, now: number): r is Relayout => !!r && now < r.until;
