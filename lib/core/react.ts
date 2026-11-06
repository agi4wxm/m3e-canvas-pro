/* The document core seen from React: a component reads the store's state and history through `useStore`, and draws
 * again whenever either changes, whoever changed them. */

import { useSyncExternalStore } from "react";
import type { DocStore, StoreView } from "./store";

export function useStore(store: DocStore): StoreView {
  return useSyncExternalStore(store.subscribe, store.view, store.view);
}
