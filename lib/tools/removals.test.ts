/* Removals told apart by what records hold, not by how many there are (report 13.3 AI-1): a list written over with
 * as many new records is a removal, an edit of some fields is not; every piece taken has a key that names it the
 * same way each time. */

import { describe, expect, it } from "vitest";
import { lostRecords, mocksTargets, takenTargets } from "./removals";
import type { Doc } from "../tokens";

const doc = (rows: string[][], fields = ["name", "price"]): Doc => ({ groups: [], frames: [], paletteKey: "purple", frame: "phone", title: "", brief: "", collections: [{ id: "fruit", name: "Fruit", fields, rows }] });
const ROWS = [
  ["Apple", "1"],
  ["Pear", "2"],
  ["Fig", "3"],
];

describe("records that are gone", () => {
  it("finds a record however it moved, and one edited in a field or two", () => {
    const cells = (rows: string[][]) => rows.map(([name, price]) => ({ name, price }));
    expect(lostRecords(cells(ROWS), cells([ROWS[2], ROWS[0], ROWS[1]]))).toEqual([]);
    expect(lostRecords(cells(ROWS), cells([["Apple", "9"], ["Pear", "2"], ["Fig", "3"]]))).toEqual([]);
    expect(lostRecords(cells(ROWS), cells([["Kiwi", "4"], ["Pear", "2"], ["Fig", "3"]])).map((x) => x.index)).toEqual([0]);
  });

  it("goes by a record's own id when it has one", () => {
    const before = [
      { id: "1", name: "Lamp" },
      { id: "2", name: "Desk" },
    ];
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    const edited = [
      { id: "1", name: "Big lamp" },
      { id: "2", name: "Desk" },
    ];
    expect(lostRecords(before, edited, { before: ids(before), after: ids(edited) })).toEqual([]);
    const swapped = [
      { id: "3", name: "Lamp" },
      { id: "4", name: "Desk" },
    ];
    expect(lostRecords(before, swapped, { before: ids(before), after: ids(swapped) }).map((x) => x.key)).toEqual(["id:1", "id:2"]);
  });
});

describe("rows of a collection", () => {
  it("counts a whole list written over with as many rows, and a shorter one, but not field edits", () => {
    expect(takenTargets(doc(ROWS), doc([["Kiwi", "4"], ["Plum", "5"], ["Lime", "6"]])).map((t) => t.taken)).toEqual([{ kind: "rows", of: "Fruit", n: 3, total: 3, replaced: true }]);
    expect(takenTargets(doc(ROWS), doc([["Apple", "1"]])).map((t) => t.taken)).toEqual([{ kind: "rows", of: "Fruit", n: 2, total: 3 }]);
    expect(takenTargets(doc(ROWS), doc([["Apple", "1.1"], ["Pear", "2.2"], ["Fig", "3.3"]]))).toEqual([]);
    /* one row of three written over is an edit, not a batch replacement */
    expect(takenTargets(doc(ROWS), doc([["Kiwi", "4"], ["Pear", "2"], ["Fig", "3"]]))).toEqual([]);
  });

  it("keys each lost row by what it held, the same every time", () => {
    const a = takenTargets(doc(ROWS), doc([["Apple", "1"]]))[0].keys.map((k) => k.key);
    const b = takenTargets(doc(ROWS), doc([["Apple", "1"], ["Kiwi", "9"]]))[0].keys.map((k) => k.key);
    expect(a).toHaveLength(2);
    expect(b).toEqual(a);
    expect(takenTargets(doc(ROWS), doc([]))[0].keys.map((k) => k.key)).toEqual(expect.arrayContaining(a));
  });

  it("keeps a row by its id field while the rest of it is edited", () => {
    const fields = ["id", "name"];
    expect(takenTargets(doc([["a", "Apple"], ["b", "Pear"]], fields), doc([["a", "Green apple"], ["b", "Pear"]], fields))).toEqual([]);
    expect(takenTargets(doc([["a", "Apple"], ["b", "Pear"]], fields), doc([["c", "Apple"], ["d", "Pear"]], fields)).map((t) => t.taken)).toEqual([{ kind: "rows", of: "Fruit", n: 2, total: 2, replaced: true }]);
  });
});

describe("pinned mock records", () => {
  const pinned = (fixtures: Record<string, unknown>[]) => ({ models: [{ name: "Product", fixtures }] });
  it("counts records written over under new ids, not edited ones", () => {
    const was = [
      { id: "p1", name: "Lamp", price: 10 },
      { id: "p2", name: "Desk", price: 90 },
    ];
    expect(mocksTargets(pinned(was), pinned([{ id: "p1", name: "Lamp", price: 12 }, { id: "p2", name: "Desk", price: 80 }]))).toEqual([]);
    expect(mocksTargets(pinned(was), pinned([{ id: "p3", name: "Sofa", price: 300 }, { id: "p4", name: "Rug", price: 40 }])).map((t) => t.taken)).toEqual([{ kind: "mockRecords", of: "Product", n: 2, replaced: true }]);
    expect(mocksTargets(pinned(was), pinned([])).map((t) => t.taken)).toEqual([{ kind: "mockRecords", of: "Product", n: 2 }]);
  });
});
