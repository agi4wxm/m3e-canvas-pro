import { describe, expect, it } from "vitest";
import { arrangeFlows, suggestAutoLayout } from "./flow";
import { frameOfGroup, groupBounds, makeItem, type Frame, type Group, type Item } from "./tokens";

/* Auto layout as a property, over many random documents: layouts nested in layouts with every kind of child setting
 * settle in a few passes and come out whole; a screen turned into layouts settles, piles nothing up and keeps every
 * part on its screen. */

let seed = 1;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
const frame: Frame = { id: "f", name: "Home", x: 0, y: 0, length: 1600 };
type R = { l: number; t: number; r: number; b: number };
const overlaps = (a: R, b: R) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
const whole = (gs: Group[]) => gs.every((g) => Number.isFinite(g.x) && Number.isFinite(g.y) && g.items.every((it) => Object.values(it.props ?? {}).every((v) => typeof v !== "number" || (Number.isFinite(v) && v >= 0))));

/** what a child may ask of its layout, any of it */
const asks = (): Partial<Item> => ({
  ...(chance(0.4) ? { flowSize: { ...(chance(0.6) ? { w: pick(["fixed", "hug", "fill"] as const) } : {}), ...(chance(0.6) ? { h: pick(["fixed", "hug", "fill"] as const) } : {}) } } : {}),
  ...(chance(0.2) ? { flowFill: true } : {}),
  ...(chance(0.2) ? { alignSelf: pick(["start", "center", "end", "stretch", "baseline"] as const) } : {}),
  ...(chance(0.15) ? { flowMin: { w: Math.round(rnd() * 200), h: Math.round(rnd() * 100) } } : {}),
  ...(chance(0.15) ? { flowMax: { w: Math.round(rnd() * 300), h: Math.round(rnd() * 200) } } : {}),
  ...(chance(0.15) ? { flowSpan: 1 + Math.floor(rnd() * 3) } : {}),
  ...(chance(0.05) ? { flowAbsolute: true } : {}),
});

/** boxes in boxes, three deep at most, with buttons and empty boxes for leaves */
function nested() {
  const groups: Group[] = [];
  const widths: Record<string, number> = {};
  let n = 0;
  const box = (depth: number, parent?: string): void => {
    const id = `b${n++}`;
    const props = {
      layout: pick(["row", "column", "grid"]),
      surface: "none",
      gap: pick([0, 4, 8, 16]),
      ...(chance(0.3) ? { gapY: pick([0, 8, 24]) } : {}),
      padX: pick([0, 8, 12]),
      padY: pick([0, 8, 12]),
      ...(chance(0.3) ? { padTop: pick([0, 4, 20]) } : {}),
      align: pick(["start", "center", "end", "stretch", "baseline"]),
      justify: pick(["start", "center", "end", "between", "around", "evenly"]),
      wrap: chance(0.3),
      columns: 1 + Math.floor(rnd() * 3),
      hugWidth: chance(0.6),
      hugHeight: chance(0.6),
      width: 40 + Math.round(rnd() * 400),
      height: 40 + Math.round(rnd() * 300),
    };
    groups.push({ id, x: Math.round(rnd() * 300), y: Math.round(rnd() * 300), axis: "x", items: [{ ...makeItem("box"), id: `i-${id}`, props, ...(parent ? asks() : {}) }], ...(parent ? { inFlow: parent } : {}) });
    const kids = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < kids; k++) {
      if (depth < 3 && chance(0.4)) {
        box(depth + 1, id);
        continue;
      }
      const lid = `l${n++}`;
      const it: Item = chance(0.4)
        ? { ...makeItem("box"), id: `i-${lid}`, props: { layout: "column", hugWidth: false, hugHeight: false, width: 20 + Math.round(rnd() * 200), height: 20 + Math.round(rnd() * 80) }, ...asks() }
        : { ...makeItem("button"), id: `i-${lid}`, props: { label: lid }, ...asks() };
      widths[it.id] = 40 + Math.round(rnd() * 120);
      widths[`${it.id}:h`] = 20 + Math.round(rnd() * 40);
      if (chance(0.3)) widths[`${it.id}:base`] = 10 + Math.round(rnd() * 10);
      groups.push({ id: lid, x: Math.round(rnd() * 300), y: Math.round(rnd() * 300), axis: "x", items: [it], inFlow: id });
    }
  };
  box(0);
  return { groups, widths };
}

/** parts dropped on a screen clear of each other */
function loose() {
  const groups: Group[] = [];
  const widths: Record<string, number> = {};
  const rects: R[] = [];
  const n = 2 + Math.floor(rnd() * 12);
  for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
    const w = 24 + Math.round(rnd() * 160);
    const h = 16 + Math.round(rnd() * 50);
    const x = 16 + Math.round(rnd() * (380 - w));
    const y = 40 + Math.round(rnd() * 700);
    const r = { l: x, t: y, r: x + w, b: y + h };
    if (rects.some((o) => overlaps(o, r))) continue;
    rects.push(r);
    const id = `p${i}`;
    widths[id] = w;
    widths[`${id}:h`] = h;
    if (chance(0.4)) widths[`${id}:base`] = Math.max(1, Math.round(h * 0.7));
    groups.push({ id: `g${i}`, x, y, axis: "x", items: [{ ...makeItem(pick(["text", "button", "icon-button", "chip", "switch", "avatar", "badge"])), id, props: {} }] });
    i++;
  }
  return { groups, widths };
}

/** laid out again and again until nothing changes; the passes it took, or Infinity */
const settle = (groups: Group[], widths: Record<string, number>) => {
  let at = groups;
  for (let pass = 0; pass < 8; pass++) {
    const next = arrangeFlows(at, widths);
    if (next === at) return { at, passes: pass };
    at = next;
  }
  return { at, passes: Infinity };
};

describe("auto layout as a property", () => {
  it("settles layouts nested in layouts, with every kind of child setting, in a few passes and whole", () => {
    const unsettled: number[] = [];
    const broken: number[] = [];
    for (let t = 1; t <= 1000; t++) {
      seed = t;
      const { groups, widths } = nested();
      const { at, passes } = settle(groups, widths);
      if (passes > 4) unsettled.push(t);
      if (!whole(at)) broken.push(t);
    }
    expect(unsettled).toEqual([]);
    expect(broken).toEqual([]);
  }, 180000);

  it("turns a screen into layouts that settle, pile nothing up and keep every part on the screen", () => {
    const failed: string[] = [];
    for (let t = 3; t < 1203; t++) {
      seed = t;
      const { groups, widths } = loose();
      let k = 0;
      const made = suggestAutoLayout(groups, new Set(groups.map((g) => g.id)), widths, () => `n${k++}`);
      if (!made) continue;
      const { at, passes } = settle(made.groups, widths);
      if (passes > 4) failed.push(`${t}: unsettled`);
      if (!whole(at)) failed.push(`${t}: broken`);
      const after = new Map(at.map((g) => [g.id, g]));
      for (let i = 0; i < groups.length; i++) {
        const a = after.get(groups[i].id)!;
        if (frameOfGroup(a, [frame], widths)?.id !== frame.id) failed.push(`${t}: ${a.id} off the screen`);
        for (let j = i + 1; j < groups.length; j++) if (overlaps(groupBounds(a, widths), groupBounds(after.get(groups[j].id)!, widths))) failed.push(`${t}: ${a.id} on ${groups[j].id}`);
      }
    }
    expect(failed).toEqual([]);
  }, 180000);
});
