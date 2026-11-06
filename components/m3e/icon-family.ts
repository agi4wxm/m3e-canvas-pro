/*
 * Which drawing an icon name means. Every family takes the same Material names:
 *   rounded   Material Symbols Rounded, what the components bundle
 *   filled    the same, always solid: the look of Discord, Spotify and most games
 *   light     its thin weight, the nearest thing to hairline icons
 *   sharp     its square-cornered cut
 *   pixel     Pixelarticons for the names it has, and Sharp for the rest
 * and the sets that products draw with, each mapped from Material names by hand:
 *   sf        Framework7 Icons, drawn like SF Symbols (iOS)
 *   fluentui  Fluent UI System Icons (Windows, Office)
 *   codicon   Codicons (VS Code)
 *   phosphor  Phosphor
 *   lucide    Lucide
 *   remix     Remix Icon
 *   ant       Ant Design Icons
 *   tabler    Tabler Icons
 *   mingcute  MingCute (WeChat-like)
 *   game      Game Icons, solid silhouettes
 *   emoji     Fluent Emoji Flat, in color (it ignores currentColor)
 * A product family's table arrives with its glyphs (registerIconMap); a name the family lacks, or an
 * icon that has not arrived, is drawn from Rounded: see `symbolName`.
 */
export type IconFamily =
  | "rounded"
  | "filled"
  | "light"
  | "sharp"
  | "pixel"
  | "sf"
  | "fluentui"
  | "codicon"
  | "phosphor"
  | "lucide"
  | "remix"
  | "ant"
  | "tabler"
  | "mingcute"
  | "game"
  | "emoji"

/** a Material name (Iconify's spelling) to the full ids that draw it, outlined and filled */
export type IconMap = Record<string, readonly [string, string]>

const maps = new Map<IconFamily, Map<string, readonly [string, string]>>()

/** say which glyphs draw a family's names; more of a family's table can arrive later */
export function registerIconMap(family: IconFamily, map: IconMap) {
  let own = maps.get(family)
  if (!own) maps.set(family, (own = new Map()))
  for (const [name, ids] of Object.entries(map)) own.set(name, ids)
}

/** the full Iconify ids of a name in a family, outlined then filled; nothing when the family has no drawing of it */
export function familyIds(family: IconFamily, name: string): string[] {
  const base = name.replaceAll("_", "-")
  const own = maps.get(family)?.get(base)
  if (own) return [...own]
  if (family === "filled")
    return [`material-symbols:${base}-rounded`, `material-symbols:${base}-rounded`]
  if (family === "light")
    return [
      `material-symbols-light:${base}-outline-rounded`,
      `material-symbols-light:${base}-rounded`,
    ]
  if (family === "sharp" || family === "pixel")
    return [
      `material-symbols:${base}-outline-sharp`,
      `material-symbols:${base}-sharp`,
    ]
  return []
}

/** the id that draws a name in a family, outlined or filled */
export function familyIcon(
  family: IconFamily,
  name: string,
  filled: boolean
): string | undefined {
  return familyIds(family, name)[filled ? 1 : 0]
}
