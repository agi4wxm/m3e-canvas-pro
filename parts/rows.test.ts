/* The row model (parts/rows.ts, docs/组件规范.md "行模型"): a list's and a table's rows are records of cells under the
 * prop's declared columns, read and written in one place; a part reads by key the cells it read by place; places among
 * rows move with their rows; a collection is rows of the same model. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "../lib/i18n";
import { collectionRows, withCollectionRows } from "../lib/collections";
import { makeItem, rowsPatch, type Item } from "../lib/tokens";
import { PARTS, partBySlug, reader } from "./registry";
import { holdsRows, placesMoved, rowColumnsOf, rowError, rowsOf, rowsOrder, tableRows, withRows } from "./rows";
import type { PropDef, TableData } from "./types";

beforeAll(() => setGlobalLang("en"));

const prop = (slug: string, key: string) => partBySlug(slug)!.props.find((d) => d.key === key) as Extract<PropDef, { kind: "list" | "table" }>;

describe("the columns of a prop of rows", () => {
  it("are a list's words and the cells its definition gives each row", () => {
    expect(rowColumnsOf(prop("navigation-bar", "items")).map((c) => [c.key, c.type])).toEqual([
      ["label", "text"],
      ["icon", "icon"],
    ]);
    expect(rowColumnsOf(prop("button-group", "items")).map((c) => c.key)).toEqual(["label", "icon", "variant", "width"]);
    expect(rowColumnsOf(prop("button-group", "items"))[2].options).toContain("filled");
    expect(rowColumnsOf(prop("color-palette", "colors")).map((c) => [c.key, c.type])).toEqual([
      ["label", "text"],
      ["color", "color"],
    ]);
  });

  it("are a table's structure: the keys its part reads it by, its headers' words", () => {
    expect(rowColumnsOf(prop("scene", "hotspots")).map((c) => c.key)).toEqual(["label", "x", "y", "w", "h"]);
    expect(rowColumnsOf(prop("table", "data")).map((c) => c.key)).toEqual(["invoice", "status", "amount"]);
  });
});

describe("rows as records", () => {
  it("read a list's rows by their columns, and write them back in the format's form", () => {
    const d = prop("navigation-bar", "items");
    const rows = rowsOf(d, [{ label: "Home", icon: "home" }, { label: "Me" }]);
    expect(rows).toEqual([{ label: "Home", icon: "home" }, { label: "Me" }]);
    expect(withRows(d, undefined, [{ label: "Home", icon: "home" }, { label: "Me", icon: "" }, ["Inbox", "inbox"]])).toEqual([{ label: "Home", icon: "home" }, { label: "Me" }, { label: "Inbox", icon: "inbox" }]);
  });

  it("read a table's rows by key and write them as cells in its columns' order, its headers and structure kept", () => {
    const d = prop("leaderboard", "data");
    const t: TableData = { columns: ["Name", "Score", "Change"], rows: [["Ann", "90", "1"]] };
    expect(rowsOf(d, t)).toEqual([{ name: "Ann", score: "90", change: "1" }]);
    expect(withRows(d, t, [{ score: "5", name: "Bo" }])).toEqual({ columns: ["Name", "Score", "Change"], rows: [["Bo", "5", ""]] });
    expect(tableRows(t, (d as Extract<PropDef, { kind: "table" }>).columns).columns.map((c) => c.key)).toEqual(["name", "score", "change"]);
  });

  it("read by key what a part read by place, where the author's structure names a column otherwise", () => {
    const d = prop("scene", "hotspots");
    const t: TableData = { columns: ["Where", "x", "y", "w", "h"], rows: [["Door", "10", "20", "30"]], spec: [{ key: "where" }, { key: "left" }] };
    const [row] = rowsOf(d, t);
    expect(row).toMatchObject({ where: "Door", label: "Door", left: "10", x: "10", y: "20", w: "30" });
    /* a cell the row does not have is none, as reading it by place gave */
    expect(row.h).toBeUndefined();
  });

  it("are what every part with a table reads by its declared keys, the same cells it reads by place", () => {
    for (const def of PARTS)
      for (const d of def.props) {
        if (d.kind !== "table" || !d.columns?.length) continue;
        const p = reader(def, {});
        const byPlace = p.table(d.key).rows;
        const byKey = p.rows(d.key);
        byPlace.forEach((cells, r) => d.columns!.forEach((c, i) => expect(byKey[r][c.key], `${def.slug}.${d.key}[${r}].${c.key}`).toBe(cells[i])));
      }
  });

  it("are checked by their columns: a choice among its options, a color of the one color value", () => {
    expect(rowError(rowColumnsOf(prop("button-group", "items")), { label: "A", variant: "nope" })).toMatch(/variant should be one of/);
    expect(rowError(rowColumnsOf(prop("color-palette", "colors")), { label: "A", color: "red" })).toMatch(/color/);
    expect(rowError(rowColumnsOf(prop("color-palette", "colors")), { label: "A", color: "primary/40" })).toBeNull();
  });

  it("say which props hold rows", () => {
    expect(holdsRows(prop("navigation-bar", "items"))).toBe(true);
    expect(holdsRows(prop("table", "data"))).toBe(true);
    expect(holdsRows(partBySlug("table")!.props.find((d) => d.key === "title"))).toBe(false);
  });
});

describe("which old row each new row is", () => {
  it("is the one of the same cells, else of the same first cell, else the one that stood there", () => {
    const r = (name: string, score = "1") => ({ name, score });
    expect(rowsOrder([r("A"), r("B"), r("C")], [r("C"), r("A"), r("B")])).toEqual([2, 0, 1]);
    expect(rowsOrder([r("A"), r("B")], [r("B", "9"), r("A")])).toEqual([1, 0]);
    expect(rowsOrder([r("A"), r("B")], [r("A"), r("Bee")])).toEqual([0, 1]);
    expect(rowsOrder([r("A"), r("B")], [r("A"), r("B"), r("New")])).toEqual([0, 1, -1]);
  });

  it("moves places among rows with their rows, and drops a removed row's", () => {
    expect(placesMoved("0,2", [2, 0, 1])).toBe("0,1");
    expect(placesMoved("1", [0, 2])).toBe("");
    expect(placesMoved("", [1, 0])).toBe("");
  });
});

describe("a place among rows (`of`)", () => {
  const part = (component: string, props: Record<string, unknown>): Item => ({ ...makeItem(component), id: "p", props });

  it("goes with its row when a table's rows move, and is none once its row is gone", () => {
    const t = (...ids: string[]): TableData => ({ columns: ["Invoice", "Status", "Amount"], rows: ids.map((id) => [id, "Paid", "$1"]) });
    const it = part("table", { data: t("A", "B", "C"), selectedRow: 2 });
    expect(rowsPatch(it, "data", t("C", "A", "B"), [2, 0, 1]).props?.selectedRow).toBe(0);
    expect(rowsPatch(it, "data", t("A", "B"), [0, 1]).props?.selectedRow).toBe(-1);
  });
});

describe("a collection", () => {
  it("is rows of the same model: its fields are its columns, its rows records by them", () => {
    const c = { id: "c", name: "Fruit", fields: ["name", "price"], rows: [["Apple", "1"], ["Pear"]] };
    expect(collectionRows(c)).toEqual({ columns: [{ key: "name", type: "text" }, { key: "price", type: "text" }], rows: [{ name: "Apple", price: "1" }, { name: "Pear", price: "" }] });
    expect(withCollectionRows(c, [{ price: "3", name: "Fig", colour: "green" }])).toEqual({ ...c, rows: [["Fig", "3"]] });
  });
});
