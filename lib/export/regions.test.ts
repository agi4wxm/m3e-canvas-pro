import { describe, expect, it } from "vitest";
import { fillRegions, namesIn } from "./regions";

describe("optional regions in a real file (lib/export/regions.ts)", () => {
  it("keeps or drops the lines of a region by its condition, and the marks go", () => {
    const file = "a\n//#if one\nb\n//#elif two\nc\n//#else\nd\n//#end\ne";
    expect(fillRegions(file, { one: true, two: true })).toBe("a\nb\ne");
    expect(fillRegions(file, { one: false, two: true })).toBe("a\nc\ne");
    expect(fillRegions(file, { one: false, two: false })).toBe("a\nd\ne");
  });

  it("nests, and a region inside a dropped one is dropped whatever its condition", () => {
    const file = "//#if outer\n  //#if inner\nx\n  //#else\ny\n  //#end\n//#end\nz";
    expect(fillRegions(file, { outer: true, inner: false })).toBe("y\nz");
    expect(fillRegions(file, { outer: false, inner: true })).toBe("z");
  });

  it("wakes a dormant line where it is kept: the code after the mark, at the mark's indentation", () => {
    const file = "//#if !product\n    //| call: () => none(),\n//|\n//#end\nend";
    expect(fillRegions(file, { product: false })).toBe("    call: () => none(),\n\nend");
    expect(fillRegions(file, { product: true })).toBe("end");
  });

  it("keeps inline text, or what the comment holds instead, nested innermost first", () => {
    const file = "go(a/*#if proto*/, motion/*#end*/) /*#if product*/live()/*#else none()#end*/ [/*#if a*/x/*#if b*/y/*#end*/z/*#end*/]";
    expect(fillRegions(file, { proto: true, product: true, a: true, b: true })).toBe("go(a, motion) live() [xyz]");
    expect(fillRegions(file, { proto: false, product: false, a: true, b: false })).toBe("go(a) none() [xz]");
    expect(fillRegions(file, { proto: false, product: false, a: false, b: true })).toBe("go(a) none() []");
    /* across lines too */
    expect(fillRegions("a/*#if on*/\nb\n/*#end*/c", { on: false })).toBe("ac");
  });

  it("reads conditions of negations, and and or (and binding tighter)", () => {
    const file = "/*#if a && !b || c*/yes/*#else no#end*/";
    expect(fillRegions(file, { a: true, b: false, c: false })).toBe("yes");
    expect(fillRegions(file, { a: true, b: true, c: false })).toBe("no");
    expect(fillRegions(file, { a: false, b: true, c: true })).toBe("yes");
  });

  it("fills values in place of their placeholders, and anywhere, a value's own words taken as they are", () => {
    const file = 'type Id = /*$ids*/"home"/*$*/ // `@@first@@` first\nconst T = {\n/*$rows*/  a: 1,/*$*/\n}';
    expect(fillRegions(file, {}, { ids: '"a" | "b"', first: "a", rows: "  x: '$&',\n  y: '$1'," })).toBe("type Id = \"a\" | \"b\" // `a` first\nconst T = {\n  x: '$&',\n  y: '$1',\n}");
    /* a value is never read as marks */
    expect(fillRegions("x = /*$v*/0/*$*/", {}, { v: "/*#if no*/" })).toBe("x = /*#if no*/");
  });

  it("refuses a flag or a value it is not given, and a mark left open", () => {
    expect(() => fillRegions("//#if misspelt\nx\n//#end", { spelt: true })).toThrow(/no flag misspelt/);
    expect(() => fillRegions("x = /*$gone*/0/*$*/", {}, {})).toThrow(/no value gone/);
    expect(() => fillRegions("@@gone@@", {}, {})).toThrow(/no value gone/);
    expect(() => fillRegions("//#if a\nx", { a: true })).toThrow(/no \/\/#end/);
    expect(() => fillRegions("x\n//#end", {})).toThrow(/with no \/\/#if/);
    expect(() => fillRegions("x /*#if a*/y", { a: true })).toThrow(/unclosed/);
    expect(() => fillRegions("//#if a b\nx\n//#end", { a: true, b: true })).toThrow(/cannot read/);
  });

  it("says which flags and values a file names", () => {
    expect(namesIn("//#if a && !b\n/*#if c*/x/*#end*/ /*$v*/0/*$*/ @@w@@\n//#elif d\n//#end")).toEqual({ flags: ["a", "b", "c", "d"], values: ["v", "w"] });
  });
});
