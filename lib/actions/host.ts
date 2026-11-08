/* What the interpreter (run.ts) asks of the app it runs in. Each host (the preview, the web prototype, the product's web
 * app, the React Native kit, the mini-program kit) keeps its own state and its own way of drawing it; the interpreter
 * keeps the rules: which branch runs, the order of the effects, what each reads and when, what an answer that comes
 * late may still do. docs/交互规则.md is the specification both follow. Types only, no imports beyond the
 * expressions' scope, so the file can go into an exported app's runtime as it is. */

import type { EvalContext, Scope } from "../bindings/expr";
import type { InvokeOutcome } from "../capabilities/types";
import type { Motion, Transition } from "../screenMotion";
import type { Answer, VarType, VarValue } from "./model";

/** Where a tap was made, fixed when it happens: everything it starts reads it, the `then` and `catch` of its calls
 *  too, whatever is on show by the time they run. What it names (the screen, the row, the form) is fixed; what those
 *  hold is read again at every step (`Host.scope`). */
export type Tap = {
  /** the screen the tap was made on (its id): the one on show, or the overlay laid over it */
  screen: string;
  /** what that screen was opened with */
  params?: Record<string, unknown>;
  /** the part tapped (its item id) */
  part?: string;
  /** the element of a data repeat the part was drawn for (`item`), and its place (`index`) */
  item?: unknown;
  index?: number;
  /** the fields of a collection's row the part was drawn for: `row.field` in a condition */
  row?: Record<string, string>;
  /** the row `{{current.field}}` reads: the one last tapped */
  current?: Record<string, string>;
  /** the form (group id) the part is in */
  form?: string;
  /** The place of the part a family's action was run for (`Item.actions["tab:*"]`), read as `slot.key` and
   *  `slot.index`. A part's own action, or a place's own, carries none. */
  slot?: { key: string; index: number };
  /** What the event that started the action carries, read as `event.*` (a part's events, `Item.actions["on:<name>"]`).
   *  A tap carries none. */
  event?: unknown;
};

export type { InvokeOutcome };

/** what a call came to: its answer (2XX), or the problem; `unauthorized` when the refusal sent the app to sign in (no
 *  `catch` then), `dropped` when the host started over while it was out (another scenario, a restarted runtime) */
export type Outcome = { ok: true; status: number; response: unknown } | { ok: false; status: number; error: unknown; unauthorized?: boolean; dropped?: boolean };

/** how a screen is opened */
export type GoOptions = { transition: Transition; motion?: Motion; overlay?: boolean; params?: Record<string, unknown> };

/** A call's arguments as the tap read them: `args` by name (the host puts each in the path, the query, a header or the
 *  JSON body, as the contract places it), `body` the whole body when the effect gives one. Undefined values are left
 *  out. */
export type CallArgs = { args: Record<string, unknown>; body?: unknown };

/** what a call changes before it is answered: the tapped row taken out of a source's list, or fields of it set */
export type Change = { remove: true } | { patch: (row: unknown) => Record<string, unknown> };

/** a form a tap submits: its group id, its operation, what runs after */
export type FormRef = { id: string; operationId: string; then?: Answer; catch?: Answer };

export interface Host {
  /** What expressions read now for this tap: the data of its screen, its params, the variables (by name and id), its
   *  item and index, its form (`form.*`), the session (`auth`), the time (`now`). Asked again at every step. */
  scope(tap: Tap): Scope;
  /** what expressions are evaluated with: the language, the time, the currency */
  ctx(): EvalContext;
  /** a variable now, by id; undefined when there is none */
  variable(id: string): { type: VarType; value: VarValue } | undefined;
  /** writes a variable; the value is already of its type */
  setVar(id: string, value: VarValue): void;
  /** whether an input (by item id) holds something: words, a tick, a choice, a file */
  filled(part: string): boolean;
  /** whether a part is on show */
  shown(part: string): boolean;
  setShown(part: string, on: boolean): void;
  /** Opens or closes an overlay part. Closed, an overlay with a trigger of its own (a menu) keeps its trigger on the
   *  screen; one without (a dialog, a sheet) stands only while open. */
  setOpen(part: string, on: boolean): void;
  setProp(part: string, prop: string, value: VarValue): void;
  /** a snackbar with these words */
  toast(text: string): void;
  /** opens a screen (by id); one the host does not have goes nowhere */
  go(to: string, o: GoOptions): void;
  /** goes back: an overlay closes first */
  back(): void;
  /** opens a web page (http or https only: the interpreter checks) outside the app */
  openLink(url: string): void;
  /** brings a part of the screen on show into view */
  scrollTo(part: string): void;
  /** sends a call; never rejects */
  call(operationId: string, args: CallArgs, tap: Tap): Promise<Outcome>;
  /** Invokes a platform capability (lib/capabilities): the preview's mocks, an exported app's registry. Never rejects;
   *  `dropped` when the host started over while it was out. */
  invoke(capability: string, args: Record<string, unknown>, tap: Tap): Promise<InvokeOutcome>;
  /** changes a data source of the tap's screen before the answer; what it gives back undoes it */
  optimistic(source: string, change: Change, tap: Tap): (() => void) | undefined;
  /** loads a data source of the tap's screen again, or its next page */
  refresh(source: string, tap: Tap): void;
  loadMore(source: string, tap: Tap): void;
  /** the form a submit means: the one named, else the one the tapped part is in */
  form(id: string | undefined, tap: Tap): FormRef | undefined;
  /** Checks and sends a form. Null when nothing was sent: a field failed its rule (the form shows why) or it is being
   *  sent already (a second press is no new submission). */
  submit(form: FormRef, tap: Tap): Promise<Outcome | null>;
  /** ends the session */
  signOut(): void;
  /** A call or a form answered 2XX: when it was the sign-in and a guard or a refusal had sent the app there, the host
   *  takes it back where it was and says so (the answer's `then` then runs without going anywhere itself). */
  afterSignIn(operationId: string): boolean;
  /** How many times the visitor has gone somewhere (a screen opened, gone back from, laid over or closed, picked,
   *  swiped to), counted as each move is made. An answer compares it with the count its tap left. */
  moves(): number;
}
