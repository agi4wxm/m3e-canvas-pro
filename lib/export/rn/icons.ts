import type { IconifyJSON } from "@iconify/react/offline";
import { iconSubset, setsOf, type IconSetKey } from "../../../components/m3e/icon-sets/load";
import type { IconFamily } from "../../../components/m3e/icon-family";

/* The glyphs an exported React Native app draws its icons with, offline: only the names its screens and the kit use, in
 * the families its theme names, and Material Rounded for a name a family lacks (as on the web, see
 * components/m3e/icon-family.ts). Each glyph is the inner markup of an SVG, drawn by react-native-svg. */

export type RnIconData = {
  /** for a product's family: a Material name (Iconify's spelling, with dashes) to the ids of its outlined and filled glyph */
  maps: Record<string, Record<string, [string, string]>>;
  /** a glyph's id to its markup, its width and its height */
  glyphs: Record<string, [string, number, number]>;
};

/** an icon name as the icon sets spell it */
export const iconBase = (name: string) => name.replaceAll("_", "-");

/** the markup of one icon of a set, with what an alias turns or flips folded in */
function glyphOf(set: IconifyJSON, name: string): [string, number, number] | undefined {
  const alias = set.aliases?.[name];
  const own = set.icons[alias ? alias.parent : name];
  if (!own) return undefined;
  const w = own.width ?? set.width ?? 16;
  const h = own.height ?? set.height ?? 16;
  let body = own.body;
  const flips = [alias?.hFlip || own.hFlip ? `translate(${w} 0) scale(-1 1)` : "", alias?.vFlip || own.vFlip ? `translate(0 ${h}) scale(1 -1)` : ""].filter(Boolean);
  const turns = ((alias?.rotate ?? 0) + (own.rotate ?? 0)) % 4;
  if (turns) flips.unshift(`rotate(${turns * 90} ${w / 2} ${h / 2})`);
  if (flips.length) body = `<g transform="${flips.join(" ")}">${body}</g>`;
  return [body, w, h];
}

/** Every glyph that draws these names in these families, with each family's table. A name no set draws is left out:
 *  the kit draws an empty square of the icon's size for it. */
export async function rnIconData(families: Iterable<string>, names: Iterable<string>): Promise<RnIconData> {
  const list = [...new Set([...names].filter((n) => typeof n === "string" && n && !n.startsWith("svg:")).map(iconBase))].sort();
  const sets = new Set<IconSetKey>();
  for (const f of families) for (const s of setsOf(f as IconFamily)) sets.add(s);
  const out: RnIconData = { maps: {}, glyphs: {} };
  for (const set of [...sets].sort()) {
    const { map, sets: data } = await iconSubset(set, list);
    if (Object.keys(map).length) out.maps[set] = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, [v[0], v[1]]]));
    for (const json of data)
      for (const name of [...Object.keys(json.icons), ...Object.keys(json.aliases ?? {})].sort()) {
        const g = glyphOf(json, name);
        if (g) out.glyphs[`${json.prefix}:${name}`] = g;
      }
  }
  out.glyphs = Object.fromEntries(Object.entries(out.glyphs).sort(([a], [b]) => a.localeCompare(b)));
  return out;
}
