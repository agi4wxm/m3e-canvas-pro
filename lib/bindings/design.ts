/* The one data engine (lib/app's Runtime: its data sources, forms, session and calls) read straight from a design
 * document, for the editor's own hosts of it: the preview (components/preview/host.ts) and the headless preview the
 * agent's screenshots and the evals draw (lib/bindings/headless.ts). An exported app prints these same readings into its
 * screens (lib/export: a source's key and spec, a form's rules, the session's AuthConfig, its calls through the typed
 * client); here they are made from the document as it is, so the preview and every export run one engine
 * (docs/交接.md 4.1, item 9). It lives with the bindings, not in lib/app, because it reads the document: lib/app is
 * copied into every product as it is (packages/app-runtime), and a product carries no document.
 *
 * What stays the preview's own is around this, not in it: the mock library's answers, its scenarios and its request
 * log (the transport handed to the Runtime), the capabilities' mocks, and a stand-in for an upload's progress where
 * the transport cannot say (`tick`). */

import type { AbortSignalLike, Transport, TransportRequest, TransportResponse } from "../api/transport";
import { authFields, paginationOf, type ApiEndpoint, type ApiSpec } from "../api/types";
import { endpointOf, listOf, paramsOf, requestOf, tokenPlacement } from "./contract";
import { evaluate, type EvalContext, type Scope } from "./expr";
import type { FormView } from "./form";
import { screenParams, sourceView, type SourceState, type SourceView } from "./sources";
import { formEntries, type FormInputs } from "./view";
import type { Collection, DataSource, Doc, Frame, Subscription } from "../tokens";
import { channelView, isoOf, messageAction, type ChannelEvent, type ChannelView } from "./channels";
import { channelSpecFor, type ChannelDef, type ChannelSpec } from "../app/channels";
import { Bindings } from "../app/scope";
import type { Action } from "../actions/model";
import type { FieldRule } from "./rules";
import type { CallResult, FormController, FormFields, SendInit } from "../app/forms";
import type { AuthConfig } from "../app/session";
import { sourceKey, type SourceSpec } from "../app/sources";
import type { Runtime } from "../app/runtime";

/* ---------- the contract, as an exported app's generated modules have it ---------- */

/** What the session needs of a contract (lib/export/targets/webSources.ts `authSource` prints the same): which
 *  operations sign in, refresh and sign out, the token fields, and how each operation's token rides. */
export function authConfigOf(api: ApiSpec | undefined): AuthConfig {
  const auth = api?.auth;
  const f = authFields(auth);
  const opOf = (id: string | undefined) => {
    const e = id ? endpointOf(api, id) : undefined;
    return e ? { operationId: e.operationId, method: e.method.toUpperCase() as TransportRequest["method"], path: e.path } : undefined;
  };
  const refresh = opOf(auth?.refresh);
  const logout = opOf(auth?.logout);
  return {
    ...(auth?.login && endpointOf(api, auth.login) ? { login: auth.login } : {}),
    ...(refresh ? { refresh } : {}),
    ...(logout ? { logout } : {}),
    ...(f.token !== "accessToken" ? { tokenField: f.token } : {}),
    ...(f.refreshToken !== "refreshToken" ? { refreshTokenField: f.refreshToken } : {}),
    security: Object.fromEntries((api?.endpoints ?? []).map((e) => [e.operationId, tokenPlacement(api!, e)])),
  };
}

/** The session's needs of the contract as it is now (`api()` asked each time): what a preview hands its runtime, so a
 *  contract edited while it runs is the one its session goes by. */
export function liveAuth(api: () => ApiSpec | undefined): AuthConfig {
  let made: { api: ApiSpec | undefined; auth: AuthConfig } | undefined;
  const now = (): AuthConfig => {
    const a = api();
    if (!made || made.api !== a) made = { api: a, auth: authConfigOf(a) };
    return made.auth;
  };
  return {
    get login() {
      return now().login;
    },
    get refresh() {
      return now().refresh;
    },
    get logout() {
      return now().logout;
    },
    get tokenField() {
      return now().tokenField;
    },
    get refreshTokenField() {
      return now().refreshTokenField;
    },
    get security() {
      return now().security;
    },
  };
}

/** An answer outside 2xx, as the generated client throws it: what the runtime reads a problem (`errorOf`) and a lost
 *  session (`isUnauthorized`) from. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly operationId?: string,
  ) {
    super(`${operationId ?? "the call"} failed with status ${status}`);
  }
}

/** a call's parameters (path, query, header: values already read) and its body */
export type DesignArgs = { params?: Record<string, unknown>; body?: unknown };

/** The request a call to an endpoint is: its path filled in, its query and headers, its body. The session's token is
 *  the runtime's to put on it (lib/app/session.ts `sessionTransport`), as on an exported app's calls. */
export function requestFor(api: ApiSpec, e: ApiEndpoint, args: DesignArgs): TransportRequest {
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
  return {
    operationId: e.operationId,
    method: e.method.toUpperCase() as TransportRequest["method"],
    path,
    ...(Object.keys(query).length ? { query } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(args.body !== undefined ? { body: args.body } : {}),
  };
}

/** A transport over whichever the host has now (`current`), whose answers are always answers: one that is missing or
 *  has no status is "no answer" (status 0), as a broken back end reads in the preview. Its realtime channels and its
 *  clock are those of the one it is over now, when that has them. */
export function steadyTransport(current: () => Transport | null | undefined): Transport {
  return {
    async request(r): Promise<TransportResponse> {
      const t = current();
      const res = t ? await t.request(r) : undefined;
      return res && typeof res === "object" && typeof res.status === "number" ? res : { status: 0, headers: {}, body: res && typeof res === "object" ? (res as { body?: unknown }).body : undefined };
    },
    connect(address, onMessage, o) {
      const t = current();
      if (!t || typeof t.connect !== "function") {
        o?.onStatus?.("closed");
        return { send: () => {}, close: () => {} };
      }
      return t.connect(address, onMessage, o);
    },
    now() {
      const t = current();
      const n = t && typeof t.now === "function" ? t.now() : NaN;
      return Number.isFinite(n) ? n : Date.now();
    },
  };
}

/** A subscription as the runtime opens it (lib/app/channels.ts `channelSpecFor`), read in a screen's scope: its
 *  channel's address filled in with its params (each an expression; one it does not give is the screen's param of
 *  that name), keyed by the channel and that address, as an exported screen keys it. Undefined for a channel the
 *  contract lacks. */
export function channelSpecOf(api: ApiSpec, sub: Subscription, scope: Scope, ctx: EvalContext): ChannelSpec | undefined {
  const def = channelDefOf(api, sub);
  return def ? channelSpecFor(def, new Bindings(scope, ctx)) : undefined;
}

/** a subscription as a printed screen holds it (lib/app/channels.ts `ChannelDef`), for a channel the contract has */
export function channelDefOf(api: ApiSpec, sub: Subscription): ChannelDef | undefined {
  const c = (api.channels ?? []).find((x) => x.id === sub.channel);
  if (!c) return undefined;
  return { name: sub.name, channel: c.id, address: c.address, ...(sub.params && Object.keys(sub.params).length ? { params: sub.params } : {}), ...(sub.messages?.length ? { messages: sub.messages } : {}), ...(sub.keep !== undefined ? { keep: sub.keep } : {}), ...(sub.newest ? { newest: true } : {}) };
}

/** a value a call's parameter takes: words, a number or yes/no (lib/app/scope.ts `Bindings.arg`); anything else is left out */
const argOf = (v: unknown): string | number | boolean | undefined => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined);

/** where on a screen the data is read: the screen, what it was opened with, the variables as it shows them */
export type ScreenAt = {
  frame: Frame;
  params?: Record<string, unknown>;
  /** the variables by id */
  vars?: Record<string, unknown>;
  varNames?: { id: string; name: string }[];
  /** the time, in ms: what `now` reads */
  now?: number;
};

/** a form of a screen, as the design has it: its group, the groups of the screen (which of them are in it: `owner`),
 *  and what the visitor gave its inputs */
export type FormAt = Omit<FormInputs, "doc">;

/** The runtime read from a design document (see the top of this file). One for a preview session, over its Runtime. */
export class DesignRuntime {
  /** the controllers handed out this session of the runtime, by form id, with what they hear */
  private forms = new Map<string, { c: FormController; off: () => void }>();
  private formsEpoch: number;
  private listeners = new Set<() => void>();
  private seen = 0;
  /** the form being brought up to what its inputs hold: what that changes is drawn by the render doing it */
  private quiet = false;

  constructor(
    readonly runtime: Runtime,
    private readonly doc: () => Pick<Doc, "api" | "collections"> & { frames?: Frame[] },
    private readonly o: { tick?: (fn: () => void) => () => void } = {},
  ) {
    this.formsEpoch = runtime.epoch.get();
    const bump = () => this.bump();
    runtime.sources.store.subscribe(bump);
    runtime.channels.store.subscribe(bump);
    runtime.session.subscribe(bump);
    runtime.epoch.subscribe(bump);
  }

  private bump() {
    this.seen++;
    for (const fn of this.listeners) fn();
  }

  /** hears of every change of what the screens read: data, the session, the forms, a start over */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** a number that changes whenever what the screens read does (for useSyncExternalStore) */
  version = (): number => this.seen;

  private get api(): ApiSpec {
    return this.doc().api ?? {};
  }

  /** what expressions read a source's arguments with: the app's language, the time left to the evaluator, so a key does
   *  not change every moment */
  private argCtx(): EvalContext {
    return { lang: this.runtime.lang };
  }

  /* ---------- calls ---------- */

  /** one call through the runtime's transport (the session on it): the answer's status and body, or an ApiError */
  private async send(e: ApiEndpoint, args: DesignArgs, init: { signal?: AbortSignalLike } & SendInit = {}): Promise<{ status: number; body: unknown }> {
    const req = requestFor(this.api, e, args);
    const res = await this.runtime.transport.request({ ...req, ...(init.signal ? { signal: init.signal } : {}), ...(init.onUploadProgress ? { onUploadProgress: init.onUploadProgress } : {}) });
    if (res.status < 200 || res.status > 299) throw new ApiError(res.status, res.body, e.operationId);
    return { status: res.status, body: res.body };
  }

  /** A call a tap makes, through the runtime (`Runtime.call`): its answer with the status the back end gave, the
   *  problem it is, or `dropped` when the runtime started over while it was out. Never rejects. */
  async call(operationId: string, args: DesignArgs): Promise<CallResult> {
    const e = endpointOf(this.api, operationId);
    if (!e) return { ok: false, status: 0, error: { status: 0, title: `No endpoint ${operationId}` }, unauthorized: false };
    let status = 200;
    const out = await this.runtime.call(async () => {
      const r = await this.send(e, args);
      status = r.status;
      return r.body;
    });
    return out.ok ? { ...out, status } : out;
  }

  /** ends the session: the contract's sign-out operation is told, when it has one */
  signOut() {
    this.runtime.signOut();
  }

  get signedIn(): boolean {
    return this.runtime.session.signedIn;
  }

  /* ---------- data sources ---------- */

  /** what a source is asked with, read in the scope given: its parameters (words, numbers, yes/no) and its body */
  argsOf(src: DataSource, scope: Scope): { args: Record<string, string | number | boolean>; body?: unknown } {
    const ctx = this.argCtx();
    const args: Record<string, string | number | boolean> = {};
    for (const [k, x] of Object.entries(src.params ?? {})) {
      const v = argOf(evaluate(x, scope, ctx));
      if (v !== undefined) args[k] = v;
    }
    return { args, ...(src.body ? { body: evaluate(src.body, scope, ctx) } : {}) };
  }

  /** A source as the runtime's cache loads it (lib/app/sources.ts `SourceSpec`): keyed by its operation and what it is
   *  asked with (as an exported screen keys it), paged as its endpoint pages, loaded through the runtime's transport. */
  spec(src: DataSource, scope: Scope): SourceSpec {
    const api = this.api;
    const e = endpointOf(api, src.operationId);
    const { args, body } = this.argsOf(src, scope);
    const list = e ? listOf(api, e) : undefined;
    return {
      key: sourceKey(src.operationId, body === undefined ? args : { args, body }),
      operation: src.operationId,
      ...(list ? { list: { field: list.field } } : {}),
      ...(e?.pagination ? { paging: paginationOf(e.pagination) } : {}),
      ...(src.pageSize ? { pageSize: src.pageSize } : {}),
      args,
      load: async ({ page, signal }) => {
        if (!e) throw new ApiError(0, { title: `No endpoint ${src.operationId}` }, src.operationId);
        return (await this.send(e, { params: { ...args, ...page }, body }, signal ? { signal } : {})).body;
      },
    };
  }

  /** a source as `data.<name>` reads it: what its key holds, nothing when it holds another key's */
  view(spec: SourceSpec): SourceView {
    const s = this.runtime.sources.state(spec.key);
    return sourceView(s.key === spec.key ? s : undefined);
  }

  /** what a source's key holds now */
  state(spec: SourceSpec): SourceState {
    return this.runtime.sources.state(spec.key);
  }

  /** The scope of a screen, and its sources as they are asked for now: its data (each source read in the scope of
   *  the ones before it, as an exported screen's hooks read them), its params, the variables by name and id, the
   *  session, the time, the document's collections. */
  screen(at: ScreenAt): { scope: Scope; sources: { src: DataSource; spec: SourceSpec }[] } {
    const vars: Record<string, unknown> = { ...at.vars };
    for (const v of at.varNames ?? []) if (v.name && at.vars && v.id in at.vars) vars[v.name] = at.vars[v.id];
    const session = this.runtime.session.get();
    const data: Record<string, SourceView> = {};
    const collections = this.doc().collections;
    const scope: Scope = {
      data,
      params: screenParams(at.frame.params, at.params),
      vars,
      auth: { signedIn: this.runtime.session.signedIn, user: session.session?.user ?? null },
      now: new Date(at.now ?? Date.now()).toISOString(),
      /* the document's data sets as lists of records, by name: what a table or a list can be bound to */
      ...(collections?.length ? { collections: collectionsOf(collections) } : {}),
    };
    const sources: { src: DataSource; spec: SourceSpec }[] = [];
    for (const src of at.frame.data ?? []) {
      const spec = this.spec(src, scope);
      sources.push({ src, spec });
      data[src.name] = this.view(spec);
    }
    /* what its subscriptions have kept, when they are open on this screen: none yet reads as connecting */
    const open = this.listening.get(at.frame.id);
    for (const sub of at.frame.subscriptions ?? []) {
      if (sub.name in data) continue;
      const o = open?.get(sub.name);
      (data as Record<string, SourceView | ChannelView>)[sub.name] = channelView(o ? this.runtime.channels.state(o.id) : undefined, { newest: sub.newest });
    }
    return { scope, sources };
  }

  /* ---------- subscriptions ---------- */

  /** the subscriptions open on each screen on show, by the screen's id and their names */
  private listening = new Map<string, Map<string, { key: string; id: string; close: () => void }>>();

  /** The subscriptions of a screen on show (`Frame.subscriptions`), opened through the runtime as they are asked for now:
   *  one whose channel or address changed is opened again, afresh; one the screen no longer has is closed. Each message
   *  a subscription keeps runs the action on it (`on:<message>`, else `on:message`) through `run`, with the message as
   *  the event. What it gives back closes them all (the screen has gone). */
  listen(at: ScreenAt, run: (action: Action, event: ChannelEvent) => void): () => void {
    const id = at.frame.id;
    const mine = this.listening.get(id) ?? new Map<string, { key: string; id: string; close: () => void }>();
    this.listening.set(id, mine);
    const { scope } = this.screen(at);
    const ctx = this.runtime.ctx();
    const wanted = new Set<string>();
    for (const sub of at.frame.subscriptions ?? []) {
      const spec = channelSpecOf(this.api, sub, scope, ctx);
      if (!spec || wanted.has(sub.name)) continue;
      wanted.add(sub.name);
      const was = mine.get(sub.name);
      if (was?.key === spec.key && this.runtime.channels.state(was.id)) continue;
      was?.close();
      const opened = this.runtime.channels.subscribe(spec, (m) => {
        /* the action as the screen has it now */
        const now = this.doc().frames?.find((f) => f.id === id)?.subscriptions?.find((x) => x.name === sub.name) ?? sub;
        const action = messageAction(now.actions, m.message);
        if (action) run(action, { channel: m.channel, message: m.message, payload: m.payload, at: isoOf(m.at) });
      });
      mine.set(sub.name, { key: spec.key, ...opened });
    }
    for (const [name, o] of mine) {
      if (wanted.has(name)) continue;
      o.close();
      mine.delete(name);
    }
    return () => {
      if (this.listening.get(id) !== mine) return;
      for (const o of mine.values()) o.close();
      this.listening.delete(id);
    };
  }

  /** the keys the subscriptions of a screen are asked with now: what opens them again when it changes */
  channelKeysOf(at: ScreenAt): string {
    const { scope } = this.screen(at);
    const ctx = { lang: this.runtime.lang };
    return JSON.stringify((at.frame.subscriptions ?? []).map((sub) => channelSpecOf(this.api, sub, scope, ctx)?.key ?? ""));
  }

  /** the scope of a screen (see `screen`) */
  scope(at: ScreenAt): Scope {
    return this.screen(at).scope;
  }

  /** a source of a screen, by name, as it is asked for now */
  sourceOf(at: ScreenAt, name: string): SourceSpec | undefined {
    return this.screen(at).sources.find((x) => x.src.name === name)?.spec;
  }

  /** the key each source of a screen was last entered with, by `screen/name` */
  private entered = new Map<string, string>();

  /** The sources of a screen that load as it comes on show (`load: "enter"`): one that holds what the same key gave
   *  loads again behind what it shows, one loading is left to finish (`SourceCache.enter`). With `changed`, only those
   *  whose key is another than they were last entered with: what an exported screen's hook does when its arguments
   *  change (lib/app/react.ts `useDataSource`), the others left as they are. */
  enter(at: ScreenAt, o: { changed?: boolean } = {}): Promise<void[]> {
    return Promise.all(
      this.screen(at)
        .sources.filter((x) => (x.src.load ?? "enter") === "enter")
        .flatMap((x) => {
          const where = `${at.frame.id}/${x.src.name}`;
          if (o.changed && this.entered.get(where) === x.spec.key) return [];
          this.entered.set(where, x.spec.key);
          return [this.runtime.sources.enter(x.spec)];
        }),
    );
  }

  /** a source of a screen loaded again (a pull, a tap's refresh), or its next page */
  load(at: ScreenAt, name: string, o: { more?: boolean } = {}): Promise<void> {
    const spec = this.sourceOf(at, name);
    if (!spec) return Promise.resolve();
    return o.more ? this.runtime.sources.loadMore(spec) : this.runtime.sources.refresh(spec);
  }

  /** the keys the sources of a screen that load on show are asked with now: what loads them again when it changes */
  keysOf(at: ScreenAt): string {
    return JSON.stringify(
      this.screen(at)
        .sources.filter((x) => (x.src.load ?? "enter") === "enter")
        .map((x) => x.spec.key),
    );
  }

  /* ---------- forms ---------- */

  /** The form of a group, lib/app's form controller as the runtime keeps it (by the group's id: what is typed in it
   *  stays while its screen goes and comes back, until the runtime starts over), brought up to what its inputs hold
   *  now. A field that changed loses the server's word on it, as an exported app's input does. */
  form(at: FormAt): FormController {
    const entries = formEntries({ ...at, doc: this.doc() });
    const rules: Record<string, FieldRule> = {};
    for (const x of entries) if (x.rule) rules[x.field] = x.rule;
    const epoch = this.runtime.epoch.get();
    if (epoch !== this.formsEpoch) {
      for (const f of this.forms.values()) f.off();
      this.forms.clear();
      this.formsEpoch = epoch;
    }
    const c = this.runtime.form(at.form.id, rules as FormFields, Object.fromEntries(entries.map((x) => [x.field, x.raw])));
    if (this.forms.get(at.form.id)?.c !== c) {
      this.forms.get(at.form.id)?.off();
      this.forms.set(at.form.id, { c, off: c.store.subscribe(() => !this.quiet && this.bump()) });
    }
    this.quiet = true;
    try {
      for (const x of entries) if (!same(c.value(x.field), x.raw)) c.set(x.field, x.raw);
    } finally {
      this.quiet = false;
    }
    return c;
  }

  /** a form as `form.` reads it */
  formView(at: FormAt): FormView {
    return this.form(at).view();
  }

  /** Checks a form and sends it to its operation with its params (read already) and its `values` (`extra`), through
   *  the runtime: null when nothing was sent (a field is wrong: the form shows why; or it is being sent already). Its
   *  upload counts up while it goes: what the transport tells, else a stand-in that steps toward the end (`tick`). */
  async submit(at: FormAt, o: { params: Record<string, unknown>; extra?: Record<string, unknown> }): Promise<CallResult | null> {
    const c = this.form(at);
    const op = at.form.form?.operationId ?? "";
    const e = endpointOf(this.api, op);
    let status = 200;
    const out = await c.submit(async (body, init) => {
      if (!e) throw new ApiError(0, { title: `No endpoint ${op}` }, op);
      let told = false;
      let sent = 0;
      const stop = init.onUploadProgress && this.o.tick ? this.o.tick(() => !told && init.onUploadProgress!((sent = Math.min(95, sent + 7)), 100)) : () => {};
      try {
        const r = await this.send(e, { params: o.params, body }, init.onUploadProgress ? { onUploadProgress: (s, t) => ((told = true), init.onUploadProgress!(s, t)) } : {});
        status = r.status;
        return r.body;
      } finally {
        stop();
      }
    }, o.extra);
    if ("invalid" in out) return null;
    return out.ok ? { ...out, status } : out;
  }
}

/** whether two values an input holds are the same: a list (the words of its rows) by its elements */
const same = (a: unknown, b: unknown) => Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Object.is(x, b[i])));

/** the document's collections as lists of records, by name */
const collectionsOf = (collections: Collection[]) => Object.fromEntries(collections.map((c) => [c.name, c.rows.map((r) => Object.fromEntries(c.fields.map((f, i) => [f, r[i] ?? ""])))]));
