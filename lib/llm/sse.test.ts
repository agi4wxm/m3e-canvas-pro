import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SseParser, readSse, sseJson, type SseMessage } from "./sse";
import { byteStream, jagged } from "./testkit";

const fixture = readFileSync(new URL("./fixtures/responses-tools.sse", import.meta.url), "utf8");

async function readAll(text: string, sizes?: (i: number) => number): Promise<SseMessage[]> {
  const out: SseMessage[] = [];
  for await (const m of readSse(byteStream(text, sizes))) out.push(m);
  return out;
}

describe("SseParser", () => {
  const TEXT = 'event: a\ndata: {"x":"×’é"}\n\n: a comment\r\ndata: one\r\ndata: two\r\n\r\nid: 7\nretry: 10\nevent: b\ndata:no space\n\ndata\n\nevent: only-event\n\ndata: last without a blank line';
  const EXPECTED: SseMessage[] = [
    { event: "a", data: '{"x":"×’é"}' },
    { event: "message", data: "one\ntwo" },
    { event: "b", data: "no space" },
    { event: "message", data: "" },
    { event: "message", data: "last without a blank line" },
  ];

  it("reads fields, comments, multi-line data and every kind of line break", async () => {
    expect(await readAll(TEXT)).toEqual(EXPECTED);
  });

  it("reads the same whatever byte the pieces are cut at, inside characters and \\r\\n pairs too", async () => {
    const bytes = new TextEncoder().encode(TEXT).length;
    for (let cut = 1; cut < bytes; cut++) {
      const sizes = (i: number) => (i === 0 ? cut : Infinity);
      expect(await readAll(TEXT, sizes)).toEqual(EXPECTED);
    }
    for (let size = 1; size <= 7; size++) expect(await readAll(TEXT, () => size)).toEqual(EXPECTED);
  });

  it("reads a recorded Responses stream the same in jagged pieces as whole", async () => {
    const whole = await readAll(fixture);
    expect(whole.length).toBe(40);
    expect(whole.every((m) => sseJson(m.data))).toBe(true);
    for (const seed of [1, 2, 3, 42]) expect(await readAll(fixture, jagged(seed))).toEqual(whole);
  });

  it("holds a trailing \\r until it knows whether \\n follows", () => {
    const p = new SseParser();
    expect(p.push("data: a\r")).toEqual([]);
    expect(p.push("\n\r")).toEqual([]);
    expect(p.push("\ndata: b\n\n")).toEqual([{ event: "message", data: "a" }, { event: "message", data: "b" }]);
    expect(p.end()).toEqual([]);
  });

  it("does not scan a long line again for every piece", () => {
    const p = new SseParser();
    const long = "x".repeat(200_000);
    for (let i = 0; i < long.length; i += 1000) expect(p.push(`${i === 0 ? "data: " : ""}${long.slice(i, i + 1000)}`)).toEqual([]);
    expect(p.push("\n\n")[0].data.length).toBe(200_000);
  });
});

describe("readSse", () => {
  it("cancels the body when the reader stops early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new TextEncoder().encode("data: 1\n\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const m of readSse(body)) {
      expect(m.data).toBe("1");
      break;
    }
    await Promise.resolve();
    expect(cancelled).toBe(true);
  });

  it("passes on a failure of the body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pulls++ === 0) c.enqueue(new TextEncoder().encode("data: 1\n\n"));
        else c.error(new Error("reset"));
      },
    });
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const m of readSse(body)) seen.push(m.data);
      })(),
    ).rejects.toThrow("reset");
    expect(seen).toEqual(["1"]);
  });
});

describe("sseJson", () => {
  it("reads objects only", () => {
    expect(sseJson('{"a":1}')).toEqual({ a: 1 });
    expect(sseJson("[DONE]")).toBeUndefined();
    expect(sseJson("[1]")).toBeUndefined();
    expect(sseJson("{oops")).toBeUndefined();
    expect(sseJson("")).toBeUndefined();
  });
});
