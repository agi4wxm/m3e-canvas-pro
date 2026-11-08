import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { makeItem, withIds, type Doc, type Item } from "../../tokens";
import { boundShopDoc } from "../product.fixture";
import { inputsDoc } from "../rn/fixture";
import { printMiniScreens } from "./print";

/* The pickers and the entry parts (D3) in a mini-program: the printer hands each kit control the form field it fills
 * or what the screen's runtime keeps for it (and the variable it writes), as its input's kind says: a choice by the
 * words of its option, a number, words, a list of words (one a line in the runtime and its variable). */

beforeAll(() => setGlobalLang("en"));

function shopWith(swap: Record<string, { component: string; props: Record<string, unknown> }>): { doc: Doc; widths: Record<string, number> } {
  const { doc, widths } = boundShopDoc();
  const groups = doc.groups.map((g) => ({ ...g, items: g.items.map((it): Item => (it.field && swap[it.field] ? { ...it, component: swap[it.field].component, label: swap[it.field].component, props: swap[it.field].props } : it)) }));
  return { doc: { ...doc, groups }, widths };
}

describe("the D3 inputs in a mini-program", () => {
  it("fill their form's fields as their kinds say", () => {
    const { doc, widths } = shopWith({
      category: { component: "color-palette", props: { colors: "#6750A4,#386A20", selected: 1 } },
      description: { component: "signature-pad", props: {} },
      stock: { component: "number-picker", props: { value: 3 } },
      name: { component: "tag-input", props: { items: [{ label: "Lamp" }] } },
      "price.currency": { component: "transfer-list", props: { items: [{ label: "CNY" }, { label: "USD" }], chosen: "2" } },
    });
    const form = printMiniScreens(doc, widths, { kitImport: "../../kit", callsImport: "../calls" }).screens.find((s) => s.component === "NewProductScreen")!.source;
    expect(form).toMatch(/selected=\{optionIndex\(\["#6750A4", "#386A20"\], (\w+)\.value\("category"\)\)\}/);
    expect(form).toMatch(/onChange=\{\(i: number\) => (\w+)\.set\("category", \["#6750A4", "#386A20"\]\[i\]\)\}/);
    expect(form).toMatch(/value=\{Number\((\w+)\.value\("stock"\) \?\? 3\)\}/);
    expect(form).toMatch(/value=\{(\w+)\.text\("description"\)\}/);
    expect(form).toMatch(/items=\{\((\w+)\.value\("name"\) as string\[\] \| undefined\) \?\? "Lamp"\}/);
    expect(form).toMatch(/onChange=\{\(v: string\[\]\) => (\w+)\.set\("name", v\)\}/);
    expect(form).toMatch(/chosen=\{(\w+)\.text\("price\.currency"\)\}/);
  });

  it("keep what is entered in the screen's runtime, writing it to the variable each is bound to", () => {
    let n = 0;
    const { doc } = withIds(() => `id${++n}`, inputsDoc);
    const { screens, warnings } = printMiniScreens(doc, {});
    const pickers = screens.find((s) => s.component === "PickersScreen")!.source;
    const entry = screens.find((s) => s.component === "EntryScreen")!.source;
    /* a choice keeps its place, and writes the words of its option to a text variable (the labels the runtime has) */
    expect(pickers).toContain('"itemPicker": { value: 0, var: "trip", labels: ["Home", "Work", "Travel", "Food"] }');
    expect(pickers).toContain('selected={s.value<number>("itemPicker", 0)}');
    expect(pickers).toContain('"colorPalette": { value: 0, var: "swatch", labels: ["#6750A4", "#625B71", "#7D5260", "#B3261E", "#386A20", "#006A6A"] }');
    /* several picks are words of their own, not a choice */
    expect(pickers).toContain('selected={s.value<string>("multipleChoice", "1,3")}');
    expect(pickers).toContain('picked={s.value<string>("seatMap", "")}');
    /* a list of words is one a line */
    expect(entry).toContain('"tagInput": { value: "Design\\nPrototype", var: "tags" }');
    expect(entry).toContain('onChange={(v: string[]) => s.setter("tagInput")(v.join("\\n"))}');
    expect(entry).toContain('text={s.value<string>("richTextEditor", "Select some of this text and try the buttons above.")}');
    expect(warnings.filter((w) => w.kind === "input" || w.kind === "placeholder")).toEqual([]);
  });

  it("move a picked row where the part leaves it to the screen, and write a sorted list and a swipe row out", () => {
    const { doc, widths } = boundShopDoc();
    const home = doc.frames[0];
    const add = (id: string, component: string, props: Record<string, unknown>, bind?: Record<string, string>) => ({ id: `g-${id}`, name: id, x: home.x + 16, y: home.y + 400, axis: "x" as const, items: [{ ...makeItem(component), id, label: id, props, ...(bind ? { bind } : {}) }] });
    const vars = [...(doc.vars ?? []), { id: "order", name: "order", type: "text" as const, value: "" }, { id: "swiped", name: "swiped", type: "bool" as const, value: false }];
    const more = { ...doc, vars, groups: [...doc.groups, add("bars", "bar-list", { selected: 1 }), add("rows", "sortable-list", { items: [{ label: "A" }, { label: "B" }] }, { items: "order" }), add("swipe", "swipe-row", {}, { open: "swiped" })] };
    const screen = printMiniScreens(more, widths, { kitImport: "../../kit", callsImport: "../calls" }).screens.find((s) => s.id === home.id)!.source;
    expect(screen).toContain('selected={s.prop("bars", "selected", 1)}');
    expect(screen).toContain('onSelect={(i: number) => s.setProp("bars", "selected", i)}');
    expect(screen).toContain('onChange={(v: string[]) => s.setter("rows")(v.join("\\n"))}');
    expect(screen).toContain('"rows": { value: "A\\nB", var: "order" }');
    expect(screen).toContain('onChange={s.setter("swipe")}');
    expect(screen).toContain('"swipe": { value: false, var: "swiped" }');
  });
});
