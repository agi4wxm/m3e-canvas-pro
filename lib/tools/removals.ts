/* What a call would take away of the author's work that no destructive operation's name says: the rows or fields of a
 * collection rewritten by update_collection, the modes (and their values) update_var_collection leaves out, a custom
 * style or one of the document's own icons replaced under its key, a component's property dropped. A client that is
 * asked to confirm `remove_collection` must be asked for `update_collection {rows: []}` too. The call is run once on a
 * scratch copy of the document and what it leaves is compared with what was there; nothing reaches the real store.
 * The MCP bridge in the tab and the MCP file backend ask the author about it as they ask about a destructive call. */

import { counterIds, DocStore, savedDoc } from "../core";
import type { Doc } from "../tokens";
import { collectionsOf } from "../variables";
import { executeTool, type Registry } from "./registry";
import { isDestructiveCall } from "./ops";

/** Every piece of the author's work `before` has that `after` lost or holds changed under the same name, in a few
 *  words each. Parts and screens are left to the destructive operations that remove them. */
export function workTakenAway(before: Doc, after: Doc): string[] {
  const out: string[] = [];
  const name = (x: { name?: string; id: string }) => JSON.stringify(x.name || x.id);
  for (const c of before.collections ?? []) {
    const now = after.collections?.find((x) => x.id === c.id);
    if (!now) out.push(`the data collection ${name(c)}`);
    else {
      const fields = c.fields.filter((f) => !now.fields.includes(f));
      if (fields.length) out.push(`the field${fields.length === 1 ? "" : "s"} ${fields.map((f) => JSON.stringify(f)).join(", ")} of ${name(c)}`);
      if (now.rows.length < c.rows.length) out.push(`${c.rows.length - now.rows.length} of the ${c.rows.length} rows of ${name(c)}`);
    }
  }
  const vars = new Set((after.vars ?? []).map((v) => v.id));
  const goneVars = (before.vars ?? []).filter((v) => !vars.has(v.id));
  if (goneVars.length) out.push(`the variable${goneVars.length === 1 ? "" : "s"} ${goneVars.map(name).join(", ")}`);
  const collectionsAfter = collectionsOf(after);
  for (const c of collectionsOf(before)) {
    const now = collectionsAfter.find((x) => x.id === c.id);
    if (!now) {
      if (c.modes.length > 1 || (before.varCollections ?? []).some((x) => x.id === c.id)) out.push(`the variable collection ${name(c)}`);
      continue;
    }
    const modes = c.modes.filter((m) => !now.modes.some((x) => x.id === m.id));
    if (modes.length) out.push(`the mode${modes.length === 1 ? "" : "s"} ${modes.map(name).join(", ")} of ${name(c)}, with every variable's value in ${modes.length === 1 ? "it" : "them"}`);
  }
  for (const s of before.styles ?? []) {
    const now = after.styles?.find((x) => x.key === s.key);
    if (!now) out.push(`the custom style ${JSON.stringify(s.key)}`);
    else if (JSON.stringify(now) !== JSON.stringify(s)) out.push(`the custom style ${JSON.stringify(s.key)} as it was (it is replaced)`);
  }
  for (const [id, markup] of Object.entries(before.icons ?? {})) {
    const now = after.icons?.[id];
    if (now === undefined) out.push(`the icon svg:${id}`);
    else if (now !== markup) out.push(`the drawing of the icon svg:${id} (it is replaced)`);
  }
  for (const c of before.components ?? []) {
    const now = after.components?.find((x) => x.id === c.id);
    if (!now) out.push(`the component ${name(c)}`);
    else {
      const props = (c.props ?? []).filter((p) => !(now.props ?? []).some((x) => x.id === p.id));
      if (props.length) out.push(`the propert${props.length === 1 ? "y" : "ies"} ${props.map(name).join(", ")} of the component ${name(c)}`);
    }
  }
  return out;
}

/** What a call that no destructive name marks would take away, found by running it on a copy of the store's document
 *  (empty when it takes nothing, fails, only reads, or is generative: those reach a provider and are not run twice). */
export async function wouldTakeAway(store: DocStore, name: string, args: unknown, o: { registry: Registry }): Promise<string[]> {
  const t = o.registry.byName(name);
  if (!t || t.readOnly || t.group === "generate" || isDestructiveCall(name, args)) return [];
  const before = store.get();
  const scratch = new DocStore(before, { measurer: store.options.measurer, lang: store.options.lang, ids: counterIds("dry") });
  const out = await executeTool(scratch, name, args, { origin: "mcp", history: "none", registry: o.registry });
  if (!out.ok || scratch.get().doc === before.doc) return [];
  return workTakenAway(savedDoc(before), savedDoc(scratch.get()));
}
