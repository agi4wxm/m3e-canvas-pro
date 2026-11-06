import { View } from "@tarojs/components";
import { createContext, useContext, type ReactNode } from "react";

import { sx, type CSS } from "./styles";

/* Auto layout, as the editor's (lib/flow.ts) and the web export's flex and grid classes (parts/flow.ts) have it: a
 * direction, a gap (and one between lines), padding on each side, where parts stand across the run and how the run is
 * shared out, wrapping and a grid of columns (a CSS grid: a mini-program's web view has one). What a part asks of the
 * layout it is in (to take the room left, to stand elsewhere across, its least and most size, the columns it spans, to
 * stay where it was put) is said by the `Cell` around it, as the web wraps it in a `div` with those classes. */

export type FlowProps = {
  layout?: "free" | "row" | "column" | "grid";
  gap?: number;
  gapY?: number;
  padX?: number;
  padY?: number;
  padTop?: number;
  padRight?: number;
  padBottom?: number;
  padLeft?: number;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  wrap?: boolean;
  columns?: number;
  hugWidth?: boolean;
  hugHeight?: boolean;
};

const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };
const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" };
const GRID_ALIGN: Record<string, string> = { start: "start", center: "center", end: "end", stretch: "stretch", baseline: "baseline" };

/** the style of a view laying out what it holds */
export function flowStyle(f: FlowProps): CSS {
  const dir = f.layout ?? "column";
  const padX = f.padX ?? 0;
  const padY = f.padY ?? 0;
  const out: CSS = { boxSizing: "border-box", paddingTop: f.padTop ?? padY, paddingRight: f.padRight ?? padX, paddingBottom: f.padBottom ?? padY, paddingLeft: f.padLeft ?? padX };
  if (dir === "free") return { ...out, position: "relative" };
  const gap = f.gap ?? 0;
  const gapY = f.gapY ?? gap;
  if (dir === "grid")
    return { ...out, display: "grid", gridTemplateColumns: `repeat(${Math.max(1, Math.round(f.columns ?? 2))}, minmax(0, 1fr))`, columnGap: gap, rowGap: gapY, alignItems: GRID_ALIGN[f.align ?? "stretch"] ?? "stretch" };
  Object.assign(out, { display: "flex", flexDirection: dir, alignItems: ALIGN[f.align ?? "start"] ?? "flex-start", justifyContent: JUSTIFY[f.justify ?? "start"] ?? "flex-start" });
  if (dir === "row" && f.wrap) Object.assign(out, { flexWrap: "wrap", columnGap: gap, rowGap: gapY });
  else if (dir === "row") out.columnGap = gap;
  else out.rowGap = gap;
  return out;
}

/** which ways the layout around a part has it fill: a part takes the room of its cell on those axes */
export type Fill = { w: boolean; h: boolean };
const NO_FILL: Fill = { w: false, h: false };
const FillContext = createContext<Fill>(NO_FILL);

/** the style a part's root takes to fill its cell */
export function useFill(): CSS {
  const f = useContext(FillContext);
  return f.w || f.h ? { ...(f.w ? { alignSelf: "stretch", width: "100%" } : null), ...(f.h ? { flexGrow: 1, height: "100%" } : null) } : {};
}

/** what is held by a view that lays it out is in no cell of the one around */
export function NoFill({ children }: { children?: ReactNode }) {
  return <FillContext.Provider value={NO_FILL}>{children}</FillContext.Provider>;
}

const ACROSS: Fill = { w: true, h: false };
/** what spans the screen (a pinned bar) is as wide as it */
export function FillWidth({ children }: { children?: ReactNode }) {
  return <FillContext.Provider value={ACROSS}>{children}</FillContext.Provider>;
}

export type CellProps = {
  /** take the room left along the run */
  grow?: boolean;
  /** stretch across the run though the layout does not */
  stretch?: boolean;
  fillHeight?: boolean;
  fillWidth?: boolean;
  /** stand elsewhere across the run */
  self?: "start" | "center" | "end" | "stretch" | "baseline";
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  /** the columns of a grid it takes */
  span?: number;
  /** out of the layout: stays where it was put, from the box's top left */
  x?: number;
  y?: number;
  /** the direction of the layout it is in, which says which way `grow` reaches */
  dir?: "row" | "column" | "grid";
  children?: ReactNode;
};

/** what a part asks of the layout it is in */
export function Cell({ grow, stretch, fillHeight, fillWidth, self, minW, maxW, minH, maxH, span, x, y, dir = "column", children }: CellProps) {
  const style: CSS = { display: "flex", flexDirection: "column", boxSizing: "border-box" };
  if (x !== undefined || y !== undefined) Object.assign(style, { position: "absolute", left: x ?? 0, top: y ?? 0 });
  if (grow) Object.assign(style, { flexGrow: 1, flexShrink: 1, flexBasis: 0 }, dir === "row" ? { minWidth: 0 } : { minHeight: 0 });
  if (dir === "grid") {
    if (span && span > 1) style.gridColumn = `span ${Math.round(span)}`;
    if (self) style.justifySelf = GRID_ALIGN[self];
  } else if (stretch) style.alignSelf = "stretch";
  else if (self) style.alignSelf = ALIGN[self];
  if (minW !== undefined) style.minWidth = minW;
  if (maxW !== undefined) style.maxWidth = maxW;
  if (minH !== undefined) style.minHeight = minH;
  if (maxH !== undefined) style.maxHeight = maxH;
  const fill: Fill = {
    w: !!fillWidth || (dir === "row" ? !!grow : !!stretch || self === "stretch"),
    h: !!fillHeight || (dir === "column" ? !!grow : !!stretch || self === "stretch"),
  };
  return (
    <View style={sx(style)}>
      <FillContext.Provider value={fill}>{children}</FillContext.Provider>
    </View>
  );
}
