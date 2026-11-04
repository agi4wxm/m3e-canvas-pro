/**
 * lib/tidy.ts — rule-based screen layout.
 *
 * Locks in:
 *  - pullInto pulls a group back inside a frame; groups already inside are unchanged
 *  - railSide picks the edge nearest the rail's horizontal centre
 *  - barSlotOf: bars of the frame span the body width, after any left rails
 *  - tidyFrame places anchored units (rails, top bars, bottom bars, FAB, dialog)
 *    in their canonical slots; floating rows flow down on the layout margin
 *  - tidyFrame returns null when the screen is already tidy
 *  - tidyFrame shifts the parts so they don't overlap a bar at the top, etc.
 *  - Neighbouring parts stay the separate groups they are
 *  - carryFrame: phone <-> desktop conversion swaps a stand-alone navigation bar with a rail
 *  - carryFrame: a rail placed on the right stays on the right
 */
import { describe, expect, it } from "vitest";
import {
  tidyFrame,
  pullInto,
  railSide,
  barSlotOf,
  carryFrame,
  bodyRect,
} from "./tidy";
import {
  Frame,
  Group,
  Item,
  PHONE_W,
  PHONE_H,
  DESKTOP_W,
  DESKTOP_H,
  PHONE_MARGIN,
  RAIL_COLLAPSED_W,
  fitHeight,
  makeItem,
  railWidth,
  sizeOf,
} from "./tokens";

const phoneFrame: Frame = { id: "f1", name: "Phone", x: 0, y: 0 };
const widths: Record<string, number> = {};

const comp = (id: string, slug: string, props: Record<string, unknown> = {}): Item => ({ ...makeItem("component", slug), id, props });
const tabRows = (tabs: number) => Array.from({ length: tabs }, (_, i) => ({ icon: "home", label: `T${i}` }));

const btn = (id: string, label = "B"): Item => comp(id, "button", { label });
const topBar = (id: string, width?: number): Item => comp(id, "app-bar", width === undefined ? {} : { width });
const navBar = (id: string, tabs = 3): Item => comp(id, "navigation-bar", { items: tabRows(tabs) });
const railPart = (id: string, tabs = 3, props: Record<string, unknown> = {}): Item => comp(id, "navigation-rail", { items: tabRows(tabs), ...props });
const fab = (id: string): Item => comp(id, "fab", { icon: "add" });

const BUTTON_W = sizeOf(btn("a"), widths).w;
const NAV_H = sizeOf(navBar("n"), widths).h;
const FAB = sizeOf(fab("f"), widths);

const group = (id: string, x: number, y: number, items: Item[], axis: "x" | "y" = "x", free = false): Group => ({
  id,
  x,
  y,
  axis,
  items,
  ...(free ? { free: true } : {}),
});

describe("pullInto", () => {
  it("returns the group unchanged when already inside the frame", () => {
    const g = group("g1", 10, 10, [btn("a")]);
    expect(pullInto(g, phoneFrame, widths)).toBe(g);
  });

  it("shifts the group leftward when its right edge overflows the frame", () => {
    const g = group("g1", PHONE_W + 50, 10, [btn("a")]);
    const out = pullInto(g, phoneFrame, widths);
    expect(out).not.toBe(g);
    expect(out.x).toBeLessThan(g.x);
    // The group's right edge should now fit in PHONE_W
    expect(out.x + BUTTON_W).toBeLessThanOrEqual(PHONE_W + 1);
  });

  it("shifts the group upward when its bottom overflows the frame", () => {
    const g = group("g1", 10, PHONE_H + 50, [btn("a")]);
    const out = pullInto(g, phoneFrame, widths);
    expect(out.y).toBeLessThan(g.y);
  });

  it("a top-app-bar sized to the full screen snaps its left edge to the frame left", () => {
    const g = group("g1", 100, 0, [topBar("t")]); // already starts before phoneFrame ends but x > 0
    const out = pullInto(g, phoneFrame, widths);
    expect(out.x).toBe(0);
  });
});

describe("railSide", () => {
  it("returns 'left' when the rail's centre is left of the frame centre", () => {
    const r = group("r", 0, 0, [railPart("nr")]);
    expect(railSide(r, phoneFrame, widths)).toBe("left");
  });

  it("returns 'right' when the rail's centre is right of the frame centre", () => {
    const r = group("r", PHONE_W - RAIL_COLLAPSED_W, 0, [railPart("nr")]);
    expect(railSide(r, phoneFrame, widths)).toBe("right");
  });
});

describe("barSlotOf", () => {
  it("returns the full body when no rail exists", () => {
    expect(barSlotOf([], phoneFrame, [phoneFrame], widths)).toEqual({ x: 0, w: PHONE_W });
  });

  it("skips a left rail's width", () => {
    const item = railPart("nr");
    const railG = group("r", 0, 0, [item]);
    const slot = barSlotOf([railG], phoneFrame, [phoneFrame], widths);
    expect(slot.x).toBe(railWidth(item));
    expect(slot.w).toBe(PHONE_W - railWidth(item));
  });
});

describe("tidyFrame", () => {
  it("returns null when no groups belong to the frame", () => {
    expect(tidyFrame([], phoneFrame, [phoneFrame], widths)).toBeNull();
  });

  it("returns null when a top app bar already sits in its slot", () => {
    const f = phoneFrame;
    expect(tidyFrame([group("g1", 0, 0, [topBar("t")])], f, [f], widths)).toBeNull();
  });

  it("leaves neighbouring buttons as the separate groups they are", () => {
    const f = phoneFrame;
    const apart = [group("g1", 16, 300, [btn("a")]), group("g2", 16 + BUTTON_W + 6, 300, [btn("b")])];
    const out = tidyFrame(apart, f, [f], widths) ?? apart;
    expect(out).toHaveLength(2);
    expect(out.flatMap((g) => g.items.map((it) => it.id)).sort()).toEqual(["a", "b"]);
  });

  it("anchors a top app bar to the top of the screen", () => {
    const f = phoneFrame;
    const g = group("g1", 0, 500, [topBar("t")]); // placed mid-screen
    const out = tidyFrame([g], f, [f], widths)!;
    const tidied = out.find((x) => x.items[0].component === "app-bar")!;
    expect(tidied.y).toBe(0);
    expect(tidied.x).toBe(0);
  });

  it("anchors a navigation bar to the bottom of the screen", () => {
    const f = phoneFrame;
    const g = group("g1", 100, 100, [navBar("bn")]); // placed near top
    const out = tidyFrame([g], f, [f], widths)!;
    const nav = out.find((x) => x.items[0].component === "navigation-bar")!;
    expect([nav.x, nav.y]).toEqual([0, PHONE_H - NAV_H]);
  });

  it("places a FAB at the bottom-right corner of the body", () => {
    const f = phoneFrame;
    const g = group("g1", 0, 0, [fab("f")]);
    const out = tidyFrame([g], f, [f], widths)!;
    const f0 = out.find((x) => x.items[0].component === "fab")!;
    expect([f0.x, f0.y]).toEqual([PHONE_W - PHONE_MARGIN - FAB.w, PHONE_H - PHONE_MARGIN - FAB.h]);
  });

  it("stacks loose rows on the layout margin from the top down", () => {
    const f = phoneFrame;
    const a = group("a", 200, 200, [btn("a")]); // misplaced
    const b = group("b", 200, 400, [btn("b")]); // misplaced
    const out = tidyFrame([a, b], f, [f], widths)!;
    // both should now be near the top
    const ys = out.map((g) => g.y).sort((x, y) => x - y);
    expect(ys[0]).toBeLessThanOrEqual(40); // PHONE_MARGIN(16) + status(24) area
    expect(ys[1] - ys[0]).toBeGreaterThan(0);
  });
});

describe("carryFrame", () => {
  it("shrinks a phone to a smaller phone without losing groups", () => {
    const smaller: Frame = { id: "f2", name: "P2", x: 400, y: 0, w: 300, h: 500 };
    const g = group("g1", 16, 24, [topBar("t")]);
    const res = carryFrame([g], phoneFrame, smaller, [phoneFrame, smaller], widths);
    // The screen that became "smaller" — it's `to`, so the result frame should be smaller.
    expect(res.frames[1].w).toBe(300);
    expect(res.frames[1].h).toBe(500);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0].items[0].component).toBe("app-bar");
  });

  it("expands a phone to desktop: a stand-alone navigation bar becomes a rail", () => {
    const desk: Frame = { id: "d", name: "D", x: 400, y: 0, w: DESKTOP_W, h: DESKTOP_H };
    const bn = group("bn", 0, 800, [navBar("bn", 3)]);
    const res = carryFrame([bn], phoneFrame, desk, [phoneFrame, desk], widths);
    const movedNav = res.groups.find((g) => g.items[0].component === "navigation-rail" || g.items[0].component === "navigation-bar");
    expect(movedNav).toBeDefined();
    // After expansion, the rail (not bar) should be present somewhere in the doc
    const hasRail = res.groups.some((g) => g.items[0].component === "navigation-rail");
    expect(hasRail).toBe(true);
  });

  it("shrinks desktop to phone: a stand-alone rail becomes a navigation bar", () => {
    const desk: Frame = { id: "d", name: "D", x: 0, y: 0, w: DESKTOP_W, h: DESKTOP_H };
    const phone: Frame = { id: "p", name: "P", x: 0, y: 0 };
    const r = group("r", 0, 0, [railPart("nr", 3)]);
    const res = carryFrame([r], desk, phone, [desk, phone], widths);
    const hasBar = res.groups.some((g) => g.items[0].component === "navigation-bar");
    expect(hasBar).toBe(true);
  });
});

describe("tidy idempotence", () => {
  it("calling tidy twice converges (second call returns null)", () => {
    const f = phoneFrame;
    const groups = [
      group("a", 16, 24, [topBar("t")]),
      group("b", 100, 500, [btn("b")]),
    ];
    const first = tidyFrame(groups, f, [f], widths)!;
    const second = tidyFrame(first, f, [f], widths);
    expect(second).toBeNull();
  });
});

describe("expandable rail layout", () => {
  const EXPANDED = { expanded: true };

  it.each(["left", "right"] as const)("packs multiple expanded rails on the %s edge", (side) => {
    const screen: Frame = { id: "multi", name: "Desktop", x: 20, y: 40, w: 1280, h: 800 };
    const rails = [0, 1].map((i) => group(`rail-${i}`, side === "left" ? 30 + i * 230 : 820 + i * 230, 48, [
      railPart(`r-${i}`, 3, { ...EXPANDED, height: 800 }),
    ]));
    const barX = side === "left" ? 460 : 20;
    const bar = group("top", barX, 48, [topBar("top-item", 840)]);
    const measured = { "r-0": 220, "r-1": 220, "top-item": 840 };
    const out = tidyFrame([...rails, bar], screen, [screen], measured)!;
    const first = out.find((g) => g.id === "rail-0")!;
    const second = out.find((g) => g.id === "rail-1")!;
    expect(second.x - first.x).toBe(220);
    expect(side === "left" ? first.x : second.x + 220).toBe(side === "left" ? 20 : 1300);
    expect(out.find((g) => g.id === "top")?.x).toBe(barX);
    expect(barSlotOf(out, screen, [screen], measured)).toEqual({ x: barX, w: 840 });
    expect(tidyFrame(out, screen, [screen], measured)).toBeNull();
  });

  const desk: Frame = { id: "wide", name: "Desktop", x: 40, y: 20, w: DESKTOP_W, h: DESKTOP_H };

  it.each([
    [undefined, true, 80],
    [false, false, 96],
    [true, false, 220],
  ] as const)("uses the rail's layout width for expanded=%s narrow=%s", (expanded, narrow, width) => {
    for (const side of ["left", "right"] as const) {
      const x = side === "left" ? desk.x + 4 : desk.x + DESKTOP_W - width - 4;
      const rail = group("rail", x, desk.y + 8, [railPart("r", 3, { expanded, narrow, height: DESKTOP_H })]);
      const slot = barSlotOf([rail], desk, [desk], { r: width });
      expect(slot).toEqual({ x: desk.x + (side === "left" ? width : 0), w: DESKTOP_W - width });
      const measured = { r: width, b: slot.w };
      const body = bodyRect([rail], desk, [desk], measured);
      expect([body.l, body.r]).toEqual([slot.x + PHONE_MARGIN, slot.x + slot.w - PHONE_MARGIN]);
      const bar = group("bar", desk.x + 300, desk.y + 60, [topBar("b", slot.w)]);
      const out = tidyFrame([rail, bar], desk, [desk], measured)!;
      expect(out.find((g) => g.id === "rail")?.x).toBe(side === "left" ? desk.x : desk.x + DESKTOP_W - width);
      expect(out.find((g) => g.id === "bar")?.x).toBe(slot.x);
      expect(tidyFrame(out, desk, [desk], measured)).toBeNull();
    }
  });

  it("sums mixed rail widths on both edges", () => {
    const rails = [
      group("left-wide", desk.x, desk.y, [railPart("l1", 3, EXPANDED)]),
      group("left-compact", desk.x + 230, desk.y, [railPart("l2", 3, { expanded: false })]),
      group("right-wide", desk.x + DESKTOP_W - 220, desk.y, [railPart("r", 3, EXPANDED)]),
    ];
    const measured = { l1: 220, l2: 96, r: 220 };
    expect(barSlotOf(rails, desk, [desk], measured)).toEqual({ x: desk.x + 316, w: DESKTOP_W - 536 });
    const body = bodyRect(rails, desk, [desk], measured);
    expect([body.l, body.r]).toEqual([desk.x + 316 + PHONE_MARGIN, desk.x + DESKTOP_W - 220 - PHONE_MARGIN]);
    const out = tidyFrame(rails, desk, [desk], measured)!;
    expect(out.find((g) => g.id === "left-compact")?.x).toBe(desk.x + 220);
    expect(out.find((g) => g.id === "right-wide")?.x).toBe(desk.x + DESKTOP_W - 220);
  });

  it("carries expanded rails and body-spanning bars", () => {
    for (const side of ["left", "right"] as const) {
      const layoutWidth = 220;
      const rail = group("rail", side === "left" ? desk.x : desk.x + DESKTOP_W - 220, desk.y, [railPart("r", 3, { ...EXPANDED, height: DESKTOP_H })]);
      const bar = group("bar", desk.x + (side === "left" ? layoutWidth : 0), desk.y, [topBar("b", DESKTOP_W - layoutWidth)]);
      const larger = { ...desk, w: 1440, h: 900 };
      const out = carryFrame([rail, bar], desk, larger, [desk], { r: 220 }).groups;
      const movedRail = out.find((g) => g.id === "rail")!;
      const movedBar = out.find((g) => g.id === "bar")!;
      expect(movedRail.x).toBe(side === "left" ? desk.x : desk.x + 1440 - 220);
      expect(movedRail.items[0].props?.height).toBe(900);
      expect(movedBar.x).toBe(desk.x + (side === "left" ? layoutWidth : 0));
      expect(movedBar.items[0].props?.width).toBe(1440 - layoutWidth);
    }
  });

  it("creates a collapsed expressive rail after a phone round trip", () => {
    const layoutWidth = 220;
    const rail = group("rail", desk.x, desk.y, [railPart("r", 3, { ...EXPANDED, height: DESKTOP_H })]);
    const bar = group("bar", desk.x + layoutWidth, desk.y, [topBar("b", DESKTOP_W - layoutWidth)]);
    const phone = { ...desk, w: PHONE_W, h: PHONE_H };
    const compact = carryFrame([rail, bar], desk, phone, [desk], { r: 220 }).groups;
    expect(compact.find((g) => g.id === "rail")?.items[0].component).toBe("navigation-bar");
    expect(compact.find((g) => g.id === "bar")?.items[0].props?.width).toBe(PHONE_W);
    const restored = carryFrame(compact, phone, desk, [phone], widths).groups;
    const back = restored.find((g) => g.id === "rail")!.items[0];
    expect(back.component).toBe("navigation-rail");
    expect(back.props).not.toHaveProperty("expanded");
    expect(railWidth(back)).toBe(RAIL_COLLAPSED_W);
    expect(restored.find((g) => g.id === "bar")?.items[0].props?.width).toBe(DESKTOP_W - RAIL_COLLAPSED_W);
    expect(restored.find((g) => g.id === "bar")?.x).toBe(desk.x + RAIL_COLLAPSED_W);
  });
});

// smoke: makeItem usage from tokens works in this file's context
describe("integration with makeItem", () => {
  it("makeItem('component', 'button') yields an Item tidy can place", () => {
    const it = makeItem("component", "button");
    const g = group("g", 100, 100, [it]);
    const out = tidyFrame([g], phoneFrame, [phoneFrame], widths)!;
    expect(out).toHaveLength(1);
    expect(out[0].items[0].id).toBe(it.id);
  });
});

/* ---------- real component parts, placed by their role ---------- */

describe("component parts (role-driven)", () => {
  it("pins a navigation-bar component to the bottom of the screen", () => {
    const g = group("g1", 100, 100, [comp("nb", "navigation-bar")]);
    const out = tidyFrame([g], phoneFrame, [phoneFrame], widths)!;
    const nav = out.find((x) => x.items[0].component === "navigation-bar")!;
    expect([nav.x, nav.y]).toEqual([0, PHONE_H - 64]);
  });

  it("pins an app-bar component to the top of the screen", () => {
    const g = group("g1", 0, 500, [comp("ab", "app-bar")]);
    const out = tidyFrame([g], phoneFrame, [phoneFrame], widths)!;
    const bar = out.find((x) => x.items[0].component === "app-bar")!;
    expect([bar.x, bar.y]).toEqual([0, 0]);
  });

  it("places a fab component at the bottom-right corner", () => {
    const g = group("g1", 0, 0, [comp("f", "fab")]);
    const out = tidyFrame([g], phoneFrame, [phoneFrame], widths)!;
    const f0 = out.find((x) => x.items[0].component === "fab")!;
    expect([f0.x, f0.y]).toEqual([PHONE_W - PHONE_MARGIN - 56, PHONE_H - PHONE_MARGIN - 56]);
  });

  it("centers a dialog component on the screen", () => {
    const g = group("g1", 0, 0, [comp("d", "dialog")]);
    const out = tidyFrame([g], phoneFrame, [phoneFrame], widths)!;
    const d = out.find((x) => x.items[0].component === "dialog")!;
    expect(d.x).toBe(Math.round((PHONE_W - 360) / 2));
    expect(d.y).toBe(Math.round((PHONE_H - 232) / 2));
  });

  it("sits a navigation-rail component on the left edge and reserves its slot", () => {
    const g = group("r", 4, 8, [comp("r", "navigation-rail")]);
    const out = tidyFrame([g], phoneFrame, [phoneFrame], widths)!;
    const rail = out.find((x) => x.items[0].component === "navigation-rail")!;
    expect([rail.x, rail.y]).toEqual([0, 0]);
    const slot = barSlotOf(out, phoneFrame, [phoneFrame], widths);
    expect(slot).toEqual({ x: 96, w: PHONE_W - 96 });
  });

  it("carries a navigation-bar's width prop to a wider screen", () => {
    const desk: Frame = { id: "d", name: "D", x: 400, y: 0, w: DESKTOP_W, h: DESKTOP_H };
    const nb = group("nb", 0, PHONE_H - 64, [comp("nb", "navigation-bar", { width: PHONE_W })]);
    const res = carryFrame([nb], phoneFrame, desk, [phoneFrame, desk], widths);
    const moved = res.groups.find((g) => g.id === "nb")!;
    /* expanded screens swap the bar for a rail; the prop becomes the rail's height */
    expect(moved.items[0].component).toBe("navigation-rail");
    expect(moved.items[0].props?.height).toBe(DESKTOP_H);
  });

  it("swaps a stand-alone navigation-bar for a rail on desktop and back", () => {
    const desk: Frame = { id: "d", name: "D", x: 0, y: 0, w: DESKTOP_W, h: DESKTOP_H };
    const nb = group("nb", 0, PHONE_H - 64, [comp("nb", "navigation-bar", { width: PHONE_W })]);
    const wide = carryFrame([nb], phoneFrame, desk, [phoneFrame, desk], widths).groups;
    expect(wide[0].items[0].component).toBe("navigation-rail");
    const phone: Frame = { id: "p", name: "P", x: 0, y: 0 };
    const back = carryFrame(wide, desk, phone, [desk, phone], widths).groups;
    expect(back[0].items[0].component).toBe("navigation-bar");
    expect(back[0].items[0].props?.width).toBe(PHONE_W);
  });

  it("carries an app-bar's width prop to a wider screen", () => {
    const desk: Frame = { id: "d", name: "D", x: 400, y: 0, w: DESKTOP_W, h: DESKTOP_H };
    const ab = group("ab", 0, 0, [comp("ab", "app-bar", { width: PHONE_W })]);
    const res = carryFrame([ab], phoneFrame, desk, [phoneFrame, desk], widths);
    const moved = res.groups.find((g) => g.id === "ab")!;
    expect(moved.items[0].component).toBe("app-bar");
    expect(moved.items[0].props?.width).toBe(DESKTOP_W);
  });

  it("shrinks a rail component's height prop to a shorter screen", () => {
    const rail = comp("r", "navigation-rail", { height: PHONE_H });
    expect(fitHeight(rail, 320).props?.height).toBe(320);
    /* a rail that already fits keeps its height */
    expect(fitHeight(rail, PHONE_H).props?.height).toBe(PHONE_H);
  });
});
