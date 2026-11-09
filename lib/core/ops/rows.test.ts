/* A part's list rows as one operation (set_rows) and through set_props: a row's tap (`tab:N`) and the part's chosen
 * entry go with the row when rows move, and go with it when it is removed; the rows of a list whose places are not
 * its rows leave the taps alone. Run as a model calls them (strict). */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../../i18n";
import { makeItem, type Action, type Group, type Item } from "../../tokens";
import { guessMeasurer, OpError } from "../op";
import { counterIds, DocStore } from "../store";
import { stateOf } from "../state";
import { opByName } from ".";
import * as ops from ".";
import { rowsOrder } from "./rows";

beforeAll(() => setGlobalLang("en"));

const to = (id: string): Action => ({ to: id });
const rows = (...labels: string[]) => labels.map((label) => ({ label }));
const screens = ["F1", "a", "b", "c"].map((id, i) => ({ id, name: id, x: i * 500, y: 0 }));
const group = (it: Partial<Item> & { component: string }): Group => ({ id: "g", x: 16, y: 700, axis: "x", items: [{ ...makeItem(it.component), id: "p", ...it }] });
const store = (it: Partial<Item> & { component: string }) => new DocStore(stateOf({ groups: [group(it)], frames: screens }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
const bar = (selected?: number) => store({ component: "navigation-bar", props: { items: rows("A", "B", "C"), ...(selected === undefined ? {} : { selected }) }, actions: { "tab:0": to("a"), "tab:2": to("c") } });
const part = (s: DocStore) => s.get().doc.groups[0].items[0];
const ai = { origin: "ai" as const };

describe("which old row each new row is", () => {
  it("is the one the same in every field, else the one of the same words, else the one that stood there", () => {
    expect(rowsOrder(rows("A", "B", "C"), rows("C", "A", "B"))).toEqual([2, 0, 1]);
    expect(rowsOrder([{ label: "A", icon: "x" }, { label: "A", icon: "y" }], [{ label: "A", icon: "y" }, { label: "A", icon: "x" }])).toEqual([1, 0]);
    expect(rowsOrder(rows("A", "B", "C"), rows("A", "Bee", "C"))).toEqual([0, 1, 2]);
    expect(rowsOrder(rows("A", "B", "C"), rows("B", "C"))).toEqual([1, 2]);
    expect(rowsOrder(rows("A", "B"), rows("A", "B", "New"))).toEqual([0, 1, -1]);
  });
});

describe("set_rows", () => {
  it("moves a row's tap and the chosen entry with the row", () => {
    const s = bar(2);
    s.run(opByName("set_rows")!, { id: "p", prop: "items", rows: rows("C", "A", "B") } as never, ai);
    expect(part(s).props?.items).toEqual(rows("C", "A", "B"));
    expect(part(s).actions).toEqual({ "tab:0": to("c"), "tab:1": to("a") });
    expect(part(s).props?.selected).toBe(0);
  });

  it("takes the order it is given, and removes a removed row's tap", () => {
    const s = bar();
    s.run(ops.setRows, { id: "p", prop: "items", rows: rows("X", "C", "Y"), order: [-1, 2, -1] }, ai);
    expect(part(s).actions).toEqual({ "tab:1": to("c") });
  });

  it("is one step to undo", () => {
    const s = bar();
    s.run(ops.setRows, { id: "p", prop: "items", rows: rows("C", "B", "A") }, ai);
    s.undo();
    expect(part(s).actions).toEqual({ "tab:0": to("a"), "tab:2": to("c") });
  });

  it("refuses a prop that is no list, rows the part cannot have and an order that does not fit", () => {
    const refused = (args: Record<string, unknown>, words: RegExp) => {
      expect(() => bar().run(ops.setRows, args as never, ai)).toThrow(OpError);
      expect(() => bar().run(ops.setRows, args as never, ai)).toThrow(words);
    };
    refused({ id: "p", prop: "selected", rows: rows("A") }, /no list or table prop "selected"/);
    refused({ id: "p", prop: "items", rows: rows("A", "B", "C"), order: [0] }, /order should give/);
    refused({ id: "p", prop: "items", rows: rows("A", "B", "C"), order: [0, 0, 1] }, /order should give/);
    refused({ id: "p", prop: "items", rows: rows("A", "B", "C"), order: [7, 0, 1] }, /order should give/);
    refused({ id: "p", prop: "items", rows: rows("A") }, /at least 3 rows/);
  });
});

describe("set_props on a list", () => {
  it("renumbers the rows' taps when a model gives the rows again in another order", () => {
    const s = bar(1);
    s.run(ops.setProps, { id: "p", props: { items: rows("B", "C", "A") } }, ai);
    expect(part(s).actions).toEqual({ "tab:2": to("a"), "tab:1": to("c") });
    expect(part(s).props?.selected).toBe(0);
  });

  it("gives the part the choice the same call sets", () => {
    const s = bar(1);
    s.run(ops.setProps, { id: "p", props: { items: rows("B", "C", "A"), selected: 2 } }, ai);
    expect(part(s).props?.selected).toBe(2);
    expect(part(s).actions).toEqual({ "tab:2": to("a"), "tab:1": to("c") });
  });

  it("leaves the taps alone when the rows only change their words, and when the list is not the part's places", () => {
    const s = bar(1);
    s.run(ops.setProps, { id: "p", props: { items: rows("A", "Bee", "C") } }, ai);
    expect(part(s).actions).toEqual({ "tab:0": to("a"), "tab:2": to("c") });
    const menu = store({ component: "cascading-menu", props: { subItems: rows("A", "B") }, actions: { "tab:0": to("a") } });
    menu.run(ops.setProps, { id: "p", props: { subItems: rows("B", "A") } }, ai);
    expect(part(menu).actions).toEqual({ "tab:0": to("a") });
  });

  it("sets every other prop as it always did, and resets one given as null", () => {
    const s = bar(1);
    s.run(ops.setProps, { id: "p", props: { selected: null } }, ai);
    expect(part(s).props).not.toHaveProperty("selected");
    expect(part(s).actions).toEqual({ "tab:0": to("a"), "tab:2": to("c") });
  });
});

/* ---------- the row model: a table's rows as records, places among rows ---------- */

describe("set_rows on a table (the row model)", () => {
  const board = () =>
    store({
      component: "leaderboard",
      props: { data: { columns: ["Name", "Score", "Change"], rows: [["Ann", "90", "1"], ["Bo", "80", "0"], ["Cy", "70", "-1"]] }, selected: 2 },
      actions: { "tab:0": to("a"), "tab:2": to("c") },
    });
  const invoices = () => store({ component: "table", props: { data: { columns: ["Invoice", "Status", "Amount"], rows: [["INV-1", "Paid", "$1"], ["INV-2", "Open", "$2"], ["INV-3", "Paid", "$3"]] }, selectedRow: 1 } });

  it("takes rows as records by the keys its columns are read by, and the choice and the taps go with them", () => {
    const s = board();
    s.run(ops.setRows, { id: "p", prop: "data", rows: [{ name: "Cy", score: "70", change: "-1" }, { name: "Ann", score: "95", change: "2" }, { name: "Bo", score: "80", change: "0" }] }, ai);
    expect((part(s).props!.data as { rows: string[][] }).rows).toEqual([["Cy", "70", "-1"], ["Ann", "95", "2"], ["Bo", "80", "0"]]);
    /* Ann was edited and kept her first cell: still her row */
    expect(part(s).actions).toEqual({ "tab:1": to("a"), "tab:0": to("c") });
    expect(part(s).props?.selected).toBe(0);
  });

  it("takes a row as its cells in its columns' order, and refuses a cell it has no column for", () => {
    const s = board();
    s.run(ops.setRows, { id: "p", prop: "data", rows: [["Dee", "60", "3"]], order: [-1] }, ai);
    expect((part(s).props!.data as { rows: string[][] }).rows).toEqual([["Dee", "60", "3"]]);
    expect(part(s).actions).toBeUndefined();
    expect(() => board().run(ops.setRows, { id: "p", prop: "data", rows: [{ name: "X", rank: "1" }] }, ai)).toThrow(/no column for: its columns are name, score, change/);
  });

  it("keeps the row a table has picked (`of`) on its row, and none when it is gone", () => {
    const s = invoices();
    const row = (invoice: string) => ({ invoice, status: "Paid", amount: "$" });
    s.run(ops.setRows, { id: "p", prop: "data", rows: [{ invoice: "INV-3", status: "Paid", amount: "$3" }, { invoice: "INV-2", status: "Open", amount: "$2" }] }, ai);
    expect(part(s).props?.selectedRow).toBe(1);
    s.run(ops.setRows, { id: "p", prop: "data", rows: [row("INV-3")], order: [0] }, ai);
    expect(part(s).props?.selectedRow).toBe(-1);
  });

  it("keeps a multiple choice's picks on their rows (`of`), and drops a removed row's", () => {
    const s = store({ component: "multi-select", props: { items: rows("Email", "Push", "SMS"), picked: "0,2" } });
    s.run(ops.setRows, { id: "p", prop: "items", rows: rows("SMS", "Email", "Push") }, ai);
    expect(part(s).props?.picked).toBe("0,1");
    s.run(ops.setRows, { id: "p", prop: "items", rows: rows("Email", "Push") }, ai);
    expect(part(s).props?.picked).toBe("0");
  });

  it("refuses a palette's row of no color", () => {
    const s = store({ component: "color-palette" });
    expect(() => s.run(ops.setRows, { id: "p", prop: "colors", rows: [{ label: "Red", color: "red" }] }, ai)).toThrow(/color/);
    s.run(ops.setRows, { id: "p", prop: "colors", rows: [{ label: "Brand", color: "primary" }, { label: "Ink", color: "#1d1b20" }] }, ai);
    expect(part(s).props?.colors).toEqual([{ label: "Brand", color: "primary" }, { label: "Ink", color: "#1d1b20" }]);
  });
});
