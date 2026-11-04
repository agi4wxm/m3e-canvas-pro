import { describe, expect, it } from "vitest";
import { canvasView, expandDoc } from "./expand";
import { canNest, definitionFrom, detachInstance, expandInstances, makeComponent, overridableParts, rekeyedAll, removeComponent, standIn, withOverride } from "./instances";
import { openProject, projectFile } from "./project";
import { buildPrompt } from "./prompt";
import { shareable } from "./share";
import { buildCode } from "./codegen";
import { type ComponentDef, type Doc, type Group, holdsParts, makeItem } from "./tokens";

const part = (id: string, slug: string, props: Record<string, unknown> = {}) => ({ ...makeItem(slug), id, props });
const run = (id: string, x: number, y: number, slug: string, itemId: string, props: Record<string, unknown> = {}): Group => ({ id, x, y, axis: "x", items: [part(itemId, slug, props)] });

const card: ComponentDef = {
  id: "c",
  name: "Card",
  w: 200,
  h: 100,
  groups: [run("g1", 0, 0, "card", "cardItem", { title: "Hello" }), run("g2", 10, 60, "button", "btn", { label: "Go" })],
};
const sizes = { cardItem: 200, "cardItem:h": 100, btn: 80, "btn:h": 40 };

const doc = (over: Partial<Doc> = {}): Doc => ({ groups: [], frames: [{ id: "f", name: "F", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "", components: [card], ...over });

describe("expanding an instance", () => {
  const inst = { ...standIn(card, 16, 100, "i"), overrides: { "btn/label": "Buy" } };
  const groups = expandInstances({ groups: [inst], components: [card] }, sizes);

  it("yields a container in its place and plain parts under composite ids", () => {
    expect(groups.map((g) => g.id)).toEqual(["i", "i/g1", "i/g2"]);
    expect(groups.flatMap((g) => g.items.map((it) => it.id)).slice(1)).toEqual(["i/cardItem", "i/btn"]);
    expect(groups.some((g) => g.instanceOf || g.overrides)).toBe(false);
    expect(groups[1]).toMatchObject({ x: 16, y: 100 });
    expect(groups[2]).toMatchObject({ x: 26, y: 160 });
  });

  it("applies overrides to the instance alone, and only those", () => {
    expect(groups[2].items[0].props?.label).toBe("Buy");
    expect(groups[1].items[0].props?.title).toBe("Hello");
    const other = expandInstances({ groups: [standIn(card, 0, 0, "o")], components: [card] }, sizes);
    expect(other[2].items[0].props?.label).toBe("Go");
  });

  it("follows the definition: a change reaches every instance not overriding it", () => {
    const changed: ComponentDef = { ...card, groups: card.groups.map((g) => (g.id === "g1" ? { ...g, items: [part("cardItem", "card", { title: "New" })] } : g)) };
    const both = expandInstances({ groups: [inst, standIn(card, 0, 300, "o")], components: [changed] }, sizes);
    expect(both.filter((g) => g.id.endsWith("/g1")).map((g) => g.items[0].props?.title)).toEqual(["New", "New"]);
    expect(both.find((g) => g.id === "i/g2")?.items[0].props?.label).toBe("Buy");
    expect(both.find((g) => g.id === "o/g2")?.items[0].props?.label).toBe("Go");
  });

  it("gives back the same array when there is nothing to expand", () => {
    const plain = [run("a", 0, 0, "button", "b")];
    expect(expandInstances({ groups: plain }, {})).toBe(plain);
    const d = doc({ groups: plain });
    expect(expandDoc(d, {})).toBe(d);
  });

  it("is as big as what it comes to, and takes what a part inside it comes to", () => {
    const wrapper = groups[0];
    expect(wrapper.items[0].props).toMatchObject({ width: 200, height: 100 });
    const wide = expandInstances({ groups: [inst], components: [card] }, { ...sizes, "i/btn": 400 });
    expect(wide[0].items[0].props).toMatchObject({ width: 410 });
  });

  it("carries what it points at among its parts with it", () => {
    const linked: ComponentDef = { ...card, groups: [run("g1", 0, 0, "card", "cardItem"), { ...run("g2", 0, 60, "button", "btn"), items: [{ ...part("btn", "button"), action: { to: "none", transition: "none", effects: [{ do: "hide", part: "cardItem" }] } }] }] };
    const out = expandInstances({ groups: [standIn(linked, 0, 0, "i")], components: [linked] }, sizes);
    expect(out[2].items[0].action?.effects?.[0]).toEqual({ do: "hide", part: "i/cardItem" });
  });

  it("lays out a definition that uses auto layout, in an instance standing in an auto layout", () => {
    const column = { ...part("col", "container", { layout: "column", gap: 8, padX: 0, padY: 0, hugHeight: true, hugWidth: true, width: 100, height: 40 }) };
    const def: ComponentDef = { id: "d", name: "Stack", w: 80, h: 90, groups: [{ id: "host", x: 0, y: 0, axis: "x", items: [column] }, { ...run("k1", 0, 0, "button", "a"), inFlow: "host" }, { ...run("k2", 0, 0, "button", "b"), inFlow: "host" }] };
    const widths = { a: 80, "a:h": 40, b: 80, "b:h": 40 };
    const outer: Group = { id: "outer", x: 0, y: 0, axis: "x", items: [part("o", "container", { layout: "column", gap: 10, padX: 0, padY: 0, hugHeight: true, hugWidth: true, width: 100, height: 40 })] };
    const d = doc({ components: [def], groups: [outer, { ...standIn(def, 0, 0, "i"), inFlow: "outer" }, { ...run("last", 0, 0, "button", "z"), inFlow: "outer" }] });
    const out = expandDoc(d, { ...widths, z: 80, "z:h": 40 }).groups;
    /* the instance's two buttons, then the part after it */
    expect(out.find((g) => g.id === "i/k1")?.y).toBe(0);
    expect(out.find((g) => g.id === "i/k2")?.y).toBe(48);
    expect(out.find((g) => g.id === "last")?.y).toBe(98);
    expect(out.find((g) => g.id === "outer")?.items[0].props?.height).toBe(138);
  });

  it("keeps the stand-in from holding anything, and draws it as one unit", () => {
    expect(holdsParts(standIn(card, 0, 0))).toBe(false);
    const view = canvasView({ groups: [inst], components: [card] }, sizes);
    expect(view.drawn.get("i")?.map((p) => [p.item.id, p.dx, p.dy])).toEqual([["i/cardItem", 0, 0], ["i/btn", 10, 60]]);
    expect(view.extra.map((e) => e.owner)).toEqual(["i", "i"]);
    expect(view.groups).not.toBe(undefined);
  });

  it("settles: its size written back once, then nothing more", () => {
    const first = canvasView({ groups: [standIn({ ...card, w: 50, h: 50 }, 0, 0, "i")], components: [card] }, sizes).groups;
    expect(first[0].items[0].props).toMatchObject({ width: 200, height: 100 });
    expect(canvasView({ groups: first, components: [card] }, sizes).groups).toBe(first);
  });
});

describe("nesting", () => {
  const inner: ComponentDef = { id: "inner", name: "Inner", w: 80, h: 40, groups: [run("ig", 0, 0, "button", "ib", { label: "Inner" })] };
  const outer: ComponentDef = { id: "outer", name: "Outer", w: 80, h: 40, groups: [standIn(inner, 0, 0, "ni")] };

  it("expands an instance inside a definition, and an override reaches through it", () => {
    const inst = { ...standIn(outer, 5, 5, "i"), overrides: { "ni/ib/label": "Deep" } };
    const out = expandInstances({ groups: [inst], components: [inner, outer] }, { ib: 80, "ib:h": 40 });
    expect(out.map((g) => g.id)).toEqual(["i", "i/ni", "i/ni/ig"]);
    expect(out[2].items[0].props?.label).toBe("Deep");
    expect(out[2]).toMatchObject({ x: 5, y: 5 });
  });

  it("refuses to put a definition inside itself, directly or through another", () => {
    expect(canNest([inner, outer], "inner", "inner")).toBe(false);
    expect(canNest([inner, outer], "inner", "outer")).toBe(false);
    expect(canNest([inner, outer], "outer", "inner")).toBe(true);
    expect(canNest([inner, outer], null, "outer")).toBe(true);
  });

  it("stops at a loop a file brought in, rather than running for ever", () => {
    const a: ComponentDef = { id: "a", name: "A", w: 40, h: 40, groups: [] };
    const b: ComponentDef = { id: "b", name: "B", w: 40, h: 40, groups: [standIn(a, 0, 0, "x")] };
    a.groups = [standIn(b, 0, 0, "y")];
    const out = expandInstances({ groups: [standIn(a, 0, 0, "i")], components: [a, b] }, {});
    /* a holds b holds a again: that second a is drawn empty */
    expect(out.map((g) => g.id)).toEqual(["i", "i/y", "i/y/x"]);
  });

  it("lists what can be overridden, through a nested instance", () => {
    const parts = overridableParts(outer, [inner, outer]);
    expect(parts.map((p) => p.path)).toEqual(["ni/ib"]);
    expect(parts[0].props.map((d) => d.key)).toContain("label");
    expect(overridableParts(card, [card]).flatMap((p) => p.props).every((d) => ["text", "icon", "image", "bool"].includes(d.kind))).toBe(true);
  });
});

describe("making and unmaking", () => {
  const screen = [run("a", 16, 100, "card", "ca", { title: "T" }), run("b", 26, 160, "button", "bb", { label: "B" }), run("z", 16, 400, "button", "other")];

  it("makes a definition relative to its own corner, and leaves an instance in the slot", () => {
    const made = makeComponent(screen, new Set(["a", "b"]), "Card", sizes, "new")!;
    expect(made.def).toMatchObject({ id: "new", name: "Card" });
    expect(made.def.groups.map((g) => [g.id, g.x, g.y])).toEqual([["a", 0, 0], ["b", 10, 60]]);
    expect(made.instance).toMatchObject({ x: 16, y: 100, instanceOf: "new" });
    expect(made.groups.map((g) => g.id)).toEqual([made.instance.id, "z"]);
  });

  it("gives a part let out of a layout's hands to the instance's slot", () => {
    const host: Group = { id: "h", x: 0, y: 0, axis: "x", items: [part("hi", "container", { layout: "column" })] };
    const kid = { ...run("k", 0, 0, "button", "ki"), inFlow: "h" };
    const made = makeComponent([host, kid], new Set(["k"]), "K", { ki: 80, "ki:h": 40 }, "d")!;
    expect(made.instance.inFlow).toBe("h");
    expect(made.def.groups[0].inFlow).toBeUndefined();
  });

  it("refuses a locked selection", () => {
    expect(makeComponent([{ ...run("a", 0, 0, "button", "x"), locked: true }], new Set(["a"]), "X", {})).toBeNull();
  });

  it("detaches into plain parts with the overrides kept, under fresh ids", () => {
    const inst = { ...standIn(card, 16, 100, "i"), overrides: { "btn/label": "Buy" } };
    const out = detachInstance([inst], "i", [card]);
    expect(out).toHaveLength(2);
    expect(out.some((g) => g.instanceOf)).toBe(false);
    expect(out[1].items[0].props?.label).toBe("Buy");
    expect(out[1]).toMatchObject({ x: 26, y: 160 });
    expect(out.flatMap((g) => g.items.map((it) => it.id))).not.toContain("btn");
  });

  it("detaching keeps a slot in a layout through a container when there are several parts, or the one part", () => {
    const inFlow = { ...standIn(card, 0, 0, "i"), inFlow: "h" };
    const several = detachInstance([inFlow], "i", [card]);
    expect(several[0].inFlow).toBe("h");
    expect(several[0].items[0].component).toBe("container");
    expect(several).toHaveLength(3);
    const one: ComponentDef = { ...card, groups: [card.groups[1]] };
    const single = detachInstance([{ ...standIn(one, 0, 0, "i"), inFlow: "h" }], "i", [one]);
    expect(single).toHaveLength(1);
    expect(single[0]).toMatchObject({ inFlow: "h" });
    expect(single[0].items[0].component).toBe("button");
  });

  it("leaves a nested instance an instance when detached", () => {
    const outer: ComponentDef = { id: "o", name: "O", w: 10, h: 10, groups: [standIn(card, 0, 0, "n")] };
    const out = detachInstance([standIn(outer, 0, 0, "i")], "i", [card, outer]);
    expect(out[0].instanceOf).toBe("c");
  });

  it("a definition with no instances stays; deleting one detaches its instances, in other definitions too", () => {
    const unused: ComponentDef = { id: "u", name: "U", w: 10, h: 10, groups: [] };
    const outer: ComponentDef = { id: "o", name: "O", w: 10, h: 10, groups: [standIn(card, 0, 0, "n")] };
    const out = removeComponent([standIn(card, 1, 1, "i")], [card, unused, outer], "c");
    expect(out.components.map((c) => c.id)).toEqual(["u", "o"]);
    expect(out.groups.some((g) => g.instanceOf)).toBe(false);
    expect(out.groups).toHaveLength(2);
    expect(out.components[1].groups.some((g) => g.instanceOf)).toBe(false);
  });

  it("an override set back to the definition's value stops being one", () => {
    expect(withOverride({ "a/b": "x" }, "a/b", "base", "base")).toBeUndefined();
    expect(withOverride(undefined, "a/b", "x", "base")).toEqual({ "a/b": "x" });
    expect(withOverride({ "a/b": "x", "c/d": true }, "a/b", undefined, "base")).toEqual({ "c/d": true });
  });

  it("reads a definition back from its editing screen, on its own corner", () => {
    const def = definitionFrom(card, [run("g1", 40, 40, "card", "cardItem"), run("g2", 60, 200, "button", "btn")], sizes);
    expect(def.groups.map((g) => [g.x, g.y])).toEqual([[0, 0], [20, 160]]);
    expect([def.w, def.h]).toEqual([200, 200]);
  });
});

describe("in a file and on a copy", () => {
  const d = doc({ groups: [{ ...standIn(card, 16, 100, "i"), overrides: { "btn/label": "Buy" } }] });

  it("saves and opens with everything in place", () => {
    const back = openProject(JSON.parse(JSON.stringify(projectFile(d))))!;
    expect(back.components).toEqual(d.components);
    expect(back.groups[0]).toMatchObject({ instanceOf: "c", overrides: { "btn/label": "Buy" } });
  });

  it("gives an instance written with no items the one it needs", () => {
    const file = { ...d, groups: [{ id: "i", x: 0, y: 0, axis: "x", instanceOf: "c", items: [] }] };
    const back = openProject(JSON.parse(JSON.stringify(file)))!;
    expect(back.groups[0].items).toHaveLength(1);
    expect(back.groups[0].items[0].component).toBe("container");
  });

  it("drops what is of the wrong kind and never refuses the file for it", () => {
    const base = JSON.parse(JSON.stringify(d));
    const cases: Record<string, unknown>[] = [
      { components: "nope" },
      { components: [{ id: 3 }, "x", { id: "ok", groups: "no" }] },
      { groups: [{ ...base.groups[0], overrides: 5 }] },
      { groups: [{ ...base.groups[0], overrides: { "a/b": {}, "c/d": "kept" } }] },
      { groups: [{ ...base.groups[0], instanceOf: 7 }] },
      { groups: [{ ...base.groups[0], instanceOf: "gone" }] },
      { groups: [{ id: "lost", x: 0, y: 0, axis: "x", instanceOf: "gone", items: [] }] },
    ];
    for (const over of cases) expect(openProject({ ...base, ...over })).not.toBeNull();
    expect(openProject({ ...base, components: "nope" })?.components).toBeUndefined();
    expect(openProject({ ...base, components: [{ id: 3 }, "x", { id: "ok", groups: "no" }] })?.components).toEqual([{ id: "ok", name: "", groups: [], w: 40, h: 40 }]);
    expect(openProject({ ...base, groups: [{ ...base.groups[0], overrides: { "a/b": {}, "c/d": "kept" } }] })?.groups[0].overrides).toEqual({ "c/d": "kept" });
    expect(openProject({ ...base, groups: [{ id: "lost", x: 0, y: 0, axis: "x", instanceOf: "gone", items: [] }] })?.groups).toEqual([]);
    expect(openProject({ ...base, groups: [{ ...base.groups[0], instanceOf: "gone" }] })?.groups[0].instanceOf).toBeUndefined();
  });

  it("travels in a link with its definitions, without a picked file's data", () => {
    const picked: Doc = { ...d, groups: [{ ...d.groups[0], overrides: { "a/src": "data:image/png;base64,xx", "btn/label": "Buy" } }] };
    const out = shareable(picked);
    expect(out.components?.[0].groups).toHaveLength(2);
    expect(out.groups[0].overrides).toEqual({ "btn/label": "Buy" });
  });

  it("a copy stays an instance of the same definition with the same overrides, under fresh ids", () => {
    const host: Group = { id: "h", x: 0, y: 0, axis: "x", items: [part("hi", "container", { layout: "column" })] };
    const units = [host, { ...d.groups[0], inFlow: "h" }];
    const [newHost, copy] = rekeyedAll(units, 10, 10);
    expect(copy.instanceOf).toBe("c");
    expect(copy.overrides).toEqual({ "btn/label": "Buy" });
    expect(copy.id).not.toBe("i");
    expect(copy.items[0].id).not.toBe(d.groups[0].items[0].id);
    expect(copy.inFlow).toBe(newHost.id);
    /* two of them expand apart, with no id shared */
    const all = expandInstances({ groups: [d.groups[0], copy], components: [card] }, sizes).flatMap((g) => g.items.map((it) => it.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("what is said about it", () => {
  const d = doc({ groups: [{ ...standIn(card, 16, 100, "i"), overrides: { "btn/label": "Buy" } }] });

  it.each([
    ["en", "instance of the component \"Card\""],
    ["ja", "コンポーネント「Card」のインスタンス"],
    ["zh", "组件“Card”的实例"],
    ["ko", "컴포넌트 \"Card\"의 인스턴스"],
  ] as const)("the prompt expands it and names it in %s", (lang, words) => {
    const text = buildPrompt(d, sizes, undefined, lang);
    expect(text).toContain(words);
    expect(text).toContain("Buy");
    expect(text).toContain("Hello");
  });

  it("printed code is plain parts", () => {
    const { code } = buildCode(d, sizes);
    expect(code).toContain("Buy");
    expect(code).toContain("Hello");
    expect(code).not.toContain("instanceOf");
  });
});
