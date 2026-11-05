/** which of a set's `count` shards holds a Material name (FNV-1a): the generator and the loader both ask this */
export function shardOf(name: string, count: number): number {
  if (count <= 1) return 0
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++)
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193)
  return (h >>> 0) % count
}
