import { PARTS } from "./parts.generated";

/* A part's props with the editor's defaults under what is given: a kit component takes the same props as the part it
 * draws (parts/defs), all of them optional, so the printer writes only what differs from the defaults. */

/** the props as given, over the part's defaults */
export function withDefaults<T extends object>(slug: string, props: Partial<T>): T {
  const defaults = (PARTS[slug]?.defaults ?? {}) as Partial<T>;
  const out = { ...defaults } as Record<string, unknown>;
  /* an error's message is there only where something gives one (a form), so a field shows whether it is in one */
  delete out.errorText;
  for (const [k, v] of Object.entries(props)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** a row of a list prop */
export type ListRow = { label: string; icon?: string; variant?: string; width?: string; image?: string; /** a swatch's color (a palette's rows) */ color?: string };

/** a whole number kept inside a range */
export const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
