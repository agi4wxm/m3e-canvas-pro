/* The interpreter: one action, run over a host (host.ts), the way docs/交互规则.md says. Pure: no DOM, no React, no
 * platform; the expressions are the bindings' own evaluator (never eval), so the editor, Node, React Native and the
 * mini-programs run the same rules.
 *
 *   1. The condition picks the branch: the action, its `else`, or nothing.
 *   2. The effects run in order. Each reads the state as the one before it left it: a step reads the scope again.
 *      A call is sent at its step, with its arguments read then; nothing after it waits for its answer.
 *   3. Then the tap goes where it goes, its params read after every effect.
 *      An invoke of a capability is sent the same way, and answered the same way.
 *   4. An answer runs its `then` or `catch` (the branch its condition picks, when it has one) where the tap was made (its screen, params, row, form), reading the data,
 *      the variables and the session as they are when it comes. It runs nothing once its host has started over, and
 *      nothing when the same part has made the same call again since. When the visitor has moved on since the tap,
 *      its effects still run (the app keeps up with the back end) but it goes nowhere.
 */

import { display, evaluate, fillTemplate, holds, type Scope } from "../bindings/expr";
import { BACK_TARGET, LINK_TARGET, MAX_CALL_DEPTH, STAY_TARGET, linkUrlOf, type Action, type ActionBody, type Answer, type Condition, type Effect, type Trigger, type VarType, type VarValue } from "./model";
import type { Change, FormRef, Host, InvokeOutcome, Outcome, Tap } from "./host";

/* ---------- values ---------- */

export const asNumber = (v: VarValue): number | null => {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const asBool = (v: VarValue) => (typeof v === "string" ? v !== "" && v !== "false" && v !== "0" : !!v);

/** A value put into a variable keeps to the variable's type; null when it cannot. A color stays words: the host keeps
 *  only what is a color. */
export function coerce(v: VarValue, type: VarType): VarValue | null {
  if (type === "text" || type === "color") return String(v);
  if (type === "bool") return asBool(v);
  return asNumber(v);
}

/** what an expression came to, as a variable can hold it: words for what is no plain value, nothing for nothing */
const scalar = (raw: unknown): VarValue | undefined =>
  raw === undefined || raw === null ? undefined : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : display(raw);

/* `{{current.field}}`: the row last tapped (a collection's), filled into every word of the body before it runs. What is
   between the braces is taken whole, never split by a pattern that could backtrack. */
const TOKEN = /\{\{([^{}]*)\}\}/g;

function fillDeepWith<T>(value: T, fill: (text: string) => string, depth = 0): T {
  if (depth > 64) return value;
  if (typeof value === "string") return fill(value) as T;
  if (Array.isArray(value)) {
    const out = value.map((x) => fillDeepWith(x, fill, depth + 1));
    return out.some((x, i) => x !== value[i]) ? (out as T) : value;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const out = entries.map(([k, v]) => [k, fillDeepWith(v, fill, depth + 1)] as const);
    return out.some(([, v], i) => v !== entries[i][1]) ? (Object.fromEntries(out) as T) : value;
  }
  return value;
}

/** the body with `{{current.field}}` filled from the row last tapped; a field it does not have reads as nothing */
export const fillCurrent = <T>(value: T, current: Record<string, string> | undefined): T =>
  fillDeepWith(value, (text) =>
    text.includes("{{current.")
      ? text.replace(TOKEN, (whole, inner: string) => {
          const key = inner.trim();
          return key.startsWith("current.") ? (current?.[key.slice(8)] ?? "") : whole;
        })
      : text,
  );

/* ---------- what starts an action ---------- */

/** How an action starts on a host: on a tap, as the pointer comes over the part, or `ms` after its screen comes into use.
 *  Without a pointer (a phone, a mini-program) a hover is a tap: it is the only way to reach what it does. */
export function startOf(a: Pick<Action, "trigger"> | undefined, o: { pointer: boolean }): { on: "tap" } | { on: "hover" } | { on: "delay"; ms: number } {
  const t: Trigger | undefined = a?.trigger;
  if (t?.on === "delay" && Number.isFinite(t.ms)) return { on: "delay", ms: Math.max(0, Math.min(600_000, Math.round(t.ms))) };
  if (t?.on === "hover") return o.pointer ? { on: "hover" } : { on: "tap" };
  return { on: "tap" };
}

/* ---------- conditions ---------- */

/** whether a condition holds for this tap; no condition always holds, and one that cannot be read does not */
export function conditionHolds(c: Condition | undefined, host: Host, tap: Tap, extra?: Scope): boolean {
  if (!c) return true;
  if ("expr" in c) return typeof c.expr === "string" && holds(c.expr, scopeOf(host, tap, extra), host.ctx());
  if ("filled" in c) return typeof c.filled === "string" && host.filled(c.filled);
  /* a condition of a form this version does not know (a later one's) holds never */
  return false;
}

/** The body a tap runs: the action itself, its `else`, or nothing; its words read the row last tapped. `extra` is what
 *  the condition reads beyond the tap's scope (an answer's `response`, `status`, `result` or `error`). */
export function chooseBranch(a: Action | Answer, host: Host, tap: Tap, extra?: Scope): ActionBody | null {
  const body = conditionHolds(a.when, host, tap, extra) ? a : a.else;
  return body ? fillCurrent(body, tap.current) : null;
}

/** the body an answer runs: its own, its `else` when its condition does not hold, or nothing */
function answerBranch(a: Answer, host: Host, tap: Tap, extra: Scope): ActionBody | null {
  if (!a.when) return a;
  return conditionHolds(a.when, host, tap, extra) ? a : (a.else ?? null);
}

/* ---------- running ---------- */

/** What expressions read at this step of a tap: the host's scope for it, what an answer adds (`response`, `status`,
 *  `error`), the row of a collection the part was drawn for as `row`, the payload of the event that started it as
 *  `event`, and the place a family's action was run for as `slot`. */
export const tapScope = (host: Host, tap: Tap, extra?: Scope): Scope => ({
  ...host.scope(tap),
  /* a part drawn for a collection's row reads that row's fields as `row.field` */
  ...(tap.row ? { row: tap.row } : {}),
  ...extra,
  ...(tap.event !== undefined ? { event: tap.event } : {}),
  ...(tap.slot ? { slot: tap.slot } : {}),
});
const scopeOf = tapScope;

/** the latest call of each kind, per host: a part's call to an operation on a screen; an older answer gives way */
const ledgers = new WeakMap<Host, Map<string, number>>();

type Run = {
  host: Host;
  /** where the visitor was once the tap (or an answer of it) had gone where it goes */
  at: { moves: number };
  /** what the tap has started and not yet seen settle */
  pending: Promise<void>[];
};

/** whether the visitor is still where the tap left them */
const stillThere = (r: Run) => r.at.moves === r.host.moves();

/** One action, run over the host: its branch, its effects in order, where it goes. What it gives back settles when
 *  every call it started (and every call those answers started) has been answered and run. */
export function run(action: Action | undefined, host: Host, tap: Tap): Promise<void> {
  if (!action) return Promise.resolve();
  const r: Run = { host, at: { moves: host.moves() }, pending: [] };
  const body = chooseBranch(action, host, tap);
  if (body) runBody(body, r, tap, undefined, 0, true);
  return settled(r.pending);
}

/** runs one body (a tap's branch, or a `then` or `catch`) where `tap` was made; `go` false runs its effects only */
function runBody(body: ActionBody, r: Run, tap: Tap, extra: Scope | undefined, depth: number, go: boolean) {
  for (const e of Array.isArray(body.effects) ? body.effects : []) effect(e, r, tap, extra, depth);
  if (!go) return;
  navigate(body, r.host, tap, extra);
  r.at.moves = r.host.moves();
}

async function settled(list: Promise<void>[]) {
  /* what an answer starts joins the list while it is walked */
  for (let i = 0; i < list.length; i++) await list[i];
}

function navigate(body: ActionBody, host: Host, tap: Tap, extra: Scope | undefined) {
  /* a back action's own motion goes with it; without one the host undoes the way the screen came in */
  if (body.to === BACK_TARGET) return body.motion ? host.back({ motion: body.motion }) : host.back();
  if (body.to === LINK_TARGET) {
    const href = linkUrlOf(body);
    if (href) host.openLink(href);
    return;
  }
  if (typeof body.scrollTo === "string" && body.scrollTo) host.scrollTo(body.scrollTo);
  if (!body.to || body.to === STAY_TARGET) return;
  /* the params are read after every effect has run */
  const given = body.params && Object.keys(body.params).length ? body.params : undefined;
  let params: Record<string, unknown> | undefined;
  if (given) {
    const scope = scopeOf(host, tap, extra);
    params = Object.fromEntries(Object.entries(given).map(([k, x]) => [k, typeof x === "string" ? evaluate(x, scope, host.ctx()) : undefined]));
  }
  host.go(body.to, { ...(body.motion ? { motion: body.motion } : {}), ...(body.overlay === true ? { overlay: true } : {}), ...(params ? { params } : {}) });
}

function effect(e: Effect, r: Run, tap: Tap, extra: Scope | undefined, depth: number) {
  const { host } = r;
  if (!e || typeof e !== "object") return;
  switch (e.do) {
    case "show":
    case "hide":
      host.setShown(e.part, e.do === "show");
      return;
    case "toggle":
      host.setShown(e.part, !host.shown(e.part));
      return;
    case "open":
    case "close":
      host.setOpen(e.part, e.do === "open");
      return;
    case "setVar": {
      const v = host.variable(e.var);
      if (!v) return;
      /* an expression is read now; what it comes to is kept as the variable's type keeps it */
      const given = typeof e.expr === "string" ? scalar(evaluate(e.expr, scopeOf(host, tap, extra), host.ctx())) : scalar(e.value);
      const value = given === undefined ? null : coerce(given, v.type);
      if (value !== null) host.setVar(e.var, value);
      return;
    }
    case "toggleVar": {
      const v = host.variable(e.var);
      if (v) host.setVar(e.var, v.type === "bool" ? !asBool(v.value) : v.value);
      return;
    }
    case "addVar": {
      const v = host.variable(e.var);
      if (!v || typeof e.by !== "number" || !Number.isFinite(e.by)) return;
      /* tenths added together should not read 0.30000000000000004 */
      const next = Math.round(((asNumber(v.value) ?? 0) + e.by) * 1e6) / 1e6;
      host.setVar(e.var, coerce(next, v.type) ?? next);
      return;
    }
    case "setProp":
      host.setProp(e.part, e.prop, e.value);
      return;
    case "snackbar": {
      const message = typeof e.message === "string" ? e.message : "";
      host.toast(message.includes("{{") ? fillTemplate(message, scopeOf(host, tap, extra), host.ctx()) : message);
      return;
    }
    case "call":
      if (depth <= MAX_CALL_DEPTH && typeof e.operationId === "string" && e.operationId) call(e, r, tap, extra, depth);
      return;
    case "invoke":
      if (depth <= MAX_CALL_DEPTH && typeof e.capability === "string" && e.capability) invoke(e, r, tap, extra, depth);
      return;
    case "refresh":
      host.refresh(e.source, tap);
      return;
    case "loadMore":
      host.loadMore(e.source, tap);
      return;
    case "submit": {
      const form = host.form(typeof e.form === "string" && e.form ? e.form : tap.form, tap);
      if (form) submit(form, r, tap, depth);
      return;
    }
    case "signOut":
      host.signOut();
      return;
    default:
      /* a kind this version does not know, from a file saved by a later one */
      return;
  }
}

/** what a host's call came to, even when it threw */
async function outcomeOf(p: () => Promise<Outcome | null>): Promise<Outcome | null> {
  try {
    return await p();
  } catch (err) {
    return { ok: false, status: 0, error: { status: 0, title: err instanceof Error ? err.message.slice(0, 200) : "" } };
  }
}

function call(e: Extract<Effect, { do: "call" }>, r: Run, tap: Tap, extra: Scope | undefined, depth: number) {
  const { host } = r;
  const scope = scopeOf(host, tap, extra);
  const ctx = host.ctx();
  const args: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(e.args ?? {})) {
    const v = typeof x === "string" ? evaluate(x, scope, ctx) : undefined;
    if (v !== undefined) args[k] = v;
  }
  const body = typeof e.body === "string" ? evaluate(e.body, scope, ctx) : undefined;
  /* the row the tap came from changes first, when the call says so */
  const o = e.optimistic;
  let change: Change | undefined;
  if (o && tap.item !== undefined) {
    if (o.remove === true) change = { remove: true };
    else if (o.patch && Object.keys(o.patch).length) {
      const patch = o.patch;
      change = { patch: (row) => Object.fromEntries(Object.entries(patch).map(([k, x]) => [k, evaluate(x, { ...scope, item: row }, ctx)])) };
    }
  }
  const undo = o && change ? host.optimistic(o.source, change, tap) : undefined;
  /* the newest call of its kind speaks for it: an older answer gives way */
  const ledger = ledgers.get(host) ?? new Map<string, number>();
  ledgers.set(host, ledger);
  const key = `${tap.screen}\u0000${tap.part ?? ""}\u0000${e.operationId}`;
  const n = (ledger.get(key) ?? 0) + 1;
  ledger.set(key, n);
  const asked = host.call(e.operationId, { args, ...(body !== undefined ? { body } : {}) }, tap);
  r.pending.push(
    outcomeOf(() => asked).then((out) => {
      if (!out || (!out.ok && out.dropped)) return;
      if (ledger.get(key) !== n) return;
      if (!out.ok) undo?.();
      answered(out, e.operationId, e.then, e.catch, r, tap, extra, depth);
    }),
  );
}

/** what a host's invoke came to, even when it threw */
async function invokeOutcomeOf(capability: string, p: () => Promise<InvokeOutcome>): Promise<InvokeOutcome> {
  try {
    return await p();
  } catch (err) {
    return { ok: false, error: { type: "failed", capability, ...(err instanceof Error ? { message: err.message.slice(0, 200) } : {}) } };
  }
}

/* An invoke runs as a call does (docs/交互规则.md, “调用能力”): its arguments read at its step, nothing after it waits, its
   answer runs `then` (reading `result`) or `catch` (reading `error`) where the tap was made, with the same rules for an
   answer that comes late. It shares the calls' depth: an invoke in a call's `then` is one deeper. */
function invoke(e: Extract<Effect, { do: "invoke" }>, r: Run, tap: Tap, extra: Scope | undefined, depth: number) {
  const { host } = r;
  const scope = scopeOf(host, tap, extra);
  const ctx = host.ctx();
  const args: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(e.args ?? {})) {
    const v = typeof x === "string" ? evaluate(x, scope, ctx) : undefined;
    if (v !== undefined) args[k] = v;
  }
  const ledger = ledgers.get(host) ?? new Map<string, number>();
  ledgers.set(host, ledger);
  const key = `${tap.screen}\u0000${tap.part ?? ""}\u0000invoke:${e.capability}`;
  const n = (ledger.get(key) ?? 0) + 1;
  ledger.set(key, n);
  const asked = host.invoke(e.capability, args, tap);
  r.pending.push(
    invokeOutcomeOf(e.capability, () => asked).then((out) => {
      if (!out.ok && out.dropped) return;
      if (ledger.get(key) !== n) return;
      const here = stillThere(r);
      const scope: Scope = out.ok ? { ...extra, result: out.result } : { ...extra, error: out.error };
      const given = out.ok ? e.then : e.catch;
      const chosen = given && answerBranch(given, host, tap, scope);
      if (chosen) runBody(chosen, r, tap, scope, depth + 1, here);
    }),
  );
}

function submit(form: FormRef, r: Run, tap: Tap, depth: number) {
  /* the form's `then` and `catch` read it as `form`, whichever part sent it (a button outside it too) */
  const sent: Tap = { ...tap, form: form.id };
  const asked = r.host.submit(form, sent);
  r.pending.push(
    outcomeOf(() => asked).then((out) => {
      if (!out || (!out.ok && out.dropped)) return;
      answered(out, form.operationId, form.then, form.catch, r, sent, undefined, depth);
    }),
  );
}

/** An answer's `then` or `catch`, where the tap was made; with the visitor moved on, its effects only. A body with a
 *  condition runs the branch the answer picks. */
function answered(out: Outcome, operationId: string, then: Answer | undefined, fail: Answer | undefined, r: Run, tap: Tap, extra: Scope | undefined, depth: number) {
  const here = stillThere(r);
  if (out.ok) {
    /* a sign-in the app was sent to: back where it was, in place of where `then` goes */
    const back = here && r.host.afterSignIn(operationId);
    const scope: Scope = { ...extra, response: out.response, status: out.status };
    const chosen = then && answerBranch(then, r.host, tap, scope);
    if (chosen) runBody(chosen, r, tap, scope, depth + 1, here && !back);
    return;
  }
  /* a refusal that sent the app to sign in has nothing to say here */
  if (out.unauthorized) return;
  const scope: Scope = { ...extra, error: out.error, status: out.status };
  const chosen = fail && answerBranch(fail, r.host, tap, scope);
  if (chosen) runBody(chosen, r, tap, scope, depth + 1, here);
}
