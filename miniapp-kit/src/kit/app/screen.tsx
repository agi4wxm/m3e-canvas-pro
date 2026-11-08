import Taro, { usePullDownRefresh, useReachBottom, useRouter } from "@tarojs/taro";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Bindings,
  run,
  screenParams,
  useForm,
  useRequireAuth,
  useRuntime,
  type Action as DesignAction,
  type ActionHost,
  type CallResult,
  type FormFields,
  type FormHandle,
  type FormRef,
  type Outcome,
  type SendInit,
  type SourceHandle,
  type Tap,
} from "@m3e/app-runtime";

import { pickFiles, type PickedFile } from "../composites/forms";
import { Layer, OverlaidProvider } from "../screen";
import { currentPlace, goBack, loginScreen, moved, movesSoFar, openPlace, readQuery, type Place } from "./nav";
import type { Action, ActionBody, AppSpec, Condition, VarValue } from "./spec";
import { asBool, asNumber, coerce, initVars, readVar, useVarValues, varSpec, varsScope, varValues, writeVar } from "./vars";

/* The runtime of a printed screen: what it was opened with, what its taps do, what it holds that the design changes as
 * it is used (parts shown and hidden, overlays opened, props a tap set, what was entered in its inputs) and the page's
 * own events (a pull down, the end of the page reached). A tap is the design's own data (`Action`), run by the one
 * interpreter every host of the design runs (lib/actions, in packages/app-runtime; docs/交互规则.md): its condition, its
 * effects in order (each reading the state its step finds; a call does not hold up what follows, what waits for it is in
 * its `then`), then where it goes. The screen is its host: its own state, the app's variables, the runtime (the API, the
 * session, the capabilities) and the pages. Expressions are read by the design's own evaluator (`Bindings`). */

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

/** What a tap is run with: the expressions' scope where the part stands (a row's item, a form), the element of a data
 *  source's list the part was drawn for and its place, the form it is in, the part (what a call's answer is told apart
 *  by), the place of a family it was run for (`slot`) and what the event that started it carries (`event`). */
export type Env = { $: Bindings; item?: unknown; index?: number; form?: string; part?: string; slot?: { key: string; index: number }; event?: unknown };

/** What a screen starts with: the parts hidden until a tap shows them, what each input holds and the variable it writes,
 *  the inputs a form keeps (a condition asks whether they are filled), the overlays that keep a trigger of their own on
 *  the screen while shut (a menu). */
export type ScreenInit = {
  hidden?: string[];
  inputs?: Record<string, { value: unknown; var?: string; labels?: string[] }>;
  fields?: Record<string, { form: string; field: string }>;
  triggers?: string[];
};

/** a form of the screen as its taps reach it: the runtime's form, its operation and what runs after its answer */
export type ScreenForm = {
  form: FormHandle;
  operationId: string;
  /** what runs after a 2XX answer (its `then`), and after any other (its `catch`) */
  ok?: ActionBody;
  fail?: ActionBody;
  send: (body: Record<string, unknown>, init: SendInit) => Promise<unknown>;
  extra?: () => Record<string, unknown>;
  status?: number;
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
  /** whether an overlay with a trigger of its own (a menu) is open, and the visitor opening or shutting it */
  opened: (part: string) => boolean;
  setOpened: (part: string, on: boolean) => void;
  /** a prop of a part, as the design has it or as a tap set it */
  prop: <T>(part: string, key: string, design: T) => T;
  /** the visitor changed a prop of a part by using it (a row picked): what `prop` reads from now on */
  setProp: (part: string, key: string, value: VarValue) => void;
  /** a part's prop bound to a variable, in the kind of value the design gave the prop */
  bound: <T>(varId: string, design: T, labels?: string[]) => T;
  /** what an input holds now */
  value: <T>(part: string, design: T) => T;
  /** what an input writes into when it changes */
  setter: (part: string) => (v: unknown) => void;
  /** whether a condition holds, as the screen is drawn */
  holds: (c: Condition | undefined, $: Bindings) => boolean;
  /** runs a tap */
  run: (a: Action | ActionBody | undefined, env: Env) => void;
  /** a tap as a handler */
  tap: (a: Action | ActionBody | undefined, env: Env) => () => void;
  /** closes a part that is open over the screen */
  close: (part: string) => void;
  /** the screen's data sources and forms, by name and by the form's key, for its taps to reach */
  register: (o: { sources?: Record<string, SourceHandle>; forms?: Record<string, ScreenForm> }) => void;
  /** a screen opened over this one, while it is */
  layer: ReactNode;
  /** asks for files through the capability registry (file.pick), else the platform's own pickers */
  pickFiles: (o: { multiple?: boolean; accept?: string }) => Promise<PickedFile[]>;
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
const holdsValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : typeof v === "boolean" ? v : typeof v === "number" ? v >= 0 : Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null);

const scalar = (v: unknown): VarValue | undefined => (v === undefined || v === null ? undefined : typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : JSON.stringify(v));

/** what a screen keeps for its taps: its state as the last step left it, its data and forms as the last render
 *  registered them, the screen laid over it, what it was opened with */
type Live = { state: State; sources: Record<string, SourceHandle>; forms: Record<string, ScreenForm>; overlay: Place | null; params: Record<string, unknown> };

/** a tap as the interpreter carries it, with where on the screen it was made */
type At = Tap & { env: Env };

/** The runtime of the screen `key`. Call it first in a printed screen. */
export function useScreen(key: string, init: ScreenInit = {}): ScreenHandle {
  const { spec, components } = useAppSpec();
  const runtime = useRuntime();
  const router = useRouter();
  const varValuesNow = useVarValues();
  const me = spec.screens[key];
  const given = useMemo(() => readQuery(router.params as Record<string, unknown>), [router.params]);
  const params = useMemo(() => screenParams(me?.params, given), [me, given]);
  const [state, setState] = useState<State>(() => ({
    hidden: Object.fromEntries((init.hidden ?? []).map((id) => [id, true])),
    opened: {},
    props: {},
    fields: Object.fromEntries(Object.entries(init.inputs ?? {}).map(([id, x]) => [id, x.value])),
  }));
  const [overlay, setOverlayState] = useState<Place | null>(null);
  /* what a tap reads when it runs: the screen as the last step left it, its data and forms as the last render
     registered them */
  const live = useRef<Live>({ state, sources: {}, forms: {}, overlay, params });
  useEffect(() => {
    live.current.params = params;
  }, [params]);
  const update = useCallback((fn: (s: State) => State) => {
    live.current.state = fn(live.current.state);
    setState(live.current.state);
  }, []);
  const setOverlay = useCallback((p: Place | null) => {
    if (p !== live.current.overlay) moved();
    live.current.overlay = p;
    setOverlayState(p);
  }, []);
  const latestInit = useRef(init);
  useEffect(() => {
    latestInit.current = init;
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

  const vars = useMemo(() => varsScope(varValuesNow), [varValuesNow]);

  /** what an input holds that a condition asks about: a form's input in its form, any other in the screen */
  const fieldOf = useCallback((part: string, fields: Record<string, unknown>) => {
    const kept = latestInit.current.fields?.[part];
    return kept ? live.current.forms[kept.form]?.form.value(kept.field) : fields[part];
  }, []);

  /* the screen as the interpreter's host (lib/actions `Host`): one for the screen's life, so an answer knows the calls
     made since */
  const host = useMemo<ActionHost>(() => {
    const triggers = () => new Set(latestInit.current.triggers ?? []);
    const formOf = (tap: Tap) => (tap.form ? live.current.forms[tap.form] : undefined);
    const dropped: Outcome = { ok: false, status: 0, error: undefined, dropped: true };
    const outcomeOf = (out: CallResult, status: number | undefined): Outcome => (out.ok ? { ok: true, status: status ?? out.status, response: out.response } : { ok: false, status: out.status, error: out.error, unauthorized: out.unauthorized });
    return {
      scope: (tap) => {
        const form = formOf(tap);
        const session = runtime.session.get();
        return {
          ...(tap as At).env.$.scope,
          params: live.current.params,
          vars: varsScope(varValues()),
          auth: { signedIn: runtime.session.signedIn, user: session.session?.user ?? null },
          ...(form ? { form: form.form.controller.view() } : {}),
        };
      },
      ctx: () => runtime.ctx(),
      variable: (id) => {
        const v = varSpec(id);
        return v ? { type: v.type, value: readVar(id) ?? v.value } : undefined;
      },
      setVar: writeVar,
      filled: (part) => holdsValue(fieldOf(part, live.current.state.fields)),
      shown: (part) => !live.current.state.hidden[part],
      setShown: (part, on) => update((s) => ({ ...s, hidden: { ...s.hidden, [part]: !on } })),
      setOpen: (part, on) =>
        update((s) => ({
          ...s,
          opened: { ...s.opened, [part]: on },
          /* an overlay with no trigger of its own stands only while it is open; a menu's trigger stays */
          ...(on || !triggers().has(part) ? { hidden: { ...s.hidden, [part]: !on } } : {}),
        })),
      setProp: (part, prop, value) => update((s) => ({ ...s, props: { ...s.props, [part]: { ...s.props[part], [prop]: value } } })),
      toast: (text) => void Taro.showToast({ title: text.slice(0, 200), icon: "none", duration: 2500 }),
      go: (to, o) => {
        const target = spec.screens[to];
        if (!target) return;
        const place: Place = { screen: to, ...(o.params ? { params: o.params } : {}) };
        if (o.overlay) return setOverlay(place);
        if (live.current.overlay) setOverlay(null);
        /* leaving the sign-in screen does not keep it under the next one */
        void openPlace(spec, place, { replace: spec.screens[key]?.auth === "login" });
      },
      back: () => {
        if (live.current.overlay) return setOverlay(null);
        void goBack(spec);
      },
      openLink: (url) =>
        void runtime.invoke("link.open", { url }).then((out) => {
          /* through the capability registry (link.open: the app's adapter, else the platform's); an app with no registry
             for it: H5 opens the address, a mini-program copies it (it opens no outside page without a web-view domain) */
          if (out.ok || out.dropped || out.error.type !== "not-implemented") return;
          if (process.env.TARO_ENV === "h5") window.open(url, "_blank", "noopener");
          else void Taro.setClipboardData({ data: url });
        }),
      scrollTo: () => {},
      call: async (operationId, given) => {
        const fn = spec.calls[operationId];
        if (!fn) return { ok: false, status: 0, error: { status: 0, title: `The contract has no operation ${operationId}` } };
        const epoch = runtime.epoch.get();
        const out = await runtime.call(() => fn(given.args, given.body), { status: spec.status[operationId] });
        return epoch !== runtime.epoch.get() ? dropped : outcomeOf(out, undefined);
      },
      invoke: (capability, args) => runtime.invoke(capability, args),
      optimistic: (source, change, tap) => {
        const list = live.current.sources[source];
        if (!list || tap.item === undefined) return undefined;
        return "remove" in change ? list.remove(tap.item) : list.patch(tap.item, change.patch);
      },
      refresh: (source) => void live.current.sources[source]?.refresh(),
      loadMore: (source) => void live.current.sources[source]?.loadMore(),
      form: (id) => {
        const name = id ?? Object.keys(live.current.forms)[0];
        const f = name ? live.current.forms[name] : undefined;
        if (!f || !name) return undefined;
        /* what runs after its answer, under the names the interpreter reads them by */
        const after = Object.fromEntries([["then", f.ok], ["catch", f.fail]].filter(([, b]) => !!b)) as Pick<FormRef, "then" | "catch">;
        return { id: name, operationId: f.operationId, ...after };
      },
      submit: async (ref) => {
        const f = live.current.forms[ref.id];
        if (!f) return null;
        const epoch = runtime.epoch.get();
        const out = await f.form.controller.submit(f.send, f.extra?.());
        if ("invalid" in out) return null;
        return epoch !== runtime.epoch.get() ? dropped : outcomeOf(out, f.status);
      },
      signOut: () => runtime.signOut(),
      afterSignIn: (operationId) => {
        if (!spec.login || operationId !== spec.login) return false;
        /* signed in: back to where the app was sent from, in place of the sign-in */
        const back = runtime.takeReturn<Place>();
        if (!back || !spec.screens[back.screen]) return false;
        void openPlace(spec, back, { replace: true });
        return true;
      },
      moves: movesSoFar,
    };
  }, [spec, runtime, key, update, setOverlay, fieldOf]);

  /* a condition as the screen is drawn now */
  const holds = useCallback(
    (c: Condition | undefined, $: Bindings): boolean => {
      if (!c) return true;
      if ("expr" in c) return typeof c.expr === "string" && $.holds(c.expr);
      if ("filled" in c) return holdsValue(fieldOf(c.filled, state.fields));
      const v = readVar(c.var);
      if (v === undefined) return false;
      const same = String(v) === String(c.value);
      return c.op === "neq" ? !same : same;
    },
    [state.fields, fieldOf],
  );

  const runTap = useCallback(
    (a: Action | ActionBody | undefined, env: Env) => {
      if (!a) return;
      const tap: At = {
        screen: key,
        params: live.current.params,
        ...(env.part ? { part: env.part } : {}),
        ...(env.item !== undefined ? { item: env.item, ...(env.index !== undefined ? { index: env.index } : {}) } : {}),
        ...(env.form ? { form: env.form } : {}),
        ...(env.slot ? { slot: env.slot } : {}),
        ...(env.event !== undefined ? { event: env.event } : {}),
        env,
      };
      void run(a as unknown as DesignAction, host, tap);
    },
    [key, host],
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
    opened: (part) => !!state.opened[part],
    setOpened: (part, on) => update((s) => ({ ...s, opened: { ...s.opened, [part]: on } })),
    prop: <T,>(part: string, k: string, design: T) => (state.props[part] && k in state.props[part] ? (asKind(state.props[part][k], design) as T) : design),
    setProp: (part, k, value) => update((s) => ({ ...s, props: { ...s.props, [part]: { ...s.props[part], [k]: value } } })),
    bound: <T,>(varId: string, design: T, labels?: string[]) => asKind(varValuesNow[varId], design, labels),
    value: <T,>(part: string, design: T): T => {
      const input = init.inputs?.[part];
      if (input?.var && varValuesNow[input.var] !== undefined && typeof design !== "object") return asKind(varValuesNow[input.var], design, input.labels);
      return (part in state.fields ? (state.fields[part] as T) : design) ?? design;
    },
    setter: (part: string) => (v: unknown) => {
      update((s) => ({ ...s, fields: { ...s.fields, [part]: v } }));
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
    run: runTap,
    tap: (a, env) => () => runTap(a, env),
    close: (part) => host.setOpen(part, false),
    register: (o) => {
      if (o.sources) live.current.sources = o.sources;
      if (o.forms) live.current.forms = { ...live.current.forms, ...o.forms };
    },
    layer,
    pickFiles: async (o) => {
      const out = await runtime.invoke("file.pick", { ...(o.accept ? { accept: o.accept } : {}), ...(o.multiple ? { multiple: true } : {}) });
      if (out.ok) {
        const files = (out.result as { files?: { name?: string; type?: string; size?: number; url?: string }[] } | undefined)?.files ?? [];
        return files.flatMap((f) => (f.url ? [{ path: f.url, name: f.name ?? "file", type: f.type ?? "application/octet-stream", size: f.size ?? 0 }] : []));
      }
      /* cancelled, refused: nothing; no adapter for it: the platform's own pickers */
      if (out.dropped || out.error.type !== "not-implemented") return [];
      return pickFiles(o);
    },
  };
}

/** A form of the screen: the runtime's form (its fields checked by the rules of its operation's body), kept where the
 *  screen's taps reach it by `name`, with its operation and what runs after its answer (the interpreter runs them, as
 *  for a call). */
export function useScreenForm(s: ScreenHandle, name: string, o: { id: string; fields: FormFields; operationId: string; send: ScreenForm["send"]; extra?: () => Record<string, unknown>; status?: number; then?: ActionBody; catch?: ActionBody }): FormHandle {
  const form = useForm({ id: o.id, fields: o.fields, send: o.send, ...(o.extra ? { extra: o.extra } : {}), ...(o.status !== undefined ? { status: o.status } : {}) });
  s.register({ forms: { [name]: { form, operationId: o.operationId, send: o.send, ...(o.extra ? { extra: o.extra } : {}), ...(o.status !== undefined ? { status: o.status } : {}), ...(o.then ? { ok: o.then } : {}), ...(o.catch ? { fail: o.catch } : {}) } } });
  return form;
}

/** runs a tap of the design on its own, `ms` after its screen came on show (a delayed trigger) */
export function useAfter(ms: number, fn: () => void) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const t = setTimeout(() => latest.current(), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [ms]);
}

/** the kinds of the fields an event declares, by field (`PartDef.events`) */
export type EventFields = Record<string, "text" | "number" | "bool" | "list" | "object">;

/** What an event carries, as its part declares it: only the declared fields, each of its kind (what a widget says is
 *  not trusted to be the right shape). The same rule as lib/partContract.ts `payloadOf`. */
export function eventOf(fields: EventFields, raw: unknown): Record<string, unknown> {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, kind] of Object.entries(fields)) {
    const v = given[k];
    if (kind === "text" && typeof v === "string") out[k] = v.slice(0, 20_000);
    else if (kind === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (kind === "bool" && typeof v === "boolean") out[k] = v;
    else if (kind === "list" && Array.isArray(v)) out[k] = v.slice(0, 1000);
    else if (kind === "object" && v && typeof v === "object" && !Array.isArray(v)) out[k] = v;
  }
  return out;
}

type SlotTap = (() => void) | undefined;

/** A part's taps on its places (`taps`), with its families (`tab:*`): a place's own tap, else its family's, which is
 *  told the place (`"tab:2"`, `2`). A part asks for a place by its key, so the families answer whatever it asks. */
export function slotTaps(own: Record<string, SlotTap>, families: Record<string, (slot: { key: string; index: number }) => void>): Record<string, SlotTap> {
  return new Proxy(own, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (Object.prototype.hasOwnProperty.call(target, key)) return target[key];
      const m = /^(.+):(\d+)$/.exec(key);
      const family = m ? families[m[1]] : undefined;
      return family && m ? () => family({ key, index: Number(m[2]) }) : undefined;
    },
    has(target, key) {
      return typeof key === "string" && (key in target || (/^(.+):(\d+)$/.test(key) && !!families[key.replace(/:\d+$/, "")]));
    },
  });
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
