import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { makeItem, type Group } from "./tokens";
import { childrenOfSelection, layerTree, parentOfSelection, pickInside, pickTarget, screenNodeId, siblingOf } from "./layerTree";
import { counterIds, DocStore } from "./core/store";
import { stateOf } from "./core/state";
import { moveLayer } from "./core/ops/layers";

beforeAll(() => setGlobalLang("en"));

const screen = { id: "F1", name: "Home", x: 0, y: 0 };
const part = (id: string, slug: string, x: number, y: number, extra: Partial<Group> = {}, props: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }], ...extra });
const W: Record<string, number> = { card: 300, "card:h": 200, row: 260, "row:h": 48, a: 80, "a:h": 40, b: 80, "b:h": 40, t: 100, "t:h": 20, loose: 60, "loose:h": 30, free: 200, "free:h": 160 };

/* a column box holding a text and a row; the row holds two buttons; a part on its own beside the box */
const doc = (): Group[] => [
  part("card", "box", 20, 100, {}, { layout: "column", width: 300, height: 200 }),
  part("t", "text", 36, 116, { inFlow: "g-card" }),
  part("row", "box", 36, 150, { inFlow: "g-card" }, { layout: "row", width: 260, height: 48 }),
  part("a", "button", 36, 150, { inFlow: "g-row" }),
  part("b", "button", 120, 150, { inFlow: "g-row" }),
  part("loose", "chip", 20, 400),
];

describe("the layers tree", () => {
  it("nests what layouts place under them, in run order, and lists a screen front first", () => {
    const tree = layerTree(doc(), [screen], W);
    const s = tree.nodes.get(screenNodeId("F1"))!;
    expect(s.children).toEqual(["g-loose", "g-card"]);
    expect(tree.nodes.get("g-card")!.children).toEqual(["g-t", "g-row"]);
    expect(tree.nodes.get("g-card")!.flow).toBe("column");
    expect(tree.nodes.get("g-row")!.children).toEqual(["g-a", "g-b"]);
    expect(tree.nodes.get("g-a")!.placed).toBe("flow");
    expect(tree.nodeOfItem.get("a")).toBe("g-a");
  });

  it("puts what lies inside a container without a layout under it, if drawn over it", () => {
    const groups = [part("free", "box", 0, 0, {}, { layout: "free", width: 200, height: 160 }), part("a", "button", 20, 20), part("b", "button", 300, 20)];
    const tree = layerTree(groups, [screen], W);
    expect(tree.nodes.get("g-free")!.children).toEqual(["g-a"]);
    expect(tree.nodes.get(screenNodeId("F1"))!.children).toEqual(["g-b", "g-free"]);
  });

  it("selects the outermost layer in the selection's context, and goes in and out", () => {
    const tree = layerTree(doc(), [screen], W);
    /* nothing selected: the card, the top layer the button is in */
    expect(pickTarget(tree, "a", [])).toEqual(["card"]);
    /* Ctrl/Cmd: the button itself */
    expect(pickTarget(tree, "a", [], true)).toEqual(["a"]);
    /* with the card selected, a double-click goes one level in, then another */
    expect(pickInside(tree, "a", ["card"])).toEqual(["row"]);
    expect(pickInside(tree, "a", ["row"])).toEqual(["a"]);
    /* with the text selected (inside the card), a press on a button picks its sibling there: the row */
    expect(pickTarget(tree, "a", ["t"])).toEqual(["row"]);
    /* with a button selected, the other button is a sibling */
    expect(pickTarget(tree, "b", ["a"])).toEqual(["b"]);
    /* and a part elsewhere is picked at the top */
    expect(pickTarget(tree, "loose", ["a"])).toEqual(["loose"]);
    expect(childrenOfSelection(tree, ["card"])).toEqual(["t", "row"]);
    expect(childrenOfSelection(tree, ["t"])).toBeNull();
    expect(parentOfSelection(tree, ["a"])).toEqual({ items: ["row"] });
    expect(parentOfSelection(tree, ["card"])).toEqual({ screen: "F1" });
    expect(siblingOf(tree, ["t"], 1)).toEqual(["row"]);
    expect(siblingOf(tree, ["row"], 1)).toEqual(["t"]);
    expect(siblingOf(tree, ["t"], -1)).toEqual(["row"]);
  });

  it("treats a hand-made group as a layer and its parts as its children", () => {
    const g: Group = { id: "grp", x: 0, y: 500, axis: "x", free: true, pos: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, items: [{ ...makeItem("button"), id: "a" }, { ...makeItem("button"), id: "b" }] };
    const tree = layerTree([g], [screen], W);
    expect(tree.nodes.get("grp")!.kind).toBe("group");
    expect(tree.nodes.get("grp")!.children).toEqual(["grp:b", "grp:a"]);
    expect(pickTarget(tree, "a", [])).toEqual(["a", "b"]);
    expect(pickInside(tree, "a", ["a", "b"])).toEqual(["a"]);
  });
});

describe("moving a layer in the tree", () => {
  const store = (groups: Group[]) => new DocStore(stateOf({ groups, frames: [screen] }, { widths: W }), { ids: counterIds("n"), measurer: { measure: () => W }, lang: () => "en" });
  const kids = (s: DocStore, id: string) => s.get().doc.groups.filter((g) => g.inFlow === id).map((g) => g.id);

  it("reorders inside a layout and puts a layer into another one", () => {
    const s = store(doc());
    s.run(moveLayer, { id: "g-b", parent: "g-row", index: 0 });
    expect(kids(s, "g-row")).toEqual(["g-b", "g-a"]);
    /* the loose chip into the card, between the text and the row */
    s.run(moveLayer, { id: "g-loose", parent: "g-card", index: 1 });
    expect(kids(s, "g-card")).toEqual(["g-t", "g-loose", "g-row"]);
  });

  it("takes a layer out of its layout to the top of the screen", () => {
    const s = store(doc());
    s.run(moveLayer, { id: "g-t", parent: null, index: 0 });
    const t = s.get().doc.groups.find((g) => g.id === "g-t")!;
    expect(t.inFlow).toBeUndefined();
    const tree = layerTree(s.get().doc.groups, [screen], W);
    expect(tree.nodes.get(screenNodeId("F1"))!.children[0]).toBe("g-t");
    expect(kids(s, "g-card")).toEqual(["g-row"]);
  });

  it("refuses to put a layer inside itself, or into what holds nothing", () => {
    const s = store(doc());
    expect(() => s.run(moveLayer, { id: "g-card", parent: "g-row", index: 0 })).toThrow(/inside itself/);
    expect(() => s.run(moveLayer, { id: "g-t", parent: "g-loose", index: 0 })).toThrow(/holds/);
  });

  it("moves a layer into a box without a layout so that it lies inside it", () => {
    const groups = [part("free", "box", 0, 0, {}, { layout: "free", width: 200, height: 160 }), part("b", "button", 300, 20)];
    const s = store(groups);
    s.run(moveLayer, { id: "g-b", parent: "g-free", index: 0 });
    const tree = layerTree(s.get().doc.groups, [screen], W);
    expect(tree.nodes.get("g-free")!.children).toEqual(["g-b"]);
  });
});
