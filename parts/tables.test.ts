import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { setGlobalLang } from "../lib/i18n";
import { liveItem, startState, type PreviewState } from "../lib/interact";
import { propValueError } from "../lib/core/ops/validate";
import { makeItem, tableRowsPatch, type Item } from "../lib/tokens";
import { loadAllModules } from "./components";
import { columnsOf, formatCell, keyOfHeader, lineUp, rowsByKey, tableOfData } from "./tables";
import { PARTS, defaultValues, partBySlug, reader, treeOf } from "./registry";
import { TABLE_COLUMNS } from "./tableColumns";
import { renderNode } from "./render";
import type { TableData } from "./types";

/* A table's column structure and a table read from data (parts/tables.ts, docs/组件规范.md "表格"). */

beforeAll(async () => {
  vi.stubGlobal("window", { innerWidth: 1280, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  setGlobalLang("en");
  await loadAllModules();
});

const INVOICES: TableData = { columns: ["Invoice", "Status", "Amount"], rows: [["INV001", "Paid", "250"], ["INV002", "Pending", "1350.5"]] };

describe("a table's columns", () => {
  it("are keyed by their headers until the author says otherwise", () => {
    expect(keyOfHeader("Due date", 0)).toBe("dueDate");
    expect(keyOfHeader("  ", 2)).toBe("col3");
    expect(columnsOf(INVOICES).map((c) => c.key)).toEqual(["invoice", "status", "amount"]);
    const spec = columnsOf({ ...INVOICES, spec: [{ key: "id" }, { key: "state" }, { key: "total", type: "currency", format: "EUR" }] });
    expect(spec.map((c) => [c.key, c.label, c.type])).toEqual([["id", "Invoice", undefined], ["state", "Status", undefined], ["total", "Amount", "currency"]]);
    expect(rowsByKey({ ...INVOICES, spec: [{ key: "id" }, { key: "state" }, { key: "total" }] })[1]).toEqual({ id: "INV002", state: "Pending", total: "1350.5" });
  });

  it("write their values as their type says", () => {
    expect(formatCell("1350.5", { key: "a", type: "number", format: "2" })).toBe("1,350.50");
    expect(formatCell("1350.5", { key: "a", type: "currency", format: "EUR" })).toBe("€1,350.50");
    expect(formatCell("0.25", { key: "a", type: "percent" })).toBe("25%");
    expect(formatCell("2026-11-08", { key: "a", type: "date" })).toBe("11/8/2026");
    expect(formatCell("true", { key: "a", type: "bool" })).toBe("✓");
    /* what is not what the column holds stays as it was */
    expect(formatCell("n/a", { key: "a", type: "number" })).toBe("n/a");
    expect(formatCell("$1,350.00", { key: "a" })).toBe("$1,350.00");
  });

  it("draw the table part by their structure, and as it always did with none", () => {
    const def = partBySlug("table")!;
    const draw = (data: TableData) => renderToStaticMarkup(createElement("div", null, renderNode(treeOf(def, { ...defaultValues(def), data }))));
    expect(draw(INVOICES)).not.toContain("text-right");
    const out = draw({ ...INVOICES, spec: [{ key: "id", width: 120 }, { key: "state", align: "center" }, { key: "total", type: "currency", format: "EUR" }] });
    expect(out).toContain('style="width:120px"');
    expect(out).toMatch(/class="[^"]*text-center/);
    expect(out).toMatch(/text-right[^>]*>€1,350\.50</);
  });

  it("are checked as they are written", () => {
    const d = partBySlug("table")!.props.find((x) => x.key === "data")!;
    expect(propValueError(d, { ...INVOICES, rows: [["a", "b", "c", "d"]] })).toMatch(/4 cells, the table 3 columns/);
    expect(propValueError(d, { ...INVOICES, spec: [{ key: "1x" }] })).toMatch(/key/);
    expect(propValueError(d, { ...INVOICES, spec: [{ key: "id", type: "money" }] })).toMatch(/type/);
    expect(propValueError(d, { ...INVOICES, spec: [{ key: "id", type: "number", align: "end", width: 80, format: "2" }] })).toBeNull();
  });
});

describe("the columns each part reads", () => {
  it("are declared for every table prop, by key, as many as its table has or fewer", () => {
    const KEY = /^[A-Za-z_$][\w$]{0,63}$/;
    for (const d of PARTS)
      for (const t of d.props) {
        if (t.kind !== "table") continue;
        /* the table part's columns are its author's own */
        if (t.structure) continue;
        expect(t.columns, `${d.slug}.${t.key} declares no column structure`).toBeTruthy();
        expect(t.columns!.length, `${d.slug}.${t.key}`).toBeLessThanOrEqual(t.default.columns.length + 1);
        const keys = t.columns!.map((c) => c.key);
        expect(keys.every((k) => KEY.test(k)) && new Set(keys).size === keys.length, `${d.slug}.${t.key} keys ${keys}`).toBe(true);
      }
    /* each declaration names a table prop there is */
    for (const at of Object.keys(TABLE_COLUMNS)) {
      const [slug, key] = at.split(".");
      expect(partBySlug(slug)?.props.find((x) => x.key === key)?.kind, at).toBe("table");
    }
  });

  it("line up an author's table with a structure of its own, so the part reads each cell by its key", () => {
    const declared = TABLE_COLUMNS["leaderboard.data"];
    const author: TableData = { columns: ["Points", "Player", "Move"], rows: [["9,820", "Ada", "+2"]], spec: [{ key: "score" }, { key: "name" }, { key: "change" }] };
    expect(lineUp(author, declared)).toEqual({ columns: ["Player", "Points", "Move"], rows: [["Ada", "9,820", "+2"]], spec: [{ key: "name" }, { key: "score" }, { key: "change" }] });
    /* the part reads it that way */
    expect(reader(partBySlug("leaderboard")!, { data: author }).table("data").rows[0][0]).toBe("Ada");
    /* a table with no structure of its own, or one that lacks a key the part reads, stays as it is */
    const plain = { columns: author.columns, rows: author.rows };
    expect(lineUp(plain, declared)).toBe(plain);
    const short = { ...author, spec: [{ key: "score" }, { key: "player" }, { key: "change" }] };
    expect(lineUp(short, declared)).toBe(short);
  });

  it("lay out records from data by the part's keys, whatever order their fields come in", () => {
    const def = partBySlug("leaderboard")!;
    const d = def.props.find((x) => x.key === "data")!;
    const design = reader(def, {}).table("data");
    expect(tableOfData([{ change: "-1", name: "Lin", score: 7 }], design, d.kind === "table" ? d.columns : undefined)?.rows).toEqual([["Lin", "7", "-1"]]);
  });
});

describe("a table read from data", () => {
  it("lays out a list of records by its columns' keys, lists cell by cell, a table as it is", () => {
    const design: TableData = { ...INVOICES, spec: [{ key: "id" }, { key: "status" }, { key: "total" }] };
    expect(tableOfData([{ id: "A1", status: "Paid", total: 12 }, { id: "A2", total: 3.5 }], design)?.rows).toEqual([["A1", "Paid", "12"], ["A2", "", "3.5"]]);
    /* with no structure, a record's fields go by the headers' keys or words */
    expect(tableOfData([{ invoice: "B1", Status: "Due", amount: 7 }], INVOICES)?.rows).toEqual([["B1", "Due", "7"]]);
    expect(tableOfData([["C1", "Paid", "1"]], INVOICES)?.rows).toEqual([["C1", "Paid", "1"]]);
    expect(tableOfData({ columns: ["X"], rows: [["1"]] }, INVOICES)).toEqual({ columns: ["X"], rows: [["1"]] });
    expect(tableOfData("nope", INVOICES)).toBeNull();
    expect(tableOfData(Array.from({ length: 300 }, () => ({})), INVOICES)?.rows).toHaveLength(200);
    /* its headers and structure are the design's */
    expect(tableOfData([], design)).toEqual({ ...design, rows: [] });
  });

  it("shows in the preview what a collection or an API list holds, by key", () => {
    const it0: Item = { ...makeItem("table"), id: "t", props: { data: { ...INVOICES, spec: [{ key: "id" }, { key: "status" }, { key: "total" }] } }, bind: { data: "=collections.Orders" } };
    const state = (scope: Record<string, unknown>): PreviewState => ({ ...startState([]), ctx: { scope, varNames: [], forms: {}, eval: { lang: "en" } } });
    const shown = liveItem(it0, state({ collections: { Orders: [{ id: "O-1", status: "Shipped", total: "40" }] } }));
    expect((shown.props!.data as TableData).rows).toEqual([["O-1", "Shipped", "40"]]);
    const api = liveItem({ ...it0, bind: { data: "=data.orders.items" } }, state({ data: { orders: { items: [{ id: "O-2", status: "New", total: 5 }] } } }));
    expect((api.props!.data as TableData).rows).toEqual([["O-2", "New", "5"]]);
    /* what is no list keeps the design's rows */
    expect((liveItem(it0, state({})).props!.data as TableData).rows).toEqual(INVOICES.rows);
  });
});

describe("a bound list's rows", () => {
  it("keep the state their part reads from variant and width", () => {
    const it0: Item = { ...makeItem("button-group"), id: "g", bind: { items: "=data.tabs" } };
    const s: PreviewState = { ...startState([]), ctx: { scope: { data: { tabs: [{ label: "Day", variant: "filled", width: "wide" }, { name: "Week" }] } }, varNames: [], forms: {}, eval: { lang: "en" } } };
    expect(liveItem(it0, s).props?.items).toEqual([{ label: "Day", variant: "filled", width: "wide" }, { label: "Week" }]);
  });
});

describe("editing a table's rows", () => {
  it("takes each row's tap and the part's choice with it", () => {
    const def = partBySlug("leaderboard")!;
    const data = defaultValues(def).data as TableData;
    const it0: Item = { ...makeItem("leaderboard"), id: "l", props: { ...defaultValues(def), selected: 1 }, actions: { "tab:0": { to: "a", transition: "slide" }, "tab:1": { to: "b", transition: "slide" } } };
    /* the first two rows swap places */
    const swapped = { ...data, rows: [data.rows[1], data.rows[0], ...data.rows.slice(2)] };
    const patch = tableRowsPatch(it0, "data", swapped);
    expect(patch.props?.selected).toBe(0);
    expect(patch.actions).toEqual({ "tab:1": { to: "a", transition: "slide" }, "tab:0": { to: "b", transition: "slide" } });
    /* a row taken out takes its tap with it */
    const gone = tableRowsPatch(it0, "data", { ...data, rows: data.rows.slice(1) });
    expect(gone.actions).toEqual({ "tab:0": { to: "b", transition: "slide" } });
  });
});
