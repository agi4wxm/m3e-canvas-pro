/* Both backends at once (`--file <path> --live`): a call goes to the editor tab while one is paired, and to the file
 * otherwise. connection_status says which one the next call reaches. */

import type { Access, ClientInfo } from "../../lib/mcp/protocol";
import { listeners, type Backend, type CallContext, type CallOutcome } from "./backend";
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
