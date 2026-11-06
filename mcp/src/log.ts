/* The server's log: stderr only, because stdout carries the MCP messages of a stdio session. Claude Desktop and Codex
 * keep a server's stderr in their own logs (where the pairing code can be read); `--log <file>` keeps a copy too, in
 * a file only this user may read (0600): it holds the pairing code. Nothing that holds a key is ever passed here. */

import { appendFileSync, closeSync, fchmodSync, fstatSync, openSync } from "node:fs";

export type Log = {
  info(msg: string): void;
  warn(msg: string): void;
  /** said whatever the level: what the person must see (the pairing code, the HTTP token) */
  notice(msg: string): void;
  debug(msg: string): void;
};

/** Makes the log file only this user may read, or closes one that is there to other users. Windows keeps its own
 *  per-user rights and is left alone (docs/MCP.md says so). */
export function privateLogFile(file: string) {
  try {
    const fd = openSync(file, "a", 0o600);
    try {
      if (process.platform !== "win32") {
        const st = fstatSync(fd);
        if (st.mode & 0o077 && st.uid === process.getuid?.()) fchmodSync(fd, 0o600);
      }
    } finally {
      closeSync(fd);
    }
  } catch {
    /* a log file that cannot be made must not stop the server: the lines then go to stderr only */
  }
}

export function createLog(o: { file?: string; quiet?: boolean; debug?: boolean } = {}): Log {
  if (o.file) privateLogFile(o.file);
  const write = (level: string, msg: string, always = false) => {
    const line = `[m3e-canvas-mcp] ${level === "info" || level === "notice" ? "" : `${level}: `}${msg}`;
    if (always || !o.quiet) process.stderr.write(line + "\n");
    if (o.file) {
      try {
        appendFileSync(o.file, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
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
