import { describe, expect, it } from "vitest";
import { makeItem, type Group } from "../tokens";
import { guessMeasurer } from "./op";
import { counterIds, DocStore, type StoreView } from "./store";
import { stateOf } from "./state";
import { pick, type Picked } from "./react";

const part = (id: string, y: number): Group => ({ id: `g-${id}`, x: 16, y, axis: "x", items: [{ ...makeItem("button"), id }] });
const fresh = () => new DocStore(stateOf({ groups: [part("a", 100), part("b", 200)], frames: [{ id: "F1", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("id"), measurer: guessMeasurer, lang: () => "en" });

describe("a slice of the store", () => {
  it("stays the same object through a selection, a measure and a history step that leave it alone", () => {
    const store = fresh();
    const groups = (v: StoreView) => v.state.doc.groups;
    let last: Picked<StoreView["state"]["doc"]["groups"]> = pick(null, store.view(), groups, Object.is);
    const first = last.value;
    store.select(["a"]);
    store.setWidths({ a: 120, "a:h": 40 });
    store.checkpoint("Edit");
    last = pick(last, store.view(), groups, Object.is);
    expect(last.value).toBe(first);
    /* the slice changed: the new one */
    store.update("Move", "user", (s) => ({ ...s, doc: { ...s.doc, groups: s.doc.groups.map((g) => (g.id === "g-a" ? { ...g, y: 140 } : g)) } }));
    last = pick(last, store.view(), groups, Object.is);
    expect(last.value).not.toBe(first);
    expect(last.value[0].y).toBe(140);
  });

  it("keeps a derived slice that is equal to the last one, and reads a new selector even on the same view", () => {
    const store = fresh();
    const ids = (v: StoreView) => v.state.session.selection.slice().sort();
    const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
    store.select(["b", "a"]);
    let last = pick(null, store.view(), ids, sameList);
    const first = last.value;
    store.select(["a", "b"]);
    last = pick(last, store.view(), ids, sameList);
    expect(last.value).toBe(first);
    /* a selector that closes over something else asks again, with nothing in the store changed */
    const only = (v: StoreView) => v.state.session.selection.filter((x) => x === "a");
    last = pick(last, store.view(), only, sameList);
    expect(last.value).toEqual(["a"]);
  });
});
