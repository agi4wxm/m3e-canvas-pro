/* A form as plain data: the body its fields make (each value as its schema's type has it, put at its dotted path), what
 * the schema says is wrong with each, and the form as `form.` reads it (its values, the errors on show, the call's
 * error, whether it is submitting, its upload's progress). The preview (view.ts) and the exported apps' runtime
 * (packages/app-runtime copies this file) both go by these, so a form checks and shows its errors the same way in both. */

import { fieldError, isBlank, typedValue, type FieldRule, type Problem } from "./rules";

/** a form as `form.` reads it: its values by field (also under `values`), their errors, the error of the call */
export type FormView = Record<string, unknown> & {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  error: Problem | null;
  submitting: boolean;
  valid: boolean;
  progress: number | null;
};

/** a form's submission as far as it has got */
export type FormRun = { errors: Record<string, string>; error: Problem | null; submitting: boolean; submitted: boolean; progress: number | null; response?: unknown };

export const idleForm = (): FormRun => ({ errors: {}, error: null, submitting: false, submitted: false, progress: null });

/** a value put at a dotted path of a body, never on a prototype */
export function setPath(body: Record<string, unknown>, path: string, v: unknown) {
  const steps = path.split(".");
  let at = body;
  for (const s of steps.slice(0, -1)) {
    const next = Object.prototype.hasOwnProperty.call(at, s) ? at[s] : undefined;
    if (!next || typeof next !== "object") Object.defineProperty(at, s, { value: {}, enumerable: true, writable: true, configurable: true });
    at = at[s] as Record<string, unknown>;
  }
  Object.defineProperty(at, steps.at(-1)!, { value: v, enumerable: true, writable: true, configurable: true });
}

/** one field as the form reads it: where it goes, what was entered, and its rule when the schema has one */
export type FieldEntry = { field: string; raw: unknown; rule?: FieldRule };

/** What a form's fields make: the body (each field as its schema's type has it, blanks left out), the values by field,
 *  and what the schema says is wrong with each. */
export function readFields(entries: FieldEntry[], lang: string): { body: Record<string, unknown>; values: Record<string, unknown>; errors: Record<string, string> } {
  const body: Record<string, unknown> = {};
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const { field, raw, rule } of entries) {
    const v = rule ? typedValue(rule.schema, raw) : raw;
    values[field] = v;
    if (!isBlank(v)) setPath(body, field, v);
    if (rule) {
      const err = fieldError(rule, v, lang);
      if (err) errors[field] = err;
    }
  }
  return { body, values, errors };
}

/** Values by field with each one of a nested field ("price.amount") also under its parts, so `form.price.amount` and
 *  `form.errors.price.amount` read it as well as `form.errors["price.amount"]` does; a part that holds a value of its
 *  own is left as it is. */
export function nested<T>(flat: Record<string, T>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...flat };
  for (const [key, v] of Object.entries(flat)) {
    if (!key.includes(".")) continue;
    const steps = key.split(".");
    let at = out;
    let ok = true;
    for (const s of steps.slice(0, -1)) {
      const next = Object.prototype.hasOwnProperty.call(at, s) ? at[s] : undefined;
      if (next === undefined) Object.defineProperty(at, s, { value: {}, enumerable: true, writable: true, configurable: true });
      else if (!next || typeof next !== "object" || Array.isArray(next)) {
        ok = false;
        break;
      }
      at = at[s] as Record<string, unknown>;
    }
    const last = steps.at(-1)!;
    if (ok && !Object.prototype.hasOwnProperty.call(at, last)) Object.defineProperty(at, last, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** A form as `form.` reads it. Once a submit was tried, what is wrong shows as it is typed; the server's word on a
 *  field stands until the next submit (or, where the host says so, until that field changes). */
export function formViewOf(read: { values: Record<string, unknown>; errors: Record<string, string> }, run: FormRun | undefined): FormView {
  const live = run?.submitted ? read.errors : {};
  const errors = { ...run?.errors, ...live };
  const values = nested(read.values);
  return { ...values, values, errors: nested(errors) as Record<string, string>, error: run?.error ?? null, submitting: !!run?.submitting, valid: !Object.keys(read.errors).length, progress: run?.progress ?? null };
}
