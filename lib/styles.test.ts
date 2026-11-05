import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_SCOPE, RECIPES, RECIPE_KEYS, STYLE_PACKS, artOf, hasBackdrop, normalizeRecipes, recipesOf, screenBackground, styleCss, styleOf, stylePalette, stylePatch, styleSeed, type StyleRoles } from "./styles";
import { DEFAULT_THEME, FONTS, ICON_FAMILIES, SHAPES, fontFamilyOf, langFaceOf, normalizeTheme, paletteOf, seedOf, shapeScaleOf, type Theme } from "./tokens";

const root = new URL("../", import.meta.url);

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** the pairs a screen reads its words from: every one has to be legible */
const READS: [keyof StyleRoles, keyof StyleRoles][] = [
  ["primary", "onPrimary"],
  ["primaryContainer", "onPrimaryContainer"],
  ["secondary", "onSecondary"],
  ["secondaryContainer", "onSecondaryContainer"],
  ["tertiary", "onTertiary"],
  ["tertiaryContainer", "onTertiaryContainer"],
  ["surface", "onSurface"],
  ["surface", "onSurfaceVariant"],
  ["surfaceContainerLow", "onSurface"],
  ["surfaceContainer", "onSurface"],
  ["surfaceContainerHigh", "onSurface"],
  ["surfaceContainerHighest", "onSurface"],
  ["surfaceContainerHighest", "onSurfaceVariant"],
  ["inverseSurface", "inverseOnSurface"],
];

const themed = (key: string, extra: Partial<Theme> = {}): Theme => ({ ...DEFAULT_THEME, ...stylePatch(key), ...extra });

describe("the styles", () => {
  it("have unique keys and name only what exists", () => {
    expect(new Set(STYLE_PACKS.map((s) => s.key)).size).toBe(STYLE_PACKS.length);
    for (const s of STYLE_PACKS) {
      expect(SHAPES.some((x) => x.key === s.shape), s.key).toBe(true);
      expect(FONTS.some((x) => x.key === s.font), s.key).toBe(true);
      if (s.display) expect(FONTS.some((x) => x.key === s.display), s.key).toBe(true);
      expect(ICON_FAMILIES).toContain(s.icons);
      for (const k of Object.keys(s.recipes) as (keyof typeof RECIPES)[]) expect(RECIPES[k], `${s.key} ${k}`).toContain(s.recipes[k]);
      expect(s.art.length, s.key).toBeGreaterThan(20);
    }
  });

  it("can be read in both modes, in every pair of colors a screen reads words from", () => {
    for (const s of STYLE_PACKS)
      for (const [mode, roles] of [["light", s.light], ["dark", s.dark]] as const)
        for (const [bg, fg] of READS) {
          const ratio = contrast(roles[bg] as string, roles[fg] as string);
          expect(ratio, `${s.key} ${mode}: ${String(fg)} on ${String(bg)} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
  });

  it("keep the accent and the outlines visible on the screen itself", () => {
    for (const s of STYLE_PACKS)
      for (const [mode, roles] of [["light", s.light], ["dark", s.dark]] as const) {
        expect(contrast(roles.surface, roles.primary), `${s.key} ${mode} primary`).toBeGreaterThanOrEqual(3);
        expect(contrast(roles.surface, roles.outline), `${s.key} ${mode} outline`).toBeGreaterThanOrEqual(3);
      }
  });
});

describe("what a style writes", () => {
  it("adds nothing to plain Material", () => {
    expect(styleCss(DEFAULT_THEME)).toBe("");
    expect(styleCss({ ...DEFAULT_THEME, shape: "full" })).toBe("");
  });

  it("makes the buttons follow a square document, which M3's pills do not on their own", () => {
    const css = styleCss({ ...DEFAULT_THEME, shape: "square" });
    expect(css).toContain("--btn-r:var(--md-sys-shape-corner-small)");
    /* only the corners: no other rule of a style comes with it */
    expect(css).not.toContain("--md-sys-color-primary:");
    expect(css).not.toContain("box-shadow");
  });

  it("names its colors in light and in dark, and draws behind the screens it says it does", () => {
    const css = styleCss(themed("cyber"), APP_SCOPE);
    expect(css).toContain(":root:root{");
    expect(css).toContain(":root:root.dark{");
    expect(css).toContain("--md-sys-color-primary:#00707A");
    expect(css).toContain("--md-sys-color-primary:#00F0FF");
    expect(css).toContain(":root:root.dark [data-backdrop]{background-image:repeating-linear-gradient");
  });

  it("leaves the colors to the author once they have picked their own, and keeps the rest", () => {
    const css = styleCss(themed("pixel", { ownColors: true }));
    expect(css).not.toContain("--md-sys-color-primary:");
    expect(css).toContain("box-shadow:3px 3px 0 var(--st-line)");
    expect(stylePalette(themed("pixel", { ownColors: true }))).toBeUndefined();
    expect(styleSeed(themed("pixel", { ownColors: true }))).toBeUndefined();
    expect(hasBackdrop(themed("glass", { ownColors: true }))).toBe(false);
  });

  it("keeps the generated scheme at a higher contrast, whose contrast it promises", () => {
    const high = themed("cyber", { contrast: "high" });
    expect(stylePalette(high)).toBeUndefined();
    expect(styleCss(high)).not.toContain("--md-sys-color-primary:");
    /* still the style's own hue */
    expect(styleSeed(high)).toBe(styleOf("cyber")!.seed);
    expect(paletteOf("purple", null, high).seed).toBe(styleOf("cyber")!.seed);
  });

  it("lets a part's own corners and fill stand: they are not named anywhere in it", () => {
    for (const s of STYLE_PACKS) expect(styleCss(themed(s.key))).not.toMatch(/border-radius:[^;}]*!important/);
  });

  it("only speaks of slots the components have", () => {
    const sources = ["components/m3e", "parts/widgets"]
      .flatMap((dir) => readdirSync(new URL(dir, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(new URL(`${dir}/${f}`, root), "utf8")))
      .join("\n");
    const every = STYLE_PACKS.map((s) => styleCss(themed(s.key))).join("\n");
    const allVariants = RECIPE_KEYS.flatMap((k) => RECIPES[k].map((v) => styleCss({ ...DEFAULT_THEME, recipes: { [k]: v } }))).join("\n");
    const slots = new Set([...`${every}\n${allVariants}`.matchAll(/\[data-slot=([a-z0-9-]+)\]/g)].map((m) => m[1]));
    expect(slots.size).toBeGreaterThan(15);
    for (const slot of slots) expect(sources.includes(`"${slot}"`), `no component has the slot ${slot}`).toBe(true);
  });

  it("has CSS for every variant it offers, and each stays balanced", () => {
    for (const k of RECIPE_KEYS)
      for (const v of RECIPES[k]) {
        const css = styleCss({ ...DEFAULT_THEME, recipes: { [k]: v } });
        if (v !== "m3") expect(css, `${k} ${v}`).not.toBe("");
        expect((css.match(/\{/g) ?? []).length, `${k} ${v}`).toBe((css.match(/\}/g) ?? []).length);
      }
  });
});

describe("a theme with a style", () => {
  it("is what picking it writes, and picking none undoes it", () => {
    const patch = stylePatch("fantasy");
    expect(patch).toMatchObject({ style: "fantasy", shape: "square", font: "garamond", displayFont: "cinzel", icons: "sharp", dark: true });
    expect(stylePatch("")).toMatchObject({ style: undefined, shape: "rounded", font: "roboto", icons: undefined, dark: false });
  });

  it("survives being stored, and what is unknown does not", () => {
    const stored = { ...themed("cyber"), recipes: { button: "glow", tabs: "nonsense" }, displayFont: "nope", icons: "nope" } as unknown as Theme;
    const read = normalizeTheme(stored);
    expect(read.style).toBe("cyber");
    expect(read.recipes).toEqual({ button: "glow" });
    /* what is not understood falls back to what the style brings */
    expect(read.displayFont).toBe("orbitron");
    expect(read.icons).toBe("sharp");
    expect(normalizeTheme({ ...DEFAULT_THEME, style: "gone" }).style).toBeUndefined();
    expect(normalizeRecipes("nope")).toBeUndefined();
    expect(normalizeTheme({ ...DEFAULT_THEME, shape: "none" }).shape).toBe("none");
  });

  it("needs only its name in a document: a model or a person writes one word and gets the rest", () => {
    const read = normalizeTheme({ style: "cyber" });
    expect(read).toMatchObject({ style: "cyber", shape: "none", font: "rajdhani", displayFont: "orbitron", icons: "sharp", dark: true });
    /* what the author chose over the style stays */
    expect(normalizeTheme({ style: "cyber", dark: false, icons: "rounded" })).toMatchObject({ dark: false, icons: "rounded" });
  });

  it("colors the palette the screens and the editor draw with, in the mode shown", () => {
    expect(paletteOf("purple", null, themed("ios")).primary).toBe("#0071E3");
    expect(paletteOf("purple", null, themed("ios", { dark: true })).primary).toBe("#409CFF");
    expect(seedOf("purple", null, themed("ios"))).toBe("#007AFF");
    expect(seedOf("purple", null, DEFAULT_THEME)).not.toBe("#007AFF");
  });

  it("is overridden one control at a time", () => {
    const r = recipesOf(themed("ios", { recipes: { tabs: "boxed" } }));
    expect(r.tabs).toBe("boxed");
    expect(r.toggle).toBe("ios");
  });

  it("paints what lies behind a screen under its color", () => {
    expect(screenBackground("#000000", themed("ios"))).toBe("#000000");
    expect(screenBackground("#000000", themed("glass"))).toMatch(/^radial-gradient.*#000000$/);
    expect(screenBackground("#000000", themed("glass", { ownColors: true }))).toBe("#000000");
  });

  it("gives pictures the words of the style", () => {
    expect(artOf(themed("pixel"))).toContain("pixel art");
    expect(artOf(DEFAULT_THEME)).toBe("");
  });

  it("scales corners all the way to none", () => {
    expect(shapeScaleOf("none")).toBe(0);
    expect(shapeScaleOf("rounded")).toBe(1);
  });
});

describe("the faces", () => {
  it("put the language's face behind the chosen one, never in front", () => {
    expect(fontFamilyOf("apple", "zh").indexOf("-apple-system")).toBe(0);
    expect(fontFamilyOf("apple", "zh").indexOf("'Noto Sans SC'")).toBeGreaterThan(fontFamilyOf("apple", "zh").indexOf("Inter"));
    expect(fontFamilyOf("cinzel", "zh")).toContain("'Noto Serif SC'");
    expect(fontFamilyOf("cinzel", "en")).not.toContain("Noto");
    expect(langFaceOf("garamond", "zh")?.family).toBe("'Noto Serif SC'");
    expect(langFaceOf("garamond", "ja")?.family).toBe("'Noto Sans JP'");
    expect(langFaceOf("roboto", "en")).toBeNull();
  });
});
