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
const isValue = (v: unknown) => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));

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

/** why a value is not a condition a document may keep, or null: `{filled: part}`, `{expr}`, or `{var, op, value}` */
export function conditionRule(c: unknown): string | null {
  if (!isRecord(c)) return "should be {var, op, value}, {filled} or {expr}";
  if (typeof c.filled === "string") return null;
  if (c.expr !== undefined) return exprRule(c.expr);
  if (typeof c.var !== "string") return "var should be a variable's id, or row.<field> inside a repeat over a collection";
  if (c.op !== "eq" && c.op !== "neq") return 'op should be "eq" or "neq"';
  return isValue(c.value) ? null : "value should be text, a number or true/false";
}

/** Why a value is not what a prop (or a field of a part's design, `@fill`…, lib/variables.ts) may be bound to, or
 *  null: a variable's id, or `=` and an expression over the bindings, as long as any other expression may be. */
export function bindRule(v: unknown): string | null {
  if (typeof v !== "string") return 'should be a variable\'s id or "=expression"';
  if (v.startsWith("=")) return exprRule(v.slice(1));
  return null;
}
