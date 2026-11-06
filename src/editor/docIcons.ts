/* The document's own icons (lib/docIcons.ts) registered for drawing as the document changes: the editor's store calls
 * this on every change, the render page with each document it is given. Only drawings that are new or changed are
 * turned into Iconify icons (each cleaned once more); parts/icons.ts draws again the trees that name them. */

import { iconifySetOf, type DocIcons } from "@/lib/docIcons";
import { docIcons, registerDocIcons } from "@/parts/icons";

export function setDocIcons(icons: Readonly<DocIcons> | undefined) {
  const next = icons ?? {};
  const was = docIcons();
  if (next === was) return;
  const fresh = Object.fromEntries(Object.entries(next).filter(([id, m]) => was[id] !== m));
  registerDocIcons(next, Object.keys(fresh).length ? iconifySetOf(fresh) : null);
}
