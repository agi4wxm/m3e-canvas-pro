/* The bindings at run time: a screen's data sources loaded through a `Transport` (lib/api/transport.ts), pages after
 * pages, calls a tap makes, the session a sign-in starts and a 401 ends, a form's submission. Plain TypeScript over
 * an immutable state the host keeps (the preview's React state, a test's variable): every change is a new state handed
 * to `set`, every call's answer lands only if no later load of the same source has started, and nothing a server or a
 * transport does (an error, a throw, a body of the wrong shape) escapes as an exception. The exported app's runtime is
 * printed from the same rules in the next export wave. */

import type { Transport, TransportFile, TransportRequest } from "../api/transport";
import { paginationOf, type ApiEndpoint, type ApiSpec } from "../api/types";
import type { Collection, DataSource, Doc, Frame, Optimistic } from "../tokens";
import { authFields, endpointOf, listOf, paramsOf, problemFieldErrors, problemOf, requestOf, tokenPlacement, type Problem } from "./contract";
import { evaluate, truthy, type EvalContext, type Scope } from "./expr";
import { appMessage } from "./messages";
import { idleForm, type FormRun } from "./form";
import { idleSource, loadFailed, loadSettled, loadStarted, missingList, optimisticChange, pageParams, regionOf, screenParams, sourceView, type SourceState, type SourceView } from "./sources";

export { MAX_ITEMS, sourceView, type SourceState, type SourceStatus, type SourceView } from "./sources";

/** a form's submission as far as it has got */
export type FormRuntime = FormRun;

/** the session a sign-in started */
export type Session = { token: string; refreshToken?: string; user?: unknown };

export type BindingState = {
  /** by `frameId/name` */
  sources: Record<string, SourceState>;
  /** by the form's group id */
  forms: Record<string, FormRuntime>;
  session: Session | null;
  /** the back end counts the app as signed in without a token: the mock library's session starts so unless its
   *  scenario says otherwise (`auth.signedIn` reads true); a sign-out or a 401 ends it */
  presumed?: boolean;
};

export const emptyBindings = (presumed = false): BindingState => ({ sources: {}, forms: {}, session: null, ...(presumed ? { presumed: true } : {}) });

/** the state with no session, presumed or started */
function signedOut(s: BindingState): BindingState {
  const { presumed: _presumed, ...rest } = s;
  return { ...rest, session: null };
}

export const sourceKey = (frameId: string, name: string) => `${frameId}/${name}`;

/** what an answer to a call came to */
/** what an answer to a call came to; `dropped` when the state was started over while it was out (`reset`) */
export type CallOutcome = { ok: true; status: number; body: unknown } | { ok: false; status: number; problem: Problem; unauthorized: boolean; dropped?: boolean };

/** how a call is given its parameters and body: values already read */
export type CallArgs = { params?: Record<string, unknown>; body?: unknown };

export type Host = {
  doc: () => Pick<Doc, "api" | "frames">;
  transport: Transport;
  get: () => BindingState;
  set: (next: BindingState) => void;
  /** the app's language and clock, for the words of errors and the helpers */
  ctx: () => EvalContext;
  /** a call was refused for want of a session (a 401 no refresh could mend): the app goes to sign in */
  unauthorized?: () => void;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The engine: what the host calls when a screen is entered, a tap calls, a form is submitted. */
export class BindingEngine {
  constructor(readonly host: Host) {}

  /** how many times the state was started over: an answer to a call made before the last time is dropped */
  private epoch = 0;

  /** Starts the state over (another scenario of the mock library, its session begun again): no data, no forms, no
   *  session but the one given, and what calls are still out answer into nothing. */
  reset(next: BindingState = emptyBindings()) {
    this.epoch++;
    this.host.set(next);
  }

  private patch(fn: (s: BindingState) => BindingState) {
    this.host.set(fn(this.host.get()));
  }

  private setSource(key: string, fn: (s: SourceState) => SourceState) {
    this.patch((s) => ({ ...s, sources: { ...s.sources, [key]: fn(s.sources[key] ?? idleSource()) } }));
  }

  /* ---------- calls ---------- */

  /** The request a call to an endpoint is: its path filled in, its query and headers, its body, and the session's
   *  token where the endpoint needs one. */
  requestFor(api: ApiSpec, e: ApiEndpoint, args: CallArgs): TransportRequest {
    const given = args.params ?? {};
    const query: Record<string, string | number | boolean> = {};
    const headers: Record<string, string> = {};
    let path = e.path;
    for (const p of paramsOf(api, e)) {
      const v = given[p.name];
      if (p.in === "path") {
        path = path.split(`{${p.name}}`).join(encodeURIComponent(v === undefined || v === null ? "" : String(v)));
        continue;
      }
      if (v === undefined || v === null || v === "") continue;
      if (p.in === "query") query[p.name] = typeof v === "number" || typeof v === "boolean" ? v : String(v);
      else headers[p.name] = String(v);
    }
    const media = requestOf(api, e)?.type;
    if (args.body !== undefined && media && media !== "application/json") headers["content-type"] = media;
    const session = this.host.get().session;
    const place = session ? tokenPlacement(api, e) : null;
    if (session && place?.header) headers[place.header] = `${place.prefix ?? ""}${session.token}`;
    if (session && place?.query) query[place.query] = session.token;
    return {
      operationId: e.operationId,
      method: e.method.toUpperCase() as TransportRequest["method"],
      path,
      ...(Object.keys(query).length ? { query } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(args.body !== undefined ? { body: args.body } : {}),
    };
  }

  /** One call through the transport, whatever happens to it: a 401 refreshes the token once where the contract can,
   *  and otherwise ends the session; a sign-in keeps the token; a sign-out forgets it. */
  async call(operationId: string, args: CallArgs, retried = false): Promise<CallOutcome> {
    const lang = this.host.ctx().lang;
    const api = this.host.doc().api ?? {};
    const e = endpointOf(api, operationId);
    if (!e) return { ok: false, status: 0, problem: { status: 0, title: `No endpoint ${operationId}` }, unauthorized: false };
    let status = 0;
    let body: unknown;
    let thrown: string | undefined;
    const epoch = this.epoch;
    try {
      const res = await this.host.transport.request(this.requestFor(api, e, args));
      status = typeof res?.status === "number" ? res.status : 0;
      body = res?.body;
    } catch (err) {
      thrown = err instanceof Error ? err.message.slice(0, 500) : "";
    }
    if (epoch !== this.epoch) return { ok: false, status, problem: problemOf(status, undefined, lang), unauthorized: false, dropped: true };
    if (thrown !== undefined) return { ok: false, status: 0, problem: { ...problemOf(0, undefined, lang), detail: thrown || undefined }, unauthorized: false };
    const auth = api.auth;
    if (status >= 200 && status < 300) {
      if (auth?.login === operationId) this.signedIn(api, body);
      if (auth?.logout === operationId) this.patch(signedOut);
      if (auth?.refresh === operationId) this.refreshed(api, body);
      return { ok: true, status, body };
    }
    if (status === 401 && !retried && auth?.login !== operationId) {
      if (await this.tryRefresh(api)) return this.call(operationId, args, true);
    }
    const unauthorized = status === 401 && auth?.login !== operationId;
    if (unauthorized) {
      this.patch(signedOut);
      this.host.unauthorized?.();
    }
    return { ok: false, status, problem: problemOf(status, body, lang), unauthorized };
  }

  /** a sign-in's answer kept as the session: its token, its refresh token, and what else it says (the user) */
  private signedIn(api: ApiSpec, body: unknown) {
    const f = authFields(api.auth);
    const token = isRecord(body) ? body[f.token] : undefined;
    if (typeof token !== "string" || !token) return;
    const refresh = isRecord(body) ? body[f.refreshToken] : undefined;
    const user = isRecord(body) ? (isRecord(body.user) ? body.user : Object.fromEntries(Object.entries(body).filter(([k]) => k !== f.token && k !== f.refreshToken))) : undefined;
    this.patch((s) => ({ ...s, session: { token, ...(typeof refresh === "string" ? { refreshToken: refresh } : {}), ...(user !== undefined ? { user } : {}) } }));
  }

  private refreshed(api: ApiSpec, body: unknown) {
    const f = authFields(api.auth);
    const token = isRecord(body) ? body[f.token] : undefined;
    const refresh = isRecord(body) ? body[f.refreshToken] : undefined;
    const was = this.host.get().session;
    if (typeof token === "string" && token && was) this.patch((s) => ({ ...s, session: { ...was, token, ...(typeof refresh === "string" ? { refreshToken: refresh } : {}) } }));
  }

  /** trades the refresh token for a new access token, once; whether it worked */
  private async tryRefresh(api: ApiSpec): Promise<boolean> {
    const was = this.host.get().session;
    const op = api.auth?.refresh;
    if (!was?.refreshToken || !op || !endpointOf(api, op)) return false;
    const f = authFields(api.auth);
    const out = await this.call(op, { body: { [f.refreshToken]: was.refreshToken } }, true);
    return out.ok && this.host.get().session?.token !== was.token;
  }

  /** ends the session; the API's logout endpoint is told, when it has one, and its answer not waited for */
  signOut() {
    const api = this.host.doc().api ?? {};
    const op = api.auth?.logout;
    const was = this.host.get();
    if (op && endpointOf(api, op) && (was.session || was.presumed)) void this.call(op, {});
    this.patch(signedOut);
  }

  /* ---------- data sources ---------- */

  /** what a source is asked with: its params read in the scope, and its body */
  argsOf(src: DataSource, scope: Scope): CallArgs {
    const ctx = this.host.ctx();
    const params = Object.fromEntries(Object.entries(src.params ?? {}).map(([k, x]) => [k, evaluate(x, scope, ctx)]));
    return { params, ...(src.body ? { body: evaluate(src.body, scope, ctx) } : {}) };
  }

  /** Loads a source of a screen: afresh, the next page (`more`), or not at all when it holds what the same arguments
   *  gave and `force` is not asked. Resolves once it has settled. */
  async load(frame: Pick<Frame, "id">, src: DataSource, scope: Scope, o: { more?: boolean; force?: boolean } = {}): Promise<void> {
    const key = sourceKey(frame.id, src.name);
    const api = this.host.doc().api ?? {};
    const e = endpointOf(api, src.operationId);
    const args = this.argsOf(src, scope);
    const argKey = JSON.stringify([src.operationId, args.params ?? {}, args.body ?? null]);
    const was = this.host.get().sources[key] ?? idleSource();
    if (o.more) {
      if (!was.hasMore || was.loadingMore || was.loading || was.key !== argKey) return;
    } else if (!o.force && was.key === argKey && (was.status === "ready" || was.loading)) return;
    if (!e) {
      this.setSource(key, (s) => ({ ...s, status: "error", key: argKey, loading: false, error: { status: 0, title: `No endpoint ${src.operationId}` } }));
      return;
    }
    const pg = e.pagination ? paginationOf(e.pagination) : undefined;
    const params = { ...args.params, ...pageParams(pg, { more: o.more, was, pageSize: src.pageSize, params: args.params ?? {} }) };
    const seq = was.seq + 1;
    const fresh = was.key !== argKey;
    this.setSource(key, (s) => loadStarted(s, { seq, more: o.more, key: argKey, fresh }));
    const out = await this.call(src.operationId, { ...args, params });
    if ((!out.ok && out.dropped) || (this.host.get().sources[key]?.seq ?? -1) !== seq) return;
    if (!out.ok) {
      this.setSource(key, (s) => loadFailed(s, out.problem, { more: o.more, fresh }));
      return;
    }
    const list = listOf(api, e);
    /* the contract says a list comes back and none did: what the screen would show is not what was promised */
    const missing = missingList(list, out.body, { more: o.more, operation: src.operationId, status: out.status, title: appMessage("failed", this.host.ctx().lang) });
    if (missing) {
      this.setSource(key, (s) => ({ ...s, status: "error", loading: false, loadingMore: false, value: undefined, items: undefined, error: missing }));
      return;
    }
    const limit = pg && typeof params[pg.limitParam] === "number" ? (params[pg.limitParam] as number) : undefined;
    this.setSource(key, (s) => loadSettled(s, out.body, { list, paging: pg, more: o.more, limit }));
  }

  /** The sources of a screen that load as it is entered. One that holds what the same arguments gave is loaded again
   *  behind what it shows (a list come back to after a product was added shows it), and one already loading is left to
   *  finish. */
  enter(frame: Frame, scope: Scope): Promise<void[]> {
    return Promise.all(
      (frame.data ?? [])
        .filter((d) => (d.load ?? "enter") === "enter")
        .map((d) => {
          const was = this.host.get().sources[sourceKey(frame.id, d.name)];
          return this.load(frame, d, scope, { force: was?.status === "ready" && !was.loading });
        }),
    );
  }

  /* ---------- optimistic changes ---------- */

  /** Changes a source's list before a call answers: the row given taken out, or fields of it set. Returns what puts it
   *  back, for when the call fails. */
  optimistic(frameId: string, o: Optimistic, row: unknown, scope: Scope): () => void {
    const key = sourceKey(frameId, o.source);
    const was = this.host.get().sources[key];
    if (!was?.items || row === undefined) return () => {};
    const ctx = this.host.ctx();
    const changed = optimisticChange(was, row, o.remove ? { remove: true } : { patch: (x) => Object.fromEntries(Object.entries(o.patch ?? {}).map(([k, e]) => [k, evaluate(e, { ...scope, item: x }, ctx)])) });
    this.setSource(key, (s) => ({ ...s, items: changed.items, value: changed.value }));
    return () => this.setSource(key, (s) => ({ ...s, items: was.items, value: was.value }));
  }

  /* ---------- forms ---------- */

  formState(id: string): FormRuntime {
    return this.host.get().forms[id] ?? idleForm();
  }

  setForm(id: string, patch: Partial<FormRuntime>) {
    this.patch((s) => ({ ...s, forms: { ...s.forms, [id]: { ...this.formState(id), ...patch } } }));
  }

  /** Submits a form's body to its endpoint: the fields' errors the answer names (`errors[].pointer`) put on them, the
   *  form busy meanwhile, and a file's upload counted up while it goes. */
  async submit(formId: string, operationId: string, args: CallArgs, o: { files?: boolean; tick?: (fn: () => void) => () => void } = {}): Promise<CallOutcome> {
    if (this.formState(formId).submitting) return { ok: false, status: 0, problem: { status: 0, title: "busy" }, unauthorized: false };
    this.setForm(formId, { submitting: true, submitted: true, error: null, progress: o.files ? 0 : null });
    const stop = o.files && o.tick ? o.tick(() => this.setForm(formId, { progress: Math.min(95, (this.formState(formId).progress ?? 0) + 7) })) : () => {};
    const out = await this.call(operationId, args);
    stop();
    if (!out.ok && out.dropped) return out;
    if (out.ok) {
      this.setForm(formId, { submitting: false, errors: {}, error: null, progress: o.files ? 100 : null, response: out.body });
      return out;
    }
    /* the server names what is wrong field by field; what it says of the body lands on the form's fields (a query,
       path or header parameter is no field a person typed: the form's own error says it) */
    this.setForm(formId, { submitting: false, errors: problemFieldErrors(out.problem), error: out.problem, progress: null });
    return out;
  }
}

/* ---------- what expressions read ---------- */

/** The params a screen reads: what it was opened with, and the example of each it was not given (a preview opened
 *  straight on a detail screen is not blank). */
export const paramsFor = (frame: Pick<Frame, "params">, given: Record<string, unknown> | undefined): Record<string, unknown> => screenParams(frame.params, given);

/** The scope of a screen: its data, its params, the variables by name (and id), the session, the time. */
export function screenScope(o: { frame: Frame; state: BindingState; params?: Record<string, unknown>; vars?: Record<string, unknown>; varNames?: { id: string; name: string }[]; now?: number; collections?: Collection[] }): Scope {
  const data: Record<string, SourceView> = {};
  for (const d of o.frame.data ?? []) data[d.name] = sourceView(o.state.sources[sourceKey(o.frame.id, d.name)]);
  const vars: Record<string, unknown> = { ...o.vars };
  for (const v of o.varNames ?? []) if (v.name && o.vars && v.id in o.vars) vars[v.name] = o.vars[v.id];
  const session = o.state.session;
  return {
    data,
    params: paramsFor(o.frame, o.params),
    vars,
    auth: { signedIn: !!session || !!o.state.presumed, user: session?.user ?? null },
    now: new Date(o.now ?? Date.now()).toISOString(),
    /* the document's data sets as lists of records, by name: what a table or a list can be bound to */
    ...(o.collections?.length ? { collections: Object.fromEntries(o.collections.map((c) => [c.name, c.rows.map((r) => Object.fromEntries(c.fields.map((f, i) => [f, r[i] ?? ""])))])) } : {}),
  };
}

/** The state a region shows for its source: loading until it has something, forbidden or an error when it failed with
 *  nothing to show, empty when it holds nothing (or `emptyWhen` says so), else its content (sources.ts `regionOf`). */
export function regionState(region: { source?: string; emptyWhen?: string }, scope: Scope, load: DataSource["load"] | undefined, ctx?: EvalContext): "ready" | "loading" | "empty" | "error" | "forbidden" {
  const data = scope.data && typeof scope.data === "object" ? (scope.data as Record<string, SourceView | undefined>) : {};
  const v = region.source && Object.prototype.hasOwnProperty.call(data, region.source) ? data[region.source] : undefined;
  const emptyWhen = region.emptyWhen;
  return regionOf(v, { load, ...(emptyWhen ? { emptyWhen: () => truthy(evaluate(emptyWhen, scope, ctx)) } : {}) });
}

export type { TransportFile };
