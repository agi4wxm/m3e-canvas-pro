import { useSyncExternalStore } from "react";

import type { VarSpec, VarType, VarValue } from "./spec";

/* The design's variables: one value each for the whole app (the preview keeps them so too), starting at the design's.
 * A tap sets, flips or adds to them; a part bound to one shows it; an input bound to one writes it. */

type Listener = () => void;

let specs: VarSpec[] = [];
let values: Record<string, VarValue> = {};
const listeners = new Set<Listener>();

/** the app's variables, set once as it starts: every page has the app's providers around it, and a page opened later
 *  finds them as the earlier ones left them */
export function initVars(list: VarSpec[]) {
  if (specs === list) return;
  specs = list;
  values = Object.fromEntries(list.map((v) => [v.id, v.value]));
}

export const varSpec = (id: string) => specs.find((v) => v.id === id);

const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => values;

export function writeVar(id: string, value: VarValue) {
  if (values[id] === value) return;
  values = { ...values, [id]: value };
  listeners.forEach((l) => l());
}

export const readVar = (id: string): VarValue | undefined => values[id];

/** the variables now, by id: what a tap's step reads, whatever the last render drew */
export const varValues = (): Record<string, VarValue> => values;

/** the variables now, by id; the component reading them draws again when one changes */
export const useVarValues = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/** what `vars.` reads in expressions: each variable by its name and by its id */
export function varsScope(now: Record<string, VarValue>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...now };
  for (const v of specs) if (v.name && v.id in now) out[v.name] = now[v.id];
  return out;
}

export const asNumber = (v: VarValue | undefined): number | null => {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const asBool = (v: VarValue | undefined) => (typeof v === "string" ? v !== "" && v !== "false" && v !== "0" : !!v);

const COLOR = /^(#[0-9a-f]{3,8}|[a-z][a-zA-Z0-9-]*(\/\d{1,3})?)$/i;

/** a value put into a variable keeps to the variable's type; null when it cannot (lib/interact.ts `coerce`) */
export function coerce(v: VarValue, type: VarType): VarValue | null {
  if (type === "text") return String(v);
  if (type === "color") return typeof v === "string" && COLOR.test(v) ? v : null;
  if (type === "bool") return asBool(v);
  return asNumber(v);
}
