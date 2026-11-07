import { Image, View } from "@tarojs/components";
import { useMemo } from "react";

import { tagOf } from "./Surface";
import { sx } from "./styles";
import { useKit } from "./theme";

/* Icons, offline. A mini-program cannot draw SVG markup in its page, but it can show an SVG as a picture: each glyph
 * is the inner markup of an SVG (from the icon family the theme names, the exporter writes only the names the screens
 * use), wrapped and painted with a color here and handed to an <Image> as a data URL. A color is a value, not a CSS
 * variable, so it comes from the theme's resolved colors in the mode the app is in (`useKit().paint`). */

export type IconData = {
  /** for a family's set: a Material name (with dashes) to the ids of its outlined and filled glyph */
  maps: Record<string, Record<string, [string, string]>>;
  /** a glyph's id to its markup, its width and its height */
  glyphs: Record<string, [string, number, number]>;
};

let DATA: IconData = { maps: {}, glyphs: {} };

/** the glyphs the app draws its icons with (src/generated/icons.ts) */
export function registerIcons(data: IconData) {
  DATA = { maps: { ...DATA.maps, ...data.maps }, glyphs: { ...DATA.glyphs, ...data.glyphs } };
}

const base = (name: string) => name.replaceAll("_", "-");

/** the ids that draw a name in a family, outlined then filled (components/m3e/icon-family.ts `familyIds`) */
function idsOf(family: string, name: string): [string, string] {
  const b = base(name);
  const own = DATA.maps[family]?.[b];
  if (own) return own;
  if (family === "filled") return [`material-symbols:${b}-rounded`, `material-symbols:${b}-rounded`];
  if (family === "light") return [`material-symbols-light:${b}-outline-rounded`, `material-symbols-light:${b}-rounded`];
  if (family === "sharp" || family === "pixel") return [`material-symbols:${b}-outline-sharp`, `material-symbols:${b}-sharp`];
  return [`material-symbols:${b}-outline-rounded`, `material-symbols:${b}-rounded`];
}

/** the glyph that draws a name, filled or not, in a family; Rounded stands in for what the family lacks */
export function glyphFor(name: string, family: string, filled: boolean): [string, number, number] | undefined {
  if (name.startsWith("svg:")) return DATA.glyphs[`m3e-doc:${name.slice(4)}`];
  const own = idsOf(family, name);
  const fallback = idsOf("rounded", name);
  return DATA.glyphs[own[filled ? 1 : 0]] ?? DATA.glyphs[own[0]] ?? DATA.glyphs[fallback[filled ? 1 : 0]] ?? DATA.glyphs[fallback[0]];
}

export const hasGlyph = (name: string) => !!glyphFor(name, "rounded", false);

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** UTF-8 bytes of words, by hand: a mini-program has no TextEncoder */
function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** base64 by hand: a mini-program has no btoa */
export function base64(s: string): string {
  const b = utf8(s);
  let out = "";
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
  }
  return out;
}

const URLS = new Map<string, string>();

/** An SVG as a picture: its markup with `currentColor` painted `color`, as a data URL (kept, since the same icon in the
 *  same color is drawn again and again). */
export function svgUrl(svg: string, color: string): string {
  const key = `${color}\u0000${svg}`;
  let url = URLS.get(key);
  if (!url) {
    url = `data:image/svg+xml;base64,${base64(svg.replaceAll("currentColor", color))}`;
    if (URLS.size > 800) URLS.clear();
    URLS.set(key, url);
  }
  return url;
}

export type GlyphProps = { name: string; size?: number; filled?: boolean; color?: string; testID?: string; label?: string };

/** One icon, drawn from the registered glyphs in the theme's family. `color` is a role, a role with an opacity or a
 *  hex. A name no set has is an empty square of the icon's size. */
export function Glyph({ name, size = 24, filled = false, color = "on-surface", testID, label }: GlyphProps) {
  const kit = useKit();
  const glyph = glyphFor(name, kit.theme.icons, filled);
  const paint = kit.paint(color);
  const src = useMemo(() => (glyph ? svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${glyph[1]} ${glyph[2]}" width="${size}" height="${size}" fill="currentColor">${glyph[0]}</svg>`, paint) : ""), [glyph, size, paint]);
  const box = sx({ width: size, height: size, flexShrink: 0, display: "block" });
  if (!src) return <View {...tagOf(testID)} style={box} ariaLabel={label} />;
  return <Image {...tagOf(testID)} src={src} style={box} mode="aspectFit" ariaLabel={label ?? name} />;
}
