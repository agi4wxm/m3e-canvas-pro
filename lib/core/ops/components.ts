/* Operations on reusable components: making one of parts on the canvas (an instance takes their place), renaming,
 * removing (its instances become the parts they showed), detaching an instance, and an instance's overrides. Adding an
 * instance is `add_instance` (ops/nodes.ts); editing a definition is the store's (`openDefinition`). */

import { detachInstance, makeComponent, removeComponent, overridableParts } from "../../instances";
import type { Group, VarValue } from "../../tokens";
import { t } from "../../i18n";
import { op, OpError, S } from "../op";
import { withSession, type CoreState } from "../state";
import { componentById, groupById } from "./common";

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
    componentById(s, a.id);
    const out = removeComponent(s.doc.groups, s.doc.components ?? [], a.id);
    const doc = { ...s.doc, groups: out.groups } as CoreState["doc"];
    if (out.components.length) doc.components = out.components;
    else delete doc.components;
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
