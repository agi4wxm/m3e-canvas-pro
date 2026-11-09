import { str } from "../parts/print";
import { literal } from "./export/code";
import { editorNotesOut } from "./export/copy";
import { fillRegions } from "./export/regions";
import type { RuntimeSpec } from "./printBehaviour";

/* The text of src/runtime.tsx in an exported project: what the running app remembers and the plain calls the screens
 * make on it. It says what lib/interact.ts says for the preview, written for someone to read in their own project
 * rather than imported, since the project does not have the editor.
 *
 * The code is a real file of this repo, lib/export/files/web/runtime.tsx (RUNTIME_TEMPLATE), typechecked and linted as
 * code; what a document does not use is a region of it this drops (lib/export/regions.ts), and its tables are the
 * document's. A document with no prototype interactions, flows or variables in modes gets the runtime it always got,
 * to the byte. The prototype's moves come from src/lib/screenMotion.ts, a copy of the editor's own lib/screenMotion.ts. */

/** where the runtime's code is, from the repo's root */
export const RUNTIME_TEMPLATE = "lib/export/files/web/runtime.tsx";

const union = (names: string[]) => (names.length ? names.map((n) => str(n)).join(" | ") : "never");
const flags = (names: string[]) => `{${names.map((n) => ` ${n}: true`).join(",")}${names.length ? " " : ""}}`;
const TYPE_OF = { text: "string", number: "number", bool: "boolean", color: "string" } as const;
/** a key of an object as code: a name where it is one, else quoted */
const keyOf = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k));
/** an object of one line, `{ a: 1, b: 2 }`, `{}` when empty */
const oneLine = (entries: string[]) => `{${entries.join(",")}${entries.length ? " " : ""}}`;

/** what of the runtime a document uses: the regions of the code that are kept */
export function runtimeFlags(spec: RuntimeSpec): Record<string, boolean> {
  const p = spec.proto;
  const bd = spec.bound;
  return {
    /* what of the prototype the screens use: an animation, an overlay, a part scrolled to, the pointer, time */
    proto: !!p,
    overlay: !!p?.overlay,
    scroll: !!p?.scroll,
    hover: !!p?.hover,
    delay: !!p?.delay,
    /* variables in modes, and design fields bound to variables */
    modes: !!spec.modes?.collections.length,
    boundFields: !!spec.modes?.bound.length,
    flows: !!spec.flows?.length,
    /* the product's bindings: its params, its session, its client */
    product: !!bd,
    /* the screen a part is drawn on, and whether it can be used (src/App.tsx says): what a delay waits for, what is
       scrolled into view, the modes a screen reads */
    page: !!p || !!spec.modes || !!bd || !!spec.focus,
    /* the prototype reads its expressions itself, over its variables (the product's screens read theirs in the runtime) */
    exprs: !!spec.exprs && !bd,
    varNames: !!Object.keys(spec.exprs?.vars ?? {}).length,
    /* the dark mode is read where the app follows it: a variable that drives it, or collections with a dark mode */
    colorMode: !!spec.dark || !!spec.modes?.followsDark,
    dark: !!spec.dark,
    /* the taps printed as data, run by lib/actions; a prototype answers what they invoke with the mocks */
    acts: !!spec.acts,
    mocks: !!spec.acts?.mocks,
    /* a part hands its Pressable a family's action for the entries its props do not hold */
    families: !!spec.families,
    /* a keyboard's and a gamepad's focus over the screens (src/lib/focus) */
    focus: !!spec.focus,
    /* the world views' channels, which the taps' input actions are sent on (lib/world) */
    worlds: !!spec.worlds,
  };
}

/** the document's tables and names the runtime's code is filled in with */
function runtimeValues(spec: RuntimeSpec, on: Record<string, boolean>): Record<string, string> {
  const m = spec.modes;
  const a = spec.acts;
  const b = spec.bound;
  const flows = spec.flows ?? [];
  return {
    runtime: b ? str(b.runtime) : "",
    screenIds: union(spec.screens),
    partIds: union(spec.parts),
    varsType: `{${spec.vars.map((v) => ` ${v.key}: ${TYPE_OF[v.type]}`).join(";")}${spec.vars.length ? " " : ""}}`,
    firstFlow: flows[0]?.key ?? "",
    firstFlowKey: flows[0] ? str(flows[0].key) : "",
    flowRows: flows.map((f) => `  ${keyOf(f.key)}: { name: ${str(f.name)}, screen: ${str(f.screen)} },`).join("\n"),
    firstScreen: str(spec.screens[0]),
    startVars: oneLine(spec.vars.map((v) => ` ${v.key}: ${str(v.start)}`)),
    startHidden: flags(spec.hidden),
    startOpen: flags(spec.opened),
    current: str(spec.current),
    collections: union(m?.collections ?? []),
    screenModes: Object.entries(m?.screens ?? {})
      .map(([screen, modes]) => `  ${keyOf(screen)}: { ${Object.entries(modes).map(([c, [light, dark]]) => `${keyOf(c)}: [${str(light)}, ${str(dark)}]`).join(", ")} },`)
      .join("\n"),
    modeValues: Object.entries(m?.values ?? {})
      .map(([name, at]) => `  ${keyOf(name)}: { collection: ${str(at.collection)}, values: { ${Object.entries(at.values).map(([mode, v]) => `${keyOf(mode)}: ${str(v)}`).join(", ")} } },`)
      .join("\n"),
    boundRows: (m?.bound ?? []).map((x) => `  ${keyOf(x.key)}: { css: ${str(`--m3e-v-${x.css}`)}, kind: ${str(x.kind)} },`).join("\n"),
    varNameRows: Object.entries(spec.exprs?.vars ?? {})
      .map(([key, n]) => `  ${keyOf(key)}: ${str(n)},`)
      .join("\n"),
    varTypes: oneLine(spec.vars.map((v) => ` ${keyOf(v.key)}: ${str(v.type)}`)),
    reaches: oneLine(Object.entries(a?.parts ?? {}).map(([k, r]) => ` ${keyOf(k)}: ${literal(r)}`)),
    tabProps: oneLine(Object.entries(a?.tabs ?? {}).map(([k, p]) => ` ${keyOf(k)}: ${str(p)}`)),
    login: b?.login ? str(b.login) : "undefined",
    mockCapabilities: literal({ ...(a?.mocks?.rules ? { capabilities: a.mocks.rules } : {}), ...(a?.mocks?.locale ? { locale: a.mocks.locale } : {}) }),
    capabilitySpec: a?.mocks?.spec ? literal(a.mocks.spec) : "undefined",
    paramsRows: Object.entries(b?.params ?? {})
      .map(([screen, list]) => `  ${keyOf(screen)}: ${literal(list)},`)
      .join("\n"),
    needsSignIn: flags(b?.auth ?? []),
    signIn: b?.signIn ? str(b.signIn) : "undefined",
    /* With more than one variable, `[name]` is read as any key; with one it is that variable's own, and a value of
       another type for it (a toggle of words) would not typecheck. The value is the runtime's to keep right, so the key
       is read as any key there too. */
    key: spec.vars.length === 1 ? "name as string" : "name",
    dark: spec.dark ?? "",
    /* whether the app is dark: as the screen is drawn, and as a tap's step finds it */
    darkOn: on.colorMode ? "darkOn" : "false",
    darkNow: spec.dark ? `!!live.current.vars.${spec.dark}` : on.colorMode ? "darkNow.current" : "false",
    overlayGone: on.overlay ? "overlay: null, " : "",
    focusScreens: literal(spec.focus?.screens ?? {}),
    focusParts: literal(spec.focus?.parts ?? {}),
  };
}

/** src/runtime.tsx of a document: the runtime's code (`template`, the text of RUNTIME_TEMPLATE) filled in for it */
export function runtimeSource(spec: RuntimeSpec, template: string): string {
  const on = runtimeFlags(spec);
  return fillRegions(editorNotesOut(template), on, runtimeValues(spec, on), RUNTIME_TEMPLATE);
}
