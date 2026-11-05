import type { IconifyJSON } from "@iconify/react/offline"

import { registerIconMap, type IconFamily, type IconMap } from "../icon-family"
import { registerIcons } from "../icon-registry"
import { SHARDS } from "./manifest"
import { shardOf } from "./shard"

/*
 * The icon sets the editor draws offline, bundled by scripts/gen-icon-sets.ts:
 * Material Symbols Rounded, Light and Sharp for every name the code uses and
 * the most common others, and each icon family's glyphs for the names its
 * table maps. A set is split into shards by a hash of the name, each its own
 * chunk, fetched the first time a name in it is drawn. An exported project
 * carries only its own glyphs (lib/exportProject.ts) and none of this.
 */

/** one shard: the glyphs of the names it holds and, for a family, which glyph draws each name */
export type IconShard = { map?: Record<string, [string, string]>; sets: IconifyJSON[] }
export type IconSetKey = keyof typeof SHARDS

/** the sets a family draws from: its own, then what draws a name it lacks */
export function setsOf(family: IconFamily): IconSetKey[] {
  if (family === "rounded" || family === "filled") return ["rounded"]
  if (family === "pixel") return ["pixel", "sharp", "rounded"]
  return [family, "rounded"]
}

const loading = new Map<string, Promise<IconShard | undefined>>()

/** a file of data/, once; nothing when it cannot be had */
function load(file: string): Promise<IconShard | undefined> {
  let shard = loading.get(file)
  if (!shard) {
    /* a template, so the bundler makes a chunk of each file in data/, and the import walk of an
     * exported project (which has no data/) does not follow it */
    shard = import(`./data/${file}.json`)
      .then((m: { default?: IconShard }) => (m.default ?? m) as IconShard)
      .catch(() => undefined)
    loading.set(file, shard)
  }
  return shard
}

/** a shard's data; nothing when it cannot be had */
export const loadShard = (set: IconSetKey, index: number) => load(`${set}-${index}`)

const base = (name: string) => name.replaceAll("_", "-")

/** the shards of a set that hold these names */
export async function shardsOf(set: IconSetKey, names: Iterable<string>): Promise<IconShard[]> {
  const count = SHARDS[set]
  const wanted = new Set<number>()
  for (const name of names) wanted.add(shardOf(base(name), count))
  const shards = await Promise.all([...wanted].map((i) => loadShard(set, i)))
  return shards.filter((s): s is IconShard => !!s)
}

const registered = new WeakSet<IconShard>()

/** Fetch the glyphs that draw these names in a family (and in Rounded, which stands in for a name the
 *  family lacks) and register them. Says whether anything new was registered. */
export async function loadIcons(family: IconFamily, names: Iterable<string>): Promise<boolean> {
  const list = [...names]
  let added = false
  await Promise.all(
    setsOf(family).map(async (set) => {
      for (const shard of await shardsOf(set, list)) {
        if (registered.has(shard)) continue
        registered.add(shard)
        shard.sets.forEach(registerIcons)
        if (shard.map) registerIconMap(set as IconFamily, shard.map)
        added = true
      }
    })
  )
  return added
}

/** Only the glyphs that draw these names in a set, and its map: what an exported project carries. A name
 *  the set has no drawing of is left out. */
export async function iconSubset(set: IconSetKey, names: Iterable<string>): Promise<{ map: IconMap; sets: IconifyJSON[] }> {
  const list = [...new Set([...names].map(base))]
  const shards = await shardsOf(set, list)
  const map: Record<string, [string, string]> = {}
  const ids = new Set<string>()
  const material = set === "rounded" || set === "sharp" || set === "light"
  for (const name of list) {
    if (material) {
      const prefix = set === "light" ? "material-symbols-light" : "material-symbols"
      const cut = set === "sharp" ? "sharp" : "rounded"
      ids.add(`${prefix}:${name}-outline-${cut}`).add(`${prefix}:${name}-${cut}`)
      continue
    }
    const own = shards.find((s) => s.map?.[name])?.map?.[name]
    if (!own) continue
    map[name] = own
    own.forEach((id) => ids.add(id))
  }
  const sets: IconifyJSON[] = []
  for (const shard of shards)
    for (const c of shard.sets) {
      const icons: IconifyJSON["icons"] = {}
      const aliases: NonNullable<IconifyJSON["aliases"]> = {}
      for (const [n, a] of Object.entries(c.aliases ?? {}))
        if (ids.has(`${c.prefix}:${n}`)) {
          aliases[n] = a
          icons[a.parent] = c.icons[a.parent]
        }
      for (const [n, icon] of Object.entries(c.icons)) if (ids.has(`${c.prefix}:${n}`)) icons[n] = icon
      if (!Object.keys(icons).length) continue
      const { icons: _all, aliases: _aliases, ...root } = c
      const into = sets.find((s) => s.prefix === c.prefix && JSON.stringify({ ...s, icons: 0, aliases: 0 }) === JSON.stringify({ ...root, icons: 0, aliases: 0 }))
      if (into) {
        Object.assign(into.icons, icons)
        if (Object.keys(aliases).length) into.aliases = { ...into.aliases, ...aliases }
      } else sets.push({ ...root, icons, ...(Object.keys(aliases).length ? { aliases } : {}) })
    }
  return { map, sets }
}

/** a few glyphs of every family, registered, for the picker: `map["sf/home"]` holds the ids that draw home in sf */
export const loadPreview = (): Promise<IconShard | undefined> =>
  load("preview").then((shard) => {
    if (shard && !registered.has(shard)) {
      registered.add(shard)
      shard.sets.forEach(registerIcons)
    }
    return shard
  })
