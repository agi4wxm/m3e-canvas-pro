import { createContext, useContext } from "react";

/* What a widget is handed by whoever draws it (docs/组件规范.md, "组件的状态和出口"). A widget holds presentation state
 * and UI drafts only; what is true in the product comes in as props, and what the visitor means goes out through
 * here. The editor's preview hands these down as context (a part is drawn from plain data, which carries no
 * functions); printed code can pass the same as props. Nothing here knows the editor, so exported apps carry it. */

export type PartHost = {
  /** The prototype demo of a domain behaviour may run. A renderer says so only in an explicit prototype mode, and
   *  only while nothing real takes the behaviour over; left out, it is a product and never fakes a result. */
  demo?: boolean;
  /** the value the visitor entered, handed out (the part's `input` declaration says which prop holds it) */
  input?: (value: unknown) => void;
  /** a named event sent out with its payload (the part's `events` declare them) */
  emit?: (name: string, payload?: Record<string, unknown>) => void;
};

export const PartHostContext = createContext<PartHost>({});

/** the contract as props, for code that draws a widget without the context */
export type HostProps = { demo?: boolean; onValueChange?: (value: unknown) => void; onEvent?: (name: string, payload?: Record<string, unknown>) => void };

/** What the widget may do: run its demo or not, hand out its value, send an event. Props and context both reach it. */
export function useHost(p: HostProps) {
  const host = useContext(PartHostContext);
  return {
    demo: p.demo ?? host.demo ?? false,
    input: (value: unknown) => {
      p.onValueChange?.(value);
      host.input?.(value);
    },
    emit: (name: string, payload?: Record<string, unknown>) => {
      p.onEvent?.(name, payload);
      host.emit?.(name, payload);
    },
  };
}
