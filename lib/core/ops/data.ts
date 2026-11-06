/* Operations on data and behaviour: the collections a layout can repeat its first child over, a layout's repeat, the
 * prototype's variables, what a tap does (where it goes, its effects, a condition), props bound to variables, when a
 * part shows, and a dock's tabs. */

import { panesAfterReorder } from "../../flow";
import { actionWithoutScreen, type Action, type Collection, type DocVar, type Transition } from "../../tokens";
import { t } from "../../i18n";
import { op, OpError, S } from "../op";
import { withDoc, withGroups, type CoreState } from "../state";
import { collectionById, groupById, itemById, unlocked } from "./common";
import { actionError, fullAction, varError } from "./validate";
import { setItem } from "./nodes";

/* ---------- collections ---------- */

/** the collections as a whole: what the data panel writes */
export const setCollections = op<{ collections: Collection[] }>({
  name: "set_collections",
  summary: "Replaces every data collection.",
  args: S.obj({ collections: S.arr(S.any()) }, ["collections"]),
  label: () => "Data",
  run: (s, a) => ({ state: withDoc(s, { collections: a.collections.length ? a.collections : undefined }) }),
});

const checkRows = (fields: string[], rows: unknown) => {
  if (!Array.isArray(rows) || !rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string"))) throw new OpError("invalid_value", "rows should be lists of text, one cell per field.", "rows");
  const long = (rows as string[][]).findIndex((r) => r.length > fields.length);
  if (long >= 0) throw new OpError("invalid_value", `row ${long} has more cells than there are fields (${fields.join(", ")}).`, "rows");
};

export const addCollection = op<{ id?: string; name?: string; fields: string[]; rows?: string[][] }, { id: string }>({
  name: "add_collection",
  summary: "Adds a data collection: named fields and rows of text (one cell per field). A layout repeats its first child per row; {{field}} in its words reads the row.",
  args: S.obj({ id: S.str(), name: S.str(), fields: S.arr(S.str(undefined, { minLength: 1 }), undefined, { minItems: 1 }), rows: S.arr(S.arr(S.str())) }, ["fields"]),
  label: () => "Add data",
  run(s, a, ctx) {
    const list = s.doc.collections ?? [];
    const id = a.id ?? ctx.newId();
    if (list.some((c) => c.id === id)) throw new OpError("invalid_value", `The id ${JSON.stringify(id)} is taken already.`, id);
    checkRows(a.fields, a.rows ?? []);
    const c: Collection = { id, name: a.name ?? t("collectionDefaultName", ctx.lang).replace("{n}", String(list.length + 1)), fields: a.fields, rows: a.rows ?? [] };
    return { state: withDoc(s, { collections: [...list, c] }), result: { id } };
  },
});

export const updateCollection = op<{ id: string; name?: string; fields?: string[]; rows?: string[][] }>({
  name: "update_collection",
  summary: "Changes a data collection's name, fields or rows.",
  args: S.obj({ id: S.str(), name: S.str(), fields: S.arr(S.str()), rows: S.arr(S.arr(S.str())) }, ["id"]),
  label: () => "Data",
  run(s, a) {
    const c = collectionById(s, a.id);
    const next = { ...c, ...(a.name !== undefined ? { name: a.name } : {}), ...(a.fields ? { fields: a.fields } : {}), ...(a.rows ? { rows: a.rows } : {}) };
    checkRows(next.fields, next.rows);
    return { state: withDoc(s, { collections: (s.doc.collections ?? []).map((x) => (x.id === a.id ? next : x)) }) };
  },
});

export const removeCollection = op<{ id: string }>({
  name: "remove_collection",
  summary: "Removes a data collection; layouts that repeated it stop repeating.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete data",
  run(s, a) {
    collectionById(s, a.id);
    const rest = (s.doc.collections ?? []).filter((c) => c.id !== a.id);
    const groups = s.doc.groups.map((g) => {
      if (g.repeat?.collection !== a.id) return g;
      const { repeat: _gone, ...keep } = g;
      return keep;
    });
    return { state: withGroups(withDoc(s, { collections: rest.length ? rest : undefined }), groups) };
  },
});

/** a layout repeating its first child over a collection's rows, or no longer */
export const setRepeat = op<{ id: string; repeat: { collection: string; limit?: number } | null }>({
  name: "set_repeat",
  summary: "Makes a container with an auto layout draw its first child once per row of a collection (limit: at most that many rows), or stop (null).",
  args: S.obj({ id: S.str("the container"), repeat: { type: ["object", "null"], properties: { collection: S.str(), limit: S.int(undefined, { minimum: 0 }) }, required: ["collection"] } }, ["id", "repeat"]),
  label: () => "Repeat",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    if (ctx.strict) {
      if (a.repeat) collectionById(s, a.repeat.collection);
      if (!g.items[0]?.props?.layout || g.items[0].props.layout === "free") throw new OpError("invalid_value", "Only a container with an auto layout can repeat its first child.", a.id);
    }
    const groups = s.doc.groups.map((x) => {
      if (x.id !== g.id) return x;
      const { repeat: _was, ...rest } = x;
      return a.repeat ? { ...rest, repeat: a.repeat } : rest;
    });
    return { state: withGroups(s, groups) };
  },
});

/* ---------- variables ---------- */

/** the variables as a whole: what the variables panel writes */
export const setVars = op<{ vars: DocVar[] }>({
  name: "set_vars",
  summary: "Replaces every variable of the prototype.",
  args: S.obj({ vars: S.arr(S.any()) }, ["vars"]),
  label: () => "Variables",
  run(s, a, ctx) {
    if (ctx.strict)
      for (const v of a.vars) {
        const e = varError(v);
        if (e) throw new OpError("invalid_value", e);
      }
    return { state: withDoc(s, { vars: a.vars.length ? a.vars : undefined }), history: "none" };
  },
});

/** the variables with `v` as the one that drives the dark mode, when it does: no other one does any more */
const soleDark = (vars: DocVar[], v: DocVar): DocVar[] => (v.drives === "dark" ? vars.map((x) => (x.id !== v.id && x.drives ? { id: x.id, name: x.name, type: x.type, value: x.value } : x)) : vars);

const DRIVES = { type: ["string", "null"], enum: ["dark", null], description: '"dark": this bool variable is the app\'s dark mode (true is dark), so setting or toggling it switches the theme in the preview and the exported app; null: it no longer is' };

export const addVar = op<{ id?: string; name: string; type: DocVar["type"]; value: DocVar["value"]; drives?: "dark" | null }, { id: string }>({
  name: "add_var",
  summary: 'Adds a variable of the prototype (live in the preview only): type text, number or bool, with the value it starts at. drives: "dark" makes a bool one the light/dark mode: a dark-mode switch binds its checked prop to it and toggles it.',
  args: S.obj({ id: S.str(), name: S.str(undefined, { minLength: 1 }), type: S.enum(["text", "number", "bool"]), value: { type: ["string", "number", "boolean"] }, drives: DRIVES }, ["name", "type", "value"]),
  label: () => "Add variable",
  run(s, a, ctx) {
    const v: DocVar = { id: a.id ?? ctx.newId(), name: a.name, type: a.type, value: a.value, ...(a.drives === "dark" ? { drives: "dark" as const } : {}) };
    const e = varError(v);
    if (e) throw new OpError("invalid_value", e);
    if (v.drives && v.type !== "bool") throw new OpError("invalid_value", "Only a bool variable can drive the dark mode.", "drives");
    const vars = s.doc.vars ?? [];
    if (vars.some((x) => x.id === v.id)) throw new OpError("invalid_value", `The id ${JSON.stringify(v.id)} is taken already.`, v.id);
    if (vars.some((x) => x.name === v.name)) throw new OpError("invalid_value", `There is a variable called ${JSON.stringify(v.name)} already.`, v.name);
    return { state: withDoc(s, { vars: soleDark([...vars, v], v) }), result: { id: v.id } };
  },
});

export const updateVar = op<{ id: string; name?: string; type?: DocVar["type"]; value?: DocVar["value"]; drives?: "dark" | null }>({
  name: "update_var",
  summary: 'Changes a variable\'s name, type, starting value, or whether it drives the dark mode (drives: "dark" or null).',
  args: S.obj({ id: S.str(), name: S.str(), type: S.enum(["text", "number", "bool"]), value: { type: ["string", "number", "boolean"] }, drives: DRIVES }, ["id"]),
  label: () => "Variable",
  run(s, a) {
    const vars = s.doc.vars ?? [];
    const v = vars.find((x) => x.id === a.id);
    if (!v) throw new OpError("not_found", `There is no variable ${JSON.stringify(a.id)}.`, a.id);
    const merged: DocVar = { ...v, ...(a.name !== undefined ? { name: a.name } : {}), ...(a.type ? { type: a.type } : {}), ...(a.value !== undefined ? { value: a.value } : {}), ...(a.drives === "dark" ? { drives: "dark" as const } : {}) };
    const next: DocVar = a.drives === null || merged.type !== "bool" ? { id: merged.id, name: merged.name, type: merged.type, value: merged.value } : merged;
    if (a.drives === "dark" && next.type !== "bool") throw new OpError("invalid_value", "Only a bool variable can drive the dark mode.", "drives");
    const e = varError(next);
    if (e) throw new OpError("invalid_value", e);
    return { state: withDoc(s, { vars: soleDark(vars.map((x) => (x.id === a.id ? next : x)), next) }) };
  },
});

export const removeVar = op<{ id: string }>({
  name: "remove_var",
  summary: "Removes a variable; props bound to it are unbound.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete variable",
  run(s, a) {
    const vars = s.doc.vars ?? [];
    if (!vars.some((x) => x.id === a.id)) throw new OpError("not_found", `There is no variable ${JSON.stringify(a.id)}.`, a.id);
    const rest = vars.filter((x) => x.id !== a.id);
    const groups = s.doc.groups.map((g) =>
      g.items.some((it) => it.bind && Object.values(it.bind).includes(a.id))
        ? {
            ...g,
            items: g.items.map((it) => {
              if (!it.bind) return it;
              const bind = Object.fromEntries(Object.entries(it.bind).filter(([, v]) => v !== a.id));
              return { ...it, bind: Object.keys(bind).length ? bind : undefined };
            }),
          }
        : g,
    );
    return { state: withGroups(withDoc(s, { vars: rest.length ? rest : undefined }), groups) };
  },
});

/* ---------- taps ---------- */

/** What a tap on a part (or on one place in it: a tab, a row, an icon) does: where it goes, its effects, a condition
 *  and what happens otherwise. null removes it. */
export const setAction = op<{ id: string; slot?: string; action: Action | null }>({
  name: "set_action",
  summary:
    'Sets what a tap on a part does (or on one of its places: slot "tab:0", "icon"…): {to: screen id | "back" | "link" | "none", transition, url, effects: [{do: show|hide|toggle|open|close, part} | {do: setVar, var, value} | {do: toggleVar, var} | {do: addVar, var, by} | {do: setProp, part, prop, value} | {do: snackbar, message}], when: {var, op: eq|neq, value} | {filled: part}, else: {...}}. null removes it.',
  args: S.obj({ id: S.str(), slot: S.str(), action: { type: ["object", "null"] } }, ["id", "action"]),
  label: () => "Tap",
  run(s, a, ctx) {
    const { item, group } = itemById(s, a.id);
    unlocked(group, "That part");
    if (a.action && ctx.strict) {
      const e = actionError(a.action, s);
      if (e) throw new OpError("invalid_value", `action: ${e}.`, "action");
    }
    const action = a.action ? fullAction(a.action) : undefined;
    if (!a.slot) return setItem.run(s, { id: a.id, patch: { action } }, { ...ctx, strict: false });
    const actions = { ...item.actions };
    if (action) actions[a.slot] = action;
    else delete actions[a.slot];
    return setItem.run(s, { id: a.id, patch: { actions: Object.keys(actions).length ? actions : undefined } }, { ...ctx, strict: ctx.strict && !!action });
  },
});

/** a prop of a part follows a variable in the preview, or no longer (null) */
export const bindProp = op<{ id: string; prop: string; var: string | null }>({
  name: "bind_prop",
  summary: "Binds a prop of a part to a variable (the preview shows the variable's value), or unbinds it (var null).",
  args: S.obj({ id: S.str(), prop: S.str(), var: { type: ["string", "null"] } }, ["id", "prop", "var"]),
  label: () => "Bind",
  run(s, a, ctx) {
    const { item } = itemById(s, a.id);
    const bind = { ...item.bind };
    if (a.var === null) delete bind[a.prop];
    else bind[a.prop] = a.var;
    return setItem.run(s, { id: a.id, patch: { bind: Object.keys(bind).length ? bind : undefined } }, { ...ctx, strict: ctx.strict && a.var !== null });
  },
});

/** The actions behind link lines, by `itemId|slot`: what changes one of them, and the transition they show with. */
function patchLink(s: CoreState, linkId: string, fn: (a: Action) => Action | undefined): CoreState {
  const [itemId, slot] = linkId.split("|");
  return withGroups(
    s,
    s.doc.groups.map((g) => ({
      ...g,
      items: g.items.map((it) => {
        if (it.id !== itemId) return it;
        if (!slot) return { ...it, action: it.action ? fn(it.action) : undefined };
        const cur = it.actions?.[slot];
        if (!cur) return it;
        const next = fn(cur);
        const actions = { ...it.actions };
        if (next) actions[slot] = next;
        else delete actions[slot];
        return { ...it, actions: Object.keys(actions).length ? actions : undefined };
      }),
    })),
  );
}

export const setLinkTransition = op<{ links: string[]; transition: Transition }>({
  name: "set_link_transition",
  summary: "Sets the transition of the taps behind link lines (`itemId|slot`).",
  args: S.obj({ links: S.arr(S.str()), transition: S.enum(["slide", "slideLeft", "slideUp", "slideDown", "fade", "expand", "none"]) }, ["links", "transition"]),
  label: () => "Transition",
  run: (s, a) => ({ state: a.links.reduce((st, id) => patchLink(st, id, (x) => ({ ...x, transition: a.transition })), s) }),
});

export const removeLinks = op<{ links: string[] }>({
  name: "remove_links",
  summary: "Takes the screen out of the taps behind link lines; what else they do stays.",
  args: S.obj({ links: S.arr(S.str()) }, ["links"]),
  label: () => "Remove link",
  run: (s, a) => ({ state: a.links.reduce((st, id) => patchLink(st, id, (x) => actionWithoutScreen(x, x.to)), s) }),
});

/** a dock's tabs in a new order, what each holds following its tab */
export const reorderPanes = op<{ id: string; order: number[] }>({
  name: "reorder_panes",
  summary: "Puts a dock's tabs in a new order; what each tab holds follows it.",
  args: S.obj({ id: S.str(), order: S.arr(S.int()) }, ["id", "order"]),
  label: () => "Reorder tabs",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    return { state: withGroups(s, panesAfterReorder(s.doc.groups, g.id, a.order, ctx.widths)), history: "none" };
  },
});
