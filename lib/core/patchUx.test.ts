import { describe, expect, it } from "vitest";
import { makeItem, type Group } from "../tokens";
import { counterIds, DocStore } from "./store";
import { stateOf } from "./state";
import { patchUx, relayout } from "./ops";

/* `set_style_layout` is what the editor's style panel runs too (src/editor/useStyleLayout.ts): the setting and the
 * layout it brings are one step, which one undo takes back together (the panel used to change the setting outside the
 * history and lay out as a step of its own, so an undo took back the layout and left the setting). */

const part = (id: string, slug: string, x: number, y: number, props: Record<string, unknown>): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }] });
const sizes: Record<string, number> = { bar: 412, "bar:h": 64, list: 380, "list:h": 120, go: 380, "go:h": 40 };
const fresh = () => {
  const store = new DocStore(
    stateOf({
      groups: [part("bar", "app-bar", 0, 0, { title: "T", width: 412 }), part("list", "item", 16, 100, { items: [{ label: "A" }], width: 380 }), part("go", "button", 16, 300, { label: "Go", width: 380 })],
      frames: [{ id: "F1", name: "Home", x: 0, y: 0 }],
    }),
    { ids: counterIds("id"), measurer: { measure: () => sizes }, lang: () => "en" },
  );
  /* laid out by the style as it is, so that only a setting that differs moves anything */
  try {
    store.run(relayout, {});
  } catch {
    /* laid out that way already */
  }
  store.clearHistory();
  return store;
};
const marginOf = (store: DocStore) => store.get().doc.theme.ux?.margin;
const goX = (store: DocStore) => store.get().doc.groups.find((g) => g.id === "g-go")!.x;

describe("the style's layout settings from the editor", () => {
  it("are one step with the layout they bring: one undo takes back both", () => {
    const store = fresh();
    const x = goX(store);
    store.run(patchUx, { patch: { margin: 32 } });
    expect(goX(store)).toBe(32);
    expect(store.history()).toEqual(["Style layout"]);
    store.undo();
    expect(goX(store)).toBe(x);
    expect(marginOf(store)).not.toBe(32);
  });

  it("are the same step for the editor as for an agent", () => {
    const store = fresh();
    store.run(patchUx, { patch: { margin: 24 } }, { origin: "ai" });
    expect(goX(store)).toBe(24);
    store.run(patchUx, { patch: { margin: 8 } });
    expect(store.history()).toEqual(["Style layout", "Style layout"]);
    store.undo();
    expect([goX(store), marginOf(store)]).toEqual([24, 24]);
  });
});
