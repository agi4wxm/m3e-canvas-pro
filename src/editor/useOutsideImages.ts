/* Pictures from other sites in a document someone else made (lib/outside.ts): a file opened or dropped, or a shared
 * link, that holds outside addresses has them held back as it comes in, and the banner offers to load them; the
 * author's choice is kept in the project's listing (lib/projects/persist.ts `setOutside`), so the project opens the
 * same way next time. Without the projects store (the old single document) the choice lasts for the tab. */

import { useMemo, useState, useSyncExternalStore } from "react";
import type { DocStore } from "@/lib/core";
import { useStore } from "@/lib/core/react";
import { outsideInDoc } from "@/lib/outside";
import { outsideBlocked, setOutsideBlocked, subscribeOutside } from "@/lib/outsidePolicy";
import { ProjectsPersist } from "@/lib/projects/persist";
import type { PersistAdapter } from "@/lib/core/persist";
import type { Doc } from "@/lib/tokens";

const projectsOf = (persist: PersistAdapter | null | undefined) => (persist instanceof ProjectsPersist ? persist : null);

/** A document arriving from elsewhere into the open project: its outside pictures are held back before it is drawn,
 *  when it has any. Called before the document reaches the store. */
export function holdOutside(doc: Pick<Doc, "groups" | "components" | "frames">, persist: PersistAdapter | null | undefined) {
  if (!outsideInDoc(doc).length) return;
  const projects = projectsOf(persist);
  if (projects) void projects.setOutside("blocked");
  else setOutsideBlocked(true);
}

/** whether the open project's outside pictures are held back now */
export const useOutsideBlocked = () => useSyncExternalStore(subscribeOutside, outsideBlocked, outsideBlocked);

/** What the banner shows: how many outside addresses are held back, and the author's two answers. */
export function useOutsideImages(store: DocStore, persist: PersistAdapter | null | undefined) {
  const blocked = useOutsideBlocked();
  const { state } = useStore(store);
  const { groups, components, frames } = state.doc;
  const count = useMemo(() => (blocked ? outsideInDoc({ groups, components, frames }).length : 0), [blocked, groups, components, frames]);
  const [later, setLater] = useState(false);
  return {
    blocked,
    count,
    show: blocked && count > 0 && !later,
    /** loads them, now and whenever this project opens */
    allow: () => {
      const projects = projectsOf(persist);
      if (projects) void projects.setOutside("allowed");
      else setOutsideBlocked(false);
    },
    /** leaves them held back, and the banner away until the tab opens again */
    later: () => setLater(true),
  };
}
