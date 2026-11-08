/* The one written form of a binding and of a comparison (version 4 of the format, docs/项目文件.md), and how every reader
 * reads them: the preview (lib/interact.ts), the web printers (lib/printBehaviour.ts, lib/printBindings.ts), the phone
 * and mini-program printers (lib/export/rn, lib/export/miniapp), the panels, the AI's tools and the MCP server.
 *
 * A prop is bound to an expression: `Item.bind[prop]` is `=` and the expression. When the expression is a plain read of a
 * variable (`vars.count`, `vars["v-1"]`, nothing else), the binding is to that variable: an input bound so writes what is
 * entered back to it, and a field of a part's design (`@fill`...) follows its modes. Any other expression only shows.
 * What it comes to is made the kind of value the prop takes by one rule (`propValueOf`, lib/bindings/expr.ts), whatever
 * the expression.
 *
 * A condition that compares a variable with a value is an expression too (`{expr: "vars.n == 3"}`); the panel edits the
 * simple ones as a variable, is or is not, and a value (`comparisonOf`, `comparisonExpr`). */

import { parseExpr, type Expr } from "./expr";
import { IDENTIFIER, exprString, varRead } from "../refs";
import type { DocVar, VarValue } from "../tokens";

type Named = Pick<DocVar, "id" | "name">;

/** the step to a name in an expression: `.name` where the name allows it, else `["name"]` */
export const stepTo = (name: string) => (IDENTIFIER.test(name) ? `.${name}` : `[${exprString(name)}]`);

/** The expression that reads a variable: by its name where the name reads it (`vars.count`), else by its key, the id
 *  that never changes (`vars["v-1"]`). */
export function varExpr(vars: readonly Named[], id: string): string {
  const v = vars.find((x) => x.id === id);
  if (v?.name && varRead(vars, v.name) === id) return `vars${stepTo(v.name)}`;
  return `vars${stepTo(id)}`;
}

/** what a binding to a variable is written as */
export const bindOfVar = (vars: readonly Named[], id: string) => `=${varExpr(vars, id)}`;

/** the expression of a binding: what follows its `=`; null for what is no binding */
export const bindExpr = (v: unknown): string | null => (typeof v === "string" && v.startsWith("=") && v.length > 1 ? v.slice(1) : null);

/** the name a tree reads under a root when it is no more than that one read (`vars.x`, `vars?.x`, `vars["x"]`) */
function readsOnly(e: Expr, root: string): string | undefined {
  return e.k === "get" && e.obj.k === "id" && e.obj.name === root && e.key.k === "lit" && typeof e.key.v === "string" ? e.key.v : undefined;
}
const readsVarOnly = (e: Expr) => readsOnly(e, "vars");

/** the variable an expression is a plain read of (by name, else key, as every runtime reads `vars`), or undefined */
export function plainVarRead(expr: string, vars: readonly Named[]): string | undefined {
  const p = parseExpr(expr);
  const name = p.ok ? readsVarOnly(p.expr) : undefined;
  return name === undefined ? undefined : varRead(vars, name);
}

/** The variable a binding is to: its expression is a plain read of one. What an input so bound holds is written back to
 *  it; a field of a design so bound follows it. */
export function boundVarOf(bind: unknown, vars: readonly Named[] | undefined): string | undefined {
  const e = bindExpr(bind);
  return e === null || !vars?.length ? undefined : plainVarRead(e, vars);
}

/** the variable a part's prop (or design field) is bound to, if a plain read of one */
export const boundVar = (it: { bind?: Record<string, string> }, key: string, vars: readonly Named[] | undefined) => boundVarOf(it.bind?.[key], vars);

/* ---------- comparisons ---------- */

/** a comparison of a variable (or a field of the row a part was drawn for, `row.<field>`) with a value, as the panel
 *  edits one */
export type Comparison = { var: string; op: "eq" | "neq"; value: VarValue };

/** what a comparison reads: a variable, or a row's field */
const readOf = (vars: readonly Named[], id: string) => (id.startsWith("row.") ? `row${stepTo(id.slice(4))}` : varExpr(vars, id));

/** a value as an expression's literal */
const literal = (v: VarValue) => (typeof v === "string" ? exprString(v) : String(v));

/** the expression a comparison is written as: `vars.n == 3`, `vars.flag != true` */
export function comparisonExpr(c: Comparison, vars: readonly Named[]): string {
  return `${readOf(vars, c.var)} ${c.op === "neq" ? "!=" : "=="} ${literal(c.value)}`;
}

/** A condition's expression read back as a comparison, when it is one the panel can show as such: a plain read of a
 *  variable, `==` or `!=`, and a literal of the variable's type. Null otherwise: it is edited as an expression. */
export function comparisonOf(expr: string, vars: readonly (Named & Pick<DocVar, "type">)[]): Comparison | null {
  const p = parseExpr(expr);
  if (!p.ok || p.expr.k !== "bin" || (p.expr.op !== "==" && p.expr.op !== "!=")) return null;
  const name = readsVarOnly(p.expr.a);
  const b = p.expr.b;
  /* a negative number is written as one taken from nothing */
  const lit = b.k === "lit" ? b.v : b.k === "un" && b.op === "-" && b.x.k === "lit" && typeof b.x.v === "number" ? -b.x.v : undefined;
  if (typeof lit !== "string" && typeof lit !== "number" && typeof lit !== "boolean") return null;
  const op = p.expr.op === "!=" ? "neq" : "eq";
  /* a row's fields are words */
  const field = readsOnly(p.expr.a, "row");
  if (field !== undefined) return typeof lit === "string" ? { var: `row.${field}`, op, value: lit } : null;
  if (name === undefined) return null;
  const id = varRead(vars, name);
  const v = vars.find((x) => x.id === id);
  if (!v) return null;
  const fits = v.type === "number" ? typeof lit === "number" : v.type === "bool" ? typeof lit === "boolean" : typeof lit === "string";
  return fits ? { var: v.id, op, value: lit } : null;
}

/* ---------- a field of a design ---------- */

/** What a field of a part's design (`@fill`, `@opacity`...) is bound to: a variable, by its key (`=vars["v-brand"]`), so
 *  the canvas, the preview, a saved picture and the printed CSS can follow it through its modes knowing the variables'
 *  values alone. Any other binding of a design field is none. */
export function fieldVarOf(bind: unknown): string | undefined {
  const e = bindExpr(bind);
  const p = e === null ? undefined : parseExpr(e);
  return p?.ok ? readsVarOnly(p.expr) : undefined;
}

/** what a design field's binding to a variable is written as: by its key, always in brackets */
export const fieldBindOf = (id: string) => `=vars[${exprString(id)}]`;
