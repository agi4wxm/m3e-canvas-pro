/* The document's materials (docs/m3e-material.md §4): a pack imported into the library, a look naming one, the CSS it
 * paints; a hostile pack refused safely; documents without materials as they always were. */
import { beforeAll, describe, expect, it } from "vitest";
import { setGlobalLang } from "./i18n";
import { MATERIAL_FORMAT } from "./material";
import { cleanDocMaterials, describeMaterialLayer, importMaterials, materialOpacities, materialsForModel, materialUseCounts, usedMaterials } from "./materials";
import { materialSheet, materialVar } from "./materialCss";
import { cleanLook, colorsOfLook, lookStyle, strictLook } from "./look";
import { openProject } from "./project";
import { makeItem, type Doc, type Group } from "./tokens";
import { stripAssets, restoreAssets } from "./assets";
import { counterIds, DocStore } from "./core/store";
import { savedDoc, stateOf } from "./core/state";
import { guessMeasurer, OpError } from "./core/op";
import * as ops from "./core/ops";

beforeAll(() => setGlobalLang("en"));

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
const pack = (materials: unknown[], over: Record<string, unknown> = {}) => ({ format: MATERIAL_FORMAT, version: 1, generator: { name: "Material Pro", version: "0.1.0" }, materials, ...over });

const screen = { id: "F1", name: "Home", x: 0, y: 0 };
const part = (id: string, look?: unknown): Group => ({ id: `g-${id}`, x: 16, y: 100, axis: "x", items: [{ ...makeItem("button"), id, props: {}, ...(look ? { look: look as never } : {}) }] });
const store = (doc: Partial<Doc> = {}) => new DocStore(stateOf({ groups: [part("a")], frames: [screen], ...doc }), { ids: counterIds("n"), measurer: guessMeasurer, lang: () => "en" });

describe("importing a pack", () => {
  it("adds to the library, never replacing it, and names a taken id afresh", () => {
    const first = importMaterials(undefined, pack([material()]))!;
    expect(first.materials.map((m) => m.id)).toEqual(["bricks"]);
    const second = importMaterials(first.materials, pack([material(), material({ id: "wood", name: "Wood" })]))!;
    expect(second.materials.map((m) => m.id)).toEqual(["bricks", "bricks-2", "wood"]);
    expect(second.added.map((m) => m.id)).toEqual(["bricks-2", "wood"]);
    expect(second.materials[0]).toBe(first.materials[0]);
  });
  it("is an undoable step that changes nothing but the library", () => {
    const s = store({ title: "Shop" });
    const before = savedDoc(s.get());
    const r = s.run(ops.addMaterials, { file: pack([material()]) });
    expect(r.added).toEqual([{ id: "bricks", name: "Bricks" }]);
    const after = savedDoc(s.get());
    expect(after.materials?.map((m) => m.id)).toEqual(["bricks"]);
    expect({ ...after, materials: undefined }).toEqual({ ...before, materials: undefined });
    s.undo();
    expect(savedDoc(s.get()).materials).toBeUndefined();
    s.redo();
    expect(savedDoc(s.get()).materials).toHaveLength(1);
  });
  it("refuses what is no pack, and says how many layers a removed material leaves drawing nothing", () => {
    const s = store();
    expect(() => s.run(ops.addMaterials, { file: { format: "m3e-project", version: 1, materials: [material()] } })).toThrow(OpError);
    s.run(ops.addMaterials, { file: pack([material()]) });
    s.run(ops.setItem, { id: "a", patch: { look: { fills: [{ type: "material", material: "bricks" }] } } });
    const r = s.run(ops.removeMaterial, { id: "bricks" });
    expect(r).toEqual({ removed: "bricks", stillUsedBy: 1 });
    expect(savedDoc(s.get()).materials).toBeUndefined();
  });
});

describe("a model naming a material", () => {
  it("may name one the library has, and is refused one it has not", () => {
    const s = store();
    s.run(ops.addMaterials, { file: pack([material()]) });
    s.run(ops.setItem, { id: "a", patch: { look: { fills: [{ type: "material", material: "bricks", mode: "tint", tint: "primary" }] } } }, { origin: "ai" });
    expect(() => s.run(ops.setItem, { id: "a", patch: { look: { fills: [{ type: "material", material: "marble" }] } } }, { origin: "ai" })).toThrow(/does not have \(it has: bricks\)/);
  });
});

describe("a pack from outside", () => {
  it("drops pictures that are no png, webp or jpeg data, numbers out of range and fields it does not know", () => {
    const m = importMaterials(undefined, pack([material({ maps: { surface: PNG, shading: PNG, normal: "data:image/svg+xml;base64,PHN2Zz4=", height: "https://evil.example/h.png" }, tile: -5, extra: "x", style: "background:url(//evil)" })]))!.materials[0];
    expect(Object.keys(m.maps)).toEqual(["surface", "shading"]);
    expect(m.tile).toBe(8);
    expect(m).not.toHaveProperty("extra");
    expect(m).not.toHaveProperty("style");
  });
  it("refuses a material whose pictures would break out of the CSS they are put in", () => {
    expect(importMaterials(undefined, pack([material({ maps: { surface: `${PNG}"),url(https://evil.example/x`, shading: PNG } })]))).toBeNull();
    expect(importMaterials(undefined, pack([material({ maps: { surface: "data:image/png;base64,AAA=;}body{display:none", shading: PNG } })]))).toBeNull();
    expect(importMaterials(undefined, pack([material({ maps: { surface: "data:text/html;base64,PHNjcmlwdD4=", shading: PNG } })]))).toBeNull();
  });
  it("refuses a picture over the size limit, and keeps at most 200 materials", () => {
    const huge = `data:image/png;base64,${"A".repeat(12_000_001)}`;
    expect(importMaterials(undefined, pack([material({ maps: { surface: huge, shading: PNG } })]))).toBeNull();
    const many = Array.from({ length: 260 }, (_, i) => material({ id: `m${i}` }));
    expect(importMaterials(undefined, pack(many))!.materials).toHaveLength(200);
  });
  it("runs a material's fallback look through the look's own cleaning", () => {
    const m = importMaterials(undefined, pack([material({ fallbackLook: { fills: [{ type: "solid", color: "#123456" }], shadows: [{ x: 0, y: 0, blur: 0, spread: 0, color: "url(x)" }], evil: "expression(1)" } })]))!.materials[0];
    expect(m.fallbackLook).toEqual({ fills: [{ type: "solid", color: "#123456" }], shadows: [] });
  });
  it("is cleaned the same when it arrives inside a document, a repeated id dropped", () => {
    const doc = openProject({ groups: [], frames: [], paletteKey: "purple", frame: "phone", title: "", brief: "", materials: [material(), material({ name: "Again" }), { id: "bad", maps: {} }, "nope"] })!;
    expect(doc.materials?.map((m) => m.name)).toEqual(["Bricks"]);
    expect(openProject({ groups: [], frames: [], paletteKey: "purple", frame: "phone", title: "", brief: "", materials: "nope" })!.materials).toBeUndefined();
  });
});

describe("a material in a look", () => {
  const library = cleanDocMaterials([material()])!;
  it("is a layer of the fills, kept as the format cleans it", () => {
    const look = cleanLook({ fills: [{ type: "material", material: "bricks", mode: "tint", tint: "primary", scale: 60, opacity: 100, rogue: "x" }, { type: "solid", color: "#000" }] })!;
    expect(look.fills).toEqual([{ type: "material", material: "bricks", mode: "tint", tint: "primary", scale: 60 }, { type: "solid", color: "#000" }]);
    expect(cleanLook({ fills: [{ type: "material", material: "x;}body{" }, { type: "material", material: "a", mode: "tint", tint: "red;}" }] })!.fills).toEqual([{ type: "material", material: "a", mode: "tint" }]);
    /* a newer version's field is kept when read from a document, and never painted */
    expect(cleanLook({ fills: [{ type: "material", material: "bricks", sheen: 3 }] }, true)!.fills![0]).toMatchObject({ sheen: 3 });
    expect(colorsOfLook(look)).toContain("primary");
  });
  it("paints its tiles beside the gradients, in the order of the fills", () => {
    const style = lookStyle({ fills: [{ type: "linear", angle: 90, stops: [{ color: "#000", at: 0 }, { color: "#fff", at: 100 }] }, { type: "material", material: "bricks", scale: 50 }] });
    expect(style.backgroundImage).toBe(`linear-gradient(90deg, #000000 0%, #ffffff 100%), var(${materialVar("bricks", "surface")}, none)`);
    expect(style.backgroundSize).toBe(`100% 100%, calc(var(${materialVar("bricks", "tile")}) * 0.5) calc(var(${materialVar("bricks", "tile")}) * 0.5)`);
    expect(style.backgroundRepeat).toBe("no-repeat, repeat");
    const tinted = lookStyle({ fills: [{ type: "material", material: "bricks", mode: "tint", tint: "primary" }] });
    expect(tinted.backgroundBlendMode).toBe("overlay, normal");
    expect(String(tinted.backgroundImage)).toContain("var(--md-sys-color-primary)");
  });
  it("carries no picture in the part's style: the page's sheet holds them once", () => {
    const style = JSON.stringify(lookStyle({ fills: [{ type: "material", material: "bricks" }] }));
    expect(style).not.toContain("base64");
    expect(materialSheet(library, new Map())).toContain(PNG);
  });
  it("under a style's rules stays only tinted by a role", () => {
    const fills = [
      { type: "material", material: "bricks", mode: "tint", tint: "primary" },
      { type: "material", material: "bricks", mode: "tint", tint: "#ff0000" },
      { type: "material", material: "bricks" },
      { type: "solid", color: "primary" },
    ] as const;
    expect(strictLook({ fills: [...fills] as never, opacity: 50 })).toEqual({ opacity: 50, fills: [fills[0]] });
  });
  it("is found wherever a look is, for the sheet's faded copies and an export", () => {
    const doc = { groups: [part("a", { fills: [{ type: "material", material: "bricks", opacity: 40 }] })], components: [{ id: "c", name: "C", groups: [part("b", { fills: [{ type: "material", material: "bricks", opacity: 40 }, { type: "material", material: "wood" }] })] }], materials: [...library, ...cleanDocMaterials([material({ id: "unused" })])!] };
    expect(materialOpacities(doc)).toEqual(new Map([["bricks", new Set([40])]]));
    expect(materialUseCounts(doc)).toEqual(new Map([["bricks", 2], ["wood", 1]]));
    expect(usedMaterials(doc as never).map((m) => m.id)).toEqual(["bricks"]);
  });
  it("is told to a model by its name and colours, never its pictures", () => {
    expect(describeMaterialLayer({ type: "material", material: "bricks", mode: "tint", tint: "primary" }, library)).toBe("material Bricks (#601d16, #797878), tinted primary");
    expect(JSON.stringify(materialsForModel(library))).not.toContain("base64");
  });
});

describe("the pictures in storage", () => {
  it("go to the asset store when large and come back whole", () => {
    const big = `data:image/webp;base64,${"A".repeat(60_000)}`;
    const doc = { materials: cleanDocMaterials([material({ maps: { surface: big, shading: big } })]) };
    const { doc: light, found } = stripAssets(doc);
    expect(JSON.stringify(light)).not.toContain("AAAA");
    expect(found.size).toBe(1);
    expect(restoreAssets(light, found)).toEqual(doc);
  });
});

describe("documents without materials", () => {
  it("open, save and paint as they always did", () => {
    const old = { groups: [part("a", { fills: [{ type: "solid", color: "primary" }, { type: "linear", angle: 90, stops: [{ color: "#000", at: 0 }, { color: "#fff", at: 100 }] }] })], frames: [screen], paletteKey: "purple", frame: "phone" as const, title: "", brief: "" };
    const doc = openProject(old)!;
    expect(doc).not.toHaveProperty("materials");
    expect(JSON.stringify(savedDoc(stateOf(doc)))).toBe(JSON.stringify(savedDoc(stateOf(openProject(old)!))));
    expect(JSON.stringify(savedDoc(stateOf(doc)))).not.toContain("materials");
    /* gradients alone say no sizes, as before */
    expect(Object.keys(lookStyle(doc.groups[0].items[0].look))).toEqual(["backgroundImage"]);
  });
});
