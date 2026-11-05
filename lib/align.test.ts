import { describe, expect, it } from "vitest";
import { tidyUpParts } from "./align";
import { groupBounds, makeItem, unionRect, type Group } from "./tokens";

/* Tidy up on a selection: lines that read as a grid become an even grid, and any other lines are each made even on
 * their own, one under another. Nothing reaches past the selection's bounds by more than putting its gaps on the
 * scale adds, nothing clear of another is put on it, and tidying up again moves nothing. */

const P = (id: string, x: number, y: number): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem("button"), id, props: { label: id } }] });
const pos = (gs: Group[] | null) => Object.fromEntries((gs ?? []).map((g) => [g.items[0].id, [g.x, g.y]]));

describe("tidy up what is no grid", () => {
  it("keeps three icons over one wide part over it, packed on the scale", () => {
    const gs = [P("a", 0, 0), P("b", 50, 0), P("c", 100, 0), P("d", 0, 60)];
    const widths = { a: 40, "a:h": 40, b: 40, "b:h": 40, c: 40, "c:h": 40, d: 300, "d:h": 20 };
    const out = tidyUpParts(gs, new Set(["a", "b", "c", "d"]), widths);
    /* gaps of 10 come to 12 on the 4dp grid, within what putting them on the scale may add */
    expect(pos(out)).toEqual({ a: [0, 0], b: [52, 0], c: [104, 0], d: [0, 60] });
  });

  it("leaves a button at the end of a row over a plain row where it is", () => {
    const gs = [P("t", 0, 0), P("r1", 0, 40), P("x", 260, 40), P("r2", 0, 100)];
    const widths = { t: 120, "t:h": 24, r1: 240, "r1:h": 48, x: 40, "x:h": 40, r2: 300, "r2:h": 48 };
    const out = tidyUpParts(gs, new Set(["t", "r1", "x", "r2"]), widths)!;
    expect(pos(out).x).toEqual([260, 40]);
    const right = Math.max(...out.map((g) => groupBounds(g, widths).r));
    expect(right).toBeLessThanOrEqual(300);
  });

  it("still makes an even grid of like parts in rows", () => {
    const gs = [P("a", 0, 0), P("b", 115, 5), P("c", 3, 60), P("d", 110, 58)];
    const widths = { a: 100, "a:h": 40, b: 100, "b:h": 40, c: 100, "c:h": 40, d: 100, "d:h": 40 };
    const p = pos(tidyUpParts(gs, new Set(["a", "b", "c", "d"]), widths));
    expect(p.a[0]).toBe(p.c[0]);
    expect(p.b[0]).toBe(p.d[0]);
    expect(p.a[1]).toBe(p.b[1]);
    expect(p.c[1] - (p.a[1] + 40)).toBe(12);
  });
});

describe("tidy up as a property", () => {
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  type R = { l: number; t: number; r: number; b: number };
  const overlaps = (a: R, b: R) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;

  it("stays in the selection's bounds, piles nothing up and moves nothing the second time, over a thousand and more selections", () => {
    const twice: number[] = [];
    const outside: number[] = [];
    const piled: number[] = [];
    for (let t = 0; t < 1500; t++) {
      seed = t + 11;
      const n = 2 + Math.floor(rnd() * 7);
      const groups: Group[] = [];
      const widths: Record<string, number> = {};
      for (let i = 0; i < n; i++) {
        widths[`p${i}`] = 20 + Math.round(rnd() * 200);
        widths[`p${i}:h`] = 16 + Math.round(rnd() * 80);
        groups.push(P(`p${i}`, Math.round(rnd() * 400), Math.round(rnd() * 400)));
      }
      const ids = new Set(groups.map((g) => g.items[0].id));
      const once = tidyUpParts(groups, ids, widths) ?? groups;
      const before = groups.map((g) => groupBounds(g, widths));
      const after = once.map((g) => groupBounds(g, widths));
      const was = unionRect(before);
      const now = unionRect(after);
      /* the top left stays, and putting the gaps on the scale adds a few pixels at most */
      if (now.l < was.l || now.t < was.t || now.r > was.r + 4 || now.b > was.b + 4) outside.push(t + 11);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!overlaps(before[i], before[j]) && overlaps(after[i], after[j])) piled.push(t + 11);
      if (once.some((g) => !Number.isFinite(g.x) || !Number.isFinite(g.y)) || tidyUpParts(once, ids, widths)) twice.push(t + 11);
    }
    expect(outside).toEqual([]);
    expect(piled).toEqual([]);
    expect(twice).toEqual([]);
  }, 180000);
});
