import { Input as TaroInput, Picker, Textarea as TaroTextarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Button, buttonColors, inkCss, keyboardOf, RadioMark } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c, ca } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { fieldStyle, ownFields, panelStyle } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { BARE, merge, sx, ROW, type CSS } from "../styles";
import { controlRadius, corner, recipeOf, typeStyle, useKit } from "../theme";
import { useValue } from "../value";
import { tapOf } from "./bars";
import { starred, withField, type FieldProps } from "../field";

/* Fields and pickers: a text field with its label, a select, a date picker and a time picker (the platform's own
 * pickers: Taro's <Picker>, a wheel on WeChat and Douyin and a sheet on the web), segmented buttons, a menu (the
 * platform's action sheet), a radio group and a file upload (the platform's image or file chooser). */

/* ---------- a text field ---------- */

export type TextFieldProps = PartBase & {
  label?: string;
  value?: string;
  variant?: "outlined" | "filled";
  leadingIcon?: string;
  trailingIcon?: string;
  error?: boolean;
  multiline?: boolean;
  width?: number;
  /** the keyboard and how the words show: email, password, number, tel, url (the part or a form's field says) */
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  /** words before and after what is typed (a currency, a unit) */
  prefix?: string;
  suffix?: string;
  onChange?: (text: string) => void;
} & FieldProps;

/** Material's text field: its label inside until there is something typed, then above the words; the style's own field
 *  where it has one (the label then stays inside the box) */
export function TextField(props: TextFieldProps) {
  const p = withDefaults<TextFieldProps>("text-field", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useValue(p.value ?? "", p.onChange);
  const [focused, setFocused] = useState(false);
  const { box, focus } = fieldStyle(kit, p.variant ?? "outlined", !!p.multiline);
  const own = ownFields(kit);
  const up = focused || !!text;
  const tint = p.error ? c("error") : focused ? c("primary") : c("on-surface-variant");
  const outlinedLabel = p.variant !== "filled" && !own && up;
  const words = sx(typeStyle(kit, "body-large"), BARE, { color: c("on-surface"), width: "100%", minHeight: 24 }, p.multiline ? { height: 72 } : { height: 24 });
  const held = !!p.disabled || !!p.readOnly;
  /* the message of its error stands where its line of help was */
  const supporting = p.error && p.errorText ? p.errorText : p.helperText;
  return withField(
    { loading: p.loading },
    <View {...tagOf(p.testID)} style={sx({ display: "flex", flexDirection: "column", rowGap: 4, width: Math.round(p.width ?? 280), flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)}>
      <View style={sx(merge({ ...ROW, position: "relative", boxSizing: "border-box", minHeight: p.multiline ? 96 : 56, alignItems: p.multiline ? "flex-start" : "center", paddingLeft: 16, paddingRight: 16, columnGap: 12 }, box, focused ? focus : null, p.error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null))}>
        {p.leadingIcon ? <Glyph name={p.leadingIcon} size={24} color="on-surface-variant" /> : null}
        <View style={sx({ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: up && !outlinedLabel ? 16 : 0, alignSelf: "stretch" })}>
          {p.label ? (
            <Words
              text={starred(p.label, p.required)}
              lines={1}
              style={
                outlinedLabel
                  ? { position: "absolute", top: -8, left: -4, paddingLeft: 4, paddingRight: 4, backgroundColor: c("surface"), ...typeStyle(kit, "body-small"), color: tint, pointerEvents: "none" }
                  : up
                    ? { position: "absolute", top: 6, ...typeStyle(kit, "body-small"), color: tint, pointerEvents: "none" }
                    : { position: "absolute", top: "50%", marginTop: -12, ...typeStyle(kit, "body-large"), color: c("on-surface-variant"), pointerEvents: "none" }
              }
            />
          ) : null}
          {p.multiline ? (
            <TaroTextarea value={text} ariaLabel={p.label || p.ariaLabel} disabled={held} maxlength={-1} onInput={(e) => setText(e.detail.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={words} />
          ) : (
            <View style={sx(ROW, { columnGap: 4 })}>
              {p.prefix && up ? <Words text={p.prefix} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface-variant") }} /> : null}
              <TaroInput value={text} ariaLabel={p.label || p.ariaLabel} disabled={held} password={p.type === "password"} type={keyboardOf(p.type)} placeholder={up || !p.label ? p.placeholder : undefined} maxlength={-1} onInput={(e) => setText(e.detail.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={words} />
              {p.suffix && up ? <Words text={p.suffix} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface-variant") }} /> : null}
            </View>
          )}
        </View>
        {p.trailingIcon || p.error ? <Glyph name={p.error ? "error" : p.trailingIcon!} size={24} color={p.error ? "error" : "on-surface-variant"} /> : null}
      </View>
      {supporting ? <Words text={supporting} style={{ ...typeStyle(kit, "body-small"), color: p.error ? c("error") : c("on-surface-variant"), paddingLeft: 16, paddingRight: 16 }} /> : null}
    </View>,
  );
}

/* ---------- a select ---------- */

export type SelectProps = PartBase & FieldProps & { items?: ListRow[]; selected?: number; variant?: "outlined" | "filled"; label?: string; placeholder?: string; size?: "default" | "sm"; disabled?: boolean; width?: number; error?: boolean; onChange?: (i: number) => void };

/** a field that opens the platform's picker of its options */
export function Select(props: SelectProps) {
  const p = withDefaults<SelectProps>("select", props);
  const kit = useKit();
  const fill = useFill();
  const items = p.items ?? [];
  const [chosen, setChosen] = useValue(clampInt(p.selected ?? 0, -1, items.length - 1), p.onChange);
  const { box } = fieldStyle(kit, p.variant ?? "outlined");
  const ios = recipeOf(kit, "menu") === "ios" || recipeOf(kit, "picker") === "ios";
  const value = items[chosen]?.label;
  /* M3's outlined field carries its label in a notch of its border, as the editor draws it; other fields over it */
  const notched = !!p.label && (p.variant ?? "outlined") === "outlined" && recipeOf(kit, "field") === "m3";
  const notch = notched ? <Words text={starred(p.label, p.required)} lines={1} style={{ position: "absolute", left: 12, top: -8, paddingLeft: 4, paddingRight: 4, ...typeStyle(kit, "body-small"), lineHeight: "16px", backgroundColor: c("surface"), color: c("on-surface-variant") }} /> : null;
  const supporting = p.error && p.errorText ? p.errorText : p.helperText;
  return withField(
    { loading: p.loading },
    <View {...tagOf(p.testID)} style={sx({ display: "flex", flexDirection: "column", rowGap: 4, width: Math.round(p.width ?? 224), flexShrink: 0 }, fill)}>
      {p.label && !notched ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
      <Picker
        mode="selector"
        range={items.map((it) => it.label)}
        value={Math.max(0, chosen)}
        disabled={!!p.disabled || !!p.readOnly}
        onChange={(e) => {
          const i = Number(e.detail.value);
          setChosen(i);
          tapOf(p, `tab:${i}`)?.();
        }}
      >
        <View ariaRole="combobox" ariaLabel={p.label || p.ariaLabel || p.placeholder} style={sx(merge({ ...ROW, position: "relative", boxSizing: "border-box", height: p.size === "sm" ? 40 : 56, paddingLeft: 16, paddingRight: 16, columnGap: 8, opacity: p.disabled ? 0.38 : 1 }, box, p.error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null))}>
          {notch}
          <Words text={value ?? p.placeholder} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: value ? c("on-surface") : c("on-surface-variant") }} />
          <Glyph name={ios ? "unfold_more" : "arrow_drop_down"} size={24} color="on-surface-variant" />
        </View>
      </Picker>
      {supporting ? <Words text={supporting} style={{ ...typeStyle(kit, "body-small"), color: p.error ? c("error") : c("on-surface-variant"), paddingLeft: 16, paddingRight: 16 }} /> : null}
    </View>,
  );
}

/* ---------- dates and times ---------- */

const two = (n: number) => String(n).padStart(2, "0");

export type DatePickerProps = PartBase & FieldProps & { variant?: "docked" | "modal"; label?: string; placeholder?: string; width?: number; mode?: "single" | "range"; title?: string; defaultView?: string; disabled?: boolean; error?: boolean; value?: string; onChange?: (date: string) => void };

/** a field that opens the platform's date picker; the date is YYYY-MM-DD */
export function DatePicker(props: DatePickerProps) {
  const p = withDefaults<DatePickerProps>("date-picker", props);
  const kit = useKit();
  const fill = useFill();
  const [date, setDate] = useValue(p.value ?? "", p.onChange);
  const { box } = fieldStyle(kit, "outlined");
  const today = new Date();
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx({ width: Math.round(p.width ?? 256), flexShrink: 0 }, fill)}>
      <Picker mode="date" value={date || `${today.getFullYear()}-${two(today.getMonth() + 1)}-${two(today.getDate())}`} disabled={!!p.disabled || !!p.readOnly} onChange={(e) => setDate(String(e.detail.value))}>
        <View ariaRole="button" ariaLabel={p.label || p.ariaLabel} style={sx(merge({ ...ROW, boxSizing: "border-box", height: 56, paddingLeft: 16, paddingRight: 16, columnGap: 8, opacity: p.disabled ? 0.38 : 1 }, box, p.error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null))}>
          <Words text={date || starred(p.label, p.required) || p.placeholder} lines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: date ? c("on-surface") : c("on-surface-variant") }} />
          <Glyph name="calendar_today" size={24} color={recipeOf(kit, "picker") === "ios" ? "primary" : "on-surface-variant"} />
        </View>
      </Picker>
    </View>,
  );
}

export type TimePickerProps = PartBase & FieldProps & { title?: string; hours?: number; minutes?: number; hour24?: boolean; mode?: "dial" | "input"; width?: number; disabled?: boolean; error?: boolean; value?: string; onChange?: (time: string) => void };

/** The time picker drawn open, as the design shows it: Material's two boxes and dial, or the style's wheels (iOS,
 *  WeChat). A tap on the time opens the platform's own picker; the time is HH:mm. */
export function TimePicker(props: TimePickerProps) {
  const p = withDefaults<TimePickerProps>("time-picker", props);
  const kit = useKit();
  const [time, setTime] = useValue(p.value || `${two(clampInt(p.hours ?? 9, 0, 23))}:${two(clampInt(p.minutes ?? 30, 0, 59))}`, p.onChange);
  const recipe = recipeOf(kit, "picker");
  const [hh, mm] = time.split(":").map((x) => Number(x) || 0);
  const h24 = !!p.hour24;
  const shownHour = h24 ? hh : hh % 12 || 12;
  const pm = hh >= 12;
  const open = (body: ReactNode) => (
    <Picker mode="time" value={`${two(hh)}:${two(mm)}`} onChange={(e) => setTime(String(e.detail.value))}>
      {body}
    </Picker>
  );
  if (recipe === "ios" || recipe === "weui") {
    const col = (values: string[], at: number) => (
      <View style={sx({ display: "flex", flexDirection: "column", alignItems: "center", width: 56 })}>
        {[-2, -1, 0, 1, 2].map((d) => (
          <Words key={d} text={values[(at + d + values.length) % values.length]} style={{ height: 32, ...typeStyle(kit, "title-large"), fontSize: d === 0 ? 21 : 19, lineHeight: "32px", color: d === 0 ? c("on-surface") : ca("on-surface", Math.abs(d) === 1 ? 0.5 : 0.25) }} />
        ))}
      </View>
    );
    const hours = Array.from({ length: h24 ? 24 : 12 }, (_, i) => (h24 ? two(i) : String(i + 1)));
    return (
      <Surface base={panelStyle(kit, { width: Math.round(p.width ?? 328), padding: 16, display: "flex", flexDirection: "column", rowGap: 8, borderRadius: 14, backgroundColor: c("surface-container-low") })} appearance={p} testID={p.testID}>
        <Words text={p.title} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface-variant") }} />
        {open(
          <View style={sx(ROW, { position: "relative", justifyContent: "center" })}>
            <View style={sx({ position: "absolute", left: 0, right: 0, top: 64, height: 32, borderRadius: 8, backgroundColor: recipe === "ios" ? ca("on-surface", 0.06) : "transparent", ...(recipe === "weui" ? { borderTop: `0.5px solid ${c("outline-variant")}`, borderBottom: `0.5px solid ${c("outline-variant")}` } : null) })} />
            {col(hours, h24 ? hh : shownHour - 1)}
            {col(Array.from({ length: 60 }, (_, i) => two(i)), mm)}
            {h24 ? null : col(["AM", "PM"], pm ? 1 : 0)}
          </View>,
        )}
      </Surface>
    );
  }
  const box = (v: string, on: boolean) => (
    <View style={sx(ROW, { width: 96, height: 72, borderRadius: corner(kit, "sm"), justifyContent: "center", backgroundColor: on ? c("primary-container") : c("surface-container-highest") })}>
      <Words text={v} style={{ ...typeStyle(kit, "display-medium"), color: on ? c("on-primary-container") : c("on-surface") }} />
    </View>
  );
  const dial = 256;
  const r = dial / 2 - 24;
  const angle = ((shownHour % 12) / 12) * 360 - 90;
  return (
    <Surface base={panelStyle(kit, { width: Math.round(p.width ?? 328), padding: 24, display: "flex", flexDirection: "column", rowGap: 20, borderRadius: corner(kit, "xl"), backgroundColor: c("surface-container-high"), boxShadow: "0px 1px 3px 0px rgba(0,0,0,0.3), 0px 4px 8px 3px rgba(0,0,0,0.15)" })} appearance={p} testID={p.testID}>
      <Words text={p.title} style={{ ...typeStyle(kit, "label-medium"), color: c("on-surface-variant") }} />
      {open(
        <View style={sx(ROW, { columnGap: 4 })}>
          {box(two(shownHour), true)}
          <Words text=":" style={{ ...typeStyle(kit, "display-large"), color: c("on-surface") }} />
          {box(two(mm), false)}
          {h24 ? null : (
            <View style={sx({ marginLeft: 8, width: 52, height: 72, boxSizing: "border-box", borderRadius: corner(kit, "sm"), border: `1px solid ${c("outline")}`, overflow: "hidden", display: "flex", flexDirection: "column" })}>
              {["AM", "PM"].map((v, i) => (
                <View key={v} style={sx(ROW, { flex: 1, justifyContent: "center", backgroundColor: (i === 1) === pm ? c("tertiary-container") : "transparent", ...(i ? { borderTop: `1px solid ${c("outline")}` } : null) })}>
                  <Words text={v} style={{ ...typeStyle(kit, "title-medium"), color: (i === 1) === pm ? c("on-tertiary-container") : c("on-surface-variant") }} />
                </View>
              ))}
            </View>
          )}
        </View>,
      )}
      {p.mode === "input" ? null : (
        <View style={sx({ position: "relative", width: dial, height: dial, borderRadius: dial / 2, alignSelf: "center", backgroundColor: c("surface-container-highest") })}>
          <View style={sx({ position: "absolute", left: dial / 2, top: dial / 2 - 1, width: r, height: 2, backgroundColor: c("primary"), transformOrigin: "0% 50%", transform: `rotate(${angle}deg)` })} />
          <View style={sx({ position: "absolute", left: dial / 2 - 4, top: dial / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: c("primary") })} />
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const a = ((m / 12) * 360 - 90) * (Math.PI / 180);
            const on = m === shownHour % 12 || (m === 12 && shownHour % 12 === 0);
            return (
              <View key={m} style={sx(ROW, { position: "absolute", left: dial / 2 + r * Math.cos(a) - 24, top: dial / 2 + r * Math.sin(a) - 24, width: 48, height: 48, borderRadius: 24, justifyContent: "center", backgroundColor: on ? c("primary") : "transparent" })}>
                <Words text={String(m)} style={{ ...typeStyle(kit, "body-large"), color: on ? c("on-primary") : c("on-surface") }} />
              </View>
            );
          })}
        </View>
      )}
    </Surface>
  );
}

/* ---------- segmented buttons ---------- */

const SEG_H: Record<string, number> = { xs: 32, sm: 36, default: 40, md: 56 };

export type SegmentedButtonProps = PartBase & { items?: ListRow[]; selected?: number; connected?: boolean; variant?: string; size?: string; multiple?: boolean; disabled?: boolean };

/** M3 Expressive's connected button group as a choice; iOS's segmented control; capsules apart */
export function SegmentedButton(props: SegmentedButtonProps) {
  const p = withDefaults<SegmentedButtonProps>("toggle-group", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useState<number[]>([clampInt(p.selected ?? 0, 0, Math.max(0, items.length - 1))]);
  const recipe = recipeOf(kit, "segmented");
  const h = SEG_H[p.size ?? "default"] ?? 40;
  const pick = (i: number) => {
    if (p.disabled) return;
    setChosen((now) => (p.multiple ? (now.includes(i) ? now.filter((x) => x !== i) : [...now, i]) : [i]));
    tapOf(p, `tab:${i}`)?.();
  };
  if (recipe === "ios")
    return (
      <Surface base={{ ...ROW, alignItems: "stretch", height: 32, padding: 2, borderRadius: 9, backgroundColor: ca("on-surface", kit.dark ? 0.16 : 0.07), alignSelf: "flex-start", opacity: p.disabled ? 0.38 : 1 }} appearance={p} testID={p.testID}>
        {items.map((it, i) => {
          const on = chosen.includes(i);
          return (
            <View key={i} ariaRole="button" ariaSelected={on} onClick={(e) => (e.stopPropagation(), pick(i))} style={sx(ROW, { paddingLeft: 14, paddingRight: 14, borderRadius: 7, justifyContent: "center", backgroundColor: on ? (kit.dark ? c("surface-container-highest") : "#FFFFFF") : "transparent", boxShadow: on ? "0px 1px 3px 0px rgba(0,0,0,0.12)" : undefined })}>
              <Words text={it.label} style={{ ...typeStyle(kit, "label-large"), fontWeight: on ? 600 : 400, color: c("on-surface") }} />
            </View>
          );
        })}
      </Surface>
    );
  const capsules = recipe === "capsules";
  const apart = capsules || p.connected === false;
  return (
    <Surface base={{ ...ROW, columnGap: apart ? 8 : 2, alignSelf: "flex-start", opacity: p.disabled ? 0.38 : 1 }} appearance={p} testID={p.testID}>
      {items.map((it, i) => {
        const on = chosen.includes(i);
        const end = h / 2;
        const inner = apart ? end : corner(kit, "xs") + 4;
        const radius: CSS = { borderTopLeftRadius: i === 0 || on ? end : inner, borderBottomLeftRadius: i === 0 || on ? end : inner, borderTopRightRadius: i === items.length - 1 || on ? end : inner, borderBottomRightRadius: i === items.length - 1 || on ? end : inner };
        const ink = on ? (capsules ? "surface" : "on-primary") : capsules ? "on-surface" : "on-surface-variant";
        return (
          <View key={i} ariaRole="button" ariaSelected={on} hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), pick(i))} style={sx(ROW, { height: h, paddingLeft: 16, paddingRight: 16, columnGap: 8, justifyContent: "center", backgroundColor: on ? c(capsules ? "on-surface" : "primary") : c(capsules ? "surface-container-high" : "surface-container") }, radius)}>
            {it.icon ? <Glyph name={it.icon} size={20} filled={on} color={ink} /> : null}
            <Words text={it.label} style={{ ...typeStyle(kit, "label-large"), color: c(ink), ...(capsules ? { fontWeight: 700 } : null) }} />
          </View>
        );
      })}
    </Surface>
  );
}

/* ---------- a menu ---------- */

/** `open` with `onOpenChange`: whether its menu is open is the app's (a tap's open and close effects), the visitor's
 *  opening and its sheet's closing handed to it; without them the button opens the sheet itself */
export type MenuProps = PartBase & { label?: string; variant?: string; items?: ListRow[]; destructive?: string; open?: boolean; onOpenChange?: (open: boolean) => void };

/** a button that opens the platform's action sheet of the menu's actions */
export function Menu(props: MenuProps) {
  const p = withDefaults<MenuProps>("dropdown-menu", props);
  const kit = useKit();
  const look = buttonColors(kit, p.variant ?? "outlined");
  const items = p.items ?? [];
  const labels = [...items.map((it) => it.label), ...(p.destructive ? [p.destructive] : [])].slice(0, 6);
  const sheet = () => {
    if (!labels.length) return void p.onOpenChange?.(false);
    Taro.showActionSheet({ itemList: labels })
      .then((r) => {
        p.onOpenChange?.(false);
        tapOf(p, `tab:${r.tapIndex}`)?.();
      })
      .catch(() => p.onOpenChange?.(false));
  };
  const controlled = !!p.onOpenChange;
  const asked = controlled && !!p.open;
  const latest = useRef(sheet);
  useEffect(() => {
    latest.current = sheet;
  });
  /* the app opened it: the sheet comes up once (a sheet the platform shows is not taken down from outside: closing it
     is the visitor's) */
  useEffect(() => {
    if (asked) latest.current();
  }, [asked]);
  const open = () => (controlled ? p.onOpenChange?.(true) : sheet());
  return (
    <Surface base={{ ...ROW, height: 40, paddingLeft: 16, paddingRight: 16, borderRadius: controlRadius(kit, 40), columnGap: 8, alignSelf: "flex-start", ...look.box }} appearance={p} testID={p.testID} onPress={open} label={p.label} ink={look.ink}>
      <Words text={p.label} style={{ ...typeStyle(kit, "label-large"), color: inkCss(look.ink) }} />
      <Glyph name="arrow_drop_down" size={20} color={look.ink} />
    </Surface>
  );
}

/* ---------- a radio group ---------- */

export type RadioGroupProps = PartBase & FieldProps & { items?: ListRow[]; selected?: number; layout?: "column" | "row"; disabled?: boolean; error?: boolean; onChange?: (i: number) => void };

export function RadioGroup(props: RadioGroupProps) {
  const p = withDefaults<RadioGroupProps>("radio-group", props);
  const kit = useKit();
  const items = p.items ?? [];
  const [chosen, setChosen] = useValue(clampInt(p.selected ?? 0, -1, Math.max(0, items.length - 1)), p.onChange);
  return withField(
    p,
    <View {...tagOf(p.testID)} ariaRole="radiogroup" ariaLabel={p.ariaLabel} style={sx({ display: "flex", flexDirection: p.layout === "row" ? "row" : "column", gap: p.layout === "row" ? 16 : 12, alignSelf: "flex-start" })}>
      {items.map((it, i) => (
        <View
          key={i}
          ariaRole="radio"
          ariaChecked={i === chosen}
          onClick={(e) => {
            e.stopPropagation();
            if (p.disabled || p.readOnly) return;
            setChosen(i);
            tapOf(p, `tab:${i}`)?.();
          }}
          style={sx(ROW, { columnGap: 12 })}
        >
          <RadioMark on={i === chosen} disabled={p.disabled} />
          <Words text={it.label} style={{ ...typeStyle(kit, "body-large"), color: c(p.error ? "error" : "on-surface") }} />
        </View>
      ))}
    </View>,
  );
}

/* ---------- a file upload ---------- */

/** a file as the platform hands one over: its temporary path, name, type and size */
export type PickedFile = { path: string; name: string; type: string; size: number };

/** `pick`: how the app asks for the files (an exported app's capability registry, file.pick); the platform's own
 *  pickers (`pickFiles`) without it */
export type FileUploadProps = PartBase & FieldProps & { title?: string; action?: string; multiple?: boolean; accept?: string; width?: number; error?: boolean; disabled?: boolean; value?: PickedFile | PickedFile[]; onChange?: (files: PickedFile | PickedFile[] | undefined) => void; pick?: (o: { multiple?: boolean; accept?: string }) => Promise<PickedFile[]> };

const mimeOf = (path: string) => {
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(path)?.[1]?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "pdf" ? "application/pdf" : "application/octet-stream";
};

/** Ask the platform for files: pictures from the album, or (WeChat) a file from a chat. Taking one with the camera is the
 *  camera capability's (file.pick with source "camera", docs/平台能力.md), as on the web and the phone. */
export async function pickFiles(o: { multiple?: boolean; accept?: string }): Promise<PickedFile[]> {
  const images = !o.accept || /image/.test(o.accept);
  if (!images && process.env.TARO_ENV === "weapp") {
    const r = await Taro.chooseMessageFile({ count: o.multiple ? 9 : 1, type: "file" });
    return r.tempFiles.map((f) => ({ path: f.path, name: f.name, type: mimeOf(f.name), size: f.size }));
  }
  const r = await Taro.chooseImage({ count: o.multiple ? 9 : 1, sizeType: ["compressed"], sourceType: ["album"] });
  return r.tempFiles.map((f, i) => {
    const own = (f as { originalFileObj?: { name?: string; type?: string } }).originalFileObj;
    return { path: f.path, name: own?.name ?? `image-${i + 1}.${mimeOf(f.path).split("/")[1] === "octet-stream" ? "jpg" : mimeOf(f.path).split("/")[1]}`, type: own?.type || (f as { type?: string }).type || mimeOf(f.path), size: f.size };
  });
}

export function FileUpload(props: FileUploadProps) {
  const p = withDefaults<FileUploadProps>("file-upload", props);
  const kit = useKit();
  const fill = useFill();
  const [files, setFiles] = useValue<PickedFile | PickedFile[] | undefined>(p.value, p.onChange);
  const list = files === undefined ? [] : Array.isArray(files) ? files : [files];
  const choose = () => {
    (p.pick ?? pickFiles)({ multiple: p.multiple, accept: p.accept })
      .then((picked) => {
        if (picked.length) setFiles(p.multiple ? picked : picked[0]);
        (tapOf(p, "action") ?? p.onPress)?.();
      })
      .catch(() => {});
  };
  const held = !!p.disabled || !!p.readOnly;
  /* its line of help stands in the panel, under the title: the field's note is only its error and its spinner */
  return withField(
    { ...p, helperText: undefined },
    <Surface
      base={merge({ display: "flex", flexDirection: "column", width: Math.round(p.width ?? 360), padding: 24, rowGap: 8, alignItems: "center", borderRadius: corner(kit, "lg"), border: `2px dashed ${p.error ? c("error") : c("outline-variant")}`, backgroundColor: c("surface-container-low"), opacity: p.disabled ? 0.38 : 1 }, fill)}
      appearance={p}
      testID={p.testID}
    >
      <Glyph name="upload_file" size={32} color="primary" />
      <Words text={list.length ? list.map((f) => f.name).join(", ") : starred(p.title, p.required)} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface"), textAlign: "center" }} />
      {p.helperText ? <Words text={p.helperText} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
      {/* the button in the middle, as the editor centres it (a button keeps to the start of its row by itself) */}
      {p.action ? (
        <View style={sx({ display: "flex", flexDirection: "row", justifyContent: "center", alignSelf: "stretch" })}>
          <Button label={p.action} variant="tonal" size="sm" disabled={held} onPress={held ? undefined : choose} />
        </View>
      ) : null}
    </Surface>,
  );
}
