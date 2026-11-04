import { describe, expect, it } from "vitest";
import { openProject } from "../../lib/project";
import { buildPrompt } from "../../lib/prompt";
import { groupBounds, heldBy, holdsParts, makeItem, sizeOf, underWhatItHolds, type Doc, type Group, type Item } from "../../lib/tokens";
import { PARTS } from "../registry";

const panel = (id: string, x: number, y: number, width = 300, height = 200): Group => ({ id, x, y, axis: "x", items: [{ ...makeItem("component", "layout/container"), id: `i-${id}`, props: { width, height } }] });
const part = (id: string, x: number, y: number): Group => ({ id, x, y, axis: "x", items: [{ ...makeItem("button"), id: `i-${id}` }] });
const ids = (groups: Group[]) => groups.map((g) => g.id);
/** what the canvas has measured: a part is as big as it draws, and it draws at its props */
const measured = (...groups: Group[]) => Object.fromEntries(groups.flatMap((g) => g.items.filter((it) => it.kind === "component").flatMap((it) => [[it.id, Number(it.props?.width)], [`${it.id}:h`, Number(it.props?.height)]])));

describe("a container", () => {
  it("is as big as it measures", () => {
    const p = panel("p", 10, 20);
    expect(groupBounds(p, measured(p))).toEqual({ l: 10, t: 20, r: 310, b: 220 });
  });

  it("every container in the pack holds, and nothing else does", () => {
    const holding = PARTS.filter((d) => d.holds).map((d) => d.slug);
    expect(holding.toSorted()).toEqual(["layout/container", "layout/dock", "layout/grid-view", "layout/stack", "layout/supporting-pane", "resizable"]);
  });

  it("holds what lies wholly inside it and over it", () => {
    const p = panel("p", 0, 0);
    const groups = [part("behind", 10, 10), p, part("in", 10, 10), part("out", 400, 10), part("edge", 280, 10)];
    expect(ids(heldBy(p, groups, measured(p)))).toEqual(["in"]);
  });

  it("carries a container on it, and what that holds", () => {
    const p = panel("p", 0, 0);
    const groups = [p, panel("inner", 10, 10, 200, 100), part("deep", 20, 20)];
    const widths = measured(p, groups[1]);
    expect(ids(heldBy(p, groups, widths))).toEqual(["inner", "deep"]);
    expect(ids(heldBy(groups[1], groups, widths))).toEqual(["deep"]);
  });

  it("leaves a locked group where it is", () => {
    const p = panel("p", 0, 0);
    expect(heldBy(p, [p, { ...part("in", 10, 10), locked: true }], measured(p))).toEqual([]);
  });

  it("is no container when grouped by hand or when it is another part", () => {
    expect(holdsParts(part("b", 0, 0))).toBe(false);
    expect(holdsParts({ ...panel("p", 0, 0), free: true })).toBe(false);
    expect(heldBy(part("b", 0, 0), [part("b", 0, 0), part("c", 1, 1)], {})).toEqual([]);
  });

  it("goes behind the parts it is put down on, and no further", () => {
    const groups = [part("far", 900, 0), part("in", 10, 10), part("in2", 10, 100), panel("p", 0, 0)];
    expect(ids(underWhatItHolds(groups, "p", measured(groups[3])))).toEqual(["far", "p", "in", "in2"]);
    const empty = [part("far", 900, 0), panel("p", 0, 0)];
    expect(underWhatItHolds(empty, "p", measured(empty[1]))).toBe(empty);
  });

  it("reads as a container in the prompt", () => {
    const doc = { groups: [panel("p", 16, 100), part("in", 32, 120)], frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" } as unknown as Doc;
    expect(buildPrompt(doc, {}, undefined, "en")).toMatch(/layered inside/i);
  });
});

describe("a file whose parts nest", () => {
  const raw = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, label: id, icon: null, variant: "filled", ...extra });
  const file = (groups: unknown[]) => ({ groups, frames: [{ id: "f", name: "H", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" });
  const opened = (groups: unknown[]) => openProject(JSON.parse(JSON.stringify(file(groups)))) as Doc;
  const at = (doc: Doc, itemId: string) => {
    const g = doc.groups.find((x) => x.items.some((it) => it.id === itemId))!;
    return { x: g.x, y: g.y };
  };

  it("spreads GPUI's groups in groups, each placed from its parent, each drawn over it", () => {
    const doc = opened([
      {
        id: "g1", x: 100, y: 50, axis: "x",
        items: [raw("box", "panel", { variant: "default", size: 400, size2: 300 })],
        children: [{ id: "g2", x: 10, y: 20, axis: "x", items: [raw("box2", "groupBox", { variant: "default", size: 200, size2: 100 })], children: [{ id: "g3", x: 5, y: 6, axis: "x", items: [raw("deep", "button", { variant: "default" })] }] }],
      },
    ]);
    expect(doc.groups.map((g) => g.items[0].id)).toEqual(["box", "box2", "deep"]);
    expect(at(doc, "box2")).toEqual({ x: 110, y: 70 });
    expect(at(doc, "deep")).toEqual({ x: 115, y: 76 });
    expect(doc.groups[0].items[0].component).toBe("layout/container");
    expect(ids(heldBy(doc.groups[0], doc.groups, measured(...doc.groups.slice(0, 2))))).toContain(doc.groups[2].id);
  });

  it("spreads the game fork's parts in parts", () => {
    const doc = opened([{ id: "g1", x: 100, y: 50, axis: "x", items: [{ ...makeItem("box"), id: "box", children: [{ ...makeItem("button"), id: "kid", x: 8, y: 9 }] }] }]);
    expect(at(doc, "kid")).toEqual({ x: 108, y: 59 });
    const kid = doc.groups[1].items[0] as Item & { x?: number };
    expect(kid.x).toBeUndefined();
    expect((doc.groups[0].items[0] as Item & { children?: unknown }).children).toBeUndefined();
  });

  it("finds a parent further along a run", () => {
    const first = makeItem("button");
    const width = sizeOf(first, {}).w;
    const doc = opened([{ id: "g1", x: 0, y: 0, axis: "x", items: [first, { ...makeItem("box"), id: "box", children: [{ ...makeItem("button"), id: "kid", x: 1, y: 2 }] }] }]);
    expect(at(doc, "kid").x).toBeGreaterThan(width);
    expect(at(doc, "kid").y).toBe(2);
  });

  it("does not spread what a part draws itself", () => {
    const cell = { ...makeItem("box"), id: "cell", cellCol: 2, cellRow: 1, x: 1, y: 1 };
    const doc = opened([{ id: "g1", x: 0, y: 0, axis: "x", items: [raw("inv", "invGrid", { children: [cell] })] }]);
    expect(doc.groups).toHaveLength(1);
    expect(doc.groups[0].items[0].props).toMatchObject({ columns: 3, rows: 2 });
  });

  it("does not spread twice when saved and opened again", () => {
    const doc = opened([{ id: "g1", x: 100, y: 50, axis: "x", items: [{ ...makeItem("box"), id: "box", children: [{ ...makeItem("button"), id: "kid", x: 8, y: 9 }] }], children: [{ id: "g2", x: 1, y: 1, axis: "x", items: [makeItem("button")] }] }]);
    const again = openProject(JSON.parse(JSON.stringify(doc))) as Doc;
    expect(again.groups.map((g) => [g.id, g.x, g.y])).toEqual(doc.groups.map((g) => [g.id, g.x, g.y]));
  });

  it("still refuses a nested part that is no part", () => {
    expect(openProject(file([{ id: "g1", x: 0, y: 0, axis: "x", items: [makeItem("box")], children: [{ id: "g2", x: 0, y: 0, axis: "x", items: [{ id: 7, kind: "x" }] }] }]))).toBeNull();
  });
});

describe("a file made before parts were merged", () => {
  const open = (component: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const item = { id: "a", kind: "component", label: "", icon: null, variant: "filled", component, props, ...extra };
    return (openProject(JSON.parse(JSON.stringify({ groups: [{ id: "g", x: 0, y: 0, axis: "x", items: [item] }], frames: [{ id: "f", name: "H", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" }))) as Doc).groups[0].items[0] as Item;
  };

  it("keeps a table's columns, rows, selection, caption and width", () => {
    const it2 = open("table", { columns: [{ label: "A" }, { label: "B" }], rows: 2, selected: 1, caption: "C", width: 300 });
    expect(it2.component).toBe("dashboard/data-table");
    expect(it2.props).toMatchObject({ caption: "C", selected: 1, alignLast: true, width: 300, data: { columns: ["A", "B"], rows: [["INV001", "$250.00"], ["INV002", "$150.00"]] } });
  });

  it("keeps a chart's months, series and size", () => {
    const it2 = open("chart", { bars: 3, series: 1, width: 500, height: 200 });
    expect(it2.component).toBe("dashboard/chart");
    expect(it2.props).toMatchObject({ width: 500, height: 200, data: { columns: ["Month", "Desktop"], rows: [["Jan", "186"], ["Feb", "305"], ["Mar", "237"]] } });
  });

  it("reads a shape's one size as its width and height", () => {
    expect(open("shape", { name: "heart", size: 64 }).props).toEqual({ name: "heart", width: 64, height: 64 });
    const current = { name: "heart", width: 10, height: 20 };
    expect(open("shape", current).props).toEqual(current);
  });

  it("keeps what else the part had", () => {
    expect(open("table", { rows: 1 }, { note: "n", action: { to: "f", transition: "fade" } })).toMatchObject({ note: "n", action: { to: "f", transition: "fade" } });
  });

  it("leaves a part nothing stands for as it is: a stand-in, with everything it held", () => {
    for (const slug of ["layout/panel", "game/confirm-box", "theme-provider"]) {
      const it2 = open(slug, { title: "T", width: 200 });
      expect(it2.component).toBe(slug);
      expect(it2.props).toEqual({ title: "T", width: 200 });
    }
  });
});
