import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_SCOPE,
  CUSTOM_PREFIX,
  STYLE_PACKS,
  artOf,
  checkSelector,
  checkValue,
  cleanStyles,
  compileCustomStyle,
  copyOfStyle,
  customPacks,
  docStylesRevision,
  fromPack,
  hasBackdrop,
  parseCss,
  readStyleFile,
  recipesOf,
  resolveStyle,
  rulesCss,
  rulesFromCss,
  screenBackground,
  setDocStyles,
  styleCss,
  styleFile,
  styleOf,
  stylePalette,
  stylePatch,
  uxOf,
  validateCustomStyle,
  withDocStyles,
  withStyle,
  type CustomStyle,
} from ".";
import { kitLookOf, recomposeKits } from "../kits";
import { openProject, projectFile } from "../project";
import { readShareHash, shareLink } from "../share";
import { conformDoc, rulesForModel } from "../styleRules";
import { DEFAULT_THEME, makeItem, normalizeTheme, paletteOf, type Doc, type Group, type Theme } from "../tokens";

const themed = (key: string, extra: Partial<Theme> = {}): Theme => ({ ...DEFAULT_THEME, ...stylePatch(key), ...extra });
const valid = (input: unknown): CustomStyle => {
  const { style } = validateCustomStyle(input);
  if (!style) throw new Error("not a style");
  return style;
};

afterEach(() => setDocStyles(undefined));

describe("a built-in pack as a custom style", () => {
  it("comes through validation of every pack without a word to say", () => {
    for (const pack of STYLE_PACKS) {
      const { style, problems } = validateCustomStyle(fromPack(pack));
      expect(problems, pack.key).toEqual([]);
      expect(style?.key, pack.key).toBe(`${CUSTOM_PREFIX}${pack.key}`);
    }
  });

  it("loses none of the pack's data", () => {
    for (const pack of STYLE_PACKS) {
      const compiled = compileCustomStyle(fromPack(pack))!;
      const { css: _a, key: _b, ...data } = pack;
      const { css: _c, key: _d, ...back } = compiled;
      expect(back, pack.key).toEqual(JSON.parse(JSON.stringify(data)));
    }
  });

  it("writes the pack's own CSS as rules when all of it fits, and extends the pack when not", () => {
    let inline = 0;
    for (const pack of STYLE_PACKS) {
      const style = fromPack(pack);
      const fits = !rulesFromCss(pack.css ?? "").rejected.length;
      expect(style.extends, pack.key).toBe(fits ? undefined : pack.key);
      expect(style.rules.length > 0, pack.key).toBe(fits && !!pack.css);
      if (fits) inline++;
    }
    /* the grammar is wide enough for the plainer packs: iOS, WeChat, VS Code… */
    expect(inline).toBeGreaterThanOrEqual(8);
    expect(fromPack(styleOf("ios")!).extends).toBeUndefined();
  });

  it("wears exactly as the pack does: the same stylesheet, palette, layout, kits and backdrop", () => {
    for (const pack of STYLE_PACKS) {
      const style = fromPack(pack);
      setDocStyles([style]);
      const mine = themed(style.key);
      const theirs = themed(pack.key);
      /* the pack's CSS, as the rules it was read into, stands where the pack's own stood */
      const asRules = style.extends ? (pack.css ?? "") : rulesCss(parseCss(pack.css ?? "").rules.map((r) => ({ selector: r.selector, declarations: Object.fromEntries(r.declarations) })));
      for (const at of [undefined, APP_SCOPE]) expect(styleCss(mine, at), pack.key).toBe(styleCss(theirs, at).replace(pack.css ?? "\u0000", asRules));
      expect(styleCss({ ...mine, dark: true }), pack.key).toBe(styleCss({ ...theirs, dark: true }).replace(pack.css ?? "\u0000", asRules));
      expect({ ...stylePalette(mine), key: "", label: "" }, pack.key).toEqual({ ...stylePalette(theirs), key: "", label: "" });
      expect(recipesOf(mine), pack.key).toEqual(recipesOf(theirs));
      expect(uxOf(mine), pack.key).toEqual(uxOf(theirs));
      expect(kitLookOf(mine), pack.key).toEqual(kitLookOf(theirs));
      expect(screenBackground("#123456", mine), pack.key).toBe(screenBackground("#123456", theirs));
      expect(hasBackdrop(mine), pack.key).toBe(hasBackdrop(theirs));
      expect(artOf(mine), pack.key).toBe(artOf(theirs));
      expect({ ...stylePatch(style.key), style: "" }, pack.key).toEqual({ ...stylePatch(pack.key), style: "" });
    }
  });

  it("reads the pack's CSS back rule for rule, declaration for declaration", () => {
    for (const pack of STYLE_PACKS) {
      const { rules, unread } = parseCss(pack.css ?? "");
      expect(unread, pack.key).toEqual([]);
      const declarations = (pack.css ?? "").replace(/"[^"]*"/g, '""').match(/:[^;{}]*[;}]/g)?.length ?? 0;
      expect(rules.reduce((n, r) => n + r.declarations.length, 0), pack.key).toBeLessThanOrEqual(declarations);
      expect(rules.length, pack.key).toBe(((pack.css ?? "").match(/\{/g) ?? []).length);
    }
  });
});

describe("the format", () => {
  it("is idempotent: a validated style comes back the same, field for field", () => {
    const partial = { key: "brand", extends: "ios", light: { primary: "#FF2D55" }, recipes: { tabs: "underline" }, display: null, screen: null, tokens: { toggleOn: "#FF2D55" }, ux: { margin: 24, bleed: [] }, rules: [{ selector: "[data-slot=card]", declarations: { "border-radius": "20px" } }] };
    const once = valid(partial);
    expect(valid(once)).toEqual(once);
    expect(validateCustomStyle(once).problems.filter((p) => p.fix !== "kept")).toEqual([]);
    for (const pack of STYLE_PACKS) {
      const s = valid(fromPack(pack));
      expect(valid(s), pack.key).toEqual(s);
    }
  });

  it("travels as a file and comes back the same", () => {
    const style = copyOfStyle(styleOf("wechat")!);
    const text = JSON.stringify(styleFile(style));
    const { style: back, problems } = readStyleFile(text);
    expect(problems).toEqual([]);
    expect(back).toEqual(style);
    /* a bare style reads as well; anything else does not */
    expect(readStyleFile(JSON.stringify(style)).style).toEqual(style);
    expect(readStyleFile("{nope").style).toBeNull();
    expect(readStyleFile(JSON.stringify({ format: "m3e-project", document: {} })).style).toBeNull();
    expect(readStyleFile(JSON.stringify({ format: "m3e-style", version: 99, style })).style).toBeNull();
    expect(readStyleFile("42").style).toBeNull();
  });

  it("extends a pack by what it says, and takes the rest from the pack", () => {
    const s = valid({ key: "custom:pink", extends: "ios", name: "Pink", light: { primary: "#C2185B" }, recipes: { tabs: "underline" } });
    const ios = styleOf("ios")!;
    expect(s.light.primary).toBe("#C2185B");
    expect(s.light.surface).toBe(ios.light.surface);
    expect(s.dark).toEqual(ios.dark);
    expect(s.recipes).toEqual({ ...ios.recipes, tabs: "underline" });
    expect(s.font).toBe(ios.font);
    expect(s.icons).toBe(ios.icons);
    expect(s.ux).toEqual(ios.ux);
    expect(s.name).toEqual({ zh: "Pink", en: "Pink", ja: "Pink", ko: "Pink" });
    /* its CSS is the pack's, then its own rules */
    const compiled = compileCustomStyle({ ...s, rules: [{ selector: "[data-slot=card]", declarations: { "border-radius": "24px" } }] })!;
    expect(compiled.css!.startsWith(ios.css!)).toBe(true);
    expect(compiled.css!.endsWith("[data-slot=card]{border-radius:24px}")).toBe(true);
  });

  it("generates the roles a style without a base leaves out, and says so", () => {
    const { style, problems } = validateCustomStyle({ key: "custom:seeded", name: "Seeded", seed: "#00897B" });
    expect(style!.light.primary).toMatch(/^#[0-9A-F]{6}$/);
    expect(style!.dark.surface).toMatch(/^#[0-9A-F]{6}$/);
    expect(problems.filter((p) => p.code === "role").map((p) => p.path)).toEqual(["light", "dark"]);
    expect(problems.every((p) => p.zh && p.en)).toBe(true);
  });

  it("puts right what it can, leaves out what it cannot, and says which in Chinese and English", () => {
    const { style, problems } = validateCustomStyle({
      key: "Not A Key!",
      name: { zh: "我的" },
      extends: "nope",
      font: "comic-sans",
      display: "papyrus",
      icons: "dingbats",
      shape: "blob",
      mode: "sepia",
      seed: "red",
      light: { primary: "blue", onPrimary: "#fff" },
      recipes: { button: "rainbow", tabs: "underline", nope: "m3" },
      tokens: { toggleOn: "url(x)", navOn: "var(--md-sys-color-primary)", sparkle: "#fff" },
      ux: { margin: 500, nav: "sideways" },
      type: { "title-large": [20, 28, 600], huge: [1, 2] },
      screen: "url(https://example.com/a.png)",
      rules: "nope",
    });
    expect(style).not.toBeNull();
    expect(style!.key).toMatch(/^custom:[a-z0-9-]+$/);
    expect(style!.name).toEqual({ zh: "我的", en: "我的", ja: "我的", ko: "我的" });
    expect(style!.extends).toBeUndefined();
    expect(style!.font).toBe("roboto");
    expect(style!.display).toBeUndefined();
    expect(style!.icons).toBe("rounded");
    expect(style!.shape).toBe("rounded");
    expect(style!.mode).toBe("light");
    expect(style!.light.onPrimary).toBe("#FFFFFF");
    expect(style!.recipes).toEqual({ tabs: "underline" });
    expect(style!.tokens).toEqual({ navOn: "var(--md-sys-color-primary)" });
    expect(style!.ux.margin).toBe(64);
    expect(style!.ux.nav).toBe("keep");
    expect(style!.type).toEqual({ "title-large": [20, 28, 600] });
    expect(style!.screen).toBeUndefined();
    expect(style!.rules).toEqual([]);
    const paths = problems.map((p) => p.path);
    for (const p of ["key", "extends", "font", "display", "icons", "shape", "mode", "seed", "light.primary", "recipes.button", "recipes.nope", "tokens.toggleOn", "tokens.sparkle", "ux.margin", "ux.nav", "type.huge", "screen", "rules"]) expect(paths, p).toContain(p);
    for (const p of problems) {
      expect(p.zh.length, p.path).toBeGreaterThan(2);
      expect(p.en.length, p.path).toBeGreaterThan(2);
    }
    /* nothing to make a style of */
    for (const v of [null, 3, "ios", [], undefined]) expect(validateCustomStyle(v).style).toBeNull();
  });

  it("keeps a document's styles one to a key, and only what is a style", () => {
    const a = copyOfStyle(styleOf("ios")!);
    const list = cleanStyles([a, { ...a, name: "again" }, 42, null, { key: "custom:b", extends: "wechat" }]);
    expect(list!.map((s) => s.key)).toEqual([a.key, "custom:b"]);
    expect(cleanStyles([])).toBeUndefined();
    expect(cleanStyles("x")).toBeUndefined();
    expect(withStyle(list, { ...a, art: "changed" }).map((s) => s.art)).toEqual(["changed", list![1].art]);
    expect(withStyle(undefined, a)).toEqual([a]);
  });

  it("makes a copy under a key of its own, named as one", () => {
    const one = copyOfStyle(styleOf("ios")!);
    const two = copyOfStyle(one, [one.key]);
    expect(one.key).toMatch(/^custom:ios-[a-z0-9]{4}$/);
    expect(two.key).not.toBe(one.key);
    expect(one.name.zh).toBe("iOS 副本");
    expect(one.name.en).toBe("iOS copy");
    expect(two.rules).toEqual(one.rules);
  });
});

describe("the CSS a custom style may write", () => {
  const ok = (selector: string) => expect(checkSelector(selector), selector).toBeNull();
  const no = (selector: string) => expect(checkSelector(selector), selector).not.toBeNull();
  const okValue = (prop: string, value: string) => expect(checkValue(prop, value), `${prop}: ${value}`).toBeNull();
  const noValue = (prop: string, value: string) => expect(checkValue(prop, value), `${prop}: ${value}`).not.toBeNull();

  it("selects parts by name and state", () => {
    ok("[data-slot=card]");
    ok('[data-slot$="-chevron"]');
    ok("[data-surface=panel] [data-slot=icon]");
    ok("[data-slot=navigation-bar] > [data-slot=nav-item][data-active]");
    ok("[data-slot=settings-row]+[data-slot=settings-row]::before");
    ok("[data-button]:is([data-variant=tonal],[data-variant=secondary]):hover");
    ok("[data-button]:where(:not([data-size^=icon],[data-variant=text]))");
    ok("[data-slot=item]:has([data-slot=icon])");
    ok("[data-slot=switch][aria-checked=true]");
    ok("[data-slot=tabs-trigger]:focus-visible");
    ok("[data-slot=input]::placeholder");
    ok("[data-slot=app-bar] *");
    ok("&");
  });

  it("never by class, id, element, structure or anything outside the parts", () => {
    for (const s of [
      ".rounded",
      "#app",
      "div",
      "html",
      "body [data-slot=card]",
      ":root",
      "*",
      "[data-a] > *",
      ":hover",
      ":not([data-slot=card])",
      "[data-slot=item]:first-child",
      "[data-slot=item]:nth-child(2n)",
      "[data-slot=item]:last-of-type",
      "[class~=bg-primary]",
      "[style*=color]",
      "[href^=http]",
      "[data-x=\"a\\\"]\"]",
      "[data-slot=card]::selection",
      "[data-slot=card]::-webkit-scrollbar",
      "[data-slot=card]::before [data-slot=icon]",
      "[data-slot=card]::after:hover",
      "& [data-slot=card]",
      "[data-slot=card],",
      ",[data-slot=card]",
      "[data-slot=card]}body{display:none",
      "[data-slot=card]{}",
      "[data-slot=card];",
      "@media print",
      "[data-slot=card]\\]",
      "[data-slot=card] /* x */",
      ":is([data-a]",
      ":is(:is(:is(:is(:is(:is([data-a]))))))",
      "[data-slot=card] < [data-a]",
      "[data-slot=card]:hover(1)",
      "[data-slot=card]:is",
      "[data-sl\u0000ot=card]",
      `[data-slot=${"x".repeat(5000)}]`,
      "",
    ])
      no(s);
  });

  it("paints, edges, spaces and sets type, with the functions that draw", () => {
    okValue("background", "linear-gradient(180deg,rgb(255 255 255/.38) 0%,var(--md-sys-color-primary) 100%)");
    okValue("box-shadow", "0 0 0 2px var(--st-rim-dark),inset 0 2px 0 rgb(255 255 255/.8)");
    okValue("color", "color-mix(in srgb,var(--md-sys-color-primary) 15%,transparent)");
    okValue("clip-path", "polygon(0 8%,100% 8%,calc(100% - 18px) 54%,100% 100%,0 100%,18px 54%)");
    okValue("backdrop-filter", "blur(20px) saturate(1.8)");
    okValue("filter", "drop-shadow(0 2px 0 rgb(0 0 0/.35))");
    okValue("font-family", "var(--st-display,inherit)");
    okValue("font-family", "'Pixelify Sans',monospace");
    okValue("content", '""');
    okValue("content", '"✕"');
    okValue("display", "flex");
    okValue("position", "absolute");
    okValue("z-index", "2");
    okValue("--cz", "var(--md-sys-color-secondary)");
    okValue("transform", "translateY(-1px) rotate(2deg)");
  });

  it("never loads, breaks out, or reaches outside the part", () => {
    for (const [prop, value] of [
      ["background", "url(https://example.com/x.png)"],
      ["background", "URL(x.png)"],
      ["background-image", "url('data:image/svg+xml,<svg/>')"],
      ["background-image", "image-set('x.png' 1x)"],
      ["background-image", "-webkit-image-set(url(x) 1x)"],
      ["background-image", "cross-fade(url(a), url(b), 50%)"],
      ["background-image", "element(#x)"],
      ["background-image", "paint(worklet)"],
      ["color", "expression(alert(1))"],
      ["color", "var(--x, url(y))"],
      ["filter", "url(#f)"],
      ["border-image", "url(x) 30"],
      ["color", "red;}html{display:none"],
      ["color", "red}"],
      ["color", "red{"],
      ["color", "red !important"],
      ["color", "red/* x */"],
      ["color", "\\75 rl(x)"],
      ["color", "</style><script>alert(1)</script>"],
      ["color", "@import"],
      ["color", "javascript:alert(1)"],
      ["color", "attr(data-x)"],
      ["color", "env(safe-area-inset-top)"],
      ["color", "rgb(0 0 0"],
      ["color", "rgb(0 0 0))"],
      ["color", '"red"'],
      ["color", "red\u0007"],
      ["content", "attr(data-label)"],
      ["content", "counter(x)"],
      ["content", `"${"x".repeat(40)}"`],
      ["content", '"a" "b'],
      ["position", "fixed"],
      ["display", "list-item"],
      ["z-index", "99999"],
      ["width", "1px;height:2px"],
      ["width", ""],
      ["width", "x".repeat(3000)],
    ])
      noValue(prop, value);
  });

  it("leaves out a rule or a declaration that does not fit, saying why, and keeps the rest", () => {
    const { style, problems } = validateCustomStyle({
      key: "custom:x",
      extends: "ios",
      rules: [
        { selector: "[data-slot=card]", declarations: { "border-radius": "20px", background: "url(x.png)", behavior: "url(x.htc)", "-moz-binding": "url(x)", position: "fixed", cursor: "pointer", "pointer-events": "none" } },
        { selector: "body", declarations: { display: "none" } },
        { selector: "[data-slot=card]}*{color:red", declarations: { color: "red" } },
        { selector: "[data-slot=chip]", declarations: [["color", "var(--md-sys-color-primary)"]] },
        { selector: "[data-slot=chip]", declarations: { color: "red" } },
        "not a rule",
        { selector: "[data-slot=empty]", declarations: {} },
      ],
    });
    expect(style!.rules).toEqual([
      { selector: "[data-slot=card]", declarations: { "border-radius": "20px" } },
      { selector: "[data-slot=chip]", declarations: { color: "var(--md-sys-color-primary)" } },
      { selector: "[data-slot=chip]", declarations: { color: "red" } },
    ]);
    const said = problems.filter((p) => p.code === "rule");
    for (const path of ["rules[0].background", "rules[0].behavior", "rules[0].-moz-binding", "rules[0].position", "rules[0].cursor", "rules[0].pointer-events", "rules[1]", "rules[2]", "rules[5]", "rules[6].declarations"]) expect(said.map((p) => p.path), path).toContain(path);
    for (const p of said) expect(p.fix).toBe("dropped");
  });

  it("compiles to one line a rule, whatever it was given: nothing can end the scope it is written in", () => {
    const hostile = [
      "[data-slot=card]}body{display:none}[data-slot=card]",
      "[data-slot=card]{color:red}",
      "[data-a]\n}\n:root{",
      "[data-slot=card]::before",
    ].map((selector) => ({ selector, declarations: { color: "red;}body{display:none", content: '"}"', "--x": "1}", "background-image": "linear-gradient(red,blue)", "x}{": "1" } }));
    const pack = compileCustomStyle({ key: "custom:hostile", name: "H", rules: hostile })!;
    const css = pack.css ?? "";
    for (const line of css.split("\n")) expect(line).toMatch(/^[^{}]+\{[^{}]*\}$/);
    expect(css).not.toMatch(/url\(|body|:root|display:none/);
    /* and in the stylesheet, every rule stays inside the style's scope */
    setDocStyles([valid({ key: "custom:hostile", name: "H", rules: hostile })]);
    const sheet = styleCss(themed("custom:hostile"));
    expect((sheet.match(/\{/g) ?? []).length).toBe((sheet.match(/\}/g) ?? []).length);
  });

  it("holds the screen's backdrop to colors and gradients", () => {
    expect(valid({ key: "custom:a", screen: "#fff" }).screen).toBe("linear-gradient(#FFFFFF, #FFFFFF)");
    expect(valid({ key: "custom:a", screen: "linear-gradient(#7CC8FF, #D6F0FF)" }).screen).toBe("linear-gradient(#7CC8FF, #D6F0FF)");
    expect(valid({ key: "custom:a", screen: "radial-gradient(90% 60% at 80% 0%, rgb(15 108 189 / 0.05), transparent 70%)" }).screen).toContain("radial-gradient");
    for (const bad of ["url(x.png)", "red", "linear-gradient(red, blue), url(x)", "linear-gradient(red;}body{x:1)", "image-set('a.png' 1x)"]) expect(valid({ key: "custom:a", screen: bad }).screen, bad).toBeUndefined();
  });
});

describe("contrast", () => {
  const ios = styleOf("ios")!;

  it("is checked on every pair a screen reads words from, as the built-in packs are", () => {
    const { problems } = validateCustomStyle({ key: "custom:low", extends: "ios", light: { onPrimary: "#3388FF" } });
    const low = problems.filter((p) => p.code === "contrast");
    expect(low.map((p) => p.path)).toContain("light.onPrimary");
    expect(low.every((p) => p.fix === "kept")).toBe(true);
    expect(low[0].zh).toMatch(/对比度/);
    expect(low[0].en).toMatch(/reads at/);
  });

  it("is held lower where the style says the background is its own (loud)", () => {
    /* iOS's blue under white reads below 4.5:1, and iOS says so */
    expect(validateCustomStyle({ key: "custom:a", extends: "ios" }).problems).toEqual([]);
    const { problems } = validateCustomStyle({ key: "custom:a", extends: "ios", loud: [] });
    expect(problems.map((p) => p.path)).toContain("light.onPrimary");
    expect(ios.loud).toContain("primary");
  });

  it("asks for visible lines and for accent words that read on a panel", () => {
    const faint = validateCustomStyle({ key: "custom:a", extends: "ios", light: { outline: ios.light.surface } }).problems;
    expect(faint.map((p) => p.path)).toContain("light.outline");
    const pale = validateCustomStyle({ key: "custom:a", extends: "ios", light: { primary: "#C8E0FF" }, loud: ["primary"] }).problems;
    expect(pale.map((p) => p.path)).toContain("light.primary");
    /* words of their own color put it right */
    const fixed = validateCustomStyle({ key: "custom:a", extends: "ios", light: { primary: "#C8E0FF" }, loud: ["primary"], tokens: { toggleOn: "#34C759", primaryText: "#0050B0" } }).problems;
    expect(fixed.map((p) => p.path)).not.toContain("light.primary");
  });
});

describe("custom styles in reach", () => {
  const style = valid({ key: "custom:brand", extends: "ios", name: "Brand", light: { primary: "#C2185B" }, recipes: { tabs: "underline", list: "flush" }, group: "desktop", compact: true });

  it("are found by key only while the document's styles are in reach", () => {
    expect(styleOf("custom:brand")).toBeUndefined();
    withDocStyles([style], () => {
      expect(styleOf("custom:brand")?.light.primary).toBe("#C2185B");
      expect(customPacks().map((p) => p.key)).toEqual(["custom:brand"]);
    });
    expect(styleOf("custom:brand")).toBeUndefined();
    expect(resolveStyle("custom:brand", [style])?.name.en).toBe("Brand");
    expect(resolveStyle("ios", [style])?.key).toBe("ios");
    expect(resolveStyle("custom:other", [style])).toBeUndefined();
  });

  it("put back what was in reach after, and change nothing for the same list", () => {
    const other = valid({ key: "custom:other", extends: "wechat" });
    setDocStyles([other]);
    const list = [style];
    withDocStyles(list, () => expect(styleOf("custom:other")).toBeUndefined());
    expect(styleOf("custom:other")).toBeDefined();
    expect(() => withDocStyles(list, () => { throw new Error("x"); })).toThrow();
    expect(styleOf("custom:other")).toBeDefined();
    const at = docStylesRevision();
    setDocStyles(list);
    setDocStyles(list);
    expect(docStylesRevision()).toBe(at + 1);
  });

  it("are worn by a theme: its palette, its recipes, its spacing and how its kits are composed", () => {
    setDocStyles([style]);
    const t = normalizeTheme({ style: "custom:brand" });
    expect(t.style).toBe("custom:brand");
    expect(t.font).toBe("apple");
    expect(paletteOf("purple", null, t).primary).toBe("#C2185B");
    expect(recipesOf(t).tabs).toBe("underline");
    const look = kitLookOf(t);
    expect(look).toMatchObject({ group: "desktop", compact: true, tabs: "underline", list: "flush" });
    expect(styleCss(t)).toContain("--md-sys-color-primary:#C2185B");
    /* a theme naming a custom style that is not there wears Material */
    setDocStyles(undefined);
    expect(normalizeTheme({ style: "custom:brand" }).style).toBeUndefined();
  });

  it("hold a document to their rules, and tell a model so", () => {
    setDocStyles([style]);
    const t = normalizeTheme({ style: "custom:brand" });
    const said = rulesForModel(t);
    expect(said).toContain('"style": "custom:brand"');
    expect(said).toContain("the Brand style");
    expect(said).toContain("tabs underline");
    const g: Group = { id: "g", x: 0, y: 0, axis: "x", items: [{ ...makeItem("button"), id: "b", corners: { tl: 3, tr: 3, bl: 3, br: 3 } }] };
    const held = conformDoc({ groups: [g] }, t);
    expect(held.groups[0].items[0].corners).toBeUndefined();
  });

  it("compose the kits again when the style is edited in place, from the look it had", () => {
    setDocStyles([style]);
    const from = normalizeTheme({ style: "custom:brand" });
    const before = kitLookOf(from);
    const edited = valid({ ...style, recipes: { ...style.recipes, list: "inset" } });
    setDocStyles([edited]);
    const to = normalizeTheme(from);
    expect(kitLookOf(to).list).toBe("inset");
    /* the theme alone cannot tell: the key is the same */
    expect(kitLookOf(from)).toEqual(kitLookOf(to));
    const doc = { groups: [] as Group[] };
    expect(recomposeKits(doc, from, to, "en", { fromLook: before })).toBe(doc);
  });
});

describe("a document with styles of its own", () => {
  const style = copyOfStyle(styleOf("ios")!);
  const doc = (): Doc => ({
    groups: [{ id: "g", x: 20, y: 120, axis: "x", items: [{ ...makeItem("button"), id: "b", label: "Go" }] }],
    frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
    paletteKey: "purple",
    frame: "phone",
    title: "Styled",
    brief: "",
    theme: normalizeTheme({ ...DEFAULT_THEME }),
    styles: [{ ...style, light: { ...style.light, primary: "#C2185B" } }],
  });
  const wearing = (d: Doc): Doc => ({ ...d, theme: withDocStyles(d.styles, () => normalizeTheme({ style: style.key })) });

  it("opens with them validated, and with what is unsafe left out", () => {
    const hostile = { ...doc(), styles: [{ ...style, rules: [...style.rules, { selector: "body", declarations: { display: "none" } }, { selector: "[data-slot=card]", declarations: { background: "url(https://example.com/t.png)", color: "red" } }] }, { nope: true }, 7] };
    const opened = openProject(projectFile(hostile as unknown as Doc))!;
    expect(opened.styles).toHaveLength(1);
    const rules = opened.styles![0].rules;
    expect(rules.some((r) => r.selector === "body")).toBe(false);
    expect(rules.at(-1)).toEqual({ selector: "[data-slot=card]", declarations: { color: "red" } });
    expect(JSON.stringify(opened.styles)).not.toContain("url(");
    /* one with none, or styles that are not a list, opens as it always did */
    const { styles: _gone, ...plain } = doc();
    expect(openProject(projectFile(plain))!.styles).toBeUndefined();
    expect(openProject(projectFile({ ...plain, styles: "x" } as unknown as Doc))!.styles).toBeUndefined();
  });

  it("saves and opens again the same", () => {
    const d = wearing(doc());
    const back = openProject(JSON.parse(JSON.stringify(projectFile(d))))!;
    expect(back.styles).toEqual(d.styles);
    expect(back.theme?.style).toBe(style.key);
    expect(withDocStyles(back.styles, () => normalizeTheme(back.theme).style)).toBe(style.key);
  });

  it("travels in a link with its styles", async () => {
    const d = wearing(doc());
    const link = await shareLink(d, "https://example.test/");
    const back = (await readShareHash(new URL(link).hash))!;
    expect(back.styles).toEqual(d.styles);
    expect(back.theme?.style).toBe(style.key);
  });

  it("exports an app that wears them: style.css carries the colors and the rules", async () => {
    const { buildProject } = await import("../exportProject");
    const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
    const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
    const d = wearing(doc());
    /* whatever else is in reach while it is built */
    setDocStyles(undefined);
    const { files } = await buildProject(d, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    const css = files["src/style.css"] as string;
    expect(css).toContain(":root:root{");
    expect(css).toContain("--md-sys-color-primary:#C2185B");
    expect(css).toContain(rulesCss(style.rules).split("\n")[0]);
    expect(files["src/index.css"] as string).toContain('@import "./style.css"');
    expect(files["src/theme.tsx"] as string).toContain('setIconFamily("sf")');
    expect(styleOf(style.key)).toBeUndefined();
  });

  it("is read in its own styles by the code view and the prompt", async () => {
    const { buildCode } = await import("../codegen");
    const { buildPrompt } = await import("../prompt");
    const d = wearing(doc());
    expect(buildPrompt(d, {}, undefined, "en")).toContain(styleOf("ios")!.layout.en);
    expect(buildCode(d, {}).code.length).toBeGreaterThan(0);
  });
});

describe("a style made by a model", () => {
  it("comes into a document through the same door, and what it may not say is left out", () => {
    const drafted = {
      groups: [],
      frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
      paletteKey: "purple",
      frame: "phone",
      title: "",
      brief: "",
      theme: { style: "custom:sunset" },
      styles: [{ key: "custom:sunset", name: { en: "Sunset", zh: "日落" }, extends: "spotify", light: { primary: "#E8590C" }, dark: { primary: "#FF8A3D" }, recipes: { button: "glow", tabs: "pill" }, rules: [{ selector: "[data-slot=card]", declarations: { "border-radius": "28px", "background-image": "url(//x)" } }] }],
    };
    const opened = openProject(drafted)!;
    const sunset = opened.styles![0];
    expect(sunset.name).toEqual({ zh: "日落", en: "Sunset", ja: "Sunset", ko: "Sunset" });
    expect(sunset.rules).toEqual([{ selector: "[data-slot=card]", declarations: { "border-radius": "28px" } }]);
    const t = withDocStyles(opened.styles, () => normalizeTheme(opened.theme));
    expect(t).toMatchObject({ style: "custom:sunset", font: styleOf("spotify")!.font });
    expect(withDocStyles(opened.styles, () => stylePalette({ ...t, dark: false })?.primary)).toBe("#E8590C");
    expect(withDocStyles(opened.styles, () => stylePalette({ ...t, dark: true })?.primary)).toBe("#FF8A3D");
  });

  it("is shown one in the guide that comes through validation without a word to say", async () => {
    const guide = await readFile(new URL("../../public/agent.md", import.meta.url), "utf8");
    const block = guide
      .split("```jsonc")
      .map((b) => b.split("```")[0])
      .find((b) => b.includes('"custom:brand"'));
    expect(block).toBeDefined();
    const doc = JSON.parse(`{${block!.trim().replace(/,\s*$/, "")}}`) as { styles: unknown[]; theme: { style: string } };
    for (const s of doc.styles) expect(validateCustomStyle(s).problems).toEqual([]);
    const opened = openProject({ groups: [], frames: [], paletteKey: "purple", frame: "phone", title: "", brief: "", ...doc })!;
    expect(withDocStyles(opened.styles, () => normalizeTheme(opened.theme).style)).toBe("custom:brand");
  });
});
