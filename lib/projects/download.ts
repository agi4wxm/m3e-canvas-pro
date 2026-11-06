/* A project handed to the browser as a download: the same text a bound file holds (lib/core/projectFile.ts), for
 * browsers that cannot keep a file in sync, and for a copy to send. */

import { serializeProject } from "../core/projectFile";
import { projectFileName } from "../project";
import type { Doc } from "../tokens";

export function downloadProject(doc: Doc, name?: string) {
  const url = URL.createObjectURL(new Blob([serializeProject(doc).text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = projectFileName(doc, name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
