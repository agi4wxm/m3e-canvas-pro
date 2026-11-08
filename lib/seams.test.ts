import { describe, expect, it } from "vitest";
import { TEMPLATES, instantiate, templateBySlug } from "../parts/templates";
import { defaultMeasures } from "../parts/templates/kit";
import { buildCode, buildScreens } from "./codegen";
import { canvasView, expandDoc } from "./expand";
import { showingGroups } from "./flow";
import { chooseBranch, goneIds, inRow, startState } from "./interact";
import { definitionFrom, detachInstance, expandInstances, makeComponent, rekeyedAll, removeComponent, standIn } from "./instances";
import { openProject, projectFile } from "./project";
import { runtimeSource } from "./runtimeSource";
import { readShareHash, shareLink, shareable } from "./share";
import { carryFrame, tidyFrame } from "./tidy";
import { type Action, type ComponentDef, type Doc, type Frame, type Group, DESKTOP_H, DESKTOP_W, GESTURE_BAR_H, STATUS_BAR_H, TABLET_H, TABLET_W, frameRect, frameSizeOf, groupBounds, makeItem, safeAreaOf } from "./tokens";
import { actionToSibling, createVariant } from "./variants";

/* Where the pieces meet: templates through Tidy and through a change of size, the copies of what
 * instances, hosts, docks and repeats hold, and a document using all of it through a file and a link. */

const part = (id: string, slug: string, props: Record<string, unknown> = {}, extra: Partial<Group["items"][0]> = {}) => ({ ...makeItem(slug), id, props, ...extra });
const run = (id: string, x: number, y: number, slug: string, itemId: string, props: Record<string, unknown> = {}, extra: Partial<Group> = {}): Group => ({ id, x, y, axis: "x", items: [part(itemId, slug, props)], ...extra });
const box = (id: string, x: number, y: number, props: Record<string, unknown> = {}, extra: Partial<Group> = {}): Group => run(id, x, y, "container", `${id}-p`, { label: "", fill: "none", border: "none", padX: 0, padY: 0, gap: 8, hugHeight: true, hugWidth: true, layout: "column", width: 300, height: 100, ...props }, extra);

const settle = (groups: Group[], m: Record<string, number>) => canvasView({ groups }, m).groups;

describe("a template screen", () => {
  it.each(TEMPLATES.map((t) => t.slug))("%s: Tidy leaves it where it stands", (slug) => {
    const { frames, groups } = instantiate(templateBySlug(slug)!, "en");
    const m = defaultMeasures(groups);
    for (const f of frames) {
      const after = tidyFrame(groups, f, frames, m);
      /* the screen's root is the screen: moving it would pull everything off the glass */
      if (after) {
        const before = new Map(groups.map((g) => [g.id, g]));
        const roots = after.filter((g) => !g.inFlow && frameOfRoot(g, f));
        for (const g of roots) expect({ x: g.x, y: g.y }, `${slug} ${g.id}`).toEqual({ x: before.get(g.id)!.x, y: before.get(g.id)!.y });
      }
    }
  });

  const frameOfRoot = (g: Group, f: Frame) => {
    const r = frameRect(f);
    return g.x >= r.l && g.x < r.r;
  };

  it("carried to a larger device, its bars span the screen and the one at the foot stays there", () => {
    const flow = TEMPLATES.find((t) => t.frame === "phone" && instantiate(t, "en").groups.some((g) => g.items[0].component === "navigation-bar"))!;
    const { frames, groups } = instantiate(flow, "en");
    const m = defaultMeasures(groups);
    const f = frames[0];
    const to: Frame = { ...f, w: TABLET_W, h: TABLET_H };
    const carried = carryFrame(groups, f, to, frames, m);
    const top = carried.groups.find((g) => g.items[0].component === "app-bar" && g.x === f.x);
    if (top) expect(top.items[0].props?.width).toBe(TABLET_W);
    const laid = settle(carried.groups, m);
    const bar = laid.find((g) => g.items[0].component === "navigation-bar" && g.x < f.x + TABLET_W);
    if (bar) expect(groupBounds(bar, m).b).toBeLessThanOrEqual(f.y + TABLET_H + 1);
  });

  it("its navigation becomes what a wide screen has when the screen becomes expanded", () => {
    const flow = TEMPLATES.find((t) => t.frame === "phone" && instantiate(t, "en").groups.some((g) => g.items[0].component === "navigation-bar"))!;
    const { frames, groups } = instantiate(flow, "en");
    const m = defaultMeasures(groups);
    const f = frames[0];
    const made = createVariant(groups, frames, f.id, "desktop", m, "big")!;
    const big = made.frames.find((x) => x.id === "big")!;
    expect(frameSizeOf(big)).toEqual({ w: DESKTOP_W, h: DESKTOP_H });
    const on = made.groups.filter((g) => g.x >= big.x && g.x < big.x + DESKTOP_W);
    expect(on.some((g) => g.items[0].component === "navigation-bar")).toBe(false);
    expect(on.some((g) => g.items[0].component === "navigation-rail")).toBe(true);
  });
});

describe("a template made into a component", () => {
  it("keeps its layout: the same parts in the same places, and one undo's worth of change", () => {
    const { frames, groups } = instantiate(templateBySlug("shop-flow")!, "en");
    const m = defaultMeasures(groups);
    const f = frames[0];
    /* the products' grid, with the cards it holds */
    const root = groups.find((g) => !g.inFlow && g.items[0].component === "container" && g.x >= f.x && g.x < f.x + 412)!;
    const made = makeComponent(groups, new Set([root.id]), "Whole", m, "c")!;
    expect(made.def.groups.length).toBeGreaterThan(3);
    const doc: Doc = { groups: made.groups, frames, components: [made.def], paletteKey: "purple", frame: "phone", title: "", brief: "" };
    const drawn = expandDoc(doc, m).groups;
    const before = settle(groups, m);
    for (const g of made.def.groups) {
      const was = before.find((x) => x.id === g.id)!;
      const now = drawn.find((x) => x.id === `${made.instance.id}/${g.id}`)!;
      expect(now, g.id).toBeTruthy();
      expect({ x: now.x, y: now.y }, g.id).toEqual({ x: was.x, y: was.y });
    }
  });
});

describe("copies", () => {
  const groups: Group[] = [
    box("host", 0, 0, { layout: "column" }, { repeat: { collection: "col" } }),
    run("kid", 0, 0, "text", "kid-t", { text: "{{name}}" }, { inFlow: "host" }),
    run("dock", 0, 200, "dock", "dock-p", { items: [{ label: "A" }, { label: "B" }], width: 300, height: 200 }),
    run("tab", 0, 240, "button", "tab-b", { label: "Go" }, { inFlow: "dock", pane: 1 }),
    { ...run("i", 0, 500, "container", "i-p", { label: "", width: 100, height: 40 }), instanceOf: "c", overrides: { "x/text": "Y" } },
  ];

  it("a host keeps its repeat, a dock its tabs and an instance its overrides, under new ids", () => {
    const copies = rekeyedAll(groups, 24, 24);
    const ids = new Set(groups.map((g) => g.id));
    for (const c of copies) expect(ids.has(c.id)).toBe(false);
    const [host, kid, dock, tab, inst] = copies;
    expect(host.repeat).toEqual({ collection: "col" });
    expect(kid.inFlow).toBe(host.id);
    expect(tab.inFlow).toBe(dock.id);
    expect(tab.pane).toBe(1);
    expect(inst.instanceOf).toBe("c");
    expect(inst.overrides).toEqual({ "x/text": "Y" });
    expect(inst.items[0].id).not.toBe("i-p");
  });

  it("what a copied part reaches for follows the copy, on the other side of the screen too", () => {
    const a: Group = { ...run("a", 0, 0, "button", "a-b", { label: "A" }), items: [{ ...part("a-b", "button", { label: "A" }), action: { to: "none", effects: [{ do: "toggle", part: "b-t" }], when: { filled: "b-t" } } }] };
    const b = run("b", 0, 60, "text-field", "b-t");
    const [ca, cb] = rekeyedAll([a, b], 0, 0, false);
    expect(ca.items[0].action?.effects?.[0]).toEqual({ do: "toggle", part: cb.items[0].id });
    expect(ca.items[0].action?.when).toEqual({ filled: cb.items[0].id });
  });
});

describe("a part on a row asks about its row", () => {
  it("a condition on a row's field shows it on that row alone", () => {
    const doc: Doc = {
      groups: [box("host", 0, 0, { layout: "column" }, { repeat: { collection: "col" } }), run("kid", 0, 0, "text", "kid-t", { text: "{{row.name}}" }, { inFlow: "host", showWhen: { expr: 'row.name == "B"' } })],
      frames: [{ id: "f", name: "F", x: 0, y: 0 }],
      collections: [{ id: "col", name: "C", fields: ["name"], rows: [["A"], ["B"]] }],
      paletteKey: "purple",
      frame: "phone",
      title: "",
      brief: "",
    };
    const m = { "kid-t": 40, "kid-t:h": 20 };
    const drawn = expandDoc(doc, m).groups;
    const gone = goneIds(drawn, startState(doc.vars, doc.collections), { groups: drawn, vars: doc.vars }, m);
    const shown = drawn.filter((g) => !gone.has(g.id) && g.items[0].component === "text").map((g) => g.items[0].props?.text);
    expect(shown).toEqual(["B"]);
  });
});

describe("what stands on a dock's other tab", () => {
  /* it is still where it was last laid out: far from the dock, here */
  const dock = run("dock", 100, 300, "dock", "dock-p", { items: [{ label: "A" }, { label: "B" }], width: 300, height: 200 });
  const shown = run("a", 100, 340, "text", "a-t", { text: "On A" }, { inFlow: "dock", pane: 0 });
  const stale = run("b", 0, 0, "text", "b-t", { text: "On B" }, { inFlow: "dock", pane: 1 });
  const m = { "a-t": 60, "a-t:h": 20, "b-t": 60, "b-t:h": 20 };

  it("says nothing of where a component made of it stands, or how big it is", () => {
    const made = makeComponent([dock, shown, stale], new Set(["dock"]), "Docked", m, "c")!;
    expect(made.instance).toMatchObject({ x: 100, y: 300 });
    expect({ w: made.def.w, h: made.def.h }).toEqual({ w: 300, h: 200 });
    expect(made.def.groups.find((g) => g.id === "dock")).toMatchObject({ x: 0, y: 0 });
  });

  it("says nothing of a definition's size when it comes back from its screen", () => {
    const def: ComponentDef = { id: "c", name: "D", w: 1, h: 1, groups: [] };
    const done = definitionFrom(def, [dock, shown, stale], m);
    expect({ w: done.w, h: done.h }).toEqual({ w: 300, h: 200 });
    expect(done.groups.find((g) => g.id === "dock")).toMatchObject({ x: 0, y: 0 });
  });

  it("says nothing of the size of an instance", () => {
    const def: ComponentDef = { id: "c", name: "D", w: 300, h: 200, groups: [{ ...dock, x: 0, y: 0 }, shown, { ...stale, x: 900, y: 900 }] };
    const drawn = expandInstances({ groups: [standIn(def, 10, 10, "i")], components: [def] }, m);
    expect(drawn[0].items[0].props).toMatchObject({ width: 300, height: 200 });
  });

  it("is brought round to when it is picked out, nested docks outermost first, and only then", () => {
    expect(showingGroups([dock, shown, stale], new Set(["a"]), m)).toEqual([dock, shown, stale]);
    const showing = showingGroups([dock, shown, stale], new Set(["b"]), m);
    expect(showing[0].items[0].props?.selected).toBe(1);
    const inner = run("inner", 0, 0, "dock", "inner-p", { items: [{ label: "X" }, { label: "Y" }], width: 200, height: 100 }, { inFlow: "dock", pane: 1 });
    const deep = run("deep", 0, 0, "text", "deep-t", { text: "Deep" }, { inFlow: "inner", pane: 1 });
    const both = showingGroups([dock, inner, deep], new Set(["deep"]), m);
    expect(both.find((g) => g.id === "dock")?.items[0].props?.selected).toBe(1);
    expect(both.find((g) => g.id === "inner")?.items[0].props?.selected).toBe(1);
  });
});

describe("what reaches for a part that becomes, or stops being, part of a component", () => {
  const button: Group = { ...run("btn", 0, 0, "button", "btn-b", { label: "Go" }), items: [part("btn-b", "button", { label: "Go" }, { action: { to: "none", effects: [{ do: "toggle", part: "t-t" }, { do: "setProp", part: "t-t", prop: "text", value: "New" }] } })] };
  const target = run("t", 0, 80, "text", "t-t", { text: "Words" });
  const m = { "btn-b": 80, "btn-b:h": 40, "t-t": 60, "t-t:h": 20 };

  it("goes on reaching it inside the instance, in the preview and in print", () => {
    const made = makeComponent([button, target], new Set(["t"]), "T", m, "c")!;
    const on = made.groups.find((g) => g.id === "btn")!;
    const inside = `${made.instance.id}/t-t`;
    expect(on.items[0].action?.effects?.[0]).toEqual({ do: "toggle", part: inside });
    const doc: Doc = { groups: made.groups, frames: [{ id: "f", name: "F", x: 0, y: 0 }], components: [made.def], paletteKey: "purple", frame: "phone", title: "", brief: "" };
    const drawn = expandDoc(doc, m).groups;
    expect(drawn.some((g) => g.items.some((it) => it.id === inside))).toBe(true);
    const { screens } = buildScreens(doc, m, { live: true });
    expect(screens[0].source).toMatch(/\{ do: "toggle", part: "/);
    expect(screens[0].source).toMatch(/visible\("/);
  });

  it("goes with a copy of the instance, on a copy of the screen", () => {
    const made = makeComponent([button, target], new Set(["t"]), "T", m, "c")!;
    const copies = rekeyedAll(made.groups, 500, 0, false);
    const inst = copies.find((g) => g.instanceOf)!;
    expect(copies.find((g) => !g.instanceOf)?.items[0].action?.effects?.[0]).toEqual({ do: "toggle", part: `${inst.id}/t-t` });
  });

  it("follows it back out when the instance is detached", () => {
    const made = makeComponent([button, target], new Set(["t"]), "T", m, "c")!;
    const back = detachInstance(made.groups, made.instance.id, [made.def]);
    const text = back.find((g) => g.items[0].component === "text")!;
    expect(back.find((g) => g.id === "btn")?.items[0].action?.effects?.[0]).toEqual({ do: "toggle", part: text.items[0].id });
  });

  it("follows it back out when the definition is deleted", () => {
    const made = makeComponent([button, target], new Set(["t"]), "T", m, "c")!;
    const back = removeComponent(made.groups, [made.def], made.def.id).groups;
    const text = back.find((g) => g.items[0].component === "text")!;
    expect(back.find((g) => g.id === "btn")?.items[0].action?.effects?.[1]).toMatchObject({ do: "setProp", part: text.items[0].id });
  });
});

describe("a screen going that has another size", () => {
  it("sends the way to it on to that size, in the branch that names it too", () => {
    const a: Action = { to: "gone", motion: { kind: "dissolve" }, when: { expr: "vars.v == 1" }, else: { to: "gone", motion: { kind: "instant" } } };
    expect(actionToSibling(a, "gone", "other")).toEqual({ ...a, to: "other", else: { to: "other", motion: { kind: "instant" } } });
    const elsewhere: Action = { to: "kept", motion: { kind: "instant" } };
    expect(actionToSibling(elsewhere, "gone", "other")).toEqual(elsewhere);
  });
});

describe("the row a tap came from, in printed code", () => {
  const row = (id: string, words: string, action: Group["items"][0]["action"]): Group => ({ id, x: 0, y: 0, axis: "x", inFlow: "host", items: [part(`${id}-b`, "button", { label: words }, { action })] });
  const doc: Doc = {
    groups: [
      box("host", 16, 40, {}, { repeat: { collection: "col" } }),
      row("open", "Open {{name}}", { to: "f2" }),
      run("said", 432, 40, "text", "said-t", { text: "You chose {{current.name}} at {{current.price}}" }),
      { ...run("say", 432, 100, "button", "say-b", { label: "Say" }), items: [part("say-b", "button", { label: "Say" }, { action: { to: "none", effects: [{ do: "snackbar", message: "Said {{current.name}}" }] } })] },
    ],
    frames: [{ id: "f", name: "List", x: 0, y: 0 }, { id: "f2", name: "Detail", x: 432, y: 0 }],
    collections: [{ id: "col", name: "C", fields: ["name", "price"], rows: [["Apple", "1"], ["Pear", "2"]] }],
    paletteKey: "purple",
    frame: "phone",
    title: "",
    brief: "",
  };
  const m = { "open-b": 100, "open-b:h": 40, "said-t": 100, "said-t:h": 20, "say-b": 100, "say-b:h": 40 };
  const built = buildScreens(doc, m, { live: true });
  const list = built.screens.find((s) => s.key === "list")!.source;
  const detail = built.screens.find((s) => s.key === "detail")!.source;

  it("reads the row at run time: its words through the runtime's current row, a tap's through the interpreter", () => {
    expect(detail).not.toContain("You chose {{current");
    expect(detail).toContain("current.name");
    expect(detail).toContain("current.price");
    expect(detail).toMatch(/useApp\(\)/);
    /* the interpreter fills {{current.field}} from the row last tapped, which the runtime hands every tap */
    expect(detail).toContain('{ do: "snackbar", message: "Said {{current.name}}" }');
    expect(runtimeSource(built.runtime)).toContain("void run(action, host, { ...tap, current: live.current.current })");
  });

  it("a tap on a row says which row it was, before it goes", () => {
    expect(list).toContain('pickRow({"name":"Apple","price":"1"})');
    expect(list).toContain('pickRow({"name":"Pear","price":"2"})');
    expect(list).toMatch(/pickRow\(\{"name":"Apple","price":"1"\}\); act\(listScreenActions\.\w+, /);
  });

  it("starts on the first row, so a screen opened directly is not blank", () => {
    expect(built.runtime.current).toEqual({ name: "Apple", price: "1" });
    expect(runtimeSource(built.runtime)).toContain('START_CURRENT: Record<string, string> = {"name":"Apple","price":"1"}');
  });

  it("has nothing to say where nothing reads it", () => {
    const quiet = { ...doc, groups: doc.groups.filter((g) => g.id !== "said" && g.id !== "say") };
    expect(buildScreens(quiet, m, { live: true }).screens[0].source).not.toContain("pickRow");
  });

  it("settles a condition on the row's own fields, one row at a time", () => {
    const asks: Doc = {
      ...doc,
      groups: [
        box("host", 16, 40, {}, { repeat: { collection: "col" } }),
        row("say", "Say", { to: "none", when: { expr: 'row.name == "Pear"' }, effects: [{ do: "snackbar", message: "Pear only" }], else: { to: "none", effects: [{ do: "snackbar", message: "Not {{row.name}}" }] } }),
        { ...run("tag", 0, 0, "text", "tag-t", { text: "Tag" }, { inFlow: "host" }), showWhen: { expr: 'row.name != "Apple"' } },
      ],
      frames: [doc.frames[0]],
    };
    const source = buildScreens(asks, { "say-b": 80, "say-b:h": 40, "tag-t": 40, "tag-t:h": 20 }, { live: true }).screens[0].source;
    expect(source).toContain('{ do: "snackbar", message: "Not Apple" }');
    expect(source).toContain('{ do: "snackbar", message: "Pear only" }');
    expect(source).not.toContain("when:");
    expect(source).not.toContain("vars");
    expect(source).not.toContain("false &&");
  });

  it("writes the row's fields into a condition that reads the app's state too, which its runtime cannot read a row for", () => {
    const asks: Doc = {
      ...doc,
      vars: [{ id: "n", name: "n", type: "number", value: 0 }],
      groups: [box("host", 16, 40, {}, { repeat: { collection: "col" } }), row("say", "Say", { to: "none", when: { expr: 'row.name == "Pear" && vars.n > 0' }, effects: [{ do: "snackbar", message: "Pear" }] })],
      frames: [doc.frames[0]],
    };
    const source = buildScreens(asks, { "say-b": 80, "say-b:h": 40 }, { live: true }).screens[0].source;
    expect(source).toContain('when: { expr: "\\"Pear\\" == \\"Pear\\" && vars.n > 0" }');
    expect(source).toContain('when: { expr: "\\"Apple\\" == \\"Pear\\" && vars.n > 0" }');
    expect(source).not.toContain("row.name");
  });
});

describe("what a part in a row runs in the preview", () => {
  it("reads the row it came from, in what it says and what it sets", () => {
    const s = inRow(startState([], [{ id: "c", name: "C", fields: ["name"], rows: [["Apple"], ["Pear"]] }]), { name: "Pear" });
    const a = { to: "none", effects: [{ do: "snackbar" as const, message: "Said {{current.name}}" }] };
    expect(chooseBranch(a, s, { groups: [] })?.effects?.[0]).toEqual({ do: "snackbar", message: "Said Pear" });
    const plain = { to: "none" };
    expect(chooseBranch(plain, s, { groups: [] })).toBe(plain);
  });
});

describe("an instance a layout places, in printed code", () => {
  const def: ComponentDef = { id: "c", name: "Card", w: 120, h: 40, groups: [run("t", 0, 0, "text", "t-t", { text: "Inner" })] };
  const doc: Doc = {
    groups: [box("host", 16, 40), run("before", 0, 0, "text", "before-t", { text: "Before" }, { inFlow: "host", hidden: true }), { ...standIn(def, 0, 0, "i"), inFlow: "host" }],
    frames: [{ id: "f", name: "F", x: 0, y: 0 }],
    components: [def],
    paletteKey: "purple",
    frame: "phone",
    title: "",
    brief: "",
  };
  const source = buildScreens(doc, { "t-t": 120, "t-t:h": 40, "before-t": 80, "before-t:h": 20 }, { live: true }).screens[0].source;

  it("takes its parts along inside its box, so they move when the layout does", () => {
    const box = source.indexOf('className="relative shrink-0"');
    expect(box).toBeGreaterThan(0);
    expect(source.indexOf("Inner")).toBeGreaterThan(box);
    expect(source.match(/Inner/g)).toHaveLength(1);
    /* placed from the box's own corner, not the screen's */
    expect(source.slice(box)).toContain("left-[0px] top-[0px]");
  });
});

describe("what a screen shows only while it is worked on", () => {
  const frame: Frame = { id: "f", name: "F", x: 0, y: 0, deviceBars: true, backgroundImage: "data:image/png;base64,AAAA", backgroundOpacity: 0.4 };
  const doc: Doc = { groups: [run("a", 16, 40, "text", "a-t", { text: "Words" })], frames: [frame], paletteKey: "purple", frame: "phone", title: "", brief: "" };

  it("is off by default, and a desktop screen has no device bars to show", () => {
    expect(safeAreaOf({ id: "p", name: "", x: 0, y: 0 })).toEqual({ t: 0, b: 0 });
    expect(safeAreaOf({ id: "p", name: "", x: 0, y: 0, deviceBars: true })).toEqual({ t: STATUS_BAR_H, b: GESTURE_BAR_H });
    expect(safeAreaOf({ id: "p", name: "", x: 0, y: 0, w: TABLET_W, h: TABLET_H, deviceBars: true }).t).toBe(STATUS_BAR_H);
    expect(safeAreaOf({ id: "d", name: "", x: 0, y: 0, w: DESKTOP_W, h: DESKTOP_H, deviceBars: true })).toEqual({ t: 0, b: 0 });
  });

  it("Tidy keeps between the device's bars", () => {
    const bar = run("bar", 0, 300, "app-bar", "bar-p", { title: "T", width: 412 });
    const nav = run("nav", 0, 300, "navigation-bar", "nav-p", { width: 412 });
    const m = { "bar-p": 412, "bar-p:h": 64, "nav-p": 412, "nav-p:h": 80 };
    const on = tidyFrame([bar, nav], { id: "f", name: "F", x: 0, y: 0, deviceBars: true }, [{ id: "f", name: "F", x: 0, y: 0, deviceBars: true }], m)!;
    expect(on.find((g) => g.id === "bar")?.y).toBe(STATUS_BAR_H);
    expect(on.find((g) => g.id === "nav")?.y).toBe(892 - GESTURE_BAR_H - 80);
    const off = tidyFrame([bar, nav], { id: "f", name: "F", x: 0, y: 0 }, [{ id: "f", name: "F", x: 0, y: 0 }], m)!;
    expect(off.find((g) => g.id === "bar")?.y).toBe(0);
    expect(off.find((g) => g.id === "nav")?.y).toBe(892 - 80);
  });

  it("is kept in a file, and a wrong value of it is dropped", () => {
    expect(openProject(JSON.parse(JSON.stringify(projectFile(doc))))?.frames[0]).toEqual(frame);
    const wrong = openProject({ ...doc, frames: [{ ...frame, deviceBars: "yes", backgroundImage: 3, backgroundOpacity: 7 }] })?.frames[0];
    expect(wrong?.deviceBars).toBeUndefined();
    expect(wrong?.backgroundImage).toBeUndefined();
    expect(wrong?.backgroundOpacity).toBe(1);
  });

  it("a picked file stays out of a link, as a part's does; a web address does not", () => {
    expect(shareable(doc).frames[0].backgroundImage).toBeUndefined();
    expect(shareable(doc).frames[0].deviceBars).toBe(true);
    const web = { ...doc, frames: [{ ...frame, backgroundImage: "https://x.test/a.png" }] };
    expect(shareable(web).frames[0].backgroundImage).toBe("https://x.test/a.png");
  });

  it("is never printed in code", () => {
    const code = buildCode(doc, {}).code;
    expect(code).not.toContain("data:image");
    expect(code).not.toContain("9:41");
    expect(buildScreens(doc, {}, { live: true }).screens[0].source).not.toContain("data:image");
  });

  it("another size of the screen leaves the mockup behind, a mockup being of one size", () => {
    const made = createVariant(doc.groups, doc.frames, "f", "tablet", {}, "big")!;
    const big = made.frames.find((f) => f.id === "big")!;
    expect(big.backgroundImage).toBeUndefined();
    expect(big.deviceBars).toBe(true);
  });
});

describe("a document using everything", () => {
  const def: ComponentDef = { id: "c", name: "Card", w: 200, h: 100, groups: [box("col", 0, 0), run("t", 0, 0, "text", "tt", { text: "Words" }, { inFlow: "col" }), run("s", 0, 0, "text", "st", { text: "Secret" }, { inFlow: "col", hidden: true })] };
  const doc: Doc = {
    groups: [{ ...standIn(def, 16, 40, "i"), overrides: { "tt/text": "Mine" } }, box("host", 16, 300, {}, { repeat: { collection: "col", limit: 2 } }), run("kid", 0, 0, "text", "kt", { text: "{{name}}" }, { inFlow: "host" }), run("dock", 500, 40, "dock", "dp", { items: [{ label: "A" }, { label: "B" }], width: 300, height: 200 }), run("tab", 0, 0, "text", "tabt", { text: "On B" }, { inFlow: "dock", pane: 1 })],
    frames: [{ id: "f", name: "F", x: 0, y: 0 }, { id: "f2", name: "F", x: 484, y: 0, w: TABLET_W, h: TABLET_H, variantOf: "f", place: "center", length: TABLET_H * 2 }],
    components: [def],
    collections: [{ id: "col", name: "C", fields: ["name"], rows: [["A"], ["B"]] }],
    vars: [{ id: "v", name: "n", type: "number", value: 1 }],
    paletteKey: "teal",
    frame: "phone",
    title: "T",
    brief: "B",
  };

  it("comes back from a file as it went", () => {
    expect(openProject(JSON.parse(JSON.stringify(projectFile(doc))))).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it("comes back from a link as it went", async () => {
    const link = await shareLink(doc, "https://x.test/");
    const back = await readShareHash(link.slice(link.indexOf("#")));
    expect(back).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it("settles: laying it out again changes nothing", () => {
    const m = defaultMeasures([...doc.groups, ...def.groups]);
    const once = canvasView(doc, m).groups;
    const twice = canvasView({ ...doc, groups: once }, m).groups;
    expect(twice).toBe(once);
  });
});
