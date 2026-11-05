import { describe, expect, it } from "vitest";
import { h } from "../parts/node";
import { startingValuesOf } from "./PartView";

describe("startingValuesOf", () => {
  it("finds what a tree sets only once, however deep", () => {
    const tree = h("div", null, h("Tabs", { defaultValue: "tab-2" }), "words", h("Switch", { defaultChecked: true, className: "x" }));
    expect(startingValuesOf(tree)).toBe(`defaultValue="tab-2";defaultChecked=true`);
  });
  it("says nothing of a tree with none, so a change to it draws nothing afresh", () => {
    expect(startingValuesOf(h("Button", { variant: "text" }, "Go"))).toBe("");
  });
});
