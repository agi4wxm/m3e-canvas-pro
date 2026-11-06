/* The editor's own store: the document core's (lib/core/store.ts), starting on the starter sketch, measuring parts by
 * what the canvas measured, writing words in the editor's language. */

import { DocStore, sessionMeasurer, stateOf } from "@/lib/core";
import { getLang } from "@/lib/i18n";
import type { Frame, Group } from "@/lib/tokens";

export const editorStore = (groups: Group[], frames: Frame[]) => new DocStore(stateOf({ groups, frames }), { measurer: sessionMeasurer, lang: getLang });
