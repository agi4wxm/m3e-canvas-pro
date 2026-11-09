/* The editor's own store: the document core's (lib/core/store.ts), starting on the starter sketch, measuring parts by
 * what the canvas measured, writing words in the editor's language. */

import { DocStore, sessionMeasurer, stateOf } from "@/lib/core";
import { getLang } from "@/lib/i18n";
import { setDocStyles } from "@/lib/styles";
import { setDocIcons } from "./docIcons";
import { syncAssetIcons } from "./assetIcons";
import { setDocMaterials } from "./materials";
import type { Frame, Group } from "@/lib/tokens";

export function editorStore(groups: Group[], frames: Frame[]) {
  const store = new DocStore(stateOf({ groups, frames }), { measurer: sessionMeasurer, lang: getLang });
  /* the asset pipeline's icons drawn whenever the project's manifest is read again (lib/projects/assetLink.ts) */
  syncAssetIcons();
  /* the document's own styles are in reach (lib/styles/book.ts) the moment they change, before anything reads a style
   * by its key: what runs right after a change, before the editor draws it again, reads them too */
  store.subscribe((e) => {
    setDocStyles(e.state.doc.styles);
    /* and its own icons registered, so a part naming one (svg:<id>) draws it on the canvas and in the preview */
    setDocIcons(e.state.doc.icons);
    /* and its materials' pictures on the page, which the material layers of looks read (lib/materialCss.ts) */
    setDocMaterials(e.state.doc);
  });
  return store;
}
