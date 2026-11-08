/* The raster formats of a picture (lib/mocks/formats/raster.ts), each encoded here in a few dozen lines so the mock
 * library makes real files everywhere it runs: PNG (filtered rows, deflated), JPEG (baseline, its Huffman tables
 * made for the picture), WebP (lossless VP8L with a predictor), GIF (a palette of the picture's own colors, LZW),
 * BMP, ICO (a PNG inside) and TIFF (uncompressed). The title in any script goes into the file's text metadata where
 * the format has a place for it (PNG iTXt, JPEG comment, TIFF description). */

import { utf8 } from "../bytes";
import { BitSink, crc32, Sink, zlib } from "./deflate";
import { canonicalCodes, codeLengths } from "./huffman";
import { opaque, type Picture } from "./raster";

/* ---------- PNG ---------- */

function chunk(out: Sink, type: string, data: Uint8Array) {
  const head = Uint8Array.from(type, (c) => c.charCodeAt(0));
  out.u32be(data.length);
  out.put(head);
  out.put(data);
  out.u32be(crc32(data, crc32(head)));
}

/** A PNG of the picture: RGB, or RGBA when it has transparency; each row filtered the way that leaves the least. */
export function encodePng(p: Picture, title?: string): Uint8Array {
  const ch = p.alpha ? 4 : 3;
  const stride = p.w * ch;
  const raw = new Uint8Array((stride + 1) * p.h);
  const row = new Uint8Array(stride);
  const prevRow = new Uint8Array(stride);
  /* one row through a filter: written at `at` when given, its cost (how far its bytes are from zero) either way */
  const filter = (type: number, at = -1) => {
    let cost = 0;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0;
      const b = prevRow[i];
      const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, i >= ch ? prevRow[i - ch] : 0);
      const v = (row[i] - pred) & 255;
      if (at >= 0) raw[at + i] = v;
      cost += v < 128 ? v : 256 - v;
    }
    return cost;
  };
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) for (let j = 0; j < ch; j++) row[x * ch + j] = p.rgba[(y * p.w + x) * 4 + j];
    let bestType = 0;
    let bestCost = Infinity;
    for (let type = 0; type < 5; type++) {
      const cost = filter(type);
      if (cost < bestCost) {
        bestCost = cost;
        bestType = type;
      }
    }
    raw[y * (stride + 1)] = bestType;
    filter(bestType, y * (stride + 1) + 1);
    prevRow.set(row);
  }
  const out = new Sink();
  out.put(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
  const ihdr = new Sink();
  ihdr.u32be(p.w);
  ihdr.u32be(p.h);
  ihdr.put(Uint8Array.of(8, p.alpha ? 6 : 2, 0, 0, 0));
  chunk(out, "IHDR", ihdr.done());
  if (title) {
    /* iTXt: keyword, no compression, no language, the text in UTF-8 */
    const t = new Sink();
    t.ascii("Title");
    t.put(Uint8Array.of(0, 0, 0, 0, 0));
    t.put(utf8(title.slice(0, 200)));
    chunk(out, "iTXt", t.done());
  }
  chunk(out, "IDAT", zlib(raw));
  chunk(out, "IEND", new Uint8Array(0));
  return out.done();
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/* ---------- JPEG ---------- */

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
/* the example tables of the JPEG standard (annex K.1), in their natural order */
const LUMA_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const CHROMA_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...Array.from({ length: 32 }, () => 99)];

/* the scale of each of the AAN DCT's outputs (Arai, Agui, Nakajima), folded into the quantization */
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

/** One pass of the AAN DCT over eight samples of a block, `step` apart from `at`: the 2-D DCT is a pass over each row
 *  then over each column. Its outputs are scaled by AAN, which the quantization takes out. */
function dct8(d: Float64Array, at: number, step: number) {
  const d0 = d[at];
  const d1 = d[at + step];
  const d2 = d[at + 2 * step];
  const d3 = d[at + 3 * step];
  const d4 = d[at + 4 * step];
  const d5 = d[at + 5 * step];
  const d6 = d[at + 6 * step];
  const d7 = d[at + 7 * step];
  const t0 = d0 + d7;
  const t7 = d0 - d7;
  const t1 = d1 + d6;
  const t6 = d1 - d6;
  const t2 = d2 + d5;
  const t5 = d2 - d5;
  const t3 = d3 + d4;
  const t4 = d3 - d4;
  const t10 = t0 + t3;
  const t13 = t0 - t3;
  const t11 = t1 + t2;
  const t12 = t1 - t2;
  d[at] = t10 + t11;
  d[at + 4 * step] = t10 - t11;
  const z1 = (t12 + t13) * 0.707106781;
  d[at + 2 * step] = t13 + z1;
  d[at + 6 * step] = t13 - z1;
  const s10 = t4 + t5;
  const s11 = t5 + t6;
  const s12 = t6 + t7;
  const z5 = (s10 - s12) * 0.382683433;
  const z2 = 0.5411961 * s10 + z5;
  const z4 = 1.306562965 * s12 + z5;
  const z3 = s11 * 0.707106781;
  const z11 = t7 + z3;
  const z13 = t7 - z3;
  d[at + 5 * step] = z13 + z2;
  d[at + 3 * step] = z13 - z2;
  d[at + step] = z11 + z4;
  d[at + 7 * step] = z11 - z4;
}

/** the 2-D DCT of a block of 64 samples, in place, each output scaled by AAN[row] × AAN[column] × 8 */
function fdct(block: Float64Array) {
  for (let y = 0; y < 8; y++) dct8(block, y * 8, 1);
  for (let x = 0; x < 8; x++) dct8(block, x, 8);
}

/** bits written from the most significant end, a zero after every 0xFF, as JPEG's entropy data is */
class JpegBits {
  readonly out = new Sink();
  private acc = 0;
  private n = 0;
  /** at most 16 bits at a time */
  bits(value: number, count: number) {
    this.acc = (this.acc << count) | (value & ((1 << count) - 1));
    this.n += count;
    while (this.n >= 8) {
      const b = (this.acc >>> (this.n - 8)) & 255;
      this.out.byte(b);
      if (b === 0xff) this.out.byte(0);
      this.n -= 8;
    }
    this.acc &= (1 << this.n) - 1;
  }
  flush() {
    if (this.n) this.bits(0x7f, 8 - this.n);
  }
}

const bitLength = (v: number) => (v === 0 ? 0 : 32 - Math.clz32(Math.abs(v)));

/** a Huffman table for JPEG: lengths for its symbols (none of them all ones), as the DHT segment lists them */
function jpegTable(freqs: Float64Array): { counts: number[]; symbols: number[]; codes: Int32Array; lens: Uint8Array } {
  /* one more symbol, the rarest, takes the code of all ones, which JPEG may not use */
  const f = new Float64Array(257);
  f.set(freqs);
  f[256] = 0.5;
  const lengths = codeLengths(f, 16);
  const order = [...Array(257).keys()].filter((s) => lengths[s] > 0).sort((a, b) => lengths[a] - lengths[b] || (a === 256 ? 1 : b === 256 ? -1 : a - b));
  const counts = Array.from({ length: 17 }, () => 0);
  for (const s of order) counts[lengths[s]]++;
  const codes = new Int32Array(257);
  const lens = new Uint8Array(257);
  let c = 0;
  let len = 1;
  for (const s of order) {
    while (lengths[s] > len) {
      c <<= 1;
      len++;
    }
    codes[s] = c++;
    lens[s] = len;
  }
  counts[lengths[256]]--;
  return { counts: counts.slice(1), symbols: order.filter((s) => s !== 256), codes, lens };
}

/** A baseline JPEG of the picture (laid over white), 4:4:4, quality 0–100. */
export function encodeJpeg(pic: Picture, o: { quality?: number; comment?: string } = {}): Uint8Array {
  const p = opaque(pic);
  const q = Math.max(1, Math.min(100, o.quality ?? 82));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  const qt = (base: number[]) => base.map((v) => Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))));
  const tables = [qt(LUMA_Q), qt(CHROMA_Q)];
  /* what each output of the DCT is divided by: its quantizer, and the scale the AAN DCT leaves on it */
  const divisors = tables.map((t) => t.map((v, i) => v * AAN[i >> 3] * AAN[i & 7] * 8));
  const bw = Math.ceil(p.w / 8);
  const bh = Math.ceil(p.h / 8);
  /* the picture in Y, Cb and Cr, each centred on zero */
  const n = p.w * p.h;
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const r = p.rgba[i * 4];
    const g = p.rgba[i * 4 + 1];
    const b = p.rgba[i * 4 + 2];
    planes[0][i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
    planes[1][i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
    planes[2][i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  /* every block of the three components, quantized, in zigzag order */
  const count = bw * bh * 3;
  const all = new Int16Array(count * 64);
  const blocks = Array.from({ length: count }, (_, k) => all.subarray(k * 64, k * 64 + 64));
  const sample = new Float64Array(64);
  let next = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++)
      for (let comp = 0; comp < 3; comp++) {
        const plane = planes[comp];
        for (let y = 0; y < 8; y++) {
          const row = Math.min(p.h - 1, by * 8 + y) * p.w;
          for (let x = 0; x < 8; x++) sample[y * 8 + x] = plane[row + Math.min(p.w - 1, bx * 8 + x)];
        }
        fdct(sample);
        const div = divisors[comp === 0 ? 0 : 1];
        const zz = blocks[next++];
        for (let k = 0; k < 64; k++) zz[k] = Math.round(sample[ZIGZAG[k]] / div[ZIGZAG[k]]);
      }
  /* how often each symbol comes, then the codes made for them */
  const freq = [new Float64Array(256), new Float64Array(256), new Float64Array(256), new Float64Array(256)];
  const walk = (emit: (table: number, sym: number, extra: number, size: number) => void) => {
    const last = [0, 0, 0];
    blocks.forEach((zz, n) => {
      const comp = n % 3;
      const dcT = comp === 0 ? 0 : 1;
      const acT = comp === 0 ? 2 : 3;
      const diff = zz[0] - last[comp];
      last[comp] = zz[0];
      const s = bitLength(diff);
      emit(dcT, s, diff < 0 ? diff + (1 << s) - 1 : diff, s);
      let run = 0;
      for (let k = 1; k < 64; k++) {
        const v = zz[k];
        if (v === 0) {
          run++;
          continue;
        }
        while (run > 15) {
          emit(acT, 0xf0, 0, 0);
          run -= 16;
        }
        const size = bitLength(v);
        emit(acT, (run << 4) | size, v < 0 ? v + (1 << size) - 1 : v, size);
        run = 0;
      }
      if (run > 0) emit(acT, 0, 0, 0);
    });
  };
  walk((t, sym) => freq[t][sym]++);
  const huff = freq.map(jpegTable);
  const out = new Sink();
  const segment = (marker: number, body: Uint8Array) => {
    out.u16be(marker);
    out.u16be(body.length + 2);
    out.put(body);
  };
  out.u16be(0xffd8);
  segment(0xffe0, Uint8Array.of(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0));
  if (o.comment) segment(0xfffe, utf8(o.comment).subarray(0, 60000));
  const dqt = new Sink();
  tables.forEach((t, id) => {
    dqt.byte(id);
    for (let k = 0; k < 64; k++) dqt.byte(t[ZIGZAG[k]]);
  });
  segment(0xffdb, dqt.done());
  const sof = new Sink();
  sof.byte(8);
  sof.u16be(p.h);
  sof.u16be(p.w);
  sof.byte(3);
  sof.put(Uint8Array.of(1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1));
  segment(0xffc0, sof.done());
  const dht = new Sink();
  [0x00, 0x01, 0x10, 0x11].forEach((cls) => {
    const t = huff[(cls >> 4) * 2 + (cls & 15)];
    dht.byte(cls);
    for (const c of t.counts) dht.byte(c);
    for (const s of t.symbols) dht.byte(s);
  });
  segment(0xffc4, dht.done());
  segment(0xffda, Uint8Array.of(3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0));
  const bits = new JpegBits();
  walk((t, sym, extra, size) => {
    bits.bits(huff[t].codes[sym], huff[t].lens[sym]);
    if (size) bits.bits(extra, size);
  });
  bits.flush();
  out.put(bits.out.done());
  out.u16be(0xffd9);
  return out.done();
}

/* ---------- GIF ---------- */

/** A GIF89a of the picture: a palette of its most common colors (at 5 bits a channel), one index kept for
 *  transparency when it has some, the pixels LZW-coded. */
export function encodeGif(p: Picture, comment?: string): Uint8Array {
  const key = (i: number) => ((p.rgba[i] >> 3) << 10) | ((p.rgba[i + 1] >> 3) << 5) | (p.rgba[i + 2] >> 3);
  const count = new Map<number, number>();
  const n = p.w * p.h;
  for (let i = 0; i < n; i++) if (!p.alpha || p.rgba[i * 4 + 3] >= 128) count.set(key(i * 4), (count.get(key(i * 4)) ?? 0) + 1);
  const room = p.alpha ? 255 : 256;
  const palette = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, room).map(([k]) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
  if (!palette.length) palette.push([0, 0, 0]);
  const nearest = new Map<number, number>();
  const indexOf = (k: number) => {
    let best = nearest.get(k);
    if (best !== undefined) return best;
    const [r, g, b] = [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4];
    let dist = Infinity;
    best = 0;
    palette.forEach(([pr, pg, pb], i) => {
      const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    nearest.set(k, best);
    return best;
  };
  const transparent = 255;
  const pixels = new Uint8Array(n);
  for (let i = 0; i < n; i++) pixels[i] = p.alpha && p.rgba[i * 4 + 3] < 128 ? transparent : indexOf(key(i * 4));
  const out = new Sink();
  out.ascii("GIF89a");
  out.u16le(p.w);
  out.u16le(p.h);
  out.put(Uint8Array.of(0xf7, 0, 0));
  for (let i = 0; i < 256; i++) out.put(Uint8Array.from(palette[i] ?? [0, 0, 0]));
  if (comment) {
    const text = [...comment].filter((c) => c >= " " && c <= "~").join("").slice(0, 255);
    if (text) {
      out.put(Uint8Array.of(0x21, 0xfe, text.length));
      out.ascii(text);
      out.byte(0);
    }
  }
  if (p.alpha) out.put(Uint8Array.of(0x21, 0xf9, 4, 1, 0, 0, transparent, 0));
  out.byte(0x2c);
  out.u16le(0);
  out.u16le(0);
  out.u16le(p.w);
  out.u16le(p.h);
  out.byte(0);
  out.byte(8);
  const data = lzw(pixels, 8);
  for (let i = 0; i < data.length; i += 255) {
    const part = data.subarray(i, i + 255);
    out.byte(part.length);
    out.put(part);
  }
  out.byte(0);
  out.byte(0x3b);
  return out.done();
}

/** GIF's LZW: codes grow from min+1 bits to 12, a clear code when the table is full */
function lzw(pixels: Uint8Array, min: number): Uint8Array {
  const bits = new BitSink();
  const clear = 1 << min;
  const eoi = clear + 1;
  let size = min + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();
  bits.bits(clear, size);
  if (!pixels.length) {
    bits.bits(eoi, size);
    return bits.done();
  }
  let code = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (code << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      code = found;
      continue;
    }
    bits.bits(code, size);
    if (next === 4096) {
      bits.bits(clear, size);
      next = eoi + 1;
      size = min + 1;
      table = new Map();
    } else {
      if (next >= 1 << size) size++;
      table.set(key, next++);
    }
    code = k;
  }
  bits.bits(code, size);
  bits.bits(eoi, size);
  return bits.done();
}

/* ---------- WebP (lossless) ---------- */

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** one prefix code of VP8L, written as the decoder reads it; what each symbol is written with */
function writePrefixCode(bits: BitSink, freqs: Uint32Array): { lengths: number[]; codes: number[] } {
  const used: number[] = [];
  for (let i = 0; i < freqs.length; i++) if (freqs[i]) used.push(i);
  if (used.length <= 1) {
    /* a simple code of one symbol, which takes no bits */
    const s = used[0] ?? 0;
    bits.bits(1, 1);
    bits.bits(0, 1);
    if (s < 2) {
      bits.bits(0, 1);
      bits.bits(s, 1);
    } else {
      bits.bits(1, 1);
      bits.bits(s, 8);
    }
    return { lengths: Array.from({ length: freqs.length }, () => 0), codes: Array.from({ length: freqs.length }, () => 0) };
  }
  const lengths = codeLengths(freqs, 15);
  const codes = canonicalCodes(lengths);
  /* the code lengths, written with a code of their own (its lengths at most 7, three bits each) */
  const lenFreq = new Uint32Array(19);
  for (const l of lengths) lenFreq[l]++;
  const lenLengths = codeLengths(lenFreq, 7);
  const lenCodes = canonicalCodes(lenLengths);
  let count = 19;
  while (count > 4 && lenLengths[CODE_LENGTH_ORDER[count - 1]] === 0) count--;
  bits.bits(0, 1);
  bits.bits(count - 4, 4);
  for (let i = 0; i < count; i++) bits.bits(lenLengths[CODE_LENGTH_ORDER[i]], 3);
  /* every symbol's length is written (no max_symbol) */
  bits.bits(0, 1);
  const single = lenLengths.filter((l) => l > 0).length === 1;
  for (const l of lengths) if (!single) bits.code(lenCodes[l], lenLengths[l]);
  return { lengths, codes };
}

/** A lossless WebP of the picture: one predictor for the whole picture (L + T − TL, which leaves a gradient almost
 *  nothing to say), its residuals Huffman-coded a channel at a time. */
export function encodeWebp(p: Picture): Uint8Array {
  const { w, h, rgba } = p;
  const n = w * h;
  /* the residual of each channel (green, red, blue, alpha: the order VP8L writes them) after the predictor */
  const residual = [1, 0, 2, 3].map((c) => {
    const v = new Uint8Array(n);
    for (let i = 0; i < n; i++) v[i] = rgba[i * 4 + c];
    const out = new Uint8Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const pred = x === 0 && y === 0 ? (c === 3 ? 255 : 0) : y === 0 ? v[i - 1] : x === 0 ? v[i - w] : Math.max(0, Math.min(255, v[i - 1] + v[i - w] - v[i - w - 1]));
        out[i] = (v[i] - pred) & 255;
      }
    return out;
  });
  const bits = new BitSink();
  bits.bits(0x2f, 8);
  bits.bits(w - 1, 14);
  bits.bits(h - 1, 14);
  bits.bits(p.alpha ? 1 : 0, 1);
  bits.bits(0, 3);
  /* the predictor transform: blocks of 512, so one block (or a few) whose mode is 12 */
  bits.bits(1, 1);
  bits.bits(0, 2);
  const sizeBits = 9;
  bits.bits(sizeBits - 2, 3);
  const blocks = Math.ceil(w / (1 << sizeBits)) * Math.ceil(h / (1 << sizeBits));
  /* the sub-image of modes: no color cache, five codes of one symbol each (green 12, the rest 0) */
  bits.bits(0, 1);
  const one = (sym: number, size: number) => {
    const f = new Uint32Array(size);
    f[sym] = blocks;
    writePrefixCode(bits, f);
  };
  one(12, 280);
  one(0, 256);
  one(0, 256);
  one(0, 256);
  one(0, 40);
  bits.bits(0, 1);
  /* the picture itself: no color cache, no meta codes, then green, red, blue, alpha and distance */
  bits.bits(0, 1);
  bits.bits(0, 1);
  const freqs = [new Uint32Array(280), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let k = 0; k < 4; k++) for (let i = 0; i < n; i++) freqs[k][residual[k][i]]++;
  const codes = freqs.map((f) => writePrefixCode(bits, f));
  writePrefixCode(bits, new Uint32Array(40));
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 4; k++) {
      const v = residual[k][i];
      const len = codes[k].lengths[v];
      if (len) bits.code(codes[k].codes[v], len);
    }
  const vp8l = bits.done();
  const out = new Sink();
  const pad = vp8l.length & 1;
  out.ascii("RIFF");
  out.u32le(4 + 8 + vp8l.length + pad);
  out.ascii("WEBPVP8L");
  out.u32le(vp8l.length);
  out.put(vp8l);
  if (pad) out.byte(0);
  return out.done();
}

/* ---------- BMP, ICO, TIFF ---------- */

/** a 24-bit BMP, bottom row first, laid over white */
export function encodeBmp(pic: Picture): Uint8Array {
  const p = opaque(pic);
  const stride = (p.w * 3 + 3) & ~3;
  const out = new Sink();
  out.ascii("BM");
  out.u32le(54 + stride * p.h);
  out.u32le(0);
  out.u32le(54);
  out.u32le(40);
  out.u32le(p.w);
  out.u32le(p.h);
  out.u16le(1);
  out.u16le(24);
  out.u32le(0);
  out.u32le(stride * p.h);
  out.u32le(2835);
  out.u32le(2835);
  out.u32le(0);
  out.u32le(0);
  for (let y = p.h - 1; y >= 0; y--) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      out.byte(p.rgba[i + 2]);
      out.byte(p.rgba[i + 1]);
      out.byte(p.rgba[i]);
    }
    for (let k = p.w * 3; k < stride; k++) out.byte(0);
  }
  return out.done();
}

/** an icon of one size, a PNG inside (as Windows Vista and every browser read them) */
export function encodeIco(p: Picture): Uint8Array {
  const png = encodePng(p);
  const out = new Sink();
  out.u16le(0);
  out.u16le(1);
  out.u16le(1);
  out.byte(p.w >= 256 ? 0 : p.w);
  out.byte(p.h >= 256 ? 0 : p.h);
  out.byte(0);
  out.byte(0);
  out.u16le(1);
  out.u16le(32);
  out.u32le(png.length);
  out.u32le(22);
  out.put(png);
  return out.done();
}

/** a baseline TIFF: RGB or RGBA, one uncompressed strip, the title as its description */
export function encodeTiff(p: Picture, title?: string): Uint8Array {
  const ch = p.alpha ? 4 : 3;
  const pixels = new Uint8Array(p.w * p.h * ch);
  for (let i = 0; i < p.w * p.h; i++) for (let j = 0; j < ch; j++) pixels[i * ch + j] = p.rgba[i * 4 + j];
  const desc = title ? [...title].filter((c) => c >= " " && c <= "~").join("") : "";
  /* the directory's entries, by tag: [tag, type, values]; type 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL */
  const entries: [number, number, number[] | string][] = [
    [256, 4, [p.w]],
    [257, 4, [p.h]],
    [258, 3, Array.from({ length: ch }, () => 8)],
    [259, 3, [1]],
    [262, 3, [2]],
    ...(desc ? [[270, 2, `${desc}\0`] as [number, number, string]] : []),
    [273, 4, [0]],
    [277, 3, [ch]],
    [278, 4, [p.h]],
    [279, 4, [pixels.length]],
    [282, 5, [72, 1]],
    [283, 5, [72, 1]],
    [284, 3, [1]],
    [296, 3, [2]],
    ...(p.alpha ? [[338, 3, [2]] as [number, number, number[]]] : []),
  ];
  const sizeOf = (type: number, v: number[] | string) => (type === 2 ? (v as string).length : type === 3 ? 2 * v.length : type === 5 ? 4 * v.length : 4 * v.length);
  const countOf = (type: number, v: number[] | string) => (type === 5 ? v.length / 2 : v.length);
  const ifdAt = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let extraAt = ifdAt + ifdSize;
  const extra = new Sink();
  const placed = entries.map(([tag, type, v]) => {
    const size = sizeOf(type, v);
    if (size <= 4) return { tag, type, v, at: -1 };
    const at = extraAt + extra.length;
    if (type === 2) extra.ascii(v as string);
    else for (const n of v as number[]) if (type === 3) extra.u16le(n);
      else extra.u32le(n);
    if (extra.length & 1) extra.byte(0);
    return { tag, type, v, at };
  });
  extraAt += extra.length;
  const stripAt = extraAt;
  const out = new Sink();
  out.ascii("II");
  out.u16le(42);
  out.u32le(ifdAt);
  out.u16le(entries.length);
  for (const e of placed) {
    out.u16le(e.tag);
    out.u16le(e.type);
    out.u32le(countOf(e.type, e.v));
    if (e.at >= 0) out.u32le(e.at);
    else {
      const vals = e.tag === 273 ? [stripAt] : (e.v as number[] | string);
      const start = out.length;
      if (e.type === 2) out.ascii(vals as string);
      else for (const n of vals as number[]) if (e.type === 3) out.u16le(n);
        else out.u32le(n);
      while (out.length < start + 4) out.byte(0);
    }
  }
  out.u32le(0);
  out.put(extra.done());
  out.put(pixels);
  return out.done();
}
