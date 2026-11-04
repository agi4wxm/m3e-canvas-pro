import { partBySlug, reader } from "../parts/registry";
import { arrangeFlows, outOfPane } from "./flow";
import { type Row, fillCurrent, firstRows, rowVars } from "./collections";
import type { Action, ActionBody, Collection, Condition, Doc, DocVar, Effect, Group, Item, VarValue } from "./tokens";
import { heldBy } from "./tokens";

export { retarget } from "./tokens";

/* What a tap does beyond going somewhere, as plain functions over a state object: the preview holds
 * the state and calls these, and nothing here touches the document or the page. A reference to a part
 * or a variable that is gone does nothing, so a prototype with a stale link still runs. */

type Scope = Pick<Doc, "groups" | "vars">;
type Widths = Record<string, number>;

export type PreviewState = {
  /** each variable's value now, by id */
  vars: Record<string, VarValue>;
  /** visibility changed since the start, by group id; a group not here is as `Group.hidden` says */
  hidden: Record<string, boolean>;
  /** props changed by an effect, by item id */
  props: Record<string, Record<string, VarValue>>;
  /** overlays held open by an effect, by item id */
  opened: Record<string, boolean>;
  /** what the visitor entered into each input, by item id: it outlives the screen it was typed on */
  fields: Record<string, VarValue>;
  snack: { id: number; message: string } | null;
  /** The row the last tap on a repeated part came from: what `{{current.field}}` reads. Until a row
   *  has been tapped, the first row of the data, so a detail screen opened directly is not blank. */
  current?: Row;
};

/** the prop of an input the visitor changes by using it */
export const INPUT_PROP: Record<string, string> = {
  input: "value",
  "text-field": "value",
  textarea: "value",
  switch: "checked",
  checkbox: "checked",
  slider: "value",
  select: "selected",
  "radio-group": "selected",
};

/** an overlay with no trigger of its own stands on the screen only while it is open; one with a
 *  trigger (a menu) stays on the screen and its popup opens from it */
const standsOnlyWhileOpen = (it: Item) => {
  const open = partBySlug(it.component)?.open;
  return !open || open.trigger === "hide";
};

/** a part an open or close effect can act on: what floats over a screen when opened */
export function isOverlayPart(it: Item): boolean {
  const def = partBySlug(it.component);
  if (!def) return false;
  return def.category === "Overlays" || /menu|drawer/.test(def.slug);
}

export const startState = (vars: DocVar[] | undefined, collections?: Collection[]): PreviewState => ({
  vars: Object.fromEntries((Array.isArray(vars) ? vars : []).map((v) => [v.id, v.value])),
  hidden: {},
  props: {},
  opened: {},
  fields: {},
  snack: null,
  ...(collections?.length ? { current: firstRows(collections) } : {}),
});

/** The state a tap from a repeated part runs in: its row is the current one, and its fields can be
 *  read as `row.field` for the length of the tap. Nothing can write them, since no document variable
 *  has that id, and `leftRow` takes them away again. */
export const inRow = (s: PreviewState, row: Row | undefined): PreviewState => (row ? { ...s, current: row, vars: { ...s.vars, ...rowVars(row) } } : s);
export const leftRow = (s: PreviewState, row: Row | undefined): PreviewState => {
  if (!row) return s;
  const gone = rowVars(row);
  return { ...s, vars: Object.fromEntries(Object.entries(s.vars).filter(([id]) => !(id in gone))) };
};

const asNumber = (v: VarValue): number | null => {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const asBool = (v: VarValue) => (typeof v === "string" ? v !== "" && v !== "false" && v !== "0" : !!v);

/** a value put into a variable keeps to the variable's type; null when it cannot */
export function coerce(v: VarValue, type: DocVar["type"]): VarValue | null {
  if (type === "text") return String(v);
  if (type === "bool") return asBool(v);
  return asNumber(v);
}

const itemOf = (groups: Group[], id: string): Item | undefined => {
  for (const g of groups) for (const it of g.items) if (it.id === id) return it;
  return undefined;
};

const groupOf = (groups: Group[], id: string) => groups.find((g) => g.items.some((it) => it.id === id));

export const isHidden = (s: PreviewState, g: Group) => s.hidden[g.id] ?? !!g.hidden;

/** what a bound prop reads as, in the kind of value the prop takes; undefined when it cannot be that */
function boundValue(it: Item, key: string, v: VarValue): VarValue | undefined {
  const def = partBySlug(it.component);
  const d = def?.props.find((x) => x.key === key);
  if (!def || !d) return undefined;
  if (d.kind === "bool") return asBool(v);
  if (d.kind === "number") {
    /* a choice bound to a text variable holds the words of the row chosen */
    if (typeof v === "string" && INPUT_PROP[def.slug] === key && key === "selected") {
      const at = reader(def, it.props).list("items").findIndex((row) => row.label === v);
      if (at >= 0) return at;
    }
    return asNumber(v) ?? undefined;
  }
  return String(v);
}

/** the part as it is right now: what effects changed, what the visitor entered, what variables say,
 *  and what the row last tapped fills in */
export function liveItem(source: Item, s: PreviewState): Item {
  const props = fillCurrent(source.props, s.current);
  const it = props === source.props ? source : { ...source, props };
  const key = INPUT_PROP[it.component ?? ""];
  const changed = s.props[it.id];
  const field = key !== undefined ? s.fields[it.id] : undefined;
  const bound = Object.entries(it.bind ?? {}).flatMap(([prop, id]) => {
    const v = s.vars[id];
    const value = v === undefined ? undefined : boundValue(it, prop, v);
    return value === undefined ? [] : [[prop, value] as const];
  });
  if (!changed && field === undefined && !bound.length) return it;
  return { ...it, props: { ...it.props, ...changed, ...(field !== undefined ? { [key]: field } : {}), ...Object.fromEntries(bound) } };
}

/** whether an input holds something: words, a tick, a choice */
const holdsValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : typeof v === "boolean" ? v : typeof v === "number" ? v >= 0 : false);

export function conditionHolds(c: Condition | undefined, s: PreviewState, doc: Scope): boolean {
  if (!c) return true;
  if ("filled" in c) {
    const it = itemOf(doc.groups, c.filled);
    const def = it && partBySlug(it.component);
    const key = def && INPUT_PROP[def.slug];
    if (!it || !def || !key) return false;
    const live = reader(def, liveItem(it, s).props);
    const d = def.props.find((x) => x.key === key);
    return holdsValue(d?.kind === "bool" ? live.b(key) : d?.kind === "number" ? live.n(key) : live.s(key));
  }
  const v = s.vars[c.var];
  if (v === undefined) return false;
  /* the panel writes what it was typed as: "3" and 3 are the same answer */
  const same = String(v) === String(c.value);
  return c.op === "neq" ? !same : same;
}

/** the part of an action this state runs: itself, its `else`, or nothing when it has no `else` */
export function chooseBranch(a: Action, s: PreviewState, doc: Scope): ActionBody | null {
  if (conditionHolds(a.when, s, doc)) return a;
  return a.else ?? null;
}

function applyEffect(s: PreviewState, e: Effect, doc: Scope): PreviewState {
  switch (e.do) {
    case "show":
    case "hide":
    case "toggle": {
      const g = groupOf(doc.groups, e.part);
      if (!g) return s;
      const hide = e.do === "toggle" ? !isHidden(s, g) : e.do === "hide";
      return { ...s, hidden: { ...s.hidden, [g.id]: hide } };
    }
    case "open": {
      const g = groupOf(doc.groups, e.part);
      if (!g) return s;
      return { ...s, hidden: { ...s.hidden, [g.id]: false }, opened: { ...s.opened, [e.part]: true } };
    }
    case "close": {
      const g = groupOf(doc.groups, e.part);
      const it = itemOf(doc.groups, e.part);
      if (!g || !it) return s;
      const { [e.part]: _was, ...opened } = s.opened;
      return { ...s, opened, hidden: standsOnlyWhileOpen(it) ? { ...s.hidden, [g.id]: true } : s.hidden };
    }
    case "setVar": {
      const type = doc.vars?.find((v) => v.id === e.var)?.type;
      const value = type && coerce(e.value, type);
      return value === undefined || value === null ? s : { ...s, vars: { ...s.vars, [e.var]: value } };
    }
    case "toggleVar": {
      const v = doc.vars?.find((x) => x.id === e.var);
      if (!v) return s;
      return { ...s, vars: { ...s.vars, [e.var]: v.type === "bool" ? !asBool(s.vars[e.var] ?? v.value) : s.vars[e.var] ?? v.value } };
    }
    case "addVar": {
      const v = doc.vars?.find((x) => x.id === e.var);
      if (!v || !Number.isFinite(e.by)) return s;
      const now = asNumber(s.vars[e.var] ?? v.value) ?? 0;
      /* tenths added together should not read 0.30000000000000004 */
      const next = Math.round((now + e.by) * 1e6) / 1e6;
      return { ...s, vars: { ...s.vars, [e.var]: coerce(next, v.type) ?? next } };
    }
    case "setProp":
      if (!itemOf(doc.groups, e.part)) return s;
      return { ...s, props: { ...s.props, [e.part]: { ...s.props[e.part], [e.prop]: e.value } } };
    case "snackbar":
      return { ...s, snack: { id: (s.snack?.id ?? 0) + 1, message: e.message } };
    default:
      /* a kind this version does not know, from a file saved by a later one */
      return s;
  }
}

export function applyEffects(s: PreviewState, effects: Effect[] | undefined, doc: Scope): PreviewState {
  return Array.isArray(effects) ? effects.reduce((at, e) => applyEffect(at, e, doc), s) : s;
}

/** closes everything held open: a tap on the scrim */
export const closeOpened = (s: PreviewState, doc: Scope) => applyEffects(s, Object.keys(s.opened).map((part) => ({ do: "close" as const, part })), doc);

/** the visitor changed an input: it remembers, and the variable its value is bound to follows */
export function writeField(s: PreviewState, it: Item, value: VarValue, doc: Scope): PreviewState {
  const key = INPUT_PROP[it.component ?? ""];
  if (key === undefined) return s;
  const id = it.bind?.[key];
  const type = id ? doc.vars?.find((v) => v.id === id)?.type : undefined;
  const def = partBySlug(it.component);
  /* a choice written to a text variable is the row's words, not its place in the list */
  const words = type === "text" && key === "selected" && def && typeof value === "number" ? (reader(def, it.props).list("items")[value]?.label ?? "") : undefined;
  const next = type ? coerce(words ?? value, type) : null;
  const sameVar = !id || !type || next === null || s.vars[id] === next;
  if (s.fields[it.id] === value && sameVar) return s;
  return { ...s, fields: { ...s.fields, [it.id]: value }, vars: sameVar ? s.vars : { ...s.vars, [id!]: next! } };
}

/** what the state leaves off the screen: hidden, or its condition not met, or on another tab, with what those hold */
export function goneIds(groups: Group[], s: PreviewState, doc: Scope, widths: Widths): Set<string> {
  const gone = outOfPane(groups, widths);
  for (const g of groups) {
    if (!isHidden(s, g) && conditionHolds(g.showWhen, s, doc)) continue;
    gone.add(g.id);
    for (const held of heldBy(g, groups, widths)) gone.add(held.id);
  }
  return gone;
}

/** One screen's parts as the state has them, laid out again: what is hidden leaves no hole. */
export function liveGroups(groups: Group[], s: PreviewState, doc: Scope, widths: Widths): Group[] {
  const live = groups.map((g) => {
    const items = g.items.map((it) => liveItem(it, s));
    return items.every((it, i) => it === g.items[i]) ? g : { ...g, items };
  });
  const gone = goneIds(live, s, doc, widths);
  return arrangeFlows(gone.size ? live.filter((g) => !gone.has(g.id)) : live, widths);
}

