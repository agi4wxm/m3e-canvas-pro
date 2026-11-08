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
  /** Whether a press on one of the part's own controls (a heart, a close button: a slot declared `own`) reaches
   *  something, an action on that slot or what the host itself does with it. Left out, nothing does, and the press
   *  stays the control's own instead of counting as a press on the whole part. */
  wired?: (slot: string) => boolean;
};

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
