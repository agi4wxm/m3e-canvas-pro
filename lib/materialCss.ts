/* A material layer (lib/material.ts, docs/m3e-material.md) as the CSS a part is painted with.
 *
 * The reference implementation's `materialLayerCss` writes each picture into the layer as a data URL. A picture is up
 * to megabytes of text, and a part's style is copied wherever the part is: into every node of the canvas, every undo
 * step, the printed code of an export. So here a layer names its material's pictures by CSS variable instead, and one
 * stylesheet per page (`materialSheet`) says what each variable is: a data URL on the canvas and in the preview, a
 * file in an exported project. The layers come out the same as `materialLayerCss`'s once the variables are read
 * (lib/materialCss.test.ts holds them to that); a material the sheet does not define draws nothing, as there.
 *
 * What a background layer cannot be is translucent. A layer of a material at less than 100% opacity names a faded copy
 * of the picture (an SVG drawing the picture at that opacity), which the sheet makes for each opacity the document
 * uses, so the layer stays one background layer among the others. */

import { cleanMaterialLayer, type CssLayer, type MaterialDef, type MaterialLayer } from "./material";

/** what a material's variables are called; ids are lower case letters, digits and dashes, so they are safe in a name */
export const materialVar = (id: string, what: "surface" | "shading" | "tile" | "fill" | "average", opacity = 100) =>
  `--m3e-mat-${id}-${what}${(what === "surface" || what === "shading") && opacity < 100 ? `-o${opacity}` : ""}`;

const round = (v: number) => Math.round(v * 100) / 100;
/** a tile's share as a factor of the material's tile size, written as calc() over its variable */
const ofTile = (id: string, factor: number) => {
  /* finer than a px's hundredth at the largest tile, so it lands where the reference's px land */
  const f = Math.round(factor * 1e4) / 1e4;
  if (f === 0) return "0px";
  return f === 1 ? `var(${materialVar(id, "tile")})` : `calc(var(${materialVar(id, "tile")}) * ${f})`;
};

/** the opacities a layer is drawn at, as whole percents: what the sheet makes faded copies for */
export const layerOpacity = (l: Pick<MaterialLayer, "opacity">) => Math.round(l.opacity ?? 100);

/**
 * The background layers a material layer paints, top first, as `materialLayerCss` gives them but with the material's
 * pictures, tile and colour read from its variables. `colorCss` turns a colour reference into CSS (lib/look.ts's
 * colorCss), for the tint: a role is its theme variable, so a tinted material follows the theme and light or dark.
 */
export function materialPaintCss(layer: unknown, colorCss: (c: unknown) => string | undefined): CssLayer[] {
  const l = cleanMaterialLayer(layer, (c) => colorCss(c) !== undefined);
  if (!l || l.hidden) return [];
  const id = l.material;
  const scale = (l.scale ?? 100) / 100;
  const tile = ofTile(id, scale);
  const size = `${tile} ${tile}`;
  const position = `${ofTile(id, ((l.x ?? 0) / 100) * scale)} ${ofTile(id, ((l.y ?? 0) / 100) * scale)}`;
  const opacity = layerOpacity(l);
  const blend = l.blend ?? "normal";
  const picture = (which: "surface" | "shading") => `var(${materialVar(id, which, opacity)}, none)`;
  if (l.mode !== "tint") return [{ image: picture("surface"), size, position, repeat: "repeat", blend }];
  const own = l.tint !== undefined ? colorCss(l.tint) : undefined;
  const color = own ?? `var(${materialVar(id, "average")})`;
  const faded = opacity < 100 ? `color-mix(in srgb, ${color} ${opacity}%, transparent)` : color;
  return [
    /* the relief over the tint colour */
    { image: picture("shading"), size, position, repeat: "repeat", blend: "overlay" },
    /* the colour covers the box only where the material is defined: an unknown one draws nothing, as in the reference */
    { image: `linear-gradient(${faded}, ${faded})`, size: `var(${materialVar(id, "fill")}, 0px 0px)`, position: "0 0", repeat: "repeat", blend },
  ];
}

/* ---------- the sheet ---------- */

/** a picture at an opacity: an SVG that draws it so. The picture is the material's own, already held to base64 data */
function fadedPicture(img: string, resolution: number, opacity: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${resolution}' height='${resolution}' viewBox='0 0 ${resolution} ${resolution}'><image href='${img}' width='${resolution}' height='${resolution}' opacity='${round(opacity / 100)}' preserveAspectRatio='none'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** where a picture of a material is read from: the data itself, or a file an export wrote */
export type PictureUrl = (m: MaterialDef, which: "surface" | "shading", opacity: number) => string;

/** the pictures as they are kept, a faded copy drawn from them */
export const inlinePictures: PictureUrl = (m, which, opacity) => (opacity < 100 ? fadedPicture(m.maps[which], m.resolution, opacity) : m.maps[which]);

/** a faded copy as a file of its own, the picture in it: what an export writes beside the picture */
export const fadedFile = fadedPicture;

/** what a CSS url() may hold: the data URLs the format allows and relative paths an export writes. Nothing with a quote,
 *  a backslash or a bracket can close the url() it is put in. */
const safeUrl = (u: string) => !/["'\\()\s<>]/.test(u.replace(/^data:image\/svg\+xml,[^"\\]*$/, "data:"));

/**
 * The variables of a document's materials, as one rule for `scope`: each material's tile, average colour and pictures,
 * and a faded copy of the pictures for each opacity in `opacities` (by material id) the document draws one at.
 */
export function materialSheet(materials: readonly MaterialDef[] | undefined, opacities: ReadonlyMap<string, ReadonlySet<number>>, scope = ":root", url: PictureUrl = inlinePictures): string {
  const decls = materialVars(materials, opacities, url);
  return decls.length ? `${scope}{${decls.map(([k, v]) => `${k}:${v}`).join(";")}}` : "";
}

/** the variables of `materialSheet`, by name */
export function materialVars(materials: readonly MaterialDef[] | undefined, opacities: ReadonlyMap<string, ReadonlySet<number>>, url: PictureUrl = inlinePictures): [string, string][] {
  const decls: [string, string][] = [];
  for (const m of materials ?? []) {
    decls.push([materialVar(m.id, "tile"), `${round(m.tile)}px`], [materialVar(m.id, "fill"), "auto"], [materialVar(m.id, "average"), m.swatch.average]);
    const at = new Set([100, ...(opacities.get(m.id) ?? [])]);
    for (const o of [...at].sort((a, b) => b - a))
      for (const which of ["surface", "shading"] as const) {
        const u = url(m, which, o);
        if (safeUrl(u)) decls.push([materialVar(m.id, which, o), `url("${u}")`]);
      }
  }
  return decls;
}
