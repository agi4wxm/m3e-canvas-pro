import { Image as TaroImage, Input as TaroInput, Textarea as TaroTextarea, View, type CommonEvent, type ITouchEvent } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PartBase } from "../atoms/basics";
import { Button, Checkbox, Input, Switch, Textarea } from "../atoms/controls";
import { Words } from "../atoms/words";
import { c } from "../color";
import { starred, withField, type FieldProps } from "../field";
import { Glyph, svgUrl } from "../icons";
import { useFill } from "../layout";
import { clampInt, withDefaults, type ListRow } from "../parts";
import { fieldStyle } from "../recipes";
import { Surface, tagOf } from "../Surface";
import { BARE, COL, merge, ROW, sx, type CSS } from "../styles";
import { corner, typeStyle, useKit } from "../theme";
import { tapOf } from "./bars";
import { heldBy, pressOf, useEntry } from "./pickers";

/* What a person enters beyond a plain field, in a mini-program: an input with what goes before and after it, a code in
 * boxes, a field with its label and its words, a form of fields, a line to copy, a quantity, tags, a phone number, a
 * number pad, a signature and words with a toolbar. Each input's value is a prop handed out on every change
 * (`onChange`, docs/组件规范.md "受控值和草稿"); whether it went through (a code sent, a signature taken) is the other
 * side's to say, and shows only as it is given. Events the exported apps do not run yet (`submit`, `add`, `remove`)
 * are callbacks of their own. */

/** what a part that holds others draws after its own: the parts put in it, as a placeholder lays them out */
const held = (children: ReactNode) => (children ? <View>{children}</View> : null);

const placeholderStyle = (kit: ReturnType<typeof useKit>) => `color: ${kit.paint("on-surface-variant")}`;

/** the outlined field a one-line input stands in, in error's color when it is in error */
const fieldBox = (kit: ReturnType<typeof useKit>, error?: boolean): CSS => merge({ ...ROW, boxSizing: "border-box", height: 56, flexShrink: 0 }, fieldStyle(kit, "outlined").box, error ? { borderColor: c("error"), boxShadow: `inset 0 0 0 1px ${c("error")}` } : null);

/* ---------- an input with what goes before and after it ---------- */

export type InputGroupProps = PartBase & FieldProps & { placeholder?: string; leadingIcon?: string; leadingText?: string; trailingText?: string; button?: string; error?: boolean; disabled?: boolean; width?: number; value?: string; onChange?: (text: string) => void };

/** One field with an icon or words before what is typed, words after it and a button at its end (the `button` place). */
export function InputGroup(props: InputGroupProps) {
  const p = withDefaults<InputGroupProps>("input-group", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useEntry(String(p.value ?? ""), p.onChange);
  const words = { ...typeStyle(kit, "body-large"), color: c("on-surface-variant") };
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(fieldBox(kit, p.error), { width: Math.round(p.width ?? 320), columnGap: 8, paddingLeft: 12, paddingRight: 12, opacity: p.disabled ? 0.38 : 1 }, fill)}>
      {p.leadingIcon ? <Glyph name={p.leadingIcon} size={20} color="on-surface-variant" /> : null}
      {p.leadingText ? <Words text={p.leadingText} lines={1} style={words} /> : null}
      <TaroInput value={text} ariaLabel={starred(p.ariaLabel || p.placeholder, p.required)} disabled={heldBy(p)} placeholder={p.placeholder} placeholderStyle={placeholderStyle(kit)} maxlength={-1} onInput={(e) => setText(e.detail.value)} style={sx(typeStyle(kit, "body-large"), BARE, { flex: 1, minWidth: 0, height: 24, color: c("on-surface") })} />
      {p.trailingText ? <Words text={p.trailingText} lines={1} style={words} /> : null}
      {p.button ? <Button label={p.button} size="xs" variant="tonal" disabled={heldBy(p)} onPress={tapOf(p, "button")} /> : null}
    </View>,
  );
}

/* ---------- a code in boxes ---------- */

export type InputOtpProps = PartBase & FieldProps & { length?: number; group?: number; value?: string; error?: boolean; disabled?: boolean; onChange?: (code: string) => void };

/** A code a box for each character, in groups with a dash between: what is typed fills the boxes, the next to fill
 *  ringed. The platform's keyboard types into one field laid over the boxes. */
export function InputOtp(props: InputOtpProps) {
  const p = withDefaults<InputOtpProps>("input-otp", props);
  const kit = useKit();
  const length = clampInt(p.length ?? 6, 1, 12);
  const size = clampInt(p.group ?? 3, 0, 12) || length;
  const [given, setCode] = useEntry(String(p.value ?? ""), p.onChange);
  const code = given.slice(0, length);
  const [focused, setFocused] = useState(false);
  const groups: number[][] = [];
  for (let from = 0; from < length; from += size) groups.push(Array.from({ length: Math.min(size, length - from) }, (_, i) => from + i));
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(ROW, { position: "relative", columnGap: 8, alignSelf: "flex-start", flexShrink: 0, opacity: p.disabled ? 0.38 : 1 })}>
      {groups.map((g, k) => (
        <View key={k} style={sx(ROW, { columnGap: 8 })}>
          {k > 0 ? <Glyph name="remove" size={16} color="on-surface-variant" /> : null}
          {g.map((i) => {
            const active = focused && i === Math.min(code.length, length - 1);
            return (
              <View key={i} style={sx(ROW, { boxSizing: "border-box", width: 48, height: 56, justifyContent: "center", borderRadius: corner(kit, "md"), border: `${active ? 2 : 1}px solid ${c(p.error ? "error" : active ? "primary" : "outline")}` })}>
                <Words text={code[i] ?? ""} style={{ ...typeStyle(kit, "headline-small"), color: c("on-surface") }} />
              </View>
            );
          })}
        </View>
      ))}
      <TaroInput
        value={code}
        ariaLabel={starred(p.ariaLabel || "Verification code", p.required)}
        type="number"
        maxlength={length}
        disabled={heldBy(p)}
        onInput={(e) => setCode(e.detail.value.replace(/\s/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={sx(BARE, { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", opacity: 0.01, color: "transparent" })}
      />
    </View>,
  );
}

/* ---------- a field ---------- */

export type FieldPartProps = PartBase & {
  label?: string;
  control?: "input" | "textarea" | "checkbox" | "switch";
  placeholder?: string;
  description?: string;
  /** its error's message: saying one puts it in error */
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  loading?: boolean;
  width?: number;
  value?: string;
  /** what is typed into its input, or what its check box or switch is turned to */
  onChange?: (value: string | boolean) => void;
  checked?: boolean;
  children?: ReactNode;
};

/** A field as forms lay one out: its label (a star after it while required), its control, the words under it saying
 *  what it is for, and its error's message in their place. A check box or a switch stands before its words. */
export function Field(props: FieldPartProps) {
  const p = withDefaults<FieldPartProps>("field", props);
  const kit = useKit();
  const fill = useFill();
  const width = Math.round(p.width ?? 320);
  const invalid = !!p.error;
  const side = p.control === "checkbox" || p.control === "switch";
  const label = p.label ? <Words text={starred(p.label, p.required)} style={{ ...typeStyle(kit, "title-small"), color: c("on-surface") }} /> : null;
  const words = (
    <>
      {p.description ? <Words text={p.description} style={{ ...typeStyle(kit, "body-small"), color: c("on-surface-variant") }} /> : null}
      {invalid ? <Words text={p.error} style={{ ...typeStyle(kit, "body-small"), color: c("error") }} /> : null}
    </>
  );
  const shared = { disabled: p.disabled, readOnly: p.readOnly, error: invalid, ariaLabel: p.label };
  const control =
    p.control === "checkbox" ? (
      <Checkbox {...shared} label="" checked={p.checked ?? false} onChange={p.onChange} />
    ) : p.control === "switch" ? (
      <Switch {...shared} label="" checked={p.checked ?? false} onChange={p.onChange} />
    ) : p.control === "textarea" ? (
      <Textarea {...shared} placeholder={p.placeholder} value={p.value} onChange={p.onChange} width={width} />
    ) : (
      <Input {...shared} placeholder={p.placeholder} value={p.value} onChange={p.onChange} width={width} />
    );
  return withField(
    { loading: p.loading },
    <Surface base={merge({ ...COL, width, rowGap: 8, flexShrink: 0, opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID}>
      {side ? (
        <View style={sx(ROW, { alignItems: "flex-start", columnGap: 12 })}>
          {control}
          <View style={sx(COL, { flex: 1, rowGap: 4 })}>
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
    <Surface base={merge({ ...COL, width, rowGap: 12, flexShrink: 0 }, fill)} appearance={p} testID={p.testID}>
      {(p.fields ?? []).map((f, i) => (
        <View key={i} style={sx(COL, { rowGap: 4 })}>
          <Words text={f.label} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface") }} />
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
   *  What it returns says whether it did: a promise that settles, or nothing (done). */
  onCopy?: (text: string) => void | Promise<unknown>;
};

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
      if (done && typeof (done as Promise<unknown>).then === "function") (done as Promise<unknown>).then(() => settle("copied"), () => settle("failed"));
      else settle("copied");
    } catch {
      settle("failed");
    }
  };
  return (
    <Surface base={merge({ ...ROW, boxSizing: "border-box", width: Math.round(p.width ?? 280), height: 40, columnGap: 8, paddingLeft: 12, paddingRight: 4, flexShrink: 0, borderRadius: corner(kit, "sm"), backgroundColor: c("surface-container-high") }, fill)} appearance={p} testID={p.testID}>
      <Words text={p.text} lines={1} style={{ flex: 1, minWidth: 0, ...typeStyle(kit, "body-small"), fontFamily: "monospace", color: c("on-surface") }} />
      <View ariaRole="button" ariaLabel={state === "copied" ? "Copied" : state === "failed" ? "Not copied" : "Copy"} hoverClass="m3e-pressed" onClick={(e) => (e.stopPropagation(), copy())} style={sx(ROW, { width: 32, height: 32, borderRadius: 16, justifyContent: "center", flexShrink: 0 })}>
        <Glyph name={state === "copied" ? "check" : state === "failed" ? "error" : "content_copy"} size={16} color={state === "failed" ? "error" : "on-surface-variant"} />
      </View>
    </Surface>
  );
}

/* ---------- a quantity ---------- */

export type QuantityStepperProps = PartBase & FieldProps & { value?: number; min?: number; max?: number; width?: number; disabled?: boolean; error?: boolean; onChange?: (value: number) => void };

/** A minus, the number and a plus on a filled pill: each steps it, kept to its range; the minus and the plus are places
 *  of their own (`dec`, `inc`) for an action that changes it elsewhere too. */
export function QuantityStepper(props: QuantityStepperProps) {
  const p = withDefaults<QuantityStepperProps>("quantity-stepper", props);
  const kit = useKit();
  const fill = useFill();
  const min = p.min ?? 0;
  const max = p.max ?? 99;
  const [given, setCount] = useEntry(p.value ?? 1, p.onChange);
  const count = Math.min(max, Math.max(min, given));
  const held = heldBy(p);
  const step = (by: number, slot: string) => {
    const to = Math.min(max, Math.max(min, count + by));
    if (to !== count) setCount(to);
    tapOf(p, slot)?.();
  };
  const button = (icon: string, label: string, by: number, slot: string, can: boolean) => (
    <View ariaRole="button" ariaLabel={label} hoverClass={can ? "m3e-pressed" : "none"} onClick={pressOf(() => step(by, slot), !can)} style={sx(ROW, { width: 48, height: 48, borderRadius: 24, justifyContent: "center", opacity: can ? 1 : 0.38 })}>
      <Glyph name={icon} size={24} color="on-surface-variant" />
    </View>
  );
  return withField(
    p,
    <Surface base={merge({ ...ROW, boxSizing: "border-box", justifyContent: "space-between", width: Math.round(p.width ?? 200), height: 56, paddingLeft: 4, paddingRight: 4, flexShrink: 0, borderRadius: 28, backgroundColor: c("surface-container-highest"), opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID}>
      {button("remove", "Decrease", -1, "dec", !held && count > min)}
      <View ariaRole="spinbutton" ariaLabel={starred(p.ariaLabel || "Quantity", p.required)} ariaValuenow={String(count)} ariaValuemin={String(min)} ariaValuemax={String(max)}>
        <Words text={String(count)} style={{ ...typeStyle(kit, "title-medium"), color: c("on-surface") }} />
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
    onChange?: (tags: string[]) => void;
    /** a tag added, and a tag taken away (the `add` and `remove` events) */
    onAdd?: (tag: string) => void;
    onRemove?: (tag: string) => void;
  };

/** Tags as chips that each take themselves away, over a field that adds what is typed into it when it is sent (the
 *  keyboard's done); what is typed is a draft of its own, emptied once added. */
export function TagInput(props: TagInputProps) {
  const p = withDefaults<TagInputProps>("tag-input", props);
  const kit = useKit();
  const fill = useFill();
  const [tags, setTags] = useEntry(tagsOf(p.items), p.onChange);
  const [draft, setDraft] = useState("");
  const held = heldBy(p);
  const add = (typed: string) => {
    const tag = typed.trim();
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
    <Surface base={merge({ ...COL, boxSizing: "border-box", width: Math.round(p.width ?? 320), padding: 8, rowGap: 8, flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-highest"), opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID}>
      {tags.length ? (
        <View style={sx(ROW, { flexWrap: "wrap", gap: 4 })}>
          {tags.map((tag) => (
            <View key={tag} style={sx(ROW, { boxSizing: "border-box", height: 32, columnGap: 4, paddingLeft: 12, paddingRight: 4, borderRadius: corner(kit, "sm"), border: `1px solid ${c("outline-variant")}` })}>
              <Words text={tag} lines={1} style={{ ...typeStyle(kit, "label-large"), color: c("on-surface-variant") }} />
              <View ariaRole="button" ariaLabel={`Remove ${tag}`} onClick={pressOf(() => remove(tag), held)} style={sx(ROW, { width: 24, height: 24, justifyContent: "center" })}>
                <Glyph name="close" size={18} color="on-surface-variant" />
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={sx(fieldBox(kit, p.error), { paddingLeft: 16, paddingRight: 16 })}>
        <TaroInput value={draft} ariaLabel={starred(p.ariaLabel || p.placeholder || "Tag", p.required)} placeholder={p.placeholder} placeholderStyle={placeholderStyle(kit)} disabled={held} confirmType="done" maxlength={-1} onInput={(e) => setDraft(e.detail.value)} onConfirm={(e) => add(e.detail.value)} style={sx(typeStyle(kit, "body-large"), BARE, { width: "100%", height: 24, color: c("on-surface") })} />
      </View>
    </Surface>,
  );
}

/* ---------- a phone number ---------- */

export type PhoneInputProps = PartBase & FieldProps & { code?: string; placeholder?: string; width?: number; disabled?: boolean; error?: boolean; value?: string; onChange?: (number: string) => void };

/** A phone number: the country's code before the field, the platform's number keyboard for it. */
export function PhoneInput(props: PhoneInputProps) {
  const p = withDefaults<PhoneInputProps>("phone-input", props);
  const kit = useKit();
  const fill = useFill();
  const [text, setText] = useEntry(String(p.value ?? ""), p.onChange);
  return withField(
    p,
    <View {...tagOf(p.testID)} style={sx(fieldBox(kit, p.error), { width: Math.round(p.width ?? 320), columnGap: 8, paddingLeft: 12, paddingRight: 12, opacity: p.disabled ? 0.38 : 1 }, fill)}>
      {p.code ? <Words text={starred(p.code, p.required)} lines={1} style={{ ...typeStyle(kit, "body-large"), color: c("on-surface-variant") }} /> : null}
      <TaroInput value={text} type="number" ariaLabel={starred(p.ariaLabel || p.placeholder, p.required)} disabled={heldBy(p)} placeholder={p.placeholder} placeholderStyle={placeholderStyle(kit)} maxlength={-1} onInput={(e) => setText(e.detail.value)} style={sx(typeStyle(kit, "body-large"), BARE, { flex: 1, minWidth: 0, height: 24, color: c("on-surface") })} />
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
    onChange?: (value: string) => void;
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
  const [entry, setEntry] = useEntry(String(p.value ?? ""), p.onChange);
  const money = mode === "amount";
  const held = heldBy(p);
  const press = (key: string) => {
    const typed = padNext(mode, length, entry, key);
    if (typed !== entry) setEntry(typed);
  };
  const ready = padReady(mode, length, entry);
  const key = (k: string, label?: string, icon?: string) => (
    <View key={k} ariaRole="button" ariaLabel={label ?? k} hoverClass="m3e-pressed" onClick={pressOf(() => press(k), held)} style={sx(ROW, { height: 56, justifyContent: "center", borderRadius: corner(kit, "sm"), backgroundColor: c("surface-container-high") })}>
      {icon ? <Glyph name={icon} size={24} color="on-surface" /> : <Words text={k} style={{ ...typeStyle(kit, "headline-small"), color: c("on-surface") }} />}
    </View>
  );
  return withField(
    p,
    <Surface base={merge({ ...COL, boxSizing: "border-box", width: Math.round(p.width ?? 320), padding: 12, rowGap: 12, flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low"), opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID}>
      <View ariaLabel={starred(p.ariaLabel || (mode === "pin" ? `${entry.length} of ${length}` : undefined), p.required)} style={sx(ROW, { minHeight: 56, justifyContent: "center", columnGap: 12 })}>
        {mode === "pin" ? (
          Array.from({ length }, (_, i) => <View key={i} style={sx({ boxSizing: "border-box", width: 14, height: 14, borderRadius: 7, border: `2px solid ${c(i < entry.length ? "primary" : "on-surface")}`, backgroundColor: i < entry.length ? c("primary") : "transparent" })} />)
        ) : (
          <Words text={`${money ? (p.prefix ?? "") : ""}${entry || (money ? "0" : (p.prefix ?? ""))}`} lines={1} style={{ ...typeStyle(kit, "headline-large"), color: c("on-surface"), fontVariantNumeric: "tabular-nums" }} />
        )}
      </View>
      <View style={sx({ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 })}>
        {KEYS.map((k) => key(k))}
        {money ? key(".") : <View />}
        {key("0")}
        {key("back", "Backspace", "backspace")}
      </View>
      {p.action ? (
        <View style={sx(COL, { alignItems: "stretch" })}>
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
        </View>
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
    onChange?: (path: string) => void;
  };

let pads = 0;

/** A pad a finger signs on (touch events, `catchMove` so the page does not scroll under the finger): the strokes are the
 *  value, handed out as each ends, drawn as a picture of their path. Clearing is the person's own (the `clear` place is
 *  that button, for an action of its own); the button asks for the signature to be taken (`done`), and whether it was
 *  is `signed`, as it is given. */
export function SignaturePad(props: SignaturePadProps) {
  const p = withDefaults<SignaturePadProps>("signature-pad", props);
  const kit = useKit();
  const fill = useFill();
  const [id] = useState(() => `m3e-sign-${++pads}`);
  const [path, setPath] = useEntry(String(p.value ?? ""), p.onChange);
  const [stroke, setStroke] = useState("");
  const width = Math.round(p.width ?? 360);
  const height = Math.round(p.height ?? 180);
  /* the pad's place on the page, measured where a finger lands (the page may have scrolled since) */
  const box = useRef({ left: 0, top: 0, w: width - 24, h: height });
  const [size, setSize] = useState({ w: width - 24, h: height });
  const locked = !!p.signed || heldBy(p);
  const at = (t: { clientX: number; clientY: number }) => `${(t.clientX - box.current.left).toFixed(1)} ${(t.clientY - box.current.top).toFixed(1)}`;
  const onStart = (e: CommonEvent) => {
    if (locked) return;
    const t = (e as unknown as ITouchEvent).touches?.[0];
    if (!t) return;
    Taro.createSelectorQuery()
      .select(`#${id}`)
      .boundingClientRect((r) => {
        const rect = Array.isArray(r) ? r[0] : r;
        if (!rect) return;
        box.current = { left: rect.left, top: rect.top, w: rect.width, h: rect.height };
        setSize({ w: rect.width, h: rect.height });
        setStroke(`M${at(t)} L${at(t)}`);
      })
      .exec();
  };
  const onMove = (e: CommonEvent) => {
    const t = (e as unknown as ITouchEvent).touches?.[0];
    if (!t || locked) return;
    const point = at(t);
    setStroke((s) => (s ? `${s} L${point}` : s));
  };
  const onEnd = () => {
    if (!stroke) return;
    setStroke("");
    setPath(`${path} ${stroke}`.trim());
  };
  const all = `${path} ${stroke}`.trim();
  const picture = all ? svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(size.w)}" height="${Math.round(size.h)}" viewBox="0 0 ${Math.round(size.w)} ${Math.round(size.h)}"><path d="${all.replace(/[^MLml0-9.\s-]/g, "")}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, kit.paint("on-surface")) : "";
  return withField(
    p,
    <Surface base={merge({ ...COL, boxSizing: "border-box", width, padding: 12, rowGap: 8, flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low"), opacity: p.disabled ? 0.38 : 1 }, fill)} appearance={p} testID={p.testID}>
      <View id={id} ariaRole="img" ariaLabel={starred(p.ariaLabel || p.hint || "Signature", p.required)} catchMove onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd} style={sx({ position: "relative", boxSizing: "border-box", height, borderRadius: corner(kit, "sm"), border: `1px solid ${c(p.error ? "error" : "outline-variant")}`, backgroundColor: c("surface-container-lowest"), overflow: "hidden" })}>
        {!all && p.hint ? <Words text={p.hint} style={{ position: "absolute", left: 0, right: 0, top: "50%", marginTop: -10, textAlign: "center", pointerEvents: "none", ...typeStyle(kit, "body-medium"), color: c("on-surface-variant") }} /> : null}
        <View style={sx({ position: "absolute", left: 24, right: 24, bottom: 32, borderBottom: `1px dashed ${c("outline-variant")}`, pointerEvents: "none" })} />
        {picture ? <TaroImage src={picture} mode="scaleToFill" style={sx({ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" })} /> : null}
      </View>
      <View style={sx(ROW, { justifyContent: "flex-end", columnGap: 8 })}>
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

export type RichTextEditorProps = PartBase & FieldProps & { text?: string; placeholder?: string; counter?: boolean; height?: number; width?: number; disabled?: boolean; error?: boolean; onChange?: (text: string) => void };

/** Words under a toolbar of marks, with their count. The words are the value, as plain text (the editor's value is its
 *  words too); a mini-program's field has no marks of a part of its words, so a mark is a look of them all here, the
 *  person's own, not part of the value. */
export function RichTextEditor(props: RichTextEditorProps) {
  const p = withDefaults<RichTextEditorProps>("rich-text-editor", props);
  const kit = useKit();
  const fill = useFill();
  const [value, setValue] = useEntry(String(p.text ?? ""), p.onChange);
  const [on, setOn] = useState<string[]>([]);
  const held = heldBy(p);
  const has = (m: string) => on.includes(m);
  const look: CSS = {
    ...(has("bold") ? { fontWeight: 700 } : null),
    ...(has("italic") ? { fontStyle: "italic" } : null),
    ...(has("underline") || has("strike") ? { textDecoration: [has("underline") ? "underline" : "", has("strike") ? "line-through" : ""].filter(Boolean).join(" ") } : null),
  };
  const lead = has("bullets") ? "•" : has("numbers") ? "1." : undefined;
  return withField(
    p,
    <Surface base={merge({ ...COL, width: Math.round(p.width ?? 380), flexShrink: 0, borderRadius: corner(kit, "lg"), backgroundColor: c("surface-container-low"), overflow: "hidden", opacity: p.disabled ? 0.38 : 1 }, p.error ? { border: `1px solid ${c("error")}` } : null, fill)} appearance={p} testID={p.testID}>
      <View ariaRole="toolbar" style={sx(ROW, { flexWrap: "wrap", gap: 2, padding: 4, backgroundColor: c("surface-container") })}>
        {MARKS.map((m) => (
          <View key={m.mark} ariaRole="button" ariaLabel={m.label} ariaSelected={has(m.mark)} hoverClass="m3e-pressed" onClick={pressOf(() => setOn((now) => markNext(now, m.mark)), held)} style={sx(ROW, { width: 32, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: has(m.mark) ? c("secondary-container") : "transparent" })}>
            <Glyph name={m.icon} size={20} color={has(m.mark) ? "on-secondary-container" : "on-surface"} />
          </View>
        ))}
      </View>
      <View style={sx(ROW, { alignItems: "flex-start", boxSizing: "border-box", height: Math.round(p.height ?? 200), padding: 12, columnGap: 8 }, has("quote") ? { borderLeft: `4px solid ${c("outline-variant")}`, marginLeft: 12 } : null)}>
        {lead ? <Words text={lead} style={{ ...typeStyle(kit, "body-medium"), color: c("on-surface") }} /> : null}
        <TaroTextarea value={value} ariaLabel={starred(p.ariaLabel || p.placeholder || "Text", p.required)} placeholder={p.placeholder} placeholderStyle={placeholderStyle(kit)} disabled={held} maxlength={-1} onInput={(e) => setValue(e.detail.value)} style={sx(typeStyle(kit, "body-medium"), BARE, { flex: 1, height: "100%", color: c("on-surface") }, look)} />
      </View>
      {p.counter ? <Words text={String(value.trim().length)} style={{ ...typeStyle(kit, "label-small"), color: c("on-surface-variant"), textAlign: "right", paddingLeft: 12, paddingRight: 12, paddingBottom: 8 }} /> : null}
    </Surface>,
  );
}
