import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shapeVars } from "./theme";

describe("shapeVars", () => {
  it("works out each corner step at the scale", () => {
    expect(shapeVars(1.6)["--md-sys-shape-corner-medium"]).toBe("19.2px");
    expect(shapeVars(0.35)["--md-sys-shape-corner-medium"]).toBe("4.2px");
    expect(shapeVars(1.6)["--radius"]).toBe("25.6px");
  });

  it("covers every step the stylesheet scales", () => {
    const css = readFileSync("styles/m3e.css", "utf8");
    const scaled = [...css.matchAll(/(--md-sys-shape-corner-[a-z-]+):\s*calc\(\s*(\d+)px \* var\(--md-sys-shape-scale\)/g)].map((m) => [m[1], `${m[2]}px`]);
    expect(scaled.length).toBeGreaterThan(5);
    const standard = shapeVars(1);
    for (const [name, value] of scaled) expect(standard[name], name).toBe(value);
  });
});
