/* What a screen's expressions read, and how they are read: the design's expressions (`item.price * 2`,
 * `currency(data.product.value.price)`, `Added {{response.name}}`) are kept as the words the author wrote and evaluated
 * here by the editor's own evaluator (lib/bindings/expr.ts, copied), so the app and the preview agree to the letter:
 * nothing is ever `eval`ed, a path that breaks is nothing, and every evaluation has bounds. A `Scope` is built per
 * screen (data, params, vars, auth, now) and grows inward: a repeat adds `item` and `index`, a form `form`, a call's
 * answer `response`, `status` or `error`. */

import { display, evaluate, fillTemplate, toNumber, truthy, type EvalContext, type Scope } from "../bindings/expr";

export type { EvalContext, Scope };

/** A scope and the language its values are written in, with a reader for each kind of value a part takes. */
export class Bindings {
  constructor(
    readonly scope: Scope,
    readonly ctx: EvalContext,
  ) {}

  /** the scope with more in it: a repeat's element, a form, a call's answer */
  with(extra: Scope): Bindings {
    return new Bindings({ ...this.scope, ...extra }, this.ctx);
  }

  /** an expression's value, whatever it is; nothing when it cannot be read */
  ev(expr: string): unknown {
    return evaluate(expr, this.scope, this.ctx);
  }

  /** the words a value shows: nothing is "", a number as it is, a list its elements' words */
  text(expr: string): string {
    return display(this.ev(expr));
  }

  /** words with `{{expressions}}` in them, each read; one that cannot be read stays as it was written */
  fill(template: string): string {
    return fillTemplate(template, this.scope, this.ctx);
  }

  /** a number, kept to its range; what is no number keeps the design's own */
  num(expr: string, design: number, min = -Infinity, max = Infinity): number {
    const n = toNumber(this.ev(expr));
    return n === undefined ? design : Math.min(max, Math.max(min, n));
  }

  /** yes or no; nothing at all keeps the design's own */
  bool(expr: string, design = false): boolean {
    const v = this.ev(expr);
    return v === undefined ? design : truthy(v);
  }

  /** one of a prop's choices; anything else keeps the design's own */
  pick<T extends string>(expr: string, options: readonly T[], design: T): T {
    const v = this.ev(expr);
    const s = typeof v === "string" || typeof v === "number" ? String(v) : undefined;
    return s !== undefined && (options as readonly string[]).includes(s) ? (s as T) : design;
  }

  /** whether a condition holds: null, false, 0, "", NaN and an empty list do not */
  holds(expr: string): boolean {
    return truthy(this.ev(expr));
  }

  /** a list to repeat over; anything else is none */
  list(expr: string): unknown[] {
    const v = this.ev(expr);
    return Array.isArray(v) ? v : [];
  }

  /** a value for a call's parameter (its path or query): words, a number or yes/no; anything else is left out */
  arg(expr: string): string | number | boolean | undefined {
    const v = this.ev(expr);
    return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
  }

  /** a value as words for a path parameter: nothing is "" */
  path(expr: string): string {
    const v = this.arg(expr);
    return v === undefined ? "" : String(v);
  }
}

/** the key of a repeated element: its id where it has one, else its place */
export function keyOf(item: unknown, index: number): string | number {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return id;
  }
  return index;
}
