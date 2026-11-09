/* What a part sends out and what it only acts out, read off its definition (parts/types.ts): its slots, slot families
 * and named events (the keys `Item.actions` stores them under), the input it hands its value out through, and the
 * prototype demo it runs until something takes it over. Validation, the panel, the preview, the tools and the exports
 * all ask here, so a declaration is the one place this is said (docs/组件规范.md, docs/边界与契约.md). */

import { partBySlug, reader } from "../parts/registry";
import type { PartDef, PartEvent, PartInput, PartLang, SlotFamily } from "../parts/types";
import { labelOf } from "../parts/labels";
import { actionSlotsOf, type Action, type ActionBody, type Effect, type Item } from "./tokens";

/* the keys themselves are the interaction model's (lib/actions/model.ts), which every host's interpreter reads too */
import { eventKey, eventOfKey, familyKey, familyOfKey } from "./actions/model";
export { EVENT_PREFIX, eventKey, eventOfKey, familyKey, familyOfKey } from "./actions/model";

/** an event's or a family's name: words and digits, starting with a letter */
export const OUTLET_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

export type OutletKind = "slot" | "family" | "event";
/** one key an action can be stored under, with what the panel calls it */
export type Outlet = { key: string; kind: OutletKind; label: string; icon: string | null; event?: PartEvent };

const defOf = (it: Pick<Item, "component">): PartDef | undefined => partBySlug(it.component);

/** the part's slot families */
export const familiesOf = (it: Pick<Item, "component">): SlotFamily[] => defOf(it)?.families ?? [];
/** the part's named events */
export const eventsOf = (it: Pick<Item, "component">): PartEvent[] => defOf(it)?.events ?? [];
/** the input a part is, if it is one */
export const inputOf = (it: Pick<Item, "component">): PartInput | undefined => defOf(it)?.input;

/** The words a choice input picks from, in order (`PartInput.options`): the labels of a list's rows, or the words of a
 *  prop that lists them with commas. A text variable or a form field holds these words, the part its place among them. */
export function optionsOf(it: Pick<Item, "component" | "props">): string[] {
  const def = defOf(it);
  const key = def?.input?.options ?? "items";
  const d = def?.props.find((p) => p.key === key);
  if (!def || !d) return [];
  const p = reader(def, it.props);
  return d.kind === "list" ? p.list(key).map((r) => r.label) : d.kind === "text" ? p.s(key).split(",").map((w) => w.trim()) : [];
}

/** Every key the part's `actions` may hold: its slots, then its families, then its events. */
export function outletsOf(it: Item, lang: PartLang = "en"): Outlet[] {
  const def = defOf(it);
  if (!def) return [];
  const slots: Outlet[] = actionSlotsOf(it).map((s) => ({ key: s.key, kind: "slot", label: s.label, icon: s.value }));
  /* a family of slots the part does not have at its present values (a list with no rows) still takes an action */
  const families: Outlet[] = (def.families ?? []).map((f) => ({ key: familyKey(f.prefix), kind: "family", label: labelOf(f, lang), icon: null }));
  const events: Outlet[] = (def.events ?? []).map((e) => ({ key: eventKey(e.name), kind: "event", label: labelOf(e, lang), icon: null, event: e }));
  return [...slots, ...families, ...events];
}

/** the keys of `outletsOf` */
export const outletKeysOf = (it: Item): string[] => outletsOf(it).map((o) => o.key);

/** A tap on a slot: the action that runs, its own or its family's, and what the family's action reads as `slot`. */
export function slotAction(it: Item, slot: string): { action: Action; scope?: { slot: { key: string; index: number } } } | null {
  const own = it.actions?.[slot];
  if (own) return { action: own };
  const m = /^(.+):(\d+)$/.exec(slot);
  if (!m || !familiesOf(it).some((f) => f.prefix === m[1])) return null;
  const family = it.actions?.[familyKey(m[1])];
  return family ? { action: family, scope: { slot: { key: slot, index: Number(m[2]) } } } : null;
}

/** the action an event runs, if the part has one wired */
export function eventAction(it: Item, name: string): Action | null {
  if (!eventsOf(it).some((e) => e.name === name)) return null;
  return it.actions?.[eventKey(name)] ?? null;
}

/** The value of an event's payload as the part sent it, cut down to what it declares: only declared fields, each of
 *  its kind (what a widget says is not trusted to be the right shape). */
export function payloadOf(e: PartEvent, raw: unknown): Record<string, unknown> {
  const given = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [k, kind] of Object.entries(e.payload ?? {})) {
    const v = given[k];
    if (kind === "text" && typeof v === "string") out[k] = v.slice(0, 20_000);
    else if (kind === "number" && typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (kind === "bool" && typeof v === "boolean") out[k] = v;
    else if (kind === "list" && Array.isArray(v)) out[k] = v.slice(0, 1000);
    else if (kind === "object" && v && typeof v === "object" && !Array.isArray(v)) out[k] = v;
  }
  return out;
}

/** What a part declares about its outlets and its demo, as the tools describe a part: only what it has. */
export function declarationsOf(def: PartDef): Record<string, unknown> {
  return {
    ...(def.input ? { input: { prop: def.input.prop, kind: def.input.kind } } : {}),
    /* the field states it shows, each by its prop (parts/fieldState.ts) */
    ...(def.field ? { fieldStates: { ...def.field, setBy: "a form: its contract's check sets the error and message, its required fields required, a submit loading" } } : {}),
    ...(def.families?.length ? { families: def.families.map((f) => ({ key: familyKey(f.prefix), label: f.label, reads: "slot.index" })) } : {}),
    ...(def.events?.length ? { events: def.events.map((e) => ({ key: eventKey(e.name), label: e.label, payload: Object.fromEntries(Object.entries(e.payload ?? {}).map(([k, kind]) => [`event.${k}`, kind])) })) } : {}),
    ...(def.demo ? { demo: { what: def.demo.what, onlyInPrototype: true, takenOverBy: def.demo.takenOverBy.map((k) => `bind ${k}`).concat("an action of the part that calls the API or invokes a capability") } } : {}),
    ...(def.overlay ? { overlay: true } : {}),
    ...(def.nav ? { nav: true } : {}),
    ...(def.capability ? { capabilityView: { capability: def.capability, note: "a stand-in for a platform view: the exported app hands it to a slot (src/custom/slots) the product writes once; its events are the capability's" } } : {}),
  };
}

/* ---------- the demo ---------- */

/** whether a body reaches the other side: a call, a form's submit, an invoke of a capability (a payment, a sign-in) */
const reachesApi = (b: ActionBody | undefined): boolean => (b?.effects ?? []).some((e: Effect) => e.do === "call" || e.do === "submit" || e.do === "invoke");

/** Whether something real stands where the part's demo would act: one of the props its demo names is bound (to a
 *  variable or an expression), or an action of the part reaches the other side (a call, a form's submit, an invoke). */
export function demoTakenOver(it: Item): boolean {
  const demo = defOf(it)?.demo;
  if (!demo) return false;
  if (demo.takenOverBy.some((k) => it.bind?.[k] !== undefined)) return true;
  /* a world view's actions run on what its world says (a round over sending the score to the API): they take nothing
     of the world over, only its state from data does */
  if (defOf(it)?.world) return false;
  const actions = [it.action, ...Object.values(it.actions ?? {})].filter((a): a is Action => !!a);
  return actions.some((a) => reachesApi(a) || reachesApi(a.else));
}

/** what a renderer draws parts as: a prototype may run their demos, a product never does */
export type PartMode = "prototype" | "product";

/** Whether the part acts out its demo here: only in an explicit prototype, and only until it is taken over. */
export const demoRuns = (it: Item, mode: PartMode): boolean => mode === "prototype" && !!defOf(it)?.demo && !demoTakenOver(it);

/** the parts of a list whose demo a product would need: declared and not taken over */
export const untakenDemos = (items: Item[]): Item[] => items.filter((it) => !!defOf(it)?.demo && !demoTakenOver(it));

/** whether a key of `Item.actions` is a place on the part, not an event or a family: what the app printers print */
export const isPlaceKey = (key: string): boolean => eventOfKey(key) === null && familyOfKey(key) === null;
