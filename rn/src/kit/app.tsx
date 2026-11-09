import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import { Snackbar } from "./composites/content";
import { LaidProvider, OverlayFrame, movesSoFar, useNav, type BackOptions, type Nav } from "./runtime";
import { withAlpha } from "./look";
import { useKit } from "./theme/ThemeProvider";
import { createWorldChannels, vectorOf, type WorldChannel, type WorldInput } from "./world";

/* What a running app remembers beside the screen on show, and what a tap does with it: the variables, the parts a tap
 * has shown or hidden, the overlays it has opened, the props a tap has set, what an input holds when a condition asks
 * whether it is filled, and the snackbar. A tap is the design's action as data (`Action`): its condition, its effects in
 * order, then where it goes.
 *
 * An exported app runs it with the one interpreter every host of the design runs (lib/actions, in packages/app-runtime,
 * docs/交互规则.md): it hands `AppProvider` an `Interpreter` that makes a host of this memory (`KitHost`), the app's
 * runtime (the API, the session, the capabilities) and where taps go. The kit on its own (its gallery, its printed test
 * beds, which have no runtime) runs the effects that are its own with the small runner below: no API, and expressions
 * read by the `Reader` the app hands over, if any. */

export type VarValue = string | number | boolean;

/** a variable of the design and what it starts at */
export type AppVar = { id: string; name: string; type: "text" | "number" | "bool" | "color"; value: VarValue };

/** what expressions read: data, params, vars, item, form, response… */
export type Scope = Record<string, unknown>;

/** reads the design's expressions; without one an expression reads as nothing and a condition on one holds */
export type Reader = { ev: (expr: string, scope: Scope) => unknown; fill: (template: string, scope: Scope) => string };

/** a condition as the design writes it (lib/actions/model.ts): an expression, or an input that holds something */
export type Condition = { filled: string } | { expr: string };

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
  | { do: "call"; operationId: string; args?: Record<string, string>; body?: string; then?: Answer; catch?: Answer; optimistic?: { source: string; remove?: boolean; patch?: Record<string, string> } }
  | { do: "invoke"; capability: string; args?: Record<string, string>; then?: Answer; catch?: Answer }
  | { do: "refresh"; source: string }
  | { do: "loadMore"; source: string }
  | { do: "submit"; form?: string }
  | { do: "signOut" }
  /* an input action for a world view (docs/交互规则.md “输入动作”): a direction, a button pressed or let go */
  | { do: "move"; part: string; action?: string; vector: string }
  | { do: "press" | "release"; part: string; action: string };

/** where a tap goes after its effects: a screen by its key, "back", "link" (to `url`) or "none" */
export type ActionBody = { to: string; params?: Record<string, string>; overlay?: boolean; url?: string; effects?: Effect[]; motion?: BackOptions["motion"] };
export type Action = ActionBody & { when?: Condition; else?: ActionBody };
/** what runs when a call or an invoke is answered: a body that may branch on the answer (docs/交互规则.md, 回答上的条件) */
export type Answer = ActionBody & { when?: Condition; else?: ActionBody };

/** What a tap knows of where it was made: the scope of its expressions, the form it is in, the element of the list its
 *  row was drawn for and its place, the part tapped; the place of a family it was run for (`slot`), what the event that
 *  started it carries (`event`). */
export type Here = { scope?: Scope; form?: unknown; item?: unknown; index?: number; part?: string; slot?: { key: string; index: number }; event?: unknown };

/** What a screen holds that its taps can act on: its key and what it was opened with, its data sources and its forms by
 *  name (a form by its group's id), and what each input a form keeps holds (by the input's id), for a condition that
 *  asks whether it is filled. */
export type ScreenParts = { key?: string; params?: Record<string, unknown>; sources?: Record<string, unknown>; forms?: Record<string, unknown>; inputs?: Record<string, () => unknown> };

/** The app's memory as an interpreter's host reads and writes it (lib/actions `Host`): the variables, what a part shows,
 *  what an input holds, the snackbar, and how many times the visitor has gone somewhere. Parts are named by their key. */
export type KitHost = {
  variable: (id: string) => { type: AppVar["type"]; value: VarValue } | undefined;
  setVar: (id: string, value: VarValue) => void;
  /** the variables as expressions read them: by name and by id */
  varScope: () => Record<string, VarValue>;
  /** whether an input holds something: words, a tick, a choice, a file; one a form keeps is read from it */
  filled: (part: string, screen?: ScreenParts) => boolean;
  shown: (key: string) => boolean;
  setShown: (key: string, on: boolean) => void;
  /** opens or closes an overlay: one with a trigger of its own (a menu) keeps the trigger on show when closed */
  setOpen: (key: string, on: boolean) => void;
  setProp: (part: string, prop: string, value: VarValue) => void;
  toast: (text: string) => void;
  /** the visitor's moves so far (a screen opened, gone back from, laid over or closed) */
  moves: () => number;
  /** an input action for the world view `part` (its item id): its channel delivers it at once */
  worldInput?: (part: string, action: string, value: WorldInput) => void;
};

/** Runs a tap of the design: the exported app's, through the interpreter every host runs (lib/actions). */
export type Interpreter = (action: Action, at: { here: Here; screen: ScreenParts; nav: Nav; kit: KitHost }) => void;

type State = {
  vars: Record<string, VarValue>;
  hidden: Record<string, boolean>;
  opened: Record<string, boolean>;
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
  /** whether an overlay with a trigger of its own (a menu, by its key) is open */
  opened: (key: string) => boolean;
  /** the visitor opened or shut such an overlay */
  setOpened: (key: string, on: boolean) => void;
  /** a prop of a part as a tap has set it, else as the design has it */
  prop: <T>(part: string, prop: string, design: T) => T;
  /** the visitor changed a prop of a part by using it (a row picked): what `prop` reads from now on */
  setProp: (part: string, prop: string, value: VarValue) => void;
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
  /** runs one action body's effects and goes where it says, the variables as they stand (the kit's own runner) */
  run: (body: ActionBody | undefined, here: Here, screen: ScreenParts, nav: Nav) => void;
  /** the app's memory as an interpreter's host reads it */
  kit: KitHost;
  /** the exported app's interpreter, when it has one */
  interpret?: Interpreter;
  reader?: Reader;
  /** the channel the world view `part` (its item id) hears its input actions on */
  world: (part: string) => WorldChannel;
  /** A screen laid over the one on show came up (`Laid`): a modal one (a dialog, an overlay) covers the worlds, letting go
   *  of what they hold, and pauses them when it says so, until it goes. Gives back how to say it went. */
  layerUp: (modal: boolean, pauses: boolean) => () => void;
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

/** what holds something: words, a tick, a choice, a file (a picked one has a name) */
const holdsValue = (v: unknown) =>
  typeof v === "string" ? v.trim() !== "" : typeof v === "boolean" ? v : typeof v === "number" ? v >= 0 : Array.isArray(v) ? v.length > 0 : !!v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string";

/** a value as words, for what is not one of a variable's kinds */
const asWords = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : typeof v === "number" ? String(Math.round(v * 1e10) / 1e10) : String(v));

const AppContext = createContext<AppState | null>(null);

const NO_VARS: AppVar[] = [];
const NO_KEYS: string[] = [];

/** The app's memory under the screens. `vars` are the design's variables, `hidden` the parts (by key) hidden until a tap
 *  shows them, `triggers` the overlays (by key) that keep a trigger of their own on the screen while shut (a menu),
 *  `reader` reads its expressions, `interpret` runs its taps (the exported app's interpreter). */
export function AppProvider({ vars = NO_VARS, hidden = NO_KEYS, triggers = NO_KEYS, reader, interpret, children }: { vars?: AppVar[]; hidden?: string[]; triggers?: string[]; reader?: Reader; interpret?: Interpreter; children?: ReactNode }) {
  const startHidden = useMemo(() => new Set(hidden), [hidden]);
  const triggered = useMemo(() => new Set(triggers), [triggers]);
  const types = useMemo(() => new Map(vars.map((v) => [v.id, v])), [vars]);
  const [state, setState] = useState<State>(() => ({ vars: Object.fromEntries(vars.map((v) => [v.id, v.value])), hidden: {}, opened: {}, props: {}, fields: {}, snack: null }));
  /* the state as the last tap left it: effects in a row each see what the one before did */
  const latest = useRef(state);
  const update = useCallback((fn: (s: State) => State) => {
    latest.current = fn(latest.current);
    setState(latest.current);
  }, []);
  const varScope = useMemo(() => varsOf(state.vars, vars), [state.vars, vars]);
  /* the world views' channels: an input goes straight there, through no state */
  const [worlds] = useState(() => createWorldChannels());
  /* The screens laid over the one on show that are up (`Laid`), and the overlays open: a dialog, a screen an action lays
     over or an overlay part covers the worlds (what they hold let go, nothing more sent) until it goes; a dialog that
     says so pauses them (docs/世界宿主契约.md “浮层”, lib/world/layers.ts). */
  const [layersUp, setLayersUp] = useState<{ id: number; modal: boolean; pauses: boolean }[]>([]);
  const layerIds = useRef(0);
  const layerUp = useCallback((modal: boolean, pauses: boolean) => {
    const id = ++layerIds.current;
    setLayersUp((l) => [...l, { id, modal, pauses }]);
    return () => setLayersUp((l) => l.filter((x) => x.id !== id));
  }, []);
  const covered = layersUp.some((l) => l.modal) || Object.values(state.opened).some(Boolean);
  const paused = layersUp.some((l) => l.modal && l.pauses);
  useEffect(() => {
    worlds.cover(covered);
    worlds.pause(paused);
  }, [worlds, covered, paused]);

  /* the memory as a host reads and writes it: always what the last step left, never what the last render drew */
  const kit = useMemo<KitHost>(() => {
    const write = (id: string, value: VarValue) => update((s) => ({ ...s, vars: { ...s.vars, [id]: value } }));
    const shown = (key: string) => !(latest.current.hidden[key] ?? startHidden.has(key));
    return {
      variable: (id) => {
        const v = types.get(id);
        return v ? { type: v.type, value: latest.current.vars[id] ?? v.value } : undefined;
      },
      setVar: write,
      varScope: () => varsOf(latest.current.vars, vars),
      filled: (part, screen) => holdsValue(screen?.inputs?.[part] ? screen.inputs[part]() : latest.current.fields[part]),
      shown,
      setShown: (key, on) => update((s) => ({ ...s, hidden: { ...s.hidden, [key]: !on } })),
      setOpen: (key, on) =>
        update((s) => ({
          ...s,
          opened: { ...s.opened, [key]: on },
          /* an overlay with no trigger of its own stands only while it is open; a menu's trigger stays */
          ...(on || !triggered.has(key) ? { hidden: { ...s.hidden, [key]: !on } } : {}),
        })),
      setProp: (part, prop, value) => update((s) => ({ ...s, props: { ...s.props, [part]: { ...s.props[part], [prop]: value } } })),
      toast: (message) => update((s) => ({ ...s, snack: { id: (s.snack?.id ?? 0) + 1, message } })),
      moves: movesSoFar,
      worldInput: (part, action, value) => worlds.send(part, action, value),
    };
  }, [types, vars, startHidden, triggered, update, worlds]);

  const app = useMemo<AppState>(() => {
    const scopeOf = (here?: Here): Scope => ({ ...here?.scope, vars: { ...varsOf(latest.current.vars, vars) } });
    const holds = (c: Condition | undefined, here?: Here): boolean => {
      if (!c) return true;
      if ("expr" in c) {
        if (reader) return truthy(reader.ev(c.expr, scopeOf(here)));
        /* the kit on its own reads the one expression a design writes for a variable compared with a value */
        const cmp = comparisonOf(c.expr);
        if (!cmp) return true;
        const v = varsOf(latest.current.vars, vars)[cmp.name];
        return v !== undefined && (String(v) === String(cmp.value)) === (cmp.op === "==");
      }
      if ("filled" in c) return holdsValue(latest.current.fields[c.filled]);
      /* a condition of a form this kit does not know holds never */
      return false;
    };
    const fill = (template: string, here?: Here) => (reader && template.includes("{{") ? reader.fill(template, scopeOf(here)) : template);
    /* the kit's own runner: the effects that are the app's memory, for a kit with no interpreter (no API there) */
    const effect = (e: Effect, here: Here) => {
      switch (e.do) {
        case "show":
        case "hide":
          return kit.setShown(e.part, e.do === "show");
        case "toggle":
          return kit.setShown(e.part, !kit.shown(e.part));
        case "open":
        case "close":
          return kit.setOpen(e.part, e.do === "open");
        case "setVar": {
          const v = kit.variable(e.var);
          const raw = typeof e.expr === "string" ? (reader ? reader.ev(e.expr, scopeOf(here)) : undefined) : e.value;
          const given: VarValue | undefined = raw === undefined || raw === null ? undefined : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : asWords(raw);
          const value = v && given !== undefined ? coerce(given, v.type) : null;
          if (value !== null) kit.setVar(e.var, value);
          return;
        }
        case "toggleVar": {
          const v = kit.variable(e.var);
          if (v) kit.setVar(e.var, v.type === "bool" ? !asBool(v.value) : v.value);
          return;
        }
        case "addVar": {
          const v = kit.variable(e.var);
          if (!v || !Number.isFinite(e.by)) return;
          const next = Math.round(((isNumber(v.value) ?? 0) + e.by) * 1e6) / 1e6;
          return kit.setVar(e.var, coerce(next, v.type) ?? next);
        }
        case "setProp":
          return kit.setProp(e.part, e.prop, e.value);
        case "snackbar":
          return kit.toast(fill(e.message, here));
        case "move": {
          /* a fixed direction as it is ("1,0"); one an expression gives where the app reads expressions, and the event's
             own direction (a pad's push, `event`) where it does not */
          const action = e.action ?? "move";
          const read = reader ? reader.ev(e.vector, scopeOf(here)) : e.vector.trim() === "event" ? here.event : undefined;
          const v = vectorOf(read) ?? vectorOf(e.vector);
          if (v && /^[a-z][a-zA-Z0-9]{0,31}$/.test(action)) kit.worldInput?.(e.part, action, v);
          return;
        }
        case "press":
        case "release":
          return kit.worldInput?.(e.part, e.action, e.do === "press");
        default:
          return;
      }
    };
    const run = (body: ActionBody | undefined, here: Here, _screen: ScreenParts, nav: Nav) => {
      if (!body) return;
      for (const e of body.effects ?? []) effect(e, here);
      if (body.to === "back") {
        if (body.motion) nav.back({ motion: body.motion });
        else nav.back();
      } else if (body.to === "link") {
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
      opened: (key) => !!state.opened[key],
      setOpened: (key, on) => update((s) => ({ ...s, opened: { ...s.opened, [key]: on } })),
      prop: <T,>(part: string, prop: string, design: T): T => {
        const v = state.props[part]?.[prop];
        if (v === undefined) return design;
        if (typeof design === "number") return (isNumber(v) ?? design) as T;
        if (typeof design === "boolean") return asBool(v) as T;
        return String(v) as T;
      },
      setProp: kit.setProp,
      /* a prop bound to a plain read of a variable, as the design's one rule makes it (lib/bindings/expr.ts
         `propValueOf`): a number as it reads, yes or no where words that say no are no, words where a number is
         written as an expression writes it */
      bound: <T extends VarValue>(varId: string, design: T): T => {
        const v = state.vars[varId];
        if (v === undefined) return design;
        if (typeof design === "number") return (isNumber(v) ?? design) as T;
        if (typeof design === "boolean") return asBool(v) as T;
        return asWords(v) as T;
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
      kit,
      ...(interpret ? { interpret } : {}),
      reader,
      world: (part) => worlds.channel(part),
      layerUp,
    };
  }, [state, varScope, vars, types, startHidden, reader, interpret, kit, update, worlds, layerUp]);

  return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}

/** the variables by name and by id, as `vars.` reads them */
function varsOf(values: Record<string, VarValue>, vars: AppVar[]): Record<string, VarValue> {
  const out: Record<string, VarValue> = { ...values };
  for (const v of vars) if (v.name && v.id in values) out[v.name] = values[v.id];
  return out;
}

/* `vars.count == 3`, `vars["v-1"] != "x"`: a variable compared with a value of its type, as the design writes one
   (lib/bindings/bind.ts `comparisonExpr`). Read here only where the app hands the kit no reader of expressions. */
const COMPARISON = /^\s*vars(?:\.([\p{L}_$][\p{L}\p{N}_$]*)|\["((?:[^"\\]|\\.)*)"\])\s*(==|!=)\s*(true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|"(?:[^"\\]|\\.)*")\s*$/u;

/** a comparison of a variable (by name or key) with a value, read off its expression; null for any other */
function comparisonOf(expr: string): { name: string; op: "==" | "!="; value: VarValue } | null {
  const m = COMPARISON.exec(expr);
  if (!m) return null;
  try {
    const name = m[1] ?? (JSON.parse(`"${m[2]}"`) as string);
    return { name, op: m[3] as "==" | "!=", value: JSON.parse(m[4]) as VarValue };
  } catch {
    return null;
  }
}

/** null, false, 0, "", NaN and an empty list do not hold */
const truthy = (v: unknown) => !(v === undefined || v === null || v === false || v === 0 || v === "" || (typeof v === "number" && Number.isNaN(v)) || (Array.isArray(v) && !v.length));

/** the channel of a world view no design reaches */
const QUIET: WorldChannel = { listen: () => () => {}, held: () => ({}) };

/** an app with nothing remembered: what a screen drawn on its own reads */
const NOTHING_KIT: KitHost = {
  variable: () => undefined,
  setVar: () => {},
  varScope: () => ({}),
  filled: () => false,
  shown: () => true,
  setShown: () => {},
  setOpen: () => {},
  setProp: () => {},
  toast: () => {},
  moves: movesSoFar,
};
const NOTHING: AppState = {
  vars: {},
  varScope: {},
  shown: (_key, hiddenAtStart = false) => !hiddenAtStart,
  opened: () => false,
  setOpened: () => {},
  prop: (_part, _prop, design) => design,
  setProp: () => {},
  bound: (_id, design) => design,
  field: () => undefined,
  input: () => {},
  holds: (c) => !c || "expr" in c,
  fill: (t) => t,
  snack: null,
  dismiss: () => {},
  run: () => {},
  kit: NOTHING_KIT,
  /* a world view drawn outside an app hears nothing */
  world: () => QUIET,
  /* nor is anything laid over it */
  layerUp: () => () => {},
};

/** the app's memory (see `AppProvider`); a screen drawn outside one reads the design as it is */
export const useApp = (): AppState => useContext(AppContext) ?? NOTHING;

/** A screen's taps: `act(action, here)` runs the action where it was made. An exported app's interpreter runs it as
 *  every host does (lib/actions); the kit on its own checks its condition and runs the branch it takes. `screen` is
 *  what the screen's taps can act on: its key and params, its data sources, forms and form inputs. */
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
      if (app.interpret) return app.interpret(action, { here, screen: latest.current, nav, kit: app.kit });
      const body = app.holds(action.when, here) ? action : action.else;
      app.run(body, here, latest.current, nav);
    },
    [app, nav],
  );
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

/** The kinds of the fields an event declares (`PartDef.events`), by field: what the printed app cuts a part's
 *  callback down to (lib/partContract.ts `payloadOf`). */
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

/** How a screen stands over the page on show (docs/交互规则.md “分层”): as the layer it is marked as, or laid over by an
 *  action (`overlay`). */
export type LaidLayer = "hud" | "dialog" | "toast" | "overlay";

/** A screen laid over the one on show (docs/交互规则.md “分层”): a screen an action lays over sits in the middle at its own
 *  size over a scrim that closes it; a dialog spreads over the dimmed screen and takes every touch; a HUD and a toast
 *  have no ground of their own and let a touch on nothing of theirs through. While a dialog or an overlay is up, the
 *  worlds under it let go of what they hold and take nothing more, and pause when it says so. */
export function Laid({ layer, pauses = false, onClose, children }: { layer: LaidLayer; pauses?: boolean; onClose?: () => void; children?: ReactNode }) {
  const app = useContext(AppContext);
  const kit = useKit();
  const up = app?.layerUp;
  const modal = layer === "dialog" || layer === "overlay";
  useEffect(() => up?.(modal, pauses), [up, modal, pauses]);
  if (layer === "overlay") return <OverlayFrame onClose={onClose ?? (() => {})}>{children}</OverlayFrame>;
  return (
    <View pointerEvents={modal ? "auto" : "box-none"} style={[StyleSheet.absoluteFill, modal ? { backgroundColor: withAlpha(kit.colors.scrim ?? "#000000", 0.32) } : null]}>
      <LaidProvider value={layer}>{children}</LaidProvider>
    </View>
  );
}
