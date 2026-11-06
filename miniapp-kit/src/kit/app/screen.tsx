import Taro, { usePullDownRefresh, useReachBottom, useRouter } from "@tarojs/taro";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Bindings, screenParams, useRequireAuth, useRuntime, type CallOptions, type FormHandle, type Runtime, type SourceHandle } from "@m3e/app-runtime";

import { Layer, OverlaidProvider } from "../screen";
import { currentPlace, goBack, loginScreen, openPlace, readQuery, type Place } from "./nav";
import type { Action, ActionBody, AppSpec, Condition, Effect, VarValue } from "./spec";
import { asBool, asNumber, coerce, initVars, readVar, useVarValues, varSpec, varsScope, writeVar } from "./vars";

/* The runtime of a printed screen: what it was opened with, what its taps do, what it holds that the design changes as
 * it is used (parts shown and hidden, props a tap set, what was entered in its inputs) and the page's own events (a pull
 * down, the end of the page reached). A tap is the design's own data (`Action`), run here the way the editor's preview
 * runs it (lib/interact.ts): its condition, its effects in order (a call does not hold up what follows: what waits for it
 * is in its `then`), then where it goes. Expressions are read by the design's own evaluator (`Bindings`, in
 * packages/app-runtime). */

type AppContext = { spec: AppSpec; components: Record<string, ComponentType> };
const SpecContext = createContext<AppContext | null>(null);

/** The app's own: its screens, variables and calls (src/generated/app.ts). Set once under the runtime's provider; it
 *  sends the app to its sign-in screen when a call is refused for want of a session, and back where it was after. */
export function AppSpecProvider({ spec, components, children }: { spec: AppSpec; components: Record<string, ComponentType>; children?: ReactNode }) {
  const runtime = useRuntime();
  const [value] = useState(() => {
    initVars(spec.vars);
    return { spec, components };
  });
  useEffect(() => {
    const login = loginScreen(spec);
    return runtime.whenUnauthorized(() => {
      const here = currentPlace(spec);
      if (!login || here?.screen === login) return;
      if (here) runtime.rememberReturn(here);
      void openPlace(spec, { screen: login }, { replace: true });
    });
  }, [runtime, spec]);
  return createElement(SpecContext.Provider, { value }, children);
}

export function useAppSpec(): AppContext {
  const v = useContext(SpecContext);
  if (!v) throw new Error("useAppSpec must be used inside <AppSpecProvider>");
  return v;
}

/** what a tap is run with: the expressions' scope where the part stands (a row's item, a form, a call's answer), the
 *  element of a data source's list the part was drawn for, and the form it is in */
export type Env = { $: Bindings; item?: unknown; form?: string };

/** what a screen starts with: the parts hidden until a tap shows them, what each input holds and the variable it writes */
export type ScreenInit = {
  hidden?: string[];
  inputs?: Record<string, { value: unknown; var?: string; labels?: string[] }>;
};

type State = { hidden: Record<string, boolean>; opened: Record<string, boolean>; props: Record<string, Record<string, VarValue>>; fields: Record<string, unknown> };

export type ScreenHandle = {
  key: string;
  /** what the screen was opened with, each as its declared type has it */
  params: Record<string, unknown>;
  /** the variables as expressions read them */
  vars: Record<string, unknown>;
  /** whether a part is on show */
  shows: (part: string) => boolean;
  /** a prop of a part, as the design has it or as a tap set it */
  prop: <T>(part: string, key: string, design: T) => T;
  /** a part's prop bound to a variable, in the kind of value the design gave the prop */
  bound: <T>(varId: string, design: T, labels?: string[]) => T;
  /** what an input holds now */
  value: <T>(part: string, design: T) => T;
  /** what an input writes into when it changes */
  setter: (part: string) => (v: unknown) => void;
  /** whether a condition holds */
  holds: (c: Condition | undefined, $: Bindings) => boolean;
  /** runs a tap */
  run: (a: Action | ActionBody | undefined, env: Env) => void;
  /** runs what a form's answer runs: `ok` its `then` (a sign-in's goes back where the app was sent from), else its `catch` */
  answered: (operationId: string, body: ActionBody | undefined, env: Env, ok: boolean) => void;
  /** a tap as a handler */
  tap: (a: Action | ActionBody | undefined, env: Env) => () => void;
  /** closes a part that is open over the screen */
  close: (part: string) => void;
  /** the screen's data sources and forms, by name and by the form's id, for its taps to reach */
  register: (o: { sources?: Record<string, SourceHandle>; forms?: Record<string, FormHandle> }) => void;
  /** a screen opened over this one, while it is */
  layer: ReactNode;
};

/** a value as the kind the design gave a prop: a yes or no, a number, words */
function asKind<T>(v: VarValue | undefined, design: T, labels?: string[]): T {
  if (v === undefined) return design;
  if (typeof design === "boolean") return asBool(v) as T;
  if (typeof design === "number") {
    if (typeof v === "string" && labels) {
      const at = labels.indexOf(v);
      if (at >= 0) return at as T;
    }
    return (asNumber(v) ?? design) as T;
  }
  return String(v) as T;
}

/** whether an input holds something: words, a tick, a choice, a file */
const holdsValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : typeof v === "boolean" ? v : typeof v === "number" ? v >= 0 : v !== undefined && v !== null);

const scalar = (v: unknown): VarValue | undefined => (v === undefined || v === null ? undefined : typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : JSON.stringify(v));

/** whether a condition holds, over what the screen's inputs hold: an expression, an input that holds something, a
 *  variable against a value (lib/interact.ts `conditionHolds`) */
const holdsOver =
  (fields: Record<string, unknown>) =>
  (c: Condition | undefined, $: Bindings): boolean => {
    if (!c) return true;
    if ("expr" in c) return typeof c.expr === "string" && $.holds(c.expr);
    if ("filled" in c) return holdsValue(fields[c.filled]);
    const v = readVar(c.var);
    if (v === undefined) return false;
    const same = String(v) === String(c.value);
    return c.op === "neq" ? !same : same;
  };

/** The runtime of the screen `key`. Call it first in a printed screen. */
export function useScreen(key: string, init: ScreenInit = {}): ScreenHandle {
  const { spec, components } = useAppSpec();
  const runtime = useRuntime();
  const router = useRouter();
  const varValues = useVarValues();
  const me = spec.screens[key];
  const given = useMemo(() => readQuery(router.params as Record<string, unknown>), [router.params]);
  const params = useMemo(() => screenParams(me?.params, given), [me, given]);
  const [state, setState] = useState<State>(() => ({
    hidden: Object.fromEntries((init.hidden ?? []).map((id) => [id, true])),
    opened: {},
    props: {},
    fields: Object.fromEntries(Object.entries(init.inputs ?? {}).map(([id, x]) => [id, x.value])),
  }));
  const [overlay, setOverlay] = useState<Place | null>(null);
  /* what a tap reads when it runs: the screen as it is then, its data and forms as the last render registered them */
  const live = useRef({ state, sources: {} as Record<string, SourceHandle>, forms: {} as Record<string, FormHandle>, overlay });
  useEffect(() => {
    live.current.state = state;
    live.current.overlay = overlay;
  });

  /* a screen that needs a session: to the sign-in screen, and back here after */
  useRequireAuth(me?.auth === "required", () => {
    const login = loginScreen(spec);
    if (!login) return;
    /* what it was opened with, of what it declares (the web's router adds a stamp of its own) */
    const declared = Object.fromEntries((me?.params ?? []).filter((p) => p.name in given).map((p) => [p.name, given[p.name]]));
    runtime.rememberReturn({ screen: key, params: declared } satisfies Place);
    void openPlace(spec, { screen: login }, { replace: true });
  });

  const vars = useMemo(() => varsScope(varValues), [varValues]);

  /* a condition as the screen is drawn now; a tap reads the screen as it is when it runs */
  const holds = useMemo(() => holdsOver(state.fields), [state.fields]);
  const holdsLive = useCallback((c: Condition | undefined, $: Bindings) => holdsOver(live.current.state.fields)(c, $), []);

  const run = useCallback(
    (a: Action | ActionBody | undefined, env: Env) => {
      if (!a) return;
      const body = "when" in a && a.when && !holdsLive(a.when, env.$) ? a.else : a;
      if (body) runBody(body, env, { spec, runtime, key, live: live.current, setState, setOverlay, holds: holdsLive });
    },
    [spec, runtime, key, holdsLive],
  );

  /* a form's answer: its `then` (a sign-in's goes back to where the app was sent from), or its `catch` */
  const answered = useCallback(
    (operationId: string, body: ActionBody | undefined, env: Env, ok: boolean) => {
      const login = ok && !!spec.login && operationId === spec.login;
      if (!body && !login) return;
      runBody(body ?? { to: "none" }, env, { spec, runtime, key, live: live.current, setState, setOverlay, holds: holdsLive }, { afterLogin: login });
    },
    [spec, runtime, key, holdsLive],
  );

  const layer = overlay ? (
    <Layer open onClose={() => setOverlay(null)}>
      <OverlaidProvider value>{components[overlay.screen] ? createElement(components[overlay.screen]) : null}</OverlaidProvider>
    </Layer>
  ) : null;

  return {
    key,
    params,
    vars,
    shows: (part) => !state.hidden[part],
    prop: <T,>(part: string, k: string, design: T) => (state.props[part] && k in state.props[part] ? (asKind(state.props[part][k], design) as T) : design),
    bound: <T,>(varId: string, design: T, labels?: string[]) => asKind(varValues[varId], design, labels),
    value: <T,>(part: string, design: T): T => {
      const input = init.inputs?.[part];
      if (input?.var && varValues[input.var] !== undefined && typeof design !== "object") return asKind(varValues[input.var], design, input.labels);
      return (part in state.fields ? (state.fields[part] as T) : design) ?? design;
    },
    setter: (part: string) => (v: unknown) => {
      setState((s) => ({ ...s, fields: { ...s.fields, [part]: v } }));
      const input = init.inputs?.[part];
      const spec = input?.var ? varSpec(input.var) : undefined;
      if (!input?.var || !spec) return;
      /* a choice written to a text variable is the row's words, not its place in the list */
      const words = spec.type === "text" && typeof v === "number" && input.labels ? (input.labels[v] ?? "") : v;
      const s = scalar(words);
      const next = s === undefined ? null : coerce(s, spec.type);
      if (next !== null) writeVar(input.var, next);
    },
    holds,
    run,
    answered,
    tap: (a, env) => () => run(a, env),
    close: (part) => setState((s) => ({ ...s, opened: { ...s.opened, [part]: false }, hidden: { ...s.hidden, [part]: true } })),
    register: (o) => {
      if (o.sources) live.current.sources = o.sources;
      if (o.forms) live.current.forms = o.forms;
    },
    layer,
  };
}

type RunCtx = {
  spec: AppSpec;
  runtime: Runtime;
  key: string;
  live: { state: State; sources: Record<string, SourceHandle>; forms: Record<string, FormHandle>; overlay: Place | null };
  setState: (fn: (s: State) => State) => void;
  setOverlay: (p: Place | null) => void;
  holds: (c: Condition | undefined, $: Bindings) => boolean;
};

/** a tap's effects, then where it goes */
function runBody(body: ActionBody, env: Env, ctx: RunCtx, o: { afterLogin?: boolean } = {}) {
  for (const e of body.effects ?? []) runEffect(e, env, ctx);
  go(body, env, ctx, o);
}

function go(body: ActionBody, env: Env, ctx: RunCtx, o: { afterLogin?: boolean }) {
  const { spec } = ctx;
  if (o.afterLogin) {
    /* signed in: back to where the app was sent from, else on to where the form goes, in place of the sign-in */
    const back = ctx.runtime.takeReturn<Place>();
    if (back && spec.screens[back.screen]) return void openPlace(spec, back, { replace: true });
    if (spec.screens[body.to]) return void openPlace(spec, { screen: body.to, params: paramsOf(body, env) }, { replace: true });
    return;
  }
  if (body.to === "back") {
    if (ctx.live.overlay) return ctx.setOverlay(null);
    return void goBack(spec);
  }
  if (body.to === "link") {
    const url = body.url && /^https?:\/\//i.test(body.url) ? body.url : undefined;
    if (!url) return;
    if (process.env.TARO_ENV === "h5") window.open(url, "_blank", "noopener");
    else void Taro.setClipboardData({ data: url });
    return;
  }
  const target = spec.screens[body.to];
  if (!target) return;
  const place: Place = { screen: body.to, params: paramsOf(body, env) };
  if (body.overlay) return ctx.setOverlay(place);
  if (ctx.live.overlay) ctx.setOverlay(null);
  /* leaving the sign-in screen does not keep it under the next one */
  void openPlace(spec, place, { replace: spec.screens[ctx.key]?.auth === "login" });
}

/** what a tap gives the screen it opens, each read where the tap is */
function paramsOf(body: ActionBody, env: Env): Record<string, unknown> | undefined {
  if (!body.params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(body.params)) {
    const v = env.$.arg(x);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function runEffect(e: Effect, env: Env, ctx: RunCtx) {
  const { setState, runtime, spec } = ctx;
  switch (e.do) {
    case "show":
    case "hide":
    case "toggle":
      return setState((s) => ({ ...s, hidden: { ...s.hidden, [e.part]: e.do === "toggle" ? !s.hidden[e.part] : e.do === "hide" } }));
    case "open":
      return setState((s) => ({ ...s, hidden: { ...s.hidden, [e.part]: false }, opened: { ...s.opened, [e.part]: true } }));
    case "close":
      return setState((s) => ({ ...s, opened: { ...s.opened, [e.part]: false }, hidden: { ...s.hidden, [e.part]: true } }));
    case "setVar": {
      const type = varSpec(e.var)?.type;
      const raw = typeof e.expr === "string" ? scalar(env.$.ev(e.expr)) : e.value;
      const v = type && raw !== undefined ? coerce(raw, type) : null;
      if (v !== null) writeVar(e.var, v);
      return;
    }
    case "toggleVar": {
      const v = varSpec(e.var);
      if (v) writeVar(e.var, v.type === "bool" ? !asBool(readVar(e.var) ?? v.value) : (readVar(e.var) ?? v.value));
      return;
    }
    case "addVar": {
      const v = varSpec(e.var);
      if (!v || !Number.isFinite(e.by)) return;
      const next = Math.round(((asNumber(readVar(e.var) ?? v.value) ?? 0) + e.by) * 1e6) / 1e6;
      writeVar(e.var, coerce(next, v.type) ?? next);
      return;
    }
    case "setProp":
      return setState((s) => ({ ...s, props: { ...s.props, [e.part]: { ...s.props[e.part], [e.prop]: e.value } } }));
    case "snackbar": {
      const message = e.message.includes("{{") ? env.$.fill(e.message) : e.message;
      void Taro.showToast({ title: message.slice(0, 200), icon: "none", duration: 2500 });
      return;
    }
    case "refresh":
      return void ctx.live.sources[e.source]?.refresh();
    case "loadMore":
      return void ctx.live.sources[e.source]?.loadMore();
    case "submit": {
      const form = ctx.live.forms[e.form ?? env.form ?? ""] ?? (e.form ? undefined : Object.values(ctx.live.forms)[0]);
      return void form?.submit();
    }
    case "signOut":
      return runtime.signOut();
    case "call": {
      const fn = spec.calls[e.operationId];
      if (!fn) return;
      const args: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(e.args ?? {})) {
        const v = env.$.ev(x);
        if (v !== undefined) args[k] = v;
      }
      const body = typeof e.body === "string" ? env.$.ev(e.body) : undefined;
      const source = e.optimistic ? ctx.live.sources[e.optimistic.source] : undefined;
      const opt = e.optimistic;
      const login = !!spec.login && e.operationId === spec.login;
      const options: CallOptions<unknown> = {
        status: spec.status[e.operationId],
        optimistic:
          source && opt && env.item !== undefined
            ? () =>
                opt.remove
                  ? source.remove(env.item)
                  : source.patch(env.item, (row) => Object.fromEntries(Object.entries(opt.patch ?? {}).map(([k, x]) => [k, env.$.with({ item: row }).ev(x)])))
            : undefined,
      };
      /* what the answer runs, as the runtime's own call runs it: nothing once the runtime has started over, no `catch` for
         a refusal that has sent the app to sign in */
      const epoch = runtime.epoch.get();
      void runtime.call(() => fn(args, body), options).then((out) => {
        if (epoch !== runtime.epoch.get()) return;
        if (out.ok) {
          if (e.then) runBody(e.then, { ...env, $: env.$.with({ response: out.response, status: out.status }) }, ctx, { afterLogin: login });
        } else if (!out.unauthorized && e.catch) runBody(e.catch, { ...env, $: env.$.with({ error: out.error, status: out.status }) }, ctx);
      });
      return;
    }
  }
}

/** The page's own events for a screen's data: a pull down loads again what pulls (enablePullDownRefresh in the page's
 *  config), the end of the page reached loads the next page of what pages as it scrolls. */
export function usePageData(entries: { source: SourceHandle; pull?: boolean; more?: boolean }[]) {
  const latest = useRef(entries);
  useEffect(() => {
    latest.current = entries;
  });
  usePullDownRefresh(() => {
    void Promise.all(latest.current.filter((e) => e.pull).map((e) => e.source.refresh())).finally(() => Taro.stopPullDownRefresh());
  });
  useReachBottom(() => {
    for (const e of latest.current) if (e.more && e.source.hasMore && !e.source.loadingMore && !e.source.loading) void e.source.loadMore();
  });
}
