import {
  Icon as Iconify,
  type IconProps as IconifyIconProps,
} from "@iconify/react/offline"

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { cn } from "@/lib/m3e/cn"

import { familyIcon, registerIconMap, type IconFamily } from "./icon-family"
import { isKnownIcon, registerIcons, warnIfMissing } from "./icon-registry"

/* The family icons are drawn in: the app's (setIconFamily), or, under an
 * IconFamilyProvider, that root's own, so two roots on one page can each draw
 * in theirs. An icon is drawn again when the family it reads changes. */
let family: IconFamily = "rounded"
const listeners = new Set<() => void>()

/** which drawing the icons take from now on: every icon not under a provider of its own is drawn again in it */
export function setIconFamily(next: IconFamily) {
  if (next === family) return
  family = next
  listeners.forEach((l) => l())
}

/** the family icons are drawn in now, outside any provider */
export const iconFamily = () => family

const IconFamilyContext = createContext<IconFamily | null>(null)

/** draws the icons under it in `family`, whatever another root draws in */
export function IconFamilyProvider({
  family,
  children,
}: {
  family: IconFamily
  children: ReactNode
}) {
  return (
    <IconFamilyContext.Provider value={family}>{children}</IconFamilyContext.Provider>
  )
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** the family icons are drawn in where this is drawn, kept up to date */
export function useIconFamilyHere(): IconFamily {
  const own = useContext(IconFamilyContext)
  const app = useSyncExternalStore(subscribe, iconFamily, iconFamily)
  return own ?? app
}

/** a family's own drawing of a name, once its glyph has been registered; nothing for Rounded */
export function familyGlyph(
  name: string,
  filled: boolean,
  of: IconFamily = family
) {
  if (of === "rounded") return undefined
  const styled = familyIcon(of, name, filled)
  return styled && isKnownIcon(styled) ? styled : undefined
}

/**
 * The id that draws a name: the chosen family's glyph once it is registered,
 * else Material Symbols Rounded (`material-symbols:*`) from the bundled icon
 * data. Names use Material's ligature spelling ("arrow_back") or Iconify's
 * ("arrow-back"). Unfilled icons are `*-outline-rounded`, filled `*-rounded`;
 * a family that draws no filled glyph draws its outlined one both ways.
 */
export function symbolName(
  name: string,
  filled: boolean,
  of: IconFamily = family
) {
  return drawing(name, filled, of).icon
}

/** a drawing of the document's own ("svg:<id>"), registered under this collection (lib/docIcons.ts); the same both
 *  ways, filled or not, whatever the family */
const DOC_ICON = "svg:"
const DOC_SET = "m3e-doc"

/** the id that draws a name, and the family it comes from (nothing when Rounded draws it) */
function drawing(
  name: string,
  filled: boolean,
  of: IconFamily
): { icon: string; family?: IconFamily } {
  if (name.startsWith(DOC_ICON)) return { icon: `${DOC_SET}:${name.slice(DOC_ICON.length)}` }
  const styled = familyGlyph(name, filled, of)
  if (styled) return { icon: styled, family: of }
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
  const of = useIconFamilyHere()
  const common = {
    "aria-hidden": true,
    "data-slot": "icon",
    width: size,
    height: size,
    ...props,
  }
  /* data-family names the set a glyph came from, so a style can tune it (an emoji keeps its own colors) */
  if (fill === "auto") {
    const outline = drawing(name, false, of)
    const filled = drawing(name, true, of)
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
  const { icon, family: from } = drawing(name, fill, of)
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
