import { useState } from "react";
import { Linking, PanResponder, Pressable, Text as RNText, TextInput, View, type LayoutChangeEvent, type TextStyle, type ViewStyle } from "react-native";

import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { colorOf, withAlpha } from "../look";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { dateOfValue, dayOf, timeOf, usePicker } from "../picker";
import { accentText, capsOf, extra, extraColor, fieldStyle } from "../recipes";
import { Surface } from "../Surface";
import { controlRadius, corner, pillRadius, recipeOf, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import type { TypeRole } from "../theme/types";
import type { PartBase } from "./basics";

/* The controls: buttons, a toggle, chips, a switch, a check box, a radio button, a slider, inputs, a label, a link and a
 * rating. Each holds its own state from the value the design gives it, as the web's do (`defaultChecked`), and the style
 * builds it with its recipe: iOS's switch, round check boxes, a thin slider, the grey fields. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/* ---------- buttons ---------- */

/** M3 Expressive's sizes (components/m3e/button.tsx): height, side padding, type role, icon size */
const SIZES: Record<string, { h: number; pad: number; type: TypeRole; icon: number; square: "md" | "lg" | "xl" }> = {
  xs: { h: 32, pad: 12, type: "label-large", icon: 20, square: "md" },
  sm: { h: 40, pad: 16, type: "label-large", icon: 20, square: "md" },
  md: { h: 56, pad: 24, type: "title-medium", icon: 24, square: "lg" },
  lg: { h: 96, pad: 48, type: "headline-small", icon: 32, square: "xl" },
  xl: { h: 136, pad: 64, type: "headline-large", icon: 40, square: "xl" },
};

/** a button's ground, edge and words for a variant, Material's and then the style's */
export function buttonColors(kit: Kit, variant: string, disabled = false): { box: ViewStyle; ink: string; weight?: TextStyle["fontWeight"] } {
  const recipe = recipeOf(kit, "button");
  let box: ViewStyle;
  let ink: string;
  switch (variant) {
    case "tonal":
      box = { backgroundColor: extraColor(kit, "tonalBg") ?? c(kit, "secondary-container") };
      ink = extraColor(kit, "tonalText") ?? c(kit, "on-secondary-container");
      break;
    case "elevated":
      box = { backgroundColor: extraColor(kit, "outlinedBg") ?? c(kit, "surface-container-low"), boxShadow: extraColor(kit, "outlinedBg") ? undefined : "0px 1px 2px 0px #0000004D, 0px 1px 3px 1px #00000026" };
      ink = extraColor(kit, "outlinedText") ?? c(kit, "primary");
      break;
    case "outlined": {
      const bg = extraColor(kit, "outlinedBg");
      box = bg ? { backgroundColor: bg } : { borderWidth: 1, borderColor: extraColor(kit, "outlinedBorder") ?? c(kit, "outline-variant") };
      ink = extraColor(kit, "outlinedText") ?? c(kit, "on-surface-variant");
      break;
    }
    case "text":
      box = {};
      ink = extraColor(kit, "textButtonText") ?? accentText(kit);
      break;
    case "ghost":
      box = {};
      ink = c(kit, "on-surface-variant");
      break;
    default:
      box = { backgroundColor: c(kit, "primary") };
      ink = c(kit, "on-primary");
  }
  /* a style that draws its buttons as words (the dark fantasies) keeps the words and drops the ground */
  if (recipe === "text" && variant !== "text" && variant !== "ghost") {
    box = {};
    ink = variant === "filled" || variant === undefined ? accentText(kit) : ink;
  }
  if (recipe === "flat") box = { ...box, boxShadow: undefined };
  if (recipe === "hard" && box.backgroundColor) box = { ...box, borderWidth: kit.theme.edge, borderColor: c(kit, "outline"), boxShadow: `3px 3px 0px 0px ${c(kit, "outline")}` };
  if (recipe === "glow" && variant === "filled") box = { ...box, boxShadow: `0px 0px 14px 0px ${withAlpha(c(kit, "primary"), 0.6)}` };
  if (disabled) {
    box = { ...box, backgroundColor: box.backgroundColor ? withAlpha(c(kit, "on-surface"), 0.1) : undefined, borderColor: box.borderColor ? withAlpha(c(kit, "on-surface"), 0.12) : undefined, boxShadow: undefined };
    ink = withAlpha(c(kit, "on-surface"), 0.38);
  }
  const w = extra(kit, "filledWeight");
  return { box, ink, weight: variant === "filled" && typeof w === "number" ? (String(w) as TextStyle["fontWeight"]) : undefined };
}

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
};

/** A button: M3 Expressive's sizes and variants under the style's corners and recipe. As a toggle it holds its state. */
export function Button(props: ButtonProps) {
  const p = withDefaults<ButtonProps>("button", props);
  const kit = useKit();
  const fill = useFill();
  const [on, setOn] = useState(false);
  const size = SIZES[p.size ?? "sm"] ?? SIZES.sm;
  const lit = p.toggle && on;
  const variant = lit && p.onLook && p.onLook !== "same" ? p.onLook : (p.variant ?? "filled");
  const look = buttonColors(kit, variant, !!p.disabled);
  const label = lit && p.onLabel ? p.onLabel : p.label;
  const icon = lit && p.onIcon ? p.onIcon : p.icon;
  const iconOnly = !label && !!icon;
  const radius = p.shape === "square" ? corner(kit, size.square) : controlRadius(kit, size.h);
  const base: ViewStyle = {
    height: size.h,
    minWidth: iconOnly ? size.h : undefined,
    paddingHorizontal: iconOnly ? 0 : size.pad,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
    borderRadius: radius,
    ...look.box,
    ...(!iconOnly && p.width !== 96 && p.width !== undefined ? { width: Math.round(p.width) } : null),
    ...(iconOnly ? { width: p.iconWidth === "narrow" ? Math.round(size.h * 0.8) : p.iconWidth === "wide" ? Math.round(size.h * 1.3) : size.h } : null),
    ...fill,
  };
  const press = p.disabled ? undefined : () => {
    if (p.toggle) setOn((v) => !v);
    p.onPress?.();
  };
  return (
    <Surface base={base} appearance={p} onPress={press ?? (() => {})} testID={p.testID} accessibilityLabel={label || icon}>
      {icon ? <Glyph name={icon} size={size.icon} filled={!!lit} color={look.ink} /> : null}
      {label ? <RNText numberOfLines={1} style={{ ...typeStyle(kit, size.type), color: look.ink, ...(look.weight ? { fontWeight: look.weight } : null), ...capsOf(kit) }}>{label}</RNText> : null}
      {label && p.trailingIcon ? <Glyph name={p.trailingIcon} size={size.icon} color={look.ink} /> : null}
    </Surface>
  );
}

const ICON_SIZES: Record<string, { side: number; icon: number }> = { xs: { side: 32, icon: 20 }, sm: { side: 40, icon: 24 }, default: { side: 40, icon: 24 }, md: { side: 56, icon: 24 }, lg: { side: 96, icon: 32 }, xl: { side: 136, icon: 40 } };

export type IconButtonProps = PartBase & { icon?: string; label?: string; variant?: "filled" | "tonal" | "elevated" | "outlined" | "text" | "ghost"; size?: string; disabled?: boolean; iconFill?: boolean };

export function IconButton(props: IconButtonProps) {
  const p = withDefaults<IconButtonProps>("icon-button", props);
  const kit = useKit();
  const s = ICON_SIZES[p.size ?? "default"] ?? ICON_SIZES.default;
  const variant = p.variant ?? "text";
  const look = buttonColors(kit, variant, !!p.disabled);
  /* a plain icon button's glyph reads in the words' color, not the accent */
  const ink = variant === "ghost" && !p.disabled ? c(kit, "on-surface-variant") : look.ink;
  return (
    <Surface
      base={{ width: s.side, height: s.side, borderRadius: pillRadius(kit, s.side), alignItems: "center", justifyContent: "center", ...look.box }}
      appearance={p}
      onPress={p.disabled ? undefined : (p.onPress ?? (() => {}))}
      testID={p.testID}
      accessibilityLabel={p.label}
    >
      {p.icon ? <Glyph name={p.icon} size={s.icon} filled={!!p.iconFill} color={ink} /> : null}
    </Surface>
  );
}

const TOGGLE_SIZES: Record<string, number> = { xs: 32, sm: 36, default: 40, md: 48, lg: 56 };

export type ToggleProps = PartBase & { icon?: string; label?: string; variant?: string; size?: string; shape?: "round" | "square"; pressed?: boolean; disabled?: boolean };

/** a button that stays pressed: tonal while on, its icon filled */
export function Toggle(props: ToggleProps) {
  const p = withDefaults<ToggleProps>("toggle", props);
  const kit = useKit();
  const [on, setOn] = useState(!!p.pressed);
  const h = TOGGLE_SIZES[p.size ?? "default"] ?? 40;
  const ground = on ? { backgroundColor: c(kit, p.variant === "filled" ? "primary" : "secondary-container") } : p.variant === "outline" ? { borderWidth: 1, borderColor: c(kit, "outline-variant") } : p.variant === "tonal" || p.variant === "filled" ? { backgroundColor: c(kit, "surface-container") } : {};
  const ink = on ? c(kit, p.variant === "filled" ? "on-primary" : "on-secondary-container") : c(kit, "on-surface-variant");
  return (
    <Surface
      base={{ height: h, minWidth: h, paddingHorizontal: p.label ? 12 : 0, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 8, borderRadius: p.shape === "square" ? corner(kit, "md") : pillRadius(kit, h), ...ground }}
      appearance={p}
      onPress={p.disabled ? undefined : () => {
        setOn((v) => !v);
        p.onPress?.();
      }}
      testID={p.testID}
      accessibilityLabel={p.label || p.icon}
    >
      {p.icon ? <Glyph name={p.icon} size={24} filled={on} color={ink} /> : null}
      {p.label ? <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{p.label}</RNText> : null}
    </Surface>
  );
}

/* ---------- chips ---------- */

const CHIP_H: Record<string, number> = { default: 32, md: 40, lg: 48 };

export type ChipProps = PartBase & { items?: ListRow[]; kind?: "assist" | "filter" | "input"; selected?: number; variant?: "flat" | "elevated"; size?: string };

/** a row of chips: assist, filter (one chosen) or input (each with a close) */
export function Chip(props: ChipProps) {
  const p = withDefaults<ChipProps>("chip", props);
  const kit = useKit();
  const [chosen, setChosen] = useState(Math.round(p.selected ?? 0));
  const h = CHIP_H[p.size ?? "default"] ?? 32;
  const recipe = recipeOf(kit, "chip");
  const radius = recipe === "pill" ? h / 2 : recipe === "tag" ? corner(kit, "xs") : Math.min(corner(kit, "sm"), controlRadius(kit, h));
  const items = p.items ?? [];
  return (
    <View testID={p.testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {items.map((it, i) => {
        const on = p.kind === "filter" && i === chosen;
        const bg = extraColor(kit, "chipBg");
        const ground: ViewStyle = on
          ? { backgroundColor: extraColor(kit, "chipOn") ?? c(kit, "secondary-container") }
          : p.variant === "elevated"
            ? { backgroundColor: c(kit, "surface-container-low"), boxShadow: "0px 1px 2px 0px #0000004D, 0px 1px 3px 1px #00000026" }
            : bg
              ? { backgroundColor: bg }
              : { borderWidth: 1, borderColor: c(kit, "outline-variant") };
        const ink = on ? (extraColor(kit, "chipOnText") ?? c(kit, "on-secondary-container")) : c(kit, p.kind === "assist" ? "on-surface" : "on-surface-variant");
        return (
          <Surface
            key={i}
            base={{ height: h, paddingLeft: on || it.icon ? 8 : 16, paddingRight: p.kind === "input" ? 8 : 16, flexDirection: "row", alignItems: "center", columnGap: 8, borderRadius: radius, ...ground }}
            appearance={p}
            onPress={() => {
              if (p.kind === "filter") setChosen(i);
              (p.taps?.[`tab:${i}`] ?? p.onPress)?.();
            }}
            accessibilityLabel={it.label}
          >
            {on ? <Glyph name="check" size={18} color={ink} /> : it.icon ? <Glyph name={it.icon} size={18} color={c(kit, "primary")} /> : null}
            <RNText style={{ ...typeStyle(kit, "label-large"), color: ink }}>{it.label}</RNText>
            {p.kind === "input" ? <Glyph name="close" size={18} color={ink} /> : null}
          </Surface>
        );
      })}
    </View>
  );
}

/* ---------- a switch, a check box, a radio button ---------- */

/** the switch of the style: Material's, iOS's, a block or a Windows one */
function SwitchTrack({ on, small, disabled }: { on: boolean; small: boolean; disabled: boolean }) {
  const kit = useKit();
  const recipe = recipeOf(kit, "toggle");
  const onColor = kit.st.toggleOn ?? c(kit, "primary");
  if (recipe === "ios" || recipe === "chunky") {
    const w = small ? 40 : 51;
    const h = small ? 24 : 31;
    const knob = h - 4;
    return (
      <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: on ? onColor : withAlpha(c(kit, "on-surface"), kit.dark ? 0.24 : 0.12), padding: 2, alignItems: on ? "flex-end" : "flex-start", opacity: disabled ? 0.4 : 1 }}>
        <View style={{ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: "#FFFFFF", boxShadow: "0px 2px 6px 0px #00000026, 0px 0px 1px 0px #0000001A" }} />
      </View>
    );
  }
  if (recipe === "outline") {
    const w = 40;
    const h = 20;
    return (
      <View style={{ width: w, height: h, borderRadius: h / 2, borderWidth: on ? 0 : 1, borderColor: c(kit, "on-surface-variant"), backgroundColor: on ? onColor : "transparent", paddingHorizontal: 3, justifyContent: "center", alignItems: on ? "flex-end" : "flex-start", opacity: disabled ? 0.4 : 1 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: on ? c(kit, "on-primary") : c(kit, "on-surface-variant") }} />
      </View>
    );
  }
  if (recipe === "block") {
    return (
      <View style={{ width: 48, height: 24, borderWidth: 2, borderColor: c(kit, "outline"), backgroundColor: on ? onColor : c(kit, "surface-container-high"), padding: 2, alignItems: on ? "flex-end" : "flex-start", opacity: disabled ? 0.4 : 1 }}>
        <View style={{ width: 16, height: 16, backgroundColor: on ? c(kit, "on-primary") : c(kit, "outline") }} />
      </View>
    );
  }
  const w = small ? 40 : 52;
  const h = small ? 24 : 32;
  const knob = on ? h - 8 : h / 2;
  return (
    <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: on ? onColor : c(kit, "surface-container-highest"), borderWidth: on ? 0 : 2, borderColor: c(kit, "outline"), justifyContent: "center", alignItems: on ? "flex-end" : "flex-start", paddingHorizontal: on ? 4 : (h - 4 - knob) / 2, opacity: disabled ? 0.38 : 1 }}>
      <View style={{ width: knob, height: knob, borderRadius: knob / 2, backgroundColor: on ? c(kit, "on-primary") : c(kit, "outline") }} />
    </View>
  );
}

/** a control that holds its own state from the design's value, or, given `onValueChange`, shows the value it is given
 *  (a form's field or a variable holds it) and says what was chosen */
function useHeld<T>(design: T, given: T, controlled: boolean, onValueChange: ((v: T) => void) | undefined): [T, (v: T) => void] {
  const [own, setOwn] = useState(design);
  const value = controlled ? given : own;
  return [
    value,
    (v: T) => {
      setOwn(v);
      onValueChange?.(v);
    },
  ];
}

export type SwitchProps = PartBase & { label?: string; checked?: boolean; size?: "default" | "sm"; disabled?: boolean; width?: number; onValueChange?: (on: boolean) => void };

export function Switch(props: SwitchProps) {
  const p = withDefaults<SwitchProps>("switch", props);
  const kit = useKit();
  const fill = useFill();
  const [on, set] = useHeld(!!p.checked, !!p.checked, !!p.onValueChange, p.onValueChange);
  const setOn = (fn: (v: boolean) => boolean) => set(fn(on));
  const track = <SwitchTrack on={on} small={p.size === "sm"} disabled={!!p.disabled} />;
  return (
    <Pressable
      testID={p.testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!p.disabled }}
      accessibilityLabel={p.label}
      disabled={p.disabled}
      onPress={() => {
        setOn((v) => !v);
        p.onPress?.();
      }}
      style={[{ flexDirection: "row", alignItems: "center", columnGap: 12, alignSelf: "flex-start" }, fill]}
    >
      {p.label ? <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface"), flexShrink: 1 }}>{p.label}</RNText> : null}
      {track}
    </Pressable>
  );
}

/** a check box's square (or circle) */
function CheckMark({ on, mixed, error, disabled }: { on: boolean; mixed?: boolean; error?: boolean; disabled?: boolean }) {
  const kit = useKit();
  const round = recipeOf(kit, "check") === "round";
  const size = round ? 20 : 18;
  const tint = error ? c(kit, "error") : c(kit, "primary");
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: round ? size / 2 : 2,
        borderWidth: on || mixed ? 0 : round ? 1.5 : 2,
        borderColor: error ? c(kit, "error") : round ? c(kit, "outline") : c(kit, "on-surface-variant"),
        backgroundColor: on || mixed ? tint : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {mixed ? <Glyph name="remove" size={size - 4} color={c(kit, error ? "on-error" : "on-primary")} /> : on ? <Glyph name="check" size={size - 4} color={c(kit, error ? "on-error" : "on-primary")} /> : null}
    </View>
  );
}

export type CheckboxProps = PartBase & { label?: string; checked?: boolean; indeterminate?: boolean; error?: boolean; disabled?: boolean; onValueChange?: (on: boolean) => void };

export function Checkbox(props: CheckboxProps) {
  const p = withDefaults<CheckboxProps>("checkbox", props);
  const kit = useKit();
  const [on, set] = useHeld(!!p.checked, !!p.checked, !!p.onValueChange, p.onValueChange);
  const setOn = (fn: (v: boolean) => boolean) => set(fn(on));
  return (
    <Pressable testID={p.testID} accessibilityRole="checkbox" accessibilityState={{ checked: p.indeterminate ? "mixed" : on, disabled: !!p.disabled }} accessibilityLabel={p.label} disabled={p.disabled} onPress={() => {
        setOn((v) => !v);
        p.onPress?.();
      }} style={{ flexDirection: "row", alignItems: "center", columnGap: 12, alignSelf: "flex-start" }}>
      <CheckMark on={on} mixed={p.indeterminate} error={p.error} disabled={p.disabled} />
      {p.label ? <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, p.error ? "error" : "on-surface") }}>{p.label}</RNText> : null}
    </Pressable>
  );
}

/** a radio button's ring */
export function RadioMark({ on, disabled }: { on: boolean; disabled?: boolean }) {
  const kit = useKit();
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? c(kit, "primary") : c(kit, "on-surface-variant"), alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1 }}>
      {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c(kit, "primary") }} /> : null}
    </View>
  );
}

export type RadioProps = PartBase & { label?: string; checked?: boolean; disabled?: boolean };

export function Radio(props: RadioProps) {
  const p = withDefaults<RadioProps>("radio", props);
  const kit = useKit();
  const [on, setOn] = useState(!!p.checked);
  return (
    <Pressable testID={p.testID} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !!p.disabled }} accessibilityLabel={p.label || "Option"} disabled={p.disabled} onPress={() => {
        setOn(true);
        p.onPress?.();
      }} style={{ flexDirection: "row", alignItems: "center", columnGap: 12, alignSelf: "flex-start" }}>
      <RadioMark on={on} disabled={p.disabled} />
      {p.label ? <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{p.label}</RNText> : null}
    </Pressable>
  );
}

/* ---------- a slider ---------- */

export type SliderProps = PartBase & { label?: string; value?: number; range?: boolean; end?: number; disabled?: boolean; width?: number; onValueChange?: (value: number) => void };

/** a slider the finger drags: M3 Expressive's thick track and bar handle, or the style's thin track and round knob */
export function Slider(props: SliderProps) {
  const p = withDefaults<SliderProps>("slider", props);
  const kit = useKit();
  const fill = useFill();
  const [value, setValue] = useHeld(clampInt(p.value ?? 40, 0, 100), clampInt(p.value ?? 40, 0, 100), !!p.onValueChange, p.onValueChange);
  const [w, setW] = useState(Math.max(40, Math.round(p.width ?? 280) - (p.label ? 80 : 0)));
  const thin = recipeOf(kit, "slider") === "thin";
  const at = (x: number) => clampInt((x / Math.max(1, w)) * 100, 0, 100);
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => !p.disabled,
    onMoveShouldSetPanResponder: () => !p.disabled,
    onPanResponderGrant: (e) => setValue(at(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => setValue(at(e.nativeEvent.locationX)),
  });
  const end = p.range ? clampInt(p.end ?? 70, value, 100) : undefined;
  const from = p.range ? value : 0;
  const to = end ?? value;
  const active = p.disabled ? withAlpha(c(kit, "on-surface"), 0.38) : c(kit, "primary");
  const rest = thin ? withAlpha(c(kit, "on-surface"), 0.12) : c(kit, "secondary-container");
  const trackH = thin ? 4 : 16;
  const knob = (pos: number) =>
    thin ? (
      <View style={{ position: "absolute", left: (pos / 100) * w - 14, top: 22 - 14, width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFFFFF", boxShadow: "0px 2px 6px 0px #00000033, 0px 0px 1px 0px #0000004D" }} />
    ) : (
      <View style={{ position: "absolute", left: (pos / 100) * w - 2, top: 0, width: 4, height: 44, borderRadius: 2, backgroundColor: active }} />
    );
  const track = (
    <View testID={p.testID ? `${p.testID}-track` : undefined} accessible accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: 100, now: value }} onLayout={(e: LayoutChangeEvent) => setW(Math.max(1, e.nativeEvent.layout.width))} style={{ height: 44, justifyContent: "center", flexGrow: p.label ? 1 : 0, width: p.label ? undefined : w }} {...pan.panHandlers}>
      <View style={{ height: trackH, borderRadius: trackH / 2, backgroundColor: rest, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: (from / 100) * w, width: ((to - from) / 100) * w - (thin ? 0 : 6), top: 0, bottom: 0, backgroundColor: active, borderRadius: trackH / 2 }} />
      </View>
      {p.range ? knob(from) : null}
      {knob(to)}
    </View>
  );
  return (
    <View testID={p.testID} style={[{ flexDirection: "row", alignItems: "center", columnGap: 12, width: Math.round(p.width ?? 280) }, fill]}>
      {p.label ? <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface") }}>{p.label}</RNText> : null}
      {track}
    </View>
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
  /** told of what is typed; given, `value` is what the input shows (a form's field holds it) */
  onChangeText?: (text: string) => void;
};

const KEYBOARD: Record<string, "default" | "email-address" | "numeric" | "phone-pad" | "url" | "web-search"> = { email: "email-address", number: "numeric", tel: "phone-pad", url: "url", search: "web-search" };

/** the inputs that take a day or a time: the platform's own picker opens on them */
const PICKED: Record<string, "date" | "time" | "datetime"> = { date: "date", time: "time", datetime: "datetime", "datetime-local": "datetime" };

/** an input of a day or a time: a field that opens the platform's picker, and holds what it picked as a form sends it */
function PickedInput({ p, kind, style, text, setText }: { p: InputProps; kind: "date" | "time" | "datetime"; style: TextStyle; text: string; setText: (v: string) => void }) {
  const kit = useKit();
  const value = dateOfValue(text, kind);
  const picker = usePicker(kind === "time" ? "time" : "date", value, (d) => setText(kind === "date" ? dayOf(d) : kind === "time" ? timeOf(d) : d.toISOString()));
  const shown = !text ? "" : kind === "datetime" ? `${dayOf(value)} ${timeOf(value)}` : text;
  return (
    <>
      <Pressable testID={p.testID} accessibilityRole="button" accessibilityLabel={p.placeholder} disabled={p.disabled} onPress={picker.show} style={{ ...(style as ViewStyle), flexDirection: "row", alignItems: "center", columnGap: 8 }}>
        <RNText numberOfLines={1} style={{ flex: 1, ...typeStyle(kit, "body-large"), color: shown ? c(kit, "on-surface") : c(kit, "on-surface-variant") }}>
          {shown || p.placeholder}
        </RNText>
        <Glyph name={kind === "time" ? "schedule" : "calendar_today"} size={20} color={c(kit, "on-surface-variant")} />
      </Pressable>
      {picker.sheet}
    </>
  );
}

/** a one-line input in the style's field, or bare (`plain`) inside a box that is its field */
export function Input(props: InputProps) {
  const p = withDefaults<InputProps>("input", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useHeld(p.value ?? "", p.value ?? "", !!p.onChangeText, p.onChangeText);
  const [focused, setFocused] = useState(false);
  const plain = p.variant === "plain";
  const { box, focus } = fieldStyle(kit, p.variant ?? "outlined");
  const h = plain ? 24 : p.size === "sm" ? 40 : 56;
  const style: TextStyle = {
    ...typeStyle(kit, plain ? "body-large" : "body-large"),
    color: c(kit, "on-surface"),
    height: h,
    paddingHorizontal: plain ? 0 : 16,
    paddingVertical: 0,
    ...(plain ? {} : (box as TextStyle)),
    ...(focused && !plain ? (focus as TextStyle) : null),
    ...(p.error ? { borderColor: c(kit, "error"), borderBottomColor: c(kit, "error") } : null),
    ...(p.disabled ? { opacity: 0.38 } : null),
    ...(plain ? { flexGrow: 1, minWidth: 0 } : { width: Math.round(p.width ?? 280) }),
    ...(fill as TextStyle),
  };
  const picked = PICKED[p.type ?? ""];
  if (picked) return <PickedInput p={p} kind={picked} style={style} text={text} setText={setText} />;
  return (
    <TextInput
      testID={p.testID}
      accessibilityLabel={p.placeholder}
      value={text}
      onChangeText={setText}
      placeholder={p.placeholder}
      placeholderTextColor={c(kit, "on-surface-variant")}
      editable={!p.disabled}
      secureTextEntry={p.type === "password"}
      keyboardType={KEYBOARD[p.type ?? "text"] ?? "default"}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={style}
    />
  );
}

export type TextareaProps = PartBase & { placeholder?: string; value?: string; variant?: "outlined" | "filled" | "plain"; rows?: number; autoGrow?: boolean; error?: boolean; disabled?: boolean; width?: number; onChangeText?: (text: string) => void };

export function Textarea(props: TextareaProps) {
  const p = withDefaults<TextareaProps>("textarea", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useHeld(p.value ?? "", p.value ?? "", !!p.onChangeText, p.onChangeText);
  const plain = p.variant === "plain";
  const { box } = fieldStyle(kit, p.variant ?? "outlined", true);
  const rows = Math.max(1, Math.round(p.rows ?? 3));
  const style: TextStyle = {
    ...typeStyle(kit, "body-large"),
    color: c(kit, "on-surface"),
    minHeight: rows * 24 + (plain ? 0 : 24),
    paddingVertical: plain ? 0 : 12,
    paddingHorizontal: plain ? 0 : 16,
    textAlignVertical: "top",
    ...(plain ? { flexGrow: 1, minWidth: 0 } : { ...(box as TextStyle), width: Math.round(p.width ?? 280) }),
    ...(p.error ? { borderColor: c(kit, "error") } : null),
    ...(p.disabled ? { opacity: 0.38 } : null),
    ...(fill as TextStyle),
  };
  return <TextInput testID={p.testID} accessibilityLabel={p.placeholder} multiline value={text} onChangeText={setText} placeholder={p.placeholder} placeholderTextColor={c(kit, "on-surface-variant")} editable={!p.disabled} style={style} />;
}

/* ---------- a label, a link, a rating ---------- */

export type LabelProps = PartBase & { text?: string; control?: "checkbox" | "switch" | "none"; disabled?: boolean };

/** words beside the control they name: a tap on the words is a tap on the control */
export function Label(props: LabelProps) {
  const p = withDefaults<LabelProps>("label", props);
  const kit = useKit();
  const [on, setOn] = useState(false);
  return (
    <Pressable testID={p.testID} disabled={p.disabled || p.control === "none"} onPress={() => {
        setOn((v) => !v);
        p.onPress?.();
      }} style={{ flexDirection: "row", alignItems: "center", columnGap: 8, alignSelf: "flex-start", opacity: p.disabled ? 0.5 : 1 }}>
      {p.control === "checkbox" ? <CheckMark on={on} /> : p.control === "switch" ? <SwitchTrack on={on} small={false} disabled={false} /> : null}
      <RNText style={{ ...typeStyle(kit, "body-large"), color: c(kit, "on-surface") }}>{p.text}</RNText>
    </Pressable>
  );
}

export type LinkProps = PartBase & { label?: string; href?: string };

const SAFE = /^https?:\/\//i;

export function Link(props: LinkProps) {
  const p = withDefaults<LinkProps>("link", props);
  const kit = useKit();
  const href = p.href && SAFE.test(p.href) ? p.href : undefined;
  return (
    <RNText testID={p.testID} accessibilityRole="link" onPress={p.onPress ?? (href ? () => void Linking.openURL(href) : undefined)} style={{ ...typeStyle(kit, "label-large"), color: accentText(kit), textDecorationLine: "underline", alignSelf: "flex-start" }}>
      {p.label}
    </RNText>
  );
}

export type RatingProps = PartBase & { value?: number; count?: number; readOnly?: boolean; onValueChange?: (value: number) => void };

/** A score that follows `value`: a press shows at once and is handed out (`onValueChange`, which the app writes to the
 *  variable the stars are bound to), and whenever `value` itself changes the stars start over from it. */
export function Rating(props: RatingProps) {
  const p = withDefaults<RatingProps>("rating", props);
  const kit = useKit();
  const given = Math.round(p.value ?? 4);
  const [own, setOwn] = useState({ from: given, value: given });
  const value = own.from === given ? own.value : given;
  const setValue = (v: number) => {
    setOwn({ from: given, value: v });
    p.onValueChange?.(v);
  };
  const count = clampInt(p.count ?? 5, 1, 10);
  return (
    <View testID={p.testID} accessible accessibilityRole="adjustable" accessibilityValue={{ min: 0, max: count, now: value }} style={{ flexDirection: "row", columnGap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable key={i} disabled={p.readOnly} onPress={() => setValue(i + 1)} accessibilityLabel={`${i + 1}`}>
          <Glyph name="star" size={22} filled color={i < value ? c(kit, "primary") : c(kit, "outline-variant")} />
        </Pressable>
      ))}
    </View>
  );
}

/** a color the document names, for a part that takes one by value */
export const named = (kit: Kit, ref: string | undefined) => colorOf(kit, ref);
