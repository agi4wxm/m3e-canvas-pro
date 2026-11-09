/* The hub's contract index (contractIndex.ts): its format read strictly, the minimal example of the fixtures read, its
 * place the project's configuration (`external.contractIndex`, set_contract_index), and the gameplay contract's version
 * compared with it: another version, or a namespace it does not list, is a gap. */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { counterIds, DocStore, guessMeasurer, ops, savedDoc, stateOf } from "../core";
import { checkValue } from "../mocks/check";
import { PROJECT_VERSION, openProject } from "../project";
import { EXAMPLE_GAME_CONTRACT, linkGame } from "../game";
import {
  CONTRACT_INDEX_SCHEMA,
  DEFAULT_CONTRACT_INDEX_PATH,
  contractIndexGaps,
  contractIndexPathOf,
  currentContractIndex,
  linkedContractsOf,
  loadContractIndex,
  readContractIndex,
  setContractIndexSource,
  versionMismatches,
  type ContractIndex,
} from "./contractIndex";

const TEXT = readFileSync(new URL("./fixtures/contract-index.json", import.meta.url), "utf8");
const INDEX = readContractIndex(TEXT).index!;
const at = (version: string): ContractIndex => ({ ...INDEX, modules: { ...INDEX.modules, "game-loop": { ...INDEX.modules["game-loop"], contractVersion: version } } });

describe("the contract index's format", () => {
  it("reads the fixtures' example, which keeps to the format's own JSON Schema", () => {
    expect(readContractIndex(TEXT).problems).toEqual([]);
    expect(INDEX.modules["game-loop"]).toEqual({ namespace: "game", contractVersion: "1.0.0", contract: "game-loop/contract.m3e-game.json", format: "m3e-game" });
    expect(checkValue({}, CONTRACT_INDEX_SCHEMA, JSON.parse(TEXT), { locale: "en" })).toEqual([]);
  });

  it("refuses what is no index, and says why", () => {
    expect(readContractIndex("{").problems).toEqual(["the file is not JSON"]);
    expect(readContractIndex({ format: "m3e-gaps", version: 1 }).problems[0]).toMatch(/format should be "m3e-contract-index"/);
    expect(readContractIndex({ format: "m3e-contract-index", version: 2, modules: {} }).problems[0]).toMatch(/version 2 is not one/);
    const bad = readContractIndex({
      format: "m3e-contract-index",
      version: 1,
      modules: {
        "Game Loop": { namespace: "game", contractVersion: "1", contract: "a.json" },
        other: { namespace: "game", contractVersion: "1", contract: "../outside.json" },
        third: { namespace: "data", contract: "http://plain/x" },
      },
    });
    expect(bad.index).toBeNull();
    expect(bad.problems.join("\n")).toMatch(/cannot name a module/);
    expect(bad.problems.join("\n")).toMatch(/other\/namespace: game is Game Loop's already/);
    expect(bad.problems.join("\n")).toMatch(/other\/contract: should be a path inside the index's folder/);
    expect(bad.problems.join("\n")).toMatch(/third\/contract: should be a path/);
    expect(bad.problems.join("\n")).toMatch(/third\/contractVersion/);
    /* a contract may be at an address of the hub's as well */
    expect(readContractIndex({ format: "m3e-contract-index", version: 1, modules: { "game-loop": { namespace: "game", contractVersion: "2", contract: "https://hub.example/game-loop/contract.m3e-game.json" } } }).problems).toEqual([]);
  });
});

describe("where the project reads it", () => {
  it("is the project's configuration, beside the project file by default, kept in the project file and set by set_contract_index", () => {
    expect(contractIndexPathOf({})).toBe(DEFAULT_CONTRACT_INDEX_PATH);
    expect(contractIndexPathOf({ external: { contractIndex: "hub/index.json" } })).toBe("hub/index.json");
    expect(contractIndexPathOf({ external: { contractIndex: "../hub/index.json" } })).toBe(DEFAULT_CONTRACT_INDEX_PATH);
    const s = new DocStore(stateOf({ groups: [], frames: [] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
    const ai = { origin: "ai" as const };
    expect(() => s.run(ops.setContractIndex, { path: "../elsewhere.json" }, ai)).toThrow(/not a path inside the project's folder/);
    expect(s.run(ops.setContractIndex, { path: "hub/contract-index.json" }, ai)).toEqual({ contractIndex: "hub/contract-index.json" });
    expect(s.get().doc.external).toEqual({ contractIndex: "hub/contract-index.json" });
    const opened = openProject({ format: "m3e-project", version: PROJECT_VERSION, document: { ...savedDoc(s.get()), external: { contractIndex: "hub/contract-index.json", assetManifest: "../x.json" } } });
    expect(opened?.external).toEqual({ contractIndex: "hub/contract-index.json" });
    expect(s.run(ops.setContractIndex, { path: "" }, ai)).toEqual({ contractIndex: DEFAULT_CONTRACT_INDEX_PATH });
    expect(s.get().doc.external).toBeUndefined();
    expect(() => s.run(ops.setContractIndex, { path: DEFAULT_CONTRACT_INDEX_PATH }, ai)).toThrow(/already/);
  });

  it("says when there is none to read, when the one named is not there or is none, and reads the folder afresh", async () => {
    const files: Record<string, string> = { "contract-index.json": TEXT, "hub/broken.json": "{}" };
    const read = async (p: string) => files[p] ?? null;
    expect(await loadContractIndex({}, read)).toMatchObject({ status: "read", path: "contract-index.json", index: INDEX });
    expect(await loadContractIndex({}, async () => null)).toEqual({ status: "none", path: "contract-index.json" });
    expect(await loadContractIndex({ external: { contractIndex: "hub/index.json" } }, read)).toEqual({ status: "missing", path: "hub/index.json" });
    expect(await loadContractIndex({ external: { contractIndex: "hub/broken.json" } }, read)).toMatchObject({ status: "invalid", path: "hub/broken.json" });
    /* the editor's: no folder, nothing; a folder, read each time it is asked */
    setContractIndexSource(null);
    expect(await currentContractIndex({})).toBeNull();
    setContractIndexSource(read);
    files["contract-index.json"] = JSON.stringify(at("1.1.0"));
    expect(await currentContractIndex({})).toMatchObject({ status: "read", index: { modules: { "game-loop": { contractVersion: "1.1.0" } } } });
    setContractIndexSource(null);
  });
});

describe("the gameplay contract's version against the index", () => {
  const doc = linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT).doc;

  it("is no gap when they agree, nor without an index or a contract", () => {
    expect(linkedContractsOf(doc)).toEqual([{ module: "game-loop", namespace: "game", contractVersion: "1.0.0" }]);
    expect(contractIndexGaps(linkedContractsOf(doc), INDEX)).toEqual([]);
    expect(contractIndexGaps(linkedContractsOf(doc), null)).toEqual([]);
    expect(contractIndexGaps(linkedContractsOf({}), at("9"))).toEqual([]);
  });

  it("is a gap when the index has another version, or does not list the namespace", () => {
    expect(contractIndexGaps(linkedContractsOf(doc), at("1.2.0"))).toEqual([
      { kind: "contract-version", module: "game-loop", ref: "game", reason: "mismatch", detail: "the design is written to game contract 1.0.0; the hub's index has game-loop at 1.2.0 (game-loop/contract.m3e-game.json): import that one again", where: [] },
    ]);
    const { "game-loop": _gone, ...rest } = INDEX.modules;
    expect(contractIndexGaps(linkedContractsOf(doc), { ...INDEX, modules: rest })).toEqual([
      { kind: "contract-version", module: "game-loop", ref: "game", reason: "not-indexed", detail: "the design is written to game contract 1.0.0, a namespace the hub's index does not list", where: [] },
    ]);
    /* M3E's example contract, which a template brought, is said to be the example */
    const example = linkGame({ groups: [], frames: [] }, EXAMPLE_GAME_CONTRACT, { example: true }).doc;
    expect(versionMismatches(linkedContractsOf(example), at("2.0.0"))).toMatchObject([{ reason: "mismatch", module: "game-loop", linked: { example: true } }]);
    expect(contractIndexGaps(linkedContractsOf(example), at("2.0.0"))[0].detail).toMatch(/^the design is written to M3E's example contract 1\.0\.0;/);
  });
});
