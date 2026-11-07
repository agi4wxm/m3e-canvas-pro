/* Made-up values that are the same every time: a small seeded generator (sfc32) whose seed is the hash of a key.
 * Each value has its own key (the seed, the model, the record's index, the field's path), so adding a field to a
 * model changes no other field's value, and generating in another order gives the same data. */

/** a 53-bit hash of a text (cyrb53): well spread, the same everywhere */
export function hash53(s: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export type Rng = {
  /** 0 ≤ x < 1 */
  next(): number;
  /** a whole number from min to max, both included */
  int(min: number, max: number): number;
  /** a number from min to max */
  float(min: number, max: number): number;
  /** one of a list (undefined for an empty one) */
  pick<T>(list: readonly T[]): T;
  /** true this often (0–1) */
  chance(p: number): boolean;
  /** one of the keys, as often as its weight says */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
};

/** a generator from a key: the same key, the same numbers */
export function rngOf(key: string): Rng {
  const h = hash53(key);
  let a = h >>> 0;
  let b = Math.floor(h / 4294967296) >>> 0;
  let c = hash53(key, 7) >>> 0;
  let d = 1;
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
  /* the first numbers of sfc32 still look like the seed */
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    next,
    int: (min, max) => {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return hi <= lo ? lo : lo + Math.floor(next() * (hi - lo + 1));
    },
    float: (min, max) => (max <= min ? min : min + next() * (max - min)),
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    weighted<T>(items: readonly T[], weight: (item: T) => number): T {
      const weights = items.map((x) => Math.max(0, weight(x)));
      const total = weights.reduce((s, w) => s + w, 0);
      if (!(total > 0)) return items[Math.floor(next() * items.length)];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
  return rng;
}

/** a key's numbers as hexadecimal, n digits */
export function hexOf(rng: Rng, n: number): string {
  let out = "";
  while (out.length < n) out += Math.floor(rng.next() * 0x10000).toString(16).padStart(4, "0");
  return out.slice(0, n);
}

/** an RFC 4122 version 4 UUID from the generator */
export function uuidOf(rng: Rng): string {
  const h = hexOf(rng, 32).split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) & 3];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** letters and digits, n of them */
export function base36Of(rng: Rng, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(rng.next() * 36)];
  return out;
}
