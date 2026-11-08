/* The preview's interaction state, held outside React: the variables, what effects showed, hid, opened and set, what
 * the visitor typed, the snackbar, the row last tapped (lib/interact.ts `PreviewState`). The interpreter's host
 * (host.ts) writes it a step at a time, and every step reads what the one before it wrote, whether or not React has
 * drawn it yet; the preview reads it through `usePreviewState`, so a write draws the screens again. Nothing in it is
 * ever written to the document: it starts over each time the preview opens. */

import { useSyncExternalStore } from "react";
import { Store } from "@/lib/app/store";
import { startState, type PreviewState } from "@/lib/interact";
import type { Doc } from "@/lib/tokens";

export class PreviewStore extends Store<PreviewState> {
  /** the state a preview of this document opens in; `dark` is the mode it opens in */
  static start(doc: Pick<Doc, "vars" | "collections">, dark: boolean): PreviewStore {
    return new PreviewStore(startState(doc.vars, doc.collections, dark));
  }

  /** changes the state with what `fn` makes of it; nothing is heard when it is the same state */
  update(fn: (s: PreviewState) => PreviewState) {
    this.set(fn(this.get()));
  }
}

/** the state as it is now, drawn again whenever it changes */
export function usePreviewState(store: PreviewStore): PreviewState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
