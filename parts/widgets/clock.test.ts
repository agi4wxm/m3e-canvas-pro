import { describe, expect, it } from "vitest";
import { domainNow, setDomainClock } from "./host";
import { clockNow, secondsLeft } from "./seed";

describe("the clock the parts' countdowns read", () => {
  it("is the app's (the preview's runtime, the product's), the device's only until one is handed in", () => {
    expect(Math.abs(domainNow() - Date.now())).toBeLessThan(1000);
    const restore = setDomainClock(() => 1_000_000);
    try {
      expect(clockNow()).toBe(1_000_000);
      expect(clockNow(500)).toBe(1_000_500);
      expect(secondsLeft(1_030_000)).toBe(30);
    } finally {
      restore();
    }
    expect(Math.abs(clockNow() - Date.now())).toBeLessThan(1000);
  });
});
