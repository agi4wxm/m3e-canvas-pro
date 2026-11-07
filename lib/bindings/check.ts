/* What an operation says about an expression it is asked to write: whether it parses, and, where the place it goes is
 * known, whether the names it reads are there (a source the screen loads, a param it takes, an item it is repeated
 * for). Words a model can act on. */

import { exprProblems, parseExpr, pathsOf } from "./expr";
import type { ScopeShape } from "./complete";

/** why a value is not an expression the bindings can read, or null when it is one */
export function exprSyntaxError(v: unknown): string | null {
  if (typeof v !== "string") return "an expression should be text";
  const p = parseExpr(v);
  return p.ok ? null : `${JSON.stringify(v.length > 80 ? `${v.slice(0, 80)}…` : v)} is no expression: ${p.error} (at character ${p.at})`;
}

/** Why an expression cannot be read where it goes: a syntax error, a source the screen does not load, a param it does
 *  not take, `item` outside a repeat over data, `form` outside a form. Null when nothing is known to be wrong. */
export function exprPlaceError(v: unknown, shape: ScopeShape): string | null {
  const syntax = exprSyntaxError(v);
  if (syntax) return syntax;
  const src = v as string;
  const problems = exprProblems(src, { sources: shape.sources.map((s) => s.name), params: shape.params });
  const p = parseExpr(src);
  if (p.ok)
    for (const path of pathsOf(p.expr)) {
      if ((path[0] === "item" || path[0] === "index") && !shape.inRepeat) problems.push(`${path[0]} is read only inside a repeat over data (set_repeat {data})`);
      if (path[0] === "form" && !shape.form) problems.push("form is read only inside a form (make_form)");
      if (path[0] === "row" && !shape.row) problems.push("row is read only inside a repeat over a collection");
    }
  return problems.length ? [...new Set(problems)].join("; ") : null;
}
