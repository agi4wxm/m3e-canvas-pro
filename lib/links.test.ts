import { describe, expect, it } from "vitest";
import { isNavPart, mergeLinks, routeLink, shownLinks, type LinkLine } from "./links";

const screen = (l: number) => ({ l, r: l + 412, t: 0, b: 892 });
const part = { l: 16, r: 396, t: 100, b: 160 };

describe("routeLink", () => {
  it("goes straight across to a neighbour", () => {
    const r = routeLink(part, screen(492), [screen(0)], screen(0), 10);
    expect(r.d.startsWith("M396 130 C")).toBe(true);
    expect(r.tx).toBe(482);
  });

  it("goes above the screens in between, down into the far one's top edge", () => {
    const r = routeLink(part, screen(1476), [screen(492), screen(984)], screen(0), 10);
    expect(r.tx).toBe(1476 + 309);
    expect(r.ty).toBe(-10);
    expect(r.my).toBeLessThan(-40);
    expect(r.d).toContain("Q");
    expect(r.ang).toBe(90);
    /* every point of the run across the middle is above them */
    const lane = r.my;
    expect(r.d).toContain(` ${lane}`);
  });

  it("goes the other way round to a screen on the left", () => {
    const from = { l: 1492, r: 1872, t: 100, b: 160 };
    const r = routeLink(from, screen(0), [screen(492), screen(984)], screen(1476), 10);
    expect(r.d.startsWith("M1492 130")).toBe(true);
    expect(r.tx).toBe(309);
    expect(r.my).toBeLessThan(-40);
  });

  it("does not count a screen in another row as in the way", () => {
    const below = { l: 492, r: 904, t: 2000, b: 2892 };
    const r = routeLink(part, screen(984), [below], screen(0), 10);
    expect(r.d).toContain(" C");
  });

  it("gives each line its own height above the screens when asked", () => {
    const a = routeLink(part, screen(984), [screen(492)], screen(0), 10, 0);
    const b = routeLink(part, screen(1476), [screen(492)], screen(0), 10, 12);
    expect(b.my).toBe(a.my - 12);
  });
});

describe("mergeLinks", () => {
  it("makes the rows that open one screen one line, standing for all of them", () => {
    const out = mergeLinks([
      { id: "list|tab:0", itemId: "list", to: "detail" },
      { id: "list|tab:1", itemId: "list", to: "detail" },
      { id: "list|tab:2", itemId: "list", to: "other" },
      { id: "button|", itemId: "button", to: "detail" },
    ]);
    expect(out.map((l) => l.ids)).toEqual([["list|tab:0", "list|tab:1"], ["list|tab:2"], ["button|"]]);
  });
});

describe("shownLinks", () => {
  const links: LinkLine[] = [
    { id: "a|", itemId: "a", to: "f2", fromFrame: "f1", nav: false },
    { id: "b|", itemId: "b", to: "f1", fromFrame: "f3", nav: false },
    { id: "nav|tab:1", itemId: "nav", to: "f2", fromFrame: "f1", nav: true },
  ];
  const none = { all: false, selectedIds: [] as string[], selectedFrameId: null as string | null, selectedLinkId: null as string | null };
  const ids = (o: Partial<typeof none>) => shownLinks(links, { ...none, ...o }).map((l) => l.id);

  it("draws nothing with nothing selected", () => {
    expect(ids({})).toEqual([]);
  });
  it("draws a selected part's own lines, a navigation bar's too", () => {
    expect(ids({ selectedIds: ["a"] })).toEqual(["a|"]);
    expect(ids({ selectedIds: ["nav"] })).toEqual(["nav|tab:1"]);
  });
  it("draws what leaves and what reaches a selected screen, but not its navigation bar", () => {
    expect(ids({ selectedFrameId: "f1" })).toEqual(["a|", "b|"]);
  });
  it("keeps the selected line on", () => {
    expect(ids({ selectedLinkId: "b|" })).toEqual(["b|"]);
  });
  it("draws all but the navigation bars when asked", () => {
    expect(ids({ all: true })).toEqual(["a|", "b|"]);
  });
});

describe("isNavPart", () => {
  it("knows the parts that switch main screens", () => {
    expect(isNavPart("navigation-bar")).toBe(true);
    expect(isNavPart("button")).toBe(false);
    expect(isNavPart(undefined)).toBe(false);
  });
});
