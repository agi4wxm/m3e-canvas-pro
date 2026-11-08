import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setGlobalLang } from "../lib/i18n";
import { partPropsSchema } from "../lib/tools/schema";
import { loadAllModules } from "./components";
import { FIELD_STATES, formStateProps, stateKey } from "./fieldState";
import { PARTS, defaultValues, partBySlug, treeOf } from "./registry";
import { renderNode } from "./render";

/* The field state package (parts/fieldState.ts, docs/组件规范.md "字段状态"): every input shows disabled, read-only,
 * required, loading and an error with its message, each by a prop it declares, and draws as it always did with none on. */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadAllModules();
});

const draw = (slug: string, props: Record<string, unknown>) => renderToStaticMarkup(createElement("div", null, renderNode(treeOf(partBySlug(slug)!, { ...defaultValues(partBySlug(slug)!), ...props }))));
const inputs = PARTS.filter((d) => d.field && stateKey(d, "required"));

/** the parts whose input is what they show, not what a visitor enters for a form: a row swiped open, a split view's divider, a player playing,
 *  a balance hidden, a list's filter, a page or a picture turned to; they have no field to be required or wrong */
const VIEW_STATE = new Set(["swipe-row", "audio-player", "balance-card", "transaction-list", "onboarding", "image-viewer", "split-view"]);

/** what each state says in the markup, natively or through the frame */
const SIGNS: Record<(typeof FIELD_STATES)[number], RegExp> = {
  disabled: /\sdisabled=""|data-disabled="(true|)"|aria-disabled="true"/,
  readOnly: /\sreadonly=""|aria-readonly="true"|data-readonly="(true|)"/i,
  required: /\srequired=""|aria-required="true"|data-required="(true|)"/,
  loading: /aria-busy="true"|data-loading="(true|)"/,
  error: /aria-invalid="true"|data-invalid="(true|)"/,
  errorText: /That will not do/,
  helperText: /Help for this field/,
};

describe("the field state package", () => {
  it("is declared by every input, each state a prop of the kind it takes", () => {
    for (const d of PARTS.filter((x) => x.input && !VIEW_STATE.has(x.slug))) expect(d.field, `${d.slug} takes input but declares no field states`).toBeTruthy();
    for (const d of PARTS.filter((x) => x.field))
      for (const [state, key] of Object.entries(d.field!)) {
        const prop = d.props.find((x) => x.key === key);
        expect(prop, `${d.slug}.${state} names ${key}, which it does not have`).toBeTruthy();
        expect(prop!.kind, `${d.slug}.${key}`).toBe(state === "errorText" || state === "helperText" ? "text" : "bool");
      }
  });

  it("draws an input as it always did while no state is on", () => {
    for (const d of PARTS.filter((x) => x.field)) expect(draw(d.slug, {}), d.slug).not.toContain('data-slot="field-frame"');
  });

  it("shows each state an input has, natively or in the frame around it", () => {
    for (const d of inputs)
      for (const state of FIELD_STATES) {
        const key = stateKey(d, state);
        if (!key) continue;
        /* a message shows while the field is in error */
        const on = state === "errorText" ? { [key]: "That will not do", ...(stateKey(d, "error") ? { [stateKey(d, "error")!]: true } : {}) } : state === "helperText" ? { [key]: "Help for this field" } : { [key]: true };
        expect(draw(d.slug, on), `${d.slug} shows no sign of ${state}`).toMatch(SIGNS[state]);
      }
  });

  it("shows a message only while the field is in error", () => {
    expect(draw("input", { errorText: "That will not do" })).not.toContain("That will not do");
    expect(draw("input", { errorText: "That will not do", error: true })).toContain("That will not do");
    expect(draw("text-field", { errorText: "That will not do", error: true })).toContain("That will not do");
    expect(draw("rating", { errorText: "That will not do", error: true })).toContain("That will not do");
  });

  it("shows a line of help under an input, and the error's message in its place while it is in error", () => {
    const help = draw("rating", { helperText: "Rate your stay" });
    expect(help).toContain("Rate your stay");
    expect(help).toContain('data-slot="field-frame-note"');
    expect(help).not.toContain('role="alert"');
    const wrong = draw("rating", { helperText: "Rate your stay", error: true, errorText: "Pick at least one star" });
    expect(wrong).toContain("Pick at least one star");
    expect(wrong).not.toContain("Rate your stay");
    /* where the part has always had a line of help, the package names it */
    expect(stateKey(partBySlug("text-field"), "helperText")).toBe("supporting");
    expect(stateKey(partBySlug("field"), "helperText")).toBe("description");
    expect(partBySlug("text-field")!.props.some((x) => x.key === "helperText")).toBe(false);
  });

  it("holds a FAB, a chip and a toggle group, and loads a FAB, as a button", () => {
    const fab = draw("fab", { loading: true });
    expect(fab).toContain('aria-busy="true"');
    expect(fab).toMatch(/<button[^>]*disabled=""/);
    expect(fab).toContain('data-slot="spinner"');
    expect(draw("fab", { disabled: true })).toMatch(/<button[^>]*disabled=""/);
    expect(draw("chip", { disabled: true })).toMatch(/<button[^>]*disabled=""/);
    expect(draw("toggle-group", { disabled: true })).toMatch(/data-disabled=""|disabled=""/);
    expect(draw("fab", {})).not.toMatch(/\sdisabled=""|aria-busy/);
  });

  it("starts a toggle button and a toggle FAB on when it says so", () => {
    expect(draw("button", { toggle: true, pressed: true, label: "Follow" })).toMatch(/aria-pressed="true"/);
    expect(draw("button", { toggle: true, label: "Follow" })).toMatch(/aria-pressed="false"/);
    expect(draw("fab", { toggle: true, pressed: true, onIcon: "pause", icon: "play_arrow" })).toMatch(/aria-pressed="true"/);
  });

  it("gives a text field a placeholder, a kind of value, and words before and after it", () => {
    const out = draw("text-field", { placeholder: "name@example.com", type: "email", prefix: "$", suffix: "kg" });
    expect(out).toContain('placeholder="name@example.com"');
    expect(out).toContain('type="email"');
    expect(out).toContain("$");
    expect(out).toContain("kg");
  });

  it("holds a widget that cannot hold itself: disabled turns its buttons off, read-only keeps it as it is", () => {
    const off = draw("quantity-stepper", { disabled: true });
    expect(off).toMatch(/<fieldset disabled=""/);
    expect(draw("quantity-stepper", { readOnly: true })).toContain('data-readonly="true"');
  });

  it("marks a required field after its label, for the eye only", () => {
    const out = draw("text-field", { required: true });
    expect(out).toMatch(/required=""/);
    expect(out).toContain('<span aria-hidden="true" class="text-error"> *</span>');
  });

  it("loads a button: its own spinner, and it cannot be pressed again", () => {
    const out = draw("button", { loading: true, icon: "send" });
    expect(out).toContain('aria-busy="true"');
    expect(out).toMatch(/<button[^>]*disabled=""/);
    expect(out).toContain('data-slot="spinner"');
  });

  it("is what a form sets on a part, by its declaration", () => {
    expect(formStateProps(partBySlug("input"), { invalid: "bad", message: "msg", required: true })).toEqual([
      ["error", "bad"],
      ["errorText", "msg"],
      ["required", true],
    ]);
    /* an older part keeps its message under a name of its own */
    expect(formStateProps(partBySlug("field"), { invalid: "bad", message: "msg" })).toEqual([["error", "msg"]]);
    expect(formStateProps(partBySlug("button"), { submitting: "busy" })).toEqual([
      ["disabled", "busy"],
      ["loading", "busy"],
    ]);
    /* a part with no field states is held while it submits as it always was */
    expect(formStateProps(partBySlug("toggle"), { submitting: "busy", invalid: "bad" })).toEqual([["disabled", "busy"]]);
  });

  it("is told to the tools: every state is in the part's schema, said to be a field state", () => {
    const schema = partPropsSchema(partBySlug("select")!) as { properties: Record<string, { type: string; description: string }> };
    for (const state of FIELD_STATES) expect(schema.properties[stateKey(partBySlug("select"), state)!]?.description, state).toMatch(/field state/);
    expect(schema.properties.required.type).toBe("boolean");
    expect(schema.properties.errorText.type).toBe("string");
  });
});
