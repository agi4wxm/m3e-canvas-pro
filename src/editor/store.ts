/* The editor's own store: the document core's (lib/core/store.ts), starting on the starter sketch, measuring parts by
 * what the canvas measured, writing words in the editor's language. */

import { DocStore, sessionMeasurer, stateOf } from "@/lib/core";
import { getLang } from "@/lib/i18n";
import { setDocStyles } from "@/lib/styles";
import type { Frame, Group } from "@/lib/tokens";

export function editorStore(groups: Group[], frames: Frame[]) {
  const store = new DocStore(stateOf({ groups, frames }), { measurer: sessionMeasurer, lang: getLang });
  /* the document's own styles are in reach (lib/styles/book.ts) the moment they change, before anything reads a style
   * by its key: what runs right after a change, before the editor draws it again, reads them too */
  store.subscribe((e) => setDocStyles(e.state.doc.styles));
  return store;
}
