import { h, type PNode } from "./node";
import type { P, PartDef, PropDef } from "./types";

/* The field state package (docs/组件规范.md "字段状态"): beside its value, every input can be disabled, read-only,
 * required, loading, and in error with a message. A part says which of these it shows (`PartDef.field`), each by the
 * prop that holds it; the registry adds the props a definition does not write itself, so every input has them under
 * the same names, labels and kinds. The panel shows them in a section of their own, the tools describe them in the
 * part's schema, and every host goes by the declaration, never by a list of parts: a form's check turns `error` on
 * and writes the message, a schema's required field shows as required, a submit holds its button as loading. */

export const FIELD_STATES = ["disabled", "readOnly", "required", "loading", "error", "errorText", "helperText"] as const;
export type FieldState = (typeof FIELD_STATES)[number];

/** The states a part shows, each by the prop that holds it. An older part keeps one under a name of its own (the
 *  message of `field` is its `error`), which the hosts then read and write under that name. */
export type FieldDecl = Partial<Record<FieldState, string>>;

/** the whole package, under its own names: what an input declares */
export const FIELD: FieldDecl = { disabled: "disabled", readOnly: "readOnly", required: "required", loading: "loading", error: "error", errorText: "errorText", helperText: "helperText" };

/** a button's share of it: held while it cannot be pressed, or while what it started is under way */
export const BUTTON_FIELD: FieldDecl = { disabled: "disabled", loading: "loading" };

/** the prop each state is when a part does not write it itself */
function template(state: FieldState, errorKey: string | undefined): PropDef {
  switch (state) {
    case "disabled":
      return { key: "disabled", label: "Disabled", kind: "bool", default: false };
    case "readOnly":
      return { key: "readOnly", label: "Read only", labels: { ja: "読み取り専用", zh: "只读", ko: "읽기 전용" }, kind: "bool", default: false };
    case "required":
      return { key: "required", label: "Required", labels: { ja: "必須", zh: "必填", ko: "필수" }, kind: "bool", default: false };
    case "loading":
      return { key: "loading", label: "Loading", labels: { ja: "読み込み中", zh: "加载中", ko: "로딩 중" }, kind: "bool", default: false };
    case "error":
      return { key: "error", label: "Error", kind: "bool", default: false };
    case "errorText":
      /* the message only means something while the part is in error */
      return { key: "errorText", label: "Error message", kind: "text", default: "", ...(errorKey ? { when: (p: P) => p.b(errorKey) } : {}) };
    case "helperText":
      /* M3's supporting text: what the field is for, under it; the error's message stands there while it is in error */
      return { key: "helperText", label: "Helper text", labels: { ja: "補足テキスト", zh: "说明文字", ko: "도움말" }, kind: "text", default: "" };
  }
}

/** The line of help as a prop, for a part that places it among its own props rather than after them (where the
 *  registry would add it): the same key, label and kind as every other input's. */
export const HELPER_TEXT = template("helperText", undefined) as Extract<PropDef, { kind: "text" }>;

/** The props a part's declaration adds to what its definition writes: one for each state it shows under the
 *  package's own name and does not hold itself. */
export function fieldProps(def: Pick<PartDef, "props" | "field">): PropDef[] {
  const decl = def.field;
  if (!decl) return [];
  const have = new Set(def.props.map((d) => d.key));
  const out: PropDef[] = [];
  for (const state of FIELD_STATES) {
    const key = decl[state];
    if (key !== state || have.has(key)) continue;
    out.push(template(state, decl.error));
  }
  return out;
}

/** the prop that holds one of a part's states, if it shows it */
export const stateKey = (def: Pick<PartDef, "field"> | undefined, state: FieldState): string | undefined => def?.field?.[state];

/** whether a prop of the part is one of its states (the panel shows those in a section of their own) */
export const isStateProp = (def: Pick<PartDef, "field"> | undefined, key: string): boolean => !!def?.field && Object.values(def.field).includes(key);

/** What a form puts on one of its inputs: its error (on, and its message, where the part has them), that its schema
 *  requires it, and for its submit button that it is held and loading. Each is the value the preview sets, or the
 *  code a printer prints for it. What is checked is the contract's: `required` on a part only marks it. */
export type FormState<T> = { invalid?: T; message?: T; required?: boolean; submitting?: T };

/** The props a form sets on a part, by the part's declaration, each as the value (or code) the host gave for it. */
export function formStateProps<T>(def: Pick<PartDef, "field" | "props"> | undefined, s: FormState<T>): [key: string, value: T | true][] {
  const out: [string, T | true][] = [];
  const has = (k: string | undefined): k is string => !!k && !!def?.props.some((d) => d.key === k);
  const error = stateKey(def, "error");
  const message = stateKey(def, "errorText");
  if (s.invalid !== undefined && has(error)) out.push([error, s.invalid]);
  if (s.message !== undefined && has(message)) out.push([message, s.message]);
  const required = stateKey(def, "required");
  if (s.required && has(required)) out.push([required, true]);
  if (s.submitting !== undefined) {
    const disabled = stateKey(def, "disabled") ?? (def?.props.some((d) => d.key === "disabled") ? "disabled" : undefined);
    if (has(disabled)) out.push([disabled, s.submitting]);
    const loading = stateKey(def, "loading");
    if (has(loading)) out.push([loading, s.submitting]);
  }
  return out;
}

/** a part's states as a tree reads them: only what its declaration has, each under the package's name */
export type FieldValues = {
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
  loading: boolean;
  invalid: boolean;
  message: string;
  /** the line of help under it (`helperText`), where it has one under the package's name */
  helper: string;
  /** the name its author gave it for a screen reader (`ariaLabel`), where it has one */
  name: string;
};

/** a prop of words the part may not have: "" then */
const wordsOf = (p: P, key: string) => {
  try {
    return p.s(key);
  } catch {
    return "";
  }
};

/** The states of the part being drawn, by the package's names. Every input that declares the whole package has them
 *  under these names; what a part does not have reads as off. */
export function fieldValues(p: P, has: (key: string) => boolean = () => true): FieldValues {
  const b = (k: string) => (has(k) ? p.b(k) : false);
  const message = has("errorText") ? p.s("errorText") : "";
  /* the message is kept whether or not the part is in error now: what shows it shows it only while it is, so a form's
     printed code holds one control whose error comes and goes */
  return { disabled: b("disabled"), readOnly: b("readOnly"), required: b("required"), loading: b("loading"), invalid: b("error"), message, helper: has("helperText") ? wordsOf(p, "helperText") : "", name: wordsOf(p, "ariaLabel").trim() };
}

/** A label with M3's star after it while its field is required. The star is for the eye: a screen reader is told by
 *  the control's own `required`, and reads the label as it is. */
export const requiredMark = (words: string, required: boolean): string | PNode => (words && required ? h("span", null, words, h("span", { "aria-hidden": true, className: "text-error" }, " *")) : words);

/** what a frame around a control does for it: the states it shows itself, the frame not again */
type FrameOptions = {
  /** The control holds its own disabled and read-only states (an M3E control takes them natively); a widget that
   *  cannot is held by the frame. "disabled" or "readOnly": it holds only that one (a native select cannot be
   *  read-only, a rating has always been), and the frame holds the other. */
  holds?: boolean | "disabled" | "readOnly";
  /** the control shows that it is in error itself (`aria-invalid` and its colors); left out, as `holds: true` says */
  showsError?: boolean;
  /** the control marks itself required (a label with a star): the frame says nothing of it */
  marksRequired?: boolean;
  /** the control shows its own error message (a text field's supporting line) */
  showsMessage?: boolean;
  /** the control shows its own line of help (a select's supporting line) */
  showsHelper?: boolean;
};

/** A control with what its states say around it: its message under it while it is in error, a sign that it is
 *  loading, a star where it has nowhere to say it is required, and, for a widget that cannot hold itself, the hold
 *  (disabled, read-only) and the error's mark. With no state left to show, the control is drawn bare, so a part as it
 *  always was draws and prints as it always did.
 *
 *  A form's printed code draws one control whose error comes and goes: its message (an expression, "" where the design
 *  shows it apart) keeps the frame there while it is not in error, and a control that shows its own error is not framed
 *  for it at all. */
export function fieldFrame(v: FieldValues, control: PNode, o: FrameOptions = {}): PNode {
  const disabled = o.holds !== true && o.holds !== "disabled" && v.disabled;
  const readOnly = o.holds !== true && o.holds !== "readOnly" && v.readOnly;
  const message = o.showsMessage ? "" : v.message;
  const helper = o.showsHelper ? "" : v.helper;
  /* required is said by the control where it can be (an M3E control's own `required`, a star on its label), so a
     contract that requires a field adds no line under an input; a control that can say neither gets a star beside it */
  const required = v.required && !o.marksRequired && o.holds !== true;
  /* in error, a control that cannot show it is framed to mark it */
  const mark = v.invalid && !(o.showsError ?? o.holds === true);
  /* a widget that names nothing itself is named as a group, by the frame */
  const name = !o.holds && v.name;
  if (!disabled && !readOnly && !required && !message && !helper && !v.loading && !mark && !name) return control;
  return h(
    "FieldFrame",
    {
      disabled: disabled || undefined,
      readOnly: readOnly || undefined,
      required: required || undefined,
      invalid: v.invalid || undefined,
      mark: mark || undefined,
      message: message || undefined,
      helper: helper || undefined,
      loading: v.loading || undefined,
      label: name || undefined,
    },
    control,
  );
}
