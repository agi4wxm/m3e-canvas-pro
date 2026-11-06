/* Reading the colors of a picture, deterministically: the author's reference screenshot, or a screenshot of the
 * canvas, decoded to pixels (by the browser's own decoder where there is one, by a small PNG reader in Node and the
 * MCP server), then the colors that cover most of it, the color of a region, and where two pictures of one screen
 * differ most. What a model copying a screenshot would otherwise guess by eye. */

import { unzlibSync } from "fflate";

export type Pixels = { w: number; h: number; data: Uint8ClampedArray };
export type Rect = { x: number; y: number; w: number; h: number };

/* ---------- decoding ---------- */

const base64Bytes = (b64: string): Uint8Array => {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** the bytes a data URL carries, and their type */
export function dataUrlBytes(url: string): { type: string; bytes: Uint8Array } | null {
  const m = /^data:([\w/+.-]+);base64,([\s\S]*)$/i.exec(url.trim());
  return m ? { type: m[1].toLowerCase(), bytes: base64Bytes(m[2]) } : null;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** A PNG's pixels as RGBA: 8- and 16-bit gray, RGB, palette, gray with alpha and RGBA, not interlaced. What a
 *  browser's or Chromium's screenshot is. Throws on anything else. */
export function decodePng(bytes: Uint8Array): Pixels {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (sig.some((b, i) => bytes[i] !== b)) throw new Error("not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let color = 6;
  let interlace = 0;
  let palette: Uint8Array | undefined;
  let alpha: Uint8Array | undefined;
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      w = view.getUint32(at + 8);
      h = view.getUint32(at + 12);
      depth = body[8];
      color = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") alpha = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + len;
  }
  if (interlace) throw new Error("interlaced PNGs are not read");
  if (depth !== 8 && depth !== 16) throw new Error(`PNGs of ${depth} bits are not read`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color as 0 | 2 | 3 | 4 | 6];
  if (!channels) throw new Error("unknown PNG color type");
  const total = idat.reduce((n, c) => n + c.length, 0);
  const joined = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    joined.set(c, o);
    o += c.length;
  }
  const raw = unzlibSync(joined);
  const bpp = channels * (depth / 8);
  const stride = w * bpp;
  const rows = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = rows.subarray(y * stride, (y + 1) * stride);
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : undefined;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= bpp ? up[i - bpp] : 0;
      row[i] = (src[i] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0)) & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  const step = depth / 8;
  for (let p = 0; p < w * h; p++) {
    const s = p * bpp;
    const v = (k: number) => rows[s + k * step];
    let r: number, g: number, b: number, a = 255;
    if (color === 0) r = g = b = v(0);
    else if (color === 2) [r, g, b] = [v(0), v(1), v(2)];
    else if (color === 3) {
      const i = v(0);
      [r, g, b] = [palette?.[i * 3] ?? 0, palette?.[i * 3 + 1] ?? 0, palette?.[i * 3 + 2] ?? 0];
      a = alpha?.[i] ?? 255;
    } else if (color === 4) [r, g, b, a] = [v(0), v(0), v(0), v(1)];
    else [r, g, b, a] = [v(0), v(1), v(2), v(3)];
    data.set([r, g, b, a], p * 4);
  }
  return { w, h, data };
}

/** A picture's pixels: the browser decodes any picture it can show; elsewhere a PNG is read here. */
export async function readPixels(url: string): Promise<Pixels> {
  const g = globalThis as unknown as { createImageBitmap?: (b: Blob) => Promise<ImageBitmap>; OffscreenCanvas?: new (w: number, h: number) => OffscreenCanvas; document?: Document };
  if (g.createImageBitmap && (g.OffscreenCanvas || g.document)) {
    const blob = await (await fetch(url)).blob();
    const bmp = await g.createImageBitmap(blob);
    const canvas = g.OffscreenCanvas ? new g.OffscreenCanvas(bmp.width, bmp.height) : Object.assign(g.document!.createElement("canvas"), { width: bmp.width, height: bmp.height });
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("no 2d canvas to read the picture with");
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { w: img.width, h: img.height, data: img.data };
  }
  const got = dataUrlBytes(url);
  if (!got || got.type !== "image/png") throw new Error("only PNG pictures can be read here");
  return decodePng(got.bytes);
}

/* ---------- colors ---------- */

export const hexOf = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** how far apart two colors are, 0 to about 441 */
export const colorDistance = (a: string, b: string) => {
  const [x, y] = [rgbOf(a), rgbOf(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

const clampRect = (px: Pixels, r: Rect): Rect => {
  const x = Math.max(0, Math.min(px.w - 1, Math.floor(r.x)));
  const y = Math.max(0, Math.min(px.h - 1, Math.floor(r.y)));
  return { x, y, w: Math.max(1, Math.min(px.w - x, Math.round(r.w))), h: Math.max(1, Math.min(px.h - y, Math.round(r.h))) };
};

type Bucket = { n: number; r: number; g: number; b: number };

/** the pixels of a region in buckets of 16 levels a channel, read at most every `step` pixels; transparent ones skipped */
function buckets(px: Pixels, r: Rect): { map: Map<number, Bucket>; n: number } {
  const map = new Map<number, Bucket>();
  const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 40000)));
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += step)
    for (let x = r.x; x < r.x + r.w; x += step) {
      const i = (y * px.w + x) * 4;
      if (px.data[i + 3] < 128) continue;
      const [R, G, B] = [px.data[i], px.data[i + 1], px.data[i + 2]];
      const k = ((R >> 4) << 8) | ((G >> 4) << 4) | (B >> 4);
      const e = map.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += R;
      e.g += G;
      e.b += B;
      map.set(k, e);
      n++;
    }
  return { map, n };
}

export type Swatch = { hex: string; share: number };

/** The colors that cover most of a region, most first, each with the share of the region it covers (%). Neighbouring
 *  shades are one color. */
export function paletteOf(px: Pixels, region?: Rect, count = 8): Swatch[] {
  const r = clampRect(px, region ?? { x: 0, y: 0, w: px.w, h: px.h });
  const { map, n } = buckets(px, r);
  if (!n) return [];
  const sorted = [...map.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]).map(([, e]) => e);
  const merged: Bucket[] = [];
  for (const e of sorted) {
    const hex = hexOf(e.r / e.n, e.g / e.n, e.b / e.n);
    const near = merged.find((m) => colorDistance(hexOf(m.r / m.n, m.g / m.n, m.b / m.n), hex) < 28);
    if (near) {
      near.n += e.n;
      near.r += e.r;
      near.g += e.g;
      near.b += e.b;
    } else merged.push({ ...e });
  }
  return merged
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((m) => ({ hex: hexOf(m.r / m.n, m.g / m.n, m.b / m.n), share: Math.round((m.n / n) * 1000) / 10 }));
}

/** a region's color: the one covering most of it (its ground), and the average of all of it */
export function regionColor(px: Pixels, region: Rect): { dominant: string; average: string; second?: string } {
  const r = clampRect(px, region);
  const top = paletteOf(px, r, 2);
  let R = 0, G = 0, B = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 40000)));
  for (let y = r.y; y < r.y + r.h; y += step)
    for (let x = r.x; x < r.x + r.w; x += step) {
      const i = (y * px.w + x) * 4;
      R += px.data[i];
      G += px.data[i + 1];
      B += px.data[i + 2];
      n++;
    }
  return { dominant: top[0]?.hex ?? "#000000", average: hexOf(R / n, G / n, B / n), ...(top[1] && top[1].share >= 4 ? { second: top[1].hex } : {}) };
}

export type CellDiff = { x: number; y: number; w: number; h: number; reference: string; replica: string; distance: number };

/** Two pictures of one screen laid over each other in a grid of cells (the reference scaled to the replica's size):
 *  each cell's ground color in both, the cells that differ most first, and how alike they are overall (0–100). Cells
 *  are in the replica's pixels. */
export function compareGrid(reference: Pixels, replica: Pixels, cols = 4, rows = 8): { similarity: number; cells: CellDiff[] } {
  const cw = replica.w / cols;
  const ch = replica.h / rows;
  const sx = reference.w / replica.w;
  const sy = reference.h / replica.h;
  const cells: CellDiff[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const cell = { x: i * cw, y: j * ch, w: cw, h: ch };
      const a = regionColor(reference, { x: cell.x * sx, y: cell.y * sy, w: cell.w * sx, h: cell.h * sy });
      const b = regionColor(replica, cell);
      const distance = Math.round((colorDistance(a.dominant, b.dominant) * 2 + colorDistance(a.average, b.average)) / 3);
      cells.push({ x: Math.round(cell.x), y: Math.round(cell.y), w: Math.round(cw), h: Math.round(ch), reference: a.dominant, replica: b.dominant, distance });
    }
  const mean = cells.reduce((n, c) => n + c.distance, 0) / cells.length;
  return { similarity: Math.max(0, Math.round(100 - (mean / 441) * 100 * 2)), cells: [...cells].sort((a, b) => b.distance - a.distance || a.y - b.y || a.x - b.x) };
}
