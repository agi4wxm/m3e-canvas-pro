/* Re-exporting a product into a folder that already holds it, without destroying anything someone wrote there. Pure:
 * given the manifest the last export left (.m3e/manifest.json), the hashes of what is on disk now and the files of
 * the new export, it says what to write, what to leave, what to delete and what to report. The writers
 * (lib/export/fsAccess.ts in the browser, lib/export/nodeWriter.ts in Node) read the disk and carry the plan out.
 *
 *   generated file, not on disk                    written
 *   generated file, on disk as the export makes it unchanged
 *   generated file, on disk as the last export left it      rewritten
 *   generated file, on disk changed since (or never ours)   a conflict: left as it is, the new version written beside
 *                                                  it as `<file>.m3e-new`, and reported
 *   package.json on disk                           merged: the keys the export writes take its values (its
 *                                                  dependencies at their pins, its scripts), the keys it wrote last
 *                                                  time and no longer does go, whatever someone added stays
 *   seeded file, not on disk                       written (custom code starts from it)
 *   seeded file, on disk                           kept, whatever it holds
 *   generated file the product no longer has       deleted when it is as the last export left it, else left
 *   `.m3e-new` of a conflict that is gone          deleted when it is as the export wrote it
 */

import { assertSafePaths, isSafePath } from "./paths";
import { sha256 } from "./sha256";
import type { FileKind, ProductFiles } from "./types";

export const MANIFEST_PATH = ".m3e/manifest.json";
export const CONFLICT_SUFFIX = ".m3e-new";
export const MANIFEST_FORMAT = "m3e-product-manifest";

/** a file the export wrote, by the hash of what it wrote; for a merged package.json also the keys it wrote there
 *  (`dependencies.react`, `scripts.dev`, `name`), so a key it stops writing can be taken out again */
export type ManifestEntry = { kind: FileKind; sha256: string; keys?: string[] };

export type Manifest = {
  format: typeof MANIFEST_FORMAT;
  version: 1;
  generator: string;
  /** the product's npm name */
  product: string;
  /** every file of the export but the manifest, with the hash of what the export made of it */
  files: Record<string, ManifestEntry>;
  /** the new versions an export wrote beside generated files edited since, with their hashes */
  pending: Record<string, string>;
};

const HEX = /^[0-9a-f]{64}$/;

/** A manifest read back from disk, or null when the text is none (or one that points outside the folder: then the
 *  folder is treated as one no export has written, which only ever makes more conflicts, never fewer). */
export function parseManifest(text: string | null | undefined): Manifest | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<Manifest>;
  if (m.format !== MANIFEST_FORMAT || m.version !== 1 || !m.files || typeof m.files !== "object") return null;
  const files: Record<string, ManifestEntry> = {};
  for (const [path, entry] of Object.entries(m.files)) {
    const e = entry as Partial<ManifestEntry> | null;
    if (!isSafePath(path) || !e || (e.kind !== "generated" && e.kind !== "seeded") || typeof e.sha256 !== "string" || !HEX.test(e.sha256)) return null;
    const keys = Array.isArray(e.keys) ? e.keys.filter((k): k is string => typeof k === "string") : undefined;
    files[path] = { kind: e.kind, sha256: e.sha256, ...(keys ? { keys } : {}) };
  }
  const pending: Record<string, string> = {};
  for (const [path, hash] of Object.entries(m.pending && typeof m.pending === "object" ? m.pending : {})) {
    if (!isSafePath(path) || !path.endsWith(CONFLICT_SUFFIX) || typeof hash !== "string" || !HEX.test(hash)) return null;
    pending[path] = hash;
  }
  return { format: MANIFEST_FORMAT, version: 1, generator: typeof m.generator === "string" ? m.generator : "", product: typeof m.product === "string" ? m.product : "", files, pending };
}

const sortedRecord = <T>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/** the manifest as written: keys in order, so the same export writes the same bytes */
export function formatManifest(m: Manifest): string {
  return `${JSON.stringify({ format: m.format, version: m.version, generator: m.generator, product: m.product, files: sortedRecord(m.files), pending: sortedRecord(m.pending) }, null, 2)}\n`;
}

/** what is on disk at each path: the SHA-256 of its bytes, or undefined when there is no file */
export type DiskHashes = Readonly<Record<string, string | undefined>>;

export type PlannedWrite = { path: string; body: string | Uint8Array; why: "new" | "update" | "merge" | "seed" | "conflict" | "manifest" };

export type ExportPlan = {
  /** what to write, the manifest last */
  writes: PlannedWrite[];
  /** what to delete: generated files gone from the product, and conflict copies no longer wanted */
  deletes: string[];
  /** generated files already as this export makes them */
  unchanged: string[];
  /** package.json files that keep what someone added to them */
  merged: string[];
  /** seeded files already there: custom code, left as it is */
  kept: string[];
  /** generated files changed since the last export: left as they are, the new version written to `copy` */
  conflicts: { path: string; copy: string }[];
  /** generated files the product no longer has, deleted since nobody had changed them */
  removed: string[];
  /** files the export would have deleted but someone changed: left in place */
  orphaned: string[];
  /** what the plan noticed about the folder */
  notes: string[];
  manifest: Manifest;
};

/** the paths whose text `planExport` needs besides their hash: the files it merges */
export const pathsToRead = (next: ProductFiles) =>
  Object.entries(next)
    .filter(([, f]) => f.merge)
    .map(([path]) => path)
    .sort();

/** the paths whose hashes `planExport` reads: everything the new export and the last one name */
export function pathsToHash(next: ProductFiles, previous: Manifest | null): string[] {
  const out = new Set<string>([MANIFEST_PATH]);
  for (const [path, f] of Object.entries(next)) {
    out.add(path);
    if (f.kind === "generated") out.add(path + CONFLICT_SUFFIX);
  }
  for (const path of Object.keys(previous?.files ?? {})) out.add(path);
  for (const path of Object.keys(previous?.pending ?? {})) out.add(path);
  return [...out].sort();
}

export type PlanInput = {
  /** the product's npm name, recorded in the manifest */
  product: string;
  next: ProductFiles;
  disk: DiskHashes;
  /** the text on disk of the paths `pathsToRead` names, where there is a file */
  texts?: Readonly<Record<string, string | undefined>>;
  /** the manifest on disk, or null for a folder no export has written */
  previous: Manifest | null;
  generator?: string;
};

const byPath = <T>([a]: [string, T], [b]: [string, T]) => (a < b ? -1 : a > b ? 1 : 0);

export function planExport({ product, next, disk, texts = {}, previous, generator = "M3E Canvas Pro" }: PlanInput): ExportPlan {
  const paths = Object.keys(next).sort();
  assertSafePaths([...paths, MANIFEST_PATH]);
  for (const path of paths) {
    if (path.startsWith(".m3e/")) throw new Error(`refusing to write ${path}: .m3e/ is the manifest's`);
    if (path.endsWith(CONFLICT_SUFFIX)) throw new Error(`refusing to write ${path}: ${CONFLICT_SUFFIX} names the copies of conflicts`);
  }
  const plan: ExportPlan = { writes: [], deletes: [], unchanged: [], merged: [], kept: [], conflicts: [], removed: [], orphaned: [], notes: [], manifest: { format: MANIFEST_FORMAT, version: 1, generator, product, files: {}, pending: {} } };
  if (previous && previous.product && previous.product !== product) plan.notes.push(`the folder held the export of ${JSON.stringify(previous.product)}`);
  const before = previous?.files ?? {};
  const copies = new Set<string>();

  for (const path of paths) {
    const { body, kind, merge } = next[path];
    const hash = sha256(body);
    const there = disk[path];
    const last = before[path];
    if (kind === "seeded") {
      plan.manifest.files[path] = { kind, sha256: last?.kind === "seeded" ? last.sha256 : hash };
      if (there === undefined) plan.writes.push({ path, body, why: "seed" });
      else plan.kept.push(path);
      continue;
    }
    const merged = merge === "package.json" && typeof body === "string" && there !== undefined ? mergedPackageJson(texts[path], body, last?.kind === "generated" ? last.keys : undefined) : null;
    if (merged !== null) {
      /* a package.json is put together with what is there, whoever changed it */
      const after = sha256(merged);
      plan.manifest.files[path] = { kind, sha256: after, keys: ownedKeys(body as string) };
      if (after === there) plan.unchanged.push(path);
      else plan.writes.push({ path, body: merged, why: last?.sha256 === there ? "update" : "merge" });
      if (after !== hash) plan.merged.push(path);
      continue;
    }
    plan.manifest.files[path] = { kind, sha256: hash, ...(merge && typeof body === "string" ? { keys: ownedKeys(body) } : {}) };
    if (there === undefined) plan.writes.push({ path, body, why: "new" });
    else if (there === hash) plan.unchanged.push(path);
    else if (last?.kind === "generated" && last.sha256 === there) plan.writes.push({ path, body, why: "update" });
    else {
      /* edited since the last export, or a file of the same name the export never wrote: theirs stays */
      const copy = path + CONFLICT_SUFFIX;
      copies.add(copy);
      plan.conflicts.push({ path, copy });
      plan.manifest.pending[copy] = hash;
      if (disk[copy] !== hash) plan.writes.push({ path: copy, body, why: "conflict" });
    }
  }

  /* what the last export wrote that this one does not: gone when nobody changed it */
  for (const [path, entry] of Object.entries(before).sort(byPath)) {
    if (path in next || entry.kind !== "generated") continue;
    const there = disk[path];
    if (there === undefined) continue;
    if (there === entry.sha256) {
      plan.deletes.push(path);
      plan.removed.push(path);
    } else plan.orphaned.push(path);
  }
  for (const [copy, hash] of Object.entries(previous?.pending ?? {}).sort(byPath)) {
    if (copies.has(copy)) continue;
    const there = disk[copy];
    if (there === undefined) continue;
    if (there === hash) plan.deletes.push(copy);
    else plan.orphaned.push(copy);
  }

  const manifest = formatManifest(plan.manifest);
  if (disk[MANIFEST_PATH] !== sha256(manifest)) plan.writes.push({ path: MANIFEST_PATH, body: manifest, why: "manifest" });
  return plan;
}

/* ---------- package.json ---------- */

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
/** the sections of a package.json the export and someone else may both add to */
const SHARED = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "scripts", "overrides"];

/** the keys a generated package.json writes: its top-level keys, each entry of its shared sections, its workspaces */
export function ownedKeys(generatedText: string): string[] {
  const ours = JSON.parse(generatedText) as Json;
  const out: string[] = [];
  for (const [key, value] of Object.entries(ours)) {
    out.push(key);
    if (SHARED.includes(key) && isObject(value)) for (const k of Object.keys(value)) out.push(`${key}.${k}`);
    if (key === "workspaces" && Array.isArray(value)) for (const w of value) if (typeof w === "string") out.push(`workspaces.${w}`);
  }
  return out;
}

/** A generated package.json put together with what is on disk: every key the export writes takes its value (its
 *  dependencies at their pins, its scripts), a key it wrote before (`before`) and no longer does is taken out, and
 *  whatever else is there stays: dependencies and scripts someone added, workspaces they listed, fields the export
 *  does not write. Null when what is on disk is not a JSON object. */
export function mergedPackageJson(disk: string | undefined, generatedText: string, before: string[] = []): string | null {
  if (disk === undefined) return null;
  let theirs: unknown;
  try {
    theirs = JSON.parse(disk);
  } catch {
    return null;
  }
  if (!isObject(theirs)) return null;
  const ours = JSON.parse(generatedText) as Json;
  const was = new Set(before);
  const out: Json = {};
  for (const [key, value] of Object.entries(ours)) {
    const there = theirs[key];
    if (SHARED.includes(key) && isObject(value) && isObject(there)) {
      const kept = Object.fromEntries(Object.entries(there).filter(([k]) => !was.has(`${key}.${k}`) || k in value));
      const both: Json = { ...kept, ...value };
      out[key] = key === "scripts" ? both : Object.fromEntries(Object.keys(both).sort().map((k) => [k, both[k]]));
    } else if (key === "workspaces" && Array.isArray(value) && Array.isArray(there)) out[key] = [...value, ...there.filter((w) => !value.includes(w) && !was.has(`workspaces.${String(w)}`))];
    else out[key] = value;
  }
  for (const [key, value] of Object.entries(theirs)) if (!(key in out) && !was.has(key)) out[key] = value;
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** a plan in a few words, for a log or a status line */
export function planSummary(plan: ExportPlan): { written: number; unchanged: number; merged: number; kept: number; conflicts: number; removed: number; orphaned: number } {
  return {
    written: plan.writes.filter((w) => w.why !== "conflict" && w.why !== "manifest").length,
    unchanged: plan.unchanged.length,
    merged: plan.merged.length,
    kept: plan.kept.length,
    conflicts: plan.conflicts.length,
    removed: plan.removed.length,
    orphaned: plan.orphaned.length,
  };
}
