import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/m3e/cn"
import { Icon } from "@/components/m3e/icon"

/*
 * M3 Expressive top app bars (Compose AppBar* tokens):
 *   small   — 64dp, one row, Title Large
 *   medium  — 112dp (136dp with a subtitle): icon row, then a Headline Medium title
 *   large   — 120dp (152dp with a subtitle): icon row, then a Display Small title
 * Container is surface; once content scrolls under it (`scrolled`) it turns
 * surface-container with elevation 2. Leading icons are on-surface, trailing
 * icons on-surface-variant.
 */
const appBarVariants = cva(
  "group/app-bar relative flex w-full flex-col bg-surface text-on-surface transition-[background-color,box-shadow] motion-effects-default data-scrolled:bg-surface-container data-scrolled:shadow-elevation-2",
  {
    variants: {
      size: {
        small: "",
        medium: "",
        large: "",
      },
    },
    defaultVariants: { size: "small" },
  }
)

/** the height of the title block below the icon row (medium / large) */
const TITLE_BLOCK = {
  medium: { plain: 48, subtitle: 72 },
  large: { plain: 56, subtitle: 88 },
} as const

type AppBarProps = Omit<React.ComponentProps<"header">, "title"> &
  VariantProps<typeof appBarVariants> & {
    title: React.ReactNode
    subtitle?: React.ReactNode
    /** navigation icon / back button */
    leading?: React.ReactNode
    /** action buttons */
    trailing?: React.ReactNode
    /** content is scrolling under the bar */
    scrolled?: boolean
    /** center the title (small bars) */
    centered?: boolean
    /** where the back arrow leads, in words: drawn only where a style shows it (iOS's "Back") */
    backLabel?: React.ReactNode
  }

function AppBar({
  className,
  size = "small",
  title,
  subtitle,
  leading,
  trailing,
  scrolled,
  centered,
  backLabel,
  ...props
}: AppBarProps) {
  const small = size === "small"
  const block =
    !small && TITLE_BLOCK[size ?? "medium"][subtitle ? "subtitle" : "plain"]

  const titleText = (
    <>
      <h1
        data-slot="app-bar-title"
        className={cn(
          "truncate",
          small
            ? "text-title-large"
            : size === "medium"
              ? "text-headline-medium"
              : "text-display-small"
        )}
      >
        {title}
        {/* a composition hook: a caret after a small bar's title, for a style whose title opens a menu (a model picker) */}
        {small && (
          <span data-slot="app-bar-caret" aria-hidden className="hidden">
            <Icon name="keyboard_arrow_down" />
          </span>
        )}
      </h1>
      {subtitle && (
        <p
          data-slot="app-bar-subtitle"
          className={cn(
            "truncate text-on-surface-variant",
            small
              ? "text-label-medium"
              : size === "medium"
                ? "text-label-large"
                : "text-title-medium"
          )}
        >
          {subtitle}
        </p>
      )}
    </>
  )

  return (
    <header
      data-slot="app-bar"
      data-size={size}
      data-scrolled={scrolled || undefined}
      className={cn(appBarVariants({ size }), className)}
      {...props}
    >
      <div data-slot="app-bar-row" className="flex h-16 items-center gap-1 px-1">
        {leading && (
          <div data-slot="app-bar-leading" className="flex shrink-0 items-center text-on-surface [&_[data-slot=button]]:text-on-surface">
            {leading}
            {/* a composition hook: hidden unless a style shows it */}
            {backLabel && (
              <span data-slot="app-bar-back-label" className="hidden">
                {backLabel}
              </span>
            )}
          </div>
        )}
        {small && (
          <div
            data-slot="app-bar-heading"
            className={cn(
              "min-w-0 flex-1 px-3",
              centered && "text-center",
              !leading && "pl-4"
            )}
          >
            {titleText}
          </div>
        )}
        {!small && <div className="flex-1" />}
        {trailing && (
          <div data-slot="app-bar-trailing" className="flex shrink-0 items-center text-on-surface-variant [&_[data-slot=button]]:text-on-surface-variant">
            {trailing}
          </div>
        )}
      </div>
      {/* a composition hook: the title again, large and under the row, for a style that sets it there */}
      {small && (
        <div data-slot="app-bar-large-title" className="hidden truncate px-4 pb-2 text-headline-medium">
          {title}
        </div>
      )}
      {!small && (
        <div
          data-slot="app-bar-title-block"
          className="flex min-w-0 flex-col justify-end px-4 pb-3"
          style={block ? { height: block } : undefined}
        >
          {titleText}
        </div>
      )}
    </header>
  )
}

/**
 * true once `target` (the window by default) has scrolled, for AppBar's
 * `scrolled` prop.
 */
function useScrolled(target?: React.RefObject<HTMLElement | null>, offset = 0) {
  const [scrolled, setScrolled] = React.useState(false)
  React.useEffect(() => {
    const el = target?.current
    const read = () =>
      setScrolled((el ? el.scrollTop : window.scrollY) > offset)
    read()
    const source: HTMLElement | Window = el ?? window
    source.addEventListener("scroll", read, { passive: true })
    return () => source.removeEventListener("scroll", read)
  }, [target, offset])
  return scrolled
}

export { AppBar, appBarVariants, useScrolled }
