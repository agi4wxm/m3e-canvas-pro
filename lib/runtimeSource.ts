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

/** The types and tables the taps run over (lib/actions, the editor's own interpreter): what a tap names in the app
 *  (a part, a variable) and how each is reached, or "" when no tap is printed. */
function actsSource(spec: RuntimeSpec): string {
  const a = spec.acts;
  if (!a) return "";
  const bd = spec.bound;
  const reach = Object.entries(a.parts);
  const tabs = Object.entries(a.tabs);
  return `
export type { Action }
/** Where a tap was made, as its screen says it: the part, the row of data it was drawn for, the form it is in, the
 *  entry of a family of places it was made on (\`slot\`), or the event that started it (\`event\`, cut down to what the
 *  part \`declared\` of it) */
export type TapAt = { part?: string; item?: unknown; index?: number; form?: string; slot?: { key: string; index: number }; event?: unknown; declared?: Record<string, string> }

/** what an event carries as its part declares it: only the fields declared, each of its kind (lib/partContract.ts \`payloadOf\`) */
function eventOf(raw: unknown, declared: Record<string, string>): Record<string, unknown> {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: Record<string, unknown> = {}
  for (const [k, kind] of Object.entries(declared)) {
    const v = given[k]
    if (kind === "text" && typeof v === "string") out[k] = v.slice(0, 20000)
    else if (kind === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (kind === "bool" && typeof v === "boolean") out[k] = v
    else if (kind === "list" && Array.isArray(v)) out[k] = v.slice(0, 1000)
    else if (kind === "object" && v && typeof v === "object" && !Array.isArray(v)) out[k] = v
  }
  return out
}

/** a tap as the interpreter takes it: the event cut down to what the part declares */
const tapOf = ({ declared, ...at }: TapAt): Omit<TapAt, "declared"> => (declared ? { ...at, event: eventOf(at.event, declared) } : at)
${when(
  bd,
  `/** What a screen gives the taps made on it: its scope as it was last drawn (its data, its params), the calls its taps
 *  make through the client, its data sources, its forms (with what follows each one's answer), and the fields of its
 *  forms a condition asks are filled in. The interpreter reads the variables, the session and the forms as they are at
 *  each step. */
export type ScreenActions = {
  scope?: Scope
  calls?: Record<string, { send: (a: CallArgs) => Promise<unknown>; status?: number }>
  sources?: Record<string, SourceHandle>
  forms?: Record<string, { handle: FormHandle; operationId: string; then?: Answer; catch?: Answer }>
  filled?: Record<string, () => unknown>
}
`,
)}
/** each variable's type: what a tap writes keeps to it */
const VAR_TYPES: Record<keyof Vars, VarType> = {${spec.vars.map((v) => ` ${keyOf(v.key)}: ${str(v.type)}`).join(",")}${spec.vars.length ? " " : ""}}
/** the parts a tap shows, hides, opens or closes that do not simply stand alone: the run each shows and hides with, and
 *  how an overlay stands (a dialog only while it is open, a menu keeps its trigger and only its popup opens) */
const REACHES: Record<string, { shows?: PartId; overlay?: "stands" | "menu" } | undefined> = {${reach.map(([k, r]) => ` ${keyOf(k)}: ${literal(r)}`).join(",")}${reach.length ? " " : ""}}
/** the bars whose chosen destination a tap sets, by the prop it sets */
const TAB_PROPS: Record<string, string | undefined> = {${tabs.map(([k, p]) => ` ${keyOf(k)}: ${str(p)}`).join(",")}${tabs.length ? " " : ""}}
${when(bd, `/** the operation that signs in: once it answers, the app goes back where it was sent to sign in from */\nconst LOGIN: string | undefined = ${bd?.login ? str(bd.login) : "undefined"}\n`)}${when(
  !bd,
  `
/** what the taps ask of an API this prototype does not have: each is said once, in the console (and in the README) */
const ASKED = new Set<string>()
function unreached(what: string) {
  if (ASKED.has(what)) return
  ASKED.add(what)
  console.warn(\`This prototype has no API: \${what} is not run. Export the product to run it.\`)
}
`,
)}${when(
    a.mocks,
    `
/** what the capabilities the taps invoke answer in this prototype: the mock library's answers, as in the editor's preview */
const MOCK_CAPABILITIES = ${literal({ ...(a.mocks?.rules ? { capabilities: a.mocks.rules } : {}), ...(a.mocks?.locale ? { locale: a.mocks.locale } : {}) })}
const CAPABILITY_SPEC: CapabilitySpec | undefined = ${a.mocks?.spec ? literal(a.mocks.spec) : "undefined"}
`,
  )}`;
}

/** the host the interpreter runs a tap over (lib/actions `Host`): the state as each step leaves it */
function hostSource(spec: RuntimeSpec): string {
  const a = spec.acts!;
  const bd = spec.bound;
  const p = spec.proto;
  const modes = !!spec.modes?.collections.length;
  const colorMode = !!spec.dark || !!spec.modes?.followsDark;
  const varNames = !!Object.keys(spec.exprs?.vars ?? {}).length;
  const dark = spec.dark ? `!!live.current.vars.${spec.dark}` : colorMode ? "darkNow.current" : "false";
  const overlayGone = when(p?.overlay, "overlay: null, ");
  const id = (t: string) => `${t} as PartId`;
  const at = (rest: string) => (bd ? `screens.current[tap.screen as ScreenId]?.${rest}` : "undefined");
  return `
  /* The interpreter (lib/actions) runs what a tap does over the state as each of its steps leaves it, and an answer's
     then and catch over the state as it is when the answer comes: it reads \`live\`, never what was last drawn */
  const latest = useRef<App | null>(null)
${when(bd, "  /** what each screen gives the taps made on it, as it was last drawn (useActions) */\n  const screens = useRef<Partial<Record<ScreenId, ScreenActions>>>({})\n")}${when(a.mocks, "  const answers = useRef<CapabilityHost>(capabilities ?? createMockCapabilities(MOCK_CAPABILITIES, CAPABILITY_SPEC))\n")}  const host = useMemo<Host>(() => {
    const app = () => latest.current!
    const top = () => live.current.stack[live.current.stack.length - 1].screen
    const varsNow = (): Vars => ${modes ? `varsOn(live.current, top(), ${dark})` : "live.current.vars"}
    const reach = (part: string) => REACHES[part]
    const shows = (part: string) => (reach(part)?.shows ?? part) as PartId
    return {
      scope: (tap) => ({
${when(bd, "        ...screens.current[tap.screen as ScreenId]?.scope,\n")}        vars: ${varNames ? "scopeVars(varsNow())" : "{}"},
        params: tap.params ?? {},
${
  bd
    ? `        auth: { signedIn: !!runtime.session.get().session || runtime.session.get().presumed, user: runtime.session.get().session?.user ?? null },
        now: new Date(runtime.ctx().now ?? Date.now()).toISOString(),
`
    : "        now: new Date().toISOString(),\n"
}        ...(tap.item !== undefined ? { item: tap.item, index: tap.index } : {}),
${when(bd, `        ...(tap.form && ${at("forms?.[tap.form]")} ? { form: ${at("forms?.[tap.form]")}!.handle.controller.view() } : {}),\n`)}      }),
      ctx: () => ${bd ? "runtime.ctx()" : '({ lang: document.documentElement.lang || "en", now: Date.now() })'},
      variable: (name) => (Object.hasOwn(VAR_TYPES, name) ? { type: VAR_TYPES[name as keyof Vars], value: varsNow()[name as keyof Vars] } : undefined),
      setVar: (name, value) => app().setVar(name as keyof Vars, value as never),
      filled: (part) => {
${when(bd, "        for (const s of Object.values(screens.current)) {\n          const read = s?.filled?.[part]\n          if (read) return isFilled(read())\n        }\n")}        return Object.hasOwn(VAR_TYPES, part) && hasValue(varsNow()[part as keyof Vars])
      },
      shown: (part) => (reach(part)?.overlay === "stands" ? !!live.current.opened[${id("part")}] : !live.current.hidden[shows(part)]),
      setShown: (part, on) => {
        if (reach(part)?.overlay === "stands") return on ? app().open(${id("part")}) : app().close(${id("part")})
        return on ? app().show(shows(part)) : app().hide(shows(part))
      },
      setOpen: (part, on) => {
        if (reach(part)?.overlay) return on ? app().open(${id("part")}) : app().close(${id("part")})
        return on ? app().show(shows(part)) : app().hide(shows(part))
      },
      setProp: (part, prop, value) => (TAB_PROPS[part] === prop ? app().selectTab(${id("part")}, Number(value) || 0) : app().setProp(${id("part")}, prop, value)),
      toast: (words) => app().snackbar(words),
      go: (to, o) => {
${when(p?.overlay, "        if (o.overlay) return app().openOverlay(to as ScreenId, undefined, o.motion)\n")}        ${bd ? `app().navigate(to as ScreenId, o.params${when(p, ", undefined, o.motion")})` : `app().go(to as ScreenId${when(p, ", undefined, o.motion")})`}
      },
      back: (${p ? "o" : ""}) => app().back(${p ? "o?.motion" : ""}),
      openLink: (url) => app().openLink(url),
      scrollTo: (${p?.scroll ? "part" : ""}) => ${p?.scroll ? `app().scrollTo(${id("part")})` : "{}"},
${
  bd
    ? `      call: async (operation, args, tap) => {
        const c = ${at("calls?.[operation]")}
        if (!c) return { ok: false, status: 0, error: runtime.errorOf(undefined) }
        return outcomeOf(await runtime.call(() => c.send(args), c.status !== undefined ? { status: c.status } : {}))
      },
      invoke: (name, args) => runtime.invoke(name, args),
      optimistic: (source, change, tap) => {
        const data = ${at("sources?.[source]")}
        if (!data || tap.item === undefined) return undefined
        return "remove" in change ? data.remove(tap.item) : data.patch(tap.item, change.patch as (row: Record<string, unknown>) => Record<string, unknown>)
      },
      refresh: (source, tap) => void ${at("sources?.[source]")}?.refresh(),
      loadMore: (source, tap) => void ${at("sources?.[source]")}?.loadMore(),
      form: (name, tap) => {
        const f = name ? ${at("forms?.[name]")} : undefined
        return f ? { ...f, id: name! } : undefined
      },
      submit: async (form, tap) => {
        const f = ${at("forms?.[form.id]")}
        return f ? formOutcomeOf(await f.handle.send()) : null
      },
      signOut: () => {
        runtime.signOut()
        /* a screen that needs a session does not stay on show without one */
        if (SIGN_IN && NEEDS_SIGN_IN[top()] && top() !== SIGN_IN) setState((s) => ({ ...s, ${overlayGone}move: { transition: "fade", backwards: false }, stack: [...s.stack, { screen: SIGN_IN, transition: "fade" }] }))
      },
      afterSignIn: (operation) => operation === LOGIN && app().afterSignIn(),
`
    : `      /* a prototype has no API: what reaches for one is said, and goes no further */
      call: (operation) => {
        unreached(\`the call of \${operation}\`)
        return new Promise<never>(() => {})
      },
      invoke: ${a.mocks ? "(name, args) => answers.current.invoke(name, args)" : '(name) => Promise.resolve({ ok: false, error: { type: "not-implemented", capability: name } })'},
      optimistic: () => undefined,
      refresh: (source) => unreached(\`loading \${source} again\`),
      loadMore: (source) => unreached(\`loading more of \${source}\`),
      form: () => {
        unreached("sending a form")
        return undefined
      },
      submit: () => Promise.resolve(null),
      signOut: () => unreached("signing out"),
      afterSignIn: () => false,
`
}      moves: () => moves.current,
    }
  }, [])
  /** runs what a tap does, where it was made; \`{{current.field}}\` reads the row last tapped */
  const act = useCallback((action: Action, tap: Tap) => void run(action, host, { ...tap, current: live.current.current }), [host])
`;
}

/** the hook a screen runs its taps with */
function useActionsSource(spec: RuntimeSpec): string {
  const bd = spec.bound;
  return `
/** What the taps on a screen run on: \`act(action, at)\` runs one with the editor's own interpreter (lib/actions), where
 *  it was made${bd ? ". The screen gives what is its own (`ScreenActions`)" : ""}. */
export function useActions(screen: ScreenId${bd ? ", parts: ScreenActions = {}" : ""}): (action: Action, at?: TapAt) => void {
  const app = useApp()
${
  bd
    ? `  const params = useScreenParams()
  app.screenActions(screen, parts)
  const act = app.act
  return useCallback((action: Action, at: TapAt = {}) => act(action, { screen, params, ...tapOf(at) }), [act, screen, params])`
    : `  const act = app.act
  return useCallback((action: Action, at: TapAt = {}) => act(action, { screen, ...tapOf(at) }), [act, screen])`
}
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
  const acts = spec.acts;
  /* with taps printed as data, what draws the state is behind \`live\`, which every change goes through first */
  const setter = acts ? "setDrawn" : "setState";
  const react = ["createContext", ...(acts ? ["useCallback"] : []), "useContext", "useEffect", "useMemo", ...(p?.delay || acts ? ["useRef"] : []), "useState", ...(bound ? ["type CSSProperties"] : []), "type MouseEvent", "type ReactNode"];
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
${colorMode ? 'import { useColorMode } from "@/components/m3e/color-mode-provider"\n' : ""}${when(p, 'import type { Motion, Transition } from "@/lib/screenMotion"\n')}${when(exprs, 'import { holds as holdsExpr } from "@/lib/bindings/expr"\n')}${when(acts && !bd, 'import type { Host, Tap } from "@/lib/actions/host"\nimport type { Action, VarType } from "@/lib/actions/model"\nimport { run } from "@/lib/actions/run"\n')}${when(acts?.mocks, 'import { createMockCapabilities } from "@/lib/capabilities/mock"\nimport type { CapabilityHost, CapabilitySpec } from "@/lib/capabilities/types"\n')}${when(bd, 'import { PartHostContext, browserCapability } from "@/components/widgets/host"\n')}${bd ? `import { ${acts ? "formOutcomeOf, isFilled, outcomeOf, run, " : ""}screenParams, useRuntime, useSession, ${acts ? "type Action, type Answer, type CallArgs, type FormHandle, type Host, type Scope, type SourceHandle, type Tap, type VarType, " : ""}type ParamSpec } from ${str(bd.runtime)}\n` : ""}
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
${modesSource(spec)}${exprVarsSource(spec)}${actsSource(spec)}
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
${p ? "  /** back, an overlay closing first: a motion given is played backwards in place of the way the screen came in */\n  back: (motion?: Motion) => void" : "  back: () => void"}
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
${when(acts, `  /** runs what a tap does with the editor's own interpreter (lib/actions), where it was made (\`useActions\`) */
  act: (action: Action, tap: Tap) => void
${when(bd, "  /** what a screen gives the taps made on it, as it is drawn now (`useActions`) */\n  screenActions: (screen: ScreenId, parts: ScreenActions) => void\n")}`)}}

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
export function AppProvider({ children${when(acts?.mocks, ", capabilities")} }: { children: ReactNode${when(acts?.mocks, "; capabilities?: CapabilityHost")} }) {
${
  spec.dark
    ? `  /* \`${spec.dark}\` is the app's dark mode: it starts at the mode on show, and the colors follow it */
  const colorMode = useColorMode()
  const [state, ${setter}] = useState<State>(() => ({ ...START, vars: { ...START.vars, ${spec.dark}: colorMode.resolvedMode === "dark" } }))
  const darkOn = state.vars.${spec.dark}
  useEffect(() => {
    if (darkOn !== (colorMode.resolvedMode === "dark")) colorMode.setMode(darkOn ? "dark" : "light")
  }, [darkOn, colorMode])`
    : colorMode
      ? `  /* the collections that follow the app's dark mode show their dark mode while it is dark */
  const colorMode = useColorMode()
  const darkOn = colorMode.resolvedMode === "dark"
  const [state, ${setter}] = useState(START)`
      : `  const [state, ${setter}] = useState(START)`
}
  const screen = state.stack[state.stack.length - 1].screen
${when(
  acts,
  `  /* A tap's steps each read the state as the step before left it (lib/actions), not as it was last drawn: every change
     goes through \`live\` first and is drawn after. A change of the screen on show is a move of the visitor's, which an
     answer that comes late compares with where its tap left them. */
  const live = useRef(state)
  const moves = useRef(0)
  const setState = useCallback((next: State | ((s: State) => State)) => {
    const was = live.current
    live.current = typeof next === "function" ? next(was) : next
    if (live.current.stack !== was.stack${when(p?.overlay, " || live.current.overlay !== was.overlay")}) moves.current++
    setDrawn(live.current)
  }, [])
${when(colorMode && !spec.dark, "  const darkNow = useRef(darkOn)\n  useEffect(() => {\n    darkNow.current = darkOn\n  })\n")}`,
)}${when(
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
${acts ? hostSource(spec) : ""}
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
      /* an overlay is what going back closes first; a back action's own motion, played backwards, takes the place of
         the way the screen came in */
      back: (own) =>
        setState((s) => {
${when(p.overlay, "          if (s.overlay) return { ...s, overlay: null }\n")}          if (s.stack.length < 2) return s
          const { transition, motion } = s.stack[s.stack.length - 1]
          return { ...s, move: { transition, backwards: true, motion: own ?? motion }, stack: s.stack.slice(0, -1) }
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
)}${when(firstFlow, `      startFlow: (flow) => setState((s) => ({ ...s, ${overlayGone}move: { transition: "fade", backwards: false }, stack: [{ screen: FLOWS[flow].screen, transition: "fade" }] })),\n`)}      /* only web pages leave the app: a link made from data (a row's words, a server's answer) could name a script${bd ? ". It opens through the platform's capabilities (`link.open`), which the app can change; with no adapter for it, the browser opens it" : ""} */
      openLink: (url) => {
        const raw = url.trim()
        try {
          const page = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : "https://" + raw)
          if (page.protocol === "http:" || page.protocol === "https:") ${bd ? 'void runtime.invoke("link.open", { url: page.href }).then((out) => { if (!out.ok && out.error.type === "not-implemented") void browserCapability("link.open", { url: page.href }) })' : 'window.open(page.href, "_blank", "noopener,noreferrer")'}
        } catch {
          /* not a link at all */
        }
      },
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
${when(acts, `      act,\n${when(bd, "      screenActions: (on, parts) => {\n        screens.current[on] = parts\n      },\n")}`)}    }
  }, [state, screen${when(modes && !spec.dark && colorMode, ", darkOn")}${when(bd, ", runtime")}${when(acts, ", act")}])
${when(acts, "  latest.current = app\n")}
  const snack = state.snack
  useEffect(() => {
    if (!snack) return
    const id = window.setTimeout(() => setState((s) => (s.snack === snack ? { ...s, snack: null } : s)), SNACK_MS)
    return () => window.clearTimeout(id)
  }, [snack])

${
  bd
    ? `  /* What a part asks of the platform for a control of its own (a copy button) goes through the app's capabilities too;
     one the app has no adapter for is done the browser's way, as it always was */
  const parts = useMemo(() => ({ invoke: (name: string, args: Record<string, unknown>) => runtime.invoke(name, args).then((out) => (!out.ok && out.error.type === "not-implemented" ? browserCapability(name, args) : out)) }), [runtime])

  return (
    <AppContext.Provider value={app}>
      <PartHostContext.Provider value={parts}>{children}</PartHostContext.Provider>
    </AppContext.Provider>
  )`
    : "  return <AppContext.Provider value={app}>{children}</AppContext.Provider>"
}
}

export function useApp(): App {
  const app = useContext(AppContext)
${when(modes, "  const page = useContext(ScreenContext)\n")}  if (!app) throw new Error("useApp must be used inside <AppProvider>")
${modes ? "  /* a screen reads its variables in the modes it shows */\n  return page ? { ...app, vars: app.varsOn(page.screen) } : app" : "  return app"}
}
${acts ? useActionsSource(spec) : ""}
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
