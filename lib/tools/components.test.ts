/* The read tools see inside a component's definition: list_components gives its parts and the keys an instance
 * overrides them by, with the definition's values, and describe_node describes a part of the definition (or the
 * component itself) instead of saying it is not on the canvas. */

import { beforeAll, describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "../core";
import { setGlobalLang } from "../i18n";
import { executeTool, type ToolOutcome } from ".";

beforeAll(() => setGlobalLang("en"));

const ok = (o: ToolOutcome) => {
  if (!o.ok) throw new Error(`${o.error.code} ${o.error.message}`);
  return o.result as Record<string, unknown>;
};

/** a product card made a component, as the shop fixture of the eval suite builds it */
function shop() {
  const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  s.transact("Shop", "system", (tx) => {
    tx.run(ops.addScreen, { id: "shop", name: "Shop" });
    tx.run(ops.addTree, {
      screen: "shop",
      tree: {
        part: "box",
        id: "card",
        props: { surface: "card", layout: "column", gap: 8, hugWidth: false, width: 180 },
        children: [
          { part: "image", id: "card-image", props: { width: 156, height: 120 } },
          { part: "text", id: "card-name", props: { text: "Name", style: "lead" } },
          { part: "text", id: "card-price", props: { text: "$0" } },
          { part: "button", id: "card-add", props: { label: "Add to cart" } },
        ],
      },
    });
    tx.run(ops.makeComponentOp, { ids: ["card"], name: "Product card", id: "product" });
  });
  return s;
}

describe("inside a component", () => {
  it("list_components gives the parts with their words and the override keys with the definition's values", async () => {
    const s = shop();
    const [c] = ok(await executeTool(s, "list_components", {}, { origin: "ai" })) as unknown as Record<string, unknown>[];
    expect(c).toMatchObject({ id: "product", name: "Product card", instances: 1 });
    expect(c.parts).toEqual(expect.arrayContaining(['card-name:text "Name"', 'card-add:button "Add to cart"']));
    expect(c.overrideKeys).toEqual(expect.arrayContaining(['card-name/text = "Name"', 'card-price/text = "$0"', 'card-add/label = "Add to cart"', 'card-image/src = ""']));
    expect(c.switches).toEqual(expect.arrayContaining(["card-add/disabled"]));
  });

  it("describe_node describes a part of the definition and the component itself", async () => {
    const s = shop();
    const part = ok(await executeTool(s, "describe_node", { id: "card-name" }, { origin: "ai" }));
    expect(part).toMatchObject({ id: "card-name", slug: "text", component: { id: "product", name: "Product card" } });
    expect(part.overrideKeys).toContain("card-name/text");
    expect((part.props as { key: string; value: unknown }[]).find((p) => p.key === "text")?.value).toBe("Name");
    const whole = ok(await executeTool(s, "describe_node", { id: "product" }, { origin: "ai" }));
    expect(whole).toMatchObject({ id: "product", name: "Product card" });
    const none = await executeTool(s, "describe_node", { id: "nope" }, { origin: "ai" });
    expect(none.ok).toBe(false);
  });

  it("the keys it gives are the ones set_overrides takes", async () => {
    const s = shop();
    const inst = s.get().doc.groups.find((g) => g.instanceOf === "product")!;
    ok(await executeTool(s, "set_overrides", { id: inst.id, key: "card-name/text", value: "Apple" }, { origin: "ai" }));
    expect(s.get().doc.groups.find((g) => g.id === inst.id)!.overrides).toEqual({ "card-name/text": "Apple" });
  });
});
