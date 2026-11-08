import type { TableColumn, TableData } from "./types";

/* A table's column structure (docs/组件规范.md "表格"): each column has a key the data names it by, the words its
 * header shows, the kind of value it holds and how that value is written, and its width and alignment. A part declares
 * the columns it reads (`PropDef.columns`) and reads a row's cells by key, not by place; a table the author lays out
 * (the `table` part) keeps its own structure with its data (`TableData.spec`). A table read from data (a collection,
 * an API list) is laid out by the same keys. Plain functions over plain data: the parts, the preview and the tools read
 * them. */

/** the kinds of value a column holds */
export const COLUMN_TYPES = ["text", "number", "currency", "percent", "date", "bool"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

/** a key as data names a column: its header's words in camelCase ("Due date" → "dueDate"), else its place */
export const keyOfHeader = (header: string, at: number): string => {
  const words = header.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return `col${at + 1}`;
  const [first, ...rest] = words;
  return first.toLowerCase() + rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
};

/** The structure of a table's columns: the table's own where it has one, else the part's declared one, else a column
 *  of words for each header (keyed by its words). One for each of the table's columns, in their order. */
export function columnsOf(t: Pick<TableData, "columns" | "spec">, declared?: TableColumn[]): TableColumn[] {
  const own = Array.isArray(t.spec) ? t.spec : undefined;
  return t.columns.map((header, i) => {
    const given = own?.[i] ?? declared?.[i];
    const key = typeof given?.key === "string" && given.key ? given.key : keyOfHeader(header, i);
    return { ...given, key, label: header };
  });
}

/** An author's table with a structure of its own, its columns in the order the part reads them: each declared key where
 *  the author put it, then the rest as they were. A part reads its cells by key this way, though it reads them by place.
 *  A table without a structure of its own, or one that lacks a declared key, is as it was. */
export function lineUp(t: TableData, declared: TableColumn[] | undefined): TableData {
  if (!declared?.length || !Array.isArray(t.spec)) return t;
  const cols = columnsOf(t);
  const order: number[] = [];
  for (const d of declared) {
    const at = cols.findIndex((c, i) => c.key === d.key && !order.includes(i));
    if (at < 0) return t;
    order.push(at);
  }
  for (let i = 0; i < cols.length; i++) if (!order.includes(i)) order.push(i);
  if (order.every((o, i) => o === i)) return t;
  const spec = t.spec;
  return { columns: order.map((i) => t.columns[i]), rows: t.rows.map((r) => order.map((i) => r[i] ?? "")), spec: order.map((i) => spec[i] ?? { key: cols[i].key }) };
}

/** a table's rows as records by its columns' keys */
export function rowsByKey(t: TableData, declared?: TableColumn[]): Record<string, string>[] {
  const cols = columnsOf(t, declared);
  return t.rows.map((row) => Object.fromEntries(cols.map((c, i) => [c.key, row[i] ?? ""])));
}

/** what an expression gave, in words for a cell */
const cellWords = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "");

/** the rows a table shows at most, as a bound list shows its rows (lib/interact.ts) */
export const MAX_TABLE_ROWS = 200;

/** A table out of what data gave it: a list of records (an API list, a collection's rows) laid out by the columns' keys,
 *  a list of lists cell by cell, or a table of its own. The design's columns stay (their headers, their structure);
 *  null when the data is none of these. */
export function tableOfData(v: unknown, design: TableData, declared?: TableColumn[]): TableData | null {
  const cols = columnsOf(design, declared);
  const keep = (rows: string[][]): TableData => ({ ...design, rows: rows.slice(0, MAX_TABLE_ROWS) });
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const t = v as Partial<TableData>;
    if (Array.isArray(t.columns) && Array.isArray(t.rows)) return { columns: t.columns.map(cellWords), rows: t.rows.filter(Array.isArray).slice(0, MAX_TABLE_ROWS).map((r) => r.map(cellWords)), ...(Array.isArray(t.spec) ? { spec: t.spec } : {}) };
    return null;
  }
  if (!Array.isArray(v)) return null;
  if (v.every((r) => Array.isArray(r))) return keep(v.map((r: unknown[]) => cols.map((_, i) => cellWords(r[i]))));
  /* records: each column reads its key, then its header's words as they are */
  return keep(
    v.map((r) => {
      const rec = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      return cols.map((c) => cellWords(rec[c.key] ?? rec[c.label ?? ""]));
    }),
  );
}

/** A cell as its column writes it: a number with its decimals and the reader's grouping, an amount in its currency, a
 *  share as a percent, a day as the reader's date, yes or no; words as they are, and anything that is not what its
 *  column holds as it was given. `format` is the decimals for a number or a percent ("2"), the currency code ("EUR"). */
export function formatCell(value: string, c: TableColumn | undefined, locale = "en"): string {
  const type = c?.type ?? "text";
  if (type === "text" || value.trim() === "") return value;
  try {
    if (type === "bool") return /^(true|yes|1)$/i.test(value.trim()) ? "✓" : /^(false|no|0)$/i.test(value.trim()) ? "—" : value;
    if (type === "date") {
      const t = Date.parse(value);
      return Number.isFinite(t) ? new Date(t).toLocaleDateString(locale, { timeZone: "UTC" }) : value;
    }
    const n = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(n)) return value;
    const digits = /^\d$/.test(c?.format ?? "") ? Number(c!.format) : undefined;
    if (type === "currency") return new Intl.NumberFormat(locale, { style: "currency", currency: /^[A-Z]{3}$/.test(c?.format ?? "") ? c!.format! : "USD" }).format(n);
    if (type === "percent") return new Intl.NumberFormat(locale, { style: "percent", ...(digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : {}) }).format(n);
    return new Intl.NumberFormat(locale, digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : {}).format(n);
  } catch {
    return value;
  }
}

/** where a column's words stand: numbers at the end unless the column says otherwise */
export const alignOf = (c: TableColumn | undefined): "start" | "center" | "end" => c?.align ?? (c?.type === "number" || c?.type === "currency" || c?.type === "percent" ? "end" : "start");
