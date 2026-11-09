import { columnsOf, rowsByKey } from "./tables";
import { colorValue } from "./color";
import type { ListItem, PropDef, TableColumn, TableData } from "./types";

/* The row model (docs/组件规范.md "行模型"): every prop that holds rows, a list's (tabs, menu entries, a palette's
 * swatches) and a table's (a chart's points, a leaderboard's players, a scene's places to tap), is rows of cells under a
 * declared column structure. A column has a key the rows name a cell by and the kind of value it holds; a row is a
 * record of words by those keys. C4's table columns (parts/tables.ts) are the structure; a list's columns are declared
 * by its definition (its words, an icon, a picture, a choice of its own, a color). What stores a prop stays as the
 * format has it (a list's rows are already records, a table's are cells in its columns' order); what reads and writes
 * rows reads and writes them here: a part's tree (`P.rows`), the operation that gives a prop its rows (`set_rows`), the
 * patch that takes a row's tap and its choice along when rows move (lib/tokens.ts `rowsPatch`), the kits (by the same
 * keys, `columns` in their generated defaults), and what is later drawn once per row from data (lib/collections.ts:
 * a collection's rows are records by its fields, the same model).
 *
 * Plain functions over plain data: the parts, the editor, the tools and the exports read them. */

/** what a column holds: a table's kinds of value (parts/tables.ts), and the cells a list's row has besides words */
export type RowColumnType = NonNullable<TableColumn["type"]> | "icon" | "image" | "choice" | "color";

/** A column of rows: the key a row names its cell by, its header's words, the kind of value it holds (a choice's
 *  options) and, for a table's, how it is written and laid out. */
export type RowColumn = Omit<TableColumn, "type"> & { type?: RowColumnType; options?: string[] };

/** a row: its cells, by their columns' keys */
export type Row = Record<string, string>;

/** rows and the columns they are cells under */
export type Rows = { columns: RowColumn[]; rows: Row[] };

/** whether a prop holds rows */
export const holdsRows = (d: PropDef | undefined): d is Extract<PropDef, { kind: "list" | "table" }> => d?.kind === "list" || d?.kind === "table";

/** The columns a prop's rows are cells under: a list's as its definition declares them (its words, then an icon, a
 *  picture, each choice of its own and a color where it has them); a table's by its structure (its own, else the
 *  part's declared one, else each header's words). */
export function rowColumnsOf(d: Extract<PropDef, { kind: "list" | "table" }>, value?: unknown): RowColumn[] {
  if (d.kind === "table") {
    const t = isTable(value) ? value : d.default;
    return columnsOf(t, d.columns);
  }
  return [
    { key: "label", type: "text" },
    ...(d.icons ? [{ key: "icon", type: "icon" as const }] : []),
    ...(d.images ? [{ key: "image", type: "image" as const }] : []),
    ...(d.fields ?? []).map((f) => ({ key: f.key, label: f.label, type: "choice" as const, options: f.options.map((o) => (typeof o === "string" ? o : o.value)) })),
    ...(d.colors ? [{ key: "color", type: "color" as const }] : []),
  ];
}

const isTable = (v: unknown): v is TableData => !!v && typeof v === "object" && Array.isArray((v as TableData).columns) && Array.isArray((v as TableData).rows);

/** a list's row as a record of its cells: the cells its columns declare that it holds as words */
const recordOf = (columns: RowColumn[], row: ListItem): Row => {
  const out: Row = {};
  for (const c of columns) {
    const v = (row as Record<string, unknown>)[c.key];
    if (typeof v === "string") out[c.key] = v;
  }
  return out;
};

/** A table's rows as records, as its part reads them: each cell under its column's key (its own structure's, else the
 *  part's declared one, else its header's words), and where the author's structure does not line up with the columns
 *  the part declares (the registry's `lineUp` leaves such a table as it is), under the declared key of its place too,
 *  so a part reads by key the cells it would have read by place. */
function tableRecords(t: TableData, declared: TableColumn[] | undefined): Row[] {
  const cols = columnsOf(t, declared);
  const own = new Set(cols.map((c) => c.key));
  const also = (declared ?? []).map((c, i) => (i < cols.length && !own.has(c.key) ? c.key : undefined));
  return t.rows.map((row) => {
    const out: Row = {};
    cols.forEach((c, i) => {
      if (row[i] === undefined) return;
      out[c.key] ??= row[i];
      if (also[i]) out[also[i]!] ??= row[i];
    });
    return out;
  });
}

/** The rows a prop's value holds, as records by its columns' keys (a value as the part reads it: the registry's
 *  reader fills in defaults first). */
export function rowsOf(d: Extract<PropDef, { kind: "list" | "table" }>, value: unknown): Row[] {
  if (d.kind === "table") return isTable(value) ? tableRecords(value, d.columns) : [];
  if (!Array.isArray(value)) return [];
  const columns = rowColumnsOf(d);
  return value.filter((r): r is ListItem => !!r && typeof r === "object" && typeof (r as ListItem).label === "string").map((r) => recordOf(columns, r));
}

/** A prop's value with these rows, in the form the format stores it: a list's rows as records of the cells its columns
 *  declare (an empty cell left out, words always kept); a table's as cells in its columns' order, its headers and its
 *  structure as they were. A row may also be given as a table's cells in order. */
export function withRows(d: Extract<PropDef, { kind: "list" | "table" }>, was: unknown, rows: (Row | string[])[]): ListItem[] | TableData {
  const columns = rowColumnsOf(d, was);
  const asRecord = (r: Row | string[]): Row => (Array.isArray(r) ? Object.fromEntries(columns.map((c, i) => [c.key, r[i] ?? ""])) : r);
  if (d.kind === "table") {
    const t = isTable(was) ? was : d.default;
    return { ...t, rows: rows.map((r) => columns.map((c) => cellWords(asRecord(r)[c.key] ?? asRecord(r)[c.label ?? ""]))) };
  }
  return rows.map((given) => {
    const r = asRecord(given);
    const out: ListItem = { label: cellWords(r.label) };
    for (const c of columns) if (c.key !== "label" && typeof r[c.key] === "string" && r[c.key] !== "") (out as Record<string, string>)[c.key] = r[c.key];
    return out;
  });
}

/** what a cell holds, in words */
const cellWords = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

/** What is wrong with a row for its columns, or null: a choice that is none of its options, a color that is no color. */
export function rowError(columns: RowColumn[], row: Row): string | null {
  for (const c of columns) {
    const v = row[c.key];
    if (v === undefined || v === "") continue;
    if (c.type === "choice" && c.options && !c.options.includes(v)) return `${c.key} should be one of ${c.options.join(", ")}`;
    if (c.type === "color" && colorValue(v) === undefined) return `${c.key} should be a color: a role, a role at a share ("primary/40") or a hex`;
  }
  return null;
}

/** a row as the words that tell it from another: every cell, in its columns' order */
const identity = (columns: string[], r: Row) => JSON.stringify(columns.map((k) => r[k] ?? ""));

/** For each new row, the index of the old row it is, or -1 for a new one: the first unclaimed old row that is the same
 *  in every cell, else the first unclaimed one whose first cell (its words, a table's first column) is the same, else
 *  the old row that stood where it stands. So rows moved come with what was theirs, and a row edited where it stands
 *  is still the row that stood there. */
export function rowsOrder(was: Row[], rows: Row[], columns?: string[]): number[] {
  const keys = columns ?? [...new Set([...was, ...rows].flatMap((r) => Object.keys(r)))];
  const first = keys[0];
  const used = new Set<number>();
  const claim = (match: (r: Row, i: number) => boolean) => {
    const at = was.findIndex((r, i) => !used.has(i) && match(r, i));
    if (at >= 0) used.add(at);
    return at;
  };
  const order = rows.map((row) => claim((r) => identity(keys, r) === identity(keys, row)));
  if (first !== undefined) for (const [i, row] of rows.entries()) if (order[i] < 0) order[i] = claim((r) => (r[first] ?? "") === (row[first] ?? ""));
  for (const [i] of rows.entries()) if (order[i] < 0 && i < was.length && !used.has(i)) order[i] = claim((_, j) => j === i);
  return order;
}

/** a table's rows as the model has them, for code that only has a table (a kit, a printer): its columns' keys by its
 *  own structure, else the declared one, else its headers' words */
export const tableRows = (t: TableData, declared?: TableColumn[]): Rows => ({ columns: columnsOf(t, declared), rows: rowsByKey(t, declared) });

/** Places among rows, written as words ("0,2"), each moved to where its row went (`order`: for each new row, the index
 *  it had); a place whose row is gone is dropped. */
export function placesMoved(words: string, order: number[]): string {
  return words
    .split(/[\s,，]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
    .map((n) => order.indexOf(n))
    .filter((n) => n >= 0)
    .toSorted((a, b) => a - b)
    .join(",");
}
