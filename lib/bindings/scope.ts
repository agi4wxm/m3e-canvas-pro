/* What an expression on a part reads at run time, put together: the screen's scope (its data, params, the session, the
 * time), the variables as they are now, the element of a data repeat the part was drawn for, the form it is in, and
 * the row of a collection. The preview's state carries a `BindingContext` for the screen on show (lib/interact.ts
 * reads it); a part adds what is its own. */

import type { Item, VarValue } from "../tokens";
import type { EvalContext, Scope } from "./expr";
import type { FormView } from "./form";

export type { FormView } from "./form";

export type BindingContext = {
  /** the screen's own scope: data, params, auth, now */
  scope: Scope;
  /** the variables' names, so `vars.<name>` reads what they are now */
  varNames: { id: string; name: string }[];
  /** each form of the screen, by its group id */
  forms: Record<string, FormView>;
  eval: EvalContext;
};

/** the variables by name and by id */
export function varsOf(values: Record<string, VarValue>, names: { id: string; name: string }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(values)) if (!id.startsWith("row.")) out[id] = v;
  for (const n of names) if (n.name && n.id in values) out[n.name] = values[n.id];
  return out;
}

/** What an expression on a part reads: the screen's scope, the variables now, and the part's own: its element and
 *  index, its form, its collection row. `extra` goes over all of it (a call's `response`, its `error`). */
export function scopeFor(ctx: BindingContext, vars: Record<string, VarValue>, it?: Pick<Item, "scope" | "row">, extra?: Scope): Scope {
  const own = it?.scope;
  return {
    ...ctx.scope,
    vars: varsOf(vars, ctx.varNames),
    ...(own && "item" in own ? { item: own.item } : {}),
    ...(own?.index !== undefined ? { index: own.index } : {}),
    ...(own?.form && ctx.forms[own.form] ? { form: ctx.forms[own.form] } : {}),
    ...(it?.row ? { row: it.row } : {}),
    ...extra,
  };
}

/** the context of no bindings at all: what a document without them reads */
export const NO_BINDINGS: BindingContext = { scope: {}, varNames: [], forms: {}, eval: { lang: "en" } };

