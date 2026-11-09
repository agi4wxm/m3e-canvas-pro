import { useState } from "react";
import { Pressable, ScrollView, Text as RNText, TextInput, View, type AccessibilityActionEvent, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { Button } from "../atoms/controls";
import { starred, withField, type FieldProps } from "../field";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { colorOf } from "../look";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { Popup } from "../picker";
import { fieldStyle } from "../recipes";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";

/* The pickers the editor has beyond a select and a date: a select the platform's way, a combobox, a month to pick days
 * from, a color typed as hex, a wheel of options, a grid of items, chips of several choices, a palette, a number on a
 * wheel, a transfer list, a region by its levels, and seats. Each is an input (docs/组件规范.md "受控值和草稿"): its
 * value is a prop, handed out on every change; given a change handler it shows the prop as it is given (a form's field
 * or a variable holds it), else it keeps a draft that starts over whenever the prop changes. What a choice costs or
 * whether a seat is taken is the data's; nothing here decides it. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** A value an input shows: given a change handler, the one it is handed (a form's field, a variable) and a change only
 *  goes out, so a refusal leaves it as it was; else its own draft, which starts at the prop and starts over whenever
 *  the prop says something else. */
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

/** what a held control (disabled or read-only) does when pressed: nothing */
export const heldBy = (p: { disabled?: boolean; readOnly?: boolean }) => !!p.disabled || !!p.readOnly;

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

/** the rows a multiple choice picked, by their places from 0 in words like "0,2" (format version 6), within `count` */
export function picksOf(words: string | number[] | undefined, count = Infinity): number[] {
  const raw = Array.isArray(words) ? words : String(words ?? "").split(/[\s,，]+/).filter(Boolean).map(Number);
  return raw.filter((n, i, all) => Number.isInteger(n) && n >= 0 && n < count && all.indexOf(n) === i);
}

/** places from 0 as the words that hold them, in order */
export const wordsOfPicks = (at: number[]) => [...at].sort((a, b) => a - b).join(",");


/** one option in a list that floats over the screen */
function OptionRow({ label, chosen, onPress }: { label: string; chosen: boolean; onPress: () => void }) {
  const kit = useKit();
  return (
    <Pressable accessibilityRole="menuitem" accessibilityState={{ selected: chosen }} onPress={onPress} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 16, marginHorizontal: 4, borderRadius: corner(kit, "sm"), backgroundColor: chosen ? c(kit, "tertiary-container") : "transparent" }}>
      <RNText style={{ flex: 1, ...typeStyle(kit, "body-large"), color: c(kit, chosen ? "on-tertiary-container" : "on-surface") }}>{label}</RNText>
      {chosen ? <Glyph name="check" size={20} color={c(kit, "on-tertiary-container")} /> : null}
    </Pressable>
  );
}

/** the outlined box a field-like picker stands in, in error's color when it is in error */
function boxOf(kit: Kit, error?: boolean): ViewStyle {
  const { box } = fieldStyle(kit, "outlined");
  return error ? { ...box, borderColor: c(kit, "error"), borderBottomColor: c(kit, "error") } : box;
}

/* ---------- a select the platform's way ---------- */

export type NativeSelectProps = PartBase &
  FieldProps & {
    items?: ListRow[];
    selected?: number;
    size?: "default" | "sm";
    disabled?: boolean;
    error?: boolean;
    width?: number;
    /** told of the option chosen; given, `selected` says which is chosen */
    onSelect?: (index: number, label: string) => void;
  };

/** The browser's own select, on a phone: a box with the option chosen that lists its options over the screen. */
export function NativeSelect(props: NativeSelectProps) {
  const p = withDefaults<NativeSelectProps>("native-select", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? 0, -1, items.length - 1), p.onSelect ? (i) => p.onSelect?.(i, items[i]?.label ?? "") : undefined);
  const [open, setOpen] = useState(false);
  const value = items[chosen]?.label ?? "";
  const small = p.size === "sm";
  return withField(
    p,
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 224) }, fill]}>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={starred(p.ariaLabel || value, p.required)}
        accessibilityValue={{ text: value }}
        accessibilityState={{ disabled: !!p.disabled, expanded: open }}
        disabled={heldBy(p)}
        onPress={() => setOpen(true)}
        style={{ height: small ? 40 : 56, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 12, columnGap: 8, opacity: p.disabled ? 0.38 : 1, ...boxOf(kit, p.error) }}
      >
        <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, small ? "body-medium" : "body-large"), color: c(kit, "on-surface") }}>
          {value}
        </RNText>
        <Glyph name="expand_more" size={20} color={c(kit, "on-surface-variant")} />
      </Pressable>
      <Popup open={open} onClose={() => setOpen(false)}>
        {items.map((it, i) => (
          <OptionRow
            key={i}
            label={it.label}
            chosen={i === chosen}
            onPress={() => {
              setOpen(false);
              setChosen(i);
            }}
          />
        ))}
      </Popup>
    </View>,
  );
}

/* ---------- a combobox ---------- */

export type ComboboxProps = PartBase &
  FieldProps & {
    items?: ListRow[];
    selected?: number;
    placeholder?: string;
    clear?: boolean;
    disabled?: boolean;
    error?: boolean;
    width?: number;
    /** told of the option chosen (-1 and "" when cleared); given, `selected` says which is chosen */
    onSelect?: (index: number, label: string) => void;
  };

/** A field that finds an option as it is typed: tapped, it lists the options over the screen under a box to type in,
 *  the ones that match what is typed; a clear button empties it. */
export function Combobox(props: ComboboxProps) {
  const p = withDefaults<ComboboxProps>("combobox", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? -1, -1, items.length - 1), p.onSelect ? (i) => p.onSelect?.(i, items[i]?.label ?? "") : undefined);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const value = items[chosen]?.label;
  const shown = items.map((it, i) => ({ it, i })).filter(({ it }) => it.label.toLowerCase().includes(typed.trim().toLowerCase()));
  const pick = (i: number) => {
    setOpen(false);
    setTyped("");
    setChosen(i);
  };
  const muted = c(kit, "on-surface-variant");
  return withField(
    p,
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 256) }, fill]}>
      <View style={{ height: 56, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, columnGap: 4, opacity: p.disabled ? 0.38 : 1, ...boxOf(kit, p.error) }}>
        <Pressable accessibilityRole="combobox" accessibilityLabel={starred(p.ariaLabel || p.placeholder, p.required)} accessibilityValue={{ text: value ?? "" }} accessibilityState={{ disabled: !!p.disabled, expanded: open }} disabled={heldBy(p)} onPress={() => setOpen(true)} style={{ flex: 1, alignSelf: "stretch", justifyContent: "center" }}>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-large"), color: value ? c(kit, "on-surface") : muted }}>
            {value ?? p.placeholder}
          </RNText>
        </Pressable>
        {p.clear && value !== undefined ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" disabled={heldBy(p)} onPress={() => setChosen(-1)} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
            <Glyph name="close" size={20} color={muted} />
          </Pressable>
        ) : null}
        <Glyph name="expand_more" size={20} color={muted} />
      </View>
      <Popup open={open} onClose={() => setOpen(false)}>
        <TextInput accessibilityLabel={p.ariaLabel || p.placeholder} value={typed} onChangeText={setTyped} placeholder={p.placeholder} placeholderTextColor={muted} style={{ height: 48, marginHorizontal: 4, marginBottom: 4, paddingHorizontal: 12, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface-container-highest"), ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }} />
        {shown.length ? shown.map(({ it, i }) => <OptionRow key={i} label={it.label} chosen={i === chosen} onPress={() => pick(i)} />) : <RNText style={{ ...typeStyle(kit, "body-medium"), color: muted, padding: 16, textAlign: "center" }}>No items found.</RNText>}
      </Popup>
    </View>,
  );
}

/* ---------- a calendar ---------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const two = (n: number) => String(n).padStart(2, "0");
/** a day as a form sends it: YYYY-MM-DD */
export const dayKey = (y: number, m: number, d: number) => `${y}-${two(m + 1)}-${two(d)}`;

/** The days a calendar has picked, as its value holds them: one day, several, or the two ends of a range, each
 *  YYYY-MM-DD and joined with commas. */
export const daysOf = (value: string | undefined): string[] => String(value ?? "").split(",").map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

/** what a tap on a day makes of the days picked: the day alone; it added or taken away; a range's start, then its end */
export function pickDay(mode: string, days: string[], day: string): string[] {
  if (mode === "multiple") return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
  if (mode === "range") return days.length === 1 && day > days[0] ? [days[0], day] : [day];
  return [day];
}

/** The weeks of a month as a calendar draws them: each a row of seven days from the day the week starts on, a day of the
 *  month before or after where the month does not reach. */
export function weeksOf(year: number, month: number, monday: boolean): { y: number; m: number; d: number; outside: boolean }[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - (monday ? 1 : 0) + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((lead + days) / 7) * 7;
  const out: { y: number; m: number; d: number; outside: boolean }[][] = [];
  for (let i = 0; i < cells; i++) {
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
    /** the days picked, YYYY-MM-DD joined with commas (a range is its two ends); given with `onChange`, it shows them */
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!!p.disabled} onPress={() => shift(n)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
      <Glyph name={icon} size={20} color={c(kit, "on-surface-variant")} />
    </Pressable>
  );
  const month = (k: number) => {
    const at = new Date(shown.y, shown.m + k, 1);
    const weeks = weeksOf(at.getFullYear(), at.getMonth(), monday);
    return (
      <View key={k} style={{ rowGap: 8 }}>
        <View style={{ height: 40, flexDirection: "row", alignItems: "center" }}>
          {k === 0 ? arrow("chevron_left", "Previous month", -1) : <View style={{ width: 40 }} />}
          <RNText style={{ flex: 1, textAlign: "center", ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{`${MONTHS[at.getMonth()]} ${at.getFullYear()}`}</RNText>
          {k === count - 1 ? arrow("chevron_right", "Next month", 1) : <View style={{ width: 40 }} />}
        </View>
        <View style={{ flexDirection: "row" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <RNText key={i} style={{ flex: 1, textAlign: "center", ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>
              {WEEKDAYS[(i + (monday ? 1 : 0)) % 7]}
            </RNText>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={{ flexDirection: "row" }}>
            {week.map((cell) => {
              const key = dayKey(cell.y, cell.m, cell.d);
              if (cell.outside && p.outside === false) return <View key={key} style={{ flex: 1, height: 40 }} />;
              const ends = range ? key === range[0] || key === range[1] : days.includes(key);
              const between = !!range && key > range[0] && key < range[1];
              const ink = ends ? "on-primary" : between ? "on-secondary-container" : cell.outside ? "on-surface-variant" : key === today ? "primary" : "on-surface";
              /* the band behind a range: from the middle of its start to the middle of its end */
              const band: ViewStyle | null = range && (between || (ends && range[0] !== range[1])) ? { position: "absolute", top: 0, bottom: 0, left: key === range[0] ? "50%" : 0, right: key === range[1] ? "50%" : 0, backgroundColor: c(kit, "secondary-container") } : null;
              return (
                <View key={key} style={{ flex: 1, height: 40, alignItems: "center", justifyContent: "center" }}>
                  {band ? <View style={band} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={key}
                    accessibilityState={{ selected: ends || between, disabled: !!p.disabled }}
                    disabled={held}
                    onPress={() => setValue(pickDay(p.mode ?? "single", range ?? days, key).join(","))}
                    style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: ends ? c(kit, "primary") : "transparent", ...(key === today && !ends ? { borderWidth: 1, borderColor: c(kit, "primary") } : null) }}
                  >
                    <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, ink) }}>{String(cell.d)}</RNText>
                  </Pressable>
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
    <Surface base={{ width: 304, padding: 12, rowGap: 16, opacity: p.disabled ? 0.38 : 1 }} appearance={p} testID={p.testID} accessibilityLabel={starred(p.ariaLabel, p.required)}>
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

export type ColorFieldProps = PartBase &
  FieldProps & {
    label?: string;
    /** the color, #RRGGBB */
    value?: string;
    disabled?: boolean;
    error?: boolean;
    width?: number;
    /** told of the color once what is typed is one */
    onChangeText?: (color: string) => void;
  };

/** A color: its well, its label and its hex, which is typed (a phone has no color well of its own and no eyedropper);
 *  what is typed is handed out once it is a color. */
export function ColorField(props: ColorFieldProps) {
  const p = withDefaults<ColorFieldProps>("color-field", props);
  const kit = useKit();
  const fill = useFill();
  const [given, setColor] = useEntry(p.value ?? "#6750A4", p.onChangeText);
  const color = /^#[0-9a-f]{6}$/i.test(given) ? given : "#6750A4";
  /* the words being typed, while they are not a color yet */
  const [typing, setTyping] = useState<string | null>(null);
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 220), minWidth: 192, height: 56, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 12, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-highest"), opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID}>
      <View accessible accessibilityRole="image" accessibilityLabel={color.toUpperCase()} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, borderWidth: 1, borderColor: c(kit, "outline-variant") }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {p.label ? (
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>
            {starred(p.label, p.required)}
          </RNText>
        ) : null}
        <TextInput
          accessibilityLabel={p.label || p.ariaLabel || "Color"}
          value={typing ?? color.toUpperCase()}
          editable={!heldBy(p)}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          onChangeText={(t) => {
            const hex = hexOf(t);
            setTyping(hex ? null : t);
            if (hex) setColor(hex);
          }}
          onBlur={() => setTyping(null)}
          style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface"), paddingVertical: 0 }}
        />
      </View>
    </Surface>,
  );
}

/* ---------- a wheel of options ---------- */

export type WheelPickerProps = PartBase &
  FieldProps & {
    label?: string;
    items?: ListRow[];
    selected?: number;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the option chosen; given, `selected` says which is chosen */
    onSelect?: (index: number, label: string) => void;
  };

/** Options on a wheel, the chosen one in the middle and the others fading with their distance from it: a tap on one
 *  turns the wheel to it, and a screen reader turns it a step at a time. */
export function WheelPicker(props: WheelPickerProps) {
  const p = withDefaults<WheelPickerProps>("wheel-picker", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1)), p.onSelect ? (i) => p.onSelect?.(i, items[i]?.label ?? "") : undefined);
  const held = heldBy(p);
  const turn = (e: AccessibilityActionEvent) => {
    if (held) return;
    const to = clampInt(chosen + (e.nativeEvent.actionName === "increment" ? 1 : -1), 0, Math.max(0, items.length - 1));
    if (to !== chosen) setChosen(to);
  };
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 380), rowGap: 4, opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      {p.label ? <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, p.error ? "error" : "on-surface-variant") }}>{starred(p.label, p.required)}</RNText> : null}
      <View accessible accessibilityRole="adjustable" accessibilityLabel={p.label || p.ariaLabel} accessibilityValue={{ text: items[chosen]?.label ?? "" }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={turn}>
        {items.map((it, i) => {
          const d = Math.abs(i - chosen);
          return (
            <Pressable key={i} disabled={held} onPress={() => setChosen(i)} style={{ paddingVertical: 4, borderRadius: corner(kit, "sm"), backgroundColor: d === 0 ? c(kit, "surface-container-high") : "transparent", opacity: Math.max(0.25, 1 - d * 0.3) }}>
              <RNText style={{ textAlign: "center", ...typeStyle(kit, "body-large"), color: c(kit, d === 0 ? "on-surface" : "on-surface-variant") }}>{it.label}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Surface>,
  );
}

/* ---------- a grid of items ---------- */

export type ItemPickerProps = PartBase &
  FieldProps & {
    items?: ListRow[];
    columns?: number;
    selected?: number;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the item chosen; given, `selected` says which is chosen */
    onSelect?: (index: number, label: string) => void;
  };

/** A choice of one among tiles, each an icon and its name, the chosen one tinted. */
export function ItemPicker(props: ItemPickerProps) {
  const p = withDefaults<ItemPickerProps>("item-picker", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const cols = clampInt(p.columns ?? 4, 1, 8);
  const [chosen, setChosen] = useEntry(clampInt(p.selected ?? 0, -1, items.length - 1), p.onSelect ? (i) => p.onSelect?.(i, items[i]?.label ?? "") : undefined);
  const gap = 8;
  const width = Math.round(p.width ?? 320);
  const tile = Math.floor((width - gap * (cols - 1)) / cols);
  return withField(
    p,
    <Surface base={{ width, opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      <View accessibilityRole="radiogroup" accessibilityLabel={starred(p.ariaLabel, p.required)} style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {items.map((it, i) => {
          const on = i === chosen;
          const ink = c(kit, on ? "on-secondary-container" : p.error ? "error" : "on-surface-variant");
          return (
            <Pressable key={i} accessibilityRole="radio" accessibilityLabel={it.label} accessibilityState={{ checked: on, disabled: !!p.disabled }} disabled={heldBy(p)} onPress={() => setChosen(i)} style={{ width: tile, padding: 8, rowGap: 4, alignItems: "center", borderRadius: corner(kit, "lg"), backgroundColor: c(kit, on ? "secondary-container" : "surface-container-low") }}>
              {it.icon ? <Glyph name={it.icon} size={24} filled={on} color={ink} /> : null}
              <RNText numberOfLines={1} style={{ ...typeStyle(kit, "label-small"), color: ink }}>
                {it.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    </Surface>,
  );
}

/* ---------- several choices ---------- */

export type MultiSelectProps = PartBase &
  FieldProps & {
    items?: ListRow[];
    /** the rows picked, by their places from 0 ("0,2") */
    picked?: string;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the rows picked, as `picked` holds them */
    onChangeText?: (picked: string) => void;
  };

/** A choice of several: a filter chip for each option, the ones picked ticked. */
export function MultiSelect(props: MultiSelectProps) {
  const p = withDefaults<MultiSelectProps>("multi-select", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [value, setValue] = useEntry(String(p.picked ?? ""), p.onChangeText);
  const on = picksOf(value, items.length);
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 320), opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      <View accessibilityLabel={starred(p.ariaLabel, p.required)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {items.map((it, i) => {
          const picked = on.includes(i);
          return (
            <Pressable
              key={i}
              accessibilityRole="checkbox"
              accessibilityLabel={it.label}
              accessibilityState={{ checked: picked, disabled: !!p.disabled }}
              disabled={heldBy(p)}
              onPress={() => setValue(wordsOfPicks(picked ? on.filter((x) => x !== i) : [...on, i]))}
              style={{ height: 32, flexDirection: "row", alignItems: "center", columnGap: 8, paddingLeft: picked ? 8 : 16, paddingRight: 16, borderRadius: corner(kit, "sm"), borderWidth: picked ? 0 : 1, borderColor: c(kit, p.error ? "error" : "outline-variant"), backgroundColor: picked ? c(kit, "secondary-container") : "transparent" }}
            >
              {picked ? <Glyph name="check" size={18} color={c(kit, "on-secondary-container")} /> : null}
              <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, picked ? "on-secondary-container" : "on-surface-variant") }}>{it.label}</RNText>
            </Pressable>
          );
        })}
      </View>
    </Surface>,
  );
}

/* ---------- a palette ---------- */

export type ColorPaletteProps = PartBase &
  FieldProps & {
    /** the colors: the part's rows (each a color of the one color value, a role, a share of one or a hex, and the name
     *  it is read out by), or words with commas between them */
    colors?: string | (string | ListRow)[];
    /** the place of the color chosen among all those given, an unreadable one included (it is only not drawn) */
    selected?: number;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the color chosen: its place and the color */
    onSelect?: (index: number, color: string) => void;
  };

/** A choice of one color among swatches, the chosen one ringed and ticked. */
export function ColorPalette(props: ColorPaletteProps) {
  const p = withDefaults<ColorPaletteProps>("color-palette", props);
  const kit = useKit();
  const fill = useFill();
  const rows = (Array.isArray(p.colors) ? p.colors : String(p.colors ?? "").split(",")).map((x) => (typeof x === "string" ? { label: x.trim(), color: x.trim() } : { label: x.label, color: x.color ?? x.label }));
  const colors = rows.map((r) => r.color);
  const [chosen, setChosen] = useEntry(Math.round(p.selected ?? 0), p.onSelect ? (i) => p.onSelect?.(i, colors[i] ?? "") : undefined);
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 320), opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      <View accessibilityRole="radiogroup" accessibilityLabel={starred(p.ariaLabel, p.required)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {rows.map(({ label, color }, i) =>
          colorOf(kit, color) ? (
            <Pressable key={`${color}-${i}`} accessibilityRole="radio" accessibilityLabel={label || color} accessibilityState={{ checked: i === chosen, disabled: !!p.disabled }} disabled={heldBy(p)} onPress={() => setChosen(i)} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colorOf(kit, color), borderWidth: i === chosen ? 2 : 1, borderColor: c(kit, i === chosen ? "on-surface" : p.error ? "error" : "outline-variant") }}>
              {i === chosen ? <Glyph name="check" size={20} color={c(kit, "on-primary")} /> : null}
            </Pressable>
          ) : null,
        )}
      </View>
    </Surface>,
  );
}

/* ---------- a number on a wheel ---------- */

export type NumberPickerProps = PartBase &
  FieldProps & {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the number, kept to its range, on every step */
    onValueChange?: (value: number) => void;
  };

/** A number between arrows, the next and the one before it shown above and below: each arrow steps it, kept to its
 *  range; a screen reader steps it too. */
export function NumberPicker(props: NumberPickerProps) {
  const p = withDefaults<NumberPickerProps>("number-picker", props);
  const kit = useKit();
  const min = p.min ?? 0;
  const max = p.max ?? 10;
  const by = Math.max(1, p.step ?? 1);
  const [given, setN] = useEntry(p.value ?? 5, p.onValueChange);
  const n = Math.min(max, Math.max(min, given));
  const held = heldBy(p);
  const next = n + by;
  const previous = n - by;
  const muted = c(kit, "on-surface-variant");
  const arrow = (icon: string, label: string, to: number, can: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !can || held }} disabled={!can || held} onPress={() => setN(to)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", opacity: can ? 1 : 0.38 }}>
      <Glyph name={icon} size={24} color={c(kit, "primary")} />
    </Pressable>
  );
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 96), alignItems: "center", rowGap: 4, opacity: p.disabled ? 0.38 : 1 }} appearance={p} testID={p.testID}>
      {arrow("keyboard_arrow_up", "Increase", next, next <= max)}
      <RNText style={{ height: 24, ...typeStyle(kit, "body-medium"), color: muted }}>{next <= max ? String(next) : ""}</RNText>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={starred(p.ariaLabel || p.unit || "Value", p.required)}
        accessibilityValue={{ min, max, now: n }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const to = e.nativeEvent.actionName === "increment" ? next : previous;
          if (!held && to >= min && to <= max) setN(to);
        }}
        style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "baseline", justifyContent: "center", columnGap: 4, paddingVertical: 4, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, "surface-container-high"), ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }}
      >
        <RNText style={{ ...typeStyle(kit, "title-large"), color: c(kit, "on-surface") }}>{String(n)}</RNText>
        {p.unit ? <RNText style={{ ...typeStyle(kit, "label-medium"), color: muted }}>{p.unit}</RNText> : null}
      </View>
      <RNText style={{ height: 24, ...typeStyle(kit, "body-medium"), color: muted }}>{previous >= min ? String(previous) : ""}</RNText>
      {arrow("keyboard_arrow_down", "Decrease", previous, previous >= min)}
    </Surface>,
  );
}

/* ---------- a transfer list ---------- */

/** a tick box drawn small, for a row that is marked */
function Tick({ on }: { on: boolean }) {
  const kit = useKit();
  return (
    <View style={{ width: 18, height: 18, borderRadius: 2, borderWidth: on ? 0 : 2, borderColor: c(kit, "on-surface-variant"), backgroundColor: on ? c(kit, "primary") : "transparent", alignItems: "center", justifyContent: "center" }}>
      {on ? <Glyph name="check" size={14} color={c(kit, "on-primary")} /> : null}
    </View>
  );
}

export type TransferListProps = PartBase &
  FieldProps & {
    items?: ListRow[];
    /** the rows on the right, counted from 1 ("3,4") */
    chosen?: string;
    from?: string;
    to?: string;
    width?: number;
    height?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the rows on the right, as `chosen` holds them, on every move */
    onChangeText?: (chosen: string) => void;
  };

/** Two lists side by side and arrows between them: the rows ticked on one side move to the other. What is on the right
 *  is the value; which rows are ticked is the list's own draft, kept by what the rows say. */
export function TransferList(props: TransferListProps) {
  const p = withDefaults<TransferListProps>("transfer-list", props);
  const kit = useKit();
  const fill = useFill();
  const words = (p.items ?? []).map((it) => it.label);
  const keys = keysOf(words);
  const [value, setValue] = useEntry(String(p.chosen ?? ""), p.onChangeText);
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
    <View style={{ flex: 1, minWidth: 0, borderRadius: corner(kit, "md"), backgroundColor: c(kit, "surface-container"), overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>
          {title}
        </RNText>
        <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant") }}>{`${group.filter(isMarked).length} / ${group.length}`}</RNText>
      </View>
      <ScrollView contentContainerStyle={{ padding: 4 }}>
        {group.map((i) => {
          const on = isMarked(i);
          return (
            <Pressable key={keys[i]} accessibilityRole="checkbox" accessibilityLabel={words[i]} accessibilityState={{ checked: on, disabled: held }} disabled={held} onPress={() => setMarked((all) => (on ? all.filter((x) => x !== keys[i]) : [...all, keys[i]]))} style={{ flexDirection: "row", alignItems: "center", columnGap: 8, padding: 8, borderRadius: corner(kit, "sm") }}>
              <Tick on={on} />
              <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>
                {words[i]}
              </RNText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
  const move = (icon: string, label: string, can: boolean, run: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !can }} disabled={!can} onPress={run} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c(kit, "secondary-container"), opacity: can ? 1 : 0.38 }}>
      <Glyph name={icon} size={20} color={c(kit, "on-secondary-container")} />
    </Pressable>
  );
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 380), height: Math.round(p.height ?? 220), flexDirection: "row", alignItems: "stretch", columnGap: 8, padding: 8, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low"), opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID} accessibilityLabel={starred(p.ariaLabel, p.required)}>
      {pane(p.from, left)}
      <View style={{ justifyContent: "center", rowGap: 8 }}>
        {move("chevron_right", "Move right", !held && left.some(isMarked), () => send(left, true))}
        {move("chevron_left", "Move left", !held && right.some(isMarked), () => send(right, false))}
      </View>
      {pane(p.to, right)}
    </Surface>,
  );
}

/* ---------- a region by its levels ---------- */

/** a table as a part's prop holds it: its header and its rows of cells */
export type TableData = { columns?: string[]; rows?: unknown[][] };

/** The options of each level for the path picked so far: a level's are the places under the levels picked above it, and
 *  a level below the next one to pick has none yet. */
export function levelsOf(rows: string[][], path: string[]): string[][] {
  const depth = Math.max(1, ...rows.map((r) => r.length));
  return Array.from({ length: depth }, (_, level) => {
    if (level > path.length) return [];
    const under = rows.filter((r) => path.slice(0, level).every((at, i) => r[i] === at)).map((r) => r[level]).filter(Boolean);
    return [...new Set(under)];
  });
}

/** a table's rows as words */
export const cellsOf = (data: TableData | undefined): string[][] => (Array.isArray(data?.rows) ? data.rows.map((r) => (Array.isArray(r) ? r.map((x) => (x === null || x === undefined ? "" : String(x))) : [])) : []);

export type RegionPickerProps = PartBase &
  FieldProps & {
    label?: string;
    placeholder?: string;
    /** the places, a column for each level */
    data?: TableData;
    action?: string;
    /** the path picked, its levels joined with "/" ("Guangdong/Shenzhen/Nanshan") */
    value?: string;
    width?: number;
    height?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the path picked at every level */
    onChangeText?: (value: string) => void;
  };

/** A place picked level by level, a column each: the path so far over them, and a button that is there once a place at
 *  the last level is picked (the `confirm` place). */
export function RegionPicker(props: RegionPickerProps) {
  const p = withDefaults<RegionPickerProps>("region-picker", props);
  const kit = useKit();
  const fill = useFill();
  const rows = cellsOf(p.data);
  const [words, setWords] = useEntry(String(p.value ?? ""), p.onChangeText);
  const path = words.split("/").filter(Boolean);
  const levels = levelsOf(rows, path);
  const complete = path.length === levels.length;
  const held = heldBy(p);
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 380), padding: 12, rowGap: 8, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low"), overflow: "hidden", opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID}>
      {p.label ? <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{starred(p.label, p.required)}</RNText> : null}
      <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-large"), color: c(kit, path.length ? "on-surface" : "on-surface-variant") }}>
        {path.length ? path.join(" / ") : p.placeholder}
      </RNText>
      <View style={{ height: Math.round(p.height ?? 240), flexDirection: "row", columnGap: 4 }}>
        {levels.map((options, level) => (
          <ScrollView key={level} accessibilityLabel={p.label ? `${p.label} ${level + 1}` : undefined} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ rowGap: 2 }}>
            {options.map((name) => {
              const on = path[level] === name;
              return (
                <Pressable key={name} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: on, disabled: held }} disabled={held} onPress={() => setWords([...path.slice(0, level), name].join("/"))} style={{ paddingHorizontal: 8, paddingVertical: 8, borderRadius: corner(kit, "sm"), backgroundColor: on ? c(kit, "secondary-container") : "transparent" }}>
                  <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, on ? "on-secondary-container" : "on-surface") }}>
                    {name}
                  </RNText>
                </Pressable>
              );
            })}
          </ScrollView>
        ))}
      </View>
      {p.action ? <Button label={p.action} width={Math.round(p.width ?? 380) - 24} disabled={!complete || held} onPress={tapOf(p, "confirm")} /> : null}
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

export type SeatMapProps = PartBase &
  FieldProps & {
    rows?: number;
    columns?: number;
    aisle?: number;
    taken?: string;
    price?: number;
    currency?: string;
    most?: number;
    screen?: string;
    pickedText?: string;
    action?: string;
    /** the seats picked ("A3,B5") */
    picked?: string;
    /** what the seats picked cost, as the data says */
    total?: string;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the seats picked on every change */
    onChangeText?: (picked: string) => void;
  };

/** Seats in rows under the screen, an aisle between: the taken ones held, the picked ones filled, at most `most`. The
 *  seats taken and the total are the data's (`taken`, `total`): the total shows only as it is given. */
export function SeatMap(props: SeatMapProps) {
  const p = withDefaults<SeatMapProps>("seat-map", props);
  const kit = useKit();
  const fill = useFill();
  const [value, setValue] = useEntry(String(p.picked ?? ""), p.onChangeText);
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
  const muted = c(kit, "on-surface-variant");
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 380), padding: 12, rowGap: 12, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low"), opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID} accessibilityLabel={starred(p.ariaLabel, p.required)}>
      {p.screen ? (
        <View style={{ alignSelf: "center", width: "75%", paddingVertical: 4, borderBottomLeftRadius: corner(kit, "lg"), borderBottomRightRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-high") }}>
          <RNText style={{ textAlign: "center", ...typeStyle(kit, "label-small"), color: muted }}>{p.screen}</RNText>
        </View>
      ) : null}
      <View style={{ rowGap: 4 }}>
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={{ flexDirection: "row", alignItems: "center", columnGap: 4 }}>
            <RNText style={{ width: 16, textAlign: "center", ...typeStyle(kit, "label-small"), color: muted }}>{String.fromCharCode(65 + r)}</RNText>
            {Array.from({ length: cols }, (_, col) => {
              const id = seatId(r, col);
              const off = gone.has(id);
              const on = picked.includes(id);
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={id}
                  accessibilityState={{ selected: on, disabled: off || held }}
                  disabled={off || held}
                  onPress={() => toggle(id)}
                  style={{ flex: 1, aspectRatio: 1, minWidth: 0, borderRadius: 4, marginRight: aisle > 0 && col === aisle - 1 ? 12 : 0, ...(off ? { backgroundColor: c(kit, "surface-container-highest"), opacity: 0.5 } : on ? { backgroundColor: c(kit, "primary") } : { borderWidth: 1, borderColor: c(kit, "outline-variant"), backgroundColor: c(kit, "surface") }) }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", columnGap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>
            {picked.length ? picked.join(" ") : p.pickedText}
          </RNText>
          {picked.length && p.total ? <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "primary") }}>{p.total}</RNText> : null}
        </View>
        {p.action ? <Button label={p.action} disabled={!picked.length || held} onPress={tapOf(p, "confirm")} /> : null}
      </View>
    </Surface>,
  );
}
