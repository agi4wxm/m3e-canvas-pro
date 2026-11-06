import {
  Icon as Iconify,
  type IconProps as IconifyIconProps,
} from "@iconify/react/offline"

import { cn } from "@/lib/m3e/cn"

import { familyIcon, registerIconMap, type IconFamily } from "./icon-family"
import { isKnownIcon, registerIcons, warnIfMissing } from "./icon-registry"

let family: IconFamily = "rounded"

/** which drawing the icons take from now on; what is already on the page keeps its own until it is drawn again */
export function setIconFamily(next: IconFamily) {
  family = next
}

/** the family icons are drawn in now */
export const iconFamily = () => family

/** the family's own drawing of a name, once its glyph has been registered; nothing for Rounded */
export function familyGlyph(name: string, filled: boolean) {
  if (family === "rounded") return undefined
  const styled = familyIcon(family, name, filled)
  return styled && isKnownIcon(styled) ? styled : undefined
}

/**
 * The id that draws a name: the chosen family's glyph once it is registered,
 * else Material Symbols Rounded (`material-symbols:*`) from the bundled icon
 * data. Names use Material's ligature spelling ("arrow_back") or Iconify's
 * ("arrow-back"). Unfilled icons are `*-outline-rounded`, filled `*-rounded`;
 * a family that draws no filled glyph draws its outlined one both ways.
 */
export function symbolName(name: string, filled: boolean) {
  return drawing(name, filled).icon
}

/** a drawing of the document's own ("svg:<id>"), registered under this collection (lib/docIcons.ts); the same both
 *  ways, filled or not, whatever the family */
const DOC_ICON = "svg:"
const DOC_SET = "m3e-doc"

/** the id that draws a name, and the family it comes from (nothing when Rounded draws it) */
function drawing(name: string, filled: boolean): { icon: string; family?: IconFamily } {
  if (name.startsWith(DOC_ICON)) return { icon: `${DOC_SET}:${name.slice(DOC_ICON.length)}` }
  const styled = familyGlyph(name, filled)
  if (styled) return { icon: styled, family }
  const base = name.replaceAll("_", "-")
  const icon = `material-symbols:${base}${filled ? "" : "-outline"}-rounded`
  warnIfMissing(icon)
  return { icon }
}

type IconProps = Omit<IconifyIconProps, "icon" | "children" | "fill"> & {
  /** Material Symbols name, e.g. "home", "arrow_back" */
  name: string
  /**
   * true: filled glyph. "auto": outlined, filled while the surrounding control
   * is selected (aria-pressed / data-pressed / aria-selected / data-active /
   * aria-current) — M3 fills icons of selected items.
   */
  fill?: boolean | "auto"
  /** px, defaults to 24 */
  size?: number
}

function Icon({
  name,
  fill = false,
  size = 24,
  className,
  ...props
}: IconProps) {
  const common = {
    "aria-hidden": true,
    "data-slot": "icon",
    width: size,
    height: size,
    ...props,
  }
  /* data-family names the set a glyph came from, so a style can tune it (an emoji keeps its own colors) */
  if (fill === "auto") {
    const outline = drawing(name, false)
    const filled = drawing(name, true)
    return (
      <span
        data-slot="icon"
        data-family={outline.family}
        className={cn(
          "m3-icon-auto inline-flex shrink-0 items-center justify-center align-middle",
          className
        )}
        style={{ width: size, height: size }}
      >
        <Iconify
          icon={outline.icon}
          {...common}
          data-family={outline.family}
          className="m3-icon-outline"
        />
        <Iconify
          icon={filled.icon}
          {...common}
          data-family={filled.family}
          className="m3-icon-filled"
        />
      </span>
    )
  }
  const { icon, family: from } = drawing(name, fill)
  return (
    <Iconify
      icon={icon}
      {...common}
      data-family={from}
      className={cn("inline-block shrink-0 align-middle", className)}
    />
  )
}

export { Icon, registerIconMap, registerIcons, type IconFamily }
