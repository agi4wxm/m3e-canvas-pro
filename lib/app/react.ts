/* The runtime in React: a provider, and the hooks the generated screens are made of. A data source's hook loads it as
 * its screen comes on show (again behind what it shows when it holds something already), and again when its arguments
 * or the runtime start over; a form's hook keeps its fields controlled; the session's hook says who is signed in.
 * React only: no DOM, React Native or Taro import, so all three front ends use these as they are. */

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { FieldRule, Problem } from "../bindings/rules";
import { regionOf, sourceView, type RegionShows, type SourceView } from "../bindings/sources";
import type { FormView } from "../bindings/form";
import { FormController, type CallResult, type FormFields, type FormState, type SendInit } from "./forms";
import type { Runtime } from "./runtime";
import { Bindings, type Scope } from "./scope";
import type { SessionState } from "./session";
import type { SourceSpec } from "./sources";

const RuntimeContext = createContext<Runtime | null>(null);

/** puts a runtime (createRuntime) under the app */
export function RuntimeProvider({ runtime, children }: { runtime: Runtime; children?: ReactNode }) {
  return createElement(RuntimeContext.Provider, { value: runtime }, children);
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("useRuntime must be used inside <RuntimeProvider>");
  return runtime;
}

/** how many times the runtime has started over: what a screen loads again on */
export function useEpoch(): number {
  const runtime = useRuntime();
  return useSyncExternalStore(runtime.epoch.subscribe, runtime.epoch.get, runtime.epoch.get);
}

/** the app's language */
export function useLang(): string {
  const runtime = useRuntime();
  return useSyncExternalStore(runtime.language.subscribe, runtime.language.get, runtime.language.get);
}

export type SessionHandle = {
  signedIn: boolean;
  /** what the sign-in said of the user */
  user: unknown;
  token: string | undefined;
  /** what the storage held has been read: before it has, `signedIn` may still turn true */
  restored: boolean;
  signOut: () => void;
};

/** the session as it is now */
export function useSession(): SessionHandle {
  const runtime = useRuntime();
  const s: SessionState = useSyncExternalStore(runtime.session.subscribe, runtime.session.get, runtime.session.get);
  const signOut = useCallback(() => runtime.signOut(), [runtime]);
  return { signedIn: !!s.session || s.presumed, user: s.session?.user ?? null, token: s.session?.token, restored: s.restored, signOut };
}

/** what `auth.` reads in expressions */
export function useAuthScope(): { signedIn: boolean; user: unknown } {
  const { signedIn, user } = useSession();
  return useMemo(() => ({ signedIn, user }), [signedIn, user]);
}

/** A screen that needs a session: once the stored one has been read and there is none, `onMissing` (go to sign in,
 *  remembering to come back). */
export function useRequireAuth(required: boolean, onMissing: () => void) {
  const { signedIn, restored } = useSession();
  const missing = useRef(onMissing);
  useEffect(() => {
    missing.current = onMissing;
  });
  useEffect(() => {
    if (required && restored && !signedIn) missing.current();
  }, [required, restored, signedIn]);
}

/** A data source as `data.<name>` reads it, and what a tap does to it. */
export type SourceHandle = SourceView & {
  /** the cache key it is held under */
  key: string;
  /** loads it again (a pull to refresh, a "try again") */
  refresh: () => Promise<void>;
  /** loads its next page */
  loadMore: () => Promise<void>;
  /** takes a row out of its list before a call answers; what it gives back puts it back */
  remove: (row: unknown) => () => void;
  /** sets fields of a row of its list before a call answers; what it gives back puts it back */
  patch: (row: unknown, fields: (row: Record<string, unknown>) => Record<string, unknown>) => () => void;
};

/** A data source: loaded as its screen comes on show (`load: "enter"`, the default) or only when asked (`"demand"`),
 *  again when its key changes or the runtime starts over; one that holds what the key gave loads again behind it. */
export function useDataSource<T>(spec: SourceSpec<T>, o: { load?: "enter" | "demand" } = {}): SourceHandle {
  const runtime = useRuntime();
  const epoch = useEpoch();
  const latest = useRef(spec);
  useEffect(() => {
    latest.current = spec;
  });
  const key = spec.key;
  const state = useSyncExternalStore(
    runtime.sources.store.subscribe,
    () => runtime.sources.state(key),
    () => runtime.sources.state(key),
  );
  const onEnter = (o.load ?? "enter") === "enter";
  useEffect(() => {
    if (onEnter) void runtime.sources.enter(latest.current);
  }, [runtime, key, epoch, onEnter]);
  return useMemo(() => {
    const spec = () => latest.current as SourceSpec;
    return {
      ...sourceView(state.key === key ? state : undefined),
      key,
      refresh: () => runtime.sources.refresh(spec()),
      loadMore: () => runtime.sources.loadMore(spec()),
      remove: (row: unknown) => runtime.sources.optimistic(key, row, { remove: true }),
      patch: (row: unknown, fields: (row: Record<string, unknown>) => Record<string, unknown>) => runtime.sources.optimistic(key, row, { patch: fields }),
    };
  }, [runtime, key, state]);
}

/** the state a region shows for its source (lib/bindings/sources.ts `regionOf`, as the preview chooses it) */
export function useRegion(source: SourceView | undefined, o: { load?: "enter" | "demand"; emptyWhen?: () => boolean } = {}): RegionShows {
  return regionOf(source, o);
}

/** A form, as the generated screen uses it: the fields' values and errors, the form as `form.` reads it, and its
 *  submit, which sends its body through `send` and runs `then` or `catch` with the answer. */
export type FormHandle = {
  /** the form as `form.` reads it in expressions */
  view: FormView;
  /** what is entered in a field */
  value: (field: string) => unknown;
  /** a field's words, for a text input */
  text: (field: string) => string;
  /** the error a field shows, if any */
  error: (field: string) => string | undefined;
  /** enters a value */
  set: (field: string, value: unknown) => void;
  submitting: boolean;
  submit: () => Promise<void>;
  reset: () => void;
  controller: FormController;
};

export type FormOptions<T> = {
  /** the rules of its fields, from the contract's schema */
  fields: Readonly<Record<string, FieldRule>>;
  /** what its fields start with */
  initial?: Record<string, unknown>;
  /** sends the body: the typed client's call */
  send: (body: Record<string, unknown>, init: SendInit) => Promise<T>;
  /** the body's fields no input gives, read as the form is sent */
  extra?: () => Record<string, unknown>;
  /** the status a 2xx answer is reported with */
  status?: number;
  then?: (response: T, status: number) => void;
  catch?: (error: Problem, status: number) => void;
};

export function useForm<T>(o: FormOptions<T>): FormHandle {
  const runtime = useRuntime();
  const latest = useRef(o);
  useEffect(() => {
    latest.current = o;
  });
  const [controller] = useState(() => new FormController(o.fields as FormFields, { lang: () => runtime.lang, call: (fn) => runtime.call(fn), initial: o.initial }));
  const state: FormState = useSyncExternalStore(controller.store.subscribe, controller.store.get, controller.store.get);
  return useMemo(() => {
    void state;
    return {
      view: controller.view(),
      value: (field: string) => controller.value(field),
      text: (field: string) => controller.text(field),
      error: (field: string) => controller.error(field),
      set: controller.set,
      submitting: state.run.submitting,
      submit: async () => {
        const now = latest.current;
        const out = (await controller.submit(now.send, now.extra?.())) as CallResult<T> | { ok: false; invalid: true };
        if ("invalid" in out) return;
        if (out.ok) now.then?.(out.response, now.status ?? out.status);
        else if (!out.unauthorized) now.catch?.(out.error, out.status);
      },
      reset: () => controller.reset(),
      controller,
    };
  }, [controller, state]);
}

/** a tap's call, with its optimistic change, then and catch (Runtime.call) */
export function useCall(): Runtime["call"] {
  const runtime = useRuntime();
  return useMemo(() => runtime.call.bind(runtime), [runtime]);
}

/** The expressions of a screen: its scope (data, params, vars, and the session as `auth`, the time as `now`) read in the
 *  app's language. Inner scopes come from `.with({ item, index })`, `.with({ form })`, `.with({ response, status })`. */
export function useBindings(scope: Scope): Bindings {
  const runtime = useRuntime();
  const auth = useAuthScope();
  const lang = useLang();
  const ctx = runtime.ctx();
  return new Bindings({ auth, now: new Date(ctx.now ?? Date.now()).toISOString(), ...scope }, { ...ctx, lang });
}
