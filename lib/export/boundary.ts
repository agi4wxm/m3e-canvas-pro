/* Where an exported app leans on something that is not there yet, on every app alike (docs/边界与契约.md, docs/导出.md):
 *
 * - `demo`: a part that acts out a domain result in a prototype (a coupon that says it was claimed, a prize drawn at
 *   random). A product never runs a demo, so until the part is bound or its actions call the API it only asks and waits.
 * - `event`: every app runs an action on a part's named event (`on:<name>`) and on a family of its slots (`tab:*`) with
 *   lib/actions, the single interpreter: the web app on its widgets' `onEvent`, the phone app and the mini-program on
 *   the callbacks their kits' components hand out. Their printers report the few a component does not send (an event
 *   of a part drawn as its atoms, the map stand-in's region change) as their own differences.
 * - `interface`: what the screens call or load that the API contract does not have.
 * - `capability`: a platform capability the app leans on (lib/capabilities, docs/平台能力.md): a capability view (a map, a
 *   camera, a call) drawn by its stand-in until the product's slot draws the real one, an invoke whose adapter is the
 *   product's own to write (it answers `not-implemented` until then), one the catalog and the product do not declare,
 *   and a sign-in or payment button whose tap invokes nothing.
 * - `custom`: a part the design marks as the product's own (`Item.slot`): every app draws it with a slot written once
 *   (`src/custom/slots/<Name>.tsx`), the design's drawing until it is changed, kept on every export.
 *
 * The printers report what they draw differently themselves; this is what holds for the design whatever the printer. */

import { partBySlug } from "../../parts/registry";
import { capabilityOf } from "../capabilities/catalog";
import { invokesOfItem } from "../capabilities/doc";
import { endpointOf } from "../bindings/contract";
import { expandDoc } from "../expand";
import { untakenDemos } from "../partContract";
import { groupsInFrame, type ActionBody, type Doc, type Effect, type Item } from "../tokens";
import type { DesignDifference } from "./types";
import { slotNames, slotsOf } from "./appCapabilities";

/** the generic capabilities each app has a default adapter for (lib/export/appCapabilities.ts) */
const DEFAULT_ADAPTERS: Record<DesignDifference["app"], Set<string>> = {
  web: new Set(["link.open", "clipboard.write", "share.open", "file.pick", "location.current"]),
  mobile: new Set(["link.open", "share.open", "file.pick"]),
  miniapp: new Set(["clipboard.write", "link.open", "file.pick"]),
};

/** a part as a difference names it: its label, else its id, as letters and digits */
const nameOf = (it: Item) => (it.label || it.id).replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 60);

/** every operation a body of an action reaches, its answers' bodies included */
function operationsOf(b: ActionBody | undefined, into: Set<string>, depth = 0): Set<string> {
  if (!b || depth > 8) return into;
  for (const e of (b.effects ?? []) as Effect[]) {
    if (e.do !== "call") continue;
    into.add(e.operationId);
    operationsOf(e.then, into, depth + 1);
    operationsOf(e.catch, into, depth + 1);
  }
  return into;
}

/** What every app of the product leans on that is not there yet, for one app: its demos, part events, missing
 *  interfaces and platform capabilities, screen by screen. */
export function boundaryDifferences(given: Doc, app: DesignDifference["app"], widths: Record<string, number> = {}): DesignDifference[] {
  const doc = expandDoc(given, widths);
  const out: DesignDifference[] = [];
  const add = (kind: string, screen: string, it: Item | undefined, detail: string) => out.push({ app, kind, screen, ...(it ? { part: nameOf(it) } : {}), detail });
  const slots = slotNames(slotsOf(given, widths));
  for (const f of doc.frames) {
    const groups = groupsInFrame(doc.groups, f, doc.frames, widths);
    const items = groups.flatMap((g) => g.items);
    for (const it of untakenDemos(items)) {
      const demo = partBySlug(it.component)!.demo!;
      add("demo", f.name, it, `a prototype demo (${demo.what}) never runs in the product: bind ${demo.takenOverBy.join(" or ")}, or call the API from its actions, or it only asks and waits`);
    }
    const missing = new Set<string>();
    for (const it of items) {
      /* every app runs a part's events and families of places now (the web app since its taps are lib/actions' data:
         its widgets send their events through onEvent); the phone's and the mini-program's printers report the few a
         component does not send */
      for (const a of [it.action, ...Object.values(it.actions ?? {})]) {
        operationsOf(a, missing);
        operationsOf(a?.else, missing);
      }
      const view = partBySlug(it.component)?.capability;
      if (view) add("capability", f.name, it, `a capability view (${view}): the app draws the design's stand-in until its slot (src/custom/slots) draws the real one`);
      else if (it.slot && slots[it.id]) add("custom", f.name, it, `the product's own: drawn by its slot src/custom/slots/${slots[it.id]}.tsx (written once, kept on every export), the design's part until it is changed`);
      const invoked = new Set(invokesOfItem(it).map((e) => e.capability));
      for (const name of invoked) {
        const def = capabilityOf(doc.capabilities, name);
        if (!def) add("capability", f.name, it, `invokes "${name}", which neither the capability catalog nor the product declares`);
        else if (!def.silent && !DEFAULT_ADAPTERS[app].has(name)) add("capability", f.name, it, `invokes ${name}: it answers not-implemented until its adapter is written (src/custom/capabilities.ts)`);
      }
      if (it.component === "brand-button" && !invoked.has("auth.oauth") && !invoked.has("payment.pay")) add("capability", f.name, it, "a sign-in or payment button whose tap invokes neither auth.oauth nor payment.pay");
      /* the web prints what the mobile printers report for themselves */
      if (app !== "web") continue;
      const def = partBySlug(it.component);
      if (!def) {
        add("unknown", f.name, it, "a part this version does not know is printed as a comment");
        continue;
      }
      for (const [key, bound] of Object.entries(it.bind ?? {})) {
        const d = def.props.find((x) => x.key === key);
        if (d && (d.kind === "list" || d.kind === "table") && typeof bound === "string" && bound.startsWith("=")) add("binding", f.name, it, `${key} is bound to an expression, which the web app does not read for a ${d.kind}: it shows the design's rows`);
      }
    }
    for (const g of groups) if (g.form) missing.add(g.form.operationId);
    for (const d of f.data ?? []) missing.add(d.operationId);
    for (const op of missing) if (!endpointOf(doc.api, op)) add("interface", f.name, undefined, `uses the operation "${op}", which the API contract does not have`);
  }
  return out;
}
