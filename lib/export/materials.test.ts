/* A material worn by a part, exported (docs/m3e-material.md §4, docs/导出.md): the web project draws it from files it
 * writes for the materials the screens use, the phone and the mini-program draw its colour and say so. */
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8 } from "fflate";
import { setGlobalLang } from "../i18n";
import { makeItem, type Doc, type Group } from "../tokens";
import { cleanDocMaterials } from "../materials";
import { buildProject } from "../exportProject";
import { printRnScreens } from "./rn/print";
import { printMiniScreens } from "./miniapp/print";

beforeAll(() => setGlobalLang("en"));

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const material = (id: string) => ({ id, name: id, tile: 64, resolution: 1, light: { azimuth: 315, elevation: 45 }, maps: { surface: PNG, shading: PNG }, swatch: { average: "#783427", palette: ["#783427"], lightness: 30 } });
const button = (id: string, fills: unknown[]) => ({ ...makeItem("button"), id, props: { label: "Buy" }, look: { fills } as never });
const docOf = (groups: Group[]): Doc => ({
  groups,
  frames: [{ id: "f1", name: "Home", x: 0, y: 0 }],
  paletteKey: "purple",
  frame: "phone",
  title: "Shop",
  brief: "",
  materials: cleanDocMaterials([material("bricks"), material("unused")]),
});
const doc = docOf([
  { id: "g1", x: 16, y: 100, axis: "x", items: [button("b1", [{ type: "material", material: "bricks", mode: "tint", tint: "primary", scale: 50 }])] },
  { id: "g2", x: 16, y: 200, axis: "x", items: [button("b2", [{ type: "material", material: "bricks", opacity: 40 }, { type: "material", material: "gone" }])] },
]);

const fromDisk = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");
const noNetwork = async (ids: string[]) => ({ icons: Object.fromEntries(ids.map((id) => [id, { body: "" }])) });

describe("a material in the web project", () => {
  it("writes the pictures of the materials used, and the sheet that names them, and no picture into the code", async () => {
    const { files } = await buildProject(doc, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(Object.keys(files).filter((p) => p.startsWith("public/materials/")).sort()).toEqual(["public/materials/bricks/shading-o40.svg", "public/materials/bricks/shading.png", "public/materials/bricks/surface-o40.svg", "public/materials/bricks/surface.png"].sort());
    const sheet = files["src/materials.css"] as string;
    expect(sheet).toContain('--m3e-mat-bricks-surface:url("/materials/bricks/surface.png")');
    expect(sheet).toContain('--m3e-mat-bricks-surface-o40:url("/materials/bricks/surface-o40.svg")');
    expect(sheet).not.toContain("unused");
    expect(files["src/index.css"]).toContain('@import "./materials.css";');
    /* the faded copy holds the picture: an SVG drawn as a background loads nothing from outside */
    expect(strFromU8(files["public/materials/bricks/surface-o40.svg"] as Uint8Array)).toContain(PNG);
    const screen = Object.entries(files).find(([p]) => p.startsWith("src/screens/") && p.endsWith(".tsx"))![1] as string;
    expect(screen).toContain("var(--m3e-mat-bricks-shading, none)");
    expect(screen).not.toContain("base64");
  });
  it("writes nothing of materials for a document that wears none", async () => {
    const { files } = await buildProject({ ...doc, groups: [{ id: "g1", x: 16, y: 100, axis: "x", items: [button("b1", [{ type: "solid", color: "primary" }])] }] }, {}, { read: fromDisk, fetchIcons: noNetwork, lang: "en" });
    expect(Object.keys(files).some((p) => p.includes("materials"))).toBe(false);
    expect(files["src/index.css"]).not.toContain("materials.css");
  });
});

describe("a material on a phone and in a mini-program", () => {
  for (const [host, print] of [["phone", printRnScreens], ["mini-program", printMiniScreens]] as const) {
    it(`is drawn as its colour ${host === "phone" ? "on a phone" : "in a mini-program"}, and said so`, () => {
      const { screens, warnings } = print(doc, {});
      const code = screens.map((s) => s.source).join("\n").replace(/\s+/g, " ");
      expect(code).toContain('fills: [{ type: "solid", color: "primary" }]');
      /* at 40% its own average colour at 40%; a material the library lacks draws nothing */
      expect(code).toContain('fills: [{ type: "solid", color: "#78342766" }]');
      expect(code).not.toContain('"material"');
      expect(warnings.filter((w) => w.kind === "look" && /material/.test(w.detail))).toHaveLength(2);
    });
  }
});
