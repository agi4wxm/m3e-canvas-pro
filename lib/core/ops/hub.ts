/* Where the project reads the hub's contract index (lib/hub/contractIndex.ts, docs/导出.md “中枢”): only the path is
 * kept, the index stays the hub's. The hub decision of the plan: M3E depends on the file's format, never on where the
 * hub lives, so moving the hub is changing this one path. */

import { DEFAULT_CONTRACT_INDEX_PATH, contractIndexPathOf } from "../../hub/contractIndex";
import { ASSET_PATH } from "../../assetManifest";
import type { ExternalFiles } from "../../tokens";
import { op, OpError, S } from "../op";
import { withDoc } from "../state";

export const setContractIndex = op<{ path: string }, { contractIndex: string }>({
  name: "set_contract_index",
  summary: `Says where the project reads the hub's contract index (format m3e-contract-index: each outside module's namespace, the version of the contract it publishes and where that contract is): a path inside the project's folder, from the project file. "" goes back to the default, ${DEFAULT_CONTRACT_INDEX_PATH} beside the project file. Only the path is kept; the index stays the hub's. An export compares the contracts the design is written to (the gameplay contract) with it and lists a version that differs in .m3e/gaps.json.`,
  args: S.obj({ path: S.str("a path inside the project's folder, names joined by / (no ..), or \"\"") }, ["path"]),
  label: () => "Contract index",
  run(s, a) {
    const path = a.path.trim();
    if (path && !ASSET_PATH.test(path)) throw new OpError("invalid_value", `${JSON.stringify(a.path)} is not a path inside the project's folder: names joined by /, none of them . or .., no drive and no backslash.`, "path");
    const { contractIndex: _was, ...rest } = s.doc.external ?? {};
    const external: ExternalFiles = path && path !== DEFAULT_CONTRACT_INDEX_PATH ? { ...rest, contractIndex: path } : rest;
    const next = Object.keys(external).length ? external : undefined;
    if ((s.doc.external?.contractIndex ?? "") === (next?.contractIndex ?? "")) throw new OpError("nothing_to_do", `The project reads its contract index from ${contractIndexPathOf(s.doc)} already.`);
    return { state: withDoc(s, { external: next }), result: { contractIndex: path || DEFAULT_CONTRACT_INDEX_PATH } };
  },
});
