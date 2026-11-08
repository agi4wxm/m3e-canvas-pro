/* DEFLATE (RFC 1951) and its wrappers, zlib (RFC 1950) and gzip (RFC 1952), written out by hand: PNG, ZIP, the
 * Office files and .gz all need it, and the mock library may not lean on the platform (a mini-program has no
 * CompressionStream, React Native no zlib). LZ77 over a 32 KB window with the fixed Huffman codes: a few times smaller
 * than the raw bytes for pictures and tables, which is all a mock file needs. Stored blocks when that is smaller. */

/** bytes that grow as they are written */
export class Sink {
  bytes = new Uint8Array(1024);
  length = 0;
  private room(n: number) {
    if (this.length + n <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
  }
  byte(b: number) {
    this.room(1);
    this.bytes[this.length++] = b & 255;
  }
  put(b: Uint8Array) {
    this.room(b.length);
    this.bytes.set(b, this.length);
    this.length += b.length;
  }
  u16le(n: number) {
    this.byte(n);
    this.byte(n >>> 8);
  }
  u32le(n: number) {
    this.u16le(n & 0xffff);
    this.u16le(n >>> 16);
  }
  u16be(n: number) {
    this.byte(n >>> 8);
    this.byte(n);
  }
  u32be(n: number) {
    this.u16be(n >>> 16);
    this.u16be(n & 0xffff);
  }
  /** ASCII text, a byte a character */
  ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  done(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/** bits written from the least significant end, as DEFLATE and WebP lossless read them */
export class BitSink {
  readonly out = new Sink();
  private acc = 0;
  private n = 0;
  bits(value: number, count: number) {
    for (let done = 0; done < count; ) {
      const take = Math.min(16, count - done);
      this.acc |= ((value >>> done) & ((1 << take) - 1)) << this.n;
      this.n += take;
      done += take;
      while (this.n >= 8) {
        this.out.byte(this.acc & 255);
        this.acc >>>= 8;
        this.n -= 8;
      }
    }
  }
  /** a Huffman code, whose first bit is its most significant one */
  code(code: number, length: number) {
    this.bits(reverse(code, length), length);
  }
  align() {
    if (this.n > 0) this.bits(0, 8 - this.n);
  }
  done(): Uint8Array {
    this.align();
    return this.out.done();
  }
}

/** the lowest `length` bits of a number, the other way round */
export function reverse(code: number, length: number): number {
  let out = 0;
  for (let i = 0; i < length; i++) out = (out << 1) | ((code >>> i) & 1);
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (ISO 3309), as ZIP, gzip and PNG check their bytes; `crc` goes on from an earlier part's */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32, the check zlib streams end with */
export function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; ) {
    /* short enough runs that the sums stay small integers between the reductions */
    const end = Math.min(bytes.length, i + 3800);
    for (; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

/** the length code (0–28) of each match length 3–258 */
const LEN_CODE = (() => {
  const t = new Uint8Array(259);
  for (let c = 0; c < 29; c++) for (let l = LEN_BASE[c]; l < (c === 28 ? 259 : LEN_BASE[c + 1]); l++) t[l] = c;
  t[258] = 28;
  return t;
})();

function distCode(d: number): number {
  let c = 0;
  while (c < 29 && DIST_BASE[c + 1] <= d) c++;
  return c;
}

/** a symbol of the fixed literal/length code (RFC 1951 3.2.6) */
function fixed(bits: BitSink, sym: number) {
  if (sym < 144) bits.code(0x30 + sym, 8);
  else if (sym < 256) bits.code(0x190 + sym - 144, 9);
  else if (sym < 280) bits.code(sym - 256, 7);
  else bits.code(0xc0 + sym - 280, 8);
}

const WINDOW = 32768;
const HASH = 1 << 15;
const MAX_CHAIN = 48;

/** raw DEFLATE: one block of fixed codes, or stored blocks when those are smaller */
export function deflateRaw(data: Uint8Array): Uint8Array {
  const bits = new BitSink();
  bits.bits(1, 1);
  bits.bits(1, 2);
  const n = data.length;
  const head = new Int32Array(HASH).fill(-1);
  const prev = new Int32Array(WINDOW).fill(-1);
  const hashAt = (i: number) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (HASH - 1);
  const insert = (i: number) => {
    if (i + 2 >= n) return;
    const h = hashAt(i);
    prev[i & (WINDOW - 1)] = head[h];
    head[h] = i;
  };
  let i = 0;
  while (i < n) {
    let best = 0;
    let dist = 0;
    if (i + 2 < n) {
      let cand = head[hashAt(i)];
      let chain = MAX_CHAIN;
      const max = Math.min(258, n - i);
      while (cand >= 0 && i - cand <= WINDOW && chain-- > 0) {
        if (data[cand + best] === data[i + best]) {
          let len = 0;
          while (len < max && data[cand + len] === data[i + len]) len++;
          if (len > best) {
            best = len;
            dist = i - cand;
            if (len === max) break;
          }
        }
        const next = prev[cand & (WINDOW - 1)];
        /* a slot written over by a later position ends the chain */
        if (next >= cand) break;
        cand = next;
      }
    }
    if (best >= 3) {
      const lc = LEN_CODE[best];
      fixed(bits, 257 + lc);
      if (LEN_EXTRA[lc]) bits.bits(best - LEN_BASE[lc], LEN_EXTRA[lc]);
      const dc = distCode(dist);
      bits.code(dc, 5);
      if (DIST_EXTRA[dc]) bits.bits(dist - DIST_BASE[dc], DIST_EXTRA[dc]);
      for (let k = 0; k < best; k++) insert(i + k);
      i += best;
    } else {
      fixed(bits, data[i]);
      insert(i);
      i++;
    }
  }
  fixed(bits, 256);
  const packed = bits.done();
  const stored = 5 * Math.max(1, Math.ceil(n / 65535)) + n;
  return packed.length <= stored ? packed : storedBlocks(data);
}

function storedBlocks(data: Uint8Array): Uint8Array {
  const out = new Sink();
  let at = 0;
  do {
    const len = Math.min(65535, data.length - at);
    out.byte(at + len >= data.length ? 1 : 0);
    out.u16le(len);
    out.u16le(~len & 0xffff);
    out.put(data.subarray(at, at + len));
    at += len;
  } while (at < data.length);
  return out.done();
}

/** a zlib stream, as PNG holds its pixels */
export function zlib(data: Uint8Array): Uint8Array {
  const out = new Sink();
  out.byte(0x78);
  out.byte(0x9c);
  out.put(deflateRaw(data));
  out.u32be(adler32(data));
  return out.done();
}

/** a .gz file; the name is kept when it is Latin-1 */
export function gzip(data: Uint8Array, name?: string): Uint8Array {
  const out = new Sink();
  const keepName = !!name && [...name].every((c) => c.charCodeAt(0) > 0 && c.charCodeAt(0) < 256);
  out.put(Uint8Array.of(0x1f, 0x8b, 8, keepName ? 8 : 0, 0, 0, 0, 0, 0, 255));
  if (keepName) {
    for (const c of name!) out.byte(c.charCodeAt(0));
    out.byte(0);
  }
  out.put(deflateRaw(data));
  out.u32le(crc32(data));
  out.u32le(data.length >>> 0);
  return out.done();
}
