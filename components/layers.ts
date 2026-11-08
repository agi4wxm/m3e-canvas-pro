/* The editor's open layers -- a menu, a popover, a picker, a dialog -- in the order they opened. Escape is the topmost
 * one's alone: one press closes one layer, and neither the layers under it nor the canvas (which also answers to
 * Escape) hear it. A modal layer, a dialog that asks something, also keeps every other key from the canvas while it is
 * up (src/editor/useShortcuts.ts asks `modalOpen`). */

import { useEffect, useRef } from "react";

type Layer = { escape: () => void; modal: boolean };
const stack: Layer[] = [];

type EscapeKey = Pick<KeyboardEvent, "key" | "isComposing" | "preventDefault" | "stopPropagation">;

/** Escape goes to the topmost layer; says whether one took it. An Escape that ends a composition is the IME's. */
export function escapeTop(e: EscapeKey): boolean {
  if (e.key !== "Escape" || e.isComposing) return false;
  const top = stack[stack.length - 1];
  if (!top) return false;
  e.preventDefault();
  e.stopPropagation();
  top.escape();
  return true;
}

/* heard on its way down, before anything on the page: what is under the top layer must not act on the same press */
const onKey = (e: KeyboardEvent) => void escapeTop(e);

/** A layer opened on top of the others; the function it returns takes it away again. */
export function openLayer(escape: () => void, modal = false): () => void {
  const layer: Layer = { escape, modal };
  stack.push(layer);
  if (stack.length === 1 && typeof window !== "undefined") window.addEventListener("keydown", onKey, true);
  return () => {
    const at = stack.indexOf(layer);
    if (at < 0) return;
    stack.splice(at, 1);
    if (!stack.length && typeof window !== "undefined") window.removeEventListener("keydown", onKey, true);
  };
}

/** a dialog that asks something is up: the canvas hears no keys */
export const modalOpen = () => stack.some((l) => l.modal);

/** how many layers are open */
export const openLayers = () => stack.length;

/** While `active`, the component is a layer: Escape on top of the others calls `onEscape`. */
export function useLayer(active: boolean, onEscape: () => void, modal = false) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => (active ? openLayer(() => latest.current(), modal) : undefined), [active, modal]);
}
