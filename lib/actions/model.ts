/* What a tap does, as data: the one description of interactions every host runs (the preview, the web prototype, the
 * product's web app, the React Native kit, the mini-program kit). docs/交互规则.md says what each piece means; run.ts
 * runs it. Plain types with no imports beyond the screen's moves, so the file can be copied into an exported app's
 * runtime as it is. lib/tokens.ts re-exports all of it under the names the document model has always used. */

import type { Motion } from "../screenMotion";

/** what a variable can hold */
export type VarValue = string | number | boolean;
export type VarType = "text" | "number" | "bool" | "color";

/** what starts an interaction other than a tap: the pointer coming over the part, or time since its screen showed */
export type Trigger = { on: "hover" } | { on: "delay"; ms: number };

/** what a tap does once it has been decided to do it: its effects in order, then where it goes */
export type ActionBody = {
  to: string;
  /** the address a `LINK_TARGET` action opens */
  url?: string;
  effects?: Effect[];
  /** the screen it goes to is laid over the one on show instead of taking its place; going back closes it */
  overlay?: boolean;
  /** a part (item id) the body of the screen on show scrolls to */
  scrollTo?: string;
  /** How the screen it goes to comes in (lib/screenMotion.ts); none plays the default, the older slide. A back action's
   *  own motion is played backwards in place of the way the screen came in. Version 4 of the format wrote the older
   *  `transition` of every tap as the motion that plays it, and nothing reads or writes `transition` since. */
  motion?: Motion;
  /** what the screen it opens is given, by its param names (`Frame.params`): each an expression read at the tap
   *  (`{ productId: "item.id" }`); that screen reads them as `params.productId` */
  params?: Record<string, string>;
};
/** A tap. Without `when` it always runs; with one it runs when that holds, and `else` runs when it
 *  does not. `trigger` starts it on something other than a tap. Printed code reads this too, so it stays plain data. */
export type Action = ActionBody & { when?: Condition; else?: ActionBody; trigger?: Trigger };
/** What runs when a call or an invoke is answered (`then`, `catch`): a body, which may branch on the answer as a tap
 *  branches on its condition. `when` reads the answer (`response`, `status`, `result`, `error`); it holds and the body
 *  runs, it does not and `else` runs, or nothing without one (docs/交互规则.md, “回答上的条件”). Plain data too. */
export type Answer = ActionBody & { when?: Condition; else?: ActionBody };

/** A test on the app's state: an expression (lib/bindings/expr.ts) that comes out truthy (`vars.count == 3`,
 *  `row.price != "0"`, `auth.signedIn`), or an input (by item id) that has something in it. Version 4 of the format
 *  wrote the older `{var, op, value}` as the expression it is (lib/converge.ts). */
export type Condition = { filled: string } | { expr: string };

/** one step of a tap. `part` is an item id, the name that survives grouping and regrouping. */
export type Effect =
  | { do: "show" | "hide" | "toggle" | "open" | "close"; part: string }
  /** `expr` (an expression, lib/bindings/expr.ts) is read when the tap runs, over `value` */
  | { do: "setVar"; var: string; value: VarValue; expr?: string }
  | { do: "toggleVar"; var: string }
  /** a counter has to count: "set" alone can only ever land on one number */
  | { do: "addVar"; var: string; by: number }
  | { do: "setProp"; part: string; prop: string; value: VarValue }
  /** `message` may hold `{{expressions}}` */
  | { do: "snackbar"; message: string }
  /** Calls an endpoint of the API (lib/bindings): `args` gives its parameters by name and, under any other name, fields
   *  of the JSON body, each an expression; `body` an expression for the whole body. `then` runs when it answers 2XX,
   *  with `response` (the body) and `status` to read; `catch` when it does not, with `error` (problem details). The
   *  effects after it do not wait for it. `optimistic` changes a data source's list at once and puts it back if the
   *  call fails: the tapped row taken out, or fields of it set. */
  | { do: "call"; operationId: string; args?: Record<string, string>; body?: string; then?: Answer; catch?: Answer; optimistic?: Optimistic }
  /** Invokes a platform capability (lib/capabilities, docs/平台能力.md): `payment.pay`, `location.current`,
   *  `clipboard.write`… `args` gives its arguments by name, each an expression. `then` runs when it does what was
   *  asked, with `result` to read; `catch` when it does not, with `error` (`error.type`: cancelled, failed,
   *  unavailable, not-implemented, denied, timeout). The effects after it do not wait for it. It never decides a
   *  domain result: a payment's `then` only knows it was submitted, the order's status comes from the API. */
  | { do: "invoke"; capability: string; args?: Record<string, string>; then?: Answer; catch?: Answer }
  /** loads a data source of the screen on show again */
  | { do: "refresh"; source: string }
  /** loads the next page of a paged data source of the screen on show */
  | { do: "loadMore"; source: string }
  /** submits a form (`Group.form`): the one given by its group id, else the one the tapped part is in */
  | { do: "submit"; form?: string }
  /** ends the session: the token is forgotten (and the API's logout endpoint called, when it has one) */
  | { do: "signOut" }
  /** Sends a direction to a world view (the `world-view` part, docs/交互规则.md “输入动作”): `part` is its item id,
   *  `action` the input the world takes it as (`move` when left out), `vector` an expression read at its step that
   *  comes to a direction: `{x, y}` (a joystick's `event`) or words `"x,y"`, each from -1 to 1 (a longer one is cut
   *  back to length 1). One that comes to no direction sends nothing. The world, not the design, decides what moving
   *  means. */
  | { do: "move"; part: string; action?: string; vector: string }
  /** Holds down (`press`) or lets go of (`release`) a named input of a world view (`attack`, `jump`); `part` is its
   *  item id. A tap that presses and lets go says both, in that order. */
  | { do: "press" | "release"; part: string; action: string };

/** What a call changes before it is answered: the tapped row taken out of a data source's list, or fields of it set
 *  (each an expression). Put back when the call fails. */
export type Optimistic = { source: string; remove?: boolean; patch?: Record<string, string> };

/** target id that pops the preview stack instead of opening a frame */
export const BACK_TARGET = "back";

/** target id that opens a web page in the browser instead of a screen */
export const LINK_TARGET = "link";

/** target id of an action that goes nowhere and only runs its effects */
export const STAY_TARGET = "none";

/** How deep calls may be held in one another's `then` and `catch`: a call made from the fourth `then` down is the last
 *  one made. The file reader (lib/project.ts) keeps no deeper call, and every host stops at the same depth. */
export const MAX_CALL_DEPTH = 4;

/** the effects that reach the API (or the session): the rest only change what the app shows */
export const API_EFFECTS = new Set<Effect["do"]>(["call", "refresh", "loadMore", "submit", "signOut"]);

/** the effects that are answered later and run a `then` or a `catch` then: a call of the API, an invoke of a capability */
export const ANSWERED_EFFECTS = new Set<Effect["do"]>(["call", "invoke"]);

/** the effects that send input to a world view (docs/交互规则.md “输入动作”) */
export const WORLD_EFFECTS = new Set<Effect["do"]>(["move", "press", "release"]);

/** the input a direction goes to when a `move` names none */
export const MOVE_ACTION = "move";

/** what names an input of a world: a small letter, then letters and digits (`move`, `attack`, `jump2`) */
export const WORLD_ACTION = /^[a-z][a-zA-Z0-9]{0,31}$/;

/** an effect that is answered later: its `then` and `catch` */
export type AnsweredEffect = Extract<Effect, { do: "call" | "invoke" }>;
export const isAnswered = (e: unknown): e is AnsweredEffect => typeof e === "object" && e !== null && (ANSWERED_EFFECTS as Set<unknown>).has((e as { do?: unknown }).do);

/* The keys of `Item.actions` (docs/交互规则.md, “事件与槽位族”): a place inside the part ("tab:2", "icon"), a family of
   places ("tab:*": one action for every row, which reads the row as `slot`), or a named event the part sends
   ("on:submit", which reads its payload as `event`). lib/partContract.ts reads them off the part's definition. */

/** the start of an event's key in `Item.actions` */
export const EVENT_PREFIX = "on:";
/** the key an event's action is stored under */
export const eventKey = (name: string) => `${EVENT_PREFIX}${name}`;
/** the key a slot family's action is stored under */
export const familyKey = (prefix: string) => `${prefix}:*`;
/** an event's name, when the key is one */
export const eventOfKey = (key: string): string | null => (key.startsWith(EVENT_PREFIX) ? key.slice(EVENT_PREFIX.length) : null);
/** a family's prefix, when the key is one */
export const familyOfKey = (key: string): string | null => (key.endsWith(":*") && !key.startsWith(EVENT_PREFIX) ? key.slice(0, -2) : null);

/** the address a link action opens, once it is one a browser may follow; a bare host is read as https */
export function linkUrlOf(a: Pick<ActionBody, "url"> | undefined): string | null {
  const raw = a?.url?.trim();
  if (!raw) return null;
  const full = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  /* a mini-program's engine has no URL (nor does the runtime's own lib): there an address is only checked for its
     scheme and a host, and kept as it was written */
  const Url = (globalThis as { URL?: new (s: string) => { protocol: string; href: string } }).URL;
  if (typeof Url !== "function") return /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(full) ? full : null;
  try {
    const u = new Url(full);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
