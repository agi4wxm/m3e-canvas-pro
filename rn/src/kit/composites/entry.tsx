import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanResponder, Pressable, Text as RNText, TextInput, View, type GestureResponderEvent, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { PartBase } from "../atoms/basics";
import { Button, Checkbox, Input, Switch, Textarea } from "../atoms/controls";
import { starred, withField, type FieldProps } from "../field";
import { Glyph } from "../icons/Icon";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { fieldStyle } from "../recipes";
import { Surface } from "../Surface";
import { corner, typeStyle, useKit, type Kit } from "../theme/ThemeProvider";
import { tapOf } from "./bars";
import { heldBy, useEntry } from "./pickers";

/* What a person enters beyond a plain field: a code in boxes, a field with its label and its words, a form of fields, a
 * line to copy, a quantity, tags, a phone number, a number pad, a signature and words with a toolbar. Each input's
 * value is a prop handed out on every change (docs/组件规范.md "受控值和草稿"); whether it went through (a code sent,
 * a signature taken) is the other side's to say, and shows only as it is given. Events the exported apps do not run
 * yet (`submit`, `add`, `remove`) are callbacks of their own. */

const c = (kit: Kit, role: string) => kit.colors[role] ?? "#000000";

/** what a part that holds others draws after its own: the parts put in it, as a placeholder lays them out */
const held = (children: ReactNode) => (children ? <View>{children}</View> : null);

/* ---------- a code in boxes ---------- */

export type InputOtpProps = PartBase &
  FieldProps & {
    length?: number;
    /** how many boxes a group has, 0 for one group */
    group?: number;
    value?: string;
    error?: boolean;
    disabled?: boolean;
    /** told of the code as it is typed */
    onChangeText?: (code: string) => void;
  };

/** A code a box for each character, in groups with a dash between: what is typed fills the boxes, the next to fill
 *  ringed. The platform's keyboard types into one field over the boxes, so a code the phone offers fills them all. */
export function InputOtp(props: InputOtpProps) {
  const p = withDefaults<InputOtpProps>("input-otp", props);
  const kit = useKit();
  const length = clampInt(p.length ?? 6, 1, 12);
  const size = clampInt(p.group ?? 3, 0, 12) || length;
  const [given, setCode] = useEntry(String(p.value ?? ""), p.onChangeText);
  const code = given.slice(0, length);
  const [focused, setFocused] = useState(false);
  const groups: number[][] = [];
  for (let from = 0; from < length; from += size) groups.push(Array.from({ length: Math.min(size, length - from) }, (_, i) => from + i));
  return withField(
    p,
    <View testID={p.testID} style={{ flexDirection: "row", alignItems: "center", columnGap: 8, alignSelf: "flex-start", opacity: p.disabled ? 0.38 : 1 }}>
      {groups.map((g, k) => (
        <View key={k} style={{ flexDirection: "row", alignItems: "center", columnGap: 8 }}>
          {k > 0 ? <Glyph name="remove" size={16} color={c(kit, "on-surface-variant")} /> : null}
          {g.map((i) => {
            const active = focused && i === Math.min(code.length, length - 1);
            return (
              <View key={i} style={{ width: 48, height: 56, borderRadius: corner(kit, "md"), borderWidth: active ? 2 : 1, borderColor: c(kit, p.error ? "error" : active ? "primary" : "outline"), alignItems: "center", justifyContent: "center" }}>
                <RNText style={{ ...typeStyle(kit, "headline-small"), color: c(kit, "on-surface") }}>{code[i] ?? ""}</RNText>
              </View>
            );
          })}
        </View>
      ))}
      <TextInput
        accessibilityLabel={starred(p.ariaLabel || "Verification code", p.required)}
        value={code}
        maxLength={length}
        editable={!heldBy(p)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        onChangeText={(t) => setCode(t.replace(/\s/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: 0.01, color: "transparent" }}
      />
    </View>,
  );
}

/* ---------- a field ---------- */

export type FieldPartProps = PartBase & {
  label?: string;
  control?: "input" | "textarea" | "checkbox" | "switch";
  placeholder?: string;
  /** the words under it saying what it is for */
  helperText?: string;
  /** its error's message: saying one puts it in error */
  errorText?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  loading?: boolean;
  width?: number;
  /** what its input holds, and what is typed into it */
  value?: string;
  onChangeText?: (text: string) => void;
  /** whether its check box or switch is on, and what it is turned to */
  checked?: boolean;
  onValueChange?: (on: boolean) => void;
  children?: ReactNode;
};

/** A field as forms lay one out: its label (a star after it while required), its control, the words under it saying
 *  what it is for, and its error's message in their place. A check box or a switch stands before its words. */
export function Field(props: FieldPartProps) {
  const p = withDefaults<FieldPartProps>("field", props);
  const kit = useKit();
  const fill = useFill();
  const width = Math.round(p.width ?? 320);
  const invalid = !!p.errorText;
  const side = p.control === "checkbox" || p.control === "switch";
  const label = p.label ? <RNText style={{ ...typeStyle(kit, "title-small"), color: c(kit, "on-surface") }}>{starred(p.label, p.required)}</RNText> : null;
  const words = (
    <>
      {p.helperText ? <RNText style={{ ...typeStyle(kit, "body-small"), color: c(kit, "on-surface-variant") }}>{p.helperText}</RNText> : null}
      {invalid ? <RNText accessibilityRole="alert" style={{ ...typeStyle(kit, "body-small"), color: c(kit, "error") }}>{p.errorText}</RNText> : null}
    </>
  );
  const shared = { disabled: p.disabled, readOnly: p.readOnly, error: invalid };
  const control =
    p.control === "checkbox" ? (
      <Checkbox {...shared} label="" ariaLabel={p.label} checked={p.checked ?? false} onValueChange={p.onValueChange} />
    ) : p.control === "switch" ? (
      <Switch {...shared} label="" ariaLabel={p.label} checked={p.checked ?? false} onValueChange={p.onValueChange} />
    ) : p.control === "textarea" ? (
      <Textarea {...shared} ariaLabel={p.label} placeholder={p.placeholder} value={p.value} onChangeText={p.onChangeText} width={width} />
    ) : (
      <Input {...shared} ariaLabel={p.label} placeholder={p.placeholder} value={p.value} onChangeText={p.onChangeText} width={width} />
    );
  return withField(
    { loading: p.loading },
    <Surface base={{ width, rowGap: 8, opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      {side ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", columnGap: 12 }}>
          {control}
          <View style={{ flex: 1, rowGap: 4 }}>
            {label}
            {words}
          </View>
        </View>
      ) : (
        <>
          {label}
          {control}
          {words}
        </>
      )}
      {held(p.children)}
    </Surface>,
  );
}

/* ---------- a form ---------- */

export type FormProps = PartBase & { fields?: ListRow[]; submit?: string; width?: number; children?: ReactNode };

/** A form as the editor draws one: each field its label over an input, and the button that sends it (a tap on the form,
 *  as the design gives it). What it holds of its own goes after. */
export function Form(props: FormProps) {
  const p = withDefaults<FormProps>("form", props);
  const kit = useKit();
  const fill = useFill();
  const width = Math.round(p.width ?? 360);
  return (
    <Surface base={{ width, rowGap: 12 }} style={fill} appearance={p} testID={p.testID}>
      {(p.fields ?? []).map((f, i) => (
        <View key={i} style={{ rowGap: 4 }}>
          <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface") }}>{f.label}</RNText>
          <Input ariaLabel={f.label} placeholder="" width={width} />
        </View>
      ))}
      {p.submit ? <Button label={p.submit} size="sm" onPress={tapOf(p, "submit")} /> : null}
      {held(p.children)}
    </Surface>
  );
}

/* ---------- a line to copy ---------- */

export type CopyRowProps = PartBase & {
  text?: string;
  width?: number;
  /** Copies the words: the app's clipboard (its `clipboard.write` capability), which the kit does not reach by itself.
   *  What it returns says whether it did (`copiedBy`): nothing or true (done), false or an outcome that is not ok (not
   *  copied: a phone has no clipboard without an adapter the product adds), or a promise of one of them. */
  onCopy?: (text: string) => void | boolean | Promise<unknown>;
};

/** Whether what a copy gave back says the words were copied: false, and an outcome that is not ok (`{ ok: false }`, a
 *  capability that answered "not-implemented" or "denied"), say they were not; anything else that came back did. A
 *  button says "copied" only then, never before and never for a copy that did not happen. */
export function copiedBy(answer: unknown): boolean {
  if (answer === false) return false;
  return !(answer && typeof answer === "object" && (answer as { ok?: unknown }).ok === false);
}

/** A line of words with a button that copies them: it says so when they are copied, and that they were not when the
 *  copy failed; with nothing given to copy with, the button only runs the tap. */
export function CopyRow(props: CopyRowProps) {
  const p = withDefaults<CopyRowProps>("copy-row", props);
  const kit = useKit();
  const fill = useFill();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const settle = (to: "copied" | "failed") => {
    setState(to);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };
  const copy = () => {
    p.onPress?.();
    if (!p.onCopy) return;
    try {
      const done = p.onCopy(p.text ?? "");
      if (done && typeof (done as Promise<unknown>).then === "function") (done as Promise<unknown>).then((answer) => settle(copiedBy(answer) ? "copied" : "failed"), () => settle("failed"));
      else settle(copiedBy(done) ? "copied" : "failed");
    } catch {
      settle("failed");
    }
  };
  return (
    <Surface base={{ width: Math.round(p.width ?? 280), height: 40, flexDirection: "row", alignItems: "center", columnGap: 8, paddingLeft: 12, paddingRight: 4, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, "surface-container-high") }} style={fill} appearance={p} testID={p.testID}>
      <RNText numberOfLines={1} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "body-small"), fontFamily: "monospace", color: c(kit, "on-surface") }}>
        {p.text}
      </RNText>
      <Pressable accessibilityRole="button" accessibilityLabel={state === "copied" ? "Copied" : state === "failed" ? "Not copied" : "Copy"} onPress={copy} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={state === "copied" ? "check" : state === "failed" ? "error" : "content_copy"} size={16} color={c(kit, state === "failed" ? "error" : "on-surface-variant")} />
      </Pressable>
    </Surface>
  );
}

/* ---------- a quantity ---------- */

export type QuantityStepperProps = PartBase &
  FieldProps & {
    value?: number;
    min?: number;
    max?: number;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the number, kept to its range, on every step */
    onValueChange?: (value: number) => void;
  };

/** A minus, the number and a plus on a filled pill: each steps it, kept to its range; the minus and the plus are places
 *  of their own (`dec`, `inc`) for an action that changes it elsewhere too. A screen reader steps it as one control. */
export function QuantityStepper(props: QuantityStepperProps) {
  const p = withDefaults<QuantityStepperProps>("quantity-stepper", props);
  const kit = useKit();
  const fill = useFill();
  const min = p.min ?? 0;
  const max = p.max ?? 99;
  const [given, setCount] = useEntry(p.value ?? 1, p.onValueChange);
  const count = Math.min(max, Math.max(min, given));
  const held = heldBy(p);
  const step = (by: number, slot: string) => {
    if (held) return;
    const to = Math.min(max, Math.max(min, count + by));
    if (to !== count) setCount(to);
    tapOf(p, slot)?.();
  };
  const button = (icon: string, label: string, by: number, slot: string, can: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !can }} disabled={!can} onPress={() => step(by, slot)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", opacity: can ? 1 : 0.38 }}>
      <Glyph name={icon} size={24} color={c(kit, "on-surface-variant")} />
    </Pressable>
  );
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 200), height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, borderRadius: 28, backgroundColor: c(kit, "surface-container-highest"), opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID}>
      {button("remove", "Decrease", -1, "dec", !held && count > min)}
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={starred(p.ariaLabel || "Quantity", p.required)}
        accessibilityValue={{ min, max, now: count }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === "increment" ? step(1, "inc") : step(-1, "dec"))}
      >
        <RNText style={{ ...typeStyle(kit, "title-medium"), color: c(kit, "on-surface") }}>{String(count)}</RNText>
      </View>
      {button("add", "Increase", 1, "inc", !held && count < max)}
    </Surface>,
  );
}

/* ---------- tags ---------- */

/** tags as a part's prop gives them: its rows, words, or one a line (as a variable holds a list) */
export function tagsOf(items: (ListRow | string)[] | string | undefined): string[] {
  const all = Array.isArray(items) ? items.map((x) => (typeof x === "string" ? x : x?.label)) : String(items ?? "").split("\n");
  return all.filter((w): w is string => typeof w === "string" && !!w.trim());
}

export type TagInputProps = PartBase &
  FieldProps & {
    /** the tags: rows, words, or words one a line */
    items?: (ListRow | string)[] | string;
    placeholder?: string;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the tags on every change */
    onChange?: (tags: string[]) => void;
    /** a tag added, and a tag taken away (the `add` and `remove` events) */
    onAdd?: (tag: string) => void;
    onRemove?: (tag: string) => void;
  };

/** Tags as chips that each take themselves away, over a field that adds what is typed into it when it is sent (the
 *  keyboard's return); what is typed is a draft of its own, emptied once added. */
export function TagInput(props: TagInputProps) {
  const p = withDefaults<TagInputProps>("tag-input", props);
  const kit = useKit();
  const fill = useFill();
  const [tags, setTags] = useEntry(tagsOf(p.items), p.onChange);
  const [draft, setDraft] = useState("");
  const held = heldBy(p);
  const { box } = fieldStyle(kit, "outlined");
  const add = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      p.onAdd?.(tag);
    }
    setDraft("");
  };
  const remove = (tag: string) => {
    setTags(tags.filter((x) => x !== tag));
    p.onRemove?.(tag);
  };
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 320), padding: 8, rowGap: 8, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-highest"), opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      {tags.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {tags.map((tag) => (
            <View key={tag} style={{ height: 32, flexDirection: "row", alignItems: "center", columnGap: 4, paddingLeft: 12, paddingRight: 4, borderRadius: corner(kit, "sm"), borderWidth: 1, borderColor: c(kit, "outline-variant") }}>
              <RNText style={{ ...typeStyle(kit, "label-large"), color: c(kit, "on-surface-variant") }}>{tag}</RNText>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${tag}`} disabled={held} onPress={() => remove(tag)} style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
                <Glyph name="close" size={18} color={c(kit, "on-surface-variant")} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <TextInput
        accessibilityLabel={starred(p.ariaLabel || p.placeholder || "Tag", p.required)}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={add}
        submitBehavior="submit"
        returnKeyType="done"
        editable={!held}
        placeholder={p.placeholder}
        placeholderTextColor={c(kit, "on-surface-variant")}
        style={{ height: 56, paddingHorizontal: 16, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface"), ...box, ...(p.error ? { borderColor: c(kit, "error"), borderBottomColor: c(kit, "error") } : null) } as TextStyle}
      />
    </Surface>,
  );
}

/* ---------- a phone number ---------- */

export type PhoneInputProps = PartBase &
  FieldProps & {
    code?: string;
    placeholder?: string;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    value?: string;
    /** told of the number as it is typed */
    onChangeText?: (number: string) => void;
  };

/** A phone number: the country's code before the field, the phone's own keypad for the number. */
export function PhoneInput(props: PhoneInputProps) {
  const p = withDefaults<PhoneInputProps>("phone-input", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useEntry(String(p.value ?? ""), p.onChangeText);
  const { box } = fieldStyle(kit, "outlined");
  const muted = c(kit, "on-surface-variant");
  return withField(
    p,
    <View testID={p.testID} style={[{ width: Math.round(p.width ?? 320), height: 56, flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 12, opacity: p.disabled ? 0.38 : 1, ...box, ...(p.error ? { borderColor: c(kit, "error"), borderBottomColor: c(kit, "error") } : null) }, fill]}>
      {p.code ? <RNText style={{ ...typeStyle(kit, "body-large"), color: muted }}>{starred(p.code, p.required)}</RNText> : null}
      <TextInput accessibilityLabel={starred(p.ariaLabel || p.placeholder, p.required)} value={text} onChangeText={setText} editable={!heldBy(p)} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder={p.placeholder} placeholderTextColor={muted} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "body-large"), color: c(kit, "on-surface"), paddingVertical: 0 }} />
    </View>,
  );
}

/* ---------- a number pad ---------- */

/** what a key does to what is typed: an amount takes one point and two places after it, a code or a phone number its
 *  length at most */
export function padNext(mode: string, length: number, typed: string, key: string): string {
  const money = mode === "amount";
  if (key === "back") return typed.slice(0, -1);
  if (key === ".") return !money || typed.includes(".") ? typed : `${typed || "0"}.`;
  if (money) {
    if (/\.\d\d$/.test(typed) || (typed.replace(".", "").length >= 12 && !typed.includes("."))) return typed;
    return typed === "0" ? key : typed + key;
  }
  return typed.length >= length ? typed : typed + key;
}

/** whether what is typed can be confirmed: an amount above nothing, a code of its length, a number at all */
export const padReady = (mode: string, length: number, typed: string) => (mode === "amount" ? Number(typed) > 0 : mode === "pin" ? typed.length === length : typed.length > 0);

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export type NumberPadProps = PartBase &
  FieldProps & {
    mode?: "amount" | "pin" | "phone";
    prefix?: string;
    length?: number;
    action?: string;
    done?: string;
    value?: string;
    /** whether what was confirmed went through, as the other side says */
    sent?: boolean;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of what is typed on every key */
    onChangeText?: (value: string) => void;
    /** confirmed, with what is typed (the `submit` event) */
    onSubmit?: (value: string) => void;
  };

/** Keys to type an amount, a code or a phone number, what is typed over them (a code as dots), and a button that
 *  confirms it (the `confirm` place). Whether it went through is `sent`, as it is given. */
export function NumberPad(props: NumberPadProps) {
  const p = withDefaults<NumberPadProps>("number-pad", props);
  const kit = useKit();
  const fill = useFill();
  const mode = p.mode ?? "amount";
  const length = clampInt(p.length ?? 6, 1, 12);
  const [entry, setEntry] = useEntry(String(p.value ?? ""), p.onChangeText);
  const money = mode === "amount";
  const held = heldBy(p);
  const press = (key: string) => {
    const typed = padNext(mode, length, entry, key);
    if (typed !== entry) setEntry(typed);
  };
  const ready = padReady(mode, length, entry);
  const key = (k: string, label?: string, icon?: string) => (
    <Pressable key={k} accessibilityRole="keyboardkey" accessibilityLabel={label ?? k} disabled={held} onPress={() => press(k)} style={{ width: "31%", flexGrow: 1, height: 56, borderRadius: corner(kit, "sm"), backgroundColor: c(kit, "surface-container-high"), alignItems: "center", justifyContent: "center" }}>
      {icon ? <Glyph name={icon} size={24} color={c(kit, "on-surface")} /> : <RNText style={{ ...typeStyle(kit, "headline-small"), color: c(kit, "on-surface") }}>{k}</RNText>}
    </Pressable>
  );
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 320), padding: 12, rowGap: 12, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low"), opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID}>
      <View accessibilityLiveRegion="polite" accessibilityLabel={starred(p.ariaLabel || (mode === "pin" ? `${entry.length} of ${length}` : undefined), p.required)} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 12 }}>
        {mode === "pin" ? (
          Array.from({ length }, (_, i) => <View key={i} style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c(kit, i < entry.length ? "primary" : "on-surface"), backgroundColor: i < entry.length ? c(kit, "primary") : "transparent" }} />)
        ) : (
          <RNText numberOfLines={1} style={{ ...typeStyle(kit, "headline-large"), color: c(kit, "on-surface"), fontVariant: ["tabular-nums"] }}>
            {`${money ? (p.prefix ?? "") : ""}${entry || (money ? "0" : (p.prefix ?? ""))}`}
          </RNText>
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {KEYS.map((k) => key(k))}
        {money ? key(".") : <View style={{ width: "31%", flexGrow: 1 }} />}
        {key("0")}
        {key("back", "Backspace", "backspace")}
      </View>
      {p.action ? (
        <Button
          label={p.sent && p.done ? p.done : p.action}
          variant={p.sent ? "tonal" : "filled"}
          width={Math.round(p.width ?? 320) - 24}
          disabled={!ready || held}
          onPress={() => {
            p.onSubmit?.(entry);
            tapOf(p, "confirm")?.();
          }}
        />
      ) : null}
    </Surface>,
  );
}

/* ---------- a signature ---------- */

export type SignaturePadProps = PartBase &
  FieldProps & {
    hint?: string;
    clear?: string;
    action?: string;
    done?: string;
    /** the strokes, as the path an SVG draws ("M10 20 L30 40 ...") */
    value?: string;
    /** whether the signature was taken, as the other side says: it is then held as it is */
    signed?: boolean;
    height?: number;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the strokes when one ends, and of none when they are cleared */
    onChangeText?: (path: string) => void;
  };

const point = (e: GestureResponderEvent) => `${e.nativeEvent.locationX.toFixed(1)} ${e.nativeEvent.locationY.toFixed(1)}`;

/** A pad a finger signs on: the strokes are the value, handed out as each ends. Clearing is the person's own (the `clear`
 *  place is that button, for an action of its own); the button asks for the signature to be taken (`done`), and whether
 *  it was is `signed`, as it is given. */
export function SignaturePad(props: SignaturePadProps) {
  const p = withDefaults<SignaturePadProps>("signature-pad", props);
  const kit = useKit();
  const fill = useFill();
  const [path, setPath] = useEntry(String(p.value ?? ""), p.onChangeText);
  /* the stroke under the finger, until it is lifted */
  const [stroke, setStroke] = useState("");
  const locked = !!p.signed || heldBy(p);
  /* where the finger left it, read off the event itself: the last move may not have been drawn yet */
  const lift = (e: GestureResponderEvent) => {
    if (!stroke) return;
    setStroke("");
    setPath(`${path} ${stroke} L${point(e)}`.trim());
  };
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => !locked,
    onMoveShouldSetPanResponder: () => !locked,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => setStroke(`M${point(e)} L${point(e)}`),
    onPanResponderMove: (e) => {
      const at = point(e);
      setStroke((s) => (s ? `${s} L${at}` : s));
    },
    onPanResponderRelease: lift,
    onPanResponderTerminate: lift,
  });
  const all = `${path} ${stroke}`.trim();
  const ink = c(kit, "on-surface");
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 360), padding: 12, rowGap: 8, borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low"), opacity: p.disabled ? 0.38 : 1 }} style={fill} appearance={p} testID={p.testID}>
      <View accessible accessibilityRole="image" accessibilityLabel={starred(p.ariaLabel || p.hint || "Signature", p.required)} {...pan.panHandlers} style={{ height: Math.round(p.height ?? 180), borderRadius: corner(kit, "sm"), borderWidth: 1, borderColor: c(kit, p.error ? "error" : "outline-variant"), backgroundColor: c(kit, "surface-container-lowest"), overflow: "hidden" }}>
        {!all && p.hint ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}>
            <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface-variant") }}>{p.hint}</RNText>
          </View>
        ) : null}
        <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, bottom: 32, borderBottomWidth: 1, borderStyle: "dashed", borderColor: c(kit, "outline-variant") }} />
        {all ? (
          <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }} width="100%" height="100%">
            <Path d={all} fill="none" stroke={ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", columnGap: 8 }}>
        {p.clear ? (
          <Button
            label={p.clear}
            variant="text"
            size="xs"
            disabled={!all || locked}
            onPress={() => {
              setStroke("");
              setPath("");
              /* the button is the pad's own: it is a tap only where an action is put on it */
              p.taps?.clear?.();
            }}
          />
        ) : null}
        {p.action ? <Button label={p.signed && p.done ? p.done : p.action} variant={p.signed ? "tonal" : "filled"} size="xs" disabled={!all || heldBy(p)} onPress={tapOf(p, "done")} /> : null}
      </View>
    </Surface>,
  );
}

/* ---------- words with a toolbar ---------- */

/** the marks the toolbar has, as the editor's: each a look the words take on */
export const MARKS = [
  { label: "Bold", icon: "format_bold", mark: "bold" },
  { label: "Italic", icon: "format_italic", mark: "italic" },
  { label: "Underline", icon: "format_underlined", mark: "underline" },
  { label: "Strikethrough", icon: "strikethrough_s", mark: "strike" },
  { label: "Bulleted list", icon: "format_list_bulleted", mark: "bullets" },
  { label: "Numbered list", icon: "format_list_numbered", mark: "numbers" },
  { label: "Quote", icon: "format_quote", mark: "quote" },
  { label: "Clear formatting", icon: "format_clear", mark: "clear" },
] as const;

/** what a press of a mark makes of the marks on: a mark turned on or off, a list in place of the other, nothing after
 *  clearing */
export function markNext(on: string[], mark: string): string[] {
  if (mark === "clear") return [];
  if (on.includes(mark)) return on.filter((m) => m !== mark);
  const other = mark === "bullets" ? "numbers" : mark === "numbers" ? "bullets" : undefined;
  return [...on.filter((m) => m !== other), mark];
}

export type RichTextEditorProps = PartBase &
  FieldProps & {
    text?: string;
    placeholder?: string;
    counter?: boolean;
    height?: number;
    width?: number;
    disabled?: boolean;
    error?: boolean;
    /** told of the words as they are written */
    onChangeText?: (text: string) => void;
  };

/** Words under a toolbar of marks, with their count. The words are the value, as plain text (the editor's value is its
 *  words too); a phone's field has no marks of a part of its words, so a mark is a look of them all here, the
 *  person's own, not part of the value. */
export function RichTextEditor(props: RichTextEditorProps) {
  const p = withDefaults<RichTextEditorProps>("rich-text-editor", props);
  const kit = useKit();
  const fill = useFill();
  const [value, setValue] = useEntry(String(p.text ?? ""), p.onChangeText);
  const [on, setOn] = useState<string[]>([]);
  const held = heldBy(p);
  const has = (m: string) => on.includes(m);
  const look: TextStyle = {
    ...(has("bold") ? { fontWeight: "700" } : null),
    ...(has("italic") ? { fontStyle: "italic" } : null),
    ...(has("underline") || has("strike") ? { textDecorationLine: has("underline") && has("strike") ? "underline line-through" : has("underline") ? "underline" : "line-through" } : null),
  };
  const lead = has("bullets") ? "•" : has("numbers") ? "1." : undefined;
  return withField(
    p,
    <Surface base={{ width: Math.round(p.width ?? 380), borderRadius: corner(kit, "lg"), backgroundColor: c(kit, "surface-container-low"), overflow: "hidden", opacity: p.disabled ? 0.38 : 1, ...(p.error ? { borderWidth: 1, borderColor: c(kit, "error") } : null) }} style={fill} appearance={p} testID={p.testID}>
      <View accessibilityRole="toolbar" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2, padding: 4, backgroundColor: c(kit, "surface-container") }}>
        {MARKS.map((m) => (
          <Pressable key={m.mark} accessibilityRole="button" accessibilityLabel={m.label} accessibilityState={{ selected: has(m.mark), disabled: held }} disabled={held} onPress={() => setOn((now) => markNext(now, m.mark))} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: has(m.mark) ? c(kit, "secondary-container") : "transparent" }}>
            <Glyph name={m.icon} size={20} color={c(kit, has(m.mark) ? "on-secondary-container" : "on-surface")} />
          </Pressable>
        ))}
      </View>
      <View style={{ height: Math.round(p.height ?? 200), flexDirection: "row", padding: 12, columnGap: 8, ...(has("quote") ? { borderLeftWidth: 4, borderLeftColor: c(kit, "outline-variant"), marginLeft: 12, paddingLeft: 12 } : null) }}>
        {lead ? <RNText style={{ ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface") }}>{lead}</RNText> : null}
        <TextInput accessibilityLabel={starred(p.ariaLabel || p.placeholder || "Text", p.required)} multiline value={value} onChangeText={setValue} editable={!held} placeholder={p.placeholder} placeholderTextColor={c(kit, "on-surface-variant")} textAlignVertical="top" style={{ flex: 1, alignSelf: "stretch", padding: 0, ...typeStyle(kit, "body-medium"), color: c(kit, "on-surface"), ...look }} />
      </View>
      {p.counter ? <RNText style={{ ...typeStyle(kit, "label-small"), color: c(kit, "on-surface-variant"), textAlign: "right", paddingHorizontal: 12, paddingBottom: 8 }}>{String(value.trim().length)}</RNText> : null}
    </Surface>,
  );
}
