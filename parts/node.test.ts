/* A part's tree holds nodes (what `h` builds) and plain values; a plain value may carry a `type` of its own (a world
 * view's input `{ name: "move", type: "vec2" }`). Read as a node it was printed as an element (`inputs={[<vec2 />]}`,
 * which failed the exported web app's typecheck) and drawn as one on the canvas. */

import { describe, expect, it } from "vitest";
import { h, isNode } from "./node";
import { inlineNode, namesIn, printValue } from "./print";
import { partBySlug, treeOf } from "./registry";

describe("a node", () => {
  it("is a type with at most its props and children; a value with a type beside other keys is data", () => {
    expect(isNode(h("Button"))).toBe(true);
    expect(isNode(h("Button", { label: "x" }, h("Icon")))).toBe(true);
    expect(isNode({ type: "div", props: undefined, children: undefined })).toBe(true);
    expect(isNode({ name: "move", type: "vec2" })).toBe(false);
    expect(isNode({ id: "r1", type: "card", label: "A row of data" })).toBe(false);
    expect(isNode([h("Button")])).toBe(false);
    expect(isNode({ props: {} })).toBe(false);
  });

  it("prints a value with a type of its own as data", () => {
    expect(printValue([{ name: "move", type: "vec2" }, { name: "attack" }])).toBe('[{ name: "move", type: "vec2" }, { name: "attack" }]');
    expect(printValue([h("Icon", { name: "add" })])).toBe('[<Icon name="add" />]');
  });

  it("prints a world view's inputs as the data they are, naming nothing to import", () => {
    const def = partBySlug("world-view")!;
    const tree = treeOf(def, { inputs: "move: vec2, attack: bool" });
    expect(inlineNode(tree)).toContain('inputs={[{ name: "move", type: "vec2" }, { name: "attack", type: "bool" }]}');
    expect([...namesIn(tree)]).toEqual(["WorldView"]);
  });
});
