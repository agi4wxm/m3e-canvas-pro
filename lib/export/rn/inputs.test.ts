import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { makeItem, withIds, type Doc, type Item } from "../../tokens";
import { boundShopDoc } from "../product.fixture";
import { inputsDoc } from "./fixture";
import { printRnScreens } from "./print";

/* The pickers and the entry parts (D3) on a phone: the printer wires their kit controls to the form field each fills
 * and to the variable each is bound to, as their inputs' kinds say (words, a choice held as the words of its option, a
 * number, a list of words), and no longer reports that what is entered does not get out. */

beforeAll(() => setGlobalLang("en"));

/** the shop's new product form with some of its fields entered by the D3 parts instead */
function shopWith(swap: Record<string, { component: string; props: Record<string, unknown> }>): { doc: Doc; widths: Record<string, number> } {
  const { doc, widths } = boundShopDoc();
  const groups = doc.groups.map((g) => ({ ...g, items: g.items.map((it): Item => (it.field && swap[it.field] ? { ...it, component: swap[it.field].component, label: swap[it.field].component, props: swap[it.field].props } : it)) }));
  return { doc: { ...doc, groups }, widths };
}

const screenOf = (doc: Doc, widths: Record<string, number>, name: string) => printRnScreens(doc, widths, { kitImport: "../../kit", runtime: { bind: "../bind" } }).screens.find((s) => s.component === name)!.source;

describe("the D3 inputs on a phone", () => {
  it("fill their form's fields: words, a choice by its words, a number, a list of words", () => {
    const { doc, widths } = shopWith({
      category: { component: "item-picker", props: { items: [{ label: "shoes", icon: "steps" }, { label: "shirts" }, { label: "bags" }], selected: 1 } },
      description: { component: "rich-text-editor", props: { text: "" } },
      stock: { component: "quantity-stepper", props: { value: 3 } },
      name: { component: "tag-input", props: { items: [{ label: "Lamp" }] } },
      "price.currency": { component: "multi-select", props: { items: [{ label: "CNY" }, { label: "USD" }], selected: "1" } },
    });
    const form = screenOf(doc, widths, "NewProductScreen");
    expect(form).toContain('selected={optionOf([{ label: "shoes" }, { label: "shirts" }, { label: "bags" }], form1.value("category"))}');
    expect(form).toContain('onSelect={(_i: number, label: string) => form1.set("category", label)}');
    expect(form).toContain('text={form1.text("description")}');
    expect(form).toContain('value={Number(form1.value("stock") ?? 0)}');
    expect(form).toContain('onValueChange={(v: number) => form1.set("stock", v)}');
    expect(form).toContain('items={(form1.value("name") as string[] | undefined) ?? "Lamp"}');
    expect(form).toContain('onChange={(v: string[]) => form1.set("name", v)}');
    expect(form).toContain('selected={form1.text("price.currency")}');
    /* what each starts with is what the design shows: the option's words, the number, the tags, the rows picked */
    expect(form).toMatch(/initial: \{[^}]*category: "shirts"/);
    expect(form).toMatch(/initial: \{[^}]*stock: 3/);
    expect(form).toMatch(/initial: \{[^}]*name: \["Lamp"\]/);
    expect(form).toMatch(/initial: \{[^}]*"price\.currency": "1"/);
    /* their field states, as the form says */
    expect(form).toContain('error={!!form1.error("category")}');
    expect(form).toContain('testID="field:stock"');
  });

  it("follow and write the variables they are bound to, and say nothing of an input that does not get out", () => {
    let n = 0;
    const { doc } = withIds(() => `id${++n}`, inputsDoc);
    const { screens, warnings } = printRnScreens(doc, {});
    const pickers = screens.find((s) => s.component === "PickersScreen")!.source;
    const entry = screens.find((s) => s.component === "EntryScreen")!.source;
    /* a choice bound to words finds them among its options and writes the words of the one picked */
    expect(pickers).toContain('selected={optionOf([{ label: "Home" }, { label: "Work" }, { label: "Travel" }, { label: "Food" }], app.bound("trip", "Home"))}');
    expect(pickers).toContain('onSelect={(_i: number, label: string) => app.input("item-picker", label, "trip")}');
    /* bound to a number, its place */
    expect(pickers).toContain('selected={app.bound("swatch", 0)}');
    expect(pickers).toContain('onSelect={(i: number) => app.input("color-palette", i, "swatch")}');
    expect(pickers).toContain('onChangeText={(v: string) => app.input("seat-map", v, "seats")}');
    /* a list of words is one a line in its variable */
    expect(entry).toContain('items={app.bound("tags", "Design\\nPrototype")}');
    expect(entry).toContain('onChange={(v: string[]) => app.input("tag-input", v.join("\\n"), "tags")}');
    expect(entry).toContain('onValueChange={(v: number) => app.input("quantity-stepper", v, "count")}');
    expect(entry).toContain('onChangeText={(v: string) => app.input("rich-text-editor", v, "notes")}');
    expect(warnings.filter((w) => w.kind === "input" || w.kind === "placeholder")).toEqual([]);
  });

  it("move a picked row where the part leaves it to the app, and write a sorted list and a swipe row out", () => {
    const { doc, widths } = boundShopDoc();
    const home = doc.frames[0];
    const add = (id: string, component: string, props: Record<string, unknown>, bind?: Record<string, string>) => ({ id: `g-${id}`, x: home.x + 16, y: home.y + 400, axis: "x" as const, items: [{ ...makeItem(component), id, label: id, props, ...(bind ? { bind } : {}) }] });
    const vars = [...(doc.vars ?? []), { id: "order", name: "order", type: "text" as const, value: "" }, { id: "swiped", name: "swiped", type: "bool" as const, value: false }];
    const more = { ...doc, vars, groups: [...doc.groups, add("bars", "bar-list", { selected: 1 }), add("rows", "sortable-list", { items: [{ label: "A" }, { label: "B" }] }, { items: "order" }), add("swipe", "swipe-row", {}, { open: "swiped" })] };
    const screen = printRnScreens(more, widths, { kitImport: "../../kit", runtime: { bind: "../bind" } }).screens.find((s) => s.id === home.id)!.source;
    expect(screen).toContain('selected={app.prop("bars", "selected", 1)}');
    expect(screen).toContain('onSelect={(i: number) => app.setProp("bars", "selected", i)}');
    expect(screen).toContain('onChange={(v: string[]) => app.input("rows", v.join("\\n"), "order")}');
    expect(screen).toContain('onValueChange={(v: boolean) => app.input("swipe", v, "swiped")}');
  });
});
