/* The hub's contract index beside a project on disk (lib/hub/contractIndex.ts), for the file backend and the export
 * script: read where the project's configuration says (`external.contractIndex`, `contract-index.json` by default),
 * from inside the project's folder only (inside.ts: no link followed, nothing outside it), afresh on each export so
 * what the hub wrote since is what the design's contracts are compared with. */

import { loadContractIndex, type ContractIndexState } from "../../lib/hub/contractIndex";
import type { Doc } from "../../lib/tokens";
import { Folder } from "./inside";

/** the index beside the project in `dir`, as its configuration names it */
export function diskContractIndex(dir: string, doc: Pick<Doc, "external"> | null): Promise<ContractIndexState> {
  const folder = new Folder(dir);
  return loadContractIndex(doc, async (path) => {
    const bytes = await folder.read(path).catch(() => null);
    return bytes ? new TextDecoder().decode(bytes) : null;
  });
}
