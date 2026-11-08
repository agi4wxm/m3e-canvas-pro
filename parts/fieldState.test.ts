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

/** what each state says in the markup, natively or through the frame */
const SIGNS: Record<(typeof FIELD_STATES)[number], RegExp> = {
  disabled: /\sdisabled=""|data-disabled="(true|)"|aria-disabled="true"/,
  readOnly: /\sreadonly=""|aria-readonly="true"|data-readonly="(true|)"/i,
  required: /\srequired=""|aria-required="true"|data-required="(true|)"/,
  loading: /aria-busy="true"|data-loading="(true|)"/,
  error: /aria-invalid="true"|data-invalid="(true|)"/,
  errorText: /That will not do/,
};

describe("the field state package", () => {
  it("is declared by every input, each state a prop of the kind it takes", () => {
    for (const d of PARTS.filter((x) => x.input)) expect(d.field, `${d.slug} takes input but declares no field states`).toBeTruthy();
    for (const d of PARTS.filter((x) => x.field))
      for (const [state, key] of Object.entries(d.field!)) {
        const prop = d.props.find((x) => x.key === key);
        expect(prop, `${d.slug}.${state} names ${key}, which it does not have`).toBeTruthy();
        expect(prop!.kind, `${d.slug}.${key}`).toBe(state === "errorText" ? "text" : "bool");
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
        const on = state === "errorText" ? { [key]: "That will not do", ...(stateKey(d, "error") ? { [stateKey(d, "error")!]: true } : {}) } : { [key]: true };
        expect(draw(d.slug, on), `${d.slug} shows no sign of ${state}`).toMatch(SIGNS[state]);
      }
  });

  it("shows a message only while the field is in error", () => {
    expect(draw("input", { errorText: "That will not do" })).not.toContain("That will not do");
    expect(draw("input", { errorText: "That will not do", error: true })).toContain("That will not do");
    expect(draw("text-field", { errorText: "That will not do", error: true })).toContain("That will not do");
    expect(draw("rating", { errorText: "That will not do", error: true })).toContain("That will not do");
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
    for (const state of FIELD_STATES) expect(schema.properties[state]?.description, state).toMatch(/field state/);
    expect(schema.properties.required.type).toBe("boolean");
    expect(schema.properties.errorText.type).toBe("string");
  });
});
