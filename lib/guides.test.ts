import { describe, expect, it } from "vitest";
import { distances, guideTargets, measureBetween, snapRect, type Rect } from "./guides";

const r = (l: number, t: number, w: number, h: number): Rect => ({ l, t, r: l + w, b: t + h });
const screen = { rect: r(0, 0, 412, 892), margin: 16 };

describe("smart guides", () => {
  it("snaps an edge or a centre to a neighbour's and draws the line across both", () => {
    const t = guideTargets([r(16, 100, 100, 40)], [screen]);
    const s = snapRect(r(19, 200, 100, 40), t, 7);
    expect(s.dx).toBe(-3);
    expect(s.snapX).toBe(true);
    expect(s.lines).toContainEqual({ axis: "x", at: 16, from: 100, to: 240 });
    /* centre to centre */
    expect(snapRect(r(60, 300, 20, 20), guideTargets([r(16, 100, 100, 40)], [screen]), 7).dx).toBe(-4);
  });

  it("snaps to the screen's margins and its middle", () => {
    const t = guideTargets([], [screen]);
    expect(snapRect(r(20, 300, 100, 40), t, 7).dx).toBe(-4);
    expect(snapRect(r(150, 300, 100, 40), t, 7).dx).toBe(6);
    expect(snapRect(r(300, 300, 100, 40), t, 7).dx).toBe(-4);
  });

  it("finds the gap two neighbours keep, and the middle between two, and marks the even gaps", () => {
    /* a, b 20 apart; the dragged one 23 to the right of b snaps to 20 */
    const t = guideTargets([r(16, 100, 80, 40), r(116, 100, 80, 40)], [screen]);
    const s = snapRect(r(219, 104, 80, 40), t, 7);
    expect(s.dx).toBe(-3);
    expect(s.gaps.filter((g) => g.kind === "equal").map((g) => [g.from, g.to])).toEqual([
      [96, 116],
      [196, 216],
    ]);
    /* halfway between two */
    const between = guideTargets([r(16, 100, 80, 40), r(296, 100, 80, 40)], [screen]);
    const mid = snapRect(r(152, 100, 80, 40), between, 7);
    expect(mid.dx).toBe(4);
    expect(mid.gaps.filter((g) => g.kind === "equal").map((g) => g.to - g.from)).toEqual([60, 60]);
  });

  it("writes the distance to the nearest part on each side, or to the screen's edge", () => {
    const d = distances(r(100, 100, 50, 50), [r(0, 110, 60, 20), r(100, 300, 50, 20)], r(0, 0, 412, 892));
    expect(d.map((g) => [g.axis, g.to - g.from])).toEqual([
      ["x", 40],
      ["x", 262],
      ["y", 100],
      ["y", 150],
    ]);
  });

  it("lines up only the edge being pulled when resizing", () => {
    const t = guideTargets([r(16, 100, 200, 40)], [screen]);
    const s = snapRect(r(16, 200, 197, 40), t, 7, { x: ["hi"], y: [] });
    expect(s.dx).toBe(3);
    expect(s.snapY).toBe(false);
    expect(s.gaps.some((g) => g.kind === "equal")).toBe(false);
  });

  it("only looks at the screen the part is over", () => {
    const other = { rect: r(600, 0, 412, 892), margin: 16 };
    const t = guideTargets([r(616, 100, 100, 40)], [screen, other]);
    expect(snapRect(r(19, 200, 100, 40), t, 7).dx).toBe(-3);
    expect(snapRect(r(19, 200, 100, 40), t, 7).lines.every((l) => l.at < 600)).toBe(true);
  });

  it("measures between two parts, and from a part to the edges of the one around it, with Alt", () => {
    expect(measureBetween(r(0, 0, 50, 50), r(80, 10, 50, 20))).toEqual([{ axis: "x", from: 50, to: 80, at: 20, kind: "distance" }]);
    expect(measureBetween(r(20, 30, 50, 50), r(0, 0, 412, 892)).map((g) => g.to - g.from)).toEqual([20, 342, 30, 812]);
  });
});
