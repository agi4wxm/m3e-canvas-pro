import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { Snackbar } from "./composites/content";
import { useNav, type Nav } from "./runtime";

/* What a running app remembers beside the screen on show, and what a tap does with it, as the editor's preview does
 * (lib/interact.ts): the variables, the parts a tap has shown or hidden, the props a tap has set, what an input holds
 * when a condition asks whether it is filled, and the snackbar. A tap is the design's action as data (`Action`): its
 * condition, its effects in order, then where it goes. Expressions (a condition, a variable set from one, a snackbar's
 * {{words}}, the params a screen is opened with) are read by the `Reader` the app hands over: the exported app's is
 * the design editor's own evaluator (packages/app-runtime), never `eval`. Effects the kit has no say over (calling the
 * API, loading data, submitting a form, signing out) go to the app's `EffectHandler`. */

export type VarValue = string | number | boolean;

/** a variable of the design and what it starts at */
export type AppVar = { id: string; name: string; type: "text" | "number" | "bool" | "color"; value: VarValue };

/** what expressions read: data, params, vars, item, form, response… */
export type Scope = Record<string, unknown>;

/** reads the design's expressions; without one an expression reads as nothing and a condition on one holds */
export type Reader = { ev: (expr: string, scope: Scope) => unknown; fill: (template: string, scope: Scope) => string };

export type Condition = { var: string; op: "eq" | "neq"; value: VarValue } | { filled: string } | { expr: string };

/** One step of a tap, as the design writes it (lib/tokens `Effect`): a part to show or hide by its key, a variable to
 *  set, a prop to set, a snackbar; and the API's (call, refresh, loadMore, submit, signOut) and a platform capability's
 *  (invoke), which the app runs. */
export type Effect =
  | { do: "show" | "hide" | "toggle" | "open" | "close"; part: string }
  | { do: "setVar"; var: string; value: VarValue; expr?: string }
  | { do: "toggleVar"; var: string }
  | { do: "addVar"; var: string; by: number }
  | { do: "setProp"; part: string; prop: string; value: VarValue }
  | { do: "snackbar"; message: string }
  | { do: "call"; operationId: string; args?: Record<string, string>; body?: string; then?: ActionBody; catch?: ActionBody; optimistic?: { source: string; remove?: boolean; patch?: Record<string, string> } }
  | { do: "invoke"; capability: string; args?: Record<string, string>; then?: ActionBody; catch?: ActionBody }
  | { do: "refresh"; source: string }
  | { do: "loadMore"; source: string }
  | { do: "submit"; form?: string }
  | { do: "signOut" };

/** where a tap goes after its effects: a screen by its key, "back", "link" (to `url`) or "none" */
export type ActionBody = { to: string; params?: Record<string, string>; overlay?: boolean; url?: string; effects?: Effect[] };
export type Action = ActionBody & { when?: Condition; else?: ActionBody };

/** what a tap knows of where it was made: the scope of its expressions, the form it is in, the element of the list
 *  its row was drawn for */
export type Here = { scope?: Scope; form?: unknown; item?: unknown };

/** what a screen holds that its taps can act on: its data sources and its forms, by name */
export type ScreenParts = { sources?: Record<string, unknown>; forms?: Record<string, unknown> };

/** Runs an effect the kit leaves to the app (the API's). `run` runs an action body afterwards (a call's then or catch)
 *  in the same screen. */
export type EffectHandler = (effect: Effect, at: { here: Here; screen: ScreenParts; nav: Nav; run: (body: ActionBody | undefined, here: Here) => void }) => void;

type State = {
  vars: Record<string, VarValue>;
  hidden: Record<string, boolean>;
  props: Record<string, Record<string, VarValue>>;
  fields: Record<string, VarValue>;
  snack: { id: number; message: string } | null;
};

export type AppState = {
  /** the variables now, by id */
  vars: Record<string, VarValue>;
  /** the variables as expressions read them: by name and by id */
  varScope: Record<string, VarValue>;
  /** whether a part (by its key) is on show: hidden at the start unless a tap has shown it, or the other way round */
  shown: (key: string, hiddenAtStart?: boolean) => boolean;
  /** a prop of a part as a tap has set it, else as the design has it */
  prop: <T>(part: string, prop: string, design: T) => T;
  /** a prop that follows a variable, in the kind of value the prop takes; the design's own when it cannot be that */
  bound: <T extends VarValue>(varId: string, design: T) => T;
  /** what an input holds that a condition asks about */
  field: (part: string) => VarValue | undefined;
  /** an input changed: what it holds, and the variable it is bound to */
  input: (part: string, value: VarValue, varId?: string) => void;
  /** whether a condition holds */
  holds: (c: Condition | undefined, here?: Here) => boolean;
  /** the words with their {{expressions}} read */
  fill: (template: string, here?: Here) => string;
  snack: { id: number; message: string } | null;
  dismiss: () => void;
  /** runs one action body's effects and goes where it says, the variables as they stand */
  run: (body: ActionBody | undefined, here: Here, screen: ScreenParts, nav: Nav) => void;
  reader?: Reader;
};

const isNumber = (v: VarValue): number | null => {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const asBool = (v: VarValue) => (typeof v === "string" ? v !== "" && v !== "false" && v !== "0" : !!v);

/** a value put into a variable keeps to the variable's type; null when it cannot */
function coerce(v: VarValue, type: AppVar["type"]): VarValue | null {
  if (type === "text" || type === "color") return String(v);
  if (type === "bool") return asBool(v);
  return isNumber(v);
}

/** what holds something: words, a tick, a choice */
const holdsValue = (v: unknown) => (typeof v === "string" ? v.trim() !== "" : typeof v === "boolean" ? v : typeof v === "number" ? v >= 0 : false);

/** a value as words, for what is not one of a variable's kinds */
const asWords = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

const AppContext = createContext<AppState | null>(null);

const NO_VARS: AppVar[] = [];
const NO_KEYS: string[] = [];

/** the app's memory under the screens; `vars` are the design's variables, `hidden` the parts (by key) hidden until a
 *  tap shows them, `reader` reads its expressions, `handle` runs the API's effects */
export function AppProvider({ vars = NO_VARS, hidden = NO_KEYS, reader, handle, children }: { vars?: AppVar[]; hidden?: string[]; reader?: Reader; handle?: EffectHandler; children?: ReactNode }) {
  const startHidden = useMemo(() => new Set(hidden), [hidden]);
  const types = useMemo(() => new Map(vars.map((v) => [v.id, v])), [vars]);
  const [state, setState] = useState<State>(() => ({ vars: Object.fromEntries(vars.map((v) => [v.id, v.value])), hidden: {}, props: {}, fields: {}, snack: null }));
  /* the state as the last tap left it: effects in a row each see what the one before did */
  const latest = useRef(state);
  const update = useCallback((fn: (s: State) => State) => {
    latest.current = fn(latest.current);
    setState(latest.current);
  }, []);
  const varScope = useMemo(() => {
    const out: Record<string, VarValue> = { ...state.vars };
    for (const v of vars) if (v.name && v.id in state.vars) out[v.name] = state.vars[v.id];
    return out;
  }, [state.vars, vars]);

  const app = useMemo<AppState>(() => {
    const scopeOf = (here?: Here): Scope => ({ ...here?.scope, vars: { ...varsOf(latest.current.vars, vars) } });
    const holds = (c: Condition | undefined, here?: Here): boolean => {
      if (!c) return true;
      if ("expr" in c) return reader ? truthy(reader.ev(c.expr, scopeOf(here))) : true;
      if ("filled" in c) return holdsValue(latest.current.fields[c.filled]);
      const v = latest.current.vars[c.var];
      if (v === undefined) return false;
      const same = String(v) === String(c.value);
      return c.op === "neq" ? !same : same;
    };
    const fill = (template: string, here?: Here) => (reader && template.includes("{{") ? reader.fill(template, scopeOf(here)) : template);
    const write = (s: State, id: string, value: VarValue): State => ({ ...s, vars: { ...s.vars, [id]: value } });
    const effect = (e: Effect, here: Here) => {
      switch (e.do) {
        case "show":
        case "hide":
        case "toggle":
        case "open":
        case "close":
          update((s) => {
            const now = s.hidden[e.part] ?? startHidden.has(e.part);
            const hide = e.do === "toggle" ? !now : e.do === "hide" || e.do === "close";
            return { ...s, hidden: { ...s.hidden, [e.part]: hide } };
          });
          return true;
        case "setVar": {
          const type = types.get(e.var)?.type;
          const raw = typeof e.expr === "string" ? (reader ? reader.ev(e.expr, scopeOf(here)) : undefined) : e.value;
          const given: VarValue | undefined = raw === undefined || raw === null ? undefined : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : asWords(raw);
          const value = type && given !== undefined ? coerce(given, type) : null;
          if (value !== null) update((s) => write(s, e.var, value));
          return true;
        }
        case "toggleVar": {
          const v = types.get(e.var);
          if (v) update((s) => write(s, e.var, v.type === "bool" ? !asBool(s.vars[e.var] ?? v.value) : (s.vars[e.var] ?? v.value)));
          return true;
        }
        case "addVar": {
          const v = types.get(e.var);
          if (v && Number.isFinite(e.by))
            update((s) => {
              const next = Math.round(((isNumber(s.vars[e.var] ?? v.value) ?? 0) + e.by) * 1e6) / 1e6;
              return write(s, e.var, coerce(next, v.type) ?? next);
            });
          return true;
        }
        case "setProp":
          update((s) => ({ ...s, props: { ...s.props, [e.part]: { ...s.props[e.part], [e.prop]: e.value } } }));
          return true;
        case "snackbar":
          update((s) => ({ ...s, snack: { id: (s.snack?.id ?? 0) + 1, message: fill(e.message, here) } }));
          return true;
        default:
          return false;
      }
    };
    const run = (body: ActionBody | undefined, here: Here, screen: ScreenParts, nav: Nav) => {
      if (!body) return;
      for (const e of body.effects ?? []) {
        if (!effect(e, here)) handle?.(e, { here, screen, nav, run: (next, at) => run(next, at, screen, nav) });
      }
      if (body.to === "back") nav.back();
      else if (body.to === "link") {
        if (body.url) nav.open(body.url);
      } else if (body.to && body.to !== "none") {
        const params = body.params && Object.keys(body.params).length ? Object.fromEntries(Object.entries(body.params).map(([k, x]) => [k, reader ? reader.ev(x, scopeOf(here)) : undefined])) : undefined;
        nav.go(body.to, { ...(body.overlay ? { overlay: true } : {}), ...(params ? { params } : {}) });
      }
    };
    return {
      vars: state.vars,
      varScope,
      shown: (key, hiddenAtStart = startHidden.has(key)) => !(state.hidden[key] ?? hiddenAtStart),
      prop: <T,>(part: string, prop: string, design: T): T => {
        const v = state.props[part]?.[prop];
        if (v === undefined) return design;
        if (typeof design === "number") return (isNumber(v) ?? design) as T;
        if (typeof design === "boolean") return asBool(v) as T;
        return String(v) as T;
      },
      bound: <T extends VarValue>(varId: string, design: T): T => {
        const v = state.vars[varId];
        if (v === undefined) return design;
        if (typeof design === "number") return (isNumber(v) ?? design) as T;
        if (typeof design === "boolean") return asBool(v) as T;
        return String(v) as T;
      },
      field: (part) => state.fields[part],
      input: (part, value, varId) =>
        update((s) => {
          const type = varId ? types.get(varId)?.type : undefined;
          const next = type ? coerce(value, type) : null;
          return { ...s, fields: { ...s.fields, [part]: value }, ...(varId && next !== null ? { vars: { ...s.vars, [varId]: next } } : {}) };
        }),
      holds,
      fill,
      snack: state.snack,
      dismiss: () => update((s) => ({ ...s, snack: null })),
      run,
      reader,
    };
  }, [state, varScope, vars, types, startHidden, reader, handle, update]);

  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

/** the variables by name and by id, as `vars.` reads them */
function varsOf(values: Record<string, VarValue>, vars: AppVar[]): Record<string, VarValue> {
  const out: Record<string, VarValue> = { ...values };
  for (const v of vars) if (v.name && v.id in values) out[v.name] = values[v.id];
  return out;
}

/** null, false, 0, "", NaN and an empty list do not hold */
const truthy = (v: unknown) => !(v === undefined || v === null || v === false || v === 0 || v === "" || (typeof v === "number" && Number.isNaN(v)) || (Array.isArray(v) && !v.length));

/** an app with nothing remembered: what a screen drawn on its own reads */
const NOTHING: AppState = {
  vars: {},
  varScope: {},
  shown: (_key, hiddenAtStart = false) => !hiddenAtStart,
  prop: (_part, _prop, design) => design,
  bound: (_id, design) => design,
  field: () => undefined,
  input: () => {},
  holds: (c) => !c || "expr" in c,
  fill: (t) => t,
  snack: null,
  dismiss: () => {},
  run: () => {},
};

/** the app's memory (see `AppProvider`); a screen drawn outside one reads the design as it is */
export const useApp = (): AppState => useContext(AppContext) ?? NOTHING;

/** A screen's taps: `act(action, here)` checks the action's condition, then runs the branch it takes (its effects in
 *  order, then where it goes). `screen` is what the screen's taps can act on: its data sources and forms. */
export function useAct(screen: ScreenParts = {}): (action: Action | undefined, here?: Here) => void {
  const app = useApp();
  const nav = useNav();
  const latest = useRef(screen);
  useEffect(() => {
    latest.current = screen;
  });
  return useCallback(
    (action: Action | undefined, here: Here = {}) => {
      if (!action) return;
      const body = app.holds(action.when, here) ? action : action.else;
      app.run(body, here, latest.current, nav);
    },
    [app, nav],
  );
}

/** runs a tap of the design's on its own, `ms` after its screen came on show (a delayed trigger) */
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

/** how long a snackbar stands: Material's short duration */
const SNACK_MS = 4000;

/** the snackbar a tap raised, at the foot of the screen over the bars, for a while */
export function SnackHost() {
  const app = useApp();
  const insets = useContext(SafeAreaInsetsContext);
  const { snack, dismiss } = app;
  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(dismiss, SNACK_MS);
    return () => clearTimeout(t);
  }, [snack, dismiss]);
  if (!snack) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 96 + (insets?.bottom ?? 0), alignItems: "center", zIndex: 100 }}>
      <Snackbar key={snack.id} message={snack.message} testID="snackbar" />
    </View>
  );
}

/** Rows for a part's list prop out of what an expression read: each element's words (its label, name or title), its
 *  icon, its picture and its state (`variant`); the design's own when it reads no list. */
export function rowsOf<T>(v: unknown, design: T, max = 50): T {
  if (!Array.isArray(v)) return design;
  return v.slice(0, max).map((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return { label: asWords(x) };
    const r = x as Record<string, unknown>;
    /* a row keeps the state its part reads from `variant` and `width`, as the editor's preview does */
    return { label: asWords(r.label ?? r.name ?? r.title ?? ""), ...(typeof r.icon === "string" ? { icon: r.icon } : {}), ...(typeof r.image === "string" ? { image: r.image } : {}), ...(typeof r.variant === "string" ? { variant: r.variant } : {}), ...(typeof r.width === "string" ? { width: r.width } : {}) };
  }) as T;
}

/** the option of a list a value names (a form's field holds the words of the option chosen): its place, or -1 */
export function optionOf(rows: readonly { label?: string }[] | undefined, value: unknown): number {
  return value === undefined || value === null || value === "" ? -1 : (rows ?? []).findIndex((r) => r.label === String(value));
}
