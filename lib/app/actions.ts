/* The runtime's side of the interactions: an exported app runs what a tap does through lib/actions, the one interpreter
 * every host runs (docs/交互规则.md), and the runtime answers what that interpreter asks of the back end: a call, a
 * form sent, an invoke of a platform capability, where the visitor is. What a host keeps of its own (its screens, its
 * variables, what is shown) stays the app's: `Host` in lib/actions says what that is. */

import type { Outcome } from "../actions/host";
import type { CallResult } from "./forms";

export { BACK_TARGET, LINK_TARGET, MAX_CALL_DEPTH, STAY_TARGET, linkUrlOf, type Action, type ActionBody, type Answer, type Condition, type Effect, type Trigger, type VarType, type VarValue } from "../actions/model";
export type { CallArgs, Change, FormRef, GoOptions, Host, Outcome, Tap } from "../actions/host";
export { chooseBranch, conditionHolds, run, startOf, tapScope } from "../actions/run";

/** what a call of the runtime came to (`Runtime.call`), as the interpreter reads it */
export function outcomeOf(out: CallResult<unknown>): Outcome {
  if (out.ok) return { ok: true, status: out.status, response: out.response };
  return { ok: false, status: out.status, error: out.error, ...(out.unauthorized ? { unauthorized: true } : {}), ...(out.dropped ? { dropped: true } : {}) };
}

/** what sending a form came to (`FormHandle.send`), as the interpreter reads it: nothing sent is null */
export const formOutcomeOf = (out: CallResult<unknown> | { ok: false; invalid: true }): Outcome | null => ("invalid" in out ? null : outcomeOf(out));

/** whether what a field holds counts as filled in (a `{filled}` condition): words that are not blank, a tick, a choice
 *  (its place, from 0), a file or a list of them */
export function isFilled(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0;
  if (Array.isArray(v)) return v.length > 0;
  return !!v && typeof v === "object";
}
