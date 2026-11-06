import type { CSSProperties } from "react";

/** A style as Taro takes it: CSS properties in camelCase (custom properties as they are), numbers in px. A line height
 *  and a z-index go as strings: Taro would read a bare number as a multiple of the size, and as px. */
export type CSS = Record<string, string | number | undefined>;

/** styles laid over one another, later ones winning; what is undefined is left out */
export function merge(...styles: (CSS | undefined | null | false)[]): CSS {
  const out: CSS = {};
  for (const s of styles) if (s) for (const [k, v] of Object.entries(s)) if (v !== undefined) out[k] = v;
  return out;
}

/** a style as a component's `style` prop takes it */
export const sx = (...styles: (CSS | undefined | null | false)[]): CSSProperties => merge(...styles) as CSSProperties;

/** a row of things side by side, centered across */
export const ROW: CSS = { display: "flex", flexDirection: "row", alignItems: "center" };
/** a column of things */
export const COL: CSS = { display: "flex", flexDirection: "column" };
/** the box takes its own size and keeps its children out of the flow around it */
export const BOX: CSS = { boxSizing: "border-box" };
/** the platform's own field with none of its own dress (the web draws an <input> with a face, a ground and a border of
 *  its own): the kit's field around it is what shows */
export const BARE: CSS = { fontFamily: "inherit", backgroundColor: "transparent", border: "none", outline: "none", padding: 0, margin: 0, resize: "none" };
