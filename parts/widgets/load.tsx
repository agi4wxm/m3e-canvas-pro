import { createElement, use, useLayoutEffect, type ComponentType, type ReactNode } from "react";
import { REMEASURE } from "../contained";

/* The widgets are fetched the first time one of them is drawn, so a sketch without them does not pay
 * for them. Until then the part suspends; PartView holds its place. */

type Loaded = Record<string, unknown>;

let pending: Promise<Loaded> | undefined;
/** they arrived after their parts were first drawn: the canvas has those parts' sizes wrong */
let arrived = false;

export function loadWidgets(): Promise<Loaded> {
  if (pending) return pending;
  const fetched: Promise<Loaded> = import("./index")
    /* widgets that will not load draw a note (see widget) rather than taking the editor down */
    .catch((error: unknown) => {
      console.error("[widgets] did not load", error);
      return {};
    })
    .then((mod: Loaded) => {
      arrived = true;
      /* how `use` knows a promise has settled: a part first drawn from here on does not suspend at all */
      Object.assign(fetched, { status: "fulfilled", value: mod });
      return mod;
    });
  pending = fetched;
  return fetched;
}

/** tells the canvas to measure again once widgets that arrived late have been drawn */
function Arrived({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    if (!arrived) return;
    window.dispatchEvent(new Event(REMEASURE));
    /* every widget drawn in this commit has run its effect by the next task */
    setTimeout(() => {
      arrived = false;
    }, 0);
  }, []);
  return children;
}

/** The component a def names, which fetches the widgets when it is first drawn. `use` is called on
 *  every render: skipping it once the widgets are in is what React warns about, since a replayed render
 *  then ends without the `use` it suspended on. */
export function widget(name: string): ComponentType<Record<string, unknown>> {
  function Widget(props: Record<string, unknown>) {
    const mod = use(loadWidgets());
    const Component = mod[name] as ComponentType<Record<string, unknown>> | undefined;
    if (!Component) return createElement("span", { style: { color: "var(--md-sys-color-error)", fontSize: 12 } }, `${name} did not load`);
    return createElement(Arrived, { children: createElement(Component, props) });
  }
  Widget.displayName = `Widget(${name})`;
  return Widget;
}
