import { screen } from "@testing-library/react-native";

import * as KIT from "../src/kit";
import { BY_NAME, COMPONENTS, NATIVE, PARTS, TreeView, UNMAPPED, colorOf, paint } from "../src/kit";
import { coverageCounts, coverageOf } from "../src/gallery/Gallery";
import { THEMES, type GalleryStyle } from "../src/gallery/themes.generated";
import { TREES } from "../src/gallery/trees.generated";
import { draw, MATERIAL_THEME } from "./helpers";

/* What the kit covers: every part of the editor is drawn by a component, by its atoms or by a placeholder, and every
 * component the coverage table names is one the kit exports. */

const STYLES = Object.keys(THEMES) as GalleryStyle[];

describe("coverage", () => {
  it("names only components the kit exports", () => {
    for (const [slug, name] of Object.entries(NATIVE)) {
      expect(BY_NAME[name]).toBeDefined();
      expect((COMPONENTS as Record<string, unknown>)[slug]).toBe(BY_NAME[name]);
      expect((KIT as Record<string, unknown>)[name]).toBeDefined();
      expect(PARTS[slug]).toBeDefined();
    }
  });

  it("draws every part of the editor one way or another, under every style", () => {
    for (const style of STYLES) {
      const counts = coverageCounts(style);
      expect(counts.native + counts.atoms + counts.placeholder).toBe(Object.keys(PARTS).length);
      expect(counts.native).toBe(Object.keys(NATIVE).length);
      expect(counts.atoms).toBeGreaterThan(30);
    }
  });

  it("draws every atom with a component of its own", () => {
    for (const [slug, info] of Object.entries(PARTS)) if (info.tier === "atom") expect(coverageOf(slug, "material")).toBe("native");
  });

  it.each(STYLES)("draws every split and every kit as atoms, with no placeholder in them (%s)", async (style) => {
    const trees = [...Object.values(TREES[style].splits), ...Object.values(TREES[style].kits).map((k) => k.tree)];
    for (const tree of trees) {
      await draw(<TreeView node={tree} testID="tree" />, THEMES[style]);
      expect(screen.queryAllByTestId(/^placeholder-/)).toHaveLength(0);
    }
  });
});

describe("looks", () => {
  const kit = { theme: MATERIAL_THEME, dark: false, colors: MATERIAL_THEME.light.colors, st: MATERIAL_THEME.light.st };

  it("read a role, a role with an opacity, or a hex, and nothing else", () => {
    expect(colorOf(kit, "primary")).toBe(kit.colors.primary);
    expect(colorOf(kit, "primary/50")).toMatch(/^#[0-9A-F]{6}80$/i);
    expect(colorOf(kit, "#123")).toBe("#123");
    expect(colorOf(kit, "red")).toBeUndefined();
    expect(colorOf(kit, "url(#x)")).toBeUndefined();
  });

  it("paint layers, a glass, the words' roles and the text look", () => {
    const p = paint(kit, { fill: "inverseSurface", look: { fills: [{ type: "linear", angle: 90, stops: [{ color: "primary", at: 0 }, { color: "#000", at: 100 }] }, { type: "radial", circle: true, stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] }], glass: 12, text: { size: 20, shadows: [{ x: 1, y: 1, blur: 2, spread: 0, color: "#000" }] }, filter: { brightness: 120 }, transform: { flipX: true }, blend: "multiply", elevation: 2 } });
    expect(p.style.backgroundColor).toBe(kit.colors["inverse-surface"]);
    expect(p.ink).toEqual({ "on-surface": kit.colors["inverse-on-surface"], "on-surface-variant": kit.colors["inverse-on-surface"] });
    expect(p.layers.map((l) => l.kind)).toEqual(["linear", "radial"]);
    expect(p.glass).toBe(12);
    expect(p.text).toMatchObject({ fontSize: 20, textShadowRadius: 2 });
    expect(p.style).toMatchObject({ filter: [{ brightness: 1.2 }], transform: [{ scaleX: -1 }], mixBlendMode: "multiply" });
    expect(String(p.style.boxShadow)).toContain("6px 2px");
  });

  it("say what a phone does not draw", () => {
    expect(UNMAPPED).toContain("texture");
  });
});
