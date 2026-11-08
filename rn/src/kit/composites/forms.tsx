import { useState } from "react";
import { Pressable, Text as RNText, TextInput, View, type ViewStyle } from "react-native";

import type { PartBase } from "../atoms/basics";
import { buttonColors } from "../atoms/controls";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { withAlpha } from "../look";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { Popup, dateOfValue, dayOf, usePicker } from "../picker";
import { fieldStyle, panelStyle } from "../recipes";
import { Surface } from "../Surface";
import { controlRadius, corner, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";
import { starred, withField, type FieldProps } from "../field";

/* Fields and pickers: a text field with its label, a select, a date picker and a time picker (the platform's own pickers
 * on a phone, a calendar the kit draws on the web, where there is none), segmented buttons, a group of buttons and a
 * menu. A select and a menu open over the screen when tapped; the editor draws them open, the app keeps them closed. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** one action of a menu or option of a select */
function MenuRow({ label, icon, danger, chosen, onPress }: { label: string; icon?: string; danger?: boolean; chosen?: boolean; onPress: () => void }) {
  const kit = useKit();
  const ink = danger ? c(kit, "error") : c(kit, "on-surface");
  return (
    <Pressable accessibilityRole="menuitem" onPress={onPress} style={{ height: 48, flexDirection: "row", alignItems: "center", columnGap: 12, paddingHorizontal: 12, backgroundColor: chosen ? c(kit, "secondary-container") : "transparent" }}>
      {icon ? <Glyph name={icon} size={24} color={danger ? ink : c(kit, "on-surface-variant")} /> : null}
      <RNText style={{ flex: 1, ...typeStyle(kit, "label-large"), color: ink }}>{label}</RNText>
      {chosen ? <Glyph name="check" size={20} color={c(kit, "on-secondary-container")} /> : null}
    </Pressable>
  );
}

/* ---------- a text field ---------- */

export type TextFieldProps = PartBase & {
  label?: string;
  value?: string;
  supporting?: string;
  variant?: "outlined" | "filled";
  leadingIcon?: string;
  trailingIcon?: string;
  error?: boolean;
  multiline?: boolean;
  width?: number;
  disabled?: boolean;
  /** told of what is typed; given, `value` is what the field shows (a form's field holds it) */
  onChangeText?: (text: string) => void;
} & FieldProps;

/** Material's text field: its label inside until there is something typed, then above the words; the style's own field
 *  where it has one (the label then stays inside the box, as the web's recipes do) */
export function TextField(props: TextFieldProps) {
  const p = withDefaults<TextFieldProps>("text-field", props);
  const kit = useKit();
  const fill = useFill();
  const [typed, setTyped] = useState(p.value ?? "");
  const text = p.onChangeText ? (p.value ?? "") : typed;
  const setText = (v: string) => {
    setTyped(v);
    p.onChangeText?.(v);
  };
  const [focused, setFocused] = useState(false);
  const { box, focus } = fieldStyle(kit, p.variant ?? "outlined", !!p.multiline);
  const own = recipeOf(kit, "field") !== "m3" || recipeOf(kit, "input") !== "m3" || !!kit.theme.extras?.fieldFill;
  const up = focused || !!text;
  const tint = p.error ? c(kit, "error") : focused ? c(kit, "primary") : c(kit, "on-surface-variant");
  const outlinedLabel = p.variant !== "filled" && !own && up;
  /* the message of its error stands where its supporting words were */
  const supporting = p.error && p.errorText ? p.errorText : p.supporting;
  return withField(
    { loading: p.loading },
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 280), rowGap: 4, opacity: p.disabled ? 0.38 : 1 }, fill]}>
      <View style={{ minHeight: p.multiline ? 96 : 56, flexDirection: "row", alignItems: p.multiline ? "flex-start" : "center", paddingHorizontal: 16, columnGap: 12, ...box, ...(focused ? focus : null), ...(p.error ? { borderColor: c(kit, "error"), borderBottomColor: c(kit, "error") } : null) }}>
        {p.leadingIcon ? <Glyph name={p.leadingIcon} size={24} color={c(kit, "on-surface-variant")} /> : null}
        <View style={{ flex: 1, justifyContent: "center", paddingTop: up && !outlinedLabel ? 16 : 0 }}>
          {p.label ? (
            <RNText
              pointerEvents="none"
              style={
                outlinedLabel
                  ? { position: "absolute", top: -36, left: -4, paddingHorizontal: 4, backgroundColor: c(kit, "surface"), ...typeStyle(kit, "body-small"), color: tint }
                  : up
                    ? { position: "absolute", top: 6, ...typeStyle(kit, "body-small"), color: tint }
                    : { position: "absolute", ...typeStyle(kit, "body-large"), color: c(kit, "on-surface-variant") }
              }
            >
              {starred(p.label, p.required)}
            </RNText>
          ) : null}
          <TextInput accessibilityLabel={p.label || p.ariaLabel} value={text} onChangeText={setText} editable={!p.disabled && !p.readOnly} multiline={p.multiline} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface"), paddingVertical: 0, minHeight: 24 }} />
        </View>
        {p.trailingIcon || p.error ? <Glyph name={p.error ? "error" : p.trailingIcon!} size={24} color={p.error ? c(kit, "error") : c(kit, "on-surface-variant")} /> : null}
      </View>
      {supporting ? <RNText accessibilityRole={p.error && p.errorText ? "alert" : undefined} style={{ ...typeStyle(kit, "body-small"), color: p.error ? c(kit, "error") : c(kit, "on-surface-variant"), paddingHorizontal: 16 }}>{supporting}</RNText> : null}
    </View>,
  );
}

/* ---------- a select ---------- */

export type SelectProps = PartBase & {
  items?: ListRow[];
  selected?: number;
  variant?: "outlined" | "filled";
  label?: string;
  placeholder?: string;
  supporting?: string;
  size?: "default" | "sm";
  disabled?: boolean;
  width?: number;
  /** told of the option chosen; given, `selected` says which is chosen (a form's field holds it) */
  onSelect?: (index: number, label: string) => void;
  error?: boolean;
} & FieldProps;

export function Select(props: SelectProps) {
  const p = withDefaults<SelectProps>("select", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [own, setOwn] = useState(clampInt(p.selected ?? 0, -1, items.length - 1));
  const chosen = p.onSelect ? clampInt(p.selected ?? -1, -1, items.length - 1) : own;
  const [open, setOpen] = useState(false);
  const { box: field } = fieldStyle(kit, p.variant ?? "outlined");
  const box = p.error ? { ...field, borderColor: c(kit, "error"), borderBottomColor: c(kit, "error") } : field;
  const ios = recipeOf(kit, "menu") === "ios" || recipeOf(kit, "picker") === "ios";
  const value = items[chosen]?.label;
  /* Material's outlined field carries its label in a notch of its outline, as the web's select does; a style's own
     field (and the filled one) has it above */
  const notched = !!p.label && p.variant !== "filled" && recipeOf(kit, "field") === "m3" && recipeOf(kit, "input") === "m3" && !kit.theme.extras?.fieldFill;
  const supporting = p.error && p.errorText ? p.errorText : p.supporting;
  return withField(
    { loading: p.loading },
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 224), rowGap: 4 }, fill]}>
      {p.label && !notched ? <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>{starred(p.label, p.required)}</RNText> : null}
      <Pressable accessibilityRole="combobox" accessibilityLabel={p.label || p.ariaLabel || p.placeholder} disabled={p.disabled || p.readOnly} onPress={() => setOpen(true)} style={{ height: p.size === "sm" ? 40 : 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, columnGap: 8, opacity: p.disabled ? 0.38 : 1, ...box }}>
        {notched ? (
          <RNText pointerEvents="none" style={{ position: "absolute", top: -8, left: 12, paddingHorizontal: 4, backgroundColor: c(kit, "surface"), ...typeStyle(kit, "body-small"), color: p.error ? c(kit, "error") : c(kit, "on-surface-variant") }}>
            {starred(p.label, p.required)}
          </RNText>
        ) : null}
        <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: value ? c(kit, "on-surface") : c(kit, "on-surface-variant") }}>{value ?? p.placeholder}</RNText>
        <Glyph name={ios ? "unfold_more" : "arrow_drop_down"} size={24} color={c(kit, "on-surface-variant")} />
      </Pressable>
      {supporting ? <RNText accessibilityRole={p.error && p.errorText ? "alert" : undefined} style={{ ...typeStyle(kit, "body-small"), color: c(kit, p.error && p.errorText ? "error" : "on-surface-variant"), paddingHorizontal: 16 }}>{supporting}</RNText> : null}
      <Popup open={open} onClose={() => setOpen(false)}>
        {items.map((it, i) => (
          <MenuRow
            key={i}
            label={it.label}
            icon={it.icon}
            chosen={i === chosen}
            onPress={() => {
              setOwn(i);
              setOpen(false);
              p.onSelect?.(i, it.label);
              tapOf(p, `tab:${i}`)?.();
            }}
          />
        ))}
      </Popup>
    </View>,
  );
}

/* ---------- dates and times ---------- */

export type DatePickerProps = PartBase & {
  variant?: "docked" | "modal";
  label?: string;
  placeholder?: string;
  width?: number;
  mode?: "single" | "range";
  title?: string;
  defaultView?: string;
  disabled?: boolean;
  /** the day chosen, YYYY-MM-DD; given with `onChange`, the field shows it (a form's field holds it) */
  value?: string;
  onChange?: (day: string) => void;
  error?: boolean;
} & FieldProps;

/** a field that opens the platform's date picker */
export function DatePicker(props: DatePickerProps) {
  const p = withDefaults<DatePickerProps>("date-picker", props);
  const kit = useKit();
  const fill = useFill();
  const [own, setOwn] = useState<Date | undefined>(undefined);
  const date = p.onChange ? (p.value ? dateOfValue(p.value, "date") : undefined) : own;
  const picker = usePicker("date", date ?? new Date(), (d) => {
    setOwn(d);
    p.onChange?.(dayOf(d));
  });
  const { box: field } = fieldStyle(kit, "outlined");
  const box = p.error ? { ...field, borderColor: c(kit, "error") } : field;
  const shown = date ? `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}` : undefined;
  return withField(
    p,
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 256) }, fill]}>
      <Pressable accessibilityRole="button" accessibilityLabel={starred(p.label, p.required) || p.ariaLabel} disabled={p.disabled || p.readOnly} onPress={picker.show} style={{ height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, columnGap: 8, opacity: p.disabled ? 0.38 : 1, ...box }}>
        <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: shown ? c(kit, "on-surface") : c(kit, "on-surface-variant") }}>{shown ?? (starred(p.label, p.required) || p.placeholder)}</RNText>
        <Glyph name="calendar_today" size={24} color={recipeOf(kit, "picker") === "ios" ? c(kit, "primary") : c(kit, "on-surface-variant")} />
      </Pressable>
      {picker.sheet}
    </View>,
  );
}

export type TimePickerProps = PartBase & FieldProps & { title?: string; hours?: number; minutes?: number; hour24?: boolean; mode?: "dial" | "input"; width?: number; disabled?: boolean; error?: boolean };

/** The time picker drawn open, as the design shows it: Material's dial, or the style's wheels (iOS, WeChat). A tap on
 *  the time opens the platform's own picker. */
export function TimePicker(props: TimePickerProps) {
  const p = withDefaults<TimePickerProps>("time-picker", props);
  const kit = useKit();
  const [time, setTime] = useState(new Date(2000, 0, 1, clampInt(p.hours ?? 9, 0, 23), clampInt(p.minutes ?? 30, 0, 59)));
  const picker = usePicker("time", time, setTime);
  const recipe = recipeOf(kit, "picker");
  const h24 = !!p.hour24;
  const hour = time.getHours();
  const shownHour = h24 ? hour : hour % 12 || 12;
  const minute = time.getMinutes();
  const pm = hour >= 12;
  const two = (n: number) => String(n).padStart(2, "0");
  if (recipe === "ios" || recipe === "weui") {
    const col = (values: string[], at: number) => (
      <View style={{ alignItems: "center", width: 56 }}>
        {[-2, -1, 0, 1, 2].map((d) => {
          const v = values[(at + d + values.length) % values.length];
          return (
            <RNText key={d} style={{ height: 32, ...typeStyle(kit, "title-large"), fontSize: d === 0 ? 21 : 19, lineHeight: 32, color: d === 0 ? c(kit, "on-surface") : withAlpha(c(kit, "on-surface"), d === 0 ? 1 : Math.abs(d) === 1 ? 0.5 : 0.25) }}>
              {v}
            </RNText>
          );
        })}
      </View>
    );
    const hours = Array.from({ length: h24 ? 24 : 12 }, (_, i) => (h24 ? two(i) : String(i + 1)));
    return (
      <Surface base={panelStyle(kit, { width: Math.round(p.width ?? 328), padding: 16, rowGap: 8, borderRadius: 14, backgroundColor: c(kit, "surface-container-low") })} appearance={p} testID={p.testID}>
        <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface-variant") }}>{p.title}</RNText>
        <Pressable accessibilityRole="button" accessibilityLabel={`${two(shownHour)}:${two(minute)}`} onPress={picker.show} style={{ flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
          <View style={{ position: "absolute", left: 0, right: 0, height: 32, borderRadius: 8, backgroundColor: recipe === "ios" ? withAlpha(c(kit, "on-surface"), 0.06) : "transparent", borderTopWidth: recipe === "weui" ? 0.5 : 0, borderBottomWidth: recipe === "weui" ? 0.5 : 0, borderColor: c(kit, "outline-variant") }} />
          {col(hours, h24 ? hour : shownHour - 1)}
          {col(Array.from({ length: 60 }, (_, i) => two(i)), minute)}
          {h24 ? null : col(["AM", "PM"], pm ? 1 : 0)}
        </Pressable>
        {picker.sheet}
      </Surface>
    );
  }
  /* Material: the time in two boxes, AM and PM, and the dial */
  const box = (v: string, on: boolean) => (
    <View style={{ width: 96, height: 72, borderRadius: corner(kit, "sm"), alignItems: "center", justifyContent: "center", backgroundColor: on ? c(kit, "primary-container") : c(kit, "surface-container-highest") }}>
      <RNText style={{ ...typeStyle(kit, "display-medium"), color: on ? c(kit, "on-primary-container") : c(kit, "on-surface") }}>{v}</RNText>
    </View>
  );
  const dial = 256;
  const r = dial / 2 - 24;
  const marks = Array.from({ length: 12 }, (_, i) => i + 1);
  const angle = (((shownHour % 12) / 12) * 360 - 90) * (Math.PI / 180);
  return (
    <Surface base={panelStyle(kit, { width: Math.round(p.width ?? 328), padding: 24, rowGap: 20, borderRadius: corner(kit, "xl"), backgroundColor: c(kit, "surface-container-high"), boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026" })} appearance={p} testID={p.testID}>
      <RNText style={{ ...typeStyle(kit, "label-medium"), color: c(kit, "on-surface-variant") }}>{p.title}</RNText>
      <Pressable accessibilityRole="button" accessibilityLabel={`${two(shownHour)}:${two(minute)}`} onPress={picker.show} style={{ flexDirection: "row", alignItems: "center", columnGap: 4 }}>
        {box(two(shownHour), true)}
        <RNText style={{ ...typeStyle(kit, "display-large"), color: c(kit, "on-surface") }}>:</RNText>
        {box(two(minute), false)}
        {h24 ? null : (
          <View style={{ marginLeft: 8, width: 52, height: 72, borderRadius: corner(kit, "sm"), borderWidth: 1, borderColor: c(kit, "outline"), overflow: "hidden" }}>
            {["AM", "PM"].map((v, i) => (
              <View key={v} style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: (i === 1) === pm ? c(kit, "tertiary-container") : "transparent", borderTopWidth: i ? 1 : 0, borderColor: c(kit, "outline") }}>
                <RNText style={{ ...typeStyle(kit, "title-medium"), color: (i === 1) === pm ? c(kit, "on-tertiary-container") : c(kit, "on-surface-variant") }}>{v}</RNText>
              </View>
            ))}
          </View>
        )}
      </Pressable>
      {p.mode === "input" ? null : (
        <View style={{ width: dial, height: dial, borderRadius: dial / 2, alignSelf: "center", backgroundColor: c(kit, "surface-container-highest") }}>
          <View style={{ position: "absolute", left: dial / 2, top: dial / 2 - 1, width: r, height: 2, backgroundColor: c(kit, "primary"), transformOrigin: "0% 50%", transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }] }} />
          <View style={{ position: "absolute", left: dial / 2 - 4, top: dial / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: c(kit, "primary") }} />
          {marks.map((m) => {
            const a = ((m / 12) * 360 - 90) * (Math.PI / 180);
            const on = m === shownHour % 12 || (m === 12 && shownHour % 12 === 0);
            return (
              <View key={m} style={{ position: "absolute", left: dial / 2 + r * Math.cos(a) - 24, top: dial / 2 + r * Math.sin(a) - 24, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: on ? c(kit, "primary") : "transparent" }}>
                <RNText style={{ ...typeStyle(kit, "body-large"), color: on ? c(kit, "on-primary") : c(kit, "on-surface") }}>{String(m)}</RNText>
              </View>
            );
          })}
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Type the time" onPress={picker.show} style={{ alignSelf: "flex-start", padding: 4 }}>
        <Glyph name="keyboard" size={24} color={c(kit, "on-surface-variant")} />
      </Pressable>
      {picker.sheet}
    </Surface>
  );
}

/* ---------- segmented buttons, a group of buttons ---------- */

const SEG_H: Record<string, number> = { xs: 32, sm: 36, default: 40, md: 56 };

export type SegmentedButtonProps = PartBase & { items?: ListRow[]; selected?: number; connected?: boolean; variant?: string; size?: string; multiple?: boolean };

/** M3 Expressive's connected button group as a choice; iOS's segmented control; capsules apart */
export function SegmentedButton(props: SegmentedButtonProps) {
  const p = withDefaults<SegmentedButtonProps>("toggle-group", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useState<number[]>([clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1))]);
  const recipe = recipeOf(kit, "segmented");
  const h = SEG_H[p.size ?? "default"] ?? 40;
  const pick = (i: number) => {
    setChosen((now) => (p.multiple ? (now.includes(i) ? now.filter((x) => x !== i) : [...now, i]) : [i]));
    tapOf(p, `tab:${i}`)?.();
  };
  if (recipe === "ios")
    return (
      <Surface base={{ flexDirection: "row", height: 32, padding: 2, borderRadius: 9, backgroundColor: withAlpha(c(kit, "on-surface"), kit.dark ? 0.16 : 0.07), alignSelf: "flex-start" }} appearance={p} testID={p.testID}>
        {items.map((it, i) => {
          const on = chosen.includes(i);
          return (
            <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(i)} style={{ paddingHorizontal: 14, borderRadius: 7, justifyContent: "center", backgroundColor: on ? (kit.dark ? c(kit, "surface-container-highest") : "#FFFFFF") : "transparent", boxShadow: on ? "0px 1px 3px 0px #0000001F" : undefined }}>
              <RNText style={{ ...typeStyle(kit, "label-large"), fontWeight: on ? "600" : "400", color: c(kit, "on-surface") }}>{it.label}</RNText>
            </Pressable>
          );
        })}
      </Surface>
    );
  /* capsules apart, the chosen one in the words' color (Spotify), else M3 Expressive's connected group */
  const capsules = recipe === "capsules";
  const apart = capsules || p.connected === false;
  return (
    <Surface base={{ flexDirection: "row", columnGap: apart ? 8 : 2, alignSelf: "flex-start" }} appearance={p} testID={p.testID}>
      {items.map((it, i) => {
        const on = chosen.includes(i);
        const end = h / 2;
        const inner = apart ? end : corner(kit, "xs") + 4;
        const radius: ViewStyle = { borderTopLeftRadius: i === 0 || on ? end : inner, borderBottomLeftRadius: i === 0 || on ? end : inner, borderTopRightRadius: i === items.length - 1 || on ? end : inner, borderBottomRightRadius: i === items.length - 1 || on ? end : inner };
        return (
          <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(i)} style={{ height: h, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", columnGap: 8, justifyContent: "center", backgroundColor: on ? c(kit, capsules ? "on-surface" : "primary") : c(kit, capsules ? "surface-container-high" : "surface-container"), ...radius }}>
            {it.icon ? <Glyph name={it.icon} size={20} filled={on} color={on ? c(kit, capsules ? "surface" : "on-primary") : c(kit, capsules ? "on-surface" : "on-surface-variant")} /> : null}
            <RNText style={{ ...typeStyle(kit, "label-large"), color: on ? c(kit, capsules ? "surface" : "on-primary") : c(kit, capsules ? "on-surface" : "on-surface-variant"), ...(capsules ? { fontWeight: "700" } : null) }}>{it.label}</RNText>
          </Pressable>
        );
      })}
    </Surface>
  );
}

const GROUP_H: Record<string, number> = { xs: 32, sm: 40, md: 56, lg: 96, xl: 136 };

export type ButtonGroupProps = PartBase & { items?: ListRow[]; variant?: "connected" | "standard"; orientation?: "horizontal" | "vertical"; buttonVariant?: string; size?: string };

export function ButtonGroup(props: ButtonGroupProps) {
  const p = withDefaults<ButtonGroupProps>("button-group", props);
  const kit = useKit();
  const items = p.items ?? [];
  const h = GROUP_H[p.size ?? "sm"] ?? 40;
  const look = buttonColors(kit, p.buttonVariant ?? "tonal");
  const connected = p.variant !== "standard";
  const vertical = p.orientation === "vertical";
  const end = controlRadius(kit, h);
  const inner = connected ? Math.min(end, corner(kit, "xs") + 4) : end;
  return (
    <Surface base={{ flexDirection: vertical ? "column" : "row", gap: connected ? 2 : 8, alignSelf: "flex-start" }} appearance={p} testID={p.testID}>
      {items.map((it, i) => {
        const first = i === 0;
        const last = i === items.length - 1;
        const radius: ViewStyle = vertical
          ? { borderTopLeftRadius: first ? end : inner, borderTopRightRadius: first ? end : inner, borderBottomLeftRadius: last ? end : inner, borderBottomRightRadius: last ? end : inner }
          : { borderTopLeftRadius: first ? end : inner, borderBottomLeftRadius: first ? end : inner, borderTopRightRadius: last ? end : inner, borderBottomRightRadius: last ? end : inner };
        return (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={it.label} onPress={tapOf(p, `tab:${i}`)} style={{ height: h, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 8, ...look.box, ...radius }}>
            {it.icon ? <Glyph name={it.icon} size={20} color={look.ink} /> : null}
            <RNText style={{ ...typeStyle(kit, "label-large"), color: look.ink }}>{it.label}</RNText>
          </Pressable>
        );
      })}
    </Surface>
  );
}

/* ---------- a menu ---------- */

export type MenuProps = PartBase & { label?: string; variant?: string; items?: ListRow[]; destructive?: string };

/** a button that opens a menu of actions over the screen */
export function Menu(props: MenuProps) {
  const p = withDefaults<MenuProps>("dropdown-menu", props);
  const kit = useKit();
  const [open, setOpen] = useState(false);
  const look = buttonColors(kit, p.variant ?? "outlined");
  const items = p.items ?? [];
  const run = (slot: string) => {
    setOpen(false);
    tapOf(p, slot)?.();
  };
  return (
    <View testID={p.testID} style={{ alignSelf: "flex-start" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={p.label} onPress={() => setOpen(true)} style={{ height: 40, paddingHorizontal: 16, borderRadius: controlRadius(kit, 40), flexDirection: "row", alignItems: "center", columnGap: 8, ...look.box }}>
        <RNText style={{ ...typeStyle(kit, "label-large"), color: look.ink }}>{p.label}</RNText>
      </Pressable>
      <Popup open={open} onClose={() => setOpen(false)}>
        {items.map((it, i) => (
          <MenuRow key={i} label={it.label} icon={it.icon} onPress={() => run(`tab:${i}`)} />
        ))}
        {p.destructive ? <MenuRow label={p.destructive} icon="delete" danger onPress={() => run(`tab:${items.length}`)} /> : null}
      </Popup>
    </View>
  );
}
