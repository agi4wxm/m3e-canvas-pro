/* Operations on data and behaviour: the collections a layout can repeat its first child over, a layout's repeat, the
 * prototype's variables, what a tap does (where it goes, its effects, a condition), props bound to variables, when a
 * part shows, and a dock's tabs. */

import { panesAfterReorder } from "../../flow";
import { actionWithoutScreen, type Action, type Collection, type DocVar, type Frame, type Transition, type VarCollection, type VarValue } from "../../tokens";
import { BIND_FIELDS, collectionsOf, DEFAULT_COLLECTION, fitsType, isBindField, startValueOf } from "../../variables";
import { partBySlug } from "../../../parts/registry";
import { t } from "../../i18n";
import { op, OpError, S } from "../op";
import { withDoc, withFrames, withGroups, type CoreState } from "../state";
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

const VALUE = { type: ["string", "number", "boolean"] };
const TYPES = ["text", "number", "bool", "color"] as const;
const VALUES = { type: "object", additionalProperties: VALUE, description: "the value in each mode of its collection, by mode id or name; the first mode's is `value`" };

/** the collection a variable is to go in: the one named, which must be there, or the default one */
function collectionFor(s: CoreState, id: string | undefined): VarCollection {
  const all = collectionsOf(s.doc);
  const c = all.find((x) => x.id === (id ?? DEFAULT_COLLECTION)) ?? (id === undefined ? all[0] : undefined);
  if (!c) throw new OpError("not_found", `There is no variable collection ${JSON.stringify(id)}. The collections are: ${all.map((x) => x.id).join(", ")}.`, id);
  return c;
}

/** A variable's values in modes, by mode id or name, written as the variable keeps them: the first mode's as `value`,
 *  the others in `modes`. A mode the collection does not have is refused. */
function withModeValues(v: DocVar, c: VarCollection, values: Record<string, VarValue> | undefined): DocVar {
  if (!values) return v;
  let value = v.value;
  const modes = { ...v.modes };
  for (const [key, x] of Object.entries(values)) {
    const m = c.modes.find((mode) => mode.id === key) ?? c.modes.find((mode) => mode.name === key);
    if (!m) throw new OpError("invalid_value", `The collection has no mode ${JSON.stringify(key)}. Its modes are: ${c.modes.map((mode) => `${mode.id} (${mode.name || "unnamed"})`).join(", ")}.`, key);
    if (m.id === c.modes[0].id) value = x;
    else modes[m.id] = x;
  }
  return { ...v, value, ...(Object.keys(modes).length ? { modes } : {}) };
}

export const addVar = op<{ id?: string; name: string; type: DocVar["type"]; value: DocVar["value"]; drives?: "dark" | null; collection?: string; values?: Record<string, VarValue> }, { id: string }>({
  name: "add_var",
  summary:
    'Adds a variable: type text, number, bool or color (a role such as primary or a hex), with its value in the first mode of its collection (values: what it is in the other modes, by mode id or name). Props bind to it (bind_prop) and taps set it; a color or number one binds to a design field such as "@fill". drives: "dark" makes a bool one the light/dark mode: a dark-mode switch binds its checked prop to it and toggles it.',
  args: S.obj(
    { id: S.str(), name: S.str(undefined, { minLength: 1 }), type: S.enum(TYPES), value: VALUE, drives: DRIVES, collection: S.str("the collection it goes in (add_var_collection); the default one when left out"), values: VALUES },
    ["name", "type", "value"],
  ),
  label: () => "Add variable",
  run(s, a, ctx) {
    const c = collectionFor(s, a.collection);
    const base: DocVar = { id: a.id ?? ctx.newId(), name: a.name, type: a.type, value: a.value, ...(a.drives === "dark" ? { drives: "dark" as const } : {}), ...(c.id !== DEFAULT_COLLECTION ? { collection: c.id } : {}) };
    const v = withModeValues(base, c, a.values);
    const e = varError(v);
    if (e) throw new OpError("invalid_value", e);
    if (v.drives && v.type !== "bool") throw new OpError("invalid_value", "Only a bool variable can drive the dark mode.", "drives");
    const vars = s.doc.vars ?? [];
    if (vars.some((x) => x.id === v.id)) throw new OpError("invalid_value", `The id ${JSON.stringify(v.id)} is taken already.`, v.id);
    if (vars.some((x) => x.name === v.name && (x.collection ?? DEFAULT_COLLECTION) === c.id)) throw new OpError("invalid_value", `There is a variable called ${JSON.stringify(v.name)} in that collection already.`, v.name);
    return { state: withDoc(s, { vars: soleDark([...vars, v], v) }), result: { id: v.id }, history: "whole" };
  },
});

export const updateVar = op<{ id: string; name?: string; type?: DocVar["type"]; value?: DocVar["value"]; drives?: "dark" | null; collection?: string; values?: Record<string, VarValue> }>({
  name: "update_var",
  summary:
    'Changes a variable\'s name, type, value (in the first mode of its collection), its values in the other modes (values, by mode id or name), its collection, or whether it drives the dark mode (drives: "dark" or null). A new type starts every mode at the type\'s own start value unless values are given.',
  args: S.obj({ id: S.str(), name: S.str(), type: S.enum(TYPES), value: VALUE, drives: DRIVES, collection: S.str(), values: VALUES }, ["id"]),
  label: () => "Variable",
  run(s, a) {
    const vars = s.doc.vars ?? [];
    const v = vars.find((x) => x.id === a.id);
    if (!v) throw new OpError("not_found", `There is no variable ${JSON.stringify(a.id)}.`, a.id);
    const c = collectionFor(s, a.collection ?? v.collection);
    /* another type, or another collection, has no use for the values in the old modes */
    const fresh = (a.type && a.type !== v.type) || (a.collection !== undefined && a.collection !== (v.collection ?? DEFAULT_COLLECTION));
    const { modes: _modes, collection: _coll, drives: _drives, ...own } = v;
    const merged: DocVar = {
      ...own,
      ...(fresh ? {} : v.modes ? { modes: v.modes } : {}),
      ...(c.id !== DEFAULT_COLLECTION ? { collection: c.id } : {}),
      ...(a.name !== undefined ? { name: a.name } : {}),
      ...(a.type ? { type: a.type } : {}),
      ...(a.type && a.type !== v.type && a.value === undefined ? { value: fitsType(v.value, a.type) ? v.value : startValueOf(a.type) } : {}),
      ...(a.value !== undefined ? { value: a.value } : {}),
      ...((a.drives === "dark" || (a.drives === undefined && v.drives)) && (a.type ?? v.type) === "bool" ? { drives: "dark" as const } : {}),
    };
    if (a.drives === "dark" && merged.type !== "bool") throw new OpError("invalid_value", "Only a bool variable can drive the dark mode.", "drives");
    const next = withModeValues(merged, c, a.values);
    const e = varError(next);
    if (e) throw new OpError("invalid_value", e);
    return { state: withDoc(s, { vars: soleDark(vars.map((x) => (x.id === a.id ? next : x)), next) }), history: "whole" };
  },
});

/** The document without some variables: what was bound to them is unbound, and a screen or the document showing a mode
 *  of a collection that went with them keeps nothing of it. */
function withoutVars(s: CoreState, ids: Set<string>): CoreState {
  const rest = (s.doc.vars ?? []).filter((x) => !ids.has(x.id));
  const groups = s.doc.groups.map((g) =>
    g.items.some((it) => it.bind && Object.values(it.bind).some((v) => ids.has(v)))
      ? {
          ...g,
          items: g.items.map((it) => {
            if (!it.bind) return it;
            const bind = Object.fromEntries(Object.entries(it.bind).filter(([, v]) => !ids.has(v)));
            return { ...it, bind: Object.keys(bind).length ? bind : undefined };
          }),
        }
      : g,
  );
  return withGroups(withDoc(s, { vars: rest.length ? rest : undefined }), groups);
}

export const removeVar = op<{ id: string }>({
  name: "remove_var",
  summary: "Removes a variable; props bound to it are unbound.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete variable",
  run(s, a) {
    const vars = s.doc.vars ?? [];
    if (!vars.some((x) => x.id === a.id)) throw new OpError("not_found", `There is no variable ${JSON.stringify(a.id)}.`, a.id);
    return { state: withoutVars(s, new Set([a.id])), history: "whole" };
  },
});

/* ---------- taps ---------- */

/** What a tap on a part (or on one place in it: a tab, a row, an icon) does: where it goes, its effects, a condition
 *  and what happens otherwise. null removes it. */
export const setAction = op<{ id: string; slot?: string; action: Action | null }>({
  name: "set_action",
  summary:
    'Sets what a tap on a part does (or on one of its places: slot "tab:0", "icon"…): {to: screen id | "back" | "link" | "none", transition, url, effects: [{do: show|hide|toggle|open|close, part} | {do: setVar, var, value} | {do: toggleVar, var} | {do: addVar, var, by} | {do: setProp, part, prop, value} | {do: snackbar, message}], when: {var, op: eq|neq, value} | {filled: part}, else: {...}, trigger: {on: "hover"} | {on: "delay", ms} (starts it without a tap), overlay: true (the screen opens over the one on show; back closes it), scrollTo: part id (with to "none"), motion: {kind: instant|dissolve|move|push|slide, dir: left|right|up|down (the way the new screen moves), easing: out|in|inOut|linear|spring, ms}}. null removes it.',
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
  summary:
    'Binds a prop of a part to a variable (the preview shows the variable\'s value), or a field of its design: "@fill", "@text" (the words\' color) and "@stroke" take a color variable, "@opacity" (0-100), "@radius" and "@rotation" a number one; these show the value of the mode on show on the canvas too. var null unbinds it.',
  args: S.obj({ id: S.str(), prop: S.str('a prop key, or one of "@fill", "@text", "@stroke", "@opacity", "@radius", "@rotation"'), var: { type: ["string", "null"] } }, ["id", "prop", "var"]),
  label: () => "Bind",
  run(s, a, ctx) {
    const { item } = itemById(s, a.id);
    if (ctx.strict && a.var !== null) {
      const v = (s.doc.vars ?? []).find((x) => x.id === a.var);
      if (!v) throw new OpError("not_found", `There is no variable ${JSON.stringify(a.var)}.`, a.var);
      if (isBindField(a.prop)) {
        const kind = BIND_FIELDS[a.prop];
        if (v.type !== kind) throw new OpError("invalid_value", `${a.prop} takes a ${kind} variable; ${v.name} is a ${v.type} one.`, a.var);
      } else if (a.prop.startsWith("@")) throw new OpError("invalid_value", `${a.prop} is no field of a design. The fields are: ${Object.keys(BIND_FIELDS).join(", ")}.`, a.prop);
      else if (!partBySlug(item.component)?.props.some((d) => d.key === a.prop)) throw new OpError("invalid_value", `${item.component} has no prop ${JSON.stringify(a.prop)}.`, a.prop);
    }
    const bind = { ...item.bind };
    if (a.var === null) delete bind[a.prop];
    else bind[a.prop] = a.var;
    /* a field of the design is checked here, not by the part's props */
    return setItem.run(s, { id: a.id, patch: { bind: Object.keys(bind).length ? bind : undefined } }, { ...ctx, strict: ctx.strict && a.var !== null && !isBindField(a.prop) });
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

/* ---------- collections and modes ---------- */

/** every collection there is, the default one among them */
const listedCollections = (s: CoreState): VarCollection[] => collectionsOf(s.doc);

export const addVarCollection = op<{ id?: string; name: string; modes?: string[] }, { id: string; modes: string[] }>({
  name: "add_var_collection",
  summary: "Adds a collection of variables with the modes its variables have values in (names such as Light and Dark; one mode when left out). Returns the new mode ids, first mode first.",
  args: S.obj({ id: S.str(), name: S.str(undefined, { minLength: 1 }), modes: S.arr(S.str(undefined, { minLength: 1 }), "the modes' names, in order") }, ["name"]),
  label: () => "Add collection",
  run(s, a, ctx) {
    const all = listedCollections(s);
    const id = a.id ?? ctx.newId();
    if (all.some((c) => c.id === id)) throw new OpError("invalid_value", `The id ${JSON.stringify(id)} is taken already.`, id);
    const names = a.modes?.length ? a.modes : [t("vrModeNth", ctx.lang).replace("{n}", "1")];
    const c: VarCollection = { id, name: a.name, modes: names.map((name) => ({ id: ctx.newId(), name })) };
    return { state: withDoc(s, { varCollections: [...(s.doc.varCollections ?? []), c] }), result: { id, modes: c.modes.map((m) => m.id) }, history: "whole" };
  },
});

export const updateVarCollection = op<{ id: string; name?: string; modes?: { id?: string; name: string }[]; dark?: string | null }, { modes: string[] }>({
  name: "update_var_collection",
  summary:
    "Renames a collection of variables, gives it its modes (each {id, name}; one without an id is new, one left out is removed with its values, and the first is the one whose values are each variable's `value`), or names the mode it shows while the app is dark (dark: a mode id, or null). Returns the mode ids.",
  args: S.obj(
    { id: S.str(), name: S.str(), modes: S.arr(S.obj({ id: S.str(), name: S.str(undefined, { minLength: 1 }) }, ["name"]), undefined, { minItems: 1 }), dark: { type: ["string", "null"], description: "the mode shown in dark mode" } },
    ["id"],
  ),
  label: () => "Collection",
  run(s, a, ctx) {
    const was = collectionsOf(s.doc).find((c) => c.id === a.id);
    if (!was) throw new OpError("not_found", `There is no variable collection ${JSON.stringify(a.id)}.`, a.id);
    const modes = a.modes ? a.modes.map((m) => ({ id: m.id && was.modes.some((x) => x.id === m.id) ? m.id : ctx.newId(), name: m.name })) : was.modes;
    if (a.dark && !modes.some((m) => m.id === a.dark)) throw new OpError("invalid_value", `The collection has no mode ${JSON.stringify(a.dark)}.`, a.dark);
    const keepDark = a.dark === undefined && was.dark && modes.some((m) => m.id === was.dark) ? was.dark : undefined;
    const dark = a.dark ?? keepDark;
    const next: VarCollection = { id: was.id, name: a.name ?? was.name, modes, ...(dark ? { dark } : {}) };
    /* each variable's values follow their modes: the first mode's is `value`, whichever mode is first now */
    const kept = new Set(modes.map((m) => m.id));
    const vars = (s.doc.vars ?? []).map((v) => {
      if ((v.collection && collectionsOf(s.doc).some((c) => c.id === v.collection) ? v.collection : DEFAULT_COLLECTION) !== was.id) return v;
      const byMode: Record<string, VarValue> = { ...v.modes, [was.modes[0].id]: v.value };
      const value = byMode[modes[0].id] ?? v.value;
      const rest = Object.fromEntries(Object.entries(byMode).filter(([m]) => kept.has(m) && m !== modes[0].id));
      const { modes: _old, ...own } = v;
      return { ...own, value, ...(Object.keys(rest).length ? { modes: rest } : {}) };
    });
    const listed = s.doc.varCollections ?? [];
    const varCollections = listed.some((c) => c.id === was.id) ? listed.map((c) => (c.id === was.id ? next : c)) : [next, ...listed];
    /* a mode chosen that is gone is a choice no longer */
    const pick = (map: Record<string, string> | undefined) => {
      if (!map?.[was.id] || kept.has(map[was.id])) return map;
      const { [was.id]: _gone, ...rest } = map;
      return Object.keys(rest).length ? rest : undefined;
    };
    const frames = s.doc.frames.map((f): Frame => {
      const varModes = pick(f.varModes);
      if (varModes === f.varModes) return f;
      const { varModes: _was, ...rest } = f;
      return varModes ? { ...rest, varModes } : rest;
    });
    const state = withFrames(withDoc(s, { varCollections, vars: vars.length ? vars : undefined, varModes: pick(s.doc.varModes) }), frames);
    return { state, result: { modes: modes.map((m) => m.id) }, history: "whole" };
  },
});

export const removeVarCollection = op<{ id: string }>({
  name: "remove_var_collection",
  summary: "Removes a collection of variables and every variable in it; what was bound to them is unbound.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete collection",
  run(s, a) {
    const all = collectionsOf(s.doc);
    if (!all.some((c) => c.id === a.id)) throw new OpError("not_found", `There is no variable collection ${JSON.stringify(a.id)}.`, a.id);
    const ids = new Set((s.doc.vars ?? []).filter((v) => (v.collection && all.some((c) => c.id === v.collection) ? v.collection : DEFAULT_COLLECTION) === a.id).map((v) => v.id));
    const rest = (s.doc.varCollections ?? []).filter((c) => c.id !== a.id);
    const { [a.id]: _gone, ...modes } = s.doc.varModes ?? {};
    const frames = s.doc.frames.map((f): Frame => {
      if (!f.varModes?.[a.id]) return f;
      const { [a.id]: _was, ...left } = f.varModes;
      const { varModes: _old, ...own } = f;
      return Object.keys(left).length ? { ...own, varModes: left } : own;
    });
    const state = withFrames(withDoc(withoutVars(s, ids), { varCollections: rest.length ? rest : undefined, varModes: Object.keys(modes).length ? modes : undefined }), frames);
    return { state, history: "whole" };
  },
});

export const setVarMode = op<{ collection: string; mode: string | null; screen?: string }>({
  name: "set_var_mode",
  summary:
    "Chooses the mode of a variable collection the document shows (or one screen shows, over the document's choice), by mode id or name; null goes back to the default (a screen follows the document; the document follows the dark mode where the collection says so, else its first mode).",
  args: S.obj({ collection: S.str(), mode: { type: ["string", "null"] }, screen: S.str("a screen, to choose for it alone") }, ["collection", "mode"]),
  label: () => "Variable mode",
  run(s, a) {
    const c = collectionsOf(s.doc).find((x) => x.id === a.collection);
    if (!c) throw new OpError("not_found", `There is no variable collection ${JSON.stringify(a.collection)}.`, a.collection);
    const m = a.mode === null ? null : (c.modes.find((x) => x.id === a.mode) ?? c.modes.find((x) => x.name === a.mode));
    if (m === undefined) throw new OpError("invalid_value", `The collection has no mode ${JSON.stringify(a.mode)}. Its modes are: ${c.modes.map((x) => `${x.id} (${x.name || "unnamed"})`).join(", ")}.`, String(a.mode));
    const put = (map: Record<string, string> | undefined) => {
      const { [c.id]: _was, ...rest } = map ?? {};
      const next = m ? { ...rest, [c.id]: m.id } : rest;
      return Object.keys(next).length ? next : undefined;
    };
    if (a.screen) {
      const f = s.doc.frames.find((x) => x.id === a.screen);
      if (!f) throw new OpError("not_found", `There is no screen ${JSON.stringify(a.screen)}.`, a.screen);
      const varModes = put(f.varModes);
      const { varModes: _old, ...own } = f;
      return { state: withFrames(s, s.doc.frames.map((x) => (x.id === f.id ? (varModes ? { ...own, varModes } : own) : x))) };
    }
    return { state: withDoc(s, { varModes: put(s.doc.varModes) }), history: "whole" };
  },
});

