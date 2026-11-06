/* The server's log: stderr only, because stdout carries the MCP messages of a stdio session. Claude Desktop and Codex
 * keep a server's stderr in their own logs (where the pairing code can be read); `--log <file>` keeps a copy too.
 * Nothing that holds a key is ever passed here. */

import { appendFileSync } from "node:fs";

export type Log = {
  info(msg: string): void;
  warn(msg: string): void;
  /** said whatever the level: what the person must see (the pairing code, the HTTP token) */
  notice(msg: string): void;
  debug(msg: string): void;
};

export function createLog(o: { file?: string; quiet?: boolean; debug?: boolean } = {}): Log {
  const write = (level: string, msg: string, always = false) => {
    const line = `[m3e-canvas-mcp] ${level === "info" || level === "notice" ? "" : `${level}: `}${msg}`;
    if (always || !o.quiet) process.stderr.write(line + "\n");
    if (o.file) {
      try {
        appendFileSync(o.file, `${new Date().toISOString()} ${line}\n`);
      } catch {
        /* a log file that cannot be written must not stop the server */
      }
    }
  };
  return {
    info: (m) => write("info", m),
    warn: (m) => write("warning", m),
    notice: (m) => write("notice", m, true),
    debug: (m) => {
      if (o.debug) write("debug", m);
    },
  };
}

/** a log that says nothing: for tests */
export const silentLog: Log = { info: () => {}, warn: () => {}, notice: () => {}, debug: () => {} };
