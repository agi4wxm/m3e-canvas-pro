/* A material layer as CSS variables (lib/materialCss.ts) draws what the reference implementation draws
 * (lib/material.ts materialLayerCss) once the page's sheet is read, and the sheet holds nothing a file could use to
 * reach outside its url(). */
import { describe, expect, it } from "vitest";
import { materialLayerCss, openMaterialFile, MATERIAL_FORMAT, type MaterialLayer } from "./material";
import { materialPaintCss, materialSheet, materialVar, materialVars } from "./materialCss";
import { colorCss } from "./look";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const WEBP = "data:image/webp;base64,UklGRg==";
const mats = openMaterialFile({
  format: MATERIAL_FORMAT,
  version: 1,
  materials: [{ id: "bricks", name: "Bricks", tile: 128, resolution: 256, light: { azimuth: 315, elevation: 45 }, maps: { surface: PNG, shading: WEBP }, swatch: { average: "#783427", palette: ["#601d16"], lightness: 30 } }],
})!;

/** the CSS with the sheet's variables read and its calc() worked out, as a browser would */
function resolved(css: string, vars: Map<string, string>): string {
  let out = css;
  for (let i = 0; i < 4; i++) out = out.replace(/var\((--[a-z0-9-]+)(?:, ([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (all: string, name: string, fallback?: string) => vars.get(name) ?? (name.startsWith("--m3e-mat-") ? (fallback ?? "") : all));
  return out.replace(/calc\(([\d.]+)px \* ([\d.-]+)\)/g, (_, px: string, f: string) => `${Math.round(Number(px) * Number(f) * 100) / 100}px`);
}
const sheet = (opacities = new Map<string, Set<number>>()) => new Map(materialVars(mats, opacities));
const drawn = (layer: MaterialLayer, vars = sheet()) => materialPaintCss(layer, colorCss).map((l) => ({ ...l, image: resolved(l.image, vars), size: resolved(l.size, vars), position: resolved(l.position, vars) }));

describe("material layers as variables", () => {
  const cases: MaterialLayer[] = [
    { type: "material", material: "bricks" },
    { type: "material", material: "bricks", scale: 50, x: 50, y: -25, blend: "multiply" },
    { type: "material", material: "bricks", mode: "tint", tint: "primary", scale: 60 },
    { type: "material", material: "bricks", mode: "tint", tint: "#ff0000", x: 10 },
    { type: "material", material: "bricks", mode: "tint" },
  ];
  it("draw what the reference draws, once the sheet is read", () => {
    for (const layer of cases) expect(drawn(layer), JSON.stringify(layer)).toEqual(materialLayerCss(layer, mats, (c) => colorCss(c)).layers);
  });
  it("draw nothing for a material the sheet does not hold, or a hidden layer", () => {
    for (const layer of [{ type: "material", material: "nope" } as MaterialLayer, { type: "material", material: "nope", mode: "tint", tint: "primary" } as MaterialLayer]) {
      const layers = drawn(layer, sheet());
      /* a picture of none, and a colour over no area */
      expect(layers.every((l) => l.image === "none" || l.size === "0px 0px")).toBe(true);
      expect(materialLayerCss(layer, mats).layers).toEqual([]);
    }
    expect(materialPaintCss({ type: "material", material: "bricks", hidden: true }, colorCss)).toEqual([]);
  });
  it("tint with a role follows the theme and its light or dark", () => {
    const [, colour] = materialPaintCss({ type: "material", material: "bricks", mode: "tint", tint: "primary-container/40" }, colorCss);
    expect(colour.image).toContain("var(--md-sys-color-primary-container)");
  });
  it("name a faded copy of the picture under 100%, and the sheet makes it", () => {
    const [layer] = materialPaintCss({ type: "material", material: "bricks", opacity: 40 }, colorCss);
    expect(layer.image).toBe(`var(${materialVar("bricks", "surface", 40)}, none)`);
    const css = materialSheet(mats, new Map([["bricks", new Set([40])]]));
    expect(css).toContain(`${materialVar("bricks", "surface", 40)}:url("data:image/svg+xml,`);
    expect(decodeURIComponent(css)).toContain("opacity='0.4'");
    /* the tint colour fades with it */
    const [, colour] = materialPaintCss({ type: "material", material: "bricks", mode: "tint", tint: "primary", opacity: 40 }, colorCss);
    expect(colour.image).toContain("40%, transparent");
  });
  it("keep every value of the sheet inside its url()", () => {
    const hostile = [{ ...mats[0], id: "x", maps: { surface: 'x"),url(https://evil.example/', shading: "javascript:alert(1)" } }];
    const css = materialSheet(hostile as never, new Map(), ":root", (m, which) => m.maps[which as "surface"]);
    expect(css).not.toContain("evil.example");
    expect(css).not.toContain("javascript");
  });
});
