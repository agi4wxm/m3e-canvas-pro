import { describe, expect, it } from "vitest";
import { updateRail } from "./rail";
import { barSlotOf, bodyRect, carryFrame, railSide, tidyFrame } from "./tidy";
import { Frame, Group, Item, RAIL_COLLAPSED_W, frameOfGroup, makeItem, railExpansionSide, railWidth } from "./tokens";

const frame: Frame = { id: "f", name: "Desktop", x: 20, y: 40, w: 1280, h: 800 };
const rail: Item = { ...makeItem("navigation-rail"), id: "rail", props: { expanded: false, height: 800 } };
const bar: Item = { ...makeItem("app-bar"), id: "bar", props: { width: 1184 } };
const group = (id: string, x: number, items: Item[]): Group => ({ id, x, y: 40, axis: "x", items });
const stage = (right = false): Group[] => [group("rail-group", right ? 1204 : 20, [rail]), group("bar-group", right ? 20 : 116, [bar])];
const barWith = (width: number, id = "bar"): Item => ({ ...bar, id, props: { width } });
const widthOf = (g: Group | undefined, index = 0) => g?.items[index].props?.width;

/** what the canvas measures: a rail as wide as its state, any other part as wide as its `width` prop */
const drawn = (groups: Group[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const it of groups.flatMap((g) => g.items)) {
    if (it.component === "navigation-rail") out[it.id] = railWidth(it);
    else if (typeof it.props?.width === "number") out[it.id] = it.props.width;
  }
  return out;
};
/** a rail opened or closed the way its panel does it */
const setExpanded = (groups: Group[], frames: Frame[], expanded: boolean) => {
  const item = groups.flatMap((g) => g.items).find((it) => it.id === "rail")!;
  return updateRail(groups, frames, drawn(groups), "rail", { props: { ...item.props, expanded } });
};

describe("Tidy on a scene", () => {
  it("leaves the scene where it is and stacks what stands on it", () => {
    const phone: Frame = { id: "p", name: "P", x: 0, y: 0 };
    const part = (id: string, slug: string, x: number, y: number): Group => ({ id, x, y, axis: "x", items: [{ ...makeItem(slug), id }] });
    const groups = [part("scene", "scene", 0, 0), part("bar", "app-bar", 0, 20), part("a", "card", 40, 200), part("b", "button", 40, 500)];
    const out = tidyFrame(groups, phone, [phone], { scene: 412, "scene:h": 892, bar: 412, "bar:h": 64, a: 380, "a:h": 180, b: 380, "b:h": 40 })!;
    const at = (id: string) => out.find((g) => g.id === id)!;
    expect([at("scene").x, at("scene").y]).toEqual([0, 0]);
    expect(at("bar").y).toBe(0);
    expect(at("a").x).toBe(16);
    expect(at("b").y).toBeGreaterThan(at("a").y);
  });
});

describe("a menu low on a screen", () => {
  const phone: Frame = { id: "p", name: "Phone", x: 0, y: 0 };
  const other: Frame = { id: "q", name: "Other", x: 0, y: 1000 };
  const at = (slug: string, y: number, measured: { w: number; h: number }) => {
    const it = { ...makeItem(slug), id: "m" };
    return frameOfGroup({ id: "g", x: 100, y, axis: "x", items: [it] }, [phone, other], { m: measured.w, "m:h": measured.h });
  };
  it("stays on the screen its button is on, though the open menu hangs past it", () => {
    expect(at("dropdown-menu", 840, { w: 260, h: 400 })?.id).toBe("p");
    expect(at("split-button", 840, { w: 220, h: 400 })?.id).toBe("p");
    expect(at("dropdown-menu", 1040, { w: 260, h: 400 })?.id).toBe("q");
  });
  it("leaves a dialog, whose box is all there is of it, going by its middle", () => {
    expect(at("dialog", 840, { w: 360, h: 400 })?.id).toBe("q");
  });
});

describe("updateRail", () => {
  const destinations = [{ icon: "home", label: "Home" }];
  const openRail: Item = { ...rail, props: { ...rail.props, expanded: true, modal: true, items: destinations, selected: 0 }, [railExpansionSide]: "right", actions: { "tab:0": { to: "home", transition: "fade" } } };

  it("leaves the body where it is when a modal rail opens: it floats over it", () => {
    const modal = { ...rail, props: { ...rail.props, modal: true } };
    const start = [group("rail-group", 20, [modal]), group("bar-group", 116, [bar])];
    const opened = updateRail(start, [frame], drawn(start), "rail", { props: { ...modal.props, expanded: true } });
    expect(railWidth(opened[0].items[0])).toBe(RAIL_COLLAPSED_W);
    expect(opened[1].x).toBe(116);
    expect(widthOf(opened[1])).toBe(1184);
    /* along the right edge too */
    const onRight = [group("rail-group", 1204, [modal]), group("bar-group", 20, [bar])];
    const openedRight = updateRail(onRight, [frame], drawn(onRight), "rail", { props: { ...modal.props, expanded: true } });
    expect(openedRight[0].x).toBe(1204);
    expect(openedRight[1].x).toBe(20);
  });

  it("removes rail-only state when converting to a bottom bar and preserves navigation intent", () => {
    const original = [group("nav", 1080, [openRail])];
    const phone = { ...frame, w: 412 };
    const compact = carryFrame(original, frame, phone, [frame], drawn(original)).groups;
    const item = compact[0].items[0];
    expect(item.props).not.toHaveProperty("expanded");
    expect(item.props).not.toHaveProperty("modal");
    expect(item).toMatchObject({ component: "navigation-bar", props: { items: destinations, selected: 0 }, actions: openRail.actions });
    expect(JSON.stringify(item)).not.toContain("expanded");
    expect(JSON.stringify(item)).not.toContain("modal");
    const restored = carryFrame(compact, phone, frame, [phone], drawn(compact)).groups[0].items[0];
    expect(restored).toMatchObject({ component: "navigation-rail", props: { items: destinations, selected: 0 }, actions: openRail.actions });
    expect(restored.props).not.toHaveProperty("expanded");
    expect(restored.props).not.toHaveProperty("modal");
  });

  it("drops the remembered expansion edge when converting to a bottom bar and back", () => {
    const original = [group("nav", 1080, [openRail])];
    const phone = { ...frame, w: 412 };
    const compact = carryFrame(original, frame, phone, [frame], drawn(original)).groups;
    expect(compact[0].items[0][railExpansionSide]).toBeUndefined();
    const restored = carryFrame(compact, phone, frame, [phone], drawn(compact)).groups[0].items[0];
    expect(restored[railExpansionSide]).toBeUndefined();
  });

  it.each([[100, 600, "right"], [1200, -600, "left"]] as const)("ignores the empty free-group origin at %s", (x, offset, side) => {
    const original = [{ ...group("free", x, [rail]), free: true, pos: { rail: { x: offset, y: 0 } } }];
    expect(railSide(original[0], frame, drawn(original))).toBe(side);
    const expanded = setExpanded(original, [frame], true);
    expect(railSide(expanded[0], frame, drawn(expanded))).toBe(side);
    expect(setExpanded(expanded, [frame], false)).toEqual(original);
  });

  it("resizes the complete body between neighbouring rails", () => {
    const leftWidth = 220;
    const original = [
      group("left", 20, [{ ...rail, props: { ...rail.props, expanded: true } }]),
      group("right", 1204, [{ ...rail, id: "right" }]),
      group("body", 20 + leftWidth, [barWith(1280 - leftWidth - 96)]),
    ];
    const larger = { ...frame, w: 1440 };
    const out = carryFrame(original, frame, larger, [frame], drawn(original)).groups;
    expect(widthOf(out.find((g) => g.id === "body"))).toBe(1440 - leftWidth - 96);
    const restored = carryFrame(out, larger, frame, [larger], drawn(out)).groups;
    expect(widthOf(restored.find((g) => g.id === "body"))).toBe(1280 - leftWidth - 96);
  });

  it("keeps the remaining rail's slot when only the first rail becomes a bottom bar", () => {
    const original = [
      group("left", 20, [rail]),
      group("right", 1204, [{ ...rail, id: "right" }]),
      group("body", 116, [barWith(1088)]),
    ];
    const phone = { ...frame, w: 412 };
    const compact = carryFrame(original, frame, phone, [frame], drawn(original)).groups;
    expect(compact.find((g) => g.id === "left")!.items[0].component).toBe("navigation-bar");
    expect(compact.find((g) => g.id === "right")!.items[0].component).toBe("navigation-rail");
    expect(widthOf(compact.find((g) => g.id === "body"))).toBe(316);
    const restored = carryFrame(compact, phone, frame, [phone], drawn(compact)).groups;
    expect(restored.find((g) => g.id === "left")!.items[0].component).toBe("navigation-rail");
    expect(widthOf(restored.find((g) => g.id === "body"))).toBe(1088);
  });

  it("uses the actual rail bounds when a standalone free group retains an offset", () => {
    const original = [{ ...group("free", 570, [rail]), free: true, pos: { rail: { x: 120, y: 0 } } }];
    expect(railSide(original[0], frame, drawn(original))).toBe("right");
    const expanded = setExpanded(original, [frame], true);
    expect(railSide(expanded[0], frame, drawn(expanded))).toBe("right");
    expect(setExpanded(expanded, [frame], false)).toEqual(original);
  });

  it.each([
    [undefined, true, 80],
    [false, false, 96],
    [true, false, 220],
  ] as const)("finds a rail after a bottom bar when carrying a frame (expanded=%s narrow=%s)", (expanded, narrow, layoutWidth) => {
    const original = [
      group("bottom", 20, [{ ...makeItem("navigation-bar"), id: "bottom-bar", props: { width: 1280 } }]),
      group("other-rail", 20, [{ ...rail, props: { ...rail.props, expanded, narrow } }]),
      group("body", 20 + layoutWidth, [barWith(1280 - layoutWidth)]),
    ];
    const out = carryFrame(original, frame, { ...frame, w: 1440 }, [frame], drawn(original)).groups;
    // Only the first bottom bar becomes a new, collapsed 96dp expressive rail.
    const swapped = out.find((g) => g.id === "bottom")!.items[0];
    expect(swapped.component).toBe("navigation-rail");
    expect(railWidth(swapped)).toBe(RAIL_COLLAPSED_W);
    expect(widthOf(out.find((g) => g.id === "body"))).toBe(1344 - layoutWidth);
  });

  it("keeps a near-centre right rail's body origin", () => {
    const original = stage(true);
    original[0] = { ...original[0], x: 630 };
    const expanded = setExpanded(original, [frame], true);
    expect(expanded[0].x).toBe(506);
    expect(expanded[1].x).toBe(original[1].x);
    expect(widthOf(expanded[1])).toBe(1060);
    expect(setExpanded(expanded, [frame], false)).toEqual(original);
    const saved = JSON.parse(JSON.stringify(expanded));
    expect(saved[0].items[0]).not.toHaveProperty("railAnchor");
    expect(Object.getOwnPropertySymbols(saved[0].items[0])).toEqual([]);
    expect(railSide(saved[0], frame, drawn(saved))).toBe("left");
  });

  it("keeps the expansion edge after nudges or frame moves, and follows a move across the midpoint", () => {
    const original = stage(true);
    original[0] = { ...original[0], x: 630 };
    const expanded = setExpanded(original, [frame], true);
    const nudged = expanded.map((g, i) => i === 0 ? { ...g, x: g.x + 1 } : g);
    expect(setExpanded(nudged, [frame], false)[0].x).toBe(631);
    expect(railSide(expanded[0], { ...frame, x: frame.x + 1 }, drawn(expanded))).toBe("right");
    const moved = expanded.map((g) => ({ ...g, x: g.x + 500 }));
    const collapsed = setExpanded(moved, [{ ...frame, x: frame.x + 500 }], false);
    expect(collapsed).toEqual(original.map((g) => ({ ...g, x: g.x + 500 })));

    const dragged = expanded.map((g, i) => i === 0 ? { ...g, x: 30 } : g);
    const afterDrag = setExpanded(dragged, [frame], false);
    expect(afterDrag[0].x).toBe(30);
    expect(afterDrag[0].items[0][railExpansionSide]).toBeUndefined();
  });

  it("uses the saved side for body bounds, tidy and frame resizing", () => {
    const original = stage(true);
    original[0] = { ...original[0], x: 630 };
    const expanded = setExpanded(original, [frame], true);
    const widths = drawn(expanded);
    expect(barSlotOf(expanded, frame, [frame], widths)).toEqual({ x: 20, w: 1060 });
    expect(bodyRect(expanded, frame, [frame], widths).l).toBe(36);
    expect(railSide({ ...expanded[0], x: expanded[0].x + 1e-10 }, frame, widths)).toBe("right");
    const tidied = tidyFrame(expanded, frame, [frame], widths)!;
    expect(tidied[0].x).toBe(1080);
    expect(tidied[0].items[0][railExpansionSide]).toBe("right");
    expect(setExpanded(tidied, [frame], false)[0].x).toBe(1204);

    const larger = { ...frame, w: 1440 };
    const carried = carryFrame(expanded, frame, larger, [frame], widths).groups;
    expect(carried[0].x).toBe(1240);
    expect(carried[0].items[0][railExpansionSide]).toBe("right");
    expect(setExpanded(carried, [larger], false)[0].x).toBe(1364);
  });

  it.each([false, true])("expands and collapses a standard rail reversibly on the right=%s", (right) => {
    const original = stage(right);
    const expanded = setExpanded(original, [frame], true);
    expect(expanded[0].x).toBe(right ? 1080 : 20);
    expect(expanded[1].x).toBe(right ? 20 : 240);
    expect(widthOf(expanded[1])).toBe(1060);
    expect(expanded.map((g) => g.y)).toEqual(original.map((g) => g.y));
    expect(setExpanded(expanded, [frame], false)).toEqual(original);
    expect(original[0].items[0].props?.expanded).toBe(false);
  });

  it("leaves locked groups and other screens untouched", () => {
    const locked = { ...group("locked", 116, [{ ...bar, id: "locked-bar" }]), locked: true };
    const other = group("other", 1516, [{ ...bar, id: "other-bar" }]);
    const original = [...stage(), locked, other];
    const frames = [frame, { ...frame, id: "other-frame", x: 1420 }];
    const out = setExpanded(original, frames, true);
    expect(out[2]).toBe(locked);
    expect(out[3]).toBe(other);
  });

  it("moves hand-made groups as a whole without resizing their members", () => {
    const free: Group = { ...group("free", 116, [{ ...bar, id: "free-bar" }]), free: true, pos: { "free-bar": { x: 8, y: 90 } } };
    const out = setExpanded([...stage(), free], [frame], true);
    expect(out[2].x).toBe(240);
    expect(out[2].items).toBe(free.items);
    expect(out[2].pos).toBe(free.pos);
    expect(out[2].y).toBe(free.y);
  });

  it("only patches a rail inside a hand-made group", () => {
    const original = [group("mixed", 116, [rail, bar]), group("other", 500, [{ ...bar, id: "other-bar" }])];
    const out = setExpanded(original, [frame], true);
    expect(out[0].x).toBe(original[0].x);
    expect(out[0].items[0].props?.expanded).toBe(true);
    expect(out[0].items[1]).toBe(bar);
    expect(out[1]).toBe(original[1]);
  });

  it("only patches a rail without an owning frame", () => {
    const original = [group("loose", 2000, [rail])];
    const out = setExpanded(original, [frame], true);
    expect(out[0].x).toBe(2000);
    expect(out[0].items[0].props?.expanded).toBe(true);
  });

  it("preserves a right rail's inset instead of snapping it to the screen edge", () => {
    const original = stage(true);
    original[0] = { ...original[0], x: original[0].x - 12 };
    const out = setExpanded(original, [frame], true);
    expect(out[0].x).toBe(1068);
  });

  it("returns the same groups for a missing target or an unchanged patch", () => {
    const original = stage();
    expect(updateRail(original, [frame], drawn(original), "missing", { props: { ...rail.props, expanded: true } })).toBe(original);
    expect(updateRail(original, [frame], drawn(original), "rail", { props: rail.props })).toBe(original);
  });
});
