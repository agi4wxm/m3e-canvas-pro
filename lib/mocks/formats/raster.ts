/* The mock library's picture as pixels, for the raster formats (PNG, JPEG, WebP, GIF, BMP, ICO, TIFF): the same
 * picture the SVG placeholder draws (lib/mocks/files.ts svgPicture), a gradient in two colors of the seed with three
 * soft circles and the title in white, or an avatar's initials on a circle. No canvas and no font file: the title is
 * set in a small pixel font of capitals, digits and common signs, so a word in another script is left out of the
 * pixels (it is in the file's metadata instead); an avatar whose initials are not Latin shows a head and shoulders. */

import { hash53, rngOf } from "../rng";
import { hslRgb } from "./content";

export type Picture = { w: number; h: number; rgba: Uint8Array; alpha: boolean };

/** the two colors of a seed, as svgPicture has them */
export function colorsOfSeed(seed: string): [[number, number, number], [number, number, number]] {
  const h = hash53(seed) % 360;
  return [hslRgb(h, 0.62, 0.58), hslRgb((h + 48) % 360, 0.68, 0.42)];
}

/* A pixel font 5 wide and 7 high, drawn for this file: each glyph is seven rows, each row a digit of base 32 whose
   five bits are the row's pixels, the leftmost the highest. */
const GLYPHS: Record<string, string> = {
  A: "ehhvhhh", B: "uhhuhhu", C: "ehggghe", D: "uhhhhhu", E: "vgguggv", F: "vgguggg", G: "ehgnhhf", H: "hhhvhhh", I: "e44444e",
  J: "72222ic", K: "hikokih", L: "ggggggv", M: "hrllhhh", N: "hhpljhh", O: "ehhhhhe", P: "uhhuggg", Q: "ehhhlid", R: "uhhukih",
  S: "fgge11u", T: "v444444", U: "hhhhhhe", V: "hhhhha4", W: "hhhllla", X: "hha4ahh", Y: "hha4444", Z: "v12248v",
  "0": "ehjlphe", "1": "4c4444e", "2": "eh1248v", "3": "v2421he", "4": "26aiv22", "5": "vgu11he", "6": "68guhhe",
  "7": "v124888", "8": "ehhehhe", "9": "ehhf12c", " ": "0000000", ".": "00000cc", ",": "0000c48", "-": "000v000", _: "000000v",
  ":": "0cc0cc0", "!": "4444404", "?": "eh12404", "/": "122488g", "&": "cik8lid", "#": "aavavaa", "'": "4480000",
  '"': "aa00000", "(": "2488842", ")": "8422248", "+": "044v440", "%": "op248j3", $: "4fke5u4", "@": "eh1dlle", "*": "04lel40",
  "=": "00v0v00",
};

const rowsOf = (c: string) => [...GLYPHS[c]].map((d) => parseInt(d, 32));

/** the characters of a text the font can draw: letters in capitals, the rest left out */
export function drawable(text: string): string {
  return [...text.toUpperCase()].filter((c) => c in GLYPHS).join("").replace(/\s+/g, " ").trim();
}

class Canvas {
  readonly rgba: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.rgba = new Uint8Array(w * h * 4);
  }
  /** white (or a color) laid over a pixel, `a` of the way */
  blend(x: number, y: number, a: number, c: readonly [number, number, number] = [255, 255, 255]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const k = Math.min(1, a);
    for (let j = 0; j < 3; j++) this.rgba[i + j] = Math.round(this.rgba[i + j] * (1 - k) + c[j] * k);
  }
  /** a disc, its edge smoothed over a pixel */
  disc(cx: number, cy: number, r: number, a: number) {
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r + 1));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cover = Math.max(0, Math.min(1, r - d + 0.5));
        if (cover > 0) this.blend(x, y, a * cover);
      }
  }
  /** text in the pixel font, `scale` pixels to its pixel, from its top left */
  text(s: string, x: number, y: number, scale: number, maxWidth = Infinity) {
    let at = x;
    for (const c of s) {
      if (at + 5 * scale > x + maxWidth) break;
      const rows = rowsOf(c);
      for (let r = 0; r < 7; r++)
        for (let col = 0; col < 5; col++)
          if (rows[r] & (16 >> col))
            for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) this.blend(at + col * scale + dx, y + r * scale + dy, 1);
      at += 6 * scale;
    }
  }
}

/** how wide a text is in the pixel font */
const textWidth = (s: string, scale: number) => Math.max(0, [...s].length * 6 - 1) * scale;

/** The picture of a seed: the SVG placeholder's gradient, circles and title, or an avatar's (a circle, transparent
 *  around it). */
export function paintPicture(o: { seed: string; title?: string; avatar?: boolean; w?: number; h?: number }): Picture {
  const [a, b] = colorsOfSeed(o.seed);
  if (o.avatar) return avatar(o.title ?? "", a, b, Math.max(8, Math.round(o.w ?? 128)));
  const w = Math.max(1, Math.round(o.w ?? 320));
  const h = Math.max(1, Math.round(o.h ?? 240));
  const c = new Canvas(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = ((x + 0.5) / w + (y + 0.5) / h) / 2;
      const i = (y * w + x) * 4;
      for (let j = 0; j < 3; j++) c.rgba[i + j] = Math.round(a[j] + (b[j] - a[j]) * t);
      c.rgba[i + 3] = 255;
    }
  /* the circles svgPicture draws, from the same numbers */
  const rng = rngOf(`svg:${o.seed}`);
  for (let k = 0; k < 3; k++) {
    const cx = rng.int(0, w);
    const cy = rng.int(0, h);
    const r = rng.int(Math.round(h / 6), Math.round(h / 2));
    c.disc(cx, cy, r, 0.08 + rng.next() * 0.14);
  }
  const title = drawable([...(o.title ?? "")].slice(0, 40).join(""));
  if (title) {
    const scale = Math.max(1, Math.round(h / 12 / 7));
    const x = Math.round(w * 0.06);
    c.text(title, x, Math.round(h * 0.9) - 7 * scale, scale, w - 2 * x);
  }
  return { w, h, rgba: c.rgba, alpha: false };
}

function avatar(name: string, a: readonly number[], b: readonly number[], s: number): Picture {
  const c = new Canvas(s, s);
  const r = s / 2;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const t = ((x + 0.5) / s + (y + 0.5) / s) / 2;
      for (let j = 0; j < 3; j++) c.rgba[i + j] = Math.round(a[j] + (b[j] - a[j]) * t);
      c.rgba[i + 3] = Math.round(255 * Math.max(0, Math.min(1, r - Math.hypot(x + 0.5 - r, y + 0.5 - r) + 0.5)));
    }
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length && /^[A-Za-z]/.test(words[0]) ? drawable(words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")) : "";
  if (initials) {
    const scale = Math.max(1, Math.round((s * (initials.length > 1 ? 0.27 : 0.32)) / 7));
    c.text(initials, Math.round((s - textWidth(initials, scale)) / 2), Math.round((s - 7 * scale) / 2), scale);
  } else {
    /* a head and shoulders, for a name in any script */
    c.disc(r, s * 0.4, s * 0.17, 0.92);
    for (let y = Math.floor(s * 0.62); y < s; y++)
      for (let x = 0; x < s; x++) {
        const dx = (x + 0.5 - r) / (s * 0.32);
        const dy = (y + 0.5 - s * 0.95) / (s * 0.3);
        if (dx * dx + dy * dy <= 1) c.blend(x, y, 0.92);
      }
  }
  return { w: s, h: s, rgba: c.rgba, alpha: true };
}

/** a picture laid over white: what a format without transparency (JPEG, BMP) shows */
export function opaque(p: Picture): Picture {
  if (!p.alpha) return p;
  const rgba = new Uint8Array(p.rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const k = p.rgba[i + 3] / 255;
    for (let j = 0; j < 3; j++) rgba[i + j] = Math.round(p.rgba[i + j] * k + 255 * (1 - k));
    rgba[i + 3] = 255;
  }
  return { ...p, rgba, alpha: false };
}
