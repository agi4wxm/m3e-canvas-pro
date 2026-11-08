/* What a number typed into one of the panels' fields, or set on one of their sliders, comes out as. A field takes
 * the precision its step allows, not only the multiples of the step: a whole step (1, 4, 8) keeps whole numbers, as
 * it always has, 0.1 keeps one place, 0.25 two, and a value of its own (a variable's) keeps what was typed. */

/** a step, or "any" for a number with no step of its own */
export type Step = number | "any";

/** the places after the point a step has: 0 for a whole step, 1 for 0.1 or 0.5, 2 for 0.25 or 0.05 */
export function decimalsOf(step: Step): number | undefined {
  if (step === "any") return undefined;
  if (!Number.isFinite(step) || step <= 0) return 0;
  let d = 0;
  while (d < 10 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-9) d++;
  return d;
}

/** a number kept to `decimals` places, free of the float noise (0.30000000000000004) arithmetic leaves */
const roundTo = (n: number, decimals: number | undefined) => (decimals === undefined ? n : Math.round(n * 10 ** decimals) / 10 ** decimals);

/** The number in what was typed, to the precision of the step; nothing when it is not a number. */
export function typedNumber(text: string, step: Step = 1): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? roundTo(n, decimalsOf(step)) : undefined;
}

/** A slider's value on its steps: the nearest multiple of the step, without float noise. */
export function onStep(n: number, step: Step): number {
  if (step === "any" || !(step > 0)) return n;
  return roundTo(Math.round(n / step) * step, decimalsOf(step));
}

/** what a number field's own `step` is: the smallest change the precision allows (1 for a whole step), so the arrow
 *  keys and the browser's checks agree with what the field keeps */
export const inputStep = (step: Step): string => {
  const d = decimalsOf(step);
  return d === undefined ? "any" : String(10 ** -d);
};
