import { describe, expect, it } from "vitest";
import { evalExpr, readNumber } from "./expr";

describe("evalExpr", () => {
  it("reads numbers and arithmetic with precedence and brackets", () => {
    expect(evalExpr("12")).toBe(12);
    expect(evalExpr("12*2")).toBe(24);
    expect(evalExpr("2+3*4")).toBe(14);
    expect(evalExpr("(2+3)*4")).toBe(20);
    expect(evalExpr("100/4 - 5")).toBe(20);
    expect(evalExpr("-8 + 2")).toBe(-6);
    expect(evalExpr("1.5*2")).toBe(3);
    expect(evalExpr("7 % 4")).toBe(3);
    expect(evalExpr("3×4")).toBe(12);
    expect(evalExpr("12÷4")).toBe(3);
  });
  it("refuses what is not arithmetic", () => {
    expect(evalExpr("")).toBeNull();
    expect(evalExpr("alert(1)")).toBeNull();
    expect(evalExpr("2+")).toBeNull();
    expect(evalExpr("(2")).toBeNull();
    expect(evalExpr("4/0")).toBeNull();
    expect(evalExpr("1..2")).toBeNull();
  });
});

describe("readNumber", () => {
  it("applies a leading operator to the current value", () => {
    expect(readNumber("+8", 16)).toBe(24);
    expect(readNumber("*2", 16)).toBe(32);
    expect(readNumber("/2", 16)).toBe(8);
    expect(readNumber("-8", 16)).toBe(-8);
    expect(readNumber("40", 16)).toBe(40);
    expect(readNumber("Mixed", 16)).toBeNull();
  });
});
