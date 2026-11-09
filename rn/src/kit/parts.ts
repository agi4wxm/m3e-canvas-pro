import type { ImageSource } from "expo-image";

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

/** A picture as a part's prop holds it: an address (a link, a data URL), or a file the app bundles, as the printed
 *  app's images module requires it (Metro gives a number on a phone, an asset on the web). */
export type Picture = string | number | ImageSource;

/** a picture as expo-image's `source` takes it */
export const sourceOf = (p: Picture): ImageSource | number => (typeof p === "string" ? { uri: p } : p);

/** a row of a list prop */
export type ListRow = { label: string; icon?: string; variant?: string; width?: string; image?: Picture; /** a swatch's color (a palette's rows) */ color?: string };

/** A table prop as the printer writes it (`{ columns, rows, spec? }`), its rows as records, as the editor's row model
 *  reads them (parts/rows.ts): each cell under its column's key (the table's own structure's, else the key the part
 *  declares for that place, else its header's words), and under the declared key of its place too where the author's
 *  structure names it otherwise. Anything else is no rows. */
export function recordsOf(slug: string, prop: string, t: unknown): Record<string, string>[] {
  const table = t && typeof t === "object" ? (t as { columns?: unknown; rows?: unknown; spec?: unknown }) : {};
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const headers = Array.isArray(table.columns) ? table.columns.map(String) : [];
  const spec = Array.isArray(table.spec) ? (table.spec as { key?: unknown }[]) : [];
  const declared = PARTS[slug]?.columns?.[prop] ?? [];
  const keyOf = (header: string, at: number) => {
    const words = header.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
    if (!words.length) return `col${at + 1}`;
    const [first, ...rest] = words;
    return first.toLowerCase() + rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
  };
  const width = Math.max(headers.length, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  const keys = Array.from({ length: width }, (_, i) => (typeof spec[i]?.key === "string" && spec[i].key ? (spec[i].key as string) : (declared[i] ?? keyOf(headers[i] ?? "", i))));
  const own = new Set(keys);
  return rows.map((r) => {
    const out: Record<string, string> = {};
    (Array.isArray(r) ? r : []).forEach((x, i) => {
      const cell = x === null || x === undefined ? "" : String(x);
      out[keys[i]] ??= cell;
      if (declared[i] && !own.has(declared[i])) out[declared[i]] ??= cell;
    });
    return out;
  });
}

/** a whole number kept inside a range */
export const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));
