import { describe, expect, it } from "vitest";
import { metricsOf } from "./styleLayout";
import { stylePatch } from "./styles";
import { MATERIAL_METRICS, tidyFrame, type LayoutMetrics } from "./tidy";
import { DEFAULT_THEME, frameOfGroup, groupBounds, makeItem, type Frame, type Group } from "./tokens";

/* Tidy as a property: over many screens of parts dropped anywhere, tidying what was just tidied moves nothing, nothing
 * comes out of it unfinished (NaN), and no two parts that stood clear of each other are put on each other. Strict
 * styles rerun Tidy after every change, so a second pass that moved anything would be a second jump on the screen. */

let seed = 1;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const frame: Frame = { id: "f", name: "Home", x: 0, y: 0, length: 1600 };

/** a screen of parts of every kind of size, dropped anywhere on it, overlapping or not */
function screen() {
  const groups: Group[] = [];
  const widths: Record<string, number> = {};
  const n = 2 + Math.floor(rnd() * 14);
  for (let i = 0; i < n; i++) {
    const slug = pick(["text", "button", "icon-button", "chip", "switch", "avatar", "badge", "card", "item"]);
    const id = `p${i}`;
    const w = slug === "card" || slug === "item" ? 120 + Math.round(rnd() * 260) : 24 + Math.round(rnd() * 140);
    const h = 16 + Math.round(rnd() * (slug === "card" ? 200 : 50));
    widths[id] = w;
    widths[`${id}:h`] = h;
    if (rnd() < 0.5) widths[`${id}:base`] = Math.max(1, Math.round(h * 0.7));
    groups.push({ id: `g${i}`, x: Math.round(rnd() * 380), y: 40 + Math.round(rnd() * 1000), axis: "x", items: [{ ...makeItem(slug), id, props: slug === "card" || slug === "item" ? { width: w } : {} }] });
  }
  return { groups, widths };
}

type R = { l: number; t: number; r: number; b: number };
const overlaps = (a: R, b: R) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;

/** pairs of the screen's own parts that stood clear of each other and stand on each other now */
function newlyOverlapping(before: Group[], after: Group[], widths: Record<string, number>): string[] {
  const mine = before.flatMap((g, i) => (frameOfGroup(g, [frame], widths)?.id === frame.id ? [i] : []));
  const out: string[] = [];
  for (const i of mine)
    for (const j of mine) {
      if (j <= i) continue;
      if (!overlaps(groupBounds(before[i], widths), groupBounds(before[j], widths)) && overlaps(groupBounds(after[i], widths), groupBounds(after[j], widths))) out.push(`${before[i].id}/${before[j].id}`);
    }
  return out;
}

function check(m: LayoutMetrics, seeds: number, from: number) {
  const twice: number[] = [];
  const unfinished: number[] = [];
  const piled: string[] = [];
  for (let t = 0; t < seeds; t++) {
    seed = from + t;
    const { groups, widths } = screen();
    const once = tidyFrame(groups, frame, [frame], widths, m) ?? groups;
    if (once.some((g) => !Number.isFinite(g.x) || !Number.isFinite(g.y))) unfinished.push(from + t);
    if (tidyFrame(once, frame, [frame], widths, m)) twice.push(from + t);
    for (const pair of newlyOverlapping(groups, once, widths)) piled.push(`${from + t}: ${pair}`);
  }
  return { twice, unfinished, piled };
}

describe("Tidy as a property", () => {
  it("moves nothing the second time, over a thousand and more screens, under Material's spacing", () => {
    const { twice, unfinished, piled } = check(MATERIAL_METRICS, 1500, 7);
    expect(unfinished).toEqual([]);
    expect(twice).toEqual([]);
    expect(piled).toEqual([]);
  }, 180000);

  it("moves nothing the second time under strict styles' own spacing and rules", () => {
    for (const [key, from] of [["ios", 20000], ["wechat", 30000], ["vscode", 40000]] as const) {
      const { twice, unfinished, piled } = check(metricsOf({ ...DEFAULT_THEME, ...stylePatch(key) }), 400, from);
      expect(unfinished, key).toEqual([]);
      expect(twice, key).toEqual([]);
      expect(piled, key).toEqual([]);
    }
  }, 180000);
});

describe("what Tidy takes for a slip", () => {
  const phone: Frame = { id: "f", name: "Home", x: 0, y: 0 };
  const P = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }] });
  /* the screen the reviewer tidied: two words, three buttons, a field with a switch half on its border, a picture, three avatars */
  const messy = () => [
    P("t1", "text", 0, 78, { text: "Words" }),
    P("t2", "text", 157, 98, { text: "Words" }),
    P("b1", "button", 29, 247, { label: "Go" }),
    P("b2", "button", 176, 268, { label: "Go" }),
    P("b3", "button", 304, 247, { label: "Go" }),
    P("in", "text-field", 67, 417, { label: "Email", width: 277 }),
    P("sw", "switch", 238, 403, { label: "Wi-Fi" }),
    P("img", "image", 56, 566, { width: 238, height: 160 }),
    P("a1", "avatar", 40, 735),
    P("a2", "avatar", 176, 762),
    P("a3", "avatar", 311, 729),
  ];
  const w: Record<string, number> = { t1: 40, "t1:h": 20, t2: 40, "t2:h": 20, b1: 70, "b1:h": 40, b2: 70, "b2:h": 40, b3: 70, "b3:h": 40, in: 277, "in:h": 56, sw: 96, "sw:h": 32, img: 238, "img:h": 160, a1: 40, "a1:h": 40, a2: 40, "a2:h": 40, a3: 40, "a3:h": 40 };
  const box = (gs: Group[], id: string) => groupBounds(gs.find((g) => g.items[0].id === id)!, w);

  it("lays a part that only grazes another's edge out apart from it", () => {
    const out = tidyFrame(messy(), phone, [phone], w)!;
    expect(overlaps(box(out, "sw"), box(out, "in"))).toBe(false);
    expect(tidyFrame(out, phone, [phone], w)).toBeNull();
  });

  it("keeps a part standing mostly on another, and a badge on an icon's corner, on it", () => {
    const gs = [P("pic", "image", 40, 100, { width: 200, height: 120 }), P("cap", "text", 60, 180, { text: "Caption" }), P("icon", "icon-button", 100, 400), P("badge", "badge", 128, 396)];
    const sizes = { pic: 200, "pic:h": 120, cap: 120, "cap:h": 24, icon: 40, "icon:h": 40, badge: 16, "badge:h": 16 };
    const out = tidyFrame(gs, phone, [phone], sizes)!;
    const at = (id: string) => out.find((g) => g.items[0].id === id)!;
    expect([at("cap").x - at("pic").x, at("cap").y - at("pic").y]).toEqual([20, 80]);
    expect([at("badge").x - at("icon").x, at("badge").y - at("icon").y]).toEqual([28, -4]);
  });

  it("gives one column one alignment: the side most of its narrower parts stand on", () => {
    const out = tidyFrame(messy(), phone, [phone], w)!;
    const middle = (id: string) => (box(out, id).l + box(out, id).r) / 2;
    /* the words, the switch and the picture stood nearer the middle than either edge, all but one word: all centre */
    for (const id of ["t1", "t2", "sw", "img"]) expect(middle(id), id).toBe(206);
  });

  it("keeps what stands exactly on a side there, whatever the column leans to", () => {
    const gs = [P("a", "text", 120, 100, { text: "A" }), P("b", "text", 150, 160, { text: "B" }), P("c", "text", 16, 220, { text: "C" })];
    const sizes = { a: 100, "a:h": 20, b: 100, "b:h": 20, c: 100, "c:h": 20 };
    const out = tidyFrame(gs, phone, [phone], sizes)!;
    expect(out.find((g) => g.items[0].id === "c")!.x).toBe(16);
    expect(out.find((g) => g.items[0].id === "a")!.x).toBe(156);
  });
});
