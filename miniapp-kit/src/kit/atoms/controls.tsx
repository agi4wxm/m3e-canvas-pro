import { Input as TaroInput, Slider as TaroSlider, Textarea as TaroTextarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";

import { c, ca, st } from "../color";
import { Glyph } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { accentText, capsOf, extraColor, fieldStyle } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { BARE, merge, sx, ROW, type CSS } from "../styles";
import { controlRadius, corner, extra, pillRadius, recipeOf, typeStyle, useKit, type Kit, type TypeRole } from "../theme";
import { useValue } from "../value";
import type { PartBase } from "./basics";
import { Words } from "./words";
import { Spinner } from "./indicators";
import { starred, withField, type FieldProps } from "../field";

/* The controls: buttons, a toggle, chips, a switch, a check box, a radio button, a slider, inputs, a label, a link and a
 * rating. Each holds its own state from the value the design gives it, or the one it is handed with `onChange` (a form,
 * a variable), and the style builds it with its recipe: iOS's switch, round check boxes, a thin slider, the grey fields.
 * Words are typed into the platform's own <Input> and <Textarea>; a slider is the platform's own, in the theme's colors. */

/* ---------- buttons ---------- */

/** M3 Expressive's sizes (components/m3e/button.tsx): height, side padding, type role, icon size */
const SIZES: Record<string, { h: number; pad: number; type: TypeRole; icon: number; square: "md" | "lg" | "xl" }> = {
  xs: { h: 32, pad: 12, type: "label-large", icon: 20, square: "md" },
  sm: { h: 40, pad: 16, type: "label-large", icon: 20, square: "md" },
  md: { h: 56, pad: 24, type: "title-medium", icon: 24, square: "lg" },
  lg: { h: 96, pad: 48, type: "headline-small", icon: 32, square: "xl" },
  xl: { h: 136, pad: 64, type: "headline-large", icon: 40, square: "xl" },
};

/** a button's ground, edge and words for a variant, Material's and then the style's; `ink` is a role or a color ref */
export function buttonColors(kit: Kit, variant: string, disabled = false): { box: CSS; ink: string; weight?: number } {
  const recipe = recipeOf(kit, "button");
  const x = (k: string) => (typeof extra(kit, k) === "string" ? (extra(kit, k) as string) : undefined);
  let box: CSS;
  let ink: string;
  switch (variant) {
    case "tonal":
      box = { backgroundColor: extraColor(kit, "tonalBg") ?? c("secondary-container") };
      ink = x("tonalText") ?? "on-secondary-container";
      break;
    case "elevated":
      box = { backgroundColor: extraColor(kit, "outlinedBg") ?? c("surface-container-low"), boxShadow: extraColor(kit, "outlinedBg") ? undefined : "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)" };
      ink = x("outlinedText") ?? "st:primaryText";
      break;
    case "outlined": {
      const bg = extraColor(kit, "outlinedBg");
      box = bg ? { backgroundColor: bg } : { border: `1px solid ${extraColor(kit, "outlinedBorder") ?? c("outline-variant")}` };
      ink = x("outlinedText") ?? "on-surface-variant";
      break;
    }
    case "text":
      box = {};
      ink = x("textButtonText") ?? "st:primaryText";
      break;
    case "ghost":
      box = {};
      ink = "on-surface-variant";
      break;
    default:
      box = { backgroundColor: c("primary") };
      ink = "on-primary";
  }
  /* a style that draws its buttons as words keeps the words and drops the ground */
  if (recipe === "text" && variant !== "text" && variant !== "ghost") {
    box = {};
    ink = variant === "filled" || variant === undefined ? "st:primaryText" : ink;
  }
  if (recipe === "flat") box = { ...box, boxShadow: "none" };
  if (recipe === "hard" && box.backgroundColor) box = { ...box, border: `${kit.theme.edge}px solid ${c("outline")}`, boxShadow: `3px 3px 0px 0px ${c("outline")}` };
  if (recipe === "glow" && variant === "filled") box = { ...box, boxShadow: `0px 0px 14px 0px ${ca("primary", 0.6)}` };
  if (disabled) {
    box = { ...box, backgroundColor: box.backgroundColor ? ca("on-surface", 0.1) : undefined, boxShadow: "none", ...(box.border ? { border: `1px solid ${ca("on-surface", 0.12)}` } : null) };
    ink = "on-surface/38";
  }
  const w = extra(kit, "filledWeight");
  return { box, ink, weight: variant === "filled" && typeof w === "number" ? w : undefined };
}

/** a color ref (a role, a role with an opacity, a hex, one of the style's own as "st:<name>") as CSS */
export const inkCss = (r: string) => (r.startsWith("st:") ? st(r.slice(3)) : r.includes("/") ? ca(r.split("/")[0], Number(r.split("/")[1]) / 100) : r.startsWith("#") ? r : c(r));

export type ButtonProps = PartBase & {
  label?: string;
  icon?: string;
  variant?: "filled" | "tonal" | "elevated" | "outlined" | "text" | "ghost";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  trailingIcon?: string;
  shape?: "round" | "square";
  width?: number;
  iconWidth?: "default" | "narrow" | "wide";
  disabled?: boolean;
  toggle?: boolean;
  onIcon?: string;
  onLabel?: string;
  onLook?: string;
  /** a toggle that starts on */
  pressed?: boolean;
  /** what it started is under way: a spinner where its icon was, and it cannot be pressed again */
  loading?: boolean;
  /** what a screen reader calls it where its words do not say (an icon only) */
  ariaLabel?: string;
};

/** A button: M3 Expressive's sizes and variants under the style's corners and recipe. As a toggle it holds its state. */
export function Button(props: ButtonProps) {
  const p = withDefaults<ButtonProps>("button", props);
  const kit = useKit();
  const fill = useFill();
  const [on, setOn] = useState(!!p.pressed);
  const size = SIZES[p.size ?? "sm"] ?? SIZES.sm;
  const lit = p.toggle && on;
  const variant = lit && p.onLook && p.onLook !== "same" ? p.onLook : (p.variant ?? "filled");
  const held = !!p.disabled || !!p.loading;
  const look = buttonColors(kit, variant, held);
  const label = lit && p.onLabel ? p.onLabel : p.label;
  const icon = lit && p.onIcon ? p.onIcon : p.icon;
  const iconOnly = !label && !!icon;
  const radius = p.shape === "square" ? corner(kit, size.square) : controlRadius(kit, size.h);
  const base: CSS = {
    ...ROW,
    height: size.h,
    minWidth: iconOnly ? size.h : undefined,
    paddingLeft: iconOnly ? 0 : size.pad,
    paddingRight: iconOnly ? 0 : size.pad,
    justifyContent: "center",
    columnGap: 8,
    borderRadius: radius,
    flexShrink: 0,
    alignSelf: "flex-start",
    ...look.box,
    ...(!iconOnly && p.width !== 96 && p.width !== undefined ? { width: Math.round(p.width) } : null),
    ...(iconOnly ? { width: p.iconWidth === "narrow" ? Math.round(size.h * 0.8) : p.iconWidth === "wide" ? Math.round(size.h * 1.3) : size.h } : null),
    ...(held ? { pointerEvents: "none" } : null),
    ...fill,
  };
  const press = held
    ? undefined
    : () => {
        if (p.toggle) setOn((v) => !v);
        p.onPress?.();
      };
  return (
    <Surface base={base} appearance={p} onPress={press ?? (() => {})} testID={p.testID} label={label || p.ariaLabel || icon} ink={look.ink}>
      {p.loading ? <Spinner size="sm" /> : icon ? <Glyph name={icon} size={size.icon} filled={!!lit} color={look.ink} /> : null}
      {label ? <Words text={label} lines={1} style={merge(typeStyle(kit, size.type), { color: inkCss(look.ink) }, look.weight ? { fontWeight: look.weight } : null, capsOf(kit))} /> : null}
      {label && p.trailingIcon ? <Glyph name={p.trailingIcon} size={size.icon} color={look.ink} /> : null}
    </Surface>
  );
}

const ICON_SIZES: Record<string, { side: number; icon: number }> = { xs: { side: 32, icon: 20 }, sm: { side: 40, icon: 24 }, default: { side: 40, icon: 24 }, md: { side: 56, icon: 24 }, lg: { side: 96, icon: 32 }, xl: { side: 136, icon: 40 } };

export type IconButtonProps = PartBase & { icon?: string; label?: string; variant?: "filled" | "tonal" | "elevated" | "outlined" | "text" | "ghost"; size?: string; disabled?: boolean; iconFill?: boolean; loading?: boolean; ariaLabel?: string };

export function IconButton(props: IconButtonProps) {
  const p = withDefaults<IconButtonProps>("icon-button", props);
  const kit = useKit();
  const s = ICON_SIZES[p.size ?? "default"] ?? ICON_SIZES.default;
  const variant = p.variant ?? "text";
  const held = !!p.disabled || !!p.loading;
  const look = buttonColors(kit, variant, held);
  const ink = variant === "ghost" && !held ? "on-surface-variant" : look.ink;
  return (
    <Surface base={{ ...ROW, width: s.side, height: s.side, borderRadius: pillRadius(kit, s.side), justifyContent: "center", flexShrink: 0, ...look.box }} appearance={p} onPress={held ? undefined : (p.onPress ?? (() => {}))} testID={p.testID} label={p.ariaLabel || p.label || p.icon}>
      {p.loading ? <Spinner size="sm" /> : p.icon ? <Glyph name={p.icon} size={s.icon} filled={!!p.iconFill} color={ink} /> : null}
    </Surface>
  );
}

const TOGGLE_SIZES: Record<string, number> = { xs: 32, sm: 36, default: 40, md: 48, lg: 56 };

export type ToggleProps = PartBase & { icon?: string; label?: string; variant?: string; size?: string; shape?: "round" | "square"; pressed?: boolean; disabled?: boolean; ariaLabel?: string };

/** a button that stays pressed: tonal while on, its icon filled */
export function Toggle(props: ToggleProps) {
  const p = withDefaults<ToggleProps>("toggle", props);
  const kit = useKit();
  const [on, setOn] = useState(!!p.pressed);
  const h = TOGGLE_SIZES[p.size ?? "default"] ?? 40;
  const ground: CSS = on ? { backgroundColor: c(p.variant === "filled" ? "primary" : "secondary-container") } : p.variant === "outline" ? { border: `1px solid ${c("outline-variant")}` } : p.variant === "tonal" || p.variant === "filled" ? { backgroundColor: c("surface-container") } : {};
  const ink = on ? (p.variant === "filled" ? "on-primary" : "on-secondary-container") : "on-surface-variant";
  return (
    <Surface
      base={{ ...ROW, height: h, minWidth: h, paddingLeft: p.label ? 12 : 0, paddingRight: p.label ? 12 : 0, justifyContent: "center", columnGap: 8, borderRadius: p.shape === "square" ? corner(kit, "md") : pillRadius(kit, h), alignSelf: "flex-start", ...ground }}
      appearance={p}
      onPress={
        p.disabled
          ? undefined
          : () => {
              setOn((v) => !v);
              p.onPress?.();
            }
      }
      testID={p.testID}
      label={p.label || p.ariaLabel || p.icon}
    >
      {p.icon ? <Glyph name={p.icon} size={24} filled={on} color={ink} /> : null}
      {p.label ? <Words text={p.label} style={{ ...typeStyle(kit, "label-large"), color: c(ink) }} /> : null}
    </Surface>
  );
}

/* ---------- chips ---------- */

const CHIP_H: Record<string, number> = { default: 32, md: 40, lg: 48 };

export type ChipProps = PartBase & { items?: ListRow[]; kind?: "assist" | "filter" | "input"; selected?: number; variant?: "flat" | "elevated"; size?: string; disabled?: boolean; onChange?: (i: number) => void };

/** a row of chips: assist, filter (one chosen) or input (each with a close) */
export function Chip(props: ChipProps) {
  const p = withDefaults<ChipProps>("chip", props);
  const kit = useKit();
  const [chosen, setChosen] = useValue(Math.round(p.selected ?? 0), p.onChange);
  const h = CHIP_H[p.size ?? "default"] ?? 32;
  const recipe = recipeOf(kit, "chip");
  const radius = recipe === "pill" ? h / 2 : recipe === "tag" ? corner(kit, "xs") : Math.min(corner(kit, "sm"), controlRadius(kit, h));
  const items = p.items ?? [];
  return (
    <View {...tagOf(p.testID)} style={sx(ROW, { flexWrap: "wrap", gap: 8 }, p.disabled ? { opacity: 0.38, pointerEvents: "none" } : null)}>
      {items.map((it, i) => {
        const on = p.kind === "filter" && i === chosen;
        const bg = extraColor(kit, "chipBg");
        const ground: CSS = on
          ? { backgroundColor: extraColor(kit, "chipOn") ?? c("secondary-container") }
          : p.variant === "elevated"
            ? { backgroundColor: c("surface-container-low"), boxShadow: "0px 1px 2px 0px rgba(0,0,0,0.3), 0px 1px 3px 1px rgba(0,0,0,0.15)" }
            : bg
              ? { backgroundColor: bg }
              : { border: `1px solid ${c("outline-variant")}` };
        const ink = on ? ((extra(kit, "chipOnText") as string | undefined) ?? "on-secondary-container") : p.kind === "assist" ? "on-surface" : "on-surface-variant";
        return (
          <Surface
            key={i}
            base={{ ...ROW, height: h, paddingLeft: on || it.icon ? 8 : 16, paddingRight: p.kind === "input" ? 8 : 16, columnGap: 8, borderRadius: radius, ...ground }}
            appearance={p}
            onPress={() => {
              if (p.kind === "filter") setChosen(i);
              (p.taps?.[`tab:${i}`] ?? p.onPress)?.();
            }}
            label={it.label}
          >
            {on ? <Glyph name="check" size={18} color={ink} /> : it.icon ? <Glyph name={it.icon} size={18} color="primary" /> : null}
            <Words text={it.label} lines={1} style={{ ...typeStyle(kit, "label-large"), color: inkCss(ink) }} />
            {p.kind === "input" ? <Glyph name="close" size={18} color={ink} /> : null}
          </Surface>
        );
      })}
    </View>
  );
}

/* ---------- a switch, a check box, a radio button ---------- */

const knobShadow = "0px 2px 6px 0px rgba(0,0,0,0.15), 0px 0px 1px 0px rgba(0,0,0,0.1)";

/** the switch of the style: Material's, iOS's, a block or an outlined one */
export function SwitchTrack({ on, small, disabled }: { on: boolean; small: boolean; disabled: boolean }) {
  const kit = useKit();
  const recipe = recipeOf(kit, "toggle");
  const onColor = st("toggleOn");
  const box = (s: CSS) => sx({ boxSizing: "border-box", display: "flex", flexDirection: "row", alignItems: "center", flexShrink: 0, transition: "background-color 150ms" }, s);
  if (recipe === "ios" || recipe === "chunky") {
    const w = small ? 40 : 51;
    const h = small ? 24 : 31;
    const knob = h - 4;
    return (
      <View style={box({ width: w, height: h, borderRadius: h / 2, backgroundColor: on ? onColor : ca("on-surface", kit.dark ? 0.24 : 0.12), padding: 2, justifyContent: on ? "flex-end" : "flex-start", opacity: disabled ? 0.4 : 1 })}>
        <View style={sx({ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: "#FFFFFF", boxShadow: knobShadow })} />
      </View>
    );
  }
  if (recipe === "outline") {
    return (
      <View style={box({ width: 40, height: 20, borderRadius: 10, border: on ? "none" : `1px solid ${c("on-surface-variant")}`, backgroundColor: on ? onColor : "transparent", paddingLeft: 3, paddingRight: 3, justifyContent: on ? "flex-end" : "flex-start", opacity: disabled ? 0.4 : 1 })}>
        <View style={sx({ width: 12, height: 12, borderRadius: 6, backgroundColor: on ? c("on-primary") : c("on-surface-variant") })} />
      </View>
    );
  }
  if (recipe === "block") {
    return (
      <View style={box({ width: 48, height: 24, border: `2px solid ${c("outline")}`, backgroundColor: on ? onColor : c("surface-container-high"), padding: 2, justifyContent: on ? "flex-end" : "flex-start", opacity: disabled ? 0.4 : 1 })}>
        <View style={sx({ width: 16, height: 16, backgroundColor: on ? c("on-primary") : c("outline") })} />
      </View>
    );
  }
  const w = small ? 40 : 52;
  const h = small ? 24 : 32;
  const knob = on ? h - 8 : h / 2;
  return (
    <View
      style={box({
        width: w,
        height: h,
        borderRadius: h / 2,
        backgroundColor: on ? onColor : c("surface-container-highest"),
        border: on ? "none" : `2px solid ${c("outline")}`,
        justifyContent: on ? "flex-end" : "flex-start",
        paddingLeft: on ? 4 : (h - 4 - knob) / 2,
        paddingRight: on ? 4 : (h - 4 - knob) / 2,
        opacity: disabled ? 0.38 : 1,
      })}
    >
      <View style={sx({ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: on ? c("on-primary") : c("outline") })} />
    </View>
  );
}

export type SwitchProps = PartBase & FieldProps & { label?: string; checked?: boolean; size?: "default" | "sm"; disabled?: boolean; error?: boolean; width?: number; onChange?: (on: boolean) => void };

export function Switch(props: SwitchProps) {
  const p = withDefaults<SwitchProps>("switch", props);
  const kit = useKit();
  const fill = useFill();
  const [on, setOn] = useValue(!!p.checked, p.onChange);
  return withField(
    p,
    <Surface
      base={{ ...ROW, columnGap: 12, alignSelf: "flex-start", ...fill }}
      appearance={p}
      role="switch"
      label={p.label || p.ariaLabel}
      testID={p.testID}
      onPress={
        p.disabled || p.readOnly
          ? undefined
          : () => {
              setOn(!on);
              p.onPress?.();
            }
      }
    >
      {p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "body-large"), color: c(p.error ? "error" : "on-surface"), flexShrink: 1, flexGrow: fill.width ? 1 : 0 }} /> : null}
      <SwitchTrack on={on} small={p.size === "sm"} disabled={!!p.disabled} />
    </Surface>,
  );
}

/** a check box's square (or circle) */
export function CheckMark({ on, mixed, error, disabled }: { on: boolean; mixed?: boolean; error?: boolean; disabled?: boolean }) {
  const kit = useKit();
  const round = recipeOf(kit, "check") === "round";
  const size = round ? 20 : 18;
  const tint = error ? c("error") : c("primary");
  return (
    <View
      style={sx({
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: round ? size / 2 : 2,
        border: on || mixed ? "none" : `${round ? 1.5 : 2}px solid ${error ? c("error") : round ? c("outline") : c("on-surface-variant")}`,
        backgroundColor: on || mixed ? tint : "transparent",
        opacity: disabled ? 0.38 : 1,
      })}
    >
      {mixed ? <Glyph name="remove" size={size - 4} color={error ? "on-error" : "on-primary"} /> : on ? <Glyph name="check" size={size - 4} color={error ? "on-error" : "on-primary"} /> : null}
    </View>
  );
}

export type CheckboxProps = PartBase & FieldProps & { label?: string; checked?: boolean; indeterminate?: boolean; error?: boolean; disabled?: boolean; onChange?: (on: boolean) => void };

export function Checkbox(props: CheckboxProps) {
  const p = withDefaults<CheckboxProps>("checkbox", props);
  const kit = useKit();
  const [on, setOn] = useValue(!!p.checked, p.onChange);
  return withField(
    p,
    <Surface
      base={{ ...ROW, columnGap: 12, alignSelf: "flex-start" }}
      appearance={p}
      role="checkbox"
      label={p.label || p.ariaLabel}
      testID={p.testID}
      onPress={
        p.disabled || p.readOnly
          ? undefined
          : () => {
              setOn(!on);
              p.onPress?.();
            }
      }
    >
      <CheckMark on={on} mixed={p.indeterminate} error={p.error} disabled={p.disabled} />
      {p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "body-large"), color: c(p.error ? "error" : "on-surface") }} /> : null}
    </Surface>,
  );
}

/** a radio button's ring */
export function RadioMark({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <View style={sx({ boxSizing: "border-box", width: 20, height: 20, borderRadius: 10, border: `2px solid ${on ? c("primary") : c("on-surface-variant")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: disabled ? 0.38 : 1 })}>
      {on ? <View style={sx({ width: 10, height: 10, borderRadius: 5, backgroundColor: c("primary") })} /> : null}
    </View>
  );
}

export type RadioProps = PartBase & FieldProps & { label?: string; checked?: boolean; disabled?: boolean; error?: boolean; onChange?: (on: boolean) => void };

export function Radio(props: RadioProps) {
  const p = withDefaults<RadioProps>("radio", props);
  const kit = useKit();
  const [on, setOn] = useValue(!!p.checked, p.onChange);
  return withField(
    p,
    <Surface
      base={{ ...ROW, columnGap: 12, alignSelf: "flex-start" }}
      appearance={p}
      role="radio"
      label={p.label || p.ariaLabel || "Option"}
      testID={p.testID}
      onPress={
        p.disabled || p.readOnly
          ? undefined
          : () => {
              setOn(true);
              p.onPress?.();
            }
      }
    >
      <RadioMark on={on} disabled={p.disabled} />
      {p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "body-large"), color: c(p.error ? "error" : "on-surface") }} /> : null}
    </Surface>,
  );
}

/* ---------- a slider ---------- */

export type SliderProps = PartBase & FieldProps & { label?: string; value?: number; range?: boolean; end?: number; disabled?: boolean; error?: boolean; width?: number; onChange?: (v: number) => void };

/** The platform's own slider, painted with the theme's colors: a mini-program draws its track and knob itself, so a
 *  range (two knobs) is one knob here and M3 Expressive's bar handle is the platform's round one. */
export function Slider(props: SliderProps) {
  const p = withDefaults<SliderProps>("slider", props);
  const kit = useKit();
  const fill = useFill();
  const [value, setValue] = useValue(clampInt(p.value ?? 40, 0, 100), p.onChange);
  const thin = recipeOf(kit, "slider") === "thin";
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(ROW, { columnGap: 12, width: Math.round(p.width ?? 280), flexShrink: 0 }, fill)}>
      {p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "label-large"), color: c(p.error ? "error" : "on-surface") }} /> : null}
      <TaroSlider
        style={sx({ flexGrow: 1, margin: "0 10px" })}
        min={0}
        max={100}
        value={value}
        disabled={!!p.disabled || !!p.readOnly}
        activeColor={kit.paint(p.disabled ? "on-surface/38" : "primary")}
        backgroundColor={kit.paint(thin ? "on-surface/12" : "secondary-container")}
        blockColor={thin ? "#FFFFFF" : kit.paint("primary")}
        blockSize={thin ? 28 : 20}
        onChanging={(e) => setValue(e.detail.value)}
        onChange={(e) => setValue(e.detail.value)}
      />
    </View>,
  );
}

/* ---------- inputs ---------- */

export type InputProps = PartBase & {
  placeholder?: string;
  value?: string;
  type?: string;
  variant?: "outlined" | "filled" | "plain";
  size?: "default" | "sm";
  error?: boolean;
  disabled?: boolean;
  width?: number;
  onChange?: (text: string) => void;
} & FieldProps;

/** the keyboard a field asks for: a mini-program has text, number, digit (a decimal point) and idcard */
export const keyboardOf = (type: string | undefined): "text" | "number" | "digit" | "idcard" => (type === "number" ? "digit" : type === "tel" ? "number" : "text");

const placeholderStyle = (kit: Kit) => `color: ${kit.paint("on-surface-variant")}`;

/** a one-line input in the style's field, or bare (`plain`) inside a box that is its field */
export function Input(props: InputProps) {
  const p = withDefaults<InputProps>("input", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useValue(p.value ?? "", p.onChange);
  const [focused, setFocused] = useState(false);
  const plain = p.variant === "plain";
  const { box, focus } = fieldStyle(kit, p.variant ?? "outlined");
  const h = plain ? 24 : p.size === "sm" ? 40 : 56;
  const frame = merge(
    { boxSizing: "border-box", height: h, display: "flex", alignItems: "center", paddingLeft: plain ? 0 : 16, paddingRight: plain ? 0 : 16, flexShrink: 0 },
    plain ? { flexGrow: 1, minWidth: 0 } : box,
    focused && !plain ? focus : null,
    p.error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null,
    p.disabled ? { opacity: 0.38 } : null,
    plain ? null : { width: Math.round(p.width ?? 280) },
    fill,
  );
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(frame)}>
      <TaroInput
        value={text}
        placeholder={p.placeholder}
        placeholderStyle={placeholderStyle(kit)}
        ariaLabel={p.ariaLabel || p.placeholder}
        password={p.type === "password"}
        type={keyboardOf(p.type)}
        disabled={!!p.disabled || !!p.readOnly}
        /* no limit of the platform's (140 by default): the form's rules say how long a field may be */
        maxlength={-1}
        onInput={(e) => setText(e.detail.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={sx(typeStyle(kit, "body-large"), BARE, { color: c("on-surface"), width: "100%", height: 24, minHeight: 24 })}
      />
    </View>,
  );
}

export type TextareaProps = PartBase & FieldProps & { placeholder?: string; value?: string; variant?: "outlined" | "filled" | "plain"; rows?: number; autoGrow?: boolean; error?: boolean; disabled?: boolean; width?: number; onChange?: (text: string) => void };

export function Textarea(props: TextareaProps) {
  const p = withDefaults<TextareaProps>("textarea", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useValue(p.value ?? "", p.onChange);
  const plain = p.variant === "plain";
  const { box } = fieldStyle(kit, p.variant ?? "outlined", true);
  const rows = Math.max(1, Math.round(p.rows ?? 3));
  const frame = merge(
    { boxSizing: "border-box", paddingTop: plain ? 0 : 12, paddingBottom: plain ? 0 : 12, paddingLeft: plain ? 0 : 16, paddingRight: plain ? 0 : 16, flexShrink: 0 },
    plain ? { flexGrow: 1, minWidth: 0 } : { ...box, width: Math.round(p.width ?? 280) },
    p.error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null,
    p.disabled ? { opacity: 0.38 } : null,
    fill,
  );
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(frame)}>
      <TaroTextarea
        value={text}
        placeholder={p.placeholder}
        placeholderStyle={placeholderStyle(kit)}
        ariaLabel={p.ariaLabel || p.placeholder}
        disabled={!!p.disabled || !!p.readOnly}
        autoHeight={!!p.autoGrow}
        maxlength={-1}
        onInput={(e) => setText(e.detail.value)}
        style={sx(typeStyle(kit, "body-large"), BARE, { color: c("on-surface"), width: "100%", minHeight: rows * 24, height: p.autoGrow ? undefined : rows * 24 })}
      />
    </View>,
  );
}

/* ---------- a label, a link, a rating ---------- */

export type LabelProps = PartBase & { text?: string; control?: "checkbox" | "switch" | "none"; disabled?: boolean };

/** words beside the control they name: a tap on the words is a tap on the control */
export function Label(props: LabelProps) {
  const p = withDefaults<LabelProps>("label", props);
  const kit = useKit();
  const [on, setOn] = useState(false);
  return (
    <Surface
      base={{ ...ROW, columnGap: 8, alignSelf: "flex-start", opacity: p.disabled ? 0.5 : 1 }}
      appearance={p}
      testID={p.testID}
      onPress={
        p.disabled || p.control === "none"
          ? p.onPress
          : () => {
              setOn((v) => !v);
              p.onPress?.();
            }
      }
    >
      {p.control === "checkbox" ? <CheckMark on={on} /> : p.control === "switch" ? <SwitchTrack on={on} small={false} disabled={false} /> : null}
      <Words text={p.text} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface") }} />
    </Surface>
  );
}

export type LinkProps = PartBase & { label?: string; href?: string };

const SAFE = /^https?:\/\//i;

/** Words that lead somewhere: a mini-program cannot open a web address outside a <WebView> with a domain its admin
 *  allowed, so the address is copied for the visitor to paste (H5 opens it). */
export function Link(props: LinkProps) {
  const p = withDefaults<LinkProps>("link", props);
  const kit = useKit();
  const href = p.href && SAFE.test(p.href) ? p.href : undefined;
  const open = () => {
    if (!href) return;
    if (process.env.TARO_ENV === "h5") window.open(href, "_blank", "noopener");
    else void Taro.setClipboardData({ data: href });
  };
  return (
    <Surface base={{ alignSelf: "flex-start" }} appearance={p} testID={p.testID} role="link" onPress={p.onPress ?? (href ? open : undefined)}>
      <Words text={p.label} style={{ ...typeStyle(kit, "label-large"), color: accentText(), textDecoration: "underline" }} />
    </Surface>
  );
}

export type RatingProps = PartBase & FieldProps & { value?: number; count?: number; readOnly?: boolean; disabled?: boolean; error?: boolean; onChange?: (value: number) => void };

/** A score that follows `value`: a press shows at once and is handed out (`onChange`, which the screen's runtime keeps
 *  for the form field or variable the stars fill), and whenever `value` itself changes the stars start over from it. */
export function Rating(props: RatingProps) {
  const p = withDefaults<RatingProps>("rating", props);
  const given = Math.round(p.value ?? 4);
  const [own, setOwn] = useState({ from: given, value: given });
  const value = own.from === given ? own.value : given;
  const setValue = (v: number) => {
    setOwn({ from: given, value: v });
    p.onChange?.(v);
  };
  const count = clampInt(p.count ?? 5, 1, 10);
  return withField(
    p,
    <View {...tagOf(p.testID)} ariaRole="radiogroup" ariaLabel={p.ariaLabel || "Rating"} style={sx(ROW, { columnGap: 8, alignSelf: "flex-start", opacity: p.disabled ? 0.38 : 1 })}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} onClick={p.readOnly || p.disabled ? undefined : () => setValue(i + 1)}>
          <Glyph name="star" size={22} filled color={i < value ? (p.error ? "error" : "st:primaryText") : "outline-variant"} />
        </View>
      ))}
    </View>,
  );
}
