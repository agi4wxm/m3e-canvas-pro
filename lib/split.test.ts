/* The split view as a layout: two panes that are real boxes, sized by the split, their parts laid out in them and
 * following them; limits, folding, stacking when narrow, nesting; and the panes kept whole. Then the operations on it
 * (the editor's, the AI's and MCP's), what its numbers mean in the file and in a visitor's hands, and what the three
 * exports print for it. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { arrangeFlows } from "./flow";
import { makeItem, type Group } from "./tokens";
import { panesOfSplit, shareRange, splitOfItem, splitSizes, withSplitPanes } from "./split";
import { guessMeasurer } from "./core/op";
import { counterIds, DocStore } from "./core/store";
import { savedDoc, stateOf } from "./core/state";
import * as ops from "./core/ops";
import { openProject } from "./project";
import { liveGroups, liveItem, startState, writeField } from "./interact";
import { readFileSync } from "node:fs";
import { buildCode } from "./codegen";
import { splitsDoc } from "./export/rn/fixture";
import { printRnScreens } from "./export/rn/print";
import { printMiniScreens } from "./export/miniapp/print";

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

/** a store with a split view on the screen, a part in each pane; its ids and its panes' */
function withSplit(more: Record<string, unknown> = {}) {
  const s = store();
  const added = s.run(ops.addPart, { slug: "split-view", id: "sv", screen: "F1", at: { x: 0, y: 0 }, props: { width: 1001, height: 400, ...more } }, ai) as { groupId: string; panes: { first: string; second: string } };
  s.run(ops.addPart, { slug: "text", id: "left", into: { container: added.panes.first }, props: { text: "Left" } }, ai);
  s.run(ops.addPart, { slug: "button", id: "right", into: { container: added.panes.second }, props: { label: "Right" } }, ai);
  return { s, ...added };
}
const refusal = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return { code: (e as { code?: string }).code, message: (e as Error).message };
  }
  return null;
};
/** each part, the part whose layout it is in, and which pane it is */
const outline = (s: DocStore) => s.get().doc.groups.map((g) => [g.items[0].id, g.inFlow ? s.get().doc.groups.find((x) => x.id === g.inFlow)!.items[0].id : null, g.splitPane ?? null]);
const heldBy = (s: DocStore, itemId: string) => {
  const host = s.get().doc.groups.find((g) => g.items[0].id === itemId)!;
  return s.get().doc.groups.filter((g) => g.inFlow === host.id).map((g) => (g.items[0].props?.text as string | undefined) ?? g.items[0].id);
};

describe("the operations on a split view", () => {
  it("add_part says where its panes are, for the next call to put parts into", () => {
    const { s, panes, groupId } = withSplit();
    const p = panesOfSplit(s.get().doc.groups, groupId);
    expect(panes).toEqual({ first: p.first!.items[0].id, second: p.second!.items[0].id });
    expect(outline(s)).toEqual([
      ["sv", null, null],
      [panes.first, "sv", "first"],
      ["left", panes.first, null],
      [panes.second, "sv", "second"],
      ["right", panes.second, null],
    ]);
  });

  it("set_split sets the design's share and fold, and the fold only on a split view that folds", () => {
    const { s } = withSplit({ collapsible: "first", collapsedSize: 64 });
    s.run(ops.setSplit, { id: "sv", split: 33.333 }, ai);
    expect(props(s, "sv")).toMatchObject({ split: 33.33 });
    expect(groupOf(s, "right").x).toBe(Math.round(0.3333 * 1000) + 1 + 16);
    s.run(ops.setSplit, { id: "sv", collapsed: true }, ai);
    /* folded to its strip of icons, the other pane takes the rest */
    expect(groupOf(s, "right").x).toBe(64 + 1 + 16);
    expect(refusal(() => s.run(ops.setSplit, { id: "sv" }, ai))?.code).toBe("nothing_to_do");
    expect(refusal(() => s.run(ops.setSplit, { id: "left", split: 10 }, ai))?.code).toBe("invalid_value");
    const plain = withSplit();
    expect(refusal(() => plain.s.run(ops.setSplit, { id: "sv", collapsed: true }, ai))).toMatchObject({ code: "refused", message: expect.stringContaining("collapsible") });
  });

  it("keeps each pane its split's: no moving, removing, copying, grouping or wrapping one alone, nothing put in the split itself", () => {
    const { s, panes } = withSplit();
    const before = JSON.stringify(s.get().doc.groups);
    expect(refusal(() => s.run(ops.addPart, { slug: "button", into: { container: "sv" } }, ai))?.message).toContain("put it into one of its panes");
    expect(refusal(() => s.run(ops.moveNode, { id: panes.first, x: 500, y: 500 }, ai))?.code).toBe("refused");
    expect(refusal(() => s.run(ops.moveInto, { id: panes.second, container: panes.first }, ai))?.code).toBe("refused");
    expect(refusal(() => s.run(ops.removeNodes, { ids: [panes.first] }, ai))?.code).toBe("refused");
    expect(refusal(() => s.run(ops.duplicateNodes, { ids: [panes.first] }, ai))?.code).toBe("refused");
    expect(refusal(() => s.run(ops.groupNodes, { ids: [panes.first, "right"] }, ai))?.code).toBe("refused");
    expect(refusal(() => s.run(ops.autoLayout, { ids: [panes.second] }, ai))?.code).toBe("refused");
    expect(JSON.stringify(s.get().doc.groups)).toBe(before);
    /* asked with other parts, the pane stays and the rest goes */
    expect(s.run(ops.removeNodes, { ids: [panes.first, "left"] }, ai)).toEqual({ kept: true, panesKept: true });
    expect(outline(s).map((r) => r[0])).toEqual(["sv", panes.first, panes.second, "right"]);
    /* what a pane holds moves in and out of it as out of any box */
    s.run(ops.moveInto, { id: "right", container: panes.first }, ai);
    expect(heldBy(s, panes.first)).toEqual(["right"]);
  });

  it("copies a split view with its panes and what they hold; removed, its panes stay as plain boxes with what they hold", () => {
    const { s, panes } = withSplit();
    s.run(ops.duplicateNodes, { ids: ["sv"] }, ai);
    const groups = s.get().doc.groups;
    const copy = groups.find((g) => g.items[0].component === "split-view" && g.items[0].id !== "sv")!;
    const copied = panesOfSplit(groups, copy.id);
    expect(copied.first!.id).not.toBe(groups.find((g) => g.items[0].id === panes.first)!.id);
    expect(groups.filter((g) => g.inFlow === copied.second!.id).map((g) => g.items[0].props?.label)).toEqual(["Right"]);
    s.run(ops.removeNodes, { ids: ["sv"] }, ai);
    const freed = s.get().doc.groups.find((g) => g.items[0].id === panes.second)!;
    expect(freed.inFlow).toBeUndefined();
    expect(freed.splitPane).toBeUndefined();
    expect(heldBy(s, panes.second)).toEqual(["right"]);
  });

  it("undoes adding one whole, panes and all", () => {
    const s = store();
    s.run(ops.addPart, { slug: "split-view", id: "sv", screen: "F1", at: { x: 0, y: 0 } }, ai);
    expect(s.get().doc.groups).toHaveLength(3);
    s.undo("ai");
    expect(s.get().doc.groups).toHaveLength(0);
    s.redo("ai");
    expect(s.get().doc.groups.map((g) => g.splitPane ?? null)).toEqual([null, "first", "second"]);
  });

  it("add_tree takes a split view's two children as its panes, and refuses any other count or a pane that lays nothing out", () => {
    const s = store();
    const pane = (words: string) => ({ part: "box", children: [{ part: "text", props: { text: words } }] });
    s.run(ops.addTree, { screen: "F1", at: { x: 0, y: 0 }, tree: { part: "split-view", id: "tree", props: { width: 801, height: 301, split: 25, orientation: "vertical" }, children: [pane("Top"), pane("Bottom")] } }, ai);
    const host = groupOf(s, "tree");
    const p = panesOfSplit(settled(s), host.id);
    expect(p.first!.items[0].props).toMatchObject({ width: 801, height: 75, padX: 16, hugWidth: false, hugHeight: false });
    expect(p.second!.y - host.y).toBe(76);
    expect(heldBy(s, p.second!.items[0].id)).toEqual(["Bottom"]);
    expect(refusal(() => s.run(ops.addTree, { screen: "F1", tree: { part: "split-view", children: [pane("One")] } }, ai))?.message).toContain("takes two children");
    expect(refusal(() => s.run(ops.addTree, { screen: "F1", tree: { part: "split-view", children: [pane("One"), { part: "button" }] } }, ai))?.message).toContain("not a button");
  });

  it("turns a screen into auto layouts without breaking a split view apart", () => {
    const { s, panes } = withSplit();
    s.run(ops.addPart, { slug: "button", id: "below", screen: "F1", at: { x: 16, y: 480 } }, ai);
    s.run(ops.autoLayoutScreen, { screen: "F1" }, ai);
    expect(outline(s).filter((r) => r[2])).toEqual([
      [panes.first, "sv", "first"],
      [panes.second, "sv", "second"],
    ]);
    expect(heldBy(s, panes.first)).toEqual(["Left"]);
    expect(heldBy(s, panes.second)).toEqual(["right"]);
  });

  it("turns a legacy resizable into a split view of the same size and share, the parts over each panel moved into its pane", () => {
    const s = store();
    s.run(ops.addPart, { slug: "resizable", id: "rz", screen: "F1", at: { x: 0, y: 0 }, props: { width: 801, height: 300, split: 40, first: "Folders" } }, ai);
    s.run(ops.addPart, { slug: "button", id: "on-left", screen: "F1", at: { x: 40, y: 40 } }, ai);
    s.run(ops.addPart, { slug: "button", id: "on-right", screen: "F1", at: { x: 500, y: 200 } }, ai);
    s.run(ops.addPart, { slug: "button", id: "also-right", screen: "F1", at: { x: 400, y: 40 } }, ai);
    const before = JSON.stringify(s.get().doc.groups);
    const out = s.run(ops.convertToSplitView, { id: "rz" }, ai) as { itemId: string; panes: { first: string; second: string } };
    expect(out.itemId).toBe("rz");
    expect(groupOf(s, "rz").items[0]).toMatchObject({ component: "split-view", props: { split: 40, width: 801, height: 300, orientation: "horizontal", compact: "keep" } });
    /* the first panel's own words stay as a line of text; each side in reading order */
    expect(heldBy(s, out.panes.first)).toEqual(["Folders", "on-left"]);
    expect(heldBy(s, out.panes.second)).toEqual(["also-right", "on-right"]);
    expect(refusal(() => s.run(ops.convertToSplitView, { id: "on-left" }, ai))?.code).toBe("invalid_value");
    s.undo("ai");
    expect(JSON.stringify(s.get().doc.groups)).toBe(before);
  });
});

describe("what a split's numbers mean, kept and not kept", () => {
  it("keeps the design's share and its panes in the file, and mends a file whose split lost a pane", () => {
    const { s, panes } = withSplit({ split: 30, persist: true });
    const reopened = openProject(JSON.parse(JSON.stringify(savedDoc(s.get()))))!;
    expect(reopened.groups.map((g) => g.splitPane ?? null)).toEqual(s.get().doc.groups.map((g) => g.splitPane ?? null));
    expect(reopened.groups[0].items[0].props).toMatchObject({ split: 30, persist: true });
    /* a pane missing (a file edited by hand): the next change makes it again, empty */
    const firstPane = reopened.groups.find((g) => g.items[0].id === panes.first)!;
    const mended = store(reopened.groups.filter((g) => g !== firstPane && g.inFlow !== firstPane.id));
    mended.run(ops.setSplit, { id: "sv", split: 40 }, ai);
    const p = panesOfSplit(mended.get().doc.groups, mended.get().doc.groups[0].id);
    expect(p.first).toBeTruthy();
    expect(p.second!.items[0].id).toBe(panes.second);
  });

  it("a visitor's drag in the preview is their own: the panes follow it, the design does not change, a folded start gives way to it", () => {
    const { s } = withSplit({ collapsible: "second", collapsed: true });
    const doc = s.get().doc;
    const widths = guessMeasurer.measure(s.get());
    const split = doc.groups[0].items[0];
    const start = startState(doc.vars);
    const rightAt = (st: typeof start) => liveGroups(doc.groups, st, doc, widths).find((g) => g.items[0].id === "right")!.x;
    /* folded, the second pane is a strip of nothing at the far edge */
    expect(rightAt(start)).toBe(1001 + 16);
    const dragged = writeField(start, split, 25, doc);
    expect(liveItem(split, dragged).props).toMatchObject({ split: 25, collapsed: false });
    expect(rightAt(dragged)).toBe(250 + 1 + 16);
    const design = s.get().doc.groups[0].items[0].props!;
    expect([design.split ?? 50, design.collapsed]).toEqual([50, true]);
  });
});

describe("the guide an AI agent writes from", () => {
  it("gives a split view example that opens, sizes its panes and prints as it says", () => {
    const guide = readFileSync(new URL("../public/agent.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    const block = /#### Split view[\s\S]*?```json\n([\s\S]*?)```/.exec(guide)![1];
    const groups = block.trim().split("\n").map((line) => JSON.parse(line) as Group);
    const opened = openProject({ groups, frames: [{ id: "f", name: "Mail", x: 0, y: 0, w: 1280, h: 800 }], paletteKey: "purple", frame: "phone", title: "", brief: "" })!;
    const measures = { inbox: 120, "inbox:h": 28, subject: 300, "subject:h": 36 };
    const out = arrangeFlows(opened.groups, measures);
    /* 30% of the room the hairline leaves, the second pane after it; what each holds inside its padding */
    expect(out.find((g) => g.id === "p1")!.items[0].props).toMatchObject({ width: 384, height: 800 });
    expect(out.find((g) => g.id === "p2")).toMatchObject({ x: 385, y: 0 });
    expect(out.find((g) => g.id === "d1")).toMatchObject({ x: 385 + 24, y: 16 });
    const code = buildCode({ ...opened, groups: out }, measures).code;
    expect(code.indexOf("<SplitView")).toBeLessThan(code.indexOf("Inbox"));
    expect(code.indexOf("Inbox")).toBeLessThan(code.indexOf("Notes from the review"));
  });
});

describe("a split view in the three exports", () => {
  /** where each of `words` first comes in `code`, in order, or the first one out of order */
  const inOrder = (code: string, words: string[]) => {
    let at = -1;
    for (const w of words) {
      const next = code.indexOf(w, at + 1);
      if (next < 0) return `${w} missing or out of order`;
      at = next;
    }
    return "in order";
  };
  const doc = () => splitsDoc();

  it("web: the panes are printed inside the library's panel group, nested, sized as shares with limits in pixels", () => {
    const { doc: d, widths } = doc();
    const code = buildCode(d, widths).code;
    expect(inOrder(code, ["<SplitView", "defaultSplit={35}", "minFirst={240}", 'persist="m3e-split:outer"', "Folders", "New folder", "<SplitView", 'orientation="vertical"', 'collapsible="second"', "Message", "Terminal", "</SplitView>", "</SplitView>"])).toBe("in order");
    /* a pane fills its panel whatever it holds */
    expect(code).toMatch(/data-surface="panel"[^>]*style=\{\{ width: "100%", height: "100%" \}\}/);
    /* the widget itself sizes panels as percentages and limits as pixels: the library reads a bare number as pixels */
    const widget = readFileSync(new URL("../parts/widgets/Split.tsx", import.meta.url), "utf8");
    expect(widget).toContain("`${round2(side === \"first\" ? start.split : 100 - start.split)}%`");
    expect(widget).toContain("`${Math.round(v)}px`");
  });

  it("phone app and mini-program: their own SplitView with both panes in it, each filling its pane, the visitor's share kept as each platform can", async () => {
    const { doc: d, widths } = doc();
    const rn = printRnScreens(d, widths);
    const mini = printMiniScreens(d, widths);
    for (const printed of [rn, mini]) {
      const desk = printed.screens.find((x) => x.component === "SplitDeskScreen")!.source;
      expect(inOrder(desk, ["<SplitView", "split={35}", "Folders", "New folder", "<SplitView", 'orientation="vertical"', "Message", "Terminal", "</SplitView>", "</SplitView>"])).toBe("in order");
      expect(desk).toContain('persistKey="m3e-split:outer"');
      const phone = printed.screens.find((x) => x.component === "SplitPhoneScreen")!.source;
      expect(inOrder(phone, ["<SplitView", "List", "Detail", "</SplitView>"])).toBe("in order");
    }
    /* the phone app keeps it while it runs (no storage of its own), and says so; the mini-program keeps it in Taro's storage */
    expect(rn.warnings).toEqual([expect.objectContaining({ kind: "input", detail: expect.stringContaining("not across launches") })]);
    expect(mini.warnings.filter((w) => w.part === "splitView")).toEqual([]);
  });
});
