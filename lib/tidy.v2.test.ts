import { describe, expect, it } from "vitest";
import { tidyFrame } from "./tidy";
import { makeItem, type Frame, type Group } from "./tokens";

/* Tidy v2: the body of a screen read as bands, rows, columns and grids (lib/structure.ts), then laid out the way a
 * designer would by hand. The rules for bars, FABs, dialogs, rails, pictures and locked sections are lib/tidy.test.ts's. */

const frame: Frame = { id: "f", name: "Home", x: 0, y: 0, length: 1200 };
const P = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props }] });
const tidy = (gs: Group[], w: Record<string, number>, f: Frame = frame) => tidyFrame(gs, f, [f], w) ?? gs;
const pos = (gs: Group[], id: string) => {
  const g = gs.find((x) => x.items[0].id === id)!;
  return { x: g.x, y: g.y };
};

/* the screen the owner described: a header with a title and two icon buttons, list rows not quite in line, a word
 * beside a switch, and a 2 × 3 grid of cards with uneven gaps */
const messy = () => [
  P("bar", "app-bar", 0, 0, { title: "Settings", width: 412 }),
  P("title", "text", 22, 84, { text: "Account", width: 160 }),
  P("i1", "icon-button", 300, 78),
  P("i2", "icon-button", 351, 86),
  P("r1", "item", 14, 134, { width: 380 }),
  P("r2", "item", 22, 205, { width: 376 }),
  P("r3", "item", 17, 283, { width: 380 }),
  P("wifi", "text", 26, 370, { text: "Wi-Fi", width: 120 }),
  P("sw", "switch", 334, 362, { label: "" }),
  P("c1", "card", 16, 420, { width: 176 }),
  P("c2", "card", 205, 428, { width: 176 }),
  P("c3", "card", 20, 640, { width: 176 }),
  P("c4", "card", 199, 626, { width: 176 }),
  P("c5", "card", 14, 850, { width: 176 }),
  P("c6", "card", 210, 868, { width: 176 }),
];
const sizes: Record<string, number> = {
  bar: 412, "bar:h": 64, title: 160, "title:h": 28, i1: 40, "i1:h": 40, i2: 40, "i2:h": 40,
  r1: 380, "r1:h": 64, r2: 376, "r2:h": 64, r3: 380, "r3:h": 64, wifi: 120, "wifi:h": 20, sw: 52, "sw:h": 32,
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [[`c${n}`, 176], [`c${n}:h`, 190]])),
};

describe("tidying a messy screen the way a designer would", () => {
  const out = tidy(messy(), sizes);

  it("keeps a title on the left margin and its actions together at the right one, in the middle of the row", () => {
    expect(pos(out, "title").x).toBe(16);
    expect(pos(out, "i2").x + 40).toBe(412 - 16);
    /* the two icons keep a gap of their own, from the scale */
    expect(pos(out, "i2").x - (pos(out, "i1").x + 40)).toBe(12);
    expect(pos(out, "i1").y).toBe(pos(out, "i2").y);
    expect(pos(out, "title").y + 14).toBe(pos(out, "i1").y + 20);
  });

  it("lines the list rows up on the margin, one tight gap between them", () => {
    const ys = ["r1", "r2", "r3"].map((id) => pos(out, id).y);
    expect(["r1", "r2", "r3"].map((id) => pos(out, id).x)).toEqual([16, 16, 16]);
    expect(ys[1] - ys[0]).toBe(ys[2] - ys[1]);
  });

  it("spreads a word and its switch across the row", () => {
    expect(pos(out, "wifi").x).toBe(16);
    expect(pos(out, "sw").x + 52).toBe(412 - 16);
    expect(pos(out, "wifi").y + 10).toBe(pos(out, "sw").y + 16);
  });

  it("makes the cards an even grid across the body, with the same gutter both ways", () => {
    const c = (n: number) => pos(out, `c${n}`);
    expect([c(1).x, c(3).x, c(5).x]).toEqual([16, 16, 16]);
    expect([c(2).x, c(4).x, c(6).x]).toEqual([412 - 16 - 176, 412 - 16 - 176, 412 - 16 - 176]);
    const gutter = c(2).x - (c(1).x + 176);
    expect(c(3).y - (c(1).y + 190)).toBe(gutter);
    expect(c(5).y - (c(3).y + 190)).toBe(gutter);
    expect(c(1).y).toBe(c(2).y);
  });

  it("is settled: tidying again moves nothing", () => {
    expect(tidyFrame(out, frame, [frame], sizes)).toBeNull();
  });
});

describe("structure the rows used to break", () => {
  it("keeps two lines of text beside the picture they belong to", () => {
    const gs = [P("pic", "image", 16, 100, { width: 96, height: 96 }), P("l1", "text", 130, 104, { text: "Name", width: 200 }), P("l2", "text", 128, 140, { text: "Detail", width: 160 })];
    const w = { pic: 96, "pic:h": 96, l1: 200, "l1:h": 24, l2: 160, "l2:h": 20 };
    const out = tidy(gs, w);
    /* the lines stay to the right of the picture, one under the other and on one left edge, beside it as a block */
    expect(pos(out, "l1").x).toBe(pos(out, "l2").x);
    expect(pos(out, "l1").x).toBeGreaterThan(pos(out, "pic").x + 96);
    expect(pos(out, "l2").y).toBeGreaterThan(pos(out, "l1").y);
    expect(pos(out, "l2").y).toBeLessThan(pos(out, "pic").y + 96);
  });

  it("keeps a badge on its icon, as one unit", () => {
    const gs = [P("icon", "icon-button", 100, 200), P("badge", "badge", 128, 196)];
    const w = { icon: 40, "icon:h": 40, badge: 16, "badge:h": 16 };
    const out = tidy(gs, w);
    expect(pos(out, "badge").x - pos(out, "icon").x).toBe(28);
    expect(pos(out, "badge").y - pos(out, "icon").y).toBe(-4);
  });

  it("lines a big and a small word up on their baseline when they were put that way", () => {
    const gs = [P("price", "text", 16, 100, { text: "$12", width: 60 }), P("per", "text", 80, 118, { text: "/mo", width: 40 })];
    const w = { price: 60, "price:h": 40, "price:base": 30, per: 40, "per:h": 16, "per:base": 12 };
    const out = tidy(gs, w);
    expect(pos(out, "per").y + 12).toBe(pos(out, "price").y + 30);
  });

  it("never moves a row off the screen: what does not fit stays where it was", () => {
    const short: Frame = { id: "f", name: "Home", x: 0, y: 0 };
    const gs = [P("a", "card", 16, 100, { width: 380 }), P("b", "card", 16, 700, { width: 380 })];
    const out = tidy(gs, { a: 380, "a:h": 600, b: 380, "b:h": 300 }, short);
    expect(pos(out, "b").y).toBe(700);
  });
});
