import { h, ic } from "../node";
import { inputNode } from "../inputNode";
import type { P, PartDef } from "../types";
import { FIELD, fieldFrame, fieldValues, HELPER_TEXT, requiredMark } from "../fieldState";
import { ariaLabelProp, nameFor } from "../a11y";

/** The id a part's own label points its control at: one of its own on a screen of several (from the part's id, as
 *  `p.scope` gives it), the bare name where the part is drawn for no item. */
const controlId = (base: string, p: P) => (p.scope ? `${base}-${p.scope.replace(/\s+/g, "_")}` : base);

/** an entry with no chrome of its own: the box it stands in is its field */
const PLAIN = { value: "plain", label: "Plain", labels: { ja: "装飾なし", zh: "无边框", ko: "꾸밈 없음" } };

export const textInputs: PartDef[] = [
  {
    slug: "text-field",
    input: { prop: "value", kind: "text" },
    field: FIELD,
    appearance: { target: "TextField", radius: 4 },
    name: "Text field",
    category: "Forms",
    icon: "text_fields",
    role: "listLike",
    w: 280,
    h: 56,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Label" },
      { key: "value", label: "Value", kind: "text", default: "" },
      { key: "placeholder", label: "Placeholder", kind: "text", default: "" },
      /* the keyboard and how the words show; a form's field of a format says the same */
      { key: "type", label: "Type", kind: "enum", default: "text", options: ["text", "email", "password", "number", "search", "tel", "url"] },
      HELPER_TEXT,
      { key: "variant", label: "Variant", kind: "enum", default: "outlined", options: ["outlined", "filled"] },
      { key: "prefix", label: "Prefix", labels: { ja: "接頭辞", zh: "前缀", ko: "접두사" }, kind: "text", default: "" },
      { key: "suffix", label: "Suffix", labels: { ja: "接尾辞", zh: "后缀", ko: "접미사" }, kind: "text", default: "" },
      { key: "leadingIcon", label: "Leading icon", kind: "icon", default: "" },
      { key: "trailingIcon", label: "Trailing icon", kind: "icon", default: "" },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "multiline", label: "Multiline", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 280, min: 120, max: 520, step: 4, unit: "px" },
      ariaLabelProp((p) => !p.s("label")),
    ],
    tree: (p) => {
      const v = fieldValues(p);
      const label = p.s("label");
      /* a required field says so after its label, as M3 marks one */
      return fieldFrame(
        v,
        h(
          "div",
          { style: { width: Math.round(p.n("width")) } },
          inputNode(h("TextField", {
            label: requiredMark(label, v.required),
            "aria-label": label ? undefined : nameFor(p) || undefined,
            defaultValue: p.s("value") || undefined,
            placeholder: p.s("placeholder") || undefined,
            type: p.s("type") === "text" ? undefined : p.s("type"),
            prefix: p.s("prefix") || undefined,
            suffix: p.s("suffix") || undefined,
            variant: p.s("variant") === "filled" ? "filled" : undefined,
            supportingText: p.s("helperText") || undefined,
            leadingIcon: p.s("leadingIcon") ? ic(p.s("leadingIcon")) : undefined,
            trailingIcon: p.s("trailingIcon") ? ic(p.s("trailingIcon")) : undefined,
            error: v.invalid || undefined,
            errorText: v.message || undefined,
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
            multiline: p.b("multiline") || undefined,
            containerClassName: "w-full",
          })),
        ),
        { holds: true, marksRequired: !!label, showsMessage: true, showsHelper: true },
      );
    },
  },
  {
    slug: "input",
    input: { prop: "value", kind: "text" },
    field: FIELD,
    appearance: { target: "Input", radius: 4 },
    name: "Input",
    category: "Controls",
    icon: "edit_note",
    role: "listLike",
    w: 280,
    h: 56,
    props: [
      { key: "placeholder", label: "Placeholder", kind: "text", default: "Email" },
      { key: "value", label: "Value", kind: "text", default: "" },
      { key: "type", label: "Type", kind: "enum", default: "text", options: ["text", "email", "password", "number", "search", "tel", "url"] },
      { key: "variant", label: "Variant", kind: "enum", default: "outlined", options: ["outlined", "filled", PLAIN] },
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["default", "sm"] },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 280, min: 120, max: 1280, step: 4, unit: "px" },
      ariaLabelProp(),
    ],
    tree: (p) => {
      const v = fieldValues(p);
      return fieldFrame(
        v,
        inputNode(h("Input", {
          type: p.s("type") === "text" ? undefined : p.s("type"),
          placeholder: p.s("placeholder") || undefined,
          "aria-label": nameFor(p) || undefined,
          defaultValue: p.s("value") || undefined,
          variant: p.s("variant") === "outlined" ? undefined : p.s("variant"),
          size: p.s("size") === "sm" ? "sm" : undefined,
          "aria-invalid": v.invalid || undefined,
          required: v.required || undefined,
          readOnly: v.readOnly || undefined,
          disabled: v.disabled || undefined,
          style: { width: Math.round(p.n("width")) },
        })),
        { holds: true },
      );
    },
    guess: (p) => ({ h: p.s("variant") === PLAIN.value ? 24 : p.s("size") === "sm" ? 40 : 56 }),
  },
  {
    slug: "textarea",
    input: { prop: "value", kind: "text" },
    field: FIELD,
    appearance: { target: "Textarea", radius: 4 },
    name: "Textarea",
    category: "Controls",
    icon: "notes",
    role: "listLike",
    w: 280,
    h: 96,
    props: [
      { key: "placeholder", label: "Placeholder", kind: "text", default: "Type your message here." },
      { key: "value", label: "Value", kind: "text", default: "", multiline: true },
      { key: "variant", label: "Variant", kind: "enum", default: "outlined", options: ["outlined", "filled", PLAIN] },
      { key: "rows", label: "Rows", kind: "number", default: 3, min: 1, max: 10, step: 1 },
      { key: "autoGrow", label: "Grows with the text", labels: { ja: "入力に合わせて伸びる", zh: "随内容增高", ko: "내용에 맞춰 늘어남" }, kind: "bool", default: true },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 280, min: 120, max: 1280, step: 4, unit: "px" },
      ariaLabelProp(),
    ],
    tree: (p) => {
      const v = fieldValues(p);
      return fieldFrame(
        v,
        inputNode(h("Textarea", {
          placeholder: p.s("placeholder") || undefined,
          "aria-label": nameFor(p) || undefined,
          defaultValue: p.s("value") || undefined,
          variant: p.s("variant") === "outlined" ? undefined : p.s("variant"),
          rows: p.n("rows"),
          /* growing, it starts at its rows and takes more as the words come; fixed, it keeps its rows and scrolls */
          className: p.b("autoGrow") ? undefined : "field-sizing-fixed",
          "aria-invalid": v.invalid || undefined,
          required: v.required || undefined,
          readOnly: v.readOnly || undefined,
          disabled: v.disabled || undefined,
          style: { width: Math.round(p.n("width")), ...(p.s("variant") === PLAIN.value ? { minHeight: Math.round(p.n("rows")) * 24 } : {}) },
        })),
        { holds: true },
      );
    },
    guess: (p) => (p.s("variant") === PLAIN.value ? { h: Math.round(p.n("rows")) * 24 } : {}),
  },
  {
    slug: "input-group",
    field: FIELD,
    appearance: { target: "InputGroup", radius: 4 },
    name: "Input group",
    category: "Forms",
    icon: "input",
    w: 320,
    h: 56,
    props: [
      { key: "placeholder", label: "Placeholder", kind: "text", default: "Search..." },
      { key: "leadingIcon", label: "Leading icon", kind: "icon", default: "search" },
      { key: "leadingText", label: "Leading text", kind: "text", default: "" },
      { key: "trailingText", label: "Trailing text", kind: "text", default: "" },
      { key: "button", label: "Trailing button", kind: "text", default: "" },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 320, min: 160, max: 520, step: 4, unit: "px" },
      ariaLabelProp(),
    ],
    tree: (p) => {
      const v = fieldValues(p);
      const leadingIcon = p.s("leadingIcon");
      const leadingText = p.s("leadingText");
      const trailingText = p.s("trailingText");
      const button = p.s("button");
      return fieldFrame(
        v,
        h(
          "InputGroup",
          { style: { width: Math.round(p.n("width")) } },
          !!(leadingIcon || leadingText) && h("InputGroupAddon", null, !!leadingIcon && ic(leadingIcon, { size: 20 }), !!leadingText && h("InputGroupText", null, leadingText)),
          h("InputGroupInput", {
            placeholder: p.s("placeholder") || undefined,
            "aria-label": nameFor(p) || undefined,
            "aria-invalid": v.invalid || undefined,
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
          }),
          !!(trailingText || button) &&
            h("InputGroupAddon", { align: "inline-end" }, !!trailingText && h("InputGroupText", null, trailingText), !!button && h("InputGroupButton", { variant: "tonal", disabled: v.disabled || v.readOnly || undefined }, button)),
        ),
        { holds: true },
      );
    },
  },
  {
    slug: "input-otp",
    field: FIELD,
    appearance: { target: "InputOTPSlot", radius: 8 },
    name: "Input OTP",
    category: "Forms",
    icon: "pin",
    w: 340,
    h: 56,
    props: [
      { key: "length", label: "Length", kind: "number", default: 6, min: 2, max: 8, step: 1 },
      { key: "group", label: "Group size (0: one group)", kind: "number", default: 3, min: 0, max: 8, step: 1 },
      { key: "value", label: "Value", kind: "text", default: "" },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      ariaLabelProp(),
    ],
    tree: (p) => {
      const v = fieldValues(p);
      const length = Math.round(p.n("length"));
      const size = Math.round(p.n("group")) || length;
      const slot = (index: number) => h("InputOTPSlot", { index, "aria-invalid": v.invalid || undefined });
      const parts: ReturnType<typeof h>[] = [];
      for (let from = 0; from < length; from += size) {
        if (from > 0) parts.push(h("InputOTPSeparator"));
        parts.push(h("InputOTPGroup", null, ...Array.from({ length: Math.min(size, length - from) }, (_, i) => slot(from + i))));
      }
      return fieldFrame(
        v,
        h(
          "InputOTP",
          {
            maxLength: length,
            defaultValue: p.s("value").slice(0, length) || undefined,
            "aria-label": nameFor(p, p.say("Verification code")),
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
          },
          ...parts,
        ),
        { holds: true },
      );
    },
  },
  {
    slug: "field",
    /* it has no `error` of its own: saying a message puts the field in error */
    field: { disabled: "disabled", readOnly: "readOnly", required: "required", loading: "loading", errorText: "errorText", helperText: "helperText" },
    appearance: { target: "Input", radius: 4 },
    name: "Field",
    category: "Forms",
    icon: "list_alt",
    w: 320,
    h: 96,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Email" },
      { key: "control", label: "Control", kind: "enum", default: "input", options: ["input", "textarea", "checkbox", "switch"] },
      { key: "placeholder", label: "Placeholder", kind: "text", default: "you@example.com" },
      { ...HELPER_TEXT, default: "We will never share it." },
      { key: "errorText", label: "Error message", kind: "text", default: "" },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 320, min: 160, max: 520, step: 4, unit: "px" },
    ],
    tree: (p) => {
      const control = p.s("control");
      const error = p.s("errorText");
      const invalid = !!error || undefined;
      const disabled = p.b("disabled") || undefined;
      const required = p.b("required") || undefined;
      const readOnly = p.b("readOnly") || undefined;
      const id = controlId("field-control", p);
      const field = { id, "aria-invalid": invalid, disabled, required };
      const horizontal = control === "checkbox" || control === "switch";
      const label = h("FieldLabel", { htmlFor: id }, p.s("label"), required && h("span", { "aria-hidden": true, className: "text-error" }, " *"));
      const input =
        control === "checkbox"
          ? h("Checkbox", { ...field, readOnly })
          : control === "switch"
            ? h("Switch", { id, disabled, required, readOnly })
            : control === "textarea"
              ? h("Textarea", { ...field, readOnly, placeholder: p.s("placeholder") || undefined })
              : h("Input", { ...field, readOnly, placeholder: p.s("placeholder") || undefined });
      const description = !!p.s("helperText") && h("FieldDescription", null, p.s("helperText"));
      const message = !!error && h("FieldError", null, error);
      /* its own label, description and error line say the rest; the frame only shows that it loads */
      return fieldFrame(
        { ...fieldValues(p, (k) => k !== "error" && k !== "errorText"), invalid: !!error },
        h(
          "Field",
          { orientation: horizontal ? "horizontal" : undefined, "data-invalid": invalid, "data-disabled": disabled, style: { width: Math.round(p.n("width")) } },
          ...(horizontal ? [input, h("FieldContent", null, label, description, message)] : [label, input, description, message]),
        ),
        { holds: true, marksRequired: true, showsMessage: true, showsHelper: true },
      );
    },
  },
  {
    slug: "label",
    appearance: { radius: 8 },
    name: "Label",
    category: "Basics",
    icon: "sell",
    role: "label",
    w: 120,
    h: 24,
    props: [
      { key: "text", label: "Text", kind: "text", default: "Accept terms and conditions" },
      { key: "control", label: "Control", kind: "enum", default: "checkbox", options: ["checkbox", "switch", "none"] },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
    ],
    tree: (p) => {
      const control = p.s("control");
      const disabled = p.b("disabled") || undefined;
      const id = controlId("label-control", p);
      return h(
        "Label",
        { htmlFor: control === "none" ? undefined : id },
        control === "checkbox" && h("Checkbox", { id, disabled }),
        control === "switch" && h("Switch", { id, disabled }),
        p.s("text"),
      );
    },
  },
];
