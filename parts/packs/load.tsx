import { createElement, use, useLayoutEffect, type ComponentType, type ReactNode } from "react";
import { REMEASURE } from "../contained";
import { PACKS } from "./index";
import type { PartPack } from "./types";

/* A pack's components are fetched the first time one of them is drawn, so a sketch without them
 * does not pay for them. Until then the part suspends; PartView holds its place. */

type Loaded = Record<string, unknown>;

const loaded = new Map<string, Loaded>();
const pending = new Map<string, Promise<Loaded>>();
/** packs that arrived after their parts were first drawn: the canvas has their parts' sizes wrong */
const arrived = new Set<string>();

export function loadPack(pack: PartPack): Promise<Loaded> {
  let job = pending.get(pack.id);
  if (!job) {
    /* a pack that will not load draws stand-ins (see packComponent) rather than taking the editor down */
    job = (pack.load?.() ?? Promise.resolve({})).catch((error: unknown) => {
      console.error(`[packs] ${pack.id} did not load`, error);
      return {};
    }).then((mod: Loaded) => {
      loaded.set(pack.id, mod);
      arrived.add(pack.id);
      return mod;
    });
    pending.set(pack.id, job);
  }
  return job;
}

/** fetches every pack now: for tests, and anything that draws without a Suspense boundary */
export const preloadPacks = () => Promise.all(PACKS.map(loadPack));

/** tells the canvas to measure again once a pack that arrived late has been drawn */
function Arrived({ pack, children }: { pack: PartPack; children: ReactNode }) {
  useLayoutEffect(() => {
    if (!arrived.has(pack.id)) return;
    window.dispatchEvent(new Event(REMEASURE));
    /* every part of the pack drawn in this commit has run its effect by the next task */
    setTimeout(() => arrived.delete(pack.id), 0);
  }, [pack]);
  return children;
}

/** The component a def names, which fetches its pack when it is first drawn. No other hook may sit
 *  beside `use` here: `use` is skipped once the pack is in, and if the pack comes in while React is
 *  replaying this component, a hook after it finds no state to update (React error 467). */
export function packComponent(pack: PartPack, name: string): ComponentType<Record<string, unknown>> {
  function PackPart(props: Record<string, unknown>) {
    const mod = loaded.get(pack.id) ?? use(loadPack(pack));
    const Component = mod[name] as ComponentType<Record<string, unknown>> | undefined;
    if (!Component) return createElement("span", { style: { color: "#B3261E", fontSize: 12 } }, `${pack.id}: ${name} did not load`);
    return createElement(Arrived, { pack, children: createElement(Component, props) });
  }
  PackPart.displayName = `Pack(${name})`;
  return PackPart;
}
