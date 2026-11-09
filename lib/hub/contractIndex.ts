/* The hub's contract index (docs/导出.md “中枢”, docs/游戏阶段整改计划.md “外部模块的接口约定”): one JSON file in which the
 * hub says, for each module outside M3E, the namespace it owns, the version of the contract it publishes now and where
 * that contract file is. Format `m3e-contract-index`, version 1; contract-index.schema.json is its JSON Schema.
 *
 * The hub decision: M3E depends on the file's format only, never on where the hub lives. Where the index is is the
 * project's configuration (`Doc.external.contractIndex`, a path inside the project's folder like the asset manifest's
 * and the gameplay contract's, `contract-index.json` beside the project file by default); moving the hub is changing
 * that one path. M3E reads the index and writes nothing into it: what it gives back to the hub is the gap file
 * (`.m3e/gaps.json`, lib/export/gaps.ts), where a contract the design was written to at another version than the
 * index's is one more gap (`contract-version`). No DOM, no Node. */

import { ASSET_PATH } from "../assetManifest";
import { checkValue } from "../mocks/check";
import type { JsonSchemaObject } from "../api/types";
import type { Gap } from "../export/gaps";
import type { GameContract } from "../game/format";
import FORMAT_SCHEMA from "./contract-index.schema.json";

export const CONTRACT_INDEX_FORMAT = "m3e-contract-index";
export const CONTRACT_INDEX_VERSION = 1;
/** where a project looks for the index when its configuration names no other place: beside the project file */
export const DEFAULT_CONTRACT_INDEX_PATH = "contract-index.json";

/** the format's own JSON Schema (2020-12), as the hub checks what it writes against it */
export const CONTRACT_INDEX_SCHEMA = FORMAT_SCHEMA as unknown as JsonSchemaObject;

/** what names a module: small letters, digits and hyphens (`game-loop`, `asset-pipeline`) */
export const MODULE_ID = /^[a-z][a-z0-9-]{0,47}$/;
/** what names a namespace: a small letter, then letters and digits (`game`), as a gameplay contract's */
export const NAMESPACE = /^[a-z][a-zA-Z0-9]{0,31}$/;

/** One module's entry: its namespace, the version of the contract it publishes now, where the contract is (a path from
 *  the index's folder, or an https:// address), and the contract's format when it is one M3E reads. */
export type IndexedContract = { namespace: string; contractVersion: string; contract: string; format?: string; summary?: string };

export type ContractIndex = {
  format: typeof CONTRACT_INDEX_FORMAT;
  version: typeof CONTRACT_INDEX_VERSION;
  summary?: string;
  /** by the module's id */
  modules: Record<string, IndexedContract>;
};

/** how long an index's text may be: past this it is refused, not cut */
export const CONTRACT_INDEX_MAX_TEXT = 1_000_000;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** where a contract may be: a path inside the index's folder, or an https:// address */
const isContractPlace = (v: string) => ASSET_PATH.test(v) || /^https:\/\/[^\s/]+\/\S*$/.test(v);

export type ContractIndexRead = { index: ContractIndex; problems: [] } | { index: null; problems: string[] };

/** An index read from its file's text or parsed JSON: the index, or every reason it is none. Strict, as the gameplay
 *  contract is read: the index is the hub's, and M3E mends nothing in it. */
export function readContractIndex(input: unknown): ContractIndexRead {
  let value = input;
  if (typeof input === "string") {
    if (input.length > CONTRACT_INDEX_MAX_TEXT) return { index: null, problems: [`the file is longer than ${CONTRACT_INDEX_MAX_TEXT} characters`] };
    try {
      value = JSON.parse(input);
    } catch {
      return { index: null, problems: ["the file is not JSON"] };
    }
  }
  if (!isRecord(value)) return { index: null, problems: ["the file holds no JSON object"] };
  if (value.format !== CONTRACT_INDEX_FORMAT) return { index: null, problems: [`format should be "${CONTRACT_INDEX_FORMAT}"${typeof value.format === "string" ? `, not "${value.format.slice(0, 40)}"` : ""}`] };
  if (value.version !== CONTRACT_INDEX_VERSION) return { index: null, problems: [`version ${JSON.stringify(value.version)} is not one this M3E reads (it reads ${CONTRACT_INDEX_VERSION})`] };
  const problems = checkValue({}, CONTRACT_INDEX_SCHEMA, value, { locale: "en" }).map((e) => `${e.pointer.slice(1) || "/"}: ${e.detail}`);
  /* what the checker leaves to the reader: the modules' ids, where each contract is, one module per namespace */
  const owner = new Map<string, string>();
  if (isRecord(value.modules))
    for (const [id, m] of Object.entries(value.modules)) {
      if (!MODULE_ID.test(id)) problems.push(`/modules: ${JSON.stringify(id.slice(0, 48))} cannot name a module (small letters, digits and hyphens)`);
      if (!isRecord(m)) continue;
      if (typeof m.contract === "string" && !isContractPlace(m.contract)) problems.push(`/modules/${id}/contract: should be a path inside the index's folder (names joined by /, no ..) or an https:// address`);
      if (typeof m.namespace === "string") {
        const was = owner.get(m.namespace);
        if (was) problems.push(`/modules/${id}/namespace: ${m.namespace} is ${was}'s already (one module per namespace)`);
        else owner.set(m.namespace, id);
      }
    }
  if (problems.length) return { index: null, problems: [...new Set(problems)].slice(0, 40) };
  return { index: JSON.parse(JSON.stringify(value)) as ContractIndex, problems: [] };
}

/** the module that owns a namespace in the index, with its entry */
export function indexedByNamespace(index: ContractIndex, namespace: string): [string, IndexedContract] | undefined {
  return Object.entries(index.modules).find(([, m]) => m.namespace === namespace);
}

/* ---------- where the project reads it ---------- */

/** A path a project may name its index by: one inside the project's folder (lib/assetManifest.ts `ASSET_PATH`). */
export const cleanContractIndexPath = (v: unknown): string | undefined => (typeof v === "string" && ASSET_PATH.test(v) ? v : undefined);

/** where the project's index is: what its configuration says, else beside the project file */
export const contractIndexPathOf = (doc: { external?: { contractIndex?: unknown } } | null | undefined): string => cleanContractIndexPath(doc?.external?.contractIndex) ?? DEFAULT_CONTRACT_INDEX_PATH;

/** What reading the index came to: none beside the project and none named (`none`: no hub to compare with, which is no
 *  gap), read (`read`), or one the configuration names that is not there or is no index (`missing`, `invalid`). */
export type ContractIndexState =
  | { status: "none"; path: string }
  | { status: "read"; path: string; index: ContractIndex }
  | { status: "missing"; path: string }
  | { status: "invalid"; path: string; problems: string[] };

/** The index where the project's configuration says. `read` gives a file's text by its path in the project's folder,
 *  null when it has none; nothing here throws for what the folder holds. */
export async function loadContractIndex(doc: { external?: { contractIndex?: unknown } } | null | undefined, read: (path: string) => Promise<string | null>): Promise<ContractIndexState> {
  const path = contractIndexPathOf(doc);
  const named = cleanContractIndexPath(doc?.external?.contractIndex) !== undefined;
  const text = await read(path).catch(() => null);
  if (text === null) return named ? { status: "missing", path } : { status: "none", path };
  const got = readContractIndex(text);
  return got.index ? { status: "read", path, index: got.index } : { status: "invalid", path, problems: got.problems };
}

/* ---------- the index the editor exports with ---------- */

/** what reads a file of the open project's folder by its path, null when there is none */
export type FolderText = (path: string) => Promise<string | null>;

let source: FolderText | null = null;

/** The folder the open project's index is read from from now on (null: none, a project bound to a file or to
 *  nothing), as lib/projects/persist.ts binds a folder project. */
export function setContractIndexSource(next: FolderText | null) {
  source = next;
}

/** The open project's index as its folder holds it now, read afresh (an export reads it each time, so what the hub
 *  wrote since is what is compared); null when the project has no folder. */
export async function currentContractIndex(doc: { external?: { contractIndex?: unknown } } | null | undefined): Promise<ContractIndexState | null> {
  const read = source;
  return read ? loadContractIndex(doc, read) : null;
}

/* ---------- what the design was written to, against it ---------- */

/** A contract of another module's a design is written to, as the index is compared with it: the module that should
 *  publish it, its namespace and the version the design has. The gameplay contract is one (`Doc.game`); the data
 *  module's tables (the plan's J4) are given the same way when they are linked. */
export type LinkedContract = { module: string; namespace: string; contractVersion: string; example?: boolean };

/** the contracts a document is written to: its gameplay contract, when it links one */
export function linkedContractsOf(doc: { game?: { contract: GameContract; example?: true } }): LinkedContract[] {
  const c = doc.game?.contract;
  return c ? [{ module: "game-loop", namespace: c.namespace, contractVersion: c.contractVersion, ...(doc.game?.example ? { example: true } : {}) }] : [];
}

/** A contract of the design's the index has at another version (`mismatch`, with the module and the version the
 *  index has) or not at all (`not-indexed`). */
export type VersionMismatch = { linked: LinkedContract } & ({ reason: "mismatch"; module: string; entry: IndexedContract } | { reason: "not-indexed" });

/** what of the contracts the design was written to the index has at another version, or has not; none without an index */
export function versionMismatches(linked: readonly LinkedContract[], index: ContractIndex | null | undefined): VersionMismatch[] {
  if (!index) return [];
  const out: VersionMismatch[] = [];
  for (const l of linked) {
    const found = indexedByNamespace(index, l.namespace);
    if (!found) out.push({ linked: l, reason: "not-indexed" });
    else if (found[1].contractVersion !== l.contractVersion) out.push({ linked: l, reason: "mismatch", module: found[0], entry: found[1] });
  }
  return out;
}

/** The same as gaps of the gap file's: one `contract-version` gap each, `mismatch` or `not-indexed`, for the whole
 *  design (no place: the design leans on the contract everywhere it uses it). */
export function contractIndexGaps(linked: readonly LinkedContract[], index: ContractIndex | null | undefined): Gap[] {
  return versionMismatches(linked, index).map((m) => {
    const was = m.linked.example ? `M3E's example contract ${m.linked.contractVersion}` : `${m.linked.namespace} contract ${m.linked.contractVersion}`;
    return m.reason === "not-indexed"
      ? { kind: "contract-version", module: m.linked.module, ref: m.linked.namespace, reason: "not-indexed", detail: `the design is written to ${was}, a namespace the hub's index does not list`, where: [] }
      : { kind: "contract-version", module: m.module, ref: m.linked.namespace, reason: "mismatch", detail: `the design is written to ${was}; the hub's index has ${m.module} at ${m.entry.contractVersion} (${m.entry.contract}): import that one again`, where: [] };
  });
}
