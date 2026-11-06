import { describe, expect, it } from "vitest";
import { makeItem, type Group, type Item } from "../lib/tokens";
import { boundTextIds } from "./previewText";

const text = (id: string, extra: Partial<Item> = {}, props: Record<string, unknown> = {}): Item => ({ ...makeItem("text"), id, ...extra, props: { text: "Description", ...props } });
const column = (id: string): Group => ({ id, x: 0, y: 0, axis: "y", items: [{ ...makeItem("box"), id: `${id}-box`, props: { layout: "column" } }] });
const inside = (host: string, it: Item, y = 0): Group => ({ id: `g-${it.id}`, x: 0, y, axis: "y", inFlow: host, items: [it] });

describe("the bound words the preview lays out by what they say", () => {
  it("takes the texts in an auto layout that data fills, and leaves the rest as the canvas measured them", () => {
    const groups: Group[] = [
      column("row"),
      inside("row", text("element", { scope: { item: { name: "A lamp" }, index: 0 } })),
      inside("row", text("bound", { bind: { text: "=data.product.value.description" } })),
      inside("row", text("template", {}, { text: "{{len(data.cart.items)}} in the cart" })),
      inside("row", text("plain")),
      inside("row", text("hugging", { scope: { item: {}, index: 0 } }, { fit: "auto" })),
      inside("row", text("tall", { scope: { item: {}, index: 0 }, flowSize: { h: "fixed" } })),
      inside("row", text("filling", { scope: { item: {}, index: 0 }, flowFill: true })),
      { id: "loose", x: 0, y: 0, axis: "y", items: [text("loose", { scope: { item: {}, index: 0 } })] },
      inside("nowhere", text("orphan", { scope: { item: {}, index: 0 } })),
    ];
    expect([...boundTextIds(groups)]).toEqual(["element", "bound", "template"]);
  });
});
