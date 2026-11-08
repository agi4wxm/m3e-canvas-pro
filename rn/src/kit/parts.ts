import type { ImageSource } from "expo-image";

import { PARTS } from "./parts.generated";

/* A part's props with the editor's defaults under what is given: a kit component takes the same props as the part it
 * draws (parts/defs), all of them optional, so the printer writes only what differs from the defaults. */

/** the props as given, over the part's defaults */
export function withDefaults<T extends object>(slug: string, props: Partial<T>): T {
  const defaults = (PARTS[slug]?.defaults ?? {}) as Partial<T>;
  const out = { ...defaults } as Record<string, unknown>;
  for (const [k, v] of Object.entries(props)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** A picture as a part's prop holds it: an address (a link, a data URL), or a file the app bundles, as the printed
 *  app's images module requires it (Metro gives a number on a phone, an asset on the web). */
export type Picture = string | number | ImageSource;

/** a picture as expo-image's `source` takes it */
export const sourceOf = (p: Picture): ImageSource | number => (typeof p === "string" ? { uri: p } : p);

/** a row of a list prop */
export type ListRow = { label: string; icon?: string; variant?: string; width?: string; image?: Picture };

/** a whole number kept inside a range */
export const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
