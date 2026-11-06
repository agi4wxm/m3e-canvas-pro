/* The file backend: a project file worked on with no editor open. A `DocStore` holds the document with each part's own
 * guess at its size (`guessMeasurer`), every tool runs on it exactly as it does in the editor, and each call that
 * changed the document is written back at once. Pictures are drawn in headless Chromium (render.ts) when it is there.
 *
 * Before each call the file is looked at again: one that changed on disk is read again, and a call that would write is
 * refused that once, so nothing another program saved is ever overwritten and the model reads the new document first. */

import { DocStore, guessMeasurer, savedDoc, stateOf, type CoreState } from "../../lib/core";
import type { Lang } from "../../lib/i18n";
import type { Access, ClientInfo } from "../../lib/mcp/protocol";
import { executeTool, type Registry } from "../../lib/tools";
import { wrote } from "../../lib/tools/ops";
import type { GenerateEnv, Renderer } from "../../lib/tools/types";
import { failure, listeners, serial, type Backend, type CallContext, type CallOutcome } from "./backend";
import { FileConflict, NotAProject, ProjectFileStore, type ProjectFormat } from "./fileStore";
import type { Log } from "./log";

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

  constructor(private readonly o: FileBackendOptions) {
    this.store = new DocStore(stateOf({ groups: [], frames: [] }), { measurer: guessMeasurer, lang: () => o.lang });
    this.file = new ProjectFileStore(o.path, o.format);
    this.renderer = o.renderer?.(() => this.store.get());
  }

  /** Reads the file (none yet is an empty document, written on the first change). Throws when it is not a project. */
  async open(): Promise<void> {
    const doc = await this.file.read();
    if (doc) this.store.load(doc, true);
    this.opened = true;
    this.o.log.info(doc ? `Opened ${this.o.path}: ${doc.frames.length} screen(s), ${doc.groups.length} group(s).` : `${this.o.path} does not exist yet: it is written on the first change.`);
  }

  access(): Access {
    return this.o.readOnly ? "read" : "edit";
  }

  setClient(_client: ClientInfo | null) {}

  onChange(fn: (what: "document" | "access") => void) {
    return this.changes.add(fn);
  }

  status() {
    return { mode: "file", file: this.o.path, access: this.access(), writes: this.writes, screenshots: this.renderer ? "headless Chromium, when Playwright is installed" : "off" };
  }

  /** the file read again when it changed on disk; what that means for the call, or null when it had not changed */
  private async refresh(): Promise<string | null> {
    if (!this.opened) await this.open();
    else if (!(await this.file.changed())) return null;
    else {
      const doc = await this.file.read();
      if (doc) this.store.load(doc, true);
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
      if (writes && notice) return { ...failure("refused", `Not done: ${notice}`, "Read the outline again, then make the change on the document as it is now."), notice };
      if (ctx.destructive && !this.o.allowDestructive) {
        const asked = ctx.confirm ? await ctx.confirm(`Allow ${name}? It takes away something in ${this.o.path}.`) : null;
        if (asked === null) return failure("refused", `${name} takes away something the author made, and there is no editor here to confirm it in.`, "Ask the author to allow it (start the server with --allow-destructive), or make the change without removing anything.");
        if (!asked) return failure("refused", `The author declined ${name}.`, "Leave it as it is, or ask the author what to do instead.");
      }
      const prev = this.store.get();
      const outcome = await executeTool(this.store, name, args, { origin: "mcp", registry: this.o.registry, renderer: this.renderer, signal: ctx.signal, gen: this.o.gen });
      if (!wrote(prev, this.store.get())) return notice ? { ...outcome, notice } : outcome;
      try {
        await this.file.write(savedDoc(this.store.get()));
        this.writes++;
      } catch (e) {
        /* nothing that did not reach the file may stay: the change is taken back */
        this.store.undo("mcp");
        if (e instanceof FileConflict) return failure("refused", `Not saved: ${e.message} Nothing was written.`, "Call again: the file is read again first. Then redo the change on the document as it is now.");
        return failure("failed", `Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.changes.emit("document");
      return notice ? { ...outcome, notice } : outcome;
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
