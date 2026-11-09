/* The file backend: a project file worked on with no editor open. A `DocStore` holds the document with each part's own
 * guess at its size (`guessMeasurer`), every tool runs on it exactly as it does in the editor, and each call that
 * changed the document is written back at once, in the editor's own format (lib/core/projectFile.ts: one file, or a
 * folder with its pictures beside it). Pictures are drawn in headless Chromium (render.ts) when it is there.
 *
 * Before each call the file is looked at again: one that changed on disk is read again, and a call that would write is
 * refused that once, so nothing another program saved is ever overwritten and the model reads the new document first. */

import { dirname, isAbsolute, resolve } from "node:path";
import { DocStore, guessMeasurer, savedDoc, stateOf, type CoreState } from "../../lib/core";
import { differenceCounts } from "../../lib/export/differences";
import { exportToFolder, FolderRefused } from "../../lib/export/nodeWriter";
import { buildProduct } from "../../lib/export/product";
import type { Lang } from "../../lib/i18n";
import type { Access, ClientInfo } from "../../lib/mcp/protocol";
import { executeTool, type Registry } from "../../lib/tools";
import { wrote } from "../../lib/tools/ops";
import { wouldTakeAway } from "../../lib/tools/removals";
import type { GenerateEnv, Renderer } from "../../lib/tools/types";
import { failure, listeners, serial, type Backend, type CallContext, type CallOutcome } from "./backend";
import { FileConflict, NotAProject, ProjectFileStore, type ProjectFormat } from "./fileStore";
import type { Log } from "./log";
import { readEditorSource } from "./sources";
import { DiskAssets } from "./assets";
import { refreshGame } from "../../lib/game/folder";
import type { Doc } from "../../lib/tokens";
import { readFile } from "node:fs/promises";

export type FileBackendOptions = {
  path: string;
  registry: Registry;
  format?: ProjectFormat;
  lang: Lang;
  readOnly: boolean;
  /** destructive calls go through without asking (there is no editor to click in) */
  allowDestructive: boolean;
  /** a renderer drawing the store's document, when pictures can be taken */
  renderer?: (get: () => CoreState) => Renderer;
  gen?: GenerateEnv;
  log: Log;
};

export class FileBackend implements Backend {
  readonly kind = "file" as const;
  readonly store: DocStore;
  readonly file: ProjectFileStore;
  private readonly queue = serial();
  private readonly changes = listeners<["document" | "access"]>();
  private readonly renderer?: Renderer;
  private opened = false;
  private writes = 0;
  /** the asset manifest beside the project, read again as it changes (assets.ts) */
  private readonly assets = new DiskAssets();

  constructor(private readonly o: FileBackendOptions) {
    this.store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => o.lang });
    this.file = new ProjectFileStore(o.path, o.format, (m) => o.log.warn(m));
    this.renderer = o.renderer?.(() => this.store.get());
  }

  /** Reads the file (none yet is an empty document, written on the first change). Throws when it is not a project. */
  async open(): Promise<void> {
    const doc = await this.file.read();
    if (doc) this.store.load(await this.withGame(doc), true);
    this.opened = true;
    this.o.log.info(doc ? `Opened ${this.o.path}: ${doc.frames.length} screen(s), ${doc.groups.length} group(s).` : `${this.o.path} does not exist yet: it is written on the first change.`);
    const newer = this.store.readOnlyVersion();
    if (newer !== null) this.o.log.warn(`${this.o.path} was written by a newer version of M3E Canvas (format ${newer}): it is open read-only, and nothing is written to it.`);
  }

  access(): Access {
    return this.o.readOnly ? "read" : "edit";
  }

  setClient(_client: ClientInfo | null) {}

  onChange(fn: (what: "document" | "access") => void) {
    return this.changes.add(fn);
  }

  status() {
    const newer = this.store.readOnlyVersion();
    const catalog = this.assets.catalog;
    const assets = catalog ? { assetManifest: catalog.manifest ? `${catalog.path}: ${Object.keys(catalog.manifest.assets).length} asset(s)${catalog.problems.length ? `, ${catalog.problems.length} problem(s)` : ""}` : `none (${catalog.path} not read)` } : {};
    return { mode: "file", file: this.o.path, ...(newer !== null ? { newerFormat: newer } : {}), ...assets, layout: this.file.layout === "folder" ? "folder (m3e-project.json, pictures in m3e-assets/)" : "one file", access: this.access(), writes: this.writes, screenshots: this.renderer ? "headless Chromium, when Playwright is installed" : "off" };
  }

  /** The document with the gameplay contract beside the project read again (lib/game/folder.ts), as a folder project
   *  opened in the editor reads it: a changed one is linked in its place (and written with the next change), one that is
   *  gone or no contract any more leaves the last one read, and either is said in the log. */
  private async withGame(doc: Doc): Promise<Doc> {
    const dir = this.file.projectDir;
    const out = await refreshGame(doc as Doc & Record<string, unknown>, (p) => readFile(resolve(dir, p), "utf8").catch(() => null));
    const r = out.refresh;
    if (r.status === "updated") this.o.log.info(`The gameplay contract was read again: ${r.report.namespace} ${r.report.contractVersion}${r.report.gaps.length ? `, ${r.report.gaps.length} reference(s) in the design no longer match it (get_game_contract lists them)` : ""}.`);
    else if (r.status === "missing" || r.status === "invalid") this.o.log.warn(`The gameplay contract ${r.path} ${r.status === "missing" ? "is not beside the project" : `cannot be read (${r.problems.slice(0, 3).join("; ")})`}: the one read last is kept.`);
    return out.doc;
  }

  /** the asset manifest beside the project, read again when it changed; a failure leaves the last one read */
  private async readAssets() {
    try {
      await this.assets.refresh(this.file.projectDir, this.store.get().doc);
    } catch (e) {
      this.o.log.warn(`The asset manifest could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** the file read again when it changed on disk; what that means for the call, or null when it had not changed */
  private async refresh(): Promise<string | null> {
    const notice = await this.refreshFile();
    await this.readAssets();
    return notice;
  }

  private async refreshFile(): Promise<string | null> {
    if (!this.opened) await this.open();
    else if (!(await this.file.changed())) return null;
    else {
      const doc = await this.file.read();
      if (doc) this.store.load(await this.withGame(doc), true);
      /* the states the session could go back to are not the file's any more: undo starts again from here */
      this.store.clearHistory();
      this.changes.emit("document");
      return doc ? `${this.o.path} changed on disk and was read again; ids and positions read before may be stale.` : `${this.o.path} was removed from disk; the document stays as it was and the next change writes it anew.`;
    }
    return null;
  }

  call(name: string, args: unknown, ctx: CallContext): Promise<CallOutcome> {
    return this.queue(async () => {
      const t = this.o.registry.byName(name);
      let notice: string | null;
      try {
        notice = await this.refresh();
      } catch (e) {
        if (e instanceof NotAProject) return failure("failed", `${this.o.path} cannot be read as a project: ${e.message}`, "Fix the file, or point the server at another one.");
        return failure("failed", `${this.o.path} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
      }
      const writes = !!t && !t.readOnly;
      if (writes && this.o.readOnly) return failure("refused", "This session is read-only.", "Read and screenshot only; ask the author to start the server without --read-only to edit.");
      /* a file a newer version wrote is read, never written: what this version would write back could lose what it
         does not understand (lib/project.ts `Loaded.newer`) */
      const newer = this.store.readOnlyVersion();
      if (writes && newer !== null) return failure("refused", `${this.o.path} was written by a newer version of M3E Canvas (format ${newer}), so this server only reads it: writing it back could lose what this version does not understand.`, "Read and screenshot only; edit it with the newer version of M3E Canvas (and its MCP server).");
      if (writes && notice) return { ...failure("refused", `Not done: ${notice}`, "Read the outline again, then make the change on the document as it is now."), notice };
      /* a call that takes work away under a name that does not say so (rows rewritten, modes left out, a style
         replaced) is asked about as a destructive one is; one whose takes cannot be found out is not done. Nothing but
         this queue changes the store, so what is asked about is what runs (a file saved meanwhile is a conflict). */
      let takes: string[] = [];
      if (writes && !ctx.destructive && !this.o.allowDestructive) {
        try {
          takes = await wouldTakeAway(this.store, name, args, { registry: this.o.registry });
        } catch (e) {
          return failure("refused", `Not done: what ${name} would take away could not be checked (${e instanceof Error ? e.message : String(e)}).`, "Try again; if it fails again, make the change in smaller steps.");
        }
      }
      if (ctx.signal?.aborted) return failure("aborted", "Stopped by the client before it ran.");
      if ((ctx.destructive || takes.length) && !this.o.allowDestructive) {
        const what = takes.length ? `It takes away ${takes.join("; ")} in ${this.o.path}.` : `It takes away something in ${this.o.path}.`;
        const asked = ctx.confirm ? await ctx.confirm(`Allow ${name}? ${what}`) : null;
        if (ctx.signal?.aborted) return failure("aborted", "Stopped by the client before it ran.");
        if (asked === null) return failure("refused", `${name} takes away something the author made${takes.length ? ` (${takes.join("; ")})` : ""}, and there is no editor here to confirm it in.`, "Ask the author to allow it (start the server with --allow-destructive), or make the change without removing anything.");
        if (!asked) return failure("refused", `The author declined ${name}.`, "Leave it as it is, or ask the author what to do instead.");
      }
      const prev = this.store.get();
      const outcome = await executeTool(this.store, name, args, { origin: "mcp", registry: this.o.registry, renderer: this.renderer, signal: ctx.signal, gen: this.o.gen });
      if (!wrote(prev, this.store.get())) return notice ? { ...outcome, notice } : outcome;
      try {
        await this.file.write(savedDoc(this.store.get()));
        this.writes++;
      } catch (e) {
        /* nothing that did not reach the file may stay: the change is taken back, and not left to be redone */
        this.store.undo("mcp", { forget: true });
        if (e instanceof FileConflict) return failure("refused", `Not saved: ${e.message} Nothing was written.`, "Call again: the file is read again first. Then redo the change on the document as it is now.");
        return failure("failed", `Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.changes.emit("document");
      return notice ? { ...outcome, notice } : outcome;
    });
  }

  /** Takes back the last change this server made to the file, or makes the last one taken back again, and writes the
   *  file. The history is this server's session: it starts when the file is opened, and again whenever another
   *  program changed the file. */
  history(action: "undo" | "redo"): Promise<CallOutcome> {
    return this.queue(async () => {
      let notice: string | null;
      try {
        notice = await this.refresh();
      } catch (e) {
        return failure("failed", `${this.o.path} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (this.o.readOnly) return failure("refused", "This session is read-only.", "Read and screenshot only.");
      if (notice) return { ...failure("refused", `Not done: ${notice} What this server changed before is no longer its to ${action}.`, "Read the outline again, then make the change you want with the tools."), notice };
      const label = action === "undo" ? this.store.undo("mcp") : this.store.redo("mcp");
      if (label === null) return { ok: true, result: { nothing_to_do: action === "undo" ? "There is nothing of this session's to undo." : "There is nothing undone to redo." } };
      try {
        await this.file.write(savedDoc(this.store.get()));
        this.writes++;
      } catch (e) {
        /* the file keeps what it had, and so does the session */
        if (action === "undo") this.store.redo("mcp");
        else this.store.undo("mcp");
        if (e instanceof FileConflict) return failure("refused", `Not saved: ${e.message} Nothing was written.`, "Read the outline again: the file is read again first.");
        return failure("failed", `Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.changes.emit("document");
      return { ok: true, result: { [action === "undo" ? "undone" : "redone"]: label, canUndo: this.store.canUndo(), canRedo: this.store.canRedo() } };
    });
  }

  /** Exports the project as a whole product into `dir` (taken from the project file's folder when relative): the file
   *  is read again first when it changed on disk, so what is exported is what the file holds. */
  exportProduct(dir: string, o: { force?: boolean } = {}): Promise<CallOutcome> {
    return this.queue(async () => {
      if (this.o.readOnly) return failure("refused", "This session is read-only.", "Read and screenshot only; ask the author to start the server without --read-only to export.");
      if (typeof dir !== "string" || !dir.trim()) return failure("bad_args", "dir is the folder to export into.");
      let notice: string | null;
      try {
        notice = await this.refresh();
      } catch (e) {
        return failure("failed", `${this.o.path} cannot be read: ${e instanceof Error ? e.message : String(e)}`);
      }
      const target = isAbsolute(dir) ? dir : resolve(dirname(resolve(this.o.path)), dir);
      try {
        const state = this.store.get();
        const product = await buildProduct(savedDoc(state), state.session.widths, { lang: this.o.lang, read: readEditorSource, assets: this.assets.catalog?.manifest ?? null });
        const done = await exportToFolder(target, product, { force: o.force });
        const written = done.writes.filter((w) => w.why !== "conflict" && w.why !== "manifest").map((w) => w.path);
        this.o.log.info(`Exported ${product.name} to ${done.dir}: ${written.length} written, ${done.conflicts.length} conflicts.`);
        const result = {
          folder: done.dir,
          product: product.name,
          written: written.length,
          unchanged: done.unchanged.length,
          customKept: done.kept,
          merged: done.merged,
          conflicts: done.conflicts,
          removed: done.removed,
          leftInPlace: done.orphaned,
          customOrphans: done.customOrphans,
          warnings: [...product.warnings, ...done.notes],
          /* where the apps draw something other than the design says: how many of each kind, and where each is listed */
          differences: differenceCounts(product.differences).map((c) => ({ app: c.app, count: c.total, kinds: Object.fromEntries(c.kinds), file: c.file })),
          next: done.conflicts.length
            ? "Each conflict is a generated file someone edited: it was left as it is and the new version written beside it as <file>.m3e-new. Move the edit to custom code (server/src/handlers, the custom/ folders), then replace the file with its .m3e-new."
            : "Run npm install, then npm run dev in the folder. Custom code goes in server/src/handlers and the custom/ folders (AGENTS.md there says more).",
        };
        return notice ? { ok: true, result, notice } : { ok: true, result };
      } catch (e) {
        if (e instanceof FolderRefused) return failure("refused", e.message, "Export into an empty folder, a folder this tool exported into before, or pass force: true to export among what is there.");
        return failure("failed", `The export failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  /** the document as it would be saved, for tests and the dev log */
  document() {
    return savedDoc(this.store.get());
  }

  async close() {
    await (this.renderer as { close?: () => Promise<void> } | undefined)?.close?.();
  }
}
