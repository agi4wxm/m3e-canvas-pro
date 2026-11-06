/* A head start for the editor's first frame. Which modules the opening document's parts need is only known once the part
 * definitions have come (parts/prefetch.ts `loadOpeningModules`); this guesses before them, from what is light: the
 * starter's modules on a first visit, and on a later one what the parts on screen were drawn with when the page was last
 * left. A wrong guess fetches a chunk too many, or leaves one to the exact fetch; it never decides what is drawn. */
import { MODULE_KEYS, drawnModules, loadModules } from "./components";

/** What the starter document's parts (prefetch.ts `STARTER_PARTS`) are drawn with: prefetch.test.ts holds the two together. */
export const STARTER_MODULES = ["app-bar", "button", "button-group", "fab", "icon", "item", "navigation"];

/** where the modules on screen are kept between visits */
const DRAWN_KEY = "m3e:drawn-modules";
/** where the editor keeps the document it has open (src/Editor.tsx `DOC_KEY`) */
const EDITOR_DOC_KEY = "m3e:doc";

/** The modules to fetch before anything else is known: the starter's when no document is kept, else those kept from the
 *  last visit that this build still has. */
export function headStart(storage: Pick<Storage, "getItem"> = localStorage): string[] {
  try {
    if (!storage.getItem(EDITOR_DOC_KEY)) return STARTER_MODULES;
    const kept: unknown = JSON.parse(storage.getItem(DRAWN_KEY) ?? "[]");
    return Array.isArray(kept) ? kept.filter((k): k is string => typeof k === "string" && MODULE_KEYS.includes(k)) : [];
  } catch {
    return [];
  }
}

/** fetch the head start; what it misses, the exact fetch brings */
export const loadHeadStart = (): Promise<void> => loadModules(headStart());

let remembering = false;

/** Keep what the parts on screen are drawn with whenever the page is left or hidden, for the next start. */
export function rememberOnLeave() {
  if (typeof window === "undefined" || remembering) return;
  remembering = true;
  const keep = () => {
    try {
      localStorage.setItem(DRAWN_KEY, JSON.stringify(drawnModules()));
    } catch {
      /* no room, or no storage: the next start finds out the slower way */
    }
  };
  window.addEventListener("pagehide", keep);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") keep();
  });
}
