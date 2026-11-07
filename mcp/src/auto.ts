/* Both backends at once (`--file <path> --live`): a call goes to the editor tab while one is paired, and to the file
 * otherwise. connection_status says which one the next call reaches. */

import type { Access, ClientInfo } from "../../lib/mcp/protocol";
import { failure, listeners, type Backend, type CallContext, type CallOutcome } from "./backend";
import type { FileBackend } from "./file";
import type { LiveBackend } from "./live";

export class AutoBackend implements Backend {
  readonly kind = "auto" as const;
  private readonly changes = listeners<["document" | "access"]>();
  private readonly offs: (() => void)[];

  constructor(
    readonly live: LiveBackend,
    readonly file: FileBackend,
  ) {
    this.offs = [live.onChange((w) => this.changes.emit(w)), file.onChange((w) => this.changes.emit(w))];
  }

  private get now(): Backend {
    return this.live.paired() ? this.live : this.file;
  }

  call(name: string, args: unknown, ctx: CallContext): Promise<CallOutcome> {
    return this.now.call(name, args, ctx);
  }

  /** the file's own history; while a tab is paired, its changes are the author's to undo there */
  history(action: "undo" | "redo"): Promise<CallOutcome> {
    if (this.live.paired()) return Promise.resolve(failure("refused", `An editor tab is paired: what this server changed there is taken back with the editor's own ${action}, by the author.`, "Ask the author to press undo (or redo) in the editor, or make the change you want with the tools."));
    return this.file.history(action);
  }

  /** the file's document, exported; while a tab is paired the editor holds the design, and exports it itself */
  exportProduct(dir: string, o: { force?: boolean } = {}): Promise<CallOutcome> {
    if (this.live.paired()) return Promise.resolve(failure("refused", "An editor tab is paired: the design is the one open there.", "Ask the author to export from the editor (Ask an AI → Whole product (monorepo)), or call this again once the tab is no longer paired."));
    return this.file.exportProduct(dir, o);
  }

  access(): Access {
    return this.now.access();
  }

  setClient(client: ClientInfo | null) {
    this.live.setClient(client);
  }

  onChange(fn: (what: "document" | "access") => void) {
    return this.changes.add(fn);
  }

  status() {
    return { mode: "auto", using: this.live.paired() ? "live" : "file", live: this.live.status(), file: this.file.status() };
  }

  async close() {
    for (const off of this.offs) off();
    await Promise.all([this.live.close(), this.file.close()]);
  }
}
