/* The m3e material format: what openMaterialFile keeps and refuses, and what a material layer draws. Ported from Material
 * Pro (tests/unit/m3e-material.test.ts at 399dea9), less its "baking helpers", which test how Material Pro makes a pack. */
import { describe, expect, it } from "vitest";
import { cleanMaterialLayer, materialLayerCss, openMaterialFile, uniqueId, MATERIAL_FORMAT } from "./material";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const material = (over: Record<string, unknown> = {}) => ({
  id: "bricks",
  name: "Bricks",
  tile: 128,
  resolution: 256,
  light: { azimuth: 315, elevation: 45 },
  maps: { surface: PNG, shading: PNG },
  swatch: { average: "#783427", palette: ["#601d16", "#797878"], lightness: 30 },
  ...over,
});
const file = (materials: unknown[], over: Record<string, unknown> = {}) => ({ format: MATERIAL_FORMAT, version: 1, materials, ...over });

describe("openMaterialFile", () => {
  it("keeps a whole material", () => {
    const m = openMaterialFile(file([material()]))!;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ id: "bricks", name: "Bricks", tile: 128, maps: { surface: PNG, shading: PNG } });
  });
  it("refuses other formats, newer versions and empty files", () => {
    expect(openMaterialFile({ ...file([material()]), format: "m3e-project" })).toBeNull();
    expect(openMaterialFile(file([material()], { version: 2 }))).toBeNull();
    expect(openMaterialFile(file([]))).toBeNull();
    expect(openMaterialFile("nope")).toBeNull();
  });
  it("drops materials without their two pictures, and pictures that are not image data", () => {
    expect(openMaterialFile(file([material({ maps: { surface: PNG } })]))).toBeNull();
    expect(openMaterialFile(file([material({ maps: { surface: "https://evil.example/x.png", shading: PNG } })]))).toBeNull();
    expect(openMaterialFile(file([material({ maps: { surface: 'data:image/svg+xml;base64,PHN2Zz4=', shading: PNG } })]))).toBeNull();
    const m = openMaterialFile(file([material({ maps: { surface: PNG, shading: PNG, normal: "url(javascript:1)", orm: PNG } })]))!;
    expect(Object.keys(m[0].maps)).toEqual(["surface", "shading", "orm"]);
  });
  it("clamps numbers, keeps colours to hex, and makes ids unique", () => {
    const m = openMaterialFile(file([material({ tile: 99999, light: { azimuth: -5, elevation: 500 }, swatch: { average: "red", palette: ["#12345", "#123456"], lightness: 900 } }), material({ id: "Bad Id!" , name: "Bad Id" }), material()]))!;
    expect(m[0].tile).toBe(2048);
    expect(m[0].light).toEqual({ azimuth: 0, elevation: 90 });
    expect(m[0].swatch).toEqual({ average: "#123456", palette: ["#123456"], lightness: 100 });
    expect(m.map((x) => x.id)).toEqual(["bricks", "bad-id", "bricks-2"]);
    expect(uniqueId("a", new Set(["a", "a-2"]))).toBe("a-3");
  });
});

describe("material layers", () => {
  const mats = openMaterialFile(file([material()]))!;
  it("cleans a layer", () => {
    expect(cleanMaterialLayer({ type: "material", material: "bricks", scale: 1000, x: 30, opacity: 100, blend: "overlay", mode: "tint", tint: "#ff0000" })).toEqual({ type: "material", material: "bricks", scale: 400, x: 30, blend: "overlay", mode: "tint", tint: "#ff0000" });
    expect(cleanMaterialLayer({ type: "material", material: "x;}" })).toBeUndefined();
    expect(cleanMaterialLayer({ type: "material", material: "bricks", blend: "plus-darker" })).toEqual({ type: "material", material: "bricks" });
  });
  it("draws the surface, tiled at the tile size times the scale", () => {
    const { layers, opacity } = materialLayerCss({ type: "material", material: "bricks", scale: 50, x: 50, opacity: 40 }, mats);
    expect(layers).toEqual([{ image: `url("${PNG}")`, size: "64px 64px", position: "32px 0px", repeat: "repeat", blend: "normal" }]);
    expect(opacity).toBe(0.4);
  });
  it("draws a tint as the shading over the colour", () => {
    const { layers } = materialLayerCss({ type: "material", material: "bricks", mode: "tint", tint: "primary" }, mats, (c) => (c === "primary" ? "var(--md-sys-color-primary)" : undefined));
    expect(layers.map((l) => l.blend)).toEqual(["overlay", "normal"]);
    expect(layers[1].image).toBe("linear-gradient(var(--md-sys-color-primary), var(--md-sys-color-primary))");
  });
  it("draws nothing for an unknown material", () => {
    expect(materialLayerCss({ type: "material", material: "nope" }, mats).layers).toEqual([]);
  });
});
