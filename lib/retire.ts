import { initialsOf, nodesOf } from "../parts/defs/splits";
import { listTextOf } from "../parts/labels";
import { RETIRED } from "../parts/defs/retired";
import { partBySlug } from "../parts/registry";
import type { Node } from "../parts/templates/kit";
import type { P, PartDef } from "../parts/types";
import { getLang, type Lang } from "./i18n";
import type { Action, Collection, Group, Item } from "./tokens";

/* What splitting a retired part makes of it (parts/defs/retired.ts). Its tree of atoms is the same look in atoms, its
 * taps on the atoms that show them (lib/kits.ts `splitIntoAtoms`). Where the part is a list and its rows come out alike
 * (the same atoms, the same paint, the same taps, only the words of their cells differing), the rows go further: one
 * row is kept as a template that reads `{{field}}`, inside a box that repeats it over a new data collection holding the
 * part's rows, so the data lives in the document's data, not inside a part. Expanded, the repeat draws exactly the rows
 * the plain split has (each `{{field}}` filled in gives back the words that were there), so it looks the same in the
 * preview and every export; where that is not so (a row drawn apart, words worked out of a cell that no field holds,
 * taps that differ row by row, fewer than two rows), the rows stay as they are. Nothing here runs by itself: the
 * editor offers it, and a person, the in-app AI or an MCP client asks for it (`split_retired`, `split_into_atoms`). */

/** a retired list's rows as data: the fields a `{{field}}` names and each row's cells */
export type RetiredRows = { fields: string[]; rows: string[][] };

/** a field name for a column's words: one word in camel case, or `field<n>` when the words have nothing to name it by */
function identifier(words: string, at: number): string {
  const parts = words.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!parts.length) return `field${at + 1}`;
  const [first, ...more] = parts;
  const name = [first.toLowerCase(), ...more.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())].join("");
  return /^\p{N}/u.test(name) ? `f${name}` : name;
}

/** names made distinct by a number after the second of a name */
function distinct(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((n) => {
    let out = n;
    for (let k = 2; seen.has(out); k++) out = `${n}${k}`;
    seen.add(out);
    return out;
  });
}

/** The fields of a table prop: the English name of a column the part still has as it came (in whatever language it
 *  was seeded), the author's own words otherwise; and what each row works out of its cells after them. */
function tableRows(key: string, worked: { field: string; of: (row: string[]) => string }[] = []) {
  return (p: P, def: PartDef, lang: Lang): RetiredRows | null => {
    const d = def.props.find((x) => x.key === key);
    if (!d || d.kind !== "table") return null;
    const t = p.table(key);
    const fields = distinct([
      ...t.columns.map((c, j) => {
        const seed = d.default.columns[j];
        return identifier(seed !== undefined && (c === seed || c === listTextOf(seed, lang)) ? seed : c, j);
      }),
      ...worked.map((w) => w.field),
    ]);
    return { fields, rows: t.rows.map((r) => [...t.columns.map((_, j) => r[j] ?? ""), ...worked.map((w) => w.of(r))]) };
  };
}

/** a name's initials, as the rows' avatars show them */
const initials = [{ field: "initials", of: (r: string[]) => initialsOf(r[0] ?? "") }];

/** the retired lists whose rows can become data, and how to read them off the part */
const ROWS: Record<string, (p: P, def: PartDef, lang: Lang) => RetiredRows | null> = {
  "cart-list": tableRows("data"),
  "comment-list": tableRows("data", initials),
  "contact-list": tableRows("data", initials),
  "notification-list": tableRows("data"),
  "settings-group": tableRows("data"),
  "todo-list": (p) => ({ fields: ["task", "status"], rows: p.list("items").map((t) => [t.label, t.variant === "done" ? "done" : "todo"]) }),
};

/** the rows a retired part would keep as data, or none when it is no list */
export function retiredRows(def: PartDef, p: P, lang: Lang = getLang()): RetiredRows | null {
  return def.retired ? (ROWS[def.slug]?.(p, def, lang) ?? null) : null;
}

/* ---------- folding alike rows into one that repeats ---------- */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);

/** a value as text with its keys in order, to tell equal values apart from unequal ones */
function keyOf(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(keyOf).join(",")}]`;
  if (isRec(v)) return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${keyOf(v[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "undefined";
}

/** the words in a value, by where they are in it */
function wordsIn(v: unknown, at = "", into = new Map<string, string>()): Map<string, string> {
  if (typeof v === "string") into.set(at, v);
  else if (Array.isArray(v)) v.forEach((x, i) => wordsIn(x, `${at}/${i}`, into));
  else if (isRec(v)) for (const k of Object.keys(v)) wordsIn(v[k], `${at}/${JSON.stringify(k)}`, into);
  return into;
}

/** a value with its words at `at` written as `put` says */
function rewritten(v: unknown, put: (at: string, words: string) => string, at = ""): unknown {
  if (typeof v === "string") return put(at, v);
  if (Array.isArray(v)) return v.map((x, i) => rewritten(x, put, `${at}/${i}`));
  if (isRec(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rewritten(x, put, `${at}/${JSON.stringify(k)}`)]));
  return v;
}

/** a node's own fields beside its props and what it holds: its paint, its name, its taps, how it stands */
const own = (n: Node) => {
  const { props: _props, kids: _kids, ...rest } = n;
  return rest;
};

/** the rows' shape agrees: the same atoms in the same places, the same paint and settings; only words may differ */
function alike(rows: Node[]): boolean {
  const [first, ...more] = rows;
  const shape = (n: Node) => keyOf({ own: own(n), props: rewritten(n.props, () => ""), kids: (n.kids ?? []).length });
  const s = shape(first);
  if (more.some((n) => shape(n) !== s)) return false;
  return (first.kids ?? []).every((_, i) => alike(rows.map((r) => r.kids![i])));
}

export type Folded = {
  /** the tree with the rows folded into one that repeats */
  tree: Node;
  /** the box that repeats the row */
  host: Node;
  /** where each tap of a slot is now, and what each bound prop follows */
  actions: Map<Node, Action>;
  binds: Map<Node, Record<string, string>>;
};

/** The template of `run` (the same row drawn once per row of `data`): each word that is a cell of its row in every row
 *  is that field's `{{field}}`; a word every row says alike stays as it is. None when a word differs from row to row
 *  and no field holds it, when the rows are not alike, when the first field shows nowhere, or when their taps differ. */
function template(run: Node[], data: RetiredRows, taps: Map<Node, Action>, binds: Map<Node, Record<string, string>>): { node: Node; actions: Map<Node, Action> } | null {
  if (!alike(run)) return null;
  const flat = run.map(nodesOf);
  /* a bound prop in a row cannot follow one variable for every row: such rows stay as they are */
  if (flat.some((nodes) => nodes.some((n) => binds.has(n)))) return null;
  const tokens = new Map<string, string>();
  let usesFirst = false;
  for (let k = 0; k < flat[0].length; k++) {
    const words = flat.map((nodes) => wordsIn(nodes[k].props));
    for (const [at, first] of words[0]) {
      const said = words.map((w) => w.get(at) ?? "");
      const field = said.some(Boolean) ? data.fields.findIndex((_, j) => said.every((v, i) => (data.rows[i][j] ?? "") === v)) : -1;
      if (field >= 0) {
        tokens.set(`${k}${at}`, `{{${data.fields[field]}}}`);
        if (field === 0) usesFirst = true;
      } else if (said.some((v) => v !== first)) return null;
    }
  }
  if (!usesFirst) return null;
  /* a tap goes on the template's atom when every row's atom there has the same one */
  const actions = new Map<Node, Action>();
  const at: { k: number } = { k: 0 };
  const build = (n: Node, k: number): Node => {
    const props = rewritten(n.props, (path, words) => tokens.get(`${k}${path}`) ?? words) as Rec;
    return { ...n, props, ...(n.kids ? { kids: n.kids.map((kid) => build(kid, ++at.k)) } : {}) };
  };
  const node = build(run[0], 0);
  const built = nodesOf(node);
  for (let k = 0; k < flat[0].length; k++) {
    const each = flat.map((nodes) => taps.get(nodes[k]));
    if (each.every((a) => !a)) continue;
    if (each.some((a) => !a || keyOf(a) !== keyOf(each[0]))) return null;
    actions.set(built[k], each[0]!);
  }
  return { node, actions };
}

/** Rows of a split folded into one row that repeats over the collection `collection`: the run of boxes, one per row of
 *  `data`, in one box, in order. Null when no such run is there, or when they cannot be one template (see `template`). */
export function foldRows(tree: Node, data: RetiredRows, collection: string, taps: { actions: Map<Node, Action>; binds: Map<Node, Record<string, string>> }): Folded | null {
  const n = data.rows.length;
  /* one row is no list to repeat: what it would repeat cannot be told from a heading */
  if (n < 2) return null;
  for (const holder of nodesOf(tree)) {
    const kids = holder.kids ?? [];
    for (let from = 0; from + n <= kids.length; from++) {
      const whole = from === 0 && n === kids.length;
      const layout = holder.props.layout;
      /* a part of a run is boxed apart in a row or a column; a grid's cells are its own */
      if (!whole && layout !== "column" && layout !== "row") continue;
      const run = kids.slice(from, from + n);
      const made = template(run, data, taps.actions, taps.binds);
      if (!made) continue;
      const repeat = { collection };
      const host: Node = whole
        ? { ...holder, repeat, kids: [made.node] }
        : { slug: "box", props: { surface: "none", layout, gap: holder.props.gap ?? 8, padX: 0, padY: 0, align: holder.props.align ?? "start", justify: "start", hugWidth: true, hugHeight: true }, repeat, kids: [made.node] };
      const inner = whole ? host : { ...holder, kids: [...kids.slice(0, from), host, ...kids.slice(from + n)] };
      /* the tree again down to the holder, everything else as it was, so the taps found on it still name their atoms */
      const moved = new Map<Node, Node>();
      const rebuilt = (x: Node): Node => {
        if (x === holder) return inner;
        if (!x.kids?.some((k) => nodesOf(k).includes(holder))) return x;
        const copy = { ...x, kids: x.kids.map(rebuilt) };
        moved.set(x, copy);
        return copy;
      };
      const out = rebuilt(tree);
      if (!whole) moved.set(holder, inner);
      const gone = new Set(run.flatMap(nodesOf));
      const actions = new Map<Node, Action>(made.actions);
      for (const [x, a] of taps.actions) if (!gone.has(x)) actions.set(moved.get(x) ?? (whole && x === holder ? host : x), a);
      const binds = new Map<Node, Record<string, string>>();
      for (const [x, b] of taps.binds) if (!gone.has(x)) binds.set(moved.get(x) ?? (whole && x === holder ? host : x), b);
      return { tree: out, host, actions, binds };
    }
  }
  return null;
}

/** a name for a new collection: the part's, or the part's with a number when the document has one of that name */
export function collectionName(base: string, taken: Collection[] = []): string {
  const names = new Set(taken.map((c) => c.name));
  let name = base;
  for (let k = 2; names.has(name); k++) name = `${base} ${k}`;
  return name;
}

/* ---------- what is retired in a document ---------- */

/** a retired part on the canvas: its item, and its part */
export type RetiredOnCanvas = { item: Item; def: PartDef };

/** The retired parts a document's screens hold, in the order they are drawn: what the editor's notice counts and
 *  `split_retired` splits when it is given none. Parts inside a component's definition are the definition's: they are
 *  split there, while it is open. */
export function retiredParts(groups: Group[]): RetiredOnCanvas[] {
  const out: RetiredOnCanvas[] = [];
  for (const g of groups) {
    if (g.instanceOf) continue;
    for (const it of g.items) {
      const def = partBySlug(it.component);
      if (def?.retired) out.push({ item: it, def });
    }
  }
  return out;
}

/** the retired parts there are, by id, for what names them all (an operation's summary, the AI's guide) */
export const RETIRED_SLUGS: string[] = Object.keys(RETIRED);

/** what an add operation says when it is asked for a retired part: what to build instead, and how an old one goes */
export const retiredRefusal = (def: PartDef): string =>
  `${def.slug} is retired: ${def.retired?.why ?? "it keeps its data to itself, so a product cannot wire it"}. Build it instead from ${def.retired?.use ?? "atoms and kits"}. A design that already has one keeps it; ${retiredWayOut(def)}.`;

/** what turns an old design's retired part into what replaces it, in words: a split into atoms, or a conversion */
export const retiredWayOut = (def: PartDef): string =>
  def.retired?.convert ? `${def.retired.convert} (or split_retired) turns it into a ${def.retired.with?.[0] ?? "part that replaces it"}` : "split_retired turns it into atoms";
