/* The runtime every exported front end runs on (the web app, the React Native app, the Taro mini-program): one object
 * holding the transport the API client is made over (with the session's tokens on it), the session, the data sources'
 * cache and the app's language, plus the calls a tap makes. Nothing here touches a platform: storage, the transport
 * and where to go on a 401 are handed in. The React layer (react.tsx) reads it through hooks. */

import type { Transport, TransportRequest } from "../api/transport";
import { problemOf, type Problem } from "../bindings/rules";
import type { EvalContext } from "../bindings/expr";
import { FormController, type CallResult, type FormFields } from "./forms";
import { SessionStore, sessionTransport, type AuthConfig, type TokenStorage } from "./session";
import { SourceCache } from "./sources";
import { Store } from "./store";

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
};

/** what a tap's call does around its answer */
export type CallOptions<T> = {
  /** changes made before the answer (an optimistic change); called with the outcome to undo them when it failed */
  optimistic?: () => () => void;
  then?: (response: T, status: number) => void;
  catch?: (error: Problem, status: number) => void;
  /** the status a 2xx answer is reported with (the client gives only the body) */
  status?: number;
};

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
  /** the app's language */
  readonly language: Store<string>;
  /** what the API client is made over: the back end with the session on it */
  readonly transport: Transport;
  /** where the app goes when a call is refused for want of a session (a 401 no refresh could mend) */
  onUnauthorized?: (request: TransportRequest) => void;

  private base: Transport;
  private returnTo: unknown;
  /** the forms by their id: what is typed in one outlives its screen (a sign-in in between), as in the preview */
  private readonly forms = new Map<string, FormController>();
  private readonly o: RuntimeOptions;

  constructor(o: RuntimeOptions) {
    this.o = o;
    this.base = o.transport;
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

  /** starts over on the same back end: no data, no session but the presumed one */
  restart(presumed = false) {
    this.returnTo = undefined;
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
   *  a 2xx answer, `catch` on anything else but a refusal that sent the app to sign in. Never rejects. */
  async call<T>(fn: () => Promise<T>, o: CallOptions<T> = {}): Promise<CallResult<T>> {
    const undo = o.optimistic?.();
    const epoch = this.epoch.get();
    let out: CallResult<T>;
    try {
      out = { ok: true, response: await fn(), status: o.status ?? 200 };
    } catch (e) {
      out = { ok: false, error: this.errorOf(e), status: errorStatus(e) ?? 0, unauthorized: this.isUnauthorized(e) };
    }
    /* a call made before the runtime started over answers into nothing */
    if (epoch !== this.epoch.get()) return out;
    if (out.ok) o.then?.(out.response, out.status);
    else {
      undo?.();
      if (!out.unauthorized) o.catch?.(out.error, out.status);
    }
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
