import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { FAMILIES, RENAMED, TABLES, type TableFamily } from "../../../scripts/icon-tables"
import { setIconFamily, symbolName } from "../icon"
import { familyIds } from "../icon-family"
import { isKnownIcon } from "../icon-registry"
import { iconSubset, loadIcons, loadPreview, setsOf, type IconShard } from "./load"
import { SHARDS } from "./manifest"
import { shardOf } from "./shard"

const DATA = fileURLToPath(new URL("./data", import.meta.url))
const shardFiles = readdirSync(DATA).filter((f) => f !== "preview.json")
const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), "utf8")) as IconShard
const has = (shard: IconShard, id: string) => {
  const [prefix, name] = id.split(":")
  return shard.sets.some((c) => c.prefix === prefix && (name in c.icons || name in (c.aliases ?? {})))
}

afterEach(() => setIconFamily("rounded"))

describe("the bundled icon sets", () => {
  it("are the shards the manifest counts, and nothing else", () => {
    const expected = Object.entries(SHARDS).flatMap(([set, n]) => Array.from({ length: n }, (_, i) => `${set}-${i}.json`))
    expect(shardFiles.sort()).toEqual(expected.sort())
  })

  it("draw every mapped id out of the shard that holds its name", () => {
    for (const f of shardFiles) {
      const shard = read(f)
      const [, set, index] = /^(.+)-(\d+)\.json$/.exec(f)!
      for (const [name, ids] of Object.entries(shard.map ?? {})) {
        expect(shardOf(name, SHARDS[set as keyof typeof SHARDS]), `${name} in ${f}`).toBe(Number(index))
        for (const id of ids) expect(has(shard, id), `${set}: ${name} -> ${id}`).toBe(true)
      }
      /* an alias points at a glyph of its own collection */
      for (const c of shard.sets) for (const [n, a] of Object.entries(c.aliases ?? {})) expect(c.icons[a.parent], `${f}: ${c.prefix}:${n}`).toBeDefined()
    }
  })

  it("map every name of every table, to a glyph of that family's own set", () => {
    const maps: Record<string, Record<string, [string, string]>> = {}
    for (const f of shardFiles) {
      const shard = read(f)
      if (shard.map) Object.assign((maps[f.replace(/-\d+\.json$/, "")] ??= {}), shard.map)
    }
    for (const [family, table] of Object.entries(TABLES) as [TableFamily, (typeof TABLES)[TableFamily]][]) {
      for (const name of Object.keys(table)) {
        const ids = maps[family]?.[name]
        expect(ids, `${family}: ${name}`).toBeDefined()
        for (const id of ids) expect(id.startsWith(`${FAMILIES[family].prefix}:`), `${family}: ${name} -> ${id}`).toBe(true)
      }
      /* a renamed name draws what its new name draws */
      for (const [old, now] of Object.entries(RENAMED)) if (maps[family]?.[now]) expect(maps[family][old]).toEqual(maps[family][now])
    }
  })

  it("hold both Rounded drawings of every name a family maps", () => {
    const rounded = shardFiles.filter((f) => f.startsWith("rounded-")).map(read)
    const names = new Set(Object.values(TABLES).flatMap((t) => Object.keys(t)))
    for (const name of names) {
      const shard = rounded[shardOf(name, SHARDS.rounded)]
      for (const id of [`material-symbols:${name}-outline-rounded`, `material-symbols:${name}-rounded`]) expect(has(shard, id), id).toBe(true)
    }
  })

  it("draw a game's chrome, and every other name they lack, from Material", () => {
    for (const name of ["arrow-back", "chevron-right", "close", "menu", "more-vert", "add"]) {
      expect(TABLES.emoji, name).not.toHaveProperty(name)
      expect(TABLES.game, name).not.toHaveProperty(name)
    }
  })
})

describe("drawing a name in a family", () => {
  it("is Rounded, outlined or filled, until a family is chosen", () => {
    expect(symbolName("home", false)).toBe("material-symbols:home-outline-rounded")
    expect(symbolName("arrow_back", true)).toBe("material-symbols:arrow-back-rounded")
  })

  it("stays Rounded until the family's glyphs arrive, then takes them, outlined and filled", async () => {
    setIconFamily("sf")
    expect(symbolName("home", false)).toBe("material-symbols:home-outline-rounded")
    expect(await loadIcons("sf", ["home", "settings", "arrow_back"])).toBe(true)
    expect(symbolName("home", false)).toBe("f7:house")
    expect(symbolName("home", true)).toBe("f7:house-fill")
    expect(symbolName("settings", false)).toBe("f7:gear-alt")
    /* iOS goes back with a chevron */
    expect(symbolName("arrow_back", false)).toBe("f7:chevron-left")
    expect(isKnownIcon("material-symbols:home-outline-rounded")).toBe(true)
  })

  it("draws a family without a filled cut the same both ways", async () => {
    setIconFamily("lucide")
    await loadIcons("lucide", ["favorite"])
    expect(symbolName("favorite", false)).toBe("lucide:heart")
    expect(symbolName("favorite", true)).toBe("lucide:heart")
  })

  it("falls back to Rounded for a name the family lacks, and for a name nobody bundled", async () => {
    setIconFamily("emoji")
    await loadIcons("emoji", ["arrow_back", "favorite", "sailing"])
    expect(symbolName("favorite", false)).toBe("fluent-emoji-flat:red-heart")
    expect(symbolName("arrow_back", false)).toBe("material-symbols:arrow-back-outline-rounded")
    expect(symbolName("sailing", true)).toBe("material-symbols:sailing-rounded")
    expect(isKnownIcon("material-symbols:sailing-rounded")).toBe(false)
  })

  it("takes the Material cuts by rule: Solid, Thin and Sharp, and Pixel over Sharp", async () => {
    setIconFamily("filled")
    expect(symbolName("home", false)).toBe("material-symbols:home-rounded")
    setIconFamily("light")
    await loadIcons("light", ["home"])
    expect(symbolName("home", false)).toBe("material-symbols-light:home-outline-rounded")
    setIconFamily("pixel")
    await loadIcons("pixel", ["home", "tune", "badge"])
    expect(symbolName("home", true)).toBe("pixelarticons:home")
    /* a name Pixelarticons lacks is cut Sharp */
    expect(familyIds("pixel", "badge")).toEqual(["material-symbols:badge-outline-sharp", "material-symbols:badge-sharp"])
    expect(symbolName("badge", false)).toBe("material-symbols:badge-outline-sharp")
  })

  it("knows the names Material Symbols dropped", async () => {
    await loadIcons("rounded", ["emoji_events", "card_giftcard"])
    expect(isKnownIcon("material-symbols:emoji-events-outline-rounded")).toBe(true)
    expect(isKnownIcon("material-symbols:card-giftcard-rounded")).toBe(true)
  })

  it("loads a family's own set first, and Rounded behind it", () => {
    expect(setsOf("rounded")).toEqual(["rounded"])
    expect(setsOf("filled")).toEqual(["rounded"])
    expect(setsOf("pixel")).toEqual(["pixel", "sharp", "rounded"])
    expect(setsOf("mingcute")).toEqual(["mingcute", "rounded"])
  })
})

describe("what a project carries", () => {
  it("is only the glyphs of the names it uses, with their map", async () => {
    const { map, sets } = await iconSubset("tabler", ["home", "search", "sailing"])
    expect(Object.keys(map).sort()).toEqual(["home", "search"])
    const glyphs = sets.flatMap((c) => Object.keys(c.icons).map((n) => `${c.prefix}:${n}`))
    for (const id of [...map.home, ...map.search]) expect(glyphs).toContain(id)
    expect(glyphs.length).toBeLessThanOrEqual(4)
  })

  it("is both Rounded cuts of a name, aliases with their parents", async () => {
    const { sets } = await iconSubset("rounded", ["check", "home"])
    const ids = sets.flatMap((c) => [...Object.keys(c.icons), ...Object.keys(c.aliases ?? {})])
    for (const id of ["check-outline-rounded", "check-rounded", "home-outline-rounded", "home-rounded"]) expect(ids).toContain(id)
  })
})

describe("the picker's preview", () => {
  it("has five glyphs of every family", async () => {
    const preview = await loadPreview()
    for (const family of ["rounded", "light", "sharp", ...Object.keys(TABLES)]) {
      const own = Object.keys(preview!.map!).filter((k) => k.startsWith(`${family}/`))
      expect(own.length, family).toBeGreaterThanOrEqual(family === "game" || family === "emoji" || family === "codicon" ? 3 : 5)
      for (const k of own) expect(isKnownIcon(preview!.map![k][0]), k).toBe(true)
    }
  })
})
