/* The versions of a document's format and the steps that bring an older document up to this one (docs/项目文件.md).
 *
 * Every way a document comes in (a project file, a folder, a shared link, the browser's own copy, an MCP client's file,
 * a model's draft) goes through `loadDocument` (lib/project.ts), which takes the version the document was written at
 * and runs the steps here, in order, before it checks and cleans the document. So a document is migrated the same way
 * wherever it comes from, and a step is written once.
 *
 * A step is a pure function from a document of one version to a document of the next. It never changes what it is
 * given, it leaves every field it does not know alone (a field of a newer version, a tool's own), and it is idempotent:
 * a document already in the new form comes back as it was. That last rule matters because some documents carry no
 * version (a bare document in a link, the browser's copy written before records carried one, a hand-written file):
 * they are read as `BARE_VERSION` and may already be newer than that. Each step has its own tests
 * (lib/migrations.test.ts runs the contract below on every step listed here).
 *
 * Versions 0, 1 and 2 are one shape of document: 1 was the envelope other tools wrote, 2 added `packs` beside the
 * document, and neither changed the document itself. Version 3 is the first real step (lib/converge.ts): what a tap's
 * transition, a condition's value and a binding say is written one way, in forms every reader reads the same. Version
 * 4 (the same file) leaves one form of each with every reader moved onto it: a tap's move is its motion, a binding and
 * a condition are expressions, a repeated part's words read its row as `row.<field>`. Version 5 (the same file) gives
 * each idea a part's props hold one name and one unit across the parts (a field's help is `helperText` on every input,
 * a duration is in seconds). The
 * retired whole-screen parts are no step: they still draw, and are split into atoms only when someone asks
 * (lib/retire.ts), an undoable operation rather than a rewrite on opening. */

import { CONVERGE, CONVERGE_4, CONVERGE_5 } from "./converge";

export type MigrationDoc = Record<string, unknown>;

export type Migration = {
  /** the version the step brings a document to; it runs on a document of the version before */
  to: number;
  /** what it changes, said in a few words */
  name: string;
  /** the document of version `to - 1` as a document of version `to`; a new object, the one given left untouched */
  up(doc: MigrationDoc): MigrationDoc;
};

/** the version of the format this app reads and writes */
export const PROJECT_VERSION = 5;

/** The version a document that says none is read as. Fixed for good: everything written before every store carried a
 *  version is of this shape, and everything written since says its own. */
export const BARE_VERSION = 2;

/** The steps, in order, each to the version after the one before; the last brings a document to PROJECT_VERSION. */
export const MIGRATIONS: readonly Migration[] = [CONVERGE, CONVERGE_4, CONVERGE_5];

/** What is wrong with a list of steps: they must run from BARE_VERSION + 1 up to `target` with no version skipped,
 *  repeated or out of order. Empty when nothing is. */
export function migrationProblems(steps: readonly Migration[], target: number = PROJECT_VERSION): string[] {
  const out: string[] = [];
  steps.forEach((s, i) => {
    const want = BARE_VERSION + 1 + i;
    if (s.to !== want) out.push(`step ${i} ("${s.name}") goes to ${s.to}, but the step in that place goes to ${want}`);
    if (!s.name.trim()) out.push(`step ${i} has no name`);
  });
  const last = steps.length ? steps[steps.length - 1].to : BARE_VERSION;
  if (last !== target) out.push(`the steps end at version ${last}, but the format is version ${target}`);
  return out;
}

/** What `migrate` did: the version the document was read at and the steps that ran, by name. */
export type Migrated = { doc: MigrationDoc; from: number; to: number; ran: string[] };

/** The document brought from version `from` up to `target` by the steps after it. A document of `target` or later
 *  comes back as it is (`to` then says its own version); one of a version below the first step's is of its shape. */
export function migrate(doc: MigrationDoc, from: number, o: { steps?: readonly Migration[]; target?: number } = {}): Migrated {
  const steps = o.steps ?? MIGRATIONS;
  const target = o.target ?? PROJECT_VERSION;
  const ran: string[] = [];
  let out = doc;
  for (const s of steps) {
    if (s.to <= from || s.to > target) continue;
    out = s.up(out);
    ran.push(s.name);
  }
  return { doc: out, from, to: Math.max(from, target), ran };
}

/** the version an envelope says, read the way it always was: a number, or none (0) */
export const versionOf = (envelope: Record<string, unknown>): number => (typeof envelope.version === "number" && Number.isFinite(envelope.version) ? envelope.version : 0);
