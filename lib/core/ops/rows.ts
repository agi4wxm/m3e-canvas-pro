/* The rows of a part's list (a navigation bar's tabs, a menu's entries, a segmented button's segments) as one
 * operation: what a row is goes with it when rows move, are added or removed. The part's chosen entry stays on the
 * row it chose, and where the part's places (`tab:N` in `Item.actions`) are this list's rows, a row's tap goes with it
 * and a removed row's tap goes too (lib/tokens.ts `listRowsPatch`, which the inspector uses as well). `set_props`
 * follows the same rule when a model gives a list prop its rows again in another order. */

import { partBySlug, reader } from "../../../parts/registry";
import type { ListItem, PartDef, TableData } from "../../../parts/types";
import { listRowsPatch, tableRowsPatch, type Item } from "../../tokens";
import { op, OpError, S } from "../op";
import { itemById, unlocked } from "./common";
import { setItem } from "./nodes";
import { checkProps } from "./validate";

/** a row as its words and what it says of itself, to tell one row from another */
const rowKey = (r: ListItem) => JSON.stringify([r.label, r.icon ?? "", r.variant ?? "", r.width ?? "", r.image ?? ""]);

/** For each new row, the index of the old row it is, or -1 for a new one: the first unclaimed old row that is the same
 *  in every field, else the first unclaimed one of the same words. So rows moved come with what was theirs, and a row
 *  whose words were edited where it stands is still the row that stood there. */
export function rowsOrder(was: ListItem[], rows: ListItem[]): number[] {
  const used = new Set<number>();
  const claim = (match: (r: ListItem, i: number) => boolean) => {
    const at = was.findIndex((r, i) => !used.has(i) && match(r, i));
    if (at >= 0) used.add(at);
    return at;
  };
  const order = rows.map((row) => claim((r) => rowKey(r) === rowKey(row)));
  for (const [i, row] of rows.entries()) if (order[i] < 0) order[i] = claim((r) => r.label === row.label);
  /* a row whose words were edited where it stands is still the row that stood there */
  for (const [i] of rows.entries()) if (order[i] < 0 && i < was.length && !used.has(i)) order[i] = claim((_, j) => j === i);
  return order;
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

export const setRows = op<{ id: string; prop: string; rows: ListItem[]; order?: number[] }>({
  name: "set_rows",
  summary:
    "Gives a list prop of a part its rows (a navigation bar's tabs, a menu's entries…), in order: each {label, icon?…}. What a row is goes with it: the part's chosen entry, and the tap of a place that is a row (slot \"tab:N\"), which is renumbered when rows move and removed with its row. order: for each new row, the index it had (-1 for a new one); left out, each row is the old row of the same words.",
  args: S.obj(
    {
      id: S.str("the part"),
      prop: S.str("its list prop (describe_part lists them)"),
      rows: S.arr(S.any("a row: {label, icon?, variant?, width?, image?}")),
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
    if (!def || d?.kind !== "list") throw new OpError("invalid_value", `${item.component} has no list prop ${JSON.stringify(a.prop)}.${def ? ` Its list props are: ${def.props.filter((x) => x.kind === "list").map((x) => x.key).join(", ") || "none"}.` : ""}`, a.prop);
    if (ctx.strict) checkProps(def, { [a.prop]: a.rows }, s);
    const was = reader(def, item.props).list(a.prop);
    const rows = asRows(def, a.prop, a.rows);
    const order = a.order ?? rowsOrder(was, rows);
    if (order.length !== rows.length || order.some((o) => !Number.isInteger(o) || o < -1 || o >= was.length) || new Set(order.filter((o) => o >= 0)).size !== order.filter((o) => o >= 0).length)
      throw new OpError("invalid_value", `order should give, for each of the ${rows.length} rows, the index it had (0 to ${was.length - 1}, each once) or -1 for a new one.`, "order");
    return setItem.run(s, { id: a.id, patch: listRowsPatch(item, a.prop, rows, order) }, { ...ctx, strict: false });
  },
});
