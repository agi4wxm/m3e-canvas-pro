import type { Item, Palette, FlowAlign, FlowSizing } from "@/lib/tokens";
import { t, useLang } from "@/lib/i18n";
import { partBySlug } from "@/parts/registry";
import { childLayoutOf, flowOfItem, sizingOf, type Flow } from "@/lib/flow";
import { Icon } from "./Icon";
import { Num } from "./PartPanel";
import { IconBtn, Segmented, Select, Toggle } from "./ui";

/* Auto layout in the panel, the way Figma lays it out: the container's direction, a 3 × 3 grid for where its parts
 * gather, the gap and the padding in a few numbers; and for a part in a layout, how it is sized on each axis, where it
 * stands across the run, its limits, and whether it stays where it was put. */

type Props = Record<string, unknown>;

const Label = ({ text, p }: { text: string; p: Palette }) => <div style={{ fontSize: 12, fontWeight: 600, color: p.onSurfaceVariant, padding: "0 4px 6px" }}>{text}</div>;

/** a number with a small icon or word in front of it, as Figma's fields are */
function Field({ icon, word, value, min, max, title, onChange, p }: { icon?: string; word?: string; value: number; min: number; max: number; title: string; onChange: (v: number) => void; p: Palette }) {
  return (
    <label title={title} style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 4px 0 8px", borderRadius: 8, background: p.surfaceContainerHigh, color: p.onSurfaceVariant }}>
      {icon ? <Icon name={icon} size={16} /> : <span style={{ fontSize: 11, fontWeight: 600, minWidth: 12 }}>{word}</span>}
      <Num value={value} min={min} max={max} title={title} onChange={onChange} p={p} />
    </label>
  );
}

const POS = ["start", "center", "end"] as const;

/** The 3 × 3 grid: across is the run's axis for a row, down for a column. A spread run lights a whole line. */
function AlignGrid({ dir, justify, align, onPick, p }: { dir: "row" | "column"; justify: string; align: string; onPick: (main: string, cross: string) => void; p: Palette }) {
  const lang = useLang();
  const spread = !POS.includes(justify as (typeof POS)[number]);
  const crossFree = !POS.includes(align as (typeof POS)[number]);
  return (
    <div role="group" aria-label={t("layoutAlign", lang)} style={{ display: "grid", gridTemplateColumns: "repeat(3, 24px)", gridTemplateRows: "repeat(3, 24px)", gap: 2, padding: 4, borderRadius: 10, background: p.surfaceContainerHigh }}>
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
              style={{ width: 24, height: 24, border: "none", padding: 0, borderRadius: 6, cursor: "pointer", display: "grid", placeItems: "center", background: on ? p.primary : "transparent" }}
            >
              <span style={{ width: on ? 10 : 4, height: on ? (dir === "row" ? 12 : 6) : 4, borderRadius: 2, background: on ? p.onPrimary : p.outline }} />
            </button>
          );
        }),
      )}
    </div>
  );
}

/** The container's own auto layout: direction, alignment, gaps, padding and whether it hugs what it holds. */
export function FlowControl({ item, onChange, p }: { item: Item; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const def = partBySlug(item.component);
  if (!def?.flow) return null;
  const props: Props = item.props ?? {};
  const set = (patch: Props) => onChange({ props: { ...props, ...patch } });
  const drop = (keys: string[], patch: Props = {}) => onChange({ props: { ...Object.fromEntries(Object.entries(props).filter(([k]) => !keys.includes(k))), ...patch } });
  const grid = !!def.flow.grid;
  const f = flowOfItem(item);
  const dir = grid ? "grid" : ((props.layout as string) ?? "free");
  const on = !!f;
  const has = (key: string) => def.props.some((d) => d.key === key);
  const sides = ["padTop", "padRight", "padBottom", "padLeft"] as const;
  const each = sides.some((k) => typeof props[k] === "number");
  return (
    <div data-flow-control style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!grid && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1 }}>
            <Segmented<string>
              options={[
                { key: "free", icon: "block", title: t("dirOff", lang) },
                { key: "row", icon: "arrow_forward", title: t("dirRow", lang) },
                { key: "column", icon: "arrow_downward", title: t("dirColumn", lang) },
                { key: "grid", icon: "grid_view", title: t("dirGrid", lang) },
              ]}
              value={dir}
              onChange={(layout) => set({ layout })}
              p={p}
              height={36}
              label={t("layoutSection", lang)}
            />
          </div>
          {dir === "row" && <IconBtn icon="wrap_text" on={!!f?.wrap} onClick={() => set({ wrap: !f?.wrap })} title={t("layoutWrap", lang)} p={p} size={36} />}
        </div>
      )}
      {on && f && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {f.dir === "grid" ? (
              <div style={{ flex: "0 0 auto" }}>
                <Segmented<string>
                  options={(["start", "center", "end", "stretch"] as const).map((k) => ({ key: k, icon: k === "start" ? "align_vertical_top" : k === "center" ? "align_vertical_center" : k === "end" ? "align_vertical_bottom" : "height", title: t(k === "start" ? "alignStart" : k === "center" ? "alignCenter" : k === "end" ? "alignEnd" : "crossStretch", lang) }))}
                  value={f.align}
                  onChange={(align) => set({ align })}
                  p={p}
                  height={32}
                  grow={false}
                  label={t("layoutAlign", lang)}
                />
              </div>
            ) : (
              <AlignGrid dir={f.dir} justify={f.justify} align={f.align} p={p} onPick={(main, cross) => set({ align: cross, ...(POS.includes(f.justify as (typeof POS)[number]) ? { justify: main } : {}) })} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <Field icon={f.dir === "column" ? "vertical_distribute" : "horizontal_distribute"} value={f.gap} min={0} max={96} title={t("layoutGap", lang)} onChange={(gap) => set({ gap })} p={p} />
              {(f.dir === "grid" || f.wrap) && has("gapY") && <Field icon="vertical_distribute" value={f.gapY} min={0} max={96} title={t("layoutGapY", lang)} onChange={(gapY) => (gapY === f.gap ? drop(["gapY"]) : set({ gapY }))} p={p} />}
              {f.dir === "grid" && has("columns") && <Field icon="view_column" value={f.columns} min={1} max={12} title={t("layoutColumns", lang)} onChange={(columns) => set({ columns })} p={p} />}
            </div>
          </div>
          {f.dir !== "grid" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Select
                  options={[
                    { key: "packed", label: t("spacePacked", lang) },
                    { key: "between", label: t("spaceBetween", lang) },
                    { key: "around", label: t("spaceAround", lang) },
                    { key: "evenly", label: t("spaceEvenly", lang) },
                  ]}
                  value={POS.includes(f.justify as (typeof POS)[number]) ? "packed" : f.justify}
                  onChange={(k) => set({ justify: k === "packed" ? "start" : k })}
                  p={p}
                  label={t("spacingMode", lang)}
                />
              </div>
              <IconBtn icon={f.dir === "column" ? "width" : "height"} on={f.align === "stretch"} onClick={() => set({ align: f.align === "stretch" ? "start" : "stretch" })} title={t("crossStretch", lang)} p={p} size={36} />
              {f.dir === "row" && <IconBtn icon="format_underlined" on={f.align === "baseline"} onClick={() => set({ align: f.align === "baseline" ? "center" : "baseline" })} title={t("crossBaseline", lang)} p={p} size={36} />}
            </div>
          )}
          <div>
            <Label text={t("layoutPadding", lang)} p={p} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {each ? (
                <>
                  <Field word="↑" value={f.pad.t} min={0} max={96} title={t("padTop", lang)} onChange={(v) => set({ padTop: v })} p={p} />
                  <Field word="→" value={f.pad.r} min={0} max={96} title={t("padRight", lang)} onChange={(v) => set({ padRight: v })} p={p} />
                  <Field word="↓" value={f.pad.b} min={0} max={96} title={t("padBottom", lang)} onChange={(v) => set({ padBottom: v })} p={p} />
                  <Field word="←" value={f.pad.l} min={0} max={96} title={t("padLeft", lang)} onChange={(v) => set({ padLeft: v })} p={p} />
                </>
              ) : (
                <>
                  <Field icon="width" value={f.padX} min={0} max={96} title={t("padH", lang)} onChange={(padX) => set({ padX })} p={p} />
                  <Field icon="height" value={f.padY} min={0} max={96} title={t("padV", lang)} onChange={(padY) => set({ padY })} p={p} />
                </>
              )}
              <IconBtn
                icon="padding"
                on={each}
                title={t("padEach", lang)}
                p={p}
                size={32}
                onClick={() => (each ? drop([...sides]) : set({ padTop: f.pad.t, padRight: f.pad.r, padBottom: f.pad.b, padLeft: f.pad.l }))}
              />
            </div>
          </div>
          {(has("hugWidth") || has("hugHeight")) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(["w", "h"] as const).map((axis) => {
                const key = axis === "w" ? "hugWidth" : "hugHeight";
                if (!has(key)) return null;
                return (
                  <div key={axis} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 44, fontSize: 12, color: p.onSurfaceVariant }}>{t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}</span>
                    <div style={{ flex: 1 }}>
                      <Segmented<string>
                        options={[
                          { key: "fixed", label: t("sizeFixed", lang) },
                          { key: "hug", label: t("sizeHug", lang) },
                        ]}
                        value={props[key] === true ? "hug" : "fixed"}
                        onChange={(k) => set({ [key]: k === "hug" })}
                        p={p}
                        height={32}
                        label={t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** the icons of where a part stands across its run: across a column that is left to right, across a row top to bottom */
const selfIcon = (k: string, across: "x" | "y") => (k === "auto" ? "auto_mode" : k === "baseline" ? "format_underlined" : k === "stretch" ? (across === "x" ? "width" : "height") : `align_${across === "x" ? "horizontal" : "vertical"}_${across === "x" ? (k === "start" ? "left" : k === "center" ? "center" : "right") : k === "start" ? "top" : k === "center" ? "center" : "bottom"}`);

/** A part in a layout: how it is sized on each axis, where it stands across the run, its limits, its columns in a grid,
 *  and whether it stays where it was put. */
export function FlowItemControl({ item, parent, onChange, p }: { item: Item; parent: Flow; onChange: (patch: Partial<Item>) => void; p: Palette }) {
  const lang = useLang();
  const c = childLayoutOf(item);
  /* a part that lays out its own contents can take their size */
  const hugs = !!flowOfItem(item);
  const main = parent.dir === "column" ? "h" : "w";
  const setSize = (axis: "w" | "h", v: FlowSizing) => {
    const flowSize = { ...c.size, [axis]: v };
    /* the run's axis said by `flowFill` before is said here now */
    onChange({ flowSize, ...(axis === main && item.flowFill ? { flowFill: undefined } : {}) });
  };
  const setLimit = (which: "flowMin" | "flowMax", axis: "w" | "h", v: number) => {
    const cur = { ...(c[which === "flowMin" ? "min" : "max"]) };
    if (v > 0) cur[axis] = v;
    else delete cur[axis];
    onChange({ [which]: Object.keys(cur).length ? cur : undefined });
  };
  return (
    <div data-flow-item style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Toggle on={c.absolute} onChange={(on) => onChange({ flowAbsolute: on || undefined })} label={t("flowAbsolute", lang)} p={p} grow />
      {!c.absolute && (
        <>
          {(["w", "h"] as const).map((axis) => {
            const now = sizingOf(item, parent, axis);
            const limited = now !== "fixed";
            return (
              <div key={axis} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 44, fontSize: 12, color: p.onSurfaceVariant }}>{t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}</span>
                  <div style={{ flex: 1 }}>
                    <Segmented<FlowSizing>
                      options={[
                        { key: "fixed", label: t("sizeFixed", lang) },
                        ...(hugs ? [{ key: "hug" as const, label: t("sizeHug", lang) }] : []),
                        { key: "fill", label: t("sizeFill", lang) },
                      ]}
                      value={now === "hug" && !hugs ? "fixed" : now}
                      onChange={(v) => setSize(axis, v)}
                      p={p}
                      height={32}
                      label={t(axis === "w" ? "sizeWidth" : "sizeHeight", lang)}
                    />
                  </div>
                </div>
                {limited && (
                  <div style={{ display: "flex", gap: 6, paddingLeft: 52 }} title={t("flowLimitHint", lang)}>
                    <Field word={t("flowMin", lang)} value={c.min[axis] ?? 0} min={0} max={2400} title={`${t("flowMin", lang)} · ${t("flowLimitHint", lang)}`} onChange={(v) => setLimit("flowMin", axis, v)} p={p} />
                    <Field word={t("flowMax", lang)} value={c.max[axis] ?? 0} min={0} max={2400} title={`${t("flowMax", lang)} · ${t("flowLimitHint", lang)}`} onChange={(v) => setLimit("flowMax", axis, v)} p={p} />
                  </div>
                )}
              </div>
            );
          })}
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
              height={32}
              label={t("alignSelf", lang)}
            />
          </div>
          {parent.dir === "grid" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: p.onSurfaceVariant }}>{t("flowSpan", lang)}</span>
              <Field icon="view_column" value={c.span} min={1} max={parent.columns} title={t("flowSpan", lang)} onChange={(v) => onChange({ flowSpan: v > 1 ? v : undefined })} p={p} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
