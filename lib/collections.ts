import { flowOf } from "./flow";
import { type Collection, type Group, type Item, heldBy, retarget } from "./tokens";

/* Data-bound repeat. A layout container with `Group.repeat` draws its first child once per row of a
 * collection. The rows are real groups in the expanded document, placed by the same `arrangeFlows`
 * as everything else, so the row count drives the layout: a column that hugs its contents grows.
 * Row one keeps the template's own ids, so it stays the part the author selects and edits; the other
 * rows are `host#2/itemId` and exist only in the expansion. */

type Widths = Record<string, number>;
export type Row = Record<string, string>;

/** far more than a sketch needs, and few enough that a hand-written file cannot stall the editor */
const MAX_ROWS = 200;
const MAX_GROUPS = 6000;

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export const rowOf = (c: Collection, at: number): Row => Object.fromEntries(c.fields.map((f, i) => [f, c.rows[at]?.[i] ?? ""]));

/** the rows a repeat draws, with its limit taken into account */
export const rowsOfRepeat = (c: Collection, limit?: number): Row[] => {
  const count = Math.min(c.rows.length, limit ?? Infinity, MAX_ROWS);
  return Array.from({ length: Math.max(0, count) }, (_, i) => rowOf(c, i));
};

/** a field of a row as a read-only variable of the tap */
export const rowVars = (row: Row): Record<string, string> => Object.fromEntries(Object.entries(row).map(([k, v]) => [`row.${k}`, v]));

/** the first row of every collection, the earlier collection winning on a shared field */
export const firstRows = (collections: Collection[]): Row => Object.assign({}, ...[...collections].reverse().map((c) => rowOf(c, 0))) as Row;

/** A value with its tokens filled in, the same object where nothing changed. It walks the whole value
 *  so that the words of a list row or a table cell are reached too, not only plain text props. */
function fillDeep<T>(value: T, fill: (text: string) => string): T {
  if (typeof value === "string") return fill(value) as T;
  if (Array.isArray(value)) {
    const out = value.map((x) => fillDeep(x, fill));
    return out.some((x, i) => x !== value[i]) ? (out as T) : value;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const out = entries.map(([k, v]) => [k, fillDeep(v, fill)] as const);
    return out.some(([, v], i) => v !== entries[i][1]) ? (Object.fromEntries(out) as T) : value;
  }
  return value;
}

/** `{{field}}` is the row's; a token it does not know is left as written, so a typo shows */
export const fillText = (text: string, row: Row) => (text.includes("{{") ? text.replace(TOKEN, (whole, key: string) => (Object.prototype.hasOwnProperty.call(row, key) ? row[key] : whole)) : text);

/** `{{current.field}}` reads the row last tapped; a field it does not have reads as nothing */
export const fillCurrent = <T>(value: T, current: Row | undefined): T =>
  fillDeep(value, (text) => (text.includes("{{current.") ? text.replace(TOKEN, (whole, key: string) => (key.startsWith("current.") ? (current?.[key.slice(8)] ?? "") : whole)) : text));

/** a part as one row draws it; a tap on it will run with these fields */
function fillItem(it: Item, row: Row): Item {
  const fill = (text: string) => fillText(text, row);
  return {
    ...it,
    ...(it.props ? { props: fillDeep(it.props, fill) } : {}),
    ...(it.action ? { action: fillDeep(it.action, fill) } : {}),
    ...(it.actions ? { actions: fillDeep(it.actions, fill) } : {}),
    row: { ...it.row, ...row },
  };
}

/** Measures by item id, with an expanded part not drawn yet taking what the part it copies measured,
 *  so that a new row or instance is laid out at once rather than after it has been drawn. */
export function measuresFor(groups: Group[], widths: Widths): Widths {
  let out = widths;
  for (const g of groups)
    for (const it of g.items) {
      if (widths[it.id] !== undefined || !it.id.includes("/")) continue;
      const parts = it.id.split("/");
      for (let i = 1; i < parts.length; i++) {
        const base = parts.slice(i).join("/");
        if (widths[base] === undefined) continue;
        if (out === widths) out = { ...widths };
        out[it.id] = widths[base];
        if (widths[`${base}:h`] !== undefined) out[`${it.id}:h`] = widths[`${base}:h`];
        break;
      }
    }
  return out;
}

/** one more row: the template and what it holds, under ids of their own, with what they point at among themselves following */
function rowCopy(members: Group[], hostId: string, at: number, row: Row): Group[] {
  const key = `${hostId}#${at}`;
  const groupIds = new Map(members.map((g) => [g.id, `${key}/${g.id}`]));
  const itemIds = new Map(members.flatMap((g) => g.items.map((it) => [it.id, `${key}/${it.id}`] as const)));
  return members.map((g) =>
    retarget(
      {
        ...g,
        id: groupIds.get(g.id)!,
        ...(g.inFlow ? { inFlow: groupIds.get(g.inFlow) ?? g.inFlow } : {}),
        ...(g.pos ? { pos: Object.fromEntries(Object.entries(g.pos).map(([id, p]) => [itemIds.get(id) ?? id, p])) } : {}),
        items: g.items.map((it) => ({ ...fillItem(it, row), id: itemIds.get(it.id)! })),
      },
      itemIds,
    ),
  );
}

type RepeatOptions = { collections?: Collection[]; widths: Widths; /** the canvas keeps a template with no rows to draw, or it could not be selected */ keepEmpty?: boolean };

/** Every repeat drawn out: `repeat` is gone from the result. A repeat on something that is not a layout
 *  any more, or naming a collection that is gone, is a plain container again. */
export function expandRepeats(groups: Group[], o: RepeatOptions): Group[] {
  let out = groups;
  for (;;) {
    const host = out.find((g) => g.repeat);
    if (!host) return out;
    const { repeat, ...bare } = host;
    const c = o.collections?.find((x) => x.id === repeat!.collection);
    const template = c && flowOf(host) && out.length < MAX_GROUPS ? out.find((g) => g.inFlow === host.id) : undefined;
    if (!c || !template) {
      out = out.map((g) => (g === host ? bare : g));
      continue;
    }
    const measures = measuresFor(out, o.widths);
    const members = [template, ...heldBy(template, out, measures).filter((g) => g !== template)];
    const inBlock = new Set(members.map((g) => g.id));
    const rows = rowsOfRepeat(c, repeat!.limit);
    if (!rows.length) {
      out = o.keepEmpty ? out.map((g) => (g === host ? bare : g)) : out.filter((g) => !inBlock.has(g.id)).map((g) => (g === host ? bare : g));
      continue;
    }
    const filled = out.map((g) => (g === host ? bare : inBlock.has(g.id) ? { ...g, items: g.items.map((it) => fillItem(it, rows[0])) } : g));
    let last = -1;
    filled.forEach((g, i) => {
      if (inBlock.has(g.id)) last = i;
    });
    /* placed behind the template: a layout goes by the order of the array */
    filled.splice(last + 1, 0, ...rows.slice(1).flatMap((row, i) => rowCopy(members, host.id, i + 1, row)));
    out = filled;
  }
}

/** a table is edited as text: the column names on the first line, one row per line, cells split by `,` */
export const tableText = (t: { columns: string[]; rows: string[][] }) => [t.columns, ...t.rows].map((r) => r.join(", ")).join("\n");
export const tableOf = (text: string): { columns: string[]; rows: string[][] } => {
  const [head = "", ...rest] = text.split("\n");
  const cells = (line: string) => line.split(",").map((c) => c.trim());
  return { columns: cells(head), rows: rest.filter((l) => l.trim()).map(cells) };
};

/** a collection's table, in the text a table prop is edited in */
export const collectionText = (c: Pick<Collection, "fields" | "rows">) => tableText({ columns: c.fields, rows: c.rows });
export const collectionOf = (text: string): Pick<Collection, "fields" | "rows"> => {
  const { columns, rows } = tableOf(text);
  return { fields: columns, rows };
};

/** what the prompt says of each repeat, in place of drawing its rows */
export const describeRepeats = (groups: Group[], collections: Collection[] | undefined): Group[] =>
  groups.some((g) => g.repeat)
    ? groups.map((g) => {
        const c = g.repeat && flowOf(g) ? collections?.find((x) => x.id === g.repeat!.collection) : undefined;
        return c ? { ...g, rowsOf: { name: c.name, rows: rowsOfRepeat(c, g.repeat!.limit).length, fields: c.fields } } : g;
      })
    : groups;

/** the host of a repeat a part is the template of, through whatever holds it */
export function repeatAround(groups: Group[], g: Group, widths: Widths): Group | undefined {
  for (const host of groups) {
    if (!host.repeat) continue;
    const template = groups.find((x) => x.inFlow === host.id);
    if (template && (template.id === g.id || heldBy(template, groups, widths).some((x) => x.id === g.id))) return host;
  }
  return undefined;
}
