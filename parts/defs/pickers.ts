import { h, ic } from "../node";
import type { PartDef } from "../types";
import { FIELD, fieldFrame, fieldValues } from "../fieldState";
import { ariaLabelProp } from "../a11y";

export const pickers: PartDef[] = [
  {
    slug: "calendar",
    field: FIELD,
    appearance: { target: "Calendar", radius: 16 },
    name: "Calendar",
    category: "Pickers",
    icon: "calendar_month",
    w: 304,
    h: 340,
    props: [
      { key: "mode", label: "Mode", kind: "enum", default: "single", options: ["single", "multiple", "range"] },
      { key: "months", label: "Months shown", kind: "number", default: 1, min: 1, max: 2, step: 1 },
      { key: "outside", label: "Days of other months", kind: "bool", default: true },
      { key: "weekStart", label: "Week starts on", kind: "enum", default: "sunday", options: ["sunday", "monday"] },
      ariaLabelProp(),
    ],
    /* its days are buttons a frame can hold: disabled, read-only, its message under it */
    tree: (p) =>
      fieldFrame(
        fieldValues(p),
        h("Calendar", {
          mode: p.s("mode"),
          numberOfMonths: Math.round(p.n("months")) > 1 ? Math.round(p.n("months")) : undefined,
          showOutsideDays: p.b("outside") ? undefined : false,
          weekStartsOn: p.s("weekStart") === "monday" ? 1 : undefined,
        }),
      ),
  },
  {
    slug: "date-picker",
    field: FIELD,
    appearance: { target: ["DatePicker", "Calendar"], radius: 16 },
    name: "Date picker",
    category: "Pickers",
    icon: "edit_calendar",
    w: 256,
    h: 56,
    props: [
      { key: "variant", label: "Variant", kind: "enum", default: "docked", options: ["docked", "modal"] },
      { key: "label", label: "Label", kind: "text", default: "Birthday" },
      { key: "placeholder", label: "Placeholder (docked)", kind: "text", default: "mm/dd/yyyy", when: (p) => p.s("variant") === "docked" },
      { key: "width", label: "Width (docked)", kind: "number", default: 256, min: 160, max: 480, step: 4, unit: "px", when: (p) => p.s("variant") === "docked" },
      { key: "mode", label: "Mode (modal)", kind: "enum", default: "single", options: ["single", "range"], when: (p) => p.s("variant") === "modal" },
      { key: "title", label: "Title (modal)", kind: "text", default: "Select date", when: (p) => p.s("variant") === "modal" },
      { key: "defaultView", label: "Opens on (modal)", kind: "enum", default: "calendar", options: ["calendar", "input"], when: (p) => p.s("variant") === "modal" },
      { key: "disabled", label: "Disabled (docked)", kind: "bool", default: false, when: (p) => p.s("variant") === "docked" },
    ],
    // the docked picker is the text field; the modal is drawn closed, as the button that opens it
    // the real popup is a portal with its own state; the canvas draws its field and the calendar it opens, the calendar
    // hanging below the field so the part is laid out and measured as the field alone (the preview draws the real one)
    view: (p) =>
      h(
        "div",
        { className: "flex w-fit flex-col gap-2", style: { position: "relative" } },
        p.s("variant") === "modal"
          ? h("Button", { variant: "tonal" }, ic("calendar_today"), p.s("label") || "Pick a date")
          : h("DatePicker", { label: p.s("label") || undefined, placeholder: p.s("placeholder") || undefined, className: `w-[${Math.round(p.n("width"))}px]` }),
        h(
          "div",
          { "data-slot": "date-picker-popup", className: "w-fit rounded-xl bg-surface-container-high p-3 shadow-elevation-3", style: { position: "absolute", left: 0, top: "calc(100% + 8px)", zIndex: 1 } },
          p.s("variant") === "modal" ? h("p", { className: "px-2 pb-2 text-label-large text-on-surface-variant" }, p.s("title")) : null,
          h("Calendar"),
        ),
      ),
    tree: (p) => {
      const v = fieldValues(p);
      if (p.s("variant") === "modal") {
        const range = p.s("mode") === "range";
        /* the button that opens it is held by the frame */
        return fieldFrame(
          v,
          h("DatePickerModal", {
            mode: range ? "range" : undefined,
            title: p.s("title") || undefined,
            defaultView: p.s("defaultView") === "input" ? "input" : undefined,
            trigger: h("Button", { variant: "tonal" }, ic(range ? "date_range" : "calendar_today"), p.s("label") || "Pick a date"),
          }),
        );
      }
      const label = p.s("label");
      return fieldFrame(
        v,
        h("DatePicker", { label: (v.required && label ? `${label} *` : label) || undefined, placeholder: p.s("placeholder") || undefined, invalid: v.invalid || undefined, required: v.required || undefined, disabled: v.disabled || undefined, className: `w-[${Math.round(p.n("width"))}px]` }),
        { holds: "disabled", showsError: true, marksRequired: !!label },
      );
    },
  },
  {
    slug: "time-picker",
    field: FIELD,
    appearance: { target: "TimePicker", radius: 28 },
    name: "Time picker",
    category: "Pickers",
    icon: "schedule",
    w: 328,
    h: 520,
    props: [
      { key: "title", label: "Title", kind: "text", default: "Select time" },
      { key: "hours", label: "Hours", kind: "number", default: 9, min: 0, max: 23, step: 1 },
      { key: "minutes", label: "Minutes", kind: "number", default: 30, min: 0, max: 59, step: 1 },
      { key: "hour24", label: "24-hour clock", kind: "bool", default: false },
      { key: "mode", label: "Mode", kind: "enum", default: "dial", options: ["dial", "input"] },
      { key: "width", label: "Width", kind: "number", default: 328, min: 296, max: 560, step: 4, unit: "px" },
    ],
    tree: (p) =>
      fieldFrame(
        fieldValues(p),
        h("TimePicker", {
          title: p.s("title") || undefined,
          defaultValue: { hours: Math.round(p.n("hours")), minutes: Math.round(p.n("minutes")) },
          hour24: p.b("hour24") || undefined,
          mode: p.s("mode") === "input" ? "input" : undefined,
          style: { width: Math.round(p.n("width")) },
        }),
      ),
  },
];
