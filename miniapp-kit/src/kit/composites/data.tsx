import { Image, Input as TaroInput, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useRef, useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Checkbox, Input } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c } from "../color";
import { Glyph, svgUrl } from "../icons";
import { useFill } from "../layout";
import { withDefaults } from "../parts";
import { fieldStyle } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { BARE, COL, merge, ROW, sx, type CSS } from "../styles";
import { corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";

/* The data and chart parts in a mini-program, drawn as the canvas draws them (parts/defs/data.ts, app.ts, more.ts and the
 * widgets in parts/widgets). A mini-program cannot draw SVG markup in its page but can show an SVG as a picture (as the
 * kit's icons are): each chart is an SVG drawn here in the theme's resolved colors and handed to an <Image> as a data
 * URL, its names along the axis as words over it. Tables are rows of views, a month a grid of days, a board lanes of
 * cards, Markdown a small renderer of the kit's own. Every part reads the author's table (`{ columns, rows, spec? }`) by
 * place, as the printer hands it already lined up with the columns the part reads (docs/组件规范.md "表格"); a table
 * bound to data still shows the design's rows in an exported mini-program (the export reports it). What a visitor asks
 * of a part (a search, a sort, a page, a month, a day, a card moved) is a draft that starts at the props and starts over
 * when they change, and goes out through a callback (`onSearch`, `onMove`…): which card is in which lane, which rows
 * there are, stay the data's. */

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
 *  its decimals and grouping, an amount in its currency, a share as a percent, a day, yes or no; anything else as given.
 *  A platform with no `Intl` writes the cell as it is. */
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
      {title ? <Words text={title} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface") }} /> : null}
      {subtitle ? <Words text={subtitle} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
    </>
  );
}

/** a press target of the kit's own: a view that runs `onPress` and stops there, with its name for a screen reader */
function Tap({ onPress, label, role = "button", selected, style, children, testID }: { onPress?: () => void; label?: string; role?: string; selected?: boolean; style?: CSS; children?: ReactNode; testID?: string }) {
  return (
    <View {...tagOf(testID)} ariaRole={role} ariaLabel={label} ariaSelected={selected} hoverClass={onPress ? "m3e-pressed" : "none"} onClick={onPress ? (e) => (e.stopPropagation(), onPress()) : undefined} style={sx({ boxSizing: "border-box" }, style)}>
      {children}
    </View>
  );
}

/** a round button with an icon only, its name for a screen reader */
function IconTap({ icon, label, size = 40, disabled, onPress }: { icon: string; label: string; size?: number; disabled?: boolean; onPress: () => void }) {
  return (
    <Tap label={label} onPress={disabled ? undefined : onPress} style={{ ...ROW, justifyContent: "center", width: size, height: size, borderRadius: size / 2, flexShrink: 0, opacity: disabled ? 0.38 : 1 }}>
      <Glyph name={icon} size={size >= 40 ? 24 : 20} color="on-surface-variant" />
    </Tap>
  );
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
  const step = Math.ceil(Math.round((rough / power) * 1e6) / 1e6 / 0.05) * 0.05 * power;
  return Number((step * (ticks - 1)).toPrecision(12));
}

/** a chart's table as names along the axis and series of values: the first column names a point, the rest are series */
export function seriesOf(t: TableData): { names: string[]; series: { label: string; values: number[] }[] } {
  return { names: t.rows.map((r) => r[0] ?? ""), series: t.columns.slice(1).map((label, i) => ({ label, values: t.rows.map((r) => valueOf(r[i + 1])) })) };
}

const n2 = (v: number) => Math.round(v * 100) / 100;

/** a point at an angle (degrees, counterclockwise from three o'clock, as Recharts' polar charts measure it) */
const polar = (cx: number, cy: number, r: number, deg: number) => ({ x: n2(cx + r * Math.cos((deg * Math.PI) / 180)), y: n2(cy - r * Math.sin((deg * Math.PI) / 180)) });

/** a ring's slice between two angles, as a path */
function slice(cx: number, cy: number, inner: number, outer: number, from: number, to: number): string {
  const sweep = Math.min(359.999, to - from);
  const big = sweep > 180 ? 1 : 0;
  const a = polar(cx, cy, outer, from);
  const b = polar(cx, cy, outer, from + sweep);
  const d = polar(cx, cy, inner, from + sweep);
  const e = polar(cx, cy, inner, from);
  return `M${a.x} ${a.y}A${n2(outer)} ${n2(outer)} 0 ${big} 0 ${b.x} ${b.y}L${d.x} ${d.y}A${n2(inner)} ${n2(inner)} 0 ${big} 1 ${e.x} ${e.y}Z`;
}

export type AxisLabel = { x: number; y: number; text: string; anchor: "start" | "middle" | "end" };
/** a chart drawn as an SVG, and the words that go over it (as views, so they are the theme's words and can be read) */
export type ChartPicture = { svg: string; labels: AxisLabel[]; polar: boolean };

/** Draws a chart as Recharts draws it on the canvas, in `w` × `h`: bars side by side or stacked, lines, areas, a ring, a
 *  radar; the grid across, the names along the foot. `paint` gives a role's color in the mode the app is in. A
 *  cartesian chart stretches to the width it is given (its strokes keep their width); a polar one keeps its shape. */
export function chartPicture(type: string, t: TableData, w: number, h: number, paint: (role: string) => string): ChartPicture {
  const { names, series } = seriesOf(t);
  const grid = paint("outline-variant");
  const out: string[] = [];
  const labels: AxisLabel[] = [];
  const keep = ' vector-effect="non-scaling-stroke"';
  const isPolar = type === "pie" || type === "radar";
  if (isPolar) {
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
        const span = (v / total) * 360;
        out.push(`<path d="${slice(cx, cy, most * 0.5, outer, at, at + span)}" fill="${paint(chartRole(i))}"/>`);
        at += span;
      });
    } else {
      const n = Math.max(1, names.length);
      const top = niceTop(Math.max(0, ...series.flatMap((s) => s.values)));
      const angle = (i: number) => 90 - (i * 360) / n;
      const ring = (r: number, vs: number[]) => vs.map((v, i) => polar(cx, cy, r * v, angle(i))).map((q) => `${q.x},${q.y}`).join(" ");
      for (let k = 1; k <= 4; k++) out.push(`<polygon points="${ring((outer * k) / 4, names.map(() => 1))}" fill="none" stroke="${grid}" stroke-width="1"/>`);
      names.forEach((name, i) => {
        const q = polar(cx, cy, outer, angle(i));
        out.push(`<line x1="${n2(cx)}" y1="${n2(cy)}" x2="${q.x}" y2="${q.y}" stroke="${grid}" stroke-width="1"/>`);
        const l = polar(cx, cy, outer + 12, angle(i));
        const cos = Math.cos((angle(i) * Math.PI) / 180);
        labels.push({ x: l.x, y: l.y - 8, text: name, anchor: Math.abs(cos) < 0.1 ? "middle" : cos > 0 ? "start" : "end" });
      });
      series.forEach((s, k) => out.push(`<polygon points="${ring(outer, s.values.map((v) => Math.max(0, v) / top))}" fill="${paint(chartRole(k))}" fill-opacity="0.3" stroke="${paint(chartRole(k))}" stroke-width="1"/>`));
    }
  } else {
    /* the margins Recharts leaves, more at the sides where a line runs from edge to edge, and the axis's band */
    const side = type === "line" || type === "area" ? 16 : 5;
    const plotW = Math.max(1, w - side * 2);
    const plotTop = 5;
    const plotBottom = Math.max(plotTop + 1, h - 5 - 30);
    const stacked = type === "stacked-bar";
    const sums = names.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
    const top = niceTop(Math.max(0, ...(stacked ? sums : series.flatMap((s) => s.values))));
    const y = (v: number) => n2(plotBottom - (Math.max(0, v) / top) * (plotBottom - plotTop));
    for (let k = 0; k <= 4; k++) {
      const gy = n2(plotTop + ((plotBottom - plotTop) * k) / 4);
      out.push(`<line x1="${side}" x2="${n2(side + plotW)}" y1="${gy}" y2="${gy}" stroke="${grid}" stroke-width="1"${keep}/>`);
    }
    const n = names.length;
    const band = n ? plotW / n : plotW;
    const point = (i: number) => n2(n > 1 ? side + (i / (n - 1)) * plotW : side + plotW / 2);
    const xOf = (i: number) => (type === "line" || type === "area" ? point(i) : n2(side + band * i + band / 2));
    names.forEach((name, i) => labels.push({ x: xOf(i), y: plotBottom + 8, text: name, anchor: "middle" }));
    if (type === "line" || type === "area")
      series.forEach((s, k) => {
        const line = s.values.map((v, i) => `${i ? "L" : "M"}${point(i)} ${y(v)}`).join("");
        if (!line) return;
        if (type === "area") out.push(`<path d="${line}L${point(s.values.length - 1)} ${plotBottom}L${point(0)} ${plotBottom}Z" fill="${paint(chartRole(k))}" fill-opacity="0.3"/>`);
        out.push(`<path d="${line}" fill="none" stroke="${paint(chartRole(k))}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${keep}/>`);
      });
    else if (stacked)
      names.forEach((_, i) => {
        let base = plotBottom;
        series.forEach((s, k) => {
          const hgt = n2(plotBottom - y(s.values[i] ?? 0));
          if (hgt <= 0) return;
          base = n2(base - hgt);
          out.push(`<rect x="${n2(side + band * i + band * 0.1)}" y="${base}" width="${n2(band * 0.8)}" height="${hgt}" fill="${paint(chartRole(k))}"/>`);
        });
      });
    else {
      const k = Math.max(1, series.length);
      const barW = Math.max(1, (band * 0.8 - (k - 1) * 4) / k);
      names.forEach((_, i) =>
        series.forEach((s, j) => {
          const top_ = y(s.values[i] ?? 0);
          const hgt = n2(plotBottom - top_);
          if (hgt <= 0) return;
          const r = n2(Math.min(4, barW / 2, hgt / 2));
          out.push(`<rect x="${n2(side + band * i + band * 0.1 + j * (barW + 4))}" y="${top_}" width="${n2(barW)}" height="${hgt}" rx="${r}" ry="${r}" fill="${paint(chartRole(j))}"/>`);
        }),
      );
    }
  }
  const aspect = isPolar ? "xMidYMid meet" : "none";
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="${aspect}">${out.join("")}</svg>`, labels, polar: isPolar };
}

/** a drawing as a picture, as wide as what holds it and `h` tall, with words laid over it where the drawing says */
function Picture({ svg, h, w, labels = [], label, testID }: { svg: string; h: number; w: number; labels?: AxisLabel[]; label?: string; testID?: string }) {
  const kit = useKit();
  return (
    <View {...tagOf(testID)} ariaRole="img" ariaLabel={label} style={sx({ position: "relative", width: "100%", height: h })}>
      <Image src={svgUrl(svg, kit.paint("on-surface"))} mode="scaleToFill" style={sx({ display: "block", width: "100%", height: h })} />
      {labels.map((l, i) => (
        <View key={i} style={sx({ position: "absolute", top: l.y, left: `${(l.x / Math.max(1, w)) * 100}%`, width: 96, marginLeft: l.anchor === "middle" ? -48 : l.anchor === "end" ? -96 : 0, textAlign: l.anchor === "middle" ? "center" : l.anchor === "start" ? "left" : "right" })}>
          <Words text={l.text} lines={1} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} />
        </View>
      ))}
    </View>
  );
}

export type ChartProps = PartBase & { type?: "bar" | "line" | "area" | "stacked-bar" | "pie" | "radar" | string; title?: string; subtitle?: string; data?: TableData; width?: number; height?: number };

/** a chart of the author's table, as Recharts draws it on the canvas; hovering shows values there, a phone shows none */
export function Chart(props: ChartProps) {
  const p = withDefaults<ChartProps>("chart", props);
  const kit = useKit();
  const fill = useFill();
  const w = Math.round(p.width ?? 420);
  const h = Math.round(p.height ?? 220);
  const t = tableOf(p.data);
  const pic = chartPicture(p.type ?? "bar", t, w, h, kit.paint);
  const said = `${p.title ?? ""} ${seriesOf(t).series.map((s) => `${s.label}: ${s.values.join(", ")}`).join("; ")}`.trim();
  return (
    <Surface base={merge(COL, { width: w, rowGap: 4 }, fill)} appearance={p} testID={p.testID}>
      <Heading title={p.title} subtitle={p.subtitle} />
      <Picture svg={pic.svg} w={w} h={h} labels={pic.labels} label={said} />
    </Surface>
  );
}

/** the points of a scatter plot, over the corner of two axes, in a 100 × 100 box (the canvas's drawing) */
export function scatterPicture(t: TableData, color: string): string {
  const pts = t.rows.map((r) => [valueOf(r[0]), valueOf(r[1])] as const);
  const span = (axis: 0 | 1) => {
    const all = pts.map((q) => q[axis]);
    const lo = Math.min(...all, 0);
    const hi = Math.max(...all, lo + 1);
    return (v: number) => n2(((v - lo) / (hi - lo)) * 100);
  };
  const [sx_, sy] = [span(0), span(1)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108" preserveAspectRatio="none">${pts.map((q) => `<ellipse cx="${sx_(q[0])}" cy="${n2(100 - sy(q[1]))}" rx="1.6" ry="2.2" fill="${color}"/>`).join("")}</svg>`;
}

export type ScatterPlotProps = PartBase & { title?: string; subtitle?: string; data?: TableData; width?: number; height?: number };

export function ScatterPlot(props: ScatterPlotProps) {
  const p = withDefaults<ScatterPlotProps>("scatter-plot", props);
  const kit = useKit();
  const fill = useFill();
  const t = tableOf(p.data);
  const h = Math.round(p.height ?? 200);
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 320), rowGap: 4 }, fill)} appearance={p} testID={p.testID}>
      <Heading title={p.title} subtitle={p.subtitle} />
      <View style={sx({ boxSizing: "border-box", borderLeft: `1px solid ${c("outline-variant")}`, borderBottom: `1px solid ${c("outline-variant")}` })}>
        <Picture svg={scatterPicture(t, kit.paint("primary"))} w={1} h={h} label={`${p.title ?? ""} ${t.rows.map((r) => `${r[0] ?? ""}, ${r[1] ?? ""}`).join("; ")}`.trim()} />
      </View>
    </Surface>
  );
}

export type HeatmapProps = PartBase & { title?: string; subtitle?: string; data?: TableData; width?: number };

/** how strong a heat map's cell is: a tenth at nothing, all of it at the largest value */
export const heatOf = (v: string | undefined, top: number) => 0.1 + (valueOf(v) / Math.max(1, top)) * 0.9;

/** a grid of cells in the accent, each as strong as its value is among the rest, the columns named over it */
export function Heatmap(props: HeatmapProps) {
  const p = withDefaults<HeatmapProps>("heatmap", props);
  const kit = useKit();
  const fill = useFill();
  const { columns, rows } = tableOf(p.data);
  const top = Math.max(1, ...rows.flat().map(valueOf));
  const grid: CSS = { display: "grid", gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`, gap: 4 };
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 320), rowGap: 4 }, fill)} appearance={p} testID={p.testID}>
      <Heading title={p.title} subtitle={p.subtitle} />
      <View style={sx(grid)}>
        {columns.map((col, i) => (
          <Words key={i} text={col} lines={1} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface-variant"), textAlign: "center" }} />
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={sx(grid)}>
          {columns.map((col, i) => (
            <View key={i} ariaLabel={`${col} ${row[i] ?? ""}`.trim()} style={sx({ height: 24, borderRadius: corner(kit, "xs"), backgroundColor: c("primary"), opacity: heatOf(row[i], top) })} />
          ))}
        </View>
      ))}
    </Surface>
  );
}

/** half a ring filled as far as `value` (0–100), in a 120 × 66 box as the canvas draws it */
export function gaugePicture(value: number, track: string, color: string): string {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const end = polar(60, 60, 50, 180 - v * 1.8);
  const arc = (d: string, stroke: string) => `<path d="${d}" fill="none" stroke-width="10" stroke-linecap="round" stroke="${stroke}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 66" width="160" height="88">${arc("M 10 60 A 50 50 0 0 1 110 60", track)}${v > 0 ? arc(`M 10 60 A 50 50 0 0 1 ${end.x} ${end.y}`, color) : ""}</svg>`;
}

export type GaugeProps = PartBase & { label?: string; value?: number };

export function Gauge(props: GaugeProps) {
  const p = withDefaults<GaugeProps>("gauge", props);
  const kit = useKit();
  const v = Math.max(0, Math.min(100, Math.round(Number.isFinite(p.value) ? (p.value as number) : 0)));
  return (
    <Surface base={{ ...COL, alignItems: "center", width: 160 }} appearance={p} testID={p.testID}>
      <View ariaRole="progressbar" ariaLabel={p.label || undefined} ariaValuemin="0" ariaValuemax="100" ariaValuenow={String(v)} style={sx({ width: 160, height: 88 })}>
        <Image src={svgUrl(gaugePicture(v, kit.paint("surface-container-highest"), kit.paint("primary")), kit.paint("primary"))} style={sx({ display: "block", width: 160, height: 88 })} />
      </View>
      <Words text={`${v}%`} style={{ ...typeStyle(kit, "title-large"), color: c("on-surface") }} />
      {p.label ? <Words text={p.label} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} /> : null}
    </Surface>
  );
}

/* ---------- a table ---------- */

export type TableProps = PartBase & { title?: string; data?: TableData; caption?: string; /** the row picked, from 0 (-1: none) */ selectedRow?: number; alignLast?: boolean; width?: number };

/** How wide each column stands: its own width where its structure gives one, else a share of what is left as large as
 *  its longest words, as a browser lays out a table that fits. */
export function columnWidths(t: TableData, cols: TableColumn[] | undefined): { width?: number; grow: number }[] {
  return t.columns.map((head, i) => {
    const own = cols?.[i]?.width;
    if (own) return { width: Math.round(own), grow: 0 };
    return { grow: Math.max(4, head.length, ...t.rows.map((r) => (r[i] ?? "").length)) };
  });
}

const TEXT_ALIGN = { start: "left", center: "center", end: "right" } as const;

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
  const cell = (i: number): CSS => ({ ...ROW, boxSizing: "border-box", paddingLeft: 16, paddingRight: 16, ...(sizes[i].width ? { width: sizes[i].width, flexShrink: 0 } : { flexGrow: sizes[i].grow, flexShrink: 1, flexBasis: 0, minWidth: 0 }) });
  const line = `1px solid ${c("outline-variant")}`;
  /* the row picked, counted from 0 (-1: none) */
  const chosen = Math.round(p.selectedRow ?? -1);
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 420) }, fill)} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface"), padding: "8px 16px" }} /> : null}
      <View ariaRole="table">
        <View style={sx(ROW, { height: 56, borderBottom: line })}>
          {t.columns.map((head, i) => (
            <View key={i} ariaRole="columnheader" style={sx(cell(i))}>
              <Words text={head} lines={1} style={{ flexGrow: 1, ...typeStyle(kit, "title-small"), color: c("on-surface-variant"), textAlign: TEXT_ALIGN[align(i)] }} />
            </View>
          ))}
        </View>
        {t.rows.map((row, r) => {
          const on = chosen === r;
          return (
            <View key={r} ariaRole="row" ariaSelected={on} style={sx(ROW, { height: 52, borderBottom: r === t.rows.length - 1 ? "none" : line, backgroundColor: on ? c("secondary-container") : undefined })}>
              {t.columns.map((_, i) => (
                <View key={i} style={sx(cell(i))}>
                  <Words text={spec ? formatCell(row[i] ?? "", spec[i]) : (row[i] ?? "")} lines={1} style={{ flexGrow: 1, ...typeStyle(kit, "body-medium"), color: c(on ? "on-secondary-container" : "on-surface"), textAlign: TEXT_ALIGN[align(i)] }} />
                </View>
              ))}
            </View>
          );
        })}
      </View>
      {p.caption ? <Words text={p.caption} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface-variant"), marginTop: 16, textAlign: "center" }} /> : null}
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

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export type MarkdownProps = PartBase & { text?: string; width?: number };

/** the author's Markdown as the canvas draws it: headings in the type ramp, bullets, a quote with a rule beside it, code
 *  on a darker ground */
export function Markdown(props: MarkdownProps) {
  const p = withDefaults<MarkdownProps>("markdown", props);
  const kit = useKit();
  const fill = useFill();
  const body: CSS = { ...typeStyle(kit, "body-medium"), color: c("on-surface") };
  const HEADS = ["headline-small", "title-large", "title-medium"] as const;
  /* a line's words in one block, the marks as inline views of their own */
  const inline = (line: string, style: CSS = body, role?: string) => (
    <View ariaRole={role} style={sx({ overflowWrap: "break-word", whiteSpace: "pre-wrap", minWidth: 0 }, style)}>
      {markdownSpans(line).map((s, i) =>
        s.kind === "text" ? (
          s.text
        ) : (
          <View key={i} style={sx({ display: "inline" }, s.kind === "bold" ? { fontWeight: 700 } : { fontFamily: MONO, backgroundColor: c("surface-container-highest"), borderRadius: 4, padding: "0 4px" })}>
            {s.text}
          </View>
        ),
      )}
    </View>
  );
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 420), rowGap: 8 }, fill)} appearance={p} testID={p.testID}>
      {markdownBlocks(p.text ?? "").map((b, i) => {
        switch (b.kind) {
          case "code":
            return (
              <View key={i} style={sx({ overflowX: "auto", borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-highest"), padding: 12 })}>
                <View style={sx({ whiteSpace: "pre", fontFamily: MONO, ...typeStyle(kit, "body-small"), color: c("on-surface") })}>{b.text}</View>
              </View>
            );
          case "heading":
            return <View key={i}>{inline(b.text, { ...typeStyle(kit, HEADS[b.level - 1]), color: c("on-surface") }, "heading")}</View>;
          case "list":
            return (
              <View key={i} ariaRole="list" style={sx(COL, { paddingLeft: 8 })}>
                {b.items.map((it, k) => (
                  <View key={k} ariaRole="listitem" style={sx({ display: "flex", flexDirection: "row", columnGap: 8 })}>
                    <Words text="•" style={body} />
                    {inline(it, { ...body, flex: 1 })}
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={i} style={sx({ borderLeft: `4px solid ${c("outline-variant")}`, paddingLeft: 12 })}>
                {inline(b.text, { ...body, color: c("on-surface-variant") })}
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
let sparks = 0;

/** the values of a sparkline as the part holds them: words with commas between ("420,512"), or numbers */
export const sparkValues = (v: unknown): number[] =>
  (Array.isArray(v) ? v : String(v ?? "").split(","))
    .map((x) => (typeof x === "number" ? x : String(x).trim()))
    .filter((x) => x !== "")
    .map(Number)
    .filter(Number.isFinite);

/** a sparkline's plot, `w` × `height`, with the value at `at` marked (-1: the last) */
export function sparkPicture(values: number[], kind: string, w: number, height: number, at: number, paint: (role: string) => string): string {
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, lo + 1);
  const x = (i: number) => n2(values.length > 1 ? PAD + (i / (values.length - 1)) * (w - PAD * 2) : w / 2);
  const y = (v: number) => n2(height - PAD - ((v - lo) / (hi - lo)) * (height - PAD * 2));
  const primary = paint("primary");
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join(" ");
  const bar = values.length ? Math.max(2, (w - PAD * 2) / values.length - 2) : 0;
  const last = at >= 0 ? at : values.length - 1;
  const body =
    kind === "bar"
      ? values.map((v, i) => `<rect x="${n2(PAD + (i * (w - PAD * 2)) / values.length + 1)}" y="${y(v)}" width="${n2(bar)}" height="${n2(Math.max(1, height - PAD - y(v)))}" rx="2" fill="${primary}"${at >= 0 && at !== i ? ' opacity="0.4"' : ""}/>`).join("")
      : [
          kind === "area" && values.length > 1 ? `<path d="${line} L${x(values.length - 1)} ${height - PAD} L${x(0)} ${height - PAD} Z" fill="${primary}" opacity="0.15"/>` : "",
          `<path d="${line}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke="${primary}"/>`,
          at >= 0 ? `<line x1="${x(at)}" x2="${x(at)}" y1="0" y2="${height}" stroke-width="1" stroke="${paint("outline-variant")}"/>` : "",
          last >= 0 ? `<circle cx="${x(last)}" cy="${y(values[last])}" r="3" stroke-width="2" fill="${primary}" stroke="${paint("surface-container-low")}"/>` : "",
        ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${height}" width="${w}" height="${height}">${body}</svg>`;
}

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
  const shown = at >= 0 && at < values.length ? String(values[at]) : (p.value ?? "");
  const down = (p.trend ?? "").startsWith("-");
  /* where the plot stands on the page, measured when a finger lands on it (as the split view measures its box) */
  const [id] = useState(() => `m3e-spark-${++sparks}`);
  const [left, setLeft] = useState(0);
  const at_ = (x: number, from: number) => (values.length ? Math.min(values.length - 1, Math.max(0, Math.round(((x - from) / w) * (values.length - 1)))) : -1);
  const touchX = (e: unknown) => (e as { touches?: { clientX: number }[] }).touches?.[0]?.clientX;
  const land = (e: unknown) => {
    const x = touchX(e);
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .boundingClientRect((r) => {
        const rect = Array.isArray(r) ? r[0] : r;
        if (!rect) return;
        setLeft(rect.left);
        if (x !== undefined) setAt(at_(x, rect.left));
      })
      .exec();
  };
  const follow = (e: unknown) => {
    const x = touchX(e);
    if (x !== undefined) setAt(at_(x, left));
  };
  const leave = () => setAt(-1);
  return (
    <Surface base={{ ...COL, width, boxSizing: "border-box", padding: 12, rowGap: 4, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low") }} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface"), opacity: SOFT }} /> : null}
      {shown || p.trend ? (
        <View style={sx({ display: "flex", flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", columnGap: 8 })}>
          <Words text={shown} style={{ ...typeStyle(kit, "title-large"), color: c("on-surface"), fontVariantNumeric: "tabular-nums" }} />
          {p.trend ? (
            <View style={sx(ROW, { columnGap: 2 })}>
              <Glyph name={down ? "arrow_downward" : "arrow_upward"} size={14} color={down ? "error" : "primary"} />
              <Words text={p.trend} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface") }} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View id={id} ariaRole="img" ariaLabel={`${p.title ?? ""} ${values.join(", ")}`.trim()} onTouchStart={land} onTouchMove={follow} onTouchEnd={leave} onTouchCancel={leave} style={sx({ width: w, height })}>
        <Image src={svgUrl(sparkPicture(values, p.kind ?? "line", w, height, at, kit.paint), kit.paint("primary"))} style={sx({ display: "block", width: w, height })} />
      </View>
    </Surface>
  );
}

export type BarListProps = PartBase & { title?: string; data?: TableData; sorted?: boolean; selected?: number; width?: number; onSelect?: (index: number) => void };

/** the rows of a bar list in the order shown, each with its share of the largest (the data's share column where every
 *  row has one, else its value) */
export function barLines(rows: string[][], sorted: boolean) {
  const shares = rows.every((r) => (r[2] ?? "").trim() !== "");
  const lines = rows.map((r, i) => ({ label: r[0] ?? "", shown: r[1] ?? "", share: r[2] ?? "", value: Math.max(0, amountOf(shares ? r[2] : r[1])), i }));
  const top = Math.max(1, ...lines.map((l) => l.value));
  return (sorted ? [...lines].sort((a, b) => b.value - a.value) : lines).map((l) => ({ ...l, part: l.value / top }));
}

/** A row's share is the data's: its third column ("54%") is what the bars stand in; an older table with no shares draws
 *  them by their values. The open row is `selected`, which whoever draws the list moves (`onSelect` says which was
 *  tapped); a tap on a row runs its own. */
export function BarList(props: BarListProps) {
  const p = withDefaults<BarListProps>("bar-list", props);
  const kit = useKit();
  const fill = useFill();
  const on = Math.round(p.selected ?? -1);
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 360), boxSizing: "border-box", padding: 12, rowGap: 4, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low") }, fill)} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface"), paddingBottom: 4 }} /> : null}
      {barLines(tableOf(p.data).rows, !!p.sorted).map((l) => (
        <Tap
          key={l.i}
          label={`${l.label} ${l.shown}`}
          selected={l.i === on}
          onPress={() => {
            p.onSelect?.(l.i);
            tapOf(p, `tab:${l.i}`)?.();
          }}
          style={{ ...COL, rowGap: 4, borderRadius: corner(kit, "md"), padding: "6px 4px", backgroundColor: l.i === on ? c("surface-container-high") : undefined }}
        >
          <View style={sx({ display: "flex", flexDirection: "row", alignItems: "baseline", columnGap: 8 })}>
            <Words text={l.label} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
            <Words text={l.i === on && l.share ? l.share : l.shown} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface"), fontVariantNumeric: "tabular-nums" }} />
          </View>
          <View style={sx({ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c("surface-container-highest") })}>
            <View style={sx({ height: 6, borderRadius: 3, width: `${l.part * 100}%`, backgroundColor: c("primary") })} />
          </View>
        </Tap>
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
    <Surface base={merge(COL, { width: Math.round(p.width ?? 380), boxSizing: "border-box", padding: 16, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low") }, fill)} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface") }} /> : null}
      {rows.map((row, i) => (
        <View key={i} style={sx(COL, { alignItems: "center", rowGap: 2 })}>
          <View style={sx(ROW, { justifyContent: "center", boxSizing: "border-box", width: `${Math.max(18, (row.value / most) * 100)}%`, height: 36, borderRadius: corner(kit, "md"), padding: "0 8px", overflow: "hidden", backgroundColor: c(chartRole(i)) })}>
            <Words text={`${row.name} ${row.value}`} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c("on-primary") }} />
          </View>
          {i < rows.length - 1 && row.value > 0 ? <Words text={`↓ ${Math.round((rows[i + 1].value / row.value) * 100)}%`} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} /> : null}
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
  const percent = (n: number) => `${(n / units) * 100}%`;
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 380), boxSizing: "border-box", padding: 12, rowGap: 4, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low"), overflow: "hidden" }, fill)} appearance={p} testID={p.testID}>
      {p.title ? <Words text={p.title} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface"), paddingBottom: 4 }} /> : null}
      <View style={sx({ display: "flex", flexDirection: "row" })}>
        <View style={sx({ width: 80, flexShrink: 0 })} />
        <View style={sx({ display: "flex", flexDirection: "row", flex: 1, minWidth: 0 })}>
          {Array.from({ length: units }, (_, i) => (
            <Words key={i} text={`${i + 1}${i === 0 ? (p.unit ?? "") : ""}`} lines={1} style={{ flex: 1, minWidth: 0, textAlign: "center", ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} />
          ))}
        </View>
      </View>
      {rows.map((row, i) => (
        <Tap key={i} label={`${row.name} ${row.done}%`} selected={i === on} onPress={() => setOn(i === on ? -1 : i)} style={{ ...ROW, borderRadius: corner(kit, "md"), backgroundColor: i === on ? c("secondary-container") : undefined }}>
          <Words text={row.name} lines={1} style={{ width: 80, flexShrink: 0, boxSizing: "border-box", paddingRight: 8, ...typeStyle(kit, "body-small"), color: c("on-surface") }} />
          <View style={sx({ position: "relative", flex: 1, height: 28, minWidth: 0 })}>
            <View style={sx({ position: "absolute", top: 4, bottom: 4, left: percent(row.start), width: percent(row.length), borderRadius: corner(kit, "sm"), overflow: "hidden", backgroundColor: c("primary-container") })}>
              <View style={sx({ height: "100%", width: `${Math.min(100, Math.max(0, row.done))}%`, backgroundColor: c("primary") })} />
            </View>
            {today >= 0 ? <View style={sx({ position: "absolute", top: 0, bottom: 0, width: 1, left: percent(today), backgroundColor: c("error") })} /> : null}
          </View>
        </Tap>
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
  const { shown, count, current, pages, size, numeric } = tableLines(rows, { query, sort, page, pageSize: p.pageSize ?? 5, total: p.total ?? 0 });
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
  const line = `1px solid ${c("outline-variant")}`;
  const cell: CSS = { ...ROW, boxSizing: "border-box", flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, paddingLeft: 16, paddingRight: 16 };
  const check: CSS = { ...ROW, width: 40, flexShrink: 0, paddingLeft: 12, boxSizing: "border-box" };
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 560), boxSizing: "border-box", padding: 12, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low"), overflow: "hidden" }, fill)} appearance={p} testID={p.testID}>
      {p.title || p.search ? (
        <View style={sx(ROW, { flexWrap: "wrap", columnGap: 8, rowGap: 8 })}>
          {p.title ? <Words text={picked.length ? `${p.title} · ${picked.length}` : p.title} lines={1} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "title-medium"), color: c("on-surface") }} /> : null}
          {p.search ? (
            <Input
              size="sm"
              type="search"
              width={192}
              value={query}
              placeholder={p.search}
              ariaLabel={p.search}
              onChange={(v) => {
                setQuery(v);
                p.onSearch?.({ query: v });
                if (current !== 0) turn(0);
              }}
            />
          ) : null}
        </View>
      ) : null}
      <View ariaRole="grid">
        <View style={sx(ROW, { height: 56, borderBottom: line })}>
          {p.selectable ? (
            <View style={sx(check)}>
              <Checkbox label="" ariaLabel="All" checked={allOn} disabled={!shown.length} onChange={(on) => pick(on ? [...new Set([...picked, ...shown.map((l) => l.key)])] : picked.filter((k) => !shown.some((l) => l.key === k)))} />
            </View>
          ) : null}
          {t.columns.map((head, i) => {
            const by = sort?.column === i;
            return (
              <Tap key={i} role="columnheader" label={head} onPress={() => press(i)} style={{ ...cell, flexDirection: numeric[i] ? "row-reverse" : "row", columnGap: 4 }}>
                <Words text={head} lines={1} style={{ flexShrink: 1, ...typeStyle(kit, "title-small"), color: c("on-surface-variant") }} />
                <View style={sx({ opacity: by ? 1 : 0 })}>
                  <Glyph name={by && sort!.down ? "arrow_downward" : "arrow_upward"} size={16} color="on-surface-variant" />
                </View>
              </Tap>
            );
          })}
        </View>
        {shown.map((l, r) => {
          const on = picked.includes(l.key);
          return (
            <Tap key={l.key} testID={`row:${l.id}`} role="row" label={l.cells[0]} selected={on} onPress={p.taps?.[`row:${l.id}`] ?? noop} style={{ ...ROW, height: 52, borderBottom: r === shown.length - 1 ? "none" : line, backgroundColor: on ? c("secondary-container") : undefined }}>
              {p.selectable ? (
                <View style={sx(check)}>
                  <Checkbox label="" ariaLabel={l.cells[0]} checked={on} onChange={(v) => pick(v ? [...picked, l.key] : picked.filter((k) => k !== l.key))} />
                </View>
              ) : null}
              {t.columns.map((_, i) => (
                <View key={i} style={sx(cell)}>
                  <Words text={l.cells[i] ?? ""} lines={1} style={{ flexGrow: 1, ...typeStyle(kit, "body-medium"), color: c(on ? "on-secondary-container" : "on-surface"), textAlign: numeric[i] ? "right" : "left", ...(numeric[i] ? { fontVariantNumeric: "tabular-nums" } : null) }} />
                </View>
              ))}
            </Tap>
          );
        })}
      </View>
      <View style={sx(ROW, { justifyContent: "flex-end", columnGap: 4 })}>
        <Words text={`${count ? current * size + 1 : 0}–${Math.min(count, (current + 1) * size)} / ${count}`} style={{ marginRight: 8, ...typeStyle(kit, "label-medium"), color: c("on-surface"), opacity: SOFT, fontVariantNumeric: "tabular-nums" }} />
        <IconTap icon="chevron_left" label="Previous" disabled={current === 0} onPress={() => turn(current - 1)} />
        <IconTap icon="chevron_right" label="Next" disabled={current >= pages - 1} onPress={() => turn(current + 1)} />
      </View>
    </Surface>
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
  /* a card is written once: the field's confirm and the blur that follows it both end the same writing */
  const writing = useRef(false);
  const start = (lane: number) => {
    writing.current = true;
    setAdding(lane);
  };
  const commit = (lane: number, text: string) => {
    if (!writing.current) return;
    writing.current = false;
    if (text.trim()) p.onAdd?.({ lane, text: text.trim() });
    setDraft("");
    setAdding(-1);
  };
  const { box } = fieldStyle(kit, "outlined");
  return (
    <Surface base={merge({ width: Math.round(p.width ?? 560), boxSizing: "border-box", borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-lowest"), overflowX: "auto" }, fill)} appearance={p} testID={p.testID}>
      <View style={sx({ display: "flex", flexDirection: "row", alignItems: "flex-start", columnGap: 8, padding: 8 })}>
        {lanes.map((lane, l) => (
          <View key={l} ariaLabel={lane.title} style={sx(COL, { minWidth: 176, flexGrow: 1, flexBasis: 0, boxSizing: "border-box", padding: 8, rowGap: 8, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container") })}>
            <View style={sx(ROW, { justifyContent: "space-between", columnGap: 8, padding: "0 4px" })}>
              <Words text={lane.title} lines={1} style={{ flexShrink: 1, ...typeStyle(kit, "title-small"), color: c("on-surface") }} />
              <Words text={String(lane.cards.length)} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface"), opacity: SOFT }} />
            </View>
            {lane.cards.map((card) => {
              const open = shown === card.id;
              return (
                <View key={card.id} style={sx(COL, { borderRadius: corner(kit, "md"), backgroundColor: c(open ? "secondary-container" : "surface-container-lowest") })}>
                  <Tap
                    label={card.text}
                    selected={open}
                    onPress={() => {
                      if (!open) p.onOpen?.({ row: card.row, lane: l });
                      setPicked(open ? null : card.id);
                    }}
                    style={{ padding: 8 }}
                  >
                    <Words text={card.text} style={{ ...typeStyle(kit, "body-medium"), color: c(open ? "on-secondary-container" : "on-surface") }} />
                  </Tap>
                  {open ? (
                    <View style={sx(ROW, { justifyContent: "space-between", padding: "0 4px 4px" })}>
                      <IconTap icon="arrow_back" label="Move left" size={32} disabled={l === 0} onPress={() => p.onMove?.({ row: card.row, from: l, to: l - 1, before: -1 })} />
                      <IconTap icon="arrow_forward" label="Move right" size={32} disabled={l === lanes.length - 1} onPress={() => p.onMove?.({ row: card.row, from: l, to: l + 1, before: -1 })} />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {p.add ? (
              adding === l ? (
                <View style={sx(ROW, box, { boxSizing: "border-box", height: 40, padding: "0 12px" })}>
                  <TaroInput
                    focus
                    value={draft}
                    ariaLabel={p.add}
                    confirmType="done"
                    maxlength={-1}
                    onInput={(e) => setDraft(e.detail.value)}
                    onConfirm={(e) => commit(l, e.detail.value)}
                    onBlur={(e) => commit(l, e.detail.value)}
                    style={sx(typeStyle(kit, "body-medium"), BARE, { color: c("on-surface"), width: "100%" })}
                  />
                </View>
              ) : (
                <Tap onPress={() => start(l)} style={{ ...ROW, alignSelf: "flex-start", columnGap: 4, height: 32, padding: "0 8px", borderRadius: 16 }}>
                  <Glyph name="add" size={18} color="primary" />
                  <Words text={p.add} style={{ ...typeStyle(kit, "label-large"), color: c("primary") }} />
                </Tap>
              )
            ) : null}
          </View>
        ))}
      </View>
    </Surface>
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
  const soft: CSS = { color: c("on-surface"), opacity: SOFT };
  return (
    <Surface base={merge(COL, { width: Math.round(p.width ?? 360), boxSizing: "border-box", padding: 12, rowGap: 8, borderRadius: corner(kit, "lgi"), backgroundColor: c("surface-container-low") }, fill)} appearance={p} testID={p.testID}>
      <View style={sx(ROW, { columnGap: 4 })}>
        <Words text={m.title} style={{ flex: 1, paddingLeft: 4, ...typeStyle(kit, "title-medium"), color: c("on-surface") }} />
        <IconTap icon="chevron_left" label="Previous month" onPress={() => turn(-1)} />
        <IconTap icon="chevron_right" label="Next month" onPress={() => turn(1)} />
      </View>
      <View style={sx({ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", columnGap: 2, rowGap: 2, textAlign: "center" })}>
        {m.names.map((n, i) => (
          <Words key={`n${i}`} text={n} style={{ padding: "4px 0", ...typeStyle(kit, "label-small"), ...soft }} />
        ))}
        {Array.from({ length: m.lead }, (_, i) => (
          <View key={`lead-${i}`} />
        ))}
        {Array.from({ length: m.days }, (_, i) => {
          const d = i + 1;
          const here = d === m.today;
          return (
            <Tap key={d} label={`${m.prefix}${pad2(d)}`} selected={here} onPress={() => pick(d)} style={{ ...COL, alignItems: "center", justifyContent: "center", aspectRatio: "1", borderRadius: 999, backgroundColor: here ? c("primary") : undefined }}>
              <Words text={String(d)} style={{ ...typeStyle(kit, "body-medium"), color: c(here ? "on-primary" : "on-surface") }} />
              <View style={sx({ width: 4, height: 4, borderRadius: 2, backgroundColor: m.busy.has(d) ? c(here ? "on-primary" : "primary") : "transparent" })} />
            </Tap>
          );
        })}
      </View>
      <View style={sx(COL, { rowGap: 4 })}>
        {m.events.length === 0 ? <Words text={p.empty} style={{ textAlign: "center", padding: "8px 0", ...typeStyle(kit, "body-small"), ...soft }} /> : null}
        {m.events.map(({ r, i }) => (
          <Tap key={i} label={`${r[1] ?? ""} ${r[2] ?? ""}`.trim()} onPress={tapOf(p, `tab:${i}`)} style={{ ...ROW, columnGap: 12, padding: 8, borderRadius: corner(kit, "md"), backgroundColor: c("surface-container") }}>
            <Words text={r[1] ?? ""} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface"), fontVariantNumeric: "tabular-nums", flexShrink: 0 }} />
            <Words text={r[2] ?? ""} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
          </Tap>
        ))}
      </View>
    </Surface>
  );
}
