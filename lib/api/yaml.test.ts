/* The YAML reader and writer of the spec files: what OpenAPI and AsyncAPI files are written with is read the way YAML
 * 1.2 reads it, what is written reads back the same, and a hostile text is refused in bounded time. */

import { describe, expect, it } from "vitest";
import { parseSpecText, parseYaml, toYaml, YamlError } from "./yaml";

describe("reading YAML", () => {
  it("reads block mappings and sequences, both ways a sequence can stand under a key", () => {
    expect(parseYaml("a: 1\nb:\n  c: two\n  d: [3, 4]\ne:\n- x\n- y: 1\n  z: 2\nf:\n  - - p\n    - q\n  - r\n")).toEqual({ a: 1, b: { c: "two", d: [3, 4] }, e: ["x", { y: 1, z: 2 }], f: [["p", "q"], "r"] });
  });

  it("reads scalars by the YAML 1.2 core schema", () => {
    const v = parseYaml("n: null\nt: ~\ne:\nb: true\nB: False\ni: -12\no: 0o17\nh: 0xff\nf: 1.5e3\ninf: -.inf\ns: yes\nd: 2026-11-06\nv: 1.0.0\nq: '200'\nw: \"a\\tb\\u00e9\"\nu: 中文\n");
    expect(v).toEqual({ n: null, t: null, e: null, b: true, B: false, i: -12, o: 15, h: 255, f: 1500, inf: -Infinity, s: "yes", d: "2026-11-06", v: "1.0.0", q: "200", w: "a\tbé", u: "中文" });
  });

  it("reads mapping keys as strings, quoted or not, a path with braces included", () => {
    expect(parseYaml("paths:\n  /users/{id}:\n    get: {}\nresponses:\n  200: {description: OK}\n  '404': {description: Gone}\n")).toEqual({ paths: { "/users/{id}": { get: {} } }, responses: { "200": { description: "OK" }, "404": { description: "Gone" } } });
  });

  it("reads literal and folded block scalars with their chomping", () => {
    const v = parseYaml("a: |\n  one\n  two\n\nb: |-\n  kept\n   indented\nc: >\n  folded\n  words\n\n  para\nd: >-\n  x\n    more\n  y\ne: |+\n  keep\n\nf: end\n") as Record<string, string>;
    expect(v.a).toBe("one\ntwo\n");
    expect(v.b).toBe("kept\n indented");
    expect(v.c).toBe("folded words\npara\n");
    expect(v.d).toBe("x\n  more\ny");
    expect(v.e).toBe("keep\n\n");
    expect(v.f).toBe("end");
  });

  it("reads quoted strings over several lines, comments, and multi-line plain scalars", () => {
    const v = parseYaml("# a comment\na: \"one\n  two\"   # after\nb: 'it''s\n\n  here'\nc: plain words\n  go on\nd: x#not a comment\n") as Record<string, string>;
    expect(v).toEqual({ a: "one two", b: "it's\nhere", c: "plain words go on", d: "x#not a comment" });
  });

  it("reads anchors, aliases and merge keys", () => {
    expect(parseYaml("base: &b\n  x: 1\n  y: [1, 2]\nmore:\n  <<: *b\n  z: 3\nlist: [*b]\n")).toEqual({ base: { x: 1, y: [1, 2] }, more: { x: 1, y: [1, 2], z: 3 }, list: [{ x: 1, y: [1, 2] }] });
  });

  it("reads flow collections across lines, and JSON", () => {
    expect(parseYaml("a: {b: [1, 2,\n  3], 'c d': {e: f}}\n")).toEqual({ a: { b: [1, 2, 3], "c d": { e: "f" } } });
    expect(parseSpecText('{"openapi": "3.1.0", "x": [1, {"y": null}]}')).toEqual({ openapi: "3.1.0", x: [1, { y: null }] });
  });

  it("says where a text is not YAML", () => {
    const bad = (text: string, words: RegExp) => {
      try {
        parseYaml(text);
      } catch (e) {
        expect(e).toBeInstanceOf(YamlError);
        expect((e as Error).message).toMatch(words);
        return;
      }
      throw new Error(`read ${JSON.stringify(text)}`);
    };
    bad("a: 1\na: 2\n", /appears twice/);
    bad("a:\n\tb: 1\n", /tab/);
    bad("a: [1, 2\n", /never closed/);
    bad("a: \"open\n", /never ends/);
    bad("a: *nothing\n", /names no anchor/);
    bad("---\na: 1\n---\nb: 2\n", /more than one document/);
    bad("a: 1\n b: 2\n", /line 2/);
  });

  it("keeps __proto__ a key like any other", () => {
    const v = parseYaml("__proto__:\n  polluted: true\n") as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("hostile YAML", () => {
  it("refuses aliases that multiply into too many values, quickly", () => {
    /* the billion laughs: each level nine of the one before */
    const lines = ["a0: &a0 [x, x, x, x, x, x, x, x, x]"];
    for (let i = 1; i < 12; i++) lines.push(`a${i}: &a${i} [${Array(9).fill(`*a${i - 1}`).join(", ")}]`);
    const t = performance.now();
    expect(() => parseYaml(lines.join("\n") + "\n")).toThrow(/more than/);
    expect(performance.now() - t).toBeLessThan(2000);
  });

  it("refuses nesting past the limit without running out of stack", () => {
    const deep = "[".repeat(50_000) + "]".repeat(50_000);
    expect(() => parseYaml(`a: ${deep}\n`)).toThrow(/nested more than/);
    const block = Array.from({ length: 1500 }, (_, i) => `${" ".repeat(i)}k${i}:`).join("\n");
    expect(() => parseYaml(block)).toThrow(/nested more than/);
  });

  it("refuses a text past the size limit", () => {
    expect(() => parseYaml("a: b\n".repeat(10), { maxChars: 20 })).toThrow(/longer than/);
  });
});

describe("writing YAML", () => {
  const VALUES: unknown[] = [
    { openapi: "3.1.0", info: { title: "Shop", version: "1.0" }, paths: { "/a/{id}": { get: { responses: { "200": { description: "OK" } } } } } },
    { s: ["yes", "no", "null", "~", "1", "0x1", "1e3", "-x", "a: b", "a #b", " lead", "trail ", "", "2026-11-06", "2026-11-06T10:00:00Z", "@x", "*x", "&x", "!x", "%x", "|", ">", "'", '"', "{}", "[]", "中文 描述", "tab\there", "a\u2028b"] },
    { multi: "line one\nline two\n", strip: "a\nb", lead: "  indented\nfirst", trail: "x\n\n", blank: "a\n\nb" },
    { n: [0, -1, 1.5, 1e21, true, false, null], e: {}, l: [], nested: [[1, [2]], [], {}, { a: [] }] },
    { "__proto__": { x: 1 }, "a.b": 1, "key with space": 2, "200": "s", "<<": "merge" },
  ];
  it.each(VALUES.map((v, i) => [i, v]))("reads back value %i as it was", (_i, v) => {
    const text = toYaml(v);
    expect(JSON.stringify(parseYaml(text))).toBe(JSON.stringify(v));
    expect(toYaml(parseYaml(text))).toBe(text);
  });

  it("writes block style, two spaces, a mapping in a list on its dash's line", () => {
    expect(toYaml({ a: [{ b: 1, c: [2] }], d: "x" })).toBe("a:\n  - b: 1\n    c:\n      - 2\nd: x\n");
    expect(toYaml({ text: "one\ntwo" })).toBe("text: |-\n  one\n  two\n");
  });
});
