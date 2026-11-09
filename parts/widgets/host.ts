import { createContext, useContext, type SyntheticEvent } from "react";

/* What a widget is handed by whoever draws it (docs/组件规范.md, "组件的状态和出口"). A widget holds presentation state
 * and UI drafts only; what is true in the product comes in as props, and what the visitor means goes out through
 * here. The editor's preview hands these down as context (a part is drawn from plain data, which carries no
 * functions); printed code can pass the same as props. Nothing here knows the editor, so exported apps carry it. */

export type PartHost = {
  /** The prototype demo of a domain behaviour may run. A renderer says so only in an explicit prototype mode, and
   *  only while nothing real takes the behaviour over; left out, it is a product and never fakes a result. */
  demo?: boolean;
  /** the value the visitor entered, handed out (the part's `input` declaration says which prop holds it). A host
   *  that takes it draws the part with it again: the input is then controlled */
  input?: (value: unknown) => void;
  /** a named event sent out with its payload (the part's `events` declare them) */
  emit?: (name: string, payload?: Record<string, unknown>) => void;
  /** The part may keep the visitor's UI state on their device (the share a split view was dragged to, when it asks to
   *  remember it). An exported app may; the editor's preview says no, so each opening of it is a first visit. */
  remember?: boolean;
  /** Whether a press on one of the part's own controls (a heart, a close button: a slot declared `own`) reaches
   *  something, an action on that slot or what the host itself does with it. Left out, nothing does, and the press
   *  stays the control's own instead of counting as a press on the whole part. */
  wired?: (slot: string) => boolean;
  /** Invokes a platform capability the part needs for a control of its own (a copy button's `clipboard.write`): an
   *  exported product hands its registry of capabilities (lib/capabilities, docs/平台能力.md), so the app decides what
   *  it does on each platform. Left out, the browser's own does it (`useCapability`). Never rejects. */
  invoke?: (capability: string, args: Record<string, unknown>) => Promise<CapabilityOutcome>;
  /** The channel a world view's input actions come in on (lib/world, docs/交互规则.md “输入动作”): the preview hands its
   *  own for the part, as printed code hands the prop `channel`. Left out, no input reaches it. */
  world?: InputChannel;
};

/** what a world view hears its inputs on, as lib/world's `WorldChannel` says it (written out here: an exported app
 *  carries this file without lib/world) */
export type InputChannel = {
  listen(fn: (action: string, value: { x: number; y: number } | boolean, at: number) => void): () => void;
  held(): Record<string, { x: number; y: number } | boolean>;
};

/** What an invoke of a capability came to, as lib/capabilities' `InvokeOutcome` says it (written out here: an exported
 *  app carries this file without the capabilities') */
export type CapabilityOutcome = { ok: true; result: unknown } | { ok: false; error: { type: string; capability: string; message?: string } };

export const PartHostContext = createContext<PartHost>({});

/** the contract as props, for code that draws a widget without the context */
export type HostProps = {
  demo?: boolean;
  onValueChange?: (value: unknown) => void;
  onEvent?: (name: string, payload?: Record<string, unknown>) => void;
  /** the part's own controls something is wired to */
  wired?: string[];
};

export type Host = {
  demo: boolean;
  /** someone takes the value and gives it back as the prop: the prop is the value */
  controlled: boolean;
  input: (value: unknown) => void;
  emit: (name: string, payload?: Record<string, unknown>) => void;
  wired: (slot: string) => boolean;
  /** A press on one of the part's own controls: it runs `run` (a demo, a draft) and counts as a press on the slot
   *  only where something is wired to it; otherwise it goes no further than the control. */
  own: (slot: string, run?: () => void) => (e: SyntheticEvent) => void;
};

/** whether the host lets a part keep the visitor's UI state on their device: unless it says no, it does */
export const useRemember = (): boolean => useContext(PartHostContext).remember !== false;

/** What the widget may do: run its demo or not, hand out its value, send an event. Props and context both reach it. */
export function useHost(p: HostProps): Host {
  const host = useContext(PartHostContext);
  const wired = (slot: string) => !!p.wired?.includes(slot) || !!host.wired?.(slot);
  return {
    demo: p.demo ?? host.demo ?? false,
    controlled: !!p.onValueChange || !!host.input,
    input: (value: unknown) => {
      p.onValueChange?.(value);
      host.input?.(value);
    },
    emit: (name: string, payload?: Record<string, unknown>) => {
      p.onEvent?.(name, payload);
      host.emit?.(name, payload);
    },
    wired,
    own: (slot, run) => (e) => {
      if (!wired(slot)) e.stopPropagation();
      run?.();
    },
  };
}

/** What a part asks of the platform for a control of its own goes through the host's capabilities when it has some (an
 *  exported product's registry), else through the browser's own way of doing it: the editor's preview and a prototype
 *  have no registry. Either way the part only learns whether it was done. */
export function useCapability(): (capability: string, args: Record<string, unknown>) => Promise<CapabilityOutcome> {
  return useContext(PartHostContext).invoke ?? browserCapability;
}

/** The browser's way of doing the capabilities a part's own controls ask for (copying, opening a web page): what a part
 *  does with no registry handed down, and what an app's registry with no adapter for one falls back on. */
export async function browserCapability(capability: string, args: Record<string, unknown>): Promise<CapabilityOutcome> {
  const failed = (type: "unavailable" | "denied" | "failed" | "not-implemented") => ({ ok: false as const, error: { type, capability } });
  if (capability === "clipboard.write") {
    if (typeof navigator === "undefined" || !navigator.clipboard) return failed("unavailable");
    try {
      await navigator.clipboard.writeText(typeof args.text === "string" ? args.text : String(args.text ?? ""));
      return { ok: true, result: {} };
    } catch {
      /* a page that is not focused, or not served over https */
      return failed("denied");
    }
  }
  if (capability === "link.open") {
    const url = typeof args.url === "string" ? args.url : "";
    if (!/^https?:\/\//i.test(url) || typeof window === "undefined") return failed("failed");
    window.open(url, "_blank", "noopener,noreferrer");
    return { ok: true, result: {} };
  }
  return failed("not-implemented");
}

/* Where the time a countdown is read off comes from: the back end's clock as the app's transport tells it (the preview
   hands in its runtime's, which follows the mock library's clock, paused or faster; the product's web app its
   runtime's), the device's until one is handed in (the canvas). docs/边界与契约.md: a part never takes its own wall
   clock for the domain's. */
let domainClock: (() => number) | null = null;

/** Hands in the clock countdowns are read off (the app's runtime's `now`); what it gives back hands back the one before. */
export function setDomainClock(now: () => number): () => void {
  const was = domainClock;
  domainClock = now;
  return () => {
    if (domainClock === now) domainClock = was;
  };
}

/** the time now on the app's clock (`setDomainClock`), the device's until one is handed in */
export function domainNow(): number {
  const n = domainClock?.();
  return typeof n === "number" && Number.isFinite(n) ? n : Date.now();
}
