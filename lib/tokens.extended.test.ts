/**
 * lib/tokens.ts — geometry and frame helpers.
 *
 * Locks in:
 *  - Math helpers: lerp, clamp, uid uniqueness + format
 *  - Frame helpers: frameSizeOf, isPhoneFrame, framePresetOf, frameRect
 *  - isExpanded boundary at 840 dp
 *  - uniformRadii: simple all-corners-equal constructor
 *  - carryItemSize: a part's width and height props across screen sizes
 *  - actionSlotsOf returns the places a part can send a tap from
 *  - linkUrlOf only hands back addresses a browser may follow, and completes a bare host
 *  - normalizeTheme fills in defaults
 */
import { describe, expect, it } from "vitest";
import { partBySlug, reader } from "../parts/registry";
import {
  PHONE_W,
  PHONE_H,
  DESKTOP_W,
  DESKTOP_H,
  PHONE_R,
  DESKTOP_R,
  R_INNER,
  RAIL_W,
  PHONE_MARGIN,
  EXPANDED_W,
  LINK_TARGET,
  contentWidth,
  halfWidth,
  lerp,
  clamp,
  uid,
  uniformRadii,
  isExpanded,
  frameSizeOf,
  isPhoneFrame,
  framePresetOf,
  framePresetPatch,
  frameRect,
  frameRadius,
  carryItemSize,
  actionSlotsOf,
  normalizeTheme,
  makeItem,
  isTextToken,
  linkHostOf,
  linkUrlOf,
  Frame,
  Item,
} from "./tokens";

const part = (slug: string, props?: Record<string, unknown>): Item => ({ ...makeItem(slug), ...(props ? { props } : {}) });

describe("constants", () => {
  it("key M3 dimensions match Material defaults", () => {
    expect(PHONE_W).toBe(412);
    expect(PHONE_H).toBe(892);
    expect(DESKTOP_W).toBe(1280);
    expect(DESKTOP_H).toBe(800);
    expect(PHONE_R).toBe(40);
    expect(DESKTOP_R).toBe(28);
    expect(RAIL_W).toBe(80);
    expect(PHONE_MARGIN).toBe(16);
    expect(R_INNER).toBe(8);
  });

  it("contentWidth = width - 2 * PHONE_MARGIN", () => {
    expect(contentWidth(PHONE_W)).toBe(PHONE_W - 2 * PHONE_MARGIN);
  });

  it("halfWidth fits two columns in contentWidth with one PHONE_MARGIN gutter", () => {
    expect(halfWidth(PHONE_W)).toBe((contentWidth(PHONE_W) - PHONE_MARGIN) / 2);
    expect(2 * halfWidth(PHONE_W) + PHONE_MARGIN).toBe(contentWidth(PHONE_W));
  });

  it("EXPANDED_W matches the M3 window-size-class boundary (840 dp)", () => {
    expect(EXPANDED_W).toBe(840);
  });
});

describe("lerp / clamp / uid", () => {
  it("lerp at t=0 returns a, t=1 returns b, t=0.5 returns midpoint", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it("lerp extrapolates linearly outside [0, 1]", () => {
    expect(lerp(10, 20, 2)).toBe(30);
    expect(lerp(10, 20, -1)).toBe(0);
  });

  it("clamps values into [lo, hi]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("uid produces unique short base36 strings", () => {
    const a = new Set<string>();
    for (let i = 0; i < 200; i++) a.add(uid());
    expect(a.size).toBe(200);
    for (const id of a) {
      // Math.random().toString(36).slice(2, 10) is at most 8 chars and can
      // rarely come up short — assert the contract (base36, bounded, unique),
      // not an exact length.
      expect(id).toMatch(/^[0-9a-z]{1,8}$/);
    }
  });
});

describe("uniformRadii", () => {
  it("sets all four corners to the same value", () => {
    expect(uniformRadii(12)).toEqual({ tl: 12, tr: 12, bl: 12, br: 12 });
  });
});

describe("isExpanded", () => {
  it("is true at and above 840 dp, false below", () => {
    expect(isExpanded(839)).toBe(false);
    expect(isExpanded(840)).toBe(true);
    expect(isExpanded(1280)).toBe(true);
  });
});

describe("frame helpers", () => {
  const phone: Frame = { id: "p", name: "P", x: 0, y: 0 };
  const desktop: Frame = { id: "d", name: "D", x: 100, y: 100, w: DESKTOP_W, h: DESKTOP_H };

  it("frameSizeOf fills in phone defaults when w/h are missing", () => {
    expect(frameSizeOf(phone)).toEqual({ w: PHONE_W, h: PHONE_H });
  });

  it("frameSizeOf uses explicit w/h when present", () => {
    expect(frameSizeOf(desktop)).toEqual({ w: DESKTOP_W, h: DESKTOP_H });
  });

  it("isPhoneFrame detects phone vs desktop dimensions", () => {
    expect(isPhoneFrame(phone)).toBe(true);
    expect(isPhoneFrame(desktop)).toBe(false);
  });

  it("framePresetOf maps to phone/desktop string", () => {
    expect(framePresetOf(phone)).toBe("phone");
    expect(framePresetOf(desktop)).toBe("desktop");
  });

  it("framePresetPatch returns the right w/h pair", () => {
    expect(framePresetPatch("phone")).toEqual({ w: undefined, h: undefined });
    expect(framePresetPatch("desktop")).toEqual({ w: DESKTOP_W, h: DESKTOP_H });
  });

  it("frameRect maps x/y to l/t and adds w/h to r/b", () => {
    expect(frameRect(phone)).toEqual({ l: 0, t: 0, r: PHONE_W, b: PHONE_H });
    expect(frameRect(desktop)).toEqual({ l: 100, t: 100, r: 100 + DESKTOP_W, b: 100 + DESKTOP_H });
  });

  it("frameRadius returns PHONE_R for phones and DESKTOP_R otherwise", () => {
    expect(frameRadius(phone)).toBe(PHONE_R);
    expect(frameRadius(desktop)).toBe(DESKTOP_R);
  });
});


describe("carryItemSize", () => {
  const from = { w: 320, h: 600 };
  const to = { w: 480, h: 800 };

  it("a list item as wide as the old screen takes the new width", () => {
    const out = carryItemSize(part("item", { width: from.w }), from, to);
    expect(out.props?.width).toBe(to.w);
  });

  it("a button carries no explicit size across frames and keeps its variant", () => {
    const out = carryItemSize(part("button"), from, to);
    expect(out.props?.width).toBeUndefined();
    expect(out.variant).toBe("filled");
  });

  it("a rail as tall as the old screen takes the new height", () => {
    const out = carryItemSize(part("navigation-rail", { height: from.h }), from, to);
    expect(out.props?.height).toBe(to.h);
  });

  it("a part with no measure of its own does not auto-resize", () => {
    const label = part("label", { text: "Hello" });
    expect(carryItemSize(label, from, to)).toBe(label);
  });
});

describe("actionSlotsOf", () => {
  it("a list item exposes one slot per row", () => {
    const slots = actionSlotsOf(part("item", { items: [{ label: "L", icon: "person" }, { label: "M", icon: "chevron_right" }] }));
    expect(slots.map((s) => s.key)).toEqual(["tab:0", "tab:1"]);
    expect(slots[0].value).toBe("person");
    expect(slots[1].value).toBe("chevron_right");
  });

  it("an app bar exposes its leading and trailing icons", () => {
    const slots = actionSlotsOf(part("app-bar", { leading: "menu", trailing: "search" }));
    expect(slots.map((s) => s.key)).toEqual(["icon", "icon2"]);
  });

  it("a navigation bar exposes one tab:N slot per destination", () => {
    const items = [{ icon: "home", label: "Home" }, { icon: "search", label: "Search" }];
    const slots = actionSlotsOf(part("navigation-bar", { items }));
    expect(slots.map((s) => s.key)).toEqual(["tab:0", "tab:1"]);
    expect(slots[0].value).toBe("home");
  });
});

describe("a tap that opens a link", () => {
  const link = (url?: string) => ({ to: LINK_TARGET, transition: "none" as const, url });

  it("reads a bare host as https and keeps a full address as it is", () => {
    expect(linkUrlOf(link("example.com/docs"))).toBe("https://example.com/docs");
    expect(linkUrlOf(link("http://example.com/"))).toBe("http://example.com/");
    expect(linkHostOf(link("example.com/docs"))).toBe("example.com");
  });

  it("hands back nothing for an address the browser must not follow", () => {
    expect(linkUrlOf(link(" "))).toBeNull();
    expect(linkUrlOf(link("javascript:alert(1)"))).toBeNull();
    expect(linkUrlOf(link("mailto:someone@example.com"))).toBeNull();
    expect(linkUrlOf(undefined)).toBeNull();
    expect(linkHostOf(link("not a url"))).toBeNull();
  });
});

describe("normalizeTheme", () => {
  it("returns the documented defaults when given undefined", () => {
    const t = normalizeTheme(undefined);
    expect(t).toEqual({
      dark: false,
      bothModes: false,
      contrast: "standard",
      shape: "rounded",
      font: "roboto",
      emphasized: false,
      motion: "standard",
    });
  });

});

describe("makeItem", () => {
  it("produces a sane default Item per part", () => {
    const btn = makeItem("button");
    expect(btn.kind).toBe("component");
    expect(btn.component).toBe("button");
    expect(btn.id).toMatch(/^[0-9a-z]{8}$/);
    expect(["filled", "tonal", "elevated", "outlined", "text"]).toContain(btn.variant);
  });

  it("a navigation bar comes with default destinations", () => {
    const nav = makeItem("navigation-bar");
    const rows = reader(partBySlug("navigation-bar")!, nav.props).list("items");
    expect(rows).toBeDefined();
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("isTextToken", () => {
  it("knows the text roles from the background roles", () => {
    expect(isTextToken("primary")).toBe(true);
    expect(isTextToken("surface")).toBe(false);
  });
});
