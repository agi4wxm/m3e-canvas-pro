import { h } from "../node";
import { inputNode } from "../inputNode";
import type { P, PartDef } from "../types";
import { FIELD, fieldFrame, fieldValues, HELPER_TEXT, requiredMark } from "../fieldState";
import { ariaLabelProp, nameFor } from "../a11y";

/** a control's words with a star after them while it is required */
const starred = (p: P, words: string) => requiredMark(words, p.b("required"));

export const selection: PartDef[] = [
  {
    slug: "switch",
    input: { prop: "checked", kind: "bool" },
    field: FIELD,
    appearance: { target: "Label", radius: 8 },
    name: "Switch",
    category: "Controls",
    icon: "toggle_on",
    role: "control",
    w: 140,
    h: 32,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Wi-Fi" },
      { key: "checked", label: "On", kind: "bool", default: true },
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["default", "sm"] },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 140, min: 52, max: 520, step: 4, unit: "px", when: (p) => !!p.s("label") },
      ariaLabelProp((p) => !p.s("label")),
    ],
    /* a labeled switch spreads its words and its track to the row's ends */
    tree: (p) => {
      const v = fieldValues(p);
      return fieldFrame(
        v,
        h(
          "Label",
          { style: p.s("label") && p.n("width") !== 140 ? { width: Math.round(p.n("width")), justifyContent: "space-between" } : undefined },
          starred(p, p.s("label")),
          inputNode(h("Switch", {
            defaultChecked: p.b("checked") || undefined,
            size: p.s("size") === "sm" ? "sm" : undefined,
            "aria-label": p.s("label") ? undefined : nameFor(p) || undefined,
            "aria-invalid": v.invalid || undefined,
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
          })),
        ),
        { holds: true, marksRequired: !!p.s("label") },
      );
    },
    /* with no words it is just the track */
    guess: (p) => (p.s("label") ? {} : p.s("size") === "sm" ? { w: 40, h: 24 } : { w: 52, h: 32 }),
  },
  {
    slug: "checkbox",
    input: { prop: "checked", kind: "bool" },
    field: FIELD,
    appearance: { target: "Label", radius: 8 },
    name: "Checkbox",
    category: "Controls",
    icon: "check_box",
    role: "control",
    w: 140,
    h: 24,
    props: [
      { key: "label", label: "Label", kind: "text", default: "Accept terms" },
      { key: "checked", label: "Checked", kind: "bool", default: true },
      { key: "indeterminate", label: "Indeterminate", kind: "bool", default: false },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      ariaLabelProp((p) => !p.s("label")),
    ],
    tree: (p) => {
      const v = fieldValues(p);
      return fieldFrame(
        v,
        h(
          "Label",
          null,
          inputNode(h("Checkbox", {
            defaultChecked: p.b("checked") || undefined,
            indeterminate: p.b("indeterminate") || undefined,
            "aria-label": p.s("label") ? undefined : nameFor(p) || undefined,
            "aria-invalid": v.invalid || undefined,
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
          })),
          starred(p, p.s("label")),
        ),
        { holds: true, marksRequired: !!p.s("label") },
      );
    },
    /* a bare box in a composition is only the box; one with words keeps the size parts of its kind are */
    guess: (p) => (p.s("label") ? {} : { w: 18, h: 18 }),
  },
  {
    slug: "radio-group",
    input: { prop: "selected", kind: "choice" },
    field: FIELD,
    appearance: { target: "RadioGroup", radius: 8 },
    name: "Radio group",
    category: "Forms",
    icon: "radio_button_checked",
    role: "listLike",
    w: 140,
    h: 104,
    props: [
      { key: "items", label: "Options", kind: "list", default: [{ label: "Default" }, { label: "Comfortable" }, { label: "Compact" }], min: 2, max: 6 },
      { key: "selected", label: "Selected", kind: "number", default: 1, min: 0, max: 5, step: 1 },
      { key: "layout", label: "Layout", kind: "enum", default: "column", options: ["column", "row"] },
      { key: "error", label: "Error", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      ariaLabelProp(),
    ],
    selectKey: "selected",
    tree: (p) => {
      const v = fieldValues(p);
      const items = p.list("items");
      return fieldFrame(
        v,
        inputNode(h(
          "RadioGroup",
          {
            defaultValue: items[Math.min(p.n("selected"), items.length - 1)]?.label,
            className: p.s("layout") === "row" ? "flex w-fit gap-6" : "w-fit",
            "aria-label": nameFor(p) || undefined,
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
          },
          ...items.map((it) => h("Label", null, h("RadioGroupItem", { value: it.label, "aria-invalid": v.invalid || undefined }), it.label)),
        )),
        { holds: true },
      );
    },
  },
  {
    slug: "slider",
    input: { prop: "value", kind: "number" },
    field: FIELD,
    appearance: { target: "div", radius: 8 },
    name: "Slider",
    category: "Controls",
    icon: "tune",
    w: 280,
    h: 44,
    props: [
      { key: "label", label: "Label", kind: "text", default: "" },
      { key: "value", label: "Value", kind: "number", default: 40, min: 0, max: 100, step: 1 },
      { key: "range", label: "Range", kind: "bool", default: false },
      { key: "end", label: "Range end", kind: "number", default: 70, min: 0, max: 100, step: 1 },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 280, min: 120, max: 800, step: 4, unit: "px" },
      ariaLabelProp((p) => !p.s("label")),
    ],
    // the slider keeps its own --slider-gap in `style`, so the width goes on a wrapper
    tree: (p) => {
      const v = fieldValues(p);
      const value = p.b("range") ? [Math.min(p.n("value"), p.n("end")), Math.max(p.n("value"), p.n("end"))] : [p.n("value")];
      /* its words name it: the thumbs are told so, as a label element cannot reach them */
      const name = nameFor(p, p.s("label"));
      return fieldFrame(
        v,
        h(
          "div",
          { className: p.s("label") ? "flex items-center gap-3" : undefined, style: { width: Math.round(p.n("width")) } },
          p.s("label") && h("span", { className: `text-label-large shrink-0 ${v.invalid ? "text-error" : "text-on-surface"}` }, starred(p, p.s("label"))),
          inputNode(h("Slider", {
            /* read-only, it shows the value it is given and cannot be moved: a base slider has no read-only of its own */
            ...(v.readOnly ? { value } : { defaultValue: value }),
            "aria-label": name || undefined,
            "aria-invalid": v.invalid || undefined,
            disabled: v.disabled || undefined,
          })),
        ),
        { holds: "disabled", showsError: true, marksRequired: !!p.s("label") },
      );
    },
  },
  {
    slug: "select",
    input: { prop: "selected", kind: "choice" },
    field: FIELD,
    appearance: { target: "SelectTrigger", radius: 4 },
    name: "Select",
    category: "Pickers",
    icon: "arrow_drop_down_circle",
    role: "listLike",
    w: 224,
    h: 56,
    props: [
      { key: "items", label: "Options", kind: "list", default: [{ label: "Apple" }, { label: "Banana" }, { label: "Cherry" }], min: 1, max: 8 },
      { key: "selected", label: "Selected (-1: none)", kind: "number", default: 0, min: -1, max: 7, step: 1 },
      { key: "variant", label: "Variant", kind: "enum", default: "outlined", options: ["outlined", "filled"] },
      { key: "label", label: "Label", kind: "text", default: "" },
      { key: "placeholder", label: "Placeholder", kind: "text", default: "Select a fruit" },
      HELPER_TEXT,
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["default", "sm"] },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 224, min: 120, max: 520, step: 4, unit: "px" },
      ariaLabelProp((p) => !p.s("label")),
    ],
    selectKey: "selected",
    open: { box: (p) => ({ w: Math.max(p.n("width"), 200) + 16, h: 56 + 4 + p.list("items").length * 44 + 16 }) },
    tree: (p) => {
      const v = fieldValues(p);
      const items = p.list("items");
      const selected = items[p.n("selected")];
      /* the floating label is drawn for the eye only: the trigger is told its name */
      const name = nameFor(p, p.s("label"));
      return fieldFrame(
        v,
        inputNode(h(
          "Select",
          {
            items: items.map((it) => ({ value: it.label, label: it.label })),
            defaultValue: selected?.label,
            required: v.required || undefined,
            readOnly: v.readOnly || undefined,
            disabled: v.disabled || undefined,
          },
          h(
            "SelectTrigger",
            {
              size: p.s("size") === "sm" ? "sm" : undefined,
              variant: p.s("variant") === "filled" ? "filled" : undefined,
              label: p.s("label") ? starred(p, p.s("label")) : undefined,
              supporting: (v.invalid && v.message) || p.s("helperText") || undefined,
              "aria-label": name || undefined,
              "aria-invalid": v.invalid || undefined,
              style: { width: Math.round(p.n("width")) },
            },
            h("SelectValue", { placeholder: p.s("placeholder") || undefined }),
          ),
          h("SelectContent", null, ...items.map((it) => h("SelectItem", { value: it.label }, it.label))),
        )),
        { holds: true, marksRequired: !!p.s("label"), showsMessage: true, showsHelper: true },
      );
    },
  },
  {
    slug: "native-select",
    field: FIELD,
    appearance: { target: "div", radius: 4 },
    name: "Native select",
    category: "Pickers",
    icon: "list",
    role: "listLike",
    w: 224,
    h: 56,
    props: [
      { key: "items", label: "Options", kind: "list", default: [{ label: "Option A" }, { label: "Option B" }, { label: "Option C" }], min: 1, max: 8 },
      { key: "selected", label: "Selected", kind: "number", default: 1, min: 0, max: 7, step: 1 },
      { key: "size", label: "Size", kind: "enum", default: "default", options: ["default", "sm"] },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 224, min: 120, max: 520, step: 4, unit: "px" },
      ariaLabelProp(),
    ],
    selectKey: "selected",
    tree: (p) => {
      const v = fieldValues(p);
      const items = p.list("items");
      /* the box a fill and corners land on: the component splits its class and its style between two elements */
      return fieldFrame(
        v,
        h(
          "div",
          { className: "w-fit" },
          h(
            "NativeSelect",
            {
              size: p.s("size") === "sm" ? "sm" : undefined,
              defaultValue: items[Math.min(p.n("selected"), items.length - 1)]?.label,
              "aria-label": nameFor(p) || undefined,
              "aria-invalid": v.invalid || undefined,
              required: v.required || undefined,
              disabled: v.disabled || undefined,
              style: { width: Math.round(p.n("width")) },
            },
            ...items.map((it) => h("NativeSelectOption", { value: it.label }, it.label)),
          ),
        ),
        /* a select of the page's own cannot be read-only: the frame holds it */
        { holds: "disabled", showsError: true },
      );
    },
  },
  {
    slug: "combobox",
    field: FIELD,
    appearance: { target: "div", radius: 4 },
    name: "Combobox",
    category: "Pickers",
    icon: "manage_search",
    role: "listLike",
    w: 256,
    h: 56,
    props: [
      { key: "items", label: "Options", kind: "list", default: [{ label: "Next.js" }, { label: "SvelteKit" }, { label: "Nuxt" }, { label: "Remix" }, { label: "Astro" }], min: 1, max: 10 },
      { key: "selected", label: "Selected (-1: none)", kind: "number", default: -1, min: -1, max: 9, step: 1 },
      { key: "placeholder", label: "Placeholder", kind: "text", default: "Select a framework" },
      { key: "clear", label: "Clear button", kind: "bool", default: false },
      { key: "disabled", label: "Disabled", kind: "bool", default: false },
      { key: "width", label: "Width", kind: "number", default: 256, min: 120, max: 520, step: 4, unit: "px" },
      ariaLabelProp(),
    ],
    selectKey: "selected",
    open: { box: (p) => ({ w: Math.max(p.n("width"), 200), h: 56 + 8 + Math.min(p.list("items").length, 6) * 44 + 16 }) },
    tree: (p) => {
      const v = fieldValues(p);
      const items = p.list("items");
      return fieldFrame(
        v,
        h(
        "div",
        { style: { width: Math.round(p.n("width")) } },
        h(
          "Combobox",
          { items: items.map((it) => it.label), defaultValue: items[p.n("selected")]?.label, required: v.required || undefined, readOnly: v.readOnly || undefined, disabled: v.disabled || undefined },
          h("ComboboxInput", { placeholder: p.s("placeholder") || undefined, "aria-label": nameFor(p) || undefined, "aria-invalid": v.invalid || undefined, showClear: p.b("clear") || undefined, className: "w-full" }),
          h(
            "ComboboxContent",
            null,
            h("ComboboxEmpty", null, p.say("No items found.")),
            h("ComboboxList", null, ...items.map((it) => h("ComboboxItem", { value: it.label }, it.label))),
          ),
        ),
        ),
        { holds: true },
      );
    },
  },
];
