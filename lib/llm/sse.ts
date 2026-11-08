/* Server-sent events, read the way the HTML standard reads them, from bytes that arrive in pieces of
 * any size. A piece may end inside a line, inside a "\r\n" pair, or inside a character that takes
 * several bytes; none of that may change what is read. A last event the server did not close with
 * an empty line is still delivered, because a server that stops early has usually said something
 * worth hearing (an error) on that line. */

export type SseMessage = { event: string; data: string };

export class SseParser {
  private decoder = new TextDecoder();
  private buf = "";
  /** where the search for the next line break resumes, so a long line is not scanned again for every piece */
  private scan = 0;
  private data: string[] = [];
  private event = "";

  push(chunk: Uint8Array | string): SseMessage[] {
    this.buf += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  /** what is left when the stream has ended */
  end(): SseMessage[] {
    this.buf += this.decoder.decode();
    const out = this.drain(true);
    if (this.buf) this.line(this.buf, out);
    this.buf = "";
    this.dispatch(out);
    return out;
  }

  private drain(final: boolean): SseMessage[] {
    const out: SseMessage[] = [];
    let start = 0;
    let i = this.scan;
    for (; i < this.buf.length; i++) {
      const c = this.buf.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      /* a "\r" at the very end may be the first half of "\r\n": wait for the next piece to know */
      if (c === 13 && i + 1 === this.buf.length && !final) break;
      this.line(this.buf.slice(start, i), out);
      if (c === 13 && this.buf.charCodeAt(i + 1) === 10) i++;
      start = i + 1;
    }
    this.buf = this.buf.slice(start);
    this.scan = Math.max(0, i - start);
    return out;
  }

  private line(line: string, out: SseMessage[]) {
    if (line === "") return this.dispatch(out);
    if (line.startsWith(":")) return;
    const at = line.indexOf(":");
    const field = at < 0 ? line : line.slice(0, at);
    let value = at < 0 ? "" : line.slice(at + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "event") this.event = value;
  }

  private dispatch(out: SseMessage[]) {
    if (this.data.length) out.push({ event: this.event || "message", data: this.data.join("\n") });
    this.data = [];
    this.event = "";
  }
}

/** the events of a response body; stopping early closes the connection. `onBytes` hears every piece that arrives,
 *  a keep-alive line too (what a stream's idle timer listens to). */
export async function* readSse(body: ReadableStream<Uint8Array>, onBytes?: () => void): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const parser = new SseParser();
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onBytes?.();
      yield* parser.push(value);
    }
    finished = true;
    yield* parser.end();
  } finally {
    if (!finished) reader.cancel().catch(() => {});
  }
}

/** an event's data as JSON, or undefined for a line that is not (a keep-alive, a "[DONE]") */
export function sseJson(data: string): Record<string, unknown> | undefined {
  if (!data || data === "[DONE]") return undefined;
  try {
    const v = JSON.parse(data);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
