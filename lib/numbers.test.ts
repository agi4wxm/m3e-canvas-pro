import { describe, expect, it } from "vitest";
import { decimalsOf, inputStep, onStep, typedNumber } from "./numbers";

/* The panels' number fields keep the decimals their step allows: 4.5 typed into a variable, a rating of 4.6, a line
 * 1.5 wide. A whole step still keeps whole numbers. */

describe("a typed number", () => {
  it("keeps the decimals of a decimal step", () => {
    expect(typedNumber("4.5", 0.1)).toBe(4.5);
    expect(typedNumber("4.56", 0.1)).toBe(4.6);
    expect(typedNumber("1.5", 0.5)).toBe(1.5);
    expect(typedNumber("1.25", 0.25)).toBe(1.25);
    expect(typedNumber("0.3", 0.1)).toBe(0.3);
  });

  it("keeps whole numbers for a whole step, any of them, not only its multiples", () => {
    expect(typedNumber("4.5", 1)).toBe(5);
    expect(typedNumber("7", 4)).toBe(7);
    expect(typedNumber("-2.4")).toBe(-2);
  });

  it("keeps what was typed for a number with no step of its own", () => {
    expect(typedNumber("4.5", "any")).toBe(4.5);
    expect(typedNumber("-0.125", "any")).toBe(-0.125);
    expect(typedNumber("1e3", "any")).toBe(1000);
  });

  it("is nothing for what is not a number", () => {
    expect(typedNumber("", "any")).toBeUndefined();
    expect(typedNumber("  ", 1)).toBeUndefined();
    expect(typedNumber("abc", 0.1)).toBeUndefined();
    expect(typedNumber("Infinity", "any")).toBeUndefined();
  });
});

describe("a step", () => {
  it("has the places of its decimals", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(8)).toBe(0);
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.5)).toBe(1);
    expect(decimalsOf(0.25)).toBe(2);
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf("any")).toBeUndefined();
    expect(decimalsOf(0)).toBe(0);
  });

  it("puts a slider's value on a multiple of it, without float noise", () => {
    expect(onStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(onStep(3 * 0.1, 0.1)).toBe(0.3);
    expect(onStep(4.62, 0.1)).toBe(4.6);
    expect(onStep(13, 4)).toBe(12);
    expect(onStep(1.3, 0.25)).toBe(1.25);
    expect(onStep(2.7, "any")).toBe(2.7);
  });

  it("gives a field the step its precision allows", () => {
    expect(inputStep(1)).toBe("1");
    expect(inputStep(4)).toBe("1");
    expect(inputStep(0.1)).toBe("0.1");
    expect(inputStep(0.25)).toBe("0.01");
    expect(inputStep("any")).toBe("any");
  });
});
