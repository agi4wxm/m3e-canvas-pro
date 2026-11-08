import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/tokens";
import { MeasureBook, withMeasures } from "./measureBook";

const item = (id: string, label = id): Item => ({ id, kind: "component", label: "", icon: null, variant: "filled", component: "button", props: { label } });
const screens = (ids: string[], w = 412, h = 917) => new Map(ids.map((id) => [id, { w, h }]));

describe("the measure book", () => {
  it("has every new part due, and nothing again for the same lists", () => {
    const book = new MeasureBook();
    const items = [item("a"), item("b")];
    const s = screens(["a", "b"]);
    book.sync(items, s);
    expect(book.take().sort()).toEqual(["a", "b"]);
    book.sync(items, s);
    expect(book.pending).toBe(false);
    /* the same parts in new lists (a widths change works the screens out afresh): still nothing */
    book.sync([...items], screens(["a", "b"]));
    expect(book.take()).toEqual([]);
  });

  it("has only the part drawn from a new item, or on a screen of another size, due", () => {
    const book = new MeasureBook();
    const a = item("a");
    const b = item("b");
    book.sync([a, b], screens(["a", "b"]));
    book.take();
    book.sync([a, item("b", "longer words")], screens(["a", "b"]));
    expect(book.take()).toEqual(["b"]);
    const s = screens(["a", "b"]);
    s.set("a", { w: 800, h: 600 });
    book.sync([a, b], s);
    expect(book.take().sort()).toEqual(["a", "b"]);
  });

  it("forgets the parts no longer drawn: its caches follow the parts on the canvas", () => {
    const book = new MeasureBook();
    const many = Array.from({ length: 500 }, (_, i) => item(`p${i}`));
    book.sync(many, screens(many.map((x) => x.id)));
    for (const id of book.take()) {
      book.measured(id, { w: 100, h: 40 }, false);
      book.baseline(id, 100, 40, () => 28);
    }
    expect(book.size).toBe(500);
    const few = many.slice(0, 20);
    expect(book.sync(few, screens(few.map((x) => x.id)))).toHaveLength(480);
    expect(book.size).toBe(20);
    const again = [...few, ...Array.from({ length: 30 }, (_, i) => item(`q${i}`))];
    book.sync(again, screens(again.map((x) => x.id)));
    expect(book.size).toBe(50);
  });

  it("reads a baseline again only at another size, or once the faces changed", () => {
    const book = new MeasureBook();
    book.sync([item("a")], screens(["a"]));
    let reads = 0;
    const read = (v: number) => () => (reads++, v);
    expect(book.baseline("a", 100, 40, read(28))).toBe(28);
    expect(book.baseline("a", 100, 40, read(30))).toBe(28);
    expect(reads).toBe(1);
    /* a face loaded: the same outer size, another baseline */
    book.invalidateAll();
    expect(book.take()).toEqual(["a"]);
    expect(book.baseline("a", 100, 40, read(31))).toBe(31);
    expect(book.baseline("a", 120, 40, read(29))).toBe(29);
    expect(reads).toBe(3);
  });

  it("has a part due when its box changed size by itself, not when it is the size it was measured at", () => {
    const book = new MeasureBook();
    book.sync([item("a")], screens(["a"]));
    book.take();
    book.measured("a", { w: 100, h: 40 }, false);
    expect(book.resized("a", 100, 40)).toBe(false);
    expect(book.resized("a", 120, 40)).toBe(true);
    expect(book.take()).toEqual(["a"]);
    /* a part it does not know (gone already) is nothing */
    expect(book.resized("zz", 1, 1)).toBe(false);
  });

  it("has the parts drawn in a fit box due when an overlay settles", () => {
    const book = new MeasureBook();
    book.sync([item("a"), item("b")], screens(["a", "b"]));
    book.take();
    book.measured("a", { w: 400, h: 600 }, true);
    book.measured("b", { w: 100, h: 40 }, false);
    book.overlaysMoved();
    expect(book.take()).toEqual(["a"]);
    book.measured("a", { w: 400, h: 600 }, false);
    book.overlaysMoved();
    expect(book.take()).toEqual([]);
  });
});

describe("the measures written back", () => {
  it("are the same object when nothing changed", () => {
    const cur = { a: 100, "a:h": 40, "a:base": 28 };
    expect(withMeasures(cur, { a: 100, "a:h": 40, "a:base": 28 }, [])).toBe(cur);
    expect(withMeasures(cur, {}, ["zz"])).toBe(cur);
  });

  it("put in what changed, and take out a baseline that is no longer there and the parts gone", () => {
    const cur = { a: 100, "a:h": 40, "a:base": 28, b: 50, "b:h": 20 };
    const next = withMeasures(cur, { a: 120, "a:h": 40, "a:base": undefined }, ["b"]);
    expect(next).toEqual({ a: 120, "a:h": 40 });
    expect(cur).toEqual({ a: 100, "a:h": 40, "a:base": 28, b: 50, "b:h": 20 });
  });
});
