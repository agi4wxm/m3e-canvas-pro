/* The bindings at run time: a screen's data sources loaded through a `Transport` (lib/api/transport.ts), pages after
 * pages, calls a tap makes, the session a sign-in starts and a 401 ends, a form's submission. Plain TypeScript over
 * an immutable state the host keeps (the preview's React state, a test's variable): every change is a new state handed
 * to `set`, every call's answer lands only if no later load of the same source has started, and nothing a server or a
 * transport does (an error, a throw, a body of the wrong shape) escapes as an exception. The exported app's runtime is
 * printed from the same rules in the next export wave. */

import type { Transport, TransportFile, TransportRequest } from "../api/transport";
import { paginationOf, type ApiEndpoint, type ApiSpec } from "../api/types";
import type { DataSource, Doc, Frame, Optimistic } from "../tokens";
import { authFields, endpointOf, listOf, paramsOf, pointerField, problemOf, requestOf, tokenPlacement, type Problem } from "./contract";
import { evaluate, readKey, truthy, type EvalContext, type Scope } from "./expr";
import { appMessage } from "./messages";

export type SourceStatus = "idle" | "loading" | "ready" | "error";

/** one data source of one screen, as far as it has got */
export type SourceState = {
  status: SourceStatus;
  /** what it was last asked with, so entering the screen again with the same keeps it */
  key?: string;
  /** the last answer's body; for a paged list, its list field holds every element loaded so far */
  value?: unknown;
  /** the list it holds: every page so far, or the body itself when that is the list */
  items?: unknown[];
  error?: Problem | null;
  /** a load (the first, or again) is under way */
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** the next page's cursor, or how many to skip */
  next?: string | number | null;
  total?: number;
  /** which load is the latest: an answer to an earlier one is dropped */
  seq: number;
};

/** a form's submission as far as it has got */
export type FormRuntime = { errors: Record<string, string>; error: Problem | null; submitting: boolean; submitted: boolean; progress: number | null; response?: unknown };

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

const idleSource = (): SourceState => ({ status: "idle", loading: false, loadingMore: false, hasMore: false, seq: 0 });

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

/** the most elements a list may come to across its pages, so a runaway server cannot grow the preview without end */
export const MAX_ITEMS = 2000;

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
    const params = { ...args.params };
    if (pg && src.pageSize && params[pg.limitParam] === undefined) params[pg.limitParam] = src.pageSize;
    if (pg && o.more) {
      if (pg.style === "cursor") params[pg.cursorParam] = was.next;
      else params[pg.offsetParam] = was.items?.length ?? 0;
    }
    const seq = was.seq + 1;
    const fresh = was.key !== argKey;
    this.setSource(key, (s) => (o.more ? { ...s, seq, loadingMore: true } : { ...s, seq, key: argKey, loading: true, loadingMore: false, status: fresh || s.status === "idle" ? "loading" : s.status, ...(fresh ? { value: undefined, items: undefined, error: null, hasMore: false } : {}) }));
    const out = await this.call(src.operationId, { ...args, params });
    if ((!out.ok && out.dropped) || (this.host.get().sources[key]?.seq ?? -1) !== seq) return;
    if (!out.ok) {
      this.setSource(key, (s) => ({ ...s, status: s.value !== undefined && o.more ? s.status : s.value !== undefined && !fresh ? "ready" : "error", loading: false, loadingMore: false, error: out.problem }));
      return;
    }
    const list = listOf(api, e);
    const body = out.body;
    const page = list ? (list.field ? readKey(body, list.field) : body) : undefined;
    const pageItems = Array.isArray(page) ? page : undefined;
    /* the contract says a list comes back and none did: what the screen would show is not what was promised */
    if (list && !pageItems && !o.more) {
      this.setSource(key, (s) => ({ ...s, status: "error", loading: false, loadingMore: false, value: undefined, items: undefined, error: { status: out.status, title: appMessage("failed", this.host.ctx().lang), detail: `The answer of ${src.operationId} holds no list${list.field ? ` at "${list.field}"` : ""}.` } }));
      return;
    }
    this.setSource(key, (s) => {
      const items = pageItems ? (o.more ? [...(s.items ?? []), ...pageItems] : pageItems).slice(0, MAX_ITEMS) : undefined;
      let next: string | number | null | undefined;
      let hasMore = false;
      let total: number | undefined;
      if (pg && pageItems) {
        if (pg.style === "cursor") {
          const n = readKey(body, pg.nextField);
          next = typeof n === "string" || typeof n === "number" ? n : null;
          hasMore = next !== null && next !== "";
        } else {
          const t = readKey(body, pg.totalField);
          total = typeof t === "number" ? t : undefined;
          const limit = typeof params[pg.limitParam] === "number" ? (params[pg.limitParam] as number) : undefined;
          hasMore = total !== undefined ? (items?.length ?? 0) < total : limit !== undefined && pageItems.length >= limit;
          next = items?.length ?? 0;
        }
        if ((items?.length ?? 0) >= MAX_ITEMS) hasMore = false;
      }
      /* the body as the screen reads it: the list field with every page's elements */
      const value = list?.field && isRecord(body) && items ? { ...body, [list.field]: items } : list && !list.field && items ? items : body;
      return { ...s, status: "ready", value, items, error: null, loading: false, loadingMore: false, hasMore, next, ...(total !== undefined ? { total } : {}) };
    });
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
    const same = (x: unknown) => x === row || (isRecord(x) && isRecord(row) && x.id !== undefined && x.id === row.id);
    const ctx = this.host.ctx();
    const items = o.remove ? was.items.filter((x) => !same(x)) : was.items.map((x) => (same(x) && isRecord(x) ? { ...x, ...Object.fromEntries(Object.entries(o.patch ?? {}).map(([k, e]) => [k, evaluate(e, { ...scope, item: x }, ctx)])) } : x));
    const value = isRecord(was.value) ? Object.fromEntries(Object.entries(was.value).map(([k, v]) => [k, v === was.items ? items : v])) : Array.isArray(was.value) ? items : was.value;
    this.setSource(key, (s) => ({ ...s, items, value: isRecord(was.value) && listField(was) ? { ...was.value, [listField(was)!]: items } : value }));
    return () => this.setSource(key, (s) => ({ ...s, items: was.items, value: was.value }));
  }

  /* ---------- forms ---------- */

  formState(id: string): FormRuntime {
    return this.host.get().forms[id] ?? { errors: {}, error: null, submitting: false, submitted: false, progress: null };
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
    const errors: Record<string, string> = {};
    /* the server names what is wrong field by field; what it says of the body lands on the form's fields (a query,
       path or header parameter is no field a person typed: the form's own error says it) */
    for (const x of out.problem.errors ?? []) {
      if (x.in && x.in !== "body") continue;
      const f = pointerField(x.pointer);
      if (f && !errors[f]) errors[f] = x.detail;
    }
    this.setForm(formId, { submitting: false, errors, error: out.problem, progress: null });
    return out;
  }
}

/** the list field of a source's value, when it is an object holding the list */
const listField = (s: SourceState): string | undefined => (isRecord(s.value) ? Object.keys(s.value).find((k) => (s.value as Record<string, unknown>)[k] === s.items) : undefined);

/* ---------- what expressions read ---------- */

/** a data source as `data.<name>` reads it */
export type SourceView = {
  value: unknown;
  items: unknown[] | undefined;
  status: SourceStatus;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Problem | null;
  empty: boolean;
  ready: boolean;
  total?: number;
};

/** whether what a source holds is nothing to show */
const isEmptyValue = (v: unknown, items: unknown[] | undefined) => (items ? items.length === 0 : v === null || v === undefined || (Array.isArray(v) && !v.length));

export function sourceView(s: SourceState | undefined): SourceView {
  const x = s ?? idleSource();
  return {
    value: x.value,
    items: x.items,
    status: x.status,
    loading: x.loading,
    loadingMore: x.loadingMore,
    hasMore: x.hasMore,
    error: x.error ?? null,
    empty: x.status === "ready" && isEmptyValue(x.value, x.items),
    ready: x.status === "ready",
    ...(x.total !== undefined ? { total: x.total } : {}),
  };
}

/** a param of a screen as its declared type has it */
function typedParam(v: unknown, type: string | undefined): unknown {
  if (type === "number") return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  if (type === "boolean") return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : v;
  return v;
}

/** The params a screen reads: what it was opened with, and the example of each it was not given (a preview opened
 *  straight on a detail screen is not blank). */
export function paramsFor(frame: Pick<Frame, "params">, given: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of frame.params ?? []) {
    const v = given && Object.prototype.hasOwnProperty.call(given, p.name) ? given[p.name] : p.example;
    if (v !== undefined) out[p.name] = typedParam(v, p.type);
  }
  for (const [k, v] of Object.entries(given ?? {})) if (!(k in out)) out[k] = v;
  return out;
}

/** The scope of a screen: its data, its params, the variables by name (and id), the session, the time. */
export function screenScope(o: { frame: Frame; state: BindingState; params?: Record<string, unknown>; vars?: Record<string, unknown>; varNames?: { id: string; name: string }[]; now?: number }): Scope {
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
  };
}

/** The state a region shows for its source: loading until it has something, forbidden or an error when it failed with
 *  nothing to show, empty when it holds nothing (or `emptyWhen` says so), else its content. */
export function regionState(region: { source?: string; emptyWhen?: string }, scope: Scope, load: DataSource["load"] | undefined, ctx?: EvalContext): "ready" | "loading" | "empty" | "error" | "forbidden" {
  const v = region.source ? (readKey(scope.data, region.source) as SourceView | undefined) : undefined;
  if (!v) return "ready";
  if (v.status === "idle") return load === "demand" ? "empty" : "loading";
  if (v.status === "loading" && v.value === undefined) return "loading";
  if (v.status === "error" && v.value === undefined) {
    const st = v.error?.status ?? 0;
    return st === 401 || st === 403 ? "forbidden" : st === 404 ? "empty" : "error";
  }
  if (region.emptyWhen) return truthy(evaluate(region.emptyWhen, scope, ctx)) ? "empty" : "ready";
  return v.empty ? "empty" : "ready";
}

export type { TransportFile };
