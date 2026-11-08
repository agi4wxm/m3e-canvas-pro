/* The split view as a layout: two panes that are real boxes, sized by the split, their parts laid out in them and
 * following them; limits, folding, stacking when narrow, nesting; and the panes kept whole. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { arrangeFlows } from "./flow";
import { makeItem, type Group } from "./tokens";
import { panesOfSplit, shareRange, splitOfItem, splitSizes, withSplitPanes } from "./split";
import { guessMeasurer } from "./core/op";
import { counterIds, DocStore } from "./core/store";
import { stateOf } from "./core/state";
import * as ops from "./core/ops";

beforeAll(() => setGlobalLang("en"));

const screen = { id: "F1", name: "Desk", x: 0, y: 0, w: 1280, h: 800 };
const store = (groups: Group[] = []) => new DocStore(stateOf({ groups, frames: [screen] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const ai = { origin: "ai" as const };
/** the groups as the next layout pass leaves them, with what an operation just added measured by its guess */
const settled = (s: DocStore) => arrangeFlows(s.get().doc.groups, guessMeasurer.measure(s.get()));
const groupOf = (s: DocStore, itemId: string) => settled(s).find((g) => g.items.some((it) => it.id === itemId))!;
const props = (s: DocStore, itemId: string) => groupOf(s, itemId).items[0].props as Record<string, number>;
const splitOfIn = (props: Record<string, unknown>) => splitOfItem({ ...makeItem("split-view"), props })!;

describe("the sizes of a split's panes", () => {
  it("shares the room the divider leaves by the split", () => {
    expect(splitSizes(splitOfIn({ split: 30 }), 1001)).toEqual({ first: 300, second: 700, collapsed: null });
    /* a gap is eight pixels */
    expect(splitSizes(splitOfIn({ split: 50, divider: "gap" }), 808)).toEqual({ first: 400, second: 400, collapsed: null });
  });

  it("keeps each pane inside its least and its most", () => {
    expect(splitSizes(splitOfIn({ split: 10, minFirst: 240 }), 1001).first).toBe(240);
    expect(splitSizes(splitOfIn({ split: 90, maxFirst: 400 }), 1001).first).toBe(400);
    expect(splitSizes(splitOfIn({ split: 90, minSecond: 300 }), 1001).second).toBe(300);
    expect(splitSizes(splitOfIn({ split: 10, maxSecond: 500 }), 1001).second).toBe(500);
    /* limits that cannot all hold: the first pane keeps its least */
    expect(splitSizes(splitOfIn({ split: 50, minFirst: 700, minSecond: 700 }), 1001).first).toBe(700);
    expect(shareRange(splitOfIn({ minFirst: 200, minSecond: 300 }), 1001)).toEqual({ min: 20, max: 70 });
  });

  it("folds the pane that folds, by the design or below half way to its least", () => {
    const rail = { collapsible: "first", collapsedSize: 64, minFirst: 200 };
    expect(splitSizes(splitOfIn({ ...rail, split: 30, collapsed: true }), 1001)).toEqual({ first: 64, second: 936, collapsed: "first" });
    /* 120 is below half way between 64 and 200: folded; 150 is not, and goes up to the least */
    expect(splitSizes(splitOfIn({ ...rail, split: 12 }), 1001).collapsed).toBe("first");
    expect(splitSizes(splitOfIn({ ...rail, split: 15 }), 1001)).toEqual({ first: 200, second: 800, collapsed: null });
    expect(splitSizes(splitOfIn({ collapsible: "second", split: 100 }), 1001)).toEqual({ first: 1000, second: 0, collapsed: "second" });
    /* `collapsed` means nothing for a split that does not fold */
    expect(splitSizes(splitOfIn({ split: 30, collapsed: true }), 1001).collapsed).toBe(null);
  });

  it("stacks its panes when narrower than its breakpoint, unless it keeps its orientation", () => {
    expect(splitOfIn({ width: 640 })!.vertical).toBe(false);
    expect(splitOfIn({ width: 360 })!.vertical).toBe(true);
    expect(splitOfIn({ width: 360, compact: "keep" })!.vertical).toBe(false);
    expect(splitOfIn({ width: 1000, breakpoint: 1200 })!.vertical).toBe(true);
    expect(splitOfIn({ width: 1000, orientation: "vertical" })!.vertical).toBe(true);
  });
});

describe("a split view on the canvas", () => {
  it("comes with its two panes, real boxes right after it, named in the layers", () => {
    const s = store();
    const { itemId, groupId } = s.run(ops.addPart, { slug: "split-view", screen: "F1", at: { x: 0, y: 0 }, props: { width: 1001, height: 400, split: 30 } }, ai) as { itemId: string; groupId: string };
    const groups = s.get().doc.groups;
    const at = groups.findIndex((g) => g.id === groupId);
    const panes = panesOfSplit(groups, groupId);
    expect(groups[at + 1]).toBe(panes.first);
    expect(groups[at + 2]).toBe(panes.second);
    expect(panes.first).toMatchObject({ inFlow: groupId, splitPane: "first", name: "First pane", x: 0, y: 0 });
    expect(panes.second).toMatchObject({ inFlow: groupId, splitPane: "second", name: "Second pane", x: 301, y: 0 });
    expect(panes.first!.items[0]).toMatchObject({ component: "box", props: { width: 300, height: 400, layout: "column" } });
    expect(panes.second!.items[0].props).toMatchObject({ width: 700, height: 400 });
    expect(itemId).toBe(groupOf(s, itemId).items[0].id);
  });

  it("lays out what a pane holds, and it follows the pane when the split moves", () => {
    const s = store();
    const { itemId: split, groupId } = s.run(ops.addPart, { slug: "split-view", screen: "F1", at: { x: 0, y: 0 }, props: { width: 1001, height: 400 } }, ai) as { itemId: string; groupId: string };
    const second = panesOfSplit(s.get().doc.groups, groupId).second!;
    s.run(ops.addPart, { slug: "button", id: "go", into: { container: second.items[0].id } }, ai);
    expect(groupOf(s, "go").x).toBe(501 + 16);
    s.run(ops.setProps, { id: split, props: { split: 20 } }, ai);
    expect(groupOf(s, "go").x).toBe(201 + 16);
    expect(props(s, second.items[0].id).width).toBe(800);
    /* stacked, the second pane is under the first */
    s.run(ops.setProps, { id: split, props: { orientation: "vertical" } }, ai);
    expect(groupOf(s, "go")).toMatchObject({ x: 16, y: Math.round(0.2 * 399) + 1 + 16 });
  });

  it("nests: a split in a pane takes the pane's room, and its own panes follow the outer divider", () => {
    const s = store();
    const { itemId: outer, groupId } = s.run(ops.addPart, { slug: "split-view", screen: "F1", at: { x: 0, y: 0 }, props: { width: 1001, height: 601, split: 25 } }, ai) as { itemId: string; groupId: string };
    const right = panesOfSplit(s.get().doc.groups, groupId).second!;
    s.run(ops.setProps, { id: right.items[0].id, props: { padX: 0, padY: 0 } }, ai);
    const inner = s.run(ops.addPart, { slug: "split-view", id: "inner", into: { container: right.items[0].id }, props: { orientation: "vertical", split: 50 } }, ai) as { groupId: string };
    s.run(ops.setItem, { id: "inner", patch: { flowSize: { w: "fill", h: "fill" } } }, ai);
    const lower = panesOfSplit(s.get().doc.groups, inner.groupId).second!;
    s.run(ops.addPart, { slug: "button", id: "deep", into: { container: lower.items[0].id } }, ai);
    expect(props(s, "inner")).toMatchObject({ width: 750, height: 601 });
    expect(groupOf(s, "deep")).toMatchObject({ x: 251 + 16, y: 301 + 16 });
    s.run(ops.setProps, { id: outer, props: { split: 50 } }, ai);
    expect(props(s, "inner").width).toBe(500);
    expect(groupOf(s, "deep").x).toBe(501 + 16);
  });

  it("keeps its panes whole: a missing one is made, a stray part is let go, a pane of nothing is a box", () => {
    const split: Group = { id: "s", x: 0, y: 0, axis: "x", items: [{ ...makeItem("split-view"), id: "sv", props: { width: 400, height: 200 } }] };
    const box = (id: string, more: Partial<Group>): Group => ({ id, x: 0, y: 0, axis: "x", items: [{ ...makeItem("box"), id: `i-${id}`, props: { layout: "column" } }], ...more });
    let n = 0;
    const out = withSplitPanes([split, box("a", { inFlow: "s", splitPane: "first" }), box("stray", { inFlow: "s" }), box("lost", { splitPane: "second" })], () => `new${++n}`, "en");
    expect(out.map((g) => [g.id, g.inFlow, g.splitPane])).toEqual([
      ["s", undefined, undefined],
      ["a", "s", "first"],
      ["new1", "s", "second"],
      ["stray", undefined, undefined],
      ["lost", undefined, undefined],
    ]);
    expect(withSplitPanes(out, () => "x", "en")).toBe(out);
    /* and the layout keeps them so */
    expect(arrangeFlows(out, {}).find((g) => g.id === "new1")).toMatchObject({ splitPane: "second", inFlow: "s" });
  });
});
