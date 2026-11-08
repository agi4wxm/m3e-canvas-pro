/* What a document makes of the capabilities: the ones its designs invoke, the views its parts draw, the ones it names
 * in `Doc.capabilities.uses`. The export prints the registry and the slots of these; the editor's checks and the
 * boundary report read them. Not copied into an exported app (it reads the document). */

import { partBySlug } from "../../parts/registry";
import type { ActionBody, Doc, Effect, Item } from "../tokens";
import { capabilityOf } from "./catalog";
import type { CapabilityDef } from "./types";

/** the capability view a part stands for (`PartDef.capability`), if it is one */
export const viewOf = (it: Pick<Item, "component">): string | undefined => partBySlug(it.component)?.capability;

/** every invoke a body holds, its answers' bodies included, as deep as they go */
export function invokesIn(b: ActionBody | undefined, into: Extract<Effect, { do: "invoke" }>[] = [], depth = 0): Extract<Effect, { do: "invoke" }>[] {
  if (!b || depth > 8) return into;
  for (const e of Array.isArray(b.effects) ? b.effects : []) {
    if (!e || typeof e !== "object") continue;
    if (e.do === "invoke") into.push(e);
    if (e.do === "invoke" || e.do === "call") {
      invokesIn(e.then, into, depth + 1);
      invokesIn(e.catch, into, depth + 1);
    }
  }
  return into;
}

/** every invoke a part's actions hold: its own, its places', its events', their `else` too */
export function invokesOfItem(it: Item): Extract<Effect, { do: "invoke" }>[] {
  const out: Extract<Effect, { do: "invoke" }>[] = [];
  for (const a of [it.action, ...Object.values(it.actions ?? {})]) {
    invokesIn(a, out);
    invokesIn(a?.else, out);
  }
  return out;
}

/** every item of the document, its components' too */
function itemsOf(doc: Doc): Item[] {
  return [...doc.groups, ...(doc.components ?? []).flatMap((c) => c.groups)].flatMap((g) => g.items);
}

/** The capabilities a document uses, by name, sorted: those its designs invoke (forms' answers too), the views its parts
 *  draw, and those it names. A view's call (`rtc.call` for `rtc.view`) comes with it when it is invoked. */
export function capabilitiesUsed(doc: Doc): string[] {
  const names = new Set<string>(doc.capabilities?.uses ?? []);
  for (const it of itemsOf(doc)) {
    for (const e of invokesOfItem(it)) names.add(e.capability);
    const view = viewOf(it);
    if (view) names.add(view);
  }
  for (const g of doc.groups) {
    if (!g.form) continue;
    invokesIn(g.form.then).forEach((e) => names.add(e.capability));
    invokesIn(g.form.catch).forEach((e) => names.add(e.capability));
  }
  return [...names].sort();
}

/** the definitions of the capabilities a document uses; a name nothing defines is left out (the checks report it) */
export function usedDefinitions(doc: Doc): CapabilityDef[] {
  return capabilitiesUsed(doc).flatMap((n) => {
    const def = capabilityOf(doc.capabilities, n);
    return def ? [def] : [];
  });
}

/** the capabilities a document invokes that are calls: the ones the mocks can be told how to answer */
export const capabilityCalls = (doc: Doc): string[] => usedDefinitions(doc).flatMap((d) => (d.kind === "call" ? [d.name] : []));
