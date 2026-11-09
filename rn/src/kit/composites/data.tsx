import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text as RNText, TextInput, View, type LayoutChangeEvent, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Ellipse, Line, Path, Polygon, Rect } from "react-native-svg";

import type { PartBase } from "../atoms/basics";
import { Checkbox, Input } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { withDefaults } from "../parts";
import { fieldStyle } from "../recipes";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* The data and chart parts on a phone, drawn as the canvas draws them (parts/defs/data.ts, app.ts, more.ts and the
 * widgets in parts/widgets): charts with react-native-svg, tables as rows of views, a month of things in it, a board of
 * cards, a small Markdown renderer of the kit's own. Every part reads the author's table (`{ columns, rows, spec? }`)
 * by place, as the printer hands it already lined up with the columns the part reads (docs/组件规范.md "表格"); a table
 * bound to data still shows the design's rows in an exported app (the export reports it). What a visitor asks of a part
 * (a search, a sort, a page, a month, a day, a card moved) is a draft that starts at the props and starts over when they
 * change, and goes out through a callback (`onSearch`, `onMove`…): which card is in which lane, which rows there are,
 * stay the data's. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";
/** the canvas's `opacity-70` on secondary words */
const SOFT = 0.7;
/** a control of the part's own that nothing is wired to: pressing it is no press of the whole part */
const noop = () => {};

/* ---------- tables, as the parts read them ---------- */

export type TableColumn = { key: string; label?: string; type?: string; width?: number; align?: "start" | "center" | "end"; format?: string };
export type TableData = { columns: string[]; rows: string[][]; spec?: TableColumn[] };

const wordsOf = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" || typeof x === "boolean" ? String(x) : "");

/** A table prop as it came: words in every cell; anything that is not a table is an empty one (a saved file can hold
 *  anything, and a part never breaks on it). */
export function tableOf(v: unknown): TableData {
  const t = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as { columns?: unknown; rows?: unknown; spec?: unknown };
  const spec = Array.isArray(t.spec) ? (t.spec.filter((s) => !!s && typeof s === "object" && typeof (s as TableColumn).key === "string") as TableColumn[]) : undefined;
  return {
    columns: Array.isArray(t.columns) ? t.columns.map(wordsOf) : [],
    rows: Array.isArray(t.rows) ? t.rows.filter(Array.isArray).map((r: unknown[]) => r.map(wordsOf)) : [],
    ...(spec ? { spec } : {}),
  };
}

/** a key as data names a column: its header's words in camelCase ("Due date" → "dueDate"), else its place (parts/tables.ts) */
const keyOfHeader = (header: string, at: number): string => {
  const words = header.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return `col${at + 1}`;
  const [first, ...rest] = words;
  return first.toLowerCase() + rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
};

/** the structure of a table's columns, the author's own where the table has one (parts/tables.ts `columnsOf`) */
export function columnsOf(t: TableData): TableColumn[] {
  return t.columns.map((header, i) => {
    const given = t.spec?.[i];
    return { ...given, key: given?.key || keyOfHeader(header, i), label: header };
  });
}

/** where a column's words stand: numbers at the end unless the column says otherwise */
export const alignOf = (col: TableColumn | undefined): "start" | "center" | "end" => col?.align ?? (col?.type === "number" || col?.type === "currency" || col?.type === "percent" ? "end" : "start");

/** A cell as its column writes it, as the canvas writes it (parts/tables.ts `formatCell`, in English): a number with
 *  its decimals and grouping, an amount in its currency, a share as a percent, a day, yes or no; anything else as given. */
export function formatCell(value: string, col: TableColumn | undefined, locale = "en"): string {
  const type = col?.type ?? "text";
  if (type === "text" || value.trim() === "") return value;
  try {
    if (type === "bool") return /^(true|yes|1)$/i.test(value.trim()) ? "✓" : /^(false|no|0)$/i.test(value.trim()) ? "—" : value;
    if (type === "date") {
      const t = Date.parse(value);
      return Number.isFinite(t) ? new Date(t).toLocaleDateString(locale, { timeZone: "UTC" }) : value;
    }
    const n = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(n)) return value;
    const digits = /^\d$/.test(col?.format ?? "") ? Number(col!.format) : undefined;
    const fixed = digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : {};
    if (type === "currency") return new Intl.NumberFormat(locale, { style: "currency", currency: /^[A-Z]{3}$/.test(col?.format ?? "") ? col!.format! : "USD" }).format(n);
    if (type === "percent") return new Intl.NumberFormat(locale, { style: "percent", ...fixed }).format(n);
    return new Intl.NumberFormat(locale, fixed).format(n);
  } catch {
    return value;
  }
}

/** a cell as a number: the canvas's `amountOf` (parts/widgets/seed.ts), so "$1,350.00" and "54%" read as they do there */
export function amountOf(cell: string | undefined): number {
  const s = String(cell ?? "").replace(/[^\d.,+-]/g, "");
  if (!/\d/.test(s)) return 0;
  const sign = /^[^\d]*-/.test(s) ? -1 : 1;
  const digits = s.replace(/[+-]/g, "");
  const decimalComma = /,\d{1,2}$/.test(digits);
  const whole = decimalComma ? digits.replace(/\./g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "") : digits.replace(/,/g, "");
  const n = Number(whole.replace(/\.(?=.*\.)/g, ""));
  return Number.isFinite(n) ? sign * n : 0;
}

/** a chart's cell as a number: the canvas's (parts/defs/data.ts `value`), text it cannot draw counting as nothing */
const valueOf = (cell: string | undefined) => {
  const n = Number(String(cell ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Keys rows keep while the data moves: what a row says, and which of the rows saying the same it is (seed.ts `keysOf`). */
export function keysOf(words: string[]): string[] {
  const seen = new Map<string, number>();
  return words.map((w) => {
    const n = seen.get(w) ?? 0;
    seen.set(w, n + 1);
    return n ? `${w}\u0000${n}` : w;
  });
}

/** A draft that starts at `seed` and starts over whenever `seed` becomes a different value (the external reset of
 *  docs/组件规范.md "受控值和草稿", as parts/widgets/seed.ts `useSeeded` has it): the seed it started from is kept beside
 *  it, and a new seed replaces both while drawing, so going back to an earlier seed starts over too. */
export function useDraft<T>(seed: T): [T, (next: T) => void] {
  const key = JSON.stringify(seed) ?? "";
  const [held, setHeld] = useState<{ key: string; value: T }>({ key, value: seed });
  if (held.key !== key) setHeld({ key, value: seed });
  return [held.key === key ? held.value : seed, (value: T) => setHeld({ key, value })];
}

/** a part's title and the line under it, as the dashboard parts set them */
function Heading({ title, subtitle }: { title?: string; subtitle?: string }) {
  const kit = useKit();
  return (
    <>
      {title ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{title}</RNText> : null}
      {subtitle ? <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>{subtitle}</RNText> : null}
    </>
  );
}

/** the width a part draws its plot at: what it measures once laid out (it may fill its cell), the design's until then */
function useMeasured(design: number): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w > 0 ? w : design, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/* ---------- charts ---------- */

/** the roles a chart's series are drawn in: M3E's five chart colors (styles/m3e.css `--chart-1`…`--chart-5`) */
export const CHART_ROLES = ["primary", "tertiary", "secondary", "primary-fixed-dim", "tertiary-fixed-dim"] as const;
export const chartRole = (i: number) => CHART_ROLES[((i % 5) + 5) % 5];

/** The top of a value axis as Recharts makes it with five ticks: the step rounded up to a twentieth of its power of
 *  ten (305 → 80 a step, 320 at the top). */
export function niceTop(max: number, ticks = 5): number {
  if (!(max > 0)) return ticks - 1;
  const rough = max / (ticks - 1);
  const power = 10 ** (Math.floor(Math.log10(rough)) + 1);
  const step = (Math.ceil(Math.round((rough / power) * 1e6) / 1e6 / 0.05) * 0.05 * power);
  return Number((step * (ticks - 1)).toPrecision(12));
}

/** a chart's table as names along the axis and series of values: the first column names a point, the rest are series */
export function seriesOf(t: TableData): { names: string[]; series: { label: string; values: number[] }[] } {
  return { names: t.rows.map((r) => r[0] ?? ""), series: t.columns.slice(1).map((label, i) => ({ label, values: t.rows.map((r) => valueOf(r[i + 1])) })) };
}

/** a point at an angle (degrees, counterclockwise from three o'clock, as Recharts' polar charts measure it) */
const polar = (cx: number, cy: number, r: number, deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy - r * Math.sin((deg * Math.PI) / 180) });

/** a ring's slice between two angles, as a path */
function slice(cx: number, cy: number, inner: number, outer: number, from: number, to: number): string {
  const sweep = Math.min(359.999, to - from);
  const big = sweep > 180 ? 1 : 0;
  const a = polar(cx, cy, outer, from);
  const b = polar(cx, cy, outer, from + sweep);
  const d = polar(cx, cy, inner, from + sweep);
  const e = polar(cx, cy, inner, from);
  return `M${a.x} ${a.y}A${outer} ${outer} 0 ${big} 0 ${b.x} ${b.y}L${d.x} ${d.y}A${inner} ${inner} 0 ${big} 1 ${e.x} ${e.y}Z`;
}

type AxisLabel = { x: number; y: number; text: string; anchor: "start" | "middle" | "end" };

export type ChartProps = PartBase & { type?: "bar" | "line" | "area" | "stacked-bar" | "pie" | "radar" | string; title?: string; subtitle?: string; data?: TableData; width?: number; height?: number };

/** A chart of the author's table, as Recharts draws it on the canvas: bars side by side or stacked, lines, areas, a
 *  ring, a radar; the grid across, the names along the foot. Hovering shows values on the canvas; a phone shows none. */
export function Chart(props: ChartProps) {
  const p = withDefaults<ChartProps>("chart", props);
  const kit = useKit();
  const fill = useFill();
  const design = Math.round(p.width ?? 420);
  const [w, measure] = useMeasured(design);
  const h = Math.round(p.height ?? 220);
  const { names, series } = seriesOf(tableOf(p.data));
  const type = p.type ?? "bar";
  const grid = c(kit, "outline-variant");
  const shapes: ReactNode[] = [];
  const labels: AxisLabel[] = [];
  if (type === "pie" || type === "radar") {
    const cx = w / 2;
    const cy = h / 2;
    const most = Math.max(0, Math.min(w - 10, h - 10) / 2);
    const outer = most * 0.8;
    if (type === "pie") {
      const vs = series[0]?.values ?? [];
      const total = vs.reduce((a, v) => a + Math.max(0, v), 0);
      let at = 0;
      vs.forEach((v, i) => {
        if (total <= 0 || v <= 0) return;
        const span = (Math.max(0, v) / total) * 360;
        shapes.push(<Path key={`s${i}`} d={slice(cx, cy, most * 0.5, outer, at, at + span)} fill={c(kit, chartRole(i))} />);
        at += span;
      });
    } else {
      const n = Math.max(1, names.length);
      const top = niceTop(Math.max(0, ...series.flatMap((s) => s.values)));
      const angle = (i: number) => 90 - (i * 360) / n;
      for (let t = 1; t <= 4; t++) shapes.push(<Polygon key={`g${t}`} points={names.map((_, i) => polar(cx, cy, (outer * t) / 4, angle(i))).map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke={grid} strokeWidth={1} />);
      names.forEach((name, i) => {
        const q = polar(cx, cy, outer, angle(i));
        shapes.push(<Line key={`r${i}`} x1={cx} y1={cy} x2={q.x} y2={q.y} stroke={grid} strokeWidth={1} />);
        const l = polar(cx, cy, outer + 12, angle(i));
        const cos = Math.cos((angle(i) * Math.PI) / 180);
        labels.push({ x: l.x, y: l.y - 8, text: name, anchor: Math.abs(cos) < 0.1 ? "middle" : cos > 0 ? "start" : "end" });
      });
      series.forEach((s, k) => {
        const pts = s.values.map((v, i) => polar(cx, cy, (Math.max(0, v) / top) * outer, angle(i)));
        shapes.push(<Polygon key={`p${k}`} points={pts.map((q) => `${q.x},${q.y}`).join(" ")} fill={c(kit, chartRole(k))} fillOpacity={0.3} stroke={c(kit, chartRole(k))} strokeWidth={1} />);
      });
    }
  } else {
    /* the margins Recharts leaves, more at the sides where a line runs from edge to edge, and the axis's band */
    const side = type === "line" || type === "area" ? 16 : 5;
    const left = side;
    const plotW = Math.max(1, w - side * 2);
    const plotTop = 5;
    const plotBottom = Math.max(plotTop + 1, h - 5 - 30);
    const stacked = type === "stacked-bar";
    const sums = names.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
    const top = niceTop(Math.max(0, ...(stacked ? sums : series.flatMap((s) => s.values))));
    const y = (v: number) => plotBottom - (Math.max(0, v) / top) * (plotBottom - plotTop);
    for (let t = 0; t <= 4; t++) {
      const gy = plotTop + ((plotBottom - plotTop) * t) / 4;
      shapes.push(<Line key={`g${t}`} x1={left} x2={left + plotW} y1={gy} y2={gy} stroke={grid} strokeWidth={1} />);
    }
    const n = names.length;
    const band = n ? plotW / n : plotW;
    const point = (i: number) => (n > 1 ? left + (i / (n - 1)) * plotW : left + plotW / 2);
    const xOf = (i: number) => (type === "line" || type === "area" ? point(i) : left + band * i + band / 2);
    names.forEach((name, i) => labels.push({ x: xOf(i), y: plotBottom + 8, text: name, anchor: "middle" }));
    if (type === "line" || type === "area")
      series.forEach((s, k) => {
        const line = s.values.map((v, i) => `${i ? "L" : "M"}${point(i)} ${y(v)}`).join("");
        if (!line) return;
        if (type === "area") shapes.push(<Path key={`a${k}`} d={`${line}L${point(s.values.length - 1)} ${plotBottom}L${point(0)} ${plotBottom}Z`} fill={c(kit, chartRole(k))} fillOpacity={0.3} />);
        shapes.push(<Path key={`l${k}`} d={line} fill="none" stroke={c(kit, chartRole(k))} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />);
      });
    else if (stacked)
      names.forEach((_, i) => {
        let base = plotBottom;
        series.forEach((s, k) => {
          const hgt = plotBottom - y(s.values[i] ?? 0);
          if (hgt <= 0) return;
          base -= hgt;
          shapes.push(<Rect key={`b${i}-${k}`} x={left + band * i + band * 0.1} y={base} width={band * 0.8} height={hgt} fill={c(kit, chartRole(k))} />);
        });
      });
    else {
      const k = Math.max(1, series.length);
      const barW = Math.max(1, (band * 0.8 - (k - 1) * 4) / k);
      names.forEach((_, i) =>
        series.forEach((s, j) => {
          const top_ = y(s.values[i] ?? 0);
          const hgt = plotBottom - top_;
          if (hgt <= 0) return;
          shapes.push(<Rect key={`b${i}-${j}`} x={left + band * i + band * 0.1 + j * (barW + 4)} y={top_} width={barW} height={hgt} rx={Math.min(4, barW / 2, hgt / 2)} fill={c(kit, chartRole(j))} />);
        }),
      );
    }
  }
  const said = `${p.title ?? ""} ${series.map((s) => `${s.label}: ${s.values.join(", ")}`).join("; ")}`.trim();
  return (
    <Surface base={{ width: design, rowGap: 4, ...fill }} appearance={p} testID={p.testID}>
      <Heading title={p.title} subtitle={p.subtitle} />
      <View testID={p.testID ? `${p.testID}-plot` : "chart-plot"} accessible accessibilityRole="image" accessibilityLabel={said} onLayout={measure} style={{ alignSelf: "stretch", height: h }}>
        <Svg width={w} height={h}>{shapes}</Svg>
        {labels.map((l, i) => (
          <RNText key={i} numberOfLines={1} style={{ position: "absolute", top: l.y, width: 96, left: l.anchor === "middle" ? l.x - 48 : l.anchor === "start" ? l.x : l.x - 96, textAlign: l.anchor === "middle" ? "center" : l.anchor === "start" ? "left" : "right", ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>
            {l.text}
          </RNText>
        ))}
      </View>
    </Surface>
  );
}

export type ScatterPlotProps = PartBase & { title?: string; subtitle?: string; data?: TableData; width?: number; height?: number };

/** points of two columns, x and y, over the corner of two axes: the canvas's drawing, stretched to the plot */
export function ScatterPlot(props: ScatterPlotProps) {
  const p = withDefaults<ScatterPlotProps>("scatter-plot", props);
  const kit = useKit();
  const fill = useFill();
  const pts = tableOf(p.data).rows.map((r) => [valueOf(r[0]), valueOf(r[1])] as const);
  const span = (axis: 0 | 1) => {
    const all = pts.map((q) => q[axis]);
    const lo = Math.min(...all, 0);
    const hi = Math.max(...all, lo + 1);
    return (v: number) => ((v - lo) / (hi - lo)) * 100;
  };
  const [sx, sy] = [span(0), span(1)];
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), rowGap: 4, ...fill }} appearance={p} testID={p.testID}>
      <Heading title={p.title} subtitle={p.subtitle} />
      <View accessible accessibilityRole="image" accessibilityLabel={`${p.title ?? ""} ${pts.map((q) => `${q[0]}, ${q[1]}`).join("; ")}`.trim()} style={{ alignSelf: "stretch", height: Math.round(p.height ?? 200), borderLeftWidth: 1, borderBottomWidth: 1, borderColor: c(kit, "outline-variant") }}>
        <Svg width="100%" height="100%" viewBox="-4 -4 108 108" preserveAspectRatio="none">
          {pts.map((q, i) => (
            <Ellipse key={i} cx={sx(q[0])} cy={100 - sy(q[1])} rx={1.6} ry={2.2} fill={c(kit, "primary")} />
          ))}
        </Svg>
      </View>
    </Surface>
  );
}

export type HeatmapProps = PartBase & { title?: string; subtitle?: string; data?: TableData; width?: number };

/** a grid of cells in the accent, each as strong as its value is among the rest, the columns named over it */
export function Heatmap(props: HeatmapProps) {
  const p = withDefaults<HeatmapProps>("heatmap", props);
  const kit = useKit();
  const fill = useFill();
  const { columns, rows } = tableOf(p.data);
  const top = Math.max(1, ...rows.flat().map(valueOf));
  const cols = Math.max(1, columns.length);
  const cell: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 };
  return (
    <Surface base={{ width: Math.round(p.width ?? 320), rowGap: 4, ...fill }} appearance={p} testID={p.testID}>
      <Heading title={p.title} subtitle={p.subtitle} />
      <View style={{ flexDirection: "row", columnGap: 4 }}>
        {Array.from({ length: cols }, (_, i) => (
          <RNText key={i} numberOfLines={1} style={{ ...cell, textAlign: "center", ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant") }}>
            {columns[i] ?? ""}
          </RNText>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", columnGap: 4 }}>
          {Array.from({ length: cols }, (_, i) => (
            <View key={i} accessible accessibilityLabel={`${columns[i] ?? ""} ${row[i] ?? ""}`.trim()} style={{ ...cell, height: 24, borderRadius: corner(kit, "xs"), backgroundColor: c(kit, "primary"), opacity: 0.1 + (valueOf(row[i]) / top) * 0.9 }} />
          ))}
        </View>
      ))}
    </Surface>
  );
}

export type GaugeProps = PartBase & { label?: string; value?: number };

/** half a ring filled as far as the value, the value under it in large figures and the label under that */
export function Gauge(props: GaugeProps) {
  const p = withDefaults<GaugeProps>("gauge", props);
  const kit = useKit();
  const v = Math.max(0, Math.min(100, Math.round(Number.isFinite(p.value) ? (p.value as number) : 0)));
  const end = polar(60, 60, 50, 180 - v * 1.8);
  return (
    <Surface base={{ width: 160, alignItems: "center" }} appearance={p} testID={p.testID}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel={p.label || undefined} accessibilityValue={{ min: 0, max: 100, now: v }}>
        <Svg width={160} height={88} viewBox="0 0 120 66">
          <Path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" strokeWidth={10} strokeLinecap="round" stroke={c(kit, "surface-container-highest")} />
          {v > 0 ? <Path d={`M 10 60 A 50 50 0 0 1 ${end.x} ${end.y}`} fill="none" strokeWidth={10} strokeLinecap="round" stroke={c(kit, "primary")} /> : null}
        </Svg>
      </View>
      <RNText style={{ ...typeStyle(kit, "title-large"), color: c(kit, "on-surface") }}>{`${v}%`}</RNText>
      {p.label ? <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>{p.label}</RNText> : null}
    </Surface>
  );
}

/* ---------- a table ---------- */

export type TableProps = PartBase & { title?: string; data?: TableData; caption?: string; /** the row picked, from 0 (-1: none) */ selectedRow?: number; alignLast?: boolean; width?: number };

const TEXT_ALIGN = { start: "left", center: "center", end: "right" } as const;

/** How wide each column stands: its own width where its structure gives one, else a share of what is left as large as
 *  its longest words, as a browser lays out a table that fits. */
export function columnWidths(t: TableData, cols: TableColumn[] | undefined): { width?: number; grow: number }[] {
  return t.columns.map((head, i) => {
    const own = cols?.[i]?.width;
    if (own) return { width: Math.round(own), grow: 0 };
    return { grow: Math.max(4, head.length, ...t.rows.map((r) => (r[i] ?? "").length)) };
  });
}

/** The author's table: a header row, a row for each of theirs and a line between, a selected row tinted. With a column
 *  structure of its own each column has its width, where its words stand and how its values are written (parts/tables.ts);
 *  without one it draws as it always did, the last column to the right when the author asks. */
export function Table(props: TableProps) {
  const p = withDefaults<TableProps>("table", props);
  const kit = useKit();
  const fill = useFill();
  const t = tableOf(p.data);
  const spec = t.spec ? columnsOf(t) : undefined;
  const align = (i: number) => (spec ? alignOf(spec[i]) : p.alignLast && i === t.columns.length - 1 ? "end" : "start");
  const sizes = columnWidths(t, spec);
  const cellBox = (i: number): ViewStyle => ({ paddingHorizontal: 16, justifyContent: "center", ...(sizes[i].width ? { width: sizes[i].width } : { flexGrow: sizes[i].grow, flexShrink: 1, flexBasis: 0, minWidth: 0 }) });
  const line = c(kit, "outline-variant");
  /* the row picked, counted from 0 (-1: none) */
  const chosen = Math.round(p.selectedRow ?? -1);
  return (
    <Surface base={{ width: Math.round(p.width ?? 420), ...fill }} appearance={p} testID={p.testID}>
      {p.title ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface"), paddingHorizontal: 16, paddingVertical: 8 }}>{p.title}</RNText> : null}
      <View accessibilityRole="grid">
        <View style={{ flexDirection: "row", height: 56, borderBottomWidth: 1, borderBottomColor: line }}>
          {t.columns.map((head, i) => (
            <View key={i} style={cellBox(i)}>
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface-variant"), textAlign: TEXT_ALIGN[align(i)] }}>{head}</RNText>
            </View>
          ))}
        </View>
        {t.rows.map((row, r) => {
          const on = chosen === r;
          return (
            <View key={r} accessibilityState={{ selected: on }} style={{ flexDirection: "row", height: 52, borderBottomWidth: r === t.rows.length - 1 ? 0 : 1, borderBottomColor: line, backgroundColor: on ? c(kit, "secondary-container") : undefined }}>
              {t.columns.map((_, i) => (
                <View key={i} style={cellBox(i)}>
                  <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, on ? "on-secondary-container" : "on-surface"), textAlign: TEXT_ALIGN[align(i)] }}>
                    {spec ? formatCell(row[i] ?? "", spec[i]) : (row[i] ?? "")}
                  </RNText>
                </View>
              ))}
            </View>
          );
        })}
      </View>
      {p.caption ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant"), marginTop: 16, textAlign: "center" }}>{p.caption}</RNText> : null}
    </Surface>
  );
}

/* ---------- Markdown ---------- */

export type MarkBlock = { kind: "code"; text: string } | { kind: "heading"; level: 1 | 2 | 3; text: string } | { kind: "list"; items: string[] } | { kind: "quote"; text: string } | { kind: "paragraph"; text: string };
export type MarkSpan = { kind: "text" | "bold" | "code"; text: string };

/** The blocks of the Markdown the canvas renders (parts/widgets/Content.tsx), and no more: fenced code, three levels of
 *  heading, a list of "- " or "* " lines, a quoted line and paragraphs. No HTML passes: everything is words. */
export function markdownBlocks(text: string): MarkBlock[] {
  const out: MarkBlock[] = [];
  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      out.push({ kind: "code", text: code.join("\n") });
    } else if (/^#{1,3} /.test(line)) {
      const level = line.indexOf(" ") as 1 | 2 | 3;
      out.push({ kind: "heading", level, text: line.slice(level + 1) });
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      for (; i < lines.length && /^[-*] /.test(lines[i]); i++) items.push(lines[i].slice(2));
      i--;
      out.push({ kind: "list", items });
    } else if (line.startsWith("> ")) out.push({ kind: "quote", text: line.slice(2) });
    else out.push({ kind: "paragraph", text: line });
  }
  return out;
}

/** a line's marks: bold and inline code, all the canvas reads */
export function markdownSpans(line: string): MarkSpan[] {
  return line
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((bit) => bit !== "")
    .map((bit) => (bit.startsWith("**") && bit.endsWith("**") && bit.length > 4 ? { kind: "bold", text: bit.slice(2, -2) } : bit.startsWith("`") && bit.endsWith("`") && bit.length > 2 ? { kind: "code", text: bit.slice(1, -1) } : { kind: "text", text: bit }));
}

const MONO = "monospace";

export type MarkdownProps = PartBase & { text?: string; width?: number };

/** the author's Markdown as the canvas draws it: headings in the type ramp, bullets, a quote with a rule beside it, code
 *  on a darker ground */
export function Markdown(props: MarkdownProps) {
  const p = withDefaults<MarkdownProps>("markdown", props);
  const kit = useKit();
  const fill = useFill();
  const body: TextStyle = { ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") };
  const inline = (line: string, style: TextStyle = body, header = false) => (
    <RNText style={style} accessibilityRole={header ? "header" : undefined}>
      {markdownSpans(line).map((s, i) =>
        s.kind === "bold" ? (
          <RNText key={i} style={{ fontWeight: "700" }}>{s.text}</RNText>
        ) : s.kind === "code" ? (
          <RNText key={i} style={{ fontFamily: MONO, backgroundColor: c(kit, "surface-container-highest") }}>{` ${s.text} `}</RNText>
        ) : (
          s.text
        ),
      )}
    </RNText>
  );
  const HEADS = ["headline-small", "title-large", "title-medium"] as const;
  return (
    <Surface base={{ width: Math.round(p.width ?? 420), rowGap: 8, ...fill }} appearance={p} testID={p.testID}>
      {markdownBlocks(p.text ?? "").map((b, i) => {
        switch (b.kind) {
          case "code":
            return (
              <ScrollView key={i} horizontal style={{ borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-highest") }} contentContainerStyle={{ padding: 12 }}>
                <RNText style={{ fontFamily: MONO, ...typeStyle(kit, "body-small"), color: c(kit, "on-surface") }}>{b.text}</RNText>
              </ScrollView>
            );
          case "heading":
            return (
              <View key={i}>{inline(b.text, { ...typeStyle(kit, HEADS[b.level - 1]), color: c(kit, "on-surface") }, true)}</View>
            );
          case "list":
            return (
              <View key={i} accessibilityRole="list" style={{ paddingLeft: 8 }}>
                {b.items.map((it, k) => (
                  <View key={k} style={{ flexDirection: "row", columnGap: 8 }}>
                    <RNText style={body}>•</RNText>
                    <View style={{ flex: 1 }}>{inline(it)}</View>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={i} style={{ borderLeftWidth: 4, borderLeftColor: c(kit, "outline-variant"), paddingLeft: 12 }}>
                {inline(b.text, { ...body, color: c(kit, "on-surface-variant") })}
              </View>
            );
          default:
            return <View key={i}>{inline(b.text)}</View>;
        }
      })}
    </Surface>
  );
}

/* ---------- small measures ---------- */

const PAD = 4;

/** the values of a sparkline as the part holds them: words with commas between ("420,512"), or numbers */
export const sparkValues = (v: unknown): number[] =>
  (Array.isArray(v) ? v : String(v ?? "").split(","))
    .map((x) => (typeof x === "number" ? x : String(x).trim()))
    .filter((x) => x !== "")
    .map(Number)
    .filter(Number.isFinite);

export type SparklineProps = PartBase & { title?: string; value?: string; trend?: string; values?: string | number[]; kind?: "line" | "area" | "bar" | string; height?: number; width?: number };

/** A small trend: its title, its value and change, and the line (or area, or bars) of its values. A finger along it
 *  reads the value under it, as the pointer does on the canvas. */
export function Sparkline(props: SparklineProps) {
  const p = withDefaults<SparklineProps>("sparkline", props);
  const kit = useKit();
  const values = sparkValues(p.values);
  const [at, setAt] = useState(-1);
  const width = Math.round(p.width ?? 200);
  const height = Math.round(p.height ?? 48);
  /* the box's padding is 12 either side: the plot is drawn at its real size, so a stroke stays 2 wide */
  const w = Math.max(24, width - 24);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, lo + 1);
  const x = (i: number) => (values.length > 1 ? PAD + (i / (values.length - 1)) * (w - PAD * 2) : w / 2);
  const y = (v: number) => height - PAD - ((v - lo) / (hi - lo)) * (height - PAD * 2);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const bar = values.length ? Math.max(2, (w - PAD * 2) / values.length - 2) : 0;
  const shown = at >= 0 && at < values.length ? String(values[at]) : (p.value ?? "");
  const last = at >= 0 ? at : values.length - 1;
  const down = (p.trend ?? "").startsWith("-");
  const follow = (lx: number) => {
    if (values.length) setAt(Math.min(values.length - 1, Math.max(0, Math.round((lx / w) * (values.length - 1)))));
  };
  const primary = c(kit, "primary");
  return (
    <Surface base={{ width, padding: 12, rowGap: 4, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low") }} appearance={p} testID={p.testID}>
      {p.title ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), opacity: SOFT }}>{p.title}</RNText> : null}
      {shown || p.trend ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", columnGap: 8 }}>
          <RNText style={{ ...typeStyle(kit, "title-large"), color: c(kit, "on-surface"), fontVariant: ["tabular-nums"] }}>{shown}</RNText>
          {p.trend ? (
            <View style={{ flexDirection: "row", alignItems: "center", columnGap: 2 }}>
              <Glyph name={down ? "arrow_downward" : "arrow_upward"} size={14} color={c(kit, down ? "error" : "primary")} />
              <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface") }}>{p.trend}</RNText>
            </View>
          ) : null}
        </View>
      ) : null}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${p.title ?? ""} ${values.join(", ")}`.trim()}
        style={{ width: w, height }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => follow(e.nativeEvent.locationX)}
        onResponderMove={(e) => follow(e.nativeEvent.locationX)}
        onResponderRelease={() => setAt(-1)}
        onResponderTerminate={() => setAt(-1)}
      >
        <Svg width={w} height={height}>
          {p.kind === "bar"
            ? values.map((v, i) => <Rect key={i} x={PAD + (i * (w - PAD * 2)) / values.length + 1} y={y(v)} width={bar} height={Math.max(1, height - PAD - y(v))} rx={2} fill={primary} opacity={at >= 0 && at !== i ? 0.4 : 1} />)
            : [
                p.kind === "area" && values.length > 1 ? <Path key="area" d={`${line} L${x(values.length - 1).toFixed(1)} ${height - PAD} L${x(0).toFixed(1)} ${height - PAD} Z`} fill={primary} opacity={0.15} /> : null,
                <Path key="line" d={line} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" stroke={primary} />,
                at >= 0 ? <Line key="at" x1={x(at)} x2={x(at)} y1={0} y2={height} strokeWidth={1} stroke={c(kit, "outline-variant")} /> : null,
                last >= 0 ? <Circle key="dot" cx={x(last)} cy={y(values[last])} r={3} strokeWidth={2} fill={primary} stroke={c(kit, "surface-container-low")} /> : null,
              ]}
        </Svg>
      </View>
    </Surface>
  );
}

export type BarListProps = PartBase & { title?: string; data?: TableData; sorted?: boolean; selected?: number; width?: number; onSelect?: (index: number) => void };

/** A row's share is the data's: its third column ("54%") is what the bars stand in; an older table with no shares draws
 *  them by their values. The open row is `selected`, which whoever draws the list moves; a tap on a row runs its own. */
export function BarList(props: BarListProps) {
  const p = withDefaults<BarListProps>("bar-list", props);
  const kit = useKit();
  const fill = useFill();
  const rows = tableOf(p.data).rows;
  const on = Math.round(p.selected ?? -1);
  const shares = rows.every((r) => (r[2] ?? "").trim() !== "");
  const lines = rows.map((r, i) => ({ label: r[0] ?? "", shown: r[1] ?? "", share: r[2] ?? "", value: Math.max(0, amountOf(shares ? r[2] : r[1])), i }));
  const order = p.sorted ? [...lines].sort((a, b) => b.value - a.value) : lines;
  const top = Math.max(1, ...lines.map((l) => l.value));
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), padding: 12, rowGap: 4, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      {p.title ? <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface"), paddingBottom: 4 }}>{p.title}</RNText> : null}
      {order.map((l) => (
        <Pressable key={l.i} accessibilityRole="button" accessibilityLabel={`${l.label} ${l.shown}`} accessibilityState={{ selected: l.i === on }}
          onPress={() => {
            p.onSelect?.(l.i);
            tapOf(p, `tab:${l.i}`)?.();
          }}
          style={{ rowGap: 4, borderRadius: corner(kit, "md"), paddingHorizontal: 4, paddingVertical: 6, backgroundColor: l.i === on ? c(kit, "surface-container-high") : undefined }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", columnGap: 8 }}>
            <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{l.label}</RNText>
            <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface"), fontVariant: ["tabular-nums"] }}>{l.i === on && l.share ? l.share : l.shown}</RNText>
          </View>
          <View style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c(kit, "surface-container-highest") }}>
            <View testID="bar-list-bar" style={{ height: 6, borderRadius: 3, width: `${(l.value / top) * 100}%`, backgroundColor: c(kit, "primary") }} />
          </View>
        </Pressable>
      ))}
    </Surface>
  );
}

export type FunnelChartProps = PartBase & { title?: string; data?: TableData; width?: number };

/** each step a bar as wide as its share of the first, its words in it, and the step's rate to the next under it */
export function FunnelChart(props: FunnelChartProps) {
  const p = withDefaults<FunnelChartProps>("funnel-chart", props);
  const kit = useKit();
  const fill = useFill();
  const rows = tableOf(p.data).rows.map((r) => ({ name: r[0] ?? "", value: Number(r[1]) || 0 }));
  const most = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), padding: 16, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      {p.title ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{p.title}</RNText> : null}
      {rows.map((row, i) => (
        <View key={i} style={{ alignItems: "center", rowGap: 2 }}>
          <View testID="funnel-bar" style={{ width: `${Math.max(18, (row.value / most) * 100)}%`, height: 36, borderRadius: corner(kit, "md"), paddingHorizontal: 8, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: c(kit, chartRole(i)) }}>
            <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-primary") }}>{`${row.name} ${row.value}`}</RNText>
          </View>
          {i < rows.length - 1 && row.value > 0 ? <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant") }}>{`↓ ${Math.round((rows[i + 1].value / row.value) * 100)}%`}</RNText> : null}
        </View>
      ))}
    </Surface>
  );
}

export type GanttChartProps = PartBase & { title?: string; data?: TableData; units?: number; unit?: string; today?: number; width?: number };

/** Tasks along units of time: each a bar from its start for its length, filled as far as it is done, today a line
 *  down them. A tap picks a task to look at (the visitor's own, as on the canvas). */
export function GanttChart(props: GanttChartProps) {
  const p = withDefaults<GanttChartProps>("gantt-chart", props);
  const kit = useKit();
  const fill = useFill();
  const [on, setOn] = useState(-1);
  const rows = tableOf(p.data).rows.map((r) => ({ name: r[0] ?? "", start: Number(r[1]) || 0, length: Number(r[2]) || 0, done: Number(r[3]) || 0 }));
  const units = Math.max(1, Math.round(p.units ?? 8));
  const today = p.today ?? -1;
  const percent = (n: number) => `${(n / units) * 100}%` as const;
  return (
    <Surface base={{ width: Math.round(p.width ?? 380), padding: 12, rowGap: 4, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      {p.title ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface"), paddingBottom: 4 }}>{p.title}</RNText> : null}
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 80 }} />
        <View style={{ flex: 1, flexDirection: "row", minWidth: 0 }}>
          {Array.from({ length: units }, (_, i) => (
            <RNText key={i} numberOfLines={1} style={{ flex: 1, minWidth: 0, textAlign: "center", ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant") }}>{`${i + 1}${i === 0 ? (p.unit ?? "") : ""}`}</RNText>
          ))}
        </View>
      </View>
      {rows.map((row, i) => (
        <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${row.name} ${row.done}%`} accessibilityState={{ selected: i === on }} onPress={() => setOn(i === on ? -1 : i)} style={{ flexDirection: "row", alignItems: "center", borderRadius: corner(kit, "md"), backgroundColor: i === on ? c(kit, "secondary-container") : undefined }}>
          <RNText numberOfLines={1} style={{ width: 80, paddingRight: 8, ...typeStyle(kit, "body-small"), color: c(kit, "on-surface") }}>{row.name}</RNText>
          <View style={{ flex: 1, height: 28, minWidth: 0 }}>
            <View testID="gantt-bar" style={{ position: "absolute", top: 4, bottom: 4, left: percent(row.start), width: percent(row.length), borderRadius: corner(kit, "sm"), overflow: "hidden", backgroundColor: c(kit, "primary-container") }}>
              <View style={{ height: "100%", width: `${Math.min(100, Math.max(0, row.done))}%`, backgroundColor: c(kit, "primary") }} />
            </View>
            {today >= 0 ? <View style={{ position: "absolute", top: 0, bottom: 0, width: 1, left: percent(today), backgroundColor: c(kit, "error") }} /> : null}
          </View>
        </Pressable>
      ))}
    </Surface>
  );
}

/* ---------- a table that answers ---------- */

const NUMERIC = /^[^\p{L}\d\s-]{0,2}\s?[-+]?[\d,]+(\.\d+)?\s?[^\p{L}\d\s]{0,2}$/u;

/** The rows a data table shows: searched for the words, sorted by a column (numbers as numbers), cut to the page;
 *  each with its place in the data. With `total` the rows are a page the other side has cut already, and are shown as
 *  they come. */
export function tableLines(rows: string[][], o: { query: string; sort: { column: number; down: boolean } | null; page: number; pageSize: number; total: number }) {
  const keys = keysOf(rows.map((r) => r.join("\u0001")));
  const all = rows.map((cells, id) => ({ cells, id, key: keys[id] }));
  const remote = o.total > 0;
  const numeric = (col: number) => rows.length > 0 && rows.every((r) => NUMERIC.test((r[col] ?? "").trim()));
  let lines = all;
  if (!remote) {
    const needle = o.query.trim().toLowerCase();
    lines = all.filter((l) => !needle || l.cells.some((x) => x.toLowerCase().includes(needle)));
    if (o.sort) {
      const { column, down } = o.sort;
      const order = numeric(column) ? (a: string, b: string) => amountOf(a) - amountOf(b) : (a: string, b: string) => a.localeCompare(b);
      lines = [...lines].sort((a, b) => (down ? -1 : 1) * order(a.cells[column] ?? "", b.cells[column] ?? ""));
    }
  }
  const size = Math.max(1, Math.round(o.pageSize));
  const count = remote ? o.total : lines.length;
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(Math.max(0, o.page), pages - 1);
  const shown = remote ? lines.slice(0, size) : lines.slice(current * size, current * size + size);
  return { shown, count, pages, current, size, numeric: rows[0] ? rows[0].map((_, i) => numeric(i)) : [] };
}

export type DataTableProps = PartBase & {
  title?: string;
  data?: TableData;
  search?: string;
  selectable?: boolean;
  pageSize?: number;
  query?: string;
  sortColumn?: number;
  sortDir?: "asc" | "desc" | string;
  page?: number;
  total?: number;
  width?: number;
  /** the visitor typed in the search */
  onSearch?: (e: { query: string }) => void;
  /** the visitor sorted by a column (-1 and "" when back to the data's order) */
  onSort?: (e: { column: number; dir: string }) => void;
  /** the visitor turned the page */
  onPage?: (e: { page: number }) => void;
  /** the rows checked, by their places in the data */
  onSelect?: (e: { rows: number[] }) => void;
};

/** A table to search, sort, page and check rows of. What the visitor asks of it is a draft that starts at the props and
 *  starts over when they change; each change goes out (`onSearch`, `onSort`, `onPage`, `onSelect`). A row is a place
 *  of its own (`row:N`, by its place in the data): a tap runs what that row is wired to and nothing else. Checked rows
 *  are kept by what they say, so they stay checked when the rows move. */
export function DataTable(props: DataTableProps) {
  const p = withDefaults<DataTableProps>("data-table", props);
  const kit = useKit();
  const fill = useFill();
  const t = tableOf(p.data);
  const rows = t.rows;
  const [query, setQuery] = useDraft(p.query ?? "");
  const [sort, setSort] = useDraft<{ column: number; down: boolean } | null>((p.sortColumn ?? -1) >= 0 ? { column: Math.round(p.sortColumn!), down: p.sortDir === "desc" } : null);
  const [page, setPage] = useDraft(Math.max(0, Math.round(p.page ?? 0)));
  const keys = keysOf(rows.map((r) => r.join("\u0001")));
  const [pickedAll, setPicked] = useState<string[]>([]);
  const picked = pickedAll.filter((k) => keys.includes(k));
  const view = tableLines(rows, { query, sort, page, pageSize: p.pageSize ?? 5, total: p.total ?? 0 });
  const { shown, count, current, pages, size, numeric } = view;
  const allOn = shown.length > 0 && shown.every((l) => picked.includes(l.key));
  const turn = (to: number) => {
    setPage(to);
    p.onPage?.({ page: to });
  };
  const pick = (next: string[]) => {
    setPicked(next);
    p.onSelect?.({ rows: rows.flatMap((_, i) => (next.includes(keys[i]) ? [i] : [])) });
  };
  const press = (column: number) => {
    /* ascending, descending, then back to the author's order */
    const next = sort?.column !== column ? { column, down: false } : sort.down ? null : { column, down: true };
    setSort(next);
    p.onSort?.({ column: next ? next.column : -1, dir: next?.down ? "desc" : next ? "asc" : "" });
    if (current !== 0) turn(0);
  };
  const line = c(kit, "outline-variant");
  const cell: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, paddingHorizontal: 16, justifyContent: "center" };
  const check: ViewStyle = { width: 40, paddingLeft: 12, justifyContent: "center" };
  return (
    <Surface base={{ width: Math.round(p.width ?? 560), padding: 12, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      {p.title || p.search ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 8 }}>
          {p.title ? <RNText numberOfLines={1} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{picked.length ? `${p.title} · ${picked.length}` : p.title}</RNText> : null}
          {p.search ? (
            <Input
              size="sm"
              type="search"
              width={192}
              value={query}
              placeholder={p.search}
              ariaLabel={p.search}
              onChangeText={(v) => {
                setQuery(v);
                p.onSearch?.({ query: v });
                if (current !== 0) turn(0);
              }}
            />
          ) : null}
        </View>
      ) : null}
      <View accessibilityRole="grid">
        <View style={{ flexDirection: "row", height: 56, borderBottomWidth: 1, borderBottomColor: line }}>
          {p.selectable ? (
            <View style={check}>
              <Checkbox label="" ariaLabel="All" checked={allOn} disabled={!shown.length} onValueChange={(on) => pick(on ? [...new Set([...picked, ...shown.map((l) => l.key)])] : picked.filter((k) => !shown.some((l) => l.key === k)))} />
            </View>
          ) : null}
          {t.columns.map((head, i) => {
            const by = sort?.column === i;
            return (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={head} accessibilityValue={{ text: by ? (sort!.down ? "descending" : "ascending") : "none" }} onPress={() => press(i)} style={{ ...cell, flexDirection: numeric[i] ? "row-reverse" : "row", alignItems: "center", justifyContent: "flex-start", columnGap: 4 }}>
                <RNText numberOfLines={1} style={{ flexShrink: 1, ...typeStyle(kit, "title-small"), color: c(kit, "on-surface-variant") }}>{head}</RNText>
                <View style={{ opacity: by ? 1 : 0 }}>
                  <Glyph name={by && sort!.down ? "arrow_downward" : "arrow_upward"} size={16} color={c(kit, "on-surface-variant")} />
                </View>
              </Pressable>
            );
          })}
        </View>
        {shown.map((l, r) => {
          const on = picked.includes(l.key);
          return (
            <Pressable key={l.key} testID={`row:${l.id}`} accessibilityRole="button" accessibilityLabel={l.cells[0]} accessibilityState={{ selected: on }} onPress={p.taps?.[`row:${l.id}`] ?? noop} style={{ flexDirection: "row", height: 52, borderBottomWidth: r === shown.length - 1 ? 0 : 1, borderBottomColor: line, backgroundColor: on ? c(kit, "secondary-container") : undefined }}>
              {p.selectable ? (
                <View style={check}>
                  <Checkbox label="" ariaLabel={l.cells[0]} checked={on} onValueChange={(v) => pick(v ? [...picked, l.key] : picked.filter((k) => k !== l.key))} />
                </View>
              ) : null}
              {t.columns.map((_, i) => (
                <View key={i} style={cell}>
                  <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, on ? "on-secondary-container" : "on-surface"), textAlign: numeric[i] ? "right" : "left", ...(numeric[i] ? { fontVariant: ["tabular-nums"] } : null) }}>{l.cells[i] ?? ""}</RNText>
                </View>
              ))}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", columnGap: 4 }}>
        <RNText style={{ marginRight: 8, ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), opacity: SOFT, fontVariant: ["tabular-nums"] }}>{`${count ? current * size + 1 : 0}–${Math.min(count, (current + 1) * size)} / ${count}`}</RNText>
        <PageButton icon="chevron_left" label="Previous" disabled={current === 0} onPress={() => turn(current - 1)} />
        <PageButton icon="chevron_right" label="Next" disabled={current >= pages - 1} onPress={() => turn(current + 1)} />
      </View>
    </Surface>
  );
}

/** a small round button with an icon only, its name for a screen reader */
function PageButton({ icon, label, disabled, onPress }: { icon: string; label: string; disabled?: boolean; onPress: () => void }) {
  const kit = useKit();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1 }}>
      <Glyph name={icon} size={24} color={c(kit, "on-surface-variant")} />
    </Pressable>
  );
}

/* ---------- a board ---------- */

export type KanbanCard = { id: string; row: number; text: string };

/** each column of the author's table a lane, its filled cells the cards; a card keeps who it is by its lane and words */
export function lanesOf(t: TableData): { title: string; cards: KanbanCard[] }[] {
  return t.columns.map((title, col) => {
    const cells = t.rows.flatMap((r, i) => (r[col] ? [{ row: i, text: r[col] }] : []));
    const keys = keysOf(cells.map((x) => `${col}\u0001${x.text}`));
    return { title, cards: cells.map((x, k) => ({ id: keys[k], row: x.row, text: x.text })) };
  });
}

export type KanbanProps = PartBase & {
  data?: TableData;
  add?: string;
  width?: number;
  /** a card asked to move: its row in the data, the lane it is in and the lane it goes to, the row it goes before (-1: the end) */
  onMove?: (e: { row: number; from: number; to: number; before: number }) => void;
  /** a card written into a lane */
  onAdd?: (e: { lane: number; text: string }) => void;
  /** a card opened */
  onOpen?: (e: { row: number; lane: number }) => void;
};

/** Lanes of cards. Which card is in which lane is the data's: a card moved (with the arrows under a card that is open,
 *  what a touch screen has for dragging), added or opened is sent (`onMove`, `onAdd`, `onOpen`) with the card by its
 *  place in the data, and the board shows the data as it comes back. */
export function Kanban(props: KanbanProps) {
  const p = withDefaults<KanbanProps>("kanban", props);
  const kit = useKit();
  const fill = useFill();
  const lanes = lanesOf(tableOf(p.data));
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(-1);
  const [draft, setDraft] = useState("");
  const shown = lanes.some((l) => l.cards.some((x) => x.id === picked)) ? picked : null;
  const move = (card: KanbanCard, from: number, to: number) => p.onMove?.({ row: card.row, from, to, before: -1 });
  /* a card is written once: the field's submit and the blur that follows it both end the same writing */
  const writing = useRef(false);
  const start = (lane: number) => {
    writing.current = true;
    setAdding(lane);
  };
  const commit = (lane: number) => {
    if (!writing.current) return;
    writing.current = false;
    const text = draft.trim();
    if (text) p.onAdd?.({ lane, text });
    setDraft("");
    setAdding(-1);
  };
  return (
    <Surface base={{ width: Math.round(p.width ?? 560), borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-lowest"), overflow: "hidden", ...fill }} appearance={p} testID={p.testID}>
      <ScrollView horizontal contentContainerStyle={{ padding: 8, columnGap: 8, alignItems: "flex-start", flexGrow: 1 }}>
        {lanes.map((lane, l) => (
          <View key={l} accessibilityLabel={lane.title} style={{ minWidth: 176, flexGrow: 1, flexBasis: 0, padding: 8, rowGap: 8, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container") }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", columnGap: 8, paddingHorizontal: 4 }}>
              <RNText numberOfLines={1} style={{ flexShrink: 1, ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{lane.title}</RNText>
              <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), opacity: SOFT }}>{String(lane.cards.length)}</RNText>
            </View>
            {lane.cards.map((card) => {
              const open = shown === card.id;
              return (
                <View key={card.id} style={{ borderRadius: corner(kit, "md"), backgroundColor: c(kit, open ? "secondary-container" : "surface-container-lowest") }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: open }}
                    onPress={() => {
                      if (!open) p.onOpen?.({ row: card.row, lane: l });
                      setPicked(open ? null : card.id);
                    }}
                    style={{ padding: 8 }}
                  >
                    <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, open ? "on-secondary-container" : "on-surface") }}>{card.text}</RNText>
                  </Pressable>
                  {open ? (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 4 }}>
                      <SmallIcon icon="arrow_back" label="Move left" disabled={l === 0} onPress={() => move(card, l, l - 1)} />
                      <SmallIcon icon="arrow_forward" label="Move right" disabled={l === lanes.length - 1} onPress={() => move(card, l, l + 1)} />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {p.add ? (
              adding === l ? (
                <TextInput
                  autoFocus
                  value={draft}
                  accessibilityLabel={p.add}
                  onChangeText={setDraft}
                  onSubmitEditing={() => commit(l)}
                  onBlur={() => commit(l)}
                  returnKeyType="done"
                  style={{ height: 40, paddingHorizontal: 12, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface"), ...fieldStyle(kit, "outlined").box }}
                />
              ) : (
                <Pressable accessibilityRole="button" onPress={() => start(l)} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", columnGap: 4, height: 32, paddingHorizontal: 8, borderRadius: 16 }}>
                  <Glyph name="add" size={18} color={c(kit, "primary")} />
                  <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "primary") }}>{p.add}</RNText>
                </Pressable>
              )
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Surface>
  );
}

/** a 32 round button with an icon, named for a screen reader */
function SmallIcon({ icon, label, disabled, onPress }: { icon: string; label: string; disabled?: boolean; onPress: () => void }) {
  const kit = useKit();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1 }}>
      <Glyph name={icon} size={20} color={c(kit, "on-surface")} />
    </Pressable>
  );
}

/* ---------- a month with things in it ---------- */

const pad2 = (n: number) => String(n).padStart(2, "0");
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** A month as an agenda draws it: the days before the first in its week, the days, which have something on, the
 *  things on the day picked (each with its row in the data). */
export function monthOf(year: number, month: number, weekStart: string, rows: string[][], day: number) {
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  const shift = weekStart === "monday" ? 1 : 0;
  const lead = (first.getDay() - shift + 7) % 7;
  const prefix = `${year}-${pad2(month)}-`;
  const dayOf = (cell: string) => (cell.startsWith(prefix) ? Number(cell.slice(prefix.length)) : 0);
  const busy = new Set(rows.map((r) => dayOf(r[0] ?? "")));
  const today = Math.max(1, Math.min(day, days));
  const events = rows.map((r, i) => ({ r, i })).filter(({ r }) => dayOf(r[0] ?? "") === today);
  return { days, lead, prefix, busy, today, events, names: Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + shift) % 7]), title: `${MONTH_NAMES[month - 1] ?? ""} ${year}` };
}

export type AgendaProps = PartBase & {
  year?: number;
  month?: number;
  day?: number;
  data?: TableData;
  weekStart?: "sunday" | "monday" | string;
  empty?: string;
  width?: number;
  /** the visitor picked a day */
  onDay?: (e: { year: number; month: number; day: number; date: string }) => void;
  /** the visitor turned the month */
  onMonth?: (e: { year: number; month: number }) => void;
};

/** A month with things in it. The month on show and the day picked are the visitor's browsing, a draft that starts at
 *  `year`, `month` and `day` and starts over when they change; each turn of the month and each day picked goes out
 *  (`onMonth`, `onDay`), so a data source can follow it. A tap on a thing runs what its row is wired to (`tab:N`). */
export function Agenda(props: AgendaProps) {
  const p = withDefaults<AgendaProps>("agenda", props);
  const kit = useKit();
  const fill = useFill();
  const rows = tableOf(p.data).rows;
  const [view, setView] = useDraft({ year: Math.round(p.year ?? 2026), month: Math.max(1, Math.min(12, Math.round(p.month ?? 1))) });
  const [on, setOn] = useDraft(Math.round(p.day ?? 1));
  const m = monthOf(view.year, view.month, p.weekStart ?? "sunday", rows, on);
  const turn = (by: number) => {
    const next = new Date(view.year, view.month - 1 + by, 1);
    const to = { year: next.getFullYear(), month: next.getMonth() + 1 };
    setView(to);
    p.onMonth?.(to);
  };
  const pick = (d: number) => {
    setOn(d);
    p.onDay?.({ year: view.year, month: view.month, day: d, date: `${m.prefix}${pad2(d)}` });
  };
  const soft = { color: c(kit, "on-surface"), opacity: SOFT };
  const cells = [...Array.from({ length: m.lead }, () => 0), ...Array.from({ length: m.days }, (_, i) => i + 1)];
  return (
    <Surface base={{ width: Math.round(p.width ?? 360), padding: 12, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c(kit, "surface-container-low"), ...fill }} appearance={p} testID={p.testID}>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 4 }}>
        <RNText style={{ flex: 1, paddingLeft: 4, ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{m.title}</RNText>
        <PageButton icon="chevron_left" label="Previous month" onPress={() => turn(-1)} />
        <PageButton icon="chevron_right" label="Next month" onPress={() => turn(1)} />
      </View>
      <View style={{ flexDirection: "row" }}>
        {m.names.map((n, i) => (
          <RNText key={i} style={{ flex: 1, textAlign: "center", paddingVertical: 4, ...typeStyle(kit, "label-small"), ...soft }}>{n}</RNText>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 2 }}>
        {cells.map((d, i) =>
          d === 0 ? (
            <View key={`lead-${i}`} style={{ width: `${100 / 7}%` }} />
          ) : (
            <View key={d} style={{ width: `${100 / 7}%`, padding: 1 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${m.prefix}${pad2(d)}`} accessibilityState={{ selected: d === m.today }} onPress={() => pick(d)} style={{ aspectRatio: 1, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: d === m.today ? c(kit, "primary") : undefined }}>
                <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, d === m.today ? "on-primary" : "on-surface") }}>{String(d)}</RNText>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: m.busy.has(d) ? c(kit, d === m.today ? "on-primary" : "primary") : "transparent" }} />
              </Pressable>
            </View>
          ),
        )}
      </View>
      <View style={{ rowGap: 4 }}>
        {m.events.length === 0 ? <RNText style={{ textAlign: "center", paddingVertical: 8, ...typeStyle(kit, "body-small"), ...soft }}>{p.empty}</RNText> : null}
        {m.events.map(({ r, i }) => (
          <Pressable key={i} accessibilityRole="button" onPress={tapOf(p, `tab:${i}`)} style={{ flexDirection: "row", alignItems: "center", columnGap: 12, padding: 8, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface-container") }}>
            <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface"), fontVariant: ["tabular-nums"] }}>{r[1] ?? ""}</RNText>
            <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{r[2] ?? ""}</RNText>
          </Pressable>
        ))}
      </View>
    </Surface>
  );
}
