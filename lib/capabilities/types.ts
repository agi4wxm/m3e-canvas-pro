/* Platform capabilities (docs/平台能力.md): payment, sign-in with another service, location, scanning, push, sharing,
 * the clipboard, links, files, analytics, biometrics, calls, and the views of a map, a camera and a call. M3E does not
 * implement any of them. It says what each takes, gives back, sends and how it fails; a design says when one is used
 * and how every outcome looks; the preview answers them from the mock library; an exported app hands them to adapters
 * written once per app (src/custom/capabilities.ts, src/custom/slots/*).
 *
 * Plain data and no imports, so the files of this folder go into an exported app's packages/capabilities as they are. */

/** How a capability can fail. Every one may also answer `not-implemented`: its adapter has not been written yet. */
export const FAILURE_KINDS = ["cancelled", "failed", "unavailable", "not-implemented", "denied", "timeout"] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** A JSON Schema 2020-12 schema (lib/api/types.ts has the full type; this folder stands on its own). */
export type CapabilitySchema = boolean | { [keyword: string]: unknown };

/** what a capability is: a call that answers once (`invoke`), an event the platform sends on its own, or a view drawn
 *  on a screen that takes props and sends events */
export type CapabilityKind = "call" | "event" | "view";

/** an event a view sends, or the platform sends: its name and what it carries */
export type CapabilityEvent = { name: string; summary?: string; payload?: CapabilitySchema };

/** One capability: the standard ones are the catalog's (catalog.ts); a product declares its own the same way
 *  (`Doc.capabilities.own`). Names are dotted identifiers: `payment.pay`, `acme.ticket.scan`. */
export type CapabilityDef = {
  name: string;
  kind: CapabilityKind;
  /** what it is for, in a sentence */
  summary?: string;
  /** a call's arguments (an object schema; `invoke` gives each as an expression) */
  args?: CapabilitySchema;
  /** a call's result, read as `result` in the `then` of an `invoke` */
  result?: CapabilitySchema;
  /** how a call fails beside `not-implemented`, read as `error.type` in its `catch` */
  failures?: FailureKind[];
  /** an event's payload (kind `event`) */
  payload?: CapabilitySchema;
  /** a view's props: what the screen hands the real map, camera or call */
  props?: CapabilitySchema;
  /** a view's events */
  events?: CapabilityEvent[];
  /** a call with a view of its own: the view's name (`rtc.call` draws `rtc.view`) */
  view?: string;
  /** needs no account and holds no product logic (a link, the clipboard, a share sheet, a file picker): each app
   *  gets a default adapter where its platform has the API, still overridable */
  generic?: boolean;
  /** never fails: a failure, the adapter missing too, counts as done (analytics) */
  silent?: boolean;
  /** the catalog's version of it: a product's own leaves it out */
  version?: number;
};

/** What a document says of the capabilities it uses (`Doc.capabilities`). The standard ones its designs invoke or draw
 *  are used anyway; `uses` names more (an event such as `push.opened`, a view only the code will draw); `own` declares
 *  the product's own capabilities, in the same shape as the catalog's. */
export type CapabilitySpec = {
  uses?: string[];
  own?: CapabilityDef[];
};

/** A capability that did not do what it was asked: read as `error` in the `catch` of an `invoke`. */
export type CapabilityError = { type: FailureKind; capability: string; message?: string };

/** what an invoke came to: its result, or how it failed; `dropped` when the host started over while it was out */
export type InvokeOutcome = { ok: true; result: unknown } | { ok: false; error: CapabilityError; dropped?: boolean };

/** How the mock library answers one capability (`Doc.mocks.capabilities`, and a scenario's `capabilities`): with
 *  this result laid over the catalog's own example, or failing this way; after `delayMs`. */
export type MockCapabilityRule = {
  result?: unknown;
  fail?: FailureKind;
  /** the failure's words, for the log and `error.message` */
  message?: string;
  delayMs?: number;
};

/** what a capability adapter is: the arguments in, the result out (a promise or not). It fails by throwing
 *  `fail(kind)` (registry.ts); anything else it throws is `failed`. */
export type CapabilityAdapter = (args: Record<string, unknown>) => unknown;

/** adapters by capability name */
export type CapabilityAdapters = Partial<Record<string, CapabilityAdapter>>;

/** What a host invokes capabilities through: the registry of an exported app, the mock library of the preview. Never
 *  rejects: every outcome is an `InvokeOutcome`. */
export interface CapabilityHost {
  invoke(name: string, args: Record<string, unknown>): Promise<InvokeOutcome>;
}

/** the most own capabilities a document declares, and the most names in `uses` */
export const CAPABILITY_LIMITS = { own: 100, uses: 100, events: 20 } as const;

/** a capability's name: up to four dotted identifiers, each starting with a small letter (`map`, `payment.pay`) */
export const CAPABILITY_NAME = /^[a-z][a-zA-Z0-9]{0,31}(\.[a-z][a-zA-Z0-9]{0,31}){0,3}$/;
