import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_SCOPE, RECIPES, RECIPE_KEYS, RECIPE_LABELS, STYLE_GROUPS, variantLabel, STYLE_PACKS, artOf, hasBackdrop, normalizeRecipes, recipesOf, screenBackground, styleCatalog, styleCss, styleOf, stylePalette, stylePatch, styleSeed, type StyleRoles } from ".";
import { DEFAULT_THEME, FONTS, ICON_FAMILIES, SHAPES, fontFamilyOf, langFaceOf, normalizeTheme, paletteOf, seedOf, shapeScaleOf, type Theme } from "../tokens";

const root = new URL("../../", import.meta.url);

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

  it("draw their icons from the product's own set", () => {
    const families: Record<string, string> = { ios: "sf", shortvideo: "remix", spotify: "phosphor", wechat: "mingcute", shop: "remix", social: "phosphor", whatsapp: "rounded", chatgpt: "lucide", claude: "phosphor", codex: "lucide", fluent: "fluentui", vscode: "codicon", discord: "remix", steam: "tabler", notion: "lucide", antd: "ant", casual: "emoji", blocks: "emoji", survival: "emoji", anime: "game", moba: "game", souls: "game", wukong: "game", cyber: "tabler", rivals: "remix", fps: "tabler", stardew: "pixel" };
    expect(STYLE_PACKS.map((s) => s.key).sort()).toEqual(Object.keys(families).sort());
    for (const s of STYLE_PACKS) expect(s.icons, s.key).toBe(families[s.key]);
  });

  it("each come from real products people use, in every group", () => {
    for (const s of STYLE_PACKS) expect(s.refs.length, s.key).toBeGreaterThan(0);
    for (const g of STYLE_GROUPS) expect(STYLE_PACKS.filter((s) => s.group === g).length, g).toBeGreaterThanOrEqual(5);
  });

  it("can be read in both modes, except what the product itself is known for and says so", () => {
    for (const s of STYLE_PACKS)
      for (const [mode, roles] of [["light", s.light], ["dark", s.dark]] as const)
        for (const [bg, fg] of READS) {
          const ratio = contrast(roles[bg] as string, roles[fg] as string);
          const floor = s.loud?.includes(bg) ? 2 : 4.5;
          expect(ratio, `${s.key} ${mode}: ${String(fg)} on ${String(bg)} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(floor);
        }
  });

  it("keep the outlines visible on the screen itself", () => {
    for (const s of STYLE_PACKS)
      for (const [mode, roles] of [["light", s.light], ["dark", s.dark]] as const) expect(contrast(roles.surface, roles.outline), `${s.key} ${mode} outline`).toBeGreaterThanOrEqual(2.8);
  });

  it("keep words in the accent color readable on a panel, in a color of their own where the fill would not do", () => {
    for (const s of STYLE_PACKS)
      for (const [mode, roles, own] of [["light", s.light, s.tokens?.primaryText], ["dark", s.dark, s.tokens?.primaryTextDark]] as const) {
        const ratio = contrast(roles.surfaceContainerHigh, own ?? roles.primary);
        expect(ratio, `${s.key} ${mode}: accent words on a panel are ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
      }
  });

  it("are all in the guide a model drafts from, as they are", () => {
    const guide = readFileSync(new URL("public/agent.md", root), "utf8");
    expect(guide).toContain(styleCatalog());
  });

  it("hold the values their makers publish", () => {
    /* WeUI 2.6 */
    expect(styleOf("wechat")!.light).toMatchObject({ primary: "#07C160", surface: "#EDEDED", surfaceContainerLow: "#FFFFFF", secondary: "#576B95" });
    /* VS Code's Dark Modern */
    expect(styleOf("vscode")!.dark).toMatchObject({ primary: "#0078D4", surface: "#1F1F1F", surfaceContainerLow: "#181818", onSurface: "#CCCCCC", outlineVariant: "#2B2B2B" });
    /* Ant Design's seed */
    expect(styleOf("antd")!.light).toMatchObject({ primary: "#1677FF", surface: "#F5F5F5" });
    /* Fluent's web theme */
    expect(styleOf("fluent")!.light).toMatchObject({ primary: "#0F6CBD", onSurface: "#242424", outlineVariant: "#E0E0E0" });
    /* Apple's system colors */
    expect(styleOf("ios")!.light.primary).toBe("#007AFF");
    expect(styleOf("ios")!.dark.primary).toBe("#0A84FF");
    /* Discord's blurple */
    expect(styleOf("discord")!.dark.primary).toBe("#5865F2");
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
    expect(css).toContain("--md-sys-color-primary:#B3261E");
    expect(css).toContain("--md-sys-color-primary:#FF5C57");
    expect(css).toContain(":root:root.dark [data-backdrop]{background-image:repeating-linear-gradient");
  });

  it("leaves the colors to the author once they have picked their own, and keeps the rest", () => {
    const css = styleCss(themed("stardew", { ownColors: true }));
    expect(css).not.toContain("--md-sys-color-primary:");
    expect(css).toContain("3px 3px 0 var(--st-rim-dark)");
    expect(stylePalette(themed("stardew", { ownColors: true }))).toBeUndefined();
    expect(styleSeed(themed("stardew", { ownColors: true }))).toBeUndefined();
    expect(hasBackdrop(themed("casual", { ownColors: true }))).toBe(false);
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

  it("makes desktop software compact and leaves the rest alone", () => {
    expect(styleCss(themed("vscode"))).toContain("--text-body-large:14px");
    expect(styleCss(themed("ios"))).not.toContain("--text-body-large:14px");
  });

  it("only speaks of slots the components have", () => {
    const sources = ["components/m3e", "parts/widgets", "parts/defs"]
      .flatMap((dir) => readdirSync(new URL(dir, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(new URL(`${dir}/${f}`, root), "utf8")))
      .join("\n");
    const every = STYLE_PACKS.map((s) => styleCss(themed(s.key))).join("\n");
    const allVariants = RECIPE_KEYS.flatMap((k) => RECIPES[k].map((v) => styleCss({ ...DEFAULT_THEME, recipes: { [k]: v } }))).join("\n");
    const slots = new Set([...`${every}\n${allVariants}`.matchAll(/\[data-slot=([a-z0-9-]+)\]/g)].map((m) => m[1]));
    expect(slots.size).toBeGreaterThan(15);
    for (const slot of slots) expect(sources.includes(`"${slot}"`), `no component has the slot ${slot}`).toBe(true);
    /* a part spoken of in every component by its ending: some component has to name one */
    const named = [...sources.matchAll(/"([a-z0-9]+(?:-[a-z0-9]+)+)"/g)].map((m) => m[1]);
    const endings = new Set([...`${every}\n${allVariants}`.matchAll(/\[data-slot\$="-([a-z0-9-]+)"\]/g)].map((m) => m[1]));
    expect(endings.size).toBeGreaterThan(3);
    for (const end of endings) expect(named.some((n) => n.endsWith(`-${end}`)), `no component has a slot ending in -${end}`).toBe(true);
  });

  it("finds the composition hooks hidden in the components, and has a recipe that shows each", () => {
    const sources = ["components/m3e", "parts/widgets", "parts/defs"]
      .flatMap((dir) => readdirSync(new URL(dir, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(new URL(`${dir}/${f}`, root), "utf8")))
      .join("\n");
    const allVariants = RECIPE_KEYS.flatMap((k) => RECIPES[k].map((v) => styleCss({ ...DEFAULT_THEME, recipes: { [k]: v } }))).join("\n");
    for (const hook of ["item-chevron", "app-bar-back-label", "app-bar-large-title", "search-cancel", "sheet-handle"]) {
      /* present but hidden by default, so Material and every style that says nothing of it look as before */
      expect(sources, hook).toMatch(new RegExp(`data-slot"?\\s*[:=]\\s*"${hook}"[^\\n]*\\bhidden\\b`));
      expect(allVariants, hook).toMatch(new RegExp(`(\\[data-slot=${hook}\\]|\\[data-slot\\$="-${hook.split("-").pop()}"\\])[^{]*\\{[^}]*display:(block|inline|inline-flex|flex)`));
    }
  });

  it("dresses the box an author builds with by the surface role it plays", () => {
    for (const s of STYLE_PACKS) {
      const css = styleCss(themed(s.key));
      for (const surface of ["card", "panel", "sheet", "overlay", "well"]) expect(css, `${s.key} ${surface}`).toContain(`[data-surface=${surface}]`);
    }
    /* a field box takes the style's field look where the style has one of its own */
    expect(styleCss(themed("ios"))).toMatch(/\[data-surface=field\][^{]*\{[^}]*border-radius/);
  });

  it("dresses a component by the parts it names, never by how it happens to be built", () => {
    /* so a component can be rebuilt without a style knowing, and a style can be added without a component knowing */
    const every = RECIPE_KEYS.flatMap((k) => RECIPES[k].map((v) => styleCss(themed("ios", { strict: false, recipes: { [k]: v } }))));
    for (const s of STYLE_PACKS) every.push(styleCss(themed(s.key)));
    const css = every.join("\n");
    expect(css).not.toMatch(/:first-child|:last-child|:nth-|:only-child/);
    expect(css).not.toMatch(/>\s*(\*|div|span|:)/);
    expect(css).not.toMatch(/(^|[\s,(}])(h1|h2|h3|p|span|div|svg|ul|li|button)(?=[\s,{.:\[)])/m);
  });

  it("is not known to the components: there is one component, and any style can dress it", () => {
    const read = (dir: string): string[] =>
      readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? read(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []));
    /* the one file that hands a theme's stylesheet to the page is the only meeting point */
    const files = [...read("parts"), ...read("components/m3e")].filter((f) => f !== "parts/theme.tsx");
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      const text = readFileSync(new URL(f, root), "utf8");
      expect(text, f).not.toMatch(/lib\/styles|lib\/styleRules|styleOf\(|recipesOf\(|theme\.style\b/);
      expect(text, f).not.toMatch(/["'`](wechat|stardew|cyber|vscode|wukong|shortvideo|antd|fluent)["'`]/);
    }
  });

  it("reaches what is worked out from the roles, inside a screen too: a chart's colors are not left at the page's", () => {
    const css = readFileSync(new URL("styles/m3e.css", root), "utf8");
    expect(css).toMatch(/\.m3-part-scope,\s*\[data-style-sample\]\s*\{\s*--background:/);
  });

  it("names every kind and every variant in the four languages", () => {
    for (const k of RECIPE_KEYS) {
      expect(Object.values(RECIPE_LABELS[k]).every(Boolean), k).toBe(true);
      for (const v of RECIPES[k]) {
        const label = variantLabel(k, v);
        expect([label.zh, label.en, label.ja, label.ko].every((s) => s && s !== v), `${k} ${v}`).toBe(true);
      }
    }
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
    const patch = stylePatch("souls");
    expect(patch).toMatchObject({ style: "souls", shape: "none", font: "garamond", displayFont: "cinzel", icons: "game", dark: true });
    expect(stylePatch("")).toMatchObject({ style: undefined, shape: "rounded", font: "roboto", icons: undefined, dark: false });
  });

  it("survives being stored, and what is unknown does not", () => {
    const stored = { ...themed("souls"), strict: false, recipes: { button: "glow", tabs: "nonsense" }, displayFont: "nope", icons: "nope" } as unknown as Theme;
    const read = normalizeTheme(stored);
    expect(read.style).toBe("souls");
    expect(read.recipes).toEqual({ button: "glow" });
    /* what is not understood falls back to what the style brings */
    expect(read.displayFont).toBe("cinzel");
    expect(read.icons).toBe("game");
    expect(normalizeTheme({ ...DEFAULT_THEME, style: "gone" }).style).toBeUndefined();
    expect(normalizeRecipes("nope")).toBeUndefined();
    expect(normalizeTheme({ ...DEFAULT_THEME, shape: "none" }).shape).toBe("none");
  });

  it("needs only its name in a document: a model or a person writes one word and gets the rest", () => {
    const read = normalizeTheme({ style: "cyber" });
    expect(read).toMatchObject({ style: "cyber", shape: "none", font: "rajdhani", icons: "tabler", dark: true });
    /* off the rules, what the author chose over the style stays */
    expect(normalizeTheme({ style: "cyber", strict: false, dark: false, icons: "rounded" })).toMatchObject({ dark: false, icons: "rounded" });
  });

  it("colors the palette the screens and the editor draw with, in the mode shown", () => {
    expect(paletteOf("purple", null, themed("ios")).primary).toBe("#007AFF");
    expect(paletteOf("purple", null, themed("ios", { dark: true })).primary).toBe("#0A84FF");
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
    expect(screenBackground("#000000", themed("casual"))).toMatch(/^linear-gradient.*#000000$/);
    expect(screenBackground("#000000", themed("casual", { ownColors: true }))).toBe("#000000");
  });

  it("gives pictures the words of the style", () => {
    expect(artOf(themed("stardew"))).toContain("pixel art");
    expect(artOf(DEFAULT_THEME)).toBe("");
  });

  it("scales corners all the way to none", () => {
    expect(shapeScaleOf("none")).toBe(0);
    expect(shapeScaleOf("soft")).toBe(0.5);
    expect(shapeScaleOf("rounded")).toBe(1);
  });
});

describe("the faces", () => {
  it("put the language's face behind the chosen one, never in front", () => {
    expect(fontFamilyOf("apple", "zh").indexOf("-apple-system")).toBe(0);
    expect(fontFamilyOf("apple", "zh").indexOf("'Noto Sans SC'")).toBeGreaterThan(fontFamilyOf("apple", "zh").indexOf("Inter"));
    expect(fontFamilyOf("cinzel", "zh")).toContain("'Noto Serif SC'");
    expect(fontFamilyOf("lilita", "zh")).toContain("'ZCOOL KuaiLe'");
    expect(fontFamilyOf("cinzel", "en")).not.toContain("Noto");
    expect(langFaceOf("garamond", "zh")?.family).toBe("'Noto Serif SC'");
    expect(langFaceOf("garamond", "ja")?.family).toBe("'Noto Sans JP'");
    expect(langFaceOf("roboto", "en")).toBeNull();
  });
});
