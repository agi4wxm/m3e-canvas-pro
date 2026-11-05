import { describe, expect, it } from "vitest";
import { pushApart } from "./settle";
import { Frame, Group, makeItem } from "./tokens";

const frame: Frame = { id: "f", name: "F", x: 0, y: 0 };
const part = (id: string, slug: string, x: number, y: number, extra: Partial<Group> = {}): Group => ({ id, x, y, axis: "x", items: [{ ...makeItem(slug), id }], ...extra });
const sizes = (entries: Record<string, [number, number]>) => Object.fromEntries(Object.entries(entries).flatMap(([id, [w, h]]) => [[id, w], [`${id}:h`, h]]));
const yOf = (groups: Group[], id: string) => groups.find((g) => g.id === id)!.y;

describe("pushApart", () => {
  it("moves down what lies on the part above, by no more than it takes", () => {
    const groups = [part("card", "card", 16, 96), part("list", "item", 16, 252)];
    const out = pushApart(groups, [frame], sizes({ card: [380, 180], list: [380, 300] }))!;
    expect(yOf(out.groups, "card")).toBe(96);
    expect(yOf(out.groups, "list")).toBe(96 + 180 + 16);
  });

  it("leaves a screen with nothing in the way alone", () => {
    const groups = [part("card", "card", 16, 96), part("list", "item", 16, 400)];
    expect(pushApart(groups, [frame], sizes({ card: [380, 180], list: [380, 300] }))).toBeNull();
  });

  it("carries the push down the column, and leaves what the push never reached", () => {
    const groups = [part("a", "card", 16, 96), part("b", "item", 16, 200), part("c", "button", 16, 300), part("far", "button", 16, 700)];
    const out = pushApart(groups, [frame], sizes({ a: [380, 180], b: [380, 120], c: [380, 40], far: [380, 40] }))!;
    expect(yOf(out.groups, "b")).toBe(292);
    expect(yOf(out.groups, "c")).toBe(428);
    expect(yOf(out.groups, "far")).toBe(700);
  });

  it("keeps two parts side by side level, and does not push across columns", () => {
    const groups = [part("head", "card", 16, 96), part("left", "card", 16, 200), part("right", "card", 214, 200), part("alone", "button", 214, 100)];
    const out = pushApart(groups, [frame], sizes({ head: [182, 180], left: [182, 100], right: [182, 100], alone: [182, 40] }))!;
    expect(yOf(out.groups, "left")).toBe(292);
    expect(yOf(out.groups, "right")).toBe(200);
    expect(yOf(out.groups, "alone")).toBe(100);
  });

  it("keeps the body clear of a top bar, and never moves a bar", () => {
    const groups = [part("bar", "app-bar", 0, 0), part("nav", "navigation-bar", 0, 828), part("body", "card", 16, 40)];
    const out = pushApart(groups, [frame], sizes({ bar: [412, 64], nav: [412, 64], body: [380, 200] }))!;
    expect(yOf(out.groups, "body")).toBe(80);
    expect(yOf(out.groups, "bar")).toBe(0);
    expect(yOf(out.groups, "nav")).toBe(828);
  });

  it("lets a FAB float over the body", () => {
    const groups = [part("list", "item", 16, 96), part("fab", "fab", 340, 200)];
    expect(pushApart(groups, [frame], sizes({ list: [380, 400], fab: [56, 56] }))).toBeNull();
  });

  it("makes the screen long enough when what moved no longer fits, its bar staying at the foot", () => {
    const groups = [part("a", "card", 16, 80), part("b", "item", 16, 300), part("nav", "navigation-bar", 0, 828)];
    const out = pushApart(groups, [frame], sizes({ a: [380, 400], b: [380, 400], nav: [412, 64] }))!;
    expect(yOf(out.groups, "b")).toBe(496);
    const length = out.frames[0].length!;
    expect(length).toBeGreaterThan(892);
    expect(yOf(out.groups, "nav")).toBe(828 + (length - 892));
    expect(yOf(out.groups, "b") + 400).toBeLessThanOrEqual(yOf(out.groups, "nav"));
  });

  it("lets parts that show at different times share a place", () => {
    const groups = [part("a", "card", 16, 96), part("b", "card", 16, 96, { hidden: true })];
    expect(pushApart(groups, [frame], sizes({ a: [380, 200], b: [380, 200] }))).toBeNull();
  });

  it("takes what a container holds along with it, and does not push it off its container", () => {
    const groups = [part("top", "card", 16, 96), part("box", "container", 16, 200), part("kid", "button", 32, 220)];
    const out = pushApart(groups, [frame], sizes({ top: [380, 180], box: [380, 200], kid: [100, 40] }))!;
    expect(yOf(out.groups, "box")).toBe(292);
    expect(yOf(out.groups, "kid")).toBe(312);
  });

  it("goes by a menu's button, not the open menu drawn under it", () => {
    const groups = [part("menu", "dropdown-menu", 16, 100), part("list", "item", 16, 200)];
    expect(pushApart(groups, [frame], sizes({ menu: [260, 300], list: [380, 200] }))).toBeNull();
  });

  it("works each screen on its own", () => {
    const other: Frame = { id: "g", name: "G", x: 492, y: 0 };
    const groups = [part("a", "card", 16, 96), part("b", "item", 16, 200), part("c", "card", 508, 96), part("d", "item", 508, 400)];
    const out = pushApart(groups, [frame, other], sizes({ a: [380, 180], b: [380, 100], c: [380, 180], d: [380, 100] }))!;
    expect(yOf(out.groups, "b")).toBe(292);
    expect(yOf(out.groups, "d")).toBe(400);
  });
});
