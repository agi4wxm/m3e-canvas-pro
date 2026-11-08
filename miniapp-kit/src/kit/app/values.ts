import type { ListRow } from "../parts";

/* How a value an expression reads becomes what a prop takes, as the editor's preview makes it (lib/interact.ts
 * `exprValue`): a list of rows, the place of a choice among a part's options. */

const words = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

/** a list an expression reads, as a part's rows (each its label, icon, picture and state); anything else keeps the design's */
export function rowsOf(v: unknown, design: ListRow[], max = 50): ListRow[] {
  if (!Array.isArray(v)) return design;
  return v.slice(0, max).map((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return { label: words(x) };
    const r = x as Record<string, unknown>;
    /* a row keeps the state its part reads from `variant` and `width`, as the editor's preview does */
    return { label: words(r.label ?? r.name ?? r.title ?? ""), ...(typeof r.icon === "string" ? { icon: r.icon } : {}), ...(typeof r.image === "string" ? { image: r.image } : {}), ...(typeof r.variant === "string" ? { variant: r.variant } : {}), ...(typeof r.width === "string" ? { width: r.width } : {}) };
  });
}

/** the place of a value among a choice's options, or -1 */
export const optionIndex = (labels: string[], value: unknown): number => (value === undefined || value === null ? -1 : labels.indexOf(String(value)));
