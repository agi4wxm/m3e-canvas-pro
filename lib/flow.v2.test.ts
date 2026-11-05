import { describe, expect, it } from "vitest";
import { flowClasses, type FlowValues } from "../parts/flow";
import { tidyUpParts } from "./align";
import { buildCode } from "./codegen";
import { arrangeFlows, flowOf, settleInFlow, suggestAutoLayout } from "./flow";
import { makeItem, type Doc, type Group, type Item } from "./tokens";

/* Auto layout v2: what Figma's auto layout does that the first round did not, on the canvas and in the printed code. */

const part = (slug: string, id: string, props: Record<string, unknown> = {}, more: Partial<Item> = {}): Item => ({ ...makeItem(slug), id, props, ...more });
const host = (id: string, props: Record<string, unknown>, x = 0, y = 0): Group => ({ id, x, y, axis: "x", items: [part("container", `i-${id}`, { width: 400, height: 300, padX: 10, padY: 20, gap: 8, ...props })] });
/** a button measured at 100 by 40, in the layout `inFlow` */
const kid = (id: string, inFlow?: string, more: Partial<Item> = {}, x = 0, y = 0): Group => ({ id, x, y, axis: "x", inFlow, items: [part("button", `i-${id}`, { label: id }, more)] });
const widths = (gs: Group[], extra: Record<string, number> = {}) => ({ ...Object.fromEntries(gs.flatMap((g) => g.items.flatMap((it) => (it.component === "button" ? [[it.id, 100], [`${it.id}:h`, 40]] : [])))), ...extra });
const run = (gs: Group[], extra: Record<string, number> = {}) => arrangeFlows(gs, widths(gs, extra));
const at = (gs: Group[], id: string) => {
  const g = gs.find((x) => x.id === id)!;
  return [g.x, g.y];
};
const propsOf = (gs: Group[], id: string) => gs.find((x) => x.id === id)!.items[0].props ?? {};
const doc = (groups: Group[]): Doc => ({ groups, frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" });
const code = (gs: Group[], extra: Record<string, number> = {}) => buildCode(doc(gs), widths(gs, extra)).code;

describe("padding on each side", () => {
  it("takes a side where it is set, and padX / padY elsewhere", () => {
    const out = run([host("h", { layout: "column", padTop: 4, padLeft: 30 }), kid("a", "h")]);
    expect(at(out, "a")).toEqual([30, 4]);
    expect(flowOf(out[0])!.pad).toEqual({ t: 4, r: 10, b: 20, l: 30 });
  });

  it("hugs its contents with each side counted", () => {
    const out = run([host("h", { layout: "row", hugWidth: true, hugHeight: true, padTop: 4, padRight: 6, padBottom: 8, padLeft: 2 }), kid("a", "h")]);
    expect(propsOf(out, "h")).toMatchObject({ width: 100 + 6 + 2, height: 40 + 4 + 8 });
  });

  it("leaves a document from before as it was: no side set reads as padX and padY", () => {
    expect(flowOf(host("h", { layout: "row" }))!.pad).toEqual({ t: 20, r: 10, b: 20, l: 10 });
    expect(flowOf(host("h", { layout: "row" }))!.gapY).toBe(8);
  });
});

describe("a separate gap between lines", () => {
  it("wraps a row with its own gap down, and hugs to it", () => {
    const out = run([host("h", { layout: "row", wrap: true, width: 240, gap: 8, gapY: 24, hugHeight: true }), kid("a", "h"), kid("b", "h"), kid("c", "h")]);
    expect(at(out, "b")).toEqual([118, 20]);
    expect(at(out, "c")).toEqual([10, 20 + 40 + 24]);
    expect(propsOf(out, "h").height).toBe(20 + 40 + 24 + 40 + 20);
  });

  it("spaces a grid's rows by it", () => {
    const out = run([host("h", { layout: "grid", columns: 2, width: 228, gap: 8, gapY: 32 }), kid("a", "h"), kid("b", "h"), kid("c", "h")]);
    expect(at(out, "c")).toEqual([10, 20 + 40 + 32]);
  });
});

describe("distribution", () => {
  /* three parts of 100 in 380 of room: 80 spare */
  const three = (justify: string) => run([host("h", { layout: "row", justify, gap: 0 }), kid("a", "h"), kid("b", "h"), kid("c", "h")]);
  it("spaces around: half a share at each end", () => {
    const out = three("around");
    expect([at(out, "a")[0], at(out, "b")[0], at(out, "c")[0]]).toEqual([23, 150, 277]);
  });
  it("spaces evenly: the same at the ends as between", () => {
    const out = three("evenly");
    expect([at(out, "a")[0], at(out, "b")[0], at(out, "c")[0]]).toEqual([30, 150, 270]);
  });
});

describe("baseline", () => {
  it("lines parts up on their first line of text, the way the browser does", () => {
    const gs = [host("h", { layout: "row", align: "baseline", gap: 0 }), kid("a", "h"), kid("b", "h")];
    /* a's text sits 30 down, b's 12: b goes 18 lower */
    const out = run(gs, { "i-a:base": 30, "i-b:base": 12 });
    expect(at(out, "a")[1]).toBe(20);
    expect(at(out, "b")[1]).toBe(38);
  });

  it("takes the foot of a part that has no text, as the browser does", () => {
    const out = run([host("h", { layout: "row", align: "baseline", hugHeight: true }), kid("a", "h"), kid("b", "h")], { "i-a:base": 30 });
    expect(at(out, "b")[1] + 40).toBe(at(out, "a")[1] + 30);
  });
});

describe("how each part is sized", () => {
  it("fills along the run and across it, each kept to its limits", () => {
    const out = run([host("h", { layout: "row" }), kid("a", "h", { flowSize: { w: "fill", h: "fill" }, flowMax: { w: 150 } }), kid("b", "h", { flowSize: { w: "fill" } })]);
    /* 380 of room, less the gap and what a may take */
    expect(propsOf(out, "a")).toMatchObject({ width: 150 });
    expect(propsOf(out, "b")).toMatchObject({ width: 380 - 8 - 150 });
    expect(propsOf(out, "a").height).toBeUndefined();
  });

  it("keeps a fixed part out of the container's stretch", () => {
    const out = run([host("h", { layout: "column", align: "stretch" }), kid("a", "h"), kid("b", "h", { flowSize: { w: "fixed" } })]);
    expect(propsOf(out, "a").width).toBe(380);
    expect(propsOf(out, "b").width).toBeUndefined();
  });

  it("stands one part elsewhere across the run", () => {
    const out = run([host("h", { layout: "column", align: "start" }), kid("a", "h"), kid("b", "h", { alignSelf: "end" }), kid("c", "h", { alignSelf: "center" })]);
    expect([at(out, "a")[0], at(out, "b")[0], at(out, "c")[0]]).toEqual([10, 10 + 380 - 100, 10 + 140]);
  });

  it("lets a layout inside hug or fill, whatever its own switches say", () => {
    const inner = (size: Item["flowSize"]): Group => ({ ...host("n", { layout: "row", padX: 0, padY: 0, width: 50, height: 40 }), inFlow: "o", items: [part("container", "i-n", { layout: "row", padX: 0, padY: 0, gap: 0, width: 50, height: 40 }, { flowSize: size })] });
    const hugs = run([host("o", { layout: "column" }), inner({ w: "hug" }), kid("a", "n"), kid("b", "n")]);
    expect(propsOf(hugs, "n").width).toBe(200);
    const fills = run([host("o", { layout: "column" }), inner({ w: "fill" }), kid("a", "n")]);
    expect(propsOf(fills, "n").width).toBe(380);
  });

  it("fills across a container that hugs, to the size the other parts give it (Figma's fill container)", () => {
    const gs = [host("o", { layout: "column", hugWidth: true, hugHeight: true }), kid("a", "o"), { ...host("n", { layout: "row", padX: 0, padY: 0, width: 50, height: 40 }), inFlow: "o", items: [part("container", "i-n", { layout: "row", padX: 0, padY: 0, gap: 0, width: 50, height: 40, justify: "between" }, { flowSize: { w: "fill" } })] }];
    const wide = { ...gs[1], items: [part("button", "i-a", { label: "a" })] };
    const out = run([gs[0], wide, gs[2]], { "i-a": 260 });
    expect(propsOf(out, "o").width).toBe(260 + 20);
    expect(propsOf(out, "n").width).toBe(260);
  });

  it("takes columns of a grid by its span", () => {
    const out = run([host("h", { layout: "grid", columns: 3, width: 336, gap: 8, align: "stretch" }), kid("a", "h", { flowSpan: 2 }), kid("b", "h"), kid("c", "h", { flowSpan: 3 })]);
    /* cells of 100: a takes two and the gap between them, c a whole row */
    expect(propsOf(out, "a").width).toBe(208);
    expect(at(out, "b")[0]).toBe(10 + 216);
    expect(at(out, "c")).toEqual([10, 20 + 40 + 8]);
    expect(propsOf(out, "c").width).toBe(316);
  });
});

describe("a part that stays where it was put", () => {
  it("takes no place in the run and moves with its container", () => {
    const gs = [host("o", { layout: "column", hugHeight: true, padY: 0 }), { ...host("h", { layout: "row", hugWidth: true, hugHeight: true, padX: 0, padY: 0 }, 500, 500), inFlow: "o" }, kid("a", "h"), kid("badge", "h", { flowAbsolute: true }, 590, 495)];
    const out = run(gs);
    /* the row hugs a alone, and the badge kept its place on it as the row moved from 500,500 to 10,0 */
    expect(propsOf(out, "h").width).toBe(100);
    expect(at(out, "h")).toEqual([10, 0]);
    expect(at(out, "badge")).toEqual([100, -5]);
    expect(run(out)).toBe(out);
  });

  it("goes back to the run when it is carried out of the layout", () => {
    const gs = [host("h", { layout: "row" }), kid("a", "h", { flowAbsolute: true }, 900, 900)];
    const out = settleInFlow(gs, "a", widths(gs));
    expect(out.find((g) => g.id === "a")!.inFlow).toBeUndefined();
    expect(out.find((g) => g.id === "a")!.items[0].flowAbsolute).toBeUndefined();
  });
});

describe("printed code", () => {
  const base: FlowValues = { dir: "row", gap: 8, gapY: 8, padX: 16, padY: 16, pad: { t: 16, r: 16, b: 16, l: 16 }, align: "start", justify: "start", wrap: false, columns: 2 };
  it("says each new option in classes", () => {
    expect(flowClasses({ ...base, pad: { t: 4, r: 8, b: 12, l: 16 } })).toContain("pt-[4px] pr-[8px] pb-[12px] pl-[16px]");
    expect(flowClasses({ ...base, wrap: true, gapY: 24 })).toContain("gap-x-[8px] gap-y-[24px]");
    expect(flowClasses({ ...base, gapY: 24 })).toContain("gap-[8px]");
    expect(flowClasses({ ...base, dir: "grid", gapY: 20 })).toMatch(/^grid grid-cols-\[repeat\(2,minmax\(0,1fr\)\)\] gap-x-\[8px\] gap-y-\[20px\]/);
    expect(flowClasses({ ...base, justify: "around" })).toContain("justify-around");
    expect(flowClasses({ ...base, justify: "evenly" })).toContain("justify-evenly");
    expect(flowClasses({ ...base, align: "baseline" })).toContain("items-baseline");
    expect(flowClasses({ ...base, dir: "grid", align: "center" })).toContain("items-center justify-items-center");
  });

  it("prints what each part asks of its layout", () => {
    const gs = [
      host("h", { layout: "row", align: "stretch" }, 8, 8),
      kid("fill", "h", { flowSize: { w: "fill" }, flowMin: { w: 80 }, flowMax: { w: 240 } }, 18, 28),
      kid("fixed", "h", { flowSize: { h: "fixed" } }, 130, 28),
      kid("self", "h", { alignSelf: "center", flowSize: { h: "hug" } }, 240, 28),
      kid("loose", "h", { flowAbsolute: true }, 300, 0),
    ];
    const out = code(gs);
    expect(out).toContain("min-w-0 flex-1 min-w-[80px] max-w-[240px]");
    expect(out).toContain('className="self-start"');
    expect(out).toContain('className="self-center"');
    /* the loose part is placed from the container's corner, and the container is what it is placed in */
    expect(out).toContain("absolute left-[292px] top-[-8px]");
    expect(out).toMatch(/flex flex-row gap-\[8px\] px-\[10px\] py-\[20px\] items-stretch[^"]* relative/);
  });

  it("prints a grid part's span and a nested layout that fills", () => {
    const gs = [host("g", { layout: "grid", columns: 3 }), kid("a", "g", { flowSpan: 2 }), { ...host("n", { layout: "column" }), inFlow: "g", items: [part("container", "i-n", { layout: "column", width: 100, height: 40 }, { flowSize: { w: "fill" } })] }];
    const out = code(gs);
    expect(out).toContain('className="col-span-2"');
    expect(out).toContain("justify-self-stretch");
  });
});

describe("suggest auto layout", () => {
  let n = 0;
  const newId = () => `box${++n}`;
  const at4 = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}): Group => ({ id, x, y, axis: "x", items: [part(slug, id, props)] });

  it("turns a screen's parts into nested layouts that keep them where they stand", () => {
    n = 0;
    const gs = [
      at4("title", "text", 16, 84, { text: "Account", width: 160 }),
      at4("i1", "icon-button", 300, 78),
      at4("i2", "icon-button", 352, 80),
      at4("r1", "item", 16, 134, { width: 380 }),
      at4("r2", "item", 18, 207, { width: 376 }),
      at4("c1", "card", 16, 300, { width: 176 }),
      at4("c2", "card", 208, 304, { width: 176 }),
      at4("c3", "card", 18, 470, { width: 176 }),
      at4("c4", "card", 206, 466, { width: 176 }),
    ];
    const w = { title: 160, "title:h": 28, i1: 40, "i1:h": 40, i2: 40, "i2:h": 40, r1: 380, "r1:h": 64, r2: 376, "r2:h": 64, c1: 176, "c1:h": 150, c2: 176, "c2:h": 150, c3: 176, "c3:h": 150, c4: 176, "c4:h": 150 };
    const made = suggestAutoLayout(gs, new Set(gs.map((g) => g.id)), w, newId)!;
    /* the tree, outermost first, each container followed by what it holds */
    const tree = (id?: string, depth = 0): string[] =>
      made.groups.filter((g) => g.inFlow === id && (id || g.id.startsWith("box"))).flatMap((g) => {
        const p = g.items[0].props ?? {};
        const name = g.id.startsWith("box") ? `${p.layout}${p.justify === "between" ? " between" : ""}${p.columns ? ` ${p.columns}` : ""}` : g.id;
        return [`${"  ".repeat(depth)}${name}`, ...tree(g.id, depth + 1)];
      });
    expect(tree()).toEqual(["column", "  row between", "    title", "    row", "      i1", "      i2", "  r1", "  r2", "  grid 2", "    c1", "    c2", "    c3", "    c4"]);
    const top = made.groups.find((g) => g.id.startsWith("box") && !g.inFlow)!;
    expect(top.items[0].props).toMatchObject({ gap: 16, align: "start", hugWidth: true, hugHeight: true, label: "", fill: "none", border: "none" });
    /* the row with its ends apart fills the column, so the icons stay at the end */
    expect(made.groups.find((g) => g.items[0].props?.justify === "between")!.items[0].flowSize).toEqual({ w: "fill" });
    expect(made.itemId).toBe(top.items[0].id);
    /* laid out, everything stays on the left edge it shared, and the grid is even */
    let laid = made.groups;
    for (let i = 0; i < 4; i++) laid = arrangeFlows(laid, w);
    const x = (id: string) => laid.find((g) => g.id === id)!.x;
    expect([x("title"), x("r1"), x("r2"), x("c1"), x("c3")]).toEqual([16, 16, 16, 16, 16]);
    expect(x("i2") + 40).toBe(16 + 380);
    expect(x("c2")).toBe(x("c4"));
  });

  it("gives a lone container the layout itself, padded as far in as its contents stand", () => {
    n = 0;
    const box: Group = { id: "card", x: 0, y: 0, axis: "x", items: [part("container", "card", { width: 300, height: 200, layout: "free" })] };
    const gs = [box, at4("a", "button", 24, 20), at4("b", "button", 24, 72)];
    const w = { card: 300, "card:h": 200, a: 100, "a:h": 40, b: 100, "b:h": 40 };
    const made = suggestAutoLayout(gs, new Set(["card"]), w, newId)!;
    const card = made.groups.find((g) => g.id === "card")!;
    expect(card.items[0].props).toMatchObject({ layout: "column", gap: 12, padTop: 20, padLeft: 24, padRight: 176, padBottom: 88, width: 300, height: 200 });
    expect(made.groups.filter((g) => g.inFlow === "card").map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("has nothing to say about one part alone", () => {
    const gs = [at4("a", "button", 0, 0)];
    expect(suggestAutoLayout(gs, new Set(["a"]), { a: 100, "a:h": 40 }, newId)).toBeNull();
  });

  it("can move to another part in one place: the bare props it builds with", async () => {
    const { LAYOUT_BOX } = await import("./flow");
    expect(LAYOUT_BOX.slug).toBe("container");
  });
});

describe("tidy up a selection", () => {
  const sel = (...ids: string[]) => new Set(ids.map((x) => `i-${x}`));
  it("makes a messy row even, from where its first part stands", () => {
    const gs = [kid("a", undefined, {}, 10, 10), kid("b", undefined, {}, 118, 16), kid("c", undefined, {}, 235, 7)];
    const out = tidyUpParts(gs, sel("a", "b", "c"), widths(gs))!;
    /* gaps of 8 and 17: 12 on the 4dp grid between them; the row lines up on its middle */
    expect(out.map((g) => [g.x, g.y])).toEqual([
      [10, 7],
      [10 + 100 + 12, 7],
      [10 + 224, 7],
    ]);
  });

  it("makes a grid of what stands in rows", () => {
    const gs = [kid("a", undefined, {}, 0, 0), kid("b", undefined, {}, 115, 5), kid("c", undefined, {}, 3, 60), kid("d", undefined, {}, 110, 58)];
    const out = tidyUpParts(gs, sel("a", "b", "c", "d"), widths(gs))!;
    const pos = Object.fromEntries(out.map((g) => [g.id, [g.x, g.y]]));
    expect(pos.b[0]).toBe(pos.d[0]);
    expect(pos.a[1]).toBe(pos.b[1]);
    expect(pos.c[1]).toBe(pos.d[1]);
    expect(pos.c[1] - (pos.a[1] + 40)).toBe(12);
  });

  it("does nothing with one part, or with what is already even", () => {
    const gs = [kid("a", undefined, {}, 0, 0), kid("b", undefined, {}, 116, 0)];
    expect(tidyUpParts(gs, sel("a"), widths(gs))).toBeNull();
    expect(tidyUpParts(gs, sel("a", "b"), widths(gs))).toBeNull();
  });
});
