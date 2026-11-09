import { describe, expect, it } from "vitest";
import { STYLE_PACKS, isStrict, recipesOf, stylePatch, uxOf } from "./styles";
import { conformDoc, conformGroups, conformItem, rulesForModel, styleOwnsProp } from "./styleRules";
import { DEFAULT_THEME, faceSheetsOf, fontFamilyOf, makeItem, normalizeTheme, type Group, type Item, type Theme } from "./tokens";

const part = (component: string, extra: Partial<Item> = {}, props: Record<string, unknown> = {}): Item => ({ ...makeItem(component), id: "a", props, ...extra });
const held = (key: string): Theme => normalizeTheme({ style: key });

describe("a style's rules", () => {
  it("hold a document that names a style, and one that picked Android; not one that picked nothing", () => {
    expect(isStrict(held("ios"))).toBe(true);
    expect(isStrict(DEFAULT_THEME)).toBe(false);
    expect(isStrict(normalizeTheme({ ...DEFAULT_THEME, ...stylePatch("") }))).toBe(true);
    expect(isStrict(normalizeTheme({ style: "ios", strict: false }))).toBe(false);
  });

  it("decide everything a theme could say against them, whoever wrote it", () => {
    for (const s of STYLE_PACKS) {
      const t = normalizeTheme({ style: s.key, font: "roboto", shape: "full", motion: s.motion === "standard" ? "expressive" : "standard", displayFont: "cinzel", icons: "filled", ownColors: true, recipes: { button: "glow" }, ux: { margin: 40, nav: "top" }, emphasized: true } as Partial<Theme>);
      expect(t.font, s.key).toBe(s.font);
      expect(t.shape, s.key).toBe(s.shape);
      expect(t.motion, s.key).toBe(s.motion);
      expect(t.displayFont, s.key).toBe(s.display);
      expect(t.icons, s.key).toBe(s.icons);
      expect(t.ownColors, s.key).toBeUndefined();
      expect(t.emphasized, s.key).toBe(false);
      expect(recipesOf(t).button, s.key).toBe(s.recipes.button ?? "m3");
      expect(uxOf(t).margin, s.key).toBe(s.ux.margin);
    }
  });

  it("leave the light or dark version, and the contrast, to the author", () => {
    const t = normalizeTheme({ style: "ios", dark: true, contrast: "high" });
    expect(t.dark).toBe(true);
    expect(t.contrast).toBe("high");
  });

  it("leave Android's colors and liveliness to the author, as Material does, and nothing else", () => {
    const t = normalizeTheme({ strict: true, font: "cinzel", shape: "full", motion: "expressive", recipes: { button: "glow" }, ux: { margin: 40 } });
    expect(t.font).toBe("roboto");
    expect(t.shape).toBe("rounded");
    expect(t.motion).toBe("expressive");
    expect(t.recipes).toBeUndefined();
    expect(t.ux).toBeUndefined();
  });

  it("let go of the document when asked, and everything is the author's again", () => {
    const t = normalizeTheme({ style: "ios", strict: false, font: "cinzel", recipes: { button: "glow" }, ownColors: true });
    expect(t.font).toBe("cinzel");
    expect(t.recipes).toEqual({ button: "glow" });
    expect(t.ownColors).toBe(true);
  });

  it("take off what a part carries against them, and leave the rest of it", () => {
    const worn = part("button", { corners: { tl: 1, tr: 2, br: 3, bl: 4 }, look: { shadow: "deep", rotate: 8, opacity: 50, font: "mono", fills: [{ type: "solid", color: "#ff0000" }], stroke: { width: 2, color: "primary" }, text: { size: 30 } }, fill: "primary", textColor: "onSurface", note: "keep" }, { label: "Go", shape: "square" });
    const out = conformItem(worn);
    expect(out.corners).toBeUndefined();
    /* what places a part stays; its surfaces and words are the style's */
    expect(out.look).toEqual({ opacity: 50, rotate: 8 });
    expect(out.props).toEqual({ label: "Go" });
    expect(out).toMatchObject({ fill: "primary", textColor: "onSurface", note: "keep" });
  });

  it("take a picture's own corners, and a scene's own painting style", () => {
    expect(conformItem(part("image", {}, { radius: 40, src: "x" })).props).toEqual({ src: "x" });
    expect(conformItem(part("scene", {}, { style: "oil paint", prompt: "a" })).props).toEqual({ prompt: "a" });
    /* the same word on another part is that part's own */
    expect(styleOwnsProp("text", "style")).toBe(false);
    expect(conformItem(part("text", {}, { style: "headline" })).props).toEqual({ style: "headline" });
  });

  it("change nothing that has nothing to take off, so a document at rest is not rewritten", () => {
    const clean = part("button", { fill: "primary" }, { label: "Go" });
    expect(conformItem(clean)).toBe(clean);
    const groups: Group[] = [{ id: "g", x: 0, y: 0, axis: "x", items: [clean] }];
    expect(conformGroups(groups, held("ios"))).toBe(groups);
    expect(conformItem(part("button", { look: { opacity: 40 } })).look).toEqual({ opacity: 40 });
  });

  it("do nothing to a document that is not held to them", () => {
    const worn: Group[] = [{ id: "g", x: 0, y: 0, axis: "x", items: [part("button", { corners: { tl: 1, tr: 2, br: 3, bl: 4 } })] }];
    expect(conformGroups(worn, DEFAULT_THEME)).toBe(worn);
    expect(conformGroups(worn, normalizeTheme({ style: "ios", strict: false }))).toBe(worn);
  });

  it("reach the components a document defines", () => {
    const worn: Group[] = [{ id: "g", x: 0, y: 0, axis: "x", items: [part("button", { corners: { tl: 1, tr: 2, br: 3, bl: 4 } })] }];
    const doc = conformDoc({ groups: worn, components: [{ id: "c", name: "C", groups: worn }] } as never, held("ios")) as unknown as { groups: Group[]; components: { groups: Group[] }[] };
    expect(doc.groups[0].items[0].corners).toBeUndefined();
    expect(doc.components[0].groups[0].items[0].corners).toBeUndefined();
  });

  it("are what a model is told, with the numbers and the composition of the style", () => {
    const text = rulesForModel(held("wechat"));
    expect(text).toContain(`"style": "wechat"`);
    expect(text).toContain("16px side margins");
    expect(text).toContain("Never set corners");
    expect(rulesForModel(DEFAULT_THEME)).toBe("");
    expect(rulesForModel(normalizeTheme({ ...DEFAULT_THEME, ...stylePatch("") }))).toContain("Material 3");
  });
});

describe("a style's faces", () => {
  it("cover Chinese with a face of their own wherever Noto Sans would not suit", () => {
    expect(fontFamilyOf("lilita", "zh")).toContain("ZCOOL KuaiLe");
    expect(fontFamilyOf("fredoka", "zh")).toContain("ZCOOL KuaiLe");
    expect(fontFamilyOf("barlow", "zh")).toContain("ZCOOL QingKe");
    expect(fontFamilyOf("rajdhani", "zh")).toContain("ZCOOL QingKe");
    expect(fontFamilyOf("garamond", "zh")).toContain("Noto Serif SC");
    expect(fontFamilyOf("brush", "zh")).toContain("Ma Shan Zheng");
    expect(fontFamilyOf("pixel", "zh")).toContain("Fusion Pixel");
  });

  it("do not draw Chinese in a Japanese face that happens to have the characters", () => {
    const rounded = fontFamilyOf("mrounded", "zh");
    expect(rounded.indexOf("Noto Sans SC")).toBeLessThan(rounded.indexOf("M PLUS Rounded"));
    const pixel = fontFamilyOf("pixel", "zh");
    expect(pixel.indexOf("Fusion Pixel")).toBeLessThan(pixel.indexOf("DotGothic"));
    expect(fontFamilyOf("mrounded", "ja").indexOf("M PLUS Rounded")).toBeLessThan(fontFamilyOf("mrounded", "ja").indexOf("Noto Sans JP"));
  });

  it("are all asked for by an exported project, the Chinese ones too", () => {
    expect(faceSheetsOf(held("stardew"), "zh").css[0]).toContain("fusion-pixel");
    expect(faceSheetsOf(held("casual"), "zh").google.join()).toContain("ZCOOL");
    expect(faceSheetsOf(held("wukong"), "zh").google.join()).toContain("Ma+Shan+Zheng");
    expect(faceSheetsOf(held("souls"), "zh").google.join()).toContain("Noto+Serif+SC");
  });
});
