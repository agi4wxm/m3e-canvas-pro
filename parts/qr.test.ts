import { describe, expect, it } from "vitest";
import { qrMatrix, qrRemainder } from "./widgets/AppTools";

/* The QR code is the one part whose drawing has to be exactly right to work at all. This reads a
 * drawn symbol back the way a scanner does, from the standard rather than from the encoder: it finds
 * the format bits, unmasks, walks the data, checks every block's Reed-Solomon syndromes and parses
 * the message. */

const LOG: number[] = [];
const EXP: number[] = [];
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = x & 0x80 ? ((x << 1) ^ 0x11d) & 0xff : x << 1;
}

/** the polynomial's value at alpha^power, highest coefficient first */
const evaluate = (poly: number[], power: number) => poly.reduce((sum, c) => (sum === 0 ? 0 : EXP[(LOG[sum] + power) % 255]) ^ c, 0);

/** ISO/IEC 18004 table 9, versions 1 to 10: [ecc per block, blocks] by level */
const BLOCKS: Record<string, [number, number][]> = {
  L: [[7, 1], [10, 1], [15, 1], [20, 1], [26, 1], [18, 2], [20, 2], [24, 2], [30, 2], [18, 4]],
  M: [[10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5]],
  Q: [[13, 1], [22, 1], [18, 2], [26, 2], [18, 4], [24, 4], [18, 6], [22, 6], [20, 8], [24, 8]],
  H: [[17, 1], [28, 1], [22, 2], [16, 4], [22, 4], [28, 4], [26, 5], [26, 6], [24, 8], [28, 8]],
};
/** ISO/IEC 18004 annex E: where the alignment patterns are centered */
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const LEVEL_OF: Record<number, string> = { 1: "L", 0: "M", 3: "Q", 2: "H" };
const MASKS: ((y: number, x: number) => boolean)[] = [(y, x) => (y + x) % 2 === 0, (y) => y % 2 === 0, (_, x) => x % 3 === 0, (y, x) => (y + x) % 3 === 0, (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0, (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0, (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0];

function read(m: boolean[][]) {
  const size = m.length;
  const version = (size - 17) / 4;
  /* format bits, the copy around the top-left finder, bit 14 first */
  const spots = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  let word = 0;
  spots.forEach(([x, y], i) => (word |= (m[y][x] ? 1 : 0) << i));
  const second = [...Array(8).keys()].map((i) => [size - 1 - i, 8]).concat([...Array(7).keys()].map((i) => [8, size - 7 + i]));
  let copy = 0;
  second.forEach(([x, y], i) => (copy |= (m[y][x] ? 1 : 0) << i));
  expect(copy).toBe(word);
  const format = word ^ 0x5412;
  /* a valid format word divides by the BCH generator */
  let rest = format;
  for (let i = 14; i >= 10; i--) if ((rest >>> i) & 1) rest ^= 0x537 << (i - 10);
  expect(rest).toBe(0);
  const level = LEVEL_OF[format >>> 13];
  const mask = (format >>> 10) & 7;

  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const box = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) reserved[y][x] = true;
  };
  box(0, 0, 9, 9);
  box(size - 8, 0, 8, 9);
  box(0, size - 8, 9, 8);
  box(6, 0, 1, size);
  box(0, 6, size, 1);
  const align = ALIGN[version - 1];
  for (const cy of align) for (const cx of align) if (!((cx === 6 && cy === 6) || (cx === 6 && cy === align[align.length - 1]) || (cy === 6 && cx === align[align.length - 1]))) box(cx - 2, cy - 2, 5, 5);
  if (version >= 7) {
    box(size - 11, 0, 3, 6);
    box(0, size - 11, 6, 3);
  }

  const bits: number[] = [];
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    for (let k = 0; k < size; k++) {
      const y = up ? size - 1 - k : k;
      for (const x of [right, right - 1]) if (!reserved[y][x]) bits.push(m[y][x] !== MASKS[mask](y, x) ? 1 : 0);
    }
    up = !up;
  }
  const codewords = Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));

  const [ecc, count] = BLOCKS[level][version - 1];
  const dataTotal = codewords.length - ecc * count;
  const short = Math.floor(dataTotal / count);
  const longFrom = count - (dataTotal % count);
  const blocks = Array.from({ length: count }, () => [] as number[]);
  let at = 0;
  for (let i = 0; i <= short; i++) for (let b = 0; b < count; b++) if (i < short || b >= longFrom) blocks[b].push(codewords[at++]);
  const data = blocks.flat();
  for (let i = 0; i < ecc; i++) for (let b = 0; b < count; b++) blocks[b].push(codewords[at++]);
  for (const block of blocks) for (let p = 0; p < ecc; p++) expect(evaluate(block, p), `syndrome ${p}`).toBe(0);

  const stream = data.flatMap((c) => [...Array(8).keys()].map((i) => (c >>> (7 - i)) & 1));
  const take = (from: number, n: number) => stream.slice(from, from + n).reduce((a, b) => (a << 1) | b, 0);
  expect(take(0, 4)).toBe(0b0100);
  const lengthBits = version <= 9 ? 8 : 16;
  const length = take(4, lengthBits);
  const bytes = Array.from({ length }, (_, i) => take(4 + lengthBits + i * 8, 8));
  return { version, level, mask, text: new TextDecoder().decode(new Uint8Array(bytes)) };
}

describe("qr code", () => {
  it("computes the error correction of the worked example everyone checks against", () => {
    /* "HELLO WORLD", version 1-M */
    expect(qrRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("reads back what it drew, at every level and every version it reaches", () => {
    const seen = new Set<number>();
    for (const level of ["L", "M", "Q", "H"])
      for (const length of [0, 1, 7, 14, 20, 32, 46, 60, 77, 92, 106, 122, 136, 154, 180, 213, 240, 271]) {
        const text = "https://example.com/扫码".repeat(20).slice(0, length);
        const m = qrMatrix(text, level);
        if (!m) continue;
        const back = read(m);
        seen.add(back.version);
        expect(back.level).toBe(level);
        expect(back.text).toBe(text);
      }
    expect([...seen].toSorted((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("writes the version bits the standard lists for version 7", () => {
    const m = qrMatrix("x".repeat(110), "M")!;
    expect(m.length).toBe(45);
    let word = 0;
    for (let i = 0; i < 18; i++) word |= (m[Math.floor(i / 3)][45 - 11 + (i % 3)] ? 1 : 0) << i;
    expect(word).toBe(0x07c94);
  });

  it("says when the words do not fit rather than drawing something unreadable", () => {
    expect(qrMatrix("x".repeat(272), "L")).toBeNull();
    expect(qrMatrix("x".repeat(271), "L")).not.toBeNull();
  });
});
