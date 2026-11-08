/* The rules a document's behaviour fields are held to, written once (report 8.6). Reading a document drops a value that
 * breaks one (lib/project.ts, lib/bindings/clean.ts); an operation refuses it, with the same words
 * (lib/core/ops/validate.ts). Beyond them an operation also checks what a value points at (a variable, a part, an
 * endpoint), which a file is not refused for: a stale reference does nothing when it runs. And it checks that an
 * expression parses, which a file keeps for the author to see and fix in the panel.
 *
 * Only the fields where reading and operations had come apart are here; the rest move here with the model convergence
 * of version 3, where every field gets one rule (docs/整改计划.md, 第四批). */

import { EXPR_LIMITS } from "./bindings/expr";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A field of the row a part repeated over a collection was drawn from, read as a variable (`{var: "row.title"}`,
 *  docs/数据绑定.md): not one of the document's variables, and never refused for not being one. */
export const ROW_FIELD = /^row\.[A-Za-z_$][\w$-]{0,63}$/;

/** why a value is not an expression a document may keep, or null */
export function exprRule(v: unknown): string | null {
  if (typeof v !== "string") return "an expression should be text";
  if (!v.trim()) return "the expression is empty";
  if (v.length > EXPR_LIMITS.length) return `the expression is longer than ${EXPR_LIMITS.length} characters`;
  return null;
}

/** Why a value is not a condition a document may keep, or null: `{expr}` or `{filled: part}`. A comparison of a variable
 *  is an expression (`vars.count == 3`, `row.price != "0"`); version 4 wrote the older `{var, op, value}` so. */
export function conditionRule(c: unknown): string | null {
  if (!isRecord(c)) return 'should be {expr} or {filled}';
  if (typeof c.filled === "string") return null;
  if (c.expr !== undefined) return exprRule(c.expr);
  return 'should be {expr: an expression} (a variable compared: {expr: "vars.count == 3"}) or {filled: a part}';
}

/** Why a value is not what a prop (or a field of a part's design, `@fill`…, lib/variables.ts) may be bound to, or
 *  null: `=` and an expression over the bindings, as long as any other expression may be. A variable is bound by the
 *  expression that reads it (`=vars.count`); version 4 wrote the older variable ids so (lib/converge.ts). */
export function bindRule(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("=")) return 'should be "=expression" (a variable is bound as "=vars.<name>")';
  return exprRule(v.slice(1));
}
