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
