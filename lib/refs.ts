/* What a tap points at, found the same way wherever references are kept up (report 8.6): the screen it goes to, the
 * parts it shows, hides, opens, sets, scrolls to or asks about, the form it submits, in its `else`, in a call's `then`
 * and `catch` as deep as they go, and in a form's own `then` and `catch`. Copying a part retargets with it
 * (lib/tokens.ts `retarget`), deleting a screen unlinks with it (lib/core/ops/screens.ts `remove_screen`).
 *
 * Not here yet, on purpose: names that expressions read (a variable by its name, a data source in `{{data.x}}`, a
 * screen's params). Renaming those is kept up once variables have stable keys and bindings are all expressions, in the
 * model convergence of version 3 (docs/整改计划.md, 第四批). */

import type { Action, ActionBody, Condition, Effect } from "./tokens";

export type RefKind = "screen" | "part" | "form";
/** what each kind of reference becomes; a kind left out stays as it is */
export type RefMap = Partial<Record<RefKind, (id: string) => string>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** how deep a call's `then` and `catch` are followed: past what any document may hold (lib/project.ts) */
const MAX_DEPTH = 8;

function mapEffect(e: Effect, f: RefMap, depth: number): Effect {
  const r = e as Effect & Record<string, unknown>;
  let out: Record<string, unknown> = r;
  const set = (k: string, v: unknown) => {
    if (out[k] === v) return;
    if (out === r) out = { ...r };
    out[k] = v;
  };
  if (f.part && typeof r.part === "string") set("part", f.part(r.part));
  if (f.form && r.do === "submit" && typeof r.form === "string") set("form", f.form(r.form));
  if (r.do === "call" && depth < MAX_DEPTH) {
    if (isRecord(r.then)) set("then", mapBody(r.then as unknown as ActionBody, f, depth + 1));
    if (isRecord(r.catch)) set("catch", mapBody(r.catch as unknown as ActionBody, f, depth + 1));
  }
  return out as unknown as Effect;
}

/** a condition with the part it asks about mapped */
export const mapCondition = (c: Condition | undefined, f: RefMap): Condition | undefined => (c && f.part && "filled" in c && typeof c.filled === "string" ? { ...c, filled: f.part(c.filled) } : c);

/** A tap's body (what it does: where it goes, its effects) with every reference in it mapped; the same object when
 *  nothing in it changes. */
export function mapBody<B extends ActionBody>(b: B, f: RefMap, depth = 0): B {
  let out: B = b;
  const set = <K extends keyof B>(k: K, v: B[K]) => {
    if (out[k] === v) return;
    if (out === b) out = { ...b };
    out[k] = v;
  };
  if (f.screen && typeof b.to === "string") set("to", f.screen(b.to) as B["to"]);
  if (f.part && typeof b.scrollTo === "string") set("scrollTo", f.part(b.scrollTo) as B["scrollTo"]);
  if (Array.isArray(b.effects)) {
    const effects = b.effects.map((e) => (isRecord(e) ? mapEffect(e, f, depth) : e));
    if (effects.some((e, i) => e !== b.effects![i])) set("effects", effects as B["effects"]);
  }
  return out;
}

/** A whole tap with every reference in it mapped: its body, its condition and its `else`. */
export function mapAction(a: Action, f: RefMap): Action {
  let out = mapBody(a, f);
  const when = mapCondition(a.when, f);
  if (when !== a.when) out = { ...out, when };
  if (a.else) {
    const other = mapBody(a.else, f);
    if (other !== a.else) out = { ...out, else: other };
  }
  return out;
}

/** The bodies a tap holds below its own: its `else`, and every call's `then` and `catch`, at any depth. What deleting
 *  a screen sends somewhere else when it went there (the tap itself is the caller's to decide about). */
export function mapNestedBodies(a: Action, fn: (b: ActionBody) => ActionBody): Action {
  const inner = (b: ActionBody, depth: number): ActionBody => {
    if (!Array.isArray(b.effects) || depth >= MAX_DEPTH) return b;
    let changed = false;
    const effects = b.effects.map((e) => {
      if (!isRecord(e) || e.do !== "call") return e;
      const c = e as Extract<Effect, { do: "call" }>;
      const then = c.then && fn(inner(c.then, depth + 1));
      const fail = c.catch && fn(inner(c.catch, depth + 1));
      if (then === c.then && fail === c.catch) return e;
      changed = true;
      // eslint-disable-next-line unicorn/no-thenable -- an action body, never a function: nothing awaits it
      return { ...c, ...(then ? { then } : {}), ...(fail ? { catch: fail } : {}) };
    });
    return changed ? { ...b, effects } : b;
  };
  let out = inner(a, 0) as Action;
  if (a.else) {
    const other = fn(inner(a.else, 0));
    if (other !== a.else) out = { ...out, else: other };
  }
  return out;
}
