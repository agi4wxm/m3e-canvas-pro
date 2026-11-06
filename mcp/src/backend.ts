/* Where the tools run. The MCP server knows the registry's tools and how to describe them; a backend holds the
 * document they work on: an editor tab over the live bridge (live.ts), a project file read and written headless
 * (file.ts), or the tab when one is paired and the file otherwise (auto). */

import type { Access, ClientInfo } from "../../lib/mcp/protocol";
import type { ToolError, ToolOutcome } from "../../lib/tools/types";

export type CallContext = {
  signal?: AbortSignal;
  /** the MCP client that asked */
  client: ClientInfo | null;
  /** the call takes away something the author made (lib/tools `isDestructiveCall`) */
  destructive: boolean;
  /** Asks the person at the MCP client whether a destructive call may go ahead (MCP elicitation): true or false, or
   *  null when the client cannot ask. */
  confirm?: (message: string) => Promise<boolean | null>;
};

/** what a call gave back, and a word for the caller beside it (a file read again because it changed on disk) */
export type CallOutcome = ToolOutcome & { notice?: string };

export interface Backend {
  readonly kind: "live" | "file" | "auto";
  /** Runs one call. Never throws: what went wrong comes back as an error the model can act on. */
  call(name: string, args: unknown, ctx: CallContext): Promise<CallOutcome>;
  /** what the session may do now: a tab paired read-only takes away the writing tools */
  access(): Access;
  /** the MCP client being served, said to the tab */
  setClient(client: ClientInfo | null): void;
  /** told when the document changed or when what the session may do changed */
  onChange(fn: (what: "document" | "access") => void): () => void;
  /** where things stand, for the connection_status tool */
  status(): Record<string, unknown>;
  close(): Promise<void>;
}

export const failure = (code: ToolError["code"], message: string, hint?: string): CallOutcome => ({ ok: false, error: { code, message, ...(hint ? { hint } : {}) } });

/** a set of listeners */
export function listeners<A extends unknown[]>() {
  const set = new Set<(...a: A) => void>();
  return {
    add(fn: (...a: A) => void) {
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    },
    emit(...a: A) {
      for (const fn of set) {
        try {
          fn(...a);
        } catch {
          /* one listener failing must not stop the others */
        }
      }
    },
  };
}

/** Runs async work one piece at a time, in order: a document is changed by one call after another, as the editor's
 *  own agent does, even when a client sends several at once. */
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => {});
    return next;
  };
}
