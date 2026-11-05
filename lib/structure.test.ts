import { describe, expect, it } from "vitest";
import { alignIntent, blockOf, gapSnapper, leavesOf, linesOf, runsOf, structureOf, xyCut, type Box, type Placed, type Shape } from "./structure";

const box = (id: string, l: number, t: number, w: number, h: number, more: Partial<Box> = {}): Box => ({ id, l, t, r: l + w, b: t + h, ...more });
/** the shape written as a short string: a stack in [], a row in (), a grid in {} by rows */
const read = (s: Shape): string =>
  s.kind === "leaf" ? s.box.id : s.kind === "grid" ? `{${s.cells.map((r) => r.map((b) => b.id).join(" ")).join(" / ")}}` : s.kind === "stack" ? `[${s.kids.map(read).join(" ")}]` : `(${s.kids.map(read).join(" ")})`;
const placeAll = (s: Shape, l: number, t: number) => {
  const out: Placed = new Map();
  blockOf(s, { snap: gapSnapper([8, 16]) }).place(l, t, out);
  return out;
};

describe("reading a structure off where things stand (XY-cut)", () => {
  it("cuts a screen into bands, and a band into columns", () => {
    /* a header row (title, two icons), a picture beside two lines of text, a button */
    const shape = xyCut([
      box("title", 16, 80, 160, 28),
      box("i1", 300, 74, 40, 40),
      box("i2", 352, 76, 40, 40),
      box("pic", 16, 140, 96, 96),
      box("line1", 128, 146, 200, 24),
      box("line2", 128, 180, 160, 20),
      box("go", 16, 260, 380, 40),
    ]);
    expect(read(shape)).toBe("[(title i1 i2) (pic [line1 line2]) go]");
  });

  it("falls back to rows by hand where no straight line separates (a pinwheel)", () => {
    const shape = xyCut([box("a", 0, 0, 60, 20), box("b", 70, 0, 20, 60), box("c", 30, 70, 60, 20), box("d", 0, 30, 20, 60)]);
    expect(leavesOf(shape).map((b) => b.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(shape.kind).toBe("stack");
  });

  it("reads touching parts as apart and keeps every part once", () => {
    const boxes = [box("a", 0, 0, 100, 40), box("b", 0, 40, 100, 40), box("c", 100, 0, 50, 80)];
    const shape = xyCut(boxes);
    expect(read(shape)).toBe("([a b] c)");
  });
});

describe("grids", () => {
  it("finds rows of like parts, uneven as they are, with a short last row", () => {
    const cards = [box("c1", 16, 400, 176, 150, { kind: "card" }), box("c2", 205, 408, 176, 150, { kind: "card" }), box("c3", 20, 580, 176, 150, { kind: "card" }), box("c4", 199, 570, 176, 150, { kind: "card" }), box("c5", 14, 760, 176, 150, { kind: "card" })];
    expect(read(structureOf(cards))).toBe("{c1 c2 / c3 c4 / c5}");
  });

  it("finds columns of like parts too", () => {
    /* the right column is so far down that no line runs between the rows */
    const cards = [box("a", 0, 0, 100, 100), box("b", 0, 110, 100, 100), box("c", 120, 60, 100, 100), box("d", 120, 170, 100, 100)];
    expect(read(structureOf(cards))).toBe("{a c / b d}");
  });

  it("does not take a settings list (a word and a switch, row after row) for a grid", () => {
    const rows = [0, 1, 2].flatMap((i) => [box(`t${i}`, 16, i * 56, 200, 24, { kind: "text" }), box(`s${i}`, 340, i * 56 - 4, 52, 32, { kind: "switch" })]);
    expect(read(structureOf(rows))).toBe("[(t0 s0) (t1 s1) (t2 s2)]");
  });

  it("makes a grid even: one gap across, one down, cells on their column's line", () => {
    const cards = [box("c1", 16, 400, 176, 150), box("c2", 205, 408, 170, 150), box("c3", 20, 580, 176, 150), box("c4", 199, 570, 176, 150)];
    const at = placeAll(structureOf(cards), 16, 400);
    expect(at.get("c1")).toEqual({ l: 16, t: 400 });
    /* the gaps were 13 and 3 across: 8 on the scale; 12 down between the rows. The second column shares its right edge */
    expect(at.get("c4")!.l).toBe(16 + 176 + 8);
    expect(at.get("c2")!.l + 170).toBe(at.get("c4")!.l + 176);
    expect(at.get("c3")).toEqual({ l: 16, t: 400 + 150 + 12 });
    expect(at.get("c4")!.t).toBe(at.get("c3")!.t);
  });
});

describe("spacing", () => {
  const snap = gapSnapper([8, 16]);
  it("snaps a gap to a step of the scale it is close to, else to the 4dp grid, and butted parts stay butted", () => {
    expect([snap(0), snap(2), snap(7), snap(9), snap(13), snap(15), snap(21), snap(30), snap(43)]).toEqual([0, 0, 8, 8, 12, 16, 20, 32, 44]);
  });

  it("gives the same answer snapped twice", () => {
    for (let g = 0; g < 120; g++) expect(snap(snap(g)), String(g)).toBe(snap(g));
    const odd = gapSnapper([10, 18]);
    for (let g = 0; g < 120; g++) expect(odd(odd(g)), String(g)).toBe(odd(g));
  });

  it("equalises a column's gaps to one step of the scale", () => {
    const shape = xyCut([box("a", 16, 0, 300, 40), box("b", 18, 46, 300, 40), box("c", 15, 99, 300, 40)]);
    const at = placeAll(shape, 16, 0);
    expect([at.get("a")!.t, at.get("b")!.t, at.get("c")!.t]).toEqual([0, 48, 96]);
    expect(new Set([...at.values()].map((p) => p.l))).toEqual(new Set([16]));
  });

  it("breaks a row where one gap is far wider than the rest: a title, then its actions", () => {
    expect(runsOf([140, 10])).toEqual([[0], [1, 2]]);
    expect(runsOf([20, 22])).toEqual([[0, 1, 2]]);
    /* two parts are one run, however far apart */
    expect(runsOf([200])).toEqual([[0, 1]]);
  });
});

describe("lining up", () => {
  it("keeps a line the run shares exactly, and centres a row of mixed heights otherwise", () => {
    expect(alignIntent([box("a", 0, 10, 10, 20), box("b", 20, 10, 10, 40)], "y")).toBe("start");
    expect(alignIntent([box("a", 0, 12, 10, 28), box("b", 20, 10, 10, 40)], "y")).toBe("center");
    expect(alignIntent([box("a", 0, 42, 10, 20), box("b", 20, 22, 10, 40)], "y")).toBe("end");
  });

  it("lines words of different sizes up on their baseline when that is what they share", () => {
    /* "$12" big beside "/month" small, their baselines both at 130 */
    const price = box("p", 0, 100, 60, 40, { base: 30 });
    const per = box("m", 64, 118, 50, 16, { base: 12 });
    expect(alignIntent([price, per], "y")).toBe("baseline");
    const at = placeAll(xyCut([price, per]), 0, 100);
    expect(at.get("m")!.t + 12).toBe(at.get("p")!.t + 30);
  });

  it("keeps a column of text on its start unless another edge is clearly shared", () => {
    expect(alignIntent([box("a", 16, 0, 200, 20), box("b", 18, 30, 150, 20)], "x")).toBe("start");
    expect(alignIntent([box("a", 100, 0, 200, 20), box("b", 150, 30, 100, 20)], "x")).toBe("center");
  });

  it("reads a selection as lines, whatever the gaps", () => {
    const lines = linesOf([box("a", 0, 0, 50, 50), box("b", 70, 8, 50, 50), box("c", 0, 80, 50, 50)]);
    expect(lines.map((l) => l.map((b) => b.id))).toEqual([["a", "b"], ["c"]]);
  });
});

describe("arranging is settled", () => {
  it("moves nothing the second time", () => {
    const boxes = [box("title", 16, 80, 160, 28), box("i1", 300, 74, 40, 40), box("i2", 350, 79, 40, 40), box("pic", 16, 140, 96, 96), box("l1", 128, 146, 200, 24), box("l2", 130, 183, 160, 20)];
    const once = placeAll(structureOf(boxes), 16, 74);
    const moved = boxes.map((b) => ({ ...b, l: once.get(b.id)!.l, t: once.get(b.id)!.t, r: once.get(b.id)!.l + (b.r - b.l), b: once.get(b.id)!.t + (b.b - b.t) }));
    const twice = placeAll(structureOf(moved), 16, 74);
    expect([...twice.entries()].sort()).toEqual([...once.entries()].sort());
    /* the icons kept their end: the title row is as wide as it was */
    expect(once.get("i2")!.l + 40).toBe(390);
  });
});
