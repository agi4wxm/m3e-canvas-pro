import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openProject } from "./project";
import { alignParts, distributeParts } from "./align";
import { buildCode } from "./codegen";
import { joinDropped } from "./combine";
import { arrangeFlows, flowHostAt, settleInFlow, stepLayers, wrapInFlow } from "./flow";
import { makeItem, type Doc, type Group, heldBy } from "./tokens";

const part = (slug: string, id: string, props: Record<string, unknown> = {}) => ({ ...makeItem(slug), id, props });
const box = (id: string, x: number, y: number, inFlow?: string): Group => ({ id, x, y, axis: "x", inFlow, items: [part("button", `i-${id}`, { label: id })] });
const host = (id: string, props: Record<string, unknown>, x = 0, y = 0, slug = "container"): Group => ({ id, x, y, axis: "x", items: [part(slug, `i-${id}`, { width: 400, height: 300, padX: 10, padY: 20, gap: 8, ...props })] });
/** each part measured at 100 by 40 */
const widths = (gs: Group[]) => Object.fromEntries(gs.flatMap((g) => g.items.flatMap((it) => (it.component === "button" ? [[it.id, 100], [`${it.id}:h`, 40]] : []))));
const at = (gs: Group[], id: string) => {
  const g = gs.find((x) => x.id === id)!;
  return [g.x, g.y];
};
const run = (gs: Group[]) => arrangeFlows(gs, widths(gs));

describe("auto layout", () => {
  it("places a row by its padding and gap, in the order of the document", () => {
    const out = run([host("h", { layout: "row" }), box("a", 300, 90, "h"), box("b", 50, 90, "h")]);
    expect(at(out, "a")).toEqual([10, 20]);
    expect(at(out, "b")).toEqual([118, 20]);
  });

  it("places a column, centered and distributed", () => {
    const out = run([host("h", { layout: "column", align: "center", justify: "center" }), box("a", 0, 0, "h"), box("b", 0, 100, "h")]);
    expect(at(out, "a")).toEqual([150, 106]);
    expect(at(out, "b")).toEqual([150, 154]);
  });

  it("spreads the parts to both ends", () => {
    const out = run([host("h", { layout: "row", justify: "between" }), box("a", 0, 0, "h"), box("b", 10, 0, "h"), box("c", 20, 0, "h")]);
    expect(at(out, "a")[0]).toBe(10);
    expect(at(out, "c")[0]).toBe(290);
    expect(at(out, "b")[0]).toBe(150);
  });

  it("wraps a row that runs out of room", () => {
    const out = run([host("h", { layout: "row", wrap: true, width: 240 }), box("a", 0, 0, "h"), box("b", 10, 0, "h"), box("c", 20, 0, "h")]);
    expect(at(out, "b")).toEqual([118, 20]);
    expect(at(out, "c")).toEqual([10, 68]);
  });

  it("lays out a grid, stretching parts to the cell", () => {
    const out = run([host("h", { layout: "grid", columns: 2, align: "stretch", width: 408 }), box("a", 0, 0, "h"), box("b", 10, 0, "h"), box("c", 0, 50, "h")]);
    expect(at(out, "b")[0]).toBe(10 + 190 + 8);
    expect(at(out, "c")).toEqual([10, 68]);
    expect(out.find((g) => g.id === "a")!.items[0].props?.width).toBe(190);
  });

  it("hugs its contents, and a part that fills takes what is left", () => {
    const hugged = run([host("h", { layout: "row", hugWidth: true, hugHeight: true }), box("a", 0, 0, "h"), box("b", 5, 0, "h")]);
    expect(hugged[0].items[0].props).toMatchObject({ width: 20 + 208, height: 40 + 40 });
    const filled = [host("h", { layout: "row" }), { ...box("a", 0, 0, "h"), items: [{ ...part("button", "i-a", { label: "a" }), flowFill: true }] }, box("b", 5, 0, "h")];
    const out = run(filled);
    expect(out.find((g) => g.id === "a")!.items[0].props?.width).toBe(400 - 20 - 8 - 100);
    expect(at(out, "b")[0]).toBe(10 + 272 + 8);
  });

  it("nests: a container in a container is placed, then places its own", () => {
    const out = run([host("o", { layout: "column", hugHeight: true }), host("n", { layout: "row", hugWidth: true, hugHeight: true, padX: 0, padY: 0 }, 900, 10), box("a", 0, 0, "n"), box("b", 5, 0, "n"), box("c", 0, 500, "o")].map((g) => (g.id === "n" ? { ...g, inFlow: "o" } : g)));
    expect(at(out, "n")).toEqual([10, 20]);
    expect(at(out, "a")).toEqual([10, 20]);
    expect(at(out, "b")).toEqual([118, 20]);
    expect(at(out, "c")).toEqual([10, 68]);
    expect(out[0].items[0].props?.height).toBe(40 + 40 + 8 + 40);
  });

  it("lets go of what its layout no longer is, and a value of the wrong type", () => {
    const off = run([host("h", { layout: "free" }), box("a", 900, 900, "h")]);
    expect(off[1].inFlow).toBeUndefined();
    const gone = run([box("a", 900, 900, "nobody")]);
    expect(gone[0].inFlow).toBeUndefined();
    const wrong = run([{ ...box("a", 0, 0), inFlow: 7 as unknown as string }]);
    expect(wrong[0].inFlow).toBeUndefined();
  });

  it("takes in what lies inside when its layout is switched on, in the order it stands", () => {
    const out = run([host("h", { layout: "row" }), box("b", 200, 100), box("a", 60, 100), box("away", 900, 900)]);
    expect(out.find((g) => g.id === "a")!.inFlow).toBe("h");
    expect(out.find((g) => g.id === "away")!.inFlow).toBeUndefined();
    expect(at(out, "a")).toEqual([10, 20]);
    expect(at(out, "b")).toEqual([118, 20]);
  });

  it("does not take what a nearer container holds", () => {
    const gs = [host("h", { layout: "row" }), host("inner", { layout: "free", width: 200, height: 100 }, 50, 50), box("a", 60, 60)];
    const out = arrangeFlows(gs, { ...widths(gs), "i-h": 400, "i-h:h": 300, "i-inner": 200, "i-inner:h": 100 });
    expect(out.find((g) => g.id === "a")!.inFlow).toBeUndefined();
  });

  it("settles when a hugging container is stretched by the one around it", () => {
    const start = [host("o", { layout: "column", align: "stretch" }), { ...host("n", { layout: "row", hugWidth: true, hugHeight: true }, 0, 0), inFlow: "o" }, box("a", 0, 0, "n")];
    const once = run(start);
    expect(once.find((g) => g.id === "n")!.items[0].props?.width).toBe(380);
    expect(run(once)).toBe(once);
  });

  it("waits for its parts to be measured, and a locked container stays as it is", () => {
    const unmeasured = [host("h", { layout: "row" }), box("a", 300, 90, "h")];
    expect(arrangeFlows(unmeasured, {})).toBe(unmeasured);
    const locked = [{ ...host("h", { layout: "row", hugWidth: true }), locked: true }, box("a", 300, 90, "h")];
    expect(run(locked)).toBe(locked);
    expect(flowHostAt([locked[0], box("b", 50, 50)], "b", {})).toBeNull();
  });

  it("changes nothing once in place, and so never asks to run again", () => {
    const once = run([host("h", { layout: "row", hugWidth: true }), box("a", 3, 3, "h")]);
    expect(run(once)).toBe(once);
  });

  it("leaves alone a container with no layout, a locked part and a loop from a hand-edited file", () => {
    const free = [host("h", { layout: "free" }), box("a", 50, 50)];
    expect(run(free)).toBe(free);
    const locked = run([host("h", { layout: "row" }), { ...box("a", 50, 50, "h"), locked: true }]);
    expect(at(locked, "a")).toEqual([50, 50]);
    const loop = [{ ...host("p", { layout: "row" }), inFlow: "q" }, { ...host("q", { layout: "row" }), inFlow: "p" }];
    expect(() => run(loop)).not.toThrow();
  });
});

describe("stepping forward and back", () => {
  const screen = () => "s";
  const order = (gs: Group[]) => gs.map((g) => g.id).join(" ");
  const free = (id: string, y: number) => box(id, 0, y);

  it("passes one neighbour, and stops at the end", () => {
    const gs = [free("a", 0), free("b", 100), free("c", 200)];
    expect(order(stepLayers(gs, new Set(["a"]), 1, widths(gs), screen))).toBe("b a c");
    expect(order(stepLayers(gs, new Set(["c"]), -1, widths(gs), screen))).toBe("a c b");
    expect(stepLayers(gs, new Set(["c"]), 1, widths(gs), screen)).toBe(gs);
  });

  it("keeps neighbours that step together in their order", () => {
    const gs = [free("a", 0), free("b", 100), free("c", 200)];
    expect(order(stepLayers(gs, new Set(["a", "b"]), 1, widths(gs), screen))).toBe("c a b");
    expect(stepLayers(gs, new Set(["a", "c"]), 1, widths(gs), screen)).not.toBe(gs);
  });

  it("takes what a container holds along, and never over its own contents", () => {
    const gs = [host("h", { layout: "column" }), box("in1", 0, 0, "h"), box("in2", 0, 50, "h"), free("x", 900)];
    expect(order(stepLayers(gs, new Set(["h"]), 1, widths(gs), screen))).toBe("x h in1 in2");
  });

  it("moves a part along its run, not out of its layout", () => {
    const gs = [host("h", { layout: "column" }), box("in1", 0, 0, "h"), box("in2", 0, 50, "h"), free("x", 900)];
    expect(order(stepLayers(gs, new Set(["in1"]), 1, widths(gs), screen))).toBe("h in2 in1 x");
    expect(stepLayers(gs, new Set(["in2"]), 1, widths(gs), screen)).toBe(gs);
  });

  it("leaves a locked part, and parts on another screen, alone", () => {
    const gs = [{ ...free("a", 0), locked: true }, free("b", 100)];
    expect(stepLayers(gs, new Set(["a"]), 1, widths(gs), screen)).toBe(gs);
    const two = [free("a", 0), free("b", 100)];
    expect(stepLayers(two, new Set(["a"]), 1, widths(two), (g) => g.id)).toBe(two);
  });
});

describe("going in and out of a layout", () => {
  it("joins the layout it is let go in and is drawn over it", () => {
    const gs = [box("a", 100, 100), host("h", { layout: "row" })];
    const out = settleInFlow(gs, "a", widths(gs));
    expect(out.map((g) => g.id)).toEqual(["h", "a"]);
    expect(out[1].inFlow).toBe("h");
  });

  it("takes the place in the order where it is let go, and nothing else moves it", () => {
    const placed = run([host("h", { layout: "column" }), box("a", 0, 0, "h"), box("b", 0, 100, "h")]);
    const dropped = settleInFlow(placed.map((g) => (g.id === "b" ? { ...g, y: -5 + 20 } : g)), "b", widths(placed));
    expect(dropped.slice(1).map((g) => g.id)).toEqual(["b", "a"]);
    /* a tall part on the second line of a grid does not reorder it */
    const grid = run([host("g", { layout: "grid", columns: 2 }), box("a", 0, 0, "g"), box("b", 0, 0, "g"), box("c", 0, 0, "g"), box("d", 0, 0, "g")]);
    expect(run(grid).map((g) => g.id)).toEqual(["g", "a", "b", "c", "d"]);
  });

  it("brings what a dropped container holds along", () => {
    const gs = [host("n", { layout: "row", width: 100, height: 100 }, 20, 40), box("k", 1000, 1000, "n"), host("o", { layout: "column" })];
    expect(settleInFlow(gs, "n", widths(gs)).map((g) => g.id)).toEqual(["o", "n", "k"]);
  });

  it("leaves it when carried out, and does not enter what it holds", () => {
    const gs = [host("h", { layout: "row" }), box("a", 900, 900, "h")];
    expect(settleInFlow(gs, "a", widths(gs))[1].inFlow).toBeUndefined();
    const nested = [{ ...host("o", { layout: "row" }), inFlow: "n" }, host("n", { layout: "row" })];
    expect(flowHostAt(nested, "n", widths(nested))).toBeNull();
  });

  it("carries what overflows with the container", () => {
    const gs = [host("h", { layout: "row" }), box("a", 900, 900, "h")];
    expect(heldBy(gs[0], gs, widths(gs)).map((g) => g.id)).toEqual(["a"]);
  });

  it("wraps a selection in a layout that keeps it as it stands", () => {
    const gs = [box("a", 0, 0), box("b", 124, 0)];
    const made = wrapInFlow(gs, new Set(["a", "b"]), "new", widths(gs))!;
    expect(made.groups[0].items[0].props).toMatchObject({ layout: "row", gap: 24, hugWidth: true });
    const out = run(made.groups);
    expect(at(out, "b")).toEqual([124, 0]);
  });
});

describe("lining parts up", () => {
  const ids = (...list: string[]) => new Set(list.map((x) => `i-${x}`));
  it("aligns to the edge of what is selected, and to a locked part", () => {
    const gs = [box("a", 10, 0), box("b", 90, 50)];
    expect(at(alignParts(gs, ids("a", "b"), "left", widths(gs))!, "b")).toEqual([10, 50]);
    expect(at(alignParts(gs, ids("a", "b"), "bottom", widths(gs))!, "a")).toEqual([10, 50]);
    const locked = [box("a", 10, 0), { ...box("b", 90, 50), locked: true }];
    expect(at(alignParts(locked, ids("a", "b"), "left", widths(locked))!, "a")).toEqual([90, 0]);
  });

  it("spreads evenly between the first and the last, or by an exact gap", () => {
    const gs = [box("a", 0, 0), box("b", 150, 0), box("c", 400, 0)];
    expect(at(distributeParts(gs, ids("a", "b", "c"), "x", widths(gs))!, "b")[0]).toBe(200);
    expect(at(distributeParts(gs, ids("a", "b", "c"), "x", widths(gs), 10)!, "c")[0]).toBe(220);
  });

  it("does nothing with too few parts", () => {
    const gs = [box("a", 0, 0), box("b", 150, 0)];
    expect(alignParts(gs, ids("a"), "left", widths(gs))).toBeNull();
    expect(distributeParts(gs, ids("a", "b"), "x", widths(gs))).toBeNull();
  });
});

describe("a button let go against a button", () => {
  it("becomes a button group in the order they stand", () => {
    const gs = [box("a", 0, 0), box("b", 104, 0)];
    const out = joinDropped(gs, "b", widths(gs))!;
    expect(out.groups).toHaveLength(1);
    expect(out.groups[0].items[0].component).toBe("button-group");
    expect((out.groups[0].items[0].props?.items as { label: string }[]).map((r) => r.label)).toEqual(["a", "b"]);
  });

  it("joins a group at the end it was let go, its taps following their rows", () => {
    const row: Group = { id: "g", x: 200, y: 0, axis: "x", items: [{ ...part("button-group", "i-g", { items: [{ label: "x" }, { label: "y" }], size: "sm" }), actions: { "tab:0": { to: "f1" } } as never }] };
    const gs = [row, box("a", 96, 0)];
    const out = joinDropped(gs, "a", { ...widths(gs), "i-g": 200, "i-g:h": 40 })!;
    const joined = out.groups[0].items[0];
    expect((joined.props?.items as { label: string }[]).map((r) => r.label)).toEqual(["a", "x", "y"]);
    expect(Object.keys(joined.actions ?? {})).toEqual(["tab:1"]);
    expect(out.groups[0].x).toBe(96);
  });

  it("stays apart when far, inside a layout, of another size or a toggle", () => {
    const far = [box("a", 0, 0), box("b", 300, 0)];
    expect(joinDropped(far, "b", widths(far))).toBeNull();
    const flow = [box("a", 0, 0, "h"), box("b", 104, 0, "h")];
    expect(joinDropped(flow, "b", widths(flow))).toBeNull();
    const big = [box("a", 0, 0), { ...box("b", 104, 0), items: [part("button", "i-b", { label: "b", size: "lg" })] }];
    expect(joinDropped(big, "b", widths(big))).toBeNull();
    const toggle = [box("a", 0, 0), { ...box("b", 104, 0), items: [part("button", "i-b", { label: "b", toggle: true })] }];
    expect(joinDropped(toggle, "b", widths(toggle))).toBeNull();
  });
});

describe("the guide an AI agent writes from", () => {
  it("gives an auto layout example that opens, arranges and prints as it says", () => {
    const guide = readFileSync(new URL("../public/agent.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    const block = /#### Auto layout[\s\S]*?```json\n([\s\S]*?)```/.exec(guide)![1];
    const groups = block.trim().split("\n").map((line) => JSON.parse(line) as Group);
    const opened = openProject({ groups, frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" });
    expect(opened).not.toBeNull();
    const measures = { t: 280, "t:h": 56, s: 96, "s:h": 40 };
    const out = arrangeFlows(opened!.groups, measures);
    /* stretched across the room inside its padding, the second under the first */
    expect(out.find((g) => g.id === "a")).toMatchObject({ x: 16, y: 80 });
    expect(out.find((g) => g.id === "b")!.y).toBe(80 + 56 + 12);
    expect(buildCode({ ...opened!, groups: out }, measures).code).toMatch(/flex flex-col gap-\[12px\]/);
  });
});

describe("printed code", () => {
  const doc = (groups: Group[]): Doc => ({ groups, frames: [{ id: "f", name: "Home", x: 0, y: 0 }], paletteKey: "purple", frame: "phone", title: "", brief: "" });

  it("nests what a layout holds, in flex", () => {
    const gs = [host("h", { layout: "column", gap: 12, align: "center", label: "Hidden" }, 8, 8), box("a", 18, 28, "h"), { ...box("b", 18, 80, "h"), items: [{ ...part("button", "i-b", { label: "b" }), flowFill: true }] }];
    const { code } = buildCode(doc(gs), widths(gs));
    expect(code).toMatch(/flex flex-col gap-\[12px\] px-\[10px\] py-\[20px\] items-center/);
    /* one absolute box, for the container; its parts are inside */
    expect(code.match(/absolute left-/g)).toHaveLength(1);
    expect(code.indexOf("flex flex-col")).toBeLessThan(code.indexOf("<Button"));
    expect(code).toContain("flex-1");
    expect(code).not.toContain("Hidden");
    expect(code).not.toContain("@@flow@@");
  });

  it("nests layouts in layouts, and fills a grid container's cells", () => {
    const gs = [host("o", { layout: "column" }), { ...host("n", { layout: "row" }, 10, 20), inFlow: "o" }, box("a", 0, 0, "n"), host("g", { columns: 3, rows: 1 }, 0, 400, "grid-view"), box("c", 0, 400, "g")];
    const { code } = buildCode(doc(gs), widths(gs));
    expect(code).toContain("flex flex-row");
    expect(code).toContain("flex flex-col");
    expect(code).toContain("grid grid-cols-[repeat(3,minmax(0,1fr))]");
    expect(code).not.toContain("data-flow");
  });

  it("keeps a layout's order, and a dollar sign in its words", () => {
    const gs = [host("h", { layout: "row", wrap: true, width: 240 }), box("a", 10, 20, "h"), box("b", 118, 20, "h"), box("c", 10, 68, "h")];
    gs[2] = { ...gs[2], items: [part("button", "i-b", { label: "US$$ 5" })] };
    const { code } = buildCode(doc(gs), widths(gs));
    expect(code).toContain("US$$ 5");
    expect(code.indexOf(">a<")).toBeLessThan(code.indexOf("US$$"));
    expect(code.indexOf("US$$")).toBeLessThan(code.indexOf(">c<"));
  });

  it("keeps on its screen what overflows the container it is in", () => {
    const gs = [host("h", { layout: "column", height: 100 }, 8, 8), box("a", 18, 900, "h")];
    expect(buildCode(doc(gs), widths(gs)).code).toContain(">a<");
  });
});
