import { Children, createContext, isValidElement, useContext, type ReactElement, type ReactNode } from "react";
import { View, type DimensionValue, type ViewStyle } from "react-native";

import type { BuildViewStyle } from "./styles";

type FlexAlignType = NonNullable<ViewStyle["alignItems"]>;

/* Auto layout, as the editor's (lib/flow.ts) and the web export's flex and grid classes (parts/flow.ts) have it: a
 * direction, a gap (and one between lines), padding on each side, where parts stand across the run and how the run is
 * shared out, wrapping and a grid of columns. What a part asks of the layout it is in (to take the room left, to stand
 * elsewhere across, its least and most size, the columns it spans, to stay where it was put) is said by the `Cell`
 * around it, as the web wraps it in a `div` with those classes. */

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

const ALIGN: Record<string, FlexAlignType> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch", baseline: "baseline" };
const JUSTIFY: Record<string, ViewStyle["justifyContent"]> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between", around: "space-around", evenly: "space-evenly" };

/** the style of a view laying out what it holds */
export function flowStyle(f: FlowProps): ViewStyle {
  const dir = f.layout ?? "column";
  const padX = f.padX ?? 0;
  const padY = f.padY ?? 0;
  const out: BuildViewStyle = {
    paddingTop: f.padTop ?? padY,
    paddingRight: f.padRight ?? padX,
    paddingBottom: f.padBottom ?? padY,
    paddingLeft: f.padLeft ?? padX,
  };
  if (dir === "free") return out;
  const gap = f.gap ?? 0;
  const gapY = f.gapY ?? gap;
  if (dir === "grid") return { ...out, flexDirection: "column", rowGap: gapY };
  out.flexDirection = dir;
  out.alignItems = ALIGN[f.align ?? "start"] ?? "flex-start";
  out.justifyContent = JUSTIFY[f.justify ?? "start"] ?? "flex-start";
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
export function useFill(): ViewStyle {
  const f = useContext(FillContext);
  return f.w || f.h ? { ...(f.w ? { alignSelf: "stretch", width: "100%" as DimensionValue } : null), ...(f.h ? { flexGrow: 1, alignSelf: f.w ? "stretch" : undefined } : null) } : {};
}

/** what is held by a view that lays it out is in no cell of the one around */
export function NoFill({ children }: { children: ReactNode }) {
  return <FillContext.Provider value={NO_FILL}>{children}</FillContext.Provider>;
}

const ACROSS: Fill = { w: true, h: false };
/** what spans the screen (a pinned bar) is as wide as it */
export function FillWidth({ children }: { children: ReactNode }) {
  return <FillContext.Provider value={ACROSS}>{children}</FillContext.Provider>;
}

const DOWN: Fill = { w: false, h: true };
const BOTH: Fill = { w: true, h: true };
/** what runs down to the foot of the screen (a list of data that scrolls) is as tall as the room it is given */
export function FillDown({ across, children }: { across?: boolean; children: ReactNode }) {
  return <FillContext.Provider value={across ? BOTH : DOWN}>{children}</FillContext.Provider>;
}

export type CellProps = {
  /** take the room left along the run */
  grow?: boolean;
  /** stretch across the run though the layout does not */
  stretch?: boolean;
  /** fill the height (a grid's row, a stretched row) */
  fillHeight?: boolean;
  /** fill the width (a grid's column, a stretched column) */
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
export function Cell({ grow, stretch, fillHeight, fillWidth, self, minW, maxW, minH, maxH, x, y, dir = "column", children }: CellProps) {
  const style: BuildViewStyle = {};
  if (x !== undefined || y !== undefined) Object.assign(style, { position: "absolute", left: x ?? 0, top: y ?? 0 });
  if (grow) Object.assign(style, { flexGrow: 1, flexShrink: 1, flexBasis: 0 }, dir === "row" ? { minWidth: 0 } : { minHeight: 0 });
  if (stretch) style.alignSelf = "stretch";
  else if (self) style.alignSelf = ALIGN[self];
  if (minW !== undefined) style.minWidth = minW;
  if (maxW !== undefined) style.maxWidth = maxW;
  if (minH !== undefined) style.minHeight = minH;
  if (maxH !== undefined) style.maxHeight = maxH;
  const fill: Fill = { w: !!fillWidth || (dir === "row" ? !!grow : !!stretch || self === "stretch"), h: !!fillHeight || (dir === "column" ? !!grow : !!stretch || self === "stretch") };
  return (
    <View style={style}>
      <FillContext.Provider value={fill}>{children}</FillContext.Provider>
    </View>
  );
}

/** the columns a child of a grid takes */
const spanOf = (child: ReactNode): number => (isValidElement(child) && child.type === Cell ? Math.max(1, Math.round((child as ReactElement<CellProps>).props.span ?? 1)) : 1);

/** A grid laid out as rows of cells: React Native has no CSS grid. Each cell is as wide as the columns it spans, the
 *  last row keeps its columns, and a cell fills its column unless it asks to stand elsewhere. */
export function GridRows({ columns, gap, align, children }: { columns: number; gap: number; align?: string; children: ReactNode }) {
  const cols = Math.max(1, Math.round(columns));
  const rows: { child: ReactNode; span: number }[][] = [[]];
  let used = 0;
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || child === false) return;
    const span = Math.min(cols, spanOf(child));
    if (used + span > cols) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push({ child, span });
    used += span;
  });
  const stretch = !align || align === "stretch";
  return (
    <>
      {rows.map((row, r) => {
        const left = cols - row.reduce((n, c) => n + c.span, 0);
        return (
          <View key={r} style={{ flexDirection: "row", columnGap: gap, alignItems: ALIGN[align ?? "stretch"] ?? "stretch" }}>
            {row.map((c, i) => (
              <View key={i} style={{ flexGrow: c.span, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: stretch ? "stretch" : (ALIGN[align ?? "start"] ?? "flex-start") }}>
                <FillContext.Provider value={{ w: stretch, h: false }}>{c.child}</FillContext.Provider>
              </View>
            ))}
            {left > 0 ? <View style={{ flexGrow: left, flexShrink: 1, flexBasis: 0 }} /> : null}
          </View>
        );
      })}
    </>
  );
}
