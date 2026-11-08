/* Huffman code lengths from how often each symbol comes, no longer than a limit (JPEG wants 16, WebP lossless 15
 * and 7 for its code of code lengths): a Huffman tree, then too-long codes moved up as JPEG's annex K.3 does, which
 * keeps the code complete. Symbols that never come get no code (length 0). */

export function codeLengths(freqs: ArrayLike<number>, limit: number): number[] {
  const n = freqs.length;
  const lengths = Array.from({ length: n }, () => 0);
  const used: number[] = [];
  for (let i = 0; i < n; i++) if (freqs[i] > 0) used.push(i);
  if (used.length === 0) return lengths;
  if (used.length === 1) {
    lengths[used[0]] = 1;
    return lengths;
  }
  /* the tree: two queues, leaves sorted by weight and the nodes made from them, which come out sorted too */
  type Node = { w: number; sym: number; kids?: [Node, Node] };
  const leaves: Node[] = used.map((s) => ({ w: freqs[s], sym: s })).sort((a, b) => a.w - b.w || a.sym - b.sym);
  const made: Node[] = [];
  let li = 0;
  let mi = 0;
  const take = (): Node => (mi >= made.length || (li < leaves.length && leaves[li].w <= made[mi].w) ? leaves[li++] : made[mi++]);
  while (leaves.length - li + made.length - mi > 1) {
    const a = take();
    const b = take();
    made.push({ w: a.w + b.w, sym: -1, kids: [a, b] });
  }
  const depth = new Map<number, number>();
  const walk = (node: Node, d: number) => {
    if (node.kids) {
      walk(node.kids[0], d + 1);
      walk(node.kids[1], d + 1);
    } else depth.set(node.sym, d);
  };
  walk(made[made.length - 1], 0);
  /* how many codes of each length, and the too-long ones brought within the limit */
  const max = Math.max(...depth.values());
  const bits = Array.from({ length: Math.max(max, limit) + 1 }, () => 0);
  for (const d of depth.values()) bits[d]++;
  for (let i = max; i > limit; i--)
    while (bits[i] > 0) {
      let j = i - 2;
      while (j > 0 && bits[j] === 0) j--;
      bits[i] -= 2;
      bits[i - 1] += 1;
      bits[j + 1] += 2;
      bits[j] -= 1;
    }
  /* the most frequent symbols get the shortest codes */
  const byWeight = [...used].sort((a, b) => freqs[b] - freqs[a] || a - b);
  let k = 0;
  for (let len = 1; len <= limit; len++) for (let c = 0; c < bits[len]; c++) lengths[byWeight[k++]] = len;
  return lengths;
}

/** the canonical codes of code lengths (DEFLATE's and WebP's order: by length, then by symbol) */
export function canonicalCodes(lengths: readonly number[]): number[] {
  const max = Math.max(0, ...lengths);
  const count = Array.from({ length: max + 2 }, () => 0);
  for (const l of lengths) if (l) count[l]++;
  const next = Array.from({ length: max + 2 }, () => 0);
  let code = 0;
  for (let len = 1; len <= max; len++) {
    code = (code + count[len - 1]) << 1;
    next[len] = code;
  }
  return lengths.map((l) => (l ? next[l]++ : 0));
}
