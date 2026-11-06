/* The project this tab opens, read once and shared: the route starts reading it beside the editor's own code (and
 * fetches the part drawings its document needs, parts/prefetch.ts), and the editor's `PersistAdapter` is handed the
 * same reading, usually already done by the time the editor mounts. */

import { isLang, t, type Lang } from "../i18n";
import { browserOpening, ProjectsPersist } from "./persist";

let editor: ProjectsPersist | null = null;

/** the language the page opens in (src/routes/index.tsx), which may not be set yet when the reading starts */
function openingLang(): Lang {
  try {
    const ui = JSON.parse(localStorage.getItem("m3e:ui") ?? "null") as { pickedLang?: unknown } | null;
    if (isLang(ui?.pickedLang)) return ui.pickedLang;
  } catch {}
  return "zh";
}

/** the editor's store of projects in this tab, opening the project the address names */
export function editorProjects(): ProjectsPersist {
  if (editor) return editor;
  const lang = openingLang();
  return (editor = new ProjectsPersist(browserOpening({ untitled: t("untitledProject", lang), first: t("firstProject", lang) })));
}

/** the document the tab opens with, as stored (null for a new project): what the part drawings are fetched for */
export const openingDoc = (): Promise<unknown> => editorProjects().opening.then((o) => o.stored.doc);
