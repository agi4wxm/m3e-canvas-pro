/* The runtime every exported front end runs on (the web app, the React Native app, the Taro mini-program): one object
 * holding the transport the API client is made over (with the session's tokens on it), the session, the data sources'
 * cache and the app's language, plus the calls and the invokes of platform capabilities a tap makes. Nothing here touches a platform: storage, the transport
 * and where to go on a 401 are handed in. The React layer (react.tsx) reads it through hooks. */

import type { Transport, TransportRequest } from "../api/transport";
import { problemOf, type Problem } from "../bindings/rules";
import type { EvalContext } from "../bindings/expr";
import { FormController, type CallResult, type FormFields } from "./forms";
import { SessionStore, sessionTransport, type AuthConfig, type TokenStorage } from "./session";
import { SourceCache } from "./sources";
import { Store } from "./store";
import type { CapabilityError, CapabilityHost, InvokeOutcome } from "../capabilities/types";

export type RuntimeOptions = {
  /** the back end: fetch, the mocks, a mini-program's request; it can be swapped later (`setTransport`) */
  transport: Transport;
  /** what the session needs of the contract (generated) */
  auth?: AuthConfig;
  /** where the tokens are kept: sessionStorage, SecureStore, Taro's storage; in memory when left out */
  storage?: TokenStorage;
  /** the storage key of the session */
  storageKey?: string;
  /** the back end counts the app as signed in without a token (the mocks' session) */
  presumed?: boolean;
  /** the app's language: zh, en, ja or ko */
  lang?: string;
  /** the currency `currency()` writes when given none (by the language otherwise) */
  currency?: string;
  /** the time now, in ms (a test pins it) */
  now?: () => number;
  /** what a tap invokes platform capabilities through (packages/capabilities' registry); `setCapabilities` changes it */
  capabilities?: CapabilityHost;
};

/** Where an answer finds the visitor (docs/交互规则.md, “迟到的回答”): `here` while they are where the tap left them,
 *  false once they have gone somewhere since (`Runtime.moved`). An answer that finds them gone still does what keeps
 *  the app up with the back end (variables, data, a snackbar) but takes them nowhere. */
export type AnswerAt = { here: boolean };

/** what a tap's invoke does around its outcome */
export type InvokeOptions = {
  then?: (result: unknown, at: AnswerAt) => void;
  catch?: (error: CapabilityError, at: AnswerAt) => void;
  /** what kind of invoke it is (the screen, the part, the capability): a newer one of the same kind answers for it */
  key?: string;
};

/** what a tap's call does around its answer */
export type CallOptions<T> = {
  /** changes made before the answer (an optimistic change); called with the outcome to undo them when it failed */
  optimistic?: () => () => void;
  then?: (response: T, status: number, at: AnswerAt) => void;
  catch?: (error: Problem, status: number, at: AnswerAt) => void;
  /** the status a 2xx answer is reported with (the client gives only the body) */
  status?: number;
  /** What kind of call it is: the screen, the part and the operation (`callKey`). A newer call of the same kind speaks
   *  for it: this one's answer, when it comes after, runs neither `then` nor `catch` and undoes nothing (the newer
   *  one's change stands on it). */
  key?: string;
};

/** the kind of a call a tap makes (`CallOptions.key`): one part's call of one operation on one screen */
export const callKey = (screen: string, part: string, operation: string) => `${screen}\u0000${part}\u0000${operation}`;

const errorStatus = (e: unknown): number | undefined => {
  const st = e && typeof e === "object" ? (e as { status?: unknown }).status : undefined;
  return typeof st === "number" ? st : undefined;
};

export class Runtime {
  /** the session: its tokens, whether signed in */
  readonly session: SessionStore;
  /** the data sources, by operation and arguments */
  readonly sources: SourceCache;
  /** how many times the runtime has started over (another back end, a new mock session): screens load again */
  readonly epoch = new Store(0);
  /** how many times the visitor has gone somewhere (`moved`): what an answer compares with where its tap left them */
  readonly moves = new Store(0);
  /** the app's language */
  readonly language: Store<string>;
  /** what the API client is made over: the back end with the session on it */
  readonly transport: Transport;
  /** where the app goes when a call is refused for want of a session (a 401 no refresh could mend) */
  onUnauthorized?: (request: TransportRequest) => void;

  private base: Transport;
  private capabilities?: CapabilityHost;
  private returnTo: unknown;
  /** the forms by their id: what is typed in one outlives its screen (a sign-in in between), as in the preview */
  private readonly forms = new Map<string, FormController>();
  private readonly o: RuntimeOptions;
  /** the latest call (or invoke) of each kind, by `CallOptions.key` */
  private readonly latest = new Map<string, number>();

  constructor(o: RuntimeOptions) {
    this.o = o;
    this.base = o.transport;
    this.capabilities = o.capabilities;
    this.language = new Store(o.lang ?? "en");
    this.session = new SessionStore({ storage: o.storage, key: o.storageKey, presumed: o.presumed });
    this.sources = new SourceCache({ lang: () => this.lang, errorOf: (e) => this.errorOf(e) });
    this.transport = sessionTransport({ inner: () => this.base, session: this.session, auth: o.auth, onUnauthorized: (r) => this.onUnauthorized?.(r) });
  }

  get lang(): string {
    return this.language.get();
  }

  setLang(lang: string) {
    this.language.set(lang);
  }

  /** Where the app goes when a call is refused for want of a session, from now on (what `onUnauthorized` holds); what
   *  it gives back stops it, for an effect's cleanup. */
  whenUnauthorized(go: (request: TransportRequest) => void): () => void {
    this.onUnauthorized = go;
    return () => {
      if (this.onUnauthorized === go) this.onUnauthorized = undefined;
    };
  }

  /** what expressions are evaluated with: the language, the time, the currency */
  ctx(): EvalContext {
    return { lang: this.lang, now: (this.o.now ?? Date.now)(), ...(this.o.currency ? { currency: this.o.currency } : {}) };
  }

  /** the operation that signs in, and those that sign out and refresh */
  get auth(): AuthConfig | undefined {
    return this.o.auth;
  }

  /** Another back end from now on (a scenario of the mocks, a transport of the custom code's): the data and the session
   *  start over, signed in without a token as `presumed` says, and every screen loads again. */
  setTransport(next: Transport, o: { presumed?: boolean } = {}) {
    this.base = next;
    this.restart(o.presumed ?? false);
  }

  /** The visitor has gone somewhere: a screen opened, gone back from, laid over or closed, picked, swiped to. Each
   *  navigation of the app tells the runtime, so an answer knows whether the visitor is still where its tap left them. */
  moved() {
    this.moves.set((n) => n + 1);
  }

  /** a call or an invoke of a kind is made: it is now the one that speaks for that kind */
  private ask(key: string | undefined): () => boolean {
    if (key === undefined) return () => true;
    const n = (this.latest.get(key) ?? 0) + 1;
    this.latest.set(key, n);
    return () => this.latest.get(key) === n;
  }

  /** Where the visitor is, from the end of the tap that makes a call: what the tap does after it (going where it goes)
   *  is part of the tap, and no move away. What it gives back says, when the answer comes, whether they are still
   *  there. */
  private place(): () => AnswerAt {
    let at = this.moves.get();
    void Promise.resolve().then(() => {
      at = this.moves.get();
    });
    return () => ({ here: this.moves.get() === at });
  }

  /** starts over on the same back end: no data, no session but the presumed one */
  restart(presumed = false) {
    this.returnTo = undefined;
    this.latest.clear();
    this.forms.clear();
    this.sources.clear();
    this.session.reset(presumed);
    this.epoch.set((n) => n + 1);
  }

  /** The problem an error is: an answer outside 2xx (the client's ApiError: its status and body) as its problem
   *  details, anything thrown on the way (no network) as status 0. */
  errorOf(e: unknown): Problem {
    const status = errorStatus(e);
    if (status !== undefined) return problemOf(status, (e as { body?: unknown }).body, this.lang);
    const detail = e instanceof Error && e.message ? e.message.slice(0, 500) : undefined;
    return { ...problemOf(0, undefined, this.lang), ...(detail ? { detail } : {}) };
  }

  /** whether an error is a refusal that has sent the app to sign in (a 401 of any call but the sign-in itself) */
  isUnauthorized(e: unknown): boolean {
    const op = e && typeof e === "object" ? (e as { operationId?: unknown }).operationId : undefined;
    return errorStatus(e) === 401 && (op === undefined || op !== this.o.auth?.login);
  }

  /** A call a tap makes: its answer, or the problem it is. An optimistic change is undone when it fails; `then` runs on
   *  a 2xx answer, `catch` on anything else but a refusal that sent the app to sign in, each told whether the visitor is
   *  still where the tap left them (`AnswerAt`). An answer that comes after the runtime started over, or after a newer
   *  call of the same kind (`key`), runs neither and undoes nothing, and comes back `dropped`. Never rejects. */
  async call<T>(fn: () => Promise<T>, o: CallOptions<T> = {}): Promise<CallResult<T>> {
    const undo = o.optimistic?.();
    const epoch = this.epoch.get();
    const latest = this.ask(o.key);
    const at = this.place();
    let out: CallResult<T>;
    try {
      out = { ok: true, response: await fn(), status: o.status ?? 200 };
    } catch (e) {
      out = { ok: false, error: this.errorOf(e), status: errorStatus(e) ?? 0, unauthorized: this.isUnauthorized(e) };
    }
    /* a call made before the runtime started over, or one a newer call of its kind speaks for, answers into nothing */
    if (epoch !== this.epoch.get() || !latest()) return { ok: false, error: out.ok ? this.errorOf(undefined) : out.error, status: out.status, unauthorized: false, dropped: true };
    if (out.ok) o.then?.(out.response, out.status, at());
    else {
      undo?.();
      if (!out.unauthorized) o.catch?.(out.error, out.status, at());
    }
    return out;
  }

  /** what invokes go through from now on: the app's registry of capabilities, the mocks' in development */
  setCapabilities(next: CapabilityHost) {
    this.capabilities = next;
  }

  /** An invoke a tap makes of a platform capability (lib/capabilities): its result, or how it failed. `then` runs with
   *  the result, `catch` with the error (`error.type`: cancelled, failed, unavailable, not-implemented, denied,
   *  timeout). With no registry every capability is `not-implemented`. Never rejects; one made before the runtime
   *  started over, or one a newer invoke of its kind (`key`) speaks for, answers into nothing (and comes back
   *  `dropped`). */
  async invoke(name: string, given: Record<string, unknown>, o: InvokeOptions = {}): Promise<InvokeOutcome> {
    const epoch = this.epoch.get();
    const latest = this.ask(o.key);
    const at = this.place();
    const args = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));
    let out: InvokeOutcome;
    try {
      out = this.capabilities ? await this.capabilities.invoke(name, args) : { ok: false, error: { type: "not-implemented", capability: name } };
    } catch (e) {
      out = { ok: false, error: { type: "failed", capability: name, ...(e instanceof Error && e.message ? { message: e.message.slice(0, 200) } : {}) } };
    }
    if (epoch !== this.epoch.get() || !latest() || (!out.ok && out.dropped)) return out.ok ? { ok: false, error: { type: "failed", capability: name }, dropped: true } : { ...out, dropped: true };
    if (out.ok) o.then?.(out.result, at());
    else o.catch?.(out.error, at());
    return out;
  }

  /** ends the session; the contract's sign-out operation is told, when it has one, and not waited for */
  signOut() {
    const op = this.o.auth?.logout;
    if (op && this.session.signedIn) void this.transport.request({ operationId: op.operationId, method: op.method, path: op.path }).catch(() => {});
    this.session.signOut();
  }

  /** The form of this id, made the first time it is asked for: what is entered in it stays while the app runs (the
   *  screen it is on can go and come back) until the runtime starts over. */
  form(id: string, fields: FormFields, initial?: Record<string, unknown>): FormController {
    let f = this.forms.get(id);
    if (!f) {
      f = new FormController(fields, { lang: () => this.lang, call: (fn) => this.call(fn), initial });
      this.forms.set(id, f);
    }
    return f;
  }

  /** where to go once signed in (a screen a guard or a 401 left), kept for the sign-in screen */
  rememberReturn(to: unknown) {
    this.returnTo = to;
  }

  /** where to go once signed in, if anywhere; asked once */
  takeReturn<T = unknown>(): T | undefined {
    const to = this.returnTo as T | undefined;
    this.returnTo = undefined;
    return to;
  }
}

/** the runtime of an app (see `Runtime`) */
export const createRuntime = (o: RuntimeOptions) => new Runtime(o);
