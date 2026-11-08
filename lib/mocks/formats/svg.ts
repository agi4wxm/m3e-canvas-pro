/* The mock library's picture as SVG: a gradient with soft shapes and the record's title, or a face's initials for an
 * avatar. Small enough that a list of a thousand avatars costs little; the raster formats paint the same picture
 * (lib/mocks/formats/raster.ts). */

import { hash53, rngOf } from "../rng";

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

/** two colors that go together, from a seed */
function colorsOf(seed: string): [string, string] {
  const h = hash53(seed) % 360;
  return [`hsl(${h} 62% 58%)`, `hsl(${(h + 48) % 360} 68% 42%)`];
}

/** the first letters of a name: two for a Latin name, one character otherwise */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const latin = /^[A-Za-z]/.test(words[0]);
  if (latin) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  /* a Chinese, Japanese or Korean name: its first character, the family name */
  return [...words[0]][0];
}

/** an SVG picture: a gradient with soft shapes and a title, or (avatar) a face's initials on a circle */
export function svgPicture(o: { seed: string; title?: string; avatar?: boolean; w?: number; h?: number }): string {
  const [a, b] = colorsOf(o.seed);
  const rng = rngOf(`svg:${o.seed}`);
  if (o.avatar) {
    const s = 128;
    const text = xml(initialsOf(o.title ?? "?"));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${s}" height="${s}" rx="${s / 2}" fill="url(#g)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${text.length > 1 ? 48 : 56}" font-weight="600" fill="#fff">${text}</text></svg>`;
  }
  const w = o.w ?? 640;
  const h = o.h ?? 480;
  const circles = Array.from({ length: 3 }, () => `<circle cx="${rng.int(0, w)}" cy="${rng.int(0, h)}" r="${rng.int(Math.round(h / 6), Math.round(h / 2))}" fill="#fff" fill-opacity="${(0.08 + rng.next() * 0.14).toFixed(2)}"/>`).join("");
  const title = o.title ? `<text x="${Math.round(w * 0.06)}" y="${Math.round(h * 0.9)}" font-family="system-ui, sans-serif" font-size="${Math.round(h / 12)}" font-weight="600" fill="#fff">${xml([...o.title].slice(0, 40).join(""))}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${circles}${title}</svg>`;
}
