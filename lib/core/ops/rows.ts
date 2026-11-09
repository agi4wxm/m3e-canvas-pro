/* The rows of a part's list or table (a navigation bar's tabs, a menu's entries, a chart's points, a leaderboard's
 * players) as one operation, on the row model (parts/rows.ts): rows of cells under the prop's declared columns. What a
 * row is goes with it when rows move, are added or removed: the part's chosen entry and every place it holds among the
 * rows (`of`) stay on the row they chose, and where the part's places (`tab:N` in `Item.actions`) are these rows, a
 * row's tap goes with it and a removed row's tap goes too (lib/tokens.ts `rowsPatch`, which the inspector uses as
 * well). `set_props` follows the same rule when a model gives a list prop its rows again in another order. */

import { partBySlug, reader } from "../../../parts/registry";
import { holdsRows, rowColumnsOf, rowError, rowsOf, rowsOrder as orderOfRows, withRows, type Row } from "../../../parts/rows";
import type { ListItem, PartDef, TableData } from "../../../parts/types";
import { listRowsPatch, rowsPatch, tableRowsPatch, type Item } from "../../tokens";
import { op, OpError, S } from "../op";
import { itemById, unlocked } from "./common";
import { setItem } from "./nodes";
import { checkProps } from "./validate";

/** For each new row of a list, the index of the old row it is, or -1 for a new one: the first unclaimed old row that is
 *  the same in every cell, else the first unclaimed one of the same words, else the one that stood where it stands
 *  (parts/rows.ts `rowsOrder`, by a list's cells). */
export function rowsOrder(was: ListItem[], rows: ListItem[]): number[] {
  const cells = (r: ListItem): Row => ({ label: r.label, icon: r.icon ?? "", variant: r.variant ?? "", width: r.width ?? "", image: r.image ?? "", color: r.color ?? "" });
  return orderOfRows(was.map(cells), rows.map(cells), ["label", "icon", "variant", "width", "image", "color"]);
}

/** the rows a list prop is given, as the part reads them */
const asRows = (def: PartDef, key: string, v: unknown): ListItem[] => reader(def, { [key]: v }).list(key);
/** What a part becomes when some of its props are set, its rows' taps and its choice going with its list's rows (and a
 *  table's) as `listRowsPatch` moves them. A choice the same call sets is the one it gets. */
export function propsPatch(item: Item, set: Record<string, unknown>, cleared: string[] = []): Partial<Item> {
  const def = partBySlug(item.component);
  const props = { ...item.props, ...set };
  for (const k of cleared) delete props[k];
  if (!def) return { props };
  let next: Item = item;
  for (const d of def.props) {
    if (!(d.key in set)) continue;
    if (d.kind === "list") {
      const was = reader(def, next.props).list(d.key);
      const rows = asRows(def, d.key, set[d.key]);
      next = { ...next, ...listRowsPatch(next, d.key, rows, rowsOrder(was, rows)) };
    } else if (d.kind === "table") next = { ...next, ...tableRowsPatch(next, d.key, set[d.key] as TableData) };
  }
  /* the rows' moves give the choice and the taps; every prop is then what the call says */
  const moved = { ...next.props, ...props };
  if (def.selectKey && !(def.selectKey in set) && next.props && def.selectKey in next.props) moved[def.selectKey] = next.props[def.selectKey];
  for (const k of cleared) delete moved[k];
  return { props: moved, ...(next.actions !== item.actions ? { actions: next.actions } : {}) };
}

export const setRows = op<{ id: string; prop: string; rows: unknown[]; order?: number[] }>({
  name: "set_rows",
  summary:
    "Gives a list or table prop of a part its rows (a navigation bar's tabs, a menu's entries, a chart's points, a leaderboard's players…), in order. A row is its cells by their columns' keys: a list's {label, icon?…}, a table's {<key>: \"…\"} by the keys describe_part gives its columns (or its cells in the columns' order). What a row is goes with it: the part's chosen entry and the rows it picked, and the tap of a place that is a row (slot \"tab:N\"), which is renumbered when rows move and removed with its row. order: for each new row, the index it had (-1 for a new one); left out, each row is the old row of the same cells, else of the same first cell.",
  args: S.obj(
    {
      id: S.str("the part"),
      prop: S.str("its list or table prop (describe_part lists them, with a table's column keys)"),
      rows: S.arr({ type: ["object", "array"], description: "a row: its cells by their columns' keys ({label, icon?, variant?, width?, image?, color?} for a list), or a table's cells in order" }),
      order: S.arr(S.int("the index the row had, -1 for a new one", { minimum: -1 })),
    },
    ["id", "prop", "rows"],
  ),
  label: () => "Rows",
  run(s, a, ctx) {
    const { item, group } = itemById(s, a.id);
    unlocked(group, "That part");
    const def = partBySlug(item.component);
    const d = def?.props.find((x) => x.key === a.prop);
    if (!def || !holdsRows(d)) throw new OpError("invalid_value", `${item.component} has no list or table prop ${JSON.stringify(a.prop)}.${def ? ` Its props of rows are: ${def.props.filter(holdsRows).map((x) => x.key).join(", ") || "none"}.` : ""}`, a.prop);
    if (!Array.isArray(a.rows) || a.rows.some((r) => !r || typeof r !== "object")) throw new OpError("invalid_value", "rows should be a list of rows: each its cells by their columns' keys, or a table's cells in order.", "rows");
    if (d.kind === "table") {
      /* a table's rows as cells under its columns: by key, or in its columns' order */
      const now = reader(def, item.props).table(a.prop);
      const columns = rowColumnsOf(d, now);
      const keys = new Set(columns.flatMap((c) => [c.key, c.label ?? ""]));
      for (const [i, r] of (a.rows as object[]).entries()) {
        if (Array.isArray(r) ? r.length > columns.length : Object.keys(r).some((k) => !keys.has(k)))
          throw new OpError("invalid_value", `row ${i} has a cell the table has no column for: its columns are ${columns.map((c) => c.key).join(", ")}.`, "rows");
      }
      const next = withRows(d, now, a.rows as (Row | string[])[]) as TableData;
      if (ctx.strict) checkProps(def, { [a.prop]: next }, s);
      const order = a.order ?? orderOfRows(rowsOf(d, now), rowsOf(d, next), columns.map((c) => c.key));
      checkOrder(order, next.rows.length, now.rows.length);
      return setItem.run(s, { id: a.id, patch: rowsPatch(item, a.prop, next, order) }, { ...ctx, strict: false });
    }
    if (ctx.strict) checkProps(def, { [a.prop]: a.rows }, s);
    const columns = rowColumnsOf(d);
    for (const [i, r] of a.rows.entries()) {
      const bad = Array.isArray(r) ? null : rowError(columns, r as Row);
      if (bad && ctx.strict) throw new OpError("invalid_value", `row ${i}: ${bad}.`, "rows");
    }
    const was = reader(def, item.props).list(a.prop);
    /* a list's row given as its cells in its columns' order is that row */
    const rows = asRows(def, a.prop, a.rows.map((r) => (Array.isArray(r) ? (withRows(d, undefined, [r as string[]]) as ListItem[])[0] : r)));
    const order = a.order ?? rowsOrder(was, rows);
    checkOrder(order, rows.length, was.length);
    return setItem.run(s, { id: a.id, patch: listRowsPatch(item, a.prop, rows, order) }, { ...ctx, strict: false });
  },
});

/** an order is, for each new row, the index it had (each once) or -1 */
function checkOrder(order: number[], rows: number, was: number) {
  if (order.length !== rows || order.some((o) => !Number.isInteger(o) || o < -1 || o >= was) || new Set(order.filter((o) => o >= 0)).size !== order.filter((o) => o >= 0).length)
    throw new OpError("invalid_value", `order should give, for each of the ${rows} rows, the index it had (0 to ${was - 1}, each once) or -1 for a new one.`, "order");
}
