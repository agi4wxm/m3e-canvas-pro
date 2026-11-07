/* A string that matches a simple regular expression (a schema's `pattern`): literals, escapes (\d \w \s and escaped
 * characters), classes ([a-z0-9_], [^…]), `.`, groups with alternatives, and the quantifiers ? * + {n} {n,} {n,m}, each
 * unbounded one held to a few repeats. Anything else (look-arounds, back references) gives up: undefined, and the
 * caller makes something else. Bounded in steps and length, so a hostile pattern costs nothing. */

import type { Rng } from "./rng";

type Node = { t: "chars"; set: string } | { t: "seq"; items: Node[] } | { t: "alt"; options: Node[] } | { t: "rep"; node: Node; min: number; max: number };

const DIGITS = "0123456789";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();
const WORD = `${LOWER}${UPPER}${DIGITS}_`;
const PRINTABLE = `${WORD} -.,:;!?@#&()+=/`;

class GiveUp extends Error {}

function parse(src: string): Node {
  let i = 0;
  let steps = 0;
  const tick = () => {
    if (++steps > 5000) throw new GiveUp();
  };
  const escape = (inClass: boolean): string => {
    const c = src[i++];
    if (c === undefined) throw new GiveUp();
    if (c === "d") return DIGITS;
    if (c === "w") return WORD;
    if (c === "s") return " ";
    if (c === "D") return LOWER;
    if (c === "W" || c === "S") return "-";
    if (c === "n") return "\n";
    if (c === "t") return "\t";
    if (c === "b" && !inClass) return "";
    if (/[1-9kpPuxc]/.test(c)) throw new GiveUp();
    return c;
  };
  const klass = (): Node => {
    let negate = false;
    if (src[i] === "^") {
      negate = true;
      i++;
    }
    let set = "";
    let first = true;
    while (i < src.length && (src[i] !== "]" || first)) {
      tick();
      first = false;
      let c = src[i++];
      if (c === "\\") c = escape(true);
      if (src[i] === "-" && src[i + 1] !== undefined && src[i + 1] !== "]" && c.length === 1) {
        i++;
        let to = src[i++];
        if (to === "\\") to = escape(true);
        const a = c.charCodeAt(0);
        const b = to.charCodeAt(0);
        if (b < a || b - a > 2000) throw new GiveUp();
        for (let x = a; x <= b; x++) set += String.fromCharCode(x);
      } else set += c;
    }
    if (src[i] !== "]") throw new GiveUp();
    i++;
    if (negate) set = [...PRINTABLE].filter((ch) => !set.includes(ch)).join("");
    if (!set) throw new GiveUp();
    return { t: "chars", set };
  };
  const atom = (): Node | null => {
    tick();
    const c = src[i];
    if (c === "(") {
      i++;
      if (src[i] === "?") {
        if (src[i + 1] !== ":") throw new GiveUp();
        i += 2;
      }
      const inner = alternatives();
      if (src[i] !== ")") throw new GiveUp();
      i++;
      return inner;
    }
    if (c === "[") {
      i++;
      return klass();
    }
    if (c === ".") {
      i++;
      return { t: "chars", set: WORD };
    }
    if (c === "^" || c === "$") {
      i++;
      return { t: "seq", items: [] };
    }
    if (c === "\\") {
      i++;
      const set = escape(false);
      return set ? { t: "chars", set } : { t: "seq", items: [] };
    }
    if (c === ")" || c === "|" || c === undefined) return null;
    if (c === "*" || c === "+" || c === "?" || c === "{") throw new GiveUp();
    i++;
    return { t: "chars", set: c };
  };
  const quantified = (): Node | null => {
    const a = atom();
    if (!a) return null;
    const c = src[i];
    let min: number;
    let max: number;
    if (c === "*") [min, max] = [0, 3];
    else if (c === "+") [min, max] = [1, 3];
    else if (c === "?") [min, max] = [0, 1];
    else if (c === "{") {
      const m = /^\{(\d{1,4})(,(\d{0,4}))?\}/.exec(src.slice(i));
      if (!m) throw new GiveUp();
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] === "" ? min + 3 : Number(m[3]);
      if (max < min || min > 256) throw new GiveUp();
      i += m[0].length - 1;
    } else return a;
    i++;
    /* lazy or possessive marks change nothing about what matches */
    if (src[i] === "?" || src[i] === "+") i++;
    return { t: "rep", node: a, min, max: Math.min(max, min + 8, 256) };
  };
  const sequence = (): Node => {
    const items: Node[] = [];
    for (let q = quantified(); q; q = quantified()) items.push(q);
    return { t: "seq", items };
  };
  const alternatives = (): Node => {
    const options = [sequence()];
    while (src[i] === "|") {
      i++;
      options.push(sequence());
    }
    return options.length === 1 ? options[0] : { t: "alt", options };
  };
  const root = alternatives();
  if (i !== src.length) throw new GiveUp();
  return root;
}

function emit(n: Node, rng: Rng, out: string[], budget: { left: number }) {
  if (--budget.left < 0) throw new GiveUp();
  if (n.t === "chars") out.push(n.set[Math.floor(rng.next() * n.set.length)]);
  else if (n.t === "seq") for (const x of n.items) emit(x, rng, out, budget);
  else if (n.t === "alt") emit(rng.pick(n.options), rng, out, budget);
  else {
    const times = rng.int(n.min, n.max);
    for (let k = 0; k < times; k++) emit(n.node, rng, out, budget);
  }
}

/** a schema's pattern as a regular expression: Unicode-aware where it can be, as written otherwise; null when it is
 *  none (cached: a pattern is checked once per value) */
const REGEXES = new Map<string, RegExp | null>();
export function regexOf(pattern: string): RegExp | null {
  if (REGEXES.has(pattern)) return REGEXES.get(pattern)!;
  let re: RegExp | null = null;
  for (const flags of ["u", ""]) {
    try {
      re = new RegExp(pattern, flags);
      break;
    } catch {
      /* the next way to read it */
    }
  }
  if (REGEXES.size > 500) REGEXES.clear();
  REGEXES.set(pattern, re);
  return re;
}

/** whether a quantifier that lets its atom repeat more than once starts at `i` (`*`, `+`, `{2,}`, `{1,5}`) */
const repeatsAt = (p: string, i: number): boolean => {
  if (p[i] === "*" || p[i] === "+") return true;
  const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i, i + 24));
  return !!m && (m[2] !== undefined ? m[3] === "" || Number(m[3]) > 1 : Number(m[1]) > 1);
};

/** Whether a pattern repeats a group that itself repeats something (`(a+)+`, `^(\w+\s?)*$`): a string that almost
 *  matches it can take a regular expression engine exponential time (32 characters, seconds; 40, hours). Such a
 *  pattern of a document is never tested against words made some other way. */
export function nestedRepeat(pattern: string): boolean {
  const open: boolean[] = [];
  let repeats = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "[") {
      /* a class is one character, whatever is in it */
      for (i++; i < pattern.length && pattern[i] !== "]"; i++) if (pattern[i] === "\\") i++;
      continue;
    }
    if (c === "(") {
      open.push(repeats);
      repeats = false;
      continue;
    }
    if (c === ")") {
      const inner: boolean = repeats;
      const again = repeatsAt(pattern, i + 1);
      if (inner && again) return true;
      repeats = (open.pop() ?? false) || inner || again;
      continue;
    }
    if (repeatsAt(pattern, i)) repeats = true;
  }
  return false;
}

/** a string the pattern matches, within `maxLength`; undefined when the pattern is beyond this or nothing fits */
export function fromPattern(pattern: string, rng: Rng, o: { minLength?: number; maxLength?: number } = {}): string | undefined {
  if (pattern.length > 500) return undefined;
  const re = regexOf(pattern);
  if (!re) return undefined;
  let tree: Node;
  try {
    tree = parse(pattern);
  } catch {
    return undefined;
  }
  /* what is made from the pattern's own tree matches it; a pattern that repeats a repeat is not asked to say so, since a
     near miss (an approximated \b or \S) could take it exponential time */
  const risky = nestedRepeat(pattern);
  for (let attempt = 0; attempt < 6; attempt++) {
    const out: string[] = [];
    try {
      emit(tree, rng, out, { left: 2000 });
    } catch {
      return undefined;
    }
    const s = out.join("");
    if (s.length > (o.maxLength ?? 400) || s.length < (o.minLength ?? 0)) continue;
    if (risky || re.test(s)) return s;
  }
  return undefined;
}
