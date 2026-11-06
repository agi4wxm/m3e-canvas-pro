import { str } from "../parts/print";
import { literal } from "./export/code";
import type { RuntimeSpec } from "./printBehaviour";

/* The text of src/runtime.tsx in an exported project: what the running app remembers and the plain
 * calls the screens make on it. It says what lib/interact.ts says for the preview, written for someone
 * to read in their own project rather than imported, since the project does not have the editor.
 *
 * What a document does not use is not written: a document with no prototype interactions, flows or variables in modes
 * gets the runtime it always got, to the byte. The prototype's moves come from src/lib/screenMotion.ts, a copy of the
 * editor's own lib/screenMotion.ts. */

const union = (names: string[]) => (names.length ? names.map((n) => str(n)).join(" | ") : "never");
const flags = (names: string[]) => `{${names.map((n) => ` ${n}: true`).join(",")}${names.length ? " " : ""}}`;
const TYPE_OF = { text: "string", number: "number", bool: "boolean", color: "string" } as const;
/** a key of an object as code: a name where it is one, else quoted */
const keyOf = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k));
/** what is written only when `on` */
const when = (on: unknown, text: string) => (on ? text : "");

/** the tables of the variables in modes and of the design fields bound to them, or "" when there are none */
function modesSource(spec: RuntimeSpec): string {
  const m = spec.modes;
  if (!m) return "";
  const out: string[] = [];
  if (m.collections.length) {
    const screens = Object.entries(m.screens)
      .map(([screen, modes]) => `  ${keyOf(screen)}: { ${Object.entries(modes).map(([c, [light, dark]]) => `${keyOf(c)}: [${str(light)}, ${str(dark)}]`).join(", ")} },`)
      .join("\n");
    const values = Object.entries(m.values)
      .map(([name, at]) => `  ${keyOf(name)}: { collection: ${str(at.collection)}, values: { ${Object.entries(at.values).map(([mode, v]) => `${keyOf(mode)}: ${str(v)}`).join(", ")} } },`)
      .join("\n");
    out.push(`
/** the collections of variables that have more than one mode (light and dark, compact and roomy) */
type Collection = ${union(m.collections)}
/** The mode of each collection a screen shows, while the app is light and while it is dark: the screen's own choice,
 *  else the document's, else the collection's dark mode while the app is dark, else its first. */
const SCREEN_MODES: Record<ScreenId, Record<Collection, readonly [light: string, dark: string]>> = {
${screens}
}
/** each variable's value in the modes of its collection; one a tap or an input has written keeps what was written */
const MODE_VALUES: { [K in keyof Vars]?: { collection: Collection; values: Record<string, Vars[K]> } } = {
${values}
}
`);
  }
  if (m.bound.length) {
    out.push(`
/** the variables design fields (a fill, a stroke, the words' color, the opacity, a radius, the rotation) are bound to:
 *  the CSS variable a screen defines for each (\`varStyle\`), which the fields read */
const BOUND: { [K in keyof Vars]?: { css: string; kind: "color" | "number" } } = {
${m.bound.map((b) => `  ${keyOf(b.key)}: { css: ${str(`--m3e-v-${b.css}`)}, kind: ${str(b.kind)} },`).join("\n")}
}

/** a color as the document writes one (a theme role, a role with a share of it showing, a hex) in CSS */
function colorCss(ref: string): string | undefined {
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(ref)) return ref
  const role = /^([a-z]+(?:-[a-z]+)*)(?:\\/(\\d{1,3}))?$/.exec(ref)
  if (!role) return undefined
  const alpha = role[2] === undefined ? 100 : Number(role[2])
  if (alpha > 100) return undefined
  return alpha === 100 ? \`var(--md-sys-color-\${role[1]})\` : \`color-mix(in srgb, var(--md-sys-color-\${role[1]}) \${alpha}%, transparent)\`
}

/** a number as a field reads one: on and off are one and nothing, words are read as the number they say */
function numberOf(value: Value): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "boolean" ? (value ? 1 : 0) : value.trim() ? Number(value) : NaN
  return Number.isFinite(n) ? n : undefined
}

/** the CSS variables of the bound design fields, with these values; one that is no value of its kind is left out, and
 *  its fields keep the value they were drawn with */
function varStyleOf(vars: Vars): CSSProperties {
  const out: Record<string, string> = {}
  for (const [name, bound] of Object.entries(BOUND)) {
    if (!bound) continue
    const value: Value = vars[name as keyof Vars]
    const css = bound.kind === "color" ? (typeof value === "string" ? colorCss(value) : undefined) : numberOf(value)?.toString()
    if (css !== undefined) out[bound.css] = css
  }
  return out as CSSProperties
}
`);
  }
  if (m.collections.length)
    out.push(`
/** the variables as a screen shows them: what a tap or an input wrote, else each one's value in that screen's mode */
function varsOn(s: State, screen: ScreenId, dark: boolean): Vars {
  const out: Record<string, Value> = { ...s.vars }
  for (const [name, at] of Object.entries(MODE_VALUES)) {
    if (!at || s.written[name as keyof Vars]) continue
    const mode = SCREEN_MODES[screen][at.collection][dark ? 1 : 0]
    if (mode in at.values) out[name] = at.values[mode]
  }
  return out as Vars
}
`);
  return out.join("");
}

/** The variables as expressions read them (`vars.<name>`): by the names the design gave them and by their ids. */
function exprVarsSource(spec: RuntimeSpec): string {
  const names = spec.exprs?.vars ?? {};
  if (!Object.keys(names).length) return "";
  return `
/** each variable's names and id, as expressions read it (\`vars.<name>\`) */
const VAR_NAMES: Partial<Record<keyof Vars, readonly string[]>> = {
${Object.entries(names).map(([key, n]) => `  ${keyOf(key)}: ${str(n)},`).join("\n")}
}

/** the variables as expressions read them: by the names the design gave them, and by their ids */
export function scopeVars(vars: Vars): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const [key, names] of Object.entries(VAR_NAMES) as [keyof Vars, readonly string[]][]) for (const name of names) out[name] = vars[key]
  return out
}
`;
}

/** what the runtime keeps for the product's bindings: each screen's params, the screens that need a session, the
 *  sign-in screen */
function boundSource(spec: RuntimeSpec): string {
  const b = spec.bound;
  if (!b) return "";
  const params = Object.entries(b.params);
  return `
/** the params each screen takes (its address carries them), and what each reads when it is opened without one */
const PARAMS: Partial<Record<ScreenId, readonly ParamSpec[]>> = {
${params.map(([screen, list]) => `  ${keyOf(screen)}: ${literal(list)},`).join("\n")}
}

/** the screens that need a session: the sign-in screen comes first, then on to them */
const NEEDS_SIGN_IN: Partial<Record<ScreenId, true>> = ${flags(b.auth)}

/** the sign-in screen: a refusal for want of a session, and a screen that needs one, go here */
const SIGN_IN: ScreenId | undefined = ${b.signIn ? str(b.signIn) : "undefined"}

/** where the app goes once signed in: back where it was sent from, or on to the screen that needed the session */
type Return = { back: true } | { entry: Entry }

/** a screen opened: the sign-in screen first when it needs a session there is none of */
function opened(s: State, entry: Entry, signedIn: boolean, remember: (to: Return) => void): State {
  if (SIGN_IN && NEEDS_SIGN_IN[entry.screen] && !signedIn && entry.screen !== SIGN_IN) {
    remember({ entry })
    return { ...s, ${when(spec.proto?.overlay, "overlay: null, ")}move: { transition: "fade", backwards: false }, stack: [...s.stack, { screen: SIGN_IN, transition: "fade" }] }
  }
  return { ...s, ${when(spec.proto?.overlay, "overlay: null, ")}move: { transition: entry.transition, backwards: false${when(spec.proto, ", motion: entry.motion")} }, stack: [...s.stack, entry] }
}

/** the params a screen reads: what it was opened with, each as its type has it, else its example */
export function useScreenParams(): ScreenParams {
  const page = useContext(ScreenContext)
  const app = useContext(AppContext)
  const screen = page?.screen ?? app?.screen
  const given = page ? page.params : app?.params
  return useMemo(() => screenParams(screen ? PARAMS[screen] : undefined, given), [screen, given])
}
`;
}

export function runtimeSource(spec: RuntimeSpec): string {
  /* what of the prototype the screens use: an animation, an overlay, a part scrolled to, the pointer, time */
  const p = spec.proto;
  const modes = !!spec.modes?.collections.length;
  const bound = !!spec.modes?.bound.length;
  const flows = spec.flows ?? [];
  /* the screen a part is drawn on, and whether it can be used (src/App.tsx says): what a delay waits for, what is
     scrolled into view, the modes a screen reads */
  const bd = spec.bound;
  const page = !!p || !!spec.modes || !!bd;
  /* the prototype reads its expressions itself, over its variables (the product's screens read theirs in the runtime) */
  const exprs = !!spec.exprs && !bd;
  /* the dark mode is read where the app follows it: a variable that drives it, or collections with a dark mode */
  const colorMode = !!spec.dark || !!spec.modes?.followsDark;
  const react = ["createContext", "useContext", "useEffect", "useMemo", ...(p?.delay ? ["useRef"] : []), "useState", ...(bound ? ["type CSSProperties"] : []), "type MouseEvent", "type ReactNode"];
  const varNames = !!Object.keys(spec.exprs?.vars ?? {}).length;
  const firstFlow = flows[0];
  /* With more than one variable, `[name]` is read as any key; with one it is that variable's own, and a value of another
     type for it (a toggle of words) would not typecheck. The value is the runtime's to keep right, so the key is read
     as any key there too. */
  const key = spec.vars.length === 1 ? "name as string" : "name";
  /* what a call that changes a variable writes: with modes, it is marked as written, so it keeps its value on every screen */
  const write = (value: string) => (modes ? `wrote(s, name, ${value})` : `({ ...s, vars: { ...s.vars, [${key}]: ${value} } })`);
  /* what a variable reads now: with modes, as the screen on show has it */
  const darkOn = colorMode ? "darkOn" : "false";
  const now = modes ? `varsOn(s, s.stack[s.stack.length - 1].screen, ${darkOn})[name]` : "s.vars[name]";
  const overlayGone = when(p?.overlay, "overlay: null, ");
  return `// Generated by M3E Canvas. What the running app remembers: the screen on show and how it got
// there, the variables, and what taps have shown, hidden, opened or changed.
import { ${react.join(", ")} } from "react"
${colorMode ? 'import { useColorMode } from "@/components/m3e/color-mode-provider"\n' : ""}${when(p, 'import type { Motion, Transition } from "@/lib/screenMotion"\n')}${when(exprs, 'import { holds as holdsExpr } from "@/lib/bindings/expr"\n')}${bd ? `import { screenParams, useRuntime, useSession, type ParamSpec } from ${str(bd.runtime)}\n` : ""}
export type ScreenId = ${union(spec.screens)}
export type PartId = ${union(spec.parts)}
export type Vars = {${spec.vars.map((v) => ` ${v.key}: ${TYPE_OF[v.type]}`).join(";")}${spec.vars.length ? " " : ""}}
${p ? "export type { Motion, Transition }" : `export type Transition = "slide" | "slideLeft" | "slideUp" | "slideDown" | "fade" | "expand" | "none"`}${when(bd, "\n/** what a screen is opened with: its params by name */\nexport type ScreenParams = Record<string, unknown>")}
${
  firstFlow
    ? `
/** where each flow starts (a screen set as a flow's starting point); \`?flow=${firstFlow.key}\` in the address starts the app at one */
export const FLOWS = {
${flows.map((f) => `  ${keyOf(f.key)}: { name: ${str(f.name)}, screen: ${str(f.screen)} },`).join("\n")}
} as const satisfies Record<string, { name: string; screen: ScreenId }>
export type FlowId = keyof typeof FLOWS

/** the flow the address asks for, if it names one */
function flowAsked(): FlowId | undefined {
  const asked = new URLSearchParams(window.location.search).get("flow")
  return asked !== null && Object.hasOwn(FLOWS, asked) ? (asked as FlowId) : undefined
}

/** the first flow is where the app starts, unless the address asks for another */
const START_SCREEN: ScreenId = FLOWS[flowAsked() ?? ${str(firstFlow.key)}].screen`
    : `
const START_SCREEN: ScreenId = ${str(spec.screens[0])}`
}
const START_VARS: Vars = {${spec.vars.map((v) => ` ${v.key}: ${str(v.start)}`).join(",")}${spec.vars.length ? " " : ""}}
const START_HIDDEN: Partial<Record<PartId, boolean>> = ${flags(spec.hidden)}
const START_OPEN: Partial<Record<PartId, boolean>> = ${flags(spec.opened)}
/** what a screen reads as the row last tapped until one has been */
const START_CURRENT: Record<string, string> = ${str(spec.current)}
/** how long a snackbar stands: Material's short duration */
const SNACK_MS = 4000

type Value = string | number | boolean
type Entry = { screen: ScreenId; transition: Transition${when(p, "; motion?: Motion")}${when(bd, "; params?: ScreenParams")} }
type Move = { transition: Transition; backwards: boolean${when(p, "; motion?: Motion")} }
type State = {
  stack: Entry[]
  move: Move
${when(p?.overlay, "  /** a screen laid over the one on show, and how it came in */\n  overlay: Entry | null\n")}  vars: Vars
${when(modes, "  /** the variables a tap or an input has written: they keep that value on every screen, whatever mode it shows */\n  written: Partial<Record<keyof Vars, true>>\n")}  hidden: Partial<Record<PartId, boolean>>
  opened: Partial<Record<PartId, boolean>>
  props: Partial<Record<PartId, Record<string, Value>>>
  /** a bar's tapped destination; gone once the tap has opened a screen, whose own bar then says */
  tabs: Partial<Record<PartId, number>>
  /** the destination that opened a screen, for a bar there that says nothing itself */
  opener: Record<string, number>
  snack: { id: number; message: string } | null
  /** the row a list's part was last tapped on */
  current: Record<string, string>
}
${modesSource(spec)}${exprVarsSource(spec)}
const START: State = {
  stack: [{ screen: START_SCREEN, transition: "none" }],
  move: { transition: "none", backwards: false },
${when(p?.overlay, "  overlay: null,\n")}  vars: START_VARS,
${when(modes, "  written: {},\n")}  hidden: START_HIDDEN,
  opened: START_OPEN,
  props: {},
  tabs: {},
  opener: {},
  snack: null,
  current: START_CURRENT,
}

export type App = {
  screen: ScreenId
  canGoBack: boolean
  move: Move
  go: (screen: ScreenId, transition?: Transition${when(p, ", motion?: Motion")}) => void
  back: () => void
${when(
  bd,
  `  /** the params the screen on show was opened with */
  params: ScreenParams | undefined
  /** opens a screen with params: what it reads as \`params.<name>\` and its address carries */
  navigate: (screen: ScreenId, params?: ScreenParams, transition?: Transition${when(p, ", motion?: Motion")}) => void
  /** ends the session (the contract's sign-out is told) */
  signOut: () => void
  /** once signed in: back where the app was sent to sign in from, or on to the screen that needed it; whether it went */
  afterSignIn: () => boolean
`,
)}${when(exprs, "  /** whether an expression of the design holds, read over the variables */\n  holds: (expr: string) => boolean\n")}${when(
  p?.overlay,
  `  /** the screen laid over the one on show, if one is: going back, a tap beside it or Escape closes it */
  overlay: Entry | null
  openOverlay: (screen: ScreenId, transition?: Transition, motion?: Motion) => void
  closeOverlay: () => void
`,
)}${when(p?.scroll, "  /** brings a part of the screen in use into view */\n  scrollTo: (part: PartId) => void\n")}${when(firstFlow, "  /** starts a flow over, at its first screen */\n  startFlow: (flow: FlowId) => void\n")}  openLink: (url: string) => void
  vars: Vars
${when(modes, "  /** the variables as a screen shows them, in its own modes */\n  varsOn: (screen: ScreenId) => Vars\n")}${when(bound, "  /** the CSS variables a screen's bound design fields read, as the screen shows its variables */\n  varStyle: (screen: ScreenId) => CSSProperties\n")}  setVar: <K extends keyof Vars>(name: K, value: Vars[K]) => void
  toggleVar: (name: keyof Vars) => void
  addVar: (name: keyof Vars, by: number) => void
  visible: (part: PartId) => boolean
  show: (part: PartId) => void
  hide: (part: PartId) => void
  toggle: (part: PartId) => void
  isOpen: (part: PartId) => boolean
  open: (part: PartId) => void
  close: (part: PartId) => void
  prop: {
    (part: PartId, name: string, start: string): string
    (part: PartId, name: string, start: number): number
    (part: PartId, name: string, start: boolean): boolean
  }
  setProp: (part: PartId, name: string, value: Value) => void
  /** the destination a bar shows: the one tapped, else the screen's own, else the one that opened the screen */
  tab: (bar: PartId, own?: number, start?: number) => number
  selectTab: (bar: PartId, index: number) => void
  leaveTab: (bar: PartId, index: number, opens?: ScreenId) => void
  snack: State["snack"]
  snackbar: (message: string) => void
  current: State["current"]
  pickRow: (row: State["current"]) => void
  /** whether an input holds something: words, a tick, a choice */
  hasValue: (value: Value) => boolean
  asBool: (value: Value) => boolean
}

const AppContext = createContext<App | null>(null)
${when(
  page,
  `
/** the screen a part is drawn on, and whether it can be used: not on its way out, nor under an overlay (src/App.tsx) */
export const ScreenContext = createContext<{ screen: ScreenId; active: boolean${when(bd, "; params?: ScreenParams")} } | null>(null)
`,
)}${boundSource(spec)}
const asBool = (value: Value) => (typeof value === "string" ? value !== "" && value !== "false" && value !== "0" : !!value)
const hasValue = (value: Value) => (typeof value === "string" ? value.trim() !== "" : typeof value === "boolean" ? value : value >= 0)
${when(modes, `\n/** the state with a variable written, and marked as written */\nconst wrote = (s: State, name: keyof Vars, value: Value): State => ({ ...s, vars: { ...s.vars, [${key}]: value }, written: { ...s.written, [name]: true } })\n`)}
export function AppProvider({ children }: { children: ReactNode }) {
${
  spec.dark
    ? `  /* \`${spec.dark}\` is the app's dark mode: it starts at the mode on show, and the colors follow it */
  const colorMode = useColorMode()
  const [state, setState] = useState<State>(() => ({ ...START, vars: { ...START.vars, ${spec.dark}: colorMode.resolvedMode === "dark" } }))
  const darkOn = state.vars.${spec.dark}
  useEffect(() => {
    if (darkOn !== (colorMode.resolvedMode === "dark")) colorMode.setMode(darkOn ? "dark" : "light")
  }, [darkOn, colorMode])`
    : colorMode
      ? `  /* the collections that follow the app's dark mode show their dark mode while it is dark */
  const colorMode = useColorMode()
  const darkOn = colorMode.resolvedMode === "dark"
  const [state, setState] = useState(START)`
      : "  const [state, setState] = useState(START)"
}
  const screen = state.stack[state.stack.length - 1].screen
${when(
  bd,
  `  const runtime = useRuntime()
  /* the screens read whether there is a session; a guard reads it as it is when a screen is opened */
  useSession()
  /* a refusal for want of a session (a 401 no refresh could mend): the sign-in screen, then back once signed in */
  useEffect(
    () =>
      runtime.whenUnauthorized(() =>
        setState((s) => {
          if (!SIGN_IN || s.stack[s.stack.length - 1].screen === SIGN_IN) return s
          runtime.rememberReturn({ back: true })
          return { ...s, ${when(p?.overlay, "overlay: null, ")}move: { transition: "fade", backwards: false }, stack: [...s.stack, { screen: SIGN_IN, transition: "fade" }] }
        }),
      ),
    [runtime],
  )
`,
)}
  /* every call goes through the state before it: effects of one tap run in order */
  const app = useMemo<App>(() => {
    const prop = ((part: PartId, name: string, start: Value) => state.props[part]?.[name] ?? start) as App["prop"]
${when(modes, `    /* a screen reads what a tap or an input wrote, else each variable's value in the mode it shows */\n    const shownOn = (on: ScreenId) => varsOn(state, on, ${darkOn})\n`)}    ${when(bd, "const remember = (to: Return) => runtime.rememberReturn(to)\n    ")}return {
      screen,
      canGoBack: state.stack.length > 1${when(p?.overlay, " || !!state.overlay")},
      move: state.move,
${when(
  bd,
  `      params: state.stack[state.stack.length - 1].params,
      navigate: (to, params, transition = "slide"${when(p, ", motion")}) => setState((s) => opened(s, { screen: to, transition, ${when(p, "motion, ")}params }, runtime.session.signedIn, remember)),
      signOut: () => runtime.signOut(),
      afterSignIn: () => {
        const to = runtime.takeReturn<Return>()
        if (!to) return false
        setState((s) =>
          "back" in to
            ? { ...s, move: { transition: "fade", backwards: true }, stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack }
            : { ...s, move: { transition: "fade", backwards: false }, stack: [...s.stack.slice(0, -1), to.entry] },
        )
        return true
      },
`,
)}${when(exprs, '      holds: (expr) => holdsExpr(expr, { vars: ' + (varNames ? "scopeVars(state.vars)" : "{}") + ', now: new Date().toISOString() }, { lang: document.documentElement.lang || "en" }),\n')}${
  p
    ? `      go: (to, transition = "slide", motion) => setState((s) => ${bd ? "opened(s, { screen: to, transition, motion }, runtime.session.signedIn, remember)" : `({ ...s, ${overlayGone}move: { transition, backwards: false, motion }, stack: [...s.stack, { screen: to, transition, motion }] })`}),
      /* an overlay is what going back closes first */
      back: () =>
        setState((s) => {
${when(p.overlay, "          if (s.overlay) return { ...s, overlay: null }\n")}          if (s.stack.length < 2) return s
          const { transition, motion } = s.stack[s.stack.length - 1]
          return { ...s, move: { transition, backwards: true, motion }, stack: s.stack.slice(0, -1) }
        }),
`
    : `      go: (to, transition = "slide") => setState((s) => ${bd ? "opened(s, { screen: to, transition }, runtime.session.signedIn, remember)" : "({ ...s, move: { transition, backwards: false }, stack: [...s.stack, { screen: to, transition }] })"}),
      back: () => setState((s) => (s.stack.length < 2 ? s : { ...s, move: { transition: s.stack[s.stack.length - 1].transition, backwards: true }, stack: s.stack.slice(0, -1) })),
`
}${when(
  p?.overlay,
  `      overlay: state.overlay,
      openOverlay: (to, transition = "slide", motion) => setState((s) => ({ ...s, overlay: { screen: to, transition, motion } })),
      closeOverlay: () => setState((s) => (s.overlay ? { ...s, overlay: null } : s)),
`,
)}${when(
  p?.scroll,
  `      scrollTo: (part) => {
        /* on the screen in use, smoothly unless the visitor asks for less motion */
        const target = document.querySelector(\`[data-active] [data-part="\${CSS.escape(part)}"]\`)
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        target?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest", inline: "nearest" })
      },
`,
)}${when(firstFlow, `      startFlow: (flow) => setState((s) => ({ ...s, ${overlayGone}move: { transition: "fade", backwards: false }, stack: [{ screen: FLOWS[flow].screen, transition: "fade" }] })),\n`)}      openLink: (url) => void window.open(url, "_blank", "noopener,noreferrer"),
      vars: ${modes ? "shownOn(screen)" : "state.vars"},
${when(modes, "      varsOn: shownOn,\n")}${when(bound, `      varStyle: (on) => varStyleOf(${modes ? "shownOn(on)" : "state.vars"}),\n`)}      setVar: (name, value) => setState((s) => ${write("value")}),
      toggleVar: (name) => setState((s) => ${write(`!${now}`)}),
      addVar: (name, by) =>
        setState((s) => {
          const now: unknown = ${now}
          /* tenths added together should not read 0.30000000000000004 */
          const next = Math.round(((Number(now) || 0) + by) * 1e6) / 1e6
          return ${modes ? 'wrote(s, name, typeof now === "string" ? String(next) : next)' : `{ ...s, vars: { ...s.vars, [${key}]: typeof now === "string" ? String(next) : next } }`}
        }),
      visible: (part) => !state.hidden[part],
      show: (part) => setState((s) => ({ ...s, hidden: { ...s.hidden, [part]: false } })),
      hide: (part) => setState((s) => ({ ...s, hidden: { ...s.hidden, [part]: true } })),
      toggle: (part) => setState((s) => ({ ...s, hidden: { ...s.hidden, [part]: !s.hidden[part] } })),
      isOpen: (part) => !!state.opened[part],
      open: (part) => setState((s) => ({ ...s, hidden: { ...s.hidden, [part]: false }, opened: { ...s.opened, [part]: true } })),
      close: (part) => setState((s) => ({ ...s, opened: { ...s.opened, [part]: false } })),
      prop,
      /* the cast is for an app with no parts at all: its \`PartId\` is never, and never cannot be spread */
      setProp: (part, name, value) => setState((s) => ({ ...s, props: { ...s.props, [part]: { ...(s.props[part] as Record<string, Value> | undefined), [name]: value } } })),
      tab: (bar, own, start = 0) => {
        const tapped = state.tabs[bar]
        return tapped !== undefined ? tapped : own !== undefined ? own : (state.opener[\`\${bar}:\${screen}\`] ?? start)
      },
      selectTab: (bar, index) => setState((s) => ({ ...s, tabs: { ...s.tabs, [bar]: index } })),
      leaveTab: (bar, index, opens) =>
        setState((s) => {
          const { [bar]: _gone, ...tabs } = s.tabs
          return { ...s, tabs: tabs as State["tabs"], opener: opens ? { ...s.opener, [\`\${bar}:\${opens}\`]: index } : s.opener }
        }),
      snack: state.snack,
      snackbar: (message) => setState((s) => ({ ...s, snack: { id: (s.snack?.id ?? 0) + 1, message } })),
      current: state.current,
      pickRow: (row) => setState((s) => ({ ...s, current: row })),
      hasValue,
      asBool,
    }
  }, [state, screen${when(modes && !spec.dark && colorMode, ", darkOn")}${when(bd, ", runtime")}])

  const snack = state.snack
  useEffect(() => {
    if (!snack) return
    const id = window.setTimeout(() => setState((s) => (s.snack === snack ? { ...s, snack: null } : s)), SNACK_MS)
    return () => window.clearTimeout(id)
  }, [snack])

  return <AppContext.Provider value={app}>{children}</AppContext.Provider>
}

export function useApp(): App {
  const app = useContext(AppContext)
${when(modes, "  const page = useContext(ScreenContext)\n")}  if (!app) throw new Error("useApp must be used inside <AppProvider>")
${modes ? "  /* a screen reads its variables in the modes it shows */\n  return page ? { ...app, vars: app.varsOn(page.screen) } : app" : "  return app"}
}

/* a click reaches the part it landed on first; the container around that part must not take it too */
const taken = new WeakSet<Event>()
/** the buttons inside an overlay that dismiss it, whichever overlay it is */
const CLOSERS = '[data-slot$="-close"], [data-slot="alert-dialog-cancel"], [data-slot="alert-dialog-action"]'

/** Catches the taps of a part it stands around, without adding a box to the layout. A part marks the
 *  places inside it that answer on their own with \`data-tap\` (a destination, a menu item), overlays
 *  in a portal included, since a React click bubbles through the portal. Anywhere else is the whole part.${when(p?.hover || p?.delay, `
 *  What starts otherwise starts here too: the pointer coming over the part (\`onHover\`), or time since its screen came
 *  into use (\`onAfter\`, \`after\` ms later), as in the editor's preview.`)} */
export function Pressable({ onPress, ${when(p?.hover, "onHover, ")}${when(p?.delay, "after, onAfter, ")}slots, onTab, onClose, children }: { onPress?: () => void; ${when(p?.hover, "onHover?: () => void; ")}${when(p?.delay, "after?: number; onAfter?: () => void; ")}slots?: Record<string, () => void>; onTab?: (index: number) => void; onClose?: () => void; children: ReactNode }) {
${when(
  p?.delay,
  `  /* the timer starts when the screen comes into use, and again each time it does (an overlay over it closed); it runs
     what the part says then, not what it said when the timer started */
  const active = useContext(ScreenContext)?.active ?? true
  const timed = useRef(onAfter)
  useEffect(() => {
    timed.current = onAfter
  })
  useEffect(() => {
    if (after === undefined || !active) return
    const id = window.setTimeout(() => timed.current?.(), after)
    return () => window.clearTimeout(id)
  }, [after, active])
`,
)}  const click = (event: MouseEvent<HTMLDivElement>) => {
    if (taken.has(event.nativeEvent)) return
    taken.add(event.nativeEvent)
    const target = event.target as Element
    const slot = target.closest("[data-tap]")?.getAttribute("data-tap")
    /* a place that works by itself (the arrow that opens a split button's menu) is no press on the part */
    if (slot === "self") return
    if (slot == null) onPress?.()
    else if (slots?.[slot]) slots[slot]()
    else {
      const row = /^tab:(\\d+)$/.exec(slot)
      if (row) onTab?.(Number(row[1]))
      /* a place with no action of its own is still a press on the part */
      onPress?.()
    }
    if (target.closest(CLOSERS)) onClose?.()
    /* a press on a labelled input is how it changes; anywhere else a link in the part must not navigate */
    if (!target.closest("input, textarea, select, label")) event.preventDefault()
  }
  return (
    <div className="contents" onClick={click}${when(p?.hover, " onPointerEnter={onHover}")} role={onPress ? "button" : undefined} tabIndex={onPress ? 0 : undefined}>
      {children}
    </div>
  )
}
`;
}
