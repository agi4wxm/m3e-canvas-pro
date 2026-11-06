/* The components a part's tree names, by name. `FILE_OF` (which module each name comes from) is generated from the
 * source and light. The components themselves come a module at a time: each module is a chunk of its own, fetched the
 * first time a part needs it, so a document pays only for the drawings it holds. A tree is drawn once every module it
 * names has arrived (`modulesOf`, `loadModules`); until then PartView holds the part's place at its size. */
import type { ComponentType } from "react";
import { MODULES } from "./components.generated";
import { Contained, Overhang } from "./contained";
import { EXTERNAL } from "./externals";
import { FILE_OF } from "./files.generated";
import { isNode, isRaw, isWrap, type PNode, type PValue } from "./node";
import { WIDGET_MODULES } from "./widgets/modules";
import { WIDGET_SOURCES } from "./widgets/sources";

export { FILE_OF };

type AnyComponent = ComponentType<Record<string, unknown>>;
type Loaded = Record<string, unknown>;

/** what fetches each module, by the key its components are filed under: an M3E file's name (`button`), `widgets/<file>`,
 *  `recharts` for a chart's elements, `snackbar` for the canvas's open snackbar */
const LOADERS: Record<string, () => Promise<Loaded>> = {
  ...MODULES,
  ...Object.fromEntries(Object.entries(WIDGET_MODULES).map(([file, load]) => [`widgets/${file}`, load])),
  recharts: () => import("recharts"),
  snackbar: () => import("./snackbar"),
};

/** the module each name a tree may use is in; a later entry wins, as it did when every module came at once */
const KEY_OF = new Map<string, string>();
for (const [name, file] of Object.entries(FILE_OF)) KEY_OF.set(name, file);
KEY_OF.set("SnackbarPreview", "snackbar");
for (const name of Object.keys(EXTERNAL)) KEY_OF.set(name, "recharts");
for (const [name, from] of Object.entries(WIDGET_SOURCES)) KEY_OF.set(name, `widgets/${from.slice(from.lastIndexOf("/") + 1)}`);

/** the names each module answers for */
const NAMES_IN = new Map<string, string[]>();
for (const [name, key] of KEY_OF) NAMES_IN.set(key, [...(NAMES_IN.get(key) ?? []), name]);

/** the components that have arrived, by name. The box an open overlay is drawn in, and the closed stand that holds it
 *  up, are the canvas's own and always here */
export const COMPONENTS: Record<string, AnyComponent> = { Contained: Contained as AnyComponent, Overhang: Overhang as AnyComponent };

const loaded = new Set<string>();
/** modules that would not load: a part naming one draws a note in its place (PartBoundary) rather than waiting for ever */
const failed = new Set<string>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let version = 0;
const DONE: Promise<void> = Promise.resolve();

function arrived(key: string, mod: Loaded) {
  for (const name of NAMES_IN.get(key) ?? []) {
    const value = mod[name];
    if ((typeof value === "function" || typeof value === "object") && value !== null) COMPONENTS[name] = value as AnyComponent;
  }
  loaded.add(key);
}

/** Fetch a module, once. It settles when its components are in `COMPONENTS`, or when it could not be had. */
export function loadModule(key: string): Promise<void> {
  if (loaded.has(key) || failed.has(key)) return DONE;
  const going = inFlight.get(key);
  if (going) return going;
  const load = LOADERS[key];
  const fetched = (load ? load() : Promise.reject(new Error(`there is no module ${key}`)))
    .then(
      (mod) => arrived(key, mod),
      (error: unknown) => {
        console.error(`[parts] ${key} did not load`, error);
        failed.add(key);
      },
    )
    .finally(() => {
      inFlight.delete(key);
      version++;
      listeners.forEach((l) => l());
    });
  inFlight.set(key, fetched);
  return fetched;
}

/** fetch every one of these modules */
export const loadModules = (keys: Iterable<string>): Promise<void> => Promise.all([...keys].map(loadModule)).then(() => undefined);

/** every module there is: what draws every part (the gallery, a static render in a test) */
export const loadAllModules = (): Promise<void> => loadModules(Object.keys(LOADERS));

/** the keys of every module there is */
export const MODULE_KEYS: readonly string[] = Object.keys(LOADERS);

/** whether each of these modules is in, or has failed: a tree naming only these can be drawn now */
export const modulesIn = (keys: readonly string[]): boolean => keys.every((k) => loaded.has(k) || failed.has(k));

/** whether any module is on its way */
export const modulesPending = (): boolean => inFlight.size > 0;

/** settles once nothing is on its way, counting what is asked for meanwhile */
export async function modulesSettled(): Promise<void> {
  while (inFlight.size) await Promise.all(inFlight.values());
}

/** told whenever a module has arrived or failed */
export function subscribeModules(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
/** how many modules have arrived or failed so far */
export const modulesVersion = () => version;

/** how many parts on screen are drawn with each module (PartView holds the modules it draws with) */
const drawn = new Map<string, number>();

/** A part on screen is drawn with these modules, until the returned function is called. */
export function holdModules(keys: readonly string[]): () => void {
  for (const k of keys) drawn.set(k, (drawn.get(k) ?? 0) + 1);
  return () => {
    for (const k of keys) {
      const n = (drawn.get(k) ?? 1) - 1;
      if (n > 0) drawn.set(k, n);
      else drawn.delete(k);
    }
  };
}

/** the modules the parts on screen are drawn with now: what the next start fetches first (parts/opening.ts) */
export const drawnModules = (): string[] => [...drawn.keys()].sort();

const KEYS = new WeakMap<PNode, readonly string[]>();

/** The modules a tree's drawing needs: those of the components it names, in its nodes, in the nodes its props hold, and
 *  in its render props (`$wrap`). Sorted, the same array for the same tree. */
export function modulesOf(node: PNode): readonly string[] {
  let keys = KEYS.get(node);
  if (!keys) {
    const into = new Set<string>();
    collect(node, into);
    keys = [...into].sort();
    KEYS.set(node, keys);
  }
  return keys;
}

function collect(node: PNode | string, into: Set<string>) {
  if (typeof node === "string") return;
  const key = KEY_OF.get(node.type);
  if (key) into.add(key);
  for (const v of Object.values(node.props ?? {})) collectValue(v, into);
  for (const c of node.children ?? []) collect(c, into);
}

/* the same walk as render.tsx's `value`: raw code is never drawn */
function collectValue(v: PValue, into: Set<string>) {
  if (isRaw(v)) return;
  if (isWrap(v)) {
    const key = KEY_OF.get(v.$wrap);
    if (key) into.add(key);
  } else if (isNode(v)) collect(v, into);
  else if (Array.isArray(v)) for (const x of v) collectValue(x, into);
  else if (typeof v === "object" && v !== null) for (const x of Object.values(v)) collectValue(x, into);
}

/** The component a tree names, once its module is in, or the HTML tag it is. Drawing a name whose module has not
 *  arrived is a mistake of the caller's, said out loud rather than drawn as an unknown tag. */
export function componentOf(type: string): AnyComponent | string {
  const found = COMPONENTS[type];
  if (found) return found;
  const key = KEY_OF.get(type);
  if (key && failed.has(key)) throw new Error(`${type} could not be loaded (${key})`);
  if (key && !loaded.has(key)) throw new Error(`${type} is drawn before its module (${key}) has arrived`);
  return type;
}
