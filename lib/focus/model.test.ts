/* The focus's rules with no page: where each direction lands, overrides and "none", where it starts, what cancel comes
 * to, and the layers: an overlay holds the focus while it is open and gives it back where it was when it closes. */

import { describe, expect, it } from "vitest";
import { FocusNav, cancelOf, distanceTo, firstOf, hintOf, inputScope, neighbourOf, padKindOf, readingOrder, uiActionOfKey, type FocusLayer, type FocusTarget } from "./model";

/** a target at a place of a 3 × 2 grid of 100 × 40 cells 20 apart */
const cell = (key: string, col: number, row: number): FocusTarget => ({ key, part: key, box: { x: col * 120, y: row * 60, w: 100, h: 40 } });
const grid = [cell("a", 0, 0), cell("b", 1, 0), cell("c", 2, 0), cell("d", 0, 1), cell("e", 1, 1), cell("f", 2, 1)];
const layer = (o: Partial<FocusLayer> = {}): FocusLayer => ({ key: "screen", targets: grid, ...o });

describe("where a direction lands", () => {
  it("goes to the nearest that way, the next in a row before the one below", () => {
    expect(neighbourOf(layer(), "a", "right")).toBe("b");
    expect(neighbourOf(layer(), "a", "down")).toBe("d");
    expect(neighbourOf(layer(), "e", "up")).toBe("b");
    expect(neighbourOf(layer(), "e", "left")).toBe("d");
    expect(neighbourOf(layer(), "c", "right")).toBeNull();
    expect(neighbourOf(layer(), "a", "up")).toBeNull();
  });

  it("goes round to the far side when the screen wraps", () => {
    expect(neighbourOf(layer({ screen: { wrap: true } }), "c", "right")).toBe("a");
    expect(neighbourOf(layer({ screen: { wrap: true } }), "e", "down")).toBe("b");
  });

  it("takes a part's own next over the layout, and stops at none", () => {
    const own = layer({ part: (id) => (id === "a" ? { next: { right: "f", down: "none" } } : undefined) });
    expect(neighbourOf(own, "a", "right")).toBe("f");
    expect(neighbourOf(own, "a", "down")).toBeNull();
    /* a part named that is not on the layer leaves the layout to decide */
    const gone = layer({ part: () => ({ next: { right: "zz" } }) });
    expect(neighbourOf(gone, "a", "right")).toBe("b");
  });

  it("reads a repeated copy's overrides off the part it was drawn from", () => {
    const rows = [{ key: "list#0/row", part: "list#0/row", box: { x: 0, y: 0, w: 100, h: 40 } }, { key: "list#1/row", part: "list#1/row", box: { x: 0, y: 60, w: 100, h: 40 } }, { key: "buy", part: "buy", box: { x: 200, y: 0, w: 80, h: 40 } }];
    const l: FocusLayer = { key: "s", targets: rows, part: (id) => (id === "row" ? { next: { right: "buy" } } : undefined) };
    expect(neighbourOf(l, "list#1/row", "right")).toBe("buy");
  });

  it("names a part with places by its id: the nearest of its places that way", () => {
    const tabs: FocusTarget[] = [0, 1, 2].map((i) => ({ key: `bar|tab:${i}`, part: "bar", box: { x: i * 100, y: 500, w: 90, h: 50 } }));
    const l: FocusLayer = { key: "s", targets: [{ key: "play", part: "play", box: { x: 180, y: 300, w: 100, h: 40 } }, ...tabs], part: (id) => (id === "play" ? { next: { down: "bar" } } : undefined) };
    expect(neighbourOf(l, "play", "down")).toBe("bar|tab:2");
  });

  it("is never that way when the middle is not past", () => {
    expect(distanceTo({ x: 0, y: 0, w: 100, h: 40 }, { x: 0, y: 0, w: 100, h: 40 }, "down")).toBeNull();
  });
});

describe("where the focus starts", () => {
  it("is the screen's first when it is there, else the first in reading order", () => {
    expect(firstOf(layer())).toBe("a");
    expect(firstOf(layer({ screen: { first: "e" } }))).toBe("e");
    expect(firstOf(layer({ screen: { first: "missing" } }))).toBe("a");
    expect(firstOf(layer({ targets: [] }))).toBeNull();
  });

  it("reads a row left to right though its parts are not level", () => {
    const t = [cell("x", 1, 0), { key: "y", box: { x: 0, y: 6, w: 100, h: 40 } }, cell("z", 0, 1)];
    expect(readingOrder(t).map((x) => x.key)).toEqual(["y", "x", "z"]);
  });
});

describe("cancel", () => {
  it("runs the screen's cancel part when it is on show, else closes or goes back", () => {
    expect(cancelOf(layer({ screen: { cancel: "f" } }))).toEqual({ tap: "f" });
    expect(cancelOf(layer({ screen: { cancel: "gone" } }))).toEqual({ dismiss: true });
    expect(cancelOf(layer())).toEqual({ dismiss: true });
  });
});

describe("the layers", () => {
  const screen = layer();
  const overlay: FocusLayer = { key: "overlay:pause", targets: [cell("resume", 0, 3), cell("quit", 0, 4)] };

  it("holds the focus in an overlay while it is open and gives it back where it was", () => {
    const nav = new FocusNav();
    expect(nav.sync([screen])).toBe("a");
    expect(nav.move([screen], "right")).toBe("b");
    expect(nav.move([screen], "down")).toBe("e");
    /* the overlay opens: the focus goes to it, and nothing under it can take it */
    expect(nav.sync([screen, overlay])).toBe("resume");
    expect(nav.move([screen, overlay], "up")).toBe("resume");
    expect(nav.move([screen, overlay], "right")).toBe("resume");
    expect(nav.move([screen, overlay], "down")).toBe("quit");
    /* it closes: back on the part the visitor left */
    expect(nav.sync([screen])).toBe("e");
  });

  it("forgets a layer that is gone: a screen opened again starts on its first", () => {
    const nav = new FocusNav();
    const deeper: FocusLayer = { key: "screen:shop:1", targets: grid };
    nav.sync([screen]);
    nav.sync([screen, deeper]);
    nav.move([screen, deeper], "right");
    expect(nav.current).toEqual({ layer: "screen:shop:1", key: "b" });
    nav.sync([screen]);
    expect(nav.sync([screen, deeper])).toBe("a");
  });

  it("starts again on its first when the part it was on is gone", () => {
    const nav = new FocusNav();
    nav.sync([screen]);
    nav.move([screen], "right");
    expect(nav.sync([layer({ targets: grid.filter((t) => t.key !== "b") })])).toBe("a");
  });
});

describe("keys, devices and hints", () => {
  it("knows the UI actions of the keyboard", () => {
    expect(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Escape", "Backspace", "a"].map((k) => uiActionOfKey(k))).toEqual(["up", "down", "left", "right", "confirm", "confirm", "cancel", "cancel", null]);
  });

  it("says each action's key for the device in use, nothing for touch", () => {
    expect(hintOf("confirm", "keyboard")).toBe("Enter");
    expect(hintOf("cancel", "keyboard")).toBe("Esc");
    expect(hintOf("confirm", "gamepad")).toBe("A");
    expect(hintOf("confirm", "gamepad", "playstation")).toBe("✕");
    expect(hintOf("cancel", "gamepad", "playstation")).toBe("○");
    expect(hintOf("confirm", "touch")).toBe("");
    expect(inputScope("gamepad", "xbox")).toMatchObject({ device: "gamepad", gamepad: true, keyboard: false, hint: { confirm: "A", cancel: "B", up: "↑" } });
  });

  it("tells a pad's family by what the browser calls it", () => {
    expect(padKindOf("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")).toBe("playstation");
    expect(padKindOf("Xbox 360 Controller (XInput STANDARD GAMEPAD)")).toBe("xbox");
    expect(padKindOf("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe("nintendo");
    expect(padKindOf("Some pad")).toBe("generic");
  });
});
