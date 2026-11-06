/* Constraints of the parts in a box with no auto layout, and one part lined up against what it stands in. */

import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { counterIds, DocStore, guessMeasurer, ops, stateOf } from "./core";
import { withConstraints } from "./constraints";
import { makeItem, type Group } from "./tokens";

beforeAll(() => setGlobalLang("en"));

const part = (id: string, slug: string, x: number, y: number, props: Record<string, unknown> = {}, extra: Partial<Group["items"][number]> = {}): Group => ({ id: `g-${id}`, x, y, axis: "x", items: [{ ...makeItem(slug), id, props, ...extra }] });

describe("withConstraints", () => {
  const was = { l: 0, t: 0, w: 200, h: 100 };
  const now = { l: 0, t: 0, w: 300, h: 160 };
  const base = (id: string, x: number, y: number, w = 40, h = 20) => ({ id: `g-${id}`, x, y, w, h });
  const groups = (c: NonNullable<Group["items"][number]["constraints"]>) => [part("a", "box", 20, 10, { width: 40, height: 20 }, { constraints: c })];

  it("keeps the distance to the edges it names", () => {
    const out = (c: NonNullable<Group["items"][number]["constraints"]>) => withConstraints(groups(c), [base("a", 20, 10)], was, now)[0];
    expect(out({ h: "right", v: "bottom" })).toMatchObject({ x: 120, y: 70 });
    expect(out({ h: "center", v: "center" })).toMatchObject({ x: 70, y: 40 });
    expect(out({ h: "stretch" })).toMatchObject({ x: 20, items: [{ props: { width: 140 } }] });
    expect(out({ h: "scale", v: "scale" })).toMatchObject({ x: 30, y: 16, items: [{ props: { width: 60, height: 32 } }] });
  });

  it("leaves what says nothing, or a box that did not change, as it is", () => {
    const g = [part("a", "box", 20, 10)];
    expect(withConstraints(g, [base("a", 20, 10)], was, now)).toBe(g);
    const c = groups({ h: "right" });
    expect(withConstraints(c, [base("a", 20, 10)], was, was)).toBe(c);
  });
});

describe("in the operations", () => {
  const store = (groups: Group[]) => new DocStore(stateOf({ groups, frames: [{ id: "f", name: "Home", x: 0, y: 0 }] }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });
  const ai = { origin: "ai" as const };

  it("places what a box with no auto layout holds by their constraints when the box changes size", () => {
    const s = store([part("box", "box", 16, 100, { layout: "free", width: 200, height: 120, surface: "card" }), part("pin", "box", 156, 110, { width: 40, height: 20 }, { constraints: { h: "right" } })]);
    s.run(ops.setProps, { id: "box", props: { width: 260 } }, ai);
    expect(s.get().doc.groups.find((g) => g.id === "g-pin")?.x).toBe(216);
  });

  it("lines one part up against its screen, and refuses one its layout places", () => {
    const s = store([part("a", "button", 40, 300, { label: "Go", width: 100 })]);
    s.run(ops.alignToParent, { id: "a", how: "right" }, ai);
    const g = s.get().doc.groups[0];
    const w = s.ctx("ai").widths.a ?? 100;
    expect(g.x + w).toBeCloseTo(412, 0);
    expect(() => s.run(ops.alignToParent, { id: "a", how: "right" }, ai)).toThrow(/already/);
  });
});
