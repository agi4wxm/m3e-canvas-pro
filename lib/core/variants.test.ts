/* Variants, swapping an instance and component properties, as the core's operations and the expansion see them:
 * a set made of a component, the overrides an instance keeps across variants, properties that write words, hide a
 * layer or swap a nested instance, and a file with all of it read back. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../i18n";
import { expandInstances } from "../instances";
import { openProject, projectFile } from "../project";
import { makeItem, type Group } from "../tokens";
import { guessMeasurer, OpError } from "./op";
import { counterIds, DocStore } from "./store";
import { savedDoc, stateOf } from "./state";
import * as ops from "./ops";

beforeAll(() => setGlobalLang("en"));

const screen = { id: "F1", name: "Home", x: 0, y: 0 };
const part = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }] });
const ai = { origin: "ai" as const };
const fails = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect((e as OpError).code).toBe(code);
    return;
  }
  throw new Error("did not throw");
};

/** a store with a button and a text made into one component, and an instance of it */
function withComponent() {
  const s = new DocStore(stateOf({ groups: [part("btn", "button", 16, 100, { label: "Go" }), part("cap", "text", 16, 160, { text: "Caption" })], frames: [screen] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.run(ops.makeComponentOp, { ids: ["btn", "cap"], name: "Card", id: "card" }, ai);
  const inst = s.get().doc.groups.find((g) => g.instanceOf === "card")!;
  return { s, inst };
}
const instance = (s: DocStore, id: string) => s.get().doc.groups.find((g) => g.id === id)!;
const shown = (s: DocStore, g: Group) => expandInstances({ groups: [instance(s, g.id)], components: s.get().doc.components }, s.get().session.widths);

describe("variants", () => {
  it("makes a set of a component, its copy the second variant under the same part ids", () => {
    const { s } = withComponent();
    const out = s.run(ops.addVariant, { component: "card", id: "card2", setId: "set" }, ai);
    expect(out).toEqual({ id: "card2", set: "set" });
    const doc = s.get().doc;
    expect(doc.componentSets).toEqual([{ id: "set", name: "Card", props: [{ name: "Property 1", values: ["Default", "Variant 2"] }] }]);
    const [a, b] = doc.components!;
    expect(a).toMatchObject({ id: "card", set: "set", variant: { "Property 1": "Default" }, name: "Property 1=Default" });
    expect(b).toMatchObject({ id: "card2", set: "set", variant: { "Property 1": "Variant 2" }, name: "Property 1=Variant 2" });
    expect(b.groups.flatMap((g) => g.items.map((it) => it.id))).toEqual(a.groups.flatMap((g) => g.items.map((it) => it.id)));
    /* the set lives in the saved document, and one undo takes the variant and the set away */
    expect(savedDoc(s.get()).componentSets).toHaveLength(1);
    s.undo();
    expect(s.get().doc.componentSets).toBeUndefined();
    expect(s.get().doc.components).toHaveLength(1);
  });

  it("names the values asked for, and refuses a second variant with the same ones", () => {
    const { s } = withComponent();
    s.run(ops.addVariant, { component: "card", id: "pressed", values: { State: "Pressed" } }, ai);
    s.run(ops.addVariant, { component: "pressed", id: "big", values: { Size: "L" } }, ai);
    const doc = s.get().doc;
    expect(doc.componentSets![0].props).toEqual([
      { name: "State", values: ["Default", "Pressed"] },
      { name: "Size", values: ["Default", "L"] },
    ]);
    expect(doc.components!.map((c) => c.variant)).toEqual([
      { State: "Default", Size: "Default" },
      { State: "Pressed", Size: "Default" },
      { State: "Pressed", Size: "L" },
    ]);
    fails(() => s.run(ops.addVariant, { component: "card", values: { State: "Pressed" } }, ai), "invalid_value");
  });

  it("renames a property and its values, the variants following", () => {
    const { s } = withComponent();
    s.run(ops.addVariant, { component: "card", id: "pressed", setId: "set", values: { State: "Pressed" } }, ai);
    s.run(ops.updateComponentSet, { id: "set", name: "Button", props: [{ name: "Mode", was: "State", values: ["Rest", "Down"], renamed: { Default: "Rest", Pressed: "Down" } }] }, ai);
    const doc = s.get().doc;
    expect(doc.componentSets![0]).toMatchObject({ name: "Button", props: [{ name: "Mode", values: ["Rest", "Down"] }] });
    expect(doc.components!.map((c) => [c.variant, c.name])).toEqual([
      [{ Mode: "Rest" }, "Mode=Rest"],
      [{ Mode: "Down" }, "Mode=Down"],
    ]);
  });

  it("swaps an instance to another variant, keeping what it overrides", () => {
    const { s, inst } = withComponent();
    s.run(ops.setOverrides, { id: inst.id, key: "btn/label", value: "Buy" }, ai);
    s.run(ops.addVariant, { component: "card", id: "pressed", values: { State: "Pressed" } }, ai);
    s.run(ops.swapInstance, { id: inst.id, component: "pressed" }, ai);
    expect(instance(s, inst.id)).toMatchObject({ instanceOf: "pressed", overrides: { "btn/label": "Buy" } });
    expect(shown(s, inst).find((g) => g.id.endsWith("/g-btn"))?.items[0].props?.label).toBe("Buy");
    fails(() => s.run(ops.swapInstance, { id: inst.id, component: "pressed" }, ai), "nothing_to_do");
  });

  it("carries an override to a component that names the part the same, and drops what has no match", () => {
    const s = new DocStore(stateOf({ groups: [part("a", "button", 16, 100, { label: "A" }), part("b", "button", 16, 300, { label: "B" })], frames: [screen] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
    s.run(ops.makeComponentOp, { ids: ["a"], id: "one" }, ai);
    s.run(ops.makeComponentOp, { ids: ["b"], id: "two" }, ai);
    const inst = s.get().doc.groups.find((g) => g.instanceOf === "one")!;
    s.run(ops.setOverrides, { id: inst.id, overrides: { "a/label": "Mine", "gone/label": "x" } }, { origin: "user" });
    s.run(ops.swapInstance, { id: inst.id, component: "two" }, ai);
    expect(instance(s, inst.id).overrides).toEqual({ "b/label": "Mine" });
  });
});

describe("component properties", () => {
  it("writes an instance's words through a text property, under what it overrides by hand", () => {
    const { s, inst } = withComponent();
    const { id } = s.run(ops.setComponentProp, { component: "card", name: "Label", type: "text", targets: ["btn/label"] }, ai);
    expect(s.get().doc.components![0].props).toEqual([{ id, name: "Label", type: "text", value: "Go", targets: ["btn/label"] }]);
    s.run(ops.setInstanceProps, { id: inst.id, values: { Label: "Buy now" } }, ai);
    const label = () => shown(s, inst).find((g) => g.id.endsWith("/g-btn"))?.items[0].props?.label;
    expect(label()).toBe("Buy now");
    s.run(ops.setOverrides, { id: inst.id, key: "btn/label", value: "By hand" }, ai);
    expect(label()).toBe("By hand");
    s.run(ops.resetOverrides, { id: inst.id }, ai);
    expect(label()).toBe("Go");
    fails(() => s.run(ops.resetOverrides, { id: inst.id }, ai), "nothing_to_do");
  });

  it("hides a layer through a bool property, and refuses a target the component does not have", () => {
    const { s, inst } = withComponent();
    s.run(ops.setComponentProp, { component: "card", name: "Caption", type: "bool", targets: ["g-cap"] }, ai);
    expect(shown(s, inst).some((g) => g.id.endsWith("/g-cap"))).toBe(true);
    s.run(ops.setInstanceProps, { id: inst.id, values: { Caption: false } }, ai);
    expect(shown(s, inst).some((g) => g.id.endsWith("/g-cap"))).toBe(false);
    fails(() => s.run(ops.setComponentProp, { component: "card", name: "X", type: "bool", targets: ["nope"] }, ai), "invalid_value");
    fails(() => s.run(ops.setInstanceProps, { id: inst.id, values: { Caption: "no" } }, ai), "invalid_value");
    fails(() => s.run(ops.setInstanceProps, { id: inst.id, values: { Missing: true } }, ai), "invalid_value");
  });

  it("swaps a nested instance through a swap property", () => {
    const s = new DocStore(stateOf({ groups: [part("i1", "icon", 16, 100, { name: "star" }), part("i2", "icon", 16, 200, { name: "home" }), part("t", "text", 16, 300, { text: "Row" })], frames: [screen] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
    s.run(ops.makeComponentOp, { ids: ["i1"], id: "star" }, ai);
    s.run(ops.makeComponentOp, { ids: ["i2"], id: "home" }, ai);
    const nested = s.get().doc.groups.find((g) => g.instanceOf === "star")!;
    s.run(ops.makeComponentOp, { ids: [nested.id, "t"], id: "row" }, ai);
    const row = s.get().doc.groups.find((g) => g.instanceOf === "row")!;
    s.run(ops.setComponentProp, { component: "row", name: "Icon", type: "swap", targets: [nested.id] }, ai);
    expect(s.get().doc.components!.find((c) => c.id === "row")!.props![0].value).toBe("star");
    s.run(ops.setInstanceProps, { id: row.id, values: { Icon: "home" } }, ai);
    const icons = shown(s, row).flatMap((g) => g.items).filter((it) => it.component === "icon").map((it) => it.props?.name);
    expect(icons).toEqual(["home"]);
    fails(() => s.run(ops.setInstanceProps, { id: row.id, values: { Icon: "row" } }, ai), "refused");
    /* the component it swapped in gone, the value goes with it */
    s.run(ops.removeComponentOp, { id: "home" }, ai);
    expect(instance(s, row.id).properties).toBeUndefined();
  });

  it("removes a property from the component and from what its instances set", () => {
    const { s, inst } = withComponent();
    const { id } = s.run(ops.setComponentProp, { component: "card", name: "Label", type: "text", targets: ["btn/label"] }, ai);
    s.run(ops.setInstanceProps, { id: inst.id, values: { [id]: "Buy" } }, ai);
    s.run(ops.removeComponentProp, { component: "card", id: "Label" }, ai);
    expect(s.get().doc.components![0].props).toBeUndefined();
    expect(instance(s, inst.id).properties).toBeUndefined();
  });
});

describe("a file with variants and properties", () => {
  it("reads back what it was written with, and loses what is of the wrong shape", () => {
    const { s, inst } = withComponent();
    s.run(ops.addVariant, { component: "card", id: "pressed", setId: "set", values: { State: "Pressed" } }, ai);
    s.run(ops.setComponentProp, { component: "card", id: "lbl", name: "Label", type: "text", targets: ["btn/label"] }, ai);
    s.run(ops.setInstanceProps, { id: inst.id, values: { lbl: "Hi" } }, ai);
    const doc = savedDoc(s.get());
    const back = openProject(JSON.parse(JSON.stringify(projectFile(doc))))!;
    expect(back.componentSets).toEqual(doc.componentSets);
    expect(back.components).toEqual(doc.components);
    expect(back.groups.find((g) => g.id === inst.id)?.properties).toEqual({ lbl: "Hi" });
    const broken = openProject({ ...doc, componentSets: [{ id: "x", props: "no" }, 3], components: [{ ...doc.components![0], props: [{ id: "p", type: "colour", targets: [] }], variant: { a: 1 } }] })!;
    expect(broken.componentSets).toEqual([{ id: "x", name: "", props: [] }]);
    expect(broken.components![0].props).toBeUndefined();
    expect(broken.components![0].variant).toEqual({});
  });
});
