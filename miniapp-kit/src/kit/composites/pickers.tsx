import { Input as TaroInput, Picker, View } from "@tarojs/components";
import { useState } from "react";

import type { PartBase } from "../atoms/basics";
import { Button } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c } from "../color";
import { starred, withField, type FieldProps } from "../field";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { fieldStyle } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { BARE, COL, merge, ROW, sx, type CSS } from "../styles";
import { corner, typeStyle, useKit, type Kit } from "../theme";
import { tapOf } from "./bars";

/* The pickers the editor has beyond a select and a date, in a mini-program: a select and a combobox on the platform's
 * picker (a wheel on WeChat and Douyin, a sheet on the web), a month to pick days from, a color typed as hex, a wheel
 * of options, a grid of items, chips of several choices, a palette, a number between arrows, a transfer list, a region
 * by its levels, and seats. Each is an input (docs/组件规范.md "受控值和草稿"): its value is a prop, handed out on
 * every change (`onChange`); given one it shows the prop as it is given (the screen's runtime keeps it for a form's
 * field or a variable), else it keeps a draft that starts over whenever the prop changes. What a seat costs or whether
 * it is taken is the data's; nothing here decides it. */

/** A value an input shows: given a change handler, the one it is handed and a change only goes out, so a refusal leaves
 *  it as it was; else its own draft, which starts at the prop and starts over whenever the prop says something else. */
export function useEntry<T>(given: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const key = JSON.stringify(given) ?? "";
  const [own, setOwn] = useState({ from: key, value: given });
  const value = onChange ? given : own.from === key ? own.value : given;
  return [
    value,
    (v: T) => {
      setOwn({ from: key, value: v });
      onChange?.(v);
    },
  ];
}

/** whether a control is held (disabled or read-only): a press does nothing */
export const heldBy = (p: { disabled?: boolean; readOnly?: boolean }) => !!p.disabled || !!p.readOnly;

/** a view's press, which stops there (a seat in a map is not a tap on the map), or none while it is held */
export const pressOf = (run: () => void, held = false) => (held ? undefined : (e: { stopPropagation: () => void }) => (e.stopPropagation(), run()));

/** The keys of a list's rows, by what each says and which of the same words it is: a mark kept by key stays with its
 *  row when the rows move, and two rows saying the same are still two (docs/组件规范.md "选中的行用稳定的键"). */
export function keysOf(words: string[]): string[] {
  const seen = new Map<string, number>();
  return words.map((w) => {
    const n = seen.get(w) ?? 0;
    seen.set(w, n + 1);
    return `${w}\u0000${n}`;
  });
}

/** rows counted from 1 in words like "1,3" (or places from 0, as code may give them), as places from 0 within `count` */
export function placesOf(words: string | number[] | undefined, count = Infinity): number[] {
  const raw = Array.isArray(words) ? words : String(words ?? "").split(/[\s,，]+/).map((x) => Number(x) - 1);
  return raw.filter((n, i, all) => Number.isInteger(n) && n >= 0 && n < count && all.indexOf(n) === i);
}

/** places as the words that hold them: counted from 1, in order */
export const wordsOfPlaces = (at: number[]) => [...at].sort((a, b) => a - b).map((n) => n + 1).join(",");

const HEX = /^#[0-9a-f]{3,8}$/i;

/** the outlined box a field-like picker stands in, in error's color when it is in error */
const boxOf = (kit: Kit, error?: boolean): CSS => merge({ ...ROW, position: "relative", boxSizing: "border-box" }, fieldStyle(kit, "outlined").box, error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null);

/* ---------- a select the platform's way, and a combobox ---------- */

export type NativeSelectProps = PartBase & FieldProps & { items?: ListRow[]; selected?: number; size?: "default" | "sm"; disabled?: boolean; error?: boolean; width?: number; onChange?: (i: number) => void };

/** The browser's own select, in a mini-program: a box with the option chosen that opens the platform's picker. */
export function NativeSelect(props: NativeSelectProps) {
  const p = withDefaults<NativeSelectProps>("native-select", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? 0, -1, items.length - 1), p.onChange);
  const value = items[chosen]?.label ?? "";
  const small = p.size === "sm";
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx({ width: Math.round(p.width ?? 224), flexShrink: 0 }, fill)}>
      <Picker mode="selector" range={items.map((it) => it.label)} value={Math.max(0, chosen)} disabled={heldBy(p)} onChange={(e) => setChosen(Number(e.detail.value))}>
        <View ariaRole="combobox" ariaLabel={starred(p.ariaLabel || value, p.required)} style={sx(boxOf(kit, p.error), { height: small ? 40 : 56, paddingLeft: 16, paddingRight: 12, columnGap: 8, opacity: p.disabled ? 0.38 : 1 })}>
          <Words text={value} lines={1} style={{ flex: 1, ...typeStyle(kit, small ? "body-medium" : "body-large"), color: c("on-surface") }} />
          <Glyph name="expand_more" size={20} color="on-surface-variant" />
        </View>
      </Picker>
    </View>,
  );
}

export type ComboboxProps = PartBase & FieldProps & { items?: ListRow[]; selected?: number; placeholder?: string; clear?: boolean; disabled?: boolean; error?: boolean; width?: number; onChange?: (i: number) => void };

/** A field of options: the platform's picker lists them (a mini-program has no list to filter as it is typed), and a
 *  clear button empties it. */
export function Combobox(props: ComboboxProps) {
  const p = withDefaults<ComboboxProps>("combobox", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? -1, -1, items.length - 1), p.onChange);
  const value = items[chosen]?.label;
  const held = heldBy(p);
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(boxOf(kit, p.error), { width: Math.round(p.width ?? 256), height: 56, paddingLeft: 16, paddingRight: 8, columnGap: 4, flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)}>
      <View style={sx({ flex: 1, minWidth: 0 })}>
        <Picker mode="selector" range={items.map((it) => it.label)} value={Math.max(0, chosen)} disabled={held} onChange={(e) => setChosen(Number(e.detail.value))}>
          <View ariaRole="combobox" ariaLabel={starred(p.ariaLabel || p.placeholder, p.required)} style={sx(ROW, { height: 54 })}>
            <Words text={value ?? p.placeholder} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: c(value ? "on-surface" : "on-surface-variant") }} />
          </View>
        </Picker>
      </View>
      {p.clear && value !== undefined ? (
        <View ariaRole="button" ariaLabel="Clear" onClick={pressOf(() => setChosen(-1), held)} style={sx(ROW, { width: 32, height: 32, justifyContent: "center" })}>
          <Glyph name="close" size={20} color="on-surface-variant" />
        </View>
      ) : null}
      <Glyph name="expand_more" size={20} color="on-surface-variant" />
    </View>,
  );
}

/* ---------- a calendar ---------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const two = (n: number) => String(n).padStart(2, "0");
/** a day as a form sends it: YYYY-MM-DD */
export const dayKey = (y: number, m: number, d: number) => `${y}-${two(m + 1)}-${two(d)}`;

/** the days a calendar has picked, as its value holds them: YYYY-MM-DD joined with commas */
export const daysOf = (value: string | undefined): string[] => String(value ?? "").split(",").map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

/** what a tap on a day makes of the days picked: the day alone; it added or taken away; a range's start, then its end */
export function pickDay(mode: string, days: string[], day: string): string[] {
  if (mode === "multiple") return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
  if (mode === "range") return days.length === 1 && day > days[0] ? [days[0], day] : [day];
  return [day];
}

/** the weeks of a month: rows of seven days from the day a week starts on, the months around filling the ends */
export function weeksOf(year: number, month: number, monday: boolean): { y: number; m: number; d: number; outside: boolean }[][] {
  const lead = (new Date(year, month, 1).getDay() - (monday ? 1 : 0) + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const out: { y: number; m: number; d: number; outside: boolean }[][] = [];
  for (let i = 0; i < Math.ceil((lead + days) / 7) * 7; i++) {
    const at = new Date(year, month, i - lead + 1);
    if (i % 7 === 0) out.push([]);
    out[out.length - 1].push({ y: at.getFullYear(), m: at.getMonth(), d: at.getDate(), outside: at.getMonth() !== month });
  }
  return out;
}

export type CalendarProps = PartBase &
  FieldProps & {
    mode?: "single" | "multiple" | "range";
    months?: number;
    outside?: boolean;
    weekStart?: "sunday" | "monday";
    disabled?: boolean;
    error?: boolean;
    /** the days picked, YYYY-MM-DD joined with commas (a range is its two ends) */
    value?: string;
    onChange?: (value: string) => void;
    /** the month it opens on, YYYY-MM: the first day picked's, else this month */
    month?: string;
  };

/** A month (or two) to pick days from, as Material's calendar draws it: the month and its arrows, the days of the week,
 *  today ringed, the days picked filled, a range's days between on a band. */
export function Calendar(props: CalendarProps) {
  const p = withDefaults<CalendarProps>("calendar", props);
  const kit = useKit();
  const [value, setValue] = useEntry(p.value ?? "", p.onChange);
  const days = daysOf(value);
  const start = /^(\d{4})-(\d{2})/.exec(p.month ?? days[0] ?? "");
  const now = new Date();
  const [shown, setShown] = useState(() => (start ? { y: Number(start[1]), m: Number(start[2]) - 1 } : { y: now.getFullYear(), m: now.getMonth() }));
  const today = dayKey(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = p.weekStart === "monday";
  const count = clampInt(p.months ?? 1, 1, 2);
  const range = p.mode === "range" && days.length === 2 ? days : undefined;
  const held = heldBy(p);
  const shift = (n: number) => setShown((s) => ({ y: new Date(s.y, s.m + n, 1).getFullYear(), m: new Date(s.y, s.m + n, 1).getMonth() }));
  const arrow = (icon: string, label: string, n: number) => (
    <View ariaRole="button" ariaLabel={label} onClick={pressOf(() => shift(n), !!p.disabled)} style={sx(ROW, { width: 40, height: 40, borderRadius: 20, justifyContent: "center" })}>
      <Glyph name={icon} size={20} color="on-surface-variant" />
    </View>
  );
  const month = (k: number) => {
    const at = new Date(shown.y, shown.m + k, 1);
    return (
      <View key={k} style={sx(COL, { rowGap: 8 })}>
        <View style={sx(ROW, { height: 40 })}>
          {k === 0 ? arrow("chevron_left", "Previous month", -1) : <View style={sx({ width: 40 })} />}
          <Words text={`${MONTHS[at.getMonth()]} ${at.getFullYear()}`} style={{ flex: 1, textAlign: "center", ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} />
          {k === count - 1 ? arrow("chevron_right", "Next month", 1) : <View style={sx({ width: 40 })} />}
        </View>
        <View style={sx(ROW)}>
          {Array.from({ length: 7 }, (_, i) => (
            <Words key={i} text={WEEKDAYS[(i + (monday ? 1 : 0)) % 7]} style={{ flex: 1, textAlign: "center", ...typeStyle(kit, "body-large"), color: c("on-surface") }} />
          ))}
        </View>
        {weeksOf(at.getFullYear(), at.getMonth(), monday).map((week, w) => (
          <View key={w} style={sx(ROW)}>
            {week.map((cell) => {
              const key = dayKey(cell.y, cell.m, cell.d);
              if (cell.outside && p.outside === false) return <View key={key} style={sx({ flex: 1, height: 40 })} />;
              const ends = range ? key === range[0] || key === range[1] : days.includes(key);
              const between = !!range && key > range[0] && key < range[1];
              const ink = ends ? "on-primary" : between ? "on-secondary-container" : cell.outside ? "on-surface-variant" : key === today ? "primary" : "on-surface";
              const band = range && (between || (ends && range[0] !== range[1])) ? { position: "absolute", top: 0, bottom: 0, left: key === range[0] ? "50%" : 0, right: key === range[1] ? "50%" : 0, backgroundColor: c("secondary-container") } : null;
              return (
                <View key={key} style={sx(ROW, { position: "relative", flex: 1, height: 40, justifyContent: "center" })}>
                  {band ? <View style={sx(band)} /> : null}
                  <View
                    ariaRole="button"
                    ariaLabel={key}
                    ariaSelected={ends || between}
                    onClick={pressOf(() => setValue(pickDay(p.mode ?? "single", range ?? days, key).join(",")), held)}
                    style={sx(ROW, { position: "relative", boxSizing: "border-box", width: 40, height: 40, borderRadius: 20, justifyContent: "center", backgroundColor: ends ? c("primary") : "transparent" }, key === today && !ends ? { border: `1px solid ${c("primary")}` } : null)}
                  >
                    <Words text={String(cell.d)} style={{ ...typeStyle(kit, "body-large"), color: c(ink) }} />
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };
  return withField(
    p,
    <Surface base={{ ...COL, width: 304, padding: 12, rowGap: 16, opacity: p.disabled ? 0.38 : 1 }} appearance={p} testID={p.testID} label={starred(p.ariaLabel, p.required)}>
      {Array.from({ length: count }, (_, k) => month(k))}
    </Surface>,
  );
}

/* ---------- a color typed as hex ---------- */

/** a color as it is typed: "#" and six hex digits, or nothing */
export function hexOf(typed: string): string | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(typed.trim());
  return m ? `#${m[1].toLowerCase()}` : undefined;
}

export type ColorFieldProps = PartBase & FieldProps & { label?: string; value?: string; disabled?: boolean; error?: boolean; width?: number; onChange?: (color: string) => void };

/** A color: its well, its label and its hex, which is typed (a mini-program has no color well and no eyedropper); what
 *  is typed is handed out once it is a color. */
export function ColorField(props: ColorFieldProps) {
  const p = withDefaults<ColorFieldProps>("color-field", props);
  const kit = useKit();
  const fill = useFill();
  const [given, setColor] = useEntry(p.value ?? "#6750A4", p.onChange);
  const color = /^#[0-9a-f]{6}$/i.test(given) ? given : "#6750A4";
  const [typing, setTyping] = useState<string | null>(null);
  return withField(
    p,
    <Surface base={merge({ ...ROW, boxSizing: "border-box", width: Math.round(p.width ?? 220), minWidth: 192, height: 56, columnGap: 12, paddingLeft: 12, paddingRight: 12, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-highest"), flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID}>
      <View ariaRole="img" ariaLabel={color.toUpperCase()} style={sx({ boxSizing: "border-box", width: 32, height: 32, borderRadius: 16, flexShrink: 0, backgroundColor: color, border: `1px solid ${c("outline-variant")}` })} />
      <View style={sx(COL, { flex: 1, minWidth: 0 })}>
        {p.label ? <Words text={starred(p.label, p.required)} lines={1} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} /> : null}
        <TaroInput
          value={typing ?? color.toUpperCase()}
          ariaLabel={p.label || p.ariaLabel || "Color"}
          disabled={heldBy(p)}
          maxlength={7}
          onInput={(e) => {
            const hex = hexOf(e.detail.value);
            setTyping(hex ? null : e.detail.value);
            if (hex) setColor(hex);
          }}
          onBlur={() => setTyping(null)}
          style={sx(typeStyle(kit, "body-medium"), BARE, { color: c("on-surface"), width: "100%", height: 20 })}
        />
      </View>
    </Surface>,
  );
}

/* ---------- a wheel of options ---------- */

export type WheelPickerProps = PartBase & FieldProps & { label?: string; items?: ListRow[]; selected?: number; width?: number; disabled?: boolean; error?: boolean; onChange?: (i: number) => void };

/** Options on a wheel, the chosen one in the middle and the others fading with their distance from it: a tap on one
 *  turns the wheel to it. */
export function WheelPicker(props: WheelPickerProps) {
  const p = withDefaults<WheelPickerProps>("wheel-picker", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onChange);
  const held = heldBy(p);
  return withField(
    p,
    <Surface base={merge({ ...COL, width: Math.round(p.width ?? 380), rowGap: 4, flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID}>
      {p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "label-large"), color: c(p.error ? "error" : "on-surface-variant") }} /> : null}
      <View ariaRole="listbox" ariaLabel={p.label || p.ariaLabel} style={sx(COL)}>
        {items.map((it, i) => {
          const d = Math.abs(i - chosen);
          return (
            <View key={i} ariaRole="option" ariaSelected={d === 0} onClick={pressOf(() => setChosen(i), held)} style={sx({ paddingTop: 4, paddingBottom: 4, borderRadius: corner(kit, "sm"), backgroundColor: d === 0 ? c("surface-container-high") : "transparent", opacity: Math.max(0.25, 1 - d * 0.3) })}>
              <Words text={it.label} style={{ textAlign: "center", ...typeStyle(kit, "body-large"), color: c(d === 0 ? "on-surface" : "on-surface-variant") }} />
            </View>
          );
        })}
      </View>
    </Surface>,
  );
}

/* ---------- a grid of items ---------- */

export type ItemPickerProps = PartBase & FieldProps & { items?: ListRow[]; columns?: number; selected?: number; width?: number; disabled?: boolean; error?: boolean; onChange?: (i: number) => void };

/** A choice of one among tiles, each an icon and its name, the chosen one tinted. */
export function ItemPicker(props: ItemPickerProps) {
  const p = withDefaults<ItemPickerProps>("item-picker", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const cols = clampInt(p.columns ?? 4, 1, 8);
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? 0, -1, items.length - 1), p.onChange);
  return withField(
    p,
    <Surface base={merge({ width: Math.round(p.width ?? 320), flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID}>
      <View ariaRole="radiogroup" ariaLabel={starred(p.ariaLabel, p.required)} style={sx({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 })}>
        {items.map((it, i) => {
          const on = i === chosen;
          const ink = on ? "on-secondary-container" : p.error ? "error" : "on-surface-variant";
          return (
            <View key={i} ariaRole="radio" ariaChecked={on} ariaLabel={it.label} onClick={pressOf(() => setChosen(i), heldBy(p))} style={sx(COL, { alignItems: "center", rowGap: 4, padding: 8, minWidth: 0, borderRadius: corner(kit, "lg"), backgroundColor: c(on ? "secondary-container" : "surface-container-low") })}>
              {it.icon ? <Glyph name={it.icon} size={24} filled={on} color={ink} /> : null}
              <Words text={it.label} lines={1} style={{ maxWidth: "100%", ...typeStyle(kit, "label-small"), color: c(ink) }} />
            </View>
          );
        })}
      </View>
    </Surface>,
  );
}

/* ---------- several choices ---------- */

export type MultiSelectProps = PartBase & FieldProps & { items?: ListRow[]; selected?: string; width?: number; disabled?: boolean; error?: boolean; onChange?: (selected: string) => void };

/** A choice of several: a filter chip for each option, the ones picked ticked; the value is the rows picked, counted
 *  from 1 ("1,3"). */
export function MultiSelect(props: MultiSelectProps) {
  const p = withDefaults<MultiSelectProps>("multi-select", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [value, setValue] = useEntry(String(p.selected ?? ""), p.onChange);
  const on = placesOf(value, items.length);
  return withField(
    p,
    <Surface base={merge({ ...ROW, flexWrap: "wrap", gap: 8, width: Math.round(p.width ?? 320), flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID} label={starred(p.ariaLabel, p.required)}>
      {items.map((it, i) => {
        const picked = on.includes(i);
        return (
          <View key={i} ariaRole="checkbox" ariaChecked={picked} ariaLabel={it.label} onClick={pressOf(() => setValue(wordsOfPlaces(picked ? on.filter((x) => x !== i) : [...on, i])), heldBy(p))} style={sx(ROW, { boxSizing: "border-box", height: 32, columnGap: 8, paddingLeft: picked ? 8 : 16, paddingRight: 16, borderRadius: corner(kit, "sm"), border: picked ? "none" : `1px solid ${c(p.error ? "error" : "outline-variant")}`, backgroundColor: picked ? c("secondary-container") : "transparent" })}>
            {picked ? <Glyph name="check" size={18} color="on-secondary-container" /> : null}
            <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c(picked ? "on-secondary-container" : "on-surface-variant") }} />
          </View>
        );
      })}
    </Surface>,
  );
}

/* ---------- a palette ---------- */

export type ColorPaletteProps = PartBase & FieldProps & { colors?: string | string[]; selected?: number; width?: number; disabled?: boolean; error?: boolean; onChange?: (i: number) => void };

/** A choice of one color among swatches, the chosen one ringed and ticked: its place among all the colors given, an
 *  unreadable one included (it is only not drawn). An author's colors are data: drawn as given. */
export function ColorPalette(props: ColorPaletteProps) {
  const p = withDefaults<ColorPaletteProps>("color-palette", props);
  const fill = useFill();
  const colors = (Array.isArray(p.colors) ? p.colors : String(p.colors ?? "").split(",")).map((x) => String(x).trim());
  const [chosen, setChosen] = useEntry(Math.round(p.selected ?? 0), p.onChange);
  return withField(
    p,
    <Surface base={merge({ ...ROW, flexWrap: "wrap", gap: 8, width: Math.round(p.width ?? 320), flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID} role="radiogroup" label={starred(p.ariaLabel, p.required)}>
      {colors.map((color, i) =>
        HEX.test(color) ? (
          <View key={`${color}-${i}`} ariaRole="radio" ariaChecked={i === chosen} ariaLabel={color} onClick={pressOf(() => setChosen(i), heldBy(p))} style={sx(ROW, { boxSizing: "border-box", width: 40, height: 40, borderRadius: 20, justifyContent: "center", backgroundColor: color, border: i === chosen ? `2px solid ${c("on-surface")}` : `1px solid ${c(p.error ? "error" : "outline-variant")}` })}>
            {i === chosen ? <Glyph name="check" size={20} color="on-primary" /> : null}
          </View>
        ) : null,
      )}
    </Surface>,
  );
}

/* ---------- a number between arrows ---------- */

export type NumberPickerProps = PartBase & FieldProps & { value?: number; min?: number; max?: number; step?: number; unit?: string; width?: number; disabled?: boolean; error?: boolean; onChange?: (value: number) => void };

/** A number between arrows, the next and the one before it shown above and below: each arrow steps it, kept to its
 *  range. */
export function NumberPicker(props: NumberPickerProps) {
  const p = withDefaults<NumberPickerProps>("number-picker", props);
  const kit = useKit();
  const min = p.min ?? 0;
  const max = p.max ?? 10;
  const by = Math.max(1, p.step ?? 1);
  const [given, setN] = useEntry(p.value ?? 5, p.onChange);
  const n = Math.min(max, Math.max(min, given));
  const held = heldBy(p);
  const next = n + by;
  const previous = n - by;
  const arrow = (icon: string, label: string, to: number, can: boolean) => (
    <View ariaRole="button" ariaLabel={label} onClick={pressOf(() => setN(to), !can || held)} style={sx(ROW, { width: 32, height: 32, borderRadius: 16, justifyContent: "center", opacity: can ? 1 : 0.38 })}>
      <Glyph name={icon} size={24} color="primary" />
    </View>
  );
  return withField(
    p,
    <Surface base={{ ...COL, alignItems: "center", rowGap: 4, width: Math.round(p.width ?? 96), flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }} appearance={p} testID={p.testID}>
      {arrow("keyboard_arrow_up", "Increase", next, next <= max)}
      <Words text={next <= max ? String(next) : ""} style={{ height: 24, ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} />
      <View ariaRole="spinbutton" ariaLabel={starred(p.ariaLabel || p.unit || "Value", p.required)} ariaValuenow={String(n)} ariaValuemin={String(min)} ariaValuemax={String(max)} style={sx(ROW, { alignSelf: "stretch", boxSizing: "border-box", justifyContent: "center", alignItems: "baseline", columnGap: 4, paddingTop: 4, paddingBottom: 4, borderRadius: corner(kit, "sm"), backgroundColor: c("surface-container-high") }, p.error ? { border: `1px solid ${c("error")}` } : null)}>
        <Words text={String(n)} style={{ ...typeStyle(kit, "title-large"), color: c("on-surface") }} />
        {p.unit ? <Words text={p.unit} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} /> : null}
      </View>
      <Words text={previous >= min ? String(previous) : ""} style={{ height: 24, ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} />
      {arrow("keyboard_arrow_down", "Decrease", previous, previous >= min)}
    </Surface>,
  );
}

/* ---------- a transfer list ---------- */

function Tick({ on }: { on: boolean }) {
  return (
    <View style={sx(ROW, { boxSizing: "border-box", width: 18, height: 18, flexShrink: 0, borderRadius: 2, justifyContent: "center", border: on ? "none" : `2px solid ${c("on-surface-variant")}`, backgroundColor: on ? c("primary") : "transparent" })}>
      {on ? <Glyph name="check" size={14} color="on-primary" /> : null}
    </View>
  );
}

export type TransferListProps = PartBase & FieldProps & { items?: ListRow[]; chosen?: string; from?: string; to?: string; width?: number; height?: number; disabled?: boolean; error?: boolean; onChange?: (chosen: string) => void };

/** Two lists side by side and arrows between them: the rows ticked on one side move to the other. What is on the right
 *  is the value (the rows counted from 1, "3,4"); which rows are ticked is the list's own draft, kept by what the rows
 *  say. */
export function TransferList(props: TransferListProps) {
  const p = withDefaults<TransferListProps>("transfer-list", props);
  const kit = useKit();
  const fill = useFill();
  const words = (p.items ?? []).map((it) => it.label);
  const keys = keysOf(words);
  const [value, setValue] = useEntry(String(p.chosen ?? ""), p.onChange);
  const right = placesOf(value, words.length);
  const left = words.map((_, i) => i).filter((i) => !right.includes(i));
  const [marked, setMarked] = useState<string[]>([]);
  const isMarked = (i: number) => marked.includes(keys[i]);
  const held = heldBy(p);
  const send = (group: number[], toRight: boolean) => {
    const moving = group.filter(isMarked);
    setValue((toRight ? [...right, ...moving] : right.filter((i) => !moving.includes(i))).map((n) => n + 1).join(","));
    setMarked((all) => all.filter((k) => !moving.some((i) => keys[i] === k)));
  };
  const pane = (title: string | undefined, group: number[]) => (
    <View style={sx(COL, { flex: 1, minWidth: 0, borderRadius: corner(kit, "md"), backgroundColor: c("surface-container"), overflow: "hidden" })}>
      <View style={sx(ROW, { columnGap: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 })}>
        <Words text={title} lines={1} style={{ flex: 1, ...typeStyle(kit, "title-small"), color: c("on-surface") }} />
        <Words text={`${group.filter(isMarked).length} / ${group.length}`} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} />
      </View>
      <View style={sx(COL, { flex: 1, minHeight: 0, overflowY: "auto", padding: 4 })}>
        {group.map((i) => {
          const on = isMarked(i);
          return (
            <View key={keys[i]} ariaRole="checkbox" ariaChecked={on} ariaLabel={words[i]} onClick={pressOf(() => setMarked((all) => (on ? all.filter((x) => x !== keys[i]) : [...all, keys[i]])), held)} style={sx(ROW, { columnGap: 8, padding: 8, borderRadius: corner(kit, "sm") })}>
              <Tick on={on} />
              <Words text={words[i]} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
            </View>
          );
        })}
      </View>
    </View>
  );
  const move = (icon: string, label: string, can: boolean, run: () => void) => (
    <View ariaRole="button" ariaLabel={label} onClick={pressOf(run, !can)} style={sx(ROW, { width: 32, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: c("secondary-container"), opacity: can ? 1 : 0.38 })}>
      <Glyph name={icon} size={20} color="on-secondary-container" />
    </View>
  );
  return withField(
    p,
    <Surface base={merge({ ...ROW, alignItems: "stretch", columnGap: 8, padding: 8, width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 220), flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low"), opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID} label={starred(p.ariaLabel, p.required)}>
      {pane(p.from, left)}
      <View style={sx(COL, { justifyContent: "center", rowGap: 8 })}>
        {move("chevron_right", "Move right", !held && left.some(isMarked), () => send(left, true))}
        {move("chevron_left", "Move left", !held && right.some(isMarked), () => send(right, false))}
      </View>
      {pane(p.to, right)}
    </Surface>,
  );
}

/* ---------- a region by its levels ---------- */

export type TableData = { columns?: string[]; rows?: unknown[][] };

/** The options of each level for the path picked so far: a level's are the places under the levels picked above it, and
 *  a level below the next one to pick has none yet. */
export function levelsOf(rows: string[][], path: string[]): string[][] {
  const depth = Math.max(1, ...rows.map((r) => r.length));
  return Array.from({ length: depth }, (_, level) => {
    if (level > path.length) return [];
    return [...new Set(rows.filter((r) => path.slice(0, level).every((at, i) => r[i] === at)).map((r) => r[level]).filter(Boolean))];
  });
}

/** a table's rows as words */
export const cellsOf = (data: TableData | undefined): string[][] => (Array.isArray(data?.rows) ? data.rows.map((r) => (Array.isArray(r) ? r.map((x) => (x === null || x === undefined ? "" : String(x))) : [])) : []);

export type RegionPickerProps = PartBase & FieldProps & { label?: string; placeholder?: string; data?: TableData; action?: string; value?: string; width?: number; height?: number; disabled?: boolean; error?: boolean; onChange?: (value: string) => void };

/** A place picked level by level, a column each: the path so far ("a/b/c") over them, and a button that is there once a
 *  place at the last level is picked (the `confirm` place). */
export function RegionPicker(props: RegionPickerProps) {
  const p = withDefaults<RegionPickerProps>("region-picker", props);
  const kit = useKit();
  const fill = useFill();
  const [words, setWords] = useEntry(String(p.value ?? ""), p.onChange);
  const path = words.split("/").filter(Boolean);
  const levels = levelsOf(cellsOf(p.data), path);
  const held = heldBy(p);
  return withField(
    p,
    <Surface base={merge({ ...COL, rowGap: 8, padding: 12, width: Math.round(p.width ?? 380), flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low"), overflow: "hidden", opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID}>
      {p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} /> : null}
      <Words text={path.length ? path.join(" / ") : p.placeholder} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c(path.length ? "on-surface" : "on-surface-variant") }} />
      <View style={sx(ROW, { alignItems: "stretch", columnGap: 4, height: Math.round(p.height ?? 240) })}>
        {levels.map((options, level) => (
          <View key={level} ariaRole="listbox" ariaLabel={p.label ? `${p.label} ${level + 1}` : undefined} style={sx(COL, { flex: 1, minWidth: 0, rowGap: 2, overflowY: "auto" })}>
            {options.map((name) => {
              const on = path[level] === name;
              return (
                <View key={name} ariaRole="option" ariaSelected={on} onClick={pressOf(() => setWords([...path.slice(0, level), name].join("/")), held)} style={sx({ flexShrink: 0, padding: 8, borderRadius: corner(kit, "sm"), backgroundColor: on ? c("secondary-container") : "transparent" })}>
                  <Words text={name} lines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(on ? "on-secondary-container" : "on-surface") }} />
                </View>
              );
            })}
          </View>
        ))}
      </View>
      {p.action ? (
        <View style={sx(COL, { alignItems: "stretch" })}>
          <Button label={p.action} width={Math.round(p.width ?? 380) - 24} disabled={path.length !== levels.length || held} onPress={tapOf(p, "confirm")} />
        </View>
      ) : null}
    </Surface>,
  );
}

/* ---------- seats ---------- */

/** a seat's name: its row's letter and its place in the row, counted from 1 ("A3") */
export const seatId = (row: number, col: number) => `${String.fromCharCode(65 + row)}${col + 1}`;

/** seats named in words ("A3, b5"), as their names, each once */
export const seatsOf = (words: string | undefined): string[] => [...new Set(String(words ?? "").split(/[\s,，]+/).filter(Boolean).map((s) => s.toUpperCase()))];

/** what a tap on a seat makes of the seats picked: it taken away, or added while fewer than `most` are picked */
export function toggleSeat(picked: string[], id: string, most: number): string[] {
  return picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= most ? picked : [...picked, id];
}

export type SeatMapProps = PartBase & FieldProps & { rows?: number; columns?: number; aisle?: number; taken?: string; price?: number; currency?: string; most?: number; screen?: string; pickedText?: string; action?: string; picked?: string; total?: string; width?: number; disabled?: boolean; error?: boolean; onChange?: (picked: string) => void };

/** Seats in rows under the screen, an aisle between: the taken ones held, the picked ones filled, at most `most`. The
 *  seats taken and the total are the data's (`taken`, `total`): the total shows only as it is given. */
export function SeatMap(props: SeatMapProps) {
  const p = withDefaults<SeatMapProps>("seat-map", props);
  const kit = useKit();
  const fill = useFill();
  const [value, setValue] = useEntry(String(p.picked ?? ""), p.onChange);
  const gone = new Set(seatsOf(p.taken));
  const picked = seatsOf(value).filter((id) => !gone.has(id));
  const rows = clampInt(p.rows ?? 6, 1, 26);
  const cols = clampInt(p.columns ?? 8, 1, 30);
  const aisle = Math.round(p.aisle ?? 0);
  const most = Math.max(1, Math.round(p.most ?? 4));
  /* a seat past the most that may be picked stays as it is: nothing changed, nothing is handed out */
  const toggle = (id: string) => {
    const next = toggleSeat(picked, id, most);
    if (next.length !== picked.length) setValue(next.join(","));
  };
  const held = heldBy(p);
  return withField(
    p,
    <Surface base={merge({ ...COL, rowGap: 12, padding: 12, width: Math.round(p.width ?? 380), flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low"), opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID} label={starred(p.ariaLabel, p.required)}>
      {p.screen ? <Words text={p.screen} style={{ alignSelf: "center", width: "75%", paddingTop: 4, paddingBottom: 4, textAlign: "center", borderBottomLeftRadius: corner(kit, "lg"), borderBottomRightRadius: corner(kit, "lg"), backgroundColor: c("surface-container-high"), ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} /> : null}
      <View style={sx(COL, { rowGap: 4 })}>
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={sx(ROW, { columnGap: 4 })}>
            <Words text={String.fromCharCode(65 + r)} style={{ width: 16, flexShrink: 0, textAlign: "center", ...typeStyle(kit, "label-small"), color: c("on-surface-variant") }} />
            {Array.from({ length: cols }, (_, col) => {
              const id = seatId(r, col);
              const off = gone.has(id);
              const on = picked.includes(id);
              return (
                <View
                  key={id}
                  ariaRole="button"
                  ariaLabel={id}
                  ariaSelected={on}
                 
                  onClick={pressOf(() => toggle(id), off || held)}
                  style={sx({ boxSizing: "border-box", flex: 1, minWidth: 0, aspectRatio: "1", borderRadius: 4, marginRight: aisle > 0 && col === aisle - 1 ? 12 : 0 }, off ? { backgroundColor: c("surface-container-highest"), opacity: 0.5 } : on ? { backgroundColor: c("primary") } : { border: `1px solid ${c("outline-variant")}`, backgroundColor: c("surface") })}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={sx(ROW, { columnGap: 12 })}>
        <View style={sx(COL, { flex: 1, minWidth: 0 })}>
          <Words text={picked.length ? picked.join(" ") : p.pickedText} lines={1} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface") }} />
          {picked.length && p.total ? <Words text={p.total} style={{ ...typeStyle(kit, "title-medium"), color: c("primary") }} /> : null}
        </View>
        {p.action ? <Button label={p.action} disabled={!picked.length || held} onPress={tapOf(p, "confirm")} /> : null}
      </View>
    </Surface>,
  );
}
