import { describe, expect, it } from "vitest";

import { partBySlug, treeOf } from "../parts/registry";
import { DEFAULT_THEME, makeItem, normalizeTheme, railWidth, sizeOf, type Item } from "./tokens";

describe("navigation rail geometry", () => {
  const rail = (props: Record<string, unknown> = {}): Item => ({ ...makeItem("navigation-rail"), props });

  it("creates expressive collapsed rails, and narrow ones when asked", () => {
    const fresh = rail();
    expect(fresh.props?.expanded).toBeUndefined();
    expect(railWidth(fresh)).toBe(96);
    expect(sizeOf(fresh, {}).w).toBe(96);
    expect(railWidth(rail({ narrow: true }))).toBe(80);
  });

  it("gives an expanded rail its full width", () => {
    const expanded = rail({ expanded: true });
    expect(railWidth(expanded)).toBe(220);
    expect(railWidth(rail({ expanded: true, narrow: true }))).toBe(220);
  });
});

describe("normalizeTheme", () => {
  it("returns the defaults untouched for undefined or empty input", () => {
    expect(normalizeTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(normalizeTheme({})).toEqual(DEFAULT_THEME);
  });

  it("keeps the valid fields of a partial theme and fills in the rest", () => {
    expect(normalizeTheme({ dark: true, shape: "full" })).toEqual({ ...DEFAULT_THEME, dark: true, shape: "full" });
  });

  it("replaces unknown option values with the default", () => {
    const t = normalizeTheme({ contrast: "blaring" as never, font: "papyrus" as never, shape: "pointy" as never });
    expect(t.contrast).toBe(DEFAULT_THEME.contrast);
    expect(t.font).toBe(DEFAULT_THEME.font);
    expect(t.shape).toBe(DEFAULT_THEME.shape);
  });
});

describe("scrollable tab rows", () => {
  const scrolls = (slug: string, n: number, width?: number) => {
    const items = Array.from({ length: n }, (_, i) => ({ label: `T${i + 1}`, icon: "" }));
    return JSON.stringify(treeOf(partBySlug(slug)!, { items, ...(width ? { width } : {}) })).includes("overflow-x-auto");
  };

  it("keeps up to five tabs fixed and lets six or more scroll when they do not fit", () => {
    expect(scrolls("tabs", 5)).toBe(false);
    expect(scrolls("tabs", 6)).toBe(true);
    expect(scrolls("tabs", 6, 1280)).toBe(false);
    expect(scrolls("navigation-bar", 6)).toBe(false);
  });
});
