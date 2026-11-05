import { describe, expect, it } from "vitest";
import { distances, guideTargets, insertionMark, labelSpot, measureBetween, snapRect, type Rect } from "./guides";

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

describe("a drop into an auto layout", () => {
  const room = r(0, 0, 300, 60);
  const row = [r(10, 10, 60, 40), r(80, 10, 60, 40), r(150, 10, 60, 40)];

  it("marks the slot in a row between the two it goes between, across the run", () => {
    const m = insertionMark(row, { x: 100, y: 12 }, { dir: "row", wrap: false, gap: 10 }, room);
    expect(m.index).toBe(2);
    expect(m.line).toEqual({ axis: "x", at: 145, from: 10, to: 50 });
  });

  it("marks the start and the end of a run, half a gap out", () => {
    expect(insertionMark(row, { x: 0, y: 12 }, { dir: "row", wrap: false, gap: 10 }, room)).toMatchObject({ index: 0, line: { at: 5 } });
    expect(insertionMark(row, { x: 260, y: 12 }, { dir: "row", wrap: false, gap: 10 }, room)).toMatchObject({ index: 3, line: { at: 215 } });
  });

  it("lays the line flat in a column, and at the start of an empty layout", () => {
    const col = [r(10, 10, 200, 30), r(10, 50, 200, 30)];
    expect(insertionMark(col, { x: 10, y: 45 }, { dir: "column", wrap: false, gap: 10 }, room)).toEqual({ index: 1, line: { axis: "y", at: 45, from: 10, to: 210 } });
    expect(insertionMark([], { x: 40, y: 40 }, { dir: "column", wrap: false, gap: 10 }, r(8, 8, 100, 100)).line).toEqual({ axis: "y", at: 8, from: 8, to: 108 });
  });

  it("reads a grid line by line, as the layout does", () => {
    const grid = [r(0, 0, 50, 50), r(60, 0, 50, 50), r(0, 60, 50, 50), r(60, 60, 50, 50)];
    /* on the second line, between its two */
    const m = insertionMark(grid, { x: 55, y: 62 }, { dir: "grid", wrap: false, gap: 10 }, room);
    expect(m.index).toBe(3);
    expect(m.line).toMatchObject({ axis: "x", at: 55, from: 60, to: 110 });
    /* at the end of the first line */
    expect(insertionMark(grid, { x: 120, y: 4 }, { dir: "grid", wrap: false, gap: 10 }, room)).toMatchObject({ index: 2, line: { at: 115, from: 0, to: 50 } });
  });
});

describe("where a distance's number goes", () => {
  const size = { w: 30, h: 18 };
  it("stays in the middle of its line where nothing is there", () => {
    expect(labelSpot({ axis: "y", from: 0, to: 200, at: 50, kind: "distance" }, size, [])).toEqual({ x: 50, y: 100 });
  });

  it("moves along its line off a part it would cover, and ignores the box it measures inside", () => {
    const button = r(20, 90, 60, 24);
    const around = r(0, 0, 400, 400);
    const at = labelSpot({ axis: "y", from: 0, to: 200, at: 50, kind: "distance" }, size, [button, around]);
    expect(at.x).toBe(50);
    expect(at.y + size.h / 2 <= button.t || at.y - size.h / 2 >= button.b).toBe(true);
  });

  it("stands beside a line that parts cover all along", () => {
    const parts = [r(0, 40, 100, 20), r(100, 40, 100, 20)];
    const at = labelSpot({ axis: "x", from: 10, to: 190, at: 50, kind: "distance" }, size, parts);
    expect(at.x).toBe(100);
    expect(at.y + size.h / 2).toBeLessThanOrEqual(40);
  });
});
