import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { COLOR_ROLES as SCHEME_ROLES } from "./m3e/color";
import {
  COLOR_ROLES,
  LOOK_PRESETS,
  STRICT_LOOK_KEYS,
  TEXTURE_KINDS,
  cleanLook,
  colorCss,
  colorsOfLook,
  elevationCss,
  elevationShadow,
  formatColor,
  isColorRef,
  legacyGradient,
  legacyShadows,
  lookForModel,
  lookGradientTextStyle,
  lookStyle,
  lookTextNodeStyle,
  paintCss,
  parseColor,
  shadowCss,
  strictLook,
  strokeCss,
  textureLayers,
  withAlpha,
  withPreset,
} from "./look";
import { openProject, projectFile } from "./project";
import { conformItem, rulesForModel } from "./styleRules";
import { buildCode } from "./codegen";
import { buildProject } from "./exportProject";
import { draftDesign } from "./ai";
import { setGlobalLang } from "./i18n";
import { buildPrompt } from "./prompt";
import { makeItem, normalizeTheme, type Doc, type Item, type ItemLook, type TextToken, type ColorToken } from "./tokens";
import { applyAppearance } from "../parts/appearance";
import { h, type PNode } from "../parts/node";

beforeAll(() => setGlobalLang("en"));

/* ---------- colors ---------- */

describe("a color reference", () => {
  it("is an M3 role, a role at a share of itself, or a hex", () => {
    expect(colorCss("primary")).toBe("var(--md-sys-color-primary)");
    expect(colorCss("surface-container-high")).toBe("var(--md-sys-color-surface-container-high)");
    expect(colorCss("on-surface/40")).toBe("color-mix(in srgb, var(--md-sys-color-on-surface) 40%, transparent)");
    expect(colorCss("primary/100")).toBe("var(--md-sys-color-primary)");
    expect(colorCss("#ABC")).toBe("#aabbcc");
    expect(colorCss("#abcd")).toBe("#aabbccdd");
    expect(colorCss("#FF5F6D")).toBe("#ff5f6d");
    expect(colorCss("#ff5f6d80")).toBe("#ff5f6d80");
    expect(colorCss("#0000")).toBe("#00000000");
  });

  it.each([
    "red",
    "transparent",
    "url(javascript:alert(1))",
    "url(https://x.test/a.png)",
    "var(--md-sys-color-primary)",
    "expression(alert(1))",
    "#12",
    "#12345",
    "#ggg",
    "#fff;background:url(x)",
    "primary;color:red",
    "primary/101",
    "primary/-1",
    "primary/ 40",
    "Primary",
    "primaryContainer",
    "not-a-role",
    "primary-containerx",
    " primary",
    "",
    "a".repeat(50),
  ])("refuses %j", (v) => {
    expect(isColorRef(v)).toBe(false);
    expect(colorCss(v)).toBeUndefined();
  });

  it.each([null, undefined, 3, {}, [], true])("refuses what is not a string: %j", (v) => {
    expect(colorCss(v)).toBeUndefined();
  });

  it("names only roles every scheme defines", () => {
    for (const r of COLOR_ROLES) expect(SCHEME_ROLES, r).toContain(r);
  });

  it("reads back and writes the shortest way, with a share", () => {
    expect(parseColor("#ff000080")).toEqual({ hex: "#ff0000", alpha: (128 / 255) * 100 });
    expect(parseColor("primary/30")).toEqual({ role: "primary", alpha: 30 });
    expect(formatColor({ hex: "#ff0000", alpha: 100 })).toBe("#ff0000");
    expect(formatColor({ hex: "#ff0000", alpha: 50 })).toBe("#ff000080");
    expect(withAlpha("primary", 25)).toBe("primary/25");
    expect(withAlpha("primary/25", 100)).toBe("primary");
    expect(withAlpha("#ffffff", 0)).toBe("#ffffff00");
  });
});

/* ---------- each effect as CSS ---------- */

describe("each effect as CSS", () => {
  it("paints solid, linear, radial and conic layers, top first, with sorted stops", () => {
    expect(paintCss({ type: "solid", color: "primary" })).toBe("linear-gradient(var(--md-sys-color-primary), var(--md-sys-color-primary))");
    expect(paintCss({ type: "linear", angle: 135, stops: [{ color: "#fff", at: 100 }, { color: "primary", at: 0 }, { color: "#ff000080", at: 40 }] })).toBe(
      "linear-gradient(135deg, var(--md-sys-color-primary) 0%, #ff000080 40%, #ffffff 100%)",
    );
    expect(paintCss({ type: "radial", x: 30, y: 20, circle: true, stops: [{ color: "#000", at: 0 }, { color: "#0000", at: 100 }] })).toBe("radial-gradient(circle at 30% 20%, #000000 0%, #00000000 100%)");
    expect(paintCss({ type: "conic", angle: 45, stops: [{ color: "#000", at: 0 }, { color: "#fff", at: 100 }] })).toBe("conic-gradient(from 45deg at 50% 50%, #000000 0%, #ffffff 100%)");
    expect(lookStyle({ fills: [{ type: "solid", color: "#f00" }, { type: "linear", angle: 90, stops: [{ color: "#000", at: 0 }, { color: "#fff", at: 100 }] }] }).backgroundImage).toBe(
      "linear-gradient(#ff0000, #ff0000), linear-gradient(90deg, #000000 0%, #ffffff 100%)",
    );
  });

  it("leaves out a hidden layer, and a gradient with fewer than two good stops", () => {
    expect(paintCss({ type: "solid", color: "primary", hidden: true })).toBeUndefined();
    expect(paintCss({ type: "linear", stops: [{ color: "primary", at: 0 }, { color: "url(x)", at: 100 }] })).toBeUndefined();
    expect(lookStyle({ fills: [{ type: "solid", color: "primary", hidden: true }] }).backgroundImage).toBeUndefined();
  });

  it("draws a solid stroke as a ring of shadow inside, outside or across the edge", () => {
    expect(strokeCss({ width: 2, color: "primary" }).shadows).toEqual(["inset 0 0 0 2px var(--md-sys-color-primary)"]);
    expect(strokeCss({ width: 2, color: "primary", position: "outside" }).shadows).toEqual(["0 0 0 2px var(--md-sys-color-primary)"]);
    expect(strokeCss({ width: 4, color: "#000", position: "center" }).shadows).toEqual(["0 0 0 2px #000000", "inset 0 0 0 2px #000000"]);
  });

  it("draws each side on its own", () => {
    expect(strokeCss({ width: 1, color: "#000", sides: { t: 0, r: 0, b: 3, l: 1 } }).shadows).toEqual(["inset 0px -3px 0 0 #000000", "inset 1px 0px 0 0 #000000"]);
    expect(strokeCss({ width: 1, color: "#000", position: "outside", sides: { t: 2, r: 0, b: 0, l: 0 } }).shadows).toEqual(["0px -2px 0 0 #000000"]);
  });

  it("draws a dashed or dotted stroke as an outline, pulled in as far as it sits inside", () => {
    expect(strokeCss({ width: 2, color: "primary", style: "dashed" })).toEqual({ shadows: [], outline: "2px dashed var(--md-sys-color-primary)", outlineOffset: "-2px" });
    expect(strokeCss({ width: 2, color: "primary", style: "dotted", position: "center" }).outlineOffset).toBe("-1px");
    expect(strokeCss({ width: 2, color: "primary", style: "dotted", position: "outside" }).outlineOffset).toBe("0px");
  });

  it("lists shadows with the stroke on top, an inside shadow among them", () => {
    const style = lookStyle({ stroke: { width: 1, color: "#000" }, shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: "#00000040" }, { x: 0, y: 1, blur: 0, spread: 0, color: "#ffffff80", inset: true }] });
    expect(style.boxShadow).toBe("inset 0 0 0 1px #000000, 0px 4px 8px 0px #00000040, inset 0px 1px 0px 0px #ffffff80");
    expect(shadowCss({ x: 1, y: 2, blur: 3, spread: 4, color: "primary" }, true)).toBe("1px 2px 3px var(--md-sys-color-primary)");
  });

  it("says no shadow for an emptied list, and the style's own for none", () => {
    expect(lookStyle({ shadows: [] }).boxShadow).toBe("none");
    expect(lookStyle({}).boxShadow).toBeUndefined();
    expect(lookStyle({ shadows: [{ x: 0, y: 0, blur: 0, spread: 0, color: "#000", hidden: true }] }).boxShadow).toBe("none");
  });

  it("blurs the part, frosts what is behind it, and blends it", () => {
    const style = lookStyle({ blur: 4, glass: 20, glassSaturate: 180, blend: "multiply" });
    expect(style).toMatchObject({ filter: "blur(4px)", backdropFilter: "blur(20px) saturate(1.8)", WebkitBackdropFilter: "blur(20px) saturate(1.8)", mixBlendMode: "multiply" });
    expect(lookStyle({ blend: "normal" }).mixBlendMode).toBeUndefined();
  });

  it("filters, leaving out what changes nothing", () => {
    expect(lookStyle({ filter: { brightness: 120, contrast: 100, saturate: 0, hueRotate: 90, grayscale: 50, sepia: 0, invert: 100 } }).filter).toBe("brightness(120%) saturate(0%) hue-rotate(90deg) grayscale(50%) invert(100%)");
  });

  it("scales, flips and slants without taking room", () => {
    expect(lookStyle({ transform: { scaleX: 150, flipY: true } })).toMatchObject({ scale: "1.5 -1" });
    expect(lookStyle({ transform: { flipX: true } }).scale).toBe("-1 1");
    expect(lookStyle({ transform: { skewX: -10 } }).transform).toBe("skew(-10deg, 0deg)");
    expect(lookStyle({ transform: { scaleX: 100, scaleY: 100 } }).scale).toBeUndefined();
  });

  it("cuts off what overflows and takes the part's own fill away", () => {
    expect(lookStyle({ clip: true, clearFill: true })).toMatchObject({ overflow: "hidden", backgroundColor: "transparent" });
  });

  it("sets the words: color into the roles they read, size and weight, case, shadows and an outline outside the letters", () => {
    const look: ItemLook = { text: { color: "#ffffff", size: 20, weight: 800, letterSpacing: 1, lineHeight: 120, case: "upper", italic: true, decoration: "underline", shadows: [{ x: 0, y: 2, blur: 0, spread: 0, color: "#000" }], stroke: { width: 2, color: "#3a1c00" } } };
    expect(lookStyle(look)).toMatchObject({
      color: "#ffffff",
      "--md-sys-color-on-surface": "#ffffff",
      "--md-sys-color-on-surface-variant": "#ffffff",
      fontSize: "20px",
      fontWeight: 800,
      letterSpacing: "1px",
      lineHeight: 1.2,
      textTransform: "uppercase",
      fontStyle: "italic",
      textDecorationLine: "underline",
      textShadow: "0px 2px 0px #000000",
      WebkitTextStroke: "4px #3a1c00",
      paintOrder: "stroke fill",
    });
    expect(lookTextNodeStyle(look)).toEqual({ color: "#ffffff", fontSize: "20px", fontWeight: 800, letterSpacing: "1px", lineHeight: 1.2, textTransform: "uppercase", fontStyle: "italic" });
  });

  it("never defines a role by itself", () => {
    const style = lookStyle({ text: { color: "on-surface/60" } });
    expect(style).not.toHaveProperty("--md-sys-color-on-surface");
    expect(style["--md-sys-color-on-surface-variant"]).toBe("color-mix(in srgb, var(--md-sys-color-on-surface) 60%, transparent)");
  });

  it("clips a gradient to the letters, with shadows and an outline as drop shadows under them", () => {
    const look: ItemLook = { text: { gradient: { type: "linear", angle: 180, stops: [{ color: "#fff", at: 0 }, { color: "#f90", at: 100 }] }, stroke: { width: 2, color: "#000" }, shadows: [{ x: 0, y: 4, blur: 6, spread: 0, color: "#00000066" }] } };
    const span = lookGradientTextStyle(look)!;
    expect(span).toMatchObject({ backgroundImage: "linear-gradient(180deg, #ffffff 0%, #ff9900 100%)", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", textShadow: "none" });
    expect(span.filter).toBe("drop-shadow(2px 0px 0 #000000) drop-shadow(-2px 0px 0 #000000) drop-shadow(0px 2px 0 #000000) drop-shadow(0px -2px 0 #000000) drop-shadow(0px 4px 3px #00000066)");
    /* the box keeps its surface: nothing of the gradient is on it */
    const box = lookStyle(look);
    expect(box.backgroundImage).toBeUndefined();
    expect(box.textShadow).toBeUndefined();
    expect(box.WebkitTextStroke).toBeUndefined();
  });

  it.each(TEXTURE_KINDS)("draws the %s texture as tiled layers over the paint", (kind) => {
    const layers = textureLayers({ kind, opacity: 30 });
    expect(layers.length).toBeGreaterThan(0);
    const style = lookStyle({ texture: { kind }, fills: [{ type: "solid", color: "primary" }] });
    const images = String(style.backgroundImage);
    expect(images.endsWith("linear-gradient(var(--md-sys-color-primary), var(--md-sys-color-primary))")).toBe(true);
    /* one size, place and repeat for every layer */
    const count = layers.length + 1;
    for (const k of ["backgroundSize", "backgroundPosition", "backgroundRepeat"]) expect(String(style[k]).split(", ").length, `${kind} ${k}`).toBe(count);
  });

  it("makes its grain from fixed words, with the author's ink as hex only", () => {
    const [noise] = textureLayers({ kind: "noise", color: "#336699", opacity: 50 });
    expect(noise.image.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(noise.image.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg).toContain("feTurbulence");
    expect(svg).toContain("url(#g)");
    expect(svg).toContain("0.2 0 0 0 0 0.4 0 0 0 0 0.6");
    expect(svg).not.toMatch(/script|on\w+=|href/i);
    /* a role cannot reach inside the picture, so the grain stays dark */
    expect(decodeURIComponent(textureLayers({ kind: "noise", color: "primary" })[0].image)).toContain("0 0 0 0 0 0 0 0 0 0 0 0 0 0 0");
    expect(textureLayers({ kind: "dots", opacity: 0 })).toEqual([]);
  });

  it("raises a part to a level in the style's own shadow, Material's until a style says otherwise", () => {
    expect(lookStyle({ elevation: 2 }).boxShadow).toBe("var(--look-elev-2, 0 1px 2px 0 rgb(0 0 0 / 0.3), 0 2px 6px 2px rgb(0 0 0 / 0.15))");
    expect(lookStyle({ elevation: 0 }).boxShadow).toBe("var(--look-elev-0, none)");
    expect(lookStyle({ elevation: 1, shadows: [{ x: 0, y: 1, blur: 0, spread: 0, color: "#000" }] }).boxShadow).toBe("0px 1px 0px 0px #000000, var(--look-elev-1, 0 1px 2px 0 rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15))");
  });

  it("reads a style's surface recipe through a lookup that falls back to Material", () => {
    expect(elevationShadow("m3", 3)).toBe(elevationShadow(undefined, 3));
    expect(elevationShadow("a-recipe-added-later", 2)).toBe(elevationShadow(undefined, 2));
    expect(elevationShadow("hard", 2)).toBe("4px 4px 0 var(--st-line)");
    /* a flat level keeps the style's edge and drops its lift */
    expect(elevationShadow("chunk", 0)).toBe("0 0 0 2px var(--st-rim-dark), inset 0 2px 0 rgb(255 255 255 / 0.7)");
    expect(elevationShadow("chunk", 3)).toContain("0 8px 0 2px");
    expect(elevationShadow("soft", 0)).toBe("none");
    expect(elevationCss("m3", { scope: ".s" })).toBe("");
    expect(elevationCss("a-recipe-added-later", { scope: ".s" })).toBe("");
    const css = elevationCss("glass", { scope: ".s" });
    expect(css.startsWith(".s{--look-elev-0:")).toBe(true);
    for (const n of [0, 1, 2, 3, 4]) expect(css).toContain(`--look-elev-${n}:`);
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
  });
});

/* ---------- the first look, unchanged ---------- */

/** the first look's drawing, kept here as it was written before the effects came, to hold the new one to it */
function firstLookStyle(l: ItemLook): Record<string, string | number> {
  const TEXT_ROLE: Record<TextToken, string> = { onSurface: "on-surface", onSurfaceVariant: "on-surface-variant", primary: "primary", secondary: "secondary", onPrimaryContainer: "on-primary-container", onSecondaryContainer: "on-secondary-container", onTertiaryContainer: "on-tertiary-container", inverseOnSurface: "inverse-on-surface" };
  const FILL_ROLE: Record<ColorToken, string> = { surface: "surface", surfaceContainerLow: "surface-container-low", surfaceContainer: "surface-container", surfaceContainerHigh: "surface-container-high", surfaceContainerHighest: "surface-container-highest", primaryContainer: "primary-container", secondaryContainer: "secondary-container", tertiaryContainer: "tertiary-container", primary: "primary", inverseSurface: "inverse-surface" };
  const roleVar = (name: string) => `var(--md-sys-color-${name})`;
  const SHADOW_OF = { none: "none", soft: "0 2px 12px rgb(0 0 0 / 0.14)", deep: "0 10px 30px rgb(0 0 0 / 0.32)", hard: `4px 4px 0 ${roleVar("outline")}`, glow: `0 0 16px color-mix(in srgb, ${roleVar("primary")} 70%, transparent)` };
  const FONT_OF = { display: "var(--st-display, inherit)", mono: 'ui-monospace, "Cascadia Code", Consolas, monospace' };
  const out: Record<string, string | number> = {};
  if (l.borderWidth) out.border = `${l.borderWidth}px solid ${roleVar(TEXT_ROLE[l.borderColor ?? "onSurfaceVariant"])}`;
  if (l.shadow) out.boxShadow = SHADOW_OF[l.shadow];
  if (l.opacity !== undefined && l.opacity < 100) out.opacity = l.opacity / 100;
  if (l.glass) {
    out.backdropFilter = `blur(${l.glass}px) saturate(1.5)`;
    out.WebkitBackdropFilter = `blur(${l.glass}px) saturate(1.5)`;
  }
  if (l.rotate) out.rotate = `${l.rotate}deg`;
  if (l.gradientTo) out.backgroundImage = `linear-gradient(${l.gradientAngle ?? 180}deg, transparent, ${roleVar(FILL_ROLE[l.gradientTo])})`;
  if (l.font) out.fontFamily = FONT_OF[l.font];
  return out;
}

describe("the first look's fields", () => {
  const borders: (TextToken | undefined)[] = [undefined, "primary", "inverseOnSurface", "onSecondaryContainer"];
  const shadows: ItemLook["shadow"][] = [undefined, "none", "soft", "deep", "hard", "glow"];
  const fills: (ColorToken | undefined)[] = [undefined, "primary", "surfaceContainerHigh", "tertiaryContainer"];
  const cases: ItemLook[] = [];
  for (const borderColor of borders)
    for (const shadow of shadows)
      for (const gradientTo of fills)
        cases.push({ borderWidth: 2, borderColor, shadow, gradientTo, gradientAngle: gradientTo ? 45 : undefined, opacity: 60, glass: 12, rotate: -8, font: cases.length % 2 ? "mono" : "display" });
  cases.push({ opacity: 100, borderWidth: 0, glass: 0, rotate: 0 }, { shadow: "soft" }, { gradientTo: "primary" }, { font: "mono" }, { borderWidth: 3 });

  it("are drawn exactly as they were", () => {
    for (const l of cases) expect(lookStyle(l), JSON.stringify(l)).toEqual(firstLookStyle(l));
  });

  it("paint an old document's part exactly as before", () => {
    const tree = () => h("Card", { variant: "filled", className: "bg-surface-container-highest", style: { width: 280 } }, h("CardTitle", null, "Title"), h("CardDescription", null, "Words"));
    for (const l of cases.slice(0, 20)) {
      const out = applyAppearance(tree(), { fill: "primaryContainer", corners: { tl: 4, tr: 4, bl: 4, br: 4 }, look: l });
      expect(out.props?.style).toEqual({ width: 280, "--md-sys-color-on-surface": "var(--md-sys-color-on-primary-container)", "--md-sys-color-on-surface-variant": "var(--md-sys-color-on-primary-container)", borderRadius: "4px 4px 4px 4px", ...firstLookStyle(l) });
      /* the words are left alone */
      expect(out.children).toEqual(tree().children);
    }
  });

  it("are shown in the panel as the effects they amount to", () => {
    expect(legacyShadows("soft")).toEqual([{ x: 0, y: 2, blur: 12, spread: 0, color: "#00000024" }]);
    expect(legacyShadows("none")).toEqual([]);
    expect(legacyShadows(undefined)).toBeUndefined();
    expect(legacyGradient({ gradientTo: "primaryContainer", gradientAngle: 90 })).toEqual({ type: "linear", angle: 90, stops: [{ color: "#0000", at: 0 }, { color: "primary-container", at: 100 }] });
    expect(paintCss(legacyGradient({ gradientTo: "primary" }))).toBe("linear-gradient(180deg, #00000000 0%, var(--md-sys-color-primary) 100%)");
  });

  it("give way to the effects where both speak", () => {
    expect(lookStyle({ shadow: "deep", shadows: [] }).boxShadow).toBe("none");
    expect(lookStyle({ gradientTo: "primary", fills: [{ type: "solid", color: "#000" }] }).backgroundImage).toBe("linear-gradient(#000000, #000000)");
    expect(lookStyle({ shadow: "soft", stroke: { width: 1, color: "#000" } }).boxShadow).toBe("inset 0 0 0 1px #000000, 0 2px 12px rgb(0 0 0 / 0.14)");
  });
});

/* ---------- painting a tree ---------- */

describe("painting the effects onto a part", () => {
  it("puts the size and weight of the words on every node that holds words, and a gradient on a span of each run", () => {
    const tree = h("Card", { className: "bg-surface", style: { width: 200 } }, h("CardTitle", { className: "text-title-large" }, "Title"), h("div", null, h("Icon", { name: "star" }), h("span", { className: "text-body-small" }, "Small")));
    const out = applyAppearance(tree, { look: { text: { size: 18, weight: 700, gradient: { type: "linear", stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] } } } });
    /* the surface keeps its own fill */
    expect(out.props?.className).toBe("bg-surface");
    expect(out.props?.style).not.toHaveProperty("backgroundImage");
    const title = out.children![0] as PNode;
    expect(title.props?.style).toEqual({ fontSize: "18px", fontWeight: 700 });
    const run = title.children![0] as PNode;
    expect(run.type).toBe("span");
    expect(run.props?.["data-look-text"]).toBe(true);
    expect(run.children).toEqual(["Title"]);
    expect((run.props!.style as Record<string, string>).backgroundClip).toBe("text");
    const small = ((out.children![1] as PNode).children![1] as PNode);
    expect(small.props?.style).toEqual({ fontSize: "18px", fontWeight: 700 });
    expect((small.children![0] as PNode).type).toBe("span");
    /* painting twice wraps nothing twice */
    const again = applyAppearance(out, { look: { text: { gradient: { type: "linear", stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] } } } });
    expect(((again.children![0] as PNode).children![0] as PNode).children).toEqual(["Title"]);
  });

  it("paints every target of a part with several surfaces", () => {
    const tree = h("Carousel", null, h("CarouselItem", null, h("div", { className: "bg-primary-container" }, "1")), h("CarouselItem", null, h("div", { className: "bg-secondary-container" }, "2")));
    const out = applyAppearance(tree, { look: { shadows: [{ x: 0, y: 2, blur: 4, spread: 0, color: "#000" }], text: { gradient: { type: "linear", stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] } } } }, "div");
    for (const c of out.children ?? []) {
      const slide = (c as PNode).children![0] as PNode;
      expect((slide.props!.style as Record<string, string>).boxShadow).toBe("0px 2px 4px 0px #000000");
      expect((slide.children![0] as PNode).type).toBe("span");
    }
  });

  it("lays its paint over a picture the part paints itself", () => {
    const tree = h("div", { style: { backgroundImage: "url(a.png)", backgroundSize: "cover" } });
    const out = applyAppearance(tree, { look: { fills: [{ type: "solid", color: "#0000" }], texture: { kind: "dots" } } });
    const style = out.props?.style as Record<string, string>;
    expect(style.backgroundImage.endsWith(", url(a.png)")).toBe(true);
    expect(style.backgroundSize.endsWith(", cover")).toBe(true);
    expect(style.backgroundImage.split("gradient(").length - 1).toBe(2);
  });

  it("leaves a button's state layer to it: its classes stay, and a look sets no pseudo-element", () => {
    const tree = h("Button", { className: "group/button state-layer bg-primary text-on-primary hover:shadow-elevation-1" }, "Go");
    const out = applyAppearance(tree, { fill: "tertiaryContainer", look: { shadows: [{ x: 0, y: 4, blur: 0, spread: 0, color: "#000" }], fills: [{ type: "linear", stops: [{ color: "#fff6", at: 0 }, { color: "#fff0", at: 100 }] }] } });
    expect(String(out.props?.className)).toContain("state-layer");
    expect(String(out.props?.className)).toContain("hover:shadow-elevation-1");
    const style = out.props?.style as Record<string, string>;
    expect(style).not.toHaveProperty("background");
    expect(style).not.toHaveProperty("position");
  });
});

/* ---------- what a document keeps ---------- */

const FULL: ItemLook = {
  borderWidth: 1,
  borderColor: "primary",
  shadow: "soft",
  opacity: 80,
  glass: 10,
  glassSaturate: 160,
  rotate: 5,
  gradientTo: "primary",
  gradientAngle: 90,
  font: "display",
  clearFill: true,
  fills: [{ type: "linear", angle: 45, stops: [{ color: "primary", at: 0 }, { color: "#ff000080", at: 100 }] }, { type: "solid", color: "surface/50", hidden: true }],
  stroke: { width: 2, color: "outline", style: "dashed", position: "center" },
  shadows: [{ x: 0, y: 4, blur: 8, spread: -2, color: "#00000033", inset: true }],
  elevation: 3,
  blur: 2,
  blend: "screen",
  filter: { brightness: 110, hueRotate: -30 },
  transform: { scaleX: 120, skewY: 4, flipX: true },
  text: { color: "on-primary", size: 22, weight: 700, letterSpacing: -1, lineHeight: 130, case: "title", italic: true, decoration: "line-through", shadows: [{ x: 0, y: 1, blur: 0, spread: 0, color: "#000" }], stroke: { width: 1, color: "#000" }, gradient: { type: "conic", angle: 10, x: 40, y: 60, stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] } },
  texture: { kind: "carbon", color: "#112233", opacity: 40, size: 12, blend: "overlay" },
  clip: true,
};

const docWith = (look: unknown, extra: Partial<Item> = {}): Doc =>
  ({
    title: "T",
    brief: "",
    paletteKey: "purple",
    frame: "phone",
    frames: [{ id: "f", name: "Home", x: 0, y: 0 }],
    groups: [{ id: "g", x: 16, y: 100, axis: "x", items: [{ ...makeItem("card"), id: "i", props: { title: "Card", imagePos: "none" }, look, ...extra }] }],
  }) as Doc;

describe("a look in a document", () => {
  it("keeps every field through a save and an open, and a share link's JSON", () => {
    expect(cleanLook(FULL)).toEqual(FULL);
    const back = openProject(JSON.parse(JSON.stringify(projectFile(docWith(FULL)))));
    expect(back?.groups[0].items[0].look).toEqual(FULL);
  });

  it("drops what is malformed and brings numbers back inside their limits, and still opens", () => {
    const opened = openProject(
      projectFile(
        docWith({
          opacity: 400,
          glass: -3,
          rotate: "9",
          shadow: "huge",
          gradientTo: "url(x)",
          borderColor: "pink",
          fills: [{ type: "solid", color: "url(javascript:alert(1))" }, { type: "pattern", color: "#fff" }, { type: "linear", stops: [{ color: "#fff", at: -20 }, { color: "#000", at: 300 }], angle: 9999 }, "nope"],
          stroke: { width: 200, color: "#000", style: "wavy", position: "inner" },
          shadows: [{ x: 1e9, y: 0, blur: -5, spread: 0, color: "#000" }, { x: 0, y: 0, blur: 0, spread: 0, color: "black" }],
          elevation: 9,
          blend: "url(x)",
          filter: { brightness: Infinity, sepia: 50, evil: 1 },
          transform: { scaleX: 0, skewX: "3deg" },
          text: { color: "expression(1)", size: 1000, weight: 333, case: "shout", gradient: { type: "solid", color: "#fff" } },
          texture: { kind: "url(x)" },
          clip: "yes",
          unknown: "url(x)",
        }),
      ),
    );
    expect(opened).not.toBeNull();
    expect(opened!.groups[0].items[0].look).toEqual({
      opacity: 100,
      glass: 0,
      fills: [{ type: "linear", angle: 360, stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] }],
      stroke: { width: 32, color: "#000" },
      shadows: [{ x: 200, y: 0, blur: 0, spread: 0, color: "#000" }],
      elevation: 4,
      filter: { sepia: 50 },
      transform: { scaleX: 5 },
      text: { size: 400, weight: 300 },
    });
  });

  it("goes when nothing of it is good, or when it is not an object", () => {
    expect(openProject(projectFile(docWith({ shadow: "huge" })))!.groups[0].items[0]).not.toHaveProperty("look");
    expect(openProject(projectFile(docWith("url(x)")))!.groups[0].items[0]).not.toHaveProperty("look");
    expect(openProject(projectFile(docWith(undefined, { fill: "pink" as ColorToken })))!.groups[0].items[0]).not.toHaveProperty("fill");
  });

  it("carries no string to the page that is not a color it understands", () => {
    const hostile = JSON.parse(JSON.stringify(FULL).replace(/"#[0-9a-f]+"|"primary"|"outline"|"on-primary"/gi, '"url(https://evil.test/x)"')) as ItemLook;
    const css = JSON.stringify(lookStyle(hostile)) + JSON.stringify(lookGradientTextStyle(hostile));
    expect(css).not.toContain("evil");
  });

  it("names the colors it uses, for a picker", () => {
    expect(colorsOfLook(FULL)).toEqual(expect.arrayContaining(["primary", "#ff000080", "surface/50", "outline", "#00000033", "on-primary", "#000", "#fff", "#112233"]));
  });
});

/* ---------- held to a style ---------- */

describe("a look held to a style", () => {
  it("keeps only what places a part and the style's elevation", () => {
    expect(STRICT_LOOK_KEYS).toEqual(["opacity", "rotate", "transform", "blur", "blend", "elevation"]);
    expect(strictLook(FULL)).toEqual({ opacity: 80, rotate: 5, transform: FULL.transform, blur: 2, blend: "screen", elevation: 3 });
    expect(strictLook({ fills: [], shadows: [] })).toBeUndefined();
    const out = conformItem({ ...makeItem("card"), id: "c", look: FULL, corners: { tl: 1, tr: 1, bl: 1, br: 1 } });
    expect(out.look).toEqual(strictLook(FULL));
    expect(out.corners).toBeUndefined();
    const kept = { ...makeItem("card"), id: "c", look: { elevation: 2 as const, opacity: 50 } };
    expect(conformItem(kept)).toBe(kept);
  });

  it("tells a model what may stay", () => {
    const text = rulesForModel(normalizeTheme({ style: "ios" }));
    expect(text).toContain("`elevation`");
    expect(text).toContain("`transform`");
    expect(text).not.toContain("Never set corners, look");
  });
});

/* ---------- presets and what a model is told ---------- */

describe("presets", () => {
  it.each(LOOK_PRESETS.map((p) => [p.key, p.look] as const))("%s is an ordinary look that draws something", (_, look) => {
    expect(cleanLook(look)).toEqual(look);
    expect(Object.keys(lookStyle(look)).length).toBeGreaterThan(0);
  });

  it("take the place of the effects, and leave how the part is placed", () => {
    const next = withPreset({ opacity: 50, rotate: 10, fills: [{ type: "solid", color: "#f00" }], shadows: [] }, LOOK_PRESETS[0].look);
    expect(next).toMatchObject({ opacity: 50, rotate: 10 });
    expect(next.fills).toBeUndefined();
    expect(next.shadows).toEqual(LOOK_PRESETS[0].look.shadows);
  });
});

describe("what is said about looks", () => {
  it("tells a model the fields, the color grammar and the textures", () => {
    const text = lookForModel();
    for (const k of ["fills", "stroke", "shadows", "elevation", "glass", "blend", "filter", "transform", "text", "texture", "clearFill", "#rrggbb", "primary/40", ...TEXTURE_KINDS]) expect(text, k).toContain(k);
  });

  it("prints the effects into the code and the prompt", () => {
    const look: ItemLook = { fills: [{ type: "linear", angle: 135, stops: [{ color: "#ff5f6d", at: 0 }, { color: "tertiary", at: 100 }] }], shadows: [{ x: 0, y: 6, blur: 0, spread: 0, color: "#00000040" }], text: { gradient: { type: "linear", stops: [{ color: "#fff", at: 0 }, { color: "#000", at: 100 }] } } };
    const doc = docWith(look);
    const { code } = buildCode(doc, {});
    expect(code).toContain('backgroundImage: "linear-gradient(135deg, #ff5f6d 0%, var(--md-sys-color-tertiary) 100%)"');
    expect(code).toContain('boxShadow: "0px 6px 0px 0px #00000040"');
    expect(code).toContain("backgroundClip: \"text\"");
    expect(code).not.toMatch(/undefined|\[object|NaN/);
    const prompt = buildPrompt(doc, {}, undefined, "en");
    expect(prompt).toContain("linear-gradient(135deg");
    expect(prompt).toContain("--look-elev-N");
    expect(buildPrompt(docWith(undefined), {}, undefined, "en")).not.toContain("--look-elev-N");
  });

  it("lets a model write looks, and cleans what it writes when it arrives", async () => {
    const answer = docWith({ fills: [{ type: "solid", color: "url(javascript:alert(1))" }, { type: "solid", color: "primary" }], shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: "#00000040" }], blend: "evil" });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(answer) }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const settings = { provider: "claude" as const, baseUrl: "https://api.anthropic.com", model: "m", key: "k" };
      const drafted = await draftDesign(settings, "guide", "a game", "en");
      expect(drafted.groups[0].items[0].look).toEqual({ fills: [{ type: "solid", color: "primary" }], shadows: [{ x: 0, y: 4, blur: 8, spread: 0, color: "#00000040" }] });
      const asked = JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content as string;
      expect(asked).toContain("`fills`");
      /* held to a style, it is told the rules instead */
      await draftDesign(settings, "guide", "a game", "en", undefined, "RULES");
      const held = JSON.parse(fetchMock.mock.calls[1][1].body).messages[0].content as string;
      expect(held).toContain("RULES");
      expect(held).not.toContain("`fills`");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("carries a style's elevation into the exported project", async () => {
    const doc = { ...docWith({ elevation: 2 }), theme: normalizeTheme({ style: "casual" }) };
    const fromDisk = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
    const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });
    const { files } = await buildProject(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(String(files["src/style.css"])).toContain("--look-elev-2:0 0 0 2px var(--st-rim-dark)");
    expect(Object.values(files).some((f) => typeof f === "string" && f.includes('boxShadow: "var(--look-elev-2, '))).toBe(true);
  });
});
