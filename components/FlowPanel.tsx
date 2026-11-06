import { useEffect, useState } from "react";
import type { Item, Palette, FlowAlign, FlowSizing } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { partBySlug } from "@/parts/registry";
import { childLayoutOf, flowOfItem, sizingOf, type Flow } from "@/lib/flow";
import { FieldToggle, NumberField } from "./NumberField";
import { Segmented, Select, Toggle } from "./ui";

/* Auto layout in the panel, the way Figma lays it out: the container's direction, a 3 × 3 grid for where its parts
 * gather beside the gap, the padding in two numbers (or four), and for a part in a layout how it is sized on each axis,
 * where it stands across the run, its limits, and whether it stays where it was put. The pieces are put together by
 * the design panel (components/DesignPanel.tsx); `FlowControl` is all of a container's in one, for the phone's sheet. */

type Props = Record<string, unknown>;

const Label = ({ text, p }: { text: string; p: Palette }) => <div style={{ fontSize: 11, fontWeight: 500, color: p.onSurfaceVariant, padding: "0 2px 4px" }}>{text}</div>;

const POS = ["start", "center", "end"] as const;

/** The 3 × 3 grid: across is the run's axis for a row, down for a column. A spread run lights a whole line. */
export function AlignGrid({ dir, justify, align, onPick, p }: { dir: "row" | "column"; justify: string; align: string; onPick: (main: string, cross: string) => void; p: Palette }) {
  const lang = useLang();
  const spread = !POS.includes(justify as (typeof POS)[number]);
  const crossFree = !POS.includes(align as (typeof POS)[number]);
  return (
    <div role="group" aria-label={t("layoutAlign", lang)} style={{ display: "grid", gridTemplateColumns: "repeat(3, 20px)", gridTemplateRows: "repeat(3, 20px)", gap: 2, padding: 4, borderRadius: 6, background: p.surfaceContainerHigh, flex: "0 0 auto" }}>
      {POS.map((y) =>
        POS.map((x) => {
          const main = dir === "row" ? x : y;
          const cross = dir === "row" ? y : x;
          const on = (spread || main === justify) && (crossFree || cross === align);
          return (
            <button
              key={`${x}-${y}`}
              data-align-cell={`${x}-${y}`}
              aria-pressed={on}
              title={`${t(x === "start" ? "alignStart" : x === "center" ? "alignCenter" : "alignEnd", lang)} · ${t(y === "start" ? "alignStart" : y === "center" ? "alignCenter" : "alignEnd", lang)}`}
              onClick={() => onPick(main, cross)}
              style={{ width: 20, height: 20, border: "none", padding: 0, borderRadius: 4, cursor: "pointer", display: "grid", placeItems: "center", background: on ? p.primary : "transparent" }}
            >
              <span style={{ width: on ? 8 : 3, height: on ? (dir === "row" ? 10 : 5) : 3, borderRadius: 1.5, background: on ? p.onPrimary : p.outline }} />
            </button>
          );
        }),
      )}
    </div>
  );
}

/** A limit that may be left unset: empty, with a dash, until a number is written; emptied, it is unset again. */
export function LimitField({ word, value, title, onChange, p }: { word: string; value: number | undefined; title: string; onChange: (v: number | undefined) => void; p: Palette }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value === undefined ? "" : String(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = Math.round(Number(text));
    if (text.trim() === "" || !Number.isFinite(n) || n <= 0) return onChange(undefined);
    onChange(Math.min(2400, n));
  };
  return (
    <label title={title} style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 28, flex: 1, minWidth: 0, padding: "0 4px 0 6px", borderRadius: 6, background: p.surfaceContainerHigh, color: p.onSurfaceVariant, boxSizing: "border-box", outline: editing ? `1.5px solid ${p.primary}` : "none", outlineOffset: -1.5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{word}</span>
      <input
        inputMode="numeric"
        aria-label={title}
        value={text}
        placeholder="—"
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(value === undefined ? "" : String(value));
            setEditing(false);
          }
        }}
        style={{ flex: 1, minWidth: 0, width: "100%", height: 26, padding: "0 4px", border: "none", background: "transparent", color: p.onSurface, fontSize: 12, fontVariantNumeric: "tabular-nums", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
      />
    </label>
  );
}

/** what writing a container's own layout props looks like */
function writer(item: Item, onChange: (patch: Partial<Item>) => void) {
  const props: Props = item.props ?? {};
  return {
    props,
    set: (patch: Props) => onChange({ props: { ...props, ...patch } }),
    drop: (keys: string[], patch: Props = {}) => onChange({ props: { ...Object.fromEntries(Object.entries(props).filter(([k]) => !keys.includes(k))), ...patch } }),
  };
}

/** a container's direction: off, a row, a column, a grid; and whether a row wraps */
export function FlowDirection({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const def = partBySlug(item.component);
  if (!def?.flow || def.flow.grid) return null;
  const { set } = writer(item, onChange);
  const f = flowOfItem(item);
  const dir = f ? f.dir : "free";
  return (
    <div data-flow-control style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Segmented<string>
          options={[
            { key: "free", icon: "block", title: t("dirOff", lang) },
            { key: "column", icon: "arrow_downward", title: t("dirColumn", lang) },
            { key: "row", icon: "arrow_forward", title: t("dirRow", lang) },
            { key: "grid", icon: "grid_view", title: t("dirGrid", lang) },
          ]}
          value={dir}
          onChange={(layout) => set({ layout })}
          p={p}
          height={28}
          label={t("layoutSection", lang)}
        />
      </div>
      <FieldToggle icon="wrap_text" on={!!f?.wrap} disabled={dir !== "row"} onClick={() => set({ wrap: !f?.wrap })} title={t("layoutWrap", lang)} p={p} name="wrap" />
    </div>
  );
}

/** A layout's alignment, gaps, distribution and padding, with the grid of where its parts gather beside the gap. */
export function FlowSpacing({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const def = partBySlug(item.component);
  const f = flowOfItem(item);
  if (!def?.flow || !f) return null;
  const { props, set, drop } = writer(item, onChange);
  const has = (key: string) => def.props.some((d) => d.key === key);
  const sides = ["padTop", "padRight", "padBottom", "padLeft"] as const;
  const each = sides.some((k) => typeof props[k] === "number");
  const packed = POS.includes(f.justify as (typeof POS)[number]);
  return (
    <div data-flow-spacing style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {f.dir === "grid" ? (
          <div style={{ flex: "0 0 auto" }}>
            <Segmented<string>
              options={(["start", "center", "end", "stretch"] as const).map((k) => ({ key: k, icon: k === "start" ? "align_vertical_top" : k === "center" ? "align_vertical_center" : k === "end" ? "align_vertical_bottom" : "height", title: t(k === "start" ? "alignStart" : k === "center" ? "alignCenter" : k === "end" ? "alignEnd" : "crossStretch", lang) }))}
              value={f.align}
              onChange={(align) => set({ align })}
              p={p}
              height={28}
              grow={false}
              label={t("layoutAlign", lang)}
            />
          </div>
        ) : (
          <AlignGrid dir={f.dir} justify={f.justify} align={f.align} p={p} onPick={(main, cross) => set({ align: cross, ...(packed ? { justify: main } : {}) })} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <NumberField name="gap" icon={f.dir === "column" ? "vertical_distribute" : "horizontal_distribute"} value={f.gap} min={0} max={96} title={t("dzGap", lang)} onChange={(gap) => set({ gap })} p={p} />
          {(f.dir === "grid" || f.wrap) && has("gapY") && <NumberField name="gapY" icon="vertical_distribute" value={f.gapY} min={0} max={96} title={t("layoutGapY", lang)} onChange={(gapY) => (gapY === f.gap ? drop(["gapY"]) : set({ gapY }))} p={p} />}
          {f.dir === "grid" && has("columns") && <NumberField name="columns" icon="view_column" value={f.columns} min={1} max={12} title={t("layoutColumns", lang)} onChange={(columns) => set({ columns })} p={p} />}
        </div>
      </div>
      {f.dir !== "grid" && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Select
              options={[
                { key: "packed", label: t("spacePacked", lang) },
                { key: "between", label: t("spaceBetween", lang) },
                { key: "around", label: t("spaceAround", lang) },
                { key: "evenly", label: t("spaceEvenly", lang) },
              ]}
              value={packed ? "packed" : f.justify}
              onChange={(k) => set({ justify: k === "packed" ? "start" : k })}
              p={p}
              label={t("spacingMode", lang)}
            />
          </div>
          <FieldToggle icon={f.dir === "column" ? "width" : "height"} on={f.align === "stretch"} onClick={() => set({ align: f.align === "stretch" ? "start" : "stretch" })} title={t("crossStretch", lang)} p={p} name="stretch" />
          <FieldToggle icon="format_underlined" on={f.align === "baseline"} disabled={f.dir !== "row"} onClick={() => set({ align: f.align === "baseline" ? "center" : "baseline" })} title={t("crossBaseline", lang)} p={p} name="baseline" />
        </div>
      )}
      <div>
        <Label text={t("layoutPadding", lang)} p={p} />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {each ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, flex: 1, minWidth: 0 }}>
              <NumberField name="padLeft" word="L" value={f.pad.l} min={0} max={96} title={t("padLeft", lang)} onChange={(v) => set({ padLeft: v })} p={p} />
              <NumberField name="padTop" word="T" value={f.pad.t} min={0} max={96} title={t("padTop", lang)} onChange={(v) => set({ padTop: v })} p={p} />
              <NumberField name="padRight" word="R" value={f.pad.r} min={0} max={96} title={t("padRight", lang)} onChange={(v) => set({ padRight: v })} p={p} />
              <NumberField name="padBottom" word="B" value={f.pad.b} min={0} max={96} title={t("padBottom", lang)} onChange={(v) => set({ padBottom: v })} p={p} />
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, flex: 1, minWidth: 0 }}>
              <NumberField name="padX" icon="padding" value={f.padX} min={0} max={96} title={t("dzPadH", lang)} onChange={(padX) => set({ padX })} p={p} />
              <NumberField name="padY" icon="vertical_align_center" value={f.padY} min={0} max={96} title={t("dzPadV", lang)} onChange={(padY) => set({ padY })} p={p} />
            </div>
          )}
          <FieldToggle icon="crop_free" on={each} title={t("padEach", lang)} p={p} name="padEach" onClick={() => (each ? drop([...sides]) : set({ padTop: f.pad.t, padRight: f.pad.r, padBottom: f.pad.b, padLeft: f.pad.l }))} />
        </div>
      </div>
    </div>
  );
}

/* ---------- sizing on each axis ---------- */

/** how a part is sized on an axis now: in its layout by what the layout says of it, else its own hugging */
export function sizingNow(item: Item, parent: Flow | null, axis: "w" | "h"): FlowSizing {
  if (parent && !childLayoutOf(item).absolute) return sizingOf(item, parent, axis);
  const f = flowOfItem(item);
  return f && (axis === "w" ? f.hugW : f.hugH) ? "hug" : "fixed";
}

/** the ways a part can be sized on an axis: fixed always, hug when it lays out its own contents, fill inside a layout */
export function sizingChoices(item: Item, parent: Flow | null, axis: "w" | "h"): FlowSizing[] {
  const def = partBySlug(item.component);
  const hugKey = axis === "w" ? "hugWidth" : "hugHeight";
  const hugs = !!flowOfItem(item) && !!def?.props.some((d) => d.key === hugKey);
  const inFlow = !!parent && !childLayoutOf(item).absolute;
  return ["fixed", ...(hugs ? (["hug"] as const) : []), ...(inFlow ? (["fill"] as const) : [])];
}

/** What choosing a way to size a part on an axis writes. In a layout it is the part's `flowSize`, with the part's own
 *  hugging kept in step so it still holds once taken out; on its own it is the hugging itself. */
export function sizingPatch(item: Item, parent: Flow | null, axis: "w" | "h", v: FlowSizing): Partial<Item> {
  const def = partBySlug(item.component);
  const hugKey = axis === "w" ? "hugWidth" : "hugHeight";
  const hugs = !!flowOfItem(item) && !!def?.props.some((d) => d.key === hugKey);
  const own = hugs && v !== "fill" ? { props: { ...item.props, [hugKey]: v === "hug" } } : {};
  if (!parent || childLayoutOf(item).absolute) return own;
  const c = childLayoutOf(item);
  const main = parent.dir === "column" ? "h" : "w";
  /* the run's axis said by `flowFill` before is said here now */
  return { flowSize: { ...c.size, [axis]: v }, ...own, ...(axis === main && item.flowFill ? { flowFill: undefined } : {}) };
}

/** the least and most a layout may make a part on an axis, beside its sizing */
export function SizeLimits({ item, axis, onChange, p }: { item: Item; axis: "w" | "h"; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const c = childLayoutOf(item);
  const setLimit = (which: "flowMin" | "flowMax", v: number | undefined) => {
    const cur = { ...c[which === "flowMin" ? "min" : "max"] };
    if (v && v > 0) cur[axis] = v;
    else delete cur[axis];
    onChange({ [which]: Object.keys(cur).length ? cur : undefined });
  };
  return (
    <div style={{ display: "flex", gap: 4 }} title={t("flowLimitHint", lang)}>
      <LimitField word={t(axis === "w" ? "dzMinW" : "dzMinH", lang)} value={c.min[axis]} title={`${t(axis === "w" ? "dzMinW" : "dzMinH", lang)} · ${t("flowLimitHint", lang)}`} onChange={(v) => setLimit("flowMin", v)} p={p} />
      <LimitField word={t(axis === "w" ? "dzMaxW" : "dzMaxH", lang)} value={c.max[axis]} title={`${t(axis === "w" ? "dzMaxW" : "dzMaxH", lang)} · ${t("flowLimitHint", lang)}`} onChange={(v) => setLimit("flowMax", v)} p={p} />
    </div>
  );
}

/** the icons of where a part stands across its run: across a column that is left to right, across a row top to bottom */
const selfIcon = (k: string, across: "x" | "y") => (k === "auto" ? "auto_mode" : k === "baseline" ? "format_underlined" : k === "stretch" ? (across === "x" ? "width" : "height") : `align_${across === "x" ? "horizontal" : "vertical"}_${across === "x" ? (k === "start" ? "left" : k === "center" ? "center" : "right") : k === "start" ? "top" : k === "center" ? "center" : "bottom"}`);

/** where a part in a layout stands across the run, over the container's own alignment, and its columns in a grid */
export function SelfAlign({ item, parent, onChange, p }: { item: Item; parent: Flow; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const c = childLayoutOf(item);
  if (c.absolute) return null;
  return (
    <div data-flow-item style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <Label text={t("alignSelf", lang)} p={p} />
        <Segmented<string>
          options={(["auto", "start", "center", "end", "stretch", ...(parent.dir === "column" ? [] : ["baseline"])] as const).map((k) => ({
            key: k,
            icon: selfIcon(k, parent.dir === "column" ? "x" : "y"),
            title: t(k === "auto" ? "alignAuto" : k === "start" ? "alignStart" : k === "center" ? "alignCenter" : k === "end" ? "alignEnd" : k === "stretch" ? "crossStretch" : "crossBaseline", lang),
          }))}
          value={c.self ?? "auto"}
          onChange={(k) => onChange({ alignSelf: k === "auto" ? undefined : (k as FlowAlign) })}
          p={p}
          height={28}
          label={t("alignSelf", lang)}
        />
      </div>
      {parent.dir === "grid" && <NumberField name="flowSpan" icon="view_column" word={undefined} value={c.span} min={1} max={parent.columns} title={t("flowSpan", lang)} onChange={(v) => onChange({ flowSpan: v > 1 ? v : undefined })} p={p} />}
    </div>
  );
}

/* ---------- all in one, for the phone ---------- */

/** The container's own auto layout: direction, alignment, gaps, padding and whether it hugs what it holds. */
export function FlowControl({ item, onChange, p, sizing = true }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette; sizing?: boolean }) {
  const lang = useLang();
  const def = partBySlug(item.component);
  if (!def?.flow) return null;
  const f = flowOfItem(item);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <FlowDirection item={item} onChange={onChange} p={p} />
      <FlowSpacing item={item} onChange={onChange} p={p} />
      {sizing &&
        f &&
        (["w", "h"] as const).map((axis) => {
          const choices = sizingChoices(item, null, axis);
          if (choices.length < 2) return null;
          return (
            <div key={axis} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 44, fontSize: 12, color: p.onSurfaceVariant }}>{t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}</span>
              <div style={{ flex: 1 }}>
                <Segmented<FlowSizing>
                  options={choices.map((k) => ({ key: k, label: t(k === "fixed" ? "sizeFixed" : k === "hug" ? "sizeHug" : "sizeFill", lang) }))}
                  value={sizingNow(item, null, axis)}
                  onChange={(v) => onChange(sizingPatch(item, null, axis, v))}
                  p={p}
                  height={32}
                  label={t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}
                />
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** A part in a layout, all in one: whether it stays where it was put, how it is sized, where it stands, its limits. */
export function FlowItemControl({ item, parent, onChange, p }: { item: Item; parent: Flow; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const c = childLayoutOf(item);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Toggle on={c.absolute} onChange={(on) => onChange({ flowAbsolute: on || undefined })} label={t("flowAbsolute", lang)} p={p} grow />
      {!c.absolute &&
        (["w", "h"] as const).map((axis) => (
          <div key={axis} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Segmented<FlowSizing>
              options={sizingChoices(item, parent, axis).map((k) => ({ key: k, label: t(k === "fixed" ? "sizeFixed" : k === "hug" ? "sizeHug" : "sizeFill", lang) }))}
              value={sizingNow(item, parent, axis)}
              onChange={(v) => onChange(sizingPatch(item, parent, axis, v))}
              p={p}
              height={32}
              label={t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}
            />
            {sizingNow(item, parent, axis) !== "fixed" && <SizeLimits item={item} axis={axis} onChange={onChange} p={p} />}
          </div>
        ))}
      <SelfAlign item={item} parent={parent} onChange={onChange} p={p} />
    </div>
  );
}
