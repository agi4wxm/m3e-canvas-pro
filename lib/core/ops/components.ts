/* Operations on reusable components: making one of parts on the canvas (an instance takes their place), renaming,
 * removing (its instances become the parts they showed), detaching an instance, and an instance's overrides. Adding an
 * instance is `add_instance` (ops/nodes.ts); editing a definition is the store's (`openDefinition`). */

import { canNest, definitionFrom, detachInstance, makeComponent, overridableParts, propertyTargets, removeComponent, swappedInstance, variantCopy, variantsOf } from "../../instances";
import type { ComponentDef, ComponentProp, ComponentSet, Group, VarValue } from "../../tokens";
import { t } from "../../i18n";
import { op, OpError, S } from "../op";
import { withSession, type CoreState } from "../state";
import { componentById, groupById } from "./common";
import { pictureError } from "../images";

export const makeComponentOp = op<{ ids: string[]; name?: string; id?: string }, { id: string; instanceId: string; itemId: string }>({
  name: "make_component",
  summary: "Turns parts (with what they hold) into a reusable component; an instance of it takes their place.",
  args: S.obj({ ids: S.arr(S.str(), undefined, { minItems: 1 }), name: S.str(), id: S.str("an id for the component (optional)") }, ["ids"]),
  label: () => "Make component",
  run(s, a, ctx) {
    const ids = new Set(a.ids);
    const chosen = new Set(s.doc.groups.filter((g) => g.items.some((it) => ids.has(it.id)) || ids.has(g.id)).map((g) => g.id));
    if (!chosen.size) throw new OpError("not_found", "None of those parts is on the canvas.");
    if (a.id && s.doc.components?.some((c) => c.id === a.id)) throw new OpError("invalid_value", `The id ${JSON.stringify(a.id)} is taken already.`, a.id);
    const name = a.name ?? t("componentDefaultName", ctx.lang).replace("{n}", String((s.doc.components?.length ?? 0) + 1));
    const made = makeComponent(s.doc.groups, chosen, name, ctx.widths, a.id ?? ctx.newId());
    if (!made) throw new OpError("locked", "Some of those parts are locked.");
    const state: CoreState = { ...s, doc: { ...s.doc, groups: made.groups, components: [...(s.doc.components ?? []), made.def] } };
    return { state: withSession(state, { selection: [made.instance.items[0].id] }), result: { id: made.def.id, instanceId: made.instance.id, itemId: made.instance.items[0].id } };
  },
});

export const renameComponent = op<{ id: string; name: string }>({
  name: "rename_component",
  summary: "Renames a component; its instances are called by it.",
  args: S.obj({ id: S.str(), name: S.str() }, ["id", "name"]),
  label: () => "Rename component",
  run(s, a) {
    componentById(s, a.id);
    const components = s.doc.components?.map((c) => (c.id === a.id ? { ...c, name: a.name } : c));
    const groups = s.doc.groups.map((g) => (g.instanceOf === a.id ? { ...g, items: g.items.map((it) => ({ ...it, label: a.name })) } : g));
    return { state: { ...s, doc: { ...s.doc, groups, components } } };
  },
});

export const removeComponentOp = op<{ id: string }>({
  name: "remove_component",
  summary: "Removes a component; its instances, on the screens and in other components, become the plain parts they showed.",
  args: S.obj({ id: S.str() }, ["id"]),
  label: () => "Delete component",
  run(s, a) {
    /* the screens wait outside a definition's history: this could not be taken back from in there */
    if (s.editing) throw new OpError("refused", "A component is being edited: finish editing it first.");
    const gone = componentById(s, a.id);
    const out = removeComponent(s.doc.groups, s.doc.components ?? [], a.id);
    /* a property that swapped in the component it was swaps in nothing now */
    const unswapped = (g: Group): Group => {
      if (!g.properties || !Object.values(g.properties).includes(a.id)) return g;
      const properties = Object.fromEntries(Object.entries(g.properties).filter(([, v]) => v !== a.id));
      const { properties: _was, ...rest } = g;
      return Object.keys(properties).length ? { ...rest, properties } : rest;
    };
    const components = out.components.map((c) => ({ ...c, groups: c.groups.map(unswapped), ...(c.props ? { props: c.props.map((p) => (p.type === "swap" && p.value === a.id ? { ...p, value: "" } : p)) } : {}) }));
    const doc = { ...s.doc, groups: out.groups.map(unswapped) } as CoreState["doc"];
    if (components.length) doc.components = components;
    else delete doc.components;
    /* a set with no variant left goes with its last one */
    if (gone.set && !components.some((c) => c.set === gone.set)) {
      const sets = (s.doc.componentSets ?? []).filter((x) => x.id !== gone.set);
      if (sets.length) doc.componentSets = sets;
      else delete doc.componentSets;
    }
    const kept = s.session.selection.filter((x) => out.groups.some((g) => g.items.some((it) => it.id === x)));
    return { state: withSession({ ...s, doc }, { selection: kept }) };
  },
});

export const detach = op<{ id: string }>({
  name: "detach_instance",
  summary: "Turns an instance back into plain parts of its own.",
  args: S.obj({ id: S.str("the instance's group, or its item") }, ["id"]),
  label: () => "Detach",
  run(s, a) {
    const g = groupById(s, a.id);
    if (!g.instanceOf) throw new OpError("invalid_value", "That is not an instance of a component.", a.id);
    return { state: withSession({ ...s, doc: { ...s.doc, groups: detachInstance(s.doc.groups, g.id, s.doc.components) } }, { selection: [] }) };
  },
});

/** What an instance changes of its definition, by `itemId/propKey`: the whole map, or one key. */
export const setOverrides = op<{ id: string; overrides?: Group["overrides"] | null; key?: string; value?: VarValue | null }>({
  name: "set_overrides",
  summary: "Sets what an instance changes of its component: one override (key `itemId/propKey`, value; null resets it) or the whole map.",
  args: S.obj({ id: S.str(), overrides: { type: ["object", "null"] }, key: S.str(), value: { type: ["string", "number", "boolean", "null"] } }, ["id"]),
  label: () => "Override",
  run(s, a, ctx) {
    const g = groupById(s, a.id);
    if (!g.instanceOf) throw new OpError("invalid_value", "That is not an instance of a component.", a.id);
    let overrides: Group["overrides"] | undefined;
    if (a.key !== undefined) {
      const def = componentById(s, g.instanceOf);
      if (ctx.strict) {
        const [path, prop] = [a.key.slice(0, a.key.lastIndexOf("/")), a.key.slice(a.key.lastIndexOf("/") + 1)];
        const part = overridableParts(def, s.doc.components).find((p) => p.path === path);
        if (!part || !part.props.some((d) => d.key === prop)) throw new OpError("invalid_value", `${a.key} is not something this instance can override.`, a.key);
        const picture = part.props.find((d) => d.key === prop)?.kind === "image" && a.value !== null ? pictureError(a.value) : null;
        if (picture) throw new OpError("invalid_value", `${a.key} ${picture}`, a.key);
      }
      const next = { ...g.overrides };
      if (a.value === null || a.value === undefined) delete next[a.key];
      else next[a.key] = a.value;
      overrides = Object.keys(next).length ? next : undefined;
    } else overrides = a.overrides ?? undefined;
    const groups = s.doc.groups.map((x) => {
      if (x.id !== g.id) return x;
      const { overrides: _was, ...rest } = x;
      return overrides ? { ...rest, overrides } : rest;
    });
    return { state: { ...s, doc: { ...s.doc, groups } } };
  },
});

/* ---------- variants ---------- */

/** a definition as it stands now: the canvas holds the one open for editing */
const liveDef = (s: CoreState, id: string): ComponentDef => {
  const def = componentById(s, id);
  return s.editing?.id === id ? definitionFrom(def, s.doc.groups, s.session.widths) : def;
};

/** what a variant is called: its values, the way Figma names one */
export const variantName = (values: Record<string, string>, set: ComponentSet): string =>
  set.props
    .filter((p) => values[p.name] !== undefined)
    .map((p) => `${p.name}=${values[p.name]}`)
    .join(", ");

/** a variant's values, with the first value of each property it says nothing of */
const fullValues = (values: Record<string, string> | undefined, set: ComponentSet): Record<string, string> => ({ ...Object.fromEntries(set.props.map((p) => [p.name, p.values[0]])), ...values });

/** the document with a set changed (or added) and its variants as `fn` has them, each named by its values */
function withSet(s: CoreState, set: ComponentSet, fn: (c: ComponentDef) => ComponentDef = (c) => c): CoreState {
  const sets = s.doc.componentSets ?? [];
  const componentSets = sets.some((x) => x.id === set.id) ? sets.map((x) => (x.id === set.id ? set : x)) : [...sets, set];
  const components = (s.doc.components ?? []).map((c) => {
    if (c.set !== set.id) return c;
    const next = fn(c);
    const variant = fullValues(next.variant, set);
    return { ...next, variant, name: variantName(variant, set) || next.name };
  });
  return { ...s, doc: { ...s.doc, components, componentSets } };
}

/** A set's properties with every value named here among them. A property not there yet is added with `first` as its
 *  first value, which the variants there already are take. */
function grown(props: ComponentSet["props"], values: Record<string, string>, first: string): ComponentSet["props"] {
  const out = props.map((p) => ({ ...p, values: [...p.values] }));
  for (const [name, v] of Object.entries(values)) {
    const p = out.find((x) => x.name === name);
    if (!p) out.push({ name, values: v === first ? [v] : [first, v] });
    else if (!p.values.includes(v)) p.values.push(v);
  }
  return out;
}

export const addVariant = op<{ component: string; values?: Record<string, string>; id?: string; setId?: string }, { id: string; set: string }>({
  name: "add_variant",
  summary:
    "Adds a variant to a component: a copy of it (same parts, so overrides carry over) that differs by the values of variant properties such as state=pressed or size=m. A component that is not in a set yet becomes the first variant of a new set. values names a value for any property; a property or value the set does not have yet is added.",
  args: S.obj(
    {
      component: S.str("the component (or one of its variants) to copy"),
      values: { type: "object", additionalProperties: { type: "string" }, description: 'the new variant\'s value for each variant property, e.g. {"State": "Pressed"}' },
      id: S.str("an id for the new variant (optional)"),
      setId: S.str("an id for the set, when the component is not in one yet (optional)"),
    },
    ["component"],
  ),
  label: () => "Add variant",
  run(s, a, ctx) {
    const def = liveDef(s, a.component);
    if (a.id && s.doc.components?.some((c) => c.id === a.id)) throw new OpError("invalid_value", `The id ${JSON.stringify(a.id)} is taken already.`, a.id);
    let state = s;
    let set = def.set ? s.doc.componentSets?.find((x) => x.id === def.set) : undefined;
    const first = t("variantDefault", ctx.lang);
    if (!set) {
      /* the component becomes the first variant of a set that takes its name, with the properties the new one names */
      const names = a.values && Object.keys(a.values).length ? Object.keys(a.values) : [t("variantFirstProp", ctx.lang)];
      if (a.setId && s.doc.componentSets?.some((x) => x.id === a.setId)) throw new OpError("invalid_value", `The id ${JSON.stringify(a.setId)} is taken already.`, a.setId);
      set = { id: a.setId ?? ctx.newId(), name: def.name, props: names.map((name) => ({ name, values: [first] })) };
      const setId = set.id;
      const variant = Object.fromEntries(names.map((name) => [name, first]));
      state = { ...s, doc: { ...s.doc, components: (s.doc.components ?? []).map((c) => (c.id === def.id ? { ...c, set: setId, variant } : c)) } };
    }
    const from = fullValues(state.doc.components?.find((c) => c.id === def.id)?.variant, set);
    let values: Record<string, string>;
    let props: ComponentSet["props"];
    if (a.values && Object.keys(a.values).length) {
      props = grown(set.props, a.values, first);
      values = { ...from, ...a.values };
    } else {
      /* a new value of the first property, numbered after the variants there are */
      const name = set.props[0].name;
      const n = variantsOf(state.doc.components, set.id).length + 1;
      let v = t("variantNth", ctx.lang).replace("{n}", String(n));
      for (let i = n + 1; set.props[0].values.includes(v); i++) v = t("variantNth", ctx.lang).replace("{n}", String(i));
      props = grown(set.props, { [name]: v }, first);
      values = { ...from, [name]: v };
    }
    const next: ComponentSet = { ...set, props };
    values = fullValues(values, next);
    const key = (v: Record<string, string>) => JSON.stringify(next.props.map((p) => v[p.name]));
    if (variantsOf(state.doc.components, set.id).some((c) => key(fullValues(c.variant, next)) === key(values))) throw new OpError("invalid_value", `A variant with ${variantName(values, next)} is there already.`, "values");
    const id = a.id ?? ctx.newId();
    const copy: ComponentDef = { ...variantCopy(def, id, variantName(values, next), values), set: set.id };
    /* it goes after the last variant of its set */
    const list = state.doc.components ?? [];
    const last = list.map((c) => c.set).lastIndexOf(set.id);
    state = { ...state, doc: { ...state.doc, components: [...list.slice(0, last + 1), copy, ...list.slice(last + 1)] } };
    return { state: withSet(state, next), result: { id, set: set.id } };
  },
});

type SetProp = { name: string; values: string[]; was?: string; renamed?: Record<string, string> };

export const updateComponentSet = op<{ id: string; name?: string; props?: SetProp[] }>({
  name: "update_component_set",
  summary:
    "Renames a set of variants, or gives it new variant properties: each {name, values}, with was (its old name) to rename one and renamed ({old value: new value}) to rename values. Each variant keeps its values where it can, else takes the property's first value.",
  args: S.obj(
    {
      id: S.str("the set"),
      name: S.str(),
      props: S.arr(
        S.obj(
          { name: S.str(undefined, { minLength: 1 }), values: S.arr(S.str(undefined, { minLength: 1 }), undefined, { minItems: 1 }), was: S.str(), renamed: { type: "object", additionalProperties: { type: "string" } } },
          ["name", "values"],
        ),
        undefined,
        { minItems: 1 },
      ),
    },
    ["id"],
  ),
  label: () => "Variants",
  run(s, a) {
    const set = s.doc.componentSets?.find((x) => x.id === a.id);
    if (!set) throw new OpError("not_found", `There is no set of variants ${JSON.stringify(a.id)}.`, a.id);
    const props = a.props?.map((p) => ({ name: p.name, values: [...new Set(p.values)] })) ?? set.props;
    if (new Set(props.map((p) => p.name)).size !== props.length) throw new OpError("invalid_value", "Two variant properties have the same name.", "props");
    const next: ComponentSet = { ...set, ...(a.name !== undefined ? { name: a.name } : {}), props };
    const moved = (c: ComponentDef): ComponentDef => {
      if (!a.props) return c;
      const variant: Record<string, string> = {};
      for (const p of a.props) {
        const was = c.variant?.[p.was ?? p.name];
        const v = was !== undefined ? (p.renamed?.[was] ?? was) : undefined;
        variant[p.name] = v !== undefined && p.values.includes(v) ? v : p.values[0];
      }
      return { ...c, variant };
    };
    return { state: withSet(s, next, moved) };
  },
});

export const setVariantValues = op<{ component: string; values: Record<string, string> }>({
  name: "set_variant_values",
  summary: "Sets the values a variant has for its set's variant properties (a value the set does not have yet is added).",
  args: S.obj({ component: S.str("the variant"), values: { type: "object", additionalProperties: { type: "string" } } }, ["component", "values"]),
  label: () => "Variant",
  run(s, a, ctx) {
    const def = componentById(s, a.component);
    const set = def.set ? s.doc.componentSets?.find((x) => x.id === def.set) : undefined;
    if (!set) throw new OpError("invalid_value", "That component is not a variant: add_variant makes it one.", a.component);
    const next = { ...set, props: grown(set.props, a.values, t("variantDefault", ctx.lang)) };
    const key = (v: Record<string, string> | undefined) => JSON.stringify(next.props.map((p) => fullValues(v, next)[p.name]));
    const wanted = key({ ...def.variant, ...a.values });
    const clash = variantsOf(s.doc.components, set.id).find((c) => c.id !== def.id && key(c.variant) === wanted);
    if (clash) throw new OpError("invalid_value", `${clash.name} has those values already: each variant of a set needs values of its own.`, "values");
    return { state: withSet(s, next, (c) => (c.id === def.id ? { ...c, variant: { ...c.variant, ...a.values } } : c)) };
  },
});

/** An instance made another component: another variant of its set, or any component. */
export const swapInstance = op<{ id: string; component: string }>({
  name: "swap_instance",
  summary:
    "Makes an instance an instance of another component (another variant of its set, or any component); what it overrides and its property values carry over where the parts and properties have the same names.",
  args: S.obj({ id: S.str("the instance's group, or its item"), component: S.str("the component to show instead") }, ["id", "component"]),
  label: () => "Swap instance",
  run(s, a) {
    const g = groupById(s, a.id);
    if (!g.instanceOf) throw new OpError("invalid_value", "That is not an instance of a component.", a.id);
    const to = componentById(s, a.component);
    if (g.instanceOf === to.id) throw new OpError("nothing_to_do", "It is an instance of that component already.");
    if (!canNest(s.doc.components, s.editing?.id ?? null, to.id)) throw new OpError("refused", "A component cannot hold an instance of itself.", a.component);
    const swapped = swappedInstance(g, to, s.doc.components);
    return { state: { ...s, doc: { ...s.doc, groups: s.doc.groups.map((x) => (x.id === g.id ? swapped : x)) } } };
  },
});

/* ---------- properties ---------- */

/** the document with `fn` applied to every instance: on the screens, on those waiting outside a definition, in definitions */
function everyInstance(s: CoreState, fn: (g: Group) => Group): CoreState {
  const map = (list: Group[]) => {
    const next = list.map((g) => (g.instanceOf ? fn(g) : g));
    return next.every((g, i) => g === list[i]) ? list : next;
  };
  const components = s.doc.components?.map((c) => {
    const groups = map(c.groups);
    return groups === c.groups ? c : { ...c, groups };
  });
  const editing = s.editing ? { ...s.editing, main: { ...s.editing.main, groups: map(s.editing.main.groups) } } : s.editing;
  return { ...s, editing, doc: { ...s.doc, groups: map(s.doc.groups), ...(components ? { components } : {}) } };
}

export const setComponentProp = op<{ component: string; id?: string; name: string; type: ComponentProp["type"]; value?: VarValue; targets: string[] }, { id: string }>({
  name: "set_component_prop",
  summary:
    'Adds (or, by id or name, replaces) a property of a component that its instances set: type "text" (targets: override keys itemId/propKey of the words it sets), "bool" (targets: ids of the component\'s groups it shows or hides; value is whether they show) or "swap" (targets: groups of nested instances; value is the component they show).',
  args: S.obj(
    {
      component: S.str(),
      id: S.str("the property's id (optional)"),
      name: S.str(undefined, { minLength: 1 }),
      type: S.enum(["text", "bool", "swap"]),
      value: { type: ["string", "boolean"], description: "what an instance shows until it says otherwise" },
      targets: S.arr(S.str(), undefined, { minItems: 1 }),
    },
    ["component", "name", "type", "targets"],
  ),
  label: () => "Component property",
  run(s, a, ctx) {
    const def = liveDef(s, a.component);
    const can = propertyTargets(def, s.doc.components);
    const ok = a.type === "text" ? new Set(can.text.map((x) => x.key)) : a.type === "bool" ? new Set(can.layers.map((g) => g.id)) : new Set(can.nested.map((g) => g.id));
    const bad = a.targets.find((x) => !ok.has(x));
    if (bad !== undefined)
      throw new OpError("invalid_value", `${JSON.stringify(bad)} cannot be a target of a ${a.type} property of this component. It can be one of: ${[...ok].slice(0, 30).join(", ") || "nothing"}.`, "targets");
    const was = def.props?.find((p) => (a.id ? p.id === a.id : p.name === a.name));
    const first = a.type === "text" ? can.text.find((x) => x.key === a.targets[0]) : undefined;
    const fallback: VarValue = a.type === "bool" ? true : a.type === "swap" ? (can.nested.find((g) => g.id === a.targets[0])?.instanceOf ?? "") : String(first?.item.props?.[first.prop.key] ?? (first?.prop.kind === "text" ? first.prop.default : "") ?? "");
    const value = a.value ?? (was?.type === a.type ? was.value : undefined) ?? fallback;
    if (a.type === "bool" ? typeof value !== "boolean" : typeof value !== "string") throw new OpError("invalid_value", `value should be ${a.type === "bool" ? "true or false" : "text"} for a ${a.type} property.`, "value");
    if (a.type === "swap" && value && !s.doc.components?.some((c) => c.id === value)) throw new OpError("not_found", `There is no component ${JSON.stringify(value)}.`, String(value));
    const id = was?.id ?? a.id ?? ctx.newId();
    const prop: ComponentProp = { id, name: a.name, type: a.type, value, targets: [...new Set(a.targets)] };
    const props = was ? (def.props ?? []).map((p) => (p.id === was.id ? prop : p)) : [...(def.props ?? []), prop];
    const components = (s.doc.components ?? []).map((c) => (c.id === def.id ? { ...c, props } : c));
    return { state: { ...s, doc: { ...s.doc, components } }, result: { id } };
  },
});

export const removeComponentProp = op<{ component: string; id: string }>({
  name: "remove_component_prop",
  summary: "Removes a property of a component; its instances stop setting it.",
  args: S.obj({ component: S.str(), id: S.str("the property's id or name") }, ["component", "id"]),
  label: () => "Remove property",
  run(s, a) {
    const def = componentById(s, a.component);
    const prop = def.props?.find((p) => p.id === a.id) ?? def.props?.find((p) => p.name === a.id);
    if (!prop) throw new OpError("not_found", `The component has no property ${JSON.stringify(a.id)}.`, a.id);
    const props = def.props!.filter((p) => p !== prop);
    const components = (s.doc.components ?? []).map((c) => {
      if (c.id !== def.id) return c;
      const { props: _was, ...rest } = c;
      return props.length ? { ...rest, props } : rest;
    });
    return {
      state: everyInstance({ ...s, doc: { ...s.doc, components } }, (g) => {
        if (g.instanceOf !== def.id || g.properties?.[prop.id] === undefined) return g;
        const { [prop.id]: _gone, ...rest } = g.properties;
        const { properties: _was, ...kept } = g;
        return Object.keys(rest).length ? { ...kept, properties: rest } : kept;
      }),
    };
  },
});

export const setInstanceProps = op<{ id: string; values: Record<string, VarValue | null> }>({
  name: "set_instance_props",
  summary:
    "Sets the values an instance gives its component's properties, by property id or name: words for a text property, true/false for a bool one, a component id for a swap one; null goes back to the component's own.",
  args: S.obj({ id: S.str("the instance's group, or its item"), values: { type: "object", additionalProperties: { type: ["string", "boolean", "null"] } } }, ["id", "values"]),
  label: () => "Instance properties",
  run(s, a) {
    const g = groupById(s, a.id);
    if (!g.instanceOf) throw new OpError("invalid_value", "That is not an instance of a component.", a.id);
    const def = componentById(s, g.instanceOf);
    const next: Record<string, VarValue> = { ...g.properties };
    for (const [key, v] of Object.entries(a.values)) {
      const p = def.props?.find((x) => x.id === key) ?? def.props?.find((x) => x.name === key);
      if (!p) throw new OpError("invalid_value", `${def.name} has no property ${JSON.stringify(key)}. Its properties are: ${(def.props ?? []).map((x) => x.name).join(", ") || "none"}.`, key);
      if (v === null) {
        delete next[p.id];
        continue;
      }
      if (p.type === "bool" ? typeof v !== "boolean" : typeof v !== "string") throw new OpError("invalid_value", `${p.name} takes ${p.type === "bool" ? "true or false" : p.type === "swap" ? "a component id" : "text"}.`, key);
      if (p.type === "swap" && v) {
        if (!s.doc.components?.some((c) => c.id === v)) throw new OpError("not_found", `There is no component ${JSON.stringify(v)}.`, String(v));
        if (v === def.id || !canNest(s.doc.components, def.id, String(v))) throw new OpError("refused", "A component cannot hold an instance of itself.", String(v));
      }
      next[p.id] = v;
    }
    const { properties: _was, ...rest } = g;
    const changed: Group = Object.keys(next).length ? { ...rest, properties: next } : rest;
    return { state: { ...s, doc: { ...s.doc, groups: s.doc.groups.map((x) => (x.id === g.id ? changed : x)) } } };
  },
});

export const resetOverrides = op<{ id: string }>({
  name: "reset_overrides",
  summary: "Takes back everything an instance changes of its component: its overrides and the values it gives its properties.",
  args: S.obj({ id: S.str("the instance's group, or its item") }, ["id"]),
  label: () => "Reset overrides",
  run(s, a) {
    const g = groupById(s, a.id);
    if (!g.instanceOf) throw new OpError("invalid_value", "That is not an instance of a component.", a.id);
    if (!g.overrides && !g.properties) throw new OpError("nothing_to_do", "The instance changes nothing of its component.");
    const { overrides: _o, properties: _p, ...rest } = g;
    return { state: { ...s, doc: { ...s.doc, groups: s.doc.groups.map((x) => (x.id === g.id ? rest : x)) } } };
  },
});
